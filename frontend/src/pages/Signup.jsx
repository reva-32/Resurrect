import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signup(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="font-display font-extrabold text-lg tracking-tight block text-center mb-8">
          Recovery<span className="text-accent">.ai</span>
        </Link>
        <div className="bg-white rounded-2xl border border-black/5 shadow-soft p-8">
          <h1 className="font-display text-xl font-bold mb-1">Create your account</h1>
          <p className="text-sm text-ink/50 mb-6">Set up your merchant dashboard in a minute.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink/60 block mb-1.5">Business name</label>
              <input
                required
                value={form.businessName}
                onChange={update("businessName")}
                className="w-full border border-black/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder="Acme Retail Pvt Ltd"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/60 block mb-1.5">Your name</label>
              <input
                required
                value={form.name}
                onChange={update("name")}
                className="w-full border border-black/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/60 block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={update("email")}
                className="w-full border border-black/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder="you@business.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/60 block mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={update("password")}
                className="w-full border border-black/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder="At least 6 characters"
              />
            </div>

            {error && <div className="text-sm text-risk bg-risk/5 border border-risk/20 rounded-lg px-3 py-2">{error}</div>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-ink text-white rounded-xl py-2.5 text-sm font-medium hover:bg-ink/90 transition disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-ink/50 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
