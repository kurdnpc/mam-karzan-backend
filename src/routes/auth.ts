import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { AUTH_COOKIE, requireAuth, signToken } from "../lib/auth";
import { HttpError, parse } from "../lib/http";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";

export const authRouter = Router();

const loginSchema = z.object({
  phone: z.string().trim().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
});

/** Accept "0750 123 4567", "07501234567" or "+9647501234567". */
export const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("964") ? `0${digits.slice(3)}` : digits;
};

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "هەوڵدانی زۆر. تکایە دوای 15 خولەک دووبارە هەوڵ بدەرەوە",
});

authRouter.post("/login", loginLimit, async (req, res) => {
  const { phone, password, remember } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { phone: normalizePhone(phone) } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "ژمارە یان وشەی نهێنی هەڵەیە");
  }
  const token = signToken(user.id, remember);
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS-only cookie whenever the site is served over https
    secure: (process.env.PUBLIC_URL ?? "").startsWith("https://"),
    maxAge: (remember ? 30 : 1) * 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.patch("/password", requireAuth, async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string().min(1), next: z.string().min(6) }), req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, "وشەی نهێنی ئێستا هەڵەیە");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  res.json({ ok: true });
});
