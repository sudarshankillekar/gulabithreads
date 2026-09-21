import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import type { Product } from "../types";

export function useCatalog() {
  const [catalog, setCatalog] = useState<Product[]>([]);
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

  return { catalog, setCatalog, catalogLoaded, catalogLoading, catalogError, retryCatalog: () => setAttempt((value) => value + 1) };
}
