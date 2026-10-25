import "dotenv/config";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { errorHandler, notFoundHandler } from "./lib/http";
import { UPLOAD_DIR } from "./lib/upload";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { publicRouter } from "./routes/public";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.set("trust proxy", 1);
app.use(compression());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("dev"));

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "30d",
    immutable: true,
    setHeaders: (res) => {
      // Uploaded files are data, never active content: blocks scripts inside uploaded SVGs
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    },
  }),
);
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", publicRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
