import type { Metadata } from "next";
import { Suspense } from "react";
import { Stocks } from "@/components/stocks";

export const metadata: Metadata = { title: "Most owned stocks" };

export default function Page() {
  return (
    <Suspense>
      <Stocks />
    </Suspense>
  );
}
