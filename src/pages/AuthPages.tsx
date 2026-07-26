import { FormEvent, useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { heroImg, productImg } from "../data/catalog";
import { navigate } from "../lib/navigation";
import type { AuthSession, CustomerAccount } from "../types";

type AuthMode = "login" | "create" | "forgot" | "reset";

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-gt-google]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google sign-in could not load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.gtGoogle = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in could not load"));
    document.body.appendChild(script);
  });
}

function GoogleSignInButton({ onCredential, onError }: { onCredential: (credential: string) => void | Promise<void>; onError: (message: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let mounted = true;
    loadGoogleIdentity()
      .then(() => {
        if (!mounted || !buttonRef.current || !window.google?.accounts?.id) return;
        buttonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) void onCredential(response.credential);
            else onError("Google did not return a valid sign-in response.");
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(360, buttonRef.current.offsetWidth || 320),
        });
      })
      .catch((error) => onError(error instanceof Error ? error.message : "Google sign-in could not load."));
    return () => {
      mounted = false;
    };
  }, [clientId, onCredential, onError]);

  if (!clientId) {
    return (
      <button type="button" className="google-button" onClick={() => onError("Google sign-in is not configured yet.")}>
        <span>G</span> Continue with Google
      </button>
    );
  }
  return <div className="google-rendered-button" ref={buttonRef} aria-label="Continue with Google" />;
}

function friendlyAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("Failed to fetch")) return "We could not reach the server. Please check your internet connection and try again.";
  if (message.includes("Incorrect password")) return "Incorrect password. Please try again or reset your password.";
  if (message.includes("could not find")) return "We could not find an account with those details. You can create one in a few seconds.";
  if (message.includes("already exists")) return message;
  if (message.includes("Google")) return message;
  return message || fallback;
}

export function LoginPage({
  mode,
  onLogin,
  customerAccounts = [],
  onCreateCustomer,
  onGoogleLogin,
  onForgotPassword,
  onResetPassword,
  adminConfigured = true,
  onCreateAdmin,
}: {
  mode: "customer" | "admin";
  onLogin: (session: AuthSession, password?: string, remember?: boolean) => void | Promise<void>;
  customerAccounts?: CustomerAccount[];
  onCreateCustomer?: (account: CustomerAccount) => void | Promise<void>;
  onGoogleLogin?: (credential: string) => void | Promise<void>;
  onForgotPassword?: (identifier: string) => void | Promise<void>;
  onResetPassword?: (token: string, password: string) => void | Promise<void>;
  adminConfigured?: boolean;
  onCreateAdmin?: (payload: { name: string; email: string; password: string }) => void | Promise<void>;
}) {
  const isAdmin = mode === "admin";
  const resetToken = new URLSearchParams(window.location.search).get("token") || "";
  const [authMode, setAuthMode] = useState<AuthMode>(resetToken && !isAdmin ? "reset" : "login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setError("");
    setMessage("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") || "").trim().toLowerCase();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirm_password") || "");
    const name = String(form.get("name") || (isAdmin ? "Admin" : "Gulabi Member")).trim();
    const remember = form.get("remember") !== null;

    if (isAdmin) {
      if (!email || !password || (!adminConfigured && !name)) {
        setError(adminConfigured ? "Please enter email and password." : "Enter name, email, and a new admin password.");
        return;
      }
      if (password.length < 6) {
        setError("Admin password must be at least 6 characters.");
        return;
      }
      setSaving(true);
      setError("");
      try {
        if (!adminConfigured) await onCreateAdmin?.({ name, email, password });
        else await onLogin({ email, name, provider: "email" }, password, true);
      } catch (exc) {
        setError(friendlyAuthError(exc, "Admin authentication failed."));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (authMode === "forgot") {
      if (!identifier) {
        setError("Enter your email or phone number to receive a reset link.");
        return;
      }
      setSaving(true);
      setError("");
      try {
        await onForgotPassword?.(identifier);
        setMessage("If an account exists with these details, a password reset link has been sent.");
      } catch (exc) {
        setError(friendlyAuthError(exc, "Could not send reset instructions."));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (authMode === "reset") {
      if (!resetToken) {
        setError("This reset link is missing a token. Please request a new link.");
        return;
      }
      if (password.length < 6 || password !== confirmPassword) {
        setError("Password must be at least 6 characters and match confirmation.");
        return;
      }
      setSaving(true);
      setError("");
      try {
        await onResetPassword?.(resetToken, password);
        setMessage("Password updated. Signing you in now.");
      } catch (exc) {
        setError(friendlyAuthError(exc, "Could not reset password."));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (authMode === "create") {
      if (!onCreateCustomer) return;
      if (!name || !email || !phone || password.length < 6) {
        setError("Enter name, email, phone number, and a 6 character password.");
        return;
      }
      setSaving(true);
      setError("");
      try {
        await onCreateCustomer({ name, email, phone, password, provider: "email", createdAt: new Date().toISOString() });
      } catch (exc) {
        setError(friendlyAuthError(exc, "Account creation failed."));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!identifier || !password) {
      setError("Enter your email or phone number and password.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onLogin({ name: "Gulabi Member", email: identifier, provider: "email" }, password, remember);
    } catch (exc) {
      setError(friendlyAuthError(exc, "We could not sign you in. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const googleLogin = async (credential: string) => {
    if (!onGoogleLogin) return;
    setSaving(true);
    setError("");
    try {
      await onGoogleLogin(credential);
    } catch (exc) {
      setError(friendlyAuthError(exc, "Google sign-in failed. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const title = isAdmin ? (adminConfigured ? "Admin Sign In" : "Create Admin Password") : authMode === "create" ? "Create Account" : authMode === "forgot" ? "Reset Password" : authMode === "reset" ? "Create New Password" : "Sign In";
  const buttonText = saving ? "Please Wait..." : isAdmin ? (adminConfigured ? "Enter Admin Panel" : "Create Admin Password") : authMode === "create" ? "Create Account" : authMode === "forgot" ? "Send Reset Link" : authMode === "reset" ? "Update Password" : "Login";

  return (
    <div className="auth-page">
      <button className="auth-brand" onClick={() => navigate("/")}>Gulabi Threads</button>
      <section className="auth-visual">
        <img src={isAdmin ? productImg : heroImg} alt={isAdmin ? "Admin product management workspace" : "Gulabi Threads customer login"} />
        <div>
          <span className="eyebrow">{isAdmin ? "Admin Panel" : "Luxury Member Access"}</span>
          <h1>{isAdmin ? "Manage the Atelier" : "Welcome Back"}</h1>
          <p>{isAdmin ? (adminConfigured ? "Track products, inventory, and boutique orders from one focused workspace." : "Create the first backend-backed admin password for this boutique workspace.") : "Sign in to view orders, saved pieces, addresses, and your Gulabi Threads curation."}</p>
        </div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">{isAdmin ? "Secure Admin Login" : "Customer Login"}</span>
        <h2>{title}</h2>
        {!isAdmin && authMode !== "forgot" && authMode !== "reset" && (
          <div className="auth-toggle">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Login</button>
            <button type="button" className={authMode === "create" ? "active" : ""} onClick={() => switchMode("create")}>Create Account</button>
          </div>
        )}
        {!isAdmin && authMode === "login" && (
          <>
            <GoogleSignInButton onCredential={googleLogin} onError={setError} />
            <div className="auth-divider"><span>or</span></div>
          </>
        )}
        {!isAdmin && authMode === "create" && <label>Name<input name="name" required placeholder="Arjun Mehta" /></label>}
        {isAdmin && !adminConfigured && <label>Admin Name<input name="name" required placeholder="Priya Sharma" /></label>}
        {isAdmin ? (
          <label>Email<input name="email" type="email" required placeholder="admin@gulabithreads.com" /></label>
        ) : authMode === "create" ? (
          <label>Email Address<input name="email" type="email" required placeholder="you@example.com" /></label>
        ) : authMode === "reset" ? null : (
          <label>Email Address or Phone Number<input name="identifier" required placeholder="you@example.com or 9876543210" /></label>
        )}
        {!isAdmin && authMode === "create" && <label>Phone Number<input name="phone" required type="tel" placeholder="9876543210" /></label>}
        {authMode !== "forgot" && <label>Password<input name="password" type="password" required placeholder={isAdmin ? "At least 6 characters" : authMode === "create" ? "Create a password" : authMode === "reset" ? "New password" : "Your password"} /></label>}
        {!isAdmin && authMode === "reset" && <label>Confirm Password<input name="confirm_password" type="password" required placeholder="Confirm new password" /></label>}
        {!isAdmin && authMode === "login" && <label className="remember-row"><input name="remember" type="checkbox" defaultChecked /> Keep me signed in on this device</label>}
        {message && <p className="checkout-note compact">{message}</p>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button full" disabled={saving}>{buttonText}</button>
        {!isAdmin && authMode === "login" && <button type="button" className="auth-link" onClick={() => switchMode("forgot")}>Forgot password?</button>}
        {!isAdmin && authMode !== "login" && <button type="button" className="auth-link" onClick={() => switchMode("login")}>Back to login</button>}
        {!isAdmin && <button type="button" className="auth-link" onClick={() => navigate("/track")}>Track an order without signing in</button>}
        <button type="button" className="auth-link" onClick={() => navigate(isAdmin ? "/login" : "/admin/login")}>{isAdmin ? "Customer login" : "Admin login"}</button>
      </form>
    </div>
  );
}

export function LogoutPage({ onLogout }: { onLogout: () => void }) {
  useEffect(() => {
    onLogout();
    localStorage.removeItem("gt-customer-session");
    sessionStorage.removeItem("gt-customer-session");
    navigate("/?loggedOut=1");
  }, [onLogout]);
  return <div className="empty"><LogOut size={32} /><h2>Logging out</h2><p>Taking you back to the storefront.</p></div>;
}

export function AdminLogoutPage({ onLogout }: { onLogout: () => void }) {
  useEffect(() => {
    onLogout();
    localStorage.removeItem("gt-admin-session");
    navigate("/admin/login?loggedOut=1");
  }, [onLogout]);
  return <div className="empty"><LogOut size={32} /><h2>Logging out</h2><p>Closing the admin session.</p></div>;
}
