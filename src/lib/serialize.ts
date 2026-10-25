import type { Prisma } from "../generated/prisma/client";
import { computePricing } from "./pricing";

export const itemInclude = {
  images: { orderBy: { sortOrder: "asc" } },
  features: { orderBy: { sortOrder: "asc" } },
  category: { select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ItemInclude;

type ItemWithRelations = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

/** Public URL of an item: /c/{main}/{sub}/{code} */
export const itemPath = (item: { code: number; category: { slug: string; parent: { slug: string } | null } }) =>
  `/c/${item.category.parent?.slug ?? item.category.slug}/${item.category.slug}/${item.code}`;

export function serializeItem(item: ItemWithRelations) {
  return {
    ...item,
    price: item.price == null ? null : Number(item.price),
    discountValue: item.discountValue == null ? null : Number(item.discountValue),
    pricing: computePricing(item),
    path: itemPath(item),
  };
}
