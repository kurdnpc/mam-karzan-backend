import { Router } from "express";
import { z } from "zod";
import { can } from "../../lib/auth";
import { HttpError, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";

export const settingsRouter = Router();

export const getSettings = () => prisma.storeSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

const opt = z.string().trim().nullable().optional();
const time = z.string().regex(/^\d{2}:\d{2}$/);

const settingsSchema = z
  .object({
    storeName: z.string().trim().min(1),
    storeNameEn: z.string().trim().min(1),
    tagline: opt,
    logo: opt,
    address: opt,
    addressNote: opt,
    mapUrl: opt,
    openTime: time,
    closeTime: time,
    aboutText: opt,
    whatsappCountryCode: z.string().regex(/^\+\d{1,4}$/),
    whatsappNumber: z.string().transform((s) => s.replace(/\D/g, "").replace(/^0/, "")).pipe(z.string().min(7)),
    secondaryPhone: opt,
    whatsappTemplate: z.string().max(500),
    floatingWhatsappButton: z.boolean(),
    usdRate: z.coerce.number().int().min(100).max(100000),
    instagram: opt,
    facebook: opt,
    telegram: opt,
    tiktok: opt,
    promoTitle: opt,
    promoSubtitle: opt,
    promoImage: opt,
    promoEndsAt: z.coerce.date().nullable().optional(),
  })
  .partial();

settingsRouter.get("/", async (_req, res) => {
  res.json(await getSettings());
});

// Store info & WhatsApp are owner-only; the promo banner is part of "discounts & banner".
settingsRouter.put("/", async (req, res) => {
  const data = parse(settingsSchema, req.body);
  const promoOnly = Object.keys(data).every((k) => k.startsWith("promo"));
  const allowed: readonly string[] = promoOnly ? can.manageDiscounts : can.manageStore;
  if (!allowed.includes(req.user!.role)) throw new HttpError(403, "Not allowed");
  await getSettings();
  res.json(await prisma.storeSettings.update({ where: { id: 1 }, data }));
});
