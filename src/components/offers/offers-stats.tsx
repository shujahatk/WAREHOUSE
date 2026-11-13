"use client";

import { useMemo } from "react";
import type { OfferView, OfferDashboardStats } from "@/domain/view";
import { calculateOfferStats } from "@/domain/view";

export function OffersStats({
  offers,
  title = "Offer Statistics",
}: {
  offers: OfferView[];
  title?: string;
}) {
  const stats: OfferDashboardStats = useMemo(() => calculateOfferStats(offers), [offers]);

  return (
    <div className="space-y-3">
      {title ? (
        <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
          {title}
        </h2>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-neutral-500">Total Offers</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">
            {stats.totalOffers}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {stats.purchasingCount} buy &bull; {stats.sellingCount} sell
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-neutral-500">Pending</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-sky-600">
            {stats.pending}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Draft / Received</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-neutral-500">Under Review</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-amber-600">
            {stats.underReview}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Awaiting Admin</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-neutral-500">Negotiating</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-indigo-600">
            {stats.negotiating}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">In Active Discussion</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-neutral-500">Won</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-600">
            {stats.won}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Closed Deal</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
          <p className="text-xs font-medium text-neutral-500">Lost</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-rose-600">
            {stats.lost}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Not Concluded</p>
        </div>

        <div className="col-span-2 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium text-neutral-500">Truck Loads</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            {stats.truckLoads}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Total Transport Units</p>
        </div>
      </div>
    </div>
  );
}

