import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Page not found" },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-24">
      <p className="text-[11px] font-medium tracking-[0.16em] text-neutral-500 uppercase">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
        This page is not in StockFlow
      </h1>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        The address does not match a workspace route.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-9 items-center justify-center self-start border border-neutral-950 bg-neutral-950 px-3 text-sm font-medium text-white"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
