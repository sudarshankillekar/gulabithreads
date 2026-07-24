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
