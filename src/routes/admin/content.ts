import { Router } from "express";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";

/** Brands, testimonials and FAQs share the same simple CRUD shape. */
function crud<S extends ZodRawShape>(
  delegate: {
    findMany: (a: object) => Promise<unknown>;
    create: (a: { data: never }) => Promise<unknown>;
    update: (a: { where: { id: string }; data: never }) => Promise<unknown>;
    delete: (a: { where: { id: string } }) => Promise<unknown>;
  },
  schema: ZodObject<S>,
) {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json(await delegate.findMany({ orderBy: [{ sortOrder: "asc" }] }));
  });
  router.post("/", async (req, res) => {
    res.status(201).json(await delegate.create({ data: parse(schema, req.body) as never }));
  });
  router.post("/reorder", async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(z.string()).min(1).max(200) }), req.body);
    for (const [i, id] of ids.entries()) await delegate.update({ where: { id }, data: { sortOrder: i } as never });
    res.json({ ok: true });
  });
  router.patch("/:id", async (req, res) => {
    res.json(await delegate.update({ where: { id: String(req.params.id) }, data: parse(schema.partial(), req.body) as never }));
  });
  router.delete("/:id", async (req, res) => {
    await delegate.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  });
  return router;
}

const common = { isVisible: z.boolean().optional(), sortOrder: z.number().int().optional() };
const image = z.string().nullable().optional();

export const contentRouter = Router();
contentRouter.use(
  "/brands",
  crud(prisma.brand, z.object({ name: z.string().trim().min(1), logo: image, ...common })),
);
contentRouter.use(
  "/testimonials",
  crud(
    prisma.testimonial,
    z.object({
      name: z.string().trim().min(1),
      subtitle: z.string().nullable().optional(),
      text: z.string().trim().min(1),
      rating: z.number().int().min(1).max(5).optional(),
      ...common,
    }),
  ),
);
contentRouter.use(
  "/faqs",
  crud(prisma.faq, z.object({ question: z.string().trim().min(1), answer: z.string().trim().min(1), ...common })),
);
