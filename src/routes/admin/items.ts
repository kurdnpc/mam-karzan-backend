import { Router } from "express";
import { z } from "zod";
import type { Prisma, Role } from "../../generated/prisma/client";
import { can, requireRole } from "../../lib/auth";
import { HttpError, notFound, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { itemInclude, serializeItem } from "../../lib/serialize";

export const itemsRouter = Router();

const money = z.coerce.number().positive();

/** "2026-11-01" from a date input means "until the end of that day" in Kurdistan (UTC+3). */
export const endDate = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59+03:00` : v),
  z.coerce.date(),
);

export const itemSchema = z
  .object({
    type: z.enum(["PRODUCT", "NUMBER"]).default("PRODUCT"),
    name: z.string().trim().max(160).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    categoryId: z.string().min(1),
    priceType: z.enum(["IQD", "USD", "NONE"]).default("IQD"),
    price: money.nullable().optional(),
    discountType: z.enum(["NONE", "PERCENT", "FIXED_PRICE"]).default("NONE"),
    discountValue: money.nullable().optional(),
    discountEndsAt: endDate.nullable().optional(),
    phoneNumber: z.string().trim().nullable().optional(),
    operator: z.enum(["KOREK", "ASIACELL", "ZAIN"]).nullable().optional(),
    isVip: z.boolean().optional(),
    pattern: z.string().trim().max(80).nullable().optional(),
    isVisible: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
    images: z.array(z.string().min(1)).max(12).optional(),
    features: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.priceType !== "NONE" && v.price == null) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Price is required" });
    }
    if (v.discountType === "PERCENT" && v.discountValue != null && v.discountValue >= 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "ڕێژەی داشکاندن دەبێت لە 100 کەمتر بێت" });
    }
    if (v.discountType === "FIXED_PRICE" && v.discountValue != null && v.price != null && v.discountValue >= v.price) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "نرخی نوێ دەبێت لە نرخی ئەسڵی کەمتر بێت" });
    }
  });

const normalizeNumber = (n: string | null | undefined) => (n ? n.replace(/\D/g, "") || null : n);

async function assertSubcategory(categoryId: string) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { parentId: true } });
  if (!cat) throw new HttpError(400, "Category not found");
  if (!cat.parentId) throw new HttpError(400, "Items must belong to a subcategory");
}

function toData(input: z.infer<typeof itemSchema>) {
  const { images, features, ...rest } = input;
  const noPrice = rest.priceType === "NONE";
  return {
    data: {
      ...rest,
      phoneNumber: normalizeNumber(rest.phoneNumber),
      price: noPrice ? null : rest.price,
      // "بێ نرخ" items cannot carry a discount
      discountType: noPrice ? ("NONE" as const) : rest.discountType,
      discountValue: noPrice || rest.discountType === "NONE" ? null : rest.discountValue,
      discountEndsAt: noPrice || rest.discountType === "NONE" ? null : rest.discountEndsAt,
    },
    images,
    features,
  };
}

itemsRouter.get("/", async (req, res) => {
  const query = parse(
    z.object({
      q: z.string().trim().optional(),
      categoryId: z.string().optional(), // main category
      subcategoryId: z.string().optional(),
      visible: z.enum(["true", "false"]).optional(),
      discounted: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    req.query,
  );

  const where: Prisma.ItemWhereInput = {
    ...(query.subcategoryId
      ? { categoryId: query.subcategoryId }
      : query.categoryId && { category: { parentId: query.categoryId } }),
    ...(query.visible && { isVisible: query.visible === "true" }),
    ...(query.discounted === "true" && { discountType: { not: "NONE" } }),
    ...(query.q && {
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { phoneNumber: { contains: query.q.replace(/\D/g, "") || query.q } },
        { description: { contains: query.q, mode: "insensitive" } },
      ],
    }),
  };

  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      include: itemInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  res.json({ total, page: query.page, pageSize: query.pageSize, items: items.map(serializeItem) });
});

itemsRouter.get("/:id", async (req, res) => {
  const item = await prisma.item.findUnique({ where: { id: param(req) }, include: itemInclude });
  if (!item) throw notFound();
  res.json(serializeItem(item));
});

itemsRouter.post("/", requireRole(can.editItems), async (req, res) => {
  const { data, images = [], features = [] } = toData(parse(itemSchema, req.body));
  await assertSubcategory(data.categoryId);
  const item = await prisma.item.create({
    data: {
      ...data,
      images: { create: images.map((url, i) => ({ url, sortOrder: i })) },
      features: { create: features.map((text, i) => ({ text, sortOrder: i })) },
    },
    include: itemInclude,
  });
  res.status(201).json(serializeItem(item));
});

itemsRouter.put("/:id", requireRole(can.editItems), async (req, res) => {
  const { data, images, features } = toData(parse(itemSchema, req.body));
  await assertSubcategory(data.categoryId);
  const item = await prisma.$transaction(async (tx) => {
    if (images) {
      await tx.itemImage.deleteMany({ where: { itemId: param(req) } });
      await tx.itemImage.createMany({ data: images.map((url, i) => ({ itemId: param(req), url, sortOrder: i })) });
    }
    if (features) {
      await tx.itemFeature.deleteMany({ where: { itemId: param(req) } });
      await tx.itemFeature.createMany({
        data: features.map((text, i) => ({ itemId: param(req), text, sortOrder: i })),
      });
    }
    return tx.item.update({ where: { id: param(req) }, data, include: itemInclude });
  });
  res.json(serializeItem(item));
});

/** Quick toggles from the table (the visibility switch). */
itemsRouter.patch("/:id", requireRole(can.editItems), async (req, res) => {
  const data = parse(z.object({ isVisible: z.boolean().optional(), isAvailable: z.boolean().optional() }), req.body);
  const item = await prisma.item.update({ where: { id: param(req) }, data, include: itemInclude });
  res.json(serializeItem(item));
});

itemsRouter.delete("/:id", requireRole(can.deleteItems), async (req, res) => {
  await prisma.item.delete({ where: { id: param(req) } });
  res.json({ ok: true });
});

/** Selection bar: سڕینەوە / شاردنەوە / پیشاندان */
itemsRouter.post("/bulk", async (req, res) => {
  const { ids, action } = parse(
    z.object({ ids: z.array(z.string()).min(1).max(500), action: z.enum(["delete", "hide", "show"]) }),
    req.body,
  );
  const role = req.user!.role;
  if (action === "delete") {
    if (!(can.deleteItems as Role[]).includes(role)) throw new HttpError(403, "Not allowed");
    const { count } = await prisma.item.deleteMany({ where: { id: { in: ids } } });
    res.json({ count });
    return;
  }
  const { count } = await prisma.item.updateMany({ where: { id: { in: ids } }, data: { isVisible: action === "show" } });
  res.json({ count });
});
