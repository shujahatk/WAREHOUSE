import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const pillTones: Record<string, string> = {
  Approved: "bg-neutral-950 text-white",
  Received: "bg-neutral-950 text-white",
  Unloading: "bg-neutral-950 text-white",
  Loading: "bg-neutral-950 text-white",
  Completed: "bg-neutral-200 text-neutral-800",
  Pending: "border border-neutral-300 bg-white text-neutral-800",
  Planned: "border border-neutral-300 bg-white text-neutral-800",
  Rejected: "border border-neutral-300 bg-white text-neutral-500",
  "In transit": "border border-neutral-300 bg-white text-neutral-800",
  Arrived: "border border-neutral-950 bg-white text-neutral-950",
  Loaded: "border border-neutral-300 bg-white text-neutral-800",
  Registered: "border border-neutral-950 bg-white text-neutral-950",
  Dispatched: "bg-neutral-200 text-neutral-800",
  Transfer: "border border-neutral-300 bg-white text-neutral-800",
  Warning: "border border-neutral-950 bg-white text-neutral-950",
  Chat: "bg-neutral-100 text-neutral-800",
  "On schedule": "border border-neutral-300 bg-white text-neutral-800",
};

export function StatusPill({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        pillTones[label] ?? "border border-neutral-300 bg-white text-neutral-700",
      )}
    >
      {label}
    </span>
  );
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-neutral-200 bg-white", className)}>
      {children}
    </section>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-950">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-sm font-medium text-white"
    >
      {children}
    </Link>
  );
}

export function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Surface className="px-4 py-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </Surface>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-3 inline-flex text-sm text-neutral-500 hover:text-neutral-950">
      ← {label}
    </Link>
  );
}
