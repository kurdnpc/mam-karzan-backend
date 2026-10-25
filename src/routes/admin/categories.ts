import { Router } from "express";
import { z } from "zod";
import { can, requireRole } from "../../lib/auth";
import { HttpError, notFound, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { slugSchema } from "../../lib/slug";

export const categoriesRouter = Router();

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema,
  parentId: z.string().nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  image: z.string().nullable().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Main categories with sub-category and item counts (Categories page). */
categoriesRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const categories = await prisma.category.findMany({
    where: { parentId: null, ...(q && { name: { contains: q, mode: "insensitive" } }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      children: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, _count: { select: { items: true } } },
      },
    },
  });
  res.json(
    categories.map(({ children, ...c }) => ({
      ...c,
      subcategories: children.map((ch) => ({ id: ch.id, name: ch.name, itemCount: ch._count.items })),
      subcategoryCount: children.length,
      itemCount: children.reduce((s, ch) => s + ch._count.items, 0),
    })),
  );
});

/** Drag/arrow ordering: ids in their new order (siblings only). */
categoriesRouter.post("/reorder", requireRole(can.manageCategories), async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1).max(200) }), req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.category.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

/** One category; for a main category also returns its subcategories (Subcategories page). */
categoriesRouter.get("/:id", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = await prisma.category.findUnique({
    where: { id: param(req) },
    include: {
      parent: { select: { id: true, name: true } },
      children: {
        where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { _count: { select: { items: true } } },
      },
    },
  });
  if (!category) throw notFound();
  const { children, ...rest } = category;
  res.json({
    ...rest,
    subcategories: children.map(({ _count, ...ch }) => ({ ...ch, itemCount: _count.items })),
  });
});

categoriesRouter.post("/", requireRole(can.manageCategories), async (req, res) => {
  const data = parse(categorySchema, req.body);
  if (data.parentId) await assertMainCategory(data.parentId);
  await assertSlugFree(data.slug, data.parentId ?? null);
  const category = await prisma.category.create({ data });
  res.status(201).json(category);
});

categoriesRouter.patch("/:id", requireRole(can.manageCategories), async (req, res) => {
  const data = parse(categorySchema.partial(), req.body);
  if (data.parentId) {
    if (data.parentId === param(req)) throw new HttpError(400, "A category cannot be its own parent");
    await assertMainCategory(data.parentId);
    const hasChildren = await prisma.category.count({ where: { parentId: param(req) } });
    if (hasChildren) throw new HttpError(400, "A category with subcategories cannot become a subcategory");
  }
  if (data.slug !== undefined || data.parentId !== undefined) {
    const current = await prisma.category.findUnique({ where: { id: param(req) }, select: { slug: true, parentId: true } });
    if (!current) throw notFound();
    await assertSlugFree(data.slug ?? current.slug, data.parentId !== undefined ? data.parentId : current.parentId, param(req));
  }
  const category = await prisma.category.update({ where: { id: param(req) }, data });
  res.json(category);
});

categoriesRouter.delete("/:id", requireRole(can.manageCategories), async (req, res) => {
  const itemCount = await prisma.item.count({
    where: { OR: [{ categoryId: param(req) }, { category: { parentId: param(req) } }] },
  });
  if (itemCount > 0) throw new HttpError(409, `ئەم بەشە ${itemCount} کاڵای تێدایە. سەرەتا کاڵاکان بگوازەرەوە یان بیانسڕەوە`);
  await prisma.category.delete({ where: { id: param(req) } });
  res.json({ ok: true });
});

/** URL parts must be unique among siblings (the DB index can't cover main categories, whose parent is NULL). */
async function assertSlugFree(slug: string, parentId: string | null, exceptId?: string) {
  const clash = await prisma.category.findFirst({
    where: { slug, parentId, ...(exceptId && { id: { not: exceptId } }) },
    select: { name: true },
  });
  if (clash) throw new HttpError(409, `بەستەری ${slug} پێشتر بۆ ${clash.name} بەکارهاتووە`);
}

async function assertMainCategory(id: string) {
  const parent = await prisma.category.findUnique({ where: { id }, select: { parentId: true } });
  if (!parent) throw new HttpError(400, "Parent category not found");
  if (parent.parentId) throw new HttpError(400, "Only two category levels are supported");
}
