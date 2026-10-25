import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { serializeItem, itemInclude } from "../../lib/serialize";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [items, newItems, mainCategories, subCategories, clicks, prevClicks, recent, perCategory] = await Promise.all([
    prisma.item.count(),
    prisma.item.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.category.count({ where: { parentId: null } }),
    prisma.category.count({ where: { parentId: { not: null } } }),
    prisma.whatsappClick.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.whatsappClick.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
    prisma.item.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: itemInclude }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, children: { select: { _count: { select: { items: true } } } } },
    }),
  ]);

  const byCategory = perCategory
    .map((c) => ({ id: c.id, name: c.name, count: c.children.reduce((s, ch) => s + ch._count.items, 0) }))
    .sort((a, b) => b.count - a.count);

  res.json({
    items,
    newItems,
    mainCategories,
    subCategories,
    whatsappClicks: clicks,
    whatsappTrend: prevClicks > 0 ? Math.round(((clicks - prevClicks) / prevClicks) * 100) : null,
    recentItems: recent.map(serializeItem),
    byCategory,
  });
});

/** Bell menu: latest WhatsApp order clicks. */
statsRouter.get("/activity", async (_req, res) => {
  const clicks = await prisma.whatsappClick.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { item: { select: { id: true, name: true, phoneNumber: true } } },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await prisma.whatsappClick.count({ where: { createdAt: { gte: today } } });
  res.json({ todayCount, clicks });
});
