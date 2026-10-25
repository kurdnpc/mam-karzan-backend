import { Router } from "express";
import { z } from "zod";
import { HttpError, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { itemInclude, serializeItem } from "../../lib/serialize";
import { endDate } from "./items";

export const discountsRouter = Router();

/** Active discounts list ("داشکاندنە چالاکەکان"). */
discountsRouter.get("/", async (_req, res) => {
  const items = await prisma.item.findMany({
    where: {
      discountType: { not: "NONE" },
      priceType: { not: "NONE" },
      OR: [{ discountEndsAt: null }, { discountEndsAt: { gt: new Date() } }],
    },
    include: itemInclude,
    orderBy: { updatedAt: "desc" },
  });
  res.json(items.map(serializeItem));
});

/**
 * Apply one discount to many items ("داشکاندن دابنێ").
 * PERCENT applies to each item in its own currency; FIXED_PRICE sets the same new price
 * on every selected item, so it only makes sense for a single item or same-priced items.
 */
discountsRouter.post("/apply", async (req, res) => {
  const body = parse(
    z.object({
      ids: z.array(z.string()).min(1).max(500),
      type: z.enum(["PERCENT", "FIXED_PRICE"]),
      value: z.coerce.number().positive(),
      endsAt: endDate.nullable().optional(),
    }),
    req.body,
  );
  if (body.type === "PERCENT" && body.value >= 100) throw new HttpError(400, "ڕێژەی داشکاندن دەبێت لە 100 کەمتر بێت");

  const { count } = await prisma.item.updateMany({
    // Items without a price are skipped; a fixed new price only applies where it is actually lower
    where: {
      id: { in: body.ids },
      priceType: { not: "NONE" },
      ...(body.type === "FIXED_PRICE" && { price: { gt: body.value } }),
    },
    data: { discountType: body.type, discountValue: body.value, discountEndsAt: body.endsAt ?? null },
  });
  res.json({ count });
});

discountsRouter.post("/remove", async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).optional() }), req.body);
  const { count } = await prisma.item.updateMany({
    where: ids ? { id: { in: ids } } : { discountType: { not: "NONE" } },
    data: { discountType: "NONE", discountValue: null, discountEndsAt: null },
  });
  res.json({ count });
});

/** Item picker on the Discounts page (only items that have a price). */
discountsRouter.get("/candidates", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const items = await prisma.item.findMany({
    where: {
      priceType: { not: "NONE" },
      ...(categoryId && { category: { parentId: categoryId } }),
      ...(q && {
        OR: [{ name: { contains: q, mode: "insensitive" } }, { phoneNumber: { contains: q.replace(/\D/g, "") || q } }],
      }),
    },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(items.map(serializeItem));
});
