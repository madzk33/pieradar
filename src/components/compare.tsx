"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowLeftRight, Plus, Search, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryResponse, PieDetail, PieListResponse } from "@/lib/types";
import { compact, pct, sliceColor, tone, toneText } from "@/lib/format";
import { COMPARE_MAX, useCollections } from "./collections";
import { PieGlyph } from "./pie-glyph";
import { StateBox } from "./discover";

const COLORS = ["#2e8cff", "#23c26b", "#f5b942", "#a66bff"];
const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;

type Metric = { label: string; get: (p: PieDetail) => number | null; fmt: (v: number | null) => string; better: "high" | "low" | null; colored?: boolean };
const METRICS: Metric[] = [
  { label: "Today", get: (p) => p.metrics.day1, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "1M", get: (p) => p.metrics.m1, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "3M", get: (p) => p.metrics.m3, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "6M", get: (p) => p.metrics.m6, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "YTD", get: (p) => p.metrics.ytd, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "1Y (uncapped)", get: (p) => p.metrics.y1, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "Avg annual return", get: (p) => p.metrics.aar, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "All-time", get: (p) => p.metrics.allTime, fmt: (v) => pct(v), better: "high", colored: true },
  { label: "Volatility (1Y)", get: (p) => p.metrics.volatility, fmt: (v) => pct(v, { sign: false, digits: 1 }), better: "low" },
  { label: "Max drawdown (1Y)", get: (p) => p.metrics.maxDrawdown, fmt: (v) => pct(v, { digits: 1 }), better: "high", colored: true },
  { label: "Holdings", get: (p) => p.holdingsCount, fmt: (v) => String(v ?? "—"), better: null },
  { label: "Copiers", get: (p) => p.copiers, fmt: (v) => compact(v), better: "high" },
];

export function Compare() {
  const sp = useSearchParams();
  const router = useRouter();
  const { compare, toggleCompare, ready } = useCollections();
  const urlIds = sp.get("ids")?.split(",").filter(Boolean).slice(0, COMPARE_MAX);
  const ids = useMemo(() => (urlIds?.length ? urlIds : compare), [urlIds?.join(","), compare]); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState<(typeof RANGES)[number]>("1Y");

  // Keep URL shareable.
  useEffect(() => {
    if (!ready) return;
    const want = ids.join(",");
    if ((sp.get("ids") ?? "") !== want) router.replace(want ? `/compare?ids=${want}` : "/compare", { scroll: false });
  }, [ids, ready, router, sp]);

  const setIds = (next: string[]) => {
    // Sync tray to the explicit list.
    for (const id of compare) if (!next.includes(id)) toggleCompare(id);
    for (const id of next) if (!compare.includes(id)) toggleCompare(id);
    router.replace(next.length ? `/compare?ids=${next.join(",")}` : "/compare", { scroll: false });
  };

  const pies = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["pie", id],
      queryFn: async () => {
        const res = await fetch(`/api/pies/${id}`);
        if (!res.ok) throw new Error("pie");
        return ((await res.json()) as { pie: PieDetail }).pie;
      },
      refetchInterval: 30_000,
    })),
  });
  const histories = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["history", id, range],
      queryFn: async () => {
        const res = await fetch(`/api/pies/${id}/history?range=${range}`);
        if (!res.ok) throw new Error("history");
        return (await res.json()) as HistoryResponse;
      },
      placeholderData: (p: HistoryResponse | undefined) => p,
    })),
  });

  const loaded = pies.map((q) => q.data).filter(Boolean) as PieDetail[];

  const chartRows = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    histories.forEach((h, k) => {
      h.data?.points.forEach((p) => {
        const day = p.t.slice(0, 10);
        const row = byDay.get(day) ?? { t: day };
        row[`p${k}`] = p.v - 1;
        byDay.set(day, row);
      });
    });
    return [...byDay.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)));
  }, [histories]);

  if (ready && ids.length === 0) {
    return (
      <div>
        <Header />
        <StateBox icon={<ArrowLeftRight size={22} />} title="Pick pies to compare" body="Add up to four pies with the compare button on any card, or search below." />
        <div className="mx-auto mt-6 max-w-md">
          <AddPie onAdd={(id) => setIds([id])} exclude={[]} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />

      {/* Selected pies */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(ids.length + (ids.length < COMPARE_MAX ? 1 : 0), 4)}, minmax(0,1fr))` }}>
        {ids.map((id, k) => {
          const p = pies[k]?.data;
          return (
            <div key={id} className="relative rounded-2xl border border-line bg-surface p-3" style={{ borderTopColor: COLORS[k], borderTopWidth: 3 }}>
              <button type="button" aria-label="Remove" onClick={() => setIds(ids.filter((x) => x !== id))} className="absolute right-2 top-2 rounded-full p-1 text-dim hover:bg-surface-3 hover:text-fg">
                <X size={14} />
              </button>
              {p ? (
                <Link href={`/pie/${id}`} className="flex items-center gap-2 pr-5">
                  <PieGlyph weights={p.holdingsDetail.map((h) => h.target)} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{p.name}</div>
                    <div className="truncate text-[11px] text-muted">{p.creatorName}</div>
                  </div>
                </Link>
              ) : pies[k]?.isError ? (
                <div className="text-[12px] text-muted">No longer available</div>
              ) : (
                <div className="skeleton h-8 rounded" />
              )}
            </div>
          );
        })}
        {ids.length < COMPARE_MAX && (
          <div className="hidden md:block">
            <AddPie onAdd={(id) => setIds([...ids, id])} exclude={ids} compact />
          </div>
        )}
      </div>
      {ids.length < COMPARE_MAX && (
        <div className="mt-2 md:hidden">
          <AddPie onAdd={(id) => setIds([...ids, id])} exclude={ids} />
        </div>
      )}

      {/* Chart */}
      <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Performance</h2>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={clsx("rounded-full px-2.5 py-1 text-[12px] font-semibold", range === r ? "bg-surface-3 text-fg" : "text-dim hover:text-fg")}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-[280px]">
          {chartRows.length < 2 ? (
            <div className="skeleton h-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="t" hide />
                <YAxis orientation="right" tickFormatter={(v: number) => pct(v, { digits: 0 })} tick={{ fill: "var(--color-dim)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-[12px] shadow-xl">
                        <div className="mb-1 text-muted">{new Date(String(label)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                        {payload.map((pl) => {
                          const k = Number(String(pl.dataKey).slice(1));
                          return (
                            <div key={String(pl.dataKey)} className="flex items-center justify-between gap-4 tabular">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />
                                <span className="max-w-[140px] truncate">{loaded[k]?.name ?? ids[k]}</span>
                              </span>
                              <span className={toneText[tone(pl.value as number)]}>{pct(pl.value as number)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null
                  }
                />
                {ids.map((id, k) => (
                  <Line key={id} type="monotone" dataKey={`p${k}`} stroke={COLORS[k]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Metrics */}
      {loaded.length > 0 && (
        <section className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="w-full min-w-[480px] text-[13px]">
            <tbody>
              {METRICS.map((m) => {
                const vals = ids.map((_, k) => (pies[k]?.data ? m.get(pies[k].data!) : null));
                const nums = vals.filter((v): v is number => v != null);
                const best = m.better && nums.length > 1 ? (m.better === "high" ? Math.max(...nums) : Math.min(...nums)) : null;
                return (
                  <tr key={m.label} className="border-b border-line/60 last:border-0">
                    <th className="w-[34%] px-4 py-2.5 text-left font-medium text-muted">{m.label}</th>
                    {vals.map((v, k) => (
                      <td
                        key={k}
                        className={clsx(
                          "px-3 py-2.5 text-right font-semibold tabular",
                          m.colored && toneText[tone(v)],
                          best != null && v === best && "underline decoration-2 underline-offset-4",
                        )}
                        style={best != null && v === best ? { textDecorationColor: COLORS[k] } : undefined}
                      >
                        {m.fmt(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Overlap */}
      {loaded.length > 1 && <Overlap pies={ids.map((_, k) => pies[k]?.data ?? null)} />}
    </div>
  );
}

function Header() {
  return (
    <div className="mb-5">
      <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Compare</h1>
      <p className="mt-1 text-[13.5px] text-muted">Side by side, uncapped. Best value in each row is underlined.</p>
    </div>
  );
}

function Overlap({ pies }: { pies: (PieDetail | null)[] }) {
  const pairs: { a: number; b: number; overlap: number; shared: string[] }[] = [];
  for (let a = 0; a < pies.length; a++)
    for (let b = a + 1; b < pies.length; b++) {
      const pa = pies[a];
      const pb = pies[b];
      if (!pa || !pb) continue;
      const wb = new Map(pb.holdingsDetail.map((h) => [h.ticker, h.target]));
      let overlap = 0;
      const shared: string[] = [];
      for (const h of pa.holdingsDetail) {
        const w = wb.get(h.ticker);
        if (w != null) {
          overlap += Math.min(w, h.target);
          shared.push(h.ticker);
        }
      }
      pairs.push({ a, b, overlap, shared });
    }
  return (
    <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
      <h2 className="text-[15px] font-semibold">Holdings overlap</h2>
      <p className="mt-0.5 text-[12px] text-muted">Share of allocation two pies have in common (sum of the smaller weight per shared holding).</p>
      <ul className="mt-3 space-y-3">
        {pairs.map((p) => (
          <li key={`${p.a}-${p.b}`}>
            <div className="flex items-center justify-between text-[13px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[p.a] }} />
                <span className="truncate">{pies[p.a]?.name}</span>
                <span className="text-dim">×</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[p.b] }} />
                <span className="truncate">{pies[p.b]?.name}</span>
              </span>
              <span className="ml-3 font-semibold tabular">{pct(p.overlap, { sign: false, digits: 0 })}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-3">
              <div className="h-full rounded-full" style={{ width: `${p.overlap * 100}%`, background: sliceColor(p.a + p.b) }} />
            </div>
            {p.shared.length > 0 && <div className="mt-1 truncate text-[11px] text-dim">Shared: {p.shared.join(", ")}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddPie({ onAdd, exclude, compact: isCompact }: { onAdd: (id: string) => void; exclude: string[]; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useQuery({
    queryKey: ["compare-search", debounced],
    enabled: debounced.length > 1,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/pies?q=${encodeURIComponent(debounced)}&limit=6&sort=copiers`, { signal });
      return (await res.json()) as PieListResponse;
    },
  });
  const results = (data?.items ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className={clsx("relative", isCompact && "h-full")}>
      <label className={clsx("flex items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface/50 px-3 text-muted focus-within:border-accent", isCompact ? "h-full min-h-[58px]" : "h-12")}>
        {q ? <Search size={15} /> : <Plus size={15} />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Add a pie…"
          className="w-full bg-transparent text-[16px] text-fg outline-none placeholder:text-muted md:text-[13.5px]"
        />
      </label>
      {results.length > 0 && q && (
        <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-2xl">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(p.id);
                  setQ("");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-3"
              >
                <PieGlyph weights={p.holdings.map((h) => h.weight ?? 0)} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted">{p.creatorName}</span>
                </span>
                <span className={clsx("text-[12.5px] font-semibold tabular", toneText[tone(p.metrics.y1)])}>{pct(p.metrics.y1)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
