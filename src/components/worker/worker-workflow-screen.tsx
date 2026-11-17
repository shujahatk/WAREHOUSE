"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useLiveNow } from "@/components/ref/live-clock";
import { useSession } from "@/components/shell/auth-gate";
import {
  demurrageLabel,
  demurrageSnapshot,
  formatEuro,
  formatInstant,
  formatKg,
  type DemoContainer,
  type DemoOutbound,
  type RequestView,
} from "@/domain/view";
import { calculateSection, PRESET_PACKAGING, type SectionMode } from "@/lib/packaging";
import { canOperateWarehouse } from "@/lib/permissions";
import { Icon } from "@/components/icons";
import { FileGallery } from "@/components/files/file-gallery";
import { UploadCapture } from "@/components/files/upload-capture";
import { WORKER_THEME } from "./worker-theme";

type Direction = "inbound" | "outbound";

function readNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function WorkerWorkflowScreen({
  direction,
  record,
}: {
  direction: Direction;
  record: DemoContainer | DemoOutbound;
}) {
  const demo = useDemo();
  const { identity } = useSession();
  const isInbound = direction === "inbound";
  const container = isInbound ? (record as DemoContainer) : null;
  const outbound = !isInbound ? (record as DemoOutbound) : null;

  // Read-only info drawer toggle
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Material Form state
  const [material, setMaterial] = useState("");
  const [mode, setMode] = useState<SectionMode>("weight");
  const [gross, setGross] = useState("");
  const [packagingId, setPackagingId] = useState(demo.state.packaging[1]?.id ?? "normal-pallet");
  const [quantity, setQuantity] = useState("1");
  const [manualTare, setManualTare] = useState("");
  const [noTare, setNoTare] = useState(false);
  const [count, setCount] = useState("");
  const [materialError, setMaterialError] = useState<string | null>(null);

  // Workflow submitting state
  const [workflowActionLoading, setWorkflowActionLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<"submit" | "complete" | null>(null);

  // Live Demurrage Clock
  const isDemurrageRunning = Boolean(isInbound && container?.status === "Unloading" && container?.demurrage?.startedAt);
  const now = useLiveNow(isDemurrageRunning);
  const demurrageSnap = container && now ? demurrageSnapshot(container, now) : null;
  const isDemurrageOvertime = Boolean(demurrageSnap?.overtime);

  // Active Request for this shipment
  const activeRequest: RequestView | null = useMemo(() => {
    const target = record.number.trim().toLowerCase();
    const reqs = demo.state.requests.filter(
      (r) =>
        (r.shipmentReference.trim().toLowerCase() === target ||
          r.containerNumber.trim().toLowerCase() === target ||
          r.shipmentId === record.number) &&
        r.type === (isInbound ? "unloading" : "loading") &&
        r.status !== "deleted"
    );
    return reqs[reqs.length - 1] ?? null;
  }, [demo.state.requests, isInbound, record.number]);

  // Photos & CMR
  const files = demo.state.attachments.filter((item) => item.shipment === record.number);
  const photos = files.filter((item) => item.role === "photo");
  const cmr = files.find((item) => item.role === "cmr");

  // Step calculation for the 4-step progress stepper
  // Step 1: Registered/Planned, Step 2: Unloading/Loading & Materials, Step 3: Admin Review, Step 4: Approved & Completed
  const currentStep = useMemo(() => {
    if (record.status === "Completed" || record.status === "Dispatched") return 4;
    if (activeRequest?.status === "approved" || activeRequest?.status === "completed") return 4;
    if (activeRequest?.status === "submitted") return 3;
    if (record.status === "Unloading" || record.status === "Loading" || record.status === "Loaded") return 2;
    return 1;
  }, [record.status, activeRequest?.status]);

  // Real-time weight preview calculation
  const packagingDef = demo.state.packaging.find((item) => item.id === packagingId);
  const isManualBulk = packagingDef?.tareKg == null;
  const tarePerUnit = isManualBulk ? readNumber(manualTare) : packagingDef?.tareKg;
  const weightCalc = calculateSection({
    mode,
    grossKg: readNumber(gross),
    tarePerUnitKg: tarePerUnit,
    packagingQty: readNumber(quantity),
    noTare: isManualBulk && noTare,
  });

  // Action handlers
  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material.trim()) {
      setMaterialError("Please enter or select a material name.");
      return;
    }
    if (mode === "weight" && !weightCalc.ok) {
      setMaterialError(weightCalc.error);
      return;
    }
    if (mode === "count") {
      const parsedCount = readNumber(count);
      if (!Number.isInteger(parsedCount) || (parsedCount ?? 0) <= 0) {
        setMaterialError("Enter a whole count quantity greater than 0.");
        return;
      }
    }
    setMaterialError(null);

    demo.saveMaterial({
      shipment: record.number,
      direction,
      material: material.trim(),
      mode,
      grossKg: mode === "weight" ? readNumber(gross) : null,
      packagingId,
      packagingQty: mode === "weight" ? readNumber(quantity) : null,
      tarePerUnitKg: isManualBulk ? (noTare ? 0 : readNumber(manualTare)) : (tarePerUnit ?? null),
      noTare: Boolean(isManualBulk && noTare),
      count: mode === "count" ? readNumber(count) : null,
    });

    // Reset inputs
    setMaterial("");
    setGross("");
    setCount("");
  };

  const handleStartOperation = () => {
    if (isInbound) {
      if (record.status === "Planned" || record.status === "In transit" || record.status === "Arrived") {
        demo.unload(record.number); // Moves to Registered
      } else if (record.status === "Registered") {
        demo.unload(record.number); // Moves to Unloading & starts demurrage timer
      }
    } else {
      if (record.status === "Planned") {
        demo.dispatch(record.number); // Moves to Loading
      }
    }
  };

  const executeSubmitRequest = async () => {
    setWorkflowActionLoading(true);
    setWorkflowError(null);
    setShowConfirmModal(null);

    if (!record.sections || record.sections.length === 0) {
      setWorkflowError("At least one material section must be recorded before submitting.");
      setWorkflowActionLoading(false);
      return;
    }
    if (photos.length === 0) {
      setWorkflowError("At least one inspection photo is required before submitting for approval.");
      setWorkflowActionLoading(false);
      return;
    }

    const err = await demo.createRequest(direction, record.number);
    if (err) {
      setWorkflowError(err);
    } else if (demo.refresh) {
      await demo.refresh();
    }
    setWorkflowActionLoading(false);
  };

  const executeCompleteOperation = async () => {
    if (!activeRequest) return;
    setWorkflowActionLoading(true);
    setWorkflowError(null);
    setShowConfirmModal(null);

    const err = await demo.completeRequest(activeRequest.id);
    if (err) {
      setWorkflowError(err);
    } else {
      if (isInbound && record.status === "Unloading") {
        demo.unload(record.number);
      } else if (!isInbound && record.status === "Loading") {
        demo.dispatch(record.number); // Loaded
        demo.dispatch(record.number); // Dispatched
      }
    }
    setWorkflowActionLoading(false);
  };

  const partyName = "supplier" in record ? record.supplier : record.customer;
  const equipNumber = "containerNumber" in record ? record.containerNumber : record.container;
  const isCompleted = record.status === "Completed" || record.status === "Dispatched";

  return (
    <div className={`space-y-4 ${isCompleted ? "pb-32" : "pb-48"}`}>
      {/* 1. Header Bar with Back Link */}
      <div className="flex items-center justify-between border-b border-neutral-200/90 pb-3">
        <Link
          href={isInbound ? "/containers" : "/outbound"}
          className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950"
        >
          <span>←</span> Back to {isInbound ? "Inbound Shipments" : "Outbound Shipments"}
        </Link>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isCompleted
            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
            : "bg-blue-100 text-blue-800 border border-blue-200"
            }`}
        >
          {record.status}
        </span>
      </div>

      {/* Shipment Reference Title */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl font-mono">
              {record.number}
            </h1>
            {record.po ? (
              <span className="rounded bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                {record.po}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-neutral-600">
            {isInbound ? "Unloading Operation" : "Loading Operation"} · {partyName || "Party not specified"} · {record.warehouse}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="self-start text-xs font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-4 mt-1 sm:mt-0"
        >
          {detailsOpen ? "Hide shipment details ▲" : "View shipment details ▼"}
        </button>
      </div>

      {/* Collapsible Shipment Details */}
      {detailsOpen ? (
        <div className="rounded-xl border border-neutral-200/90 bg-white p-4 text-xs space-y-2 shadow-2xs">
          <h3 className="font-bold text-neutral-900">Shipment Master Information</h3>
          <div className="grid grid-cols-2 gap-2 text-neutral-700">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Order Number</span>
              <p className="font-semibold text-neutral-900">{record.po || "N/A"}</p>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Equipment / Container</span>
              <p className="font-mono font-semibold text-neutral-900">{equipNumber || "N/A"}</p>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                {isInbound ? "Supplier" : "Customer"}
              </span>
              <p className="font-semibold text-neutral-900">{partyName || "N/A"}</p>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Depot</span>
              <p className="font-semibold text-neutral-900">{record.warehouse}</p>
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 pt-1 border-t border-neutral-200">
            Role note: Worker accounts record operational scale weights and inspection photos. Master PO records are managed by Staff.
          </p>
        </div>
      ) : null}

      {/* 2. Four-Step Progress Stepper */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
            Operation Progress
          </p>
          <span className="text-xs text-neutral-500 font-semibold">
            Step {currentStep} of 4
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            { step: 1, label: isInbound ? "Registered" : "Planned" },
            { step: 2, label: isInbound ? "Unloading" : "Loading" },
            { step: 3, label: "Admin Review" },
            { step: 4, label: "Stock Posted" },
          ].map((item) => {
            const isPast = currentStep > item.step;
            const isCurrent = currentStep === item.step;

            return (
              <div key={item.step} className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${isPast
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : isCurrent
                      ? "bg-emerald-800 text-white ring-2 ring-emerald-500/30 font-black"
                      : "bg-neutral-100 text-neutral-400 border border-neutral-300"
                    }`}
                >
                  {isPast ? "✔" : item.step}
                </div>
                <span
                  className={`mt-1.5 text-[10px] leading-tight ${isCurrent
                    ? "text-emerald-900 font-bold"
                    : isPast
                      ? "text-emerald-700 font-semibold"
                      : "text-neutral-500 font-medium"
                    }`}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Contextual Instruction Banner (Answers: What am I supposed to do right now?) */}
      <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-3.5 shadow-2xs">
        <div className="flex items-start gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white text-xs font-bold">
            ℹ
          </div>
          <div>
            <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
              {currentStep === 1
                ? "Preparation Phase — Start Operation"
                : currentStep === 2
                  ? "Recording Phase — Enter Cargo & Photos"
                  : currentStep === 3
                    ? "Review Phase — Awaiting Admin Approval"
                    : "Completion Phase — Stock Verified"}
            </h3>
            <p className="mt-0.5 text-xs text-emerald-900/90 leading-relaxed">
              {currentStep === 1
                ? "Check equipment number and container seals. When ready, tap 'Start Unloading (Run Timer)' to begin operations and start the demurrage clock."
                : currentStep === 2
                  ? "Weigh each pallet or bundle on the warehouse scale. Record gross weight, select packaging type, and take at least one clear inspection photo."
                  : currentStep === 3
                    ? "Your unloading record and photos have been submitted. An Administrator will review the cargo before approving it into live warehouse stock."
                    : "This operation is approved and finished. Net kilograms have been added to depot stock balances."}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Demurrage Timer Card (for Inbound) */}
      {isInbound && container ? (
        <div
          className={`rounded-xl border p-4 shadow-2xs transition-all ${isDemurrageOvertime
            ? "border-rose-300 bg-rose-50 text-rose-950"
            : isDemurrageRunning
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-neutral-200/90 bg-white"
            }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${isDemurrageOvertime
                  ? "bg-rose-600 animate-ping"
                  : isDemurrageRunning
                    ? "bg-amber-500 animate-pulse"
                    : "bg-neutral-400"
                  }`}
              />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                Demurrage Clock (Europe/Zurich)
              </h3>
            </div>
            {isDemurrageOvertime ? (
              <span className="rounded-full bg-rose-100 border border-rose-300 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                Overtime Incurred
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Timer Status</span>
              <p className="font-bold text-neutral-900 mt-0.5">{demurrageLabel(container, now)}</p>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Free Allowance</span>
              <p className="font-semibold text-neutral-800 mt-0.5">120 Minutes (2 hrs)</p>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Rate</span>
              <p className="font-semibold text-neutral-800 mt-0.5">€1.00 / minute</p>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-bold">Current Charges</span>
              <p className={`font-bold mt-0.5 ${isDemurrageOvertime ? "text-rose-700" : "text-emerald-800"}`}>
                {demurrageSnap ? formatEuro(demurrageSnap.chargeEUR) : "€0.00"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* 5. Material Sections List & Mobile Entry Form */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-neutral-200/80 pb-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Cargo &amp; Material Sections</h2>
            <p className="text-[11px] text-neutral-500">
              Record gross scale weights and packaging. Net weight is calculated automatically.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 border border-neutral-200 px-2.5 py-0.5 text-xs font-bold text-neutral-700">
            {record.sections?.length || 0} section(s)
          </span>
        </div>

        {/* Existing Sections List */}
        {record.sections && record.sections.length > 0 ? (
          <div className="mt-3 space-y-2">
            {record.sections.map((section, idx) => (
              <div
                key={section.id || idx}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50/80 p-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-neutral-900 text-sm">{section.material}</span>
                    {section.mode === "count" ? (
                      <span className="rounded bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold">
                        Count Only
                      </span>
                    ) : null}
                  </div>
                  {section.mode === "count" ? (
                    <p className="text-neutral-600 mt-0.5">Quantity: {section.count} Units (No weight posted)</p>
                  ) : (
                    <p className="text-neutral-600 mt-0.5">
                      Gross: {formatKg(section.grossKg || 0)} · Tare: {formatKg(section.totalTareKg || 0)} ({section.packagingId} × {section.packagingQty})
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {section.netKg != null ? (
                      <p className="text-sm font-bold text-emerald-800">{formatKg(section.netKg)} Net</p>
                    ) : (
                      <p className="text-sm font-bold text-blue-800">{section.count} Units</p>
                    )}
                  </div>
                  {!isCompleted ? (
                    <button
                      type="button"
                      onClick={() => demo.deleteMaterial(direction, record.number, section.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 active:scale-95 transition"
                      aria-label="Remove section"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500">
            No material sections recorded yet. Use the form below to enter scale readings.
          </div>
        )}

        {/* Add Material Section Form (Only if not completed) */}
        {!isCompleted ? (
          <form onSubmit={handleAddMaterial} className="mt-4 border-t border-neutral-200/80 pt-3 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              + Add Material Section
            </h3>

            {/* Material Presets Pills */}
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">
                Material Name / Commodity <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. Copper Millberry, Mixed Scrap, Aluminium Wire..."
                className={WORKER_THEME.input}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                {["Copper Millberry", "Aluminium Wire", "Mixed Scrap", "Cardboard Bales", "Plastics"].map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMaterial(preset)}
                      className="rounded-lg border border-neutral-300 bg-white px-2 py-0.5 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 transition"
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Mode Switch: Weight vs Count */}
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Measurement Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("weight")}
                  className={`min-h-[44px] rounded-xl text-xs font-bold transition ${mode === "weight"
                    ? "bg-emerald-800 text-white shadow-xs"
                    : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                >
                  ⚖ Weight in Kilograms
                </button>
                <button
                  type="button"
                  onClick={() => setMode("count")}
                  className={`min-h-[44px] rounded-xl text-xs font-bold transition ${mode === "count"
                    ? "bg-emerald-800 text-white shadow-xs"
                    : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                >
                  🔢 Count Only (No Weight)
                </button>
              </div>
            </div>

            {mode === "weight" ? (
              <>
                {/* Gross Weight Input */}
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Scale Gross Weight (kg) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={gross}
                    onChange={(e) => setGross(e.target.value)}
                    placeholder="Enter gross scale reading in kg"
                    className={WORKER_THEME.input}
                  />
                </div>

                {/* Packaging Selection */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold text-neutral-700 block mb-1">Packaging Type</label>
                    <select
                      value={packagingId}
                      onChange={(e) => {
                        setPackagingId(e.target.value);
                        const next = demo.state.packaging.find((item) => item.id === e.target.value);
                        setNoTare(next?.tareKg == null);
                      }}
                      className={WORKER_THEME.select}
                    >
                      {demo.state.packaging.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} {item.tareKg == null ? "· Manual / No Tare" : `(${item.tareKg} kg)`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-neutral-700 block mb-1">Packaging Quantity</label>
                    <input
                      type="number"
                      step="1"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="e.g. 1"
                      className={WORKER_THEME.input}
                    />
                  </div>
                </div>

                {/* Manual Bulk Tare Options */}
                {isManualBulk ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs space-y-2">
                    <label className="flex items-center gap-2 text-neutral-800 font-bold">
                      <input
                        type="checkbox"
                        checked={noTare}
                        onChange={(e) => setNoTare(e.target.checked)}
                        className="rounded border-neutral-300 text-emerald-800 focus:ring-emerald-700"
                      />
                      No packaging tare (Bulk loose cargo)
                    </label>
                    {!noTare ? (
                      <div>
                        <label className="text-neutral-700 font-semibold block mb-1">Manual Tare per Unit (kg)</label>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={manualTare}
                          onChange={(e) => setManualTare(e.target.value)}
                          placeholder="e.g. 35"
                          className={WORKER_THEME.input}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Automatic Gross & Net Weight Calculation Summary */}
                <div
                  className={`rounded-xl border p-3.5 text-xs shadow-2xs ${weightCalc.ok
                    ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
                    : "border-neutral-200 bg-neutral-50 text-neutral-600"
                    }`}
                >
                  <span className="font-bold block uppercase tracking-wider text-[10px] text-neutral-500">
                    Calculated Weight Breakdown
                  </span>
                  {weightCalc.ok ? (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-neutral-700 font-medium">
                        Tare: <strong className="text-neutral-900">{weightCalc.totalTareKg} kg</strong>
                      </span>
                      <span className="text-emerald-900 font-bold text-base">
                        Net: <strong className="text-emerald-800 font-black">{weightCalc.netKg} kg</strong>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-neutral-500 font-medium">{weightCalc.error}</p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">
                  Units / Item Count <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  placeholder="e.g. 50"
                  className={WORKER_THEME.input}
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Count-only items are tracked in inventory by piece count and post zero weight to balance.
                </p>
              </div>
            )}

            {materialError ? (
              <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                ⚠ {materialError}
              </p>
            ) : null}

            <button type="submit" className={WORKER_THEME.btnPrimary}>
              + Record Material Section
            </button>
          </form>
        ) : null}
      </div>

      {/* 6. Photo Upload Evidence Card */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-neutral-200/80 pb-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Inspection Photo Evidence</h2>
            <p className="text-[11px] text-neutral-500">
              Required for Admin approval. Take direct photos using phone camera or choose from gallery.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 border border-neutral-200 px-2.5 py-0.5 text-xs font-bold text-neutral-700">
            {photos.length} photo(s)
          </span>
        </div>

        {/* Existing Photos Gallery */}
        <div className="mt-3">
          <FileGallery
            files={photos}
            title="Inspection Evidence"
            emptyMessage="No inspection photos captured yet. Mandatory for unloading approval."
            allowDelete={!isCompleted}
            onDelete={async (id) => {
              await demo.detachFile(id);
            }}
          />
        </div>

        {/* Photo Capture Controls */}
        {!isCompleted ? (
          <div className="mt-4 border-t border-neutral-200 pt-3">
            <UploadCapture
              kind="photo"
              acceptPdf={false}
              multiple={true}
              shipmentReference={record.number}
              label="Capture Inspection Photo"
              helperText="Tap 'Take photo' to open your phone camera, or choose existing photo from device."
            />
          </div>
        ) : null}
      </div>

      {/* 7. CMR & Waybill Documentation Card */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-neutral-200/80 pb-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">CMR &amp; Waybill Documentation</h2>
            <p className="text-[11px] text-neutral-500">
              Consignment notes and transport documents linked to {record.number}
            </p>
          </div>
          {cmr ? (
            <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              CMR Attached
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 border border-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
              Optional for Worker
            </span>
          )}
        </div>

        {cmr ? (
          <div className="mt-3">
            <FileGallery
              files={[cmr]}
              title="CMR Waybill Document"
              emptyMessage="No CMR document attached."
              allowDelete={!isCompleted}
              onDelete={async (id) => {
                await demo.detachFile(id);
              }}
            />
          </div>
        ) : (
          <div className="mt-3 text-xs text-neutral-600">
            {!isCompleted ? (
              <UploadCapture
                kind="cmr"
                acceptPdf={true}
                multiple={false}
                shipmentReference={record.number}
                label="Attach Signed CMR Document"
                helperText="Upload PDF or clear photo of the driver-signed CMR document."
              />
            ) : (
              <p>No CMR document attached.</p>
            )}
          </div>
        )}
      </div>

      {/* 8. Request Workflow Status & Stock Posting */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-neutral-200/80 pb-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Approval &amp; Stock Posting Lifecycle</h2>
            <p className="text-[11px] text-neutral-500">
              {isInbound ? "Unloading Request" : "Loading Request"} Lifecycle Status
            </p>
          </div>
          {activeRequest ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${activeRequest.status === "approved"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : activeRequest.status === "completed"
                  ? "bg-blue-100 text-blue-800 border border-blue-300"
                  : activeRequest.status === "submitted"
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-rose-100 text-rose-800 border border-rose-300"
                }`}
            >
              {activeRequest.status.replace("_", " ").toUpperCase()}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 border border-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
              Draft Operation
            </span>
          )}
        </div>

        <div className="mt-3 text-xs space-y-3">
          {workflowError ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-800 font-semibold">
              ⚠ {workflowError}
            </div>
          ) : null}

          {/* Workflow Status Explanation */}
          {!activeRequest ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-neutral-700">
              <p className="font-bold text-neutral-900">Ready to submit for approval?</p>
              <p className="mt-1 text-[11px] text-neutral-600">
                Ensure you have added all cargo material weights and at least one inspection photo before submitting to Administrator review.
              </p>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={() => setShowConfirmModal("submit")}
                className={`mt-3 ${WORKER_THEME.btnPrimary}`}
              >
                {workflowActionLoading ? "Submitting..." : "Submit Request for Admin Approval"}
              </button>
            </div>
          ) : activeRequest.status === "submitted" ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <p className="font-bold text-amber-900">Awaiting Admin Review</p>
              <p className="mt-1 text-[11px] text-amber-900/90 leading-relaxed">
                Request <strong>{activeRequest.number}</strong> submitted by {activeRequest.createdByName}. Admin will inspect recorded weights and photos before approving stock entry into depot inventory.
              </p>
            </div>
          ) : activeRequest.status === "approved" ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
              <p className="font-bold text-emerald-900">Request Approved by Administrator!</p>
              <p className="mt-1 text-[11px] text-emerald-900/90 leading-relaxed">
                Verification passed. Tap the button below to complete the operation and immediately post calculated net weights into live stock.
              </p>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={() => setShowConfirmModal("complete")}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white shadow-xs hover:bg-emerald-900 active:scale-[0.98] transition"
              >
                {workflowActionLoading ? "Posting Stock..." : "✔ Complete Operation & Post Stock"}
              </button>
            </div>
          ) : activeRequest.status === "completed" ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-950">
              <p className="font-bold text-blue-900">Operation Successfully Completed</p>
              <p className="mt-1 text-[11px] text-blue-900/90 leading-relaxed">
                Net stock has been posted into {record.warehouse} warehouse inventory.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-950">
              <p className="font-bold text-rose-900">Request Sent Back / Declined</p>
              <p className="mt-1 text-[11px] text-rose-900/90 leading-relaxed">
                Reason: {activeRequest.declineReason || "Please verify materials and photos."}
              </p>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={() => setShowConfirmModal("submit")}
                className={`mt-3 ${WORKER_THEME.btnPrimary}`}
              >
                Resubmit Request
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 9. Sticky Mobile Bottom Action Bar (Floating cleanly above bottom navigation dock) */}
      {!isCompleted ? (
        <div className="fixed inset-x-0 bottom-[86px] z-30 flex justify-center px-3.5 pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
          <div className="pointer-events-auto w-full max-w-[420px] rounded-2xl border border-neutral-200/90 bg-white/95 p-2.5 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md">
            {/* If Inbound and Planned / Registered: Start Unloading action */}
            {isInbound && (record.status === "Planned" || record.status === "In transit" || record.status === "Arrived" || record.status === "Registered") ? (
              <button
                type="button"
                onClick={handleStartOperation}
                className={WORKER_THEME.btnPrimary}
              >
                {record.status === "Registered" ? "Start Unloading (Run Timer) ⏱" : "Mark Registered & Prepare"}
              </button>
            ) : !isInbound && record.status === "Planned" ? (
              <button
                type="button"
                onClick={handleStartOperation}
                className={WORKER_THEME.btnPrimary}
              >
                Start Outbound Loading →
              </button>
            ) : activeRequest?.status === "approved" ? (
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={() => setShowConfirmModal("complete")}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white shadow-xs hover:bg-emerald-900 active:scale-[0.98] transition"
              >
                ✔ Complete Operation &amp; Post Stock
              </button>
            ) : !activeRequest ? (
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={() => setShowConfirmModal("submit")}
                className={WORKER_THEME.btnPrimary}
              >
                Submit Request for Admin Approval →
              </button>
            ) : (
              <div className="flex h-12 items-center justify-center rounded-xl border border-neutral-300 bg-neutral-100 text-xs font-semibold text-neutral-700">
                Operation in progress · Status: {record.status}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 10. Confirmation Modal Dialog for Submissions */}
      {showConfirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-2xs">
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                {showConfirmModal === "submit"
                  ? "Submit Request for Admin Approval?"
                  : "Complete Operation and Post Stock?"}
              </h3>
              <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
                {showConfirmModal === "submit"
                  ? `You are submitting ${record.sections?.length || 0} recorded material section(s) and ${photos.length} photo(s) for ${record.number}. Admin will verify before approving.`
                  : `This will finalize ${record.number} and post calculated net kilograms into ${record.warehouse} warehouse inventory.`}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(null)}
                className="flex-1 h-11 rounded-xl border border-neutral-300 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={showConfirmModal === "submit" ? executeSubmitRequest : executeCompleteOperation}
                className="flex-1 h-11 rounded-xl bg-emerald-800 text-xs font-bold text-white hover:bg-emerald-900 shadow-xs"
              >
                {workflowActionLoading ? "Processing..." : "Confirm & Proceed"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
