import { NextResponse } from "next/server";
import { getCategories } from "@/lib/repo";

export async function GET() {
  return NextResponse.json(await getCategories(), { headers: { "Cache-Control": "public, s-maxage=120" } });
}
