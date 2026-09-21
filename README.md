# Gulabi Threads

Full-stack tote bag storefront and dashboard app.

## Frontend

```bash
npm install
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`.

## Backend

```bash
python3 -m pip install -r backend/requirements.txt
npm run backend
```

The backend expects MongoDB at `mongodb://localhost:27017` and seeds the `gulabi_threads` database on first startup.

Useful API routes:

- `GET /api/health`
- `GET /api/admin/auth/status`
- `POST /api/admin/auth/setup`
- `POST /api/admin/auth/login`
- `GET /api/products`
- `GET /api/products/{slug}`
- `POST /api/products`
- `POST /api/cart/price`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/dashboard/metrics`

## Fast catalog loading

Production builds include a snapshot of the public product catalog so a first visit
can render products before the backend responds. Vercel runs `npm run vercel-build`,
which refreshes that snapshot before building; the deployment fails if a valid
catalog cannot be fetched. Set `CATALOG_SNAPSHOT_API_URL` to an absolute API base URL
when building against a different backend. `npm run build` uses the existing snapshot
for offline development; `npm run refresh-catalog` updates it explicitly.

A newer browser cache is reused for up to 24 hours. Snapshot/cached products are
for browsing: live data replaces them in the background, and cart/checkout and saved
item reconciliation wait for a successful live response. During an outage the saved
collection remains visible with an update warning; it may contain older prices or
removed items until the API recovers. This removes the API wait from browsing, but
does not shorten backend startup or payment requests.

Run regression checks with `node --test tests/*.test.mjs`.
