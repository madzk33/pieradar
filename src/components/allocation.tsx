"use client";

import { useState } from "react";
import clsx from "clsx";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { HoldingRow } from "@/lib/types";
import { pct, sliceColor } from "@/lib/format";
import { InstrumentLogo } from "./instrument-logo";

/** Target (inner ring) vs actual (outer ring) with a per-holding drift list. */
export function Allocation({ holdings, since }: { holdings: HoldingRow[]; since: string }) {
  const [active, setActive] = useState<string | null>(null);
  const focus = holdings.find((h) => h.ticker === active) ?? null;
  const maxW = Math.max(...holdings.map((h) => Math.max(h.target, h.actual)), 0.01);
  const drift = holdings.reduce((a, h) => a + Math.abs(h.actual - h.target), 0) / 2;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Allocation</h2>
        <span className="text-[12px] text-muted">
          Drift from target <span className="font-semibold text-fg tabular">{pct(drift, { sign: false })}</span>
        </span>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="relative mx-auto h-[220px] w-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={holdings}
                dataKey="target"
                nameKey="ticker"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={holdings.length > 1 ? 1 : 0}
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, i) => setActive(holdings[i].ticker)}
                onMouseLeave={() => setActive(null)}
              >
                {holdings.map((h, i) => (
                  <Cell key={h.ticker} fill={sliceColor(i)} opacity={active && active !== h.ticker ? 0.35 : 1} />
                ))}
              </Pie>
              <Pie
                data={holdings}
                dataKey="actual"
                nameKey="ticker"
                innerRadius={80}
                outerRadius={100}
                paddingAngle={holdings.length > 1 ? 1 : 0}
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, i) => setActive(holdings[i].ticker)}
                onMouseLeave={() => setActive(null)}
              >
                {holdings.map((h, i) => (
                  <Cell key={h.ticker} fill={sliceColor(i)} opacity={active && active !== h.ticker ? 0.25 : 0.7} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {focus ? (
              <>
                <span className="text-[13px] font-semibold">{focus.ticker}</span>
                <span className="text-[11px] text-muted tabular">target {pct(focus.target, { sign: false, digits: 1 })}</span>
                <span className="text-[11px] text-muted tabular">actual {pct(focus.actual, { sign: false, digits: 1 })}</span>
              </>
            ) : (
              <>
                <span className="text-[20px] font-bold tabular">{holdings.length}</span>
                <span className="text-[11px] text-muted">holdings</span>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-4 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-fg" /> Target (inner)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-fg/50" /> Actual since {new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} (outer)
            </span>
          </div>
          <ul className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
            {holdings.map((h, i) => {
              const d = h.actual - h.target;
              return (
                <li
                  key={h.ticker}
                  onMouseEnter={() => setActive(h.ticker)}
                  onMouseLeave={() => setActive(null)}
                  className={clsx("grid grid-cols-[22px_56px_1fr_auto] items-center gap-2 rounded-lg px-1.5 py-1", active === h.ticker && "bg-surface-2")}
                >
                  <InstrumentLogo ticker={h.ticker} domain={h.domain} color={h.color} size={20} />
                  <span className="truncate text-[12.5px] font-medium">{h.ticker}</span>
                  <div className="relative h-2 rounded-full bg-surface-3">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(h.target / maxW) * 100}%`, background: sliceColor(i) }} />
                    <div
                      className="absolute -top-1 h-4 w-0.5 rounded bg-fg"
                      style={{ left: `calc(${(h.actual / maxW) * 100}% - 1px)` }}
                      title={`Actual ${pct(h.actual, { sign: false })}`}
                    />
                  </div>
                  <span className={clsx("w-14 text-right text-[11.5px] tabular", Math.abs(d) < 0.0005 ? "text-dim" : d > 0 ? "text-up" : "text-down")}>
                    {pct(d, { digits: 1 })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
