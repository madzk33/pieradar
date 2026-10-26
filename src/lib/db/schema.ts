import {
  pgTable,
  text,
  integer,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  serial,
} from "drizzle-orm/pg-core";

export const pies = pgTable(
  "pies",
  {
    /** Source-native id (T212 share id or demo id). */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    creatorName: text("creator_name").notNull(),
    creatorHandle: text("creator_handle"),
    kind: text("kind").notNull().default("community"), // community | model
    /**
     * Where the pie came from: demo (simulated), t212-api (operator account,
     * auto-synced via the official API), imported (one-shot user API import),
     * submitted (share link + holdings entered by a user, unverified).
     */
    origin: text("origin").notNull().default("demo"),
    /** Source-specific locator, e.g. "0:123456" (account index : T212 pie id). */
    sourceRef: text("source_ref"),
    category: text("category").notNull().default("Mixed"),
    copiers: integer("copiers").notNull().default(0),
    views: integer("views").notNull().default(0),
    holdingsCount: integer("holdings_count").notNull().default(0),
    /** The headline return the source itself displays (may be capped, e.g. 20%). */
    sourceReturn: doublePrecision("source_return"),
    sourceReturnCapped: integer("source_return_capped").notNull().default(0),
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** Last time holdings/weights changed at source — "rebalance" anchor for actual-weight drift. */
    holdingsChangedAt: timestamp("holdings_changed_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"), // active | removed
    removedAt: timestamp("removed_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }).notNull().defaultNow(),
    syncTier: text("sync_tier").notNull().default("warm"), // hot | warm | cold
    syncFailures: integer("sync_failures").notNull().default(0),
    lastError: text("last_error"),
    /** Denormalised lower-case "name creator tickers…" for search. */
    searchText: text("search_text").notNull().default(""),
    /** Denormalised top tickers for card logo rows (ordered by weight). */
    topTickers: jsonb("top_tickers").$type<string[]>().notNull().default([]),
    topWeights: jsonb("top_weights").$type<number[]>().notNull().default([]),
  },
  (t) => [
    index("pies_status_idx").on(t.status),
    index("pies_next_sync_idx").on(t.status, t.nextSyncAt),
    index("pies_copiers_idx").on(t.copiers),
    index("pies_created_idx").on(t.createdAt),
    index("pies_origin_idx").on(t.origin),
    index("pies_share_url_idx").on(t.shareUrl),
  ],
);

export const pieHoldings = pgTable(
  "pie_holdings",
  {
    pieId: text("pie_id")
      .notNull()
      .references(() => pies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    targetWeight: doublePrecision("target_weight").notNull(), // 0..1
  },
  (t) => [primaryKey({ columns: [t.pieId, t.ticker] }), index("holdings_ticker_idx").on(t.ticker)],
);

export const instruments = pgTable("instruments", {
  ticker: text("ticker").primaryKey(), // T212-style short ticker
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),
  currency: text("currency").notNull(),
  sector: text("sector").notNull().default("Other"),
  providerSymbol: text("provider_symbol").notNull(), // e.g. VUSA.L for Yahoo
  isin: text("isin"),
  logoDomain: text("logo_domain"),
  brandColor: text("brand_color"),
  price: doublePrecision("price"),
  prevClose: doublePrecision("prev_close"),
  quoteAt: timestamp("quote_at", { withTimezone: true }),
  historyFrom: date("history_from"),
  historySyncedAt: timestamp("history_synced_at", { withTimezone: true }),
});

export const instrumentPrices = pgTable(
  "instrument_prices",
  {
    ticker: text("ticker").notNull(),
    day: date("day").notNull(),
    close: doublePrecision("close").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.day] })],
);

/** Computed, uncapped metrics. Fractions (0.4783 = +47.83%). Null = insufficient history. */
export const pieMetrics = pgTable(
  "pie_metrics",
  {
    pieId: text("pie_id")
      .primaryKey()
      .references(() => pies.id, { onDelete: "cascade" }),
    day1: doublePrecision("day1"),
    m1: doublePrecision("m1"),
    m3: doublePrecision("m3"),
    m6: doublePrecision("m6"),
    ytd: doublePrecision("ytd"),
    y1: doublePrecision("y1"),
    aar: doublePrecision("aar"),
    /** Window (years) the AAR was annualised over. */
    aarYears: doublePrecision("aar_years"),
    allTime: doublePrecision("all_time"),
    volatility: doublePrecision("volatility"),
    maxDrawdown: doublePrecision("max_drawdown"),
    /** Share of target weight with full 1Y price history (1 = complete). */
    coverage: doublePrecision("coverage").notNull().default(1),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("metrics_y1_idx").on(t.y1), index("metrics_aar_idx").on(t.aar)],
);

/** Daily history of what the source reported, for copier trends and audit. */
export const pieSnapshots = pgTable(
  "pie_snapshots",
  {
    pieId: text("pie_id")
      .notNull()
      .references(() => pies.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    copiers: integer("copiers").notNull(),
    sourceReturn: doublePrecision("source_return"),
    y1: doublePrecision("y1"),
    holdings: jsonb("holdings").$type<Record<string, number>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.pieId, t.day] })],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    job: text("job").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"), // running | ok | error
    stats: jsonb("stats").$type<Record<string, number | string>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("sync_runs_job_idx").on(t.job, t.startedAt)],
);

/** Key/value for pipeline cursors and the cache version counter. */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Pie = typeof pies.$inferSelect;
export type PieHolding = typeof pieHoldings.$inferSelect;
export type Instrument = typeof instruments.$inferSelect;
export type PieMetrics = typeof pieMetrics.$inferSelect;
