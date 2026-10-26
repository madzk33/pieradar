import type { Metadata } from "next";
import { Submit } from "@/components/submit";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Add a pie" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <Submit importEnabled={env.ALLOW_USER_IMPORT === "on"} />;
}
