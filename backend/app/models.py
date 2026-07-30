from typing import Literal

from pydantic import BaseModel, Field

Category = str
OrderStatus = Literal["Processing", "In Transit", "Shipped", "Delivered", "Pending", "Approved", "Cancelled"]


class Product(BaseModel):
    slug: str
    name: str
    price: float = Field(ge=0)
    category: Category
    color: str
    material: str
    rating: int = Field(ge=0, le=5)
    stock: int = Field(ge=0)
    image: str
    gallery: list[str] = Field(default_factory=list)
    description: str
    badge: str | None = None


class CategoryBase(BaseModel):
    name: str = Field(min_length=2)
    slug: str = Field(min_length=2)
    description: str = ""
    image: str = ""
    parent_slug: str | None = None
    display_order: int = Field(default=0, ge=0)
    active: bool = True
    archived: bool = False
    seo_title: str = ""
    seo_description: str = ""


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(CategoryBase):
    pass


class CategoryOut(CategoryBase):
    product_count: int = 0


class CartItem(BaseModel):
    slug: str
    qty: int = Field(ge=1)


class Address(BaseModel):
    full_name: str = Field(min_length=2)
    phone: str = Field(min_length=7)
    email: str | None = None
    address: str = Field(min_length=4)
    address_line2: str = ""
    landmark: str = ""
    city: str = Field(min_length=2)
    state: str = Field(min_length=2)
    pincode: str = Field(min_length=4)
    country: str = "India"
    delivery_instructions: str = ""


class OrderLineItem(BaseModel):
    slug: str
    name: str
    image: str
    variant: str
    qty: int = Field(ge=1)
    unit_price: float = Field(ge=0)
    line_total: float = Field(ge=0)


class CheckoutPriceRequest(BaseModel):
    items: list[CartItem] = Field(min_length=1)
    shipping_cost: float = Field(default=0, ge=0)
    coupon_code: str = ""


class CheckoutPriceOut(BaseModel):
    items: list[OrderLineItem]
    subtotal: float
    discount: float = 0
    coupon_code: str = ""
    shipping_cost: float
    tax: float
    total: float
    estimated_delivery_date: str


class OrderCreate(BaseModel):
    customer: str = Field(default="Guest")
    customer_email: str | None = None
    customer_phone: str | None = None
    checkout_mode: Literal["guest", "registered"] = "guest"
    items: list[CartItem] = Field(min_length=1)
    address: Address
    shipping_method: str
    shipping_cost: float = Field(ge=0)
    payment_method: str
    coupon_code: str = ""
    idempotency_key: str | None = None


class RazorpayOrderCreate(BaseModel):
    items: list[CartItem] = Field(min_length=1)
    shipping_cost: float = Field(default=0, ge=0)
    coupon_code: str = ""
    idempotency_key: str | None = None


class RazorpayOrderOut(BaseModel):
    order_id: str
    amount: int
    currency: str
    key: str
    receipt: str


class RazorpayVerifyPayment(BaseModel):
    razorpay_order_id: str = Field(min_length=1)
    razorpay_payment_id: str = Field(min_length=1)
    razorpay_signature: str = Field(min_length=1)
    customer: str = Field(default="Guest")
    customer_email: str | None = None
    customer_phone: str | None = None
    checkout_mode: Literal["guest", "registered"] = "guest"
    items: list[CartItem] = Field(min_length=1)
    address: Address
    shipping_method: str
    shipping_cost: float = Field(default=0, ge=0)
    payment_method: str = "Razorpay"
    coupon_code: str = ""
    idempotency_key: str | None = None


class Order(BaseModel):
    id: str
    customer: str
    items: list[CartItem]
    product: str
    total: float
    subtotal: float
    tax: float
    shipping_cost: float
    shipping_method: str | None = None
    status: OrderStatus
    date: str
    address: Address | None = None
    payment_method: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    checkout_mode: str = "guest"
    line_items: list[OrderLineItem] = Field(default_factory=list)
    discount: float = 0
    coupon_code: str = ""
    estimated_delivery_date: str | None = None
    tracking_token: str | None = None
    idempotency_key: str | None = None
    payment_status: str = "pending"
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None


class CustomerOut(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    city: str | None = None
    state: str | None = None
    status: str = "Active"
    order_count: int = 0
    lifetime_spend: float = 0
    last_order_id: str | None = None
    last_order_date: str | None = None


class OrderTrackRequest(BaseModel):
    order_id: str = Field(min_length=3)
    phone: str | None = None
    email: str | None = None
    tracking_token: str | None = None


class OtpRequest(BaseModel):
    phone: str = Field(min_length=7)
    purpose: str = "checkout"


class OtpVerifyRequest(BaseModel):
    phone: str = Field(min_length=7)
    otp: str = Field(min_length=4)
    purpose: str = "checkout"


class PricedCart(BaseModel):
    items: list[CartItem]
    subtotal: float
    tax: float
    total: float


class AdminSetup(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)


class AdminLogin(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)


class AdminSession(BaseModel):
    name: str
    email: str
    provider: str = "email"
    token: str


class CustomerRegister(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    phone: str = Field(min_length=7)
    password: str = Field(min_length=6)


class CustomerLogin(BaseModel):
    identifier: str = Field(min_length=3)
    password: str = Field(min_length=6)


class CustomerGoogleLogin(BaseModel):
    credential: str = Field(min_length=20)


class CustomerPasswordResetRequest(BaseModel):
    identifier: str = Field(min_length=3)


class CustomerPasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20)
    password: str = Field(min_length=6)


class CustomerSession(BaseModel):
    name: str
    email: str
    phone: str | None = None
    provider: str = "email"
    token: str
