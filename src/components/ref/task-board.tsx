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
  type DemoOrder,
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

  // Worker PO/SO Assignment state
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const [workerActiveTab, setWorkerActiveTab] = useState<"today" | "upcoming" | "requests">("today");
  const [executingOrder, setExecutingOrder] = useState<DemoOrder | null>(null);
  const [executingNotes, setExecutingNotes] = useState("");
  const [executingSubmitting, setExecutingSubmitting] = useState(false);
  const [executingUploading, setExecutingUploading] = useState(false);

  const workerAssignedOrders = useMemo(() => {
    if (!isWorker) return [];
    return (demo.state.orders || []).filter(
      (o) => o.assignedWorkerId === identity.id || o.assignedWorkerName === identity.name
    );
  }, [demo.state.orders, isWorker, identity.id, identity.name]);

  const todayAssignments = useMemo(() => {
    return workerAssignedOrders.filter(
      (o) => !o.scheduledDate || o.scheduledDate <= todayDateStr
    );
  }, [workerAssignedOrders, todayDateStr]);

  const upcomingAssignments = useMemo(() => {
    return workerAssignedOrders.filter(
      (o) => Boolean(o.scheduledDate && o.scheduledDate > todayDateStr)
    );
  }, [workerAssignedOrders, todayDateStr]);

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
  const pageTitle = isWorker ? "My Assigned Tasks" : "All Requests & Operational Tasks";

  const pageSubtitle = isWorker
    ? `${identity.warehouse ?? "Assigned warehouse"} · Execute assigned loading & unloading orders, upload photos and evidence, and submit task completions`
    : isOwner
      ? "Admin view · Review attachments and audit history, approve or reject worker requests across warehouses (operational records are read-only)"
      : "Staff view · Manage PO/SO orders, assign worker tasks across warehouses, and process operational completions";

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title={pageTitle} subtitle={pageSubtitle} />
      </div>

      {/* Worker PO/SO Assigned Tasks Hub */}
      {isWorker ? (
        <div className="mb-6">
          <div className="flex border-b border-neutral-200">
            <button
              type="button"
              onClick={() => setWorkerActiveTab("today")}
              className={`relative pb-3 px-4 text-sm font-semibold transition ${
                workerActiveTab === "today"
                  ? "border-b-2 border-neutral-950 text-neutral-950"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              Today&apos;s Assignments
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                todayAssignments.length > 0 ? "bg-amber-100 text-amber-800 font-bold" : "bg-neutral-100 text-neutral-600"
              }`}>
                {todayAssignments.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWorkerActiveTab("upcoming")}
              className={`relative pb-3 px-4 text-sm font-semibold transition ${
                workerActiveTab === "upcoming"
                  ? "border-b-2 border-neutral-950 text-neutral-950"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              Upcoming Assignments
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {upcomingAssignments.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWorkerActiveTab("requests")}
              className={`relative pb-3 px-4 text-sm font-semibold transition ${
                workerActiveTab === "requests"
                  ? "border-b-2 border-neutral-950 text-neutral-950"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              Loading / Unloading Requests
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {visibleGeneral.length}
              </span>
            </button>
          </div>

          {/* Today's Assignments View */}
          {workerActiveTab === "today" && (
            <div className="mt-4 space-y-3">
              {todayAssignments.length === 0 ? (
                <Surface className="p-8 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 mb-2">
                    📋
                  </div>
                  <p className="text-sm font-medium text-neutral-800">No tasks scheduled for today</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Staff-assigned PO/SO tasks scheduled for today will appear here for execution.
                  </p>
                </Surface>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {todayAssignments.map((ord) => (
                    <Surface key={ord.number} className="flex flex-col justify-between p-4 border-amber-200 bg-amber-50/20 shadow-xs">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                            Today: {ord.scheduledDate || "Scheduled"}
                          </span>
                          <StatusPill label={ord.executionStatus === "completed" ? "Completed" : "Ready to Execute"} />
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-neutral-950">{ord.title || ord.number}</h3>
                        <p className="text-xs text-neutral-600 font-medium">Ref: {ord.number} · {ord.supplier}</p>
                        <div className="mt-2 space-y-1 text-xs text-neutral-600">
                          <p>Material: <span className="font-semibold text-neutral-900">{ord.material}</span></p>
                          <p>Weight: <span className="font-semibold text-neutral-900">{formatKg(ord.quantityKg)}</span></p>
                          {ord.notes ? (
                            <p className="italic text-neutral-700 bg-white/70 p-1.5 rounded border border-neutral-200 mt-1">
                              Staff note: &ldquo;{ord.notes}&rdquo;
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between gap-2">
                        <Link
                          href={`/purchases/${ord.number}`}
                          className="text-xs font-medium text-neutral-700 hover:text-neutral-950 underline"
                        >
                          View PO &rarr;
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setExecutingOrder(ord);
                            setExecutingNotes(ord.completionNotes || "");
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
                        >
                          {ord.executionStatus === "completed" ? "Review Evidence" : "Execute & Upload Evidence"}
                        </button>
                      </div>
                    </Surface>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming Assignments View */}
          {workerActiveTab === "upcoming" && (
            <div className="mt-4 space-y-3">
              {upcomingAssignments.length === 0 ? (
                <Surface className="p-8 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 mb-2">
                    📅
                  </div>
                  <p className="text-sm font-medium text-neutral-800">No upcoming tasks scheduled in advance</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Tasks scheduled by Staff for tomorrow or future dates will appear here for advance preparation.
                  </p>
                </Surface>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {upcomingAssignments.map((ord) => (
                    <Surface key={ord.number} className="flex flex-col justify-between p-4 border-indigo-100 bg-indigo-50/20 shadow-xs">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900">
                            Upcoming: {ord.scheduledDate}
                          </span>
                          <span className="text-xs font-medium text-neutral-500">Advance Prep</span>
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-neutral-950">{ord.title || ord.number}</h3>
                        <p className="text-xs text-neutral-600 font-medium">Ref: {ord.number} · {ord.supplier}</p>
                        <div className="mt-2 space-y-1 text-xs text-neutral-600">
                          <p>Material: <span className="font-semibold text-neutral-900">{ord.material}</span></p>
                          <p>Weight: <span className="font-semibold text-neutral-900">{formatKg(ord.quantityKg)}</span></p>
                          {ord.notes ? (
                            <p className="italic text-neutral-700 bg-white/70 p-1.5 rounded border border-neutral-200 mt-1">
                              Staff note: &ldquo;{ord.notes}&rdquo;
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between gap-2">
                        <Link
                          href={`/purchases/${ord.number}`}
                          className="text-xs font-medium text-neutral-700 hover:text-neutral-950 underline"
                        >
                          View Details &rarr;
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setExecutingOrder(ord);
                            setExecutingNotes(ord.completionNotes || "");
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 hover:bg-neutral-50"
                        >
                          Prepare / Notes
                        </button>
                      </div>
                    </Surface>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

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

      {/* Worker Task Execution & Evidence Modal */}
      {executingOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {executingOrder.scheduledDate ? `Scheduled: ${executingOrder.scheduledDate}` : "Today's Task"}
                </span>
                <h3 className="mt-1 text-lg font-bold text-neutral-950">{executingOrder.title || executingOrder.number}</h3>
              </div>
              <button
                type="button"
                onClick={() => setExecutingOrder(null)}
                className="text-neutral-400 hover:text-neutral-700 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-3 text-xs">
                <div>
                  <span className="text-neutral-500">PO Reference:</span>
                  <p className="font-semibold text-neutral-900">{executingOrder.number}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Supplier/Customer:</span>
                  <p className="font-semibold text-neutral-900">{executingOrder.supplier}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Material:</span>
                  <p className="font-semibold text-neutral-900">{executingOrder.material}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Quantity:</span>
                  <p className="font-semibold text-neutral-900">{formatKg(executingOrder.quantityKg)}</p>
                </div>
                {executingOrder.notes ? (
                  <div className="col-span-2 mt-1 border-t border-neutral-200 pt-1">
                    <span className="text-neutral-500">Staff Instructions:</span>
                    <p className="font-medium text-neutral-800">{executingOrder.notes}</p>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700">
                  Completion Notes / Observations
                  <textarea
                    rows={3}
                    value={executingNotes}
                    onChange={(e) => setExecutingNotes(e.target.value)}
                    placeholder="Enter operation observations, gross/tare weights, seal numbers..."
                    className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-dashed border-neutral-300 p-3 bg-neutral-50/50">
                <span className="block text-xs font-semibold text-neutral-800 mb-2">Attach Task Evidence</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
                    <span>📷 Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void (async () => {
                          setExecutingUploading(true);
                          const compressed = await compressImageIfNeeded(file);
                          const base64 = await fileToBase64(compressed.blob);
                          await demo.selectDocument({
                            id: `doc-${Date.now()}`,
                            name: file.name,
                            category: "Purchase",
                            mime: compressed.mime || "image/jpeg",
                            size: compressed.size,
                            bytesBase64: base64,
                          });
                          setExecutingUploading(false);
                        })();
                      }}
                    />
                  </label>
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
                    <span>📄 Upload Document / CMR</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void (async () => {
                          setExecutingUploading(true);
                          const base64 = await fileToBase64(file);
                          await demo.selectDocument({
                            id: `doc-${Date.now()}`,
                            name: file.name,
                            category: "Transport",
                            mime: file.type || "application/pdf",
                            size: file.size,
                            bytesBase64: base64,
                          });
                          setExecutingUploading(false);
                        })();
                      }}
                    />
                  </label>
                  {executingUploading ? <span className="text-xs text-neutral-500">Uploading…</span> : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
              <button
                type="button"
                onClick={() => setExecutingOrder(null)}
                className="h-9 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Close
              </button>
              {executingOrder.executionStatus !== "completed" ? (
                <button
                  type="button"
                  disabled={executingSubmitting}
                  onClick={() => {
                    void (async () => {
                      setExecutingSubmitting(true);
                      await demo.completeWorkerPo({
                        poNumber: executingOrder.number,
                        completionNotes: executingNotes.trim() || undefined,
                      });
                      setExecutingSubmitting(false);
                      setExecutingOrder(null);
                    })();
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {executingSubmitting ? "Completing…" : "Mark Task Completed"}
                </button>
              ) : (
                <span className="text-xs font-bold text-emerald-700">✓ Completed</span>
              )}
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
