import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Clock3, AlertTriangle, CheckCircle2, Plus, RefreshCw, Send, CreditCard } from "lucide-react";
import { getInvoices, getReceivablesSummary, runInvoiceRecovery, recordInvoicePayment, seedReceivables } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "../components/ThemeToggle";

const rupees = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const statusLabel = {
  due: "Due",
  due_soon: "Due soon",
  overdue: "Overdue",
  partially_paid: "Partially paid",
  paid: "Paid",
};

function Stat({ icon: Icon, label, value, tone = "" }) {
  return (
    <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 p-5 shadow-soft dark:shadow-soft-dark">
      <div className={`w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3 ${tone}`}>
        <Icon size={17} />
      </div>
      <div className="text-xs uppercase tracking-wide text-black/45 dark:text-white/40 mb-1">{label}</div>
      <div className="text-2xl font-display font-bold">{value}</div>
    </div>
  );
}

export default function Receivables() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i] = await Promise.all([getReceivablesSummary(), getInvoices(filter || undefined)]);
      setSummary(s);
      setInvoices(i);
    } catch {
      setMessage("Couldn't load receivables. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  async function seed() {
    setMessage("");
    try {
      const result = await seedReceivables();
      setMessage(result.created ? `Loaded ${result.invoiceCount} demo invoices.` : result.message);
      await refresh();
    } catch {
      setMessage("Couldn't load demo receivables.");
    }
  }

  async function recover(id) {
    try {
      const result = await runInvoiceRecovery(id);
      setMessage(`Recorded: ${result.recommendation.action.replace("_", " ")}.`);
      await refresh();
    } catch (err) {
      setMessage(err.response?.data?.error || "Couldn't record recovery action.");
    }
  }

  async function markPayment(invoice) {
    const remaining = invoice.outstanding;
    const raw = window.prompt(`Payment received for ${invoice.invoiceNumber}. Enter amount in rupees (max ${rupees(remaining)}):`);
    if (!raw) return;
    const rupeesAmount = Number(raw);
    if (!Number.isFinite(rupeesAmount) || rupeesAmount <= 0) return;
    try {
      await recordInvoicePayment(invoice._id, Math.round(rupeesAmount * 100));
      setMessage("Payment recorded.");
      await refresh();
    } catch (err) {
      setMessage(err.response?.data?.error || "Couldn't record payment.");
    }
  }

  const isReceivables = user?.businessType === "b2b" || user?.businessType === "hybrid" || !user?.businessType;

  if (!isReceivables) {
    return (
      <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <Building2 size={32} className="mx-auto text-accent mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2">Receivables are for B2B/MSME workflows</h1>
          <p className="text-sm text-black/55 dark:text-white/50 mb-5">Switch this merchant to Hybrid in settings if you want both payment recovery and invoice recovery.</p>
          <Link to="/dashboard" className="text-accent font-medium">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white">
      <header className="border-b border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#0B0D12]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-black/45 dark:text-white/45 hover:text-black dark:hover:text-white"><ArrowLeft size={18} /></Link>
            <div>
              <div className="font-display font-extrabold text-lg"><span className="text-accent">Resurrect</span> · Receivables</div>
              <div className="text-xs text-black/40 dark:text-white/40">B2B / MSME revenue recovery</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/settings" className="text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white">Settings</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-accent font-semibold">Invoice recovery</div>
            <h1 className="font-display text-2xl font-bold mt-1">Keep receivables moving</h1>
            <p className="text-sm text-black/50 dark:text-white/45 mt-1">Track invoices, overdue exposure and the next recovery action.</p>
          </div>
          <button onClick={seed} className="flex items-center gap-2 bg-ink dark:bg-white text-white dark:text-ink px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus size={16} /> Load demo invoices
          </button>
        </div>

        {message && <div className="mb-5 rounded-xl bg-accent/5 border border-accent/15 px-4 py-3 text-sm">{message}</div>}

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat icon={CreditCard} label="Outstanding" value={rupees(summary.amounts.outstanding)} />
            <Stat icon={Clock3} label="Due soon" value={rupees(summary.amounts.dueSoon)} />
            <Stat icon={AlertTriangle} label="Overdue" value={rupees(summary.amounts.overdue)} tone="text-risk" />
            <Stat icon={CheckCircle2} label="Paid" value={rupees(summary.amounts.paid)} tone="text-recovered" />
          </div>
        )}

        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
            <div>
              <div className="font-display font-bold">Invoices</div>
              <div className="text-xs text-black/40 dark:text-white/40">{summary?.counts?.overdue || 0} overdue · {summary?.counts?.total || 0} total</div>
            </div>
            <div className="flex items-center gap-2">
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-sm border border-black/10 dark:border-white/10 bg-white dark:bg-panel2 rounded-lg px-2 py-1.5">
                <option value="">All</option>
                <option value="due">Due</option>
                <option value="due_soon">Due soon</option>
                <option value="overdue">Overdue</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
              </select>
              <button onClick={refresh} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title="Refresh"><RefreshCw size={16} /></button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-black/40 dark:text-white/40">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center">
              <Building2 size={28} className="mx-auto text-accent mb-3" />
              <div className="font-medium mb-1">No invoices yet</div>
              <div className="text-sm text-black/45 dark:text-white/45 mb-4">Load the demo invoices to see the B2B recovery workflow.</div>
              <button onClick={seed} className="text-accent font-medium">Load demo data</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-black/45 dark:text-white/40">
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Business</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Due</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Risk</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice._id} className="border-t border-black/5 dark:border-white/10">
                      <td className="px-5 py-4 font-medium">{invoice.invoiceNumber}</td>
                      <td className="px-5 py-4">
                        <div>{invoice.businessCustomer?.businessName}</div>
                        <div className="text-xs text-black/40 dark:text-white/40">{invoice.businessCustomer?.contactName}</div>
                      </td>
                      <td className="px-5 py-4">{rupees(invoice.outstanding)}</td>
                      <td className="px-5 py-4">
                        {new Date(invoice.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {invoice.overdueDays > 0 && <div className="text-xs text-risk">{invoice.overdueDays} days overdue</div>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${invoice.status === "overdue" ? "bg-risk/10 text-risk" : invoice.status === "paid" ? "bg-recovered/10 text-recovered" : "bg-accent/10 text-accent"}`}>
                          {statusLabel[invoice.status] || invoice.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium">{invoice.riskScore}/100</div>
                        <div className="text-xs text-black/40 dark:text-white/40">{invoice.recommendation?.action?.replace("_", " ")}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {invoice.status !== "paid" && <button onClick={() => recover(invoice._id)} className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/15" title="Record recovery action"><Send size={15} /></button>}
                          {invoice.status !== "paid" && <button onClick={() => markPayment(invoice)} className="p-2 rounded-lg bg-recovered/10 text-recovered hover:bg-recovered/15" title="Record payment"><CreditCard size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
