import { NextResponse, type NextRequest } from "next/server";
import { getLive } from "@/lib/repo";
import { after } from "next/server";
import { ensureFresh } from "@/lib/sync/freshness";

/** Batched live numbers for the pies currently on screen. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  after(ensureFresh);
  const data = await getLive(ids);
  return NextResponse.json({ data, at: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=5" } });
}
