"use client";

import { useState } from "react";
import type { OfferView } from "@/domain/view";

export function OfferStatusModal({
  offer,
  isOpen,
  onClose,
  onUpdateStatus,
}: {
  offer: OfferView;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (status: string) => Promise<string | undefined>;
}) {
  const [status, setStatus] = useState<string>(offer.statusKey);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const err = await onUpdateStatus(status);
      if (err) {
        setError(err);
        setSubmitting(false);
      } else {
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update status.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <h3 className="text-base font-semibold text-neutral-950">Update Workflow Status</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-neutral-500">
              Offer: <span className="font-semibold text-neutral-900">{offer.number}</span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Select Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
            >
              <option value="draft">Draft</option>
              <option value="received">Received</option>
              <option value="negotiating">Negotiating</option>
              <option value="won">Won (Deal Closed)</option>
              <option value="lost">Lost (Not Concluded)</option>
            </select>
          </div>

          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 font-medium">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
            >
              {submitting ? "Updating..." : "Update Status"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

