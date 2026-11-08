"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { formatInstant, formatKg, type RequestView } from "@/domain/view";
import { canOperateWarehouse } from "@/lib/permissions";
import { UploadCapture } from "@/components/files/upload-capture";
import { FileGallery } from "@/components/files/file-gallery";

export function RequestWorkflowPanel({
  shipmentNumber,
  direction,
  warehouse,
}: {
  shipmentNumber: string;
  direction: "inbound" | "outbound";
  warehouse: string;
}) {
  const demo = useDemo();
  const { identity } = useSession();
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [sendBackNote, setSendBackNote] = useState("");
  const [showSendBack, setShowSendBack] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const shipmentRequests = useMemo(() => {
    const target = shipmentNumber.trim().toLowerCase();
    return demo.state.requests.filter(
      (r) =>
        (r.shipmentReference.trim().toLowerCase() === target ||
          r.containerNumber.trim().toLowerCase() === target ||
          r.shipmentId === shipmentNumber) &&
        r.type === (direction === "inbound" ? "unloading" : "loading")
    );
  }, [demo.state.requests, direction, shipmentNumber]);

  // Active request is latest non-deleted, or latest if all deleted
  const activeRequest: RequestView | null = useMemo(() => {
    if (shipmentRequests.length === 0) return null;
    const nonDeleted = shipmentRequests.filter((r) => r.status !== "deleted");
    return nonDeleted[nonDeleted.length - 1] ?? shipmentRequests[shipmentRequests.length - 1];
  }, [shipmentRequests]);

  const requestFiles = useMemo(() => {
    return demo.state.attachments.filter((a) => {
      if (activeRequest && (a.requestId === activeRequest.id || a.requestNumber === activeRequest.number)) {
        return true;
      }
      return a.shipment === shipmentNumber && a.role === "photo";
    });
  }, [demo.state.attachments, activeRequest, shipmentNumber]);

  const isWorkerAtWarehouse =
    identity.role === "worker" && canOperateWarehouse(identity.role, identity.warehouse, warehouse);
  const isOwner = identity.role === "owner";
  const isManager = identity.role === "manager";

  const handleApprove = async () => {
    if (!activeRequest) return;
    setSubmitting(true);
    setPanelError(null);
    const err = await demo.approveRequest(activeRequest.id);
    if (err) setPanelError(err);
    setSubmitting(false);
  };

  const handleDecline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequest || !declineReason.trim()) {
      setPanelError("Enter a decline reason.");
      return;
    }
    setSubmitting(true);
    setPanelError(null);
    const err = await demo.declineRequest(activeRequest.id, declineReason.trim());
    if (err) {
      setPanelError(err);
    } else {
      setDeclineReason("");
      setShowDecline(false);
    }
    setSubmitting(false);
  };

  const handleSendBack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequest || !sendBackNote.trim()) {
      setPanelError("Enter a note explaining why this request is being sent back.");
      return;
    }
    setSubmitting(true);
    setPanelError(null);
    const err = await demo.sendBackRequest(activeRequest.id, sendBackNote.trim());
    if (err) {
      setPanelError(err);
    } else {
      setSendBackNote("");
      setShowSendBack(false);
    }
    setSubmitting(false);
  };

  const handleComplete = async () => {
    if (!activeRequest) return;
    setSubmitting(true);
    setPanelError(null);
    const err = await demo.completeRequest(activeRequest.id);
    if (err) setPanelError(err);
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!activeRequest) return;
    if (
      !confirm(
        "Delete this request? Requests are never edited in place. Deleting performs a soft delete so the audit trail is kept and you can create a fresh request."
      )
    ) {
      return;
    }
    setSubmitting(true);
    setPanelError(null);
    const err = await demo.deleteRequest(activeRequest.id);
    if (err) setPanelError(err);
    setSubmitting(false);
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setPanelError(null);
    const err = await demo.createRequest(direction, shipmentNumber);
    if (err) {
      setPanelError(err);
    } else if (demo?.refresh) {
      await demo.refresh();
    }
    setSubmitting(false);
  };

  return (
    <Surface className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-neutral-950">
            Stock Movement Request Workflow
          </h2>
          <p className="text-xs text-neutral-500">
            {direction === "inbound" ? "Unloading Request" : "Loading Request"} ·{" "}
            {activeRequest ? activeRequest.number : "No active request"}
          </p>
        </div>
        {activeRequest ? (
          <StatusPill
            label={
              activeRequest.status === "submitted"
                ? "Pending Approval"
                : activeRequest.status === "approved"
                ? "Approved"
                : activeRequest.status === "completed"
                ? "Completed"
                : activeRequest.status === "declined"
                ? "Declined"
                : activeRequest.status === "sent_back"
                ? "Sent Back"
                : "Deleted"
            }
          />
        ) : null}
      </div>

      {/* Core Rule Explanation */}
      <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-700">
        <span className="font-semibold text-neutral-950">Core Rule: </span>
        Nothing changes stock until a Worker request is approved by Admin AND completed by the assigned
        Worker. Requests are never edited in place. To fix a mistake, delete the request (soft
        delete) and create a new one.
      </div>

      {panelError ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600">
          {panelError}
        </p>
      ) : null}

      {!activeRequest ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-neutral-600">
            No request has been created for this shipment yet. Add at least one photo before submitting.
          </p>
          {isWorkerAtWarehouse ? (
            <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <UploadCapture
                kind="photo"
                acceptPdf={false}
                multiple={true}
                shipmentId={shipmentNumber}
                shipmentReference={shipmentNumber}
                warehouse={warehouse}
                label="Step 1: Take or choose request photos (at least one photo required)"
                helperText="Photos uploaded here are saved as pending uploads and will be claimed automatically when submitting the request."
              />
              <button
                type="button"
                disabled={submitting}
                onClick={handleCreate}
                className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-40"
              >
                {submitting ? "Submitting request…" : "Step 2: Submit request with photos"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Metadata Grid */}
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Request ID</dt>
              <dd className="font-mono font-medium text-neutral-900">{activeRequest.number}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Warehouse</dt>
              <dd className="font-medium text-neutral-900">{activeRequest.warehouse}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Created by</dt>
              <dd className="text-neutral-900">
                {activeRequest.createdByName} · {formatInstant(activeRequest.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Status</dt>
              <dd className="capitalize text-neutral-900">
                {activeRequest.status.replace("_", " ")}
              </dd>
            </div>
            {activeRequest.approvedBy ? (
              <div>
                <dt className="text-neutral-500">Approved by</dt>
                <dd className="text-neutral-900">
                  {activeRequest.approvedByName} ·{" "}
                  {activeRequest.approvedAt ? formatInstant(activeRequest.approvedAt) : ""}
                </dd>
              </div>
            ) : null}
            {activeRequest.enteredBy ? (
              <div>
                <dt className="text-neutral-500">Completed by</dt>
                <dd className="text-neutral-900">
                  {activeRequest.enteredByName} ·{" "}
                  {activeRequest.enteredAt ? formatInstant(activeRequest.enteredAt) : ""}
                </dd>
              </div>
            ) : null}
            {activeRequest.deletedBy ? (
              <div>
                <dt className="text-neutral-500">Deleted by</dt>
                <dd className="text-neutral-900">
                  {activeRequest.deletedByName} ·{" "}
                  {activeRequest.deletedAt ? formatInstant(activeRequest.deletedAt) : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          {/* Decline Reason / Sent Back Note Notices */}
          {activeRequest.status === "declined" && activeRequest.declineReason ? (
            <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-xs text-neutral-800">
              <span className="font-semibold text-neutral-950">Decline Reason: </span>
              {activeRequest.declineReason}
            </div>
          ) : null}

          {activeRequest.status === "sent_back" && activeRequest.sentBackNote ? (
            <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-xs text-neutral-800">
              <span className="font-semibold text-neutral-950">Manager Note (Sent Back): </span>
              {activeRequest.sentBackNote}
              <p className="mt-1 text-neutral-600">
                Worker: Delete this request to correct mistakes and submit a fresh one.
              </p>
            </div>
          ) : null}

          {/* Request Lines Table */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Request Lines ({activeRequest.lines.length})
            </h3>
            {activeRequest.lines.length === 0 ? (
              <p className="mt-1 text-xs text-neutral-500">
                No lines added yet. Add material sections below to populate net weight lines.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                {activeRequest.lines.map((line) => (
                  <li key={line.id} className="p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-950">{line.material}</span>
                      <span className="font-mono font-medium text-neutral-950">
                        {formatKg(line.netKg)} net
                      </span>
                    </div>
                    <p className="mt-1 text-neutral-600">
                      Gross {formatKg(line.grossKg)} · Packaging: {line.packagingName} ({line.packageCount} units, total tare {formatKg(line.tareTotalKg)})
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Request Photos & Documents Gallery */}
          <div className="border-t border-neutral-200 pt-3">
            <FileGallery
              files={requestFiles}
              title="Request Photos & Documents"
              emptyMessage="No photos or files attached to this request yet."
              allowDelete={isWorkerAtWarehouse && activeRequest.status !== "completed" && activeRequest.status !== "approved"}
              onDelete={async (id) => {
                await demo.detachFile(id);
              }}
            />
            {isWorkerAtWarehouse &&
            (activeRequest.status === "submitted" || activeRequest.status === "sent_back" || activeRequest.status === "declined") ? (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <UploadCapture
                  kind="photo"
                  acceptPdf={false}
                  multiple={true}
                  shipmentReference={shipmentNumber}
                  requestId={activeRequest.id}
                  requestNumber={activeRequest.number}
                  warehouse={warehouse}
                  label="Add photo to this request"
                  helperText="Uploads immediately and links directly to this request."
                />
              </div>
            ) : null}
          </div>

          {/* Role Actions */}
          <div className="border-t border-neutral-200 pt-3">
            {/* Owner Actions */}
            {isOwner && activeRequest.status === "submitted" ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-neutral-800">
                  Owner approval required: Review the lines above before approving.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleApprove}
                    className="h-10 rounded-lg bg-neutral-950 px-4 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40"
                  >
                    Approve request
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setShowSendBack((v) => !v);
                      setShowDecline(false);
                    }}
                    className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Send back with note
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setShowDecline((v) => !v);
                      setShowSendBack(false);
                    }}
                    className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Decline request
                  </button>
                </div>
              </div>
            ) : null}

            {/* Worker Completion Actions */}
            {isWorkerAtWarehouse && activeRequest.status === "approved" ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-neutral-800">
                  Admin has approved this request. Complete the operation to post validated net weight to stock.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleComplete}
                    className="h-10 rounded-lg bg-neutral-950 px-4 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40"
                  >
                    Complete & Enter into stock
                  </button>
                </div>
              </div>
            ) : null}

            {isOwner && activeRequest.status === "approved" ? (
              <p className="text-xs font-medium text-neutral-700">
                Request is approved. Waiting for the assigned Worker to complete the operation into stock.
              </p>
            ) : null}

            {/* Staff Actions */}
            {isManager && activeRequest.status === "approved" ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-neutral-800">
                  Admin has approved this request. Waiting for the assigned Worker to complete the operation.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowSendBack((v) => !v)}
                    className="h-10 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Send back with note
                  </button>
                </div>
              </div>
            ) : null}

            {isManager && activeRequest.status === "submitted" ? (
              <p className="text-xs text-neutral-500">
                Awaiting Admin approval.
              </p>
            ) : null}

            {/* Worker Actions */}
            {isWorkerAtWarehouse &&
            (activeRequest.status === "submitted" || activeRequest.status === "declined" || activeRequest.status === "sent_back") ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-neutral-500">
                  Made a mistake or request was declined? Soft-delete this request to start fresh.
                </p>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDelete}
                  className="h-9 rounded-lg border border-neutral-300 px-3 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete request (soft delete)
                </button>
              </div>
            ) : null}

            {/* When Deleted or Declined: Worker can create a new request */}
            {isWorkerAtWarehouse &&
            (activeRequest.status === "deleted" || activeRequest.status === "declined") ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-neutral-600">
                  This request is {activeRequest.status}. Create a new request to start fresh.
                </p>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleCreate}
                  className="h-10 rounded-lg bg-neutral-950 px-4 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40"
                >
                  Create new request
                </button>
              </div>
            ) : null}

            {/* Completed notice */}
            {activeRequest.status === "completed" ? (
              <p className="text-xs font-medium text-neutral-700">
                ✓ Request completed and posted to inventory balances. Completed requests cannot be deleted;
                any adjustments require a separate correcting entry.
              </p>
            ) : null}

            {/* Send back form modal/inline */}
            {showSendBack ? (
              <form onSubmit={handleSendBack} className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <label className="block text-xs font-medium text-neutral-700">
                  Note to worker
                  <textarea
                    rows={2}
                    value={sendBackNote}
                    onChange={(e) => setSendBackNote(e.target.value)}
                    placeholder="Specify what figures need correction..."
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs text-neutral-900"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-8 rounded bg-neutral-950 px-3 text-xs text-white disabled:opacity-40"
                  >
                    Confirm send back
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSendBack(false)}
                    className="h-8 rounded border border-neutral-300 px-3 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {/* Decline form modal/inline */}
            {showDecline ? (
              <form onSubmit={handleDecline} className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <label className="block text-xs font-medium text-neutral-700">
                  Decline reason
                  <textarea
                    rows={2}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Explain why this request is declined..."
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs text-neutral-900"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-8 rounded bg-neutral-950 px-3 text-xs text-white disabled:opacity-40"
                  >
                    Confirm decline
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDecline(false)}
                    className="h-8 rounded border border-neutral-300 px-3 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {/* History of previous requests if multiple */}
      {shipmentRequests.length > 1 ? (
        <div className="mt-4 border-t border-neutral-200 pt-3">
          <details className="text-xs text-neutral-600">
            <summary className="cursor-pointer font-medium hover:text-neutral-950">
              Request history ({shipmentRequests.length} total requests)
            </summary>
            <ul className="mt-2 space-y-1.5 pl-2">
              {shipmentRequests.map((req) => (
                <li key={req.id} className="flex items-center justify-between text-neutral-500">
                  <span>
                    {req.number} · {req.status} ({formatInstant(req.createdAt)})
                  </span>
                  {req.deletedAt ? <span>Deleted {formatInstant(req.deletedAt)}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </Surface>
  );
}
