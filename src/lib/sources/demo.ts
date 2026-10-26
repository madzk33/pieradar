/**
 * Demo pie source: a deterministic, *time-evolving* universe that behaves like a
 * live platform so every pipeline path (discovery, removal, rebalances, copier
 * growth) is exercised without touching a real third party.
 *
 *  - ~3,200 established pies created over the four years before ANCHOR.
 *  - A new pie is "created" every 30 minutes after ANCHOR; most of these are
 *    throwaway pies that get deleted/made private within a week.
 *  - ~3% of established pies are removed gradually after ANCHOR.
 *  - Copier counts drift hourly; pies periodically rebalance their targets.
 */
import { demoQuote, demoSeries, isoDay } from "../market/demo-model";
import { hashString, pick, rngFor } from "../rng";
import { INSTRUMENTS, THEMES } from "../universe/instruments";
import { SOURCE_RETURN_CAP, type DiscoveryPage, type PieSource, type SourcePie } from "./types";

const BASE_COUNT = 3200;
const ANCHOR = Date.UTC(2026, 8, 1); // 2026-09-01
const SLOT_MS = 30 * 60_000;
const DAY = 86_400_000;
const PAGE = 250;

const THEME_KEYS = Object.keys(THEMES);
const THEME_WEIGHTS: Record<string, number> = {
  ai: 9, bigtech: 8, index: 9, dividend: 8, semis: 5, uk: 4, defence: 3, energy: 3,
  fintech: 3, crypto: 3, health: 3, space: 4, quality: 5, cyber: 2, consumer: 3,
};

const SYL = ["ka", "zu", "mi", "ro", "la", "ven", "tor", "ix", "an", "el", "sto", "ck", "pie", "jo", "max", "fin", "ny", "lo", "sam", "dee", "ash", "kai", "ri", "ty"];
const SUFFIXES = ["", "", "", "", " 2.0", " v2", " (Long Term)", " — Growth", " Core", " Max", " Lite", " 2026", " Aggressive", " Balanced"];
const DESCRIPTIONS = [
  "Long-term buy and hold. Rebalanced when weights drift more than 5%.",
  "My main pie. DCA every payday, never selling.",
  "High conviction picks only. Not financial advice.",
  "Thematic basket built around a single secular trend.",
  "Low maintenance core holding with a few satellite bets.",
  "Built for growth over the next 10+ years. Expect volatility.",
  "Diversified across sectors with a tilt toward quality.",
  "",
];

function creatorFor(rand: () => number) {
  const n = 2 + Math.floor(rand() * 2);
  let s = "";
  for (let i = 0; i < n; i++) s += pick(rand, SYL);
  if (rand() < 0.45) s += Math.floor(rand() * 99);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pickTheme(rand: () => number) {
  const total = THEME_KEYS.reduce((a, k) => a + THEME_WEIGHTS[k], 0);
  let x = rand() * total;
  for (const k of THEME_KEYS) {
    x -= THEME_WEIGHTS[k];
    if (x <= 0) return k;
  }
  return THEME_KEYS[0];
}

/** Weights rounded to 0.5% steps that sum to exactly 100%. */
function makeWeights(rand: () => number, n: number) {
  const raw = Array.from({ length: n }, () => Math.pow(rand(), 1.6) + 0.08).sort((a, b) => b - a);
  const total = raw.reduce((a, b) => a + b, 0);
  const halves = raw.map((r) => Math.max(1, Math.round((r / total) * 200)));
  const diff = 200 - halves.reduce((a, b) => a + b, 0);
  halves[0] += diff;
  if (halves[0] < 1) halves[0] = 1;
  return halves.map((h) => h / 200);
}

interface Identity {
  id: string;
  createdAt: number;
  removedAt: number | null;
}

function baseIdentity(i: number): Identity {
  const rand = rngFor("base", i);
  const id = `p${(hashString(`base-${i}`) % 0xfffff).toString(36)}${i.toString(36)}`;
  const createdAt = ANCHOR - Math.floor(Math.pow(rand(), 0.8) * 4 * 365 * DAY);
  const removedAt = rand() < 0.03 ? ANCHOR + Math.floor(rand() * 90 * DAY) : null;
  return { id, createdAt, removedAt };
}

function slotIdentity(slot: number): Identity {
  const rand = rngFor("slot", slot);
  const createdAt = slot * SLOT_MS + Math.floor(rand() * SLOT_MS * 0.8);
  const removedAt = rand() < 0.8 ? createdAt + Math.floor((0.2 + rand() * 6.8) * DAY) : null;
  return { id: `n${slot.toString(36)}`, createdAt, removedAt };
}

function identityFor(id: string): Identity | null {
  if (/^n[0-9a-z]+$/.test(id)) {
    const slot = parseInt(id.slice(1), 36);
    return slot >= Math.ceil(ANCHOR / SLOT_MS) ? slotIdentity(slot) : null;
  }
  const m = /^p[0-9a-z]+$/.exec(id);
  if (!m) return null;
  // Base ids end with the base-36 index; recover by scanning (bounded, cached).
  return baseIndex().get(id) ?? null;
}

let baseMap: Map<string, Identity> | null = null;
function baseIndex() {
  if (!baseMap) {
    baseMap = new Map();
    for (let i = 0; i < BASE_COUNT; i++) {
      const ident = baseIdentity(i);
      baseMap.set(ident.id, ident);
    }
  }
  return baseMap;
}

function allIdentities(now: number): Identity[] {
  const out = [...baseIndex().values()];
  const first = Math.ceil(ANCHOR / SLOT_MS);
  const last = Math.floor(now / SLOT_MS);
  for (let s = first; s <= last; s++) out.push(slotIdentity(s));
  return out.filter((p) => p.createdAt <= now && (p.removedAt === null || p.removedAt > now));
}

function buildPie(ident: Identity, now: number): SourcePie {
  const rand = rngFor("pie", ident.id);
  const themeKey = pickTheme(rand);
  const theme = THEMES[themeKey];
  const isModel = rand() < 0.04;
  const creator = isModel ? "Trading 212 Models" : creatorFor(rand);

  // Holdings: mostly from the theme, with some diversifiers.
  const n = Math.min(30, 3 + Math.floor(Math.pow(rand(), 1.5) * 20));
  const pool = new Set<string>();
  const themeTickers = [...theme.tickers];
  while (pool.size < Math.min(n, themeTickers.length) && pool.size < n) {
    pool.add(themeTickers[Math.floor(rand() * themeTickers.length)]);
    if (rand() < 0.1) break;
  }
  while (pool.size < n) {
    pool.add(rand() < 0.6 ? pick(rand, themeTickers) : pick(rand, INSTRUMENTS).ticker);
  }

  // Rebalance history: weights tweak every `period` days.
  const ageDays = (now - ident.createdAt) / DAY;
  const period = 20 + rand() * 280;
  const version = Math.max(0, Math.floor(ageDays / period));
  const tickers = [...pool];
  const vRand = rngFor("pie", ident.id, "v", version);
  if (version > 0 && vRand() < 0.4 && tickers.length > 3) {
    tickers[tickers.length - 1] = pick(vRand, theme.tickers.filter((t) => !pool.has(t)).concat(tickers[tickers.length - 1]));
  }
  const unique = [...new Set(tickers)];
  const weights = makeWeights(vRand, unique.length);
  const holdings = unique.map((ticker, i) => ({ ticker, weight: weights[i] }));
  const holdingsChangedAt = new Date(ident.createdAt + version * period * DAY);

  // Copiers: power-law popularity, matured by age, drifting hourly.
  const popularity = Math.pow(10, rand() * (isModel ? 4.8 : 4.3));
  const maturity = Math.min(1, Math.sqrt(Math.max(ageDays, 0.05) / 365));
  const hours = Math.floor((now - ANCHOR) / 3_600_000);
  const growth = 1 + Math.max(0, hours) * 0.00025 * (0.5 + rand());
  const wobble = 1 + (rngFor("cop", ident.id, hours)() - 0.5) * 0.01;
  const copiers = Math.max(0, Math.round(popularity * maturity * growth * wobble) - 1);
  const views = Math.round(copiers * (5 + rand() * 18) + ageDays * rand() * 3);

  const baseName = pick(rand, theme.names);
  const name = (baseName + pick(rand, SUFFIXES)).trim();

  // What the source displays: 1Y return at current targets, clipped at the cap.
  const today = isoDay(new Date(now));
  const yearAgo = isoDay(new Date(now - 365 * DAY));
  let y1 = 0;
  let covered = 0;
  for (const h of holdings) {
    const s = demoSeries(h.ticker, today);
    const idx = s.days.findIndex((d) => d >= yearAgo);
    if (idx < 0) continue;
    const q = demoQuote(h.ticker, new Date(now));
    y1 += h.weight * (q.price / s.closes[idx]);
    covered += h.weight;
  }
  const realY1 = covered > 0 ? y1 / covered - 1 : null;
  const capped = realY1 !== null && realY1 > SOURCE_RETURN_CAP;

  return {
    id: ident.id,
    origin: "demo",
    name,
    description: pick(rand, DESCRIPTIONS),
    creatorName: creator,
    creatorHandle: isModel ? undefined : `@${creator.toLowerCase()}`,
    kind: isModel ? "model" : "community",
    category: theme.category,
    copiers,
    views,
    createdAt: new Date(ident.createdAt),
    holdingsChangedAt,
    holdings,
    sourceReturn: realY1 === null ? null : capped ? SOURCE_RETURN_CAP : realY1,
    sourceReturnCapped: capped,
    shareUrl: null,
  };
}

export const demoSource: PieSource = {
  id: "demo",
  enumeratesAll: true,
  async discover(cursor): Promise<DiscoveryPage> {
    const now = Date.now();
    const all = allIdentities(now);
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const page = all.slice(offset, offset + PAGE);
    return {
      items: page.map((ident) => {
        const p = buildPie(ident, now);
        return { id: p.id, name: p.name, copiers: p.copiers };
      }),
      nextCursor: offset + PAGE < all.length ? String(offset + PAGE) : null,
    };
  },
  async fetchPie(id) {
    const now = Date.now();
    const ident = identityFor(id);
    if (!ident || ident.createdAt > now || (ident.removedAt !== null && ident.removedAt <= now)) return null;
    return buildPie(ident, now);
  },
};
