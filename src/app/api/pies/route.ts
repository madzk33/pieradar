import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listPies } from "@/lib/repo";
import { SORTS } from "@/lib/types";
import { after } from "next/server";
import { ensureFresh } from "@/lib/sync/freshness";

const num = z.coerce.number().optional();
const Query = z.object({
  q: z.string().max(100).optional(),
  sort: z.enum(Object.keys(SORTS) as [keyof typeof SORTS, ...(keyof typeof SORTS)[]]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  category: z.string().max(40).optional(),
  kind: z.enum(["community", "model"]).optional(),
  minHoldings: num,
  maxHoldings: num,
  minReturn: num,
  maxReturn: num,
  minCopiers: num,
  ticker: z.string().max(12).regex(/^[A-Za-z0-9.\-]+$/).optional(),
  origin: z.enum(["real", "demo", "t212-api", "imported", "submitted"]).optional(),
  ids: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean).slice(0, 200) : undefined)),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  after(ensureFresh);
  const raw = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = Query.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
  try {
    const data = await listPies(parsed.data);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Index temporarily unavailable" }, { status: 503 });
  }
}
