"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { CurrencySelect } from "@/components/ui/currency-select";

export interface SellingOfferAttachmentInput {
  name: string;
  mime: string;
  bytesBase64: string;
  byteSize?: number;
  kind?: "image" | "document";
}

export function SellingOfferModal({
  isOpen,
  onClose,
  onSubmit,
  initialPoNumber,
  initialPurchasingOfferId,
  initialMaterialType,
  initialMaterialName,
  initialOrigin,
  initialQuantity,
  initialUnit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: {
    poNumber: string;
    purchasingOfferId?: string;
    materialType: string;
    materialName: string;
    clientName: string;
    contactPerson?: string;
    contactNumber: string;
    emailAddress: string;
    price: number;
    currency?: string;
    quantity: number;
    unit: string;
    deliveryDate?: string;
    packagingType?: string;
    transportDetails?: string;
    origin: string;
    destination: string;
    description?: string;
    attachments?: SellingOfferAttachmentInput[];
  }) => Promise<string | undefined>;
  initialPoNumber?: string;
  initialPurchasingOfferId?: string;
  initialMaterialType?: string;
  initialMaterialName?: string;
  initialOrigin?: string;
  initialQuantity?: number;
  initialUnit?: string;
}) {
  const { state, actor } = useDemo();
  const availableOrders = state.orders || [];

  const [poNumber, setPoNumber] = useState(() => initialPoNumber || availableOrders[0]?.number || "");
  const [purchasingOfferId, setPurchasingOfferId] = useState(() => initialPurchasingOfferId || "");
  const [materialType, setMaterialType] = useState(() => initialMaterialType || "Plastics (LDPE)");
  const [materialName, setMaterialName] = useState(() => initialMaterialName || "");
  const [quantity, setQuantity] = useState(() => String(initialQuantity || "24"));
  const [unit, setUnit] = useState(() => initialUnit || "MT");
  const [clientName, setClientName] = useState(() => actor?.company || "");
  const [contactPerson, setContactPerson] = useState(() => actor?.name || "");
  const [contactNumber, setContactNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState(() => actor?.email || "");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [packagingType, setPackagingType] = useState("Big Bags");
  const [transportDetails, setTransportDetails] = useState("DAP — Delivered At Place");
  const [origin, setOrigin] = useState(() => initialOrigin || "Antwerp, Belgium");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<SellingOfferAttachmentInput[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const parsedQty = parseFloat(quantity) || 0;
  const parsedPrice = parseFloat(price) || 0;
  const calculatedTotal = parsedQty > 0 && parsedPrice > 0 ? (parsedQty * parsedPrice).toFixed(2) : "0.00";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 15 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 15MB limit.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (!result) return;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            mime: file.type || "application/octet-stream",
            bytesBase64: base64,
            byteSize: file.size,
            kind: isImage ? "image" : "document",
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedPo = poNumber.trim();
    if (!trimmedPo) {
      setError("Field 1: PO Number or Purchasing Offer Reference is required.");
      return;
    }
    const trimmedMatType = materialType.trim();
    if (!trimmedMatType) {
      setError("Field 2: Material Type is required.");
      return;
    }
    const trimmedMatName = materialName.trim();
    if (!trimmedMatName) {
      setError("Field 3: Material Name & Grade is required.");
      return;
    }
    if (parsedQty <= 0) {
      setError("Field 4: Quantity offered must be a positive number.");
      return;
    }
    if (parsedPrice <= 0) {
      setError("Field 5: Proposed Selling Price must be a positive number.");
      return;
    }
    const trimmedClient = clientName.trim();
    if (!trimmedClient) {
      setError("Field 6: Company / Supplier Name is required.");
      return;
    }
    const trimmedContact = contactNumber.trim();
    if (!trimmedContact) {
      setError("Field 7: Contact Phone Number is required.");
      return;
    }
    const trimmedEmail = emailAddress.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Field 8: A valid Contact Email Address is required.");
      return;
    }
    const trimmedDelivery = deliveryDate.trim();
    if (!trimmedDelivery) {
      setError("Field 9: Proposed Delivery Date is required.");
      return;
    }
    const trimmedOrigin = origin.trim();
    if (!trimmedOrigin) {
      setError("Field 10: Origin loading location is required.");
      return;
    }
    const trimmedDest = destination.trim();
    if (!trimmedDest) {
      setError("Field 11: Destination delivery location is required.");
      return;
    }

    setSubmitting(true);
    try {
      const err = await onSubmit({
        poNumber: trimmedPo,
        purchasingOfferId: purchasingOfferId.trim() || undefined,
        materialType: trimmedMatType,
        materialName: trimmedMatName,
        clientName: trimmedClient,
        contactPerson: contactPerson.trim() || undefined,
        contactNumber: trimmedContact,
        emailAddress: trimmedEmail,
        price: parsedPrice,
        currency,
        quantity: parsedQty,
        unit: unit.trim() || "MT",
        deliveryDate: trimmedDelivery,
        packagingType: packagingType.trim() || undefined,
        transportDetails: transportDetails.trim() || undefined,
        origin: trimmedOrigin,
        destination: trimmedDest,
        description: description.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 uppercase">
                Selling Proposal
              </span>
              <span className="text-[11px] font-mono text-neutral-400">Direct PO Response</span>
            </div>
            <h2 className="mt-1.5 text-lg font-bold text-neutral-950">
              Submit Selling Offer Linked to Purchasing Offer
            </h2>
            <p className="text-xs text-neutral-500">
              All commercial, material, quantity, delivery and contact details are submitted directly for Admin appraisal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
          >
            ✕
          </button>
        </div>

        {initialPoNumber || initialPurchasingOfferId ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-950 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="font-bold text-emerald-800">Linked to Purchasing Offer:</span>
              <span className="font-mono font-semibold">{initialPoNumber || initialPurchasingOfferId}</span>
            </span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              Direct Response
            </span>
          </div>
        ) : null}

        <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] text-amber-950 flex items-start gap-2">
          <span className="text-amber-700 font-bold">🔒 Important Constraint:</span>
          <p>
            Once submitted, your Selling Offer will be <strong>locked</strong>. You will be able to track its review and approval status in real time in <strong>My Offers</strong>, but submitted proposals cannot be edited or withdrawn.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs" noValidate>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
              {error}
            </div>
          ) : null}

          {/* Section 1: Linked Purchasing Opportunity & Material */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-emerald-200/50 pb-2">
              <span className="inline-flex items-center rounded-xs bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                1. Sourcing Link
              </span>
              <h3 className="font-bold text-neutral-900 text-xs">Target Purchase Order &amp; Material</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Field 1: PO Number */}
              <div className="sm:col-span-2">
                <label className="block font-medium text-neutral-700">
                  Target PO Number or Purchasing Offer Reference <span className="text-rose-500">*</span>
                </label>
                {availableOrders.length > 0 ? (
                  <div className="mt-1 flex gap-2">
                    <select
                      value={poNumber}
                      onChange={(e) => {
                        setPoNumber(e.target.value);
                        const match = availableOrders.find((o) => o.number === e.target.value);
                        if (match) {
                          if (match.material) setMaterialName(match.material);
                          if (match.origin) setOrigin(match.origin);
                          if (match.destination) setDestination(match.destination);
                        }
                      }}
                      className="h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                    >
                      <option value="">Select a Purchase Order...</option>
                      {availableOrders.map((o) => (
                        <option key={o.number} value={o.number}>
                          {o.number} — {o.title || o.material} (Supplier: {o.supplier})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="Or enter PO-..."
                      className="h-9.5 w-44 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden font-mono"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="e.g. PO-2026-0001"
                    className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden font-mono"
                  />
                )}
              </div>

              {/* Field 2: Material Type */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Material Type <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value)}
                  placeholder="e.g. Plastics (LDPE), Scrap Metal, Paper"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                />
              </div>

              {/* Field 3: Material Name & Grade */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Material Name &amp; Grade <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  placeholder="e.g. LDPE Film 98/2 Regranulate"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Volume, Pricing & Commercial Terms */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-blue-200/50 pb-2">
              <span className="inline-flex items-center rounded-xs bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 uppercase tracking-wider">
                2. Volume &amp; Pricing
              </span>
              <h3 className="font-bold text-neutral-900 text-xs">Quantity, Proposed Price &amp; Total Value</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {/* Quantity */}
              <div className="sm:col-span-2">
                <label className="block font-medium text-neutral-700">
                  Quantity You Can Supply <span className="text-rose-500">*</span>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 24.5"
                    className="h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-blue-700 focus:outline-hidden font-mono font-semibold"
                  />
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="h-9.5 w-24 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-950 focus:border-blue-700 focus:outline-hidden"
                  >
                    <option value="MT">MT</option>
                    <option value="kg">kg</option>
                    <option value="tons">tons</option>
                    <option value="bales">bales</option>
                    <option value="lots">lots</option>
                  </select>
                </div>
              </div>

              {/* Proposed Selling Price */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Unit Price <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 1450.00"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-blue-700 focus:outline-hidden font-mono font-bold"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Currency <span className="text-rose-500">*</span>
                </label>
                <div className="mt-1">
                  <CurrencySelect value={currency} onChange={setCurrency} />
                </div>
              </div>

              {/* Calculated Total Offer Value Chip */}
              <div className="sm:col-span-4 rounded-lg border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-xs text-blue-900 font-medium">Calculated Total Offer Value:</span>
                <span className="text-sm font-bold font-mono text-blue-950">
                  {currency} {Number(calculatedTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Company & Contact Information */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-indigo-200/50 pb-2">
              <span className="inline-flex items-center rounded-xs bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                3. Entity Details
              </span>
              <h3 className="font-bold text-neutral-900 text-xs">Company &amp; Authorized Contact</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Company Name */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Company / Entity Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Apex Recycled Polymers BV"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-indigo-700 focus:outline-hidden"
                />
              </div>

              {/* Contact Person */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. John Doe, Commercial Director"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-indigo-700 focus:outline-hidden"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g. +32 3 888 1234"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-indigo-700 focus:outline-hidden font-mono"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="e.g. trade@apexpolymers.com"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-indigo-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Delivery, Packaging & Logistics */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-3.5 space-y-3">
            <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
              <span className="inline-flex items-center rounded-xs bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-800 uppercase tracking-wider">
                4. Logistics
              </span>
              <h3 className="font-bold text-neutral-900 text-xs">Delivery Schedule, Packaging &amp; Route</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Delivery Date */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Proposed Delivery Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden font-mono"
                />
              </div>

              {/* Packaging Type */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Packaging Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={packagingType}
                  onChange={(e) => setPackagingType(e.target.value)}
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="Big Bags">Big Bags (1,000 kg)</option>
                  <option value="Bales">Pressed Bales</option>
                  <option value="Octabins">Octabins</option>
                  <option value="Pallets">Shrink-Wrapped Pallets</option>
                  <option value="Bulk Trailer">Bulk in Walking Floor Trailer</option>
                  <option value="Container Loose">Loose in 40ft Container</option>
                </select>
              </div>

              {/* Origin Location */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Loading Origin Location <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Bornem Warehouse, Belgium"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block font-medium text-neutral-700">
                  Destination / Delivery Point <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Rotterdam Port, Netherlands"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                />
              </div>

              {/* Transportation Details */}
              <div className="sm:col-span-2">
                <label className="block font-medium text-neutral-700">
                  Transportation Terms / Incoterms
                </label>
                <input
                  type="text"
                  value={transportDetails}
                  onChange={(e) => setTransportDetails(e.target.value)}
                  placeholder="e.g. DAP Bornem, FCA Antwerp Port, Standard Curtain-Sider Trailer"
                  className="mt-1 h-9.5 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Supporting Documents & Attachments */}
          <div className="rounded-xl border border-neutral-200 bg-white p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-xs bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-800 uppercase tracking-wider">
                  5. Evidence
                </span>
                <h3 className="font-bold text-neutral-900 text-xs">Supporting Documents &amp; Photos</h3>
              </div>
              <span className="text-[11px] text-neutral-400">PDF, JPG, PNG (Max 15MB each)</span>
            </div>

            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/60 p-4 hover:border-emerald-600 hover:bg-emerald-50/30 transition">
                <svg className="h-6 w-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="mt-1 font-semibold text-neutral-800">Click to upload material photos or spec sheets</span>
                <span className="text-[10px] text-neutral-500">Certificate of analysis, weighbridge ticket, material spec</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {attachments.length > 0 ? (
                <div className="mt-2.5 space-y-1.5">
                  {attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span>{att.kind === "image" ? "🖼️" : "📄"}</span>
                        <span className="font-medium text-neutral-900 truncate">{att.name}</span>
                        {att.byteSize ? (
                          <span className="text-[10px] text-neutral-400 font-mono">
                            ({(att.byteSize / 1024).toFixed(0)} KB)
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="text-rose-600 hover:text-rose-800 font-bold ml-2"
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Section 6: Additional Comments */}
          <div>
            <label className="block font-medium text-neutral-700">
              Additional Commercial Terms &amp; Logistics Notes (optional)
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Payment terms, trailer inspection requirements, loading slot preferences..."
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-950 focus:border-emerald-700 focus:outline-hidden"
              />
            </label>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9.5 rounded-lg border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9.5 rounded-lg bg-emerald-800 px-5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting Proposal…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Submit Selling Offer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}