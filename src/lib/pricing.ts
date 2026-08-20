import type { Product } from "../types";

type PricedProduct = Pick<Product, "price" | "discount_price" | "discount_percent">;

export function discountedProductPrice(product: PricedProduct) {
  const price = Number(product.price || 0);
  const discountPrice = Number(product.discount_price || 0);
  if (Number.isFinite(discountPrice) && discountPrice > 0 && discountPrice < price) {
    return Math.round(discountPrice);
  }
  const percent = Number(product.discount_percent || 0);
  if (!Number.isFinite(percent)) return 0;
  const safePercent = Math.min(99, Math.max(0, percent));
  return Math.round(price * (100 - safePercent) / 100);
}

export function discountPercent(product: PricedProduct) {
  const price = Number(product.price || 0);
  const current = discountedProductPrice(product);
  if (!price || current >= price) return 0;
  return Math.max(0, Math.round(((price - current) / price) * 100));
}

export function rupeeText(value: number) {
  const rounded = Math.round(value);
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rounded)}`;
}
