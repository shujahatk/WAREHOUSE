"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useIsMounted } from "@/lib/use-mounted";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";
import {
  formatKg,
  openTasks,
  parseOperationalRequestDescription,
  serializeOperationalRequestDescription,
  type GeneralRequestCategory,
  type GeneralRequestPriority,
  type GeneralRequestView,
  type GeneralRequestOperationalDetails,
} from "@/domain/view";

const PRIORITY_OPTIONS: { id: GeneralRequestPriority; label: string; tone: string }[] = [
  { id: "normal", label: "Normal", tone: "bg-neutral-100 text-neutral-800" },
  { id: "low", label: "Low", tone: "bg-neutral-50 text-neutral-600" },
  { id: "high", label: "High", tone: "bg-amber-100 text-amber-900 border border-amber-300" },
  { id: "urgent", label: "Urgent", tone: "bg-rose-100 text-rose-900 border border-rose-300 font-semibold" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso.slice(0, 16);
  }
}

export function TaskBoard() {
  const demo = useDemo();
  const { identity } = useSession();
  const mounted = useIsMounted();
  const isWorker = identity.role === "worker";
  const isManager = identity.role === "manager";
  const isOwner = identity.role === "owner";

  // Structured operational request modal state (Only Loading and Unloading)
  const [showCreateModal, setShowCreateModal] = useState(() => {
    return typeof window !== "undefined" && window.location.search.includes("new=true");
  });
  const [modalStep, setModalStep] = useState<"edit" | "review">("edit");
  const [requestType, setRequestType] = useState<"loading" | "unloading">("unloading");
  const [priority, setPriority] = useState<GeneralRequestPriority>("normal");
  const [materialType, setMaterialType] = useState("LDPE");
  const [materialDescription, setMaterialDescription] = useState("LDPE film");
  const [packagingType, setPackagingType] = useState("Normal Pallet");
  const [packageCount, setPackageCount] = useState("1");
  const [tarePerPackageKg, setTarePerPackageKg] = useState("25");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState(() => `${identity.warehouse || "Bornem"} - Bay 1`);
  const [shipmentId, setShipmentId] = useState("");
  const [notes, setNotes] = useState("");
  const [stagedFiles, setStagedFiles] = useState<{
    file: File;
    name: string;
    size: number;
    originalSize: number;
    wasCompressed: boolean;
    kind: "photo" | "document";
    base64: string;
  }[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Auto-calculated weight and packaging values
  const parsedPackageCount = parseInt(packageCount, 10) || 0;
  const parsedGrossKg = parseFloat(grossWeightKg) || 0;
  const parsedUnitTareKg = parseFloat(tarePerPackageKg) || 0;
  const totalTareWeightKg = Math.max(0, Math.round(parsedPackageCount * parsedUnitTareKg * 1000) / 1000);
  const netWeightKg = Math.round((parsedGrossKg - totalTareWeightKg) * 1000) / 1000;
  const isNetWeightValid = parsedGrossKg > 0 && parsedPackageCount > 0 && netWeightKg > 0;

  const handlePackagingTypeChange = (pkgName: string) => {
    setPackagingType(pkgName);
    const matched = demo.state.packaging?.find((p) => p.label === pkgName);
    if (matched && matched.tareKg !== null) {
      setTarePerPackageKg(String(matched.tareKg));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileKind: "photo" | "document") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setCreateError(null);

    const newFiles: {
      file: File;
      name: string;
      size: number;
      originalSize: number;
      wasCompressed: boolean;
      kind: "photo" | "document";
      base64: string;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const optimized = await compressImageIfNeeded(file);
        const base64 = await fileToBase64(optimized.blob);
        newFiles.push({
          file,
          name: optimized.name,
          size: optimized.size,
          originalSize: optimized.originalSize,
          wasCompressed: optimized.wasCompressed,
          kind: fileKind,
          base64,
        });
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : `Failed to process ${file.name}`);
        return;
      }
    }

    setStagedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialType.trim()) {
      setCreateError("Material / Product Type is required.");
      return;
    }
    if (parsedPackageCount <= 0) {
      setCreateError("Package count must be at least 1.");
      return;
    }
    if (parsedGrossKg <= 0) {
      setCreateError("Gross weight must be greater than zero.");
      return;
    }
    if (netWeightKg <= 0) {
      setCreateError("Gross weight must be greater than total tare weight (net weight must be positive).");
      return;
    }
    setCreateError(null);
    setModalStep("review");
  };

  const handleCreateSubmit = async () => {
    if (!isNetWeightValid) {
      setCreateError("Gross weight must be greater than total tare weight (net weight must be positive).");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    const opDetails: GeneralRequestOperationalDetails = {
      requestType,
      materialType: materialType.trim(),
      materialDescription: materialDescription.trim() || materialType.trim(),
      packagingType: packagingType.trim(),
      packageCount: parsedPackageCount,
      grossWeightKg: parsedGrossKg,
      tarePerPackageKg: parsedUnitTareKg,
      totalTareWeightKg,
      netWeightKg,
      warehouseLocation: warehouseLocation.trim() || (identity.warehouse ?? "Warehouse"),
      notes: notes.trim() || undefined,
      assignedPoSoNumber: null,
      assignedPoSoBy: null,
      assignedPoSoByName: null,
      assignedPoSoAt: null,
      inventoryMoved: false,
    };

    const serialized = serializeOperationalRequestDescription(opDetails, notes.trim() || undefined);

    const attachments = stagedFiles.map((f) => ({
      name: f.name,
      bytesBase64: f.base64,
    }));

    const err = await demo.createGeneralRequest({
      category: "loading_unloading" as GeneralRequestCategory,
      priority,
      description: serialized,
      shipmentId: shipmentId || null,
      attachments: attachments.length > 0 ? attachments : undefined,
      operationalDetails: opDetails,
    });

    if (err) {
      setCreateError(err);
      setCreateSubmitting(false);
    } else {
      setShowCreateModal(false);
      setModalStep("edit");
      setGrossWeightKg("");
      setNotes("");
      setStagedFiles([]);
      setCreateSubmitting(false);
    }
  };

  // Decision Modal State
  const [actionTarget, setActionTarget] = useState<{
    request: GeneralRequestView;
    decision: "under_review" | "approved" | "declined" | "sent_back" | "completed" | "delete";
  } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Staff PO/SO Assignment Modal State (Stage 3)
  const [assignTarget, setAssignTarget] = useState<GeneralRequestView | null>(null);
  const [assignPoSoNumber, setAssignPoSoNumber] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Preview attachment state
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachmentItem | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [showShipmentSection, setShowShipmentSection] = useState(false);

  // Filter requests according to strict role permissions:
  // Workers ONLY see and track their own requests
  const visibleGeneral = useMemo(() => {
    let list = demo.state.generalRequests || [];
    if (isWorker) {
      list = list.filter((r) => r.createdByName === identity.name);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (typeFilter !== "all") {
      list = list.filter((r) => {
        const details = r.operationalDetails || parseOperationalRequestDescription(r.description).operationalDetails;
        if (typeFilter === "loading") {
          return details?.requestType === "loading";
        }
        if (typeFilter === "unloading") {
          return details?.requestType === "unloading" || r.category === "loading_unloading";
        }
        return true;
      });
    }
    if (warehouseFilter !== "all" && !isWorker) {
      list = list.filter((r) => r.warehouse.toLowerCase() === warehouseFilter.toLowerCase());
    }
    return list;
  }, [demo.state.generalRequests, isWorker, identity.name, statusFilter, typeFilter, warehouseFilter]);

  // Loading/Unloading shipment requests
  const tasks = openTasks(demo.state, identity);
  const shipmentRequests = useMemo(() => {
    return demo.state.requests.filter((req) => {
      if (req.status === "deleted") return false;
      if (isWorker && identity.warehouse) {
        return req.warehouse === identity.warehouse;
      }
      return true;
    });
  }, [demo.state.requests, isWorker, identity.warehouse]);

  // Active warehouse shipments for optional link
  const relevantShipments = useMemo(() => {
    return demo.state.containers
      .filter((c) => !isWorker || !identity.warehouse || c.warehouse === identity.warehouse)
      .map((c) => ({ id: c.number, label: `Inbound: ${c.number} (${c.supplier || "Supplier"})` }))
      .concat(
        demo.state.outbound
          .filter((o) => !isWorker || !identity.warehouse || o.warehouse === identity.warehouse)
          .map((o) => ({ id: o.number, label: `Outbound: ${o.number} (${o.customer || "Customer"})` })),
      );
  }, [demo.state.containers, demo.state.outbound, isWorker, identity.warehouse]);

  // Execute decision / action
  const handleExecuteAction = async () => {
    if (!actionTarget) return;
    const { request, decision } = actionTarget;

    if (decision === "declined" && !actionNote.trim()) {
      setActionError("A decline reason is required.");
      return;
    }
    if (decision === "sent_back" && !actionNote.trim()) {
      setActionError("A note explaining the missing information is required.");
      return;
    }

    setActionSubmitting(true);
    setActionError(null);

    let err: string | undefined;
    if (decision === "delete") {
      err = await demo.deleteGeneralRequest(request.id);
    } else {
      err = await demo.decideGeneralRequest({
        requestId: request.id,
        decision,
        responseNote: actionNote.trim() || undefined,
        reason: decision === "declined" ? actionNote.trim() : undefined,
        note: decision === "sent_back" ? actionNote.trim() : undefined,
      });
    }

    if (err) {
      setActionError(err);
      setActionSubmitting(false);
    } else {
      setActionTarget(null);
      setActionNote("");
      setActionSubmitting(false);
    }
  };

  // Staff PO/SO Assignment Handler
  const handleAssignPoSoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget) return;

    const trimmed = assignPoSoNumber.trim().toUpperCase();
    if (!trimmed) {
      setAssignError("Please enter a PO or SO reference number.");
      return;
    }
    if (!trimmed.startsWith("PO-") && !trimmed.startsWith("SO-")) {
      setAssignError("Only PO (Purchase Order) and SO (Sales Order) references are permitted (e.g. PO-2026-0001 or SO-2026-0001).");
      return;
    }

    const { operationalDetails } = parseOperationalRequestDescription(assignTarget.description);
    if (operationalDetails?.requestType === "loading" && !trimmed.startsWith("SO-")) {
      setAssignError("Loading (dispatch) operations require an SO (Sales Order) reference.");
      return;
    }
    if (operationalDetails?.requestType === "unloading" && !trimmed.startsWith("PO-")) {
      setAssignError("Unloading (receipt) operations require a PO (Purchase Order) reference.");
      return;
    }

    setAssignSubmitting(true);
    setAssignError(null);

    const err = await demo.assignPoSoToGeneralRequest({
      requestId: assignTarget.id,
      poSoNumber: trimmed,
    });

    if (err) {
      setAssignError(err);
      setAssignSubmitting(false);
    } else {
      setAssignTarget(null);
      setAssignPoSoNumber("");
      setAssignSubmitting(false);
    }
  };

  if (!mounted || !demo.ready) {
    return (
      <div className="space-y-4">
        <PageTitle title="Operational Requests" subtitle="Loading operational requests…" />
        <Surface className="p-8 text-center text-sm text-neutral-500">
          Loading requests…
        </Surface>
      </div>
    );
  }

  // Title and subtitle by role
  const pageTitle = isWorker ? "My Requests" : "All Requests";

  const pageSubtitle = isWorker
    ? `${identity.warehouse ?? "Assigned warehouse"} · Submit Loading and Unloading requests with weights, photos, and documents`
    : isOwner
      ? "Admin view · Review attachments and audit history, approve or reject worker requests across warehouses (operational records are read-only)"
      : "Staff view · Assign PO/SO numbers to approved requests and process operational completions";

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title={pageTitle} subtitle={pageSubtitle} />
        {isWorker ? (
          <div>
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(true);
                setModalStep("edit");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 transition min-h-[44px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              + New Loading / Unloading Request
            </button>
          </div>
        ) : null}
      </div>

      {/* Primary Section: Operational Requests */}
      <div className="space-y-4">
        {/* Filters and Status Tabs */}
        <Surface className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-medium text-neutral-500 mr-1">Status:</span>
              {[
                { id: "all", label: "All Requests" },
                { id: "submitted", label: "Pending Approval" },
                { id: "under_review", label: "Under Review" },
                { id: "approved", label: "Approved" },
                { id: "sent_back", label: "Info Requested" },
                { id: "completed", label: "Completed" },
                { id: "declined", label: "Rejected" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 font-medium transition min-h-[36px] sm:min-h-0 ${
                    statusFilter === tab.id
                      ? "bg-neutral-950 text-white shadow-xs"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Request Type Filter */}
              <select
                aria-label="Filter requests by operation type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-800 focus:border-neutral-950 focus:outline-hidden min-h-[36px] sm:min-h-0"
              >
                <option value="all">All Operations</option>
                <option value="unloading">📥 Unloading (Receipt)</option>
                <option value="loading">📤 Loading (Dispatch)</option>
              </select>

              {/* Warehouse Filter (Office Only) */}
              {!isWorker ? (
                <select
                  aria-label="Filter requests by warehouse"
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-800 focus:border-neutral-950 focus:outline-hidden min-h-[36px] sm:min-h-0"
                >
                  <option value="all">All Warehouses</option>
                  {demo.state.directory.warehouses.map((wh) => (
                    <option key={wh.id} value={wh.name}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        </Surface>

        {/* Request List */}
        {visibleGeneral.length === 0 ? (
          <Surface className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-neutral-900">No requests found</h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
              {isWorker
                ? "Submit a Loading or Unloading request to begin intake or dispatch operations."
                : "Operational requests submitted by workers across warehouses will appear here."}
            </p>
            {isWorker ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(true);
                    setModalStep("edit");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 min-h-[44px]"
                >
                  + New Request
                </button>
              </div>
            ) : null}
          </Surface>
        ) : (
          <div className="space-y-3">
            {visibleGeneral.map((req) => {
              const priorityInfo = PRIORITY_OPTIONS.find((p) => p.id === req.priority);
              const opParsed = req.operationalDetails || parseOperationalRequestDescription(req.description).operationalDetails;
              const isUnloading = opParsed?.requestType === "unloading" || req.category === "loading_unloading";

              return (
                <Surface key={req.id} className="p-4 transition hover:border-neutral-300">
                  <div className="flex flex-col gap-3">
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-neutral-950">{req.number}</span>
                        <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                          opParsed?.requestType === "loading"
                            ? "bg-blue-50 text-blue-800 border border-blue-200"
                            : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        }`}>
                          {opParsed?.requestType === "loading" ? "📤 Loading" : "📥 Unloading"}
                        </span>
                        {priorityInfo && priorityInfo.id !== "normal" ? (
                          <span className={`rounded-md px-2 py-0.5 text-xs ${priorityInfo.tone}`}>
                            {priorityInfo.label} Priority
                          </span>
                        ) : null}
                        <span className="text-xs text-neutral-500">·</span>
                        <span className="text-xs font-medium text-neutral-700">📍 {req.warehouse}</span>
                        {!isWorker ? (
                          <span className="text-xs text-neutral-500">by {req.createdByName}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">{formatDate(req.createdAt)}</span>
                        <StatusPill label={req.statusLabel} />
                      </div>
                    </div>

                    {/* Operational Details Breakdown Card */}
                    {opParsed ? (
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 text-xs space-y-2.5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-neutral-500">Operation & Ref</span>
                            <p className="font-bold text-neutral-950 mt-0.5">
                              {opParsed.requestType === "loading" ? "Loading (Dispatch)" : "Unloading (Receipt)"}
                            </p>
                            {opParsed.assignedPoSoNumber ? (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 rounded bg-neutral-950 text-white font-mono text-[10px] px-1.5 py-0.5 font-bold">
                                  {opParsed.assignedPoSoNumber}
                                </span>
                                {opParsed.inventoryMoved ? (
                                  <span className="text-[10px] text-emerald-700 font-semibold">✓ Stock Updated</span>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-[10px] text-amber-700 italic mt-0.5">
                                Awaiting Staff PO/SO
                              </p>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-neutral-500">Material & Packaging</span>
                            <p className="font-bold text-neutral-950 mt-0.5">{opParsed.materialType}</p>
                            <p className="text-[11px] text-neutral-600">
                              {opParsed.packageCount} × {opParsed.packagingType} ({opParsed.totalTareWeightKg} kg tare)
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-neutral-500">Weights (kg)</span>
                            <p className="font-bold text-neutral-950 mt-0.5">Gross: {opParsed.grossWeightKg.toLocaleString()} kg</p>
                            <p className="text-[11px] font-bold text-emerald-700">Net: {opParsed.netWeightKg.toLocaleString()} kg</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-neutral-500">Location</span>
                            <p className="font-bold text-neutral-950 mt-0.5">{opParsed.warehouseLocation}</p>
                            {opParsed.materialDescription ? (
                              <p className="text-[10px] text-neutral-500 truncate">{opParsed.materialDescription}</p>
                            ) : null}
                          </div>
                        </div>
                        {opParsed.notes ? (
                          <div className="border-t border-neutral-200/80 pt-2 text-neutral-700">
                            <span className="font-semibold text-neutral-900">Notes: </span>
                            {opParsed.notes}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-900 whitespace-pre-line leading-relaxed">
                        {req.description}
                      </div>
                    )}

                    {/* Linked Shipment/Order */}
                    {req.shipmentReference || req.purchaseOrderNumber ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 bg-neutral-50 rounded-md px-3 py-1.5">
                        <span className="font-medium text-neutral-700">Linked:</span>
                        {req.shipmentReference ? (
                          <span>
                            Shipment: <strong className="text-neutral-900">{req.shipmentReference}</strong>
                          </span>
                        ) : null}
                        {req.purchaseOrderNumber ? (
                          <span>
                            Reference: <strong className="text-neutral-900">{req.purchaseOrderNumber}</strong>
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Attached Files & Photos */}
                    {req.attachments && req.attachments.length > 0 ? (
                      <div className="space-y-1.5 border-t border-neutral-100 pt-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
                          <svg className="h-3.5 w-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <span>Attachments ({req.attachments.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {req.attachments.map((att) => {
                            const isImg = att.mime.startsWith("image/");
                            return (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() =>
                                  setPreviewAttachment({
                                    id: att.documentId || att.id,
                                    name: att.name,
                                    mime: att.mime,
                                    byteSize: att.byteSize,
                                    url: att.url,
                                    uploadedByName: req.createdByName,
                                    uploadedAt: req.createdAt,
                                    warehouse: req.warehouse,
                                  })
                                }
                                className="group flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 transition hover:border-neutral-950 hover:bg-neutral-50 min-h-[36px]"
                              >
                                {isImg ? (
                                  <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                )}
                                <span className="font-medium group-hover:underline truncate max-w-[180px]">{att.name}</span>
                                <span className="text-[11px] text-neutral-400">({formatBytes(att.byteSize)})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Feedback / Decision Notes from Admin or Staff */}
                    {req.responseNote ? (
                      <div
                        className={`rounded-lg p-3 text-xs border ${
                          req.status === "declined"
                            ? "bg-rose-50 border-rose-200 text-rose-900"
                            : req.status === "sent_back"
                              ? "bg-purple-50 border-purple-200 text-purple-900"
                              : req.status === "approved"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                : "bg-neutral-50 border-neutral-200 text-neutral-900"
                        }`}
                      >
                        <div className="font-semibold mb-0.5">
                          {req.status === "declined"
                            ? "Rejection Reason from Admin:"
                            : req.status === "sent_back"
                              ? "Information Requested:"
                              : req.status === "approved"
                                ? "Admin Approval Notes:"
                                : "Decision Note:"}
                        </div>
                        <p className="whitespace-pre-line">{req.responseNote}</p>
                        {req.decidedByName && req.decidedAt ? (
                          <div className="mt-1 text-[11px] opacity-75">
                            Decided by {req.decidedByName} · {formatDate(req.decidedAt)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Role-Specific Action Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5 mt-1">
                      <div className="text-xs text-neutral-400">
                        Status: <span className="font-medium text-neutral-600">{req.statusLabel}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Worker Actions */}
                        {isWorker ? (
                          <>
                            {req.status === "approved" ? (
                              opParsed?.assignedPoSoNumber ? (
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "completed" })}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition min-h-[36px]"
                                >
                                  ✓ Complete Operation & Update Stock
                                </button>
                              ) : (
                                <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                                  Awaiting Staff PO/SO Assignment
                                </span>
                              )
                            ) : null}
                            {["submitted", "declined", "sent_back"].includes(req.status) ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "delete" })}
                                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-rose-400 hover:text-rose-600 transition min-h-[36px]"
                              >
                                Delete Request
                              </button>
                            ) : null}
                          </>
                        ) : null}

                        {/* Staff Actions (Stage 3) */}
                        {isManager ? (
                          <>
                            {req.status === "submitted" ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "under_review" })}
                                className="rounded-md border border-blue-400 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 transition min-h-[36px]"
                              >
                                Mark Under Review
                              </button>
                            ) : null}
                            {["submitted", "under_review"].includes(req.status) ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "sent_back" })}
                                className="rounded-md border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-900 hover:bg-purple-100 transition min-h-[36px]"
                              >
                                Request Information
                              </button>
                            ) : null}
                            {req.status === "approved" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssignTarget(req);
                                    setAssignPoSoNumber(opParsed?.assignedPoSoNumber || (isUnloading ? "PO-2026-" : "SO-2026-"));
                                    setAssignError(null);
                                  }}
                                  className="rounded-md border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition min-h-[36px]"
                                >
                                  {opParsed?.assignedPoSoNumber ? "Edit PO/SO Reference" : "+ Assign PO/SO Reference"}
                                </button>
                                {opParsed?.assignedPoSoNumber ? (
                                  <button
                                    type="button"
                                    onClick={() => setActionTarget({ request: req, decision: "completed" })}
                                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition min-h-[36px]"
                                  >
                                    Process & Complete
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {["submitted", "under_review"].includes(req.status) ? (
                              <span className="text-[11px] text-neutral-400 italic">
                                Admin approval required
                              </span>
                            ) : null}
                          </>
                        ) : null}

                        {/* Admin Actions (Stage 2) */}
                        {isOwner ? (
                          <>
                            {["submitted", "under_review"].includes(req.status) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "approved" })}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition min-h-[36px]"
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "declined" })}
                                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition min-h-[36px]"
                                >
                                  ✕ Reject
                                </button>
                                {req.status === "submitted" ? (
                                  <button
                                    type="button"
                                    onClick={() => setActionTarget({ request: req, decision: "under_review" })}
                                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition min-h-[36px]"
                                  >
                                    Under Review
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "sent_back" })}
                                  className="rounded-md border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-900 hover:bg-purple-100 transition min-h-[36px]"
                                >
                                  Request Info
                                </button>
                              </>
                            ) : null}
                            {req.status === "approved" ? (
                              <span className="text-xs text-neutral-500 italic">
                                Approved · Awaiting Staff PO/SO processing
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        )}

        {/* Shipment Requests Collapsible */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowShipmentSection((prev) => !prev)}
            className="flex items-center gap-2 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition"
          >
            <span>{showShipmentSection ? "▼ Hide" : "▶ View"} Legacy Shipment Requests ({shipmentRequests.length})</span>
          </button>
        </div>

        {showShipmentSection ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-950">Active Action Cards</h3>
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.title}>
                    <Link href={task.href}>
                      <Surface className="flex items-center justify-between gap-3 px-4 py-3 hover:border-neutral-400 transition">
                        <div>
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">{task.detail}</p>
                        </div>
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-950 px-2 text-xs font-medium text-white">
                          {task.count}
                        </span>
                      </Surface>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 lg:col-span-2">
              <h3 className="text-sm font-semibold text-neutral-950">Shipment Requests</h3>
              <Surface className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="text-[11px] tracking-wide text-neutral-500 uppercase border-b border-neutral-100">
                    <tr>
                      {["Request", "Type", "Order", "Warehouse", "Net weight", "Status", "Operation"].map((header) => (
                        <th key={header} scope="col" className="px-4 py-3 font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentRequests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                          No loading or unloading shipment requests recorded yet.
                        </td>
                      </tr>
                    ) : (
                      shipmentRequests.map((req) => {
                        const netTotal = req.lines.reduce((sum, line) => sum + line.netKg, 0);
                        const href =
                          req.type === "unloading"
                            ? `/containers/${req.shipmentReference}`
                            : `/outbound/${req.shipmentReference}`;
                        return (
                          <tr key={req.id} className="border-t border-neutral-100">
                            <td className="px-4 py-3 font-medium text-neutral-950">{req.number}</td>
                            <td className="px-4 py-3 capitalize">{req.type}</td>
                            <td className="px-4 py-3">{req.purchaseOrderNumber ?? "—"}</td>
                            <td className="px-4 py-3">{req.warehouse}</td>
                            <td className="px-4 py-3 tabular-nums">{formatKg(netTotal)}</td>
                            <td className="px-4 py-3">
                              <StatusPill label={req.status} />
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={href}
                                className="text-xs font-medium text-neutral-950 underline underline-offset-4"
                              >
                                Open {req.shipmentReference}
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </Surface>
            </div>
          </div>
        ) : null}
      </div>

      {/* ========================================================================= */}
      {/* Add New Request Modal (Worker) - Exactly Loading or Unloading */}
      {/* ========================================================================= */}
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-4 sm:p-6 shadow-2xl transition-all my-auto max-h-[92vh] overflow-y-auto max-sm:rounded-none max-sm:h-full max-sm:max-h-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-neutral-950">
                    {modalStep === "edit" ? "+ New Loading / Unloading Request" : "Review Request Summary"}
                  </h3>
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {modalStep === "edit" ? "Step 1 of 2: Details" : "Step 2 of 2: Confirm"}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Assigned warehouse: <strong className="text-neutral-800">{identity.warehouse ?? "Warehouse"}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setModalStep("edit");
                  setCreateError(null);
                }}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError ? (
              <div role="alert" className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-medium">
                {createError}
              </div>
            ) : null}

            {modalStep === "edit" ? (
              <form onSubmit={handleProceedToReview} className="mt-4 space-y-4 text-xs">
                {/* 1. Request Type (Strictly Loading or Unloading) */}
                <div>
                  <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                    1. Operation Request Type <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-neutral-500 mb-2">Select the operational task to perform at the warehouse.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRequestType("unloading")}
                      className={`flex items-center gap-3 rounded-xl p-3.5 border transition min-h-[56px] text-left ${
                        requestType === "unloading"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600 shadow-xs"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      <span className="text-2xl shrink-0">📥</span>
                      <div>
                        <div className="font-bold text-sm">Unloading</div>
                        <div className="text-[11px] opacity-80 font-normal">Intake & Receiving into Stock</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequestType("loading")}
                      className={`flex items-center gap-3 rounded-xl p-3.5 border transition min-h-[56px] text-left ${
                        requestType === "loading"
                          ? "border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-600 shadow-xs"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      <span className="text-2xl shrink-0">📤</span>
                      <div>
                        <div className="font-bold text-sm">Loading</div>
                        <div className="text-[11px] opacity-80 font-normal">Outbound Dispatch from Stock</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Priority Selection */}
                <div>
                  <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                    Priority Level
                  </label>
                  <div className="mt-1 grid grid-cols-4 gap-1.5">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPriority(opt.id)}
                        className={`rounded-lg py-2.5 text-xs font-medium border text-center transition min-h-[44px] ${
                          priority === opt.id
                            ? "border-neutral-950 bg-neutral-950 text-white shadow-xs font-bold"
                            : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Material/Product Type & 3. Material Description */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-neutral-100 pt-3">
                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      2. Material / Product Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={materialType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMaterialType(val);
                        if (val === "LDPE") setMaterialDescription("LDPE film");
                        else if (val === "HDPE") setMaterialDescription("HDPE natural flakes / regrind");
                        else if (val === "PP") setMaterialDescription("PP woven bags / flakes");
                        else if (val === "PET") setMaterialDescription("PET bottle flakes");
                      }}
                      className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    >
                      <option value="LDPE">LDPE (Low-Density Polyethylene)</option>
                      <option value="HDPE">HDPE (High-Density Polyethylene)</option>
                      <option value="PP">PP (Polypropylene)</option>
                      <option value="PET">PET (Polyethylene Terephthalate)</option>
                      <option value="Plastics">Plastics (General / Mixed)</option>
                      <option value="Cardboard">Cardboard & Paper</option>
                      <option value="Metals">Metals & Scrap</option>
                      <option value="Other">Other Material</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      3. Material Description
                    </label>
                    <input
                      type="text"
                      value={materialDescription}
                      onChange={(e) => setMaterialDescription(e.target.value)}
                      placeholder="e.g. LDPE 98/2 transparent film, baled"
                      className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    />
                  </div>
                </div>

                {/* 4. Packaging Type, 5. Number of Packages, 6. Tare Weight */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-neutral-100 pt-3">
                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      4. Packaging Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={packagingType}
                      onChange={(e) => handlePackagingTypeChange(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    >
                      <option value="Normal Pallet">Normal Pallet (25 kg tare)</option>
                      <option value="Euro Pallet">Euro Pallet (20 kg tare)</option>
                      <option value="Big Bag">Big Bag (2 kg tare)</option>
                      <option value="None / Loose">None / Loose (0 kg tare)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      5. Number of Packages <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={packageCount}
                      onChange={(e) => setPackageCount(e.target.value)}
                      required
                      className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      Packaging Unit Tare (kg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={tarePerPackageKg}
                      onChange={(e) => setTarePerPackageKg(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    />
                  </div>
                </div>

                {/* 7. Gross Weight & Live Net Weight Calculation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-neutral-100 pt-3">
                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      6. Gross Weight (kg) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={grossWeightKg}
                      onChange={(e) => setGrossWeightKg(e.target.value)}
                      placeholder="e.g. 15400"
                      required
                      className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                      7. Net Material Weight (Auto-Calculated)
                    </label>
                    <div className="mt-1 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-100 px-3.5 py-2 min-h-[44px]">
                      <div>
                        <span className="font-mono text-base font-bold text-emerald-800">
                          {isNetWeightValid ? `${netWeightKg.toLocaleString()} kg` : "—"}
                        </span>
                        <div className="text-[10px] text-neutral-500">
                          Formula: Gross ({parsedGrossKg || 0} kg) − Tare ({totalTareWeightKg} kg)
                        </div>
                      </div>
                      {isNetWeightValid ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Valid Net Weight
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          Enter Gross &gt; Tare
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 8. Warehouse Location */}
                <div className="border-t border-neutral-100 pt-3">
                  <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                    8. Warehouse / Specific Location <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={warehouseLocation}
                    onChange={(e) => setWarehouseLocation(e.target.value)}
                    placeholder="e.g. Bornem Warehouse - Loading Bay 2 / Rack A-14"
                    required
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                  />
                </div>

                {/* Optional Shipment / Container Link */}
                {relevantShipments.length > 0 ? (
                  <div>
                    <label className="block font-semibold text-neutral-700 uppercase tracking-wide">
                      Link Container / Shipment (Optional)
                    </label>
                    <select
                      value={shipmentId}
                      onChange={(e) => setShipmentId(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden min-h-[44px]"
                    >
                      <option value="">None / Standalone Operation</option>
                      {relevantShipments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {/* 9. Photos & 10. Supporting Documents */}
                <div className="border-t border-neutral-100 pt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-neutral-800 uppercase tracking-wide">
                        9. Relevant Photos & Supporting Documents
                      </span>
                      <p className="text-[11px] text-neutral-500">
                        Photos are automatically compressed client-side before upload to optimize upload time.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "photo")}
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 min-h-[36px]"
                      >
                        📷 + Add Photos
                      </button>

                      <input
                        ref={docInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "document")}
                      />
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 min-h-[36px]"
                      >
                        📄 + Add Documents
                      </button>
                    </div>
                  </div>

                  {stagedFiles.length > 0 ? (
                    <div className="space-y-1.5 rounded-xl border border-neutral-200 bg-neutral-50 p-2.5">
                      <div className="text-[11px] font-semibold text-neutral-600 mb-1">
                        Files ready for upload ({stagedFiles.length}):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {stagedFiles.map((staged, idx) => (
                          <div
                            key={`${staged.name}-${idx}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span>{staged.kind === "photo" ? "🖼️" : "📄"}</span>
                              <div className="min-w-0">
                                <p className="font-medium text-neutral-900 truncate">{staged.name}</p>
                                <p className="text-[10px] text-neutral-500">
                                  {formatBytes(staged.size)}
                                  {staged.wasCompressed ? (
                                    <span className="text-emerald-700 ml-1 font-semibold">
                                      (-{Math.round(((staged.originalSize - staged.size) / staged.originalSize) * 100)}% compressed)
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeStagedFile(idx)}
                              className="text-neutral-400 hover:text-rose-600 p-1 text-base font-bold"
                              title="Remove file"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 11. Additional Notes */}
                <div className="border-t border-neutral-100 pt-3">
                  <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                    10. Additional Notes / Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Specific handling notes, damage observations, or truck driver notes…"
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-neutral-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition min-h-[44px]"
                  >
                    Review Request &rarr;
                  </button>
                </div>
              </form>
            ) : (
              /* Review Summary Step 2 */
              <div className="mt-4 space-y-4 text-xs">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="font-semibold text-neutral-700">Operation Type</span>
                    <span className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded ${
                      requestType === "loading"
                        ? "bg-blue-100 text-blue-900"
                        : "bg-emerald-100 text-emerald-900"
                    }`}>
                      {requestType === "loading" ? "📤 Loading (Dispatch)" : "📥 Unloading (Receipt)"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-neutral-500 font-medium">Material:</span>
                      <p className="font-bold text-neutral-950">{materialType}</p>
                      {materialDescription ? <p className="text-[11px] text-neutral-600">{materialDescription}</p> : null}
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Packaging:</span>
                      <p className="font-bold text-neutral-950">{packageCount} × {packagingType}</p>
                      <p className="text-[11px] text-neutral-600">Unit Tare: {tarePerPackageKg} kg | Total: {totalTareWeightKg} kg</p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-neutral-200 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold">Gross Weight</span>
                      <p className="font-bold text-sm text-neutral-900">{parsedGrossKg.toLocaleString()} kg</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold">Total Packaging Tare</span>
                      <p className="font-bold text-sm text-neutral-600">− {totalTareWeightKg.toLocaleString()} kg</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 uppercase font-bold">Net Material Weight</span>
                      <p className="font-bold text-base text-emerald-800">{netWeightKg.toLocaleString()} kg</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-neutral-200 pt-2">
                    <div>
                      <span className="text-neutral-500 font-medium">Location:</span>
                      <p className="font-medium text-neutral-900">{warehouseLocation}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Attachments:</span>
                      <p className="font-medium text-neutral-900">{stagedFiles.length} file(s) attached</p>
                    </div>
                  </div>

                  {notes ? (
                    <div className="border-t border-neutral-200 pt-2">
                      <span className="text-neutral-500 font-medium">Notes:</span>
                      <p className="text-neutral-800 whitespace-pre-line">{notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setModalStep("edit")}
                    disabled={createSubmitting}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                  >
                    &larr; Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSubmit}
                    disabled={createSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition min-h-[44px] disabled:opacity-50"
                  >
                    {createSubmitting ? "Submitting Request…" : "✓ Confirm & Submit Request"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* Staff PO/SO Assignment Modal (Stage 3) */}
      {/* ========================================================================= */}
      {assignTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl transition-all my-auto max-sm:rounded-none max-sm:h-full max-sm:max-h-full">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-950">
                  Assign PO/SO Reference
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Request {assignTarget.number} · {assignTarget.warehouse}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignTarget(null)}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {assignError ? (
              <div role="alert" className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-medium">
                {assignError}
              </div>
            ) : null}

            <form onSubmit={handleAssignPoSoSubmit} className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Operation Type</span>
                  <span className="font-bold text-neutral-900">
                    {parseOperationalRequestDescription(assignTarget.description).operationalDetails?.requestType === "loading"
                      ? "📤 Loading (Dispatch / Outbound)"
                      : "📥 Unloading (Receipt / Inbound)"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Material & Net Weight</span>
                  <span className="font-semibold text-neutral-900">
                    {parseOperationalRequestDescription(assignTarget.description).operationalDetails?.materialType} (
                    {parseOperationalRequestDescription(assignTarget.description).operationalDetails?.netWeightKg.toLocaleString()} kg)
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-800 uppercase tracking-wide">
                  {parseOperationalRequestDescription(assignTarget.description).operationalDetails?.requestType === "loading"
                    ? "Sales Order (SO) Number"
                    : "Purchase Order (PO) Number"}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <p className="text-[11px] text-neutral-500 mb-1.5">
                  {parseOperationalRequestDescription(assignTarget.description).operationalDetails?.requestType === "loading"
                    ? "Must start with SO- (e.g. SO-2026-0001). Stock will be deducted upon completion."
                    : "Must start with PO- (e.g. PO-2026-0001). Stock will be increased upon completion."}
                </p>
                <input
                  type="text"
                  value={assignPoSoNumber}
                  onChange={(e) => setAssignPoSoNumber(e.target.value)}
                  placeholder={
                    parseOperationalRequestDescription(assignTarget.description).operationalDetails?.requestType === "loading"
                      ? "SO-2026-0001"
                      : "PO-2026-0001"
                  }
                  required
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base sm:text-xs font-mono font-bold text-neutral-900 focus:border-neutral-950 focus:outline-hidden uppercase min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3">
                <button
                  type="button"
                  onClick={() => setAssignTarget(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting}
                  className="rounded-lg bg-neutral-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition min-h-[44px] disabled:opacity-50"
                >
                  {assignSubmitting ? "Assigning Reference…" : "Confirm Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* Decision Modal (Admin Decision or Worker/Staff Completion) */}
      {/* ========================================================================= */}
      {actionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-neutral-950">
              {actionTarget.decision === "approved"
                ? `Approve Request ${actionTarget.request.number}`
                : actionTarget.decision === "declined"
                  ? `Reject Request ${actionTarget.request.number}`
                  : actionTarget.decision === "sent_back"
                    ? `Request Info for ${actionTarget.request.number}`
                    : actionTarget.decision === "completed"
                      ? `Complete Operation ${actionTarget.request.number}`
                      : `Delete Request ${actionTarget.request.number}`}
            </h3>

            <p className="mt-1 text-xs text-neutral-500">
              {actionTarget.decision === "approved"
                ? "Approving this request authorizes Staff to assign PO/SO numbers and proceed with operations."
                : actionTarget.decision === "declined"
                  ? "Rejection prevents this request from entering operations. An explanation is mandatory."
                  : actionTarget.decision === "sent_back"
                    ? "Send back to the worker to provide additional documents, weights, or corrections."
                    : actionTarget.decision === "completed"
                      ? "Completing this operation will move the net material stock in the warehouse inventory and append to transaction history."
                      : "Permanently delete this request draft."}
            </p>

            {actionError ? (
              <div role="alert" className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800 font-medium">
                {actionError}
              </div>
            ) : null}

            {actionTarget.decision !== "delete" && actionTarget.decision !== "completed" ? (
              <div className="mt-4">
                <label className="block text-xs font-medium text-neutral-700">
                  {actionTarget.decision === "declined"
                    ? "Mandatory Rejection Reason"
                    : actionTarget.decision === "sent_back"
                      ? "Information Requested"
                      : "Optional Decision Note"}
                </label>
                <textarea
                  rows={3}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Provide detailed feedback or instructions for the worker…"
                  className="mt-1 block w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-neutral-950 focus:outline-hidden"
                />
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionTarget(null);
                  setActionNote("");
                  setActionError(null);
                }}
                disabled={actionSubmitting}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={actionSubmitting}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition min-h-[44px] disabled:opacity-50 ${
                  actionTarget.decision === "declined" || actionTarget.decision === "delete"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : actionTarget.decision === "approved" || actionTarget.decision === "completed"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-neutral-950 hover:bg-neutral-800"
                }`}
              >
                {actionSubmitting
                  ? "Processing…"
                  : actionTarget.decision === "delete"
                    ? "Confirm Delete"
                    : actionTarget.decision === "completed"
                      ? "Confirm Completion & Move Stock"
                      : "Confirm Decision"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dedicated Attachment Preview Modal */}
      <AttachmentPreviewModal
        item={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </>
  );
}
