export function pct(v: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const p = v * 100;
  const digits = opts.digits ?? (Math.abs(p) >= 1000 ? 0 : Math.abs(p) >= 100 ? 1 : 2);
  const s = p.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (opts.sign !== false && p > 0 ? "+" : "") + s + "%";
}

export function tone(v: number | null | undefined): "up" | "down" | "flat" {
  if (v == null || Math.abs(v) < 1e-6) return "flat";
  return v > 0 ? "up" : "down";
}

export const toneText = { up: "text-up", down: "text-down", flat: "text-muted" } as const;

/** 236_400 → "236K". Hand-rolled so server and browser render identical text. */
export function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const [div, unit] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  const v = n / div;
  const digits = unit && Math.abs(v) < 10 ? 1 : 0;
  return `${Number(v.toFixed(digits))}${unit}`;
}

export function price(v: number | null | undefined, currency: string): string {
  if (v == null) return "—";
  if (currency === "GBX") return `${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })}p`;
  return Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function until(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.round((Date.parse(iso) - now) / 1000);
  if (s <= 0) return "due now";
  if (s < 60) return `in ${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`;
}

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

/** Stable palette for pie slices when a brand colour is missing or too dark. */
const SLICE = ["#2e8cff", "#23c26b", "#f5b942", "#a66bff", "#ff7a45", "#18c5d9", "#ff5c93", "#9bd94a", "#6c7cff", "#e0c341"];
export function sliceColor(i: number) {
  return SLICE[i % SLICE.length];
}
