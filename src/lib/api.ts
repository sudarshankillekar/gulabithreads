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

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type RequestOptions = { retries?: number; timeoutMs?: number };

function waitForRetry(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export async function apiRequest<T>(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const token = authTokenFor(normalizedPath);
  const headers = new Headers(init?.headers);
  // Bodyless GETs do not need a JSON content type (or its CORS preflight).
  if (init?.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  // Only explicitly opted-in reads may retry; never replay a payment or mutation.
  const retries = (init?.method || "GET").toUpperCase() === "GET" ? options.retries || 0 : 0;
  for (let attempt = 0; ; attempt++) {
    if (init?.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
    try {
      const response = await fetch(`${API_BASE}${normalizedPath}`, { ...init, headers, signal: controller.signal });
      if (!response.ok) {
        const message = await response.text();
        let parsed: { detail?: string; message?: string } | null = null;
        try { parsed = JSON.parse(message); } catch { /* Keep non-JSON server errors. */ }
        throw new ApiError(parsed?.detail || parsed?.message || message || `Request failed: ${response.status}`, response.status);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      const transient = error instanceof ApiError
        ? [408, 429, 500, 502, 503, 504].includes(error.status)
        : error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
      if (init?.signal?.aborted || !transient || attempt >= retries) throw error;
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", onAbort);
    }
    await waitForRetry(Math.min(1000 * 2 ** attempt, 4000), init?.signal);
  }
}
