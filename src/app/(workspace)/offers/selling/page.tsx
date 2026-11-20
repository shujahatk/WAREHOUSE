"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersNav } from "@/components/offers/offers-nav";
import type { OfferFilterKey } from "@/components/offers/offers-stats";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferQuickViewDrawer } from "@/components/offers/offer-quick-view-drawer";
import { SellingOfferModal } from "@/components/offers/selling-offer-modal";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import { exportOffersToCsv } from "@/components/offers/offers-csv";
import type { OfferView } from "@/domain/view";
import { cn } from "@/lib/cn";
import { formatCurrencySummary, groupTotalsByCurrency } from "@/lib/currency";

export default function SellingOffersPage() {
  const {
    state,
    submitSellingOffer,
    editOffer,
    deleteOffer,
    decideOffer,
    toggleOfferFavourite,
    notice,
  } = useDemo();
  const { identity } = useSession();

  const [sellingModalOpen, setSellingModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferView | null>(null);
  const [decideModalOffer, setDecideModalOffer] = useState<OfferView | null>(null);
  const [quickViewOffer, setQuickViewOffer] = useState<OfferView | null>(null);

  // Status Tab for Selling desk: "all" | "pending" | "approved" | "negotiating" | "sold" | "rejected"
  const [sellingStatusTab, setSellingStatusTab] = useState<string>("all");
  const [activeKpiFilter, setActiveKpiFilter] = useState<OfferFilterKey>("all");

  const isOffersUser = identity.role === "offers_user";

  const allOffers = useMemo(() => state.offers || [], [state.offers]);
  const sellingOffers = useMemo(() => {
    return allOffers.filter((o) => o.kind === "selling");
  }, [allOffers]);

  const purchasingCount = useMemo(() => {
    return allOffers.filter((o) => o.kind === "purchasing" && o.statusKey !== "accepted" && !o.soldAt).length;
  }, [allOffers]);

  const soldCount = useMemo(() => {
    return allOffers.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt)).length;
  }, [allOffers]);

  // Orders map for margin aggregation
  const poMap = useMemo(() => {
    const map = new Map<string, (typeof state.orders)[0]>();
    for (const po of state.orders || []) {
      if (po.number) map.set(po.number, po);
    }
    return map;
  }, [state.orders]);

  // Key Selling metrics
  const metrics = useMemo(() => {
    let totalContractVal = 0;
    let pendingReviews = 0;
    let approvedActive = 0;
    let closedSoldVal = 0;
    let totalMarginEur = 0;
    let marginDealsCount = 0;

    for (const o of sellingOffers) {
      const val = o.totalValue || 0;
      const isSold = o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt);

      if (isSold) {
        closedSoldVal += val;
      } else {
        totalContractVal += val;
      }

      if (o.approvalStatus === "pending") pendingReviews += 1;
      if (o.approvalStatus === "approved" && !isSold) approvedActive += 1;

      // Margin estimate against PO
      if (o.poNumber) {
        const po = poMap.get(o.poNumber);
        if (po && po.quantityKg && po.valueEur) {
          const poUnitCost = po.valueEur / po.quantityKg;
          const sellPrice = o.pricePerUnit;
          if (sellPrice > 0 && poUnitCost > 0) {
            const diff = sellPrice - poUnitCost;
            totalMarginEur += diff * (o.quantity || 0);
            marginDealsCount += 1;
          }
        }
      }
    }

    const activePipelineTotals = groupTotalsByCurrency(
      sellingOffers
        .filter((o) => o.statusKey !== "accepted" && o.statusKey !== "sold" && !o.soldAt)
        .map((o) => ({ amount: o.totalValue || 0, currency: o.currency }))
    );
    const soldTotals = groupTotalsByCurrency(
      sellingOffers
        .filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt))
        .map((o) => ({ amount: o.totalValue || 0, currency: o.currency }))
    );

    return {
      totalContractVal,
      activePipelineTotals,
      soldTotals,
      pendingReviews,
      approvedActive,
      closedSoldVal,
      totalMarginEur,
      marginDealsCount,
    };
  }, [sellingOffers, poMap]);

  // Filtered selling offers based on tab and KPI filter
  const displayedOffers = useMemo(() => {
    let list = sellingOffers;

    if (sellingStatusTab === "pending") {
      list = list.filter((o) => o.approvalStatus === "pending");
    } else if (sellingStatusTab === "approved") {
      list = list.filter((o) => o.approvalStatus === "approved" && o.statusKey !== "accepted" && !o.soldAt);
    } else if (sellingStatusTab === "negotiating") {
      list = list.filter((o) => o.statusKey === "negotiating");
    } else if (sellingStatusTab === "sold") {
      list = list.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    } else if (sellingStatusTab === "rejected") {
      list = list.filter((o) => o.approvalStatus === "rejected");
    }

    if (activeKpiFilter === "all") return list;
    if (activeKpiFilter === "pending") {
      return list.filter((o) => o.statusKey === "draft" || o.statusKey === "received");
    }
    if (activeKpiFilter === "under_review") {
      return list.filter((o) => o.statusKey === "under_review");
    }
    if (activeKpiFilter === "negotiating") {
      return list.filter((o) => o.statusKey === "negotiating");
    }
    if (activeKpiFilter === "won" || activeKpiFilter === "sold") {
      return list.filter((o) => o.statusKey === "won" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    }
    if (activeKpiFilter === "lost") {
      return list.filter((o) => o.statusKey === "lost");
    }

    return list;
  }, [sellingOffers, sellingStatusTab, activeKpiFilter]);

  if (isOffersUser) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-xs mt-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700 text-xl font-bold">
          ✕
        </div>
        <h2 className="mt-3 text-lg font-bold text-neutral-900">Access Restricted</h2>
        <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
          The internal Selling Offers desk is reserved for RM Trading Moderators and Administrators. External Offers Users can access verified Purchasing Offers and submit responses linked to specific purchase orders.
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
        sellingCount={sellingOffers.length}
        soldCount={soldCount}
        onOpenCreateSelling={() => setSellingModalOpen(true)}
        onExportCsv={() => exportOffersToCsv(sellingOffers, "rm-selling-offers.csv")}
      />

      {notice ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 shadow-2xs">
          {notice}
        </div>
      ) : null}

      {/* 2. Streamlined Sales Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200/90 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-1 font-medium text-neutral-700 border border-neutral-200/70">
            <span className="text-neutral-400">Active Pipeline:</span>
            <strong className="font-mono text-neutral-900">{formatCurrencySummary(metrics.activePipelineTotals)}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 border border-emerald-200/70">
            <span className="text-emerald-600">Estimated Margins:</span>
            <strong className="font-mono">
              {metrics.totalMarginEur >= 0 ? "+" : ""}€{metrics.totalMarginEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 font-medium text-amber-800 border border-amber-200/70">
            <span className="text-amber-600">Pending Review:</span>
            <strong>{metrics.pendingReviews} Offers</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-1 font-medium text-neutral-700 border border-neutral-200/70">
            <span className="text-neutral-400">Closed Sold:</span>
            <strong className="font-mono text-neutral-900">{formatCurrencySummary(metrics.soldTotals)}</strong>
          </span>
        </div>

        <span className="text-xs text-neutral-400 font-medium">
          {sellingOffers.length} Total Selling Offers
        </span>
      </div>

      {/* 4. Selling Desk Data Grid with Preset Status Tabs */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200/90 pb-3">
          <div>
            <h3 className="text-base font-bold text-neutral-950">
              Selling Desk &amp; Commercial Margins Registry ({displayedOffers.length})
            </h3>
            <p className="text-xs text-neutral-500">
              Customer sales offers linked to Purchase Orders with real-time margin tracking and separated Buyer &amp; Sender tracking
            </p>
          </div>

          {/* Status Tabs */}
          <div className="inline-flex flex-wrap rounded-lg border border-neutral-200 bg-neutral-100/90 p-0.5 text-xs">
            {[
              { id: "all", label: "All Selling", count: sellingOffers.length },
              {
                id: "pending",
                label: "Pending Review",
                count: sellingOffers.filter((o) => o.approvalStatus === "pending").length,
              },
              {
                id: "approved",
                label: "Approved",
                count: sellingOffers.filter((o) => o.approvalStatus === "approved" && o.statusKey !== "accepted" && !o.soldAt).length,
              },
              {
                id: "negotiating",
                label: "Negotiating",
                count: sellingOffers.filter((o) => o.statusKey === "negotiating").length,
              },
              {
                id: "sold",
                label: "Sold Deals",
                count: sellingOffers.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt)).length,
              },
              {
                id: "rejected",
                label: "Declined",
                count: sellingOffers.filter((o) => o.approvalStatus === "rejected").length,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSellingStatusTab(t.id);
                  setActiveKpiFilter("all");
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold transition",
                  sellingStatusTab === t.id
                    ? "bg-white text-emerald-950 shadow-2xs"
                    : "text-neutral-600 hover:text-neutral-950"
                )}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
        </div>

        <OffersTable
          offers={displayedOffers}
          orders={state.orders}
          role={identity.role}
          mode="selling"
          onToggleFavourite={(id) => void toggleOfferFavourite(id)}
          onEdit={(offer) => setEditingOffer(offer)}
          onDelete={(id) => void deleteOffer(id)}
          onDecide={(offer) => setDecideModalOffer(offer)}
          onSelectOffer={(offer) => setQuickViewOffer(offer)}
          onOpenCreate={() => setSellingModalOpen(true)}
          createLabel="Submit Selling Offer"
        />
      </section>

      {/* Slide-Over Quick-View Drawer */}
      <OfferQuickViewDrawer
        offer={quickViewOffer}
        role={identity.role}
        onClose={() => setQuickViewOffer(null)}
        onDecide={(o) => setDecideModalOffer(o)}
        onEdit={(o) => setEditingOffer(o)}
      />

      {/* Modals */}
      {sellingModalOpen ? (
        <SellingOfferModal
          isOpen={sellingModalOpen}
          onClose={() => setSellingModalOpen(false)}
          onSubmit={async (draft) => {
            return submitSellingOffer(draft);
          }}
        />
      ) : null}

      {editingOffer ? (
        <OfferFormModal
          isOpen={Boolean(editingOffer)}
          onClose={() => setEditingOffer(null)}
          offerToEdit={editingOffer}
          onSubmit={async (draft) => {
            return editOffer(draft);
          }}
        />
      ) : null}

      {decideModalOffer ? (
        <OfferDecisionModal
          offer={decideModalOffer}
          isOpen={Boolean(decideModalOffer)}
          onClose={() => setDecideModalOffer(null)}
          onDecide={async (decision, note) => {
            return decideOffer({ id: decideModalOffer.id, decision, note });
          }}
        />
      ) : null}
    </div>
  );
}
