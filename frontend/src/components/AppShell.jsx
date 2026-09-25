import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, GitCompare, Settings as SettingsIcon, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

// Single source of truth for authenticated navigation. Add a page here once
// and it shows up in both the desktop sidebar and the mobile nav strip below —
// no more copy-pasting a header into every page.
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/receivables", label: "Receivables", icon: Building2, b2bOnly: true },
  { to: "/reconciliation", label: "Reconciliation", icon: GitCompare },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function NavLinks({ user, location, variant }) {
  const showReceivables =
    user?.businessType === "b2b" || user?.businessType === "hybrid" || !user?.businessType;
  const items = NAV.filter((item) => !item.b2bOnly || showReceivables);

  if (variant === "mobile") {
    return items.map(({ to, label }) => {
      const active = location.pathname === to;
      return (
        <Link
          key={to}
          to={to}
          className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            active
              ? "bg-ink dark:bg-white text-white dark:text-ink font-medium"
              : "text-ink/55 dark:text-white/50 border border-black/10 dark:border-white/10"
          }`}
        >
          {label}
        </Link>
      );
    });
  }

  return items.map(({ to, label, icon: Icon }) => {
    const active = location.pathname === to;
    return (
      <Link
        key={to}
        to={to}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
          active
            ? "bg-ink/[0.06] dark:bg-white/[0.08] font-medium text-ink dark:text-white"
            : "text-ink/55 dark:text-white/50 hover:text-ink dark:hover:text-white hover:bg-ink/[0.03] dark:hover:bg-white/[0.05]"
        }`}
      >
        <Icon size={16} strokeWidth={active ? 2.25 : 2} />
        {label}
      </Link>
    );
  });
}

/**
 * Persistent app shell: fixed sidebar on desktop, sticky top nav strip on
 * mobile, and an optional page header (title/subtitle/actions) above the
 * page content. Every authenticated page renders through this so navigation
 * lives in exactly one place.
 */
export default function AppShell({ title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-paper dark:bg-[#0B0D12] text-ink dark:text-white md:grid md:grid-cols-[220px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:h-screen md:sticky md:top-0 border-r border-black/[0.08] dark:border-white/10 px-4 py-6">
        <Link to="/dashboard" className="font-display font-bold text-[15px] px-2.5 mb-8 block">
          Resurrect
        </Link>
        <nav className="flex-1 space-y-0.5">
          <NavLinks user={user} location={location} variant="desktop" />
        </nav>
        <div className="border-t border-black/[0.08] dark:border-white/10 pt-4 mt-4">
          <div className="px-2.5 mb-2 min-w-0">
            <div className="text-sm font-medium truncate">{user?.businessName}</div>
            <div className="text-xs text-ink/40 dark:text-white/35 truncate">{user?.email}</div>
          </div>
          <div className="flex items-center gap-1 px-1">
            <ThemeToggle />
            <button
              onClick={logout}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-ink/50 hover:text-ink dark:text-white/50 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar + horizontal nav */}
      <div className="md:hidden border-b border-black/[0.08] dark:border-white/10 sticky top-0 z-20 bg-paper/90 dark:bg-[#0B0D12]/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="font-display font-bold text-[15px]">
            Resurrect
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={logout}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-ink/50 dark:text-white/50"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
          <NavLinks user={user} location={location} variant="mobile" />
        </nav>
      </div>

      {/* Main column */}
      <div className="min-w-0">
        {(title || actions) && (
          <header className="border-b border-black/[0.08] dark:border-white/10 md:sticky md:top-0 md:z-10 bg-paper/90 dark:bg-[#0B0D12]/90 backdrop-blur">
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                {title && <h1 className="font-display text-lg font-bold truncate">{title}</h1>}
                {subtitle && <p className="text-xs text-ink/45 dark:text-white/40 mt-0.5">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
            </div>
          </header>
        )}
        <main className="px-6 py-8 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
