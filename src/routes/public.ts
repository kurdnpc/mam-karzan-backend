import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { notFound, parse } from "../lib/http";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../lib/rate-limit";
import { itemInclude, serializeItem } from "../lib/serialize";
import { getSettings } from "./admin/settings";

/** Read-only API for the public website. Only visible content is returned. */
export const publicRouter = Router();

const activeDiscount = (): Prisma.ItemWhereInput => ({
  priceType: { not: "NONE" },
  discountType: { not: "NONE" },
  OR: [{ discountEndsAt: null }, { discountEndsAt: { gt: new Date() } }],
});

const visibleItem = (): Prisma.ItemWhereInput => ({
  isVisible: true,
  category: { isVisible: true, parent: { isVisible: true } },
});

publicRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

publicRouter.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { parentId: null, isVisible: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      children: {
        where: { isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { _count: { select: { items: { where: { isVisible: true } } } } },
      },
    },
  });
  res.json(
    categories.map(({ children, ...c }) => ({
      ...c,
      subcategories: children.map(({ _count, ...ch }) => ({ ...ch, itemCount: _count.items })),
      itemCount: children.reduce((s, ch) => s + ch._count.items, 0),
    })),
  );
});

/** Main category by its URL part, with its visible subcategories (/c/{main}). */
publicRouter.get("/categories/:main", async (req, res) => {
  const category = await prisma.category.findFirst({
    where: { slug: req.params.main, parentId: null, isVisible: true },
    include: {
      children: {
        where: { isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { _count: { select: { items: { where: { isVisible: true } } } } },
      },
    },
  });
  if (!category) throw notFound();
  const { children, ...rest } = category;
  res.json({ ...rest, subcategories: children.map(({ _count, ...ch }) => ({ ...ch, itemCount: _count.items })) });
});

publicRouter.get("/items", async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().trim().optional(),
      category: z.string().optional(), // main category URL part
      sub: z.string().optional(), // subcategory URL part (needs category)
      type: z.enum(["PRODUCT", "NUMBER"]).optional(),
      operator: z.enum(["KOREK", "ASIACELL", "ZAIN"]).optional(),
      vip: z.enum(["true"]).optional(),
      discounted: z.enum(["true"]).optional(),
      priced: z.enum(["true"]).optional(), // hide "ask for price" items
      ids: z.string().optional(), // comma-separated, for the favourites page
      sort: z.enum(["new", "price_asc", "price_desc"]).default("new"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(240).default(24),
    }),
    req.query,
  );

  const where: Prisma.ItemWhereInput = {
    AND: [
      visibleItem(),
      q.category
        ? q.sub
          ? { category: { slug: q.sub, parent: { slug: q.category } } }
          : { category: { parent: { slug: q.category } } }
        : {},
      q.type ? { type: q.type } : {},
      q.operator ? { operator: q.operator } : {},
      q.vip ? { isVip: true } : {},
      q.discounted ? activeDiscount() : {},
      q.priced ? { priceType: { not: "NONE" } } : {},
      q.ids ? { id: { in: q.ids.split(",").filter(Boolean).slice(0, 100) } } : {},
      q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: "insensitive" } },
              { description: { contains: q.q, mode: "insensitive" } },
              { phoneNumber: { contains: q.q.replace(/\D/g, "") || q.q } },
              { category: { name: { contains: q.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const skip = (q.page - 1) * q.pageSize;

  if (q.sort === "price_asc" || q.sort === "price_desc") {
    // Prices are stored in IQD or USD, so sort by the final price converted to IQD.
    // The catalogue is small enough to sort in memory; "ask for price" items go last.
    const { usdRate } = await getSettings();
    const all = (await prisma.item.findMany({ where, include: itemInclude })).map(serializeItem);
    const key = (i: (typeof all)[number]) =>
      i.pricing.finalPrice == null ? null : i.pricing.finalPrice * (i.priceType === "USD" ? usdRate : 1);
    const dir = q.sort === "price_asc" ? 1 : -1;
    all.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka == null || kb == null) return ka == null ? (kb == null ? 0 : 1) : -1;
      return (ka - kb) * dir;
    });
    res.json({ total: all.length, page: q.page, pageSize: q.pageSize, items: all.slice(skip, skip + q.pageSize) });
    return;
  }

  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({ where, include: itemInclude, orderBy: { createdAt: "desc" }, skip, take: q.pageSize }),
  ]);
  res.json({ total, page: q.page, pageSize: q.pageSize, items: items.map(serializeItem) });
});

/** Item by its public number (/c/{main}/{sub}/{code}); the caller redirects if the path is outdated. */
publicRouter.get("/items/:code", async (req, res) => {
  const code = Number(req.params.code);
  if (!Number.isInteger(code) || code <= 0) throw notFound();
  const item = await prisma.item.findFirst({
    where: { AND: [visibleItem(), { code }] },
    include: itemInclude,
  });
  if (!item) throw notFound();

  const related = await prisma.item.findMany({
    where: { AND: [visibleItem(), { categoryId: item.categoryId, id: { not: item.id } }] },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
    take: 4,
  });
  prisma.item.update({ where: { id: item.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
  res.json({ item: serializeItem(item), related: related.map(serializeItem) });
});

publicRouter.get("/brands", async (_req, res) => {
  res.json(await prisma.brand.findMany({ where: { isVisible: true }, orderBy: { sortOrder: "asc" } }));
});

publicRouter.get("/testimonials", async (_req, res) => {
  res.json(await prisma.testimonial.findMany({ where: { isVisible: true }, orderBy: { sortOrder: "asc" } }));
});

publicRouter.get("/faqs", async (_req, res) => {
  res.json(await prisma.faq.findMany({ where: { isVisible: true }, orderBy: { sortOrder: "asc" } }));
});

/** Counted on the dashboard as "کلیکی واتسئاپ ئەم مانگە". */
const clickLimit = rateLimit({ windowMs: 60 * 1000, max: 20, message: "Too many requests" });

publicRouter.post("/whatsapp-click", clickLimit, async (req, res) => {
  const { itemId, source } = parse(
    z.object({ itemId: z.string().nullable().optional(), source: z.string().max(30).optional() }),
    req.body ?? {},
  );
  const exists = itemId ? await prisma.item.count({ where: { id: itemId } }) : 0;
  await prisma.whatsappClick.create({ data: { itemId: exists ? itemId : null, source } });
  res.status(201).json({ ok: true });
});
