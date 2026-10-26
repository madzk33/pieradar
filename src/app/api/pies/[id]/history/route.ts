import { NextResponse } from "next/server";
import { getHistory } from "@/lib/repo";
import type { RangeKey } from "@/lib/perf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = (new URL(req.url).searchParams.get("range") ?? "1Y") as RangeKey;
  const data = await getHistory(id, range);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
