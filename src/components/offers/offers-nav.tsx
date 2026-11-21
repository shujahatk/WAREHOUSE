"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/cn";

export function OffersNav({
  role,
  purchasingCount,
  sellingCount,
  soldCount,
  myOffersCount,
  onOpenCreatePurchasing,
  onOpenCreateSelling,
  onExportCsv,
}: {
  role: Role;
  purchasingCount?: number;
  sellingCount?: number;
  soldCount?: number;
  myOffersCount?: number;
  onOpenCreatePurchasing?: () => void;
  onOpenCreateSelling?: () => void;
  onExportCsv?: () => void;
}) {
  const pathname = usePathname();
  const isOffersUser = role === "offers_user";
  const isModerator = role === "moderator";
  const isAdmin = role === "owner";

  const tabs = [
    {
      href: "/offers/purchasing",
      label: "Purchasing Offers",
      count: purchasingCount,
      description: "Material sourcing & supplier offers",
    },
    ...(!isOffersUser
      ? [
        {
          href: "/offers/selling",
          label: "Selling Offers",
          count: sellingCount,
          description: "Customer sales & margin desk",
        },
        {
          href: "/offers/sold",
          label: "Sold",
          count: soldCount,
          description: "Approved & finalized transactions",
        },
      ]
      : [
        {
          href: "/offers/my-offers",
          label: "My Offers",
          count: myOffersCount ?? sellingCount,
          description: "Your submitted selling offers & review status",
        },
      ]),
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner & Contextual Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200/90 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
            <Link href={isOffersUser ? "/offers/purchasing" : "/dashboard"} className="hover:text-neutral-900 transition">
              {isOffersUser ? "Offers Portal" : "Workspace"}
            </Link>
            <span>/</span>
            <span className="text-emerald-800 font-semibold">{isOffersUser ? "Commercial Desk" : "Offers & Trading Desk"}</span>
            {soldCount !== undefined && soldCount > 0 && !isOffersUser ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {soldCount} Closed Deals
              </span>
            ) : null}
          </div>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            {isOffersUser
              ? "RM Enterprise Offers Portal"
              : "Procurement & Trading Operations"}
          </h1>
          <p className="mt-1 text-xs text-neutral-600 max-w-2xl">
            {isOffersUser
              ? "Access verified material purchasing opportunities and track your submitted selling proposals."
              : "Global secondary material procurement, pricing margin negotiation, compliance review and closed transaction ledger."}
          </p>
        </div>

        {/* Global Header Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {onExportCsv ? (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 hover:text-neutral-950 transition"
              title="Export visible offers to CSV"
            >
              <svg className="h-3.5 w-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          ) : null}

          {/* Offers User CTA */}
          {isOffersUser && onOpenCreateSelling ? (
            <button
              type="button"
              onClick={onOpenCreateSelling}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-800 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Submit Selling Offer
            </button>
          ) : null}

          {/* Moderator CTAs */}
          {isModerator ? (
            <>
              {onOpenCreatePurchasing ? (
                <button
                  type="button"
                  onClick={onOpenCreatePurchasing}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/60 px-3.5 text-xs font-semibold text-emerald-900 shadow-2xs hover:bg-emerald-100 transition"
                >
                  <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  New Purchasing Offer
                </button>
              ) : null}
              {onOpenCreateSelling ? (
                <button
                  type="button"
                  onClick={onOpenCreateSelling}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition"
                >
                  <svg className="h-3.5 w-3.5 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Submit Selling Offer
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Modern Refined Tab Bar */}
      <nav aria-label="Offers Subsections" className="flex items-center gap-1 border-b border-neutral-200/80 pb-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "group relative flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium rounded-t-lg transition-all duration-150 whitespace-nowrap",
                isActive
                  ? "border-b-2 border-emerald-700 bg-white font-semibold text-emerald-950 shadow-2xs"
                  : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60",
              )}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight transition",
                    isActive
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

