"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { OfferView } from "@/domain/view";
import { cn } from "@/lib/cn";

export function OffersComparisonWidget({
  offers,
  onSelectOffer,
}: {
  offers: OfferView[];
  onSelectOffer?: (offer: OfferView) => void;
}) {
  const data = useMemo(() => {
    let purchasingVal = 0;
    let sellingVal = 0;
    let purchasingCount = 0;
    let sellingCount = 0;
    let purchasingQty = 0;
    let sellingQty = 0;
    let purchasingTrucks = 0;
    let sellingTrucks = 0;

    let wonCount = 0;
    let lostCount = 0;
    let underReviewCount = 0;
    let negotiatingCount = 0;

    for (const o of offers) {
      const val = o.totalValue || 0;
      const qty = o.quantity || 0;
      const trucks = o.truckLoads || 1;

      if (o.kind === "purchasing") {
        purchasingVal += val;
        purchasingCount += 1;
        purchasingQty += qty;
        purchasingTrucks += trucks;
      } else {
        sellingVal += val;
        sellingCount += 1;
        sellingQty += qty;
        sellingTrucks += trucks;
      }

      if (o.statusKey === "won" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt)) {
        wonCount += 1;
      } else if (o.statusKey === "lost") {
        lostCount += 1;
      } else if (o.statusKey === "under_review") {
        underReviewCount += 1;
      } else if (o.statusKey === "negotiating") {
        negotiatingCount += 1;
      }
    }

    const totalVal = purchasingVal + sellingVal;
    const purchasingPct = totalVal > 0 ? Math.round((purchasingVal / totalVal) * 100) : 50;
    const sellingPct = 100 - purchasingPct;

    const concluded = wonCount + lostCount;
    const conversionRate = concluded > 0 ? Math.round((wonCount / concluded) * 100) : 0;

    const avgPurchasingPrice = purchasingQty > 0 ? purchasingVal / purchasingQty : 0;
    const avgSellingPrice = sellingQty > 0 ? sellingVal / sellingQty : 0;

    // Latest 5 offers sorted by creation date
    const recentOffers = [...offers]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 5);

    return {
      purchasingVal,
      sellingVal,
      purchasingCount,
      sellingCount,
      purchasingQty,
      sellingQty,
      purchasingTrucks,
      sellingTrucks,
      totalVal,
      purchasingPct,
      sellingPct,
      wonCount,
      lostCount,
      underReviewCount,
      negotiatingCount,
      conversionRate,
      avgPurchasingPrice,
      avgSellingPrice,
      recentOffers,
    };
  }, [offers]);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* 1. Purchasing vs Selling Split Card (3 cols) */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs lg:col-span-3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-950 tracking-tight">
                  Portfolio Balance &amp; Flow Comparison
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                Purchasing procurement vs. client sales pipeline breakdown
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded-md">
              Total: €{data.totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>

          {/* Ratio Progress Bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-emerald-800 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Purchasing ({data.purchasingPct}%)
              </span>
              <span className="text-teal-800 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-teal-600" />
                Selling ({data.sellingPct}%)
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100 flex p-0.5 border border-neutral-200/80">
              <div
                className="h-full rounded-l-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${data.purchasingPct}%` }}
              />
              <div
                className="h-full rounded-r-full bg-teal-600 transition-all duration-500"
                style={{ width: `${data.sellingPct}%` }}
              />
            </div>
          </div>

          {/* Side by side comparison metrics */}
          <div className="mt-5 grid grid-cols-2 gap-4 divide-x divide-neutral-100 text-xs">
            {/* Purchasing column */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-900 uppercase tracking-wider text-[11px]">
                  Purchasing
                </span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                  {data.purchasingCount} Deals
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Total Sourced Value</span>
                <p className="text-lg font-bold text-neutral-950 font-mono">
                  €{data.purchasingVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="space-y-1 text-neutral-600">
                <div className="flex justify-between">
                  <span>Volume:</span>
                  <span className="font-semibold text-neutral-900">
                    {data.purchasingQty.toLocaleString()} kg ({data.purchasingTrucks} loads)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Price:</span>
                  <span className="font-semibold text-neutral-900">
                    €{data.avgPurchasingPrice.toFixed(2)} / kg
                  </span>
                </div>
              </div>
            </div>

            {/* Selling column */}
            <div className="pl-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-teal-900 uppercase tracking-wider text-[11px]">
                  Selling Desk
                </span>
                <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 border border-teal-200">
                  {data.sellingCount} Deals
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Total Contract Value</span>
                <p className="text-lg font-bold text-neutral-950 font-mono">
                  €{data.sellingVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="space-y-1 text-neutral-600">
                <div className="flex justify-between">
                  <span>Volume:</span>
                  <span className="font-semibold text-neutral-900">
                    {data.sellingQty.toLocaleString()} kg ({data.sellingTrucks} loads)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Price:</span>
                  <span className="font-semibold text-neutral-900">
                    €{data.avgSellingPrice.toFixed(2)} / kg
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Conversion Strip */}
        <div className="mt-5 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-neutral-500">Win Rate:</span>
              <strong className="ml-1 text-emerald-800 font-bold">{data.conversionRate}%</strong>
            </div>
            <div>
              <span className="text-neutral-500">Won/Sold:</span>
              <strong className="ml-1 text-neutral-900 font-semibold">{data.wonCount}</strong>
            </div>
            <div>
              <span className="text-neutral-500">Lost:</span>
              <strong className="ml-1 text-rose-700 font-semibold">{data.lostCount}</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/offers/purchasing"
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              Purchasing Workspace &rarr;
            </Link>
            <span className="text-neutral-300">·</span>
            <Link
              href="/offers/selling"
              className="text-xs font-semibold text-teal-800 hover:underline"
            >
              Selling Workspace &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Recent Deal Activity Feed Card (2 cols) */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs lg:col-span-2 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-neutral-950" />
                <h3 className="text-sm font-bold text-neutral-950 tracking-tight">
                  Recent Offer Flow
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">Latest submissions and updates</p>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">Live Feed</span>
          </div>

          <div className="mt-3 divide-y divide-neutral-100">
            {data.recentOffers.length === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-400">No offers created yet.</p>
            ) : (
              data.recentOffers.map((o) => {
                const isSold = o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt);
                return (
                  <div
                    key={o.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-neutral-50/60 rounded-md px-1.5 transition-colors cursor-pointer"
                    onClick={() => onSelectOffer?.(o)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/offers/${o.id}`}
                          className="font-mono font-bold text-neutral-950 hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {o.number}
                        </Link>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase",
                            o.kind === "purchasing"
                              ? "bg-sky-50 text-sky-800 border border-sky-200"
                              : "bg-teal-50 text-teal-800 border border-teal-200"
                          )}
                        >
                          {o.kind === "purchasing" ? "Buy" : "Sell"}
                        </span>
                        {isSold ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-900">
                            SOLD
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-neutral-600 truncate mt-0.5">
                        {o.material} &bull; {o.quantity.toLocaleString()} {o.unit}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-neutral-900 font-mono">
                        €{o.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        {o.createdAt ? o.createdAt.slice(0, 10) : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-neutral-100 text-right">
          <Link
            href="/offers/purchasing"
            className="text-xs font-semibold text-neutral-700 hover:text-neutral-950"
          >
            Browse all offers &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

