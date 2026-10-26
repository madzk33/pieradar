import { sliceColor } from "@/lib/format";

/**
 * The circular "pie" mark from T212 cards: a donut of the top holdings by
 * target weight, with anything beyond them grouped into a neutral remainder.
 */
export function PieGlyph({ weights, size = 44, thickness = 0.32 }: { weights: number[]; size?: number; thickness?: number }) {
  const r = 50 - (thickness * 50) / 2;
  const c = 2 * Math.PI * r;
  const shown = weights.reduce((a, b) => a + b, 0);
  const slices = [...weights, Math.max(0, 1 - shown)];
  let offset = 0;
  const gap = slices.filter((w) => w > 0).length > 1 ? 1.2 : 0;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={thickness * 50} />
      {slices.map((w, i) => {
        if (w <= 0) return null;
        const len = Math.max(0, w * c - gap);
        const el = (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={i === slices.length - 1 ? "#3a4150" : sliceColor(i)}
            strokeWidth={thickness * 50}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
          />
        );
        offset += w * c;
        return el;
      })}
    </svg>
  );
}
