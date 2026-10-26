"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { IndexStats } from "@/lib/repo";
import { ago, duration } from "@/lib/format";
import { LiveDot } from "./live-dot";

const JOB_INFO: Record<string, { label: string; cadence: string; staleAfter: number }> = {
  discover: { label: "Discovery sweep", cadence: "every 3–5 min", staleAfter: 15 * 60 },
  refresh: { label: "Pie refresh (tiered)", cadence: "continuous", staleAfter: 5 * 60 },
  quotes: { label: "Live quotes", cadence: "every 20–60s", staleAfter: 20 * 60 },
  metrics: { label: "Return re-marking", cadence: "after each quote pull", staleAfter: 20 * 60 },
  history: { label: "Daily price history", cadence: "hourly", staleAfter: 3 * 3600 },
};

export function Status({ initial }: { initial: IndexStats }) {
  const { data } = useQuery({
    queryKey: ["status"],
    queryFn: async () => (await (await fetch("/api/status", { cache: "no-store" })).json()) as IndexStats,
    initialData: initial,
    refetchInterval: 10_000,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const s = data;
  const tierTotal = s.hot + s.warm + s.cold || 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Index status</h1>
        <p className="mt-1 flex items-center gap-2 text-[13.5px] text-muted">
          <LiveDot stale={s.overdue > s.active * 0.05} /> How complete and how fresh the index is, right now.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Public pies indexed" value={s.active.toLocaleString()} />
        <Stat label="New in 24h" value={`+${s.new24h.toLocaleString()}`} tone={s.new24h ? "up" : undefined} />
        <Stat label="Removed in 24h" value={s.removed24h.toLocaleString()} tone={s.removed24h ? "down" : undefined} sub="deleted or made private" />
        <Stat label="Awaiting first sync" value={s.pending.toLocaleString()} sub="discovered, syncing now" />
        <Stat label="Median pie data age" value={duration(s.freshP50)} />
        <Stat label="95th pct data age" value={duration(s.freshP95)} />
        <Stat label="Prices updated" value={ago(s.lastQuote, now)} />
        <Stat label="Overdue syncs" value={s.overdue.toLocaleString()} tone={s.overdue ? "warn" : undefined} sub={s.erroring ? `${s.erroring} retrying after errors` : "none erroring"} />
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
        <h2 className="text-[15px] font-semibold">Refresh tiers</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Popular and brand-new pies are re-synced most often.</p>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div className="bg-down" style={{ width: `${(s.hot / tierTotal) * 100}%` }} />
          <div className="bg-gold" style={{ width: `${(s.warm / tierTotal) * 100}%` }} />
          <div className="bg-accent" style={{ width: `${(s.cold / tierTotal) * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
          <Tier color="bg-down" name="Hot · every 5 min" n={s.hot} rule="≥10K copiers or < 1 day old" />
          <Tier color="bg-gold" name="Warm · every 30 min" n={s.warm} rule="≥500 copiers or < 14 days old" />
          <Tier color="bg-accent" name="Cold · every 6 h" n={s.cold} rule="everything else" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <h2 className="px-4 pt-4 text-[15px] font-semibold md:px-5">Pipeline jobs</h2>
        <ul className="mt-2">
          {Object.entries(JOB_INFO).map(([key, info]) => {
            const j = s.jobs.find((x) => x.job === key);
            const age = j ? (now - Date.parse(j.startedAt)) / 1000 : Infinity;
            const state = !j ? "never" : j.status === "error" ? "error" : j.status === "running" ? "running" : age > info.staleAfter ? "stale" : "ok";
            return (
              <li key={key} className="flex items-start gap-3 border-t border-line px-4 py-3 md:px-5">
                <span
                  className={clsx(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    state === "ok" ? "bg-up" : state === "running" ? "animate-pulse bg-accent" : state === "error" ? "bg-down" : "bg-gold",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13.5px] font-medium">{info.label}</span>
                    <span className="text-[12px] text-muted">
                      {j ? `${state === "running" ? "started" : "ran"} ${ago(j.startedAt, now)}` : "not run yet"} · {info.cadence}
                    </span>
                  </div>
                  {j?.error && <div className="mt-0.5 truncate text-[12px] text-down">{j.error}</div>}
                  {j && Object.keys(j.stats ?? {}).length > 0 && (
                    <div className="mt-0.5 truncate font-mono text-[11px] text-dim">
                      {Object.entries(j.stats)
                        .map(([k, v]) => `${k}=${v}`)
                        .join("  ")}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {s.lastSweep && (
        <p className="text-[12.5px] text-muted">
          Last full discovery sweep finished {ago(s.lastSweep.at, now)}; {s.lastSweep.flagged} pies were missing from it and queued for removal checks.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "warn" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="text-[11.5px] text-dim">{label}</div>
      <div className={clsx("mt-1 text-[20px] font-bold tabular", tone === "up" && "text-up", tone === "down" && "text-down", tone === "warn" && "text-gold")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-dim">{sub}</div>}
    </div>
  );
}

function Tier({ color, name, n, rule }: { color: string; name: string; n: number; rule: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="font-medium">{name}</span>
      </div>
      <div className="mt-0.5 font-semibold tabular">{n.toLocaleString()}</div>
      <div className="text-[11px] text-dim">{rule}</div>
    </div>
  );
}
