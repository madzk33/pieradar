/**
 * One-click "create this pie in my Trading 212 account" via the official API
 * (POST /equity/pies). Creates the pie with its holdings and target weights;
 * no money is invested. Uses the visitor's key (sent once, never stored or
 * logged) or, when ALLOW_OWNER_CREATE=on, the operator's own key.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getPie } from "@/lib/repo";
import { createPieInAccount, operatorAccounts } from "@/lib/sources/t212";
import { SourceError } from "@/lib/sources";
import { cookies } from "next/headers";
import { SESSION_COOKIE, openCredentials } from "@/lib/broker-session";
import { appendFileSync, mkdirSync } from "node:fs";

/** Local troubleshooting trail (.data/create-pie.log). Never contains keys. */
function logAttempt(entry: Record<string, unknown>) {
  try {
    mkdirSync(".data", { recursive: true });
    appendFileSync(".data/create-pie.log", JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* read-only filesystem (e.g. serverless) */
  }
}

export const maxDuration = 120;

const Body = z.object({
  pieId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(50).optional(),
  apiKey: z.string().trim().min(8).max(200).optional(),
  apiSecret: z.string().trim().max(200).optional(),
  /** Resolve everything but skip the final create (diagnostics). */
  dryRun: z.boolean().optional(),
});

let inFlight = 0;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { pieId, name, apiKey, apiSecret, dryRun } = parsed.data;

  // Priority: key sent with this request → account connected in this browser → key in server settings.
  const connected = openCredentials((await cookies()).get(SESSION_COOKIE)?.value);
  const creds = apiKey
    ? { key: apiKey, secret: apiSecret ?? "", live: true }
    : (connected ?? (env.ALLOW_OWNER_CREATE === "on" ? operatorAccounts()[0] : undefined));
  if (!creds) {
    logAttempt({ pieId, mode: "none", result: "needKey" });
    return NextResponse.json({ error: "needKey" }, { status: 400 });
  }
  const mode = apiKey ? "pasted-key" : connected ? "connected-in-browser" : "connected-settings";

  const pie = await getPie(pieId);
  if (!pie) return NextResponse.json({ error: "Pie not found" }, { status: 404 });

  if (inFlight >= 3) return NextResponse.json({ error: "Busy, please try again in a few seconds" }, { status: 429 });
  inFlight++;
  try {
    const r = await createPieInAccount(
      creds,
      { name: name ?? pie.name, holdings: pie.holdingsDetail.map((h) => ({ ticker: h.ticker, exchange: h.exchange, weight: h.target })) },
      { dryRun },
    );
    logAttempt({ pieId, mode, dryRun: !!dryRun, result: "ok", t212PieId: r.id, name: r.name, instruments: r.instruments, shares: r.instrumentShares });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const status = err instanceof SourceError ? (err.opts.status ?? 502) : 502;
    // Never log credentials; the message and status are enough to diagnose.
    console.warn(`[create-pie] ${pieId} failed (${status}): ${(err as Error).message}`);
    logAttempt({ pieId, mode, dryRun: !!dryRun, result: "error", status, message: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message || "Couldn't create the pie" }, { status: status >= 400 && status < 600 ? status : 502 });
  } finally {
    inFlight--;
  }
}
