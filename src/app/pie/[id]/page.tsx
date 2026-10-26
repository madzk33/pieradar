import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PieDetailView } from "@/components/pie-detail";
import { getPie, getRelated } from "@/lib/repo";
import { pct } from "@/lib/format";
import { after } from "next/server";
import { ensureFresh } from "@/lib/sync/freshness";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pie = await getPie((await params).id);
  if (!pie) return { title: "Pie not found" };
  return {
    title: `${pie.name} · ${pct(pie.metrics.y1)} 1Y`,
    description: `${pie.name} by ${pie.creatorName}: ${pie.holdingsCount} holdings, ${pie.copiers != null ? `${pie.copiers.toLocaleString()} copiers, ` : ""}real uncapped 1Y return ${pct(pie.metrics.y1)}.`,
  };
}

export default async function PiePage({ params }: Props) {
  after(ensureFresh);
  const { id } = await params;
  const [pie, related] = await Promise.all([getPie(id), getRelated(id).catch(() => [])]);
  if (!pie) notFound();
  return <PieDetailView initial={pie} related={related} />;
}
