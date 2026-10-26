export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-56 rounded-lg" />
      <div className="skeleton mt-2 h-4 w-72 rounded" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-[214px] rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
