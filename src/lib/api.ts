function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");
  if (/^https?:\/\//.test(configured) && !configured.endsWith("/api")) return `${configured}/api`;
  return configured || "/api";
}

const API_BASE = resolveApiBase();

function storedToken(key: string) {
  try {
    const session = JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || "null") as { token?: string } | null;
    return session?.token || "";
  } catch {
    return "";
  }
}

function authTokenFor(path: string) {
  const customerToken = storedToken("gt-customer-session");
  const adminToken = storedToken("gt-admin-session");
  if (path.startsWith("/account") || path.startsWith("/customer")) return customerToken;
  return adminToken || customerToken;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const token = authTokenFor(path);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${API_BASE}${normalizedPath}`, {
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    let parsed: { detail?: string; message?: string } | null = null;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = null;
    }
    throw new Error(parsed?.detail || parsed?.message || message || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
