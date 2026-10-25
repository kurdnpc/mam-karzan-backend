import { Router } from "express";
import { can, requireAuth, requireRole } from "../../lib/auth";
import { HttpError } from "../../lib/http";
import { revalidateOnWrite } from "../../lib/revalidate";
import { saveImage, upload } from "../../lib/upload";
import { categoriesRouter } from "./categories";
import { contentRouter } from "./content";
import { discountsRouter } from "./discounts";
import { itemsRouter } from "./items";
import { settingsRouter } from "./settings";
import { statsRouter } from "./stats";
import { usersRouter } from "./users";

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(revalidateOnWrite);
adminRouter.use("/stats", statsRouter);
adminRouter.use("/categories", categoriesRouter);
adminRouter.use("/items", itemsRouter);
adminRouter.use("/discounts", requireRole(can.manageDiscounts), discountsRouter);
adminRouter.use("/settings", settingsRouter);
adminRouter.use("/content", requireRole(can.manageCategories), contentRouter);
adminRouter.use("/users", requireRole(can.manageUsers), usersRouter);

adminRouter.post("/upload", upload.array("files", 12), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, "No files uploaded");
  res.status(201).json({ urls: await Promise.all(files.map(saveImage)) });
});
