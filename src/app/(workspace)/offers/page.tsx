"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OffersNav } from "@/components/offers/offers-nav";
import { OffersStats, type OfferFilterKey } from "@/components/offers/offers-stats";
import { OffersActivityChart } from "@/components/offers/offers-activity-chart";
import { OffersComparisonWidget } from "@/components/offers/offers-comparison-widget";
import { OffersTable } from "@/components/offers/offers-table";
import { OfferQuickViewDrawer } from "@/components/offers/offer-quick-view-drawer";
import { OfferFormModal } from "@/components/offers/offer-form-modal";
import { OfferDecisionModal } from "@/components/offers/offer-decision-modal";
import { SellingOfferModal } from "@/components/offers/selling-offer-modal";
import { exportOffersToCsv } from "@/components/offers/offers-csv";
import type { OfferView } from "@/domain/view";
import { cn } from "@/lib/cn";

export default function OffersDashboardPage() {
  const {
    state,
    createOffer,
    submitSellingOffer,
    decideOffer,
    toggleOfferFavourite,
    deleteOffer,
    editOffer,
    notice,
  } = useDemo();
  const { identity } = useSession();

  // Modals state
  const [createPurchasingOpen, setCreatePurchasingOpen] = useState(false);
  const [sellingModalOpen, setSellingModalOpen] = useState(false);
  const [decideModalOffer, setDecideModalOffer] = useState<OfferView | null>(null);
  const [editingOffer, setEditingOffer] = useState<OfferView | null>(null);

  // Quick view drawer state
  const [quickViewOffer, setQuickViewOffer] = useState<OfferView | null>(null);

  // Active KPI filter applied to table
  const [tableFilter, setTableFilter] = useState<OfferFilterKey>("all");

  // Tab switch for Dashboard Table view: "all" | "purchasing" | "selling" | "sold"
  const [dashboardTab, setDashboardTab] = useState<"all" | "purchasing" | "selling" | "sold">("all");

  const offers = useMemo(() => state.offers || [], [state.offers]);
  const orders = useMemo(() => state.orders || [], [state.orders]);

  const isModerator = identity.role === "moderator";
  const isOffersUser = identity.role === "offers_user";
  const isAdmin = identity.role === "owner";

  // Segmented offers
  const purchasingOffers = useMemo(() => {
    return offers.filter((o) => o.kind === "purchasing" && o.statusKey !== "accepted" && !o.soldAt);
  }, [offers]);

  const activeSellingOffers = useMemo(() => {
    return offers.filter((o) => o.kind === "selling" && o.statusKey !== "accepted" && !o.soldAt);
  }, [offers]);

  const soldOffers = useMemo(() => {
    return offers.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
  }, [offers]);

  // Offers User: their own submitted selling offers
  const mySellingOffers = useMemo(() => {
    if (!isOffersUser) return [];
    return offers.filter((o) => o.kind === "selling");
  }, [offers, isOffersUser]);

  // Offers to display in Dashboard table based on selected tab and KPI filter
  const displayedOffers = useMemo(() => {
    let list: OfferView[] = [];
    if (dashboardTab === "purchasing") {
      list = purchasingOffers;
    } else if (dashboardTab === "selling") {
      list = activeSellingOffers;
    } else if (dashboardTab === "sold") {
      list = soldOffers;
    } else {
      list = offers;
    }

    if (tableFilter === "all") return list;
    if (tableFilter === "pending") {
      return list.filter((o) => o.statusKey === "draft" || o.statusKey === "received");
    }
    if (tableFilter === "under_review") {
      return list.filter((o) => o.statusKey === "under_review");
    }
    if (tableFilter === "negotiating") {
      return list.filter((o) => o.statusKey === "negotiating");
    }
    if (tableFilter === "won") {
      return list.filter((o) => o.statusKey === "won" || o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    }
    if (tableFilter === "lost") {
      return list.filter((o) => o.statusKey === "lost");
    }
    if (tableFilter === "sold") {
      return list.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    }
    return list;
  }, [dashboardTab, tableFilter, offers, purchasingOffers, activeSellingOffers, soldOffers]);

  return (
    <div className="space-y-8">
      {/* 1. Sub-Navigation and Global Header */}
      <OffersNav
        role={identity.role}
        purchasingCount={purchasingOffers.length}
        sellingCount={activeSellingOffers.length}
        soldCount={soldOffers.length}
        onOpenCreatePurchasing={() => setCreatePurchasingOpen(true)}
        onOpenCreateSelling={() => setSellingModalOpen(true)}
        onExportCsv={() => exportOffersToCsv(offers, "rm-offers-all.csv")}
      />

      {notice ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-800 shadow-2xs">
          {notice}
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* OFFERS USER SPECIFIC PORTAL VIEW */}
      {/* ========================================================================= */}
      {isOffersUser ? (
        <div className="space-y-8">
          {/* Hero Welcome Banner */}
          <div className="rounded-2xl border border-emerald-900/10 bg-gradient-to-r from-emerald-900 via-emerald-950 to-neutral-950 p-6 text-white shadow-xs">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-400/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                RM Verified Portal
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Commercial Offers &amp; Trade Pipeline
              </h2>
              <p className="mt-2 text-xs text-emerald-100/90 leading-relaxed sm:text-sm">
                Explore available raw material batches approved by RM, or submit direct customer selling proposals linked to active Purchase Orders for rapid admin appraisal.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSellingModalOpen(true)}
                  className="inline-flex h-9.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Submit Selling Offer
                </button>
                <a
                  href="#available-catalog"
                  className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white backdrop-blur-xs hover:bg-white/20 transition"
                >
                  Browse Catalog ({purchasingOffers.length})
                </a>
              </div>
            </div>
          </div>

          {/* Section: My Submitted Selling Offers */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/90 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-950">
                  My Submitted Selling Offers ({mySellingOffers.length})
                </h3>
                <p className="text-xs text-neutral-500">
                  Track real-time review status, admin approval decisions, and final commercial acceptance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSellingModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
              >
                + New Submission
              </button>
            </div>

            {mySellingOffers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center shadow-2xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-800 text-xl">
                  📋
                </div>
                <h4 className="mt-3 text-sm font-bold text-neutral-900">No Selling Offers Submitted Yet</h4>
                <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
                  Submit a customer selling proposal linked to an existing Purchase Order to begin trading with RM.
                </p>
                <button
                  type="button"
                  onClick={() => setSellingModalOpen(true)}
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-emerald-800 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  + Submit Your First Selling Offer
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mySellingOffers.map((o) => {
                  const isSold = o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt);
                  return (
                    <div
                      key={o.id}
                      onClick={() => setQuickViewOffer(o)}
                      className="group flex flex-col justify-between rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs hover:border-emerald-700/50 hover:shadow-xs transition cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                          <span className="font-mono text-xs font-bold text-neutral-950">{o.number}</span>
                          {isSold ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900 border border-emerald-300">
                              ✓ SOLD DEAL
                            </span>
                          ) : o.approvalStatus === "approved" ? (
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                              ✓ Admin Approved
                            </span>
                          ) : o.approvalStatus === "rejected" ? (
                            <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                              ✕ Declined
                            </span>
                          ) : (
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                              ● Pending Review
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 text-sm font-bold text-neutral-950 group-hover:text-emerald-800 transition-colors">
                          {o.material}
                        </h4>
                        <p className="text-xs text-neutral-500">
                          {o.poNumber ? `Linked to PO: ${o.poNumber}` : "Direct Proposal"}
                        </p>

                        <div className="mt-3 space-y-1 text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Client:</span>
                            <span className="font-semibold text-neutral-900">{o.clientName || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Price:</span>
                            <span className="font-bold text-emerald-800 font-mono">
                              €{o.pricePerUnit} / {o.unit}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Total:</span>
                            <span className="font-bold text-neutral-950 font-mono">
                              €{o.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Route:</span>
                            <span className="truncate max-w-[140px] text-neutral-800">
                              {o.origin || o.country} &rarr; {o.destination || "Direct"}
                            </span>
                          </div>
                        </div>

                        {o.adminDecisionNote ? (
                          <div className="mt-3 rounded-lg bg-amber-50/80 p-2.5 text-[11px] text-amber-900 border border-amber-200">
                            <strong>Admin Note:</strong> &ldquo;{o.adminDecisionNote}&rdquo;
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {o.createdAt ? o.createdAt.slice(0, 10) : ""}
                        </span>
                        <Link
                          href={`/offers/${o.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-emerald-800 hover:text-emerald-950 hover:underline"
                        >
                          Dossier &rarr;
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section: Available Purchasing Offers Catalog */}
          <section id="available-catalog" className="space-y-4 pt-4 border-t border-neutral-200">
            <div>
              <h3 className="text-base font-bold text-neutral-950">
                Available Purchasing Sourcing Catalog ({purchasingOffers.length})
              </h3>
              <p className="text-xs text-neutral-500">
                Materials currently sourced and verified by RM ready for procurement allocation.
              </p>
            </div>

            <OffersTable
              offers={purchasingOffers}
              orders={orders}
              role={identity.role}
              mode="purchasing"
              onToggleFavourite={(id) => void toggleOfferFavourite(id)}
              onSelectOffer={(o) => setQuickViewOffer(o)}
              createLabel="Submit Selling Offer"
              onOpenCreate={() => setSellingModalOpen(true)}
            />
          </section>
        </div>
      ) : (
        /* ========================================================================= */
        /* ENTERPRISE ADMIN / MODERATOR COMMAND DASHBOARD */
        /* ========================================================================= */
        <div className="space-y-8">
          {/* 2. KPI Metrics Bar (Clickable filters) */}
          <OffersStats
            offers={offers}
            activeFilter={tableFilter}
            onSelectFilter={(f) => setTableFilter(f)}
            title="Commercial Trade & Velocity Metrics"
          />

          {/* 3. Monthly Activity Chart (SVG-based real database data) */}
          <OffersActivityChart offers={offers} monthsCount={6} />

          {/* 4. Portfolio Comparison Widget & Recent Flow */}
          <OffersComparisonWidget
            offers={offers}
            onSelectOffer={(o) => setQuickViewOffer(o)}
          />

          {/* 5. Quick Navigation Workspace Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/offers/purchasing"
              className="group flex items-center justify-between rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs hover:border-emerald-600/60 hover:shadow-xs transition"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xl font-bold">
                  📦
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-950 group-hover:text-emerald-800 transition-colors">
                    Purchasing Workspace
                  </h4>
                  <p className="text-xs text-neutral-500">
                    {purchasingOffers.length} active material sourcing offers from global suppliers
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-emerald-800 group-hover:translate-x-1 transition-transform">
                &rarr;
              </span>
            </Link>

            <Link
              href="/offers/selling"
              className="group flex items-center justify-between rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs hover:border-teal-600/60 hover:shadow-xs transition"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-800 border border-teal-200 text-xl font-bold">
                  💼
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-950 group-hover:text-teal-800 transition-colors">
                    Selling Desk &amp; Margins
                  </h4>
                  <p className="text-xs text-neutral-500">
                    {activeSellingOffers.length} customer sales proposals with PO margin tracking
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-teal-800 group-hover:translate-x-1 transition-transform">
                &rarr;
              </span>
            </Link>
          </div>

          {/* 6. Comprehensive Offers Table View */}
          <section className="space-y-4 pt-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200/90 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-950">
                  Global Offers Operations Registry
                </h3>
                <p className="text-xs text-neutral-500">
                  Filter, inspect, export, and review commercial proposals across all stages
                </p>
              </div>

              {/* View Switcher Tabs */}
              <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100/90 p-0.5 text-xs">
                {[
                  { id: "all", label: "All Offers", count: offers.length },
                  { id: "purchasing", label: "Purchasing", count: purchasingOffers.length },
                  { id: "selling", label: "Selling", count: activeSellingOffers.length },
                  { id: "sold", label: "Sold Deals", count: soldOffers.length },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setDashboardTab(t.id as typeof dashboardTab);
                      setTableFilter("all");
                    }}
                    className={cn(
                      "rounded-md px-3 py-1 font-semibold transition",
                      dashboardTab === t.id
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
              orders={orders}
              role={identity.role}
              mode={dashboardTab === "purchasing" ? "purchasing" : dashboardTab === "selling" ? "selling" : "all"}
              onToggleFavourite={(id) => void toggleOfferFavourite(id)}
              onDelete={(id) => void deleteOffer(id)}
              onEdit={(o) => setEditingOffer(o)}
              onDecide={(o) => setDecideModalOffer(o)}
              onSelectOffer={(o) => setQuickViewOffer(o)}
              onOpenCreate={
                isModerator
                  ? dashboardTab === "selling"
                    ? () => setSellingModalOpen(true)
                    : () => setCreatePurchasingOpen(true)
                  : undefined
              }
              createLabel={dashboardTab === "selling" ? "Submit Selling Offer" : "New Purchasing Offer"}
            />
          </section>
        </div>
      )}

      {/* Slide-Over Quick-View Drawer */}
      <OfferQuickViewDrawer
        offer={quickViewOffer}
        role={identity.role}
        onClose={() => setQuickViewOffer(null)}
        onDecide={(o) => setDecideModalOffer(o)}
        onEdit={(o) => setEditingOffer(o)}
      />

      {/* Creation & Management Modals */}
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

      {editingOffer ? (
        <OfferFormModal
          isOpen={Boolean(editingOffer)}
          onClose={() => setEditingOffer(null)}
          initialKind={editingOffer.kind}
          offerToEdit={editingOffer}
          onSubmit={async (draft) => {
            return editOffer(draft);
          }}
        />
      ) : null}
    </div>
  );
}
