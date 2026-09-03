import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import OperationFailure
from urllib.parse import parse_qs, urlparse

from .config import settings

client: AsyncIOMotorClient | None = None


def mongo_uses_tls(uri: str) -> bool:
    parsed = urlparse(uri)
    if parsed.scheme == "mongodb+srv":
        return True
    options = {key.lower(): values[-1].lower() for key, values in parse_qs(parsed.query).items() if values}
    return options.get("tls") == "true" or options.get("ssl") == "true"


async def connect() -> None:
    global client
    client_options = {"serverSelectionTimeoutMS": 20000}
    if mongo_uses_tls(settings.mongo_uri):
        client_options["tlsCAFile"] = certifi.where()
    client = AsyncIOMotorClient(settings.mongo_uri, **client_options)
    await client.admin.command("ping")
    db = get_db()
    await db.products.create_index("slug", unique=True)
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("customer")
    await db.orders.create_index("customer_phone")
    await db.orders.create_index("customer_email")
    await db.orders.create_index("razorpay_order_id")
    await db.orders.create_index("tracking_token", unique=True, sparse=True)
    await db.orders.create_index("idempotency_key", unique=True, sparse=True)
    await db.payment_intents.create_index("idempotency_key", unique=True, sparse=True)
    await db.payment_intents.create_index("razorpay_order_id", unique=True, sparse=True)
    await db.order_notifications.create_index("order_id")
    await db.customers.create_index("phone")
    await db.customers.create_index("email")
    await db.customers.create_index("name")
    await db.customer_accounts.create_index("email", unique=True)
    customer_account_indexes = await db.customer_accounts.index_information()
    phone_index = customer_account_indexes.get("phone_1")
    if phone_index and phone_index.get("unique") and not phone_index.get("sparse"):
        try:
            await db.customer_accounts.drop_index("phone_1")
        except OperationFailure:
            pass
    await db.customer_accounts.create_index("phone", unique=True, sparse=True)
    await db.customer_accounts.create_index("google_sub", unique=True, sparse=True)
    await db.customer_accounts.create_index("reset_token_hash", sparse=True)
    await db.categories.create_index("slug", unique=True)
    await db.categories.create_index([("display_order", 1), ("name", 1)])


def get_db() -> AsyncIOMotorDatabase:
    if client is None:
        raise RuntimeError("MongoDB client is not connected")
    return client[settings.mongo_db]


async def close() -> None:
    if client is not None:
        client.close()
