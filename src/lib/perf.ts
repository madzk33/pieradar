/**
 * Performance engine — pure functions, no I/O.
 *
 * Returns are those of a buy-and-hold position opened at the pie's current
 * target weights at the start of each window, marked to the latest live price.
 * That is what "if I had bought this pie N ago" means, and it is never capped.
 * Holdings without price history at the window start are excluded and the
 * remaining weights renormalised; `coverage` records how much weight was used.
 */

export interface Series {
  days: string[]; // ascending ISO dates
  closes: number[];
}

export interface PriceBook {
  series: Map<string, Series>;
  quotes: Map<string, { price: number; prevClose: number }>;
}

export interface WeightedHolding {
  ticker: string;
  weight: number; // target, 0..1
}

const DAY = 86_400_000;
/** A start price may be at most this many days after the window start. */
const START_TOLERANCE_DAYS = 7;

export function isoDay(d: Date | number) {
  return new Date(d).toISOString().slice(0, 10);
}

function lowerBound(days: string[], day: string) {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First close on/after `day`, if it falls within the tolerance. */
export function startPrice(s: Series | undefined, day: string): number | null {
  if (!s || !s.days.length) return null;
  const i = lowerBound(s.days, day);
  if (i >= s.days.length) return null;
  const lag = (Date.parse(s.days[i]) - Date.parse(day)) / DAY;
  return lag <= START_TOLERANCE_DAYS ? s.closes[i] : null;
}

/** Close on or before `day`. */
export function priceAt(s: Series | undefined, day: string): number | null {
  if (!s || !s.days.length) return null;
  const i = lowerBound(s.days, day);
  if (i < s.days.length && s.days[i] === day) return s.closes[i];
  return i > 0 ? s.closes[i - 1] : null;
}

export function livePrice(book: PriceBook, ticker: string): number | null {
  const q = book.quotes.get(ticker);
  if (q) return q.price;
  const s = book.series.get(ticker);
  return s?.closes.length ? s.closes[s.closes.length - 1] : null;
}

export function windowReturn(holdings: WeightedHolding[], book: PriceBook, startDay: string) {
  let covered = 0;
  let acc = 0;
  for (const h of holdings) {
    const p0 = startPrice(book.series.get(h.ticker), startDay);
    const p1 = livePrice(book, h.ticker);
    if (p0 && p1) {
      covered += h.weight;
      acc += h.weight * (p1 / p0);
    }
  }
  return { ret: covered > 0 ? acc / covered - 1 : null, coverage: covered };
}

export function actualWeights(holdings: WeightedHolding[], book: PriceBook, sinceDay: string): Map<string, number> {
  const raw = holdings.map((h) => {
    const p0 = priceAt(book.series.get(h.ticker), sinceDay) ?? startPrice(book.series.get(h.ticker), sinceDay);
    const p1 = livePrice(book, h.ticker);
    return [h.ticker, p0 && p1 ? h.weight * (p1 / p0) : h.weight] as const;
  });
  const total = raw.reduce((a, [, v]) => a + v, 0) || 1;
  return new Map(raw.map(([t, v]) => [t, v / total]));
}

export interface NavPoint {
  t: string; // ISO date (or timestamp for the live point)
  v: number; // growth of 1
}

/** Buy-and-hold NAV from `startDay` to now, at target weights. */
export function navSeries(holdings: WeightedHolding[], book: PriceBook, startDay: string, maxPoints = 260): NavPoint[] {
  const legs: { ticker: string; w: number; s: Series; p0: number; i: number }[] = [];
  for (const h of holdings) {
    const s = book.series.get(h.ticker);
    const p0 = startPrice(s, startDay);
    if (s && p0) legs.push({ ticker: h.ticker, w: h.weight, s, p0, i: lowerBound(s.days, startDay) });
  }
  if (!legs.length) return [];
  const wTotal = legs.reduce((a, l) => a + l.w, 0);

  const calendar = new Set<string>();
  for (const l of legs) for (let i = l.i; i < l.s.days.length; i++) calendar.add(l.s.days[i]);
  const days = [...calendar].sort();

  const last = legs.map((l) => l.p0);
  const ptr = legs.map((l) => l.i);
  const points: NavPoint[] = [];
  for (const day of days) {
    let v = 0;
    legs.forEach((l, k) => {
      while (ptr[k] < l.s.days.length && l.s.days[ptr[k]] <= day) last[k] = l.s.closes[ptr[k]++];
      v += l.w * (last[k] / l.p0);
    });
    points.push({ t: day, v: v / wTotal });
  }
  // Live point.
  let live = 0;
  legs.forEach((l, k) => {
    live += l.w * ((book.quotes.get(l.ticker)?.price ?? last[k]) / l.p0);
  });
  points.push({ t: new Date().toISOString(), v: live / wTotal });
  return downsample(points, maxPoints);
}

export function downsample(points: NavPoint[], max: number): NavPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: NavPoint[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.round(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

export interface ComputedMetrics {
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
}

export function computeMetrics(
  holdings: WeightedHolding[],
  book: PriceBook,
  opts: {
    createdAt: Date;
    holdingsChangedAt: Date;
    now?: Date;
    /** Precomputed 1Y risk stats. They only move with daily closes, so callers cache them per day. */
    risk?: { volatility: number | null; maxDrawdown: number | null };
  },
): ComputedMetrics {
  const now = opts.now ?? new Date();
  const ago = (days: number) => isoDay(now.getTime() - days * DAY);
  const r = (day: string) => windowReturn(holdings, book, day);

  const y1w = r(ago(365));
  let aar: number | null = null;
  let aarYears: number | null = null;
  for (const years of [5, 3, 2, 1]) {
    const w = r(ago(Math.round(years * 365.25)));
    if (w.ret !== null && w.coverage >= 0.95) {
      aar = Math.pow(1 + w.ret, 1 / years) - 1;
      aarYears = years;
      break;
    }
  }

  // Day change uses drifted (actual) weights — that is what a holder experiences today.
  const actual = actualWeights(holdings, book, isoDay(opts.holdingsChangedAt));
  let day1: number | null = null;
  let dayCov = 0;
  let dayAcc = 0;
  for (const h of holdings) {
    const q = book.quotes.get(h.ticker);
    const w = actual.get(h.ticker) ?? 0;
    if (q && q.prevClose) {
      dayCov += w;
      dayAcc += w * (q.price / q.prevClose);
    }
  }
  if (dayCov > 0) day1 = dayAcc / dayCov - 1;

  // Risk stats from the 1Y NAV (the expensive part — replays a year of closes).
  let volatility: number | null = opts.risk?.volatility ?? null;
  let maxDrawdown: number | null = opts.risk?.maxDrawdown ?? null;
  const nav = opts.risk ? [] : navSeries(holdings, book, ago(365), 10_000);
  if (nav.length > 30) {
    const rets: number[] = [];
    let peak = nav[0].v;
    let mdd = 0;
    for (let i = 1; i < nav.length; i++) {
      rets.push(Math.log(nav[i].v / nav[i - 1].v));
      peak = Math.max(peak, nav[i].v);
      mdd = Math.min(mdd, nav[i].v / peak - 1);
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    volatility = Math.sqrt(variance * 252);
    maxDrawdown = mdd;
  }

  return {
    day1,
    m1: r(ago(30)).ret,
    m3: r(ago(91)).ret,
    m6: r(ago(182)).ret,
    ytd: r(`${now.getUTCFullYear()}-01-01`).ret,
    y1: y1w.ret,
    aar,
    aarYears,
    allTime: r(isoDay(opts.createdAt)).ret,
    volatility,
    maxDrawdown,
    coverage: y1w.coverage,
  };
}

export const RANGES = {
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "6M": 182,
  YTD: -1,
  "1Y": 365,
  "3Y": 1096,
  "5Y": 1826,
  ALL: -2,
} as const;
export type RangeKey = keyof typeof RANGES;

export function rangeStart(range: RangeKey, createdAt: Date, now = new Date()): string {
  const d = RANGES[range];
  if (d === -1) return `${now.getUTCFullYear()}-01-01`;
  if (d === -2) return isoDay(createdAt);
  return isoDay(now.getTime() - d * DAY);
}
