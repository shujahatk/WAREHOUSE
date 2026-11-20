"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { OfferView, DemoOrder } from "@/domain/view";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { exportOffersToCsv } from "./offers-csv";
import { formatMoney } from "@/lib/currency";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  received: { label: "Received", className: "bg-sky-50 text-sky-700 border-sky-200" },
  under_review: { label: "Under Review", className: "bg-amber-50 text-amber-700 border-amber-300" },
  negotiating: { label: "Negotiating", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  won: { label: "Won", className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  lost: { label: "Lost", className: "bg-rose-50 text-rose-700 border-rose-200" },
  accepted: { label: "Accepted (Sold)", className: "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold" },
  sold: { label: "Sold", className: "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold" },
};

type SortKey = "date" | "number" | "material" | "quantity" | "totalValue" | "pricePerUnit" | "status" | "buyer" | "sender";

export function OffersTable({
  offers,
  role,
  orders = [],
  mode = "all",
  onToggleFavourite,
  onEdit,
  onDelete,
  onDecide,
  onOpenCreate,
  onSelectOffer,
  createLabel = "New Offer",
}: {
  offers: OfferView[];
  role: Role;
  orders?: DemoOrder[];
  mode?: "all" | "purchasing" | "selling" | "sold";
  onToggleFavourite?: (id: string) => void;
  onEdit?: (offer: OfferView) => void;
  onDelete?: (id: string) => void;
  onDecide?: (offer: OfferView) => void;
  onOpenCreate?: () => void;
  onSelectOffer?: (offer: OfferView) => void;
  createLabel?: string;
}) {
  const isModerator = role === "moderator";
  const isAdmin = role === "owner";
  const isOffersUser = role === "offers_user";

  // Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [onlyFavourites, setOnlyFavourites] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // PO Lookup Map for margin calculation
  const poMap = useMemo(() => {
    const map = new Map<string, DemoOrder>();
    for (const po of orders) {
      if (po.number) map.set(po.number, po);
    }
    return map;
  }, [orders]);

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
          (o.materialGrade && o.materialGrade.toLowerCase().includes(q)) ||
          o.country.toLowerCase().includes(q) ||
          (o.location && o.location.toLowerCase().includes(q)) ||
          (o.clientName && o.clientName.toLowerCase().includes(q)) ||
          (o.buyerName && o.buyerName.toLowerCase().includes(q)) ||
          (o.createdByName && o.createdByName.toLowerCase().includes(q)) ||
          (o.senderName && o.senderName.toLowerCase().includes(q)) ||
          (o.poNumber && o.poNumber.toLowerCase().includes(q)) ||
          (o.origin && o.origin.toLowerCase().includes(q)) ||
          (o.destination && o.destination.toLowerCase().includes(q)) ||
          o.team.toLowerCase().includes(q) ||
          (o.description && o.description.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [offers, statusFilter, priorityFilter, countryFilter, teamFilter, onlyFavourites, search]);

  // Sorting logic
  const sortedOffers = useMemo(() => {
    const list = [...filteredOffers];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = (a.createdAt || "").localeCompare(b.createdAt || "");
          break;
        case "number":
          cmp = a.number.localeCompare(b.number);
          break;
        case "material":
          cmp = a.material.localeCompare(b.material);
          break;
        case "quantity":
          cmp = (a.quantity || 0) - (b.quantity || 0);
          break;
        case "totalValue":
          cmp = (a.totalValue || 0) - (b.totalValue || 0);
          break;
        case "pricePerUnit":
          cmp = (a.pricePerUnit || 0) - (b.pricePerUnit || 0);
          break;
        case "status":
          cmp = (a.statusKey || "").localeCompare(b.statusKey || "");
          break;
        case "buyer":
          cmp = (a.clientName || a.buyerName || "").localeCompare(b.clientName || b.buyerName || "");
          break;
        case "sender":
          cmp = (a.createdByName || a.senderName || "").localeCompare(b.createdByName || b.senderName || "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [filteredOffers, sortKey, sortAsc]);

  // Pagination logic
  const totalItems = sortedOffers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedOffers = sortedOffers.slice(startIndex, startIndex + pageSize);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function renderSortIcon(key: SortKey) {
    if (sortKey !== key) {
      return <span className="ml-1 text-neutral-300 font-mono text-[9px]">▲▼</span>;
    }
    return <span className="ml-1 text-emerald-800 font-mono text-[9px]">{sortAsc ? "▲" : "▼"}</span>;
  }

  // Selection handlers
  const allCurrentSelected =
    paginatedOffers.length > 0 && paginatedOffers.every((o) => selectedIds.has(o.id));

  function toggleSelectAllCurrent() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allCurrentSelected) {
        for (const o of paginatedOffers) next.delete(o.id);
      } else {
        for (const o of paginatedOffers) next.add(o.id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportSelected() {
    const toExport = offers.filter((o) => selectedIds.has(o.id));
    if (toExport.length === 0) {
      exportOffersToCsv(filteredOffers, `rm-${mode}-offers.csv`);
    } else {
      exportOffersToCsv(toExport, `rm-selected-offers-${toExport.length}.csv`);
    }
  }

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
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg className="h-3.5 w-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                mode === "purchasing"
                  ? "Search by offer #, material, supplier, location..."
                  : mode === "selling"
                    ? "Search by offer #, client, linked PO, route..."
                    : "Search offer #, material, company, country, specs..."
              }
              className="h-9.5 w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-8 text-xs text-neutral-900 placeholder-neutral-400 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/20 focus:outline-hidden transition shadow-2xs"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-xs text-neutral-400 hover:text-neutral-700"
              >
                &times;
              </button>
            ) : null}
          </div>

          {/* Starred filter button */}
          <button
            type="button"
            onClick={() => setOnlyFavourites((v) => !v)}
            className={cn(
              "flex h-9.5 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition shadow-2xs",
              onlyFavourites
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
            )}
          >
            <span className={onlyFavourites ? "text-amber-500" : "text-neutral-400"}>★</span>
            <span className="hidden sm:inline">Favourites</span>
          </button>
        </div>

        {/* Global Action CTAs */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-900 shadow-2xs hover:bg-emerald-100 transition"
            >
              <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Selected ({selectedIds.size})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => exportOffersToCsv(filteredOffers, `rm-${mode}-offers.csv`)}
              className="inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 shadow-2xs hover:bg-neutral-50 hover:text-neutral-950 transition"
              title="Export all matching records to CSV"
            >
              <svg className="h-3.5 w-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}

          {isModerator && onOpenCreate ? (
            <button
              type="button"
              onClick={onOpenCreate}
              className="flex h-9.5 items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              {createLabel}
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter Selector Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200/90 bg-white p-3 text-xs shadow-2xs">
        <span className="font-semibold text-neutral-600 flex items-center gap-1.5 mr-1">
          <svg className="h-3.5 w-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters:
        </span>

        {/* Status Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 focus:border-emerald-700 focus:outline-hidden"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="received">Received</option>
          <option value="under_review">Under Review</option>
          <option value="negotiating">Negotiating</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="accepted">Accepted (Sold)</option>
        </select>

        {/* Priority Dropdown */}
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 focus:border-emerald-700 focus:outline-hidden"
        >
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>

        {/* Country Dropdown */}
        <select
          value={countryFilter}
          onChange={(e) => {
            setCountryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 focus:border-emerald-700 focus:outline-hidden"
        >
          <option value="all">All Countries</option>
          {uniqueCountries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Team Dropdown */}
        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 focus:border-emerald-700 focus:outline-hidden"
        >
          <option value="all">All Teams</option>
          {uniqueTeams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {(statusFilter !== "all" ||
          priorityFilter !== "all" ||
          countryFilter !== "all" ||
          teamFilter !== "all" ||
          onlyFavourites ||
          search) && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50 transition"
            >
              Reset Filters
            </button>
          )}
      </div>

      {/* Main Enterprise Responsive Data Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50/90 text-[11px] font-semibold text-neutral-600 uppercase tracking-wider select-none">
              <tr>
                {/* Select All Checkbox */}
                <th className="py-3 pl-3 pr-2 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={toggleSelectAllCurrent}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                    title="Select all on this page"
                  />
                </th>

                {/* Star Header */}
                <th className="py-3 px-1 w-6 text-center">★</th>

                {/* Offer Number Column */}
                <th
                  className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                  onClick={() => handleSort("number")}
                >
                  <div className="flex items-center">
                    <span>Offer Ref</span>
                    {renderSortIcon("number")}
                  </div>
                </th>

                {/* Selling mode: Linked PO Column */}
                {mode === "selling" ? (
                  <th className="py-3 px-3">Linked PO</th>
                ) : null}

                {/* Material & Grade */}
                <th
                  className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                  onClick={() => handleSort("material")}
                >
                  <div className="flex items-center">
                    <span>Material &amp; Specs</span>
                    {renderSortIcon("material")}
                  </div>
                </th>

                {/* Counterparty: Buyer and Sender separation */}
                {mode === "selling" ? (
                  <>
                    <th
                      className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                      onClick={() => handleSort("buyer")}
                    >
                      <div className="flex items-center">
                        <span>Buyer (Client)</span>
                        {renderSortIcon("buyer")}
                      </div>
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                      onClick={() => handleSort("sender")}
                    >
                      <div className="flex items-center">
                        <span>Sender (Originator)</span>
                        {renderSortIcon("sender")}
                      </div>
                    </th>
                  </>
                ) : (
                  <th className="py-3 px-3">
                    {mode === "purchasing" ? "Supplier / Source" : "Buyer & Sender / Counterparty"}
                  </th>
                )}

                {/* Quantity */}
                <th
                  className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                  onClick={() => handleSort("quantity")}
                >
                  <div className="flex items-center">
                    <span>Volume</span>
                    {renderSortIcon("quantity")}
                  </div>
                </th>

                {/* Price & Total Valuation */}
                <th
                  className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                  onClick={() => handleSort("totalValue")}
                >
                  <div className="flex items-center">
                    <span>Valuation</span>
                    {renderSortIcon("totalValue")}
                  </div>
                </th>

                {/* Selling mode: Margin Indicator */}
                {mode === "selling" ? (
                  <th className="py-3 px-3">Est. Margin</th>
                ) : null}

                {/* Route / Location */}
                <th className="py-3 px-3">
                  {mode === "selling" ? "Logistics Route" : "Origin / Location"}
                </th>

                {/* Status Column */}
                <th
                  className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center">
                    <span>Status</span>
                    {renderSortIcon("status")}
                  </div>
                </th>

                {/* Mode All: Kind badge */}
                {mode === "all" ? (
                  <th className="py-3 px-3">Kind</th>
                ) : null}

                {/* Files / Attachments */}
                <th className="py-3 px-3 text-center">Docs</th>

                {/* Created Date */}
                <th
                  className="py-3 px-3 cursor-pointer hover:text-neutral-950 transition-colors"
                  onClick={() => handleSort("date")}
                >
                  <div className="flex items-center">
                    <span>Date</span>
                    {renderSortIcon("date")}
                  </div>
                </th>

                {/* Actions */}
                <th className="py-3 pl-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-100">
              {paginatedOffers.length === 0 ? (
                <tr>
                  <td colSpan={mode === "selling" ? 15 : mode === "all" ? 13 : 11} className="py-12 text-center text-xs text-neutral-500">
                    No offers match the current filters or search query.
                  </td>
                </tr>
              ) : (
                paginatedOffers.map((offer) => {
                  const statusBadge = STATUS_BADGES[offer.statusKey] ?? {
                    label: offer.status,
                    className: "bg-neutral-100 text-neutral-700",
                  };
                  const isSold =
                    offer.statusKey === "accepted" || offer.statusKey === "sold" || Boolean(offer.soldAt);

                  const imgCount = offer.attachments.filter((a) => a.kind === "image").length;
                  const docCount = offer.attachments.filter((a) => a.kind === "document").length;
                  const isSelected = selectedIds.has(offer.id);

                  // Associated PO record (if linked)
                  const po = offer.poNumber ? poMap.get(offer.poNumber) : undefined;

                  // Margin calculation for selling offers
                  let marginInfo: { text: string; positive: boolean } | null = null;
                  if (mode === "selling" && po) {
                    if (po.quantityKg && po.valueEur) {
                      const poUnitCost = po.valueEur / po.quantityKg;
                      const sellPrice = offer.pricePerUnit;
                      if (sellPrice > 0 && poUnitCost > 0) {
                        const diff = sellPrice - poUnitCost;
                        const pct = ((sellPrice - poUnitCost) / poUnitCost) * 100;
                        marginInfo = {
                          text: `${diff >= 0 ? "+" : ""}${pct.toFixed(1)}% (€${diff.toFixed(2)}/kg)`,
                          positive: diff >= 0,
                        };
                      }
                    }
                  }

                  return (
                    <tr
                      key={offer.id}
                      onClick={() => onSelectOffer?.(offer)}
                      className={cn(
                        "group transition-colors cursor-pointer",
                        isSelected
                          ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                          : "hover:bg-neutral-50/80"
                      )}
                    >
                      {/* Checkbox */}
                      <td
                        className="py-3 pl-3 pr-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(offer.id)}
                          className="h-3.5 w-3.5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>

                      {/* Favourite Star */}
                      <td
                        className="py-3 px-1 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleFavourite?.(offer.id)}
                          className={cn(
                            "text-sm leading-none transition",
                            offer.isFavourite ? "text-amber-500" : "text-neutral-300 hover:text-amber-400"
                          )}
                          title={offer.isFavourite ? "Starred" : "Star"}
                        >
                          ★
                        </button>
                      </td>

                      {/* Offer Number & Approval badge */}
                      <td className="py-3 px-3 font-semibold text-neutral-900 whitespace-nowrap">
                        <Link
                          href={`/offers/${offer.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-xs font-bold text-neutral-950 hover:text-emerald-800 hover:underline"
                        >
                          {offer.number}
                        </Link>
                        {offer.approvalStatus === "approved" ? (
                          <span
                            className="ml-1.5 inline-block text-[10px] text-emerald-600 font-bold"
                            title="Admin Approved"
                          >
                            ✓
                          </span>
                        ) : null}
                      </td>

                      {/* Linked PO (Selling mode) */}
                      {mode === "selling" ? (
                        <td
                          className="py-3 px-3 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {offer.poNumber ? (
                            <Link
                              href={`/purchases/${offer.poNumber}`}
                              className="font-mono text-[11px] font-semibold text-indigo-700 hover:underline"
                            >
                              {offer.poNumber}
                            </Link>
                          ) : (
                            <span className="text-neutral-400 font-mono text-[11px]">—</span>
                          )}
                        </td>
                      ) : null}

                      {/* Material & Grade */}
                      <td className="py-3 px-3">
                        <p className="font-semibold text-neutral-900 truncate max-w-[180px]">
                          {offer.material}
                        </p>
                        <p className="text-[10px] text-neutral-500 truncate max-w-[180px]">
                          {offer.materialGrade || "Standard"} &bull; {offer.materialType || "Standard"}
                        </p>
                      </td>

                      {/* Counterparty: Buyer and Sender separation */}
                      {mode === "selling" ? (
                        <>
                          {/* Buyer (Client) Column */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center rounded-xs bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 uppercase tracking-wider">
                                Buyer
                              </span>
                              <p className="font-semibold text-neutral-900 truncate max-w-[130px]" title={offer.clientName || "Direct Client"}>
                                {offer.clientName || "Direct Client"}
                              </p>
                            </div>
                            <div className="mt-0.5 flex flex-col text-[10px] text-neutral-500">
                              {offer.contactNumber ? (
                                <span className="truncate">{offer.contactNumber}</span>
                              ) : null}
                              {offer.destination ? (
                                <span className="text-neutral-400 truncate">🏁 {offer.destination}</span>
                              ) : null}
                            </div>
                          </td>

                          {/* Sender (Originator / Source) Column */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center rounded-xs bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 uppercase tracking-wider">
                                Sender
                              </span>
                              <p className="font-semibold text-neutral-900 truncate max-w-[130px]" title={offer.createdByName || "Trader"}>
                                {offer.createdByName || "Trader"}
                              </p>
                            </div>
                            <div className="mt-0.5 flex flex-col text-[10px] text-neutral-500">
                              {po ? (
                                <span className="text-neutral-600 font-medium truncate" title={`Sourced via ${po.supplier}`}>
                                  From: {po.supplier}
                                </span>
                              ) : null}
                              {offer.origin ? (
                                <span className="text-neutral-400 truncate">📍 {offer.origin}</span>
                              ) : null}
                            </div>
                          </td>
                        </>
                      ) : mode === "all" ? (
                        <td className="py-3 px-3">
                          {offer.kind === "selling" ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-[11px]">
                                <span className="font-bold text-indigo-700 text-[10px]">Buyer:</span>
                                <span className="font-medium text-neutral-900 truncate max-w-[130px]">{offer.clientName || "—"}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px]">
                                <span className="font-bold text-emerald-700 text-[10px]">Sender:</span>
                                <span className="text-neutral-600 truncate max-w-[130px]">{offer.createdByName || "—"}</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="font-medium text-neutral-800 truncate max-w-[140px]">
                                {offer.createdByName || offer.clientName || "Supplier"}
                              </p>
                              {offer.contactNumber ? (
                                <p className="text-[10px] text-neutral-400 truncate">{offer.contactNumber}</p>
                              ) : null}
                            </div>
                          )}
                        </td>
                      ) : (
                        /* mode === "purchasing" */
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center rounded-xs bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-800 uppercase tracking-wider">
                              Supplier
                            </span>
                            <p className="font-semibold text-neutral-900 truncate max-w-[140px]">
                              {offer.createdByName || offer.clientName || "—"}
                            </p>
                          </div>
                          {offer.contactNumber ? (
                            <p className="text-[10px] text-neutral-400 truncate">{offer.contactNumber}</p>
                          ) : null}
                        </td>
                      )}

                      {/* Volume & Truckloads */}
                      <td className="py-3 px-3 whitespace-nowrap font-medium text-neutral-800">
                        {offer.quantity.toLocaleString()} {offer.unit}
                        {offer.truckLoads > 0 ? (
                          <span className="block text-[10px] text-neutral-400">
                            {offer.truckLoads} truckload{offer.truckLoads > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </td>

                      {/* Valuation */}
                      <td className="py-3 px-3 whitespace-nowrap font-semibold text-neutral-900">
                        <span className="font-mono">
                          {formatMoney(offer.totalValue, offer.currency)}
                        </span>
                        <span className="block text-[10px] font-normal text-neutral-500 font-mono">
                          {formatMoney(offer.pricePerUnit, offer.currency, { showCode: false })}/{offer.unit}
                        </span>
                      </td>

                      {/* Selling Margin Indicator */}
                      {mode === "selling" ? (
                        <td className="py-3 px-3 whitespace-nowrap">
                          {marginInfo ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold",
                                marginInfo.positive
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : "bg-rose-50 text-rose-800 border border-rose-200"
                              )}
                            >
                              {marginInfo.text}
                            </span>
                          ) : (
                            <span className="text-[10px] text-neutral-400 font-mono">—</span>
                          )}
                        </td>
                      ) : null}

                      {/* Route / Location */}
                      <td className="py-3 px-3 text-neutral-700">
                        {mode === "selling" ? (
                          <div className="text-[11px] max-w-[160px] truncate">
                            <span className="font-medium">{offer.origin || offer.country}</span>
                            <span className="text-neutral-400 mx-1">&rarr;</span>
                            <span className="font-medium">{offer.destination || "Delivered"}</span>
                          </div>
                        ) : (
                          <div>
                            <p className="font-medium">{offer.country}</p>
                            {offer.location ? (
                              <p className="text-[10px] text-neutral-400 truncate max-w-[120px]">
                                {offer.location}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                            statusBadge.className
                          )}
                        >
                          {statusBadge.label}
                        </span>
                        {isSold ? (
                          <span className="ml-1 inline-flex items-center rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-2xs">
                            SOLD
                          </span>
                        ) : null}
                      </td>

                      {/* Kind (for unified table) */}
                      {mode === "all" ? (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                              offer.kind === "purchasing"
                                ? "bg-sky-50 text-sky-800 border border-sky-200"
                                : "bg-teal-50 text-teal-800 border border-teal-200"
                            )}
                          >
                            {offer.kind === "purchasing" ? "Buy" : "Sell"}
                          </span>
                        </td>
                      ) : null}

                      {/* Docs */}
                      <td className="py-3 px-3 text-[11px] text-center text-neutral-600 whitespace-nowrap">
                        {imgCount > 0 || docCount > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">
                            {imgCount > 0 ? `📷${imgCount}` : ""}
                            {docCount > 0 ? `📄${docCount}` : ""}
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 text-neutral-500 whitespace-nowrap font-mono text-[11px]">
                        {offer.createdAt ? offer.createdAt.slice(0, 10) : "—"}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectOffer?.(offer)}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 transition shadow-2xs"
                            title="Quick View"
                          >
                            Quick View
                          </button>

                          <Link
                            href={`/offers/${offer.id}`}
                            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 transition shadow-2xs"
                            title="Full Dossier"
                          >
                            Dossier
                          </Link>

                          {isOffersUser && offer.kind === "purchasing" ? (
                            <Link
                              href={`/offers/${offer.id}`}
                              className="rounded-md bg-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 shadow-2xs transition"
                              title="Propose Selling Offer for this Purchase Order"
                            >
                              Propose
                            </Link>
                          ) : null}

                          {isAdmin && offer.statusKey === "under_review" && onDecide ? (
                            <button
                              type="button"
                              onClick={() => onDecide(offer)}
                              className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 shadow-2xs transition"
                            >
                              Decide
                            </button>
                          ) : null}

                          {isModerator ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onEdit?.(offer)}
                                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 transition shadow-2xs"
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
                                className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition"
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
              Showing {totalItems === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} records
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40 hover:bg-neutral-50 transition"
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
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40 hover:bg-neutral-50 transition"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
