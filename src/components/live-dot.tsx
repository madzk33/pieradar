export function LiveDot({ stale = false }: { stale?: boolean }) {
  return (
    <span className="relative flex h-2 w-2" aria-label={stale ? "Data may be stale" : "Live"}>
      {!stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60 motion-reduce:hidden" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${stale ? "bg-gold" : "bg-up"}`} />
    </span>
  );
}
