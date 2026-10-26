/**
 * Add real pies to the index:
 *   { mode: "manual", shareUrl, name, creator?, holdings: "AAPL 25\nMSFT 25…" }
 *   { mode: "import", apiKey, apiSecret, creator? }  — key used once, never stored or logged
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { submitManualPie, importWithKey } from "@/lib/sync/ingest";

export const maxDuration = 300;

const Manual = z.object({
  mode: z.literal("manual"),
  shareUrl: z.string().min(10).max(300),
  name: z.string().trim().min(1).max(80),
  creator: z.string().trim().max(40).optional(),
  holdings: z.string().min(2).max(4000),
});
const Import = z.object({
  mode: z.literal("import"),
  apiKey: z.string().min(8).max(200),
  apiSecret: z.string().min(8).max(200),
  creator: z.string().trim().max(40).optional(),
});
const Body = z.discriminatedUnion("mode", [Manual, Import]);

let importsInFlight = 0;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const body = parsed.data;
  try {
    if (body.mode === "manual") {
      const r = await submitManualPie(body);
      return NextResponse.json(r, { status: r.ok ? 200 : 422 });
    }
    if (env.ALLOW_USER_IMPORT !== "on") return NextResponse.json({ error: "Imports are disabled on this deployment" }, { status: 403 });
    if (importsInFlight >= 2) return NextResponse.json({ error: "Busy importing, please try again in a minute" }, { status: 429 });
    importsInFlight++;
    try {
      return NextResponse.json(await importWithKey({ key: body.apiKey, secret: body.apiSecret, live: true }, body.creator));
    } finally {
      importsInFlight--;
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Import failed" }, { status: 502 });
  }
}
