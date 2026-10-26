import clsx from "clsx";
import { BadgeCheck, FlaskConical, UserPen } from "lucide-react";
import type { PieCardData } from "@/lib/types";

export const ORIGIN_INFO: Record<PieCardData["origin"], { label: string; long: string }> = {
  demo: {
    label: "Simulated",
    long: "Simulated example pie. Holdings are illustrative; returns are calculated from real market prices.",
  },
  "t212-api": { label: "Verified", long: "Synced automatically from the owner's account." },
  imported: { label: "Verified", long: "Imported by its owner from their account." },
  submitted: {
    label: "Submitted",
    long: "Submitted by the community. Holdings were entered by hand and aren't verified. Returns are calculated live from market prices.",
  },
};

export function OriginBadge({ origin, compact }: { origin: PieCardData["origin"]; compact?: boolean }) {
  const Icon = origin === "demo" ? FlaskConical : origin === "submitted" ? UserPen : BadgeCheck;
  return (
    <span
      title={ORIGIN_INFO[origin].long}
      className={clsx(
        "inline-flex items-center gap-1",
        origin === "demo" ? "text-dim" : origin === "submitted" ? "text-gold" : "text-accent",
        compact && "text-[11px]",
      )}
    >
      <Icon size={compact ? 12 : 14} />
      {ORIGIN_INFO[origin].label}
    </span>
  );
}
