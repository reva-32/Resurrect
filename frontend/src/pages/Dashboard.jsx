import React, { useEffect, useState, useCallback, useRef } from "react";
import "../index.css";
import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
} from "recharts";
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
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  BrainCircuit,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { getMetrics, getPayments, getPayment, runRecoveryBulk, runRecoveryOne, seedData, getInsights, askAssistant } from "../api/client";
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


function AnalyticsCharts({ metrics }) {
  const analytics = metrics?.analytics || {};
  const trend = analytics.recoveryTrend || [];
  const strategy = analytics.strategyPerformance || [];

  const formatDay = (value) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });

  const ChartCard = ({ title, description, children }) => (
    <div className="min-w-0 bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-5">
      <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/40 font-medium mb-1">
        {title}
      </div>
      <div className="text-sm text-black/50 dark:text-white/40 mb-4">{description}</div>
      <div className="h-60 min-w-0">{children}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <div className="min-w-0">
        <RecoveryFunnel metrics={metrics} />
      </div>

      <ChartCard
        title="Recovery over time"
        description="Live failures and successful recoveries across the last 7 days."
      >
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
              <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={formatDay} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="failed" name="Failed" stroke="#C24444" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="recovered" name="Recovered" stroke="#2F7A4F" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-black/40 dark:text-white/40">
            Recovery trend data will appear here automatically.
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Recovery by strategy"
        description="Compare recovery actions with their successful outcomes."
      >
        {strategy.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={strategy} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
              <XAxis dataKey="strategy" tick={{ fontSize: 10 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="attempted" name="Attempts" fill="#6C4FD9" radius={[5, 5, 0, 0]} />
              <Bar dataKey="successful" name="Successful" fill="#2F7A4F" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-black/40 dark:text-white/40">
            Start a recovery to see strategy performance.
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function UserGuide({ open, onClose }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const steps = [
    {
      title: "A payment fails",
      icon: AlertTriangle,
      body: "Resurrect detects the failed payment and keeps it visible in the merchant dashboard instead of leaving the merchant to track it manually.",
      tip: "Start Recovery to process eligible failed payments.",
    },
    {
      title: "AI chooses the next action",
      icon: BrainCircuit,
      body: "The AI evaluates the payment context and recommends a recovery action. A backend safety policy still checks the recommendation before anything is executed.",
      tip: "Open a payment to see why the action was selected.",
    },
    {
      title: "Recovery is automated",
      icon: MessageSquare,
      body: "Depending on the decision, Resurrect can retry a transient failure or send a recovery message with a payment link. Synthetic data uses the simulator; the live demo customer uses Razorpay.",
      tip: "SMS messages and recovery attempts are recorded in the payment timeline.",
    },
    {
      title: "Razorpay confirms success",
      icon: CheckCircle2,
      body: "When the customer completes a real Razorpay payment, the webhook updates the payment automatically. You do not need to refresh or mark it recovered manually.",
      tip: "A recovered payment shows its amount and recovery event in the audit trail.",
    },
    {
      title: "Monitor and improve",
      icon: Clock3,
      body: "Use the cards and charts to understand failures, recoveries, SMS activity, and which strategies are performing best. The dashboard refreshes automatically.",
      tip: "Use the data here to decide where the merchant should focus next.",
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 dark:bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-panel rounded-3xl border border-black/5 dark:border-white/10 shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 dark:border-white/10">
          <div>
            <div className="text-xs uppercase tracking-wide text-accent font-semibold">Resurrect guide</div>
            <div className="font-display text-xl font-bold mt-1">How payment recovery works</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/10 text-black/50 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/15"
            aria-label="Close guide"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pt-5">
          <div className="flex gap-1.5 mb-6">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setStep(index)}
                className={`h-1.5 flex-1 rounded-full ${index === step ? "bg-accent" : "bg-black/10 dark:bg-white/10"}`}
                aria-label={`Go to guide step ${index + 1}`}
              />
            ))}
          </div>

          <div className="flex gap-4 items-start min-h-[210px]">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <Icon size={22} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40 font-medium">
                Step {step + 1} of {steps.length}
              </div>
              <h3 className="font-display text-2xl font-bold mt-1 mb-3">{current.title}</h3>
              <p className="text-sm leading-6 text-black/65 dark:text-white/65">{current.body}</p>
              <div className="mt-5 rounded-xl bg-accent/5 border border-accent/15 px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> {current.tip}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-black/5 dark:border-white/10 flex justify-between items-center">
          <button
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-xl bg-black/5 dark:bg-white/10 font-medium disabled:opacity-30"
          >
            <ChevronLeft size={16} /> Back
          </button>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
              className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-xl bg-accent text-white font-medium hover:bg-accent/90"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-xl bg-ink dark:bg-white text-white dark:text-ink font-medium"
            >
              Done
            </button>
          )}
        </div>
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


function LanguageToggle({ language, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-black/5 dark:bg-white/10 p-0.5">
      <button
        type="button"
        onClick={() => onChange("en")}
        className={`px-2.5 py-1 text-xs rounded-md font-medium ${language === "en" ? "bg-white dark:bg-panel shadow-sm text-ink dark:text-white" : "text-black/50 dark:text-white/50"}`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => onChange("hi")}
        className={`px-2.5 py-1 text-xs rounded-md font-medium ${language === "hi" ? "bg-white dark:bg-panel shadow-sm text-ink dark:text-white" : "text-black/50 dark:text-white/50"}`}
      >
        हिन्दी
      </button>
    </div>
  );
}

function DashboardInsights({ language, onLanguageChange, onRefresh, data, loading }) {
  return (
    <section className="mb-8 bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark overflow-hidden">
      <div className="px-6 py-5 border-b border-black/5 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-accent2" />
            <h2 className="font-display font-bold text-lg">AI Insights & Solutions</h2>
          </div>
          <p className="text-sm text-black/50 dark:text-white/40 mt-1">A grounded explanation of the dashboard data and what the merchant should do next.</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle language={language} onChange={onLanguageChange} />
          <button type="button" onClick={onRefresh} disabled={loading} className="text-xs px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 font-medium disabled:opacity-50">
            {loading ? "Updating…" : "Refresh insights"}
          </button>
        </div>
      </div>
      <div className="p-6">
        {loading && !data ? (
          <div className="text-sm text-black/40 dark:text-white/40">Reading the latest dashboard data…</div>
        ) : data ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="lg:col-span-2 rounded-xl bg-accent/5 border border-accent/10 p-4">
              <div className="text-xs uppercase tracking-wide text-accent font-semibold mb-2">Current scenario</div>
              <div className="text-sm leading-6 whitespace-pre-wrap">{data.content}</div>
            </div>
            <div className="rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 p-4">
              <div className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45 font-semibold mb-2">Dashboard cards explained</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-xs leading-5 text-black/65 dark:text-white/65">
                <div><span className="font-semibold">Revenue at risk:</span> value still tied to unresolved payments.</div>
                <div><span className="font-semibold">Recovered:</span> value from payments currently marked recovered.</div>
                <div><span className="font-semibold">Recovery rate:</span> successful recovery attempts divided by successful + failed attempts.</div>
                <div><span className="font-semibold">Failed payments:</span> payments not currently in recovered status.</div>
                <div><span className="font-semibold">SMS sent:</span> recovery SMS records created for this merchant.</div>
                <div><span className="font-semibold">Retries:</span> recorded retry recovery attempts.</div>
                <div><span className="font-semibold">Successful recoveries:</span> recovery attempts whose outcome is success.</div>
                <div><span className="font-semibold">Failed recoveries:</span> recovery attempts whose outcome is failure.</div>
              </div>
            </div>
            <div className="rounded-xl bg-recovered/5 border border-recovered/15 p-4">
              <div className="text-xs uppercase tracking-wide text-recovered font-semibold mb-2">Important distinction</div>
              <p className="text-sm leading-6 text-black/65 dark:text-white/65">A successful recovery attempt is not automatically the same as a unique recovered payment. Use the payment status/recovered value for actual recovered revenue.</p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-black/40 dark:text-white/40">Insights are unavailable right now. The dashboard numbers remain the source of truth.</div>
        )}
      </div>
    </section>
  );
}

function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);

  const suggestions = language === "hi"
    ? ["आज क्या हुआ?", "किसे priority recovery दें?", "Recovery rate क्यों कम है?", "मुझे अगला क्या करना चाहिए?"]
    : ["What happened today?", "Who should get priority recovery?", "Why is recovery rate low?", "What should I do next?"];

  async function submit(text = question) {
    const q = String(text || "").trim();
    if (!q || busy) return;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setBusy(true);
    try {
      const result = await askAssistant(q, language);
      setMessages((prev) => [...prev, { role: "assistant", text: result.answer, source: result.generatedBy }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: language === "hi" ? "अभी dashboard assistant उपलब्ध नहीं है। Dashboard के numbers को source of truth मानें।" : "The dashboard assistant is unavailable right now. Please use the dashboard numbers as the source of truth." }]);
    } finally {
      setBusy(false);
    }
  }

  function changeLanguage(next) {
    setLanguage(next);
    setMessages([]);
  }

  return (
    <>
      {open && (
        <div className="fixed right-5 bottom-24 z-[55] w-[min(390px,calc(100vw-24px))] bg-white dark:bg-panel border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0"><BrainCircuit size={17} /></div>
              <div className="min-w-0">
                <div className="font-display font-bold text-sm">Resurrect Copilot</div>
                <div className="text-[11px] text-black/40 dark:text-white/40">Answers from your dashboard data</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle language={language} onChange={changeLanguage} />
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><X size={17} /></button>
            </div>
          </div>

          <div className="h-[360px] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div>
                <div className="rounded-xl bg-accent/5 border border-accent/10 p-3 text-sm leading-5 mb-3">
                  {language === "hi" ? "मैं dashboard के live data से stats समझा सकता हूँ, patterns बता सकता हूँ और current scenario के लिए action सुझा सकता हूँ।" : "I can explain your live dashboard stats, identify patterns, and suggest actions for the current scenario."}
                </div>
                <div className="space-y-2">
                  {suggestions.map((item) => <button key={item} onClick={() => submit(item)} className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/5">{item}</button>)}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-5 whitespace-pre-wrap ${message.role === "user" ? "bg-ink dark:bg-white text-white dark:text-ink" : "bg-black/[0.04] dark:bg-white/[0.06]"}`}>
                  {message.text}
                  {message.source && <div className="mt-1.5 text-[10px] opacity-50">{message.source === "dashboard-data" ? "Dashboard data" : "Grounded AI"}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-black/40 dark:text-white/40">{language === "hi" ? "Dashboard data देख रहा हूँ…" : "Reading dashboard data…"}</div>}
          </div>

          <div className="p-3 border-t border-black/5 dark:border-white/10">
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-center gap-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder={language === "hi" ? "Dashboard के बारे में पूछें…" : "Ask about your dashboard…"} className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-panel2 text-sm outline-none focus:ring-2 focus:ring-accent/20" />
              <button type="submit" disabled={!question.trim() || busy} className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40"><Send size={16} /></button>
            </form>
          </div>
        </div>
      )}
      <button onClick={() => setOpen((value) => !value)} aria-label="Open Resurrect Copilot" title="Resurrect Copilot" className="fixed right-5 bottom-5 z-[56] w-14 h-14 rounded-full bg-ink dark:bg-white text-white dark:text-ink shadow-2xl flex items-center justify-center hover:scale-[1.03] transition-transform">
        {open ? <X size={21} /> : <MessageCircle size={22} />}
      </button>
    </>
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [insightLanguage, setInsightLanguage] = useState("en");
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

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

  const refreshInsights = useCallback(async (language = insightLanguage) => {
    setInsightsLoading(true);
    try {
      const result = await getInsights(language);
      setInsights(result);
    } finally {
      setInsightsLoading(false);
    }
  }, [insightLanguage]);

  useEffect(() => {
    refreshInsights();
  }, [refreshInsights]);

  async function handleStartRecovery() {
    setRunning(true);
    try {
      await runRecoveryBulk(true);
      await refresh();
      await refreshInsights();
    } finally {
      setRunning(false);
    }
  }

  async function handleAddData() {
    setSeeding(true);
    try {
      await seedData();
      await refresh();
      await refreshInsights();
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
            <button
              onClick={() => setGuideOpen(true)}
              className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white p-2"
              title="How Resurrect works"
              aria-label="How Resurrect works"
            >
              <HelpCircle size={19} />
            </button>
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

            <AnalyticsCharts metrics={metrics} />
            <DashboardInsights
              language={insightLanguage}
              onLanguageChange={setInsightLanguage}
              onRefresh={() => refreshInsights()}
              data={insights}
              loading={insightsLoading}
            />
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
      <UserGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <FloatingAssistant />
    </div>
  );
}
