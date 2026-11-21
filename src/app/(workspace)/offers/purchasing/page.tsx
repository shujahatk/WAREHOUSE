"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersNav } from "@/components/offers/offers-nav";
import type { OfferFilterKey } from "@/components/offers/offers-stats";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferQuickViewDrawer } from "@/components/offers/offer-quick-view-drawer";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import { SellingOfferModal } from "@/components/offers/selling-offer-modal";
import { exportOffersToCsv } from "@/components/offers/offers-csv";
import type { OfferView } from "@/domain/view";
import { formatCurrencySummary, groupTotalsByCurrency } from "@/lib/currency";

export default function PurchasingOffersPage() {
  const {
    state,
    createOffer,
    editOffer,
    deleteOffer,
    decideOffer,
    toggleOfferFavourite,
    submitSellingOffer,
    notice,
  } = useDemo();
  const { identity } = useSession();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sellingModalOffer, setSellingModalOffer] = useState<OfferView | null>(null);
  const [editingOffer, setEditingOffer] = useState<OfferView | null>(null);
  const [decideModalOffer, setDecideModalOffer] = useState<OfferView | null>(null);
  const [quickViewOffer, setQuickViewOffer] = useState<OfferView | null>(null);
  const [activeFilter, setActiveFilter] = useState<OfferFilterKey>("all");

  const isModerator = identity.role === "moderator";

  const allOffers = useMemo(() => state.offers || [], [state.offers]);
  const purchasingOffers = useMemo(() => {
    return allOffers.filter((o) => o.kind === "purchasing");
  }, [allOffers]);

  const sellingCount = useMemo(() => {
    return allOffers.filter((o) => o.kind === "selling" && o.statusKey !== "accepted" && !o.soldAt).length;
  }, [allOffers]);

  const soldCount = useMemo(() => {
    return allOffers.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt)).length;
  }, [allOffers]);

  // Count of user's submitted selling offers for external user portal
  const myOffersCount = useMemo(() => {
    return allOffers.filter((o) => {
      if (o.kind !== "selling") return false;
      if (identity.role === "owner" || identity.role === "moderator") return true;
      return (
        (identity.id && o.createdBy === identity.id) ||
        Boolean(identity.email && o.emailAddress && o.emailAddress.toLowerCase() === identity.email.toLowerCase()) ||
        Boolean(identity.name && o.createdByName === identity.name)
      );
    }).length;
  }, [allOffers, identity]);

  // Key purchasing highlights
  const metrics = useMemo(() => {
    let totalVal = 0;
    let totalQty = 0;
    let truckLoads = 0;
    const countrySet = new Set<string>();

    for (const o of purchasingOffers) {
      totalVal += o.totalValue || 0;
      totalQty += o.quantity || 0;
      truckLoads += o.truckLoads || 1;
      if (o.country) countrySet.add(o.country);
    }

    const avgPrice = totalQty > 0 ? totalVal / totalQty : 0;
    const currencyTotals = groupTotalsByCurrency(
      purchasingOffers.map((o) => ({ amount: o.totalValue || 0, currency: o.currency }))
    );

    return {
      totalVal,
      totalQty,
      truckLoads,
      avgPrice,
      countriesCount: countrySet.size,
      currencyTotals,
    };
  }, [purchasingOffers]);

  // Filtered by KPI card selection
  const displayedOffers = useMemo(() => {
    if (activeFilter === "all") return purchasingOffers;
    if (activeFilter === "pending") {
      return purchasingOffers.filter((o) => o.statusKey === "draft" || o.statusKey === "received");
    }
    if (activeFilter === "under_review") {
      return purchasingOffers.filter((o) => o.statusKey === "under_review");
    }
    if (activeFilter === "negotiating") {
      return purchasingOffers.filter((o) => o.statusKey === "negotiating");
    }
    if (activeFilter === "won") {
      return purchasingOffers.filter((o) => o.statusKey === "won" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    }
    if (activeFilter === "lost") {
      return purchasingOffers.filter((o) => o.statusKey === "lost");
    }
    if (activeFilter === "sold") {
      return purchasingOffers.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    }
    return purchasingOffers;
  }, [purchasingOffers, activeFilter]);

  return (
    <div className="space-y-8">
      {/* 1. Sub-Navigation */}
      <OffersNav
        role={identity.role}
        purchasingCount={purchasingOffers.length}
        sellingCount={sellingCount}
        soldCount={soldCount}
        myOffersCount={myOffersCount}
        onOpenCreatePurchasing={isModerator ? () => setCreateModalOpen(true) : undefined}
        onOpenCreateSelling={identity.role === "offers_user" ? () => setSellingModalOffer(purchasingOffers[0] || null) : undefined}
        onExportCsv={() => exportOffersToCsv(purchasingOffers, "rm-purchasing-offers.csv")}
      />

      {notice ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 shadow-2xs">
          {notice}
        </div>
      ) : null}

      {/* 2. Streamlined Summary & Filter Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        {/* Compact Key Metric Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-1 font-medium text-neutral-700 border border-neutral-200/70">
              <span className="text-neutral-400">Total Sourced:</span>
              <strong className="font-mono text-neutral-900">{formatCurrencySummary(metrics.currencyTotals)}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 border border-emerald-200/70">
              <span className="text-emerald-600">Volume:</span>
              <strong className="font-mono">{(metrics.totalQty / 1000).toFixed(1)} MT</strong>
              <span className="text-[10px] text-emerald-600">({metrics.truckLoads} loads)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-1 font-medium text-neutral-700 border border-neutral-200/70">
              <span className="text-neutral-400">Avg Price:</span>
              <strong className="font-mono text-neutral-900">€{metrics.avgPrice.toFixed(2)}/kg</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-1 font-medium text-neutral-700 border border-neutral-200/70">
              <span className="text-neutral-400">Origins:</span>
              <strong className="text-neutral-900">{metrics.countriesCount} Countries</strong>
            </span>
          </div>

          <span className="text-xs text-neutral-400 font-medium">
            {purchasingOffers.length} Total Offers
          </span>
        </div>

        {/* Interactive Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all", label: "All Offers", count: purchasingOffers.length },
            {
              key: "pending",
              label: "Pending",
              count: purchasingOffers.filter((o) => o.statusKey === "draft" || o.statusKey === "received").length,
            },
            {
              key: "under_review",
              label: "Under Review",
              count: purchasingOffers.filter((o) => o.statusKey === "under_review").length,
            },
            {
              key: "negotiating",
              label: "Negotiating",
              count: purchasingOffers.filter((o) => o.statusKey === "negotiating").length,
            },
            {
              key: "won",
              label: "Won / Sold",
              count: purchasingOffers.filter((o) => o.statusKey === "won" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt)).length,
            },
            {
              key: "lost",
              label: "Lost",
              count: purchasingOffers.filter((o) => o.statusKey === "lost").length,
            },
          ].map((pill) => {
            const active = activeFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setActiveFilter(pill.key as OfferFilterKey)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-neutral-900 text-white shadow-2xs font-semibold"
                    : "bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900"
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    active ? "bg-neutral-800 text-neutral-200" : "bg-neutral-200/80 text-neutral-600"
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Purchasing Data Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200/90 pb-3">
          <div>
            <h3 className="text-base font-bold text-neutral-950">
              Purchasing Offers Catalog ({displayedOffers.length})
            </h3>
            <p className="text-xs text-neutral-500">
              Incoming supplier material offers, specifications, verification statuses, and commercial terms
            </p>
          </div>
        </div>

        <OffersTable
          offers={displayedOffers}
          orders={state.orders}
          role={identity.role}
          mode="purchasing"
          onToggleFavourite={(id) => void toggleOfferFavourite(id)}
          onEdit={(offer) => setEditingOffer(offer)}
          onDelete={(id) => void deleteOffer(id)}
          onDecide={(offer) => setDecideModalOffer(offer)}
          onSelectOffer={(offer) => setQuickViewOffer(offer)}
          onOpenCreate={isModerator ? () => setCreateModalOpen(true) : undefined}
          createLabel="New Purchasing Offer"
        />
      </section>

      {/* Slide-Over Quick-View Drawer */}
      <OfferQuickViewDrawer
        offer={quickViewOffer}
        role={identity.role}
        onClose={() => setQuickViewOffer(null)}
        onDecide={(o) => setDecideModalOffer(o)}
        onEdit={(o) => setEditingOffer(o)}
        onSubmitSellingOffer={(o) => setSellingModalOffer(o)}
      />

      {/* Modals */}
      {createModalOpen ? (
        <OfferFormModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          initialKind="purchasing"
          onSubmit={async (draft) => {
            return createOffer({ ...draft, kind: "purchasing" });
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

      {sellingModalOffer ? (
        <SellingOfferModal
          isOpen={Boolean(sellingModalOffer)}
          onClose={() => setSellingModalOffer(null)}
          initialPoNumber={sellingModalOffer.poNumber || sellingModalOffer.number}
          initialPurchasingOfferId={sellingModalOffer.id}
          initialMaterialType={sellingModalOffer.materialType}
          initialMaterialName={sellingModalOffer.material}
          initialOrigin={sellingModalOffer.country || sellingModalOffer.location}
          initialQuantity={sellingModalOffer.quantity}
          initialUnit={sellingModalOffer.unit}
          onSubmit={async (draft) => {
            return submitSellingOffer(draft);
          }}
        />
      ) : null}
    </div>
  );
}
