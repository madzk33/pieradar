import { inArray, max } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import type { PriceBook, Series } from "./perf";

/**
 * In-process cache of daily closes. Reloaded only when history changes
 * (detected via max(history_synced_at)); quotes are always read fresh.
 */
const g = globalThis as unknown as { __prSeries?: { marker: string; series: Map<string, Series> } };

export async function loadPriceBook(tickers?: string[]): Promise<PriceBook> {
  const db = await getDb();
  const [{ marker }] = await db.select({ marker: max(schema.instruments.historySyncedAt) }).from(schema.instruments);
  const markerKey = marker ? new Date(marker).toISOString() : "none";

  if (g.__prSeries?.marker !== markerKey) {
    const rows = await db
      .select({ ticker: schema.instrumentPrices.ticker, day: schema.instrumentPrices.day, close: schema.instrumentPrices.close })
      .from(schema.instrumentPrices)
      .orderBy(schema.instrumentPrices.ticker, schema.instrumentPrices.day);
    const series = new Map<string, Series>();
    for (const r of rows) {
      let s = series.get(r.ticker);
      if (!s) series.set(r.ticker, (s = { days: [], closes: [] }));
      s.days.push(r.day);
      s.closes.push(r.close);
    }
    g.__prSeries = { marker: markerKey, series };
  }

  const quoteRows = await db
    .select({ ticker: schema.instruments.ticker, price: schema.instruments.price, prevClose: schema.instruments.prevClose })
    .from(schema.instruments)
    .where(tickers?.length ? inArray(schema.instruments.ticker, tickers) : undefined);
  const quotes = new Map<string, { price: number; prevClose: number }>();
  for (const q of quoteRows) if (q.price && q.prevClose) quotes.set(q.ticker, { price: q.price, prevClose: q.prevClose });

  return { series: g.__prSeries.series, quotes };
}
