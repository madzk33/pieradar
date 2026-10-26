/**
 * Deterministic synthetic price model used by the demo market provider and demo
 * pie source. One-factor GBM (market + idiosyncratic) with occasional jumps, so
 * correlated sectors move together and returns look plausible.
 */
import { gaussian, rngFor } from "../rng";
import { INSTRUMENT_BY_TICKER } from "../universe/instruments";

export const HISTORY_START = "2019-01-02";
const DT = 1 / 252;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function tradingDays(fromIso: string, toIsoExclusive: string): string[] {
  const out: string[] = [];
  const d = new Date(fromIso + "T00:00:00Z");
  const end = new Date(toIsoExclusive + "T00:00:00Z");
  while (d < end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(isoDay(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

let marketCache: { until: string; shocks: number[]; days: string[] } | null = null;

function marketFactor(untilExclusive: string) {
  if (marketCache?.until === untilExclusive) return marketCache;
  const days = tradingDays(HISTORY_START, untilExclusive);
  const rand = rngFor("market-factor");
  const shocks = days.map(() => gaussian(rand));
  marketCache = { until: untilExclusive, shocks, days };
  return marketCache;
}

const seriesCache = new Map<string, { until: string; days: string[]; closes: number[] }>();

/** Daily closes from HISTORY_START up to (excluding) `untilExclusive`. */
export function demoSeries(ticker: string, untilExclusive: string) {
  const hit = seriesCache.get(ticker);
  if (hit?.until === untilExclusive) return hit;

  const def = INSTRUMENT_BY_TICKER.get(ticker);
  const drift = def?.drift ?? 0.08;
  const vol = def?.vol ?? 0.3;
  const beta = Math.min(0.85, 0.45 + vol * 0.4);
  const mkt = marketFactor(untilExclusive);
  const rand = rngFor("px", ticker);
  let price = 100;

  const closes: number[] = new Array(mkt.days.length);
  const sig = vol * Math.sqrt(DT);
  for (let i = 0; i < mkt.days.length; i++) {
    const z = beta * mkt.shocks[i] + Math.sqrt(1 - beta * beta) * gaussian(rand);
    let r = (drift - 0.5 * vol * vol) * DT + sig * z;
    if (rand() < 0.004) r += (rand() - 0.45) * vol * 0.5; // earnings-style jump
    price *= Math.exp(r);
    closes[i] = price;
  }
  // Rescale so today's level is plausible (returns are scale-invariant). The
  // anchor is fixed per ticker so the series stays stable from day to day.
  const anchorIdx = Math.min(closes.length - 1, mkt.days.findIndex((d) => d >= "2026-01-02"));
  let target = 15 + rngFor("px-level", ticker)() * 450;
  if (def?.currency === "GBX") target *= 6;
  const scale = target / closes[anchorIdx >= 0 ? anchorIdx : closes.length - 1];
  for (let i = 0; i < closes.length; i++) closes[i] = Math.round(closes[i] * scale * 100) / 100;
  const out = { until: untilExclusive, days: mkt.days, closes };
  seriesCache.set(ticker, out);
  return out;
}

/**
 * Live quote: yesterday's close plus a deterministic intraday random walk in
 * 20-second steps, so the price "ticks" without any stored state.
 */
export function demoQuote(ticker: string, now = new Date()) {
  const today = isoDay(now);
  const s = demoSeries(ticker, today);
  const prevClose = s.closes[s.closes.length - 1];
  const wd = now.getUTCDay();
  const vol = INSTRUMENT_BY_TICKER.get(ticker)?.vol ?? 0.3;
  if (wd === 0 || wd === 6) return { price: prevClose, prevClose, at: now };

  const secs = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const steps = Math.floor(secs / 20);
  const rand = rngFor("intraday", ticker, today);
  const stepSig = (vol * Math.sqrt(DT)) / Math.sqrt(4320);
  let x = 0;
  for (let i = 0; i < steps; i++) x += stepSig * gaussian(rand);
  return { price: Math.round(prevClose * Math.exp(x) * 100) / 100, prevClose, at: now };
}
