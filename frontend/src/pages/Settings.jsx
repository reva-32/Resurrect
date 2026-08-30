import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { getSettingsStatus } from "../api/client";
import { useAuth } from "../context/AuthContext";

function StatusRow({ ok, label, hint }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-black/5 last:border-0">
      {ok ? (
        <CheckCircle2 size={18} className="text-recovered flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle size={18} className="text-risk flex-shrink-0 mt-0.5" />
      )}
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-ink/50 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSettingsStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-black/5 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/dashboard" className="text-ink/50 hover:text-ink">
            <ArrowLeft size={18} />
          </Link>
          <div className="font-display font-bold">Business settings</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-black/5 shadow-soft p-6">
          <div className="text-xs uppercase tracking-wide text-black/50 font-medium mb-4">Business profile</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-ink/40 text-xs mb-1">Business name</div>
              <div className="font-medium">{user?.businessName}</div>
            </div>
            <div>
              <div className="text-ink/40 text-xs mb-1">Contact</div>
              <div className="font-medium">{user?.name}</div>
            </div>
            <div>
              <div className="text-ink/40 text-xs mb-1">Email</div>
              <div className="font-medium">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/5 shadow-soft p-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-accent" />
            <div className="text-xs uppercase tracking-wide text-black/50 font-medium">Getting started / integration status</div>
          </div>
          <p className="text-xs text-ink/40 mb-2">
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
            <div className="text-sm text-ink/40 py-4">Couldn't load status — is the backend running?</div>
          )}
        </div>
      </main>
    </div>
  );
}
