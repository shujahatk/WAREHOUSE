"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersNav } from "@/components/offers/offers-nav";
import { OffersStats, type OfferFilterKey } from "@/components/offers/offers-stats";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferQuickViewDrawer } from "@/components/offers/offer-quick-view-drawer";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import { exportOffersToCsv } from "@/components/offers/offers-csv";
import type { OfferView } from "@/domain/view";

export default function PurchasingOffersPage() {
  const {
    state,
    createOffer,
    editOffer,
    deleteOffer,
    decideOffer,
    toggleOfferFavourite,
    notice,
  } = useDemo();
  const { identity } = useSession();

  const [createModalOpen, setCreateModalOpen] = useState(false);
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

    return {
      totalVal,
      totalQty,
      truckLoads,
      avgPrice,
      countriesCount: countrySet.size,
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
        onOpenCreatePurchasing={isModerator ? () => setCreateModalOpen(true) : undefined}
        onExportCsv={() => exportOffersToCsv(purchasingOffers, "rm-purchasing-offers.csv")}
      />

      {notice ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 shadow-2xs">
          {notice}
        </div>
      ) : null}

      {/* 2. Key Purchasing Sourcing KPI Metrics Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Total Sourced Value
          </span>
          <p className="mt-1 text-2xl font-black text-neutral-950 font-mono">
            €{metrics.totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            Across {purchasingOffers.length} supplier proposals
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Material Sourcing Volume
          </span>
          <p className="mt-1 text-2xl font-black text-emerald-800 font-mono">
            {(metrics.totalQty / 1000).toFixed(1)} MT
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {metrics.truckLoads} full truckloads sourced
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Average Sourced Price
          </span>
          <p className="mt-1 text-2xl font-black text-neutral-950 font-mono">
            €{metrics.avgPrice.toFixed(2)}
            <span className="text-xs font-normal text-neutral-500 ml-1">/ kg</span>
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            Weighted across active grades
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            Supplier Geography
          </span>
          <p className="mt-1 text-2xl font-black text-neutral-950 font-mono">
            {metrics.countriesCount} Countries
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            Origin freight logistics network
          </p>
        </div>
      </div>

      {/* 3. Status Filter Cards */}
      <OffersStats
        offers={purchasingOffers}
        activeFilter={activeFilter}
        onSelectFilter={(f) => setActiveFilter(f)}
        title="Purchasing Pipeline & Verification Velocity"
      />

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
    </div>
  );
}
