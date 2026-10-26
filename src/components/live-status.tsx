"use client";

/**
 * Header pill that proves the site is live: re-checks index freshness every
 * 15s (and on tab focus) and ticks "prices 12s ago" every second.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago } from "@/lib/format";
import { LiveDot } from "./live-dot";

type Freshness = {
  lastMetrics: string | null;
  lastQuote: string | null;
  active: number;
  jobs: { job: string; status: string; finishedAt: string | null }[];
};

export function LiveStatus({ compact }: { compact?: boolean }) {
  const { data, isFetching } = useQuery({
    queryKey: ["freshness"],
    queryFn: async () => (await (await fetch("/api/status", { cache: "no-store" })).json()) as Freshness,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Freshness = when prices were last checked (a check with no price changes still counts).
  const lastCheck = data?.jobs.find((j) => j.job === "quotes" && j.status === "ok")?.finishedAt ?? null;
  const updated = [lastCheck, data?.lastMetrics ?? null].filter(Boolean).sort().at(-1) ?? null;
  const age = updated ? (now - Date.parse(updated)) / 1000 : Infinity;
  const stale = age > 120;
  const label = !data ? "Connecting…" : isFetching && stale ? "Updating…" : `Checked ${ago(updated, now)}`;

  return (
    <Link
      href="/status"
      title="Returns are re-marked to live prices continuously. Click for pipeline status."
      className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      <LiveDot stale={stale} />
      <span className="tabular">{compact ? (stale ? "Updating" : "Live") : label}</span>
    </Link>
  );
}
