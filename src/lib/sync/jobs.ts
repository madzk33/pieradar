/**
 * Sync pipeline. Every job is a plain async function so it can run under
 * Inngest (production), Vercel Cron routes, or the in-process local scheduler.
 *
 *   discover ──► new rows (pending) ──► refreshPie ──► holdings / snapshot / metrics
 *       └─ sweep end: pies absent from a full sweep ─► verify ─► removed
 *   scheduler ──► due pies by tier (hot 5m / warm 30m / cold 6h, backoff on error)
 *   quotes (1m) ──► recomputeMetrics (all active pies, live-marked)
 *   history (hourly) ──► daily closes for every held instrument
 */
import { and, asc, eq, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "../db/client";
import { bumpDataVersion } from "../cache";
import { enabledSources, sourceFor, SourceError, SOURCE_RETURN_CAP, type PieSource, type SourcePie } from "../sources";
import { getMarketProvider, mapLimit, marketsOpen } from "../market";
import { INSTRUMENT_BY_TICKER } from "../universe/instruments";
import { computeMetrics, isoDay, type PriceBook } from "../perf";
import { loadPriceBook } from "../pricebook";

const MIN = 60_000;
const TIER_INTERVAL = { hot: 5 * MIN, warm: 30 * MIN, cold: 6 * 60 * MIN } as const;
type Tier = keyof typeof TIER_INTERVAL;

export function tierFor(copiers: number, createdAt: Date): Tier {
  const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
  if (copiers >= 10_000 || ageDays < 1) return "hot";
  if (copiers >= 500 || ageDays < 14) return "warm";
  return "cold";
}

function nextSync(tier: Tier, failures = 0) {
  const base = TIER_INTERVAL[tier] * Math.min(2 ** failures, 48);
  const jitter = 1 + (Math.random() - 0.5) * 0.2;
  return new Date(Date.now() + Math.min(base * jitter, 24 * 60 * MIN));
}

// ─── run tracking ────────────────────────────────────────────────────────────

export async function track<T extends Record<string, number | string>>(job: string, fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await getDb();
  const [run] = await db.insert(schema.syncRuns).values({ job }).returning({ id: schema.syncRuns.id });
  try {
    const stats = await fn(db);
    await db
      .update(schema.syncRuns)
      .set({ status: "ok", finishedAt: new Date(), stats })
      .where(eq(schema.syncRuns.id, run.id));
    return stats;
  } catch (err) {
    await db
      .update(schema.syncRuns)
      .set({ status: "error", finishedAt: new Date(), error: String((err as Error)?.message ?? err) })
      .where(eq(schema.syncRuns.id, run.id));
    throw err;
  }
}

// ─── state ───────────────────────────────────────────────────────────────────

async function getState<T>(db: DB, key: string, fallback: T): Promise<T> {
  const row = await db.query.syncState.findFirst({ where: eq(schema.syncState.key, key) });
  return (row?.value as T) ?? fallback;
}

async function setState(db: DB, key: string, value: unknown) {
  await db
    .insert(schema.syncState)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.syncState.key, set: { value, updatedAt: new Date() } });
}

// ─── instruments ─────────────────────────────────────────────────────────────

/** Make sure every ticker has an instrument row; returns tickers that were new. */
async function ensureInstruments(db: DB, holdings: SourcePie["holdings"]): Promise<string[]> {
  const tickers = holdings.map((h) => h.ticker);
  if (!tickers.length) return [];
  const known = await db
    .select({ ticker: schema.instruments.ticker })
    .from(schema.instruments)
    .where(inArray(schema.instruments.ticker, tickers));
  const knownSet = new Set(known.map((k) => k.ticker));
  const missing = holdings.filter((h) => !knownSet.has(h.ticker));
  if (!missing.length) return [];
  await db
    .insert(schema.instruments)
    .values(
      missing.map((h) => {
        const def = INSTRUMENT_BY_TICKER.get(h.ticker);
        return {
          ticker: h.ticker,
          name: def?.name ?? h.name ?? h.ticker,
          exchange: def?.exchange ?? h.exchange ?? "NASDAQ",
          currency: def?.currency ?? h.currency ?? "USD",
          sector: def?.sector ?? "Other",
          providerSymbol: def?.symbol ?? h.symbol ?? h.ticker,
          logoDomain: def?.domain ?? null,
          brandColor: def?.color ?? null,
        };
      }),
    )
    .onConflictDoNothing();
  return missing.map((m) => m.ticker);
}

// ─── discovery ───────────────────────────────────────────────────────────────

interface DiscoveryState {
  cursor: string | null;
  sweepStartedAt: string | null;
}

/** Processes one discovery page. Returns done=true when a full sweep completed. */
export async function discoverPage(db: DB, source: PieSource): Promise<{ done: boolean; seen: number; added: number; flagged: number }> {
  const state = await getState<DiscoveryState>(db, `discovery:${source.id}`, { cursor: null, sweepStartedAt: null });
  const sweepStartedAt = state.sweepStartedAt ?? new Date().toISOString();
  const page = await source.discover(state.cursor);
  const now = new Date();
  let added = 0;

  if (page.items.length) {
    const ids = page.items.map((i) => i.id);
    const existing = await db
      .select({ id: schema.pies.id, status: schema.pies.status })
      .from(schema.pies)
      .where(inArray(schema.pies.id, ids));
    const byId = new Map(existing.map((e) => [e.id, e.status]));
    const fresh = page.items.filter((i) => !byId.has(i.id));
    added = fresh.length;
    if (fresh.length) {
      await db
        .insert(schema.pies)
        .values(
          fresh.map((i) => ({
            id: i.id,
            name: i.name || "Pending sync",
            origin: source.id,
            creatorName: "",
            copiers: i.copiers,
            createdAt: now,
            holdingsChangedAt: now,
            firstSeenAt: now,
            lastSeenAt: now,
            nextSyncAt: now,
            syncTier: "hot",
          })),
        )
        .onConflictDoNothing();
    }
    // Mark seen; resurrect pies that came back (e.g. made public again).
    await db.update(schema.pies).set({ lastSeenAt: now }).where(inArray(schema.pies.id, ids));
    const revived = existing.filter((e) => e.status === "removed").map((e) => e.id);
    if (revived.length) {
      await db
        .update(schema.pies)
        .set({ status: "active", removedAt: null, nextSyncAt: now, lastError: null })
        .where(inArray(schema.pies.id, revived));
    }
  }

  let flagged = 0;
  if (!page.nextCursor) {
    // Sweep complete. With a fully-enumerating source, anything not seen this
    // sweep is a removal candidate — verify each before deleting.
    if (source.enumeratesAll) {
      const stale = await db
        .update(schema.pies)
        .set({ nextSyncAt: now })
        .where(
          and(
            eq(schema.pies.status, "active"),
            eq(schema.pies.origin, source.id), // never touch pies owned by another source
            lt(schema.pies.lastSeenAt, new Date(sweepStartedAt)),
          ),
        )
        .returning({ id: schema.pies.id });
      flagged = stale.length;
    }
    await setState(db, `discovery:${source.id}`, { cursor: null, sweepStartedAt: null });
    await setState(db, `discovery:${source.id}:lastSweep`, { at: now.toISOString(), flagged });
  } else {
    await setState(db, `discovery:${source.id}`, { cursor: page.nextCursor, sweepStartedAt });
  }
  if (added) await bumpDataVersion();
  return { done: !page.nextCursor, seen: page.items.length, added, flagged };
}

export async function discoverSweep(maxPages = 1000) {
  return track("discover", async (db) => {
    const totals: Record<string, number | string> = { pages: 0, seen: 0, added: 0, flagged: 0 };
    for (const source of enabledSources()) {
      // One failing source (e.g. a rejected API key) must not stop the others.
      try {
        for (let i = 0; i < maxPages; i++) {
          const r = await discoverPage(db, source);
          totals.pages = Number(totals.pages) + 1;
          totals.seen = Number(totals.seen) + r.seen;
          totals.added = Number(totals.added) + r.added;
          totals.flagged = Number(totals.flagged) + r.flagged;
          if (r.done) break;
        }
      } catch (err) {
        totals[`${source.id}Error`] = String((err as Error).message ?? err).slice(0, 120);
      }
    }
    return totals;
  });
}

// ─── per-pie refresh ─────────────────────────────────────────────────────────

export type RefreshOutcome = "updated" | "unchanged" | "removed" | "suspect" | "error";

export async function refreshPie(db: DB, id: string, book?: PriceBook): Promise<RefreshOutcome> {
  const current = await db.query.pies.findFirst({ where: eq(schema.pies.id, id) });
  const now = new Date();
  const source = sourceFor(current?.origin ?? "demo");
  if (!source) {
    // Imported/submitted pies (or a disabled source): holdings stay as provided;
    // returns keep re-marking to live prices via recomputeAllMetrics.
    await db.update(schema.pies).set({ nextSyncAt: new Date(Date.now() + 7 * 24 * 60 * MIN) }).where(eq(schema.pies.id, id));
    return "unchanged";
  }

  let src: SourcePie | null;
  try {
    src = await source.fetchPie(id);
  } catch (err) {
    const e = err as SourceError;
    const failures = (current?.syncFailures ?? 0) + 1;
    const retryAt = e.opts?.retryAfterMs ? new Date(Date.now() + e.opts.retryAfterMs) : nextSync((current?.syncTier as Tier) ?? "warm", failures);
    await db
      .update(schema.pies)
      .set({ syncFailures: failures, lastError: e.message ?? String(err), nextSyncAt: retryAt })
      .where(eq(schema.pies.id, id));
    return "error";
  }

  if (!src) {
    if (!current) return "removed";
    // Require two consecutive "not found" responses before removing, so a
    // transient 404 never deletes a pie from the index.
    if (current.lastError === "not_found" || current.lastSyncedAt === null) {
      await db
        .update(schema.pies)
        .set({ status: "removed", removedAt: now, lastError: "not_found", nextSyncAt: new Date(Date.now() + 24 * 60 * MIN) })
        .where(eq(schema.pies.id, id));
      await bumpDataVersion();
      return "removed";
    }
    await db
      .update(schema.pies)
      .set({ lastError: "not_found", nextSyncAt: new Date(Date.now() + 2 * MIN) })
      .where(eq(schema.pies.id, id));
    return "suspect";
  }

  return applySourcePie(db, src, current, book);
}

/** Upsert a pie from any origin: holdings, instruments, metrics and today's snapshot. */
export async function applySourcePie(
  db: DB,
  src: SourcePie,
  current?: typeof schema.pies.$inferSelect,
  book?: PriceBook,
): Promise<RefreshOutcome> {
  const id = src.id;
  const now = new Date();
  const newTickers = await ensureInstruments(db, src.holdings);
  if (newTickers.length) await backfillHistory(db, newTickers);

  // Detect holdings changes (ticker set or any weight moved by ≥0.1%).
  const prev = await db.select().from(schema.pieHoldings).where(eq(schema.pieHoldings.pieId, id));
  const prevMap = new Map(prev.map((h) => [h.ticker, h.targetWeight]));
  const changed =
    prev.length !== src.holdings.length || src.holdings.some((h) => Math.abs((prevMap.get(h.ticker) ?? -1) - h.weight) > 0.001);

  const sorted = [...src.holdings].sort((a, b) => b.weight - a.weight);
  const tier = tierFor(src.copiers, src.createdAt);
  const fields = {
    name: src.name,
    description: src.description,
    creatorName: src.creatorName,
    creatorHandle: src.creatorHandle ?? null,
    kind: src.kind,
    origin: src.origin,
    category: src.category,
    copiers: src.copiers,
    views: src.views,
    holdingsCount: src.holdings.length,
    sourceReturn: src.sourceReturn,
    sourceReturnCapped: src.sourceReturnCapped ? 1 : 0,
    shareUrl: src.shareUrl,
    createdAt: src.createdAt,
    status: "active",
    removedAt: null,
    lastSeenAt: now,
    lastSyncedAt: now,
    nextSyncAt: nextSync(tier),
    syncTier: tier,
    syncFailures: 0,
    lastError: null,
    searchText: [
      src.name,
      src.creatorName,
      src.creatorHandle ?? "",
      src.category,
      ...sorted.map((h) => `${h.ticker} ${INSTRUMENT_BY_TICKER.get(h.ticker)?.name ?? h.name ?? ""}`),
    ]
      .join(" ")
      .toLowerCase(),
    topTickers: sorted.slice(0, 8).map((h) => h.ticker),
    topWeights: sorted.slice(0, 8).map((h) => h.weight),
    ...(changed ? { holdingsChangedAt: src.holdingsChangedAt ?? now } : {}),
  };

  await db
    .insert(schema.pies)
    .values({ id, ...fields, holdingsChangedAt: src.holdingsChangedAt ?? now })
    .onConflictDoUpdate({ target: schema.pies.id, set: fields });

  if (changed) {
    await db.delete(schema.pieHoldings).where(eq(schema.pieHoldings.pieId, id));
    await db.insert(schema.pieHoldings).values(src.holdings.map((h) => ({ pieId: id, ticker: h.ticker, targetWeight: h.weight })));
  }

  // Metrics for this pie right away so it is complete the moment it's listed.
  const pb = book ?? (await loadPriceBook(src.holdings.map((h) => h.ticker)));
  const holdingsChangedAt = changed ? (src.holdingsChangedAt ?? now) : (current?.holdingsChangedAt ?? now);
  const m = computeMetrics(
    src.holdings.map((h) => ({ ticker: h.ticker, weight: h.weight })),
    pb,
    { createdAt: src.createdAt, holdingsChangedAt },
  );
  await upsertMetrics(db, [{ pieId: id, ...m, computedAt: now }]);

  // Simulated pies: derive "what T212 would show" from the same prices we use,
  // so the capped flag is consistent whichever market provider is active.
  if (src.origin === "demo" && m.y1 !== null) {
    const capped = m.y1 > SOURCE_RETURN_CAP;
    src = { ...src, sourceReturn: capped ? SOURCE_RETURN_CAP : m.y1, sourceReturnCapped: capped };
    await db
      .update(schema.pies)
      .set({ sourceReturn: src.sourceReturn, sourceReturnCapped: capped ? 1 : 0 })
      .where(eq(schema.pies.id, id));
  }

  // One snapshot per pie per day (last write of the day wins).
  const snap = {
    copiers: src.copiers,
    sourceReturn: src.sourceReturn,
    y1: m.y1,
    holdings: Object.fromEntries(src.holdings.map((h) => [h.ticker, h.weight])),
  };
  await db
    .insert(schema.pieSnapshots)
    .values({ pieId: id, day: isoDay(now), ...snap })
    .onConflictDoUpdate({ target: [schema.pieSnapshots.pieId, schema.pieSnapshots.day], set: snap });

  return changed || !current?.lastSyncedAt ? "updated" : "unchanged";
}

/** Refresh every pie whose nextSyncAt has passed (hot tiers first). */
export async function refreshDue(limit = 400, concurrency = 8) {
  return track("refresh", async (db) => {
    const due = await db
      .select({ id: schema.pies.id })
      .from(schema.pies)
      .where(and(eq(schema.pies.status, "active"), lte(schema.pies.nextSyncAt, new Date())))
      .orderBy(asc(schema.pies.nextSyncAt))
      .limit(limit);
    const book = await loadPriceBook();
    const outcomes = await mapLimit(due, concurrency, (d) => refreshPie(db, d.id, book).catch(() => "error" as const));
    const stats: Record<string, number> = { due: due.length };
    for (const o of outcomes) stats[o] = (stats[o] ?? 0) + 1;
    if (due.length) await bumpDataVersion();
    return stats;
  });
}

/** IDs that are due — used by the Inngest fan-out scheduler. */
export async function dueIds(limit: number) {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.pies.id })
    .from(schema.pies)
    .where(and(eq(schema.pies.status, "active"), lte(schema.pies.nextSyncAt, new Date())))
    .orderBy(asc(schema.pies.nextSyncAt))
    .limit(limit);
  // Push them out briefly so the next tick doesn't re-enqueue in-flight work.
  if (rows.length) {
    await db
      .update(schema.pies)
      .set({ nextSyncAt: new Date(Date.now() + 10 * MIN) })
      .where(inArray(schema.pies.id, rows.map((r) => r.id)));
  }
  return rows.map((r) => r.id);
}

// ─── market data ─────────────────────────────────────────────────────────────

async function heldInstruments(db: DB, tickers?: string[]) {
  const q = db
    .selectDistinct({
      ticker: schema.instruments.ticker,
      providerSymbol: schema.instruments.providerSymbol,
      exchange: schema.instruments.exchange,
      historyFrom: schema.instruments.historyFrom,
    })
    .from(schema.instruments)
    .innerJoin(schema.pieHoldings, eq(schema.pieHoldings.ticker, schema.instruments.ticker));
  return tickers?.length ? q.where(inArray(schema.instruments.ticker, tickers)) : q;
}

/** Pull daily closes after the last stored day (incremental). */
export async function backfillHistory(db: DB, tickers?: string[]) {
  const provider = getMarketProvider();
  const insts = await db
    .select({
      ticker: schema.instruments.ticker,
      providerSymbol: schema.instruments.providerSymbol,
      exchange: schema.instruments.exchange,
    })
    .from(schema.instruments)
    .where(tickers?.length ? inArray(schema.instruments.ticker, tickers) : undefined);
  const lastDays = await db
    .select({ ticker: schema.instrumentPrices.ticker, last: sql<string>`max(${schema.instrumentPrices.day})` })
    .from(schema.instrumentPrices)
    .groupBy(schema.instrumentPrices.ticker);
  const lastBy = new Map(lastDays.map((l) => [l.ticker, l.last]));

  let rows = 0;
  let failed = 0;
  await mapLimit(insts, 4, async (inst) => {
    try {
      const after = lastBy.get(inst.ticker) ?? null;
      const hist = await provider.history(inst, after);
      for (let i = 0; i < hist.length; i += 1000) {
        await db
          .insert(schema.instrumentPrices)
          .values(hist.slice(i, i + 1000).map((h) => ({ ticker: inst.ticker, day: h.day, close: h.close })))
          .onConflictDoNothing();
      }
      rows += hist.length;
      await db
        .update(schema.instruments)
        .set({
          historySyncedAt: new Date(),
          ...(hist.length && !after ? { historyFrom: hist[0].day } : {}),
        })
        .where(eq(schema.instruments.ticker, inst.ticker));
    } catch {
      failed++;
    }
  });
  return { instruments: insts.length, rows, failed };
}

export async function syncHistory() {
  return track("history", async (db) => {
    // Switching market provider (e.g. demo → yahoo) invalidates stored prices:
    // never mix synthetic and real closes in one series.
    const provider = getMarketProvider().id;
    const previous = await getState<{ id: string } | null>(db, "market:provider", null);
    let reset = 0;
    if (previous?.id !== provider) {
      await db.delete(schema.instrumentPrices);
      await db
        .update(schema.instruments)
        .set({ historyFrom: null, historySyncedAt: null, price: null, prevClose: null, quoteAt: null });
      await setState(db, "market:provider", { id: provider });
      reset = previous ? 1 : 0;
    }
    const r = await backfillHistory(db);
    // Fresh prices → re-mark every pie right away.
    if (r.rows) {
      await refreshQuotesInner(db);
      await recomputeMetricsInner(db);
    }
    return { ...r, provider, reset };
  });
}

export async function refreshQuotes() {
  return track("quotes", refreshQuotesInner);
}

async function refreshQuotesInner(db: DB) {
  const provider = getMarketProvider();
  const insts = await heldInstruments(db);
  const quotes = await provider.quotes(insts);
  // Only write prices that actually moved (outside market hours that's usually none).
  const current = await db
    .select({ ticker: schema.instruments.ticker, price: schema.instruments.price, prevClose: schema.instruments.prevClose })
    .from(schema.instruments);
  const before = new Map(current.map((c) => [c.ticker, c]));
  let changed = 0;
  for (const [ticker, q] of quotes) {
    const b = before.get(ticker);
    if (b && b.price === q.price && b.prevClose === q.prevClose) continue;
    changed++;
    await db
      .update(schema.instruments)
      .set({ price: q.price, prevClose: q.prevClose, quoteAt: q.at, ...(q.currency ? { currency: q.currency } : {}) })
      .where(eq(schema.instruments.ticker, ticker));
  }
  return { instruments: insts.length, quoted: quotes.size, missing: insts.length - quotes.size, changed };
}

// ─── metrics ─────────────────────────────────────────────────────────────────

type MetricsRow = typeof schema.pieMetrics.$inferInsert;

async function upsertMetrics(db: DB, rows: MetricsRow[]) {
  const cols = ["day1", "m1", "m3", "m6", "ytd", "y1", "aar", "aarYears", "allTime", "volatility", "maxDrawdown", "coverage", "computedAt"] as const;
  const set = Object.fromEntries(
    cols.map((c) => [c, sql.raw(`excluded.${schema.pieMetrics[c].name}`)]),
  ) as Record<(typeof cols)[number], ReturnType<typeof sql.raw>>;
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(schema.pieMetrics)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({ target: schema.pieMetrics.pieId, set });
  }
}

/** Re-mark every active pie to the latest prices. Cheap: all in memory, one bulk upsert. */
export async function recomputeAllMetrics() {
  return track("metrics", recomputeMetricsInner);
}

type RiskEntry = { sig: string; volatility: number | null; maxDrawdown: number | null };
const gRisk = globalThis as unknown as { __prRisk?: Map<string, RiskEntry> };
const riskCache: Map<string, RiskEntry> = (gRisk.__prRisk ??= new Map());

async function recomputeMetricsInner(db: DB) {
  const book = await loadPriceBook();
  const pies = await db
    .select({ id: schema.pies.id, createdAt: schema.pies.createdAt, holdingsChangedAt: schema.pies.holdingsChangedAt })
    .from(schema.pies)
    .where(and(eq(schema.pies.status, "active"), isNotNull(schema.pies.lastSyncedAt)));
  const holdings = await db
    .select({ pieId: schema.pieHoldings.pieId, ticker: schema.pieHoldings.ticker, weight: schema.pieHoldings.targetWeight })
    .from(schema.pieHoldings)
    .innerJoin(schema.pies, and(eq(schema.pies.id, schema.pieHoldings.pieId), eq(schema.pies.status, "active")));
  const byPie = new Map<string, { ticker: string; weight: number }[]>();
  for (const h of holdings) {
    let arr = byPie.get(h.pieId);
    if (!arr) byPie.set(h.pieId, (arr = []));
    arr.push({ ticker: h.ticker, weight: h.weight });
  }
  const now = new Date();
  const day = isoDay(now);
  const rows: MetricsRow[] = [];
  for (let i = 0; i < pies.length; i++) {
    const p = pies[i];
    const h = byPie.get(p.id) ?? [];
    // Volatility/drawdown only change with daily closes: compute once per pie per day.
    const sig = `${day}|${h.map((x) => `${x.ticker}:${x.weight}`).join(",")}`;
    const cached = riskCache.get(p.id);
    const m = computeMetrics(h, book, {
      createdAt: p.createdAt,
      holdingsChangedAt: p.holdingsChangedAt,
      now,
      risk: cached?.sig === sig ? cached : undefined,
    });
    if (cached?.sig !== sig) riskCache.set(p.id, { sig, volatility: m.volatility, maxDrawdown: m.maxDrawdown });
    rows.push({ pieId: p.id, ...m, computedAt: now });
    // Give waiting page requests a turn instead of blocking the server for the whole batch.
    if (i % 250 === 249) await new Promise((r) => setImmediate(r));
  }
  await upsertMetrics(db, rows);
  await bumpDataVersion();
  return { pies: rows.length };
}

/** Quotes + re-mark, the "live" heartbeat. */
export async function liveTick() {
  const q = await refreshQuotes();
  // No price moved → returns can't have changed; skip re-marking every pie.
  if (!q.changed) return { ...q, pies: 0, skipped: "no price changes", marketsOpen: marketsOpen() ? 1 : 0 };
  const m = await recomputeAllMetrics();
  return { ...q, ...m, marketsOpen: marketsOpen() ? 1 : 0 };
}

/** Seed instrument rows from the catalogue (idempotent). */
export async function seedInstruments() {
  const db = await getDb();
  const { INSTRUMENTS } = await import("../universe/instruments");
  await db
    .insert(schema.instruments)
    .values(
      INSTRUMENTS.map((d) => ({
        ticker: d.ticker,
        name: d.name,
        exchange: d.exchange,
        currency: d.currency,
        sector: d.sector,
        providerSymbol: d.symbol,
        logoDomain: d.domain ?? null,
        brandColor: d.color,
      })),
    )
    .onConflictDoNothing();
}
