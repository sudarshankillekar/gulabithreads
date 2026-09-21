import type { StoreProps } from "../types";

export function CatalogStatus({ catalogLoading, catalogError, retryCatalog }: Pick<StoreProps, "catalogLoading" | "catalogError" | "retryCatalog">) {
  if (!catalogLoading && !catalogError) return null;
  return <div className="catalog-status" role={catalogError ? "alert" : "status"} aria-live="polite">
    <p>{catalogLoading ? "Loading our collection… This may take a moment." : catalogError}</p>
    {catalogError && <button type="button" className="primary-button" onClick={retryCatalog}>Try again</button>}
  </div>;
}
