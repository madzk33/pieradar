import { env } from "../env";
import { demoQuote, demoSeries, isoDay } from "./demo-model";

export interface MarketInstrument {
  ticker: string;
  providerSymbol: string;
  exchange: string;
}

export interface Quote {
  price: number;
  prevClose: number;
  at: Date;
  /** Trading currency as reported by the provider (GBX = pence). */
  currency?: string;
}

/** Yahoo reports pence as "GBp". */
export function normaliseCurrency(c: string | undefined): string | undefined {
  if (!c) return undefined;
  return c === "GBp" || c === "GBX" ? "GBX" : c.toUpperCase();
}

export interface MarketProvider {
  readonly id: string;
  /** Daily closes strictly after `afterDay` and before today. */
  history(inst: MarketInstrument, afterDay: string | null): Promise<{ day: string; close: number }[]>;
  quotes(insts: MarketInstrument[]): Promise<Map<string, Quote>>;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchJson(url: string, init?: RequestInit, attempts = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** i;
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 15_000)));
        lastErr = new Error(`HTTP ${res.status} ${url}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

const demoProvider: MarketProvider = {
  id: "demo",
  async history(inst, afterDay) {
    const s = demoSeries(inst.ticker, isoDay(new Date()));
    const out: { day: string; close: number }[] = [];
    for (let i = 0; i < s.days.length; i++) {
      if (!afterDay || s.days[i] > afterDay) out.push({ day: s.days[i], close: s.closes[i] });
    }
    return out;
  },
  async quotes(insts) {
    const now = new Date();
    return new Map(insts.map((i) => [i.ticker, demoQuote(i.ticker, now)]));
  },
};

type YahooChart = {
  chart: {
    result?: {
      meta: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime?: number; currency?: string };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[]; adjclose?: { adjclose: (number | null)[] }[] };
    }[];
  };
};

const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; PieRadar/1.0)" };
/** Tickers whose trading currency we've already confirmed with the provider. */
const currencyKnown = new Set<string>();

const yahooProvider: MarketProvider = {
  id: "yahoo",
  async history(inst, afterDay) {
    const from = afterDay ? Math.floor(new Date(afterDay + "T00:00:00Z").getTime() / 1000) + 86400 : 0;
    const to = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.providerSymbol)}?period1=${from || to - 7 * 365 * 86400}&period2=${to}&interval=1d&events=div,split`;
    const json = (await fetchJson(url, { headers: YAHOO_HEADERS })) as YahooChart;
    const r = json.chart.result?.[0];
    if (!r?.timestamp) return [];
    // Adjusted closes so dividends/splits don't distort returns.
    const closes = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
    const today = isoDay(new Date());
    const out: { day: string; close: number }[] = [];
    r.timestamp.forEach((ts, i) => {
      const c = closes[i];
      const day = isoDay(new Date(ts * 1000));
      if (c != null && day < today && (!afterDay || day > afterDay)) out.push({ day, close: c });
    });
    return out;
  },
  async quotes(insts) {
    const out = new Map<string, Quote>();
    // Batch endpoint first: ~20 symbols per request.
    const bySymbol = new Map(insts.map((i) => [i.providerSymbol, i]));
    const symbols = [...bySymbol.keys()];
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
    await mapLimit(chunks, 2, async (chunk) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(chunk.join(","))}&range=1d&interval=1d`;
        const json = (await fetchJson(url, { headers: YAHOO_HEADERS }, 2)) as Record<
          string,
          { close?: (number | null)[]; chartPreviousClose?: number; timestamp?: number[] }
        >;
        for (const [sym, r] of Object.entries(json)) {
          const inst = bySymbol.get(sym);
          const price = r?.close?.filter((c): c is number => c != null).at(-1);
          if (inst && price && r.chartPreviousClose) {
            out.set(inst.ticker, { price, prevClose: r.chartPreviousClose, at: new Date((r.timestamp?.at(-1) ?? Date.now() / 1000) * 1000) });
          }
        }
      } catch {
        // fall through to per-symbol requests below
      }
    });
    // Per-symbol fallback for anything the batch missed; also learns the currency.
    const missing = insts.filter((i) => !out.has(i.ticker) || !currencyKnown.has(i.ticker));
    await mapLimit(missing, 4, async (inst) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.providerSymbol)}?range=1d&interval=1d`;
        const json = (await fetchJson(url, { headers: YAHOO_HEADERS }, 2)) as YahooChart;
        const m = json.chart.result?.[0]?.meta;
        const prev = m?.chartPreviousClose ?? m?.previousClose;
        if (m?.regularMarketPrice && prev) {
          out.set(inst.ticker, {
            price: m.regularMarketPrice,
            prevClose: prev,
            at: new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000),
            currency: normaliseCurrency(m.currency),
          });
          if (m.currency) currencyKnown.add(inst.ticker);
        }
      } catch {
        // Missing quote → caller keeps the previous one; freshness is surfaced in the UI.
      }
    });
    return out;
  },
};

/** Polygon covers US listings; everything else falls through to Yahoo. */
const polygonProvider: MarketProvider = {
  id: "polygon",
  async history(inst, afterDay) {
    if (!isUs(inst)) return yahooProvider.history(inst, afterDay);
    const from = afterDay ?? isoDay(new Date(Date.now() - 7 * 365 * 86400_000));
    const to = isoDay(new Date(Date.now() - 86400_000));
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(inst.providerSymbol.replace("-", "."))}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${env.POLYGON_API_KEY}`;
    const json = (await fetchJson(url)) as { results?: { t: number; c: number }[] };
    return (json.results ?? [])
      .map((r) => ({ day: isoDay(new Date(r.t)), close: r.c }))
      .filter((r) => !afterDay || r.day > afterDay);
  },
  async quotes(insts) {
    const us = insts.filter(isUs);
    const out = await yahooProvider.quotes(insts.filter((i) => !isUs(i)));
    for (let i = 0; i < us.length; i += 200) {
      const chunk = us.slice(i, i + 200);
      const syms = chunk.map((c) => c.providerSymbol.replace("-", ".")).join(",");
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(syms)}&apiKey=${env.POLYGON_API_KEY}`;
      try {
        const json = (await fetchJson(url)) as {
          tickers?: { ticker: string; lastTrade?: { p: number; t: number }; day?: { c: number }; prevDay?: { c: number }; updated?: number }[];
        };
        for (const t of json.tickers ?? []) {
          const inst = chunk.find((c) => c.providerSymbol.replace("-", ".") === t.ticker);
          const price = t.lastTrade?.p ?? t.day?.c;
          if (inst && price && t.prevDay?.c) {
            out.set(inst.ticker, { price, prevClose: t.prevDay.c, at: new Date((t.updated ?? Date.now() * 1e6) / 1e6) });
          }
        }
      } catch {
        // fall back silently; stale quotes are flagged by quoteAt
      }
    }
    return out;
  },
};

function isUs(i: MarketInstrument) {
  return i.exchange === "NASDAQ" || i.exchange === "NYSE";
}

export function getMarketProvider(): MarketProvider {
  if (env.MARKET_PROVIDER === "polygon" && env.POLYGON_API_KEY) return polygonProvider;
  if (env.MARKET_PROVIDER === "yahoo") return yahooProvider;
  return demoProvider;
}

/** Rough "is any market we price open" check — drives quote refresh cadence. */
export function marketsOpen(now = new Date()): boolean {
  const wd = now.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 7 * 60 && mins <= 21 * 60; // LSE open → US close (UTC)
}
