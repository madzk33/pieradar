import { Suspense } from "react";
import { Discover } from "@/components/discover";
import { getCategories, getIndexStats, listPies } from "@/lib/repo";
import { after } from "next/server";
import { ensureFresh } from "@/lib/sync/freshness";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  // First page is server-rendered so the grid paints immediately; the client
  // takes over for filtering, infinite scroll and live updates.
  after(ensureFresh);
  const [initial, categories, stats] = await Promise.all([
    listPies({ sort: "y1", limit: 48 }).catch(() => null),
    getCategories().catch(() => []),
    getIndexStats().catch(() => null),
  ]);
  return (
    <Suspense>
      <Discover initial={initial} categories={categories} indexed={stats?.active ?? initial?.total ?? 0} />
    </Suspense>
  );
}
