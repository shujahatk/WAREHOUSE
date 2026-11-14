"use client";

import Link from "next/link";
import { useState } from "react";
import type { OfferView } from "@/domain/view";
import type { Role } from "@/lib/permissions";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";
import { OfferFormModal } from "./offer-form-modal";
import { OfferStatusModal } from "./offer-status-modal";

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
}) {
  const isModerator = role === "moderator";
  const isAdmin = role === "owner";
  const isOffersUser = role === "offers_user";

  const [previewItem, setPreviewItem] = useState<PreviewAttachmentItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

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
        setActionNotice(`Offer marked as ${decisionType}.`);
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
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/offers" className="hover:underline">
              Offers Portal
            </Link>
            <span>/</span>
            <span className="capitalize">{offer.kind}</span>
            <span>/</span>
            <span className="font-semibold text-neutral-900">{offer.number}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
              {offer.number}
            </h1>
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                offer.kind === "purchasing"
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-purple-200 bg-purple-50 text-purple-800"
              }`}
            >
              {offer.kindLabel}
            </span>
            <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${priorityBadge.className}`}>
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
            {offer.statusKey === "accepted" || offer.soldAt ? (
              <span className="rounded-md border border-emerald-400 bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                ★ Commercially Accepted (SOLD)
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Submitted by <strong>{offer.createdByName}</strong> on {offer.createdAt.slice(0, 10)}
            {offer.soldAt ? ` · Sold on ${offer.soldAt.slice(0, 10)}` : ""}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Favourite star */}
          {!isOffersUser ? (
            <button
              type="button"
              onClick={() => void onToggleFavourite?.(offer.id)}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                offer.isFavourite
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
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
              className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
            >
              Review / Decide Offer
            </button>
          ) : null}

          {/* Commercial Acceptance -> Move to Sold (Admin or Moderator when approved) */}
          {(isAdmin || isModerator) && offer.approvalStatus === "approved" && offer.statusKey !== "accepted" ? (
            <button
              type="button"
              disabled={acceptingSubmitting}
              onClick={handleCommercialAccept}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
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
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
                >
                  Submit for Admin Review
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setStatusModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Update Status
              </button>
              <button
                type="button"
                onClick={() => setEditModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
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
                className="flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {actionNotice ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <span>{actionNotice}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="font-bold">
            &times;
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold">
            &times;
          </button>
        </div>
      ) : null}

      {/* Admin Decision Inline Panel */}
      {showDecisionInput && isAdmin ? (
        <form
          onSubmit={handleAdminDecision}
          className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-amber-200 pb-2">
            <h3 className="text-sm font-semibold text-neutral-900">Admin Offer Decision</h3>
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
              <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                <input
                  type="radio"
                  name="decision"
                  checked={decisionType === "approved"}
                  onChange={() => setDecisionType("approved")}
                />
                Approve Offer
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
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
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-xs text-neutral-900"
                />
              </label>
            </div>
            {decisionError ? <p className="text-xs text-rose-700">{decisionError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={decisionSubmitting}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs ${
                  decisionType === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                } disabled:opacity-50`}
              >
                {decisionSubmitting ? "Submitting…" : `Confirm ${decisionType === "approved" ? "Approval" : "Rejection"}`}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Admin Decision History Note if present */}
      {offer.adminDecisionNote ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold text-neutral-900">
            Admin Decision &bull; {offer.approvalLabel}
          </p>
          <p className="mt-1 text-xs text-neutral-700 whitespace-pre-wrap">{offer.adminDecisionNote}</p>
          <p className="mt-2 text-[11px] text-neutral-400">
            Decided by {offer.decidedByName || "Admin"} on {offer.decidedAt?.slice(0, 10)}
          </p>
        </div>
      ) : null}

      {/* 2. COMPLETE DOSSIER — ONE FULL PAGE WITHOUT NESTED TABS */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2/3 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Linked PO Banner */}
          {offer.poNumber ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold tracking-wider text-indigo-700 uppercase">
                    Associated Purchase Order
                  </span>
                  <p className="mt-1 text-sm font-bold text-neutral-950">
                    Linked to PO: {offer.poNumber}
                  </p>
                </div>
                {!isOffersUser ? (
                  <Link
                    href={`/purchases/${offer.poNumber}`}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    View Purchase Order &rarr;
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Material Specifications Card */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Material & Quantity Specifications
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
                <dd className="mt-1 text-sm font-semibold text-neutral-900">
                  {offer.quantity.toLocaleString()} {offer.unit}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Truck Loads</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">{offer.truckLoads} loads</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Packaging Type</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">{offer.packagingType || "Standard"}</dd>
              </div>
            </dl>
            {offer.description ? (
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <span className="text-xs text-neutral-500">Description & Technical Details</span>
                <p className="mt-1 text-xs text-neutral-800 leading-relaxed whitespace-pre-wrap">
                  {offer.description}
                </p>
              </div>
            ) : null}
          </div>

          {/* Client & Contact Information (Strict requirement for selling offers) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Client & Counterparty Information
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-neutral-500">Client / Company Name</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">
                  {offer.clientName || "Not specified"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Contact Number</dt>
                <dd className="mt-1 text-sm font-semibold text-neutral-900">
                  {offer.contactNumber ? (
                    <a href={`tel:${offer.contactNumber}`} className="text-indigo-600 hover:underline">
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
                    <a href={`mailto:${offer.emailAddress}`} className="text-indigo-600 hover:underline">
                      {offer.emailAddress}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Logistics: Origin & Destination */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Logistics & Routing
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg bg-neutral-50 p-3">
                <dt className="text-neutral-500">Origin / Loading Location</dt>
                <dd className="mt-1 text-sm font-bold text-neutral-900">
                  📍 {offer.origin || offer.location || offer.country || "Not specified"}
                </dd>
              </div>
              <div className="rounded-lg bg-neutral-50 p-3">
                <dt className="text-neutral-500">Destination / Delivery Location</dt>
                <dd className="mt-1 text-sm font-bold text-neutral-900">
                  🏁 {offer.destination || offer.country || "Not specified"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Attached Photos & Documents (with Preview) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide">
                Attached Photos & Documents ({offer.attachments.length})
              </h2>
              {/* Upload trigger */}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
                  <span>+ Add Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFileUpload(e, "image")}
                  />
                </label>
                <label className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
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
                          <p className="text-[10px] text-neutral-500">
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
                          className="rounded bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 border border-neutral-300 hover:bg-neutral-50 shadow-2xs"
                        >
                          Preview
                        </button>
                        {isModerator ? (
                          <button
                            type="button"
                            onClick={() => void onDeleteAttachment?.(att.id)}
                            className="text-neutral-400 hover:text-rose-600 p-1"
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
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Commercial Pricing
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <span className="text-xs text-neutral-500">Unit Price</span>
                <p className="text-xl font-bold text-neutral-950">
                  {offer.pricePerUnit} {offer.currency} / {offer.unit}
                </p>
              </div>
              <div className="border-t border-neutral-100 pt-3">
                <span className="text-xs text-neutral-500">Total Value</span>
                <p className="text-2xl font-black text-emerald-700">
                  {offer.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} {offer.currency}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-xs">
                <div>
                  <span className="text-neutral-500">Offer Type:</span>
                  <p className="font-semibold text-neutral-900">{offer.offerType}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Trading Team:</span>
                  <p className="font-semibold text-neutral-900">{offer.team}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Submitter & Audit Info */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Dossier Metadata & Submitter
            </h2>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div>
                <dt className="text-neutral-500">Submitter Name</dt>
                <dd className="font-semibold text-neutral-900">{offer.createdByName}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Date Created</dt>
                <dd className="font-semibold text-neutral-900">{offer.createdAt.slice(0, 16).replace("T", " ")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Last Updated</dt>
                <dd className="font-semibold text-neutral-900">{offer.updatedAt.slice(0, 16).replace("T", " ")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Approval Status</dt>
                <dd className="font-semibold capitalize text-neutral-900">{offer.approvalStatus}</dd>
              </div>
            </dl>
          </div>

          {/* Discussion & Comments */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-neutral-950 uppercase tracking-wide border-b border-neutral-100 pb-2">
              Discussion & Notes ({offer.comments.length})
            </h2>

            <div className="mt-3 space-y-2.5 max-h-60 overflow-y-auto">
              {offer.comments.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No notes yet.</p>
              ) : (
                offer.comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-neutral-50 p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900">{c.authorName}</span>
                      <span className="text-[10px] text-neutral-400">{c.createdAt.slice(0, 10)}</span>
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
                placeholder="Add a comment or note..."
                className="w-full rounded-lg border border-neutral-300 p-2 text-xs text-neutral-900"
              />
              {commentError ? <p className="text-xs text-rose-600 mt-1">{commentError}</p> : null}
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={commentSubmitting || !newComment.trim()}
                  className="rounded-lg bg-neutral-950 px-3 py-1 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
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
    </div>
  );
}
