import { discountedProductPrice, discountPercent, rupeeText } from "../lib/pricing";
import type { Product } from "../types";

export function PriceDisplay({ product, quantity = 1, className = "" }: { product: Product; quantity?: number; className?: string }) {
  const percent = discountPercent(product);
  const currentPrice = discountedProductPrice(product) * quantity;
  const originalPrice = product.price * quantity;

  return (
    <p className={`price-display ${className}`.trim()}>
      <strong className="price-current">{rupeeText(currentPrice)}</strong>
      {percent > 0 && (
        <>
          <s className="price-original">{rupeeText(originalPrice)}</s>
          <span className="price-off">({percent}% OFF)</span>
        </>
      )}
    </p>
  );
}
