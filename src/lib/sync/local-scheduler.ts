/**
 * In-process scheduler for local development (and any long-running Node host).
 * On Vercel the same jobs run under Inngest instead — see src/inngest/functions.ts.
 * Jobs are serialised through one queue so they never contend for the database,
 * and a job is never queued twice: after a sleep or a slow run, the timers
 * collapse into one pending run instead of a backlog.
 */
import { marketsOpen } from "../market";
import {
  discoverSweep,
  liveTick,
  recomputeAllMetrics,
  refreshDue,
  seedInstruments,
  syncHistory,
} from "./jobs";

const g = globalThis as unknown as { __prScheduler?: boolean };

const pending = new Set<string>();
const lastFinished = new Map<string, number>();
let chain: Promise<unknown> = Promise.resolve();

function enqueue(name: string, fn: () => Promise<unknown>) {
  if (pending.has(name)) return chain;
  pending.add(name);
  chain = chain
    .then(async () => {
      const t = Date.now();
      try {
        const stats = await fn();
        console.log(`[sync] ${name} ${Date.now() - t}ms`, JSON.stringify(stats));
      } finally {
        pending.delete(name);
        lastFinished.set(name, Date.now());
      }
    })
    .catch((err) => console.error(`[sync] ${name} failed:`, err));
  return chain;
}

function every(ms: number, name: string, fn: () => Promise<unknown>) {
  setInterval(() => enqueue(name, fn), ms).unref?.();
}

const live = () => (marketsOpen() || process.env.DEMO_ALWAYS_LIVE !== "0" ? liveTick() : Promise.resolve({ skipped: 1 }));
const refresh = () => refreshDue(400, 4);

export function localSchedulerRunning() {
  return !!g.__prScheduler;
}

/**
 * Someone opened the site: if prices or pies are older than `maxAgeMs`, run
 * the live heartbeat (and due refreshes) now instead of waiting for the timer.
 */
export function kickLocal(maxAgeMs = 60_000) {
  const now = Date.now();
  if (now - (lastFinished.get("live") ?? 0) > maxAgeMs) enqueue("live", live);
  if (now - (lastFinished.get("refresh") ?? 0) > 60_000) enqueue("refresh", refresh);
}

export function startLocalScheduler() {
  if (g.__prScheduler) return;
  g.__prScheduler = true;
  console.log("[sync] local scheduler starting");

  // Bootstrap: catalogue → price history → full discovery → drain the refresh queue.
  enqueue("seed-instruments", async () => (await seedInstruments(), { ok: 1 }));
  enqueue("history", syncHistory);
  enqueue("discover", () => discoverSweep());
  enqueue("refresh(bootstrap)", async () => {
    let total = 0;
    for (;;) {
      const r = await refreshDue(1000, 4);
      total += r.due ?? 0;
      if (!r.due) break;
    }
    return { refreshed: total };
  });
  enqueue("metrics", recomputeAllMetrics);

  every(20_000, "live", live);
  every(30_000, "refresh", refresh);
  every(3 * 60_000, "discover", () => discoverSweep());
  every(60 * 60_000, "history", syncHistory);
}
