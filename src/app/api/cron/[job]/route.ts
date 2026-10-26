/**
 * Vercel Cron fallback for deployments without Inngest. Each call runs a
 * bounded slice of work so it fits within the function time limit.
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { discoverSweep, liveTick, refreshDue, syncHistory } from "@/lib/sync/jobs";

export const maxDuration = 300;

const JOBS: Record<string, () => Promise<unknown>> = {
  discover: () => discoverSweep(50),
  refresh: () => refreshDue(300, 8),
  live: () => liveTick(),
  history: () => syncHistory(),
};

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Inngest is the primary scheduler; cron only drives the pipeline without it.
  if (env.INNGEST_SIGNING_KEY) return NextResponse.json({ skipped: "inngest configured" });
  const { job } = await params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  try {
    return NextResponse.json({ job, result: await run() });
  } catch (err) {
    return NextResponse.json({ job, error: String((err as Error).message) }, { status: 500 });
  }
}
