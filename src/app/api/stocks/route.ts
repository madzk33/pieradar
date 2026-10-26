import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStockRankings } from "@/lib/repo";
import { after } from "next/server";
import { ensureFresh } from "@/lib/sync/freshness";

const Query = z.object({
  scope: z.enum(["current", "all"]).default("current"),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

export async function GET(req: NextRequest) {
  after(ensureFresh);
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const data = await getStockRankings(parsed.data.scope, parsed.data.limit);
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
