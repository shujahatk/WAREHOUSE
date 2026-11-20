"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersNav } from "@/components/offers/offers-nav";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferQuickViewDrawer } from "@/components/offers/offer-quick-view-drawer";
import { exportOffersToCsv } from "@/components/offers/offers-csv";
import type { OfferView } from "@/domain/view";
import { groupTotalsByCurrency, formatCurrencySummary } from "@/lib/currency";

export default function SoldOffersPage() {
  const { state, notice } = useDemo();
  const { identity } = useSession();

  const [quickViewOffer, setQuickViewOffer] = useState<OfferView | null>(null);

  const isOffersUser = identity.role === "offers_user";

  const allOffers = useMemo(() => state.offers || [], [state.offers]);

  // All approved selling offers represent the Sold ledger
  const soldOffers = useMemo(() => {
    return allOffers.filter(
      (o) =>
        o.kind === "selling" &&
        (o.approvalStatus === "approved" ||
          o.statusKey === "accepted" ||
          o.statusKey === "sold" ||
          Boolean(o.soldAt))
    );
  }, [allOffers]);

  const purchasingCount = useMemo(() => {
    return allOffers.filter(
      (o) => o.kind === "purchasing" && o.statusKey !== "accepted" && !o.soldAt
    ).length;
  }, [allOffers]);

  const sellingCount = useMemo(() => {
    return allOffers.filter((o) => o.kind === "selling").length;
  }, [allOffers]);

  // Sold Financial Metrics
  const metrics = useMemo(() => {
    let totalQty = 0;
    const currencyTotals = groupTotalsByCurrency(
      soldOffers.map((o) => ({ amount: o.totalValue || 0, currency: o.currency }))
    );

    for (const o of soldOffers) {
      totalQty += o.quantity || 0;
    }

    return {
      totalQty,
      dealsCount: soldOffers.length,
      currencyTotals,
    };
  }, [soldOffers]);

  if (isOffersUser) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-xs mt-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700 text-xl font-bold">
          ✕
        </div>
        <h2 className="mt-3 text-lg font-bold text-neutral-900">Access Restricted</h2>
        <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
          The internal Sold ledger is reserved for RM Trading Administrators and Operations Managers.
        </p>
        <Link
          href="/offers/purchasing"
          className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-neutral-950 px-4 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition"
        >
          &rarr; View Purchasing Offers Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Sub-Navigation */}
      <OffersNav
        role={identity.role}
        purchasingCount={purchasingCount}
        sellingCount={sellingCount}
        soldCount={soldOffers.length}
        onExportCsv={() => exportOffersToCsv(soldOffers, "rm-sold-deals.csv")}
      />

      {notice ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 shadow-2xs">
          {notice}
        </div>
      ) : null}

      {/* 2. Key Sold Performance KPI Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
            Total Realized Sold Value
          </span>
          <p className="mt-1 text-xl font-black text-emerald-950 font-mono">
            {formatCurrencySummary(metrics.currencyTotals)}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700">
            Across {metrics.dealsCount} approved commercial deals
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Closed Volume
          </span>
          <p className="mt-1 text-2xl font-black text-neutral-950 font-mono">
            {(metrics.totalQty / 1000).toFixed(1)} MT
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {metrics.totalQty.toLocaleString()} kg secondary materials
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Total Closed Transactions
          </span>
          <p className="mt-1 text-2xl font-black text-neutral-950 font-mono">
            {metrics.dealsCount}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            Approved by Admin executive desk
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Ledger Synchronization
          </span>
          <p className="mt-1 text-2xl font-black text-emerald-800 font-mono">
            Live
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            Synchronized directly with database records
          </p>
        </div>
      </div>

      {/* 3. Section Title & Description */}
      <div className="flex flex-col gap-1 border-b border-neutral-200/80 pb-3">
        <h2 className="text-base font-bold text-neutral-950">
          Admin Approved Sold Transactions
        </h2>
        <p className="text-xs text-neutral-500">
          Complete database ledger of selling offers approved by executive administrators. All transactions preserve linked purchasing offers, submitter details, custom currencies, and audit timestamps.
        </p>
      </div>

      {/* 4. Sold Offers Table */}
      <OffersTable
        offers={soldOffers}
        role={identity.role}
        orders={state.orders}
        mode="selling"
        onSelectOffer={(offer) => setQuickViewOffer(offer)}
      />

      {/* 5. Quick-View Drawer */}
      <OfferQuickViewDrawer
        offer={quickViewOffer}
        role={identity.role}
        onClose={() => setQuickViewOffer(null)}
      />
    </div>
  );
}
