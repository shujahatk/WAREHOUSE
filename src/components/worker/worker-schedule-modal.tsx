"use client";

import { useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
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

const UNLOADING_ATTACHMENT_KINDS: { value: OperationScheduleAttachmentKind; label: string; icon: string }[] = [
  { value: "material_photo", label: "Material Photo", icon: "📦" },
  { value: "packaging_photo", label: "Packaging Photo", icon: "🏷️" },
  { value: "weighbridge_ticket", label: "Weighbridge Ticket", icon: "⚖️" },
  { value: "delivery_document", label: "Delivery Note", icon: "📄" },
  { value: "annex_vii", label: "Annex VII Doc", icon: "🛡️" },
  { value: "other", label: "Other Document", icon: "📎" },
];

const LOADING_ATTACHMENT_KINDS: { value: OperationScheduleAttachmentKind; label: string; icon: string }[] = [
  { value: "before_loading_photo", label: "Before Loading", icon: "📸" },
  { value: "during_loading_photo", label: "During Loading", icon: "📸" },
  { value: "loaded_vehicle_photo", label: "Loaded Vehicle", icon: "🚛" },
  { value: "weighbridge_ticket", label: "Weighbridge Ticket", icon: "⚖️" },
  { value: "cmr_document", label: "CMR Document", icon: "📄" },
  { value: "annex_vii", label: "Annex VII Doc", icon: "🛡️" },
  { value: "other", label: "Other Document", icon: "📎" },
];

const PRESET_REMARKS = [
  "✓ Packaging intact & good condition",
  "⚠️ Minor pallet/bag damage noted",
  "⏱️ Driver waiting / Demurrage delay",
  "📦 Container seal verified and intact",
  "⚖️ Scale recalibrated before weighing",
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

type StepKey = "overview" | "materials" | "photos" | "summary";

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

  // Always read latest reactive schedule from state
  const schedule = useMemo(
    () => (state.schedules || []).find((s) => s.id === initialScheduleProp.id) || initialScheduleProp,
    [state.schedules, initialScheduleProp]
  );

  const isUnloading = schedule.type === "unloading";
  const attachmentCategories = isUnloading ? UNLOADING_ATTACHMENT_KINDS : LOADING_ATTACHMENT_KINDS;

  // Active Wizard Step
  const [activeStep, setActiveStep] = useState<StepKey>("overview");
  const [showOrderSpecs, setShowOrderSpecs] = useState(false);

  // Material rows
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

  // Transport details
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

  // Attachments and remarks
  const [remarks, setRemarks] = useState(() => schedule.workerRemarks ?? "");
  const [selectedKind, setSelectedKind] = useState<OperationScheduleAttachmentKind>(
    isUnloading ? "material_photo" : "before_loading_photo"
  );
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Hidden file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isScheduled = schedule.status === "scheduled";
  const isEditable =
    schedule.status === "in_progress" ||
    schedule.status === "draft" ||
    schedule.status === "returned_for_correction";
  const isSubmitted = schedule.status === "submitted" || schedule.status === "resubmitted";
  const isCompleted = schedule.status === "completed";

  // Calculations
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

  async function processFiles(fileList: FileList | File[], categoryOverride?: OperationScheduleAttachmentKind) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const targetKind = categoryOverride || selectedKind;

    setUploadingCount((prev) => prev + files.length);
    setError(null);

    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) {
        setError(`File ${file.name} exceeds the 15 MB limit.`);
        setUploadingCount((prev) => Math.max(0, prev - 1));
        continue;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileUrl = reader.result as string;
          await uploadScheduleAttachment({
            scheduleId: schedule.id,
            name: file.name,
            mime: file.type || "image/jpeg",
            url: fileUrl,
            size: file.size,
            kind: targetKind,
          });
        } catch (ex) {
          setError(ex instanceof Error ? ex.message : `Failed to upload ${file.name}`);
        } finally {
          setUploadingCount((prev) => Math.max(0, prev - 1));
        }
      };
      reader.onerror = () => {
        setError(`Failed reading ${file.name}`);
        setUploadingCount((prev) => Math.max(0, prev - 1));
      };
      reader.readAsDataURL(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (!isEditable) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  }

  async function handleStartOperation() {
    const nowStr = toLocalDatetimeInput(new Date().toISOString());
    if (!actualStartTime) setActualStartTime(nowStr);
    await startOperationSchedule(schedule.id);
    setSuccess("Operation started! Weights, dispatch details, and photos can now be recorded.");
    setActiveStep("materials");
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
        setSuccess("Draft saved successfully.");
        setTimeout(() => setSuccess(null), 3000);
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
        setError(`Material Entry #${i + 1}: Material Type is required.`);
        setActiveStep("materials");
        setIsSubmitting(false);
        return;
      }
      if ((Number(it.grossWeightKg) || 0) <= 0) {
        setError(`Material Entry #${i + 1} (${it.materialName}): Gross weight must be greater than 0.`);
        setActiveStep("materials");
        setIsSubmitting(false);
        return;
      }
      if ((Number(it.netWeightKg) || 0) <= 0) {
        setError(`Material Entry #${i + 1} (${it.materialName}): Net weight must be greater than 0.`);
        setActiveStep("materials");
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

  // Visual status indicators
  const statusMeta = {
    scheduled: { label: "Scheduled", badge: "bg-blue-100 text-blue-900 border-blue-200", icon: "🗓️" },
    in_progress: { label: "In Progress", badge: "bg-purple-100 text-purple-900 border-purple-300", icon: "⚡" },
    draft: { label: "Draft Saved", badge: "bg-amber-100 text-amber-900 border-amber-300", icon: "📝" },
    returned_for_correction: { label: "Correction Required", badge: "bg-rose-100 text-rose-950 border-rose-300 animate-pulse", icon: "⚠️" },
    submitted: { label: "Staff Verification Pending", badge: "bg-blue-100 text-blue-900 border-blue-300", icon: "⏳" },
    resubmitted: { label: "Resubmitted", badge: "bg-indigo-100 text-indigo-900 border-indigo-300", icon: "⏳" },
    completed: { label: "Completed & Verified", badge: "bg-emerald-100 text-emerald-900 border-emerald-300", icon: "✓" },
  }[schedule.status] || { label: schedule.status, badge: "bg-neutral-100 text-neutral-800", icon: "•" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[96vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-neutral-200">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-neutral-200/90 px-4 py-3 sm:px-6 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide border ${
                isUnloading
                  ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                  : "bg-blue-100 text-blue-900 border-blue-300"
              }`}
            >
              <span>{isUnloading ? "↓ INBOUND UNLOADING" : "↑ OUTBOUND LOADING"}</span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-neutral-900 sm:text-base">
                  {schedule.scheduleNumber}
                </span>
                <span className="text-neutral-400">·</span>
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-semibold text-neutral-800">
                  {schedule.poSoNumber}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${statusMeta.badge}`}>
              <span>{statusMeta.icon}</span>
              <span>{statusMeta.label}</span>
            </span>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 transition"
              title="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 4-Step Visual Progress Stepper */}
        <div className="border-b border-neutral-200 bg-white px-3 py-2 sm:px-6">
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {[
              { id: "overview" as const, label: "1. Logistics", short: "1. Info", count: vehicleRegistrationNumber ? "✓" : "" },
              { id: "materials" as const, label: "2. Materials & Tare", short: "2. Items", count: `${items.length}` },
              { id: "photos" as const, label: "3. Photos & Evidence", short: "3. Photos", count: `${schedule.attachments?.length || 0}` },
              { id: "summary" as const, label: "4. Summary", short: "4. Done", count: isCompleted ? "✓" : "" },
            ].map((step) => {
              const isCurrent = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-xs font-bold transition ${
                    isCurrent
                      ? "bg-neutral-900 text-white shadow-2xs"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80"
                  }`}
                >
                  <span className="sm:hidden truncate">{step.short}</span>
                  <span className="hidden sm:inline truncate">{step.label}</span>
                  {step.count ? (
                    <span
                      className={`hidden sm:inline-flex rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isCurrent ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-800"
                      }`}
                    >
                      {step.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback Messages */}
        {error ? (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-900 flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800">
              ✕
            </button>
          </div>
        ) : null}

        {success ? (
          <div className="mx-4 mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-900 flex items-center justify-between">
            <span>✓ {success}</span>
            <button type="button" onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-900">
              ✕
            </button>
          </div>
        ) : null}

        {/* Returned for Correction Priority Banner */}
        {schedule.status === "returned_for_correction" ? (
          <div className="mx-4 mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <span className="text-lg">⚠️</span>
              <div className="text-xs">
                <span className="font-bold text-amber-950 block">Staff Correction Request:</span>
                <p className="mt-0.5 text-amber-900 italic font-medium">
                  &ldquo;{schedule.returnReason || "Please adjust recorded weights and provide missing tickets/photos."}&rdquo;
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Scrollable Step Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* STEP 1: LOGISTICS & OVERVIEW */}
          {activeStep === "overview" && (
            <div className="space-y-4">
              {/* Ready to Start Callout if Scheduled */}
              {isScheduled && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950">
                      Ready to begin {isUnloading ? "unloading" : "loading"}?
                    </h4>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Start operation to record scale weights, driver details, and photograph documentation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartOperation}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition active:scale-95 shrink-0"
                  >
                    <span>⚡</span>
                    <span>Start Operation</span>
                  </button>
                </div>
              )}

              {/* Collapsible Order Specifications */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                      Order Specifications
                    </span>
                    <span className="text-xs text-neutral-500">
                      ({schedule.partnerName} · {schedule.warehouseName})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOrderSpecs((v) => !v)}
                    className="text-xs font-bold text-emerald-800 hover:text-emerald-950"
                  >
                    {showOrderSpecs ? "Hide Details ▲" : "Show Full Details ▼"}
                  </button>
                </div>

                {showOrderSpecs && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-neutral-200/80 pt-3 text-xs">
                    <div>
                      <span className="text-neutral-500 block">{isUnloading ? "Supplier" : "Customer"}</span>
                      <span className="font-bold text-neutral-900">{schedule.partnerName}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">{isUnloading ? "Purchaser" : "Seller"}</span>
                      <span className="font-semibold text-neutral-900">
                        {isUnloading ? schedule.purchaserName || "—" : schedule.sellerName || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Scheduled Date</span>
                      <span className="font-semibold text-neutral-900">{schedule.scheduledDate.slice(0, 10)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Warehouse</span>
                      <span className="font-semibold text-neutral-900">{schedule.warehouseName}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Origin</span>
                      <span className="font-semibold text-neutral-900">{schedule.origin || "—"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Destination</span>
                      <span className="font-semibold text-neutral-900">{schedule.destination || "—"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Annex VII</span>
                      <span className="font-semibold text-neutral-900">
                        {schedule.annex7Required ? "Yes (Required)" : "No"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Assigned Worker</span>
                      <span className="font-semibold text-neutral-900">{schedule.assignedWorkerName}</span>
                    </div>
                    {schedule.instructions ? (
                      <div className="col-span-2 sm:col-span-4 border-t border-neutral-200 pt-2">
                        <span className="text-neutral-500 font-semibold">Staff Instructions: </span>
                        <span className="text-neutral-800">{schedule.instructions}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Transport, Driver & Timestamps Form */}
              <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                    Vehicle, Driver &amp; Timestamps
                  </h4>
                  <span className="text-[11px] text-neutral-500">CMR reference &amp; operational times</span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div>
                    <label className="font-semibold text-neutral-700 block mb-1">Vehicle Plate</label>
                    <input
                      type="text"
                      disabled={!isEditable}
                      value={vehicleRegistrationNumber}
                      onChange={(e) => setVehicleRegistrationNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. 1-ABC-987"
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs font-mono uppercase text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 block mb-1">Transport Carrier</label>
                    <input
                      type="text"
                      disabled={!isEditable}
                      value={transportCompany}
                      onChange={(e) => setTransportCompany(e.target.value)}
                      placeholder="e.g. EuroLogistics NV"
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 block mb-1">Driver Name</label>
                    <input
                      type="text"
                      disabled={!isEditable}
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="e.g. Marc Peeters"
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 block mb-1">Driver Phone</label>
                    <input
                      type="tel"
                      disabled={!isEditable}
                      value={driverContactNumber}
                      onChange={(e) => setDriverContactNumber(e.target.value)}
                      placeholder="e.g. +32 470 12 34 56"
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 block mb-1">CMR Number</label>
                    <input
                      type="text"
                      disabled={!isEditable}
                      value={cmrNumber}
                      onChange={(e) => setCmrNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. CMR-2026-99"
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs font-mono uppercase text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-neutral-700">Arrival Time</label>
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
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-neutral-700">Start Time</label>
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
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-neutral-700">Completion Time</label>
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
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MATERIALS & TARE WEIGHTS */}
          {activeStep === "materials" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/80 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Recorded Materials ({items.length} {items.length === 1 ? "Line" : "Lines"})
                  </h3>
                  <span className="text-xs text-neutral-500">
                    Net Weight = Gross Weight − (Package Count × Tare Per Package)
                  </span>
                </div>

                {isEditable && (
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-900 transition"
                  >
                    <span>+ Add Material</span>
                  </button>
                )}
              </div>

              {/* Material Input Cards */}
              <div className="space-y-3">
                {items.map((row, idx) => {
                  const rowTareTotal = roundKg(
                    (Number(row.packageCount) || 0) * (Number(row.tarePerPackageKg) || 0)
                  );

                  return (
                    <div
                      key={row.id || idx}
                      className="rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-3.5 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-800">
                          Material Line #{idx + 1}
                        </span>
                        {isEditable && items.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                            Material Name / Grade *
                          </label>
                          <input
                            type="text"
                            disabled={!isEditable}
                            value={row.materialName}
                            onChange={(e) => handleItemChange(idx, "materialName", e.target.value)}
                            placeholder="e.g. Copper Scrap #1 or HDPE Regrind"
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                            Packaging Type
                          </label>
                          <select
                            disabled={!isEditable}
                            value={row.packagingTypeName}
                            onChange={(e) => handleItemChange(idx, "packagingTypeName", e.target.value)}
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
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
                          <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                            Package Count
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
                          <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                            Tare / Pkg (kg)
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
                          <label className="text-[11px] font-semibold text-neutral-700 block mb-1">
                            Gross Scale (kg) *
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
                            placeholder="Scale kg"
                            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                          />
                        </div>

                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center flex flex-col justify-center">
                          <span className="text-[10px] font-bold uppercase text-emerald-800">
                            Net Weight
                          </span>
                          <span className="text-sm font-bold text-emerald-950">
                            {formatKg(row.netWeightKg)}
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            Tare: {formatKg(rowTareTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Tally Bar */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-bold text-emerald-950">Totals for {items.length} Line(s):</span>
                <div className="flex items-center gap-4">
                  <span>Packages: <strong className="text-neutral-900">{totalPackages}</strong></span>
                  <span>Gross: <strong className="text-neutral-900">{formatKg(totalGrossKg)}</strong></span>
                  <span>Tare: <strong className="text-neutral-900">{formatKg(totalTareKg)}</strong></span>
                  <span className="rounded bg-emerald-800 text-white px-2 py-0.5 font-bold">
                    Net: {formatKg(totalNetKg)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PHOTOS & EVIDENCE */}
          {activeStep === "photos" && (
            <div className="space-y-4">
              {/* Category selector & Fast upload buttons */}
              {isEditable && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/80 pb-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                        Upload Photos &amp; Documents
                      </h4>
                      <span className="text-[11px] text-neutral-500">
                        Camera capture on mobile or drag files directly below
                      </span>
                    </div>

                    {uploadingCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                        <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                        Uploading {uploadingCount} file(s)...
                      </span>
                    ) : null}
                  </div>

                  {/* Target Category Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {attachmentCategories.map((cat) => {
                      const count = (schedule.attachments || []).filter((a) => a.kind === cat.value).length;
                      const isSelected = selectedKind === cat.value;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setSelectedKind(cat.value)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                            isSelected
                              ? "bg-emerald-800 text-white border-emerald-900 shadow-2xs"
                              : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
                          }`}
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                          {count > 0 ? (
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                isSelected ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-800"
                              }`}
                            >
                              {count}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {/* Drag & Drop Zone with Direct Action Buttons */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    className={`rounded-xl border-2 border-dashed p-4 text-center transition ${
                      isDragOver
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-neutral-300 bg-neutral-50/70 hover:border-neutral-400"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl">📸</span>
                      <p className="text-xs font-bold text-neutral-800">
                        Add photo or document for: <span className="text-emerald-800 underline">{ATTACHMENT_KIND_LABELS[selectedKind] || selectedKind}</span>
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Take a photo with your device camera or choose from gallery / files
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                        {/* Camera input for mobile phones */}
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 active:scale-95 transition"
                        >
                          <span>📷</span>
                          <span>Take Photo</span>
                        </button>

                        {/* File browser for PDFs and multi-photo selection */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-bold text-neutral-800 shadow-2xs hover:bg-neutral-50 active:scale-95 transition"
                        >
                          <span>📁</span>
                          <span>Browse Files / PDF</span>
                        </button>
                      </div>

                      {/* Hidden native inputs */}
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          if (e.target.files) void processFiles(e.target.files);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) void processFiles(e.target.files);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Gallery of Uploaded Files */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                    Uploaded Evidence ({schedule.attachments?.length || 0})
                  </span>
                </div>

                {schedule.attachments && schedule.attachments.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {schedule.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="group relative rounded-xl border border-neutral-200 bg-white p-2 overflow-hidden shadow-2xs"
                      >
                        {att.mime.startsWith("image/") ? (
                          <button
                            type="button"
                            onClick={() => setEnlargedImage(att.url)}
                            className="h-28 w-full overflow-hidden rounded-lg bg-neutral-100 flex items-center justify-center cursor-zoom-in"
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
                            className="flex h-28 w-full flex-col items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                          >
                            <span className="text-3xl">📄</span>
                            <span className="mt-1 text-[10px] font-bold uppercase text-neutral-600">
                              PDF Document
                            </span>
                          </a>
                        )}

                        <div className="mt-1.5 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-neutral-900 truncate" title={att.name}>
                            {att.name}
                          </span>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => deleteScheduleAttachment(att.id)}
                              className="text-rose-600 hover:text-rose-800 font-bold ml-1"
                              title="Delete attachment"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <span className="text-[10px] font-semibold text-emerald-800 block truncate">
                          {ATTACHMENT_KIND_LABELS[att.kind] || att.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-neutral-300 py-6 text-center text-xs text-neutral-500">
                    No photos or supporting documents uploaded yet.
                  </p>
                )}
              </div>

              {/* Operational Remarks with Quick Preset Tags */}
              <div className="space-y-2 border-t border-neutral-200/80 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-800">
                    Operational Remarks
                  </label>
                  <span className="text-[11px] text-neutral-500">Tap quick tag or type notes</span>
                </div>

                {isEditable && (
                  <div className="flex flex-wrap gap-1">
                    {PRESET_REMARKS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setRemarks((cur) => (cur ? `${cur}\n${preset}` : preset));
                        }}
                        className="rounded-md border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  disabled={!isEditable}
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Record package damage, scale tare notes, demurrage delay, seal numbers, or warehouse observations..."
                  className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-xs text-neutral-900 outline-none focus:border-emerald-600 disabled:bg-neutral-100"
                />
              </div>
            </div>
          )}

          {/* STEP 4: SUMMARY & SUBMISSION */}
          {activeStep === "summary" && (
            <div className="space-y-4">
              <div className="border-b border-neutral-200/80 pb-2">
                <h3 className="text-sm font-bold text-neutral-900">
                  Operation Verification Summary
                </h3>
                <span className="text-xs text-neutral-500">
                  Review calculated weights and evidence before submitting to warehouse staff
                </span>
              </div>

              {/* 4 KPI cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[11px] font-semibold text-neutral-600 block">Total Packages</span>
                  <span className="text-lg font-bold text-neutral-900">{totalPackages}</span>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[11px] font-semibold text-neutral-600 block">Gross Weight</span>
                  <span className="text-lg font-bold text-neutral-900">{formatKg(totalGrossKg)}</span>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[11px] font-semibold text-neutral-600 block">Packaging Tare</span>
                  <span className="text-lg font-bold text-neutral-700">{formatKg(totalTareKg)}</span>
                </div>
                <div className="rounded-xl border border-emerald-300 bg-emerald-100/70 p-3">
                  <span className="text-[11px] font-bold text-emerald-800 block">Net Weight</span>
                  <span className="text-lg font-bold text-emerald-950">{formatKg(totalNetKg)}</span>
                </div>
              </div>

              {/* Material Breakdown Table */}
              {materialWiseSummary.length > 0 && (
                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-2xs">
                  <div className="bg-neutral-50 px-3.5 py-2 border-b border-neutral-200 text-xs font-bold uppercase tracking-wider text-neutral-700">
                    Material-Wise Breakdown
                  </div>
                  {/* Mobile Stacked Cards (No horizontal scrolling) */}
                  <div className="divide-y divide-neutral-100 sm:hidden">
                    {materialWiseSummary.map((m) => (
                      <div key={m.materialName} className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-900">{m.materialName}</span>
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                            {m.totalPackageCount} pkgs
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div className="rounded-lg bg-neutral-50 p-1.5 text-center">
                            <span className="text-[10px] text-neutral-400 block">Gross</span>
                            <span className="font-semibold text-neutral-800">{formatKg(m.totalGrossWeightKg)}</span>
                          </div>
                          <div className="rounded-lg bg-neutral-50 p-1.5 text-center">
                            <span className="text-[10px] text-neutral-400 block">Tare</span>
                            <span className="font-semibold text-neutral-800">{formatKg(m.totalTareWeightKg)}</span>
                          </div>
                          <div className="rounded-lg bg-emerald-50 p-1.5 text-center">
                            <span className="text-[10px] text-emerald-600 block">Net</span>
                            <span className="font-bold text-emerald-900">{formatKg(m.totalNetWeightKg)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tablet and Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto w-full">
                    <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-100 text-neutral-500 bg-neutral-50/50">
                      <tr>
                        <th className="px-3.5 py-2">Material Name</th>
                        <th className="px-3 py-2 text-right">Packages</th>
                        <th className="px-3 py-2 text-right">Gross (kg)</th>
                        <th className="px-3 py-2 text-right">Tare (kg)</th>
                        <th className="px-3.5 py-2 text-right">Net (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {materialWiseSummary.map((m) => (
                        <tr key={m.materialName}>
                          <td className="px-3.5 py-2 font-semibold text-neutral-900">{m.materialName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.totalPackageCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatKg(m.totalGrossWeightKg)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatKg(m.totalTareWeightKg)}</td>
                          <td className="px-3.5 py-2 text-right font-bold text-emerald-800 tabular-nums">
                            {formatKg(m.totalNetWeightKg)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Completeness Checklist */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-2 text-xs">
                <span className="font-bold text-neutral-800 block">Verification Readiness Checklist:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span>{items.every((i) => i.materialName && i.netWeightKg > 0) ? "✓" : "❌"}</span>
                    <span className="text-neutral-700">Valid material weights recorded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{vehicleRegistrationNumber ? "✓" : "⚠️"}</span>
                    <span className="text-neutral-700">Vehicle registration plate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{(schedule.attachments?.length || 0) > 0 ? "✓" : "⚠️"}</span>
                    <span className="text-neutral-700">Photos &amp; tickets ({schedule.attachments?.length || 0} attached)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{actualStartTime ? "✓" : "⚠️"}</span>
                    <span className="text-neutral-700">Operation start timestamp recorded</span>
                  </div>
                </div>
              </div>

              {/* Status Note */}
              {isSubmitted && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-xs text-blue-900 font-semibold">
                  ⏳ Awaiting Staff Verification. Editing is locked.
                </div>
              )}

              {isCompleted && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs text-emerald-900 font-semibold">
                  ✓ Operation verified and stock posted to inventory.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Action Bar */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-neutral-300 bg-white px-3.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition"
            >
              Close
            </button>

            {/* Stepper navigation */}
            <div className="hidden sm:flex items-center gap-1">
              {activeStep !== "overview" && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === "materials") setActiveStep("overview");
                    else if (activeStep === "photos") setActiveStep("materials");
                    else if (activeStep === "summary") setActiveStep("photos");
                  }}
                  className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition"
                >
                  ← Back
                </button>
              )}

              {activeStep !== "summary" && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === "overview") setActiveStep("materials");
                    else if (activeStep === "materials") setActiveStep("photos");
                    else if (activeStep === "photos") setActiveStep("summary");
                  }}
                  className="h-9 rounded-xl border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition"
                >
                  Next →
                </button>
              )}
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex items-center gap-2">
            {isScheduled && (
              <button
                type="button"
                onClick={handleStartOperation}
                className="h-9 rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition active:scale-95"
              >
                Start Operation
              </button>
            )}

            {isEditable && (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveDraft}
                  className="h-9 rounded-xl border border-neutral-300 bg-white px-3.5 text-xs font-bold text-neutral-800 shadow-2xs hover:bg-neutral-100 active:scale-95 transition"
                >
                  {isSubmitting ? "Saving..." : "Save Draft"}
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="h-9 rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 active:scale-95 transition"
                >
                  {isSubmitting ? "Submitting..." : "Submit for Verification →"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enlarged Image Preview Dialog */}
      {enlargedImage && (
        <div
          onClick={() => setEnlargedImage(null)}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedImage}
            alt="Enlarged preview"
            className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
