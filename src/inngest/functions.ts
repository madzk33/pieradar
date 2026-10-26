/**
 * Production pipeline on Inngest. Same job functions as the local scheduler,
 * with durable steps, retries, fan-out and source-level throttling.
 */
import { getDb } from "@/lib/db/client";
import { marketsOpen } from "@/lib/market";
import { enabledSources } from "@/lib/sources";
import { discoverPage, dueIds, liveTick, refreshPie, seedInstruments, syncHistory } from "@/lib/sync/jobs";
import { inngest } from "./client";

/** Walks the source one page per step so long sweeps survive timeouts. */
export const discover = inngest.createFunction(
  { id: "discover-pies", concurrency: 1, triggers: [{ cron: "*/5 * * * *" }, { event: "pieradar/discover.requested" }] },
  async ({ step }) => {
    let totals = { pages: 0, added: 0, flagged: 0 };
    for (const source of enabledSources()) {
      for (let i = 0; i < 500; i++) {
        const r = await step.run(`${source.id}-page-${i}`, async () => discoverPage(await getDb(), source));
        totals = { pages: totals.pages + 1, added: totals.added + r.added, flagged: totals.flagged + r.flagged };
        if (r.done) break;
      }
    }
    return totals;
  },
);

/** Every minute: fan out refresh events for pies whose tier interval elapsed. */
export const scheduleRefresh = inngest.createFunction(
  { id: "schedule-refresh", concurrency: 1, triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const ids = await step.run("pick-due", () => dueIds(500));
    if (ids.length) {
      await step.sendEvent(
        "fan-out",
        // Group by upstream account so throttling matches T212's per-account limits.
        ids.map((id) => ({ name: "pieradar/pie.refresh", data: { id, bucket: /^a(\d+)-/.exec(id)?.[1] ?? "local" } })),
      );
    }
    return { enqueued: ids.length };
  },
);

/** One pie. Throttled to the source's request budget; retried with backoff. */
export const refreshOne = inngest.createFunction(
  {
    id: "refresh-pie",
    triggers: [{ event: "pieradar/pie.refresh" }],
    concurrency: [{ limit: 10 }, { key: "event.data.bucket", limit: 1 }],
    // T212 API: pie detail is 1 req / 5s per account → 12/min per bucket.
    throttle: { key: "event.data.bucket", limit: 12, period: "1m" },
    retries: 3,
  },
  async ({ event, step }) => {
    const id = (event.data as { id: string }).id;
    return step.run("refresh", async () => refreshPie(await getDb(), id));
  },
);

/** Live heartbeat: quotes + re-mark all metrics. Every minute while markets are open, every 15 otherwise. */
export const live = inngest.createFunction(
  { id: "live-tick", concurrency: 1, triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const minute = new Date().getUTCMinutes();
    if (!marketsOpen() && minute % 15 !== 0) return { skipped: true };
    return step.run("tick", () => liveTick());
  },
);

export const history = inngest.createFunction(
  { id: "price-history", concurrency: 1, triggers: [{ cron: "15 * * * *" }, { event: "pieradar/history.requested" }] },
  async ({ step }) => {
    await step.run("seed-instruments", () => seedInstruments());
    return step.run("backfill", () => syncHistory());
  },
);

export const functions = [discover, scheduleRefresh, refreshOne, live, history];
