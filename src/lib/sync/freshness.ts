/**
 * "Update when I open it": called (via `after()`, so it never delays a response)
 * whenever a page or the live API is requested.
 *
 * Locally the in-process scheduler does the work; this just nudges it. On
 * serverless hosts (Vercel) there is no always-on process, so visits drive the
 * pipeline: each job has a claim row in sync_state, and a conditional update
 * on it acts as a lock so only one instance runs a given job per interval. At
 * most one job runs per request, highest priority first, to stay well inside
 * the function time limit.
 */
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { kickLocal, localSchedulerRunning } from "./local-scheduler";
import { discoverSweep, liveTick, refreshDue } from "./jobs";

const JOBS = [
  { key: "live", everyMs: 30_000, run: () => liveTick() },
  { key: "refresh", everyMs: 2 * 60_000, run: () => refreshDue(60, 4) },
  { key: "discover", everyMs: 10 * 60_000, run: () => discoverSweep(40) },
] as const;

export async function ensureFresh() {
  try {
    if (localSchedulerRunning()) {
      kickLocal();
      return;
    }
    const db = await getDb();
    const now = new Date();
    for (const job of JOBS) {
      const claimKey = `on-demand:${job.key}`;
      await db.insert(schema.syncState).values({ key: claimKey, value: {}, updatedAt: new Date(0) }).onConflictDoNothing();
      const claimed = await db
        .update(schema.syncState)
        .set({ value: { at: now.toISOString() }, updatedAt: now })
        .where(and(eq(schema.syncState.key, claimKey), lt(schema.syncState.updatedAt, new Date(now.getTime() - job.everyMs))))
        .returning({ key: schema.syncState.key });
      if (claimed.length) {
        await job.run();
        return; // one job per request
      }
    }
  } catch (err) {
    console.error("[sync] on-demand refresh failed:", err);
  }
}
