/** User-driven ingestion: manual share-link submissions and one-shot API imports. */
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { bumpDataVersion } from "../cache";
import { INSTRUMENTS } from "../universe/instruments";
import { categoryFor, importAccountPies, shareIdFromUrl, shareUrlFor, type T212Credentials } from "../sources/t212";
import type { SourceHolding, SourcePie } from "../sources";
import { applySourcePie } from "./jobs";

const CATALOG = new Map(INSTRUMENTS.map((i) => [i.ticker.replace(/\.$/, ""), i]));

/**
 * Parses lines like "NVDA 25", "VUSA\t12.5%", "AAPL, 10" — the same format as
 * the "Copy holdings & weights" button and most spreadsheet pastes.
 */
export function parseHoldings(text: string): { holdings: SourceHolding[]; error?: string } {
  const out = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([A-Za-z0-9.\-]{1,12})[\s,;:|]+([0-9]+(?:[.,][0-9]+)?)\s*%?$/.exec(line);
    if (!m) {
      // Allow a leading pie-name line (as produced by our own copy button).
      if (out.size === 0 && !/\d/.test(line.slice(-1))) continue;
      return { holdings: [], error: `Couldn't read “${line}”. Use one holding per line: TICKER PERCENT` };
    }
    const ticker = m[1].toUpperCase().replace(/\.$/, "");
    out.set(ticker, (out.get(ticker) ?? 0) + Number(m[2].replace(",", ".")));
  }
  if (out.size === 0) return { holdings: [], error: "Add at least one holding" };
  if (out.size > 50) return { holdings: [], error: "Trading 212 pies have at most 50 holdings" };
  const total = [...out.values()].reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1.5) return { holdings: [], error: `Weights add up to ${total.toFixed(1)}%, they should total 100%` };

  return {
    holdings: [...out.entries()].map(([t, w]) => {
      const def = CATALOG.get(t);
      return {
        ticker: def?.ticker ?? t,
        weight: w / total,
        name: def?.name,
        exchange: def?.exchange ?? "NASDAQ",
        currency: def?.currency ?? "USD",
        symbol: def?.symbol ?? t.replace(".", "-"),
      };
    }),
  };
}

const VERIFIED = new Set(["t212-api", "imported"]);

export async function submitManualPie(input: { shareUrl: string; name: string; creator?: string; holdings: string }) {
  const shareId = shareIdFromUrl(input.shareUrl);
  if (!shareId) return { ok: false as const, error: "That isn't a Trading 212 pie link (expected https://www.trading212.com/pies/…)" };
  const parsed = parseHoldings(input.holdings);
  if (parsed.error) return { ok: false as const, error: parsed.error };

  const db = await getDb();
  const shareUrl = shareUrlFor(shareId);
  const existing = await db.query.pies.findFirst({ where: eq(schema.pies.shareUrl, shareUrl) });
  if (existing && VERIFIED.has(existing.origin)) {
    return { ok: false as const, error: "This pie is already indexed from the official API", id: existing.id };
  }

  const pie: SourcePie = {
    id: existing?.id ?? shareId,
    origin: "submitted",
    name: input.name,
    description: "",
    creatorName: input.creator?.trim() || "Community submission",
    kind: "community",
    category: categoryFor(parsed.holdings),
    copiers: 0,
    views: 0,
    createdAt: existing?.createdAt ?? new Date(),
    holdings: parsed.holdings,
    sourceReturn: null,
    sourceReturnCapped: false,
    shareUrl,
  };
  await applySourcePie(db, pie, existing);
  await bumpDataVersion();
  return { ok: true as const, id: pie.id, updated: !!existing };
}

export async function importWithKey(creds: T212Credentials, creator?: string) {
  const { pies, skippedPrivate, total } = await importAccountPies(creds, { creator: creator?.trim() || "Trading 212 user", maxPies: 25 });
  const db = await getDb();
  const added: { id: string; name: string }[] = [];
  for (const pie of pies) {
    // Same share link already indexed under another id (e.g. an operator account) → keep that one.
    const dupe = await db.query.pies.findFirst({
      where: and(eq(schema.pies.shareUrl, pie.shareUrl!), ne(schema.pies.id, pie.id)),
    });
    if (dupe) continue;
    const current = await db.query.pies.findFirst({ where: eq(schema.pies.id, pie.id) });
    await applySourcePie(db, pie, current);
    added.push({ id: pie.id, name: pie.name });
  }
  await bumpDataVersion();
  return { total, imported: added, skippedPrivate };
}
