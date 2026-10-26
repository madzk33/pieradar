"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useCollections } from "./collections";
import { PieGrid, useIdsQuery } from "./pie-grid";
import { StateBox } from "./discover";

export function Watchlist() {
  const { watchlist, ready, toggleWatch } = useCollections();
  const { data, isPending, isError, refetch } = useIdsQuery(watchlist);
  const found = new Set(data?.items.map((p) => p.id));
  const missing = data ? watchlist.filter((id) => !found.has(id)) : [];

  return (
    <div>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[32px]">Watchlist</h1>
      <p className="mb-5 mt-1 text-[13.5px] text-muted">Saved on this device. Numbers update live while you&apos;re here.</p>

      {!ready ? (
        <PieGrid items={[]} loading />
      ) : watchlist.length === 0 ? (
        <StateBox
          icon={<Star size={22} />}
          title="Nothing saved yet"
          body="Tap the star on any pie to keep an eye on its uncapped returns here."
        />
      ) : isError ? (
        <StateBox icon={<Star size={22} />} title="Couldn't load your pies" body="Try again in a moment." action={{ label: "Retry", onClick: () => refetch() }} />
      ) : (
        <>
          <PieGrid items={data?.items ?? []} loading={isPending} skeletons={Math.min(watchlist.length, 8)} />
          {missing.length > 0 && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-[13px] text-muted">
              {missing.length} saved {missing.length === 1 ? "pie is" : "pies are"} no longer public on Trading 212.{" "}
              {missing.map((id) => (
                <span key={id} className="mr-2 inline-flex items-center gap-1">
                  <Link href={`/pie/${id}`} className="text-fg underline-offset-2 hover:underline">
                    view last data
                  </Link>
                  <button type="button" onClick={() => toggleWatch(id)} className="text-accent hover:underline">
                    remove
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
