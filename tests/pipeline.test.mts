/**
 * Smoke tests for the return math and the removal state machine.
 * Run with `npm test` (uses the local PGlite DB; run `npm run sync` first).
 */
import assert from "node:assert/strict";
import { computeMetrics, windowReturn, actualWeights, type PriceBook } from "../src/lib/perf";
import { getDb, schema } from "../src/lib/db/client";
import { refreshPie } from "../src/lib/sync/jobs";
import { parseHoldings, submitManualPie } from "../src/lib/sync/ingest";
import { mapT212Ticker } from "../src/lib/sources/t212";
import { getStockRankings, listPies } from "../src/lib/repo";
import { eq } from "drizzle-orm";

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Two instruments: A doubles over the year, B flat. 50/50 pie → +50%, never capped.
const days = ["2025-10-16", "2026-04-15", "2026-10-15"];
const book: PriceBook = {
  series: new Map([
    ["A", { days, closes: [100, 150, 200] }],
    ["B", { days, closes: [50, 50, 50] }],
    ["NEW", { days: ["2026-09-01", "2026-10-15"], closes: [10, 12] }],
  ]),
  quotes: new Map([
    ["A", { price: 200, prevClose: 190 }],
    ["B", { price: 50, prevClose: 50 }],
  ]),
};
const now = new Date("2026-10-16T12:00:00Z");

await test("1Y return is the exact uncapped figure", () => {
  const r = windowReturn([{ ticker: "A", weight: 0.5 }, { ticker: "B", weight: 0.5 }], book, "2025-10-16");
  assert.equal(r.ret!.toFixed(6), "0.500000");
  assert.equal(r.coverage, 1);
});

await test("holdings without history are excluded and coverage reported", () => {
  const r = windowReturn([{ ticker: "A", weight: 0.8 }, { ticker: "NEW", weight: 0.2 }], book, "2025-10-16");
  assert.equal(r.ret!.toFixed(6), "1.000000");
  assert.equal(r.coverage, 0.8);
});

await test("actual weights drift with prices since rebalance", () => {
  const w = actualWeights([{ ticker: "A", weight: 0.5 }, { ticker: "B", weight: 0.5 }], book, "2025-10-16");
  assert.equal(w.get("A")!.toFixed(4), "0.6667");
});

await test("today's change uses drifted weights", () => {
  const m = computeMetrics([{ ticker: "A", weight: 0.5 }, { ticker: "B", weight: 0.5 }], book, {
    createdAt: new Date("2025-10-16"),
    holdingsChangedAt: new Date("2025-10-16"),
    now,
  });
  // A is 2/3 of the pie and rose 200/190 today.
  assert.equal(m.day1!.toFixed(6), ((2 / 3) * (200 / 190) + 1 / 3 - 1).toFixed(6));
  assert.equal(m.y1!.toFixed(4), "0.5000");
});

const db = await getDb();
await test("a pie is removed only after two consecutive not-found responses", async () => {
  const id = "n-test-gone";
  await db.delete(schema.pies).where(eq(schema.pies.id, id));
  await db.insert(schema.pies).values({
    id, name: "Gone", creatorName: "x", createdAt: now, holdingsChangedAt: now, lastSyncedAt: now,
  });
  assert.equal(await refreshPie(db, id), "suspect");
  let row = await db.query.pies.findFirst({ where: eq(schema.pies.id, id) });
  assert.equal(row!.status, "active");
  assert.equal(await refreshPie(db, id), "removed");
  row = await db.query.pies.findFirst({ where: eq(schema.pies.id, id) });
  assert.equal(row!.status, "removed");
  await db.delete(schema.pies).where(eq(schema.pies.id, id));
});

await test("listed pies always have holdings and metrics", async () => {
  const [{ bad }] = (await db.execute(
    `select count(*)::int as bad from pies p left join pie_metrics m on m.pie_id = p.id
     where p.status = 'active' and p.last_synced_at is not null and (p.holdings_count = 0 or m.pie_id is null)`,
  )).rows as { bad: number }[];
  assert.equal(bad, 0);
});

await test("T212 API tickers map to catalogue tickers and provider symbols", () => {
  assert.deepEqual([mapT212Ticker("AAPL_US_EQ").ticker, mapT212Ticker("AAPL_US_EQ").symbol], ["AAPL", "AAPL"]);
  assert.deepEqual([mapT212Ticker("VUSAl_EQ").ticker, mapT212Ticker("VUSAl_EQ").symbol], ["VUSA", "VUSA.L"]);
  assert.equal(mapT212Ticker("BPl_EQ").ticker, "BP.");
  assert.equal(mapT212Ticker("ZZZZl_EQ").symbol, "ZZZZ.L");
});

await test("holdings paste parser accepts our copy format and rejects bad totals", () => {
  const ok = parseHoldings("My Pie\nNVDA\t60.0%\nmsft, 40");
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.holdings.map((h) => [h.ticker, h.weight]), [["NVDA", 0.6], ["MSFT", 0.4]]);
  assert.match(parseHoldings("NVDA 60\nMSFT 20").error!, /80\.0%/);
});

await test("a submitted share link becomes a real, linkable pie with live returns", async () => {
  const r = await submitManualPie({
    shareUrl: "https://www.trading212.com/pies/l7TestPieRadar123",
    name: "Test Submission",
    holdings: "NVDA 50\nMSFT 50",
  });
  assert.ok(r.ok, (r as { error?: string }).error);
  const res = await listPies({ ids: ["l7TestPieRadar123"] });
  assert.equal(res.items[0].origin, "submitted");
  assert.equal(res.items[0].shareUrl, "https://www.trading212.com/pies/l7TestPieRadar123");
  assert.equal(res.items[0].copiers, null);
  assert.ok(res.items[0].metrics.y1 !== null);
  await db.delete(schema.pies).where(eq(schema.pies.id, "l7TestPieRadar123"));
});

await test("stock rankings are sorted by number of pies, highest first", async () => {
  const all = await getStockRankings("current");
  assert.ok(all.items.length > 50);
  for (let i = 1; i < all.items.length; i++) assert.ok(all.items[i - 1].pies >= all.items[i].pies);
  const top = await getStockRankings("all", 30);
  assert.equal(top.items.length, 30);
  const leader = all.items[0];
  const holding = await listPies({ ticker: leader.ticker, limit: 1 });
  assert.equal(holding.total, leader.pies);
});

console.log(`\n${passed} passed`);
process.exit(0);
