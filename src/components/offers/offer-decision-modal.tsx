"use client";

import { useState } from "react";
import type { OfferView } from "@/domain/view";

export function OfferDecisionModal({
  offer,
  isOpen,
  onClose,
  onDecide,
}: {
  offer: OfferView;
  isOpen: boolean;
  onClose: () => void;
  onDecide: (decision: "approved" | "rejected", note: string) => Promise<string | undefined>;
}) {
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setError("A decision note is mandatory when approving or rejecting an offer.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const err = await onDecide(decision, trimmed);
      if (err) {
        setError(err);
        setSubmitting(false);
      } else {
        setNote("");
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to record decision.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <h3 className="text-lg font-semibold text-neutral-950">
            Admin Offer Decision
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-neutral-700">
              Offer: <span className="font-semibold text-neutral-950">{offer.number}</span>
            </p>
            <p className="text-xs text-neutral-500">
              {offer.material} &bull; {offer.quantity.toLocaleString()} {offer.unit} &bull; {offer.currency} {offer.totalValue.toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">
              Decision
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision("approved")}
                className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition ${
                  decision === "approved"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <span>&#10003;</span> Approve Offer
              </button>
              <button
                type="button"
                onClick={() => setDecision("rejected")}
                className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition ${
                  decision === "rejected"
                    ? "border-rose-600 bg-rose-50 text-rose-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <span>&times;</span> Reject Offer
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">
              Decision Note <span className="text-rose-500">* (Mandatory)</span>
            </label>
            <textarea
              required
              rows={3}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError(null);
              }}
              placeholder={
                decision === "approved"
                  ? "Specify terms, pricing guidelines or instructions for moderator negotiation..."
                  : "State clear reasoning for rejection..."
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs focus:border-neutral-950 focus:outline-hidden"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 font-medium">
              {error}
            </p>
          ) : null}

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
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs ${
                decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {submitting ? "Submitting..." : decision === "approved" ? "Confirm Approval" : "Confirm Rejection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

