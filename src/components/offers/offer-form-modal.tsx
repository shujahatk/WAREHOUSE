"use client";

import { useState } from "react";
import type { OfferView } from "@/domain/view";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";

type AttachmentDraft = {
  name: string;
  mime: string;
  bytesBase64: string;
  kind: "image" | "document";
  size: number;
  originalSize?: number;
  wasCompressed?: boolean;
};

export function OfferFormModal(props: {
  isOpen: boolean;
  onClose: () => void;
  initialKind?: "purchasing" | "selling";
  offerToEdit?: OfferView | null;
  onSubmit: (draft: Record<string, unknown>) => Promise<string | undefined>;
}) {
  if (!props.isOpen) return null;
  return (
    <OfferFormContent
      key={props.offerToEdit?.id ?? `new-${props.initialKind ?? "purchasing"}`}
      {...props}
    />
  );
}

function OfferFormContent({
  onClose,
  initialKind = "purchasing",
  offerToEdit,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialKind?: "purchasing" | "selling";
  offerToEdit?: OfferView | null;
  onSubmit: (draft: Record<string, unknown>) => Promise<string | undefined>;
}) {
  const isEditing = Boolean(offerToEdit);

  const [kind, setKind] = useState<"purchasing" | "selling">(offerToEdit?.kind ?? initialKind);
  const [material, setMaterial] = useState(offerToEdit?.material ?? "");
  const [materialType, setMaterialType] = useState(offerToEdit?.materialType ?? "Plastics");
  const [materialGrade, setMaterialGrade] = useState(offerToEdit?.materialGrade ?? "Standard");
  const [quantity, setQuantity] = useState(offerToEdit ? String(offerToEdit.quantity) : "1000");
  const [unit, setUnit] = useState(offerToEdit?.unit ?? "kg");
  const [pricePerUnit, setPricePerUnit] = useState(offerToEdit ? String(offerToEdit.pricePerUnit) : "1.50");
  const [currency, setCurrency] = useState(offerToEdit?.currency ?? "EUR");
  const [country, setCountry] = useState(offerToEdit?.country ?? "Belgium");
  const [location, setLocation] = useState(offerToEdit?.location ?? "");
  const [truckLoads, setTruckLoads] = useState(offerToEdit ? String(offerToEdit.truckLoads) : "1");
  const [priority, setPriority] = useState<string>(offerToEdit?.priorityKey ?? "medium");
  const [offerType, setOfferType] = useState(offerToEdit?.offerType ?? "Spot");
  const [team, setTeam] = useState(offerToEdit?.team ?? "Europe");
  const [status] = useState<string>(offerToEdit?.statusKey ?? "draft");
  const [description, setDescription] = useState(offerToEdit?.description ?? "");

  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Compute total value in real time
  const parsedQty = parseFloat(quantity) || 0;
  const parsedPrice = parseFloat(pricePerUnit) || 0;
  const computedTotal = Math.round(parsedQty * parsedPrice * 100) / 100;

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: AttachmentDraft[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        setError(`File ${file.name} exceeds 10MB limit.`);
        continue;
      }

      try {
        const isImg = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
        const optimized = await compressImageIfNeeded(file);
        const base64 = await fileToBase64(optimized.blob);

        newAttachments.push({
          name: optimized.name,
          mime: optimized.mime || "application/octet-stream",
          bytesBase64: base64,
          kind: isImg ? "image" : "document",
          size: optimized.size,
          originalSize: optimized.originalSize,
          wasCompressed: optimized.wasCompressed,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to process ${file.name}`);
      }
    }

    setAttachments((prev) => {
      const existingNames = new Set(prev.map((p) => `${p.name}:${p.size}`));
      const deduplicated = newAttachments.filter((a) => !existingNames.has(`${a.name}:${a.size}`));
      return [...prev, ...deduplicated];
    });
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!material.trim()) {
      setError("Material specification is required.");
      return;
    }
    if (parsedQty <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    if (parsedPrice < 0) {
      setError("Price per unit cannot be negative.");
      return;
    }
    if (!country.trim()) {
      setError("Country is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      id: offerToEdit?.id,
      kind,
      material: material.trim(),
      materialType,
      materialGrade,
      quantity: parsedQty,
      unit,
      pricePerUnit: parsedPrice,
      currency,
      country: country.trim(),
      location: location.trim(),
      truckLoads: parseInt(truckLoads, 10) || 1,
      priority,
      offerType,
      team,
      status,
      description: description.trim(),
      attachments: attachments.map((a) => ({
        name: a.name,
        mime: a.mime,
        bytesBase64: a.bytesBase64,
        byteSize: a.size,
        kind: a.kind,
      })),
    };

    try {
      const err = await onSubmit(payload);
      if (err) {
        setError(err);
        setSubmitting(false);
      } else {
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save offer.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h3 className="text-lg font-bold text-neutral-950">
              {isEditing ? `Edit Offer · ${offerToEdit?.number}` : `New ${kind === "purchasing" ? "Purchasing" : "Selling"} Offer`}
            </h3>
            <p className="text-xs text-neutral-500">
              {isEditing ? "Modify offer details, specs, and pricing" : "Create and register a new business offer"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-neutral-400 hover:text-neutral-700">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Kind Toggle (Purchasing vs Selling) */}
          {!isEditing ? (
            <div>
              <label className="block text-xs font-semibold text-neutral-700">Offer Type</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKind("purchasing")}
                  className={`rounded-lg border py-2 text-xs font-semibold transition ${kind === "purchasing"
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                >
                  Purchasing Offer (Buy)
                </button>
                <button
                  type="button"
                  onClick={() => setKind("selling")}
                  className={`rounded-lg border py-2 text-xs font-semibold transition ${kind === "selling"
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                >
                  Selling Offer (Sell)
                </button>
              </div>
            </div>
          ) : null}

          {/* Material & Specification */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-700">
                Material / Specification <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. LDPE Film 98/2, HDPE Natural Flakes"
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Material Type</label>
              <select
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="Plastics">Plastics</option>
                <option value="Metals">Metals</option>
                <option value="Paper">Paper</option>
                <option value="Packaging">Packaging</option>
                <option value="Chemicals">Chemicals</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700">Material Grade</label>
              <select
                value={materialGrade}
                onChange={(e) => setMaterialGrade(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="Standard">Standard</option>
                <option value="Grade A Prime">Grade A Prime</option>
                <option value="Recycled">Recycled</option>
                <option value="Industrial">Industrial</option>
                <option value="Off-Grade">Off-Grade</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Team</label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="Europe">Europe</option>
                <option value="Asia">Asia</option>
                <option value="Americas">Americas</option>
                <option value="Plastics Team">Plastics Team</option>
                <option value="Metals Team">Metals Team</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>

          {/* Quantity, Unit, Price, Currency, Total Value */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-neutral-700">
                Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="kg">kg</option>
                <option value="MT">MT (Metric Tons)</option>
                <option value="lbs">lbs</option>
                <option value="Rolls">Rolls</option>
                <option value="Units">Units</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">
                Price / Unit <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500">Calculated Value</label>
              <div className="mt-1 flex h-[38px] items-center rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-900">
                {currency} {computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Location, Country, Truck Loads, Type */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700">
                Country <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Germany"
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Location / City / Port</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Hamburg Port"
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Truck Loads</label>
              <input
                type="number"
                min="0"
                value={truckLoads}
                onChange={(e) => setTruckLoads(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Contract Type</label>
              <select
                value={offerType}
                onChange={(e) => setOfferType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="Spot">Spot</option>
                <option value="Contract">Contract</option>
                <option value="Regular">Regular</option>
                <option value="Trial">Trial</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-neutral-700">Description & Specifications</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Packaging details, contamination level, loading conditions..."
              className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
            />
          </div>

          {/* Attachments Section */}
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/70 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-800">Add Pictures & Documents</p>
                <p className="text-[11px] text-neutral-500">Supports PNG, JPG, PDF, Excel (max 10MB per file)</p>
              </div>
              <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs border border-neutral-200 hover:bg-neutral-50">
                Browse Files
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.docx,.csv"
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="relative flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2 text-xs"
                  >
                    <div className="truncate pr-2">
                      <p className="truncate font-medium text-neutral-800">{att.name}</p>
                      <p className="text-[10px] text-neutral-400">
                        {att.kind === "image" ? "📷 Image" : "📄 Document"} &bull; {(att.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="text-neutral-400 hover:text-rose-600 font-bold"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
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
              className="rounded-lg bg-neutral-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
            >
              {submitting ? "Saving..." : isEditing ? "Save Changes" : `Create ${kind === "purchasing" ? "Purchasing" : "Selling"} Offer`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
