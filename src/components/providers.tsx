"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { LiveProvider } from "./live";
import { CollectionsProvider } from "./collections";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 2 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <CollectionsProvider>
          <LiveProvider>{children}</LiveProvider>
        </CollectionsProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
