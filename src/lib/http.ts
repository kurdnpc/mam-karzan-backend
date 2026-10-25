import type { ErrorRequestHandler, RequestHandler } from "express";
import { MulterError } from "multer";
import { z, ZodError, type ZodType } from "zod";
import { Prisma } from "../generated/prisma/client";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "قەبارەی وێنە دەبێت لە 5MB کەمتر بێت" : err.message });
    return;
  }
  if (err instanceof ZodError) {
    // Our own rules carry a user-facing Kurdish message; Zod's built-in English ones get a generic one
    const custom = err.issues.find((i) => /[\u0600-\u06FF]/.test(i.message));
    res.status(400).json({ error: custom?.message ?? "زانیارییەکان دروست نین", issues: err.issues });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "ئەمە پێشتر هەیە", fields: err.meta?.target });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (err.code === "P2003") {
      res.status(409).json({ error: "Record is still in use" });
      return;
    }
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route not found" });
};

/** Route param as a plain string (Express 5 types widen params behind extra middleware). */
export const param = (req: { params: Record<string, string | string[]> }, name = "id") => String(req.params[name]);
