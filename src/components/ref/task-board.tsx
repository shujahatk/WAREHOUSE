"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useIsMounted } from "@/lib/use-mounted";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import {
  formatKg,
  openTasks,
  type GeneralRequestCategory,
  type GeneralRequestPriority,
  type GeneralRequestView,
  type GeneralRequestAttachmentView,
} from "@/domain/view";

const CATEGORY_OPTIONS: { id: GeneralRequestCategory; label: string; desc: string }[] = [
  { id: "materials_packaging", label: "Materials / Packaging", desc: "Request extra pallets, wrap, straps, or report packaging defects" },
  { id: "stock_issue", label: "Stock / Inventory Issue", desc: "Report damaged stock, discrepancies, or inventory storage issues" },
  { id: "loading_unloading", label: "Loading / Unloading", desc: "Operations assistance, container issues, or bay bottlenecks" },
  { id: "equipment_maintenance", label: "Equipment / Maintenance", desc: "Forklift, dock plate, scanner, or facility repairs needed" },
  { id: "missing_documents", label: "Missing Documents / Information", desc: "Missing CMR, packing lists, delivery instructions, or seal numbers" },
  { id: "other", label: "Other Operational Request", desc: "Any other urgent or routine warehouse operational request" },
];

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

  // Create request modal state
  const [showCreateModal, setShowCreateModal] = useState(() => {
    return typeof window !== "undefined" && window.location.search.includes("new=true");
  });
  const [category, setCategory] = useState<GeneralRequestCategory>("materials_packaging");
  const [priority, setPriority] = useState<GeneralRequestPriority>("normal");
  const [description, setDescription] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [stagedFiles, setStagedFiles] = useState<{ file: File; name: string; size: number; base64: string }[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Decision & Action dialog state
  const [actionTarget, setActionTarget] = useState<{
    request: GeneralRequestView;
    decision: "approved" | "declined" | "under_review" | "sent_back" | "completed" | "delete";
  } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Preview attachment state
  const [previewAttachment, setPreviewAttachment] = useState<GeneralRequestAttachmentView | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [showShipmentSection, setShowShipmentSection] = useState(false);

  // Filter general requests according to strict role permissions:
  // Workers ONLY see and track their own requests
  const visibleGeneral = useMemo(() => {
    let list = demo.state.generalRequests || [];
    if (isWorker) {
      list = list.filter((r) => r.createdByName === identity.name);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (categoryFilter !== "all") {
      list = list.filter((r) => r.category === categoryFilter);
    }
    if (warehouseFilter !== "all" && !isWorker) {
      list = list.filter((r) => r.warehouse.toLowerCase() === warehouseFilter.toLowerCase());
    }
    return list;
  }, [demo.state.generalRequests, isWorker, identity.name, statusFilter, categoryFilter, warehouseFilter]);

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

  // Staging files
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: { file: File; name: string; size: number; base64: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        setCreateError(`File "${file.name}" exceeds the 10 MB limit.`);
        return;
      }
      try {
        const base64 = await readFileAsBase64(file);
        newFiles.push({ file, name: file.name, size: file.size, base64 });
      } catch {
        setCreateError(`Could not read file "${file.name}".`);
        return;
      }
    }
    setStagedFiles((prev) => [...prev, ...newFiles]);
    setCreateError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit new request
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setCreateError("Please enter a description for your request.");
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);

    const attachments = stagedFiles.map((f) => ({
      name: f.name,
      bytesBase64: f.base64,
    }));

    const err = await demo.createGeneralRequest({
      category,
      priority,
      description: description.trim(),
      shipmentId: shipmentId || null,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (err) {
      setCreateError(err);
      setCreateSubmitting(false);
    } else {
      setShowCreateModal(false);
      setDescription("");
      setCategory("materials_packaging");
      setPriority("normal");
      setShipmentId("");
      setStagedFiles([]);
      setCreateSubmitting(false);
    }
  };

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
    ? `${identity.warehouse ?? "Assigned warehouse"} · Submit operational requests, attach documents/photos, and track status`
    : isOwner
      ? "Admin view · Review attachments and audit history, approve or reject worker requests across all warehouses (operational records are read-only)"
      : "Staff view · Review operational requests, request information, and process approved work across warehouses";

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title={pageTitle} subtitle={pageSubtitle} />
        {isWorker ? (
          <div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              + Add New Request
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
                { id: "submitted", label: "Submitted" },
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
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
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
              {/* Category Filter */}
              <select
                aria-label="Filter requests by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-800 focus:border-neutral-950 focus:outline-hidden"
              >
                <option value="all">All Categories</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>

              {/* Warehouse Filter (Office Only) */}
              {!isWorker ? (
                <select
                  aria-label="Filter requests by warehouse"
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-800 focus:border-neutral-950 focus:outline-hidden"
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

        {/* Requests List */}
        {visibleGeneral.length === 0 ? (
          <Surface className="px-6 py-12 text-center">
            <svg
              className="mx-auto h-10 w-10 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-neutral-900">
              {isWorker ? "No requests submitted yet" : "No requests found matching criteria"}
            </h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
              {isWorker
                ? "Submit requests for materials, equipment maintenance, stock issues, or missing operational documents."
                : "Operational requests submitted by workers across warehouses will appear here."}
            </p>
            {isWorker ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
                >
                  + Add New Request
                </button>
              </div>
            ) : null}
          </Surface>
        ) : (
          <div className="space-y-3">
            {visibleGeneral.map((req) => {
              const priorityInfo = PRIORITY_OPTIONS.find((p) => p.id === req.priority);
              return (
                <Surface key={req.id} className="p-4 transition hover:border-neutral-300">
                  <div className="flex flex-col gap-3">
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-neutral-950">{req.number}</span>
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                          {req.categoryLabel}
                        </span>
                        {priorityInfo && priorityInfo.id !== "normal" ? (
                          <span className={`rounded-md px-2 py-0.5 text-xs ${priorityInfo.tone}`}>
                            {priorityInfo.label} Priority
                          </span>
                        ) : null}
                        <span className="text-xs text-neutral-500">·</span>
                        <span className="text-xs font-medium text-neutral-700">{req.warehouse}</span>
                        {!isWorker ? (
                          <span className="text-xs text-neutral-500">by {req.createdByName}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">{formatDate(req.createdAt)}</span>
                        <StatusPill label={req.statusLabel} />
                      </div>
                    </div>

                    {/* Description Body */}
                    <div className="text-sm text-neutral-900 whitespace-pre-line leading-relaxed">
                      {req.description}
                    </div>

                    {/* Linked Shipment/Order if any */}
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
                            PO: <strong className="text-neutral-900">{req.purchaseOrderNumber}</strong>
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
                                onClick={() => setPreviewAttachment(att)}
                                className="group flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 transition hover:border-neutral-950 hover:bg-neutral-50"
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
                              ? "Information Requested by Staff/Admin:"
                              : req.status === "approved"
                                ? "Approval Feedback:"
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
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "completed" })}
                                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                              >
                                ✓ Mark Completed
                              </button>
                            ) : null}
                            {["submitted", "declined", "sent_back"].includes(req.status) ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "delete" })}
                                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-rose-400 hover:text-rose-600 transition"
                              >
                                Delete Request
                              </button>
                            ) : null}
                          </>
                        ) : null}

                        {/* Staff Actions */}
                        {isManager ? (
                          <>
                            {req.status === "submitted" ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "under_review" })}
                                className="rounded-md border border-blue-400 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 transition"
                              >
                                Mark Under Review
                              </button>
                            ) : null}
                            {["submitted", "under_review"].includes(req.status) ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "sent_back" })}
                                className="rounded-md border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-900 hover:bg-purple-100 transition"
                              >
                                Request Information
                              </button>
                            ) : null}
                            {req.status === "approved" ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "completed" })}
                                className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 transition"
                              >
                                Process & Complete
                              </button>
                            ) : null}
                            {["submitted", "under_review"].includes(req.status) ? (
                              <span className="text-[11px] text-neutral-400 italic">
                                Admin approval required
                              </span>
                            ) : null}
                          </>
                        ) : null}

                        {/* Admin Actions */}
                        {isOwner ? (
                          <>
                            {["submitted", "under_review"].includes(req.status) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "approved" })}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "declined" })}
                                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition"
                                >
                                  ✕ Reject
                                </button>
                                {req.status === "submitted" ? (
                                  <button
                                    type="button"
                                    onClick={() => setActionTarget({ request: req, decision: "under_review" })}
                                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition"
                                  >
                                    Under Review
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ request: req, decision: "sent_back" })}
                                  className="rounded-md border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-900 hover:bg-purple-100 transition"
                                >
                                  Request Info
                                </button>
                              </>
                            ) : null}
                            {req.status === "approved" ? (
                              <button
                                type="button"
                                onClick={() => setActionTarget({ request: req, decision: "completed" })}
                                className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 transition"
                              >
                                Mark Completed
                              </button>
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
      </div>

      {/* Secondary Section: Shipment Loading & Unloading Operations */}
      <div className="mt-8 pt-6 border-t border-neutral-200 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-950">Shipment Operations & Action Queue</h2>
            <p className="text-xs text-neutral-500">
              Container and truck loading/unloading operations linked directly to transport shipments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowShipmentSection(!showShipmentSection)}
            className="text-xs font-medium text-neutral-600 hover:text-neutral-950 underline underline-offset-4"
          >
            {showShipmentSection ? "Hide Operations" : "Show Operations"}
          </button>
        </div>

        {showShipmentSection ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              <h3 className="text-sm font-semibold text-neutral-950">Action queue</h3>
              <ul className="space-y-2">
                {tasks.length === 0 ? (
                  <li>
                    <Surface className="px-4 py-6 text-sm text-neutral-600">No open action items.</Surface>
                  </li>
                ) : null}
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
      {/* Add New Request Modal (Worker) */}
      {/* ========================================================================= */}
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl transition-all">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-950">+ Add New Warehouse Request</h3>
                <p className="text-xs text-neutral-500">
                  Submit a request for your assigned warehouse ({identity.warehouse ?? "Warehouse"}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              {createError ? (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  {createError}
                </div>
              ) : null}

              {/* 1. Category */}
              <div>
                <label className="block text-xs font-semibold text-neutral-800 uppercase tracking-wide">
                  Request Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as GeneralRequestCategory)}
                  className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {CATEGORY_OPTIONS.find((c) => c.id === category)?.desc}
                </p>
              </div>

              {/* 2. Priority */}
              <div>
                <label className="block text-xs font-semibold text-neutral-800 uppercase tracking-wide">
                  Priority
                </label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPriority(opt.id)}
                      className={`rounded-lg py-1.5 text-xs font-medium border text-center transition ${
                        priority === opt.id
                          ? "border-neutral-950 bg-neutral-950 text-white shadow-xs"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Description (Required) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-800 uppercase tracking-wide">
                  Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue, required materials, or task details..."
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  required
                />
              </div>

              {/* 4. Optional Linked Shipment */}
              {relevantShipments.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 uppercase tracking-wide">
                    Linked Shipment / Container <span className="text-neutral-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={shipmentId}
                    onChange={(e) => setShipmentId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  >
                    <option value="">None / General warehouse request</option>
                    {relevantShipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* 5. Photos & Documents Attachment Upload */}
              <div>
                <label className="block text-xs font-semibold text-neutral-800 uppercase tracking-wide">
                  Photos & Document Attachments <span className="text-neutral-400 font-normal">(Optional)</span>
                </label>
                <div className="mt-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                    id="worker-request-file-input"
                  />
                  <label
                    htmlFor="worker-request-file-input"
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-4 transition hover:border-neutral-900 hover:bg-neutral-100"
                  >
                    <svg className="h-6 w-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="mt-1 text-xs font-medium text-neutral-700">
                      Click to attach photos or documents
                    </span>
                    <span className="text-[10px] text-neutral-400">PNG, JPG, PDF up to 10 MB</span>
                  </label>
                </div>

                {/* Staged Files Preview */}
                {stagedFiles.length > 0 ? (
                  <ul className="mt-2.5 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
                    {stagedFiles.map((sf, idx) => (
                      <li key={idx} className="flex items-center justify-between p-2 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-neutral-400">#{idx + 1}</span>
                          <span className="font-medium text-neutral-900 truncate">{sf.name}</span>
                          <span className="text-[11px] text-neutral-400">({formatBytes(sf.size)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStagedFile(idx)}
                          className="text-xs font-semibold text-rose-600 hover:underline shrink-0"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createSubmitting}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-lg bg-neutral-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
                >
                  {createSubmitting ? "Submitting Request..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* Decision / Action Dialog (Approve, Reject, Under Review, Sent Back, Complete, Delete) */}
      {/* ========================================================================= */}
      {actionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-neutral-950">
              {actionTarget.decision === "approved"
                ? `Approve ${actionTarget.request.number}`
                : actionTarget.decision === "declined"
                  ? `Reject ${actionTarget.request.number}`
                  : actionTarget.decision === "under_review"
                    ? `Mark ${actionTarget.request.number} Under Review`
                    : actionTarget.decision === "sent_back"
                      ? `Request Information on ${actionTarget.request.number}`
                      : actionTarget.decision === "completed"
                        ? `Complete ${actionTarget.request.number}`
                        : `Delete ${actionTarget.request.number}`}
            </h3>

            <p className="mt-1 text-xs text-neutral-500">
              {actionTarget.decision === "declined"
                ? "Enter the reason for rejection. This feedback will be visible to the worker."
                : actionTarget.decision === "sent_back"
                  ? "Explain what information, documents or corrections are needed from the worker."
                  : actionTarget.decision === "approved"
                    ? "Confirm approval for this operational request. You may optionally include guidance."
                    : actionTarget.decision === "completed"
                      ? "Confirm that the work requested has been processed and completed."
                      : "Are you sure you want to delete this request?"}
            </p>

            {actionError ? (
              <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800">
                {actionError}
              </div>
            ) : null}

            {/* Note/Reason Input */}
            {["declined", "sent_back", "approved"].includes(actionTarget.decision) ? (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-neutral-800 uppercase tracking-wide">
                  {actionTarget.decision === "declined"
                    ? "Rejection Reason *"
                    : actionTarget.decision === "sent_back"
                      ? "Information Needed *"
                      : "Optional Feedback / Note"}
                </label>
                <textarea
                  rows={3}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    actionTarget.decision === "declined"
                      ? "Specify why this request is declined..."
                      : actionTarget.decision === "sent_back"
                        ? "Specify what details or photos the worker needs to provide..."
                        : "Optional approval note..."
                  }
                  className="mt-1 block w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  required={actionTarget.decision === "declined" || actionTarget.decision === "sent_back"}
                />
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionTarget(null);
                  setActionNote("");
                  setActionError(null);
                }}
                disabled={actionSubmitting}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={actionSubmitting}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-xs disabled:opacity-50 ${
                  actionTarget.decision === "declined" || actionTarget.decision === "delete"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : actionTarget.decision === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-neutral-950 hover:bg-neutral-800"
                }`}
              >
                {actionSubmitting
                  ? "Processing..."
                  : actionTarget.decision === "approved"
                    ? "Confirm Approval"
                    : actionTarget.decision === "declined"
                      ? "Confirm Rejection"
                      : actionTarget.decision === "delete"
                        ? "Delete Request"
                        : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* Attachment Preview Modal */}
      {/* ========================================================================= */}
      {previewAttachment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="relative max-h-[90vh] max-w-2xl w-full rounded-2xl bg-white p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h4 className="text-sm font-bold text-neutral-950 truncate max-w-md">
                  {previewAttachment.name}
                </h4>
                <p className="text-xs text-neutral-500">
                  {previewAttachment.mime} · {formatBytes(previewAttachment.byteSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="my-4 flex flex-1 items-center justify-center overflow-auto rounded-lg bg-neutral-100 p-4">
              {previewAttachment.mime.startsWith("image/") && previewAttachment.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name}
                  className="max-h-[60vh] max-w-full rounded-md object-contain"
                />
              ) : (
                <div className="p-8 text-center text-xs text-neutral-600">
                  <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 font-medium">{previewAttachment.name}</p>
                  <p className="mt-0.5 text-neutral-400">Preview not directly supported in-line for this document format.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3">
              {previewAttachment.url ? (
                <a
                  href={previewAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewAttachment.name}
                  className="rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
                >
                  Download / Open File
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(",");
      if (commaIndex !== -1) {
        resolve(result.slice(commaIndex + 1));
      } else {
        resolve(result);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
