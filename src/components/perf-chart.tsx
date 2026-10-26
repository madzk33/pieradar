"use client";

import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import clsx from "clsx";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { HistoryResponse } from "@/lib/types";
import { pct, tone, toneText } from "@/lib/format";

const RANGES = ["1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"] as const;

export function PerfChart({ pieId, initialRange = "1Y" }: { pieId: string; initialRange?: (typeof RANGES)[number] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(initialRange);
  const [bench, setBench] = useState(true);
  const gid = useId().replace(/:/g, "");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["history", pieId, range],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/pies/${pieId}/history?range=${range}`, { signal });
      if (!res.ok) throw new Error("history");
      return (await res.json()) as HistoryResponse;
    },
    refetchInterval: 30_000,
    placeholderData: (p) => p,
  });

  const points = data?.points ?? [];
  const benchMap = new Map((data?.benchmark ?? []).map((b) => [b.t.slice(0, 10), b.v]));
  const rows = points.map((p) => ({ t: p.t, v: p.v - 1, b: bench ? (benchMap.get(p.t.slice(0, 10)) ?? null) : null }));
  if (rows.length && bench && data?.benchmark.length) rows[rows.length - 1].b = data.benchmark[data.benchmark.length - 1].v;
  const change = rows.length ? rows[rows.length - 1].v : null;
  const benchChange = data?.benchmark.length ? data.benchmark[data.benchmark.length - 1].v - 1 : null;
  const t = tone(change);
  const color = t === "down" ? "var(--color-down)" : "var(--color-up)";

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium text-muted">Performance · {range}</h2>
          <div className={clsx("mt-1 text-[24px] font-bold tracking-tight tabular", toneText[t])}>{pct(change)}</div>
          {benchChange != null && (
            <div className="mt-0.5 text-[12px] text-muted tabular">
              vs {data?.benchmarkName}: <span className={toneText[tone(benchChange)]}>{pct(benchChange)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setBench((b) => !b)}
          className={clsx(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium",
            bench ? "bg-surface-3 text-fg" : "bg-surface-2 text-dim",
          )}
          aria-pressed={bench}
        >
          <span className="h-0.5 w-4 rounded bg-muted" style={{ backgroundImage: "repeating-linear-gradient(90deg,var(--color-muted) 0 3px,transparent 3px 6px)" }} />
          S&amp;P 500
        </button>
      </div>

      <div className="relative mt-3 h-[240px] md:h-[300px]">
        {isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-muted">
            Chart data unavailable.
            <button type="button" onClick={() => refetch()} className="rounded-full bg-surface-3 px-3 py-1 text-fg">
              Retry
            </button>
          </div>
        ) : isPending ? (
          <div className="skeleton h-full w-full rounded-xl" />
        ) : rows.length < 2 ? (
          <div className="flex h-full items-center justify-center text-center text-[13px] text-muted">
            Not enough price history for this range yet.
            <br />
            Newly listed holdings get history as soon as it exists.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis
                orientation="right"
                tickFormatter={(v: number) => pct(v, { digits: 0 })}
                tick={{ fill: "var(--color-dim)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={["auto", "auto"]}
              />
              <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeDasharray="2 4" />
              <Tooltip
                cursor={{ stroke: "var(--color-line-strong)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { t: string; v: number; b: number | null };
                  return (
                    <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-[12px] shadow-xl">
                      <div className="text-muted">
                        {new Date(p.t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      <div className={clsx("font-semibold tabular", toneText[tone(p.v)])}>Pie {pct(p.v)}</div>
                      {p.b != null && <div className="tabular text-muted">S&amp;P 500 {pct(p.b - 1)}</div>}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#g${gid})`} isAnimationActive={false} />
              {bench && (
                <Line
                  type="monotone"
                  dataKey={(d: { b: number | null }) => (d.b == null ? null : d.b - 1)}
                  stroke="var(--color-muted)"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold tabular transition-colors",
              range === r ? "bg-surface-3 text-fg" : "text-dim hover:text-fg",
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </section>
  );
}
