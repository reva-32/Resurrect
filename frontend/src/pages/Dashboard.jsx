import React, { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer, FunnelChart, Funnel, LabelList, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";
import { Link } from "react-router-dom";
import { LogOut, TrendingUp, TrendingDown, Percent, AlertTriangle, MessageSquare, RotateCcw, CheckCircle2, XCircle, Settings as SettingsIcon, Rocket } from "lucide-react";
import { getMetrics, getPayments, getPayment, runRecoveryBulk, runRecoveryOne } from "../api/client";
import { useAuth } from "../context/AuthContext";

const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n) => `${Math.round((n || 0) * 100)}%`;

function StatCard({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "risk" ? "text-risk" : tone === "recovered" ? "text-recovered" : "text-ink";
  const bgClass =
    tone === "risk" ? "bg-risk/10" : tone === "recovered" ? "bg-recovered/10" : "bg-accent/10";
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-soft p-5">
      <div className={`w-9 h-9 rounded-xl ${bgClass} ${toneClass} flex items-center justify-center mb-3`}>
        <Icon size={16} />
      </div>
      <div className="text-xs uppercase tracking-wide text-black/50 font-medium mb-1">{label}</div>
      <div className={`text-2xl font-display font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function BaselineVsAI({ data }) {
  if (!data) return null;
  const { baseline, aiAssisted } = data;
  const chartData = [
    { name: "Baseline (rules)", recovered: baseline.recoveredAmount / 100, rate: Math.round(baseline.recoveryRate * 100) },
    { name: "AI-assisted", recovered: aiAssisted.recoveredAmount / 100, rate: Math.round(aiAssisted.recoveryRate * 100) },
  ];
  const uplift = aiAssisted.recoveredAmount - baseline.recoveredAmount;

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-soft p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-black/50 font-medium">
          Baseline vs AI-assisted recovery
        </div>
        {uplift !== 0 && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${uplift >= 0 ? "text-recovered" : "text-risk"}`}>
            {uplift >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {rupees(Math.abs(uplift))} {uplift >= 0 ? "more" : "less"} with AI
          </div>
        )}
      </div>
      <div className="h-52 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#00000010" />
            <XAxis type="number" tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 11, fill: "#0F111180" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#0F1115" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [`₹${v.toLocaleString("en-IN")}`, "Recovered"]} />
            <Bar dataKey="recovered" radius={[0, 6, 6, 0]} barSize={28}>
              <Cell fill="#2B6CB0" />
              <Cell fill="#6C4FD9" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-6 mt-2 text-sm">
        <div>
          <span className="text-ink/50">Baseline: </span>
          <span className="font-medium">{pct(baseline.recoveryRate)} rate · {baseline.attempts} attempts</span>
        </div>
        <div>
          <span className="text-ink/50">AI-assisted: </span>
          <span className="font-medium">{pct(aiAssisted.recoveryRate)} rate · {aiAssisted.attempts} attempts</span>
        </div>
      </div>
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
    <div className="bg-white rounded-2xl border border-black/5 shadow-soft p-6">
      <div className="text-xs uppercase tracking-wide text-black/50 font-medium mb-2">Recovery funnel</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Tooltip formatter={(v) => [v, "count"]} />
            <Funnel dataKey="value" data={stages} isAnimationActive>
              <LabelList position="right" dataKey="name" fill="#0F1115" stroke="none" fontSize={12} />
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
    stopped: "bg-black/10 text-black/60",
  }[payment.status];

  return (
    <tr className="border-b border-black/5 hover:bg-black/[0.02] cursor-pointer" onClick={() => onSelect(payment._id)}>
      <td className="py-3 px-4 font-medium">{payment.customer?.name || "—"}</td>
      <td className="py-3 px-4">{rupees(payment.amount)}</td>
      <td className="py-3 px-4 text-black/60 capitalize">{payment.failureReason?.replaceAll("_", " ")}</td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusStyle}`}>
          {payment.status.replaceAll("_", " ")}
        </span>
      </td>
      <td className="py-3 px-4 text-black/40 text-sm">
        {payment.customer?.isDemoCustomer ? "🟢 live demo" : "synthetic"}
      </td>
    </tr>
  );
}

function PaymentDetail({ paymentId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getPayment(paymentId);
    setData(res);
  }, [paymentId]);

  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const { payment, auditTrail, smsMessages = [] } = data;
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
    retry_attempted: RotateCcw,
    payment_recovered: CheckCircle2,
    recovery_stopped: XCircle,
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-lg font-display font-bold">{payment.customer?.name}</div>
            <div className="text-2xl font-display font-bold text-accent">{rupees(payment.amount)}</div>
          </div>
          <button className="text-black/40 hover:text-black" onClick={onClose}>✕</button>
        </div>

        <div className="text-sm text-black/60 mb-4">
          Failure: {payment.failureReason?.replaceAll("_", " ")} · Retries: {payment.retryCount} · Status: {payment.status.replaceAll("_", " ")}
        </div>

        {payment.status === "failed" && (
          <div className="flex gap-2 mb-5 flex-wrap">
            <button
              disabled={busy}
              onClick={() => handleRunRecovery(false)}
              className="text-sm px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 font-medium disabled:opacity-50"
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

        {smsMessages.length > 0 && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wide text-black/50 font-medium mb-2">
              SMS {smsMessages[0].mode === "mock" ? "(mock — not actually sent)" : "sent"}
            </div>
            {smsMessages.map((sms) => (
              <div key={sms._id} className="bg-black/[0.03] rounded-xl p-3 text-sm mb-2">
                <div>{sms.message}</div>
                <div className="text-black/40 text-xs mt-1">
                  {sms.mode} · {sms.status} · {new Date(sms.sentAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs uppercase tracking-wide text-black/50 font-medium mb-3">Audit trail</div>
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
                  <div className="text-black/60">{a.detail}</div>
                  <div className="text-black/30 text-xs">{new Date(a.at).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
          {auditTrail.length === 0 && <div className="text-sm text-black/40">No events yet.</div>}
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

  const refresh = useCallback(async () => {
    const [m, p] = await Promise.all([getMetrics(), getPayments(filter || undefined)]);
    setMetrics(m);
    setPayments(p);
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleStartRecovery() {
    setRunning(true);
    try {
      await runRecoveryBulk(true);
      await refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-black/5 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="font-display font-extrabold text-lg tracking-tight">
            Recovery<span className="text-accent">.ai</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{user?.businessName}</div>
              <div className="text-xs text-black/40 leading-tight">{user?.email}</div>
            </div>
            <button
              onClick={handleStartRecovery}
              disabled={running}
              className="bg-ink text-white px-4 py-2 rounded-xl font-medium text-sm hover:bg-ink/90 disabled:opacity-50"
            >
              {running ? "Processing…" : "Start Recovery"}
            </button>
            <Link to="/settings" className="text-black/40 hover:text-black p-2" title="Business settings">
              <SettingsIcon size={18} />
            </Link>
            <button onClick={logout} className="text-black/40 hover:text-black p-2" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {metrics && metrics.totalFailedPayments === 0 && metrics.totalRecovered === 0 && (
          <div className="bg-ink text-white rounded-2xl p-6 mb-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Rocket size={18} />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold mb-1">No data yet — let's get this connected</div>
              <div className="text-sm text-white/60 leading-relaxed">
                Seed the sample dataset (<code className="bg-white/10 px-1.5 py-0.5 rounded">npm run seed</code> in{" "}
                <code className="bg-white/10 px-1.5 py-0.5 rounded">backend/</code>) to load synthetic failed
                payments, or check{" "}
                <Link to="/settings" className="underline font-medium">
                  Settings
                </Link>{" "}
                to see what's configured — Razorpay keys, AI, and your live demo customer.
              </div>
            </div>
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

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <BaselineVsAI data={metrics.baselineVsAI} />
              <RecoveryFunnel metrics={metrics} />
            </div>
          </>
        )}

        <div className="bg-white rounded-2xl border border-black/5 shadow-soft overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-black/5">
            <div className="font-display font-bold">Payments</div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border border-black/10 rounded-lg px-2 py-1"
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
                <tr className="text-left text-black/50 text-xs uppercase tracking-wide">
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
