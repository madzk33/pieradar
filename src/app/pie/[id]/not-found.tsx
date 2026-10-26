import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="text-[44px]">🥧</div>
      <h1 className="mt-3 text-[20px] font-semibold">Pie not in the index</h1>
      <p className="mt-2 text-[14px] text-muted">
        It may have just been created and is still syncing (new pies appear within a few minutes), or it was never public.
      </p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-white">
        Back to Discover
      </Link>
    </div>
  );
}
