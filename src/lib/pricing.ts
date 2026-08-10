import type { Product } from "../types";

export function discountPercent(product: Pick<Product, "discount_percent">) {
  const percent = Number(product.discount_percent || 0);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(99, Math.max(0, Math.round(percent)));
}

export function discountedProductPrice(product: Pick<Product, "price" | "discount_percent">) {
  const percent = discountPercent(product);
  if (!percent) return product.price;
  return Math.round(product.price * (100 - percent) / 100);
}

export function rupeeText(value: number) {
  const rounded = Math.round(value);
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rounded)}`;
}
