/**
 * "Update when I open it": called (via `after()`, so it never delays a response)
 * whenever a page or the live API is requested. If data is stale it triggers an
 * immediate live update instead of waiting for the next scheduled run.
 */
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { kickLocal, localSchedulerRunning } from "./local-scheduler";
import { liveTick } from "./jobs";

const STALE_MS = 30_000;
const CLAIM_KEY = "live:on-demand";

export async function ensureFresh() {
  try {
    if (localSchedulerRunning()) {
      kickLocal();
      return;
    }
    // Serverless: many instances may see the same stale data. A conditional
    // update on one row acts as a lock so only one of them runs the update.
    const db = await getDb();
    const now = new Date();
    await db.insert(schema.syncState).values({ key: CLAIM_KEY, value: {}, updatedAt: new Date(0) }).onConflictDoNothing();
    const claimed = await db
      .update(schema.syncState)
      .set({ value: { at: now.toISOString() }, updatedAt: now })
      .where(and(eq(schema.syncState.key, CLAIM_KEY), lt(schema.syncState.updatedAt, new Date(now.getTime() - STALE_MS))))
      .returning({ key: schema.syncState.key });
    if (claimed.length) await liveTick();
  } catch (err) {
    console.error("[sync] on-demand refresh failed:", err);
  }
}
