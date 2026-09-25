import React from "react";
import "../index.css";
import { Link } from "react-router-dom";
import { ArrowRight, Zap, ShieldCheck, MessageSquare, BarChart3, ScrollText, GitBranch, Lock } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

// Ledger rows, not feature cards — the product is a record of money moving,
// so the layout should read like one. Order roughly follows the flow of a
// single recovery: detect -> decide -> act -> prove -> record.
const LEDGER = [
  {
    icon: Zap,
    title: "AI decides, not just detects",
    body: "Every failed payment is analyzed for why it failed and what to do about it — retry, SMS, escalate, or stop — not a blanket reminder to everyone.",
  },
  {
    icon: ShieldCheck,
    title: "AI never touches money directly",
    body: "Recommendations pass through a deterministic backend policy layer with hard limits, like max retries, that the AI cannot override.",
  },
  {
    icon: MessageSquare,
    title: "Recovery link, sent instantly",
    body: "Customers get a short, clear SMS with a secure Razorpay payment link — no app, no login, just tap and pay.",
  },
  {
    icon: BarChart3,
    title: "Recovery funnel, end to end",
    body: "Failed payments in, recovery actions taken, successful outcomes out — see exactly where revenue is being recovered and where it's leaking.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    body: "Every decision — what the AI recommended, what the backend allowed, and why — is logged per payment.",
  },
  {
    icon: GitBranch,
    title: "Real Razorpay integration",
    body: "Built on Razorpay Payment Links and webhooks, so recovered payments flow through the same rails as any real transaction.",
  },
  {
    icon: Lock,
    title: "PCI-safe by design",
    body: "Card numbers and bank credentials are never seen here — Razorpay's own checkout captures those. Webhooks are signature-verified.",
  },
];

const LEDGER_STATS = [
  ["₹4.8L+", "revenue at risk, sample run"],
  ["38%", "typical recovery rate"],
  ["3", "AI actions: retry, SMS, stop"],
  ["100%", "of AI actions policy-checked"],
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white">
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="font-display font-bold text-[15px] tracking-tight flex items-baseline gap-2">
          <span>Resurrect</span>
          <span className="hidden sm:inline text-[11px] font-body font-normal text-ink/35 dark:text-white/35">
            revenue recovery ledger
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link to="/login" className="text-sm text-ink/60 hover:text-ink dark:text-white/60 dark:hover:text-white px-3 py-2">
            Log in
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium border border-ink/15 dark:border-white/20 px-4 py-2 rounded-lg hover:border-ink/30 dark:hover:border-white/40 hover:bg-ink/[0.03] dark:hover:bg-white/[0.05] transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero — one bold moment: the headline paired directly with a live-looking
          recovered-amount readout, tabular-numeral style, like a ledger total. */}
      <header className="max-w-5xl mx-auto px-6 pt-20 pb-16 grid md:grid-cols-[1.3fr_1fr] gap-12 items-end">
        <div>
          <h1 className="font-display text-[2.75rem] md:text-[3.4rem] font-bold leading-[1.06] tracking-tight mb-6 max-w-lg">
            Failed payments have a recovery price. This agent finds it.
          </h1>
          <p className="text-[17px] text-ink/55 dark:text-white/50 leading-relaxed mb-8 max-w-md">
            It finds failed payments, decides the right action for each one, reaches out
            automatically, and shows — with numbers — how much more it recovers than a
            rules-only approach.
          </p>
          <div className="flex items-center gap-5">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 bg-ink dark:bg-white text-white dark:text-ink px-5 py-3 rounded-lg text-sm font-medium hover:bg-ink/88 dark:hover:bg-white/88 transition-colors"
            >
              Start recovering revenue <ArrowRight size={15} />
            </Link>
            <Link to="/login" className="text-sm text-ink/50 hover:text-ink dark:text-white/50 dark:hover:text-white">
              I already have an account
            </Link>
          </div>
        </div>

        {/* Ledger total card — the one place the accent color gets to do real work */}
        <div className="border border-black/[0.08] dark:border-white/[0.1] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-black/[0.08] dark:border-white/[0.1] flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-ink/40 dark:text-white/35">Sample run</span>
            <span className="text-xs text-recovered flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-recovered" /> recovered
            </span>
          </div>
          <div className="px-5 py-5">
            <div className="font-display text-3xl font-bold tabular-nums text-recovered">₹1,82,400</div>
            <div className="text-xs text-ink/40 dark:text-white/35 mt-1">of ₹4,80,000 at risk this batch</div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-black/[0.08] dark:divide-white/[0.1] border-t border-black/[0.08] dark:border-white/[0.1]">
            {LEDGER_STATS.slice(1).map(([stat, label]) => (
              <div key={label} className="px-4 py-3.5">
                <div className="font-display text-base font-semibold tabular-nums">{stat}</div>
                <div className="text-[11px] text-ink/40 dark:text-white/35 mt-0.5 leading-tight">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Ledger rows — replaces the identical-card grid. Each row is a hairline
          divider, an index-free icon, and text; the discipline is in the alignment,
          not in a border-radius. */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="max-w-lg mb-10">
          <h2 className="font-display text-2xl font-bold tracking-tight mb-2">
            Not just "send everyone a reminder."
          </h2>
          <p className="text-ink/55 dark:text-white/50 text-[15px]">
            Basic failed-payment recovery is generic. The intelligence, and the safety rails
            around it, is where this gets interesting.
          </p>
        </div>
        <div className="border-t border-black/[0.08] dark:border-white/[0.1]">
          {LEDGER.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="grid md:grid-cols-[220px_1fr] gap-3 md:gap-8 py-6 border-b border-black/[0.08] dark:border-white/[0.1]"
            >
              <div className="flex items-center gap-3 font-display font-semibold text-[15px]">
                <Icon size={16} className="text-accent shrink-0" strokeWidth={2} />
                {title}
              </div>
              <div className="text-sm text-ink/55 dark:text-white/50 leading-relaxed max-w-xl">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-black/[0.08] dark:border-white/[0.1]">
        <div className="max-w-5xl mx-auto px-6 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-display text-xl font-bold mb-1.5">See it recover ₹ in real time.</div>
            <div className="text-ink/50 dark:text-white/45 text-sm max-w-md">
              Sign up, seed the sample dataset, and start recovery — the ledger updates live.
            </div>
          </div>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 bg-ink dark:bg-white text-white dark:text-ink px-5 py-3 rounded-lg text-sm font-medium hover:bg-ink/88 dark:hover:bg-white/88 transition-colors whitespace-nowrap"
          >
            Get started <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-xs text-ink/35 dark:text-white/25">
        Resurrect — AI revenue recovery engine.
      </footer>
    </div>
  );
}
