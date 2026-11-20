"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import type { OfferView } from "@/domain/view";
import type { Role } from "@/lib/permissions";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";
import { OfferFormModal } from "./offer-form-modal";
import { OfferStatusModal } from "./offer-status-modal";
import { SellingOfferModal } from "./selling-offer-modal";
import { cn } from "@/lib/cn";
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

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-neutral-100 text-neutral-600" },
  medium: { label: "Medium", className: "bg-sky-50 text-sky-700" },
  high: { label: "High", className: "bg-orange-50 text-orange-700" },
  urgent: { label: "Urgent", className: "bg-rose-50 text-rose-700 font-bold" },
};

export function OfferDetailsView({
  offer,
  role,
  onToggleFavourite,
  onSubmitForReview,
  onDecide,
  onAcceptOffer,
  onUpdateStatus,
  onEditOffer,
  onDeleteOffer,
  onAddComment,
  onAddAttachment,
  onDeleteAttachment,
  onSubmitSellingOffer,
}: {
  offer: OfferView;
  role: Role;
  onToggleFavourite?: (id: string) => Promise<string | undefined>;
  onSubmitForReview?: (id: string) => Promise<string | undefined>;
  onDecide?: (decision: "approved" | "rejected", note: string) => Promise<string | undefined>;
  onAcceptOffer?: (offerNumber: string) => Promise<string | undefined>;
  onUpdateStatus?: (status: string) => Promise<string | undefined>;
  onEditOffer?: (draft: Record<string, unknown>) => Promise<string | undefined>;
  onDeleteOffer?: (id: string) => Promise<string | undefined>;
  onAddComment?: (comment: string) => Promise<string | undefined>;
  onAddAttachment?: (att: { name: string; mime?: string; bytesBase64?: string; kind?: "image" | "document" }) => Promise<string | undefined>;
  onDeleteAttachment?: (attachmentId: string) => Promise<string | undefined>;
  onSubmitSellingOffer?: (draft: {
    poNumber: string;
    purchasingOfferId?: string;
    materialType: string;
    materialName: string;
    clientName: string;
    contactNumber: string;
    emailAddress: string;
    price: number;
    origin: string;
    destination: string;
    description?: string;
  }) => Promise<string | undefined>;
}) {
  const isModerator = role === "moderator";
  const isAdmin = role === "owner";
  const isOffersUser = role === "offers_user";

  const [previewItem, setPreviewItem] = useState<PreviewAttachmentItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [sellingModalOpen, setSellingModalOpen] = useState(false);

  // Admin Decision Inline State
  const [showDecisionInput, setShowDecisionInput] = useState(false);
  const [decisionType, setDecisionType] = useState<"approved" | "rejected">("approved");
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Commercial Acceptance State
  const [acceptingSubmitting, setAcceptingSubmitting] = useState(false);

  // Comments State
  const [newComment, setNewComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Attachments State
  const [uploading, setUploading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const statusBadge = STATUS_BADGES[offer.statusKey] ?? {
    label: offer.status,
    className: "bg-neutral-100 text-neutral-700",
  };
  const priorityBadge = PRIORITY_BADGES[offer.priorityKey] ?? {
    label: offer.priority,
    className: "bg-neutral-100 text-neutral-600",
  };

  const isSold = offer.statusKey === "accepted" || offer.statusKey === "sold" || Boolean(offer.soldAt);

  // Pipeline stage calculation
  const currentPipelineStage = useMemo(() => {
    if (isSold || offer.statusKey === "won") return 4;
    if (offer.statusKey === "negotiating") return 3;
    if (offer.statusKey === "under_review" || offer.approvalStatus === "approved") return 2;
    return 1;
  }, [offer, isSold]);

  async function handleAdminDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!decisionNote.trim()) {
      setDecisionError("A decision note is required.");
      return;
    }
    setDecisionSubmitting(true);
    setDecisionError(null);
    try {
      const err = await onDecide?.(decisionType, decisionNote.trim());
      if (err) {
        setDecisionError(err);
      } else {
        setShowDecisionInput(false);
        setDecisionNote("");
        setActionNotice(`Offer recorded as ${decisionType}.`);
      }
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Failed to record decision.");
    } finally {
      setDecisionSubmitting(false);
    }
  }

  async function handleCommercialAccept() {
    if (!confirm(`Mark offer ${offer.number} as commercially accepted? It will automatically move to the Sold section.`)) {
      return;
    }
    setAcceptingSubmitting(true);
    setActionError(null);
    try {
      const err = await onAcceptOffer?.(offer.number);
      if (err) setActionError(err);
      else setActionNotice("Offer accepted and automatically moved to the Sold section.");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Failed to accept offer.");
    } finally {
      setAcceptingSubmitting(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const err = await onAddComment?.(newComment.trim());
      if (err) setCommentError(err);
      else setNewComment("");
    } catch (caught) {
      setCommentError(caught instanceof Error ? caught.message : "Failed to add comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, fileKind: "image" | "document") {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setActionError(null);
    setActionNotice(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const optimized = await compressImageIfNeeded(file);
        const base64 = await fileToBase64(optimized.blob);
        const err = await onAddAttachment?.({
          name: optimized.name,
          mime: optimized.mime || (fileKind === "image" ? "image/jpeg" : "application/pdf"),
          bytesBase64: base64,
          kind: fileKind,
        });
        if (err) {
          setActionError(err);
        } else {
          setActionNotice(`Uploaded ${optimized.name}.`);
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col gap-4 border-b border-neutral-200/90 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
            <Link href="/offers" className="hover:text-neutral-900 transition">
              Offers Portal
            </Link>
            <span>/</span>
            <Link
              href={offer.kind === "purchasing" ? "/offers/purchasing" : "/offers/selling"}
              className="capitalize hover:text-neutral-900 transition"
            >
              {offer.kind} Offers
            </Link>
            <span>/</span>
            <span className="font-mono font-semibold text-emerald-800">{offer.number}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl font-mono">
              {offer.number}
            </h1>

            <span
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-semibold uppercase",
                offer.kind === "purchasing"
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-teal-200 bg-teal-50 text-teal-800"
              )}
            >
              {offer.kindLabel}
            </span>

            <span className={cn("rounded-md border px-2.5 py-1 text-xs font-semibold", statusBadge.className)}>
              {statusBadge.label}
            </span>

            <span className={cn("rounded-md px-2.5 py-1 text-xs font-medium", priorityBadge.className)}>
              {priorityBadge.label} Priority
            </span>

            {offer.approvalStatus === "approved" ? (
              <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                ✓ Admin Approved
              </span>
            ) : offer.approvalStatus === "rejected" ? (
              <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                ✕ Admin Rejected
              </span>
            ) : (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                ● Pending Admin Approval
              </span>
            )}

            {isSold ? (
              <span className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                ★ Commercially Accepted (SOLD)
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-xs text-neutral-500">
            Registered by <strong className="text-neutral-800">{offer.createdByName}</strong> on {offer.createdAt.slice(0, 10)}
            {offer.soldAt ? ` · Sold on ${offer.soldAt.slice(0, 10)}` : ""}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Offers User Propose Selling Offer Button */}
          {isOffersUser && offer.kind === "purchasing" ? (
            <button
              type="button"
              onClick={() => setSellingModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Propose Selling Offer for this PO
            </button>
          ) : null}

          {/* Offers User Locked Status on submitted Selling Offer */}
          {isOffersUser && offer.kind === "selling" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">
              🔒 Locked (Submitted Proposal)
            </span>
          ) : null}

          {/* Favourite star */}
          {!isOffersUser ? (
            <button
              type="button"
              onClick={() => void onToggleFavourite?.(offer.id)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition shadow-2xs",
                offer.isFavourite
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <span className={offer.isFavourite ? "text-amber-500" : "text-neutral-300"}>★</span>
              {offer.isFavourite ? "Starred" : "Star"}
            </button>
          ) : null}

          {/* Admin Approve / Reject trigger */}
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setShowDecisionInput(true);
                setDecisionType("approved");
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              Review / Decide Offer
            </button>
          ) : null}

          {/* Commercial Acceptance -> Move to Sold (Admin or Moderator when approved) */}
          {(isAdmin || isModerator) && offer.approvalStatus === "approved" && !isSold ? (
            <button
              type="button"
              disabled={acceptingSubmitting}
              onClick={handleCommercialAccept}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {acceptingSubmitting ? "Processing…" : "Accept Offer (Mark Sold)"}
            </button>
          ) : null}

          {/* Moderator status updates */}
          {isModerator ? (
            <>
              {offer.statusKey === "draft" || offer.statusKey === "received" ? (
                <button
                  type="button"
                  onClick={async () => {
                    const err = await onSubmitForReview?.(offer.id);
                    if (err) setActionError(err);
                    else setActionNotice("Submitted offer for Admin review.");
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition"
                >
                  Submit for Admin Review
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setStatusModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition"
              >
                Update Status
              </button>
              <button
                type="button"
                onClick={() => setEditModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm(`Delete offer ${offer.number}?`)) {
                    await onDeleteOffer?.(offer.id);
                  }
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {actionNotice ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 shadow-2xs">
          <span>{actionNotice}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="font-bold">
            &times;
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 shadow-2xs">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold">
            &times;
          </button>
        </div>
      ) : null}

      {/* Offers User Locked Banner */}
      {isOffersUser && offer.kind === "selling" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 flex items-start gap-3 shadow-2xs">
          <span className="text-lg">🔒</span>
          <div>
            <h4 className="font-bold text-amber-900">Submitted Selling Proposal (Locked)</h4>
            <p className="mt-0.5 text-amber-800/90 leading-relaxed">
              This selling proposal is currently locked under administrative review. Once submitted, proposals cannot be edited or withdrawn. You can track real-time appraisal decisions, pricing clearance, and commercial acceptance here.
            </p>
          </div>
        </div>
      ) : null}

      {/* 2. Visual Deal Progress Tracker Pipeline */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-4">
          Commercial Deal Lifecycle Stage
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { step: 1, title: "1. Submission", desc: "Registered & Draft" },
            { step: 2, title: "2. Admin Appraisal", desc: "Verification & Review" },
            { step: 3, title: "3. Trade Negotiation", desc: "Terms & Margins" },
            { step: 4, title: "4. Final Execution", desc: "Accepted (Sold Deal)" },
          ].map((s) => {
            const isPassed = currentPipelineStage > s.step;
            const isCurrent = currentPipelineStage === s.step;
            return (
              <div
                key={s.step}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  isCurrent
                    ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600/30"
                    : isPassed
                      ? "border-neutral-200 bg-neutral-50/70"
                      : "border-neutral-200/60 bg-white opacity-60"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-bold",
                      isCurrent
                        ? "text-emerald-900"
                        : isPassed
                          ? "text-neutral-900"
                          : "text-neutral-400"
                    )}
                  >
                    {s.title}
                  </span>
                  {isPassed ? (
                    <span className="text-emerald-600 text-xs font-bold">✓</span>
                  ) : isCurrent ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Decision Inline Panel */}
      {showDecisionInput && isAdmin ? (
        <form
          onSubmit={handleAdminDecision}
          className="rounded-xl border border-amber-300 bg-amber-50/70 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-amber-200 pb-2">
            <h3 className="text-sm font-semibold text-neutral-900">Admin Offer Decision &amp; Pricing Clearance</h3>
            <button
              type="button"
              onClick={() => setShowDecisionInput(false)}
              className="text-xs text-neutral-500 hover:text-neutral-800"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  checked={decisionType === "approved"}
                  onChange={() => setDecisionType("approved")}
                />
                Approve Offer
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  checked={decisionType === "rejected"}
                  onChange={() => setDecisionType("rejected")}
                />
                Reject Offer
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">
                Decision Note (Required)
                <textarea
                  rows={2}
                  required
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Enter notes, pricing approval comments, or rejection explanation..."
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-emerald-700 focus:outline-hidden"
                />
              </label>
            </div>
            {decisionError ? <p className="text-xs text-rose-700">{decisionError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={decisionSubmitting}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50",
                  decisionType === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                {decisionSubmitting ? "Submitting…" : `Confirm ${decisionType === "approved" ? "Approval" : "Rejection"}`}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Admin Decision History Note if present */}
      {offer.adminDecisionNote ? (
        <div className="rounded-xl border border-neutral-200/90 bg-white p-4.5 shadow-2xs">
          <p className="text-xs font-bold text-neutral-900">
            Admin Decision &bull; {offer.approvalLabel}
          </p>
          <p className="mt-1.5 text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">{offer.adminDecisionNote}</p>
          <p className="mt-2 text-[11px] text-neutral-400">
            Decided by {offer.decidedByName || "Admin"} on {offer.decidedAt?.slice(0, 10)}
          </p>
        </div>
      ) : null}

      {/* 3. COMPLETE DOSSIER CARDS (2/3 + 1/3 Grid) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2/3 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Linked PO Banner */}
          {offer.poNumber ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold tracking-wider text-indigo-700 uppercase">
                    Associated Purchase Order
                  </span>
                  <p className="mt-1 text-sm font-bold text-neutral-950 font-mono">
                    Linked to PO: {offer.poNumber}
                  </p>
                </div>
                {!isOffersUser ? (
                  <Link
                    href={`/purchases/${offer.poNumber}`}
                    className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition shadow-2xs"
                  >
                    View Purchase Order &rarr;
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Material Specifications Card */}
          <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Material &amp; Quantity Specifications
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-neutral-500">Material Name</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">{offer.material}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Material Type</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">{offer.materialType || "Standard"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Grade</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">{offer.materialGrade || "Standard"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Quantity</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900 font-mono">
                  {offer.quantity.toLocaleString()} {offer.unit}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Truck Loads</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900 font-mono">{offer.truckLoads} loads</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Packaging Type</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">{offer.packagingType || "Standard"}</dd>
              </div>
            </dl>
            {offer.description ? (
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <span className="text-xs text-neutral-500">Description &amp; Technical Details</span>
                <p className="mt-1 text-xs text-neutral-800 leading-relaxed whitespace-pre-wrap">
                  {offer.description}
                </p>
              </div>
            ) : null}
          </div>

          {/* Commercial Counterparties: Separated Buyer and Sender for Selling Offers */}
          {offer.kind === "selling" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Buyer Card */}
              <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-xs bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                      Buyer
                    </span>
                    <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide">
                      Purchasing Client (Buyer)
                    </h2>
                  </div>
                </div>
                <dl className="mt-3 space-y-3 text-xs">
                  <div>
                    <dt className="text-neutral-500">Client / Company Name</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-neutral-900">
                      {offer.clientName || "Not specified"}
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-neutral-500">Contact Number</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-neutral-900">
                        {offer.contactNumber ? (
                          <a href={`tel:${offer.contactNumber}`} className="text-indigo-700 hover:underline">
                            {offer.contactNumber}
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Email Address</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-neutral-900">
                        {offer.emailAddress ? (
                          <a href={`mailto:${offer.emailAddress}`} className="text-indigo-700 hover:underline">
                            {offer.emailAddress}
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Delivery Destination</dt>
                    <dd className="mt-0.5 text-xs font-medium text-neutral-900">
                      🏁 {offer.destination || "Direct Delivery"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Sender Card */}
              <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-xs bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                      Sender
                    </span>
                    <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide">
                      Originator &amp; Source (Sender)
                    </h2>
                  </div>
                </div>
                <dl className="mt-3 space-y-3 text-xs">
                  <div>
                    <dt className="text-neutral-500">Submitted By (Sender)</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-neutral-900">
                      {offer.createdByName || "Trading Desk"}
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-neutral-500">Sourced PO</dt>
                      <dd className="mt-0.5 font-mono text-xs font-semibold text-emerald-800">
                        {offer.poNumber || "Direct Stock"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Submitted Date</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-neutral-900">
                        {offer.createdAt?.slice(0, 10) || "—"}
                      </dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Origin / Loading Location</dt>
                    <dd className="mt-0.5 text-xs font-medium text-neutral-900">
                      📍 {offer.origin || offer.location || offer.country || "Not specified"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            /* Standard Purchasing Counterparty */
            <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
              <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
                Commercial Counterparty &amp; Contacts
              </h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-neutral-500">Supplier / Source Name</dt>
                  <dd className="mt-1 text-sm font-semibold text-neutral-900">
                    {offer.clientName || offer.createdByName || "Not specified"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Contact Number</dt>
                  <dd className="mt-1 text-sm font-semibold text-neutral-900">
                    {offer.contactNumber ? (
                      <a href={`tel:${offer.contactNumber}`} className="text-emerald-800 hover:underline">
                        {offer.contactNumber}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Email Address</dt>
                  <dd className="mt-1 text-sm font-semibold text-neutral-900">
                    {offer.emailAddress ? (
                      <a href={`mailto:${offer.emailAddress}`} className="text-emerald-800 hover:underline">
                        {offer.emailAddress}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Logistics & Routing */}
          <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Logistics &amp; Routing
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg bg-neutral-50 p-3 border border-neutral-100">
                <dt className="text-neutral-500">Origin / Loading Location</dt>
                <dd className="mt-1 text-sm font-bold text-neutral-900">
                  📍 {offer.origin || offer.location || offer.country || "Not specified"}
                </dd>
              </div>
              <div className="rounded-lg bg-neutral-50 p-3 border border-neutral-100">
                <dt className="text-neutral-500">Destination / Delivery Location</dt>
                <dd className="mt-1 text-sm font-bold text-neutral-900">
                  🏁 {offer.destination || offer.country || "Not specified"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Attached Photos & Documents (with Preview) */}
          <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide">
                Attached Evidence &amp; Photos ({offer.attachments.length})
              </h2>
              {/* Upload trigger */}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition">
                  <span>+ Add Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFileUpload(e, "image")}
                  />
                </label>
                <label className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-2xs transition">
                  <span>+ Add Document</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFileUpload(e, "document")}
                  />
                </label>
              </div>
            </div>

            {uploading ? (
              <p className="mt-3 text-xs text-neutral-500">Uploading attachment…</p>
            ) : null}

            {offer.attachments.length === 0 ? (
              <p className="mt-4 text-xs text-neutral-500 text-center py-4">
                No photos or documents attached to this offer yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {offer.attachments.map((att) => {
                  const isImg = att.kind === "image" || att.mime?.startsWith("image/");
                  return (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0">{isImg ? "🖼️" : "📄"}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-900 truncate">{att.name}</p>
                          <p className="text-[10px] text-neutral-500 font-mono">
                            {Math.round((att.byteSize || 0) / 1024)} KB &bull; {att.createdAt.slice(0, 10)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewItem({
                              id: att.id,
                              name: att.name,
                              mime: att.mime || (isImg ? "image/jpeg" : "application/pdf"),
                              byteSize: att.byteSize || 0,
                              url: att.url,
                              uploadedByName: att.uploadedByName || "User",
                              uploadedAt: att.createdAt,
                              category: isImg ? "Photo" : "Document",
                            })
                          }
                          className="rounded bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 border border-neutral-300 hover:bg-neutral-50 shadow-2xs transition"
                        >
                          Preview
                        </button>
                        {isModerator ? (
                          <button
                            type="button"
                            onClick={() => void onDeleteAttachment?.(att.id)}
                            className="text-neutral-400 hover:text-rose-600 p-1 transition"
                            title="Delete attachment"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3 width) */}
        <div className="space-y-6">
          {/* Commercial Pricing Card */}
          <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Commercial Valuation
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <span className="text-xs text-neutral-500">Unit Price</span>
                <p className="text-xl font-bold text-neutral-950 font-mono">
                  {formatMoney(offer.pricePerUnit, offer.currency, { showCode: false })} / {offer.unit}
                </p>
              </div>
              <div className="border-t border-neutral-100 pt-3">
                <span className="text-xs text-neutral-500">Total Sourced Value</span>
                <p className="text-2xl font-black text-emerald-800 font-mono">
                  {formatMoney(offer.totalValue, offer.currency)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-xs">
                <div>
                  <span className="text-neutral-500">Offer Type:</span>
                  <p className="font-semibold text-neutral-900">{offer.offerType}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Trading Desk:</span>
                  <p className="font-semibold text-neutral-900">{offer.team}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Submitter & Audit Info */}
          <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Audit Trail &amp; Submitter
            </h2>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div>
                <dt className="text-neutral-500">Submitter</dt>
                <dd className="font-semibold text-neutral-900">{offer.createdByName}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Date Created</dt>
                <dd className="font-mono text-neutral-800">{offer.createdAt.slice(0, 16).replace("T", " ")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Last Updated</dt>
                <dd className="font-mono text-neutral-800">{offer.updatedAt.slice(0, 16).replace("T", " ")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Approval State</dt>
                <dd className="font-semibold capitalize text-neutral-900">{offer.approvalStatus}</dd>
              </div>
            </dl>
          </div>

          {/* Discussion & Comments */}
          <div className="rounded-xl border border-neutral-200/90 bg-white p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Discussion &amp; Notes ({offer.comments.length})
            </h2>

            <div className="mt-3 space-y-2.5 max-h-60 overflow-y-auto">
              {offer.comments.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No notes yet.</p>
              ) : (
                offer.comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-neutral-50 p-2.5 text-xs border border-neutral-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900">{c.authorName}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">{c.createdAt.slice(0, 10)}</span>
                    </div>
                    <p className="mt-1 text-neutral-700 whitespace-pre-wrap">{c.comment}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddComment} className="mt-3 border-t border-neutral-100 pt-3">
              <textarea
                rows={2}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add an internal note or discussion update..."
                className="w-full rounded-lg border border-neutral-300 p-2 text-xs text-neutral-900 focus:border-emerald-700 focus:outline-hidden"
              />
              {commentError ? <p className="text-xs text-rose-600 mt-1">{commentError}</p> : null}
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={commentSubmitting || !newComment.trim()}
                  className="rounded-lg bg-emerald-800 px-3.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {commentSubmitting ? "Posting…" : "Add Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      {editModalOpen ? (
        <OfferFormModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          initialKind={offer.kind}
          offerToEdit={offer}
          onSubmit={async (draft) => {
            return onEditOffer?.(draft);
          }}
        />
      ) : null}
      {statusModalOpen ? (
        <OfferStatusModal
          isOpen={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          offer={offer}
          onUpdateStatus={async (s) => {
            return onUpdateStatus?.(s);
          }}
        />
      ) : null}
      {sellingModalOpen ? (
        <SellingOfferModal
          isOpen={sellingModalOpen}
          onClose={() => setSellingModalOpen(false)}
          initialPoNumber={offer.poNumber || offer.number}
          initialPurchasingOfferId={offer.id}
          initialMaterialType={offer.materialType}
          initialMaterialName={offer.material}
          initialOrigin={offer.country || offer.location}
          onSubmit={async (draft) => {
            if (onSubmitSellingOffer) {
              const err = await onSubmitSellingOffer(draft);
              if (!err) {
                setActionNotice("Selling offer submitted successfully and associated with this Purchasing Offer.");
              }
              return err;
            }
            return undefined;
          }}
        />
      ) : null}
    </div>
  );
}
