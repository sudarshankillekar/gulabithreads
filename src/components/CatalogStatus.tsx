import type { StoreProps } from "../types";

export function CatalogStatus({ catalogLoading, catalogError, retryCatalog, products }: Pick<StoreProps, "catalogLoading" | "catalogError" | "retryCatalog" | "products">) {
  if (!catalogLoading && !catalogError) return null;
  if (products.length && catalogLoading) return <p className="catalog-refresh" role="status">Updating prices and availability…</p>;
  return <div className="catalog-status" role={catalogError ? "alert" : "status"} aria-live="polite">
    <p>{catalogLoading ? "Loading our collection… This may take a moment." : products.length ? "Showing the saved collection. We couldn’t update prices and availability." : catalogError}</p>
    {catalogError && <button type="button" className="primary-button" onClick={retryCatalog}>Try again</button>}
  </div>;
}
