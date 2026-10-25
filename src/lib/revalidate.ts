import type { RequestHandler } from "express";

let timer: NodeJS.Timeout | null = null;

/** Tells the Next.js site to drop its cached API data. Debounced so bulk edits trigger one refresh. */
export function revalidateSite() {
  const url = process.env.WEB_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fetch(`${url}/revalidate`, { method: "POST", headers: { "x-revalidate-secret": secret } }).catch((e) =>
      console.warn("Site revalidation failed:", e.message),
    );
  }, 250);
}

/** After any successful write (POST/PUT/PATCH/DELETE), refresh the public site. */
export const revalidateOnWrite: RequestHandler = (req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) revalidateSite();
    });
  }
  next();
};
