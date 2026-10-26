import { NextResponse } from "next/server";
import { getIndexStats } from "@/lib/repo";
import { after } from "next/server";
import { ensureFresh } from "@/lib/sync/freshness";

export async function GET() {
  after(ensureFresh);
  return NextResponse.json(await getIndexStats(), { headers: { "Cache-Control": "no-store" } });
}
