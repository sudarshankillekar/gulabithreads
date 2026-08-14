import React, { FormEvent, useEffect, useState } from "react";
import { BarChart3, Bell, CreditCard, Download, Eye, Heart, Home, LayoutDashboard, LogOut, MapPin, Menu, Package, PackageCheck, Pencil, Plus, Search, Settings, ShoppingBag, Tags, Trash2, Upload, User, Warehouse } from "lucide-react";
import { apiRequest } from "../lib/api";
import { PriceDisplay } from "../components/PriceDisplay";
import { categories as fallbackCategories, heroImg } from "../data/catalog";
import { money, slugify } from "../lib/format";
import { discountedProductPrice, discountPercent } from "../lib/pricing";
import { navigate } from "../lib/navigation";
import { lookupIndianPincode, normalizePincode } from "../lib/pincode";
import type { Category, CategoryRecord, CustomerRecord, OrderRow, OrderStatus, Product, ProductInput } from "../types";

type AccountSection = "orders" | "wishlist" | "addresses" | "profile";
type SavedAddress = {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};
type CustomerProfileState = {
  name: string;
  email: string;
  phone: string;
  birthday: string;
};
type SavedPaymentMethod = {
  id: string;
  label: string;
  detail: string;
};

export function AccountPage({ orders, customerName, customerPhone, customerEmail, customerOrderIds, section, products, wishlist, addCart, toggleWish, onLogout }: { orders: OrderRow[]; customerName: string; customerPhone?: string; customerEmail?: string; customerOrderIds: string[]; section: AccountSection; products: Product[]; wishlist: string[]; addCart: (slug: string) => void; toggleWish: (slug: string) => void; onLogout: () => void }) {
  const wishlistProducts = wishlist.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is Product => Boolean(product));
  const normalizedCustomer = customerName.trim().toLowerCase();
  const normalizedPhone = customerPhone?.replace(/\D/g, "");
  const normalizedEmail = customerEmail?.trim().toLowerCase();
  const customerOrders = orders.filter((order) => {
    const orderCustomer = order.customer.trim().toLowerCase();
    const deliveryName = order.address?.full_name?.trim().toLowerCase();
    const deliveryPhone = order.address?.phone?.replace(/\D/g, "");
    const orderEmail = order.customer.includes("@") ? order.customer.trim().toLowerCase() : "";
    return customerOrderIds.includes(order.id) || orderCustomer === normalizedCustomer || deliveryName === normalizedCustomer || (Boolean(normalizedPhone) && deliveryPhone === normalizedPhone) || (Boolean(normalizedEmail) && orderEmail === normalizedEmail);
  });
  return (
    <DashboardShell role="customer" section={section} displayName={customerName} onLogout={onLogout}>
      {section === "orders" && <CustomerOrders orders={customerOrders} customerName={customerName} wishlistCount={wishlistProducts.length} products={products} />}
      {section === "wishlist" && <CustomerWishlist products={wishlistProducts} addCart={addCart} toggleWish={toggleWish} />}
      {section === "addresses" && <CustomerAddresses />}
      {section === "profile" && <CustomerProfile customerName={customerName} />}
    </DashboardShell>
  );
}

function CustomerOrders({ orders, customerName, wishlistCount, products }: { orders: OrderRow[]; customerName: string; wishlistCount: number; products: Product[] }) {
  return <>
    <section className="welcome"><h1>Aadab, {customerName.split(" ")[0] || "Member"}.</h1><p>Welcome back to your atelier dashboard. View your curation, manage artisanal orders, and update preferences.</p></section>
    <div className="metric-grid">
      <Metric icon={<PackageCheck />} label="Your Orders" value={`${orders.length} total`} />
      <Metric icon={<Heart />} label="Wishlist" value={`${wishlistCount} ${wishlistCount === 1 ? "item" : "items"}`} />
      <Metric icon={<CreditCard />} label="Payment Methods" value="3 saved" />
    </div>
    {orders.length ? <OrdersTable orders={orders} products={products} /> : <div className="account-placeholder"><PackageCheck size={28} /><strong>No orders yet</strong><span>Your confirmed Gulabi Threads orders will appear here.</span></div>}
  </>;
}

function CustomerWishlist({ products, addCart, toggleWish }: { products: Product[]; addCart: (slug: string) => void; toggleWish: (slug: string) => void }) {
  return (
    <section className="account-panel">
      <h1>Wishlist</h1>
      <p>Your saved Gulabi Threads pieces are ready when you are.</p>
      {products.length ? (
        <div className="account-wishlist">
          {products.map((product) => (
            <article key={product.slug}>
              <button className="account-wishlist-image" onClick={() => navigate(`/product/${product.slug}`)} aria-label={`View ${product.name}`}>
                <img src={product.image} alt={product.name} />
              </button>
              <div>
                <button className="account-wishlist-name" onClick={() => navigate(`/product/${product.slug}`)}>{product.name}</button>
                <p>{product.color} | {product.material}</p>
                <PriceDisplay product={product} />
              </div>
              <div className="account-wishlist-actions">
                <button className="primary-button" onClick={() => addCart(product.slug)}>Add To Bag</button>
                <button className="secondary-button" onClick={() => toggleWish(product.slug)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="account-placeholder"><Heart size={28} /><strong>No saved pieces yet</strong><span>Use the heart icon on any product to curate this list.</span></div>
      )}
    </section>
  );
}

const defaultAddresses: SavedAddress[] = [
  { id: "home", label: "Home", fullName: "", phone: "", address: "Mumbai", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
  { id: "work", label: "Work", fullName: "", phone: "", address: "Bandra Kurla Complex", city: "Mumbai", state: "Maharashtra", pincode: "" },
];

function CustomerAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>(() => {
    const raw = localStorage.getItem("gt-customer-addresses");
    return raw ? JSON.parse(raw) as SavedAddress[] : defaultAddresses;
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("gt-customer-addresses", JSON.stringify(addresses));
  }, [addresses]);

  const updateAddress = (id: string, field: keyof SavedAddress, value: string) => {
    setAddresses((items) => items.map((item) => {
      if (item.id !== id) return item;
      if (field !== "pincode") return { ...item, [field]: value };
      const pincode = normalizePincode(value);
      const lookup = lookupIndianPincode(pincode);
      return {
        ...item,
        pincode,
        city: lookup?.city || item.city,
        state: lookup?.state || item.state,
      };
    }));
  };
  const addAddress = () => {
    const id = `address-${Date.now()}`;
    setAddresses((items) => [...items, { id, label: "New Address", fullName: "", phone: "", address: "", city: "", state: "", pincode: "" }]);
    setEditingId(id);
  };
  const removeAddress = (id: string) => {
    setAddresses((items) => items.filter((item) => item.id !== id));
    setEditingId(null);
  };

  return (
    <section className="account-panel">
      <div className="account-panel-heading">
        <div><h1>Addresses</h1><p>Manage delivery details for future orders.</p></div>
        <button className="primary-button" onClick={addAddress}><Plus size={16} /> Add Address</button>
      </div>
      <div className="account-list">
        {addresses.map((address) => (
          <article className="address-card" key={address.id}>
            <MapPin />
            {editingId === address.id ? (
              <div className="address-form">
                <label>Label<input value={address.label} onChange={(event) => updateAddress(address.id, "label", event.target.value)} /></label>
                <label>Full Name<input value={address.fullName} onChange={(event) => updateAddress(address.id, "fullName", event.target.value)} /></label>
                <label>Mobile<input value={address.phone} onChange={(event) => updateAddress(address.id, "phone", event.target.value)} /></label>
                <label className="wide">Address<input value={address.address} onChange={(event) => updateAddress(address.id, "address", event.target.value)} /></label>
                <label>City<input value={address.city} onChange={(event) => updateAddress(address.id, "city", event.target.value)} /></label>
                <label>State<input value={address.state} onChange={(event) => updateAddress(address.id, "state", event.target.value)} /></label>
                <label>Pincode<input value={address.pincode} inputMode="numeric" maxLength={6} onChange={(event) => updateAddress(address.id, "pincode", event.target.value)} /></label>
              </div>
            ) : (
              <div>
                <strong>{address.label}</strong>
                <p>{[address.address, address.city, address.state, address.pincode].filter(Boolean).join(", ") || "No address added yet"}</p>
                {(address.fullName || address.phone) && <p>{[address.fullName, address.phone].filter(Boolean).join(" | ")}</p>}
              </div>
            )}
            <div className="address-actions">
              {editingId === address.id ? (
                <>
                  <button onClick={() => setEditingId(null)}>Save</button>
                  <button onClick={() => removeAddress(address.id)}>Delete</button>
                </>
              ) : (
                <button onClick={() => setEditingId(address.id)}>Edit</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CustomerProfile({ customerName }: { customerName: string }) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [managingPayments, setManagingPayments] = useState(false);
  const [profile, setProfile] = useState<CustomerProfileState>(() => {
    const raw = localStorage.getItem("gt-customer-profile");
    return raw ? JSON.parse(raw) as CustomerProfileState : { name: customerName, email: "", phone: "", birthday: "" };
  });
  const [payments, setPayments] = useState<SavedPaymentMethod[]>(() => {
    const raw = localStorage.getItem("gt-customer-payments");
    return raw ? JSON.parse(raw) as SavedPaymentMethod[] : [
      { id: "upi", label: "UPI", detail: "Not added" },
      { id: "card", label: "Card", detail: "Not added" },
      { id: "cod", label: "Cash on Delivery", detail: "Available" },
    ];
  });

  useEffect(() => {
    localStorage.setItem("gt-customer-profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("gt-customer-payments", JSON.stringify(payments));
  }, [payments]);

  const updateProfile = (field: keyof CustomerProfileState, value: string) => setProfile((item) => ({ ...item, [field]: value }));
  const updatePayment = (id: string, field: keyof SavedPaymentMethod, value: string) => setPayments((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const addPayment = () => {
    setPayments((items) => [...items, { id: `payment-${Date.now()}`, label: "New Method", detail: "" }]);
    setManagingPayments(true);
  };
  const removePayment = (id: string) => setPayments((items) => items.filter((item) => item.id !== id));

  return (
    <section className="account-panel">
      <h1>Profile</h1>
      <p>Review customer account information.</p>
      <div className="account-list">
        <article className="address-card">
          <User />
          {editingProfile ? (
            <div className="address-form">
              <label>Full Name<input value={profile.name} onChange={(event) => updateProfile("name", event.target.value)} /></label>
              <label>Email<input type="email" value={profile.email} onChange={(event) => updateProfile("email", event.target.value)} /></label>
              <label>Mobile<input value={profile.phone} onChange={(event) => updateProfile("phone", event.target.value)} /></label>
              <label>Birthday<input type="date" value={profile.birthday} onChange={(event) => updateProfile("birthday", event.target.value)} /></label>
            </div>
          ) : (
            <div>
              <strong>{profile.name || customerName}</strong>
              <p>Luxury member account</p>
              {(profile.email || profile.phone) && <p>{[profile.email, profile.phone].filter(Boolean).join(" | ")}</p>}
            </div>
          )}
          <div className="address-actions">
            <button type="button" onClick={() => setEditingProfile(!editingProfile)}>{editingProfile ? "Save" : "Edit"}</button>
          </div>
        </article>
        <article className="address-card">
          <CreditCard />
          {managingPayments ? (
            <div className="payment-method-editor">
              {payments.map((payment) => (
                <div className="address-form payment-row" key={payment.id}>
                  <label>Method<input value={payment.label} onChange={(event) => updatePayment(payment.id, "label", event.target.value)} /></label>
                  <label>Details<input value={payment.detail} onChange={(event) => updatePayment(payment.id, "detail", event.target.value)} /></label>
                  <button type="button" onClick={() => removePayment(payment.id)}>Delete</button>
                </div>
              ))}
              <button type="button" className="secondary-button" onClick={addPayment}><Plus size={16} /> Add Method</button>
            </div>
          ) : (
            <div>
              <strong>Payment Methods</strong>
              <p>{payments.length} saved methods</p>
              <p>{payments.map((payment) => payment.label).join(", ")}</p>
            </div>
          )}
          <div className="address-actions">
            <button type="button" onClick={() => setManagingPayments(!managingPayments)}>{managingPayments ? "Save" : "Manage"}</button>
          </div>
        </article>
      </div>
    </section>
  );
}

type AdminSection = "dashboard" | "products" | "categories" | "inventory" | "orders" | "customers";

export function DashboardPage({ role, section, products, orders, customers, categories, onOrderStatusUpdate, onProductCreate, onProductUpdate, onProductDelete, adminName, onLogout }: { role: "seller" | "admin"; section: AdminSection; products: Product[]; orders: OrderRow[]; customers: CustomerRecord[]; categories: CategoryRecord[]; onOrderStatusUpdate: (orderId: string, status: OrderStatus) => Promise<OrderRow>; onProductCreate: (product: ProductInput) => Promise<Product>; onProductUpdate: (slug: string, product: ProductInput) => Promise<Product>; onProductDelete: (slug: string) => Promise<void>; adminName?: string; onLogout?: () => void }) {
  const categoryNames = categories.length ? categories.filter((category) => category.active && !category.archived).map((category) => category.name) : [...fallbackCategories];
  return (
    <DashboardShell role={role} section={section} displayName={adminName} onLogout={onLogout}>
      {section === "dashboard" && <><section className="welcome"><h1>{role === "admin" ? "Admin Overview" : "Seller Portal"}</h1><p>{role === "admin" ? "Monitor catalog health, approvals, and boutique order flow." : "Manage your catalog, monitor inventory health, and curate your boutique."}</p></section><div className="metric-grid"><Metric icon={<ShoppingBag />} label="Revenue" value="₹42.8k" /><Metric icon={<Package />} label="Active Listings" value={String(products.length)} /><Metric icon={<Bell />} label="Pending Review" value="2" /><Metric icon={<BarChart3 />} label="Conversion" value="6.8%" /></div><OrdersTable orders={orders} compact /></>}
      {section === "products" && <ProductsManager products={products} categories={categoryNames} admin={role === "admin"} onProductCreate={onProductCreate} onProductUpdate={onProductUpdate} onProductDelete={onProductDelete} />}
      {section === "categories" && <CategoriesManager initialCategories={categories} />}
      {section === "inventory" && <InventoryManager products={products} />}
      {section === "orders" && <OrdersManager orders={orders} onOrderStatusUpdate={onOrderStatusUpdate} />}
      {section === "customers" && <CustomersManager customers={customers} orders={orders} />}
    </DashboardShell>
  );
}

function DashboardShell({ role, section, children, displayName, onLogout }: { role: "customer" | "seller" | "admin"; section: string; children: React.ReactNode; displayName?: string; onLogout?: () => void }) {
  const [open, setOpen] = useState(false);
  const base = role === "customer" ? "/account" : `/${role}`;
  const customerNav = [["Orders", `${base}/orders`, ShoppingBag], ["Wishlist", `${base}/wishlist`, Heart], ["Addresses", `${base}/addresses`, Home], ["Profile", `${base}/profile`, User]];
  const adminNavGroups = [
    { label: "Operations", items: [["Dashboard", base, LayoutDashboard], ["Orders", `${base}/orders`, Package], ["Customers", `${base}/customers`, User]] },
    { label: "Catalog", items: [["Products", `${base}/products`, ShoppingBag], ["Categories", `${base}/categories`, Tags], ["Inventory", `${base}/inventory`, Warehouse]] },
    { label: "Control", items: [["Settings", base, Settings]] },
  ];
  const isActive = (label: string) => section === label.toLowerCase() || (section === "dashboard" && label === "Dashboard");
  return (
    <div className="dashboard">
      <aside className={open ? "dash-side open" : "dash-side"}>
        <h2>Gulabi Threads</h2><p>{displayName || (role === "customer" ? "Luxury Member" : `${role} Portal`)}</p>
        <nav>
          {role === "customer" ? customerNav.map(([label, href, Icon]) => <a className={isActive(String(label)) ? "active" : ""} key={String(label)} href={String(href)}>{React.createElement(Icon as typeof Home, { size: 19 })}{label as string}</a>) : adminNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span>{group.label}</span>
              {group.items.map(([label, href, Icon]) => <a className={isActive(String(label)) ? "active" : ""} key={String(label)} href={String(href)}>{React.createElement(Icon as typeof Home, { size: 19 })}{label as string}</a>)}
            </div>
          ))}
        </nav>
        <div className="dash-side-actions">
          <a className="primary-button full" href="/">{role === "customer" ? "Shop Collection" : "View Boutique"}</a>
          {role === "customer" && <button type="button" className="logout-button" onClick={onLogout}><LogOut size={17} /> Logout</button>}
          {role === "admin" && <button type="button" className="logout-button" onClick={onLogout}><LogOut size={17} /> Logout</button>}
        </div>
      </aside>
      <header className="dash-top"><button onClick={() => setOpen(!open)}><Menu /></button><label><Search size={17} /><input placeholder="Search orders, SKUs, or customers..." /></label><button><Bell /></button></header>
      <main className="dash-main">{children}</main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="metric"><span>{icon}</span><p>{label}</p><strong>{value}</strong></article>;
}

function uniqueImageUrls(urls: string[]) {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

function galleryFromText(value: string) {
  return uniqueImageUrls(value.split(/[\n,]+/));
}

function ProductsManager({ products, categories, admin, onProductCreate, onProductUpdate, onProductDelete }: { products: Product[]; categories: string[]; admin?: boolean; onProductCreate: (product: ProductInput) => Promise<Product>; onProductUpdate: (slug: string, product: ProductInput) => Promise<Product>; onProductDelete: (slug: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const availableCategories = categories.length ? categories : [...fallbackCategories];
  const rows = products.filter((product) => product.name.toLowerCase().includes(query.toLowerCase()));
  const lowStock = products.filter((product) => product.stock < 5).length;
  const inventoryValue = products.reduce((sum, product) => sum + discountedProductPrice(product) * product.stock, 0);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const fallbackImage = products[0]?.image || heroImg;
    const image = String(form.get("image") || imageUrl || galleryUrls[0] || fallbackImage).trim();
    const gallery = uniqueImageUrls([image, ...galleryUrls, ...galleryFromText(String(form.get("gallery") || ""))]);
    const payload = {
      slug: slugify(String(form.get("slug") || name)),
      name,
      price: Number(form.get("price") || 0),
      discount_percent: Number(form.get("discount_percent") || 0),
      category: String(form.get("category") || availableCategories[0]) as Category,
      color: String(form.get("color") || "Blush Rose"),
      material: String(form.get("material") || "Pebble Leather"),
      rating: Number(form.get("rating") || 4),
      stock: Number(form.get("stock") || 0),
      badge: String(form.get("badge") || "") || undefined,
      image,
      gallery: gallery.length ? gallery : [image],
      description: String(form.get("description") || "A new Gulabi Threads piece ready for the collection."),
    };
    setSaving(true);
    setError("");
    try {
      if (editingProduct) await onProductUpdate(editingProduct.slug, payload);
      else await onProductCreate(payload);
      formElement.reset();
      setImageUrl("");
      setGalleryUrls([]);
      setShowForm(false);
      setEditingProduct(null);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not save product");
    } finally {
      setSaving(false);
    }
  };
  const startCreate = () => {
    const isCreating = showForm && !editingProduct;
    const fallbackImage = products[0]?.image || heroImg;
    setEditingProduct(null);
    setImageUrl(fallbackImage);
    setGalleryUrls([fallbackImage]);
    setError("");
    setShowForm(!isCreating);
  };
  const startEdit = (product: Product) => {
    const gallery = uniqueImageUrls([product.image, ...(product.gallery || [])]);
    setEditingProduct(product);
    setImageUrl(product.image);
    setGalleryUrls(gallery.length ? gallery : [product.image]);
    setError("");
    setShowForm(true);
  };
  const cancelForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setImageUrl("");
    setGalleryUrls([]);
    setError("");
  };
  const uploadProductImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const fallbackImage = products[0]?.image || heroImg;
    setUploadingImage(true);
    setError("");
    try {
      const uploadedUrls = await Promise.all(files.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        const uploaded = await apiRequest<{ secure_url: string }>("/uploads/product-image", {
          method: "POST",
          body: formData,
        });
        return uploaded.secure_url;
      }));
      setGalleryUrls((current) => {
        const currentWithoutPlaceholder = current.length === 1 && current[0] === fallbackImage ? [] : current;
        return uniqueImageUrls([...currentWithoutPlaceholder, ...uploadedUrls]);
      });
      setImageUrl((current) => !current || current === fallbackImage ? uploadedUrls[0] : current);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not upload images");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };
  const setCoverImage = (url: string) => {
    setImageUrl(url);
    setGalleryUrls((current) => uniqueImageUrls([url, ...current.filter((item) => item !== url)]));
  };
  const removeGalleryImage = (url: string) => {
    setGalleryUrls((current) => {
      const next = current.filter((item) => item !== url);
      if (imageUrl === url) setImageUrl(next[0] || "");
      return next;
    });
  };
  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}? This removes it from the catalog.`)) return;
    setDeletingSlug(product.slug);
    setError("");
    try {
      await onProductDelete(product.slug);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not delete product");
    } finally {
      setDeletingSlug("");
    }
  };
  return <>
    <div className="dash-heading"><div><h1>{admin ? "Admin Product Control" : "Product Management"}</h1><p>{admin ? "Track catalog health, add products to MongoDB, and monitor inventory risk." : "Manage listings, approvals, inventory, and boutique merchandising."}</p></div><div><button className="secondary-button"><Upload size={16} /> Bulk Upload</button>{admin && <button className="primary-button" onClick={startCreate}><Plus size={16} /> {showForm && !editingProduct ? "Close Form" : "Add Product"}</button>}</div></div>
    <div className="metric-grid product-metrics"><Metric icon={<ShoppingBag />} label="Total Products" value={String(products.length)} /><Metric icon={<Package />} label="Inventory Units" value={String(products.reduce((sum, product) => sum + product.stock, 0))} /><Metric icon={<Bell />} label="Low Stock" value={String(lowStock)} /><Metric icon={<BarChart3 />} label="Stock Value" value={money(inventoryValue)} /></div>
    {admin && showForm && <form className="admin-product-form" key={editingProduct?.slug || "create"} onSubmit={submit}>
      <div className="form-section-title"><h2>{editingProduct ? "Edit Product" : "Add Product"}</h2><p>{editingProduct ? "Update product details in MongoDB and refresh the storefront immediately." : "New products are saved through the Python API into MongoDB."}</p></div>
      <label>Name<input name="name" required placeholder="The Jaipur Market Tote" defaultValue={editingProduct?.name} /></label><label>Slug<input name="slug" placeholder="jaipur-market-tote" defaultValue={editingProduct?.slug} /></label><label>Category<select name="category" defaultValue={editingProduct?.category || availableCategories[0]}>{availableCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Original Price<input name="price" required type="number" min="0" step="1" placeholder="999" defaultValue={editingProduct?.price} /></label><label>Discount %<input name="discount_percent" type="number" min="0" max="99" step="1" placeholder="47" defaultValue={editingProduct?.discount_percent || 0} /></label><label>Stock<input name="stock" required type="number" min="0" step="1" placeholder="24" defaultValue={editingProduct?.stock} /></label>
      <label>Rating<input name="rating" type="number" min="0" max="5" step="1" defaultValue={editingProduct?.rating || 4} /></label>
      <label>Color<input name="color" placeholder="Blush Rose" defaultValue={editingProduct?.color} /></label><label>Material<input name="material" placeholder="Pebble Leather" defaultValue={editingProduct?.material} /></label><label>Badge<input name="badge" placeholder="New In" defaultValue={editingProduct?.badge} /></label>
      <div className="wide image-upload-field">
        <label>Product Photos<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={uploadProductImage} disabled={uploadingImage} /></label>
        <label>Cover Image URL<input name="image" required placeholder="https://..." value={imageUrl || galleryUrls[0] || editingProduct?.image || products[0]?.image || heroImg} onChange={(event) => setCoverImage(event.target.value)} /></label>
        <label className="wide">Gallery URLs<textarea name="gallery" rows={3} placeholder="One image URL per line" value={galleryUrls.join("\n")} onChange={(event) => setGalleryUrls(galleryFromText(event.target.value))} /></label>
        <div className="image-upload-preview">
          {galleryUrls.map((url) => (
            <figure key={url} className={url === imageUrl ? "cover" : ""}>
              <img src={url} alt="" />
              <figcaption>{url === imageUrl ? "Cover photo" : "Gallery photo"}</figcaption>
              <div>
                <button type="button" onClick={() => setCoverImage(url)}>Use as cover</button>
                <button type="button" onClick={() => removeGalleryImage(url)}><Trash2 size={14} /> Remove</button>
              </div>
            </figure>
          ))}
          {!galleryUrls.length && <span>{uploadingImage ? "Uploading images to Cloudinary..." : "Upload multiple photos or paste Cloudinary URLs."}</span>}
          {uploadingImage && galleryUrls.length > 0 && <span>Uploading images to Cloudinary...</span>}
        </div>
      </div>
      <label className="wide">Description<textarea name="description" rows={3} placeholder="Describe the tote, material, and occasion." defaultValue={editingProduct?.description} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={cancelForm}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving..." : editingProduct ? "Update Product" : "Save Product"}</button></div>
    </form>}
    <label className="dash-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" /></label>
    <div className="data-table"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>{rows.map((product) => <tr key={product.slug}><td><img src={product.image} alt="" />{product.name}</td><td>{product.category}</td><td><PriceDisplay product={product} /></td><td>{product.stock}</td><td><div className="table-actions"><button aria-label={`View ${product.name}`} onClick={() => navigate(`/product/${product.slug}`)}><Eye size={16} /></button>{admin && <button aria-label={`Edit ${product.name}`} onClick={() => startEdit(product)}><Pencil size={16} /></button>}{admin && <button aria-label={`Delete ${product.name}`} disabled={deletingSlug === product.slug} onClick={() => deleteProduct(product)}><Trash2 size={16} /></button>}</div></td></tr>)}</tbody></table></div>
  </>;
}

function OrdersManager({ orders, onOrderStatusUpdate }: { orders: OrderRow[]; onOrderStatusUpdate: (orderId: string, status: OrderStatus) => Promise<OrderRow> }) {
  return <><div className="dash-heading"><div><h1>Order Management</h1><p>Track fulfillment, buyer communication, and shipment status.</p></div><button className="secondary-button"><Download size={16} /> Export</button></div><OrdersTable orders={orders} onOrderStatusUpdate={onOrderStatusUpdate} /></>;
}

type CategoryFormValues = Omit<CategoryRecord, "product_count">;

function categoryDefaults(order: number): CategoryFormValues {
  return {
    name: "",
    slug: "",
    description: "",
    image: "",
    parent_slug: null,
    display_order: order,
    active: true,
    archived: false,
    seo_title: "",
    seo_description: "",
  };
}

function CategoriesManager({ initialCategories }: { initialCategories: CategoryRecord[] }) {
  const [categories, setCategories] = useState<CategoryRecord[]>(initialCategories);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CategoryFormValues>(categoryDefaults(initialCategories.length + 1));
  const activeCount = categories.filter((category) => category.active && !category.archived).length;
  const archivedCount = categories.filter((category) => category.archived).length;

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const refresh = async () => {
    const rows = await apiRequest<CategoryRecord[]>("/categories?include_archived=true");
    setCategories(rows);
    return rows;
  };

  const startCreate = () => {
    setEditing(null);
    setForm(categoryDefaults(categories.length + 1));
    setError("");
    setShowForm(true);
  };

  const startEdit = (category: CategoryRecord) => {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description,
      image: category.image,
      parent_slug: category.parent_slug || null,
      display_order: category.display_order,
      active: category.active,
      archived: category.archived,
      seo_title: category.seo_title,
      seo_description: category.seo_description,
    });
    setError("");
    setShowForm(true);
  };

  const updateField = (field: keyof CategoryFormValues, value: string | number | boolean | null) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = { ...form, slug: form.slug || slugify(form.name), parent_slug: form.parent_slug || null };
    setSaving(true);
    setError("");
    try {
      if (editing) await apiRequest<CategoryRecord>(`/categories/${editing.slug}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiRequest<CategoryRecord>("/categories", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
      setShowForm(false);
      setEditing(null);
      setForm(categoryDefaults(categories.length + 2));
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not save category");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (category: CategoryRecord) => {
    setError("");
    try {
      await apiRequest<CategoryRecord>(`/categories/${category.slug}/status?active=${!category.active}`, { method: "PATCH" });
      await refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not update category");
    }
  };

  const archiveCategory = async (category: CategoryRecord) => {
    if (!window.confirm(`Archive ${category.name}? Categories with products cannot be archived.`)) return;
    setError("");
    try {
      await apiRequest<CategoryRecord>(`/categories/${category.slug}/archive`, { method: "PATCH" });
      await refresh();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not archive category");
    }
  };

  return <>
    <div className="dash-heading"><div><h1>Category Control</h1><p>Manage storefront navigation, product grouping, and active selling categories.</p></div><button className="primary-button" onClick={startCreate}><Plus size={16} /> Add Category</button></div>
    <div className="metric-grid product-metrics"><Metric icon={<Tags />} label="Total Categories" value={String(categories.length)} /><Metric icon={<PackageCheck />} label="Active" value={String(activeCount)} /><Metric icon={<Package />} label="Archived" value={String(archivedCount)} /><Metric icon={<ShoppingBag />} label="Products Linked" value={String(categories.reduce((sum, category) => sum + category.product_count, 0))} /></div>
    {error && <p className="form-error standalone">{error}</p>}
    {showForm && <form className="admin-product-form" onSubmit={submit}>
      <div className="form-section-title"><h2>{editing ? "Edit Category" : "Add Category"}</h2><p>Categories drive storefront filters, product forms, and admin catalog grouping.</p></div>
      <label>Name<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Tote bag 18*18" /></label>
      <label>Slug<input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="tote-bag-18x18" /></label>
      <label>Display Order<input type="number" min="0" value={form.display_order} onChange={(event) => updateField("display_order", Number(event.target.value))} /></label>
      <label className="wide">Image URL<input value={form.image} onChange={(event) => updateField("image", event.target.value)} placeholder="https://..." /></label>
      <label className="wide">Description<textarea rows={3} value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Short storefront category description." /></label>
      <label>SEO Title<input value={form.seo_title} onChange={(event) => updateField("seo_title", event.target.value)} placeholder="Handmade tote bags" /></label>
      <label>SEO Description<input value={form.seo_description} onChange={(event) => updateField("seo_description", event.target.value)} placeholder="Search description" /></label>
      <label className="check-label"><input type="checkbox" checked={form.active} onChange={(event) => updateField("active", event.target.checked)} /> Active category</label>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving..." : editing ? "Update Category" : "Save Category"}</button></div>
    </form>}
    <div className="data-table"><table><thead><tr><th>Category</th><th>Slug</th><th>Products</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{categories.map((category) => <tr key={category.slug}><td><strong>{category.name}</strong><small>{category.description || "No description"}</small></td><td>{category.slug}</td><td>{category.product_count}</td><td>{category.display_order}</td><td><Status status={category.archived ? "Archived" : category.active ? "Approved" : "Inactive"} /></td><td><div className="table-actions"><button aria-label={`Edit ${category.name}`} onClick={() => startEdit(category)}><Pencil size={16} /></button><button aria-label={`${category.active ? "Disable" : "Enable"} ${category.name}`} disabled={category.archived} onClick={() => toggleStatus(category)}><Eye size={16} /></button><button aria-label={`Archive ${category.name}`} disabled={category.archived || category.product_count > 0} onClick={() => archiveCategory(category)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
  </>;
}

function InventoryManager({ products }: { products: Product[] }) {
  const lowStock = products.filter((product) => product.stock < 5);
  const outOfStock = products.filter((product) => product.stock === 0);
  const units = products.reduce((sum, product) => sum + product.stock, 0);
  return <>
    <div className="dash-heading"><div><h1>Inventory</h1><p>Monitor stock levels, inventory value, and low-stock products before replenishment.</p></div></div>
    <div className="metric-grid product-metrics"><Metric icon={<Warehouse />} label="Inventory Units" value={String(units)} /><Metric icon={<Bell />} label="Low Stock" value={String(lowStock.length)} /><Metric icon={<Package />} label="Out Of Stock" value={String(outOfStock.length)} /><Metric icon={<BarChart3 />} label="Stock Value" value={money(products.reduce((sum, product) => sum + discountedProductPrice(product) * product.stock, 0))} /></div>
    <div className="data-table"><table><thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Unit Price</th><th>Value</th><th>Status</th></tr></thead><tbody>{products.map((product) => <tr key={product.slug}><td><img src={product.image} alt="" />{product.name}</td><td>{product.category}</td><td>{product.stock}</td><td><PriceDisplay product={product} /></td><td>{money(discountedProductPrice(product) * product.stock)}{discountPercent(product) > 0 && <small>Sale stock value</small>}</td><td><Status status={product.stock === 0 || product.stock < 5 ? "Pending" : "Approved"} /></td></tr>)}</tbody></table></div>
  </>;
}

function CustomersManager({ customers, orders }: { customers: CustomerRecord[]; orders: OrderRow[] }) {
  const [query, setQuery] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = customers.filter((customer) => {
    if (!normalized) return true;
    return [customer.name, customer.email, customer.phone, customer.city, customer.state, customer.last_order_id].some((value) => String(value || "").toLowerCase().includes(normalized));
  });
  const customerOrders = (customer: CustomerRecord) => orders.filter((order) => {
    const name = order.address?.full_name || order.customer;
    const phone = order.address?.phone;
    return name.trim().toLowerCase() === customer.name.trim().toLowerCase() || (Boolean(phone) && phone === customer.phone);
  });
  const totalSpend = customers.reduce((sum, customer) => sum + customer.lifetime_spend, 0);
  const repeatCustomers = customers.filter((customer) => customer.order_count > 1).length;

  return <>
    <div className="dash-heading"><div><h1>Customers</h1><p>Track customer profiles, order history, location, and lifetime value from MongoDB orders.</p></div></div>
    <div className="metric-grid product-metrics"><Metric icon={<User />} label="Total Customers" value={String(customers.length)} /><Metric icon={<PackageCheck />} label="Repeat Customers" value={String(repeatCustomers)} /><Metric icon={<BarChart3 />} label="Lifetime Spend" value={money(totalSpend)} /><Metric icon={<MapPin />} label="Cities" value={String(new Set(customers.map((customer) => customer.city).filter(Boolean)).size)} /></div>
    <label className="dash-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers, phone, city, or order" /></label>
    <div className="data-table"><table><thead><tr><th>Customer</th><th>Contact</th><th>Location</th><th>Orders</th><th>Lifetime Spend</th><th>Latest</th></tr></thead><tbody>{filtered.map((customer) => {
      const isOpen = expandedCustomer === `${customer.name}-${customer.phone || customer.email || ""}`;
      const history = customerOrders(customer);
      return (
        <React.Fragment key={`${customer.name}-${customer.phone || customer.email || "unknown"}`}>
          <tr className={isOpen ? "order-row open" : "order-row"} onClick={() => setExpandedCustomer(isOpen ? "" : `${customer.name}-${customer.phone || customer.email || ""}`)}>
            <td><strong>{customer.name}</strong><small>{customer.status}</small></td>
            <td>{customer.phone || "No phone"}<small>{customer.email || "No email"}</small></td>
            <td>{[customer.city, customer.state].filter(Boolean).join(", ") || "Not recorded"}</td>
            <td>{customer.order_count}</td>
            <td>{money(customer.lifetime_spend)}</td>
            <td>{customer.last_order_id || "None"}<small>{customer.last_order_date || ""}</small></td>
          </tr>
          {isOpen && <tr className="order-detail-row"><td colSpan={6}><div className="customer-order-list">{history.length ? history.map((order) => <article key={order.id}><strong>{order.id}</strong><span>{order.product}</span><span>{money(order.total)}</span><Status status={order.status} /></article>) : <p>No order history found for this customer.</p>}</div></td></tr>}
        </React.Fragment>
      );
    })}</tbody></table></div>
  </>;
}

function ModulePlaceholder({ title, text }: { title: string; text: string }) {
  return <section className="account-placeholder module-placeholder"><User size={30} /><h1>{title}</h1><span>{text}</span></section>;
}

function OrdersTable({ orders, compact, onOrderStatusUpdate, products = [] }: { orders: OrderRow[]; compact?: boolean; onOrderStatusUpdate?: (orderId: string, status: OrderStatus) => Promise<OrderRow>; products?: Product[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState("");
  const [error, setError] = useState("");
  const orderNumber = (id: string) => Number(id.replace(/\D/g, "")) || 0;
  const customerName = (order: OrderRow) => order.customer === "Guest Customer" && order.address?.full_name ? order.address.full_name : order.customer;
  const rows = [...orders].sort((a, b) => orderNumber(b.id) - orderNumber(a.id)).slice(0, compact ? 3 : orders.length);
  const statuses: OrderStatus[] = ["Processing", "In Transit", "Shipped", "Delivered", "Pending", "Cancelled"];
  const updateStatus = async (order: OrderRow, status: OrderStatus) => {
    if (!onOrderStatusUpdate || order.status === status) return;
    setSavingOrder(order.id);
    setError("");
    try {
      await onOrderStatusUpdate(order.id, status);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not update order status");
    } finally {
      setSavingOrder("");
    }
  };
  return (
    <div className="data-table">
      {error && <p className="form-error table-error">{error}</p>}
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((order) => {
            const isOpen = expanded === order.id;
            return (
              <React.Fragment key={order.id}>
                <tr className={isOpen ? "order-row open" : "order-row"} onClick={() => !compact && setExpanded(isOpen ? null : order.id)}>
                  <td>{order.id}<small>{order.date}</small></td>
                  <td>{customerName(order)}</td>
                  <td>{order.product}</td>
                  <td>{money(order.total)}</td>
                  <td>
                    {compact || !onOrderStatusUpdate ? <Status status={order.status} /> : (
                      <select className="status-select" value={order.status} disabled={savingOrder === order.id} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStatus(order, event.target.value as OrderStatus)}>
                        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    )}
                    {!compact && <button className="order-toggle" type="button">{isOpen ? "Hide" : "Details"}</button>}
                  </td>
                </tr>
                {!compact && isOpen && <OrderDetailRow order={order} products={products} />}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function productForOrderItem(products: Product[], slug: string) {
  return products.find((product) => product.slug === slug);
}

function escapeInvoiceText(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] || character);
}

function orderLineItems(order: OrderRow, products: Product[]) {
  if (order.items?.length) {
    return order.items.map((item) => {
      const product = productForOrderItem(products, item.slug);
      const unitPrice = product?.price ?? Math.round((order.subtotal || order.total) / Math.max(1, order.items?.reduce((sum, row) => sum + row.qty, 0) || 1));
      return {
        name: product?.name || item.slug,
        variant: product ? [product.color, product.material].filter(Boolean).join(" | ") : "",
        qty: item.qty,
        unitPrice,
        total: unitPrice * item.qty,
      };
    });
  }
  return [{ name: order.product, variant: "", qty: 1, unitPrice: order.subtotal || order.total, total: order.subtotal || order.total }];
}

function downloadInvoice(order: OrderRow, products: Product[]) {
  const address = order.address;
  const items = orderLineItems(order, products);
  const invoiceHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeInvoiceText(order.id)} - Gulabi Threads</title>
  <style>
    body { margin: 0; padding: 40px; color: #2b2525; font-family: Arial, sans-serif; background: #fffaf8; }
    .invoice { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #eadada; padding: 34px; }
    h1, h2 { margin: 0; color: #8b5a60; font-family: Georgia, serif; }
    h1 { font-size: 34px; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #eadada; padding-bottom: 22px; }
    .meta { text-align: right; line-height: 1.7; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 26px 0; }
    .box { border: 1px solid #eadada; padding: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { padding: 12px; border-bottom: 1px solid #eadada; text-align: left; }
    th { color: #7b5455; text-transform: uppercase; font-size: 12px; letter-spacing: .08em; }
    .num { text-align: right; }
    .totals { margin-left: auto; width: min(320px, 100%); margin-top: 22px; }
    .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
    .total { border-top: 1px solid #2b2525; font-weight: 700; font-size: 18px; }
    @media print { body { background: #fff; padding: 0; } .invoice { border: 0; } }
  </style>
</head>
<body>
  <main class="invoice">
    <section class="top">
      <div>
        <h1>Gulabi Threads</h1>
        <p>Crafted with love</p>
      </div>
      <div class="meta">
        <strong>Invoice</strong><br />
        Order: ${escapeInvoiceText(order.id)}<br />
        Date: ${escapeInvoiceText(order.date)}<br />
        Status: ${escapeInvoiceText(order.status)}
      </div>
    </section>
    <section class="grid">
      <div class="box">
        <h2>Bill To</h2>
        <p>${escapeInvoiceText(address?.full_name || order.customer)}<br />${escapeInvoiceText(order.customer_email || address?.email || "")}<br />${escapeInvoiceText(order.customer_phone || address?.phone || "")}</p>
      </div>
      <div class="box">
        <h2>Ship To</h2>
        <p>${address ? `${escapeInvoiceText(address.address)}<br />${escapeInvoiceText(address.address_line2 || "")}${address.address_line2 ? "<br />" : ""}${escapeInvoiceText([address.city, address.state, address.pincode].filter(Boolean).join(", "))}<br />${escapeInvoiceText(address.country || "India")}` : "No delivery address recorded"}</p>
      </div>
    </section>
    <table>
      <thead><tr><th>Item</th><th>Variant</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${items.map((item) => `<tr><td>${escapeInvoiceText(item.name)}</td><td>${escapeInvoiceText(item.variant || "-")}</td><td class="num">${item.qty}</td><td class="num">${money(item.unitPrice)}</td><td class="num">${money(item.total)}</td></tr>`).join("")}</tbody>
    </table>
    <section class="totals">
      <div><span>Subtotal</span><span>${money(order.subtotal || items.reduce((sum, item) => sum + item.total, 0))}</span></div>
      <div><span>Shipping</span><span>${money(order.shipping_cost || 0)}</span></div>
      <div><span>Tax</span><span>${money(order.tax || 0)}</span></div>
      <div class="total"><span>Total</span><span>${money(order.total)}</span></div>
    </section>
    <p>Payment: ${escapeInvoiceText(order.payment_method || "Not recorded")}<br />Shipping method: ${escapeInvoiceText(order.shipping_method || "Not recorded")}</p>
  </main>
</body>
</html>`;
  const blob = new Blob([invoiceHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gulabi-threads-invoice-${order.id}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function OrderDetailRow({ order, products }: { order: OrderRow; products: Product[] }) {
  const address = order.address;
  const lines = orderLineItems(order, products);
  return (
    <tr className="order-detail-row">
      <td colSpan={5}>
        <div className="order-detail-actions">
          <strong>Order Details</strong>
          <button type="button" className="secondary-button" onClick={() => downloadInvoice(order, products)}><Download size={16} /> Download Invoice</button>
        </div>
        <div className="order-detail-grid">
          <section>
            <h3>Delivery</h3>
            {address ? (
              <p>{address.full_name}<br />{address.phone}<br />{address.email || order.customer_email || ""}<br />{address.address}{address.address_line2 ? `, ${address.address_line2}` : ""}, {address.city}, {address.state} {address.pincode}</p>
            ) : (
              <p>No delivery address stored for this legacy order.</p>
            )}
          </section>
          <section>
            <h3>Payment</h3>
            <p>{order.payment_method || "Not recorded"}<br />{order.shipping_method || "Shipping method not recorded"}</p>
          </section>
          <section>
            <h3>Items</h3>
            <ul>{lines.map((item) => <li key={`${item.name}-${item.qty}`}>{item.name} x {item.qty} - {money(item.total)}</li>)}</ul>
          </section>
          <section>
            <h3>Totals</h3>
            <p>Subtotal: {money(order.subtotal || order.total)}<br />Tax: {money(order.tax || 0)}<br />Shipping: {money(order.shipping_cost || 0)}<br /><strong>Total: {money(order.total)}</strong></p>
          </section>
        </div>
      </td>
    </tr>
  );
}

function Status({ status }: { status: OrderStatus }) {
  return <span className={`status ${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>;
}
