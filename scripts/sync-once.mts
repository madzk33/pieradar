/**
 * Run one full pipeline pass from the CLI (bootstrap, CI smoke test, or a
 * plain cron on a VM). Don't run it while `next dev` holds the local PGlite DB.
 */
import { discoverSweep, recomputeAllMetrics, refreshDue, refreshQuotes, seedInstruments, syncHistory } from "../src/lib/sync/jobs";
import { listPies, getIndexStats } from "../src/lib/repo";

const t = Date.now();
const step = async (name: string, fn: () => Promise<unknown>) => {
  const s = Date.now();
  const r = await fn();
  console.log(`${name.padEnd(10)} ${String(Date.now() - s).padStart(6)}ms`, JSON.stringify(r));
};

await step("instruments", async () => (await seedInstruments(), "ok"));
await step("history", syncHistory);
await step("discover", () => discoverSweep());
for (;;) {
  let due = 0;
  await step("refresh", async () => {
    const r = await refreshDue(1000, 4);
    due = Number(r.due ?? 0);
    return r;
  });
  if (!due) break;
}
await step("quotes", refreshQuotes);
await step("metrics", recomputeAllMetrics);

const top = await listPies({ sort: "y1", limit: 5 });
console.log(`\n${top.total} pies indexed. Top by uncapped 1Y:`);
for (const p of top.items) console.log(`  ${(p.metrics.y1! * 100).toFixed(2).padStart(8)}%  ${p.name} — ${p.creatorName} (${p.holdingsCount} holdings, ${p.copiers} copiers)${p.sourceReturnCapped ? "  [T212 shows capped 20%]" : ""}`);
const s = await getIndexStats();
console.log(`\nactive=${s.active} pending=${s.pending} removed=${s.removed} total ${Date.now() - t}ms`);
process.exit(0);
