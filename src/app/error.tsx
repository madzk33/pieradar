"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-[20px] font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[14px] text-muted">
        The index may be mid-sync or temporarily unreachable. Nothing is lost. Try again in a moment.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-dim">ref {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-surface-3 px-5 py-2.5 text-[14px] font-medium">
        Try again
      </button>
    </div>
  );
}
