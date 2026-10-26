"use client";

import Link from "next/link";
import { memo } from "react";
import clsx from "clsx";
import { Star, Users, Layers, ArrowLeftRight } from "lucide-react";
import type { PieCardData } from "@/lib/types";
import { compact, pct, tone, toneText } from "@/lib/format";
import { FlashValue, useLive } from "./live";
import { useCollections } from "./collections";
import { InstrumentLogo } from "./instrument-logo";
import { PieGlyph } from "./pie-glyph";
import { OriginBadge } from "./origin-badge";

/**
 * Pie card — pie mark, name, big return,
 * holdings logo row) but the headline is the real, uncapped 1Y return.
 */
export const PieCard = memo(function PieCard({ pie, rank }: { pie: PieCardData; rank?: number }) {
  const live = useLive(pie.id);
  const y1 = live?.y1 !== undefined ? live.y1 : pie.metrics.y1;
  const day1 = live?.day1 !== undefined ? live.day1 : pie.metrics.day1;
  const copiers = live?.copiers ?? pie.copiers;
  const removed = live?.removed ?? false;
  const { isWatched, toggleWatch, inCompare, toggleCompare } = useCollections();
  const watched = isWatched(pie.id);
  const comparing = inCompare(pie.id);
  const t = tone(y1);
  const extra = pie.holdingsCount - Math.min(5, pie.holdings.length);

  return (
    <article
      className={clsx(
        "group relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors duration-200 hover-lift",
        removed && "opacity-50",
      )}
    >
      <Link href={`/pie/${pie.id}`} className="absolute inset-0 z-0 rounded-[var(--radius-card)]" aria-label={`Open ${pie.name}`} />

      <header className="flex items-start gap-3">
        <div className="relative">
          <PieGlyph weights={pie.holdings.map((h) => h.weight ?? 0)} />
          {rank != null && (
            <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular text-white">
              {rank}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-fg">{pie.name}</h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {pie.kind === "model" ? <span className="text-gold">Model pie</span> : <>by {pie.creatorName}</>} · {pie.category}
          </p>
        </div>
        <div className="relative z-10 -mr-1.5 -mt-1.5 flex">
          <IconButton
            label={comparing ? "Remove from compare" : "Add to compare"}
            active={comparing}
            onClick={() => toggleCompare(pie.id)}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden"
          >
            <ArrowLeftRight size={16} />
          </IconButton>
          <IconButton label={watched ? "Remove from watchlist" : "Save to watchlist"} active={watched} onClick={() => toggleWatch(pie.id)}>
            <Star size={17} fill={watched ? "currentColor" : "none"} />
          </IconButton>
        </div>
      </header>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <FlashValue value={y1} className={clsx("-mx-1 px-1 text-[28px] font-bold leading-none tracking-tight tabular", toneText[t])}>
            {pct(y1)}
          </FlashValue>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            <span>1Y return</span>
            <span
              className="rounded-[5px] bg-accent-soft px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-accent"
              title="Calculated from live prices — never clipped"
            >
              Uncapped
            </span>
          </div>
        </div>
        <div className="text-right">
          <FlashValue value={day1} className={clsx("px-1 text-[13px] font-semibold tabular", toneText[tone(day1)])}>
            {pct(day1)}
          </FlashValue>
          <div className="mt-0.5 text-[11px] text-dim">today</div>
        </div>
      </div>


      <footer className="mt-auto flex items-center justify-between pt-4">
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {pie.holdings.slice(0, 5).map((h) => (
              <InstrumentLogo key={h.ticker} ticker={h.ticker} domain={h.domain} color={h.color} size={26} ring />
            ))}
          </div>
          {extra > 0 && <span className="ml-1.5 text-[12px] font-medium text-muted tabular">+{extra}</span>}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-muted tabular">
          <OriginBadge origin={pie.origin} compact />
          <span className="flex items-center gap-1" title="Holdings">
            <Layers size={13} /> {pie.holdingsCount}
          </span>
          {copiers != null && (
            <span className="flex items-center gap-1" title={`${copiers.toLocaleString()} copiers`}>
              <Users size={13} /> {compact(copiers)}
            </span>
          )}
        </div>
      </footer>
    </article>
  );
});

function IconButton({
  label,
  active,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "flex h-9 w-9 items-center justify-center rounded-full transition-[color,background-color,transform] duration-150 active:scale-90",
        active ? "text-gold" : "text-dim hover:bg-surface-3 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PieCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex gap-3">
        <div className="skeleton h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3.5 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="skeleton mt-5 h-7 w-32 rounded" />
      <div className="skeleton mt-2 h-3 w-24 rounded" />
      <div className="mt-auto flex gap-1 pt-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-[26px] w-[26px] rounded-full" />
        ))}
      </div>
    </div>
  );
}
