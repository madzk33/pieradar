import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-[20px] font-semibold">Page not found</h1>
      <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-white">
        Back to Discover
      </Link>
    </div>
  );
}
