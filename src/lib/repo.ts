import { and, asc, desc, eq, gte, inArray, isNotNull, like, lte, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { cached } from "./cache";
import { actualWeights, isoDay, livePrice, navSeries, rangeStart, startPrice, type RangeKey, RANGES } from "./perf";
import { loadPriceBook } from "./pricebook";
import type {
  HistoryResponse,
  InstrumentChip,
  ListParams,
  LiveEntry,
  PieCardData,
  PieDetail,
  PieListResponse,
  PieMetricsView,
  SortKey,
} from "./types";

const { pies, pieMetrics: m, pieHoldings, instruments, pieSnapshots, syncRuns, syncState } = schema;

const visible = and(eq(pies.status, "active"), isNotNull(pies.lastSyncedAt));

const SORT_COLUMN: Record<SortKey, SQL | ReturnType<typeof sql>> = {
  y1: sql`${m.y1}`,
  aar: sql`${m.aar}`,
  ytd: sql`${m.ytd}`,
  m6: sql`${m.m6}`,
  m3: sql`${m.m3}`,
  m1: sql`${m.m1}`,
  day1: sql`${m.day1}`,
  allTime: sql`${m.allTime}`,
  copiers: sql`${pies.copiers}`,
  newest: sql`${pies.createdAt}`,
};

// ─── instruments ─────────────────────────────────────────────────────────────

async function instrumentMap() {
  return cached("instruments", 300, async () => {
    const db = await getDb();
    const rows = await db
      .select({ ticker: instruments.ticker, name: instruments.name, domain: instruments.logoDomain, color: instruments.brandColor })
      .from(instruments);
    return Object.fromEntries(rows.map((r) => [r.ticker, r]));
  });
}

function chips(
  tickers: string[],
  weights: number[],
  map: Record<string, { ticker: string; name: string; domain: string | null; color: string | null }>,
): InstrumentChip[] {
  return tickers.map((t, i) => ({
    ticker: t,
    name: map[t]?.name,
    domain: map[t]?.domain ?? null,
    color: map[t]?.color ?? null,
    weight: weights[i],
  }));
}

const metricCols = {
  day1: m.day1,
  m1: m.m1,
  m3: m.m3,
  m6: m.m6,
  ytd: m.ytd,
  y1: m.y1,
  aar: m.aar,
  aarYears: m.aarYears,
  allTime: m.allTime,
  volatility: m.volatility,
  maxDrawdown: m.maxDrawdown,
  coverage: m.coverage,
  computedAt: m.computedAt,
};

const cardCols = {
  id: pies.id,
  name: pies.name,
  creatorName: pies.creatorName,
  category: pies.category,
  kind: pies.kind,
  origin: pies.origin,
  shareUrl: pies.shareUrl,
  copiers: pies.copiers,
  holdingsCount: pies.holdingsCount,
  topTickers: pies.topTickers,
  topWeights: pies.topWeights,
  sourceReturn: pies.sourceReturn,
  sourceReturnCapped: pies.sourceReturnCapped,
  createdAt: pies.createdAt,
  lastSyncedAt: pies.lastSyncedAt,
  ...metricCols,
};

type CardRow = {
  [K in keyof typeof cardCols]: unknown;
};

function toMetrics(r: Record<string, unknown>): PieMetricsView {
  const n = (k: string) => (r[k] == null ? null : Number(r[k]));
  return {
    day1: n("day1"),
    m1: n("m1"),
    m3: n("m3"),
    m6: n("m6"),
    ytd: n("ytd"),
    y1: n("y1"),
    aar: n("aar"),
    aarYears: n("aarYears"),
    allTime: n("allTime"),
    volatility: n("volatility"),
    maxDrawdown: n("maxDrawdown"),
    coverage: n("coverage") ?? 0,
    computedAt: r.computedAt ? new Date(r.computedAt as string).toISOString() : null,
  };
}

function toCard(r: CardRow, map: Awaited<ReturnType<typeof instrumentMap>>): PieCardData {
  return {
    id: r.id as string,
    name: r.name as string,
    creatorName: r.creatorName as string,
    category: r.category as string,
    kind: r.kind as string,
    origin: r.origin as PieCardData["origin"],
    shareUrl: (r.shareUrl as string | null) ?? null,
    // Only the demo source reports copier counts; the official API doesn't expose them.
    copiers: r.origin === "demo" ? (r.copiers as number) : null,
    holdingsCount: r.holdingsCount as number,
    holdings: chips(((r.topTickers as string[]) ?? []).slice(0, 8), (r.topWeights as number[]) ?? [], map),
    metrics: toMetrics(r as Record<string, unknown>),
    sourceReturn: r.sourceReturn as number | null,
    sourceReturnCapped: !!r.sourceReturnCapped,
    createdAt: new Date(r.createdAt as string).toISOString(),
    lastSyncedAt: r.lastSyncedAt ? new Date(r.lastSyncedAt as string).toISOString() : null,
  };
}

// ─── list / search ───────────────────────────────────────────────────────────

export async function listPies(p: ListParams): Promise<PieListResponse> {
  const key = `list:${JSON.stringify(p)}`;
  return cached(key, 30, async () => {
    const db = await getDb();
    const where: (SQL | undefined)[] = [visible];
    const q = p.q?.trim().toLowerCase();
    if (q) for (const tok of q.split(/\s+/).slice(0, 6)) where.push(like(pies.searchText, `%${tok.replace(/[%_]/g, "")}%`));
    if (p.category) where.push(eq(pies.category, p.category));
    if (p.kind) where.push(eq(pies.kind, p.kind));
    if (p.minHoldings != null) where.push(gte(pies.holdingsCount, p.minHoldings));
    if (p.maxHoldings != null) where.push(lte(pies.holdingsCount, p.maxHoldings));
    if (p.minCopiers != null) where.push(gte(pies.copiers, p.minCopiers));
    if (p.minReturn != null) where.push(gte(m.y1, p.minReturn / 100));
    if (p.maxReturn != null) where.push(lte(m.y1, p.maxReturn / 100));
    if (p.ids?.length) where.push(inArray(pies.id, p.ids));
    if (p.origin === "real") where.push(ne(pies.origin, "demo"));
    else if (p.origin) where.push(eq(pies.origin, p.origin));
    if (p.ticker) {
      where.push(
        sql`exists (select 1 from ${pieHoldings} h where h.pie_id = ${pies.id} and h.ticker = ${p.ticker.toUpperCase()})`,
      );
    }
    const cond = and(...where);

    const sort = p.sort ?? "y1";
    const col = SORT_COLUMN[sort];
    const dir = p.dir === "asc" ? sql`asc nulls last` : sql`desc nulls last`;
    const limit = Math.min(p.limit ?? 48, 200);
    const offset = p.offset ?? 0;

    const [rows, [{ total }], map] = await Promise.all([
      db
        .select(cardCols)
        .from(pies)
        .leftJoin(m, eq(m.pieId, pies.id))
        .where(cond)
        .orderBy(sql`${col} ${dir}`, asc(pies.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(pies).leftJoin(m, eq(m.pieId, pies.id)).where(cond),
      instrumentMap(),
    ]);

    return {
      items: rows.map((r) => toCard(r, map)),
      total,
      nextOffset: offset + rows.length < total ? offset + rows.length : null,
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getCategories() {
  return cached("categories", 120, async () => {
    const db = await getDb();
    return db
      .select({ category: pies.category, count: sql<number>`count(*)::int` })
      .from(pies)
      .where(visible)
      .groupBy(pies.category)
      .orderBy(desc(sql`count(*)`));
  });
}

// ─── detail ──────────────────────────────────────────────────────────────────

export async function getPie(id: string): Promise<PieDetail | null> {
  return cached(`pie:${id}`, 15, async () => {
    const db = await getDb();
    const [row] = await db
      .select({
        ...cardCols,
        description: pies.description,
        creatorHandle: pies.creatorHandle,
        views: pies.views,
        status: pies.status,
        holdingsChangedAt: pies.holdingsChangedAt,
        firstSeenAt: pies.firstSeenAt,
        syncTier: pies.syncTier,
        nextSyncAt: pies.nextSyncAt,
        lastError: pies.lastError,
      })
      .from(pies)
      .leftJoin(m, eq(m.pieId, pies.id))
      .where(eq(pies.id, id));
    if (!row || !row.lastSyncedAt) return null;

    const hold = await db
      .select({
        ticker: pieHoldings.ticker,
        target: pieHoldings.targetWeight,
        name: instruments.name,
        exchange: instruments.exchange,
        currency: instruments.currency,
        sector: instruments.sector,
        domain: instruments.logoDomain,
        color: instruments.brandColor,
        price: instruments.price,
        prevClose: instruments.prevClose,
        quoteAt: instruments.quoteAt,
      })
      .from(pieHoldings)
      .innerJoin(instruments, eq(instruments.ticker, pieHoldings.ticker))
      .where(eq(pieHoldings.pieId, id))
      .orderBy(desc(pieHoldings.targetWeight));

    const book = await loadPriceBook(hold.map((h) => h.ticker));
    const actual = actualWeights(
      hold.map((h) => ({ ticker: h.ticker, weight: h.target })),
      book,
      isoDay(row.holdingsChangedAt),
    );
    const yearAgo = isoDay(Date.now() - 365 * 86_400_000);

    const snaps = await db
      .select({ day: pieSnapshots.day, copiers: pieSnapshots.copiers })
      .from(pieSnapshots)
      .where(eq(pieSnapshots.pieId, id))
      .orderBy(asc(pieSnapshots.day))
      .limit(400);

    const map = await instrumentMap();
    return {
      ...toCard(row, map),
      description: row.description,
      creatorHandle: row.creatorHandle,
      views: row.views,
      status: row.status,
      holdingsChangedAt: row.holdingsChangedAt.toISOString(),
      firstSeenAt: row.firstSeenAt.toISOString(),
      syncTier: row.syncTier,
      nextSyncAt: row.nextSyncAt.toISOString(),
      lastError: row.lastError,
      holdingsDetail: hold.map((h) => {
        const p0 = startPrice(book.series.get(h.ticker), yearAgo);
        const p1 = livePrice(book, h.ticker);
        return {
          ticker: h.ticker,
          name: h.name,
          exchange: h.exchange,
          currency: h.currency,
          sector: h.sector,
          domain: h.domain,
          color: h.color,
          target: h.target,
          actual: actual.get(h.ticker) ?? h.target,
          price: h.price,
          prevClose: h.prevClose,
          dayChange: h.price && h.prevClose ? h.price / h.prevClose - 1 : null,
          y1: p0 && p1 ? p1 / p0 - 1 : null,
          quoteAt: h.quoteAt ? h.quoteAt.toISOString() : null,
        };
      }),
      copierHistory: snaps,
    };
  });
}

/** Pies with the most overlapping allocation (sum of min weights). */
export async function getRelated(id: string, limit = 6): Promise<(PieCardData & { overlap: number })[]> {
  return cached(`related:${id}`, 300, async () => {
    const db = await getDb();
    const overlaps = await db.execute<{ pie_id: string; overlap: number }>(sql`
      select b.pie_id, sum(least(a.target_weight, b.target_weight))::float as overlap
      from pie_holdings a
      join pie_holdings b on a.ticker = b.ticker and b.pie_id <> a.pie_id
      join pies p on p.id = b.pie_id and p.status = 'active' and p.last_synced_at is not null
      where a.pie_id = ${id}
      group by b.pie_id
      order by overlap desc, b.pie_id
      limit ${limit}
    `);
    const list = (Array.isArray(overlaps) ? overlaps : (overlaps as unknown as { rows: { pie_id: string; overlap: number }[] }).rows) as {
      pie_id: string;
      overlap: number;
    }[];
    if (!list.length) return [];
    const res = await listPies({ ids: list.map((o) => o.pie_id), limit: list.length });
    const byId = new Map(res.items.map((c) => [c.id, c]));
    return list.flatMap((o) => {
      const c = byId.get(o.pie_id);
      return c ? [{ ...c, overlap: Number(o.overlap) }] : [];
    });
  });
}

const BENCHMARK = { ticker: "CSP1", name: "S&P 500 (CSP1)" };

export async function getHistory(id: string, range: RangeKey): Promise<HistoryResponse | null> {
  if (!(range in RANGES)) return null;
  return cached(`history:${id}:${range}`, 30, async () => {
    const db = await getDb();
    const pie = await db.query.pies.findFirst({ where: eq(pies.id, id), columns: { createdAt: true } });
    if (!pie) return null;
    const hold = await db.select().from(pieHoldings).where(eq(pieHoldings.pieId, id));
    const book = await loadPriceBook([...hold.map((h) => h.ticker), BENCHMARK.ticker]);
    const start = rangeStart(range, pie.createdAt);
    const maxPoints = range === "1W" ? 60 : 240;
    return {
      range,
      points: navSeries(hold.map((h) => ({ ticker: h.ticker, weight: h.targetWeight })), book, start, maxPoints),
      benchmark: navSeries([{ ticker: BENCHMARK.ticker, weight: 1 }], book, start, maxPoints),
      benchmarkName: BENCHMARK.name,
    };
  });
}

// ─── live ────────────────────────────────────────────────────────────────────

export async function getLive(ids: string[]): Promise<Record<string, LiveEntry>> {
  const uniq = [...new Set(ids)].slice(0, 200).sort();
  if (!uniq.length) return {};
  return cached(`live:${uniq.join(",")}`, 5, async () => {
    const db = await getDb();
    const rows = await db
      .select({
        id: pies.id,
        status: pies.status,
        origin: pies.origin,
        copiers: pies.copiers,
        lastSyncedAt: pies.lastSyncedAt,
        y1: m.y1,
        day1: m.day1,
        m1: m.m1,
        aar: m.aar,
        computedAt: m.computedAt,
      })
      .from(pies)
      .leftJoin(m, eq(m.pieId, pies.id))
      .where(inArray(pies.id, uniq));
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          y1: r.y1,
          day1: r.day1,
          m1: r.m1,
          aar: r.aar,
          copiers: r.origin === "demo" ? r.copiers : null,
          lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
          computedAt: r.computedAt?.toISOString() ?? null,
          removed: r.status !== "active",
        },
      ]),
    );
  });
}

// ─── index health ────────────────────────────────────────────────────────────

export async function getIndexStats() {
  return cached("stats", 10, async () => {
    const db = await getDb();
    // ISO string, not a Date: the postgres-js driver rejects Date objects in raw sql`` params.
    const day = new Date(Date.now() - 86_400_000).toISOString();
    const [counts] = await db
      .select({
        active: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.lastSyncedAt} is not null)::int`,
        pending: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.lastSyncedAt} is null)::int`,
        removed: sql<number>`count(*) filter (where ${pies.status} = 'removed')::int`,
        removed24h: sql<number>`count(*) filter (where ${pies.status} = 'removed' and ${pies.removedAt} > ${day})::int`,
        new24h: sql<number>`count(*) filter (where ${pies.firstSeenAt} > ${day})::int`,
        erroring: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.syncFailures} > 0)::int`,
        hot: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.syncTier} = 'hot')::int`,
        warm: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.syncTier} = 'warm')::int`,
        cold: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.syncTier} = 'cold')::int`,
        overdue: sql<number>`count(*) filter (where ${pies.status} = 'active' and ${pies.nextSyncAt} < now() - interval '5 minutes')::int`,
        freshP50: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from now() - ${pies.lastSyncedAt})) filter (where ${pies.status} = 'active')`,
        freshP95: sql<number>`percentile_cont(0.95) within group (order by extract(epoch from now() - ${pies.lastSyncedAt})) filter (where ${pies.status} = 'active')`,
        lastSynced: sql<string>`max(${pies.lastSyncedAt})`,
      })
      .from(pies);
    const [{ lastQuote }] = await db.select({ lastQuote: sql<string>`max(${instruments.quoteAt})` }).from(instruments);
    const [{ lastMetrics }] = await db.select({ lastMetrics: sql<string>`max(${m.computedAt})` }).from(m);

    const runs = await db.execute<{ job: string; status: string; started_at: string; finished_at: string | null; stats: unknown; error: string | null }>(sql`
      select distinct on (job) job, status, started_at, finished_at, stats, error
      from ${syncRuns} order by job, started_at desc
    `);
    const sweeps = await db.select().from(syncState).where(like(syncState.key, "discovery:%:lastSweep"));
    const rows = (Array.isArray(runs) ? runs : (runs as unknown as { rows: unknown[] }).rows) as {
      job: string;
      status: string;
      started_at: string;
      finished_at: string | null;
      stats: Record<string, number>;
      error: string | null;
    }[];

    return {
      ...counts,
      freshP50: counts.freshP50 == null ? null : Number(counts.freshP50),
      freshP95: counts.freshP95 == null ? null : Number(counts.freshP95),
      lastSynced: counts.lastSynced ? new Date(counts.lastSynced).toISOString() : null,
      lastQuote: lastQuote ? new Date(lastQuote).toISOString() : null,
      lastMetrics: lastMetrics ? new Date(lastMetrics).toISOString() : null,
      lastSweep: (sweeps[0]?.value as { at: string; flagged: number } | undefined) ?? null,
      jobs: rows.map((r) => ({
        job: r.job,
        status: r.status,
        startedAt: new Date(r.started_at).toISOString(),
        finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
        stats: r.stats,
        error: r.error,
      })),
      generatedAt: new Date().toISOString(),
    };
  });
}

export type IndexStats = Awaited<ReturnType<typeof getIndexStats>>;

// ─── stocks ──────────────────────────────────────────────────────────────────

export interface StockRank {
  rank: number;
  ticker: string;
  name: string;
  domain: string | null;
  color: string | null;
  currency: string;
  sector: string;
  pies: number;
  share: number; // fraction of pies in scope holding it
  avgWeight: number;
  copierReach: number;
  price: number | null;
  dayChange: number | null;
  y1: number | null;
}

/**
 * Tickers ranked by how many pies hold them (ties: copier reach, then ticker).
 * scope "current" = pies public right now; "all" = every pie ever indexed,
 * including ones since deleted or made private.
 */
export async function getStockRankings(scope: "current" | "all", limit?: number) {
  return cached(`stocks:${scope}:${limit ?? "all"}`, 60, async () => {
    const db = await getDb();
    const scopeSql = scope === "current" ? sql`p.status = 'active' and p.last_synced_at is not null` : sql`p.last_synced_at is not null`;
    const res = await db.execute(sql`
      select h.ticker,
             count(distinct h.pie_id)::int as pies,
             avg(h.target_weight)::float as avg_weight,
             coalesce(sum(case when p.origin = 'demo' then p.copiers else 0 end), 0)::float as copier_reach
      from ${pieHoldings} h
      join ${pies} p on p.id = h.pie_id
      where ${scopeSql}
      group by h.ticker
      order by pies desc, copier_reach desc, h.ticker
      ${limit ? sql`limit ${limit}` : sql``}
    `);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(pies)
      .where(scope === "current" ? visible : isNotNull(pies.lastSyncedAt));
    const rows = (Array.isArray(res) ? res : (res as unknown as { rows: unknown[] }).rows) as {
      ticker: string;
      pies: number;
      avg_weight: number;
      copier_reach: number;
    }[];
    const tickers = rows.map((r) => r.ticker);
    const meta = tickers.length
      ? await db.select().from(instruments).where(inArray(instruments.ticker, tickers))
      : [];
    const metaBy = new Map(meta.map((m) => [m.ticker, m]));
    const book = await loadPriceBook(tickers);
    const yearAgo = isoDay(Date.now() - 365 * 86_400_000);

    const items: StockRank[] = rows.map((r, i) => {
      const m = metaBy.get(r.ticker);
      const p0 = startPrice(book.series.get(r.ticker), yearAgo);
      const p1 = livePrice(book, r.ticker);
      return {
        rank: i + 1,
        ticker: r.ticker,
        name: m?.name ?? r.ticker,
        domain: m?.logoDomain ?? null,
        color: m?.brandColor ?? null,
        currency: m?.currency ?? "USD",
        sector: m?.sector ?? "Other",
        pies: r.pies,
        share: total ? r.pies / total : 0,
        avgWeight: r.avg_weight,
        copierReach: r.copier_reach,
        price: m?.price ?? null,
        dayChange: m?.price && m?.prevClose ? m.price / m.prevClose - 1 : null,
        y1: p0 && p1 ? p1 / p0 - 1 : null,
      };
    });
    return { scope, totalPies: total, totalStocks: items.length, items, generatedAt: new Date().toISOString() };
  });
}

export type StockRankingResponse = Awaited<ReturnType<typeof getStockRankings>>;
