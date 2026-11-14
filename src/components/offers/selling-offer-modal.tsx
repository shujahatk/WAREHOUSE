"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";

export function SellingOfferModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: {
    poNumber: string;
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
  const { state } = useDemo();
  const availableOrders = state.orders || [];

  const [poNumber, setPoNumber] = useState(() => availableOrders[0]?.number ?? "");
  const [materialType, setMaterialType] = useState("Plastics (LDPE)");
  const [materialName, setMaterialName] = useState("");
  const [clientName, setClientName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [price, setPrice] = useState("");
  const [origin, setOrigin] = useState("Antwerp, Belgium");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // 9-field strict validation
    const trimmedPo = poNumber.trim();
    if (!trimmedPo) {
      setError("Field 1: PO Number is required.");
      return;
    }
    const trimmedMatType = materialType.trim();
    if (!trimmedMatType) {
      setError("Field 2: Material Type is required.");
      return;
    }
    const trimmedMatName = materialName.trim();
    if (!trimmedMatName) {
      setError("Field 3: Material Name is required.");
      return;
    }
    const trimmedClient = clientName.trim();
    if (!trimmedClient) {
      setError("Field 4: Client Name is required.");
      return;
    }
    const trimmedContact = contactNumber.trim();
    if (!trimmedContact) {
      setError("Field 5: Contact Number is required.");
      return;
    }
    const trimmedEmail = emailAddress.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Field 6: A valid Email Address is required.");
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Field 7: Price must be a positive number.");
      return;
    }
    const trimmedOrigin = origin.trim();
    if (!trimmedOrigin) {
      setError("Field 8: Origin is required.");
      return;
    }
    const trimmedDest = destination.trim();
    if (!trimmedDest) {
      setError("Field 9: Destination is required.");
      return;
    }

    setSubmitting(true);
    try {
      const err = await onSubmit({
        poNumber: trimmedPo,
        materialType: trimmedMatType,
        materialName: trimmedMatName,
        clientName: trimmedClient,
        contactNumber: trimmedContact,
        emailAddress: trimmedEmail,
        price: parsedPrice,
        origin: trimmedOrigin,
        destination: trimmedDest,
        description: description.trim() || undefined,
      });

      if (err) {
        setError(err);
        setSubmitting(false);
      } else {
        setSubmitting(false);
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to submit selling offer.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-900">
              New Selling Offer
            </span>
            <h2 className="mt-1 text-lg font-bold text-neutral-950">
              Submit Selling Offer Linked to PO
            </h2>
            <p className="text-xs text-neutral-500">
              All 9 fields are strictly validated before submission for Admin review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 font-bold p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs" noValidate>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Field 1: PO Number */}
            <div className="sm:col-span-2">
              <label className="block font-medium text-neutral-700">
                1. Associated PO Number <span className="text-rose-500">*</span>
              </label>
              {availableOrders.length > 0 ? (
                <div className="mt-1 flex gap-2">
                  <select
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-950"
                  >
                    <option value="">Select a Purchase Order...</option>
                    {availableOrders.map((o) => (
                      <option key={o.number} value={o.number}>
                        {o.number} — {o.title || o.material} ({o.supplier})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="Or type PO-..."
                    className="h-10 w-44 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  required
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-0001"
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
                />
              )}
            </div>

            {/* Field 2: Material Type */}
            <div>
              <label className="block font-medium text-neutral-700">
                2. Material Type <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
                placeholder="e.g. Plastics (LDPE), Scrap Metal, Paper"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 3: Material Name */}
            <div>
              <label className="block font-medium text-neutral-700">
                3. Material Name & Grade <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g. LDPE Film 98/2 Regranulate"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 4: Client Name */}
            <div>
              <label className="block font-medium text-neutral-700">
                4. Client / Buyer Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Benelux Recycling BV"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 5: Contact Number */}
            <div>
              <label className="block font-medium text-neutral-700">
                5. Contact Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. +32 3 888 1234"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 6: Email Address */}
            <div>
              <label className="block font-medium text-neutral-700">
                6. Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="e.g. purchasing@client.com"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 7: Price */}
            <div>
              <label className="block font-medium text-neutral-700">
                7. Price (EUR) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 1450.00"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 8: Origin */}
            <div>
              <label className="block font-medium text-neutral-700">
                8. Origin Location <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Bornem Warehouse, Belgium"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>

            {/* Field 9: Destination */}
            <div>
              <label className="block font-medium text-neutral-700">
                9. Destination Location <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Rotterdam Port, Netherlands"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-neutral-700">
              Additional Details / Notes (optional)
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Payment terms, delivery schedule, packaging requirements..."
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-950"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 rounded-lg bg-neutral-950 px-5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
            >
              {submitting ? "Submitting Offer…" : "Submit Selling Offer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

