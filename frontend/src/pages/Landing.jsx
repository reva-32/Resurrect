import React from "react";
import "../index.css";
import { Link } from "react-router-dom";
import { ArrowRight, Zap, ShieldCheck, MessageSquare, BarChart3, ScrollText, GitBranch, Lock } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

const FEATURES = [
  {
    icon: Zap,
    title: "AI decides, not just detects",
    body: "Every failed payment is analyzed for why it failed and what to do about it — retry, SMS, escalate, or stop — not a blanket reminder to everyone.",
  },
  {
    icon: ShieldCheck,
    title: "AI never touches money directly",
    body: "Recommendations pass through a deterministic backend policy layer with hard limits (like max retries) the AI cannot override.",
  },
  {
    icon: MessageSquare,
    title: "Recovery link, sent instantly",
    body: "Customers get a short, clear SMS with a secure Razorpay payment link — no app, no login, just tap and pay.",
  },
  {
    icon: BarChart3,
    title: "Recovery funnel, end to end",
    body: "Failed payments in, recovery actions taken, successful outcomes out — see exactly where revenue is being recovered and where it's leaking through the funnel.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    body: "Every decision — what the AI recommended, what the backend allowed, and why — is logged per payment for complete transparency.",
  },
  {
    icon: GitBranch,
    title: "Real Razorpay integration",
    body: "Built on Razorpay Payment Links and webhooks, so recovered payments flow through the same rails as any real transaction.",
  },
  {
    icon: Lock,
    title: "PCI-safe by design",
    body: "We never see card numbers or bank credentials — Razorpay's own checkout captures those. Webhooks are signature-verified, secrets never leave the backend.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="font-display font-extrabold text-lg tracking-tight">
           <span className="text-accent">Resurrect</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/login" className="text-sm font-medium text-ink/70 hover:text-ink dark:text-white/70 dark:hover:text-white px-3 py-2">
            Log in
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium bg-ink dark:bg-white text-white dark:text-ink px-4 py-2 rounded-xl hover:bg-ink/90 dark:hover:bg-white/90 transition"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="max-w-6xl mx-auto px-6 pt-16 pb-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-medium bg-accent/10 text-accent px-3 py-1.5 rounded-full mb-6">
            Built for the Razorpay AI Buildathon
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight mb-6">
            Turn failed payments into <span className="text-accent">recovered revenue.</span>
          </h1>
          <p className="text-lg text-ink/60 dark:text-white/60 leading-relaxed mb-8 max-w-xl">
            An AI agent that finds failed payments, decides the right action for each one,
            reaches out automatically, and proves — with numbers — how much more it recovers
            than a rules-only approach.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 bg-ink dark:bg-white text-white dark:text-ink px-6 py-3.5 rounded-xl font-medium hover:bg-ink/90 dark:hover:bg-white/90 transition"
            >
              Start recovering revenue <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="text-sm font-medium text-ink/60 hover:text-ink dark:text-white/60 dark:hover:text-white">
              I already have an account
            </Link>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-black/5 dark:bg-white/10 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10">
          {[
            ["₹4.8L+", "revenue at risk, sample run"],
            ["38%", "typical recovery rate"],
            ["3", "AI actions: retry, SMS, stop"],
            ["100%", "of AI actions policy-checked"],
          ].map(([stat, label]) => (
            <div key={label} className="bg-white dark:bg-panel p-6">
              <div className="font-display text-2xl font-bold text-accent">{stat}</div>
              <div className="text-sm text-ink/50 dark:text-white/50 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="max-w-xl mb-12">
          <h2 className="font-display text-3xl font-bold tracking-tight mb-3">
            Not just "send everyone a reminder."
          </h2>
          <p className="text-ink/60 dark:text-white/60">
            Basic failed-payment recovery is generic. The intelligence — and the safety rails
            around it — is where this gets interesting.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-white/10 shadow-soft dark:shadow-soft-dark p-6 hover:-translate-y-0.5 hover:shadow-lg transition"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                <Icon size={20} />
              </div>
              <div className="font-display font-bold mb-2">{title}</div>
              <div className="text-sm text-ink/60 dark:text-white/60 leading-relaxed">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink dark:bg-panel text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="font-display text-2xl font-bold mb-2">See it recover ₹ in real time.</div>
            <div className="text-white/60 max-w-md">
              Sign up, seed the sample dataset, and hit "Start Recovery" — the dashboard updates live.
            </div>
          </div>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 bg-white text-ink px-6 py-3.5 rounded-xl font-medium hover:bg-white/90 transition whitespace-nowrap"
          >
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-sm text-ink/40 dark:text-white/30">
        Resurrect — AI Revenue Recovery Engine.
      </footer>
    </div>
  );
}
