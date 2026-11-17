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
  // Step 1: Registered/Planned, Step 2: Unloading/Loading, Step 3: Material & Photos Submitted, Step 4: Approved & Completed
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
      setMaterialError("Please enter or select a material type.");
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
        demo.unload(record.number); // Moves to Unloading & starts demurrage
      }
    } else {
      if (record.status === "Planned") {
        demo.dispatch(record.number); // Moves to Loading
      }
    }
  };

  const handleSubmitRequest = async () => {
    setWorkflowActionLoading(true);
    setWorkflowError(null);
    if (!record.sections || record.sections.length === 0) {
      setWorkflowError("At least one material section must be recorded before submitting.");
      setWorkflowActionLoading(false);
      return;
    }
    if (photos.length === 0) {
      setWorkflowError("At least one inspection photo is required before submitting.");
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

  const handleCompleteOperation = async () => {
    if (!activeRequest) return;
    setWorkflowActionLoading(true);
    setWorkflowError(null);

    const err = await demo.completeRequest(activeRequest.id);
    if (err) {
      setWorkflowError(err);
    } else {
      // Also advance the container/outbound status if not already completed
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
    <div className="space-y-4 pb-36">
      {/* 1. Header Bar with Back Link */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <Link
          href={isInbound ? "/containers" : "/outbound"}
          className="flex items-center gap-2 text-xs font-semibold text-violet-400 hover:text-violet-300"
        >
          <span>←</span> Back to {isInbound ? "Inbound" : "Outbound"}
        </Link>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            isCompleted
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-violet-600/20 text-violet-300 border border-violet-500/30"
          }`}
        >
          {record.status}
        </span>
      </div>

      {/* Shipment Reference Title */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl font-mono">
              {record.number}
            </h1>
            {record.po ? (
              <span className="rounded-md border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-300">
                {record.po}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {isInbound ? "Unloading Operation" : "Loading Operation"} · {partyName || "Party not specified"} · {record.warehouse}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="self-start text-xs font-medium text-slate-400 hover:text-white underline underline-offset-4 mt-1 sm:mt-0"
        >
          {detailsOpen ? "Hide shipment details ▲" : "View shipment details ▼"}
        </button>
      </div>

      {/* Collapsible Shipment Details */}
      {detailsOpen ? (
        <div className="rounded-2xl border border-slate-800 bg-[#121B2E] p-4 text-xs space-y-2">
          <h3 className="font-semibold text-slate-200">Shipment Master Information</h3>
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Order Number</span>
              <p className="font-medium text-white">{record.po || "N/A"}</p>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Equipment / Container</span>
              <p className="font-medium font-mono text-white">{equipNumber || "N/A"}</p>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">
                {isInbound ? "Supplier" : "Customer"}
              </span>
              <p className="font-medium text-white">{partyName || "N/A"}</p>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Depot</span>
              <p className="font-medium text-white">{record.warehouse}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
            Note: Worker accounts operate with operational permissions. Master records are managed by Staff.
          </p>
        </div>
      ) : null}

      {/* 2. Four-Step Progress Indicator */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Operation Progress
        </p>
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            { step: 1, label: isInbound ? "Registered" : "Planned" },
            { step: 2, label: isInbound ? "Unloading" : "Loading" },
            { step: 3, label: "Review & Docs" },
            { step: 4, label: "Completed" },
          ].map((item) => {
            const isPast = currentStep > item.step;
            const isCurrent = currentStep === item.step;

            return (
              <div key={item.step} className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    isPast
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                      ? "bg-violet-600 text-white ring-4 ring-violet-500/20 animate-pulse"
                      : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}
                >
                  {isPast ? "✔" : item.step}
                </div>
                <span
                  className={`mt-1.5 text-[10px] font-medium leading-tight ${
                    isCurrent ? "text-violet-300 font-semibold" : isPast ? "text-emerald-400" : "text-slate-500"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Demurrage Timer Card (for Inbound) */}
      {isInbound && container ? (
        <div
          className={`rounded-2xl border p-4 shadow-md transition-all ${
            isDemurrageOvertime
              ? "border-rose-500/60 bg-gradient-to-br from-rose-950/40 via-[#18101E] to-[#121B2E]"
              : isDemurrageRunning
              ? "border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-[#161B2E] to-[#121B2E]"
              : "border-slate-800 bg-[#121B2E]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${
                  isDemurrageOvertime
                    ? "bg-rose-500 animate-ping"
                    : isDemurrageRunning
                    ? "bg-amber-400 animate-pulse"
                    : "bg-slate-600"
                }`}
              />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Demurrage Clock (Europe/Zurich)
              </h3>
            </div>
            {isDemurrageOvertime ? (
              <span className="rounded-full bg-rose-600/30 px-2.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/40">
                Overtime Incurred
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <span className="text-slate-500 block text-[10px]">Timer Status</span>
              <p className="font-bold text-white mt-0.5">{demurrageLabel(container, now)}</p>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Free Allowance</span>
              <p className="font-semibold text-slate-200 mt-0.5">120 Minutes (2 hrs)</p>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Rate</span>
              <p className="font-semibold text-slate-200 mt-0.5">€1.00 / minute</p>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Current Charges</span>
              <p className={`font-bold mt-0.5 ${isDemurrageOvertime ? "text-rose-400" : "text-emerald-400"}`}>
                {demurrageSnap ? formatEuro(demurrageSnap.chargeEUR) : "€0.00"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. Material Sections List & Mobile Entry Form */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Material Sections</h2>
            <p className="text-[11px] text-slate-400">
              Record gross weight and packaging. Net weight is calculated automatically.
            </p>
          </div>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
            {record.sections?.length || 0} section(s)
          </span>
        </div>

        {/* Existing Sections List */}
        {record.sections && record.sections.length > 0 ? (
          <div className="mt-3 space-y-2">
            {record.sections.map((section, idx) => (
              <div
                key={section.id || idx}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0E1626] p-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{section.material}</span>
                    {section.mode === "count" ? (
                      <span className="rounded bg-violet-600/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                        Count Only
                      </span>
                    ) : null}
                  </div>
                  {section.mode === "count" ? (
                    <p className="text-slate-400 mt-0.5">Quantity: {section.count} Units (No weight posted)</p>
                  ) : (
                    <p className="text-slate-400 mt-0.5">
                      Gross: {formatKg(section.grossKg || 0)} · Tare: {formatKg(section.totalTareKg || 0)} (
                      {section.packagingId} × {section.packagingQty})
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {section.netKg != null ? (
                      <p className="text-sm font-bold text-emerald-400">{formatKg(section.netKg)} Net</p>
                    ) : (
                      <p className="text-sm font-bold text-violet-300">{section.count} Units</p>
                    )}
                  </div>
                  {!isCompleted ? (
                    <button
                      type="button"
                      onClick={() => demo.deleteMaterial(direction, record.number, section.id)}
                      className="rounded-lg border border-rose-500/30 p-1.5 text-rose-400 hover:bg-rose-500/10 active:scale-95"
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
          <div className="mt-3 rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
            No material sections added yet. Use the form below to enter materials.
          </div>
        )}

        {/* Add Material Section Form (Only if not completed) */}
        {!isCompleted ? (
          <form onSubmit={handleAddMaterial} className="mt-4 border-t border-slate-800 pt-3 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400">
              + Add Material Section
            </h3>

            {/* Material Presets Pills */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Material Name / Type</label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. Copper Cathodes, Mixed Plastic, Aluminium..."
                className={WORKER_THEME.input}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                {["Copper Millberry", "Aluminium Wire", "Mixed Scrap", "Cardboard Bales", "Plastics"].map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMaterial(preset)}
                      className="rounded-lg border border-slate-800 bg-[#0E1626] px-2 py-0.5 text-slate-300 hover:border-violet-500 hover:text-white"
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Mode Switch: Weight vs Count */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Measurement Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("weight")}
                  className={`min-h-[44px] rounded-xl text-xs font-semibold transition ${
                    mode === "weight"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-950/40"
                      : "border border-slate-800 bg-[#0E1626] text-slate-400 hover:text-white"
                  }`}
                >
                  ⚖ Weight in Kilograms
                </button>
                <button
                  type="button"
                  onClick={() => setMode("count")}
                  className={`min-h-[44px] rounded-xl text-xs font-semibold transition ${
                    mode === "count"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-950/40"
                      : "border border-slate-800 bg-[#0E1626] text-slate-400 hover:text-white"
                  }`}
                >
                  🔢 Count Only (No Weight)
                </button>
              </div>
            </div>

            {mode === "weight" ? (
              <>
                {/* Gross Weight */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gross Weight (kg)</label>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={gross}
                    onChange={(e) => setGross(e.target.value)}
                    placeholder="Enter gross scale weight in kg"
                    className={WORKER_THEME.input}
                  />
                </div>

                {/* Packaging Selection */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Packaging Type</label>
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
                    <label className="text-xs text-slate-400 block mb-1">Packaging Quantity</label>
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
                  <div className="rounded-xl border border-slate-800 bg-[#0E1626] p-3 text-xs space-y-2">
                    <label className="flex items-center gap-2 text-slate-300 font-medium">
                      <input
                        type="checkbox"
                        checked={noTare}
                        onChange={(e) => setNoTare(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-violet-600 focus:ring-violet-500"
                      />
                      No packaging tare (Bulk loose cargo)
                    </label>
                    {!noTare ? (
                      <div>
                        <label className="text-slate-400 block mb-1">Manual Tare per Unit (kg)</label>
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
                  className={`rounded-xl border p-3 text-xs ${
                    weightCalc.ok
                      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                      : "border-slate-800 bg-[#0E1626] text-slate-400"
                  }`}
                >
                  <span className="font-semibold block uppercase tracking-wider text-[10px] text-slate-400">
                    Calculated Weight Breakdown
                  </span>
                  {weightCalc.ok ? (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span>
                        Total Tare: <strong className="text-white">{weightCalc.totalTareKg} kg</strong>
                      </span>
                      <span>
                        Net Weight: <strong className="text-emerald-400 text-base">{weightCalc.netKg} kg</strong>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">{weightCalc.error}</p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs text-slate-400 block mb-1">Units / Item Count</label>
                <input
                  type="number"
                  step="1"
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  placeholder="e.g. 50"
                  className={WORKER_THEME.input}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Count-only items are tracked in inventory by piece count and post zero weight to balance.
                </p>
              </div>
            )}

            {materialError ? (
              <p className="text-xs font-semibold text-rose-400">{materialError}</p>
            ) : null}

            <button type="submit" className={WORKER_THEME.btnPrimary}>
              + Add Material Section
            </button>
          </form>
        ) : null}
      </div>

      {/* 5. Photo Upload Evidence Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Inspection Photo Evidence</h2>
            <p className="text-[11px] text-slate-400">
              Required for workflow approval. Take direct photos or choose from device.
            </p>
          </div>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
            {photos.length} photo(s)
          </span>
        </div>

        {/* Existing Photos Gallery */}
        <div className="mt-3">
          <FileGallery
            files={photos}
            title="Inspection Evidence"
            emptyMessage="No inspection photos captured yet. Mandatory for unloading."
            allowDelete={!isCompleted}
            onDelete={async (id) => {
              await demo.detachFile(id);
            }}
          />
        </div>

        {/* Photo Capture Controls */}
        {!isCompleted ? (
          <div className="mt-4 border-t border-slate-800 pt-3">
            <UploadCapture
              kind="photo"
              acceptPdf={false}
              multiple={true}
              shipmentReference={record.number}
              label="Capture Inspection Photo"
              helperText="Tap 'Take photo' to open your phone camera, or choose existing photo from gallery."
            />
          </div>
        ) : null}
      </div>

      {/* 6. CMR & Shipping Documents Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">CMR & Waybill Documentation</h2>
            <p className="text-[11px] text-slate-400">
              Consignment notes linked to {record.number}
            </p>
          </div>
          {cmr ? (
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
              CMR Attached
            </span>
          ) : (
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
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
          <div className="mt-3 text-xs text-slate-400">
            {!isCompleted ? (
              <UploadCapture
                kind="cmr"
                acceptPdf={true}
                multiple={false}
                shipmentReference={record.number}
                label="Attach CMR / Waybill File"
                helperText="Upload PDF or photo of the signed CMR document."
              />
            ) : (
              <p>No CMR document attached.</p>
            )}
          </div>
        )}
      </div>

      {/* 7. Request Workflow Status & Stock Posting */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Stock Movement Approval</h2>
            <p className="text-[11px] text-slate-400">
              {isInbound ? "Unloading Request" : "Loading Request"} Lifecycle
            </p>
          </div>
          {activeRequest ? (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                activeRequest.status === "approved"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : activeRequest.status === "completed"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                  : activeRequest.status === "submitted"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
              }`}
            >
              {activeRequest.status.replace("_", " ").toUpperCase()}
            </span>
          ) : (
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-400">
              Draft Operation
            </span>
          )}
        </div>

        <div className="mt-3 text-xs space-y-3">
          {workflowError ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 text-rose-300">
              ⚠ {workflowError}
            </div>
          ) : null}

          {/* Workflow Status Explanation */}
          {!activeRequest ? (
            <div className="rounded-xl border border-slate-800 bg-[#0E1626] p-3 text-slate-300">
              <p className="font-semibold text-white">Ready for submission?</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Once you have added the material sections and captured inspection photos, submit this request for Admin review.
              </p>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={handleSubmitRequest}
                className={`mt-3 ${WORKER_THEME.btnPrimary}`}
              >
                {workflowActionLoading ? "Submitting..." : "Submit Request for Admin Approval"}
              </button>
            </div>
          ) : activeRequest.status === "submitted" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">
              <p className="font-bold text-amber-300">Awaiting Admin Approval</p>
              <p className="mt-1 text-[11px] text-amber-200/80">
                Request {activeRequest.number} submitted by {activeRequest.createdByName}. Admin will review materials and photos before approving stock entry.
              </p>
            </div>
          ) : activeRequest.status === "approved" ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-emerald-200">
              <p className="font-bold text-emerald-300">Request Approved by Admin!</p>
              <p className="mt-1 text-[11px] text-emerald-200/80">
                You can now complete this operation to post net kilograms into warehouse stock.
              </p>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={handleCompleteOperation}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500 active:scale-[0.98]"
              >
                {workflowActionLoading ? "Posting Stock..." : "✔ Complete Operation & Post Stock"}
              </button>
            </div>
          ) : activeRequest.status === "completed" ? (
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3 text-blue-200">
              <p className="font-bold text-blue-300">Operation Completed</p>
              <p className="mt-1 text-[11px] text-blue-200/80">
                Stock has been posted into {record.warehouse} warehouse inventory.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-rose-200">
              <p className="font-bold text-rose-300">Request Sent Back / Declined</p>
              <p className="mt-1 text-[11px] text-rose-200/80">
                {activeRequest.declineReason || "Please verify materials and photos."}
              </p>
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={handleSubmitRequest}
                className={`mt-3 ${WORKER_THEME.btnPrimary}`}
              >
                Resubmit Request
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 8. Sticky Mobile Bottom Action Bar (Fixed above bottom nav) */}
      {!isCompleted ? (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-800/90 bg-[#0E1626]/95 p-3 backdrop-blur-md">
          <div className="mx-auto max-w-lg">
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
                onClick={handleCompleteOperation}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 active:scale-[0.98]"
              >
                ✔ Complete Operation & Post Stock
              </button>
            ) : !activeRequest ? (
              <button
                type="button"
                disabled={workflowActionLoading}
                onClick={handleSubmitRequest}
                className={WORKER_THEME.btnPrimary}
              >
                Submit Request for Admin Approval →
              </button>
            ) : (
              <div className="flex h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-xs font-semibold text-slate-300">
                Operation in progress · Status: {record.status}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
