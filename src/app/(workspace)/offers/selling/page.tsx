"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersStats } from "@/components/offers/offers-stats";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import type { OfferView } from "@/domain/view";

export default function SellingOffersPage() {
  const { state, createOffer, editOffer, deleteOffer, decideOffer, toggleOfferFavourite } = useDemo();
  const { identity } = useSession();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferView | null>(null);
  const [decideModalOffer, setDecideModalOffer] = useState<OfferView | null>(null);

  const sellingOffers = useMemo(() => {
    return (state.offers || []).filter((o) => o.kind === "selling");
  }, [state.offers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
            Selling Offers
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Manage outgoing sales offers to material customers, track pricing margins, submit for Admin review, and record won/lost contracts
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <OffersStats offers={sellingOffers} title="Selling Pipeline Statistics" />

      {/* Table */}
      <OffersTable
        offers={sellingOffers}
        role={identity.role}
        onToggleFavourite={(id) => void toggleOfferFavourite(id)}
        onEdit={(offer) => setEditingOffer(offer)}
        onDelete={(id) => void deleteOffer(id)}
        onDecide={(offer) => setDecideModalOffer(offer)}
        onOpenCreate={() => setCreateModalOpen(true)}
        createLabel="New Selling Offer"
      />

      {/* Modals */}
      {createModalOpen ? (
        <OfferFormModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          initialKind="selling"
          onSubmit={async (draft) => {
            return createOffer({ ...draft, kind: "selling" });
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

