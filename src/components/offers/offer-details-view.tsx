"use client";

import Link from "next/link";
import { useState } from "react";
import type { OfferView } from "@/domain/view";
import type { Role } from "@/lib/permissions";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";
import { OfferDecisionModal } from "./offer-decision-modal";
import { OfferStatusModal } from "./offer-status-modal";
import { OfferFormModal } from "./offer-form-modal";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";

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

export function OfferDetailsView({
  offer,
  role,
  onToggleFavourite,
  onSubmitForReview,
  onDecide,
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
  onUpdateStatus?: (status: string) => Promise<string | undefined>;
  onEditOffer?: (draft: Record<string, unknown>) => Promise<string | undefined>;
  onDeleteOffer?: (id: string) => Promise<string | undefined>;
  onAddComment?: (comment: string) => Promise<string | undefined>;
  onAddAttachment?: (att: { name: string; mime?: string; bytesBase64?: string; kind?: "image" | "document" }) => Promise<string | undefined>;
  onDeleteAttachment?: (attachmentId: string) => Promise<string | undefined>;
}) {
  const isModerator = role === "moderator";
  const isAdmin = role === "owner";

  const [activeTab, setActiveTab] = useState<
    "material" | "info" | "pictures" | "documents" | "comments" | "activity"
  >("material");

  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<PreviewAttachmentItem | null>(null);

  const [newComment, setNewComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const images = offer.attachments.filter((a) => a.kind === "image");
  const documents = offer.attachments.filter((a) => a.kind === "document");

  const statusBadge = STATUS_BADGES[offer.statusKey] ?? {
    label: offer.status,
    className: "bg-neutral-100 text-neutral-700",
  };
  const priorityBadge = PRIORITY_BADGES[offer.priorityKey] ?? {
    label: offer.priority,
    className: "bg-neutral-100 text-neutral-600",
  };

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const err = await onAddComment?.(newComment.trim());
      if (err) {
        setCommentError(err);
      } else {
        setNewComment("");
      }
    } catch (caught) {
      setCommentError(caught instanceof Error ? caught.message : "Failed to add comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, fileKind: "image" | "document") {
    const files = e.target.files;
    if (!files || files.length === 0) return;
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
          setActionNotice(
            optimized.wasCompressed
              ? `Uploaded ${optimized.name} (optimized from ${Math.round(optimized.originalSize / 1024)} KB to ${Math.round(optimized.size / 1024)} KB).`
              : `Uploaded ${optimized.name}.`
          );
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/offers" className="hover:underline">
              Offers
            </Link>
            <span>/</span>
            <Link
              href={offer.kind === "purchasing" ? "/offers/purchasing" : "/offers/selling"}
              className="hover:underline capitalize"
            >
              {offer.kind} Offers
            </Link>
            <span>/</span>
            <span className="font-semibold text-neutral-900">{offer.number}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
              {offer.number}
            </h1>
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${offer.kind === "purchasing"
                ? "border-sky-200 bg-sky-50 text-sky-800"
                : "border-purple-200 bg-purple-50 text-purple-800"
                }`}
            >
              {offer.kindLabel}
            </span>
            <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${priorityBadge.className}`}>
              {priorityBadge.label} Priority
            </span>
            {offer.approvalStatus === "approved" ? (
              <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                ✓ Admin Approved
              </span>
            ) : offer.approvalStatus === "rejected" ? (
              <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">
                ✕ Admin Rejected
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Created by {offer.createdByName} on {offer.createdAt.slice(0, 10)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Favourite star */}
          <button
            type="button"
            onClick={() => void onToggleFavourite?.(offer.id)}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${offer.isFavourite
              ? "border-amber-400 bg-amber-50 text-amber-800"
              : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
          >
            <span className={offer.isFavourite ? "text-amber-500" : "text-neutral-300"}>★</span>
            {offer.isFavourite ? "Starred" : "Star"}
          </button>

          {/* Admin Approve / Reject */}
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setDecisionModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-600"
            >
              Approve / Reject Offer
            </button>
          ) : null}

          {/* Moderator actions */}
          {isModerator ? (
            <>
              {(offer.statusKey === "draft" || offer.statusKey === "received") ? (
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
          <button type="button" onClick={() => setActionNotice(null)} className="text-emerald-600 font-bold">
            &times;
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-600 font-bold">
            &times;
          </button>
        </div>
      ) : null}

      {/* Admin Decision Banner if exists */}
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

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto border-b border-neutral-200 text-xs font-medium whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveTab("material")}
          className={`px-4 py-2.5 transition border-b-2 -mb-px ${activeTab === "material"
            ? "border-neutral-950 font-bold text-neutral-950"
            : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
        >
          Material Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2.5 transition border-b-2 -mb-px ${activeTab === "info"
            ? "border-neutral-950 font-bold text-neutral-950"
            : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
        >
          Offer Information
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pictures")}
          className={`px-4 py-2.5 transition border-b-2 -mb-px ${activeTab === "pictures"
            ? "border-neutral-950 font-bold text-neutral-950"
            : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
        >
          Pictures ({images.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`px-4 py-2.5 transition border-b-2 -mb-px ${activeTab === "documents"
            ? "border-neutral-950 font-bold text-neutral-950"
            : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
        >
          Documents ({documents.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("comments")}
          className={`px-4 py-2.5 transition border-b-2 -mb-px ${activeTab === "comments"
            ? "border-neutral-950 font-bold text-neutral-950"
            : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
        >
          Notes & Comments ({offer.comments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          className={`px-4 py-2.5 transition border-b-2 -mb-px ${activeTab === "activity"
            ? "border-neutral-950 font-bold text-neutral-950"
            : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
        >
          Activity History ({offer.activities.length})
        </button>
      </div>

      {/* Tab 1: Material Details */}
      {activeTab === "material" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-neutral-500">Material Specification</p>
            <p className="mt-1 text-base font-bold text-neutral-950">{offer.material}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-neutral-500">Material Grade & Type</p>
            <p className="mt-1 text-base font-bold text-neutral-950">
              {offer.materialGrade} &bull; {offer.materialType}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-neutral-500">Quantity & Measurement</p>
            <p className="mt-1 text-base font-bold text-neutral-950">
              {offer.quantity.toLocaleString()} {offer.unit}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-neutral-500">Price per Unit</p>
            <p className="mt-1 text-base font-bold text-neutral-950">
              {offer.currency} {offer.pricePerUnit.toFixed(2)} / {offer.unit}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-950 p-4 text-white shadow-xs">
            <p className="text-xs text-neutral-400">Total Calculated Value</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-white">
              {offer.currency} {offer.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-neutral-500">Transport Loads</p>
            <p className="mt-1 text-base font-bold text-neutral-950">
              {offer.truckLoads} truckload{offer.truckLoads > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      ) : null}

      {/* Tab 2: Offer Information */}
      {activeTab === "info" ? (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-xs text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-neutral-500">Direction</p>
              <p className="mt-0.5 font-bold text-neutral-900 capitalize">{offer.kind} Offer</p>
            </div>
            <div>
              <p className="text-neutral-500">Contract Type</p>
              <p className="mt-0.5 font-bold text-neutral-900">{offer.offerType}</p>
            </div>
            <div>
              <p className="text-neutral-500">Assigned Team</p>
              <p className="mt-0.5 font-bold text-neutral-900">{offer.team}</p>
            </div>
            <div>
              <p className="text-neutral-500">Location / Country</p>
              <p className="mt-0.5 font-bold text-neutral-900">
                {offer.country} {offer.location ? `(${offer.location})` : ""}
              </p>
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <p className="text-neutral-500 font-semibold">Description & Logistics Requirements</p>
            <p className="mt-1 text-neutral-700 whitespace-pre-wrap leading-relaxed">
              {offer.description || "No additional description provided."}
            </p>
          </div>

          <div className="border-t border-neutral-100 pt-4 grid grid-cols-1 gap-2 text-neutral-500 sm:grid-cols-3">
            <div>Created By: <span className="font-medium text-neutral-800">{offer.createdByName}</span></div>
            <div>Created Date: <span className="font-medium text-neutral-800">{offer.createdAt}</span></div>
            <div>Last Updated: <span className="font-medium text-neutral-800">{offer.updatedAt}</span></div>
          </div>
        </div>
      ) : null}

      {/* Tab 3: Pictures */}
      {activeTab === "pictures" ? (
        <div className="space-y-4">
          {isModerator ? (
            <div className="flex justify-end">
              <label className="cursor-pointer rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800">
                + Upload Photos
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, "image")}
                  className="hidden"
                />
              </label>
            </div>
          ) : null}

          {images.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center text-xs text-neutral-500">
              No photos attached to this offer.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 shadow-2xs"
                >
                  <div
                    onClick={() =>
                      setPreviewItem({
                        id: img.id,
                        name: img.name,
                        mime: img.mime || "image/jpeg",
                        byteSize: img.byteSize,
                        url: img.url || `/api/files/${img.id}`,
                        uploadedByName: img.uploadedByName,
                        uploadedAt: img.createdAt,
                      })
                    }
                    className="relative flex h-36 w-full cursor-pointer items-center justify-center bg-neutral-900/5 p-1 overflow-hidden hover:opacity-90 transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url || `/api/files/${img.id}`}
                      alt={img.name}
                      className="h-full w-full object-cover rounded-t-lg"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5 bg-white text-[11px] flex items-center justify-between">
                    <span className="truncate text-neutral-700">{img.name}</span>
                    {isModerator ? (
                      <button
                        type="button"
                        onClick={() => onDeleteAttachment?.(img.id)}
                        className="text-rose-500 hover:text-rose-700 font-bold ml-2 min-h-[30px] min-w-[30px] flex items-center justify-center"
                        title="Delete photo"
                      >
                        &times;
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Tab 4: Documents */}
      {activeTab === "documents" ? (
        <div className="space-y-4">
          {isModerator ? (
            <div className="flex justify-end">
              <label className="cursor-pointer rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800">
                + Upload Documents
                <input
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.docx,.csv"
                  onChange={(e) => handleFileUpload(e, "document")}
                  className="hidden"
                />
              </label>
            </div>
          ) : null}

          {documents.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center text-xs text-neutral-500">
              No documents attached to this offer.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-xs">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3.5 text-xs hover:bg-neutral-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                      <p className="font-semibold text-neutral-900">{doc.name}</p>
                      <p className="text-[11px] text-neutral-500">
                        {(doc.byteSize / 1024).toFixed(0)} KB &bull; Uploaded {doc.createdAt.slice(0, 10)} by {doc.uploadedByName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewItem({
                          id: doc.id,
                          name: doc.name,
                          mime: doc.mime || (doc.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
                          byteSize: doc.byteSize,
                          url: doc.url || `/api/files/${doc.id}`,
                          uploadedByName: doc.uploadedByName,
                          uploadedAt: doc.createdAt,
                        })
                      }
                      className="rounded-lg bg-neutral-950 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 transition min-h-[36px]"
                    >
                      Preview
                    </button>
                    <a
                      href={doc.url || `/api/files/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 min-h-[36px] flex items-center justify-center"
                    >
                      Download
                    </a>
                    {isModerator ? (
                      <button
                        type="button"
                        onClick={() => onDeleteAttachment?.(doc.id)}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 font-bold min-h-[36px]"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Tab 5: Notes & Comments */}
      {activeTab === "comments" ? (
        <div className="space-y-4">
          {/* Add comment input */}
          <form onSubmit={handleAddComment} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <label className="block text-xs font-semibold text-neutral-800">
              Add Note / Negotiation Comment
            </label>
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Record negotiation note, customer counter-offer, delivery feedback..."
              className="mt-1.5 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
            />
            {commentError ? <p className="mt-1 text-xs text-rose-600">{commentError}</p> : null}
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={commentSubmitting || !newComment.trim()}
                className="rounded-lg bg-neutral-950 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
              >
                {commentSubmitting ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </form>

          {/* Comments timeline */}
          {offer.comments.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-xs text-neutral-500">
              No notes or comments yet.
            </div>
          ) : (
            <div className="space-y-3">
              {offer.comments.map((c) => (
                <div key={c.id} className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900">{c.authorName}</span>
                      <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 uppercase">
                        {c.authorRole}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400">{c.createdAt.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className="mt-2 text-neutral-800 whitespace-pre-wrap">{c.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Tab 6: Activity History */}
      {activeTab === "activity" ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          {offer.activities.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-500">No activity history recorded.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {offer.activities.map((act) => (
                <div key={act.id} className="py-3 text-xs first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold capitalize text-neutral-900">{act.action.replace(/_/g, " ")}</span>
                      <span className="text-neutral-400">&bull;</span>
                      <span className="text-neutral-600 font-medium">{act.actorName}</span>
                    </div>
                    <span className="text-[11px] text-neutral-400">{act.createdAt.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className="mt-1 text-neutral-700">{act.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Modals */}
      {decisionModalOpen ? (
        <OfferDecisionModal
          offer={offer}
          isOpen={decisionModalOpen}
          onClose={() => setDecisionModalOpen(false)}
          onDecide={async (decision, note) => {
            const err = await onDecide?.(decision, note);
            if (!err) setActionNotice(`Admin ${decision} offer with decision note.`);
            return err;
          }}
        />
      ) : null}

      {statusModalOpen ? (
        <OfferStatusModal
          offer={offer}
          isOpen={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          onUpdateStatus={async (status) => {
            const err = await onUpdateStatus?.(status);
            if (!err) setActionNotice(`Offer status updated to ${status}.`);
            return err;
          }}
        />
      ) : null}

      {editModalOpen ? (
        <OfferFormModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          offerToEdit={offer}
          onSubmit={async (draft) => {
            const err = await onEditOffer?.(draft);
            if (!err) setActionNotice("Offer details updated successfully.");
            return err;
          }}
        />
      ) : null}

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </div>
  );
}
