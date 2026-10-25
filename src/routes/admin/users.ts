import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { HttpError, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { normalizePhone } from "../auth";

export const usersRouter = Router();

const select = { id: true, name: true, phone: true, role: true, status: true, lastActiveAt: true, createdAt: true };

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ select, orderBy: { createdAt: "asc" } });
  res.json(users);
});

const userSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7),
  role: z.enum(["MANAGER", "STAFF"]), // there is exactly one OWNER, created by the seed
  password: z.string().min(6).optional(),
});

/** Creates a staff account. The owner shares the password with the new user. */
usersRouter.post("/", async (req, res) => {
  const data = parse(userSchema.extend({ password: z.string().min(6) }), req.body);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      phone: normalizePhone(data.phone),
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, 10),
    },
    select,
  });
  res.status(201).json(user);
});

usersRouter.patch("/:id", async (req, res) => {
  const data = parse(userSchema.partial(), req.body);
  const target = await prisma.user.findUnique({ where: { id: param(req) }, select: { role: true } });
  if (!target) throw new HttpError(404, "Not found");
  if (target.role === "OWNER" && data.role) throw new HttpError(400, "The owner's role cannot be changed");
  const user = await prisma.user.update({
    where: { id: param(req) },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.phone && { phone: normalizePhone(data.phone) }),
      ...(data.role && { role: data.role }),
      ...(data.password && { passwordHash: await bcrypt.hash(data.password, 10) }),
    },
    select,
  });
  res.json(user);
});

usersRouter.delete("/:id", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: param(req) }, select: { role: true } });
  if (!target) throw new HttpError(404, "Not found");
  if (target.role === "OWNER") throw new HttpError(400, "The owner cannot be removed");
  await prisma.user.delete({ where: { id: param(req) } });
  res.json({ ok: true });
});
