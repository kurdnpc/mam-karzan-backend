import { z } from "zod";

/** English URL part for categories: lowercase letters, numbers and single hyphens ("smart-watches"). */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "بەستەر تەنها پیتی ئینگلیزی بچووک، ژمارە و - ی تێدا بێت");
