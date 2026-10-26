import type { Metadata } from "next";
import { Status } from "@/components/status";
import { getIndexStats } from "@/lib/repo";

export const metadata: Metadata = { title: "Index status" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Status initial={await getIndexStats()} />;
}
