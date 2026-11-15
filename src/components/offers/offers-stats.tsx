"use client";

import { useMemo } from "react";
import type { OfferView } from "@/domain/view";
import { cn } from "@/lib/cn";

export type OfferFilterKey = "all" | "pending" | "under_review" | "negotiating" | "won" | "lost" | "sold";

export function OffersStats({
  offers,
  activeFilter = "all",
  onSelectFilter,
  title,
}: {
  offers: OfferView[];
  activeFilter?: string;
  onSelectFilter?: (filter: OfferFilterKey) => void;
  title?: string;
}) {
  const stats = useMemo(() => {
    let pending = 0;
    let underReview = 0;
    let negotiating = 0;
    let won = 0;
    let lost = 0;
    let sold = 0;
    let truckLoads = 0;
    let purchasingCount = 0;
    let sellingCount = 0;
    let purchasingValue = 0;
    let sellingValue = 0;
    let totalVolumeEur = 0;

    for (const o of offers) {
      const isAcceptedOrSold = o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt);
      if (isAcceptedOrSold) {
        sold += 1;
      } else if (o.statusKey === "draft" || o.statusKey === "received") {
        pending += 1;
      } else if (o.statusKey === "under_review") {
        underReview += 1;
      } else if (o.statusKey === "negotiating") {
        negotiating += 1;
      } else if (o.statusKey === "won") {
        won += 1;
      } else if (o.statusKey === "lost") {
        lost += 1;
      }

      truckLoads += o.truckLoads || 1;
      const val = o.totalValue || 0;
      totalVolumeEur += val;

      if (o.kind === "purchasing") {
        purchasingCount += 1;
        purchasingValue += val;
      } else {
        sellingCount += 1;
        sellingValue += val;
      }
    }

    const closedDeals = won + sold;
    const concludedTotal = closedDeals + lost;
    const winRate = concludedTotal > 0 ? Math.round((closedDeals / concludedTotal) * 100) : 0;

    return {
      total: offers.length,
      pending,
      underReview,
      negotiating,
      won: won + sold,
      lost,
      sold,
      truckLoads,
      purchasingCount,
      sellingCount,
      purchasingValue,
      sellingValue,
      totalVolumeEur,
      winRate,
    };
  }, [offers]);

  const cards: {
    key: OfferFilterKey;
    label: string;
    value: string | number;
    sublabel: string;
    accentClass: string;
    bgHoverClass: string;
    activeBorderClass: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "all",
      label: "Total Offers",
      value: stats.total,
      sublabel: `${stats.purchasingCount} Buy · ${stats.sellingCount} Sell`,
      accentClass: "text-neutral-900",
      bgHoverClass: "hover:border-neutral-400",
      activeBorderClass: "border-neutral-900 ring-2 ring-neutral-900/10",
      icon: (
        <svg className="h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      key: "pending",
      label: "Pending Receipt",
      value: stats.pending,
      sublabel: "Draft & Received",
      accentClass: "text-sky-700",
      bgHoverClass: "hover:border-sky-300",
      activeBorderClass: "border-sky-600 ring-2 ring-sky-600/10",
      icon: (
        <svg className="h-4 w-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: "under_review",
      label: "Under Review",
      value: stats.underReview,
      sublabel: "Awaiting Decision",
      accentClass: "text-amber-700",
      bgHoverClass: "hover:border-amber-300",
      activeBorderClass: "border-amber-600 ring-2 ring-amber-600/10",
      icon: (
        <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "negotiating",
      label: "Negotiating",
      value: stats.negotiating,
      sublabel: "Active Discussions",
      accentClass: "text-indigo-700",
      bgHoverClass: "hover:border-indigo-300",
      activeBorderClass: "border-indigo-600 ring-2 ring-indigo-600/10",
      icon: (
        <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      key: "won",
      label: "Won & Sold",
      value: stats.won,
      sublabel: `${stats.winRate}% Conversion Rate`,
      accentClass: "text-emerald-800",
      bgHoverClass: "hover:border-emerald-300",
      activeBorderClass: "border-emerald-600 ring-2 ring-emerald-600/15",
      icon: (
        <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: "lost",
      label: "Lost / Declined",
      value: stats.lost,
      sublabel: "Declined Deals",
      accentClass: "text-rose-700",
      bgHoverClass: "hover:border-rose-300",
      activeBorderClass: "border-rose-600 ring-2 ring-rose-600/10",
      icon: (
        <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {title ? (
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            {title}
          </h2>
          <span className="text-[11px] font-medium text-neutral-400">
            Click cards to filter list
          </span>
        </div>
      ) : null}

      {/* Primary KPI Status Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const isSelected = activeFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onSelectFilter?.(card.key)}
              className={cn(
                "group flex flex-col justify-between rounded-xl border bg-white p-3.5 text-left transition-all duration-150 shadow-2xs",
                card.bgHoverClass,
                isSelected
                  ? card.activeBorderClass
                  : "border-neutral-200/90 hover:shadow-xs",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-neutral-600 truncate">
                  {card.label}
                </span>
                {card.icon}
              </div>

              <div className="mt-2">
                <p className={cn("text-2xl font-bold tracking-tight", card.accentClass)}>
                  {card.value}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-neutral-500 truncate">
                  {card.sublabel}
                </p>
              </div>

              {isSelected ? (
                <div className="mt-2.5 flex items-center gap-1 text-[10px] font-bold text-neutral-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Active Filter
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Secondary Financial & Logistics Strip */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {/* Trading Volume */}
        <div className="rounded-xl border border-neutral-200/90 bg-linear-to-br from-white to-neutral-50/50 p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Total Trading Volume</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-neutral-950 font-mono">
              €{stats.totalVolumeEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              €{stats.purchasingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} Buy · €{stats.sellingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} Sell
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-800 font-bold text-sm">
            €
          </div>
        </div>

        {/* Transport Fleet */}
        <div className="rounded-xl border border-neutral-200/90 bg-linear-to-br from-white to-neutral-50/50 p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Fleet Logistics</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-neutral-950 font-mono">
              {stats.truckLoads} <span className="text-xs font-normal text-neutral-500 font-sans">Truckloads</span>
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Total transport capacity booked
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-sky-50 border border-sky-200/60 flex items-center justify-center text-sky-800">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 17a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM4 17h1m11 0h1m-9 0V7a1 1 0 011-1h8a1 1 0 011 1v10M3 13h1m16-4h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V17h-2" />
            </svg>
          </div>
        </div>

        {/* Commercial Win Rate */}
        <div className="rounded-xl border border-neutral-200/90 bg-linear-to-br from-white to-neutral-50/50 p-3.5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Deal Conversion Efficiency</p>
            <div className="flex items-baseline gap-2">
              <p className="mt-1 text-xl font-bold tracking-tight text-emerald-800 font-mono">
                {stats.winRate}%
              </p>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                {stats.won} Closed
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {stats.negotiating} active in negotiation pipeline
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-800">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
