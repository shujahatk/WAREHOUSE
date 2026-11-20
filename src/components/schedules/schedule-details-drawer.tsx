"use client";

import { useState } from "react";
import Link from "next/link";
import type { OperationScheduleView } from "@/domain/view";
import { ATTACHMENT_KIND_LABELS, formatKg } from "@/domain/view";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";

type Props = {
  schedule: OperationScheduleView | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (schedule: OperationScheduleView) => void;
};

export function ScheduleDetailsDrawer({ schedule, isOpen, onClose, onEdit }: Props) {
  const { state, assignScheduleWorker, uploadScheduleAttachment, deleteScheduleAttachment, verifyOperationSchedule } = useDemo();
  const { identity } = useSession();
  const isOffice = identity.role === "owner" || identity.role === "manager";
  const isWorker = identity.role === "worker";

  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState<string>("photo");
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen || !schedule) return null;

  const isUnloading = schedule.type === "unloading";
  const activeWorkers = (state.accounts || []).filter((u) => u.role === "worker" && u.status === "Active");

  const handleReassign = async () => {
    if (!selectedWorkerId) return;
    const err = await assignScheduleWorker(schedule.id, selectedWorkerId);
    if (err) setFeedback(err);
    else {
      setFeedback("Worker reassigned successfully.");
      setIsReassigning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFeedback(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const err = await uploadScheduleAttachment({
          id: schedule.id,
          name: file.name,
          kind: uploadKind,
          size: file.size,
          mime: file.type || "application/octet-stream",
          bytesBase64: base64,
        });
        if (err) setFeedback(err);
        else setFeedback("File uploaded successfully.");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setFeedback("Failed to upload file.");
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const err = await deleteScheduleAttachment(attachmentId);
    if (err) setFeedback(err);
  };

  const statusBadges: Record<string, { label: string; bg: string; text: string; border: string }> = {
    scheduled: { label: "Scheduled", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    in_progress: { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    draft: { label: "Draft Saved", bg: "bg-neutral-100", text: "text-neutral-700", border: "border-neutral-300" },
    submitted: { label: "Pending Verification", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
    resubmitted: { label: "Resubmitted", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
    returned_for_correction: { label: "Returned for Correction", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    completed: { label: "Completed", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  };

  const badge = statusBadges[schedule.status] || {
    label: schedule.status,
    bg: "bg-neutral-100",
    text: "text-neutral-700",
    border: "border-neutral-200",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-neutral-900/40 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-neutral-200 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  isUnloading ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isUnloading ? "Unloading Schedule" : "Loading Schedule"}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
              >
                {badge.label}
              </span>
            </div>
            <h2 className="text-lg font-bold text-neutral-900 mt-1">
              {schedule.poSoNumber} · <span className="text-neutral-500 font-normal">{schedule.scheduleNumber}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback ? (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs font-medium text-emerald-800 flex items-center justify-between">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-emerald-600 hover:underline">
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Correction Reason Alert */}
          {schedule.status === "returned_for_correction" && schedule.returnReason ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-800 uppercase tracking-wider mb-1">
                <span>⚠️ Returned for Correction</span>
              </div>
              <p className="text-sm text-rose-900">{schedule.returnReason}</p>
            </div>
          ) : null}

          {/* Section 1: Commercial & General Information */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-3">
              Commercial & Order Details
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-neutral-400 block">PO/SO Reference</span>
                <span className="font-semibold text-neutral-900 text-sm">{schedule.poSoNumber}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">{isUnloading ? "Supplier" : "Customer / Buyer"}</span>
                <span className="font-semibold text-neutral-900 text-sm">{schedule.partnerName}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">Warehouse</span>
                <span className="font-semibold text-neutral-900">{schedule.warehouseName}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">Scheduled Date</span>
                <span className="font-medium text-neutral-800">
                  {schedule.scheduledDate ? new Date(schedule.scheduledDate).toLocaleDateString() : "—"}
                </span>
              </div>
              {isUnloading ? (
                <>
                  <div>
                    <span className="text-neutral-400 block">Pickup Date</span>
                    <span className="font-medium text-neutral-800">
                      {schedule.pickupDate ? new Date(schedule.pickupDate).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Purchaser</span>
                    <span className="font-medium text-neutral-800">{schedule.purchaserName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Purchasing Price</span>
                    <span className="font-medium text-neutral-800">
                      {schedule.purchasingPrice > 0 ? `${schedule.currency} ${schedule.purchasingPrice.toLocaleString()}` : "—"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-neutral-400 block">Seller Name</span>
                    <span className="font-medium text-neutral-800">{schedule.sellerName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Selling Price</span>
                    <span className="font-medium text-neutral-800">
                      {schedule.sellingPrice > 0 ? `${schedule.currency} ${schedule.sellingPrice.toLocaleString()}` : "—"}
                    </span>
                  </div>
                </>
              )}
              <div>
                <span className="text-neutral-400 block">Transport Price</span>
                <span className="font-medium text-neutral-800">
                  {schedule.transportPrice > 0 ? `${schedule.currency} ${schedule.transportPrice.toLocaleString()}` : "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Annex VII Required</span>
                <span className={`font-semibold ${schedule.annex7Required ? "text-amber-700" : "text-neutral-600"}`}>
                  {schedule.annex7Required ? "Yes (Required)" : "No"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Route</span>
                <span className="font-medium text-neutral-800">
                  {schedule.origin || schedule.destination ? `${schedule.origin || "—"} → ${schedule.destination || "—"}` : "—"}
                </span>
              </div>
            </div>

            {schedule.instructions ? (
              <div className="mt-3 pt-3 border-t border-neutral-200 text-xs">
                <span className="text-neutral-400 block font-semibold mb-0.5">Special Instructions:</span>
                <p className="text-neutral-700">{schedule.instructions}</p>
              </div>
            ) : null}
          </div>

          {/* Section 2: Worker Assignment & Execution */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                Worker Assignment & Progress
              </h3>
              {isOffice && schedule.status !== "completed" && !isReassigning ? (
                <button
                  type="button"
                  onClick={() => setIsReassigning(true)}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Change Worker
                </button>
              ) : null}
            </div>

            {isReassigning ? (
              <div className="rounded-lg bg-neutral-50 p-3 mb-3 border border-neutral-200">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Select New Warehouse Worker:
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="flex-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-800 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="">Choose worker...</option>
                    {activeWorkers.map((w) => (
                      <option key={w.id || w.email} value={w.id || w.name}>
                        {w.name} ({w.warehouse || "Warehouse"})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleReassign}
                    className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsReassigning(false)}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-neutral-400 block">Assigned Worker</span>
                <span className="font-semibold text-neutral-900">{schedule.assignedWorkerName || "Unassigned"}</span>
              </div>
              <div>
                <span className="text-neutral-400 block">Actual Arrival Time</span>
                <span className="font-medium text-neutral-800">
                  {schedule.actualArrivalTime ? new Date(schedule.actualArrivalTime).toLocaleString() : "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Actual Start Time</span>
                <span className="font-medium text-neutral-800">
                  {schedule.actualStartTime ? new Date(schedule.actualStartTime).toLocaleString() : "Not started yet"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Actual Completion Time</span>
                <span className="font-medium text-neutral-800">
                  {schedule.actualEndTime ? new Date(schedule.actualEndTime).toLocaleString() : "—"}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Submission Time</span>
                <span className="font-medium text-neutral-800">
                  {schedule.submittedAt ? new Date(schedule.submittedAt).toLocaleString() : "Not submitted yet"}
                </span>
              </div>
              {schedule.verifiedAt ? (
                <div>
                  <span className="text-neutral-400 block">Verified By</span>
                  <span className="font-medium text-neutral-800">
                    {schedule.verifiedByName || "Staff"} on {new Date(schedule.verifiedAt).toLocaleDateString()}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Loading & Dispatch Vehicle / Driver / CMR Details */}
            {(schedule.type === "loading" ||
              schedule.vehicleRegistrationNumber ||
              schedule.transportCompany ||
              schedule.driverName ||
              schedule.cmrNumber) && (
              <div className="mt-3 pt-3 border-t border-neutral-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-2">
                  Vehicle, Driver &amp; Dispatch Information
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-400 block">Vehicle Registration</span>
                    <span className="font-semibold text-neutral-900">
                      {schedule.vehicleRegistrationNumber || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Transport Company</span>
                    <span className="font-medium text-neutral-800">{schedule.transportCompany || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Driver Name</span>
                    <span className="font-medium text-neutral-800">{schedule.driverName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Driver Contact</span>
                    <span className="font-medium text-neutral-800">{schedule.driverContactNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">CMR Number / Reference</span>
                    <span className="font-semibold text-neutral-900">{schedule.cmrNumber || "—"}</span>
                  </div>
                </div>
              </div>
            )}

            {schedule.workerRemarks ? (
              <div className="mt-3 pt-3 border-t border-neutral-200 text-xs">
                <span className="text-neutral-400 block font-semibold mb-0.5">Operational Remarks:</span>
                <p className="text-neutral-800 italic bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                  &ldquo;{schedule.workerRemarks}&rdquo;
                </p>
              </div>
            ) : null}
          </div>

          {/* Section 3: Materials & Weights Breakdown */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
              Materials &amp; Weight Breakdown ({schedule.items.length})
            </h3>
            {schedule.items.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No materials recorded on this schedule.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2">Material Type</th>
                        <th className="px-3 py-2">Packaging</th>
                        <th className="px-3 py-2 text-right">Packages</th>
                        <th className="px-3 py-2 text-right">Total Tare</th>
                        <th className="px-3 py-2 text-right">Gross (KG)</th>
                        <th className="px-3 py-2 text-right">Net (KG)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 bg-white">
                      {schedule.items.map((item) => (
                        <tr key={item.id} className="hover:bg-neutral-50/50">
                          <td className="px-3 py-2 font-medium text-neutral-900">{item.materialName}</td>
                          <td className="px-3 py-2 text-neutral-600">
                            {item.packagingTypeName} ({item.tarePerPackageKg} kg/pkg)
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.packageCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{formatKg(item.totalTareWeightKg)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-neutral-800">{formatKg(item.grossWeightKg)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-neutral-900">{formatKg(item.netWeightKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-neutral-50/70 border-t border-neutral-200 font-bold text-neutral-900">
                      <tr>
                        <td colSpan={2} className="px-3 py-2">Totals</td>
                        <td className="px-3 py-2 text-right tabular-nums">{schedule.totalPackageCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{formatKg(schedule.totalTareWeightKg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-800">{formatKg(schedule.totalGrossWeightKg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-black">{formatKg(schedule.totalNetWeightKg)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Material-Wise Weight Summary */}
                {schedule.materialSummary && schedule.materialSummary.length > 0 && (
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
                        {schedule.materialSummary.map((m) => (
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
              </>
            )}
          </div>

          {/* Section 4: Attachments & Evidence */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                Photos &amp; Operational Documents ({schedule.attachments.length})
              </h3>
              {schedule.status !== "completed" ? (
                <label className="rounded-lg bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 cursor-pointer transition-colors">
                  {isUploading ? "Uploading..." : "+ Upload File"}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              ) : null}
            </div>

            {schedule.attachments.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No photos or documents uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {schedule.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative group rounded-lg border border-neutral-200 p-2.5 bg-neutral-50 hover:bg-white transition-all text-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="rounded bg-neutral-200/70 px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider text-neutral-700 truncate">
                          {ATTACHMENT_KIND_LABELS[att.kind] || att.kind}
                        </span>
                        {schedule.status !== "completed" ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="text-neutral-400 hover:text-rose-600 font-bold"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                      <div className="font-medium text-neutral-900 truncate" title={att.name}>
                        {att.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        Uploaded by {att.uploadedByName || "Worker"}
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-neutral-200 flex items-center justify-between">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        View File ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {isOffice && schedule.status === "submitted" ? (
              <Link
                href="/verification"
                className="rounded-lg bg-purple-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-800 transition-colors"
              >
                Go to Verification Desk →
              </Link>
            ) : null}

            {isOffice && onEdit && schedule.status !== "completed" ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(schedule);
                }}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                Edit Schedule
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
