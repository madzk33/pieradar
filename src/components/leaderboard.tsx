"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { RefreshCw } from "lucide-react";
import type { PieCardData, PieListResponse, SortKey } from "@/lib/types";
import { compact, pct, tone, toneText } from "@/lib/format";
import { FlashValue, useLive } from "./live";
import { PieGlyph } from "./pie-glyph";
import { InstrumentLogo } from "./instrument-logo";
import { StateBox } from "./discover";

const BOARDS: { key: SortKey; label: string; metric: (p: PieCardData) => number | null; isPct: boolean }[] = [
  { key: "y1", label: "1 year", metric: (p) => p.metrics.y1, isPct: true },
  { key: "aar", label: "Avg annual", metric: (p) => p.metrics.aar, isPct: true },
  { key: "ytd", label: "YTD", metric: (p) => p.metrics.ytd, isPct: true },
  { key: "m3", label: "3 months", metric: (p) => p.metrics.m3, isPct: true },
  { key: "m1", label: "1 month", metric: (p) => p.metrics.m1, isPct: true },
  { key: "day1", label: "Today", metric: (p) => p.metrics.day1, isPct: true },
  { key: "copiers", label: "Most copied", metric: (p) => p.copiers, isPct: false },
];

const MIN_COPIERS = [
  { label: "All pies", v: 0 },
  { label: "10+ copiers", v: 10 },
  { label: "100+ copiers", v: 100 },
  { label: "1K+ copiers", v: 1000 },
];

export function Leaderboard() {
  const [board, setBoard] = useState(BOARDS[0]);
  const [minCopiers, setMinCopiers] = useState(10);

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["leaderboard", board.key, minCopiers],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/pies?sort=${board.key}&limit=100&minCopiers=${minCopiers}`, { signal });
      if (!res.ok) throw new Error("leaderboard");
      return (await res.json()) as PieListResponse;
    },
    refetchInterval: 30_000,
    placeholderData: (p) => p,
  });

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Leaderboard</h1>
          <p className="mt-1 text-[13.5px] text-muted">The highest real-performing pies. Every figure uncapped and marked to live prices.</p>
        </div>
        {isFetching && <RefreshCw size={14} className="mb-1 animate-spin text-dim" />}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {BOARDS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setBoard(b)}
            className={clsx(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              board.key === b.key ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:text-fg",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {MIN_COPIERS.map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => setMinCopiers(m.v)}
            className={clsx(
              "rounded-full border px-3 py-1 text-[12px] transition-colors",
              minCopiers === m.v ? "border-accent text-accent" : "border-line text-dim hover:text-fg",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {isPending ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
              <div className="skeleton h-4 w-6 rounded" />
              <div className="skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-48 rounded" />
                <div className="skeleton h-3 w-28 rounded" />
              </div>
              <div className="skeleton h-5 w-20 rounded" />
            </div>
          ))
        ) : isError ? (
          <div className="p-4">
            <StateBox icon={<RefreshCw size={22} />} title="Couldn't load the leaderboard" body="Try again in a moment." action={{ label: "Retry", onClick: () => refetch() }} />
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-4">
            <StateBox icon={<RefreshCw size={22} />} title="No pies qualify yet" body="Lower the copier threshold to include smaller pies." />
          </div>
        ) : (
          <ol>
            {data.items.map((p, i) => (
              <LeaderRow key={p.id} pie={p} rank={i + 1} board={board} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function LeaderRow({ pie, rank, board }: { pie: PieCardData; rank: number; board: (typeof BOARDS)[number] }) {
  const live = useLive(pie.id);
  const merged: PieCardData = live
    ? { ...pie, copiers: live.copiers, metrics: { ...pie.metrics, y1: live.y1, day1: live.day1, m1: live.m1, aar: live.aar } }
    : pie;
  const v = board.metric(merged);
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/pie/${pie.id}`} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2 md:px-4">
        <span
          className={clsx(
            "w-7 text-center text-[14px] font-bold tabular",
            rank === 1 ? "text-gold" : rank === 2 ? "text-[#c9d1dc]" : rank === 3 ? "text-[#d08c5b]" : "text-dim",
          )}
        >
          {rank}
        </span>
        <PieGlyph weights={pie.holdings.map((h) => h.weight ?? 0)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{pie.name}</div>
          <div className="truncate text-[12px] text-muted">
            {pie.kind === "model" ? "Model pie" : pie.creatorName} · {pie.holdingsCount} holdings · {compact(merged.copiers)} copiers
          </div>
        </div>
        <div className="hidden -space-x-1.5 lg:flex">
          {pie.holdings.slice(0, 5).map((h) => (
            <InstrumentLogo key={h.ticker} ticker={h.ticker} domain={h.domain} color={h.color} size={24} ring />
          ))}
        </div>
        <div className="w-[96px] text-right md:w-[120px]">
          <FlashValue value={v} className={clsx("px-1 text-[16px] font-bold tabular md:text-[18px]", board.isPct ? toneText[tone(v)] : "text-fg")}>
            {board.isPct ? pct(v) : (v ?? 0).toLocaleString()}
          </FlashValue>
          {board.key === "aar" && pie.metrics.aarYears && <div className="text-[10.5px] text-dim">over {pie.metrics.aarYears}Y</div>}
        </div>
      </Link>
    </li>
  );
}
