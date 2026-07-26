import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

from .config import settings

client: AsyncIOMotorClient | None = None


async def connect() -> None:
    global client
    client = AsyncIOMotorClient(settings.mongo_uri, serverSelectionTimeoutMS=20000, tlsCAFile=certifi.where())
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
