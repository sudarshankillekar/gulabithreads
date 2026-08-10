export type Category = string;

export type CategoryRecord = {
  name: string;
  slug: string;
  description: string;
  image: string;
  parent_slug?: string | null;
  display_order: number;
  active: boolean;
  archived: boolean;
  seo_title: string;
  seo_description: string;
  product_count: number;
};

export type Product = {
  slug: string;
  name: string;
  price: number;
  discount_percent?: number;
  category: Category;
  color: string;
  material: string;
  rating: number;
  stock: number;
  badge?: string;
  image: string;
  gallery: string[];
  description: string;
};

export type ProductInput = Omit<Product, "gallery"> & { gallery?: string[] };
export type CartItem = { slug: string; qty: number };
export type CheckoutStep = "identity" | "customer" | "address" | "payment" | "confirmation";
export type OrderStatus = "Processing" | "In Transit" | "Shipped" | "Delivered" | "Pending" | "Approved" | "Inactive" | "Archived" | "Cancelled";
export type OrderRow = {
  id: string;
  customer: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  product: string;
  total: number;
  status: OrderStatus;
  date: string;
  items?: CartItem[];
  subtotal?: number;
  tax?: number;
  shipping_cost?: number;
  shipping_method?: string;
  address?: AddressPayload | null;
  payment_method?: string | null;
  line_items?: CheckoutLineItem[];
  discount?: number;
  coupon_code?: string;
  estimated_delivery_date?: string | null;
  tracking_token?: string | null;
};
export type AuthSession = { name: string; email: string; phone?: string; provider?: "email" | "google"; token?: string };
export type CustomerAccount = AuthSession & { password?: string; createdAt: string };

export type CustomerRecord = {
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  status: string;
  order_count: number;
  lifetime_spend: number;
  last_order_id?: string | null;
  last_order_date?: string | null;
};

export type AddressPayload = {
  full_name: string;
  phone: string;
  email?: string;
  address: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  delivery_instructions?: string;
};

export type CheckoutLineItem = {
  slug: string;
  name: string;
  image: string;
  variant: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type CheckoutPrice = {
  items: CheckoutLineItem[];
  subtotal: number;
  discount: number;
  coupon_code: string;
  shipping_cost: number;
  tax: number;
  total: number;
  estimated_delivery_date: string;
};

export type StoreProps = {
  products: Product[];
  orders: OrderRow[];
  categories: string[];
  cartCount: number;
  wishlist: string[];
  addCart: (slug: string) => void;
  toggleWish: (slug: string) => void;
  onOrderPlaced?: (order: OrderRow) => void;
  isCustomerAuthed: boolean;
};

export type CartProps = StoreProps & {
  cart: CartItem[];
  cartProducts: { item: CartItem; product: Product }[];
  subtotal: number;
  updateQty: (slug: string, qty: number) => void;
  customerSession?: AuthSession | null;
  customerAccounts?: CustomerAccount[];
  onCustomerLogin?: (session: AuthSession, password?: string, remember?: boolean) => void | Promise<void>;
  onCreateCustomer?: (account: CustomerAccount) => void | Promise<void>;
};
