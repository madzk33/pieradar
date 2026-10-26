"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { HoldingRow } from "@/lib/types";
import { ago, pct, price, tone, toneText } from "@/lib/format";
import { InstrumentLogo } from "./instrument-logo";
import { FlashValue } from "./live";

type Col = "ticker" | "target" | "actual" | "price" | "dayChange" | "y1";

const COLS: { key: Col; label: string; className?: string }[] = [
  { key: "ticker", label: "Instrument" },
  { key: "target", label: "Target", className: "text-right" },
  { key: "actual", label: "Actual", className: "text-right" },
  { key: "price", label: "Price", className: "text-right hidden md:table-cell" },
  { key: "dayChange", label: "Today", className: "text-right" },
  { key: "y1", label: "1Y", className: "text-right hidden sm:table-cell" },
];

export function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  const [sort, setSort] = useState<{ key: Col; dir: 1 | -1 }>({ key: "target", dir: -1 });
  const rows = useMemo(() => {
    const out = [...holdings];
    out.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * sort.dir;
    });
    return out;
  }, [holdings, sort]);
  const oldestQuote = holdings.reduce<string | null>((a, h) => (!h.quoteAt ? a : !a || h.quoteAt < a ? h.quoteAt : a), null);

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-baseline justify-between px-4 pt-4 md:px-5">
        <h2 className="text-[15px] font-semibold">Holdings · {holdings.length}</h2>
        <span className="text-[11.5px] text-dim">prices {ago(oldestQuote)}</span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] text-dim">
              {COLS.map((c) => (
                <th key={c.key} className={clsx("px-3 py-2 font-medium first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5", c.className, !c.className && "text-left")}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 hover:text-fg"
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : -1 }))}
                  >
                    {c.label}
                    {sort.key === c.key && (sort.dir === -1 ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.ticker} className="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
                <td className="py-2.5 pl-4 pr-3 md:pl-5">
                  <div className="flex items-center gap-2.5">
                    <InstrumentLogo ticker={h.ticker} domain={h.domain} color={h.color} size={30} />
                    <div className="min-w-0">
                      <div className="font-semibold">{h.ticker}</div>
                      <div className="max-w-[160px] truncate text-[11.5px] text-muted md:max-w-[240px]">{h.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 text-right tabular">{pct(h.target, { sign: false, digits: 1 })}</td>
                <td className="px-3 text-right tabular text-muted">{pct(h.actual, { sign: false, digits: 1 })}</td>
                <td className="hidden px-3 text-right tabular md:table-cell">
                  <FlashValue value={h.price} className="px-1">
                    {price(h.price, h.currency)}
                  </FlashValue>
                </td>
                <td className={clsx("px-3 text-right font-medium tabular", toneText[tone(h.dayChange)])}>{pct(h.dayChange)}</td>
                <td className={clsx("hidden px-3 pr-4 text-right tabular sm:table-cell md:pr-5", toneText[tone(h.y1)])}>
                  {h.y1 == null ? <span className="text-dim" title="Less than a year of price history">new</span> : pct(h.y1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
