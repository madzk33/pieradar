import { NextResponse } from "next/server";
import { getPie, getRelated } from "@/lib/repo";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const withRelated = new URL(req.url).searchParams.get("related") === "1";
  const pie = await getPie(id);
  if (!pie) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const related = withRelated ? await getRelated(id) : undefined;
  return NextResponse.json({ pie, related }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
}
