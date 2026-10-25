import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { HttpError } from "./http";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"]);
const MAX_SIDE = 1600;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // "PNG, JPG · 5MB"
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, "Only image files are allowed"));
  },
});

/**
 * Stores an uploaded image. Photos are auto-rotated, capped at 1600px and re-encoded as WebP
 * (typically 5–10× smaller than phone photos); SVG and GIF are kept as-is.
 */
export async function saveImage(file: Express.Multer.File): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;

  if (file.mimetype === "image/svg+xml" || file.mimetype === "image/gif") {
    const name = `${id}${file.mimetype === "image/gif" ? ".gif" : ".svg"}`;
    await writeFile(path.join(UPLOAD_DIR, name), file.buffer);
    return `/uploads/${name}`;
  }

  const name = `${id}.webp`;
  try {
    await sharp(file.buffer)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(UPLOAD_DIR, name));
  } catch {
    throw new HttpError(400, "Could not read this image");
  }
  return `/uploads/${name}`;
}
