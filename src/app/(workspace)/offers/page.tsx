"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersStats } from "@/components/offers/offers-stats";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import { SellingOfferModal } from "@/components/offers/selling-offer-modal";
import type { OfferView } from "@/domain/view";

export default function OffersDashboardPage() {
  const {
    state,
    createOffer,
    submitSellingOffer,
    decideOffer,
    toggleOfferFavourite,
    deleteOffer,
    notice,
  } = useDemo();
  const { identity } = useSession();

  const [createPurchasingOpen, setCreatePurchasingOpen] = useState(false);
  const [sellingModalOpen, setSellingModalOpen] = useState(false);
  const [decideModalOffer, setDecideModalOffer] = useState<OfferView | null>(null);

  // Status filter for Selling Offers section
  const [sellingStatusFilter, setSellingStatusFilter] = useState<string>("all");

  const offers = useMemo(() => state.offers || [], [state.offers]);
  const isModerator = identity.role === "moderator";
  const isOffersUser = identity.role === "offers_user";

  // 1. Purchasing Offers (excluding sold)
  const purchasingOffers = useMemo(() => {
    return offers.filter((o) => o.kind === "purchasing" && o.statusKey !== "accepted" && !o.soldAt);
  }, [offers]);

  // 2. Selling Offers (excluding sold, filtered by status)
  const allActiveSellingOffers = useMemo(() => {
    return offers.filter((o) => o.kind === "selling" && o.statusKey !== "accepted" && !o.soldAt);
  }, [offers]);

  const filteredSellingOffers = useMemo(() => {
    if (sellingStatusFilter === "all") return allActiveSellingOffers;
    if (sellingStatusFilter === "pending") {
      return allActiveSellingOffers.filter((o) => o.approvalStatus === "pending");
    }
    if (sellingStatusFilter === "approved") {
      return allActiveSellingOffers.filter((o) => o.approvalStatus === "approved");
    }
    if (sellingStatusFilter === "rejected") {
      return allActiveSellingOffers.filter((o) => o.approvalStatus === "rejected");
    }
    return allActiveSellingOffers;
  }, [allActiveSellingOffers, sellingStatusFilter]);

  // 3. Sold Section (Commercially Accepted offers)
  const soldOffers = useMemo(() => {
    return offers.filter((o) => o.statusKey === "accepted" || Boolean(o.soldAt));
  }, [offers]);

  // Offers User: their own submitted selling offers
  const mySellingOffers = useMemo(() => {
    if (!isOffersUser) return [];
    return offers.filter((o) => o.kind === "selling");
  }, [offers, isOffersUser]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
            {isOffersUser ? "RM Offers Portal" : "Offers Management & Trading Hub"}
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            {isOffersUser
              ? "Browse available purchasing opportunities and submit selling offers linked to purchase orders."
              : "Overview of global purchasing offers, reviewed selling offers, and completed sold transactions."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Offers User actions */}
          {isOffersUser ? (
            <button
              type="button"
              onClick={() => setSellingModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800"
            >
              + Submit Selling Offer
            </button>
          ) : null}

          {/* Admin / Moderator actions */}
          {!isOffersUser ? (
            <>
              {isModerator ? (
                <button
                  type="button"
                  onClick={() => setCreatePurchasingOpen(true)}
                  className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 shadow-2xs"
                >
                  + New Purchasing Offer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSellingModalOpen(true)}
                className="rounded-lg bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
              >
                + Submit Selling Offer
              </button>
            </>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          {notice}
        </div>
      ) : null}

      {/* KPI Performance Stats (for internal staff/admin/moderator) */}
      {!isOffersUser ? (
        <OffersStats offers={offers} title="Procurement & Deal Velocity" />
      ) : null}

      {/* ========================================================================= */}
      {/* OFFERS USER SPECIFIC PORTAL VIEW */}
      {/* ========================================================================= */}
      {isOffersUser ? (
        <div className="space-y-8">
          {/* Section: Available Purchasing Offers Catalog */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold tracking-wide text-neutral-900 uppercase">
                  Available Purchasing Offers ({purchasingOffers.length})
                </h2>
                <p className="text-xs text-neutral-500">
                  Materials currently sourced and approved for purchase by RM.
                </p>
              </div>
            </div>

            <OffersTable
              offers={purchasingOffers}
              role={identity.role}
              onToggleFavourite={(id) => void toggleOfferFavourite(id)}
              createLabel="Submit Selling Offer"
              onOpenCreate={() => setSellingModalOpen(true)}
            />
          </section>

          {/* Section: My Submitted Selling Offers */}
          <section className="space-y-3 pt-4 border-t border-neutral-200">
            <div>
              <h2 className="text-sm font-bold tracking-wide text-neutral-900 uppercase">
                My Submitted Selling Offers ({mySellingOffers.length})
              </h2>
              <p className="text-xs text-neutral-500">
                Track status of your submitted selling offers linked to purchase orders.
              </p>
            </div>

            {mySellingOffers.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 text-center">
                <p className="text-sm font-medium text-neutral-800">No Selling Offers Submitted Yet</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Click &quot;+ Submit Selling Offer&quot; to link a client offer to an existing Purchase Order.
                </p>
                <button
                  type="button"
                  onClick={() => setSellingModalOpen(true)}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-neutral-950 px-4 text-xs font-semibold text-white hover:bg-neutral-800"
                >
                  + Submit Your First Selling Offer
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mySellingOffers.map((o) => (
                  <div
                    key={o.id}
                    className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-xs hover:border-neutral-300 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-neutral-900">{o.number}</span>
                        {o.statusKey === "accepted" || o.soldAt ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
                            ✓ SOLD
                          </span>
                        ) : o.approvalStatus === "approved" ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                            Approved
                          </span>
                        ) : o.approvalStatus === "rejected" ? (
                          <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                            Declined
                          </span>
                        ) : (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                            Pending Admin Review
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-neutral-950">{o.material}</h3>
                      <p className="text-xs text-neutral-600">
                        {o.poNumber ? `Linked to PO: ${o.poNumber}` : "Direct Offer"}
                      </p>
                      <div className="mt-2 space-y-0.5 text-xs text-neutral-600">
                        <p>Client: <span className="font-semibold text-neutral-900">{o.clientName || "—"}</span></p>
                        <p>Price: <span className="font-semibold text-emerald-700">{o.pricePerUnit} {o.currency} / {o.unit}</span></p>
                        <p>Route: <span>{o.origin || o.country} &rarr; {o.destination || "—"}</span></p>
                      </div>
                      {o.adminDecisionNote ? (
                        <p className="mt-2 rounded bg-neutral-50 p-2 text-[11px] text-neutral-700 italic border border-neutral-200">
                          Note: &ldquo;{o.adminDecisionNote}&rdquo;
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
                      <span className="text-neutral-400">{o.createdAt.slice(0, 10)}</span>
                      <Link
                        href={`/offers/${o.id}`}
                        className="font-semibold text-neutral-900 underline hover:text-neutral-700"
                      >
                        Inspect Dossier &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ========================================================================= */
        /* ADMIN / MODERATOR VIEW — 3 DISTINCT SECTIONS */
        /* ========================================================================= */
        <div className="space-y-10">
          {/* SECTION 1: PURCHASING OFFERS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-800">
                    1
                  </span>
                  <h2 className="text-sm font-bold tracking-wide text-neutral-950 uppercase">
                    Purchasing Offers ({purchasingOffers.length})
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Offers from suppliers to procure secondary materials into RM inventory.
                </p>
              </div>
              <Link
                href="/offers/purchasing"
                className="text-xs font-semibold text-neutral-600 hover:text-neutral-950"
              >
                Full Catalog &rarr;
              </Link>
            </div>

            <OffersTable
              offers={purchasingOffers}
              role={identity.role}
              onToggleFavourite={(id) => void toggleOfferFavourite(id)}
              onDelete={(id) => void deleteOffer(id)}
              onDecide={(offer) => setDecideModalOffer(offer)}
              onOpenCreate={() => setCreatePurchasingOpen(true)}
              createLabel="New Purchasing Offer"
            />
          </section>

          {/* SECTION 2: SELLING OFFERS */}
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[11px] font-bold text-purple-800">
                    2
                  </span>
                  <h2 className="text-sm font-bold tracking-wide text-neutral-950 uppercase">
                    Selling Offers ({allActiveSellingOffers.length})
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Offers submitted by Offers Users or Moderators linked to Purchase Orders.
                </p>
              </div>

              {/* Status filter: Pending Approval, Approved, Rejected */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-medium text-neutral-500 mr-1">Status:</span>
                {[
                  { id: "all", label: "All Selling", count: allActiveSellingOffers.length },
                  { id: "pending", label: "Pending Approval", count: allActiveSellingOffers.filter((o) => o.approvalStatus === "pending").length },
                  { id: "approved", label: "Approved", count: allActiveSellingOffers.filter((o) => o.approvalStatus === "approved").length },
                  { id: "rejected", label: "Rejected", count: allActiveSellingOffers.filter((o) => o.approvalStatus === "rejected").length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSellingStatusFilter(tab.id)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition ${
                      sellingStatusFilter === tab.id
                        ? "bg-neutral-950 text-white shadow-xs"
                        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {filteredSellingOffers.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 text-center text-xs text-neutral-500">
                No selling offers found matching status filter &ldquo;{sellingStatusFilter}&rdquo;.
              </div>
            ) : (
              <OffersTable
                offers={filteredSellingOffers}
                role={identity.role}
                onToggleFavourite={(id) => void toggleOfferFavourite(id)}
                onDelete={(id) => void deleteOffer(id)}
                onDecide={(offer) => setDecideModalOffer(offer)}
                onOpenCreate={() => setSellingModalOpen(true)}
                createLabel="Submit Selling Offer"
              />
            )}
          </section>

          {/* SECTION 3: SOLD (LOCATED DIRECTLY BELOW SELLING OFFERS) */}
          <section className="space-y-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/20 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                    3
                  </span>
                  <h2 className="text-sm font-bold tracking-wide text-emerald-950 uppercase">
                    Sold Deals & Closed Transactions ({soldOffers.length})
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Offers that reached commercial acceptance automatically move into this section without duplication.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                Total Closed: {soldOffers.reduce((sum, o) => sum + (o.totalValue || 0), 0).toLocaleString()} EUR
              </span>
            </div>

            {soldOffers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-emerald-300 bg-white p-8 text-center text-xs text-neutral-500">
                No offers marked as Sold yet. Approved selling offers can be accepted to move here automatically.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-50/50 text-[11px] font-bold text-emerald-900 uppercase">
                    <tr>
                      <th className="px-4 py-3">Offer Reference</th>
                      <th className="px-4 py-3">PO Reference</th>
                      <th className="px-4 py-3">Client / Buyer</th>
                      <th className="px-4 py-3">Material & Grade</th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Closed Value</th>
                      <th className="px-4 py-3">Route</th>
                      <th className="px-4 py-3">Sold Date</th>
                      <th className="px-4 py-3 text-right">Dossier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-800">
                    {soldOffers.map((o) => (
                      <tr key={o.id} className="hover:bg-emerald-50/30">
                        <td className="px-4 py-3">
                          <Link href={`/offers/${o.id}`} className="font-bold text-neutral-950 hover:underline">
                            {o.number}
                          </Link>
                          <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                            SOLD
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {o.poNumber ? (
                            <Link href={`/purchases/${o.poNumber}`} className="text-indigo-600 hover:underline">
                              {o.poNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium">{o.clientName || "—"}</td>
                        <td className="px-4 py-3 font-semibold">{o.material}</td>
                        <td className="px-4 py-3">{o.quantity.toLocaleString()} {o.unit}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          {o.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} {o.currency}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          {o.origin || o.country} &rarr; {o.destination || "Delivered"}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {o.soldAt ? o.soldAt.slice(0, 10) : o.updatedAt.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/offers/${o.id}`}
                            className="rounded bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-900 hover:bg-neutral-200"
                          >
                            View &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modals */}
      {createPurchasingOpen ? (
        <OfferFormModal
          isOpen={createPurchasingOpen}
          onClose={() => setCreatePurchasingOpen(false)}
          initialKind="purchasing"
          onSubmit={async (draft) => {
            return createOffer(draft);
          }}
        />
      ) : null}

      {sellingModalOpen ? (
        <SellingOfferModal
          isOpen={sellingModalOpen}
          onClose={() => setSellingModalOpen(false)}
          onSubmit={async (draft) => {
            return submitSellingOffer(draft);
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
