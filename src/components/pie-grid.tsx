"use client";

import { useQuery } from "@tanstack/react-query";
import type { PieListResponse } from "@/lib/types";
import { PieCard, PieCardSkeleton } from "./pie-card";

/** Simple (non-virtual) grid for short id lists like the watchlist. */
export function useIdsQuery(ids: string[]) {
  return useQuery({
    queryKey: ["pies-by-id", ids],
    enabled: ids.length > 0,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/pies?ids=${ids.join(",")}&limit=200&sort=y1`, { signal });
      if (!res.ok) throw new Error("pies");
      return (await res.json()) as PieListResponse;
    },
    placeholderData: (p) => p,
  });
}

export function PieGrid({ items, loading, skeletons = 3 }: { items: PieListResponse["items"]; loading?: boolean; skeletons?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {loading
        ? Array.from({ length: skeletons }).map((_, i) => (
            <div key={i} className="h-[214px]">
              <PieCardSkeleton />
            </div>
          ))
        : items.map((p) => (
            <div key={p.id} className="min-h-[214px]">
              <PieCard pie={p} />
            </div>
          ))}
    </div>
  );
}
