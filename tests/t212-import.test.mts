/** Import flow against a mock of the official T212 API (shapes from docs.trading212.com api.json). */
import assert from "node:assert/strict";
import http from "node:http";

const PORT = 47212;
let auth = "";
let created: unknown = null;
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/v0/equity/pies") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      created = JSON.parse(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ settings: { id: 999 } }));
    });
    return;
  }
  auth = req.headers.authorization ?? "";
  const json = (b: unknown) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(b)));
  if (req.url === "/api/v0/equity/pies") return json([{ id: 101 }, { id: 102 }]);
  if (req.url === "/api/v0/equity/metadata/instruments")
    return json([
      { ticker: "VUSAl_EQ", shortName: "VUSA", name: "Vanguard S&P 500", currencyCode: "GBX", type: "ETF" },
      { ticker: "VUSA_US_EQ", shortName: "VUSA", name: "Unrelated US listing", currencyCode: "USD", type: "STOCK" },
      { ticker: "NVDA_US_EQ", shortName: "NVDA", name: "NVIDIA", currencyCode: "USD", type: "STOCK" },
    ]);
  if (req.url === "/api/v0/equity/pies/101")
    return json({
      instruments: [
        { ticker: "NVDA_US_EQ", expectedShare: 0.6, currentShare: 0.62 },
        { ticker: "VUSAl_EQ", expectedShare: 0.4, currentShare: 0.38 },
      ],
      settings: { id: 101, name: "My AI Pie", creationDate: "2025-03-01T10:00:00Z", publicUrl: "https://www.trading212.com/pies/l7MockPublicPie01" },
    });
  if (req.url === "/api/v0/equity/pies/102")
    return json({ instruments: [{ ticker: "AAPL_US_EQ", expectedShare: 1 }], settings: { id: 102, name: "Private", publicUrl: null } });
  res.statusCode = 404;
  res.end();
});
await new Promise<void>((r) => server.listen(PORT, r));
process.env.T212_API_BASE = `http://127.0.0.1:${PORT}`;

const { importWithKey } = await import("../src/lib/sync/ingest");
const { getPie } = await import("../src/lib/repo");
const { getDb, schema } = await import("../src/lib/db/client");
const { eq } = await import("drizzle-orm");

const t = Date.now();
const r = await importWithKey({ key: "testkey123", secret: "testsecret456" }, "Mock Owner");
assert.equal(auth, "Basic " + Buffer.from("testkey123:testsecret456").toString("base64"));
assert.equal(r.total, 2);
assert.equal(r.skippedPrivate, 1, "private pies are skipped");
assert.deepEqual(r.imported, [{ id: "l7MockPublicPie01", name: "My AI Pie" }]);

const pie = await getPie("l7MockPublicPie01");
assert.ok(pie);
assert.equal(pie.origin, "imported");
assert.equal(pie.shareUrl, "https://www.trading212.com/pies/l7MockPublicPie01");
assert.deepEqual(pie.holdingsDetail.map((h) => [h.ticker, h.target]), [["NVDA", 0.6], ["VUSA", 0.4]]);
assert.ok(pie.metrics.y1 !== null, "returns computed");
console.log(`  ✓ import via official API: 1 public pie in, 1 private skipped, paced in ${((Date.now() - t) / 1000).toFixed(0)}s`);

// One-click create: same holdings and weights, resolved to the broker's instrument codes.
const { createPieInAccount } = await import("../src/lib/sources/t212");
const made = await createPieInAccount(
  { key: "testkey123", secret: "testsecret456" },
  { name: pie.name, holdings: pie.holdingsDetail.map((h) => ({ ticker: h.ticker, exchange: h.exchange, weight: h.target })) },
);
assert.equal(made.id, 999);
assert.deepEqual(created, {
  name: "My AI Pie",
  instrumentShares: { NVDA_US_EQ: 0.6, VUSAl_EQ: 0.4 },
  dividendCashAction: "REINVEST",
});
await assert.rejects(
  createPieInAccount({ key: "testkey123", secret: "x" }, { name: "Bad", holdings: [{ ticker: "ZZZZ", exchange: "NASDAQ", weight: 1 }] }),
  /Not available on Trading 212: ZZZZ/,
);
console.log("  ✓ create in broker: picks the London VUSA listing, weights sum to 1, unknown tickers rejected");

await (await getDb()).delete(schema.pies).where(eq(schema.pies.id, "l7MockPublicPie01"));
server.close();
process.exit(0);
