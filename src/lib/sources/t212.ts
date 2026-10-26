/**
 * Trading 212 — official Public API (https://docs.trading212.com/api).
 *
 * This is the sanctioned way to read real pies. The API is per-account: it
 * returns the pies owned by the account whose key is used, including each
 * pie's holdings, target weights, creation date and `publicUrl` (its real
 * share link). There is no endpoint that lists other users' pies, and
 * Trading 212 blocks automated access to share pages (HTTP 403), so the index
 * grows from:
 *   - operator accounts in T212_API_ACCOUNTS (auto-synced; source "t212-api"),
 *   - users importing their own public pies with a one-time key ("imported"),
 *   - share link + holdings submitted by hand ("submitted").
 *
 * Only pies that have a publicUrl (i.e. are shared publicly) are indexed.
 */
import { env } from "../env";
import { INSTRUMENTS } from "../universe/instruments";
import { SourceError, type PieSource, type SourceHolding, type SourcePie } from "./types";

export interface T212Credentials {
  key: string;
  secret: string;
  live?: boolean;
}

const LIST_INTERVAL_MS = 30_000; // GET /equity/pies — 1 req / 30s per account
const DETAIL_INTERVAL_MS = 5_000; // GET /equity/pies/{id} — 1 req / 5s per account
const META_INTERVAL_MS = 50_000; // GET /equity/metadata/instruments — 1 req / 50s

// ─── share links ─────────────────────────────────────────────────────────────

export function shareIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)trading212\.com$/.test(u.hostname)) return null;
    const seg = u.pathname.split("/").filter(Boolean);
    const i = seg.findIndex((s) => s === "pies" || s === "pie");
    const id = i >= 0 ? seg[i + 1] : null;
    return id && /^[A-Za-z0-9_-]{6,80}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function shareUrlFor(id: string) {
  return `https://www.trading212.com/pies/${id}`;
}

// ─── HTTP client with per-account pacing ─────────────────────────────────────

const lastCall = new Map<string, number>();

async function pace(bucket: string, intervalMs: number) {
  const wait = (lastCall.get(bucket) ?? 0) + intervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall.set(bucket, Date.now());
}

async function t212Get<T>(creds: T212Credentials, path: string, intervalMs: number): Promise<T> {
  return t212Request<T>(creds, "GET", path, intervalMs);
}

async function t212Request<T>(
  creds: T212Credentials,
  method: "GET" | "POST",
  path: string,
  intervalMs: number,
  body?: unknown,
  maxAttempts = 3,
): Promise<T> {
  const bucket = `${creds.key.slice(0, 8)}:${method}:${path.replace(/\/\d+$/, "/:id")}`;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await pace(bucket, intervalMs);
    const base = env.T212_API_BASE ?? (creds.live === false ? "https://demo.trading212.com" : "https://live.trading212.com");
    const res = await fetch(`${base}/api/v0${path}`, {
      method,
      // Current keys: key + secret via HTTP Basic. Older single keys go in the header as-is.
      headers: {
        Authorization: creds.secret ? "Basic " + Buffer.from(`${creds.key}:${creds.secret}`).toString("base64") : creds.key,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const ms = reset ? Math.max(1000, reset * 1000 - Date.now()) : intervalMs;
      await new Promise((r) => setTimeout(r, Math.min(ms, 60_000)));
      continue;
    }
    if (res.status === 401) {
      throw new SourceError("Trading 212 rejected the API key (check the key and secret)", { transient: false, status: 401 });
    }
    if (res.status === 403) {
      if (method === "POST") {
        throw new SourceError(
          "This API key isn't allowed to create pies. In Trading 212 → Settings → API, create a NEW key with Metadata, Pies – Read and Pies – Write ticked, then use that key.",
          { transient: false, status: 403 },
        );
      }
      const need = path.includes("metadata") ? "Metadata" : "Pies – Read";
      throw new SourceError(`The API key is missing the “${need}” permission`, { transient: false, status: 403 });
    }
    if (res.status === 400) {
      const text = await res.text().catch(() => "");
      let detail = text.replace(/\s+/g, " ").slice(0, 300);
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail ?? detail;
      } catch {
        /* not JSON */
      }
      throw new SourceError(`Trading 212 refused the request${detail ? `: ${detail}` : ""}`, { transient: false, status: 400 });
    }
    if (!res.ok && method === "POST") {
      const text = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      throw new SourceError(`Trading 212 API HTTP ${res.status}${text ? `: ${text}` : ""}`, { transient: res.status >= 500, status: res.status });
    }
    if (res.status === 404) {
      if (method === "POST") {
        const detail = ((await res.json().catch(() => null)) as { detail?: string } | null)?.detail;
        throw new SourceError(detail ?? "Trading 212 couldn't find one of the instruments", { transient: false, status: 404 });
      }
      throw new SourceError("not_found", { transient: false, status: 404 });
    }
    if (!res.ok) throw new SourceError(`Trading 212 API HTTP ${res.status}`, { transient: res.status >= 500, status: res.status });
    return (await res.json()) as T;
  }
  throw new SourceError("Trading 212 API rate limit", { transient: true, status: 429 });
}

interface ApiPieSummary {
  id: number;
}
interface ApiPieDetail {
  instruments: { ticker: string; expectedShare: number; currentShare?: number }[];
  settings: {
    id: number;
    name: string;
    creationDate?: string;
    icon?: string;
    publicUrl?: string | null;
  };
}
interface ApiInstrument {
  ticker: string;
  shortName: string;
  name: string;
  currencyCode: string;
  isin?: string;
  type?: string;
}

// ─── instrument mapping ──────────────────────────────────────────────────────

const gMeta = globalThis as unknown as { __t212Meta?: { at: number; byTicker: Map<string, ApiInstrument> } };
const META_TTL = 6 * 3600_000;

/** Best-effort lookup for reading pies; an empty map just means less metadata. */
async function instrumentMeta(creds: T212Credentials) {
  try {
    return await loadInstrumentMeta(creds);
  } catch {
    return new Map<string, ApiInstrument>();
  }
}

async function loadInstrumentMeta(creds: T212Credentials, opts: { quick?: boolean } = {}) {
  // The instrument list is the same for every account, so one copy serves all keys.
  if (gMeta.__t212Meta && Date.now() - gMeta.__t212Meta.at < META_TTL) return gMeta.__t212Meta.byTicker;
  const list = await t212Request<ApiInstrument[]>(creds, "GET", "/equity/metadata/instruments", META_INTERVAL_MS, undefined, opts.quick ? 1 : 3);
  const byTicker = new Map(list.map((i) => [i.ticker, i]));
  gMeta.__t212Meta = { at: Date.now(), byTicker };
  return byTicker;
}

// ─── create a pie in the user's account ──────────────────────────────────────

const VENUE_SUFFIX: Record<string, RegExp> = {
  NASDAQ: /_US_EQ$/,
  NYSE: /_US_EQ$/,
  LSE: /^[A-Z0-9.]+l_EQ$/,
  XETRA: /^[A-Z0-9.]+d_EQ$/,
  EURONEXT: /^[A-Z0-9.]+[pe]_EQ$/,
};

const norm = (t: string) => t.toUpperCase().replace(/[.\-\s]/g, "");

/** Our ticker + exchange → the broker's instrument code (e.g. VUSA/LSE → VUSAl_EQ). */
export function resolveT212Tickers(holdings: { ticker: string; exchange: string }[], meta: Map<string, ApiInstrument>) {
  const byShort = new Map<string, ApiInstrument[]>();
  for (const i of meta.values()) {
    if (i.type && !["STOCK", "ETF"].includes(i.type)) continue;
    const key = norm(i.shortName);
    byShort.set(key, [...(byShort.get(key) ?? []), i]);
  }
  const resolved = new Map<string, string>();
  const missing: string[] = [];
  for (const h of holdings) {
    const candidates = byShort.get(norm(h.ticker)) ?? [];
    const venue = VENUE_SUFFIX[h.exchange];
    const pick = candidates.find((c) => venue?.test(c.ticker)) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (pick) resolved.set(h.ticker, pick.ticker);
    else missing.push(h.ticker);
  }
  return { resolved, missing };
}

/** Fallback when the instrument list is unavailable: AAPL/NASDAQ → AAPL_US_EQ, VUSA/LSE → VUSAl_EQ. */
export function guessT212Tickers(holdings: { ticker: string; exchange: string }[]) {
  const suffix: Record<string, string> = { NASDAQ: "_US_EQ", NYSE: "_US_EQ", LSE: "l_EQ", XETRA: "d_EQ", EURONEXT: "p_EQ" };
  const resolved = new Map<string, string>();
  const missing: string[] = [];
  for (const h of holdings) {
    const sfx = suffix[h.exchange];
    const base = h.ticker.replace(/\.$/, "").replace(".", "_");
    if (sfx) resolved.set(h.ticker, base + sfx);
    else missing.push(h.ticker);
  }
  return { resolved, missing };
}

/** Weights → shares that sum to exactly 1 (3 decimals), as the API expects. */
export function toInstrumentShares(entries: [string, number][]): Record<string, number> {
  const total = entries.reduce((a, [, w]) => a + w, 0) || 1;
  const rounded = entries.map(([t, w]) => [t, Math.round((w / total) * 1000)] as [string, number]);
  const diff = 1000 - rounded.reduce((a, [, w]) => a + w, 0);
  rounded.sort((a, b) => b[1] - a[1]);
  rounded[0][1] += diff;
  return Object.fromEntries(rounded.filter(([, w]) => w > 0).map(([t, w]) => [t, w / 1000]));
}

export async function createPieInAccount(
  creds: T212Credentials,
  pie: { name: string; holdings: { ticker: string; exchange: string; weight: number }[] },
  opts: { dryRun?: boolean } = {},
) {
  if (pie.holdings.length > 50) throw new SourceError("Pies can have at most 50 holdings", { transient: false });
  // The instrument list (1 request / 50s per account) gives exact codes. If it's
  // unavailable right now, use Trading 212's standard code pattern instead of
  // making the user wait; Trading 212 itself rejects anything it doesn't offer.
  let meta: Map<string, ApiInstrument> | null = null;
  try {
    meta = await loadInstrumentMeta(creds, { quick: true });
  } catch (err) {
    if (err instanceof SourceError && err.opts.status === 401) throw err;
  }
  const { resolved, missing } = meta ? resolveT212Tickers(pie.holdings, meta) : guessT212Tickers(pie.holdings);
  if (missing.length) {
    throw new SourceError(`Not available on Trading 212: ${missing.join(", ")}`, { transient: false, status: 422 });
  }
  const instrumentShares = toInstrumentShares(pie.holdings.map((h) => [resolved.get(h.ticker)!, h.weight]));
  if (opts.dryRun) return { id: null, name: pie.name, instruments: Object.keys(instrumentShares).length, instrumentShares };
  // Pie names must be unique per account: "Name", then "Name (2)", "Name (3)"…
  const base = pie.name.trim().slice(0, 44);
  for (let n = 1; n <= 6; n++) {
    const name = n === 1 ? pie.name.trim().slice(0, 50) : `${base} (${n})`;
    try {
      const created = await t212Request<{ settings?: { id?: number } }>(
        creds,
        "POST",
        "/equity/pies",
        5_000,
        { name, instrumentShares, dividendCashAction: "REINVEST" },
        2,
      );
      return { id: created?.settings?.id ?? null, name, instruments: Object.keys(instrumentShares).length, instrumentShares };
    } catch (err) {
      if (!(err instanceof SourceError && /same name already exists/i.test(err.message)) || n === 6) throw err;
    }
  }
  throw new SourceError("Couldn't find a free pie name", { transient: false, status: 400 });
}

/**
 * Checks a key can create pies without creating anything: an empty pie is
 * always rejected, and *how* it's rejected tells us about the key.
 */
export async function verifyCreateAccess(creds: T212Credentials): Promise<void> {
  try {
    await t212Request(creds, "POST", "/equity/pies", 5_000, { name: "", instrumentShares: {} }, 1);
  } catch (err) {
    if (err instanceof SourceError && err.opts.status === 400) return; // authenticated + allowed to create
    throw err;
  }
}

const CATALOG = new Map(INSTRUMENTS.map((i) => [i.ticker.replace(/\.$/, ""), i]));

/** "AAPL_US_EQ" → AAPL (US); "VUSAl_EQ" → VUSA (LSE); "SAPd_EQ" → SAP (XETRA). */
export function mapT212Ticker(t212Ticker: string, meta?: ApiInstrument): SourceHolding & { weight: 0 } {
  const m = /^([A-Z0-9.]+?)(?:_US|([a-z]))?_EQ$/.exec(t212Ticker);
  const short = (meta?.shortName ?? m?.[1] ?? t212Ticker.split("_")[0]).toUpperCase();
  const venue = t212Ticker.includes("_US_") ? "US" : (m?.[2] ?? "");
  const exchange = venue === "US" ? "NASDAQ" : venue === "l" ? "LSE" : venue === "d" ? "XETRA" : venue === "p" || venue === "e" ? "EURONEXT" : "NASDAQ";
  const catalog = CATALOG.get(short) ?? CATALOG.get(short + ".");
  const suffix = exchange === "LSE" ? ".L" : exchange === "XETRA" ? ".DE" : exchange === "EURONEXT" ? ".PA" : "";
  return {
    ticker: catalog?.ticker ?? short,
    weight: 0,
    name: meta?.name ?? catalog?.name,
    exchange: catalog?.exchange ?? exchange,
    currency: catalog?.currency ?? meta?.currencyCode,
    symbol: catalog?.symbol ?? short.replace(".", "-") + suffix,
  };
}

function toSourcePie(id: string, detail: ApiPieDetail, meta: Map<string, ApiInstrument>, origin: SourcePie["origin"], creator: string): SourcePie | null {
  const publicUrl = detail.settings.publicUrl?.trim();
  if (!publicUrl) return null; // private pie — not part of the public index
  const total = detail.instruments.reduce((a, i) => a + (i.expectedShare ?? 0), 0) || 1;
  const merged = new Map<string, SourceHolding>();
  for (const i of detail.instruments) {
    const h = mapT212Ticker(i.ticker, meta.get(i.ticker));
    const prev = merged.get(h.ticker);
    merged.set(h.ticker, { ...h, weight: (prev?.weight ?? 0) + i.expectedShare / total });
  }
  const holdings = [...merged.values()].filter((h) => h.weight > 0);
  const created = detail.settings.creationDate ? new Date(detail.settings.creationDate) : new Date();
  return {
    id,
    origin,
    name: detail.settings.name || "Untitled pie",
    description: "",
    creatorName: creator,
    kind: "community",
    category: categoryFor(holdings),
    copiers: 0,
    views: 0,
    createdAt: Number.isFinite(created.getTime()) ? created : new Date(),
    holdings,
    sourceReturn: null,
    sourceReturnCapped: false,
    shareUrl: publicUrl.startsWith("http") ? publicUrl : shareUrlFor(publicUrl),
  };
}

/** Dominant sector by weight (≥50%), else "Mixed". */
export function categoryFor(holdings: SourceHolding[]): string {
  const bySector = new Map<string, number>();
  for (const h of holdings) {
    const sector = CATALOG.get(h.ticker.replace(/\.$/, ""))?.sector ?? "Other";
    const bucket = sector === "ETF" ? "Index & ETF" : sector === "Semiconductors" || sector === "Software" ? "Technology" : sector;
    bySector.set(bucket, (bySector.get(bucket) ?? 0) + h.weight);
  }
  const [top] = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
  return top && top[1] >= 0.5 && top[0] !== "Other" ? top[0] : "Mixed";
}

// ─── one-shot import (user-supplied key, never stored) ───────────────────────

export interface ImportResult {
  pies: SourcePie[];
  skippedPrivate: number;
  total: number;
}

export async function importAccountPies(creds: T212Credentials, opts: { creator: string; maxPies: number }): Promise<ImportResult> {
  const list = await t212Get<ApiPieSummary[]>(creds, "/equity/pies", LIST_INTERVAL_MS);
  const meta = await instrumentMeta(creds);
  const pies: SourcePie[] = [];
  let skippedPrivate = 0;
  for (const p of list.slice(0, opts.maxPies)) {
    const detail = await t212Get<ApiPieDetail>(creds, `/equity/pies/${p.id}`, DETAIL_INTERVAL_MS);
    const shareId = detail.settings.publicUrl ? (shareIdFromUrl(detail.settings.publicUrl) ?? `t${p.id}`) : null;
    const pie = shareId ? toSourcePie(shareId, detail, meta, "imported", opts.creator) : null;
    if (pie) pies.push(pie);
    else skippedPrivate++;
  }
  return { pies, skippedPrivate, total: list.length };
}

// ─── operator accounts: continuously synced source ───────────────────────────

/** T212_API_ACCOUNTS="key:secret[:Display name],key2:secret2". Older single keys: "key" or "key::Display name". */
export function operatorAccounts(): (T212Credentials & { label: string })[] {
  const single: (T212Credentials & { label: string })[] = env.T212_API_KEY?.trim()
    ? [{ key: env.T212_API_KEY.trim(), secret: env.T212_API_SECRET?.trim() ?? "", live: env.T212_API_ENV !== "demo", label: env.T212_API_NAME?.trim() || "Account 1" }]
    : [];
  return single.concat(multiAccounts());
}

function multiAccounts(): (T212Credentials & { label: string })[] {
  return (env.T212_API_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      // Split on the first two colons only; strip stray quotes around parts.
      const [key = "", rest = ""] = splitOnce(s, ":");
      const [secret, label] = splitOnce(rest, ":");
      const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "") ?? "";
      return { key: clean(key), secret: clean(secret), live: env.T212_API_ENV !== "demo", label: clean(label) || `Account ${i + 1}` };
    })
    .filter((a) => a.key && !/^x+$/i.test(a.key)); // ignore the unedited .env.local placeholder
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

export const t212ApiSource: PieSource = {
  id: "t212-api",
  enumeratesAll: true, // within its scope: every pie of every configured account
  async discover(cursor) {
    const accounts = operatorAccounts();
    const idx = cursor ? parseInt(cursor, 10) : 0;
    const acct = accounts[idx];
    if (!acct) return { items: [], nextCursor: null };
    const list = await t212Get<ApiPieSummary[]>(acct, "/equity/pies", LIST_INTERVAL_MS);
    return {
      items: list.map((p) => ({ id: `a${idx}-${p.id}`, name: "", copiers: 0 })),
      nextCursor: idx + 1 < accounts.length ? String(idx + 1) : null,
    };
  },
  async fetchPie(id) {
    const m = /^a(\d+)-(\d+)$/.exec(id);
    const acct = m ? operatorAccounts()[Number(m[1])] : undefined;
    if (!m || !acct) return null;
    try {
      const detail = await t212Get<ApiPieDetail>(acct, `/equity/pies/${m[2]}`, DETAIL_INTERVAL_MS);
      return toSourcePie(id, detail, await instrumentMeta(acct), "t212-api", acct.label);
    } catch (err) {
      if (err instanceof SourceError && err.opts.status === 404) return null;
      throw err;
    }
  },
};
