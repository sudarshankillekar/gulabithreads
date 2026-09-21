import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import snapshot from "../data/catalog-snapshot.json";
import { isCatalog, readCatalogCache, writeCatalogCache } from "../lib/catalogCache";
import type { Product } from "../types";

const cacheScope = String(import.meta.env.VITE_API_BASE_URL || "/api");
const initialProducts = import.meta.env.PROD && isCatalog(snapshot.products) ? snapshot.products : [];

export function useCatalog() {
  const [catalog, setCatalog] = useState<Product[]>(() => readCatalogCache(cacheScope, initialProducts, import.meta.env.PROD ? Date.parse(snapshot.generatedAt) : 0));
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    apiRequest<Product[]>("/products", { signal: controller.signal }, { retries: 3, timeoutMs: 20000 })
      .then((products) => {
        if (controller.signal.aborted) return;
        if (!isCatalog(products)) throw new Error("Invalid product catalog");
        setCatalog(products);
        // Only a successful response may reconcile saved bag and wishlist items.
        setCatalogLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogError("We couldn’t load the collection. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (catalogLoaded) writeCatalogCache(cacheScope, catalog);
  }, [catalog, catalogLoaded]);

  return { catalog, setCatalog, catalogLoaded, catalogLoading, catalogError, retryCatalog: () => setAttempt((value) => value + 1) };
}
