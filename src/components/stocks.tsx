"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RefreshCw, Search, ChevronRight } from "lucide-react";
import type { StockRank, StockRankingResponse } from "@/lib/repo";
import { compact, pct, price, tone, toneText } from "@/lib/format";
import { InstrumentLogo } from "./instrument-logo";
import { StateBox } from "./discover";

const TOP_PRESETS = [20, 30, 40, 50, 75, 100];

type View = "owned" | "top";

export function Stocks() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: View = sp.get("view") === "top" ? "top" : "owned";
  const topN = clampN(Number(sp.get("n")) || 20);
  const [custom, setCustom] = useState(String(topN));
  const [filter, setFilter] = useState("");

  useEffect(() => setCustom(String(topN)), [topN]);

  const setParams = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const scope = view === "top" ? "all" : "current";
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["stocks", scope, view === "top" ? topN : "all"],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ scope, ...(view === "top" ? { limit: String(topN) } : {}) });
      const res = await fetch(`/api/stocks?${qs}`, { signal });
      if (!res.ok) throw new Error("stocks");
      return (await res.json()) as StockRankingResponse;
    },
    refetchInterval: 60_000,
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const items = data?.items ?? [];
    return f ? items.filter((s) => s.ticker.toLowerCase().includes(f) || s.name.toLowerCase().includes(f)) : items;
  }, [data, filter]);
  const max = data?.items[0]?.pies ?? 1;

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Most owned stocks</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Every stock ranked by how many pies hold it, from the most held to the least.
          </p>
        </div>
        {isFetching && <RefreshCw size={14} className="mb-1 animate-spin text-dim" />}
      </div>

      <div className="inline-flex rounded-full bg-surface-2 p-1" role="tablist">
        {(
          [
            ["owned", "All stocks"],
            ["top", "All-time top"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            type="button"
            onClick={() => setParams({ view: v === "owned" ? null : v })}
            className={clsx(
              "rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors",
              view === v ? "bg-fg text-bg" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "top" ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-3 md:p-4">
          <div className="text-[12.5px] text-muted">
            Top stocks across <strong className="text-fg">every pie ever indexed</strong>, including pies since deleted or made private.
            Highest first.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-dim">Show top</span>
            {TOP_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setParams({ view: "top", n })}
                className={clsx(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-semibold tabular transition-colors",
                  topN === n ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {n}
              </button>
            ))}
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ view: "top", n: clampN(Number(custom)) });
              }}
            >
              <input
                type="number"
                min={1}
                max={1000}
                inputMode="numeric"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-label="Custom number of stocks"
                className="h-8 w-20 rounded-full border border-line bg-surface-2 px-3 text-[16px] tabular outline-none focus:border-accent md:text-[13px]"
              />
              <button type="submit" className="h-8 rounded-full bg-surface-3 px-3 text-[12.5px] font-medium hover:bg-line-strong">
                Apply
              </button>
            </form>
          </div>
        </div>
      ) : (
        <label className="relative mt-4 block max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a stock"
            className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[16px] outline-none placeholder:text-dim focus:border-accent md:text-[14px]"
          />
        </label>
      )}

      <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted tabular">
        <span>
          {data
            ? view === "top"
              ? `Top ${Math.min(topN, data.totalStocks)} of ${data.totalPies.toLocaleString()} pies`
              : `${data.totalStocks.toLocaleString()} stocks across ${data.totalPies.toLocaleString()} pies`
            : "Loading…"}
        </span>
        <span className="hidden sm:inline">Click a stock to see every pie that holds it</span>
      </div>

      <div className="mt-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {isPending ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="skeleton h-4 w-6 rounded" />
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-24 rounded" />
                <div className="skeleton h-2 w-full rounded" />
              </div>
            </div>
          ))
        ) : isError ? (
          <div className="p-4">
            <StateBox icon={<RefreshCw size={22} />} title="Couldn't load stocks" body="Try again in a moment." action={{ label: "Retry", onClick: () => refetch() }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <StateBox icon={<Search size={22} />} title="No stocks found" body={filter ? `Nothing matches “${filter}”.` : "No pies are indexed yet."} />
          </div>
        ) : (
          <ol>
            {rows.map((s) => (
              <StockRow key={s.ticker} s={s} max={max} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function StockRow({ s, max }: { s: StockRank; max: number }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link
        href={`/?ticker=${encodeURIComponent(s.ticker)}`}
        className="grid grid-cols-[28px_32px_1fr_auto_16px] items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[36px_36px_minmax(0,1.3fr)_minmax(0,1fr)_110px_90px_16px] md:px-4"
      >
        <span
          className={clsx(
            "text-center text-[13.5px] font-bold tabular",
            s.rank === 1 ? "text-gold" : s.rank === 2 ? "text-[#c9d1dc]" : s.rank === 3 ? "text-[#d08c5b]" : "text-dim",
          )}
        >
          {s.rank}
        </span>
        <InstrumentLogo ticker={s.ticker} domain={s.domain} color={s.color} size={32} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold">{s.ticker}</span>
            <span className="truncate text-[12px] text-muted">{s.name}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-surface-3 md:hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(s.pies / max) * 100}%` }} />
          </div>
        </div>
        <div className="hidden md:block">
          <div className="h-2 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(s.pies / max) * 100}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-dim tabular">
            avg weight {pct(s.avgWeight, { sign: false, digits: 1 })}
            {s.copierReach > 0 && <> · {compact(s.copierReach)} copiers reached</>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-bold tabular">{s.pies.toLocaleString()}</div>
          <div className="text-[11px] text-muted tabular">{pct(s.share, { sign: false, digits: 1 })} of pies</div>
        </div>
        <div className="hidden text-right md:block">
          <div className="text-[12.5px] tabular">{price(s.price, s.currency)}</div>
          <div className={clsx("text-[11.5px] font-medium tabular", toneText[tone(s.dayChange)])}>{pct(s.dayChange)}</div>
        </div>
        <ChevronRight size={16} className="text-dim" />
      </Link>
    </li>
  );
}

function clampN(n: number) {
  return Math.max(1, Math.min(1000, Math.round(n) || 20));
}
