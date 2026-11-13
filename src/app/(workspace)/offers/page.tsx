"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersStats } from "@/components/offers/offers-stats";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import type { OfferView } from "@/domain/view";

export default function OffersDashboardPage() {
  const { state, createOffer, decideOffer, toggleOfferFavourite, deleteOffer } = useDemo();
  const { identity } = useSession();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createKind, setCreateKind] = useState<"purchasing" | "selling">("purchasing");
  const [decideModalOffer, setDecideModalOffer] = useState<OfferView | null>(null);

  const offers = state.offers || [];
  const isModerator = identity.role === "moderator";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
            Offers Dashboard
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Real-time purchasing and selling offers management, review oversight, and deal negotiations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/offers/purchasing"
            className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50"
          >
            Purchasing Offers &rarr;
          </Link>
          <Link
            href="/offers/selling"
            className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50"
          >
            Selling Offers &rarr;
          </Link>
          {isModerator ? (
            <button
              type="button"
              onClick={() => {
                setCreateKind("purchasing");
                setCreateModalOpen(true);
              }}
              className="rounded-lg bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
            >
              + Create Offer
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI Stats */}
      <OffersStats offers={offers} title="Global Offer Performance" />

      {/* Quick Overview Table */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            All Active Offers ({offers.length})
          </h2>
          <div className="flex gap-2">
            <Link
              href="/offers/purchasing"
              className="text-xs font-medium text-neutral-600 hover:text-neutral-950"
            >
              View Purchasing Only &rarr;
            </Link>
            <span className="text-neutral-300">|</span>
            <Link
              href="/offers/selling"
              className="text-xs font-medium text-neutral-600 hover:text-neutral-950"
            >
              View Selling Only &rarr;
            </Link>
          </div>
        </div>

        <OffersTable
          offers={offers}
          role={identity.role}
          onToggleFavourite={(id) => void toggleOfferFavourite(id)}
          onDelete={(id) => void deleteOffer(id)}
          onDecide={(offer) => setDecideModalOffer(offer)}
          onOpenCreate={() => {
            setCreateKind("purchasing");
            setCreateModalOpen(true);
          }}
          createLabel="Create Offer"
        />
      </div>

      {/* Modals */}
      {createModalOpen ? (
        <OfferFormModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          initialKind={createKind}
          onSubmit={async (draft) => {
            return createOffer(draft);
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

