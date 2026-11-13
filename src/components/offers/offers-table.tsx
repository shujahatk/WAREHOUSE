"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { OfferView } from "@/domain/view";
import type { Role } from "@/lib/permissions";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  received: { label: "Received", className: "bg-blue-50 text-blue-700 border-blue-200" },
  under_review: { label: "Under Review", className: "bg-amber-50 text-amber-700 border-amber-300" },
  negotiating: { label: "Negotiating", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  won: { label: "Won", className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  lost: { label: "Lost", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-neutral-100 text-neutral-600" },
  medium: { label: "Medium", className: "bg-sky-50 text-sky-700" },
  high: { label: "High", className: "bg-orange-50 text-orange-700" },
  urgent: { label: "Urgent", className: "bg-rose-50 text-rose-700 font-bold" },
};

export function OffersTable({
  offers,
  role,
  onToggleFavourite,
  onEdit,
  onDelete,
  onDecide,
  onOpenCreate,
  createLabel = "New Offer",
}: {
  offers: OfferView[];
  role: Role;
  onToggleFavourite?: (id: string) => void;
  onEdit?: (offer: OfferView) => void;
  onDelete?: (id: string) => void;
  onDecide?: (offer: OfferView) => void;
  onOpenCreate?: () => void;
  createLabel?: string;
}) {
  const isModerator = role === "moderator";
  const isAdmin = role === "owner";

  // Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [onlyFavourites, setOnlyFavourites] = useState(false);

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Extract unique filter options
  const uniqueCountries = useMemo(() => {
    const set = new Set<string>();
    for (const o of offers) if (o.country) set.add(o.country);
    return Array.from(set).sort();
  }, [offers]);

  const uniqueTeams = useMemo(() => {
    const set = new Set<string>();
    for (const o of offers) if (o.team) set.add(o.team);
    return Array.from(set).sort();
  }, [offers]);

  // Filtering logic
  const filteredOffers = useMemo(() => {
    return offers.filter((o) => {
      if (statusFilter !== "all" && o.statusKey !== statusFilter) return false;
      if (priorityFilter !== "all" && o.priorityKey !== priorityFilter) return false;
      if (countryFilter !== "all" && o.country.toLowerCase() !== countryFilter.toLowerCase()) return false;
      if (teamFilter !== "all" && o.team.toLowerCase() !== teamFilter.toLowerCase()) return false;
      if (onlyFavourites && !o.isFavourite) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matches =
          o.number.toLowerCase().includes(q) ||
          o.material.toLowerCase().includes(q) ||
          o.materialGrade.toLowerCase().includes(q) ||
          o.country.toLowerCase().includes(q) ||
          o.location.toLowerCase().includes(q) ||
          o.team.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [offers, statusFilter, priorityFilter, countryFilter, teamFilter, onlyFavourites, search]);

  // Pagination logic
  const totalItems = filteredOffers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedOffers = filteredOffers.slice(startIndex, startIndex + pageSize);

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCountryFilter("all");
    setTeamFilter("all");
    setOnlyFavourites(false);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Search and Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search offer #, material, country, specs..."
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 placeholder-neutral-400 focus:border-neutral-950 focus:outline-hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2 text-xs text-neutral-400 hover:text-neutral-700"
              >
                &times;
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavourites((v) => !v)}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
              onlyFavourites
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <span className={onlyFavourites ? "text-amber-500" : "text-neutral-400"}>★</span>
            Favourites
          </button>
        </div>

        {isModerator && onOpenCreate ? (
          <button
            type="button"
            onClick={onOpenCreate}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-neutral-950 px-4 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
          >
            <span>+</span> {createLabel}
          </button>
        ) : null}
      </div>

      {/* Filter Chips / Dropdowns */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 text-xs shadow-2xs">
        <span className="font-semibold text-neutral-600">Filters:</span>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="received">Received</option>
          <option value="under_review">Under Review</option>
          <option value="negotiating">Negotiating</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>

        {/* Priority */}
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden"
        >
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>

        {/* Country */}
        <select
          value={countryFilter}
          onChange={(e) => {
            setCountryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden"
        >
          <option value="all">All Countries</option>
          {uniqueCountries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Team */}
        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden"
        >
          <option value="all">All Teams</option>
          {uniqueTeams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {(statusFilter !== "all" || priorityFilter !== "all" || countryFilter !== "all" || teamFilter !== "all" || onlyFavourites || search) && (
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-500 hover:text-neutral-900"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Responsive Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 pl-3 pr-2 w-8 text-center">★</th>
                <th className="py-3 px-3">Offer #</th>
                <th className="py-3 px-3">Material & Grade</th>
                <th className="py-3 px-3">Quantity</th>
                <th className="py-3 px-3">Value</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Team / Type</th>
                <th className="py-3 px-3">Files</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 pl-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {paginatedOffers.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-xs text-neutral-500">
                    No offers match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedOffers.map((offer) => {
                  const statusBadge = STATUS_BADGES[offer.statusKey] ?? {
                    label: offer.status,
                    className: "bg-neutral-100 text-neutral-700",
                  };
                  const priorityBadge = PRIORITY_BADGES[offer.priorityKey] ?? {
                    label: offer.priority,
                    className: "bg-neutral-100 text-neutral-600",
                  };
                  const imgCount = offer.attachments.filter((a) => a.kind === "image").length;
                  const docCount = offer.attachments.filter((a) => a.kind === "document").length;

                  return (
                    <tr key={offer.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 pl-3 pr-2 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleFavourite?.(offer.id)}
                          className={`text-base leading-none transition ${
                            offer.isFavourite ? "text-amber-500" : "text-neutral-300 hover:text-amber-400"
                          }`}
                          title={offer.isFavourite ? "Starred" : "Star"}
                        >
                          ★
                        </button>
                      </td>
                      <td className="py-3 px-3 font-semibold text-neutral-900">
                        <Link href={`/offers/${offer.id}`} className="hover:underline text-neutral-950">
                          {offer.number}
                        </Link>
                        {offer.approvalStatus === "approved" ? (
                          <span className="ml-1.5 inline-block text-[10px] text-emerald-600 font-bold" title="Admin Approved">
                            ✓
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-neutral-900">{offer.material}</p>
                        <p className="text-[10px] text-neutral-500">{offer.materialGrade} &bull; {offer.materialType}</p>
                      </td>
                      <td className="py-3 px-3 font-medium text-neutral-800">
                        {offer.quantity.toLocaleString()} {offer.unit}
                        {offer.truckLoads > 0 ? (
                          <span className="block text-[10px] text-neutral-400">
                            {offer.truckLoads} truckload{offer.truckLoads > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 font-semibold text-neutral-900">
                        {offer.currency} {offer.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="block text-[10px] font-normal text-neutral-500">
                          {offer.currency} {offer.pricePerUnit}/{offer.unit}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-neutral-700">
                        <p className="font-medium">{offer.country}</p>
                        {offer.location ? <p className="text-[10px] text-neutral-400">{offer.location}</p> : null}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${priorityBadge.className}`}>
                          {priorityBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-neutral-600">
                        <p className="font-medium text-neutral-800">{offer.team}</p>
                        <p className="text-[10px] text-neutral-400">{offer.offerType}</p>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-neutral-600 whitespace-nowrap">
                        {imgCount > 0 ? <span className="mr-1.5" title="Images">📷 {imgCount}</span> : null}
                        {docCount > 0 ? <span title="Documents">📄 {docCount}</span> : null}
                        {imgCount === 0 && docCount === 0 ? <span className="text-neutral-400">—</span> : null}
                      </td>
                      <td className="py-3 px-3 text-neutral-500 whitespace-nowrap">
                        {offer.createdAt.slice(0, 10)}
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/offers/${offer.id}`}
                            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
                          >
                            View
                          </Link>

                          {isAdmin && offer.statusKey === "under_review" ? (
                            <button
                              type="button"
                              onClick={() => onDecide?.(offer)}
                              className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
                            >
                              Decide
                            </button>
                          ) : null}

                          {isModerator ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onEdit?.(offer)}
                                className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete offer ${offer.number}?`)) {
                                    onDelete?.(offer.id);
                                  }
                                }}
                                className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row text-xs text-neutral-600">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs focus:outline-hidden"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="text-neutral-400">|</span>
            <span>
              Showing {totalItems === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} offers
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40 hover:bg-neutral-50"
            >
              &larr; Prev
            </button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40 hover:bg-neutral-50"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

