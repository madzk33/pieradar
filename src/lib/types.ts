/** API shapes shared by server and client. Returns are fractions (0.4783 = +47.83%). */

export interface InstrumentChip {
  ticker: string;
  name?: string;
  domain: string | null;
  color: string | null;
  /** Target weight 0..1 (top holdings only on cards). */
  weight?: number;
}

export interface PieMetricsView {
  day1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  ytd: number | null;
  y1: number | null;
  aar: number | null;
  aarYears: number | null;
  allTime: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  coverage: number;
  computedAt: string | null;
}

export interface PieCardData {
  id: string;
  name: string;
  creatorName: string;
  category: string;
  kind: string;
  /** demo | t212-api | imported | submitted */
  origin: "demo" | "t212-api" | "imported" | "submitted";
  /** Real Trading 212 share link, when known. */
  shareUrl: string | null;
  /** Null when the source doesn't expose copier counts. */
  copiers: number | null;
  holdingsCount: number;
  holdings: InstrumentChip[];
  metrics: PieMetricsView;
  sourceReturn: number | null;
  sourceReturnCapped: boolean;
  createdAt: string;
  lastSyncedAt: string | null;
}

export interface PieListResponse {
  items: PieCardData[];
  total: number;
  nextOffset: number | null;
  generatedAt: string;
}

export interface HoldingRow extends InstrumentChip {
  name: string;
  exchange: string;
  currency: string;
  sector: string;
  target: number;
  actual: number;
  price: number | null;
  prevClose: number | null;
  dayChange: number | null;
  y1: number | null;
  quoteAt: string | null;
}

export interface PieDetail extends PieCardData {
  description: string;
  creatorHandle: string | null;
  views: number;
  status: string;
  holdingsChangedAt: string;
  firstSeenAt: string;
  syncTier: string;
  nextSyncAt: string;
  lastError: string | null;
  holdingsDetail: HoldingRow[];
  copierHistory: { day: string; copiers: number }[];
}

export interface HistoryResponse {
  range: string;
  points: { t: string; v: number }[];
  benchmark: { t: string; v: number }[];
  benchmarkName: string;
}

export interface LiveEntry {
  y1: number | null;
  day1: number | null;
  m1: number | null;
  aar: number | null;
  copiers: number | null;
  lastSyncedAt: string | null;
  computedAt: string | null;
  removed: boolean;
}

export const SORTS = {
  y1: "1Y return",
  aar: "Avg annual return",
  ytd: "YTD",
  m6: "6M return",
  m3: "3M return",
  m1: "1M return",
  day1: "Today",
  allTime: "All-time",
  copiers: "Most copied",
  newest: "Newest",
} as const;
export type SortKey = keyof typeof SORTS;

export interface ListParams {
  q?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  category?: string;
  kind?: string;
  minHoldings?: number;
  maxHoldings?: number;
  minReturn?: number; // percent, on y1
  maxReturn?: number;
  minCopiers?: number;
  ids?: string[];
  ticker?: string;
  origin?: string;
  offset?: number;
  limit?: number;
}
