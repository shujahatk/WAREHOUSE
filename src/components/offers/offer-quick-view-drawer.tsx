"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { OfferView } from "@/domain/view";
import type { Role } from "@/lib/permissions";
import { cn } from "@/lib/cn";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  received: { label: "Received", className: "bg-blue-50 text-blue-700 border-blue-200" },
  under_review: { label: "Under Review", className: "bg-amber-50 text-amber-700 border-amber-300" },
  negotiating: { label: "Negotiating", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  won: { label: "Won", className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  lost: { label: "Lost", className: "bg-rose-50 text-rose-700 border-rose-200" },
  accepted: { label: "Accepted (Sold)", className: "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold" },
  sold: { label: "Sold", className: "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold" },
};

export function OfferQuickViewDrawer({
  offer,
  role,
  onClose,
  onDecide,
  onEdit,
}: {
  offer: OfferView | null;
  role: Role;
  onClose: () => void;
  onDecide?: (offer: OfferView) => void;
  onEdit?: (offer: OfferView) => void;
}) {
  const isAdmin = role === "owner";
  const isModerator = role === "moderator";

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (offer) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [offer, onClose]);

  if (!offer) return null;

  const statusBadge = STATUS_BADGES[offer.statusKey] ?? {
    label: offer.status,
    className: "bg-neutral-100 text-neutral-700 border-neutral-200",
  };

  const isSold = offer.statusKey === "accepted" || offer.statusKey === "sold" || Boolean(offer.soldAt);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-950/40 backdrop-blur-2xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-base font-bold text-neutral-950">
              {offer.number}
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-semibold",
                offer.kind === "purchasing"
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-teal-200 bg-teal-50 text-teal-800"
              )}
            >
              {offer.kind === "purchasing" ? "Purchasing" : "Selling"}
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-semibold",
                statusBadge.className
              )}
            >
              {statusBadge.label}
            </span>
            {isSold ? (
              <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                SOLD
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-xs text-neutral-700">
          {/* Key Financial Strip */}
          <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/70 p-4">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Commercial Valuation
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black text-emerald-800 font-mono">
                  €{offer.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="ml-1.5 text-xs font-semibold text-neutral-500">
                  {offer.currency}
                </span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-neutral-900">
                  €{offer.pricePerUnit} / {offer.unit}
                </span>
                <span className="block text-[10px] text-neutral-500">
                  {offer.truckLoads} truckload{offer.truckLoads > 1 ? "s" : ""}
                </span>
              </div>
            </div>
            {offer.poNumber ? (
              <div className="mt-3 border-t border-neutral-200/70 pt-2 flex items-center justify-between text-xs">
                <span className="text-neutral-500">Associated PO:</span>
                <Link
                  href={`/purchases/${offer.poNumber}`}
                  className="font-mono font-bold text-indigo-700 hover:underline"
                >
                  {offer.poNumber} &rarr;
                </Link>
              </div>
            ) : null}
          </div>

          {/* Material Specs */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-neutral-950 uppercase tracking-wide">
              Material Specifications
            </h4>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-3 bg-white">
              <div>
                <span className="text-neutral-400">Material</span>
                <p className="font-semibold text-neutral-900">{offer.material}</p>
              </div>
              <div>
                <span className="text-neutral-400">Grade / Type</span>
                <p className="font-semibold text-neutral-900">
                  {offer.materialGrade || "Standard"} &bull; {offer.materialType || "Standard"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Quantity</span>
                <p className="font-semibold text-neutral-900">
                  {offer.quantity.toLocaleString()} {offer.unit}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Packaging</span>
                <p className="font-semibold text-neutral-900">{offer.packagingType || "Standard"}</p>
              </div>
            </div>
            {offer.description ? (
              <p className="text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200/60 leading-relaxed">
                {offer.description}
              </p>
            ) : null}
          </div>

          {/* Counterparty & Contact */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-neutral-950 uppercase tracking-wide">
              Commercial Counterparty
            </h4>
            <div className="rounded-lg border border-neutral-200 p-3 bg-white space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-400">Company / Client:</span>
                <span className="font-semibold text-neutral-900">{offer.clientName || "Not specified"}</span>
              </div>
              {offer.contactNumber ? (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Phone:</span>
                  <a href={`tel:${offer.contactNumber}`} className="font-semibold text-emerald-800 hover:underline">
                    {offer.contactNumber}
                  </a>
                </div>
              ) : null}
              {offer.emailAddress ? (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Email:</span>
                  <a href={`mailto:${offer.emailAddress}`} className="font-semibold text-emerald-800 hover:underline">
                    {offer.emailAddress}
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          {/* Logistics Route */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-neutral-950 uppercase tracking-wide">
              Logistics &amp; Route
            </h4>
            <div className="rounded-lg border border-neutral-200 p-3 bg-white space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Origin:</span>
                <span className="font-semibold text-neutral-900">
                  📍 {offer.origin || offer.location || offer.country || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Destination:</span>
                <span className="font-semibold text-neutral-900">
                  🏁 {offer.destination || "Direct Delivery"}
                </span>
              </div>
            </div>
          </div>

          {/* Attachments Preview */}
          {offer.attachments && offer.attachments.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-neutral-950 uppercase tracking-wide">
                Evidence &amp; Photos ({offer.attachments.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {offer.attachments.slice(0, 4).map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2 truncate"
                  >
                    <span>{att.kind === "image" ? "🖼️" : "📄"}</span>
                    <span className="truncate text-neutral-800 font-medium">{att.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Admin Decision note if present */}
          {offer.adminDecisionNote ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
              <span className="font-bold">Admin Decision Note ({offer.approvalLabel}):</span>
              <p className="mt-1 whitespace-pre-wrap">{offer.adminDecisionNote}</p>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 flex items-center justify-between gap-3">
          <Link
            href={`/offers/${offer.id}`}
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-800 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            Open Full Dossier &rarr;
          </Link>

          <div className="flex items-center gap-2">
            {isAdmin && offer.statusKey === "under_review" && onDecide ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDecide(offer);
                }}
                className="h-9 rounded-lg bg-amber-600 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 transition"
              >
                Decide
              </button>
            ) : null}

            {isModerator && onEdit ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(offer);
                }}
                className="h-9 rounded-lg border border-neutral-300 bg-white px-3.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition shadow-2xs"
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

