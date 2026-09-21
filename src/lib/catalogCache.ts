import type { Product } from "../types";

const CACHE_KEY = "gt-catalog-v1";
const MAX_AGE = 24 * 60 * 60 * 1000;

export function isCatalog(value: unknown): value is Product[] {
  return Array.isArray(value) && value.every((product) => product &&
    ["slug", "name", "category", "image", "description", "color", "material"].every((key) => typeof product[key] === "string") &&
    ["price", "stock", "rating"].every((key) => typeof product[key] === "number" && Number.isFinite(product[key])) &&
    Array.isArray(product.gallery) && product.gallery.every((image: unknown) => typeof image === "string"));
}

export function readCatalogCache(scope: string, fallback: Product[], snapshotTime: number): Product[] {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached?.scope === scope && typeof cached.savedAt === "number" && cached.savedAt >= snapshotTime &&
      cached.savedAt <= Date.now() && Date.now() - cached.savedAt < MAX_AGE && isCatalog(cached.products)) return cached.products;
  } catch { /* Browsing still works when storage is blocked or corrupt. */ }
  return fallback;
}

export function writeCatalogCache(scope: string, products: Product[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ scope, savedAt: Date.now(), products }));
  } catch { /* Storage is an optional speed-up. */ }
}
