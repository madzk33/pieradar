export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading pie">
      <div className="skeleton h-4 w-20 rounded" />
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <div className="flex gap-4">
          <div className="skeleton h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="skeleton h-6 w-1/2 rounded" />
            <div className="skeleton h-4 w-1/3 rounded" />
          </div>
        </div>
        <div className="skeleton mt-6 h-12 w-48 rounded" />
      </div>
      <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-[62px] rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-[360px] rounded-[var(--radius-card)]" />
    </div>
  );
}
