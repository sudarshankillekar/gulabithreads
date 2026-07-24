import { FormEvent, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { heroImg, productImg } from "../data/catalog";
import { navigate } from "../lib/navigation";
import type { AuthSession, CustomerAccount } from "../types";

export function LoginPage({
  mode,
  onLogin,
  customerAccounts = [],
  onCreateCustomer,
  adminConfigured = true,
  onCreateAdmin,
}: {
  mode: "customer" | "admin";
  onLogin: (session: AuthSession, password?: string) => void | Promise<void>;
  customerAccounts?: CustomerAccount[];
  onCreateCustomer?: (account: CustomerAccount) => void | Promise<void>;
  adminConfigured?: boolean;
  onCreateAdmin?: (payload: { name: string; email: string; password: string }) => void | Promise<void>;
}) {
  const isAdmin = mode === "admin";
  const [authMode, setAuthMode] = useState<"login" | "create">("login");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") || "").trim().toLowerCase();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || (isAdmin ? "Admin" : "Gulabi Member")).trim();
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
        if (!adminConfigured) {
          await onCreateAdmin?.({ name, email, password });
        } else {
          await onLogin({ email, name, provider: "email" }, password);
        }
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : "Admin authentication failed.");
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
        setError(exc instanceof Error ? exc.message : "Account creation failed.");
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
      await onLogin({ name: "Gulabi Member", email: identifier, provider: "email" }, password);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Invalid customer login.");
    } finally {
      setSaving(false);
    }
  };

  const googleLogin = () => {
    setError("Google sign-in needs a real OAuth provider before production use.");
  };

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
        <h2>{isAdmin ? (adminConfigured ? "Admin Sign In" : "Create Admin Password") : authMode === "create" ? "Create Account" : "Sign In"}</h2>
        {!isAdmin && <div className="auth-toggle"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setError(""); }}>Login</button><button type="button" className={authMode === "create" ? "active" : ""} onClick={() => { setAuthMode("create"); setError(""); }}>Create Account</button></div>}
        {!isAdmin && <button type="button" className="google-button" onClick={googleLogin}><span>G</span> Continue with Google</button>}
        {!isAdmin && <div className="auth-divider"><span>or</span></div>}
        {!isAdmin && authMode === "create" && <label>Name<input name="name" required placeholder="Arjun Mehta" /></label>}
        {isAdmin && !adminConfigured && <label>Admin Name<input name="name" required placeholder="Priya Sharma" /></label>}
        {isAdmin ? <label>Email<input name="email" type="email" required placeholder="admin@gulabithreads.com" /></label> : authMode === "create" ? <label>Email Address<input name="email" type="email" required placeholder="you@example.com" /></label> : <label>Email Address or Phone Number<input name="identifier" required placeholder="you@example.com or 9876543210" /></label>}
        {!isAdmin && authMode === "create" && <label>Phone Number<input name="phone" required type="tel" placeholder="9876543210" /></label>}
        <label>Password<input name="password" type="password" required placeholder={isAdmin ? "At least 6 characters" : authMode === "create" ? "Create a password" : "Your password"} /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button full" disabled={saving}>{saving ? "Please Wait..." : isAdmin ? (adminConfigured ? "Enter Admin Panel" : "Create Admin Password") : authMode === "create" ? "Create Account" : "Login"}</button>
        <button type="button" className="auth-link" onClick={() => navigate(isAdmin ? "/login" : "/admin/login")}>{isAdmin ? "Customer login" : "Admin login"}</button>
      </form>
    </div>
  );
}

export function LogoutPage({ onLogout }: { onLogout: () => void }) {
  useEffect(() => {
    onLogout();
    localStorage.removeItem("gt-customer-session");
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
