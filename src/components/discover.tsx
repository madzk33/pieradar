"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Search, SlidersHorizontal, X, ArrowDownWideNarrow, ArrowUpNarrowWide, RefreshCw, SearchX } from "lucide-react";
import { SORTS, type PieListResponse, type SortKey } from "@/lib/types";
import { PieCard, PieCardSkeleton } from "./pie-card";
import { LiveDot } from "./live-dot";

const PAGE = 48;
const ROW_GAP = 12;

export interface DiscoverFilters {
  q: string;
  sort: SortKey;
  dir: "asc" | "desc";
  category: string;
  kind: string;
  minHoldings: string;
  maxHoldings: string;
  minReturn: string;
  maxReturn: string;
  minCopiers: string;
  ticker: string;
  origin: string;
}

const DEFAULTS: DiscoverFilters = {
  q: "",
  sort: "y1",
  dir: "desc",
  category: "",
  kind: "",
  minHoldings: "",
  maxHoldings: "",
  minReturn: "",
  maxReturn: "",
  minCopiers: "",
  ticker: "",
  origin: "",
};

function fromParams(sp: URLSearchParams): DiscoverFilters {
  const f = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof DiscoverFilters)[]) {
    const v = sp.get(k);
    if (v != null) (f as Record<string, string>)[k] = v;
  }
  if (!(f.sort in SORTS)) f.sort = "y1";
  return f;
}

function toQuery(f: DiscoverFilters, extra: Record<string, string | number> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== "" && v !== (DEFAULTS as unknown as Record<string, string>)[k]) sp.set(k, String(v));
  for (const [k, v] of Object.entries(extra)) sp.set(k, String(v));
  return sp;
}

function useColumns(ref: React.RefObject<HTMLElement | null>) {
  const [cols, setCols] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setCols(w >= 1240 ? 4 : w >= 900 ? 3 : w >= 560 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

export function Discover({
  initial,
  categories,
  indexed,
}: {
  initial: PieListResponse | null;
  categories: { category: string; count: number }[];
  indexed: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = useMemo(() => fromParams(new URLSearchParams(sp.toString())), [sp]);
  const [search, setSearch] = useState(filters.q);
  const [sheetOpen, setSheetOpen] = useState(false);

  const update = useCallback(
    (patch: Partial<DiscoverFilters>) => {
      const qs = toQuery({ ...filters, ...patch }).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  // Debounced search → URL.
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => update({ q: search }), 220);
    return () => clearTimeout(t);
  }, [search, filters.q, update]);

  const isDefault = toQuery(filters).toString() === "";
  const query = useInfiniteQuery({
    queryKey: ["pies", filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const res = await fetch(`/api/pies?${toQuery(filters, { offset: pageParam, limit: PAGE })}`, { signal });
      if (!res.ok) throw new Error(res.status === 503 ? "The index is temporarily unavailable." : "Couldn't load pies.");
      return (await res.json()) as PieListResponse;
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    initialData: isDefault && initial ? { pages: [initial], pageParams: [0] } : undefined,
    staleTime: 30_000,
    // Re-fetch the list (new pies, new ranking) every minute while only a few pages are loaded;
    // individual card numbers already update every 15s via the live store.
    refetchInterval: (q) => ((q.state.data?.pages.length ?? 0) <= 3 ? 60_000 : false),
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const gridRef = useRef<HTMLDivElement>(null);
  const cols = useColumns(gridRef);
  const rowCount = Math.ceil(items.length / cols) + (query.hasNextPage ? 1 : 0);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(gridRef.current?.offsetTop ?? 0);
  }, [cols, sheetOpen]);

  const virt = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 214 + ROW_GAP,
    overscan: 3,
    scrollMargin,
  });
  const vItems = virt.getVirtualItems();

  // Infinite load when the loader row comes into range.
  const lastIndex = vItems.at(-1)?.index ?? 0;
  useEffect(() => {
    if (lastIndex >= rowCount - 2 && query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
  }, [lastIndex, rowCount, query]);

  const activeFilterCount = [filters.origin, filters.category, filters.kind, filters.minHoldings || filters.maxHoldings, filters.minReturn || filters.maxReturn, filters.minCopiers].filter(Boolean).length;

  return (
    <div>
      <section className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Discover pies</h1>
          <p className="mt-1 flex items-center gap-2 text-[13.5px] text-muted">
            <LiveDot />
            <span className="tabular">
              <strong className="font-semibold text-fg">{indexed.toLocaleString()}</strong> public pies indexed · updating live
            </span>
          </p>
        </div>
      </section>

      {/* Search + sort + filters */}
      <div className="sticky top-12 z-30 -mx-4 border-b border-transparent bg-bg/90 px-4 pb-3 pt-1 backdrop-blur-xl md:top-14 md:-mx-6 md:px-6">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pies, tickers or creators"
              inputMode="search"
              enterKeyHint="search"
              className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-10 text-[16px] text-fg outline-none transition-colors placeholder:text-dim focus:border-accent md:text-[14.5px]"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-3"
              >
                <X size={15} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={clsx(
              "relative flex h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors",
              activeFilterCount ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-fg hover:border-line-strong",
            )}
          >
            <SlidersHorizontal size={16} />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && <span className="tabular">{activeFilterCount}</span>}
          </button>
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {(Object.keys(SORTS) as SortKey[]).map((k) => {
            const active = filters.sort === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => (active ? update({ dir: filters.dir === "desc" ? "asc" : "desc" }) : update({ sort: k, dir: "desc" }))}
                className={clsx(
                  "flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {SORTS[k]}
                {active && (filters.dir === "desc" ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />)}
              </button>
            );
          })}
        </div>
      </div>

      {filters.ticker && (
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft py-1 pl-3 pr-1 text-[13px] font-medium text-accent">
            Pies holding {filters.ticker}
            <button
              type="button"
              aria-label="Clear stock filter"
              onClick={() => update({ ticker: "" })}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent/20"
            >
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      <div className="mb-3 mt-1 flex h-5 items-center justify-between text-[12.5px] text-muted">
        <span className="tabular">
          {query.isPending ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "pie" : "pies"}`}
          {filters.q && <> matching “{filters.q}”</>}
        </span>
        {query.isFetching && !query.isPending && <RefreshCw size={13} className="animate-spin text-dim" />}
      </div>

      {/* Grid */}
      <div ref={gridRef}>
        {query.isPending ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols * 3 }).map((_, i) => (
              <div key={i} className="h-[214px]">
                <PieCardSkeleton />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <StateBox
            icon={<RefreshCw size={22} />}
            title="Couldn't load the index"
            body={(query.error as Error).message + " Your filters are saved; try again in a moment."}
            action={{ label: "Retry", onClick: () => query.refetch() }}
          />
        ) : items.length === 0 ? (
          <StateBox
            icon={<SearchX size={22} />}
            title="No pies match"
            body={filters.q ? `Nothing found for “${filters.q}”. Try a ticker like NVDA or a creator name.` : "Loosen a filter to see more pies."}
            action={{ label: "Reset filters", onClick: () => (setSearch(""), router.replace(pathname, { scroll: false })) }}
          />
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {vItems.map((row) => {
              const start = row.index * cols;
              const rowItems = items.slice(start, start + cols);
              const isLoader = start >= items.length;
              return (
                <div
                  key={row.key}
                  data-index={row.index}
                  ref={virt.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${row.start - virt.options.scrollMargin}px)`, paddingBottom: ROW_GAP }}
                >
                  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {isLoader
                      ? Array.from({ length: cols }).map((_, i) => (
                          <div key={i} className="h-[214px]">
                            <PieCardSkeleton />
                          </div>
                        ))
                      : rowItems.map((p, i) => (
                          <div key={p.id} className="min-h-[214px]">
                            <PieCard pie={p} rank={filters.sort !== "newest" && filters.dir === "desc" && !filters.q ? start + i + 1 : undefined} />
                          </div>
                        ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!query.hasNextPage && items.length > 0 && (
          <p className="py-8 text-center text-[12.5px] text-dim">That&apos;s every pie matching these filters.</p>
        )}
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        categories={categories}
        onApply={(patch) => {
          update(patch);
          setSheetOpen(false);
        }}
      />
    </div>
  );
}

export function StateBox({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>
      <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] text-muted">{body}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-5 rounded-full bg-surface-3 px-4 py-2 text-[13.5px] font-medium hover:bg-line-strong">
          {action.label}
        </button>
      )}
    </div>
  );
}

const HOLDING_BUCKETS = [
  { label: "Any", min: "", max: "" },
  { label: "1–5", min: "1", max: "5" },
  { label: "6–10", min: "6", max: "10" },
  { label: "11–20", min: "11", max: "20" },
  { label: "21+", min: "21", max: "" },
];
const COPIER_BUCKETS = [
  { label: "Any", v: "" },
  { label: "10+", v: "10" },
  { label: "100+", v: "100" },
  { label: "1K+", v: "1000" },
  { label: "10K+", v: "10000" },
];

function FilterSheet({
  open,
  onClose,
  filters,
  categories,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  categories: { category: string; count: number }[];
  onApply: (patch: Partial<DiscoverFilters>) => void;
}) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const set = (p: Partial<DiscoverFilters>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="safe-bottom fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[24px] border-t border-line bg-surface md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[10vh] md:w-[520px] md:-translate-x-1/2 md:rounded-[24px] md:border"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong md:hidden" />
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="text-[18px] font-semibold">Filters</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-3">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 px-5 pb-4 pt-2">
              <Field label="Source">
                <Chips
                  options={[
                    { label: "All", v: "" },
                    { label: "Real Trading 212 pies", v: "real" },
                    { label: "Simulated", v: "demo" },
                  ]}
                  value={draft.origin}
                  onChange={(v) => set({ origin: v })}
                />
              </Field>
              <Field label="Category">
                <Chips
                  options={[{ label: "All", v: "" }, ...categories.map((c) => ({ label: `${c.category} · ${c.count}`, v: c.category }))]}
                  value={draft.category}
                  onChange={(v) => set({ category: v })}
                />
              </Field>
              <Field label="Type">
                <Chips
                  options={[
                    { label: "All", v: "" },
                    { label: "Community", v: "community" },
                    { label: "Model pies", v: "model" },
                  ]}
                  value={draft.kind}
                  onChange={(v) => set({ kind: v })}
                />
              </Field>
              <Field label="Number of holdings">
                <Chips
                  options={HOLDING_BUCKETS.map((b) => ({ label: b.label, v: `${b.min}-${b.max}` }))}
                  value={`${draft.minHoldings}-${draft.maxHoldings}`}
                  onChange={(v) => {
                    const [min, max] = v.split("-");
                    set({ minHoldings: min, maxHoldings: max });
                  }}
                />
              </Field>
              <Field label="1Y return (uncapped), %">
                <div className="flex items-center gap-2">
                  <NumberInput placeholder="Min e.g. 20" value={draft.minReturn} onChange={(v) => set({ minReturn: v })} />
                  <span className="text-dim">to</span>
                  <NumberInput placeholder="Max" value={draft.maxReturn} onChange={(v) => set({ maxReturn: v })} />
                </div>
                <div className="mt-2 flex gap-2">
                  {[
                    { l: "> 20%", min: "20", max: "" },
                    { l: "> 50%", min: "50", max: "" },
                    { l: "Negative", min: "", max: "0" },
                  ].map((p) => (
                    <button
                      key={p.l}
                      type="button"
                      onClick={() => set({ minReturn: p.min, maxReturn: p.max })}
                      className="rounded-full bg-surface-2 px-3 py-1 text-[12px] text-muted hover:text-fg"
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Copiers">
                <Chips options={COPIER_BUCKETS} value={draft.minCopiers} onChange={(v) => set({ minCopiers: v })} />
              </Field>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface px-5 py-4">
              <button
                type="button"
                onClick={() =>
                  onApply({ origin: "", category: "", kind: "", minHoldings: "", maxHoldings: "", minReturn: "", maxReturn: "", minCopiers: "" })
                }
                className="h-11 flex-1 rounded-full bg-surface-3 text-[14px] font-medium"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => onApply(draft)}
                className="h-11 flex-[2] rounded-full bg-accent text-[14px] font-semibold text-white active:scale-[0.98]"
              >
                Show results
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-[12.5px] font-medium uppercase tracking-wide text-dim">{label}</div>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: { label: string; v: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v || "all"}
          type="button"
          onClick={() => onChange(o.v)}
          className={clsx(
            "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            value === o.v ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-[16px] tabular outline-none placeholder:text-dim focus:border-accent md:text-[14px]"
    />
  );
}
