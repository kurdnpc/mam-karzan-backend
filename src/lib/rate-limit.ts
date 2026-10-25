import type { RequestHandler } from "express";
import { HttpError } from "./http";

/** Small in-memory fixed-window limiter per IP. Good enough for a single API instance. */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      throw new HttpError(429, message);
    }
    next();
  };
}
