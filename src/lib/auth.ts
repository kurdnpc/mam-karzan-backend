import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/client";
import { HttpError } from "./http";
import { prisma } from "./prisma";

export const AUTH_COOKIE = "mk_token";
const SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-secret");
if (!SECRET) throw new Error("JWT_SECRET must be set in production");

export type AuthUser = { id: string; name: string; phone: string; role: Role };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string, remember: boolean) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: remember ? "30d" : "1d" });
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = req.cookies?.[AUTH_COOKIE] ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) throw new HttpError(401, "Not authenticated");

  let userId: string;
  try {
    userId = (jwt.verify(token, SECRET) as jwt.JwtPayload).sub as string;
  } catch {
    throw new HttpError(401, "Session expired");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, phone: true, role: true },
  });
  if (!user) throw new HttpError(401, "Not authenticated");

  req.user = user;
  // Throttled "last seen" update used by the Users page
  prisma.user
    .updateMany({
      where: { id: user.id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(Date.now() - 60_000) } }] },
      data: { lastActiveAt: new Date(), status: "ACTIVE" },
    })
    .catch(() => {});
  next();
};

/** Permission matrix from the "Users & Roles" screen. */
export const can = {
  editItems: ["OWNER", "MANAGER", "STAFF"],
  deleteItems: ["OWNER", "MANAGER"],
  manageCategories: ["OWNER", "MANAGER"],
  manageDiscounts: ["OWNER", "MANAGER"],
  manageStore: ["OWNER"],
  manageUsers: ["OWNER"],
} satisfies Record<string, Role[]>;

export const requireRole =
  (roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, "Not allowed");
    next();
  };
