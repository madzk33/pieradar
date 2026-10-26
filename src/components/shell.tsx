"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Trophy, Star, ArrowLeftRight, Activity, X, BarChart3, Plus } from "lucide-react";
import { useCollections } from "./collections";
import { LiveStatus } from "./live-status";

const NAV = [
  { href: "/", label: "Discover", icon: Compass, mobile: true },
  { href: "/stocks", label: "Stocks", icon: BarChart3, mobile: true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, mobile: true },
  { href: "/watchlist", label: "Watchlist", icon: Star, mobile: true },
  { href: "/compare", label: "Compare", icon: ArrowLeftRight, mobile: true },
  { href: "/status", label: "Status", icon: Activity, mobile: false },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="PieRadar home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--color-accent)" strokeWidth="3" opacity=".35" />
        <path d="M16 2a14 14 0 0 1 14 14H16Z" fill="var(--color-accent)" />
        <circle cx="16" cy="16" r="3" fill="var(--color-up)" />
      </svg>
      <span className="text-[17px] font-bold tracking-tight">
        Pie<span className="text-accent">Radar</span>
      </span>
    </Link>
  );
}

export function TopNav() {
  const path = usePathname();
  const { watchlist, compare } = useCollections();
  return (
    <header className="sticky top-0 z-40 hidden border-b border-line bg-bg/85 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-8 px-6">
        <Brand />
        <nav className="flex items-center gap-1">
          {NAV.map((n) => {
            const count = n.href === "/watchlist" ? watchlist.length : n.href === "/compare" ? compare.length : 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "relative rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors",
                  isActive(path, n.href) ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {n.label}
                {count > 0 && <span className="ml-1.5 text-[11px] text-accent tabular">{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <LiveStatus />
          <Link href="/methodology" className="text-[13px] text-muted hover:text-fg">
            Methodology
          </Link>
          <Link
            href="/submit"
            className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white transition-transform active:scale-95"
          >
            <Plus size={15} /> Add pie
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-xl md:hidden">
      <Brand />
      <div className="flex items-center gap-3">
        <LiveStatus compact />
        <Link href="/submit" className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[12.5px] font-semibold text-white">
          <Plus size={14} /> Add pie
        </Link>
      </div>
    </header>
  );
}

export function BottomTabs() {
  const path = usePathname();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden">
      <div className="grid h-14 grid-cols-5">
        {NAV.filter((n) => n.mobile).map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={clsx("flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium", active ? "text-fg" : "text-dim")}
            >
              <n.icon size={20} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-accent" : ""} />
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Floating tray once pies are queued for comparison. */
export function CompareTray() {
  const { compare, clearCompare, ready } = useCollections();
  const router = useRouter();
  const path = usePathname();
  const show = ready && compare.length > 0 && !path.startsWith("/compare");
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-full border border-line-strong bg-surface-2/95 py-1.5 pl-4 pr-1.5 shadow-2xl shadow-black/50 backdrop-blur">
            <span className="text-[13px] text-muted">
              <span className="font-semibold text-fg tabular">{compare.length}</span> / 4 to compare
            </span>
            <button
              type="button"
              onClick={() => router.push(`/compare?ids=${compare.join(",")}`)}
              className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-transform active:scale-95"
            >
              Compare
            </button>
            <button type="button" onClick={clearCompare} aria-label="Clear compare" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-3">
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
