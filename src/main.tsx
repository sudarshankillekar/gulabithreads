import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiRequest } from "./lib/api";
import { useLocalState } from "./hooks/useLocalState";
import { usePath } from "./hooks/usePath";
import { categories as fallbackCategories, products, orders } from "./data/catalog";
import { navigate } from "./lib/navigation";
import { AccountPage, DashboardPage } from "./pages/DashboardPages";
import { AdminLogoutPage, LoginPage, LogoutPage } from "./pages/AuthPages";
import { CartPage, CheckoutPage, HomePage, NotFound, OrderConfirmationPage, ProductPage, ShopPage } from "./pages/StorePages";
import type { AuthSession, CartItem, CategoryRecord, CustomerAccount, CustomerRecord, OrderRow, OrderStatus, Product, ProductInput } from "./types";
import "./styles.css";

type AdminSection = "dashboard" | "products" | "categories" | "inventory" | "orders" | "customers";

function App() {
  const path = usePath();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [orderRows, setOrderRows] = useState<OrderRow[]>(orders);
  const [categoryRows, setCategoryRows] = useState<CategoryRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [cart, setCart] = useLocalState<CartItem[]>("gt-cart", [{ slug: "aria-silk-tote", qty: 1 }]);
  const [wishlist, setWishlist] = useLocalState<string[]>("gt-wishlist", ["heritage-silk-tote"]);
  const [customerOrderIds, setCustomerOrderIds] = useLocalState<string[]>("gt-customer-order-ids", []);
  const [lastOrder, setLastOrder] = useLocalState<OrderRow | null>("gt-last-order", null);
  const [customerSession, setCustomerSession] = useLocalState<AuthSession | null>("gt-customer-session", null);
  const [customerAccounts, setCustomerAccounts] = useLocalState<CustomerAccount[]>("gt-customer-accounts", []);
  const [adminSession, setAdminSession] = useLocalState<AuthSession | null>("gt-admin-session", null);
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.removeItem("gt-customer-accounts");
    setCustomerAccounts([]);
    apiRequest<Product[]>("/products").then(setCatalog).catch(() => setCatalog([])).finally(() => setCatalogLoaded(true));
    apiRequest<CategoryRecord[]>("/categories").then(setCategoryRows).catch(() => setCategoryRows([]));
    apiRequest<{ configured: boolean }>("/admin/auth/status").then((status) => setAdminConfigured(status.configured)).catch(() => setAdminConfigured(true));
  }, []);

  useEffect(() => {
    if (customerSession && !customerSession.token) {
      setCustomerSession(null);
      setOrderRows([]);
      return;
    }
    if (!customerSession?.token) return;
    apiRequest<OrderRow[]>("/account/orders").then(setOrderRows).catch(() => setOrderRows([]));
  }, [customerSession, setCustomerSession]);

  useEffect(() => {
    if (adminSession && !adminSession.token) {
      setAdminSession(null);
      setCustomers([]);
      return;
    }
    if (!adminSession?.token) return;
    apiRequest<OrderRow[]>("/admin/orders").then(setOrderRows).catch(() => setOrderRows([]));
    apiRequest<CustomerRecord[]>("/customers").then(setCustomers).catch(() => setCustomers([]));
    apiRequest<CategoryRecord[]>("/categories?include_archived=true").then(setCategoryRows).catch(() => undefined);
  }, [adminSession, setAdminSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("loggedOut") !== "1") return;
    setToast("Logged out");
    window.history.replaceState(null, "", window.location.pathname);
  }, [path]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!catalogLoaded) return;
    const purchasableSlugs = new Set(catalog.filter((product) => product.stock > 0).map((product) => product.slug));
    const validSlugs = new Set(catalog.map((product) => product.slug));
    setCart((items) => {
      const availableItems = items.filter((item) => purchasableSlugs.has(item.slug));
      if (availableItems.length !== items.length) setToast("Removed unavailable items from your bag");
      return availableItems;
    });
    setWishlist((items) => items.filter((slug) => validSlugs.has(slug)));
  }, [catalogLoaded, catalog, setCart, setWishlist]);

  const createProduct = async (product: ProductInput) => {
    const payload: Product = {
      ...product,
      gallery: product.gallery?.length ? product.gallery : [product.image],
    };
    const created = await apiRequest<Product>("/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setCatalog((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };
  const updateProduct = async (slug: string, product: ProductInput) => {
    const payload: Product = {
      ...product,
      gallery: product.gallery?.length ? product.gallery : [product.image],
    };
    const updated = await apiRequest<Product>(`/products/${slug}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setCatalog((items) => items.map((item) => (item.slug === slug ? updated : item)).sort((a, b) => a.name.localeCompare(b.name)));
    setCart((items) => items.map((item) => (item.slug === slug ? { ...item, slug: updated.slug } : item)));
    setWishlist((items) => items.map((item) => (item === slug ? updated.slug : item)));
    return updated;
  };
  const deleteProduct = async (slug: string) => {
    await apiRequest<void>(`/products/${slug}`, { method: "DELETE" });
    setCatalog((items) => items.filter((item) => item.slug !== slug));
    setCart((items) => items.filter((item) => item.slug !== slug));
    setWishlist((items) => items.filter((item) => item !== slug));
  };

  const cartProducts = cart.map((item) => ({ item, product: catalog.find((p) => p.slug === item.slug)! })).filter((row) => row.product);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cartProducts.reduce((sum, row) => sum + row.product.price * row.item.qty, 0);
  const isCustomerAuthed = Boolean(customerSession);

  const addCart = (slug: string) => {
    const product = catalog.find((item) => item.slug === slug);
    if (!product || product.stock <= 0) {
      setToast("This item is currently out of stock");
      return;
    }
    const existing = cart.find((item) => item.slug === slug);
    if (existing && existing.qty >= product.stock) {
      setToast(`Only ${product.stock} available`);
      return;
    }
    setCart((items) => {
      const current = items.find((item) => item.slug === slug);
      return current ? items.map((item) => (item.slug === slug ? { ...item, qty: item.qty + 1 } : item)) : [...items, { slug, qty: 1 }];
    });
    setToast("Added to bag");
  };
  const updateQty = (slug: string, qty: number) => setCart((items) => {
    const product = catalog.find((item) => item.slug === slug);
    const nextQty = product ? Math.min(qty, product.stock) : qty;
    if (product && qty > product.stock) setToast(`Only ${product.stock} available`);
    return items.map((item) => (item.slug === slug ? { ...item, qty: nextQty } : item)).filter((item) => item.qty > 0);
  });
  const toggleWish = (slug: string) => setWishlist((items) => (items.includes(slug) ? items.filter((item) => item !== slug) : [...items, slug]));
  const handleOrderPlaced = (order: OrderRow) => {
    setOrderRows((items) => [order, ...items.filter((item) => item.id !== order.id)]);
    setCustomerOrderIds((items) => [order.id, ...items.filter((id) => id !== order.id)]);
    setLastOrder(order);
    if (adminSession?.token) apiRequest<CustomerRecord[]>("/customers").then(setCustomers).catch(() => undefined);
    setCart([]);
    navigate("/order-confirmation");
  };
  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const updated = await apiRequest<OrderRow>(`/orders/${orderId}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" });
    setOrderRows((items) => items.map((item) => (item.id === orderId ? updated : item)));
    return updated;
  };
  const loginCustomer = async (session: AuthSession, password?: string) => {
    const verified = session.token ? session : await apiRequest<AuthSession>("/customer/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: session.email, password }),
    });
    setCustomerSession(verified);
    setToast("Welcome back");
    navigate("/");
  };
  const createCustomerAccount = async (account: CustomerAccount) => {
    const created = await apiRequest<AuthSession>("/customer/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: account.name, email: account.email, phone: account.phone, password: account.password }),
    });
    setCustomerAccounts([]);
    setCustomerSession(created);
    setToast("Account created");
    navigate("/");
  };
  const loginAdmin = async (session: AuthSession, password?: string) => {
    const verified = await apiRequest<AuthSession>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: session.email, password }),
    });
    setAdminSession(verified);
    setToast("Admin access granted");
    navigate("/admin");
  };
  const createAdminPassword = async (payload: { name: string; email: string; password: string }) => {
    const created = await apiRequest<AuthSession>("/admin/auth/setup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAdminConfigured(true);
    setAdminSession(created);
    setToast("Admin password created");
    navigate("/admin");
  };

  const categoryNames = categoryRows.length ? categoryRows.filter((category) => category.active && !category.archived).map((category) => category.name) : [...fallbackCategories];
  const storeProps = { cartCount, wishlist, addCart, toggleWish, onOrderPlaced: handleOrderPlaced, products: catalog, orders: orderRows, categories: categoryNames, isCustomerAuthed };
  const cartProps = { ...storeProps, cart, cartProducts, subtotal, updateQty, customerSession, customerAccounts, onCustomerLogin: loginCustomer, onCreateCustomer: createCustomerAccount };
  const routePath = path.split("?")[0];
  const productSlug = routePath.startsWith("/product/") ? routePath.split("/").pop() || "" : "";
  const adminSection: AdminSection = routePath.includes("orders") ? "orders" : routePath.includes("categories") ? "categories" : routePath.includes("inventory") ? "inventory" : routePath.includes("customers") ? "customers" : routePath.includes("products") ? "products" : "dashboard";
  const accountSection = routePath.includes("wishlist") ? "wishlist" : routePath.includes("addresses") ? "addresses" : routePath.includes("profile") ? "profile" : "orders";

  const page =
    routePath === "/" ? (
      <HomePage {...storeProps} />
    ) : routePath === "/shop" ? (
      <ShopPage key={path} {...storeProps} />
    ) : routePath.startsWith("/product/") ? (
      catalog.find((product) => product.slug === productSlug) ? <ProductPage product={catalog.find((product) => product.slug === productSlug)!} {...storeProps} /> : <NotFound />
    ) : routePath === "/cart" ? (
      <CartPage {...cartProps} />
    ) : routePath === "/checkout" ? (
      <CheckoutPage {...cartProps} />
    ) : routePath === "/order-confirmation" ? (
      <OrderConfirmationPage order={lastOrder} cartCount={cartCount} wishlist={wishlist} isCustomerAuthed={isCustomerAuthed} categories={categoryNames} />
    ) : routePath === "/login" ? (
      customerSession ? <HomePage {...storeProps} /> : <LoginPage mode="customer" onLogin={loginCustomer} customerAccounts={customerAccounts} onCreateCustomer={createCustomerAccount} />
    ) : routePath.startsWith("/account") ? (
      customerSession ? <AccountPage orders={orderRows} customerName={customerSession.name} customerPhone={customerSession.phone} customerEmail={customerSession.email} customerOrderIds={customerOrderIds} section={accountSection} products={catalog} wishlist={wishlist} addCart={addCart} toggleWish={toggleWish} /> : <LoginPage mode="customer" onLogin={loginCustomer} customerAccounts={customerAccounts} onCreateCustomer={createCustomerAccount} />
    ) : routePath === "/logout" ? (
      <LogoutPage onLogout={() => {
        setCustomerSession(null);
        setCustomerOrderIds([]);
      }} />
    ) : routePath === "/admin/login" ? (
      adminSession ? <DashboardPage role="admin" section="dashboard" products={catalog} orders={orderRows} customers={customers} categories={categoryRows} onOrderStatusUpdate={updateOrderStatus} onProductCreate={createProduct} onProductUpdate={updateProduct} onProductDelete={deleteProduct} adminName={adminSession.name} /> : <LoginPage mode="admin" onLogin={loginAdmin} adminConfigured={adminConfigured} onCreateAdmin={createAdminPassword} />
    ) : routePath === "/admin/logout" ? (
      <AdminLogoutPage onLogout={() => setAdminSession(null)} />
    ) : routePath.startsWith("/seller") ? (
      adminSession ? <DashboardPage role="seller" section={adminSection} products={catalog} orders={orderRows} customers={customers} categories={categoryRows} onOrderStatusUpdate={updateOrderStatus} onProductCreate={createProduct} onProductUpdate={updateProduct} onProductDelete={deleteProduct} /> : <LoginPage mode="admin" onLogin={loginAdmin} adminConfigured={adminConfigured} onCreateAdmin={createAdminPassword} />
    ) : routePath.startsWith("/admin") ? (
      adminSession ? <DashboardPage role="admin" section={adminSection} products={catalog} orders={orderRows} customers={customers} categories={categoryRows} onOrderStatusUpdate={updateOrderStatus} onProductCreate={createProduct} onProductUpdate={updateProduct} onProductDelete={deleteProduct} adminName={adminSession.name} /> : <LoginPage mode="admin" onLogin={loginAdmin} adminConfigured={adminConfigured} onCreateAdmin={createAdminPassword} />
    ) : (
      <NotFound />
    );

  return (
    <>
      {page}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
