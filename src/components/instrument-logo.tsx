"use client";

import { useState } from "react";
import clsx from "clsx";

/** Circular instrument logo with a brand-coloured monogram fallback. */
export function InstrumentLogo({
  ticker,
  domain,
  color,
  size = 28,
  className,
  ring = false,
}: {
  ticker: string;
  domain: string | null;
  color: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const label = ticker.replace(/\.$/, "").slice(0, ticker.length > 4 ? 3 : 4);
  const bg = color ?? "#2a303b";
  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white",
        ring && "ring-2 ring-surface",
        className,
      )}
      style={{ width: size, height: size }}
      title={ticker}
    >
      {domain && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size > 32 ? 128 : 64}`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-[78%] w-[78%] object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-semibold tracking-tight text-white"
          style={{ background: bg, fontSize: Math.max(8, size * (label.length > 3 ? 0.26 : 0.32)) }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
