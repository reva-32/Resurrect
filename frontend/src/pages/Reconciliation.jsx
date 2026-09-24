import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Database, Search, XCircle } from "lucide-react";
import { getReconciliationResults, getReconciliationSummary, runReconciliation, seedReconciliationProviderData } from "../api/client";
import ThemeToggle from "../components/ThemeToggle";

const rupees = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const labels = {
  matched: "Matched",
  amount_mismatch: "Amount mismatch",
  status_mismatch: "Status mismatch",
  missing_provider: "Missing provider",
  missing_internal: "Missing internal",
};

function Stat({ icon: Icon, label, value, tone = "text-accent" }) {
  return (
    <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 p-5 shadow-soft dark:shadow-soft-dark">
      <div className={`w-9 h-9 rounded-xl bg-accent/10 ${tone} flex items-center justify-center mb-3`}><Icon size={17} /></div>
      <div className="text-xs uppercase tracking-wide text-black/45 dark:text-white/40 mb-1">{label}</div>
      <div className="text-2xl font-display font-bold">{value}</div>
    </div>
  );
}

function ResultBadge({ result }) {
  const good = result === "matched";
  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${good ? "bg-recovered/10 text-recovered" : "bg-risk/10 text-risk"}`}>
      {labels[result] || result}
    </span>
  );
}

export default function Reconciliation() {
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getReconciliationSummary(), getReconciliationResults()]);
      setSummary(s);
      setResults(r);
    } catch {
      setMessage("Couldn't load reconciliation data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function seedProvider() {
    setBusy(true); setMessage("");
    try {
      const result = await seedReconciliationProviderData();
      setMessage(result.message);
      await refresh();
    } catch (err) {
      setMessage(err.response?.data?.error || "Couldn't load provider demo data.");
    } finally { setBusy(false); }
  }

  async function run() {
    setBusy(true); setMessage("");
    try {
      const result = await runReconciliation();
      setMessage(`Checked ${result.checked} records.`);
      await refresh();
    } catch (err) {
      setMessage(err.response?.data?.error || "Couldn't run reconciliation.");
    } finally { setBusy(false); }
  }

  const counts = summary?.counts || {};

  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white">
      <header className="border-b border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#0B0D12]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-black/45 dark:text-white/45 hover:text-black dark:hover:text-white"><ArrowLeft size={18} /></Link>
            <div>
              <div className="font-display font-extrabold text-lg"><span className="text-accent">Resurrect</span> · Reconciliation</div>
              <div className="text-xs text-black/40 dark:text-white/40">Check internal payment records against provider records</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-accent font-semibold">Fintech operations</div>
            <h1 className="font-display text-2xl font-bold mt-1">Payment reconciliation</h1>
            <p className="text-sm text-black/50 dark:text-white/45 mt-1">Find amount, status and missing-record differences before they become operational issues.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={seedProvider} disabled={busy} className="flex items-center gap-2 border border-black/10 dark:border-white/10 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              <Database size={16} /> Load provider demo
            </button>
            <button onClick={run} disabled={busy} className="flex items-center gap-2 bg-ink dark:bg-white text-white dark:text-ink px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              <Search size={16} /> {busy ? "Checking…" : "Run reconciliation"}
            </button>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm">
          <div className="font-semibold mb-1">Demo reconciliation dataset</div>
          <div className="text-black/55 dark:text-white/50">The provider snapshot button creates controlled test cases: matched, amount mismatch, status mismatch, missing provider, and missing internal. These are simulated discrepancies for demonstrating reconciliation logic; real Razorpay test transactions are recorded separately from verified webhooks.</div>
        </div>
        {message && <div className="mb-5 rounded-xl bg-accent/5 border border-accent/15 px-4 py-3 text-sm">{message}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat icon={CheckCircle2} label="Matched" value={counts.matched || 0} tone="text-recovered" />
          <Stat icon={AlertTriangle} label="Amount mismatch" value={counts.amountMismatch || 0} tone="text-risk" />
          <Stat icon={XCircle} label="Status mismatch" value={counts.statusMismatch || 0} tone="text-risk" />
          <Stat icon={Database} label="Missing records" value={(counts.missingProvider || 0) + (counts.missingInternal || 0)} tone="text-accent" />
        </div>

        <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
            <div>
              <div className="font-display font-bold">Reconciliation results</div>
              <div className="text-xs text-black/40 dark:text-white/40">{summary?.lastCheckedAt ? `Last checked ${new Date(summary.lastCheckedAt).toLocaleString("en-IN")}` : "No reconciliation run yet"}</div>
            </div>
            <button onClick={refresh} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title="Refresh"><RefreshCw size={16} /></button>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-black/40 dark:text-white/40">Loading reconciliation…</div>
          ) : results.length === 0 ? (
            <div className="p-10 text-center">
              <Search size={28} className="mx-auto text-accent mb-3" />
              <div className="font-medium mb-1">No reconciliation results yet</div>
              <div className="text-sm text-black/45 dark:text-white/45">Load provider demo data, then run reconciliation.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-black/45 dark:text-white/40">
                    <th className="px-5 py-3">Payment</th>
                    <th className="px-5 py-3">Internal</th>
                    <th className="px-5 py-3">Provider</th>
                    <th className="px-5 py-3">Result</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row._id} className="border-t border-black/5 dark:border-white/10">
                      <td className="px-5 py-4 font-medium">{row.payment?._id ? String(row.payment._id).slice(-8) : "—"}</td>
                      <td className="px-5 py-4">
                        <div>{row.internalAmount != null ? rupees(row.internalAmount) : "—"}</div>
                        <div className="text-xs text-black/40 dark:text-white/40">{row.internalStatus || "—"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div>{row.providerAmount != null ? rupees(row.providerAmount) : "—"}</div>
                        <div className="text-xs text-black/40 dark:text-white/40">{row.providerStatus || "—"}</div>
                      </td>
                      <td className="px-5 py-4"><ResultBadge result={row.result} /></td>
                      <td className="px-5 py-4 text-black/55 dark:text-white/50 max-w-md">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 text-xs text-black/40 dark:text-white/35">
          Demo provider records are explicitly labeled as snapshots. Real Razorpay test transactions are recorded from verified webhooks when available.
        </div>
      </main>
    </div>
  );
}
