import type { Metadata } from "next";
import { Watchlist } from "@/components/watchlist";

export const metadata: Metadata = { title: "Watchlist" };

export default function Page() {
  return <Watchlist />;
}
