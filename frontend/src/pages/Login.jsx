import React, { useState } from "react";
import "../index.css";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="font-display font-extrabold text-lg tracking-tight block text-center mb-8">
          <span className="text-accent">Resurrect</span>
        </Link>
        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-8">
          <h1 className="font-display text-xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-ink/50 dark:text-white/50 mb-6">Log in to your merchant dashboard.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink/60 dark:text-white/60 block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-black/10 dark:border-white/15 bg-white dark:bg-panel2 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder="you@business.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/60 dark:text-white/60 block mb-1.5">Password</label>
              <input
                type="password"
                minLength={8}
                pattern="^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-black/10 dark:border-white/15 bg-white dark:bg-panel2 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder="••••••••"
              />
            </div>

            {error && <div className="text-sm text-risk bg-risk/5 border border-risk/20 rounded-lg px-3 py-2">{error}</div>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-ink dark:bg-white text-white dark:text-ink rounded-xl py-2.5 text-sm font-medium hover:bg-ink/90 dark:hover:bg-white/90 transition disabled:opacity-50"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-ink/50 dark:text-white/50 mt-6">
          Don't have an account?{" "}
          <Link to="/signup" className="text-accent font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
