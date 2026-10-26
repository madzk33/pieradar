import { env } from "../env";
import { demoSource } from "./demo";
import { t212ApiSource } from "./t212";
import type { PieOrigin, PieSource } from "./types";

const ALL: Partial<Record<PieOrigin, PieSource>> = { demo: demoSource, "t212-api": t212ApiSource };

/** Sources that are enabled for automatic discovery + refresh. */
export function enabledSources(): PieSource[] {
  return env.PIE_SOURCES.split(",")
    .map((s) => ALL[s.trim() as PieOrigin])
    .filter((s): s is PieSource => !!s);
}

/** The source that can refresh a pie of this origin, if it's enabled. Imported/submitted pies have none. */
export function sourceFor(origin: string): PieSource | null {
  return enabledSources().find((s) => s.id === origin) ?? null;
}

export * from "./types";
