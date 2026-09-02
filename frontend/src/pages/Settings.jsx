import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, ShieldCheck, RefreshCw } from "lucide-react";
import { getSettingsStatus, seedData } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "../components/ThemeToggle";

function StatusRow({ ok, label, hint }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-black/5 dark:border-white/10 last:border-0">
      {ok ? (
        <CheckCircle2 size={18} className="text-recovered flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle size={18} className="text-risk flex-shrink-0 mt-0.5" />
      )}
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-ink/50 dark:text-white/50 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [demoPhone, setDemoPhone] = useState("");
  const [demoName, setDemoName] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");

  useEffect(() => {
    getSettingsStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  async function handleReseed(e) {
    e.preventDefault();
    setSeeding(true);
    setSeedMessage("");
    try {
      const payload = {};
      if (demoPhone) payload.demoPhone = demoPhone;
      if (demoName) payload.demoName = demoName;
      const result = await seedData(payload);
      setSeedMessage(
        `Loaded ${result.syntheticCount} sample payments${result.demoCreated ? " + your live demo customer" : ""}.`
      );
      getSettingsStatus().then(setStatus).catch(() => {});
    } catch {
      setSeedMessage("Couldn't reload sample data — is the backend running?");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white">
      <header className="border-b border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#0B0D12]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-ink/50 hover:text-ink dark:text-white/50 dark:hover:text-white">
              <ArrowLeft size={18} />
            </Link>
            <div className="font-display font-bold">Business settings</div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-6">
          <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-4">Business profile</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-ink/40 dark:text-white/40 text-xs mb-1">Business name</div>
              <div className="font-medium">{user?.businessName}</div>
            </div>
            <div>
              <div className="text-ink/40 dark:text-white/40 text-xs mb-1">Contact</div>
              <div className="font-medium">{user?.name}</div>
            </div>
            <div>
              <div className="text-ink/40 dark:text-white/40 text-xs mb-1">Email</div>
              <div className="font-medium">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-6">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw size={16} className="text-accent" />
            <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium">Sample data</div>
          </div>
          <p className="text-xs text-ink/40 dark:text-white/40 mb-4">
            Reloads your synthetic failed-payment dataset. Only affects your own account — never another merchant's
            data. Set a phone number here to (re)create the one real demo customer used for the live Razorpay flow.
          </p>
          <form onSubmit={handleReseed} className="grid grid-cols-2 gap-3 mb-3">
            <input
              placeholder="Demo customer name (optional)"
              value={demoName}
              onChange={(e) => setDemoName(e.target.value)}
              className="border border-black/10 dark:border-white/15 bg-white dark:bg-panel2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              placeholder="Demo phone, e.g. +91XXXXXXXXXX (optional)"
              value={demoPhone}
              onChange={(e) => setDemoPhone(e.target.value)}
              className="border border-black/10 dark:border-white/15 bg-white dark:bg-panel2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <button
              type="submit"
              disabled={seeding}
              className="col-span-2 bg-ink dark:bg-white text-white dark:text-ink rounded-lg py-2 text-sm font-medium hover:bg-ink/90 dark:hover:bg-white/90 disabled:opacity-50"
            >
              {seeding ? "Reloading…" : "Reload sample data"}
            </button>
          </form>
          {seedMessage && <div className="text-xs text-ink/50 dark:text-white/50">{seedMessage}</div>}
        </div>

        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-accent" />
            <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium">Getting started / integration status</div>
          </div>
          <p className="text-xs text-ink/40 dark:text-white/40 mb-2">
            These are read from your backend's environment configuration — never editable here, since secrets should
            only ever live in <code>backend/.env</code>, not travel through the browser.
          </p>
          {status ? (
            <div>
              <StatusRow
                ok={status.razorpayConfigured}
                label="Razorpay test-mode keys configured"
                hint={!status.razorpayConfigured ? "Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in backend/.env" : "Ready for real Payment Link creation"}
              />
              <StatusRow
                ok={status.webhookConfigured}
                label="Razorpay webhook secret configured"
                hint={!status.webhookConfigured ? "Set RAZORPAY_WEBHOOK_SECRET after registering your webhook URL" : "Webhook signature verification is active"}
              />
              <StatusRow
                ok={status.geminiConfigured}
                label="AI (Gemini) configured"
                hint={!status.geminiConfigured ? "Set GEMINI_API_KEY — until then, all decisions fall back to the rule engine" : "AI decisioning is live"}
              />
              <StatusRow
                ok={status.demoCustomerConfigured}
                label="Live demo customer configured"
                hint={
                  status.demoCustomerConfigured
                    ? "DEMO_PHONE is set — re-run the seed script any time to (re)create this customer"
                    : "Set DEMO_PHONE / DEMO_NAME in backend/.env, then run npm run seed"
                }
              />
              <StatusRow
                ok={!status.smsMockMode}
                label={status.smsMockMode ? "SMS is in mock mode" : "Real SMS sending is active"}
                hint={
                  status.smsMockMode
                    ? "Messages are logged and shown in-app instead of actually sent — fine for a demo, flip SMS_MOCK_MODE=false once a provider + DLT template is approved"
                    : `Provider: ${status.smsProvider}`
                }
              />
            </div>
          ) : (
            <div className="text-sm text-ink/40 dark:text-white/40 py-4">Couldn't load status — is the backend running?</div>
          )}
        </div>
      </main>
    </div>
  );
}
