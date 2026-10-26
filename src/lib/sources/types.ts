export interface SourceHolding {
  ticker: string;
  /** Target weight, 0..1. */
  weight: number;
  /** Optional metadata so the pipeline can register instruments it has never seen. */
  name?: string;
  exchange?: string;
  currency?: string;
  symbol?: string;
}

export type PieOrigin = "demo" | "t212-api" | "imported" | "submitted";

export interface SourcePie {
  id: string;
  origin: PieOrigin;
  name: string;
  description: string;
  creatorName: string;
  creatorHandle?: string;
  kind: "community" | "model";
  category: string;
  copiers: number;
  views: number;
  createdAt: Date;
  /** When the source last changed holdings/targets, if it exposes it. */
  holdingsChangedAt?: Date;
  holdings: SourceHolding[];
  /** The return figure the source displays (e.g. a capped 20%). */
  sourceReturn: number | null;
  sourceReturnCapped: boolean;
  shareUrl: string | null;
}

export interface SourcePieSummary {
  id: string;
  name: string;
  copiers: number;
}

export interface DiscoveryPage {
  items: SourcePieSummary[];
  nextCursor: string | null;
}

export interface PieSource {
  /** Equals the `origin` of the pies it produces. */
  readonly id: PieOrigin;
  /**
   * True when discover() walks the source's complete public universe. Only then
   * can "absent from a full sweep" be used as a removal signal.
   */
  readonly enumeratesAll: boolean;
  discover(cursor: string | null): Promise<DiscoveryPage>;
  /** Returns null when the pie no longer exists or is no longer public. */
  fetchPie(id: string): Promise<SourcePie | null>;
}

/** Error carrying retry semantics for the job runner. */
export class SourceError extends Error {
  constructor(
    message: string,
    readonly opts: { transient: boolean; retryAfterMs?: number; status?: number } = { transient: true },
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/** T212 shows at most this figure on cards; anything above is clipped. */
export const SOURCE_RETURN_CAP = 0.2;
