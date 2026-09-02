import React, { useEffect, useState, useCallback, useRef } from "react";
import "../index.css";
import { ResponsiveContainer, FunnelChart, Funnel, LabelList, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import {
  LogOut,
  Percent,
  AlertTriangle,
  MessageSquare,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Settings as SettingsIcon,
  Rocket,
  MousePointerClick,
  Sparkles,
  ListChecks,
} from "lucide-react";
import { getMetrics, getPayments, getPayment, runRecoveryBulk, runRecoveryOne, seedData } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "../components/ThemeToggle";

const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n) => `${Math.round((n || 0) * 100)}%`;

// Human, merchant-facing labels for the raw enum values stored in Mongo —
// used anywhere a failure reason or action is shown in the UI.
const FAILURE_REASON_LABELS = {
  bank_timeout: "Bank timeout",
  insufficient_funds: "Insufficient funds",
  checkout_abandoned: "Checkout abandoned",
  card_declined: "Card declined",
  network_error: "Network error",
  otp_failed: "OTP failed",
  unknown: "Unknown reason",
};

const ACTION_LABELS = {
  retry: "Retry payment",
  sms: "SMS with link",
  priority_sms: "Priority SMS",
  stop: "Stopped",
  review: "Flagged for review",
};

// Statuses where a payment is still moving — these are the ones worth
// polling closely so the merchant sees an outcome land without refreshing.
const UNRESOLVED_STATUSES = new Set(["failed", "recovery_in_progress"]);

function StatCard({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "risk" ? "text-risk" : tone === "recovered" ? "text-recovered" : "text-ink dark:text-white";
  const bgClass =
    tone === "risk" ? "bg-risk/10" : tone === "recovered" ? "bg-recovered/10" : "bg-accent/10";
  return (
    <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-5">
      <div className={`w-9 h-9 rounded-xl ${bgClass} ${toneClass} flex items-center justify-center mb-3`}>
        <Icon size={16} />
      </div>
      <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-1">{label}</div>
      <div className={`text-2xl font-display font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function RecoveryFunnel({ metrics }) {
  const stages = [
    { name: "Failed payments", value: metrics.totalFailedPayments, fill: "#C24444" },
    { name: "Recovery actions", value: metrics.retryAttemptsCount + metrics.smsSentCount, fill: "#6C4FD9" },
    { name: "Successful", value: metrics.successfulRecoveries, fill: "#2F7A4F" },
  ].filter((s) => s.value >= 0);

  return (
    <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-6">
      <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-2">
        Recovery funnel
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Tooltip formatter={(v) => [v, "count"]} />
            <Funnel dataKey="value" data={stages} isAnimationActive>
              <LabelList position="right" dataKey="name" className="fill-ink dark:fill-white" stroke="none" fontSize={12} />
              <LabelList position="center" dataKey="value" fill="#fff" stroke="none" fontSize={13} fontWeight={700} />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaymentRow({ payment, onSelect }) {
  const statusStyle = {
    failed: "bg-risk/10 text-risk",
    recovery_in_progress: "bg-gold/15 text-gold",
    recovered: "bg-recovered/10 text-recovered",
    stopped: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
  }[payment.status];

  return (
    <tr
      className="border-b border-black/5 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/5 cursor-pointer"
      onClick={() => onSelect(payment._id)}
    >
      <td className="py-3 px-4 font-medium">{payment.customer?.name || "—"}</td>
      <td className="py-3 px-4">{rupees(payment.amount)}</td>
      <td className="py-3 px-4 text-black/60 dark:text-white/60">
        {FAILURE_REASON_LABELS[payment.failureReason] || payment.failureReason}
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusStyle}`}>
          {payment.status.replaceAll("_", " ")}
        </span>
      </td>
      <td className="py-3 px-4 text-black/40 dark:text-white/30 text-sm">
        {payment.customer?.isDemoCustomer ? "🟢 live demo" : "synthetic"}
      </td>
    </tr>
  );
}

function ReasoningPanel({ decision }) {
  if (!decision) return null;
  const decidedByAI = decision.model && decision.model !== "rules-fallback";

  return (
    <div className="mb-5 bg-accent2/5 border border-accent2/20 dark:border-accent2/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-accent2" />
        <div className="text-xs uppercase tracking-wide text-accent2 font-medium">
          Why {decidedByAI ? "the AI" : "the system"} chose this
        </div>
      </div>
      <div className="text-sm text-ink dark:text-white/90 leading-relaxed mb-3">{decision.reasoning}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-ink/5 dark:bg-white/10 font-medium">
          Recommended: {ACTION_LABELS[decision.recommendedAction] || decision.recommendedAction}
        </span>
        {decision.wasOverridden && (
          <span className="px-2 py-1 rounded-full bg-gold/15 text-gold font-medium">
            Overridden by safety policy → {ACTION_LABELS[decision.finalAction] || decision.finalAction}
            {decision.overrideReason ? ` (${decision.overrideReason.replaceAll("_", " ")})` : ""}
          </span>
        )}
        <span className="px-2 py-1 rounded-full bg-ink/5 dark:bg-white/10 text-black/50 dark:text-white/50">
          {decidedByAI ? `Decided by AI (${decision.model})` : "Decided by rule engine"}
        </span>
      </div>
    </div>
  );
}

function PaymentDetail({ paymentId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const res = await getPayment(paymentId);
    setData(res);
    return res;
  }, [paymentId]);

  // The modal previously only loaded once on open, so a payment recovered by
  // a real Razorpay webhook while the modal was open (exactly what happens
  // mid-demo) never visibly updated until it was closed and reopened. Poll
  // while the status is still unresolved, same as the dashboard table does,
  // and stop once it lands on a terminal state.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const res = await load();
      if (cancelled) return;
      if (!UNRESOLVED_STATUSES.has(res.payment.status) && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }

    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [load]);

  // Whenever the payment's status flips while the modal is open (e.g. the
  // webhook lands), let the parent table/metrics refresh too so they don't
  // stay stuck on "recovery in progress" until the merchant closes the modal.
  const lastStatusRef = useRef(null);
  useEffect(() => {
    if (!data) return;
    const status = data.payment.status;
    if (lastStatusRef.current && lastStatusRef.current !== status) {
      onChanged?.();
    }
    lastStatusRef.current = status;
  }, [data, onChanged]);

  if (!data) return null;
  const { payment, auditTrail, smsMessages = [], latestDecision } = data;
  const isDemo = payment.customer?.isDemoCustomer;

  async function handleRunRecovery(createRealLink) {
    setBusy(true);
    try {
      await runRecoveryOne(payment._id, { useAI: true, createRealLink });
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const eventIcon = {
    payment_failed: XCircle,
    action_approved: CheckCircle2,
    action_rejected: AlertTriangle,
    sms_sent: MessageSquare,
    link_opened: MousePointerClick,
    retry_attempted: RotateCcw,
    payment_recovered: CheckCircle2,
    recovery_stopped: XCircle,
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-panel rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-lg font-display font-bold">{payment.customer?.name}</div>
            <div className="text-2xl font-display font-bold text-accent">{rupees(payment.amount)}</div>
          </div>
          <button className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="text-sm text-black/60 dark:text-white/60 mb-4">
          Failure: {FAILURE_REASON_LABELS[payment.failureReason] || payment.failureReason} · Retries:{" "}
          {payment.retryCount} · Status: {payment.status.replaceAll("_", " ")}
        </div>

        <ReasoningPanel decision={latestDecision} />

        {payment.status === "failed" && (
          <div className="flex gap-2 mb-5 flex-wrap">
            <button
              disabled={busy}
              onClick={() => handleRunRecovery(false)}
              className="text-sm px-3 py-2 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 font-medium disabled:opacity-50"
            >
              Run recovery (mock link)
            </button>
            {isDemo && (
              <button
                disabled={busy}
                onClick={() => handleRunRecovery(true)}
                className="text-sm px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 font-medium disabled:opacity-50"
              >
                Run recovery (real Razorpay link → SMS)
              </button>
            )}
          </div>
        )}

        {payment.status === "recovery_in_progress" && (
          <div className="flex items-center gap-2 text-xs text-gold mb-5 bg-gold/10 rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            Waiting for the customer to complete payment — this updates automatically, no need to refresh.
          </div>
        )}

        {payment.razorpay?.paymentLinkUrl && payment.status !== "recovered" && (
          <div className="mb-5 bg-accent/5 border border-accent/20 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-accent font-medium mb-2">
              Real Razorpay payment link — open this to pay and clear the payment
            </div>
            <a
              href={payment.razorpay.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent hover:underline break-all"
            >
              {payment.razorpay.paymentLinkUrl}
            </a>
          </div>
        )}

        {payment.recoveryLink && (
          <div className="mb-5 bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-2">
              Customer view — this is exactly what the customer sees, opens in the public customer payment page
            </div>
            <a
              href={payment.recoveryLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent hover:underline break-all"
            >
              {payment.recoveryLink}
            </a>
          </div>
        )}

        {smsMessages.length > 0 && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-2">
              SMS {smsMessages[0].mode === "mock" ? "(mock — logged only)" : "(Razorpay notification)"}
            </div>
            {smsMessages.map((sms) => (
              <div key={sms._id} className="bg-black/[0.03] dark:bg-white/5 rounded-xl p-3 text-sm mb-2">
                <div>{sms.message}</div>
                <div className="text-black/30 dark:text-white/30 text-xs mt-1">
                  {new Date(sms.sentAt || sms.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-3">
          <ListChecks size={13} /> Audit trail
        </div>
        <div className="space-y-3">
          {auditTrail.map((a) => {
            const Icon = eventIcon[a.event] || CheckCircle2;
            return (
              <div key={a._id} className="flex gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={12} />
                </div>
                <div>
                  <div className="font-medium capitalize">{a.event.replaceAll("_", " ")}</div>
                  <div className="text-black/60 dark:text-white/60">{a.detail}</div>
                  <div className="text-black/30 dark:text-white/30 text-xs">{new Date(a.at).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
          {auditTrail.length === 0 && <div className="text-sm text-black/40 dark:text-white/30">No events yet.</div>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const refresh = useCallback(async () => {
    const [m, p] = await Promise.all([getMetrics(), getPayments(filter || undefined)]);
    setMetrics(m);
    setPayments(p);
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  // Recovery outcomes resolve a few seconds after "Start Recovery" runs (see
  // backend), not instantly — so poll while the dashboard is open, and numbers
  // visibly tick up live during a demo instead of jumping all at once.
  useEffect(() => {
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleStartRecovery() {
    setRunning(true);
    try {
      await runRecoveryBulk(true);
      await refresh();
    } finally {
      setRunning(false);
    }
  }

  async function handleAddData() {
    setSeeding(true);
    try {
      await seedData();
      await refresh();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white">
      <header className="border-b border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#0B0D12]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="font-display font-extrabold text-lg tracking-tight">
            <span className="text-accent">Resurrect</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{user?.businessName}</div>
              <div className="text-xs text-black/40 dark:text-white/40 leading-tight">{user?.email}</div>
            </div>
            <button
              onClick={handleStartRecovery}
              disabled={running}
              className="bg-ink dark:bg-white text-white dark:text-ink px-4 py-2 rounded-xl font-medium text-sm hover:bg-ink/90 dark:hover:bg-white/90 disabled:opacity-50"
            >
              {running ? "Processing…" : "Start Recovery"}
            </button>
            <ThemeToggle />
            <Link to="/settings" className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white p-2" title="Business settings">
              <SettingsIcon size={18} />
            </Link>
            <button onClick={logout} className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white p-2" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {metrics && metrics.totalFailedPayments === 0 && metrics.totalRecovered === 0 && (
          <div className="bg-ink dark:bg-panel text-white rounded-2xl p-6 mb-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Rocket size={18} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold mb-1">No data yet — this account starts fresh</div>
              <div className="text-sm text-white/60 leading-relaxed">
                Every merchant account only ever sees its own data. Load a sample dataset of failed payments to try
                the recovery flow, or check{" "}
                <Link to="/settings" className="underline font-medium">
                  Settings
                </Link>{" "}
                to see what's configured — Razorpay keys, AI, and your live demo customer.
              </div>
            </div>
            <button
              onClick={handleAddData}
              disabled={seeding}
              className="bg-white text-ink px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-white/90 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
            >
              {seeding ? "Adding…" : "Add sample data"}
            </button>
          </div>
        )}

        {metrics && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon={AlertTriangle} label="Revenue at risk" value={rupees(metrics.revenueAtRisk)} tone="risk" />
              <StatCard icon={CheckCircle2} label="Recovered" value={rupees(metrics.totalRecovered)} tone="recovered" />
              <StatCard icon={Percent} label="Recovery rate" value={pct(metrics.recoveryRate)} />
              <StatCard icon={XCircle} label="Failed payments" value={metrics.totalFailedPayments} />
              <StatCard icon={MessageSquare} label="SMS sent" value={metrics.smsSentCount} />
              <StatCard icon={RotateCcw} label="Retries" value={metrics.retryAttemptsCount} />
              <StatCard icon={CheckCircle2} label="Successful recoveries" value={metrics.successfulRecoveries} tone="recovered" />
              <StatCard icon={XCircle} label="Failed recoveries" value={metrics.failedRecoveries} tone="risk" />
            </div>

            <div className="mb-6">
              <RecoveryFunnel metrics={metrics} />
            </div>
          </>
        )}

        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-black/5 dark:border-white/10">
            <div className="font-display font-bold">Payments</div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-black/10 dark:border-white/10 bg-white dark:bg-panel2 rounded-lg px-2 py-1"
            >
              <option value="">All</option>
              <option value="failed">Failed</option>
              <option value="recovery_in_progress">In progress</option>
              <option value="recovered">Recovered</option>
              <option value="stopped">Stopped</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-black/50 dark:text-white/40 text-xs uppercase tracking-wide">
                  <th className="py-2 px-4">Customer</th>
                  <th className="py-2 px-4">Amount</th>
                  <th className="py-2 px-4">Failure reason</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4">Source</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <PaymentRow key={p._id} payment={p} onSelect={setSelectedId} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {selectedId && (
        <PaymentDetail paymentId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      )}
    </div>
  );
}
