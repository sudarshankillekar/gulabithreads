# Gulabi Threads Backend

Python FastAPI backend with MongoDB persistence.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

MongoDB must be running locally at `mongodb://localhost:27017`, or set `MONGO_URI` in `.env`.

## API

- `GET /api/health`
- `GET /api/products`
- `GET /api/products/{slug}`
- `POST /api/cart/price`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/dashboard/metrics`

The database is seeded automatically on first startup.
