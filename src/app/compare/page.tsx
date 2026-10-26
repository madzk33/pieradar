import type { Metadata } from "next";
import { Suspense } from "react";
import { Compare } from "@/components/compare";

export const metadata: Metadata = { title: "Compare" };

export default function Page() {
  return (
    <Suspense>
      <Compare />
    </Suspense>
  );
}
