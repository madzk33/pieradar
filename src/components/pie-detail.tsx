"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowLeftRight, Check, Copy, Info, Star, TriangleAlert, Users, Eye, Clock } from "lucide-react";
import type { PieCardData, PieDetail } from "@/lib/types";
import { ago, compact, date, pct, tone, toneText, until } from "@/lib/format";
import { useCollections } from "./collections";
import { FlashValue } from "./live";
import { LiveDot } from "./live-dot";
import { PieGlyph } from "./pie-glyph";
import { PerfChart } from "./perf-chart";
import { Allocation } from "./allocation";
import { HoldingsTable } from "./holdings-table";
import { PieCard } from "./pie-card";
import { OriginBadge } from "./origin-badge";
import { CreateInBroker } from "./create-in-broker";

type Related = PieCardData & { overlap: number };

export function PieDetailView({ initial, related }: { initial: PieDetail; related: Related[] }) {
  const { data: pie } = useQuery({
    queryKey: ["pie", initial.id],
    queryFn: async () => {
      const res = await fetch(`/api/pies/${initial.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("pie");
      return ((await res.json()) as { pie: PieDetail }).pie;
    },
    initialData: initial,
    refetchInterval: 15_000,
  });
  const now = useNow(5_000);
  const { isWatched, toggleWatch, inCompare, toggleCompare } = useCollections();
  const m = pie.metrics;
  const removed = pie.status !== "active";
  const syncAge = pie.lastSyncedAt ? (now - Date.parse(pie.lastSyncedAt)) / 1000 : Infinity;
  // Imported/submitted pies don't auto-sync holdings; their freshness is the price re-marking.
  const autoSynced = pie.origin === "demo" || pie.origin === "t212-api";
  const stale = autoSynced ? syncAge > 6 * 3600 + 600 : Date.now() - Date.parse(m.computedAt ?? "0") > 30 * 60_000;

  const tiles: { label: string; v: number | null; hint?: string }[] = [
    { label: "Today", v: m.day1 },
    { label: "1M", v: m.m1 },
    { label: "3M", v: m.m3 },
    { label: "6M", v: m.m6 },
    { label: "YTD", v: m.ytd },
    { label: "1Y", v: m.y1 },
    { label: m.aarYears ? `AAR · ${m.aarYears}Y` : "AAR", v: m.aar, hint: "Average annual (compound) return over the longest window with ≥95% price coverage, up to 5 years." },
    { label: "All-time", v: m.allTime, hint: "Since the pie was created, at its current target weights." },
  ];

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={15} /> Discover
      </Link>

      {removed && (
        <div className="flex items-start gap-3 rounded-2xl border border-down/40 bg-down-soft px-4 py-3 text-[13.5px]">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-down" />
          <div>
            <strong className="font-semibold">This pie is no longer public on Trading 212.</strong>
            <span className="text-muted"> It was deleted or made private and has been removed from Discover. The last synced data is shown below.</span>
          </div>
        </div>
      )}

      {/* Header */}
      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-6">
        <div className="flex items-start gap-4">
          <PieGlyph weights={pie.holdingsDetail.map((h) => h.target)} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight md:text-[28px]">{pie.name}</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              {pie.kind === "model" ? <span className="text-gold">Model pie</span> : <>by <span className="text-fg">{pie.creatorName}</span></>}
              {pie.creatorHandle && <span className="text-dim"> {pie.creatorHandle}</span>} · {pie.category}
            </p>
            {pie.description && <p className="mt-2 max-w-2xl text-[13.5px] text-muted">{pie.description}</p>}
          </div>
          <div className="hidden gap-2 sm:flex">
            {!removed && <CreateInBroker pie={pie} />}
            <ActionButton active={inCompare(pie.id)} onClick={() => toggleCompare(pie.id)} icon={<ArrowLeftRight size={16} />}>
              Compare
            </ActionButton>
            <ActionButton active={isWatched(pie.id)} onClick={() => toggleWatch(pie.id)} icon={<Star size={16} fill={isWatched(pie.id) ? "currentColor" : "none"} />}>
              {isWatched(pie.id) ? "Saved" : "Save"}
            </ActionButton>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12.5px] text-muted">
              1Y return
              <span className="rounded-[5px] bg-accent-soft px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-accent">Uncapped</span>
            </div>
            <FlashValue value={m.y1} className={clsx("-mx-1 mt-1 inline-block px-1 text-[40px] font-bold leading-none tracking-tight tabular md:text-[52px]", toneText[tone(m.y1)])}>
              {pct(m.y1)}
            </FlashValue>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className={clsx("font-semibold tabular", toneText[tone(m.day1)])}>{pct(m.day1)} today</span>
              {m.coverage < 0.999 && (
                <span className="flex items-center gap-1 text-gold" title="Some holdings have less than a year of price history; returns use the rest, re-weighted.">
                  <Info size={13} /> {pct(m.coverage, { sign: false, digits: 0 })} of weight has 1Y history
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <LiveDot stale={stale || removed} />
            <span suppressHydrationWarning>
              {autoSynced ? `Synced ${ago(pie.lastSyncedAt, now)}` : `Holdings as of ${date(pie.lastSyncedAt ?? pie.firstSeenAt)}`} · prices{" "}
              {ago(m.computedAt, now)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
          {!removed && <CreateInBroker pie={pie} grow />}
          <ActionButton active={inCompare(pie.id)} onClick={() => toggleCompare(pie.id)} icon={<ArrowLeftRight size={16} />} grow>
            Compare
          </ActionButton>
          <ActionButton active={isWatched(pie.id)} onClick={() => toggleWatch(pie.id)} icon={<Star size={16} fill={isWatched(pie.id) ? "currentColor" : "none"} />} grow>
            {isWatched(pie.id) ? "Saved" : "Save"}
          </ActionButton>
        </div>
      </section>

      {/* Metric tiles */}
      <section className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface px-3 py-3" title={t.hint}>
            <div className="truncate text-[11px] font-medium text-dim">{t.label}</div>
            <div className={clsx("mt-1 text-[14.5px] font-semibold tabular md:text-[15.5px]", toneText[tone(t.v)])}>{pct(t.v)}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <PerfChart pieId={pie.id} />
          <Allocation holdings={pie.holdingsDetail} since={pie.holdingsChangedAt} />
          <HoldingsTable holdings={pie.holdingsDetail} />
        </div>

        <aside className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
            <h2 className="text-[15px] font-semibold">Details</h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {pie.copiers != null && <Row icon={<Users size={14} />} k="Copiers" v={pie.copiers.toLocaleString()} />}
              {pie.origin === "demo" && <Row icon={<Eye size={14} />} k="Views" v={compact(pie.views)} />}
              <Row k="Source" v={<OriginBadge origin={pie.origin} />} />
              <Row k="Created" v={date(pie.createdAt)} />
              <Row k="Last rebalanced" v={date(pie.holdingsChangedAt)} />
              <Row k="Volatility (1Y)" v={pct(m.volatility, { sign: false, digits: 1 })} />
              <Row k="Max drawdown (1Y)" v={<span className="text-down">{pct(m.maxDrawdown, { digits: 1 })}</span>} />
            </dl>
            {pie.copierHistory.length > 1 && <CopierSpark points={pie.copierHistory} />}
          </section>

          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Clock size={15} className="text-muted" /> Sync transparency
            </h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {autoSynced ? (
                <>
                  <Row k="Pie data synced" v={ago(pie.lastSyncedAt, now)} />
                  <Row k="Next sync" v={until(pie.nextSyncAt, now)} />
                </>
              ) : (
                <>
                  <Row k="Holdings as of" v={date(pie.lastSyncedAt ?? pie.firstSeenAt)} />
                  <Row k="Holdings updates" v={pie.origin === "imported" ? "Owner re-imports" : "Re-submit"} />
                </>
              )}
              <Row k="Returns re-marked" v={ago(m.computedAt, now)} />
              {autoSynced && <Row k="Sync tier" v={<span className="capitalize">{pie.syncTier}</span>} />}
              <Row k="First indexed" v={date(pie.firstSeenAt)} />
              {pie.lastError && pie.lastError !== "not_found" && <Row k="Last error" v={<span className="text-gold">{pie.lastError}</span>} />}
            </dl>
            <Link href="/methodology" className="mt-3 inline-block text-[12.5px] text-accent hover:underline">
              How these numbers are calculated →
            </Link>
          </section>

          <CopyHoldings pie={pie} />
        </aside>
      </div>

      {related.length > 0 && (
        <section className="pt-2">
          <h2 className="mb-3 text-[17px] font-semibold">Similar pies</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {related.map((r) => (
              <div key={r.id} className="relative">
                <PieCard pie={r} />
                <span className="pointer-events-none absolute bottom-[54px] right-4 text-[11px] text-dim tabular">
                  {pct(r.overlap, { sign: false, digits: 0 })} overlap
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Row({ k, v, icon }: { k: string; v: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted">
        {icon}
        {k}
      </dt>
      <dd className="text-right font-medium tabular" suppressHydrationWarning>
        {v}
      </dd>
    </div>
  );
}

function ActionButton({
  active,
  onClick,
  icon,
  children,
  grow,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-[13.5px] font-medium transition-[color,background-color,transform] active:scale-[0.97]",
        active ? "border-gold/40 bg-gold/10 text-gold" : "border-line bg-surface-2 text-fg hover:border-line-strong",
        grow && "flex-1",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function CopierSpark({ points }: { points: { day: string; copiers: number }[] }) {
  const vals = points.map((p) => p.copiers);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * 100},${30 - ((p.copiers - min) / span) * 28}`).join(" ");
  const delta = vals[vals.length - 1] - vals[0];
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[11.5px] text-dim">
        <span>Copiers since {date(points[0].day)}</span>
        <span className={toneText[tone(delta)]}>
          {delta >= 0 ? "+" : ""}
          {delta.toLocaleString()}
        </span>
      </div>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-1 h-10 w-full">
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function CopyHoldings({ pie }: { pie: PieDetail }) {
  const [copied, setCopied] = useState(false);
  const text = `${pie.name}\n${pie.holdingsDetail.map((h) => `${h.ticker}\t${(h.target * 100).toFixed(1)}%`).join("\n")}`;
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
      <h2 className="text-[15px] font-semibold">Copy holdings</h2>
      <p className="mt-1 text-[12.5px] text-muted">Tickers and target weights, ready to paste into a spreadsheet or your broker.</p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* clipboard blocked */
          }
        }}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-surface-3 text-[13.5px] font-medium hover:bg-line-strong"
      >
        {copied ? <Check size={15} className="text-up" /> : <Copy size={15} />}
        {copied ? "Copied holdings" : "Copy holdings & weights"}
      </button>
    </section>
  );
}
