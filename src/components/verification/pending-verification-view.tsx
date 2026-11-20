"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import type { OperationScheduleView } from "@/domain/view";
import { ATTACHMENT_KIND_LABELS, formatKg } from "@/domain/view";
import { PageTitle } from "@/components/ref/chrome";
import { Icon } from "@/components/icons";

export function PendingVerificationView() {
  const { state, verifyOperationSchedule } = useDemo();
  const { identity } = useSession();
  const isOffice = identity.role === "owner" || identity.role === "manager";

  const [typeFilter, setTypeFilter] = useState<"all" | "unloading" | "loading">("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedSchedule, setSelectedSchedule] = useState<OperationScheduleView | null>(null);
  const [actionModal, setActionModal] = useState<"approve" | "return" | "request_info" | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [infoNote, setInfoNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  // Filter schedules
  const allSchedules = state.schedules || [];

  const pendingSubmissions = useMemo(() => {
    return allSchedules.filter((s) => s.status === "submitted" || s.status === "resubmitted");
  }, [allSchedules]);

  const verifiedHistory = useMemo(() => {
    return allSchedules.filter((s) => s.status === "completed" || s.status === "returned_for_correction");
  }, [allSchedules]);

  const currentList = activeTab === "pending" ? pendingSubmissions : verifiedHistory;

  const filtered = useMemo(() => {
    return currentList.filter((s) => {
      if (typeFilter !== "all" && s.type !== typeFilter) return false;
      if (warehouseFilter !== "all" && s.warehouseName.toLowerCase() !== warehouseFilter.toLowerCase()) return false;
      if (workerFilter !== "all" && s.assignedWorkerName.toLowerCase() !== workerFilter.toLowerCase()) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesPo = s.poSoNumber.toLowerCase().includes(query);
        const matchesSched = s.scheduleNumber.toLowerCase().includes(query);
        const matchesPartner = s.partnerName.toLowerCase().includes(query);
        const matchesWorker = s.assignedWorkerName.toLowerCase().includes(query);
        return matchesPo || matchesSched || matchesPartner || matchesWorker;
      }
      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.submittedAt || a.updatedAt).getTime() || 0;
      const timeB = new Date(b.submittedAt || b.updatedAt).getTime() || 0;
      return timeB - timeA;
    });
  }, [currentList, typeFilter, warehouseFilter, workerFilter, searchTerm]);

  const uniqueWarehouses = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSchedules) if (s.warehouseName) set.add(s.warehouseName);
    return Array.from(set).sort();
  }, [allSchedules]);

  const uniqueWorkers = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSchedules) if (s.assignedWorkerName) set.add(s.assignedWorkerName);
    return Array.from(set).sort();
  }, [allSchedules]);

  const handleApprove = async () => {
    if (!selectedSchedule) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      const err = await verifyOperationSchedule(selectedSchedule.id, "approve");
      if (err) {
        setActionError(err);
      } else {
        setActionModal(null);
        setSelectedSchedule(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedSchedule) return;
    if (!returnReason.trim()) {
      setActionError("A return reason is mandatory.");
      return;
    }
    setIsProcessing(true);
    setActionError(null);
    try {
      const err = await verifyOperationSchedule(selectedSchedule.id, "return", { reason: returnReason.trim() });
      if (err) {
        setActionError(err);
      } else {
        setReturnReason("");
        setActionModal(null);
        setSelectedSchedule(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!selectedSchedule) return;
    if (!infoNote.trim()) {
      setActionError("Please enter the requested information note.");
      return;
    }
    setIsProcessing(true);
    setActionError(null);
    try {
      const err = await verifyOperationSchedule(selectedSchedule.id, "request_info", { note: infoNote.trim() });
      if (err) {
        setActionError(err);
      } else {
        setInfoNote("");
        setActionModal(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOffice) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-neutral-200">
        <h2 className="text-base font-semibold text-neutral-900">Verification Access Restricted</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Only Staff and Administrators are authorized to review and verify warehouse operations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title="Operation Verification Desk"
          subtitle="Audit worker submissions, inspect weights and photos, and approve operations to trigger inventory stock movements."
        />

        <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "pending"
                ? "bg-purple-700 text-white shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Pending Verification ({pendingSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-neutral-900 text-white shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Verification History ({verifiedHistory.length})
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by PO/SO, Partner, or Worker..."
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:border-purple-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "unloading" | "loading")}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-purple-600 focus:outline-none"
            >
              <option value="all">All Operations</option>
              <option value="unloading">Unloading Only</option>
              <option value="loading">Loading Only</option>
            </select>

            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-purple-600 focus:outline-none"
            >
              <option value="all">All Warehouses</option>
              {uniqueWarehouses.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>

            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-purple-600 focus:outline-none"
            >
              <option value="all">All Workers</option>
              {uniqueWorkers.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Submissions List */}
      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-neutral-900">
              {activeTab === "pending" ? "No submissions pending verification" : "No verification history found"}
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              {activeTab === "pending"
                ? "All worker loading and unloading submissions have been reviewed."
                : "Operations will appear here once verified or returned for correction."}
            </p>
          </div>
        ) : (
          filtered.map((sched) => {
            const isUnloading = sched.type === "unloading";
            const photosCount = sched.attachments.filter((a) => a.mime.startsWith("image/") || a.kind.includes("photo")).length;
            const docsCount = sched.attachments.length - photosCount;
            const isPending = sched.status === "submitted" || sched.status === "resubmitted";

            return (
              <div
                key={sched.id}
                className={`rounded-xl border bg-white p-5 shadow-xs transition-all hover:shadow-md ${
                  isPending ? "border-purple-200 bg-purple-50/15" : "border-neutral-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Operation Identifiers */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          isUnloading ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isUnloading ? "Unloading (Receipt)" : "Loading (Dispatch)"}
                      </span>
                      <span className="text-base font-bold text-neutral-900">{sched.poSoNumber}</span>
                      <span className="text-xs text-neutral-400">({sched.scheduleNumber})</span>
                    </div>

                    <div className="mt-1 text-xs text-neutral-600 flex flex-wrap items-center gap-3">
                      <span>
                        Partner: <strong className="text-neutral-900">{sched.partnerName}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Warehouse: <strong className="text-neutral-900">{sched.warehouseName}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Worker: <strong className="text-neutral-900">{sched.assignedWorkerName}</strong>
                      </span>
                      {sched.submittedAt ? (
                        <>
                          <span>•</span>
                          <span className="text-neutral-500">
                            Submitted: {new Date(sched.submittedAt).toLocaleString()}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        sched.status === "submitted"
                          ? "bg-purple-100 text-purple-800 animate-pulse"
                          : sched.status === "resubmitted"
                          ? "bg-indigo-100 text-indigo-800 animate-pulse"
                          : sched.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {sched.statusLabel}
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedSchedule(sched)}
                      className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 transition-colors"
                    >
                      {isPending ? "Audit & Verify →" : "View Submission"}
                    </button>
                  </div>
                </div>

                {/* Weights & Items Summary Strip */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-neutral-50 p-3 text-xs border border-neutral-200">
                  <div>
                    <span className="text-neutral-400 block">Total Net Weight</span>
                    <span className="font-bold text-neutral-900 text-sm tabular-nums">
                      {formatKg(sched.totalNetWeightKg)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Total Gross Weight</span>
                    <span className="font-semibold text-neutral-800 tabular-nums">
                      {formatKg(sched.totalGrossWeightKg)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Materials & Units</span>
                    <span className="font-semibold text-neutral-800">
                      {sched.items.length} materials · {sched.totalPackageCount} pkgs
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Evidence Uploads</span>
                    <span className="font-semibold text-neutral-800">
                      📷 {photosCount} photos · 📄 {docsCount} docs
                    </span>
                  </div>
                </div>

                {/* Worker remarks snippet */}
                {sched.workerRemarks ? (
                  <div className="mt-2 text-xs text-neutral-600 italic">
                    Worker Note: &ldquo;{sched.workerRemarks}&rdquo;
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Verification Detail & Decision Modal */}
      {selectedSchedule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-neutral-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                      selectedSchedule.type === "unloading" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {selectedSchedule.type === "unloading" ? "Unloading Verification" : "Loading Verification"}
                  </span>
                  <h2 className="text-lg font-bold text-neutral-900">
                    Verify {selectedSchedule.poSoNumber}
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {selectedSchedule.partnerName} · {selectedSchedule.warehouseName} · Submitted by {selectedSchedule.assignedWorkerName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedSchedule(null);
                  setActionModal(null);
                }}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {actionError ? (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  {actionError}
                </div>
              ) : null}

              {/* 0. Commercial & Dispatch Summary */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 border-b border-neutral-200 pb-1.5">
                  1. Schedule, Commercial &amp; Dispatch Details
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-neutral-400 block">
                      {selectedSchedule.type === "unloading" ? "PO Number" : "SO Number"}
                    </span>
                    <span className="font-bold text-neutral-900">{selectedSchedule.poSoNumber}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">
                      {selectedSchedule.type === "unloading" ? "Supplier" : "Customer / Buyer"}
                    </span>
                    <span className="font-semibold text-neutral-900">{selectedSchedule.partnerName}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Warehouse</span>
                    <span className="font-semibold text-neutral-900">{selectedSchedule.warehouseName}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Annex VII</span>
                    <span className="font-semibold text-neutral-900">
                      {selectedSchedule.annex7Required ? "Yes (Required)" : "No"}
                    </span>
                  </div>
                  {selectedSchedule.type === "unloading" ? (
                    <>
                      <div>
                        <span className="text-neutral-400 block">Purchaser Name</span>
                        <span className="font-medium text-neutral-800">{selectedSchedule.purchaserName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block">Purchasing Price</span>
                        <span className="font-medium text-neutral-800">
                          {selectedSchedule.purchasingPrice > 0
                            ? `${selectedSchedule.currency} ${selectedSchedule.purchasingPrice.toLocaleString()}`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block">Pickup Date</span>
                        <span className="font-medium text-neutral-800">
                          {selectedSchedule.pickupDate ? selectedSchedule.pickupDate.slice(0, 10) : "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-neutral-400 block">Seller Name</span>
                        <span className="font-medium text-neutral-800">{selectedSchedule.sellerName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block">Selling Price</span>
                        <span className="font-medium text-neutral-800">
                          {selectedSchedule.sellingPrice > 0
                            ? `${selectedSchedule.currency} ${selectedSchedule.sellingPrice.toLocaleString()}`
                            : "—"}
                        </span>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-neutral-400 block">Transport Price</span>
                    <span className="font-medium text-neutral-800">
                      {selectedSchedule.transportPrice > 0
                        ? `${selectedSchedule.currency} ${selectedSchedule.transportPrice.toLocaleString()}`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Route</span>
                    <span className="font-medium text-neutral-800">
                      {selectedSchedule.origin || "—"} → {selectedSchedule.destination || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Vehicle Registration</span>
                    <span className="font-semibold text-neutral-900">
                      {selectedSchedule.vehicleRegistrationNumber || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Transport Company</span>
                    <span className="font-medium text-neutral-800">{selectedSchedule.transportCompany || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Driver Name &amp; Contact</span>
                    <span className="font-medium text-neutral-800">
                      {selectedSchedule.driverName || "—"}
                      {selectedSchedule.driverContactNumber ? ` (${selectedSchedule.driverContactNumber})` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">CMR Number / Reference</span>
                    <span className="font-semibold text-neutral-900">{selectedSchedule.cmrNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Actual Arrival Time</span>
                    <span className="font-medium text-neutral-800">
                      {selectedSchedule.actualArrivalTime
                        ? new Date(selectedSchedule.actualArrivalTime).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Actual Start Time</span>
                    <span className="font-medium text-neutral-800">
                      {selectedSchedule.actualStartTime
                        ? new Date(selectedSchedule.actualStartTime).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Actual Completion Time</span>
                    <span className="font-medium text-neutral-800">
                      {selectedSchedule.actualEndTime
                        ? new Date(selectedSchedule.actualEndTime).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Materials Breakdown Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                  2. Recorded Materials, Calculations &amp; Material-Wise Weight Summary
                </h3>
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2">Material Type</th>
                        <th className="px-3 py-2">Packaging Type</th>
                        <th className="px-3 py-2 text-right">Packages</th>
                        <th className="px-3 py-2 text-right">Tare / Pkg</th>
                        <th className="px-3 py-2 text-right">Total Tare</th>
                        <th className="px-3 py-2 text-right">Gross (KG)</th>
                        <th className="px-3 py-2 text-right">Net (KG)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 bg-white">
                      {selectedSchedule.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-semibold text-neutral-900">{item.materialName}</td>
                          <td className="px-3 py-2 text-neutral-600">{item.packagingTypeName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.packageCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{item.tarePerPackageKg} kg</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{formatKg(item.totalTareWeightKg)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-800">{formatKg(item.grossWeightKg)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-neutral-900">{formatKg(item.netWeightKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-neutral-50/70 border-t border-neutral-200 font-bold text-neutral-900">
                      <tr>
                        <td colSpan={2} className="px-3 py-2">Totals</td>
                        <td className="px-3 py-2 text-right tabular-nums">{selectedSchedule.totalPackageCount}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{formatKg(selectedSchedule.totalTareWeightKg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-800">{formatKg(selectedSchedule.totalGrossWeightKg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-black">{formatKg(selectedSchedule.totalNetWeightKg)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Material-Wise Weight Summary */}
                {selectedSchedule.materialSummary && selectedSchedule.materialSummary.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 overflow-hidden">
                    <div className="bg-emerald-50 px-3 py-1.5 border-b border-emerald-200 text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                      Material-Wise Weight Summary
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-emerald-100 text-neutral-600">
                        <tr>
                          <th className="px-3 py-1.5">Material Type</th>
                          <th className="px-3 py-1.5 text-right">Packages</th>
                          <th className="px-3 py-1.5 text-right">Gross Weight</th>
                          <th className="px-3 py-1.5 text-right">Tare Weight</th>
                          <th className="px-3 py-1.5 text-right">Net Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100 bg-white">
                        {selectedSchedule.materialSummary.map((m) => (
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

              {/* Photos & Evidence Gallery */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2">
                  3. Uploaded Photos &amp; Supporting Documents ({selectedSchedule.attachments.length})
                </h3>
                {selectedSchedule.attachments.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                    No photo or document evidence was uploaded by the worker.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {selectedSchedule.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="rounded-lg border border-neutral-200 p-2 bg-neutral-50 hover:bg-white transition-all text-xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-emerald-800 mb-1 truncate">
                            <span>{ATTACHMENT_KIND_LABELS[att.kind] || att.kind}</span>
                          </div>
                          <div className="font-semibold text-neutral-900 truncate" title={att.name}>
                            {att.name}
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-neutral-200 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setSelectedPhotoUrl(att.url)}
                            className="text-xs font-semibold text-purple-700 hover:underline"
                          >
                            Preview
                          </button>
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-neutral-500 hover:underline"
                          >
                            Open ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Worker Remarks */}
              {selectedSchedule.workerRemarks ? (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                    4. Operational Remarks &amp; Observations
                  </h3>
                  <div className="rounded-lg bg-neutral-50 p-3 border border-neutral-200 text-xs text-neutral-800">
                    {selectedSchedule.workerRemarks}
                  </div>
                </div>
              ) : null}

              {/* Sub-actions for Return / Request Info */}
              {actionModal === "return" ? (
                <div className="rounded-xl border border-rose-300 bg-rose-50/70 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    Return Operation for Correction
                  </h4>
                  <p className="text-xs text-rose-900">
                    Please specify the mandatory reason for returning this operation. The assigned worker ({selectedSchedule.assignedWorkerName}) will be notified and can edit the submission.
                  </p>
                  <textarea
                    rows={3}
                    required
                    placeholder="e.g. Tare weights do not match pallet type. Please re-weigh pallet #3 and upload a photo of the seal."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-rose-600 focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActionModal(null)}
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleReturn}
                      disabled={isProcessing || !returnReason.trim()}
                      className="rounded-md bg-rose-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                    >
                      {isProcessing ? "Returning..." : "Confirm Return for Correction"}
                    </button>
                  </div>
                </div>
              ) : null}

              {actionModal === "request_info" ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Request Additional Information
                  </h4>
                  <p className="text-xs text-amber-900">
                    Send a clarification message to {selectedSchedule.assignedWorkerName} without returning the entire submission.
                  </p>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please clarify if the pallet with damaged wrap was repaired before restacking."
                    value={infoNote}
                    onChange={(e) => setInfoNote(e.target.value)}
                    className="w-full rounded-lg border border-amber-300 bg-white p-2.5 text-xs text-neutral-900 focus:border-amber-600 focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActionModal(null)}
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestInfo}
                      disabled={isProcessing || !infoNote.trim()}
                      className="rounded-md bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      {isProcessing ? "Sending..." : "Send Request Note"}
                    </button>
                  </div>
                </div>
              ) : null}

              {actionModal === "approve" ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    Confirm Approval and Complete Operation
                  </h4>
                  <p className="text-xs text-emerald-950">
                    Approving this operation will permanently transition it to <strong>Completed</strong> and automatically post the corresponding <strong>{formatKg(selectedSchedule.totalNetWeightKg)}</strong> {selectedSchedule.type === "unloading" ? "inbound stock receipt" : "outbound stock dispatch"} into warehouse inventory.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActionModal(null)}
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={isProcessing}
                      className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {isProcessing ? "Processing..." : "Approve and Complete"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer - 3 Clear Staff Actions */}
            <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedSchedule(null);
                  setActionModal(null);
                }}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                Close
              </button>

              {selectedSchedule.status !== "completed" && !actionModal ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActionModal("request_info")}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    💬 Request Info
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionModal("return")}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition-colors"
                  >
                    ↩ Return for Correction
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionModal("approve")}
                    className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors flex items-center gap-1.5"
                  >
                    <span>✓</span> Approve and Complete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* High-Res Photo Preview Dialog */}
      {selectedPhotoUrl ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-xl overflow-hidden p-2">
            <button
              type="button"
              onClick={() => setSelectedPhotoUrl(null)}
              className="absolute top-4 right-4 rounded-full bg-black/60 text-white p-2 hover:bg-black"
            >
              ✕
            </button>
            <img src={selectedPhotoUrl} alt="Evidence preview" className="max-h-[85vh] object-contain rounded" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
