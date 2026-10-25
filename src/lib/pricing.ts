import type { DiscountType, PriceType } from "../generated/prisma/client";

type Priced = {
  priceType: PriceType;
  price: { toString(): string } | null;
  discountType: DiscountType;
  discountValue: { toString(): string } | null;
  discountEndsAt: Date | null;
};

const round = (n: number, priceType: PriceType) =>
  priceType === "USD" ? Math.round(n * 100) / 100 : Math.round(n);

export function isDiscountActive(item: Priced, now = new Date()) {
  if (item.priceType === "NONE" || item.discountType === "NONE" || item.discountValue == null) return false;
  return !item.discountEndsAt || item.discountEndsAt > now;
}

/** Price shown to customers after any active discount. */
export function computePricing(item: Priced) {
  const price = item.price == null ? null : Number(item.price);
  if (item.priceType === "NONE" || price == null) {
    return { price: null, finalPrice: null, discountPercent: null, hasDiscount: false };
  }
  if (!isDiscountActive(item)) {
    return { price, finalPrice: price, discountPercent: null, hasDiscount: false };
  }
  const value = Number(item.discountValue);
  const finalPrice =
    item.discountType === "PERCENT" ? round(price * (1 - value / 100), item.priceType) : round(value, item.priceType);
  const discountPercent = price > 0 ? Math.round((1 - finalPrice / price) * 100) : 0;
  return { price, finalPrice, discountPercent, hasDiscount: finalPrice < price };
}
