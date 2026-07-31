from contextlib import asynccontextmanager
import asyncio
import base64
from datetime import datetime, timedelta
from email.message import EmailMessage
import hashlib
import hmac
import json
from math import ceil
import os
import secrets
import smtplib
import ssl
import time

import certifi
import httpx
from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import DuplicateKeyError
from pydantic import ValidationError
import razorpay

from .config import settings
from .database import close, connect, get_db
from .models import AdminLogin, AdminSession, AdminSetup, CartItem, Category, CategoryCreate, CategoryOut, CategoryUpdate, CheckoutPriceOut, CheckoutPriceRequest, CustomerGoogleLogin, CustomerLogin, CustomerOut, CustomerPasswordResetConfirm, CustomerPasswordResetRequest, CustomerRegister, CustomerSession, Order, OrderCreate, OrderLineItem, OrderStatus, OrderTrackRequest, OtpRequest, OtpVerifyRequest, PricedCart, Product, RazorpayOrderCreate, RazorpayOrderOut, RazorpayVerifyPayment
from .seed import seed_database


rate_limits: dict[str, list[float]] = {}
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7


def strip_id(document: dict) -> dict:
    document.pop("_id", None)
    return document


def normalize_product_document(document: dict) -> dict:
    product = strip_id(document)
    image = str(product.get("image") or "").strip()
    gallery = [str(url).strip() for url in product.get("gallery", []) if str(url).strip()]
    ordered_gallery = []
    for url in [image, *gallery]:
        if url and url not in ordered_gallery:
            ordered_gallery.append(url)
    if not image and ordered_gallery:
        product["image"] = ordered_gallery[0]
    product["gallery"] = ordered_gallery or ([image] if image else [])
    return product


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, digest_hex: str) -> bool:
    _, candidate = hash_password(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(candidate, digest_hex)


def b64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")


def b64url_decode(payload: str) -> bytes:
    return base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))


def create_token(role: str, subject: str) -> str:
    payload = {
        "role": role,
        "sub": subject.lower(),
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
        "nonce": secrets.token_urlsafe(10),
    }
    encoded = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(settings.app_secret.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def verify_token(token: str, expected_role: str) -> dict:
    try:
        encoded, signature = token.split(".", 1)
        expected_signature = hmac.new(settings.app_secret.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("bad signature")
        payload = json.loads(b64url_decode(encoded))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc
    if payload.get("role") != expected_role or int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return payload


def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    return authorization.split(" ", 1)[1].strip()


async def require_admin(authorization: str | None = Header(default=None)) -> dict:
    payload = verify_token(bearer_token(authorization), "admin")
    admin = await get_db().admin_users.find_one({"email": payload["sub"]})
    if admin is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return admin


async def require_customer(authorization: str | None = Header(default=None)) -> dict:
    payload = verify_token(bearer_token(authorization), "customer")
    customer = await get_db().customer_accounts.find_one({"email": payload["sub"]})
    if customer is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return customer


def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = time.time()
    recent_hits = [hit for hit in rate_limits.get(key, []) if now - hit < window_seconds]
    if len(recent_hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait and try again.")
    recent_hits.append(now)
    rate_limits[key] = recent_hits


async def ensure_active_category(category_name: str) -> None:
    category = await get_db().categories.find_one({"name": category_name, "active": True, "archived": False})
    if category is None:
        raise HTTPException(status_code=422, detail=f"Category '{category_name}' is not active")


def customer_key(name: str, phone: str | None = None, email: str | None = None) -> str:
    if email:
        return f"email:{email.lower()}"
    if phone:
        return f"phone:{phone}"
    return f"name:{name.strip().lower()}"


async def upsert_customer_from_order(order: Order) -> None:
    if order.address is None:
        return
    key = customer_key(order.address.full_name, order.address.phone)
    await get_db().customers.update_one(
        {"key": key},
        {
            "$set": {
                "key": key,
                "name": order.address.full_name,
                "phone": order.address.phone,
                "email": order.customer_email or order.address.email,
                "city": order.address.city,
                "state": order.address.state,
                "status": "Active",
                "last_order_id": order.id,
                "last_order_date": order.date,
                "updated_at": datetime.utcnow(),
            },
            "$inc": {"order_count": 1, "lifetime_spend": order.total},
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )


def get_razorpay_client() -> razorpay.Client:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(status_code=500, detail="Razorpay credentials are not configured")
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def ensure_cloudinary_configured() -> None:
    if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        raise HTTPException(status_code=500, detail="Cloudinary credentials are not configured")


def sign_cloudinary_params(params: dict[str, str | int]) -> str:
    payload = "&".join(f"{key}={params[key]}" for key in sorted(params) if params[key] not in ("", None))
    return hashlib.sha1(f"{payload}{settings.cloudinary_api_secret}".encode("utf-8")).hexdigest()


def order_items_text(order: Order) -> str:
    if order.line_items:
        return "\n".join(f"- {item.name} x {item.qty}: ₹{item.line_total:,.0f}" for item in order.line_items)
    return "\n".join(f"- {item.slug} x {item.qty}" for item in order.items)


def order_tracking_url(order: Order) -> str:
    if not order.tracking_token:
        return settings.frontend_origin
    return f"{settings.frontend_origin}/track?order={order.id}&token={order.tracking_token}"


def order_email_body(order: Order) -> str:
    address = order.address
    address_text = ""
    if address:
        address_text = (
            f"{address.full_name}\n"
            f"{address.phone}\n"
            f"{address.address}"
            f"{', ' + address.address_line2 if address.address_line2 else ''}\n"
            f"{address.city}, {address.state} {address.pincode}\n"
            f"{address.country}"
        )
    return (
        f"Hi {order.customer},\n\n"
        f"Thank you for shopping with Gulabi Threads. Your order {order.id} has been placed successfully.\n\n"
        f"Order summary:\n{order_items_text(order)}\n\n"
        f"Subtotal: ₹{order.subtotal:,.0f}\n"
        f"Discount: ₹{order.discount:,.0f}\n"
        f"GST: ₹{order.tax:,.0f}\n"
        f"Shipping: ₹{order.shipping_cost:,.0f}\n"
        f"Total payable: ₹{order.total:,.0f}\n"
        f"Payment method: {order.payment_method or 'Not specified'}\n"
        f"Estimated delivery: {order.estimated_delivery_date or '3-5 business days'}\n\n"
        f"Delivery address:\n{address_text}\n\n"
        f"Track your order: {order_tracking_url(order)}\n\n"
        "Crafted with love,\n"
        "Gulabi Threads"
    )


def admin_order_email_body(order: Order) -> str:
    address = order.address
    address_text = "No address captured"
    if address:
        address_lines = [
            address.full_name,
            address.phone,
            address.email or "",
            f"{address.address}{', ' + address.address_line2 if address.address_line2 else ''}",
            f"{address.city}, {address.state} {address.pincode}",
            address.country,
        ]
        if address.landmark:
            address_lines.append(f"Landmark: {address.landmark}")
        if address.delivery_instructions:
            address_lines.append(f"Delivery instructions: {address.delivery_instructions}")
        address_text = "\n".join(line for line in address_lines if line)
    return (
        "A new Gulabi Threads order has been placed.\n\n"
        f"Order: {order.id}\n"
        f"Status: {order.status}\n"
        f"Checkout mode: {order.checkout_mode}\n"
        f"Customer: {order.customer}\n"
        f"Email: {order.customer_email or 'Not provided'}\n"
        f"Phone: {order.customer_phone or 'Not provided'}\n\n"
        f"Order summary:\n{order_items_text(order)}\n\n"
        f"Subtotal: ₹{order.subtotal:,.0f}\n"
        f"Discount: ₹{order.discount:,.0f}\n"
        f"GST: ₹{order.tax:,.0f}\n"
        f"Shipping: ₹{order.shipping_cost:,.0f}\n"
        f"Total payable: ₹{order.total:,.0f}\n"
        f"Payment method: {order.payment_method or 'Not specified'}\n"
        f"Payment status: {order.payment_status}\n"
        f"Estimated delivery: {order.estimated_delivery_date or '3-5 business days'}\n\n"
        f"Delivery address:\n{address_text}\n\n"
        f"Admin orders: {settings.frontend_origin}/admin/orders"
    )


def order_sms_body(order: Order) -> str:
    return (
        f"Gulabi Threads: Order {order.id} confirmed for ₹{order.total:,.0f}. "
        f"Estimated delivery {order.estimated_delivery_date or 'soon'}. "
        f"Track: {order_tracking_url(order)}"
    )


def order_status_email_body(order: Order, previous_status: str) -> str:
    status_notes = {
        "In Transit": "Your handcrafted order is now on the way to you.",
        "Shipped": "Your handcrafted order has been shipped from Gulabi Threads.",
        "Delivered": "Your handcrafted order has been marked as delivered.",
    }
    note = status_notes.get(order.status, f"Your order status is now {order.status}.")
    return (
        f"Hi {order.customer},\n\n"
        f"{note}\n\n"
        f"Order: {order.id}\n"
        f"Previous status: {previous_status}\n"
        f"Current status: {order.status}\n"
        f"Order total: ₹{order.total:,.0f}\n\n"
        f"Order summary:\n{order_items_text(order)}\n\n"
        f"Track your order: {order_tracking_url(order)}\n\n"
        "Crafted with love,\n"
        "Gulabi Threads"
    )


def normalize_sms_phone(phone: str) -> str:
    value = phone.strip()
    digits = "".join(character for character in value if character.isdigit())
    if value.startswith("00"):
        return digits[2:]
    if value.startswith("+"):
        return digits
    if len(digits) == 11 and digits.startswith("0") and settings.sms_default_country_code:
        return f"{settings.sms_default_country_code.strip('+')}{digits[-10:]}"
    if len(digits) == 10 and settings.sms_default_country_code:
        return f"{settings.sms_default_country_code.strip('+')}{digits}"
    return digits or value


def send_email_sync(to_email: str, subject: str, body: str) -> None:
    from_email = settings.smtp_from_email or settings.smtp_username
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{from_email}>"
    message["To"] = to_email
    message.set_content(body)

    if settings.smtp_port == 465:
        context = ssl.create_default_context(cafile=certifi.where())
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_use_tls:
            server.starttls(context=ssl.create_default_context(cafile=certifi.where()))
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


async def send_order_email(order: Order) -> dict:
    to_email = order.customer_email or (order.address.email if order.address else None)
    from_email = settings.smtp_from_email or settings.smtp_username
    if not to_email:
        return {"channel": "email", "status": "skipped", "reason": "No customer email on order"}
    if not settings.smtp_host or not from_email:
        return {"channel": "email", "status": "skipped", "reason": "SMTP is not configured"}
    try:
        await asyncio.to_thread(send_email_sync, to_email, f"Order {order.id} confirmed - Gulabi Threads", order_email_body(order))
        return {"channel": "email", "status": "sent", "to": to_email}
    except Exception as exc:
        return {"channel": "email", "status": "failed", "to": to_email, "reason": str(exc)}


async def send_admin_order_email(order: Order) -> dict:
    to_email = settings.admin_order_email
    from_email = settings.smtp_from_email or settings.smtp_username
    if not to_email:
        return {"channel": "admin-email", "status": "skipped", "reason": "Admin order email is not configured"}
    if not settings.smtp_host or not from_email:
        return {"channel": "admin-email", "status": "skipped", "reason": "SMTP is not configured"}
    try:
        await asyncio.to_thread(send_email_sync, to_email, f"New order {order.id} - Gulabi Threads", admin_order_email_body(order))
        return {"channel": "admin-email", "status": "sent", "to": to_email}
    except Exception as exc:
        return {"channel": "admin-email", "status": "failed", "to": to_email, "reason": str(exc)}


async def send_order_status_email(order: Order, previous_status: str) -> dict:
    to_email = order.customer_email or (order.address.email if order.address else None)
    from_email = settings.smtp_from_email or settings.smtp_username
    if not to_email:
        return {"channel": "email", "status": "skipped", "reason": "No customer email on order"}
    if not settings.smtp_host or not from_email:
        return {"channel": "email", "status": "skipped", "reason": "SMTP is not configured"}
    try:
        await asyncio.to_thread(
            send_email_sync,
            to_email,
            f"Order {order.id} is {order.status} - Gulabi Threads",
            order_status_email_body(order, previous_status),
        )
        return {"channel": "email", "status": "sent", "to": to_email}
    except Exception as exc:
        return {"channel": "email", "status": "failed", "to": to_email, "reason": str(exc)}


async def send_order_status_notification(order: Order, previous_status: str) -> None:
    result = await send_order_status_email(order, previous_status)
    await get_db().order_notifications.insert_one(
        {
            "order_id": order.id,
            "type": "status-update",
            "previous_status": previous_status,
            "status": order.status,
            "customer_email": order.customer_email,
            "results": [result],
            "created_at": datetime.utcnow(),
        }
    )


async def send_order_sms_brevo(order: Order, to_phone: str) -> dict:
    if not settings.brevo_api_key:
        return {"channel": "sms", "status": "skipped", "provider": "brevo", "reason": "Brevo SMS API key is not configured"}
    try:
        payload = {
            "sender": settings.brevo_sms_sender,
            "recipient": to_phone,
            "content": order_sms_body(order),
            "type": settings.brevo_sms_type,
            "tag": settings.brevo_sms_tag,
            "unicodeEnabled": True,
            "organisationPrefix": settings.brevo_sms_organisation_prefix,
        }
        if settings.brevo_sms_webhook_url:
            payload["webUrl"] = settings.brevo_sms_webhook_url
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.brevo.com/v3/transactionalSMS/send",
                json=payload,
                headers={"accept": "application/json", "api-key": settings.brevo_api_key},
            )
        if response.status_code >= 400:
            return {"channel": "sms", "status": "failed", "provider": "brevo", "to": to_phone, "reason": response.text}
        result = response.json()
        return {"channel": "sms", "status": "sent", "provider": "brevo", "to": to_phone, "provider_id": result.get("messageId") or result.get("reference")}
    except Exception as exc:
        return {"channel": "sms", "status": "failed", "provider": "brevo", "to": to_phone, "reason": str(exc)}


async def send_order_sms_twilio(order: Order, to_phone: str) -> dict:
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        return {"channel": "sms", "status": "skipped", "provider": "twilio", "reason": "Twilio credentials are not configured"}
    if not settings.twilio_from_phone and not settings.twilio_messaging_service_sid:
        return {"channel": "sms", "status": "skipped", "provider": "twilio", "reason": "Twilio sender is not configured"}
    payload = {"To": f"+{to_phone}", "Body": order_sms_body(order)}
    if settings.twilio_messaging_service_sid:
        payload["MessagingServiceSid"] = settings.twilio_messaging_service_sid
    else:
        payload["From"] = settings.twilio_from_phone
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
                data=payload,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            )
        if response.status_code >= 400:
            return {"channel": "sms", "status": "failed", "provider": "twilio", "to": f"+{to_phone}", "reason": response.text}
        result = response.json()
        return {"channel": "sms", "status": "sent", "provider": "twilio", "to": f"+{to_phone}", "provider_id": result.get("sid")}
    except Exception as exc:
        return {"channel": "sms", "status": "failed", "provider": "twilio", "to": f"+{to_phone}", "reason": str(exc)}


async def send_order_sms(order: Order) -> dict:
    raw_phone = order.customer_phone or (order.address.phone if order.address else None)
    if not raw_phone:
        return {"channel": "sms", "status": "skipped", "reason": "No customer phone on order"}
    to_phone = normalize_sms_phone(raw_phone)
    if settings.sms_provider == "twilio":
        result = await send_order_sms_twilio(order, to_phone)
        if result["status"] == "sent" or not settings.brevo_api_key:
            return result
        fallback = await send_order_sms_brevo(order, to_phone)
        return {**fallback, "fallback_from": result}
    return await send_order_sms_brevo(order, to_phone)


async def send_order_confirmation(order: Order) -> list[dict]:
    results = await asyncio.gather(send_order_email(order), send_admin_order_email(order), send_order_sms(order))
    await get_db().order_notifications.insert_one(
        {
            "order_id": order.id,
            "admin_email": settings.admin_order_email,
            "customer_email": order.customer_email,
            "customer_phone": order.customer_phone,
            "results": results,
            "created_at": datetime.utcnow(),
        }
    )
    return results


def customer_session_from_document(customer: dict) -> dict:
    return CustomerSession(
        name=customer.get("name") or "Gulabi Member",
        email=customer["email"],
        phone=customer.get("phone"),
        provider=customer.get("provider", "email"),
        token=create_token("customer", customer["email"]),
    ).model_dump()


def reset_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def send_password_reset_email(customer: dict, token: str) -> dict:
    to_email = customer.get("email")
    from_email = settings.smtp_from_email or settings.smtp_username
    if not to_email:
        return {"channel": "email", "status": "skipped", "reason": "No email on customer account"}
    if not settings.smtp_host or not from_email:
        return {"channel": "email", "status": "skipped", "reason": "SMTP is not configured"}
    reset_url = f"{settings.frontend_origin}/reset-password?token={token}"
    body = (
        f"Hi {customer.get('name', 'Gulabi Member')},\n\n"
        "We received a request to reset your Gulabi Threads password.\n\n"
        f"Reset your password here: {reset_url}\n\n"
        "This link expires in 30 minutes. If you did not request this, you can ignore this email.\n\n"
        "Crafted with love,\n"
        "Gulabi Threads"
    )
    try:
        await asyncio.to_thread(send_email_sync, to_email, "Reset your Gulabi Threads password", body)
        return {"channel": "email", "status": "sent", "to": to_email}
    except Exception as exc:
        return {"channel": "email", "status": "failed", "to": to_email, "reason": str(exc)}


async def verify_google_credential(credential: str) -> dict:
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured yet")
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential})
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified")
    payload = response.json()
    if payload.get("aud") != settings.google_client_id:
        raise HTTPException(status_code=401, detail="Google sign-in is not allowed for this app")
    if str(payload.get("email_verified", "")).lower() not in ("true", "1"):
        raise HTTPException(status_code=401, detail="Google email is not verified")
    email = str(payload.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google did not return an email address")
    return payload


def estimated_delivery_label() -> str:
    return (datetime.utcnow() + timedelta(days=5)).strftime("%b %d")


def normalize_coupon(coupon_code: str) -> str:
    return coupon_code.strip().upper()


async def calculate_checkout_price(items: list[CartItem], shipping_cost: float = 0, coupon_code: str = "") -> CheckoutPriceOut:
    db = get_db()
    subtotal = 0.0
    line_items: list[OrderLineItem] = []
    for item in items:
        product = await db.products.find_one({"slug": item.slug})
        if product is None:
            raise HTTPException(status_code=404, detail=f"Product {item.slug} not found")
        if product["stock"] < item.qty:
            raise HTTPException(status_code=409, detail=f"Only {product['stock']} left for {product['name']}")
        unit_price = float(product["price"])
        line_total = unit_price * item.qty
        subtotal += line_total
        line_items.append(
            OrderLineItem(
                slug=item.slug,
                name=product["name"],
                image=product["image"],
                variant=f"{product.get('color', 'Standard')} | {product.get('material', 'Handcrafted')}",
                qty=item.qty,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    coupon = normalize_coupon(coupon_code)
    discount = round(subtotal * 0.1, 2) if coupon in {"GULABI10", "WELCOME10"} else 0
    taxable = max(subtotal - discount, 0)
    tax = round(taxable * 0.18, 2)
    total = round(taxable + tax + shipping_cost, 2)
    return CheckoutPriceOut(items=line_items, subtotal=subtotal, discount=discount, coupon_code=coupon, shipping_cost=shipping_cost, tax=tax, total=total, estimated_delivery_date=estimated_delivery_label())


async def build_order_from_payload(payload: OrderCreate) -> Order:
    db = get_db()
    priced = await calculate_checkout_price(payload.items, payload.shipping_cost, payload.coupon_code)
    names = [item.name for item in priced.items]
    for item in payload.items:
        result = await db.products.update_one({"slug": item.slug, "stock": {"$gte": item.qty}}, {"$inc": {"stock": -item.qty}})
        if result.modified_count == 0:
            product = await db.products.find_one({"slug": item.slug})
            available = int(product.get("stock", 0)) if product else 0
            raise HTTPException(status_code=409, detail=f"Only {available} left for {item.slug}")

    sequence = await db.orders.count_documents({}) + 1
    return Order(
        id=f"GT-{1048 + sequence}",
        customer=payload.customer,
        customer_email=payload.customer_email or payload.address.email,
        customer_phone=payload.customer_phone or payload.address.phone,
        checkout_mode=payload.checkout_mode,
        items=payload.items,
        product=", ".join(names),
        subtotal=priced.subtotal,
        discount=priced.discount,
        coupon_code=priced.coupon_code,
        tax=priced.tax,
        shipping_cost=payload.shipping_cost,
        shipping_method=payload.shipping_method,
        total=priced.total,
        status="Processing",
        date=datetime.utcnow().strftime("%b %d"),
        address=payload.address,
        payment_method=payload.payment_method,
        line_items=priced.items,
        estimated_delivery_date=priced.estimated_delivery_date,
        tracking_token=secrets.token_urlsafe(18),
        idempotency_key=payload.idempotency_key,
        payment_status="paid" if payload.payment_method == "Razorpay" else "pending",
    )


async def persist_order(order: Order) -> dict:
    if order.idempotency_key:
        existing = await get_db().orders.find_one({"idempotency_key": order.idempotency_key})
        if existing is not None:
            return strip_id(existing)
    try:
        await get_db().orders.insert_one(order.model_dump())
    except DuplicateKeyError as exc:
        if order.idempotency_key:
            existing = await get_db().orders.find_one({"idempotency_key": order.idempotency_key})
            if existing is not None:
                return strip_id(existing)
        raise HTTPException(status_code=409, detail="Duplicate order request") from exc
    await upsert_customer_from_order(order)
    try:
        await send_order_confirmation(order)
    except Exception as exc:
        await get_db().order_notifications.insert_one(
            {
                "order_id": order.id,
                "results": [{"channel": "system", "status": "failed", "reason": str(exc)}],
                "created_at": datetime.utcnow(),
            }
        )
    return order.model_dump()


async def existing_order_for_key(idempotency_key: str | None) -> dict | None:
    if not idempotency_key:
        return None
    existing = await get_db().orders.find_one({"idempotency_key": idempotency_key})
    return strip_id(existing) if existing is not None else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    await seed_database(get_db())
    yield
    await close()


app = FastAPI(title="Gulabi Threads API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    await get_db().command("ping")
    return {"status": "ok", "database": settings.mongo_db}


@app.get("/api/admin/auth/status")
async def admin_auth_status() -> dict[str, bool]:
    configured = await get_db().admin_users.count_documents({}) > 0
    return {"configured": configured}


@app.post("/api/admin/auth/setup", response_model=AdminSession, status_code=201)
async def setup_admin(payload: AdminSetup) -> dict:
    enforce_rate_limit(f"admin-setup:{payload.email.lower()}", limit=5, window_seconds=300)
    db = get_db()
    if await db.admin_users.count_documents({}) > 0:
        raise HTTPException(status_code=409, detail="Admin account is already configured")
    salt, password_hash = hash_password(payload.password)
    admin = {
        "name": payload.name,
        "email": payload.email.lower(),
        "password_salt": salt,
        "password_hash": password_hash,
        "created_at": datetime.utcnow(),
    }
    await db.admin_users.insert_one(admin)
    return AdminSession(name=admin["name"], email=admin["email"], token=create_token("admin", admin["email"])).model_dump()


@app.post("/api/admin/auth/login", response_model=AdminSession)
async def login_admin(payload: AdminLogin) -> dict:
    enforce_rate_limit(f"admin-login:{payload.email.lower()}", limit=8, window_seconds=300)
    admin = await get_db().admin_users.find_one({"email": payload.email.lower()})
    if admin is None or not verify_password(payload.password, admin["password_salt"], admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid admin email or password")
    return AdminSession(name=admin["name"], email=admin["email"], token=create_token("admin", admin["email"])).model_dump()


@app.post("/api/customer/auth/register", response_model=CustomerSession, status_code=201)
async def register_customer(payload: CustomerRegister) -> dict:
    email = payload.email.lower()
    enforce_rate_limit(f"customer-register:{email}", limit=8, window_seconds=300)
    db = get_db()
    existing = await db.customer_accounts.find_one({"email": email})
    phone_owner = await db.customer_accounts.find_one({"phone": payload.phone, "email": {"$ne": email}})
    if phone_owner:
        raise HTTPException(status_code=409, detail="An account already exists with this phone number")
    salt, password_hash = hash_password(payload.password)
    if existing:
        if existing.get("password_hash"):
            raise HTTPException(status_code=409, detail="An account already exists with this email. Please sign in instead.")
        await db.customer_accounts.update_one(
            {"email": email},
            {
                "$set": {
                    "name": payload.name,
                    "phone": payload.phone,
                    "password_salt": salt,
                    "password_hash": password_hash,
                    "provider": existing.get("provider", "google"),
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        customer = await db.customer_accounts.find_one({"email": email})
        return customer_session_from_document(customer)
    customer = {
        "name": payload.name,
        "email": email,
        "phone": payload.phone,
        "password_salt": salt,
        "password_hash": password_hash,
        "provider": "email",
        "created_at": datetime.utcnow(),
    }
    await db.customer_accounts.insert_one(customer)
    return customer_session_from_document(customer)


@app.post("/api/customer/auth/login", response_model=CustomerSession)
async def login_customer(payload: CustomerLogin) -> dict:
    identifier = payload.identifier.lower().strip()
    enforce_rate_limit(f"customer-login:{identifier}", limit=8, window_seconds=300)
    customer = await get_db().customer_accounts.find_one({"$or": [{"email": identifier}, {"phone": payload.identifier.strip()}]})
    if customer is None:
        raise HTTPException(status_code=401, detail="We could not find an account with those details.")
    if not customer.get("password_hash") or not customer.get("password_salt"):
        raise HTTPException(status_code=401, detail="This account uses Google sign-in. Continue with Google or reset your password.")
    if not verify_password(payload.password, customer["password_salt"], customer["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again or reset your password.")
    return customer_session_from_document(customer)


@app.post("/api/customer/auth/google", response_model=CustomerSession)
async def login_customer_google(payload: CustomerGoogleLogin) -> dict:
    enforce_rate_limit("customer-google-login", limit=30, window_seconds=300)
    google = await verify_google_credential(payload.credential)
    email = str(google["email"]).lower()
    db = get_db()
    customer = await db.customer_accounts.find_one({"email": email})
    now = datetime.utcnow()
    if customer:
        await db.customer_accounts.update_one(
            {"email": email},
            {
                "$set": {
                    "google_sub": google.get("sub"),
                    "provider": "google" if not customer.get("password_hash") else customer.get("provider", "email"),
                    "last_login_at": now,
                    "updated_at": now,
                }
            },
        )
        customer = await db.customer_accounts.find_one({"email": email})
        return customer_session_from_document(customer)
    customer = {
        "name": google.get("name") or email.split("@")[0],
        "email": email,
        "phone": None,
        "provider": "google",
        "google_sub": google.get("sub"),
        "created_at": now,
        "last_login_at": now,
    }
    await db.customer_accounts.insert_one(customer)
    return customer_session_from_document(customer)


@app.post("/api/customer/auth/forgot-password")
async def forgot_customer_password(payload: CustomerPasswordResetRequest) -> dict:
    identifier = payload.identifier.lower().strip()
    enforce_rate_limit(f"customer-password-reset:{identifier}", limit=5, window_seconds=300)
    db = get_db()
    customer = await db.customer_accounts.find_one({"$or": [{"email": identifier}, {"phone": payload.identifier.strip()}]})
    if customer and customer.get("email"):
        token = secrets.token_urlsafe(32)
        await db.customer_accounts.update_one(
            {"email": customer["email"]},
            {
                "$set": {
                    "reset_token_hash": reset_token_hash(token),
                    "reset_token_expires_at": datetime.utcnow() + timedelta(minutes=30),
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        result = await send_password_reset_email(customer, token)
        await db.order_notifications.insert_one(
            {
                "type": "password-reset",
                "customer_email": customer.get("email"),
                "results": [result],
                "created_at": datetime.utcnow(),
            }
        )
    return {"message": "If an account exists with these details, a password reset link has been sent."}


@app.post("/api/customer/auth/reset-password", response_model=CustomerSession)
async def reset_customer_password(payload: CustomerPasswordResetConfirm) -> dict:
    enforce_rate_limit(f"customer-password-reset-confirm:{payload.token[:12]}", limit=8, window_seconds=300)
    db = get_db()
    customer = await db.customer_accounts.find_one(
        {
            "reset_token_hash": reset_token_hash(payload.token),
            "reset_token_expires_at": {"$gt": datetime.utcnow()},
        }
    )
    if customer is None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    salt, password_hash = hash_password(payload.password)
    await db.customer_accounts.update_one(
        {"email": customer["email"]},
        {
            "$set": {
                "password_salt": salt,
                "password_hash": password_hash,
                "provider": customer.get("provider", "email"),
                "updated_at": datetime.utcnow(),
            },
            "$unset": {"reset_token_hash": "", "reset_token_expires_at": ""},
        },
    )
    updated = await db.customer_accounts.find_one({"email": customer["email"]})
    return customer_session_from_document(updated)


@app.get("/api/categories", response_model=list[CategoryOut])
async def list_categories(include_archived: bool = False, authorization: str | None = Header(default=None)) -> list[dict]:
    if include_archived:
        await require_admin(authorization)
    db = get_db()
    query = {} if include_archived else {"archived": False}
    cursor = db.categories.find(query).sort([("display_order", 1), ("name", 1)])
    categories: list[dict] = []
    async for document in cursor:
        document = strip_id(document)
        document["product_count"] = await db.products.count_documents({"category": document["name"]})
        categories.append(document)
    return categories


@app.post("/api/categories", response_model=CategoryOut, status_code=201)
async def create_category(payload: CategoryCreate, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    if await db.categories.find_one({"slug": payload.slug}) is not None:
        raise HTTPException(status_code=409, detail="A category with this slug already exists")
    if await db.categories.find_one({"name": payload.name}) is not None:
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    category = payload.model_dump()
    await db.categories.insert_one(category)
    category["product_count"] = 0
    return category


@app.put("/api/categories/{slug}", response_model=CategoryOut)
async def update_category(slug: str, payload: CategoryUpdate, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    existing = await db.categories.find_one({"slug": slug})
    if existing is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.slug != slug and await db.categories.find_one({"slug": payload.slug}) is not None:
        raise HTTPException(status_code=409, detail="A category with this slug already exists")
    duplicate_name = await db.categories.find_one({"name": payload.name, "slug": {"$ne": slug}})
    if duplicate_name is not None:
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    category = payload.model_dump()
    await db.categories.replace_one({"slug": slug}, category)
    if existing["name"] != payload.name:
        await db.products.update_many({"category": existing["name"]}, {"$set": {"category": payload.name}})
    category["product_count"] = await db.products.count_documents({"category": payload.name})
    return category


@app.patch("/api/categories/{slug}/archive", response_model=CategoryOut)
async def archive_category(slug: str, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    category = await db.categories.find_one({"slug": slug})
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    product_count = await db.products.count_documents({"category": category["name"]})
    if product_count > 0:
        raise HTTPException(status_code=409, detail="Reassign products before archiving this category")
    await db.categories.update_one({"slug": slug}, {"$set": {"active": False, "archived": True}})
    category["active"] = False
    category["archived"] = True
    category = strip_id(category)
    category["product_count"] = product_count
    return category


@app.patch("/api/categories/{slug}/status", response_model=CategoryOut)
async def update_category_status(slug: str, active: bool, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    category = await db.categories.find_one({"slug": slug, "archived": False})
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.categories.update_one({"slug": slug}, {"$set": {"active": active}})
    category["active"] = active
    category = strip_id(category)
    category["product_count"] = await db.products.count_documents({"category": category["name"]})
    return category


@app.get("/api/products", response_model=list[Product])
async def list_products(
    category: Category | None = None,
    q: str | None = Query(default=None),
    max_price: float | None = Query(default=None, ge=0),
    in_stock: bool = False,
) -> list[dict]:
    query: dict = {}
    if category:
        query["category"] = category
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    if max_price is not None:
        query["price"] = {"$lte": max_price}
    if in_stock:
        query["stock"] = {"$gt": 0}
    cursor = get_db().products.find(query).sort("name", 1)
    return [normalize_product_document(document) async for document in cursor]


@app.get("/api/products/{slug}", response_model=Product)
async def get_product(slug: str) -> dict:
    product = await get_db().products.find_one({"slug": slug})
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return normalize_product_document(product)


@app.post("/api/products", response_model=Product, status_code=201)
async def create_product(payload: Product, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    await ensure_active_category(payload.category)
    existing = await db.products.find_one({"slug": payload.slug})
    if existing is not None:
        raise HTTPException(status_code=409, detail="A product with this slug already exists")
    product = normalize_product_document(payload.model_dump())
    await db.products.insert_one(product)
    return product


@app.put("/api/products/{slug}", response_model=Product)
async def update_product(slug: str, payload: Product, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    await ensure_active_category(payload.category)
    existing = await db.products.find_one({"slug": slug})
    if existing is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.slug != slug and await db.products.find_one({"slug": payload.slug}) is not None:
        raise HTTPException(status_code=409, detail="A product with this slug already exists")
    product = normalize_product_document(payload.model_dump())
    await db.products.replace_one({"slug": slug}, product)
    return product


@app.delete("/api/products/{slug}", status_code=204)
async def delete_product(slug: str, authorization: str | None = Header(default=None)) -> None:
    await require_admin(authorization)
    result = await get_db().products.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")


@app.post("/api/uploads/product-image")
async def upload_product_image(file: UploadFile = File(...), authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    ensure_cloudinary_configured()
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP image")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be 5MB or smaller")

    timestamp = int(time.time())
    signed_params = {
        "folder": settings.cloudinary_folder,
        "timestamp": timestamp,
        "upload_preset": settings.cloudinary_upload_preset,
    }
    signature = sign_cloudinary_params(signed_params)
    form_data = {
        **signed_params,
        "api_key": settings.cloudinary_api_key,
        "signature": signature,
    }
    upload_url = f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/image/upload"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            upload_url,
            data=form_data,
            files={"file": (file.filename or "product-image", contents, file.content_type)},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {response.text}")
    payload = response.json()
    return {
        "secure_url": payload["secure_url"],
        "public_id": payload["public_id"],
        "width": payload.get("width"),
        "height": payload.get("height"),
        "format": payload.get("format"),
    }


async def price_cart(items: list[CartItem], shipping_cost: float = 0) -> PricedCart:
    priced = await calculate_checkout_price(items, shipping_cost)
    return PricedCart(items=items, subtotal=priced.subtotal, tax=priced.tax, total=priced.total)


@app.post("/api/cart/price", response_model=PricedCart)
async def calculate_cart(items: list[CartItem]) -> PricedCart:
    return await price_cart(items)


@app.post("/api/checkout/price", response_model=CheckoutPriceOut)
async def checkout_price(payload: CheckoutPriceRequest) -> CheckoutPriceOut:
    return await calculate_checkout_price(payload.items, payload.shipping_cost, payload.coupon_code)


@app.post("/api/create-order", response_model=RazorpayOrderOut)
async def create_razorpay_order(payload: RazorpayOrderCreate) -> dict:
    enforce_rate_limit(f"razorpay-create:{payload.idempotency_key or 'anonymous'}", limit=20, window_seconds=300)
    db = get_db()
    if payload.idempotency_key:
        existing = await db.payment_intents.find_one({"idempotency_key": payload.idempotency_key})
        if existing is not None:
            return existing["response"]

    priced = await calculate_checkout_price(payload.items, payload.shipping_cost, payload.coupon_code)
    amount = int(round(priced.total * 100))
    if amount < 100:
        raise HTTPException(status_code=400, detail="Minimum Razorpay order amount is 100 paise")

    receipt = f"gt_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    try:
        razorpay_order = get_razorpay_client().order.create(
            {
                "amount": amount,
                "currency": "INR",
                "receipt": receipt,
                "payment_capture": 1,
            }
        )
    except razorpay.errors.BadRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except razorpay.errors.GatewayError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except razorpay.errors.ServerError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not create Razorpay order") from exc

    response = {
        "order_id": razorpay_order["id"],
        "amount": razorpay_order["amount"],
        "currency": razorpay_order["currency"],
        "key": settings.razorpay_key_id,
        "receipt": receipt,
    }
    intent_document = {"razorpay_order_id": response["order_id"], "amount": response["amount"], "currency": response["currency"], "items": [item.model_dump() for item in payload.items], "shipping_cost": payload.shipping_cost, "coupon_code": payload.coupon_code, "response": response, "created_at": datetime.utcnow()}
    if payload.idempotency_key:
        intent_document["idempotency_key"] = payload.idempotency_key
    if payload.idempotency_key:
        try:
            await db.payment_intents.insert_one(intent_document)
        except DuplicateKeyError:
            existing = await db.payment_intents.find_one({"idempotency_key": payload.idempotency_key})
            if existing is not None:
                return existing["response"]
    else:
        await db.payment_intents.insert_one(intent_document)
    return response


@app.post("/api/verify-payment", response_model=Order)
async def verify_razorpay_payment(raw_payload: dict) -> dict:
    try:
        payload = RazorpayVerifyPayment.model_validate(raw_payload)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Missing or invalid Razorpay payment fields") from exc

    if not settings.razorpay_key_secret:
        raise HTTPException(status_code=500, detail="Razorpay credentials are not configured")

    message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
    generated_signature = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(generated_signature, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid Razorpay payment signature")

    existing = await existing_order_for_key(payload.idempotency_key)
    if existing is not None:
        return existing
    intent = await get_db().payment_intents.find_one({"razorpay_order_id": payload.razorpay_order_id})
    if intent is None:
        raise HTTPException(status_code=400, detail="Payment intent was not created by this server")

    order_payload = OrderCreate(
        customer=payload.customer,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        checkout_mode=payload.checkout_mode,
        items=[CartItem.model_validate(item) for item in intent["items"]],
        address=payload.address,
        shipping_method=payload.shipping_method,
        shipping_cost=float(intent.get("shipping_cost", 0)),
        payment_method="Razorpay",
        coupon_code=intent.get("coupon_code", ""),
        idempotency_key=payload.idempotency_key or intent.get("idempotency_key"),
    )
    order = await build_order_from_payload(order_payload)
    expected_amount = int(round(order.total * 100))
    if expected_amount != int(intent.get("amount", 0)):
        raise HTTPException(status_code=400, detail="Payment amount does not match order total")
    order.razorpay_order_id = payload.razorpay_order_id
    order.razorpay_payment_id = payload.razorpay_payment_id
    order.payment_status = "paid"
    return await persist_order(order)


@app.get("/api/admin/orders", response_model=list[Order])
async def list_orders(authorization: str | None = Header(default=None)) -> list[dict]:
    await require_admin(authorization)
    cursor = get_db().orders.find({}).sort("_id", -1)
    return [strip_id(document) async for document in cursor]


@app.get("/api/account/orders", response_model=list[Order])
async def list_account_orders(authorization: str | None = Header(default=None)) -> list[dict]:
    customer = await require_customer(authorization)
    ownership = [{"customer_email": customer["email"]}, {"address.email": customer["email"]}]
    if customer.get("phone"):
        ownership.extend([{"customer_phone": customer["phone"]}, {"address.phone": customer["phone"]}])
    query = {"$or": ownership}
    cursor = get_db().orders.find(query).sort("_id", -1)
    return [strip_id(document) async for document in cursor]


@app.post("/api/orders/track", response_model=Order)
async def track_order(payload: OrderTrackRequest) -> dict:
    lookup_key = payload.phone or payload.email or payload.tracking_token or "anonymous"
    enforce_rate_limit(f"track:{payload.order_id}:{lookup_key}", limit=10, window_seconds=300)
    order = await get_db().orders.find_one({"id": payload.order_id})
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    phone_match = payload.phone and payload.phone == (order.get("customer_phone") or (order.get("address") or {}).get("phone"))
    email_match = payload.email and payload.email.lower() == (order.get("customer_email") or (order.get("address") or {}).get("email") or "").lower()
    token_match = payload.tracking_token and payload.tracking_token == order.get("tracking_token")
    if not (phone_match or email_match or token_match):
        raise HTTPException(status_code=403, detail="Could not verify order ownership")
    return strip_id(order)


@app.post("/api/otp/send")
async def send_otp(payload: OtpRequest) -> dict:
    enforce_rate_limit(f"otp-send:{payload.purpose}:{payload.phone}", limit=5, window_seconds=300)
    return {"configured": False, "skipped": True, "message": "OTP service is not configured yet"}


@app.post("/api/otp/verify")
async def verify_otp(payload: OtpVerifyRequest) -> dict:
    enforce_rate_limit(f"otp-verify:{payload.purpose}:{payload.phone}", limit=10, window_seconds=300)
    return {"configured": False, "verified": True, "message": "OTP verification skipped because no provider is configured"}


@app.get("/api/customers", response_model=list[CustomerOut])
async def list_customers(authorization: str | None = Header(default=None)) -> list[dict]:
    await require_admin(authorization)
    db = get_db()
    profiles: dict[str, dict] = {}
    customers: dict[str, dict] = {}
    async for document in db.customers.find({}):
        document = strip_id(document)
        key = document.get("key") or customer_key(document.get("name", "Customer"), document.get("phone"), document.get("email"))
        profiles[key] = {
            "name": document.get("name", "Customer"),
            "email": document.get("email"),
            "phone": document.get("phone"),
            "city": document.get("city"),
            "state": document.get("state"),
            "status": document.get("status", "Active"),
        }

    async for order in db.orders.find({}).sort("_id", 1):
        address = order.get("address") or {}
        name = address.get("full_name") or order.get("customer") or "Guest Customer"
        phone = address.get("phone")
        key = customer_key(name, phone)
        profile = profiles.get(key, {})
        row = customers.setdefault(
            key,
            {
                "name": profile.get("name") or name,
                "email": profile.get("email"),
                "phone": phone,
                "city": profile.get("city") or address.get("city"),
                "state": profile.get("state") or address.get("state"),
                "status": profile.get("status", "Active"),
                "order_count": 0,
                "lifetime_spend": 0.0,
                "last_order_id": None,
                "last_order_date": None,
            },
        )
        if not row.get("city"):
            row["city"] = address.get("city")
        if not row.get("state"):
            row["state"] = address.get("state")
        row["order_count"] += 1
        row["lifetime_spend"] += float(order.get("total", 0))
        row["last_order_id"] = order.get("id")
        row["last_order_date"] = order.get("date")

    for key, profile in profiles.items():
        customers.setdefault(
            key,
            {
                **profile,
                "order_count": 0,
                "lifetime_spend": 0.0,
                "last_order_id": None,
                "last_order_date": None,
            },
        )

    return sorted(customers.values(), key=lambda row: (row["last_order_id"] or "", row["name"]), reverse=True)


@app.post("/api/orders", response_model=Order, status_code=201)
async def create_order(payload: OrderCreate) -> dict:
    enforce_rate_limit(f"order-create:{payload.idempotency_key or payload.customer_phone or payload.customer_email or 'anonymous'}", limit=20, window_seconds=300)
    existing = await existing_order_for_key(payload.idempotency_key)
    if existing is not None:
        return existing
    return await persist_order(await build_order_from_payload(payload))


@app.patch("/api/orders/{order_id}/status", response_model=Order)
async def update_order_status(order_id: str, status: OrderStatus, authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    existing = await db.orders.find_one({"id": order_id})
    if existing is None:
        raise HTTPException(status_code=404, detail="Order not found")
    previous_status = existing.get("status", "Processing")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": status, "updated_at": datetime.utcnow()}})
    existing["status"] = status
    updated = strip_id(existing)
    if previous_status != status and status in {"In Transit", "Shipped", "Delivered"}:
        try:
            await send_order_status_notification(Order.model_validate(updated), previous_status)
        except Exception as exc:
            await db.order_notifications.insert_one(
                {
                    "order_id": order_id,
                    "type": "status-update",
                    "previous_status": previous_status,
                    "status": status,
                    "results": [{"channel": "email", "status": "failed", "reason": str(exc)}],
                    "created_at": datetime.utcnow(),
                }
            )
    return updated


@app.get("/api/dashboard/metrics")
async def dashboard_metrics(authorization: str | None = Header(default=None)) -> dict:
    await require_admin(authorization)
    db = get_db()
    orders = await db.orders.find({}).to_list(length=None)
    products = await db.products.find({}).to_list(length=None)
    revenue = sum(float(order.get("total", 0)) for order in orders)
    low_stock = sum(1 for product in products if int(product.get("stock", 0)) < 5)
    return {
        "revenue": revenue,
        "orders": len(orders),
        "products": len(products),
        "lowStock": low_stock,
        "conversion": "6.8%",
        "revenueLabel": f"₹{ceil(revenue / 1000)}k",
    }
