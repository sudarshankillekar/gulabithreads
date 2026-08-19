import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  CreditCard,
  Filter,
  Heart,
  Instagram,
  Menu,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  User,
  X,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { money } from "../lib/format";
import { discountedProductPrice } from "../lib/pricing";
import { navigate } from "../lib/navigation";
import { lookupIndianPincode, normalizePincode, resolveIndianPincode } from "../lib/pincode";
import { bagImg, categoryHeroImg, landingHeroImg } from "../data/catalog";
import { PriceDisplay } from "../components/PriceDisplay";
import type { AddressPayload, AuthSession, CartProps, Category, CheckoutPrice, CheckoutStep, CustomerAccount, OrderRow, Product, StoreProps } from "../types";

const CONTACT_PHONE = "7349583334";
const INSTAGRAM_URL = "https://www.instagram.com/gulabi.threads_?utm_source=ig_web_button_share_sheet";
const REFUND_POLICY = "Refunds or returns are accepted only for damaged or defective products reported and returned within 5 days of delivery.";
const FIRST_ORDER_COUPON = "NISH10";

type RazorpayOrderResponse = {
  order_id: string;
  amount: number;
  currency: string;
  key: string;
  receipt: string;
};

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", callback: (response: { error?: { description?: string; reason?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-gt-razorpay]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay checkout failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.gtRazorpay = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.body.appendChild(script);
  });
}

function trackCheckout(event: string, payload: Record<string, unknown> = {}) {
  console.info(`[analytics] ${event}`, payload);
}

function createIdempotencyKey() {
  return window.crypto?.randomUUID?.() || `gt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeCouponInput(value: string) {
  return value.trim().toUpperCase();
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function shopPath(category?: string | "All") {
  return category && category !== "All" ? `/shop?category=${encodeURIComponent(category)}` : "/shop";
}

function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

function saveCheckoutAddress(address: AddressPayload) {
  const raw = localStorage.getItem("gt-customer-addresses");
  let existing: Array<Record<string, string>> = [];
  try {
    existing = raw ? JSON.parse(raw) as Array<Record<string, string>> : [];
  } catch {
    existing = [];
  }
  const signature = `${address.phone}|${address.address}|${address.pincode}`.toLowerCase();
  const alreadySaved = existing.some((item) => `${item.phone || ""}|${item.address || ""}|${item.pincode || ""}`.toLowerCase() === signature);
  if (alreadySaved) return;
  localStorage.setItem("gt-customer-addresses", JSON.stringify([
    ...existing,
    {
      id: `address-${Date.now()}`,
      label: existing.length ? "Saved Address" : "Home",
      fullName: address.full_name,
      phone: address.phone,
      address: [address.address, address.address_line2].filter(Boolean).join(", "),
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    },
  ]));
}

function categoryFromUrl(categories: string[]): Category | "All" {
  const category = new URLSearchParams(window.location.search).get("category") || "";
  return categories.includes(category) ? category : "All";
}

export function StoreNav({ cartCount, wishlist, isCustomerAuthed, categories }: Pick<StoreProps, "cartCount" | "wishlist" | "isCustomerAuthed" | "categories">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="shipping-bar">
        <span>Use coupon NISH10 & get 10% off your first order</span>
        <span><Sparkles size={15} /> Shop above ₹2000 & get a free keychain</span>
      </div>
      <header className="store-nav">
        <button className="menu" aria-label={open ? "Close categories menu" : "Open categories menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
        <button className="brand brand-mark" onClick={() => navigate("/")}><span>Gulabi Threads</span><small>Crafted with love</small></button>
        <nav className={open ? "nav-links open" : "nav-links"}>
          <span className="nav-drawer-title">Categories</span>
          {categories.map((label) => <button key={label} onClick={() => { setOpen(false); navigate(shopPath(label)); }}>{label}</button>)}
        </nav>
        <div className="nav-actions">
          <button aria-label="Search"><Search size={19} /></button>
          <button aria-label="Wishlist" onClick={() => navigate(isCustomerAuthed ? "/account/wishlist" : loginPath("/account/wishlist"))}><Heart size={19} /><span>{wishlist.length}</span></button>
          <button aria-label="Cart" onClick={() => navigate("/cart")}><ShoppingBag size={19} /><span>{cartCount}</span></button>
          <button aria-label="Account" onClick={() => navigate(isCustomerAuthed ? "/account" : loginPath("/account"))}><User size={19} /></button>
        </div>
      </header>
      <button className={open ? "nav-scrim open" : "nav-scrim"} aria-label="Close categories menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
    </>
  );
}

function StoreFooter({ categories }: { categories: string[] }) {
  return (
    <footer className="store-footer">
      <div>
        <strong>Gulabi Threads</strong>
        <span>Crafted with love</span>
      </div>
      <nav>
        {categories.map((category) => <button key={category} onClick={() => navigate(shopPath(category))}>{category}</button>)}
        <button onClick={() => navigate("/track")}>Track Order</button>
      </nav>
      <div className="footer-contact">
        <p>Handmade bags, pouches, keychains, and thoughtful everyday pieces.</p>
        <p className="footer-policy">{REFUND_POLICY}</p>
        <a href={`tel:+91${CONTACT_PHONE}`}><Phone size={15} /> +91 {CONTACT_PHONE}</a>
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><Instagram size={15} /> Instagram</a>
      </div>
    </footer>
  );
}

function ProductCard({ product, wishlist, addCart, toggleWish }: { product: Product } & StoreProps) {
  const wished = wishlist.includes(product.slug);
  const inStock = product.stock > 0;
  return (
    <article className="product-card">
      <button className="product-image" onClick={() => navigate(`/product/${product.slug}`)}>
        {product.badge && <span className="badge">{product.badge}</span>}
        <img src={product.image} alt={product.name} />
      </button>
      <button className="wish" aria-label={wished ? "Remove from wishlist" : "Add to wishlist"} onClick={() => toggleWish(product.slug)}>
        <Heart size={18} fill={wished ? "currentColor" : "none"} />
      </button>
      <button className="product-name" onClick={() => navigate(`/product/${product.slug}`)}>{product.name}</button>
      <PriceDisplay product={product} />
      <button className="text-button" disabled={!inStock} onClick={() => addCart(product.slug)}>{inStock ? "Add To Bag" : "Out Of Stock"}</button>
    </article>
  );
}

export function HomePage(props: StoreProps) {
  return (
    <div>
      <StoreNav cartCount={props.cartCount} wishlist={props.wishlist} isCustomerAuthed={props.isCustomerAuthed} categories={props.categories} />
      <section className="hero handcrafted-hero">
        <button className="hero-artwork" onClick={() => navigate("/shop")} aria-label="Shop the handcrafted Gulabi Threads collection">
          <img src={landingHeroImg} alt="Handcrafted bags for every you by Gulabi Threads" />
        </button>
        <h1 className="sr-only">Handcrafted Bags for Every You</h1>
      </section>
      <main className="page">
        <SectionTitle eyebrow="Curated Selection" title="New Arrivals" action="View All Products" />
        <div className="product-grid">{props.products.slice(0, 4).map((product) => <ProductCard key={product.slug} product={product} {...props} />)}</div>
      </main>
      <StoreFooter categories={props.categories} />
    </div>
  );
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  return (
    <div className="section-title">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
      {action && <button onClick={() => navigate("/shop")}>{action}</button>}
    </div>
  );
}

export function ShopPage(props: StoreProps) {
  const [category, setCategory] = useState<Category | "All">(() => categoryFromUrl(props.categories));
  const [query, setQuery] = useState("");
  const [max, setMax] = useState(1300);
  const [inStock, setInStock] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const filtered = props.products.filter((p) => (category === "All" || p.category === category) && discountedProductPrice(p) <= max && (!inStock || p.stock > 0) && p.name.toLowerCase().includes(query.toLowerCase()));
  const filters = (
    <aside className="filters">
      <div className="filter-title"><h3>Filters</h3><button onClick={() => { setCategory("All"); setQuery(""); setMax(1300); setInStock(false); navigate(shopPath("All")); }}>Clear All</button></div>
      <label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search collection" /></label>
      <div className="filter-group"><span><Package size={18} />Category</span>{(["All", ...props.categories] as const).map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => { setCategory(item); navigate(shopPath(item)); }}>{item}</button>)}</div>
      <div className="filter-group"><span><SlidersHorizontal size={18} />Price</span><input type="range" min="120" max="1300" value={max} onChange={(e) => setMax(Number(e.target.value))} /><p>Up to {money(max)}</p></div>
      <label className="checkbox"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only</label>
    </aside>
  );
  return (
    <div>
      <StoreNav cartCount={props.cartCount} wishlist={props.wishlist} isCustomerAuthed={props.isCustomerAuthed} categories={props.categories} />
      <header className="shop-hero"><img src={categoryHeroImg} alt="Handcrafted Gulabi Threads category collection" /><div><span className="eyebrow">Handcrafted collection</span><h1>Categories</h1></div></header>
      <main className="shop-layout">
        {filters}
        <section className="shop-results">
          <div className="shop-toolbar"><p>{filtered.length} pieces</p><button onClick={() => setMobileFilters(true)}><Filter size={18} /> Filters</button></div>
          {filtered.length ? <div className="product-grid">{filtered.map((product) => <ProductCard key={product.slug} product={product} {...props} />)}</div> : <Empty title="No pieces match" text="Adjust the filters to continue browsing the collection." />}
        </section>
      </main>
      {mobileFilters && <div className="drawer"><button className="close" onClick={() => setMobileFilters(false)}><X /></button>{filters}</div>}
      <StoreFooter categories={props.categories} />
    </div>
  );
}

export function ProductPage({ product, cartCount, wishlist, addCart, toggleWish, isCustomerAuthed, categories }: { product: Product } & StoreProps) {
  const galleryImages = Array.from(new Set([product.image, ...(product.gallery || [])].filter(Boolean)));
  const galleryKey = galleryImages.join("|");
  const [image, setImage] = useState(galleryImages[0] || product.image);

  useEffect(() => {
    setImage(galleryImages[0] || product.image);
  }, [product.slug, product.image, galleryKey]);

  return (
    <div>
      <StoreNav cartCount={cartCount} wishlist={wishlist} isCustomerAuthed={isCustomerAuthed} categories={categories} />
      <main className="product-detail">
        <nav className="breadcrumbs"><button onClick={() => navigate("/")}>Home</button>/<button onClick={() => navigate("/shop")}>Accessories</button>/<span>{product.name}</span></nav>
        <section className="detail-grid">
          <div className="gallery">
            <img src={image} alt={product.name} />
            {galleryImages.length > 1 && <div>{galleryImages.map((src) => <button className={image === src ? "active" : ""} key={src} onClick={() => setImage(src)}><img src={src} alt="" /></button>)}</div>}
          </div>
          <aside className="buy-panel">
            <h1>{product.name}</h1>
            <PriceDisplay product={product} className="price" />
            <div className="stars">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill={i < product.rating ? "currentColor" : "none"} />)}<span>{product.stock} in stock</span></div>
            <button className="primary-button full" disabled={product.stock <= 0} onClick={() => addCart(product.slug)}>{product.stock > 0 ? "Add To Bag" : "Out Of Stock"}</button>
            <button className="secondary-button full" onClick={() => toggleWish(product.slug)}>{wishlist.includes(product.slug) ? "Saved To Wishlist" : "Add To Wishlist"}</button>
            <details open><summary>Description</summary><p>{product.description}</p></details>
            <details><summary>Specifications</summary><p>14&quot;W x 11&quot;H x 6&quot;D. Magnetic snap closure, rose gold hardware, two slip pockets.</p></details>
            <details><summary>Shipping & Returns</summary><p>Complimentary standard shipping on eligible orders. {REFUND_POLICY} Contact +91 {CONTACT_PHONE} for support.</p></details>
          </aside>
        </section>
      </main>
      <StoreFooter categories={categories} />
    </div>
  );
}

export function CartPage(props: CartProps) {
  return (
    <div>
      <StoreNav cartCount={props.cartCount} wishlist={props.wishlist} isCustomerAuthed={props.isCustomerAuthed} categories={props.categories} />
      <main className="cart-page">
        <SectionTitle title="Your Curated Collection" />
        {props.cartProducts.length ? (
          <div className="cart-layout">
            <section className="cart-list">
              {props.cartProducts.map(({ item, product }) => (
                <article className="cart-item" key={product.slug}>
                  <img src={product.image} alt={product.name} />
                  <div>
                    <div className="cart-line"><h3>{product.name}</h3><PriceDisplay product={product} quantity={item.qty} className="cart-price" /></div>
                    <p>{product.color} | One Size</p>
                    <div className="cart-line">
                      <div className="qty"><button onClick={() => props.updateQty(product.slug, item.qty - 1)}><Minus size={14} /></button><span>{item.qty}</span><button onClick={() => props.updateQty(product.slug, item.qty + 1)}><Plus size={14} /></button></div>
                      <button className="remove" onClick={() => props.updateQty(product.slug, 0)}>Remove</button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <OrderSummary subtotal={props.subtotal} button="Proceed To Checkout" onAction={() => navigate("/checkout")} />
          </div>
        ) : <Empty title="Your bag is empty" text="Start with a tote from the latest collection." action="Shop Totes" onAction={() => navigate("/shop")} />}
      </main>
      <StoreFooter categories={props.categories} />
    </div>
  );
}

type OrderSummaryProps = {
  subtotal: number;
  shipping?: number;
  discount?: number;
  total?: number;
  button: string;
  onAction: () => void;
  buttonType?: "button" | "submit";
  disabled?: boolean;
  coupon?: string;
  setCoupon?: (value: string) => void;
  onApplyCoupon?: () => CheckoutPrice | null | void | Promise<CheckoutPrice | null | void>;
  couponMessage?: string;
  couponError?: string;
  couponApplying?: boolean;
};

function OrderSummary({ subtotal, shipping = 0, discount = 0, total, button, onAction, buttonType = "button", disabled = false, coupon = "", setCoupon, onApplyCoupon, couponMessage = "", couponError = "", couponApplying = false }: OrderSummaryProps) {
  const payable = total ?? Math.max(subtotal - discount, 0) + shipping;
  return (
    <aside className="summary">
      <h3>Order Summary</h3>
      {setCoupon && onApplyCoupon && (
        <div className="summary-coupon">
          <label>Coupon Code<input value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder={FIRST_ORDER_COUPON} /></label>
          <button type="button" className="secondary-button" onClick={onApplyCoupon} disabled={couponApplying}>{couponApplying ? "Applying..." : "Apply"}</button>
          {couponMessage && <p className="coupon-message">{couponMessage}</p>}
          {couponError && <p className="coupon-error">{couponError}</p>}
        </div>
      )}
      <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
      {discount > 0 && <div><span>Discount</span><span>-{money(discount)}</span></div>}
      <div><span>Shipping</span><span>{shipping ? money(shipping) : "FREE"}</span></div>
      <strong><span>Total</span><span>{money(payable)}</span></strong>
      <button type={buttonType} className="primary-button full" onClick={buttonType === "submit" ? undefined : onAction} disabled={disabled}>{button}</button>
    </aside>
  );
}

export function CheckoutPage(props: CartProps) {
  const isSignedInCheckout = Boolean(props.customerSession);
  const [step, setStep] = useState<CheckoutStep>(() => isSignedInCheckout ? "customer" : "identity");
  const [checkoutMode, setCheckoutMode] = useState<"guest" | "registered">(props.customerSession ? "registered" : "guest");
  const [customer, setCustomer] = useState({ full_name: props.customerSession?.name || "", phone: props.customerSession?.phone || "", email: props.customerSession?.email || "" });
  const [address, setAddress] = useState<AddressPayload | null>(null);
  const shipping = 0;
  const [payment, setPayment] = useState("Razorpay");
  const [coupon, setCoupon] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [review, setReview] = useState<CheckoutPrice | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirmedTotal, setConfirmedTotal] = useState<number | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const total = review?.total ?? props.subtotal + shipping;
  const isPaymentStep = step === "payment";
  const checkoutButtonLabel = paying ? "Processing..." : isPaymentStep ? payment === "Razorpay" ? `Pay ${money(total)} & Place Order` : "Place COD Order" : step === "customer" ? "Continue To Address" : "Review Order";
  const shippingAddress: AddressPayload | null = address ? { ...address, full_name: customer.full_name, phone: customer.phone, email: customer.email } : null;
  const existingAccount = props.customerAccounts?.some((account) => {
    const emailMatches = Boolean(customer.email) && account.email.toLowerCase() === customer.email.toLowerCase();
    const phoneMatches = Boolean(customer.phone) && account.phone === customer.phone;
    return emailMatches || phoneMatches;
  });

  useEffect(() => {
    trackCheckout("checkout_started", { cartCount: props.cartCount });
  }, []);

  useEffect(() => {
    if (!props.customerSession) return;
    setCheckoutMode("registered");
    setCustomer({ full_name: props.customerSession.name, phone: props.customerSession.phone || "", email: props.customerSession.email });
    setStep((currentStep) => currentStep === "identity" ? "customer" : currentStep);
  }, [props.customerSession]);

  const updateCoupon = (value: string) => {
    const nextCoupon = value.toUpperCase();
    setCoupon(nextCoupon);
    setCouponMessage("");
    setCouponError("");
    if (review?.coupon_code && normalizeCouponInput(nextCoupon) !== review.coupon_code) {
      setReview((current) => {
        if (!current?.coupon_code) return current;
        return { ...current, discount: 0, coupon_code: "", tax: 0, total: roundCurrency(current.subtotal + current.shipping_cost) };
      });
    }
  };

  const loadReview = async (nextShipping = shipping, nextCoupon = coupon) => {
    const couponCode = normalizeCouponInput(nextCoupon);
    const priced = await apiRequest<CheckoutPrice>("/checkout/price", {
      method: "POST",
      body: JSON.stringify({ items: props.cart, shipping_cost: nextShipping, coupon_code: couponCode }),
    });
    setReview(priced);
    return priced;
  };

  const applyCoupon = async () => {
    const couponCode = normalizeCouponInput(coupon);
    if (!couponCode) {
      setCouponError(`Enter coupon code ${FIRST_ORDER_COUPON} to apply the first-order offer.`);
      setCouponMessage("");
      return null;
    }
    if (couponCode !== FIRST_ORDER_COUPON) {
      setCoupon(couponCode);
      setCouponError(`Coupon ${couponCode} is not valid. Use ${FIRST_ORDER_COUPON} for 10% off your first order.`);
      setCouponMessage("");
      return null;
    }
    setCoupon(couponCode);
    setCouponApplying(true);
    setCouponError("");
    setCouponMessage("");
    try {
      const priced = await loadReview(shipping, couponCode);
      if (priced.coupon_code !== couponCode) {
        setCouponError("This coupon code is not valid.");
        return null;
      }
      if (priced.discount <= 0) {
        setCouponError("This coupon can only be applied when your order has a payable subtotal.");
        return null;
      }
      setCouponMessage(`${priced.coupon_code} applied. You saved ${money(priced.discount)}.`);
      return priced;
    } catch (exc) {
      await loadReview(shipping, "").catch(() => undefined);
      setCouponMessage("");
      setCouponError(exc instanceof Error ? exc.message : "This coupon code is not valid.");
      return null;
    } finally {
      setCouponApplying(false);
    }
  };

  const completeOrderWithoutRazorpay = async (shippingAddress: AddressPayload, couponCode = review?.coupon_code || "") => {
    const created = await apiRequest<OrderRow>("/orders", {
      method: "POST",
      body: JSON.stringify({ customer: shippingAddress.full_name, customer_email: customer.email, customer_phone: customer.phone, checkout_mode: checkoutMode, items: props.cart, address: shippingAddress, shipping_method: "Standard Shipping", shipping_cost: shipping, payment_method: "Cash on Delivery", coupon_code: couponCode, idempotency_key: idempotencyKey }),
    });
    setConfirmedTotal(created.total);
    props.onOrderPlaced?.(created);
    setDone(true);
    setStep("confirmation");
    setIdempotencyKey(createIdempotencyKey());
    trackCheckout("purchase_completed", { orderId: created.id, payment: "COD" });
  };
  const openRazorpayCheckout = async (shippingAddress: AddressPayload, couponCode = review?.coupon_code || "") => {
    await loadRazorpayCheckout();
    if (!window.Razorpay) {
      setError("Razorpay checkout could not load. Please refresh and try again.");
      return;
    }
    setPaying(true);
    try {
      const razorpayOrder = await apiRequest<RazorpayOrderResponse>("/create-order", {
        method: "POST",
        body: JSON.stringify({ items: props.cart, shipping_cost: shipping, coupon_code: couponCode, idempotency_key: idempotencyKey }),
      });
      trackCheckout("payment_started", { method: "Razorpay", amount: razorpayOrder.amount });
      const checkout = new window.Razorpay({
        key: razorpayOrder.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "Gulabi Threads",
        description: "Handcrafted order payment",
        order_id: razorpayOrder.order_id,
        prefill: {
          name: shippingAddress.full_name,
          contact: shippingAddress.phone,
        },
        theme: {
          color: "#cc5980",
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          paylater: true,
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setError("Payment was cancelled. Your order has not been placed.");
          },
        },
        handler: async (response: RazorpaySuccessResponse) => {
          try {
            const verifiedOrder = await apiRequest<OrderRow>("/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                ...response,
                customer: shippingAddress.full_name,
                customer_email: customer.email,
                customer_phone: customer.phone,
                checkout_mode: checkoutMode,
                items: props.cart,
                address: shippingAddress,
                shipping_method: "Standard Shipping",
                shipping_cost: shipping,
                payment_method: "Razorpay",
                coupon_code: couponCode,
                idempotency_key: idempotencyKey,
              }),
            });
            setConfirmedTotal(verifiedOrder.total);
            props.onOrderPlaced?.(verifiedOrder);
            setDone(true);
            setStep("confirmation");
            setIdempotencyKey(createIdempotencyKey());
            trackCheckout("purchase_completed", { orderId: verifiedOrder.id, payment: "Razorpay" });
          } catch {
            setError("Payment completed, but verification failed. Please contact support before retrying.");
            trackCheckout("payment_failed", { reason: "verification_failed" });
          } finally {
            setPaying(false);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        setPaying(false);
        setError(response.error?.description || response.error?.reason || "Payment failed. Please try again.");
        trackCheckout("payment_failed", { reason: response.error?.reason || "payment_failed" });
      });
      checkout.open();
    } catch (exc) {
      setPaying(false);
      setError(exc instanceof Error ? exc.message : "Could not start Razorpay checkout.");
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (paying) return;
    const form = new FormData(event.currentTarget);
    if (step === "customer") {
      const nextCustomer = {
        full_name: String(form.get("full_name") || "").trim(),
        phone: String(form.get("phone") || "").trim(),
        email: String(form.get("email") || "").trim(),
      };
      if (!nextCustomer.full_name || nextCustomer.phone.length < 7 || !nextCustomer.email.includes("@")) {
        setError("Enter full name, valid mobile number, and email address.");
        return;
      }
      setCustomer(nextCustomer);
      await apiRequest<{ configured: boolean; skipped: boolean }>("/otp/send", { method: "POST", body: JSON.stringify({ phone: nextCustomer.phone, purpose: "checkout" }) }).catch(() => undefined);
      setStep("address");
      trackCheckout("address_completed", { stage: "customer" });
      return;
    }
    if (step === "address") {
      const form = new FormData(event.currentTarget);
      const nextAddress = {
        full_name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        address: String(form.get("address") || "").trim(),
        address_line2: String(form.get("address_line2") || "").trim(),
        landmark: String(form.get("landmark") || "").trim(),
        city: String(form.get("city") || "").trim(),
        state: String(form.get("state") || "").trim(),
        pincode: normalizePincode(String(form.get("pincode") || "")),
        country: String(form.get("country") || "India").trim(),
        delivery_instructions: String(form.get("delivery_instructions") || "").trim(),
      };
      if (!nextAddress.address || !nextAddress.city || !nextAddress.state || nextAddress.pincode.length !== 6) {
        setError("Enter address line 1, a valid 6-digit pincode, city, and state.");
        return;
      }
      setAddress(nextAddress);
      if (form.get("save_address")) saveCheckoutAddress(nextAddress);
      try {
        await loadReview(0);
        setStep("payment");
        trackCheckout("address_completed", { stage: "address" });
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : "Could not review this order. Please refresh your bag and try again.");
      }
      return;
    }
    if (step === "payment") {
      if (!props.cart.length) {
        setError("Your bag is empty. Add a product before placing an order.");
        return;
      }
      if (!shippingAddress) {
        setError("Complete your delivery address before payment.");
        return;
      }
      try {
        const typedCoupon = normalizeCouponInput(coupon);
        let appliedCoupon = review?.coupon_code || "";
        if (typedCoupon && typedCoupon !== appliedCoupon) {
          const priced = await applyCoupon();
          if (!priced) return;
          appliedCoupon = priced.coupon_code;
        } else if (!typedCoupon && appliedCoupon) {
          await loadReview(shipping, "");
          appliedCoupon = "";
        }
        if (payment === "Razorpay") await openRazorpayCheckout(shippingAddress, appliedCoupon);
        else await completeOrderWithoutRazorpay(shippingAddress, appliedCoupon);
      } catch {
        setError("We could not place this order. Please check the backend connection and try again.");
      }
    }
  };
  const goBack = () => {
    if (step === "payment") setStep("address");
    else if (step === "address") setStep("customer");
    else if (step === "customer" && isSignedInCheckout) navigate("/cart");
    else setStep("identity");
  };
  return (
    <div>
      <StoreNav cartCount={props.cartCount} wishlist={props.wishlist} isCustomerAuthed={props.isCustomerAuthed} categories={props.categories} />
      <main className={isPaymentStep && !done ? "checkout-page has-payment-cta" : "checkout-page"}>
        <Progress step={step} />
        {done ? <Success total={confirmedTotal ?? total} customer={customer} onCreateCustomer={props.onCreateCustomer} hasAccount={Boolean(props.customerSession)} /> : (
          props.cart.length ? <form className="checkout-grid" onSubmit={submit}>
            <section className="checkout-panel">
              {step === "identity" && !isSignedInCheckout && <IdentityStep onGuest={() => { setCheckoutMode("guest"); setCustomer({ full_name: "", phone: "", email: "" }); setStep("customer"); trackCheckout("guest_checkout_selected"); }} onLogin={() => { setCheckoutMode("registered"); setStep("customer"); trackCheckout("login_selected"); }} onCreate={() => { setCheckoutMode("registered"); setCustomer({ full_name: "", phone: "", email: "" }); setStep("customer"); trackCheckout("account_creation_selected"); }} />}
              {step === "customer" && <CustomerDetailsStep mode={checkoutMode} isAuthenticated={isSignedInCheckout} customer={customer} customerAccounts={props.customerAccounts || []} onLogin={props.onCustomerLogin} onCreateCustomer={props.onCreateCustomer} setCustomer={setCustomer} existingAccount={Boolean(existingAccount)} />}
              {step === "address" && <AddressStep address={address} />}
              {step === "payment" && <PaymentStep payment={payment} setPayment={setPayment} review={review} address={shippingAddress} cartProducts={props.cartProducts} coupon={coupon} setCoupon={updateCoupon} applyCoupon={applyCoupon} couponMessage={couponMessage} couponError={couponError} couponApplying={couponApplying} />}
              {error && <p className="form-error">{error}</p>}
              {isPaymentStep && <PaymentStickyCta total={total} payment={payment} label={checkoutButtonLabel} disabled={paying} />}
              <div className="button-row checkout-actions">
                {step !== "identity" && <button type="button" className="secondary-button" onClick={goBack}>Back</button>}
                {step !== "identity" && !isPaymentStep && <button className="primary-button" disabled={paying}>{checkoutButtonLabel}</button>}
              </div>
            </section>
            <OrderSummary subtotal={review?.subtotal ?? props.subtotal} shipping={review?.shipping_cost ?? shipping} discount={review?.discount ?? 0} total={review?.total} button={isPaymentStep ? checkoutButtonLabel : "Back To Cart"} onAction={() => navigate("/cart")} buttonType={isPaymentStep ? "submit" : "button"} disabled={paying} />
          </form> : <Empty title="Your bag is empty" text="Add a tote before starting checkout." action="Shop Totes" onAction={() => navigate("/shop")} />
        )}
      </main>
      <StoreFooter categories={props.categories} />
    </div>
  );
}

function Progress({ step }: { step: CheckoutStep }) {
  const steps: Array<{ id: CheckoutStep | "cart"; label: string }> = [
    { id: "cart", label: "Cart" },
    { id: "customer", label: "Customer Details" },
    { id: "address", label: "Delivery Address" },
    { id: "payment", label: "Payment" },
    { id: "confirmation", label: "Confirmation" },
  ];
  const currentIndex = step === "identity" ? 1 : steps.findIndex((item) => item.id === step);
  return <div className="progress">{steps.map((item, idx) => <div className={idx <= currentIndex ? "active" : ""} key={item.id}><span>{idx + 1}</span><p>{item.label}</p></div>)}</div>;
}

function IdentityStep({ onGuest, onLogin, onCreate }: { onGuest: () => void; onLogin: () => void; onCreate: () => void }) {
  return (
    <>
      <h1>How would you like to checkout?</h1>
      <p>Continue quickly as a guest, or sign in to use saved details.</p>
      <div className="checkout-choice-grid">
        <button type="button" className="checkout-choice recommended" onClick={onGuest}><strong>Continue as Guest</strong><span>Recommended for first-time customers. No account required.</span></button>
        <button type="button" className="checkout-choice" onClick={onLogin}><strong>Sign In</strong><span>Access saved addresses and faster tracking.</span></button>
        <button type="button" className="checkout-choice" onClick={onCreate}><strong>Create Account</strong><span>Save your address after checkout for next time.</span></button>
      </div>
    </>
  );
}

function CustomerDetailsStep({ mode, isAuthenticated, customer, onLogin, onCreateCustomer, setCustomer, existingAccount }: { mode: "guest" | "registered"; isAuthenticated: boolean; customer: { full_name: string; phone: string; email: string }; customerAccounts: CustomerAccount[]; onLogin?: (session: AuthSession, password?: string) => void | Promise<void>; onCreateCustomer?: (account: CustomerAccount) => void | Promise<void>; setCustomer: (customer: { full_name: string; phone: string; email: string }) => void; existingAccount: boolean }) {
  const [authError, setAuthError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const inlineLogin = async () => {
    try {
      await onLogin?.({ name: customer.full_name || "Gulabi Member", email: customer.email || customer.phone, phone: customer.phone, provider: "email" }, password);
      setAuthError("");
    } catch (exc) {
      setAuthError(exc instanceof Error ? exc.message : "Could not sign in with these details. You can still continue as guest.");
    }
  };
  const inlineCreate = async () => {
    if (password.length < 6 || password !== confirm) {
      setAuthError("Password must be at least 6 characters and match confirmation.");
      return;
    }
    try {
      await onCreateCustomer?.({ name: customer.full_name, phone: customer.phone, email: customer.email, password, provider: "email", createdAt: new Date().toISOString() });
      setAuthError("");
    } catch (exc) {
      setAuthError(exc instanceof Error ? exc.message : "Could not create account. You can still continue as guest.");
    }
  };
  return (
    <>
      <h1>{mode === "guest" ? "Guest Customer Details" : "Customer Details"}</h1>
      <p>We’ll use these details for delivery updates and order tracking.</p>
      {existingAccount && <p className="checkout-note">An account already exists with these details. Sign in to access saved addresses, or continue as guest.</p>}
      <div className="form-grid">
        <label className="line-input"><input name="full_name" placeholder=" " value={customer.full_name} onChange={(event) => setCustomer({ ...customer, full_name: event.target.value })} required /><span>Full Name *</span></label>
        <label className="line-input"><input name="phone" placeholder=" " value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} required /><span>Mobile Number *</span></label>
        <label className="line-input wide"><input name="email" placeholder=" " type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} required /><span>Email Address *</span></label>
      </div>
      {mode === "registered" && !isAuthenticated && <div className="inline-auth">
        <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" /></label>
        <label>Confirm Password<input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="Only needed for new account" /></label>
        <div className="button-row"><button type="button" className="secondary-button" onClick={inlineLogin}>Sign In</button><button type="button" className="secondary-button" onClick={inlineCreate}>Create Account</button></div>
        {authError && <p className="form-error">{authError}</p>}
      </div>}
    </>
  );
}

function AddressStep({ address }: { address: AddressPayload | null }) {
  const [values, setValues] = useState({
    address: address?.address || "",
    address_line2: address?.address_line2 || "",
    landmark: address?.landmark || "",
    pincode: normalizePincode(address?.pincode || ""),
    city: address?.city || "",
    state: address?.state || "",
    country: address?.country || "India",
    delivery_instructions: address?.delivery_instructions || "",
  });
  const [pincodeMessage, setPincodeMessage] = useState("");
  const pincodeLookupId = useRef(0);

  useEffect(() => {
    setValues({
      address: address?.address || "",
      address_line2: address?.address_line2 || "",
      landmark: address?.landmark || "",
      pincode: normalizePincode(address?.pincode || ""),
      city: address?.city || "",
      state: address?.state || "",
      country: address?.country || "India",
      delivery_instructions: address?.delivery_instructions || "",
    });
  }, [address]);

  const updateField = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const updatePincode = (value: string) => {
    const pincode = normalizePincode(value);
    const lookup = lookupIndianPincode(pincode);
    const requestId = ++pincodeLookupId.current;
    setValues((current) => ({
      ...current,
      pincode,
      city: lookup?.city || current.city,
      state: lookup?.state || current.state,
    }));
    setPincodeMessage(pincode.length === 6 ? lookup?.message || "" : "");
    if (pincode.length !== 6) return;
    void resolveIndianPincode(pincode).then((resolved) => {
      if (!resolved || pincodeLookupId.current !== requestId) return;
      setValues((current) => {
        if (current.pincode !== pincode) return current;
        return {
          ...current,
          city: resolved.city || current.city,
          state: resolved.state || current.state,
        };
      });
      setPincodeMessage(resolved.message);
    });
  };

  return (
    <>
      <h1>Delivery Address</h1>
      <p>Where should we deliver your handcrafted piece?</p>
      <div className="form-grid">
        <LineInput name="address" label="Address Line 1 *" value={values.address} onChange={(event) => updateField("address", event.target.value)} required wide />
        <LineInput name="address_line2" label="Address Line 2" value={values.address_line2} onChange={(event) => updateField("address_line2", event.target.value)} wide />
        <LineInput name="landmark" label="Landmark" value={values.landmark} onChange={(event) => updateField("landmark", event.target.value)} />
        <LineInput name="pincode" label="Pincode *" value={values.pincode} onChange={(event) => updatePincode(event.target.value)} inputMode="numeric" maxLength={6} autoComplete="postal-code" required />
        <LineInput name="city" label="City *" value={values.city} onChange={(event) => updateField("city", event.target.value)} autoComplete="address-level2" required />
        <LineInput name="state" label="State *" value={values.state} onChange={(event) => updateField("state", event.target.value)} autoComplete="address-level1" required />
        <LineInput name="country" label="Country *" value={values.country} onChange={(event) => updateField("country", event.target.value)} autoComplete="country-name" required />
        <LineInput name="delivery_instructions" label="Delivery Instructions" value={values.delivery_instructions} onChange={(event) => updateField("delivery_instructions", event.target.value)} wide />
      </div>
      {pincodeMessage && <p className="checkout-note compact">{pincodeMessage}</p>}
      <label className="checkbox"><input name="save_address" type="checkbox" defaultChecked /> Save this address for faster checkout next time</label>
    </>
  );
}

type LineInputProps = {
  name: string;
  label: string;
  wide?: boolean;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  maxLength?: number;
  autoComplete?: string;
};

function LineInput({ name, label, wide, required, defaultValue, value, onChange, inputMode, maxLength, autoComplete }: LineInputProps) {
  const inputProps = value === undefined ? { defaultValue } : { value, onChange };
  return <label className={wide ? "line-input wide" : "line-input"}><input name={name} placeholder=" " required={required} inputMode={inputMode} maxLength={maxLength} autoComplete={autoComplete} {...inputProps} /><span>{label}</span></label>;
}

function PaymentStep({ payment, setPayment, review, address, cartProducts, coupon, setCoupon, applyCoupon, couponMessage, couponError, couponApplying }: { payment: string; setPayment: (value: string) => void; review: CheckoutPrice | null; address: AddressPayload | null; cartProducts: CartProps["cartProducts"]; coupon: string; setCoupon: (value: string) => void; applyCoupon: () => CheckoutPrice | null | void | Promise<CheckoutPrice | null | void>; couponMessage: string; couponError: string; couponApplying: boolean }) {
  const items = review?.items || cartProducts.map(({ item, product }) => {
    const unitPrice = discountedProductPrice(product);
    return { slug: product.slug, name: product.name, image: product.image, variant: `${product.color} | ${product.material}`, qty: item.qty, unit_price: unitPrice, line_total: unitPrice * item.qty };
  });
  return <><h1>Review & Payment</h1><p>Confirm every detail before placing the order.</p><div className="review-list">{items.map((item) => <article key={item.slug}><img src={item.image} alt={item.name} /><div><strong>{item.name}</strong><span>{item.variant}</span><small>Qty {item.qty} × {money(item.unit_price)}</small></div><b>{money(item.line_total)}</b></article>)}</div><div className="review-card"><label>Coupon Code<input value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder={FIRST_ORDER_COUPON} /></label><button type="button" className="secondary-button" onClick={applyCoupon} disabled={couponApplying}>{couponApplying ? "Applying..." : "Apply"}</button>{couponMessage && <p className="coupon-message">{couponMessage}</p>}{couponError && <p className="coupon-error">{couponError}</p>}</div>{address && <div className="review-card"><strong>Delivery Address</strong><p>{address.full_name}<br />{address.address}{address.address_line2 ? `, ${address.address_line2}` : ""}<br />{address.city}, {address.state} {address.pincode}<br />{address.country || "India"}</p><small>Estimated delivery: {review?.estimated_delivery_date || "3-5 business days"}</small></div>}<div className="review-totals"><div><span>Subtotal</span><b>{money(review?.subtotal || 0)}</b></div><div><span>Discount</span><b>{money(review?.discount || 0)}</b></div><div><span>Shipping</span><b>{review?.shipping_cost ? money(review.shipping_cost) : "FREE"}</b></div><strong><span>Final Payable</span><b>{money(review?.total || 0)}</b></strong></div><div className="choice-list">{["Razorpay", "Cash on Delivery"].map((item) => <label className={payment === item ? "choice active" : "choice"} key={item}><input type="radio" name="payment" checked={payment === item} onChange={() => setPayment(item)} /><span><CreditCard /> <strong>{item === "Razorpay" ? "Razorpay (UPI, Card, Wallet)" : item}</strong><small>{item === "Razorpay" ? "Secure online payment" : "Pay when your order arrives"}</small></span><ShieldCheck /></label>)}</div></>;
}

function PaymentStickyCta({ total, payment, label, disabled }: { total: number; payment: string; label: string; disabled: boolean }) {
  return (
    <div className="payment-sticky-cta" aria-live="polite">
      <div>
        <span>Total Payable</span>
        <strong>{money(total)}</strong>
        <small>{payment === "Razorpay" ? "Secure online checkout" : "Cash on delivery"}</small>
      </div>
      <button className="primary-button" disabled={disabled}>{label}</button>
    </div>
  );
}

function Success({ total, customer, onCreateCustomer, hasAccount }: { total: number; customer: { full_name: string; phone: string; email: string }; onCreateCustomer?: (account: CustomerAccount) => void | Promise<void>; hasAccount: boolean }) {
  const [showAccount, setShowAccount] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const createAccount = async () => {
    if (password.length < 6 || password !== confirm) {
      setMessage("Password must be at least 6 characters and match confirmation.");
      return;
    }
    try {
      await onCreateCustomer?.({ name: customer.full_name, phone: customer.phone, email: customer.email, password, provider: "email", createdAt: new Date().toISOString() });
      setMessage("Account created. You can now use the customer dashboard for future orders.");
      trackCheckout("post_purchase_account_created");
    } catch (exc) {
      setMessage(exc instanceof Error ? exc.message : "Could not create account.");
    }
  };
  return <div className="success"><Check size={42} /><h1>Order Confirmed</h1><p>Your Gulabi Threads order for {money(total)} is confirmed. We sent the boutique a packing note and your tracking will appear soon.</p><button className="primary-button" onClick={() => navigate("/account")}>View Dashboard</button>{!hasAccount && <button className="secondary-button" onClick={() => setShowAccount(!showAccount)}>Create an account to track faster</button>}{showAccount && <div className="post-account"><p>Create an account to save your address and track future orders faster.</p><label>Name<input value={customer.full_name} readOnly /></label><label>Mobile<input value={customer.phone} readOnly /></label><label>Email<input value={customer.email} readOnly /></label><label>Password<input type="password" placeholder="Create password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm Password<input type="password" placeholder="Confirm password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label><button className="primary-button" onClick={createAccount}>Create Account</button>{message && <p className={message.startsWith("Account") ? "checkout-note" : "form-error"}>{message}</p>}</div>}</div>;
}

export function OrderConfirmationPage({ order, cartCount, wishlist, isCustomerAuthed, categories }: { order: OrderRow | null } & Pick<StoreProps, "cartCount" | "wishlist" | "isCustomerAuthed" | "categories">) {
  return (
    <div>
      <StoreNav cartCount={cartCount} wishlist={wishlist} isCustomerAuthed={isCustomerAuthed} categories={categories} />
      <main className="checkout-page">
        {order ? (
          <section className="success">
            <Check size={42} />
            <p className="eyebrow">Order {order.id}</p>
            <h1>Order Confirmed</h1>
            <p>Your Gulabi Threads order for {money(order.total)} is confirmed. We sent the confirmation to {order.address?.email || order.customer_email || "your email"}.</p>
            <div className="review-totals">
              <div><span>Customer</span><b>{order.customer}</b></div>
              <div><span>Product</span><b>{order.product}</b></div>
              <div><span>Payment</span><b>{order.payment_method || "Not recorded"}</b></div>
              <strong><span>Total</span><b>{money(order.total)}</b></strong>
            </div>
            <div className="button-row">
              <button className="primary-button" onClick={() => navigate("/account")}>View Orders</button>
              <button className="secondary-button" onClick={() => navigate("/shop")}>Continue Shopping</button>
            </div>
          </section>
        ) : (
          <Empty title="No recent order found" text="Your bag is ready whenever you are." action="Shop Collection" onAction={() => navigate("/shop")} />
        )}
      </main>
      <StoreFooter categories={categories} />
    </div>
  );
}

export function TrackOrderPage({ cartCount, wishlist, isCustomerAuthed, categories }: Pick<StoreProps, "cartCount" | "wishlist" | "isCustomerAuthed" | "categories">) {
  const params = new URLSearchParams(window.location.search);
  const [orderId, setOrderId] = useState(params.get("order") || "");
  const [identifier, setIdentifier] = useState("");
  const [token] = useState(params.get("token") || "");
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const track = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!orderId.trim()) {
      setError("Enter your order number.");
      return;
    }
    if (!token && !identifier.trim()) {
      setError("Enter the phone number or email used for this order.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const value = identifier.trim();
      const tracked = await apiRequest<OrderRow>("/orders/track", {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId.trim().toUpperCase(),
          tracking_token: token || undefined,
          email: value.includes("@") ? value : undefined,
          phone: value && !value.includes("@") ? value : undefined,
        }),
      });
      setOrder(tracked);
    } catch (exc) {
      setOrder(null);
      setError(exc instanceof Error ? exc.message : "We could not verify this order. Check the details and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId && token) void track();
  }, []);

  const lines = order?.line_items?.length ? order.line_items : [];
  return (
    <div>
      <StoreNav cartCount={cartCount} wishlist={wishlist} isCustomerAuthed={isCustomerAuthed} categories={categories} />
      <main className="checkout-page track-page">
        <section className="checkout-panel track-panel">
          <p className="eyebrow">Order Tracking</p>
          <h1>Track Your Order</h1>
          <p>Use your order number with the phone number or email used at checkout. Tracking links from email open automatically.</p>
          <form className="track-form" onSubmit={track}>
            <label className="line-input"><input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder=" " required /><span>Order Number *</span></label>
            {!token && <label className="line-input"><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder=" " required /><span>Email or Mobile Number *</span></label>}
            <button className="primary-button full" disabled={loading}>{loading ? "Checking..." : "Track Order"}</button>
          </form>
          {error && <p className="form-error">{error}</p>}
          {order && (
            <div className="tracked-order">
              <div className="tracked-order-head">
                <div><span className="eyebrow">Order {order.id}</span><h2>{order.status}</h2></div>
                <strong>{money(order.total)}</strong>
              </div>
              <div className="review-totals">
                <div><span>Customer</span><b>{order.customer}</b></div>
                <div><span>Payment</span><b>{order.payment_method || "Not recorded"}</b></div>
                <div><span>Estimated Delivery</span><b>{order.estimated_delivery_date || "3-5 business days"}</b></div>
                <strong><span>Total</span><b>{money(order.total)}</b></strong>
              </div>
              <div className="review-list">
                {lines.length ? lines.map((item) => (
                  <article key={item.slug}>
                    <img src={item.image} alt={item.name} />
                    <div><strong>{item.name}</strong><span>{item.variant}</span><small>Qty {item.qty} x {money(item.unit_price)}</small></div>
                    <b>{money(item.line_total)}</b>
                  </article>
                )) : <article><div><strong>{order.product}</strong><span>Order item</span></div><b>{money(order.total)}</b></article>}
              </div>
              {order.address && <div className="review-card"><strong>Delivery Address</strong><p>{order.address.full_name}<br />{order.address.address}{order.address.address_line2 ? `, ${order.address.address_line2}` : ""}<br />{order.address.city}, {order.address.state} {order.address.pincode}</p></div>}
              <div className="button-row">
                <button className="secondary-button" onClick={() => window.print()}>Print Details</button>
                <button className="primary-button" onClick={() => navigate("/shop")}>Continue Shopping</button>
              </div>
            </div>
          )}
        </section>
      </main>
      <StoreFooter categories={categories} />
    </div>
  );
}

export function Empty({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty"><Sparkles size={32} /><h2>{title}</h2><p>{text}</p>{action && <button className="primary-button" onClick={onAction}>{action}</button>}</div>;
}

export function NotFound() {
  return <Empty title="Page not found" text="This route is not part of the Gulabi Threads atelier yet." action="Return Home" onAction={() => navigate("/")} />;
}
