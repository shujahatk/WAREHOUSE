"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { Icon } from "@/components/icons";
import {
  ATTACHMENT_KIND_LABELS,
  formatKg,
  roundKg,
  summarizeScheduleMaterials,
  type OperationScheduleAttachmentKind,
  type OperationScheduleView,
} from "@/domain/view";

const PACKAGING_OPTIONS = [
  "Big Bag",
  "Standard Pallet",
  "Pallet",
  "Octabin",
  "Loose / Bulk",
  "Steel Drum",
  "Plastic Drum",
  "Drum",
  "Box / Carton",
  "Bale",
  "IBC Tote",
  "Other",
] as const;

const UNLOADING_ATTACHMENT_KINDS: { value: OperationScheduleAttachmentKind; label: string }[] = [
  { value: "material_photo", label: "Material Photographs" },
  { value: "packaging_photo", label: "Packaging Photographs" },
  { value: "weighbridge_ticket", label: "Weighbridge Tickets" },
  { value: "delivery_document", label: "Delivery Documents" },
  { value: "annex_vii", label: "Annex VII Documents" },
  { value: "other", label: "Other Supporting Documents" },
];

const LOADING_ATTACHMENT_KINDS: { value: OperationScheduleAttachmentKind; label: string }[] = [
  { value: "before_loading_photo", label: "Photographs Before Loading" },
  { value: "during_loading_photo", label: "Photographs During Loading" },
  { value: "loaded_vehicle_photo", label: "Photographs of Loaded Vehicle" },
  { value: "weighbridge_ticket", label: "Weighbridge Tickets" },
  { value: "cmr_document", label: "CMR Documents" },
  { value: "annex_vii", label: "Annex VII Documents" },
  { value: "other", label: "Other Supporting Documents" },
];

type MaterialRow = {
  id: string;
  materialName: string;
  packagingTypeName: string;
  packageCount: number;
  tarePerPackageKg: number;
  grossWeightKg: number;
  netWeightKg: number;
};

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function WorkerScheduleModal({
  schedule,
  isOpen,
  onClose,
}: {
  schedule: OperationScheduleView | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || !schedule) return null;
  return <WorkerScheduleModalContent key={`${schedule.id}-${schedule.status}`} schedule={schedule} onClose={onClose} />;
}

function WorkerScheduleModalContent({
  schedule: initialScheduleProp,
  onClose,
}: {
  schedule: OperationScheduleView;
  onClose: () => void;
}) {
  const {
    state,
    startOperationSchedule,
    saveOperationDraft,
    submitOperationSchedule,
    uploadScheduleAttachment,
    deleteScheduleAttachment,
  } = useDemo();

  // Always read latest reactive schedule from state so uploaded attachments and status updates reflect immediately
  const schedule = useMemo(
    () => (state.schedules || []).find((s) => s.id === initialScheduleProp.id) || initialScheduleProp,
    [state.schedules, initialScheduleProp]
  );

  const isUnloading = schedule.type === "unloading";
  const attachmentCategories = isUnloading ? UNLOADING_ATTACHMENT_KINDS : LOADING_ATTACHMENT_KINDS;

  const [items, setItems] = useState<MaterialRow[]>(() => {
    if (schedule.items && schedule.items.length > 0) {
      return schedule.items.map((it) => ({
        id: it.id,
        materialName: it.materialName,
        packagingTypeName: it.packagingTypeName || "Big Bag",
        packageCount: it.packageCount,
        tarePerPackageKg: it.tarePerPackageKg,
        grossWeightKg: it.grossWeightKg,
        netWeightKg: it.netWeightKg,
      }));
    }
    return [
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`,
        materialName: "",
        packagingTypeName: "Big Bag",
        packageCount: 1,
        tarePerPackageKg: 2.5,
        grossWeightKg: 0,
        netWeightKg: 0,
      },
    ];
  });

  // Loading & Dispatch Information state
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState(
    () => schedule.vehicleRegistrationNumber || ""
  );
  const [transportCompany, setTransportCompany] = useState(() => schedule.transportCompany || "");
  const [driverName, setDriverName] = useState(() => schedule.driverName || "");
  const [driverContactNumber, setDriverContactNumber] = useState(() => schedule.driverContactNumber || "");
  const [cmrNumber, setCmrNumber] = useState(() => schedule.cmrNumber || "");
  const [actualArrivalTime, setActualArrivalTime] = useState(() =>
    toLocalDatetimeInput(schedule.actualArrivalTime)
  );
  const [actualStartTime, setActualStartTime] = useState(() =>
    toLocalDatetimeInput(schedule.actualStartTime)
  );
  const [actualEndTime, setActualEndTime] = useState(() =>
    toLocalDatetimeInput(schedule.actualEndTime)
  );

  const [remarks, setRemarks] = useState(() => schedule.workerRemarks ?? "");
  const [selectedKind, setSelectedKind] = useState<OperationScheduleAttachmentKind>(
    isUnloading ? "material_photo" : "before_loading_photo"
  );
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isScheduled = schedule.status === "scheduled";
  const isEditable =
    schedule.status === "in_progress" ||
    schedule.status === "draft" ||
    schedule.status === "returned_for_correction";
  const isSubmitted = schedule.status === "submitted" || schedule.status === "resubmitted";
  const isCompleted = schedule.status === "completed";

  // Calculations & Material-Wise Summary
  const totalGrossKg = roundKg(items.reduce((s, it) => s + (Number(it.grossWeightKg) || 0), 0));
  const totalTareKg = roundKg(
    items.reduce((s, it) => s + (Number(it.packageCount) || 0) * (Number(it.tarePerPackageKg) || 0), 0)
  );
  const totalNetKg = roundKg(items.reduce((s, it) => s + (Number(it.netWeightKg) || 0), 0));
  const totalPackages = items.reduce((s, it) => s + (Number(it.packageCount) || 0), 0);
  const materialWiseSummary = useMemo(() => summarizeScheduleMaterials(items), [items]);

  function handleItemChange(
    index: number,
    field: keyof MaterialRow,
    value: string | number
  ) {
    setItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index], [field]: value };

      if (field === "packageCount" || field === "tarePerPackageKg" || field === "grossWeightKg") {
        const count = Number(field === "packageCount" ? value : cur.packageCount) || 0;
        const tarePerUnit = Number(field === "tarePerPackageKg" ? value : cur.tarePerPackageKg) || 0;
        const gross = Number(field === "grossWeightKg" ? value : cur.grossWeightKg) || 0;
        const tareTotal = count * tarePerUnit;
        cur.netWeightKg = roundKg(Math.max(0, gross - tareTotal));
      }

      next[index] = cur;
      return next;
    });
  }

  function handleAddItem() {
    setItems((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${prev.length}`,
        materialName: "",
        packagingTypeName: "Big Bag",
        packageCount: 1,
        tarePerPackageKg: 2.5,
        grossWeightKg: 0,
        netWeightKg: 0,
      },
    ]);
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, categoryOverride?: OperationScheduleAttachmentKind) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const targetKind = categoryOverride || selectedKind;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async () => {
        const fileUrl = reader.result as string;
        await uploadScheduleAttachment({
          scheduleId: schedule.id,
          name: file.name,
          mime: file.type || "image/jpeg",
          url: fileUrl,
          size: file.size,
          kind: targetKind,
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }

  async function handleStartOperation() {
    const nowStr = toLocalDatetimeInput(new Date().toISOString());
    if (!actualStartTime) setActualStartTime(nowStr);
    await startOperationSchedule(schedule.id);
    setSuccess("Operation started! You can now record actual weights, dispatch details, and attachments.");
  }

  function buildPayload() {
    return {
      items: items.map((it) => ({
        id: it.id,
        materialName: it.materialName,
        packagingType: it.packagingTypeName,
        packagingTypeName: it.packagingTypeName,
        packageCount: Number(it.packageCount) || 0,
        tarePerPackageKg: Number(it.tarePerPackageKg) || 0,
        tareWeightKg: Number(it.tarePerPackageKg) || 0,
        grossWeightKg: Number(it.grossWeightKg) || 0,
        netWeightKg: Number(it.netWeightKg) || 0,
      })),
      workerRemarks: remarks,
      vehicleRegistrationNumber: vehicleRegistrationNumber.trim(),
      transportCompany: transportCompany.trim(),
      driverName: driverName.trim(),
      driverContactNumber: driverContactNumber.trim(),
      cmrNumber: cmrNumber.trim(),
      actualArrivalTime: actualArrivalTime ? new Date(actualArrivalTime).toISOString() : null,
      actualStartTime: actualStartTime ? new Date(actualStartTime).toISOString() : null,
      actualEndTime: actualEndTime ? new Date(actualEndTime).toISOString() : null,
    };
  }

  async function handleSaveDraft() {
    setIsSubmitting(true);
    setError(null);
    try {
      const err = await saveOperationDraft(schedule.id, buildPayload());
      if (err) {
        setError(err);
      } else {
        setSuccess("Draft saved successfully. All entered weights, dispatch details, and remarks are persisted.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    if (items.length === 0) {
      setError("At least one material entry is required.");
      setIsSubmitting(false);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.materialName.trim()) {
        setError(`Row #${i + 1}: Material Type is required.`);
        setIsSubmitting(false);
        return;
      }
      if ((Number(it.grossWeightKg) || 0) <= 0) {
        setError(`Row #${i + 1} (${it.materialName}): Gross weight must be greater than 0.`);
        setIsSubmitting(false);
        return;
      }
      if ((Number(it.netWeightKg) || 0) <= 0) {
        setError(`Row #${i + 1} (${it.materialName}): Net weight must be greater than 0.`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const payload = buildPayload();
      if (!payload.actualEndTime) {
        payload.actualEndTime = new Date().toISOString();
      }
      const err = await submitOperationSchedule(schedule.id, payload);
      if (err) {
        setError(err);
      } else {
        setSuccess("Operation submitted for Staff Verification! Editing is now locked.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit operation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  isUnloading
                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                }`}
              >
                {isUnloading ? "Unloading Schedule (Inbound)" : "Loading Schedule (Outbound)"}
              </span>
              <span className="font-mono text-base font-bold text-neutral-900">
                {schedule.scheduleNumber}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {schedule.poSoNumber} · {schedule.partnerName} · {schedule.warehouseName} · Scheduled:{" "}
              {schedule.scheduledDate.slice(0, 10)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status Feedback Messages */}
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              ⚠️ {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              ✓ {success}
            </div>
          ) : null}

          {/* Returned for Correction Alert Banner */}
          {schedule.status === "returned_for_correction" ? (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-xl">⚠️</span>
                <div>
                  <h4 className="text-sm font-bold text-amber-950">
                    Returned for Correction by Warehouse Staff
                  </h4>
                  <p className="mt-1 text-xs text-amber-900 font-medium">
                    Reason: <em>&ldquo;{schedule.returnReason || "Please review weights and attachments."}&rdquo;</em>
                  </p>
                  <p className="mt-1 text-[11px] text-amber-800">
                    Adjust the material weights, add requested photos/documents, and resubmit for verification.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Information Request Banner */}
          {schedule.infoRequestNote ? (
            <div className="rounded-xl border border-blue-300 bg-blue-50 p-3.5 text-xs text-blue-950">
              <strong>ℹ️ Additional Information Requested by Staff:</strong> {schedule.infoRequestNote}
            </div>
          ) : null}

          {/* Submitted Banner */}
          {isSubmitted ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-sm font-bold text-blue-900">
                ✓ Submitted for Staff Verification
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                This operation is locked while warehouse staff verifies your recorded weights, dispatch records, and attachments.
              </p>
            </div>
          ) : null}

          {/* Completed Banner */}
          {isCompleted ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-bold text-emerald-900">
                ✓ Verified and Completed by Staff
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                Operational records verified. Warehouse stock balances have been updated.
              </p>
            </div>
          ) : null}

          {/* Scheduled State Action Callout */}
          {isScheduled ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center">
              <p className="text-sm font-bold text-neutral-800">
                Ready to begin {isUnloading ? "unloading" : "loading"}?
              </p>
              <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                Clicking Start Operation will transition this schedule to In Progress, enabling you to record actual weights, vehicle &amp; driver info, photos, documents, and operational remarks.
              </p>
              <button
                type="button"
                onClick={handleStartOperation}
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 text-sm font-bold text-white shadow-xs hover:bg-emerald-900 transition active:scale-95"
              >
                <Icon name="check" />
                Start Operation
              </button>
            </div>
          ) : null}

          {/* SECTION A: Purchase / Sales & Schedule Details (Staff Controlled) */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-3 border-b border-neutral-200 pb-1.5">
              A. {isUnloading ? "Purchase & Supplier Details" : "Sales & Customer Details"} (Staff Assigned)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <span className="text-neutral-500 block">{isUnloading ? "PO Number" : "SO Number"}</span>
                <span className="font-bold text-neutral-900">{schedule.poSoNumber}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">{isUnloading ? "Supplier" : "Customer / Buyer"}</span>
                <span className="font-semibold text-neutral-900">{schedule.partnerName}</span>
              </div>
              {isUnloading ? (
                <>
                  <div>
                    <span className="text-neutral-500 block">Purchaser Name</span>
                    <span className="font-semibold text-neutral-900">{schedule.purchaserName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Pickup Date</span>
                    <span className="font-semibold text-neutral-900">
                      {schedule.pickupDate ? schedule.pickupDate.slice(0, 10) : "—"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-neutral-500 block">Seller Name</span>
                    <span className="font-semibold text-neutral-900">{schedule.sellerName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Origin Warehouse</span>
                    <span className="font-semibold text-neutral-900">{schedule.warehouseName}</span>
                  </div>
                </>
              )}
              <div>
                <span className="text-neutral-500 block">Origin</span>
                <span className="font-semibold text-neutral-900">{schedule.origin || "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Destination</span>
                <span className="font-semibold text-neutral-900">{schedule.destination || "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Warehouse</span>
                <span className="font-semibold text-neutral-900">{schedule.warehouseName}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Annex VII</span>
                <span className="font-semibold text-neutral-900">
                  {schedule.annex7Required ? "Yes (Required)" : "No"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">
                  {isUnloading ? "Scheduled Unloading Date" : "Scheduled Loading Date"}
                </span>
                <span className="font-semibold text-neutral-900">{schedule.scheduledDate.slice(0, 10)}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Assigned Worker</span>
                <span className="font-semibold text-neutral-900">{schedule.assignedWorkerName}</span>
              </div>
            </div>
            {schedule.instructions ? (
              <div className="mt-3 pt-2.5 border-t border-neutral-200">
                <span className="text-neutral-500 font-semibold">Staff Instructions: </span>
                <span className="text-neutral-800">{schedule.instructions}</span>
              </div>
            ) : null}
          </div>

          {/* SECTION B: Actual Material Details — Entered by Worker */}
          {(isEditable || isSubmitted || isCompleted) && (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    B. Actual Material Details ({items.length} {items.length === 1 ? "Entry" : "Entries"})
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Net Weight = Gross Weight − (Number of Packages × Packaging Tare Weight)
                  </p>
                </div>
                {isEditable ? (
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800"
                  >
                    + Add Another Material
                  </button>
                ) : null}
              </div>

              {/* Items Card List */}
              <div className="space-y-3">
                {items.map((row, idx) => {
                  const rowTareTotal = roundKg(
                    (Number(row.packageCount) || 0) * (Number(row.tarePerPackageKg) || 0)
                  );

                  return (
                    <div
                      key={row.id || idx}
                      className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-3.5 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-700">
                          Material Entry #{idx + 1}
                        </span>
                        {isEditable && items.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                          >
                            Remove Entry
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {/* Material Type */}
                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Material Type *
                          </label>
                          <input
                            type="text"
                            disabled={!isEditable}
                            value={row.materialName}
                            onChange={(e) => handleItemChange(idx, "materialName", e.target.value)}
                            placeholder="e.g. Copper Scrap #1 or HDPE Pellets"
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          />
                        </div>

                        {/* Packaging Type */}
                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Packaging Type
                          </label>
                          <select
                            disabled={!isEditable}
                            value={row.packagingTypeName}
                            onChange={(e) => handleItemChange(idx, "packagingTypeName", e.target.value)}
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          >
                            {PACKAGING_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Weight Breakdown Fields */}
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Number of Packages
                          </label>
                          <input
                            type="number"
                            min="1"
                            disabled={!isEditable}
                            value={row.packageCount}
                            onChange={(e) =>
                              handleItemChange(idx, "packageCount", Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Packaging Tare Weight (kg)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            disabled={!isEditable}
                            value={row.tarePerPackageKg}
                            onChange={(e) =>
                              handleItemChange(idx, "tarePerPackageKg", Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-neutral-600 block mb-1">
                            Gross Weight (kg) *
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            disabled={!isEditable}
                            value={row.grossWeightKg}
                            onChange={(e) =>
                              handleItemChange(idx, "grossWeightKg", Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            placeholder="Scale gross kg"
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          />
                        </div>

                        <div className="rounded-lg bg-emerald-50/70 border border-emerald-200/80 p-2 text-center">
                          <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                            Net Weight (kg)
                          </span>
                          <span className="text-sm font-bold text-emerald-950">
                            {formatKg(row.netWeightKg)}
                          </span>
                          <span className="text-[10px] text-neutral-500 block">
                            Total Tare: {formatKg(rowTareTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION C (Loading & Dispatch Information) */}
          {(isEditable || isSubmitted || isCompleted) && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
              <div className="border-b border-neutral-200 pb-2">
                <h3 className="text-sm font-bold text-neutral-900">
                  C. {isUnloading ? "Transport, Arrival & Operation Timestamps" : "Loading & Dispatch Information"}
                </h3>
                <p className="text-xs text-neutral-500">
                  Record vehicle registration, transport company, driver details, timestamps, and CMR reference.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                {/* Vehicle Registration Number */}
                <div>
                  <label className="font-semibold text-neutral-700 block mb-1">
                    Vehicle Registration Number
                  </label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={vehicleRegistrationNumber}
                    onChange={(e) => setVehicleRegistrationNumber(e.target.value)}
                    placeholder="e.g. 1-ABC-987"
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 uppercase outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* Transport Company */}
                <div>
                  <label className="font-semibold text-neutral-700 block mb-1">
                    Transport Company
                  </label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={transportCompany}
                    onChange={(e) => setTransportCompany(e.target.value)}
                    placeholder="e.g. EuroFreight Logistics"
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* Driver Name */}
                <div>
                  <label className="font-semibold text-neutral-700 block mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Marc Peeters"
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* Driver Contact Number */}
                <div>
                  <label className="font-semibold text-neutral-700 block mb-1">
                    Driver Contact Number
                  </label>
                  <input
                    type="tel"
                    disabled={!isEditable}
                    value={driverContactNumber}
                    onChange={(e) => setDriverContactNumber(e.target.value)}
                    placeholder="e.g. +32 470 12 34 56"
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* Actual Arrival Time */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700">Actual Arrival Time</label>
                    {isEditable ? (
                      <button
                        type="button"
                        onClick={() => setActualArrivalTime(toLocalDatetimeInput(new Date().toISOString()))}
                        className="text-[10px] font-bold text-emerald-700 hover:underline"
                      >
                        Now
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="datetime-local"
                    disabled={!isEditable}
                    value={actualArrivalTime}
                    onChange={(e) => setActualArrivalTime(e.target.value)}
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* Actual Loading/Unloading Start Time */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700">
                      {isUnloading ? "Actual Unloading Start Time" : "Actual Loading Start Time"}
                    </label>
                    {isEditable ? (
                      <button
                        type="button"
                        onClick={() => setActualStartTime(toLocalDatetimeInput(new Date().toISOString()))}
                        className="text-[10px] font-bold text-emerald-700 hover:underline"
                      >
                        Now
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="datetime-local"
                    disabled={!isEditable}
                    value={actualStartTime}
                    onChange={(e) => setActualStartTime(e.target.value)}
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* Actual Loading/Unloading Completion Time */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700">
                      {isUnloading ? "Actual Completion Time" : "Actual Loading Completion Time"}
                    </label>
                    {isEditable ? (
                      <button
                        type="button"
                        onClick={() => setActualEndTime(toLocalDatetimeInput(new Date().toISOString()))}
                        className="text-[10px] font-bold text-emerald-700 hover:underline"
                      >
                        Now
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="datetime-local"
                    disabled={!isEditable}
                    value={actualEndTime}
                    onChange={(e) => setActualEndTime(e.target.value)}
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>

                {/* CMR Number / Reference */}
                <div>
                  <label className="font-semibold text-neutral-700 block mb-1">
                    CMR Number / Reference
                  </label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={cmrNumber}
                    onChange={(e) => setCmrNumber(e.target.value)}
                    placeholder="e.g. CMR-2026-88412"
                    className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 uppercase outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION D: Categorized Photographs, Documents & Operational Remarks */}
          {(isEditable || isSubmitted || isCompleted) && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    D. {isUnloading ? "Unloading Attachments" : "Loading Attachments"} &amp; Operational Remarks
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {isUnloading
                      ? "Upload material photos, packaging photos, weighbridge tickets, delivery docs, Annex VII & supporting documents."
                      : "Upload photos before/during/after loading, weighbridge tickets, CMR documents, Annex VII & supporting documents."}
                  </p>
                </div>

                {isEditable ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedKind}
                      onChange={(e) => setSelectedKind(e.target.value as OperationScheduleAttachmentKind)}
                      className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-800 outline-none"
                    >
                      {attachmentCategories.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-900">
                      <span>📷 Upload Photo / PDF</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        onChange={(e) => handleFileUpload(e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              {/* Category Upload Cards Grid */}
              {isEditable && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {attachmentCategories.map((cat) => {
                    const count = (schedule.attachments || []).filter((a) => a.kind === cat.value).length;
                    return (
                      <label
                        key={cat.value}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border p-2.5 text-xs transition hover:border-emerald-500 ${
                          count > 0
                            ? "border-emerald-200 bg-emerald-50/50 text-emerald-950"
                            : "border-neutral-200 bg-neutral-50 text-neutral-700"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold block truncate">{cat.label}</span>
                          <span className="text-[10px] text-neutral-500">
                            {count} file{count === 1 ? "" : "s"} uploaded
                          </span>
                        </div>
                        <span className="shrink-0 rounded bg-white border border-neutral-300 px-2 py-1 text-[10px] font-bold text-neutral-800 shadow-2xs">
                          + Add
                        </span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          multiple
                          onChange={(e) => handleFileUpload(e, cat.value)}
                          className="hidden"
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Attachments Gallery */}
              {schedule.attachments && schedule.attachments.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {schedule.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="group relative rounded-lg border border-neutral-200 bg-neutral-50 p-2 overflow-hidden shadow-2xs"
                    >
                      {att.mime.startsWith("image/") ? (
                        <button
                          type="button"
                          onClick={() => setEnlargedImage(att.url)}
                          className="h-24 w-full overflow-hidden rounded bg-neutral-200 flex items-center justify-center cursor-zoom-in"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.url}
                            alt={att.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition"
                          />
                        </button>
                      ) : (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-24 w-full flex-col items-center justify-center rounded bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                        >
                          <span className="text-2xl">📄</span>
                          <span className="mt-1 text-[10px] font-bold uppercase">
                            {att.mime.includes("pdf") ? "PDF Document" : "Document"}
                          </span>
                        </a>
                      )}

                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-neutral-800 truncate" title={att.name}>
                          {att.name}
                        </span>
                        {isEditable ? (
                          <button
                            type="button"
                            onClick={() => deleteScheduleAttachment(att.id)}
                            className="text-rose-600 hover:text-rose-800 font-bold ml-1"
                            title="Delete attachment"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>

                      <span className="text-[10px] font-semibold text-emerald-800 block truncate">
                        {ATTACHMENT_KIND_LABELS[att.kind] || att.kind.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-neutral-300 py-5 text-center text-xs text-neutral-500">
                  No photos or supporting documents uploaded yet.
                </p>
              )}

              {/* Operational Remarks */}
              <div className="space-y-1.5 pt-2 border-t border-neutral-200">
                <label className="text-xs font-bold text-neutral-900 block">
                  Operational Remarks
                </label>
                <textarea
                  disabled={!isEditable}
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Note any damaged packaging, container condition, seal discrepancy, demurrage delay, or warehouse observations..."
                  className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                />
              </div>
            </div>
          )}

          {/* SECTION E: Calculations & Material-Wise Weight Summary */}
          {(isEditable || isSubmitted || isCompleted) && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-950 border-b border-emerald-200 pb-2">
                E. {isUnloading ? "Unloading Calculations" : "Loading Calculations"} &amp; Material-Wise Weight Summary
              </h3>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                <div className="rounded-lg border border-neutral-200 bg-white p-2.5">
                  <span className="text-[11px] font-semibold text-neutral-500 block">Total Package Quantity</span>
                  <span className="text-base font-bold text-neutral-900">{totalPackages}</span>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white p-2.5">
                  <span className="text-[11px] font-semibold text-neutral-500 block">Total Gross Weight</span>
                  <span className="text-base font-bold text-neutral-900">{formatKg(totalGrossKg)}</span>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white p-2.5">
                  <span className="text-[11px] font-semibold text-neutral-500 block">Total Packaging Tare</span>
                  <span className="text-base font-bold text-neutral-700">{formatKg(totalTareKg)}</span>
                </div>
                <div className="rounded-lg border border-emerald-300 bg-emerald-100/70 p-2.5">
                  <span className="text-[11px] font-bold text-emerald-800 block">Total Net Weight</span>
                  <span className="text-base font-bold text-emerald-950">{formatKg(totalNetKg)}</span>
                </div>
              </div>

              {/* Material-Wise Weight Summary Table */}
              {materialWiseSummary.length > 0 && (
                <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                  <div className="bg-neutral-50 px-3 py-1.5 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                    Material-Wise Weight Summary
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-100 text-neutral-500">
                      <tr>
                        <th className="px-3 py-1.5">Material Type</th>
                        <th className="px-3 py-1.5 text-right">Packages</th>
                        <th className="px-3 py-1.5 text-right">Gross Weight</th>
                        <th className="px-3 py-1.5 text-right">Tare Weight</th>
                        <th className="px-3 py-1.5 text-right">Net Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {materialWiseSummary.map((m) => (
                        <tr key={m.materialName}>
                          <td className="px-3 py-1.5 font-semibold text-neutral-900">{m.materialName}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{m.totalPackageCount}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatKg(m.totalGrossWeightKg)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatKg(m.totalTareWeightKg)}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-emerald-800 tabular-nums">
                            {formatKg(m.totalNetWeightKg)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>

          {isEditable ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveDraft}
                className="h-10 rounded-xl border border-neutral-300 bg-white px-4 text-xs font-bold text-neutral-800 shadow-2xs hover:bg-neutral-50 active:scale-95 transition"
              >
                Save as Draft
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="h-10 rounded-xl bg-emerald-800 px-5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 active:scale-95 transition"
              >
                Submit for Verification →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Enlarged Image Preview Dialog */}
      {enlargedImage ? (
        <div
          onClick={() => setEnlargedImage(null)}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedImage}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}
