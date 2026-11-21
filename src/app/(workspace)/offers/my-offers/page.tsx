"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersNav } from "@/components/offers/offers-nav";
import { OfferQuickViewDrawer } from "@/components/offers/offer-quick-view-drawer";
import { exportOffersToCsv } from "@/components/offers/offers-csv";
import type { OfferView } from "@/domain/view";
import { formatCurrencySummary, groupTotalsByCurrency } from "@/lib/currency";
import { cn } from "@/lib/cn";

export default function MyOffersPage() {
  const { state, notice } = useDemo();
  const { identity } = useSession();

  const [activeTab, setActiveTab] = useState<"all" | "pending" | "under_review" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [quickViewOffer, setQuickViewOffer] = useState<OfferView | null>(null);

  const allOffers = useMemo(() => state.offers || [], [state.offers]);

  // Sourced Purchasing Offers for header count
  const purchasingCount = useMemo(() => {
    return allOffers.filter((o) => o.kind === "purchasing").length;
  }, [allOffers]);

  // Strict User Isolation: External users see ONLY their own submitted Selling Offers
  const myOffers = useMemo(() => {
    return allOffers.filter((o) => {
      if (o.kind !== "selling") return false;
      // Admins and moderators can see all selling offers or own offers
      if (identity.role === "owner" || identity.role === "moderator") return true;
      // Offers users see strictly their own submitted records
      const isOwner =
        (identity.id && o.createdBy === identity.id) ||
        Boolean(identity.email && o.emailAddress && o.emailAddress.toLowerCase() === identity.email.toLowerCase()) ||
        Boolean(identity.name && o.createdByName === identity.name);
      return isOwner;
    });
  }, [allOffers, identity]);

  // Filtered offers by status tab and search
  const filteredOffers = useMemo(() => {
    let list = myOffers;

    if (activeTab === "pending") {
      list = list.filter((o) => o.approvalStatus === "pending" && o.statusKey !== "under_review");
    } else if (activeTab === "under_review") {
      list = list.filter((o) => o.statusKey === "under_review");
    } else if (activeTab === "approved") {
      list = list.filter((o) => o.approvalStatus === "approved" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    } else if (activeTab === "rejected") {
      list = list.filter((o) => o.approvalStatus === "rejected" || o.statusKey === "lost");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.number.toLowerCase().includes(q) ||
          (o.poNumber && o.poNumber.toLowerCase().includes(q)) ||
          o.material.toLowerCase().includes(q) ||
          (o.materialType && o.materialType.toLowerCase().includes(q)) ||
          (o.clientName && o.clientName.toLowerCase().includes(q)) ||
          (o.origin && o.origin.toLowerCase().includes(q)) ||
          (o.destination && o.destination.toLowerCase().includes(q))
      );
    }

    return list;
  }, [myOffers, activeTab, search]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let pendingCount = 0;
    let underReviewCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let totalQty = 0;

    for (const o of myOffers) {
      if (o.approvalStatus === "rejected" || o.statusKey === "lost") {
        rejectedCount += 1;
      } else if (o.approvalStatus === "approved" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt)) {
        approvedCount += 1;
      } else if (o.statusKey === "under_review") {
        underReviewCount += 1;
      } else {
        pendingCount += 1;
      }
      totalQty += o.quantity || 0;
    }

    const currencyTotals = groupTotalsByCurrency(
      myOffers.map((o) => ({ amount: o.totalValue || 0, currency: o.currency }))
    );

    return {
      total: myOffers.length,
      pendingCount,
      underReviewCount,
      approvedCount,
      rejectedCount,
      totalQty,
      currencyTotals,
    };
  }, [myOffers]);

  return (
    <div className="space-y-8">
      {/* 1. Header Navigation */}
      <OffersNav
        role={identity.role}
        purchasingCount={purchasingCount}
        myOffersCount={myOffers.length}
        onExportCsv={() => exportOffersToCsv(myOffers, "my-submitted-selling-offers.csv")}
      />

      {notice ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 shadow-2xs">
          {notice}
        </div>
      ) : null}

      {/* 2. Key Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Submitted */}
        <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Total Submitted
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-neutral-950">{metrics.total}</span>
            <span className="text-[10px] text-neutral-400 font-medium">Offers</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500 truncate">
            {formatCurrencySummary(metrics.currencyTotals)}
          </p>
        </div>

        {/* Pending Review */}
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/40 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
            Pending Review
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-900">{metrics.pendingCount}</span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <p className="mt-1 text-[11px] text-amber-700">Awaiting Admin Appraisal</p>
        </div>

        {/* Under Review */}
        <div className="rounded-xl border border-blue-200/90 bg-blue-50/40 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
            Under Review
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-blue-900">{metrics.underReviewCount}</span>
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <p className="mt-1 text-[11px] text-blue-700">Commercial Assessment</p>
        </div>

        {/* Approved Deals */}
        <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/40 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
            Approved Deals
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-900">{metrics.approvedCount}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">Sold / Ready for Execution</p>
        </div>

        {/* Rejected */}
        <div className="rounded-xl border border-rose-200/90 bg-rose-50/40 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">
            Rejected
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-rose-900">{metrics.rejectedCount}</span>
            <span className="h-2 w-2 rounded-full bg-rose-500" />
          </div>
          <p className="mt-1 text-[11px] text-rose-700">See Rejection Reasons</p>
        </div>
      </div>

      {/* 3. Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-neutral-200/90 bg-white p-3.5 shadow-2xs">
        {/* Status Tab Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all", label: "All Offers", count: metrics.total },
            { key: "pending", label: "Pending", count: metrics.pendingCount },
            { key: "under_review", label: "Under Review", count: metrics.underReviewCount },
            { key: "approved", label: "Approved", count: metrics.approvedCount },
            { key: "rejected", label: "Rejected", count: metrics.rejectedCount },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer",
                  active
                    ? "bg-neutral-900 text-white shadow-2xs font-semibold"
                    : "bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                    active ? "bg-neutral-800 text-neutral-200" : "bg-neutral-200/80 text-neutral-600"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference, PO, product..."
            className="h-9 w-full rounded-lg border border-neutral-300 bg-white pr-3 pl-8 text-xs text-neutral-950 placeholder:text-neutral-400 focus:border-emerald-700 focus:outline-hidden"
          />
        </div>
      </div>

      {/* 4. Offers List / Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200/90 pb-3">
          <div>
            <h2 className="text-base font-bold text-neutral-950">
              My Submitted Selling Offers ({filteredOffers.length})
            </h2>
            <p className="text-xs text-neutral-500">
              Track real-time appraisal decisions, pricing clearance, and rejection details for your submitted proposals.
            </p>
          </div>

          <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600 border border-neutral-200">
            🔒 Submitted Offers Locked
          </span>
        </div>

        {filteredOffers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-800 text-xl font-bold">
              📋
            </div>
            <h3 className="mt-3 text-sm font-bold text-neutral-900">
              {myOffers.length === 0
                ? "No Selling Offers Submitted Yet"
                : "No Offers Match Your Current Filter"}
            </h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
              {myOffers.length === 0
                ? "Browse available Purchasing Offers to find material sourcing opportunities and submit selling proposals."
                : "Try switching status filters or clearing your search query."}
            </p>
            {myOffers.length === 0 ? (
              <Link
                href="/offers/purchasing"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                Browse Purchasing Offers &rarr;
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOffers.map((offer) => {
              const isApproved =
                offer.approvalStatus === "approved" ||
                offer.statusKey === "accepted" ||
                offer.statusKey === "sold" ||
                Boolean(offer.soldAt);
              const isRejected = offer.approvalStatus === "rejected" || offer.statusKey === "lost";
              const isUnderReview = offer.statusKey === "under_review";
              const isPending = !isApproved && !isRejected && !isUnderReview;

              return (
                <div
                  key={offer.id}
                  className={cn(
                    "rounded-xl border bg-white p-4 shadow-2xs transition-all hover:border-neutral-300",
                    isApproved && "border-emerald-200 bg-emerald-50/15",
                    isRejected && "border-rose-200 bg-rose-50/15",
                    isUnderReview && "border-blue-200 bg-blue-50/15",
                    isPending && "border-neutral-200/90"
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Primary Left Meta */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Offer Reference */}
                        <span className="font-mono text-sm font-bold text-neutral-950">
                          {offer.number}
                        </span>

                        {/* Linked PO Badge */}
                        {offer.poNumber ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 font-mono">
                            <span>PO:</span>
                            <span>{offer.poNumber}</span>
                          </span>
                        ) : null}

                        {/* Lock Badge */}
                        <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 border border-neutral-200">
                          🔒 Locked
                        </span>

                        {/* Status Badge */}
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                            ✓ Approved (Sold)
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-900">
                            ✕ Rejected
                          </span>
                        ) : isUnderReview ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-900">
                            ⏳ Under Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                            ⏱ Pending Appraisal
                          </span>
                        )}
                      </div>

                      {/* Product Name & Specs */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-neutral-900">{offer.material}</span>
                        {offer.materialType ? (
                          <>
                            <span className="text-neutral-300">•</span>
                            <span className="text-neutral-600">{offer.materialType}</span>
                          </>
                        ) : null}
                        {offer.materialGrade && offer.materialGrade !== "Standard" ? (
                          <>
                            <span className="text-neutral-300">•</span>
                            <span className="text-neutral-500">Grade: {offer.materialGrade}</span>
                          </>
                        ) : null}
                      </div>

                      {/* Route & Logistics */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                        <span>
                          📍 Origin: <strong className="text-neutral-700">{offer.origin || offer.country || "—"}</strong>
                        </span>
                        <span>&rarr;</span>
                        <span>
                          🏁 Delivery: <strong className="text-neutral-700">{offer.destination || "Direct Delivery"}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Submitted: <strong className="text-neutral-700 font-mono">{offer.createdAt ? offer.createdAt.slice(0, 10) : "—"}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Right Financial & Volume Pillar */}
                    <div className="flex sm:flex-col sm:items-end justify-between border-t border-neutral-100 pt-2 sm:border-0 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <span className="block text-[10px] text-neutral-400 font-medium uppercase">
                          Total Valuation
                        </span>
                        <span className="font-mono text-base font-bold text-neutral-950">
                          {offer.currency} {offer.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="text-right text-xs text-neutral-600 mt-1">
                        <span className="font-semibold text-neutral-800">
                          {offer.quantity.toLocaleString()} {offer.unit}
                        </span>
                        <span className="text-neutral-400 font-mono text-[11px] ml-1">
                          (@ {offer.currency} {offer.pricePerUnit.toFixed(2)}/{offer.unit})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Structured Details if present in description */}
                  {offer.description && !offer.description.startsWith("Selling offer for") ? (
                    <div className="mt-3 rounded-lg border border-neutral-200/70 bg-neutral-50/70 p-2.5 text-xs text-neutral-700">
                      <p className="font-mono text-[11px]">{offer.description}</p>
                    </div>
                  ) : null}

                  {/* ADMIN DECISION & REJECTION REASON DISPLAY */}
                  {isRejected ? (
                    <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50/90 p-3 text-xs text-rose-950 flex items-start gap-2.5 shadow-2xs">
                      <span className="text-rose-600 font-bold text-base leading-none mt-0.5">⚠️</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <strong className="font-bold text-rose-900">
                            Proposal Rejected by StockFlow Administration
                          </strong>
                          {offer.decidedAt ? (
                            <span className="text-[10px] text-rose-700/80 font-mono">
                              {offer.decidedAt.slice(0, 10)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 rounded-md bg-white/80 border border-rose-200 p-2 text-rose-900 font-medium">
                          <span className="font-bold text-rose-950">Reason: </span>
                          <span>{offer.adminDecisionNote || "No explicit notes provided by review team."}</span>
                        </div>
                      </div>
                    </div>
                  ) : isApproved ? (
                    <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 text-xs text-emerald-950 flex items-start gap-2.5 shadow-2xs">
                      <span className="text-emerald-700 font-bold text-base leading-none mt-0.5">✓</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <strong className="font-bold text-emerald-900">
                            Approved by StockFlow Administration
                          </strong>
                          {offer.decidedAt ? (
                            <span className="text-[10px] text-emerald-700/80 font-mono">
                              {offer.decidedAt.slice(0, 10)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-emerald-800">
                          {offer.adminDecisionNote
                            ? `Admin Note: ${offer.adminDecisionNote}`
                            : "This proposal has been commercially approved. Operations management will coordinate scheduling and delivery logistics."}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {/* Footer Actions */}
                  <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs">
                    <div className="flex items-center gap-2">
                      {offer.attachments && offer.attachments.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 font-medium">
                          📎 {offer.attachments.length} attachment{offer.attachments.length > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuickViewOffer(offer)}
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 hover:text-neutral-950 transition cursor-pointer"
                      >
                        Quick View
                      </button>
                      <Link
                        href={`/offers/${offer.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                      >
                        Open Full Dossier &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick View Drawer */}
      <OfferQuickViewDrawer
        offer={quickViewOffer}
        role={identity.role}
        onClose={() => setQuickViewOffer(null)}
      />
    </div>
  );
}
