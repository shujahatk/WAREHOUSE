"use client";

import Link from "next/link";
import { useState } from "react";
import { BackLink, PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { canReadOrder, formatEuro, formatKg } from "@/domain/view";
import { canPerform } from "@/lib/permissions";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";

export function PurchaseDetail({ number }: { number: string }) {
  const { state, approve, reject, editPurchase, assignWorkerPo, completeWorkerPo, selectDocument, notice } = useDemo();
  const { identity } = useSession();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const found = state.orders.find((item) => item.number.toLowerCase() === number.toLowerCase());
  const order = found && canReadOrder(actor, found) ? found : undefined;
  const [title, setTitle] = useState(order?.title ?? "");
  const [supplier, setSupplier] = useState(order?.supplier ?? "");
  const [material, setMaterial] = useState(order?.material ?? "");
  const [quantity, setQuantity] = useState(order ? String(order.quantityKg) : "");
  const [value, setValue] = useState(order ? String(order.valueEur) : "");
  const [previewItem, setPreviewItem] = useState<PreviewAttachmentItem | null>(null);

  // Worker assignment state (Staff / Admin)
  const workers = (state.accounts || []).filter((a) => a.role === "worker");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => order?.assignedWorkerId ?? workers[0]?.id ?? workers[0]?.email ?? "");
  const [todayStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tomorrowStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [scheduledDate, setScheduledDate] = useState<string>(() => order?.scheduledDate ?? new Date().toISOString().slice(0, 10));
  const [assignNotes, setAssignNotes] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Worker execution state
  const isAssignedWorker = identity.role === "worker" && (order?.assignedWorkerId === identity.id || order?.assignedWorkerName === identity.name);
  const [completionNotes, setCompletionNotes] = useState(order?.completionNotes ?? "");
  const [completing, setCompleting] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  if (!order) {
    return (
      <>
        <BackLink href="/purchases" label="PO & SO Orders" />
        <Surface className="p-6">
          <h1 className="text-lg font-semibold">Order not found</h1>
        </Surface>
      </>
    );
  }
  const pending = order.status === "Pending";
  const canApprove = canPerform(identity.role, "approve-order") && pending;
  const canReject = canPerform(identity.role, "reject-order") && pending;
  const canEdit = canPerform(identity.role, "edit-order") && order.status !== "Rejected";

  return (
    <>
      <BackLink href="/purchases" label="PO & SO Orders" />
      <PageTitle
        title={order.title || order.number}
        subtitle={`${order.number} · ${order.customerCompany && order.customerCompany !== order.supplier ? `${order.customerCompany} · ` : ""}${order.supplier} · ${order.warehouse ? `${order.warehouse} · ` : ""}${order.date}`}
        action={<StatusPill label={order.status} />}
      />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canApprove || canReject ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {canApprove ? (
            <button type="button" onClick={() => approve(order.number)} className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white">
              Approve order
            </button>
          ) : null}
          {canReject ? (
            <button type="button" onClick={() => reject(order.number)} className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950">
              Reject order
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mb-4 text-sm text-neutral-600">
          This order is {order.status.toLowerCase()}.
        </p>
      )}
      {canEdit ? (
        <form
          className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
          onSubmit={(event) => void (async () => {
            event.preventDefault();
            const error = await editPurchase(order.number, {
              title: title.trim(),
              supplier: supplier.trim(),
              material: material.trim(),
              quantityKg: Number(quantity),
              valueEur: Number(value),
            });
            if (!error) {
              setTitle(title.trim());
              setSupplier(supplier.trim());
              setMaterial(material.trim());
            }
          })()}
        >
          <label className="text-xs text-neutral-500 sm:col-span-2">
            Custom PO Name / Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Supplier / Customer
            <input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Material
            <input value={material} onChange={(event) => setMaterial(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Quantity kg
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Value EUR
            <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white sm:col-span-2 sm:justify-self-start">
            Save order details
          </button>
        </form>
      ) : null}

      {/* Staff / Admin Worker Assignment Section */}
      {(identity.role === "manager" || identity.role === "owner") ? (
        <Surface className="mb-4 border-indigo-200 bg-indigo-50/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Worker Task Assignment & Scheduling</h2>
              <p className="text-xs text-neutral-600">
                Staff can assign this order to a specific worker and schedule it for today or future dates.
              </p>
            </div>
            {order.assignedWorkerName ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${order.executionStatus === "completed"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-blue-100 text-blue-800"
                }`}>
                ● {order.executionStatus === "completed" ? "Completed" : "Assigned"}: {order.assignedWorkerName}
                {order.scheduledDate ? ` · ${order.scheduledDate}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
                Unassigned
              </span>
            )}
          </div>

          <form
            className="mt-3 grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              void (async () => {
                e.preventDefault();
                if (!selectedWorkerId) return;
                setAssignSubmitting(true);
                const err = await assignWorkerPo({
                  poNumber: order.number,
                  workerId: selectedWorkerId,
                  scheduledDate,
                  notes: assignNotes.trim() || undefined,
                });
                setAssignSubmitting(false);
                if (!err) {
                  setAssignSuccess(true);
                  setTimeout(() => setAssignSuccess(false), 3000);
                }
              })();
            }}
          >
            <label className="text-xs font-medium text-neutral-700">
              Assign to Worker
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                <option value="">Select a worker...</option>
                {workers.map((w) => (
                  <option key={w.id || w.email} value={w.id || w.email}>
                    {w.name} ({w.warehouse || "Warehouse"})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-neutral-700">
              Scheduled Date
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScheduledDate(todayStr)}
                  className={`text-[11px] font-medium underline ${scheduledDate === todayStr ? "text-indigo-600 font-bold" : "text-neutral-500"}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setScheduledDate(tomorrowStr)}
                  className={`text-[11px] font-medium underline ${scheduledDate === tomorrowStr ? "text-indigo-600 font-bold" : "text-neutral-500"}`}
                >
                  Tomorrow
                </button>
              </div>
            </label>

            <label className="text-xs font-medium text-neutral-700">
              Task Notes / Instructions
              <input
                type="text"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="e.g. Inspect pallet packaging..."
                className="mt-1 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              />
            </label>

            <div className="flex items-center gap-2 sm:col-span-3">
              <button
                type="submit"
                disabled={assignSubmitting || !selectedWorkerId}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-neutral-950 px-4 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {assignSubmitting ? "Assigning…" : order.assignedWorkerName ? "Update Assignment" : "Assign to Worker"}
              </button>
              {assignSuccess ? (
                <span className="text-xs font-semibold text-emerald-700">✓ Assignment saved & worker notified</span>
              ) : null}
            </div>
          </form>

          {order.completionNotes ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <span className="font-semibold">Worker Completion Notes:</span> {order.completionNotes}
              {order.completedAt ? ` · Completed at ${order.completedAt.slice(0, 16).replace("T", " ")}` : ""}
            </div>
          ) : null}
        </Surface>
      ) : null}

      {/* Assigned Worker Task Execution Section */}
      {isAssignedWorker ? (
        <Surface className="mb-4 border-emerald-300 bg-emerald-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
            <div>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                Assigned to You
              </span>
              <h2 className="mt-1 text-sm font-semibold text-neutral-900">Task Execution & Evidence</h2>
              <p className="text-xs text-neutral-600">
                Scheduled for: <strong>{order.scheduledDate || "Today"}</strong>. Upload photos or documents and mark complete when finished.
              </p>
            </div>
            <StatusPill label={order.executionStatus === "completed" ? "Completed" : "In Progress"} />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700">
                Completion Notes / Observations
                <textarea
                  rows={2}
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="e.g. All 12 packages inspected, tare verified at 25kg each..."
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-sm text-neutral-900"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
                <span>📷 Upload Photo Evidence</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void (async () => {
                      setUploadingEvidence(true);
                      const compressed = await compressImageIfNeeded(file);
                      const base64 = await fileToBase64(compressed.blob);
                      await selectDocument({
                        id: `doc-${Date.now()}`,
                        name: file.name,
                        category: "Purchase",
                        mime: compressed.mime || "image/jpeg",
                        size: compressed.size,
                        bytesBase64: base64,
                      });
                      setUploadingEvidence(false);
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
                      setUploadingEvidence(true);
                      const base64 = await fileToBase64(file);
                      await selectDocument({
                        id: `doc-${Date.now()}`,
                        name: file.name,
                        category: "Transport",
                        mime: file.type || "application/pdf",
                        size: file.size,
                        bytesBase64: base64,
                      });
                      setUploadingEvidence(false);
                    })();
                  }}
                />
              </label>

              {uploadingEvidence ? <span className="text-xs text-neutral-500">Uploading evidence…</span> : null}

              {order.executionStatus !== "completed" ? (
                <button
                  type="button"
                  disabled={completing}
                  onClick={() => {
                    void (async () => {
                      setCompleting(true);
                      await completeWorkerPo({
                        poNumber: order.number,
                        completionNotes: completionNotes.trim() || undefined,
                      });
                      setCompleting(false);
                    })();
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {completing ? "Submitting…" : "Mark Task Completed"}
                </button>
              ) : (
                <span className="text-xs font-semibold text-emerald-800">✓ Task Completed</span>
              )}
            </div>
          </div>
        </Surface>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <Surface className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Order & Material Specifications</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field term="PO Number" value={order.number} />
            <Field term="Warehouse" value={order.warehouse || "Bornem"} />
            <Field term="Status" value={order.status} />
            <Field term="Customer" value={order.customerCompany.trim() ? order.customerCompany : "Internal order"} />
            <Field term="Material" value={order.material === "—" ? "Not recorded" : order.material} />
            <Field term="Quantity" value={order.quantityKg > 0 ? formatKg(order.quantityKg) : "Not recorded"} />
            <Field term="Value" value={order.valueEur > 0 ? formatEuro(order.valueEur) : "Not recorded"} />
            <Field term="Incoterms" value={order.incoterms} />
            <Field term="Notes" value={order.notes.trim() ? order.notes : "None"} />
          </dl>
        </Surface>
        <Surface className="p-4">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-3">
            <h2 className="text-sm font-semibold">Attached Documents</h2>
            <Link href="/documents" className="text-xs font-medium text-neutral-600 hover:text-neutral-900 underline underline-offset-4">
              All Files &rarr;
            </Link>
          </div>
          {(() => {
            const orderAttachments = (state.attachments || []).filter(
              (att) => att.po && att.po.toLowerCase() === order.number.toLowerCase()
            );
            if (orderAttachments.length === 0) {
              return (
                <div className="py-4 text-center">
                  <p className="text-xs text-neutral-500">No documents or photos attached to this order yet.</p>
                  <Link href="/documents" className="mt-2 inline-block text-xs font-medium text-neutral-900 underline underline-offset-4">
                    Upload to Documents
                  </Link>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {orderAttachments.map((att) => {
                  const isImg = att.mime.startsWith("image/");
                  const isPdf = att.mime === "application/pdf" || att.name.toLowerCase().endsWith(".pdf");
                  return (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{isImg ? "🖼️" : isPdf ? "📄" : "📎"}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-neutral-900 truncate">{att.readableName || att.name}</p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {att.role} &bull; {(att.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewItem({
                            id: att.id,
                            name: att.readableName || att.name,
                            mime: att.mime,
                            byteSize: att.size,
                            url: att.url,
                            uploadedByName: att.uploadedByName || att.uploadedBy || "Unknown",
                            uploadedAt: att.uploadedAt,
                            category: att.role,
                            warehouse: att.warehouse,
                          })
                        }
                        className="shrink-0 rounded bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 border border-neutral-300 hover:bg-neutral-50 shadow-2xs"
                      >
                        Preview
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Surface>
        <Surface className="p-4">
          <h2 className="text-sm font-semibold">Supplier / Customer</h2>
          <p className="mt-3 text-sm font-medium">{order.supplier}</p>
          <p className="mt-1 text-xs text-neutral-500">{order.supplierEmail}</p>
        </Surface>
        <Surface className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Transport</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Field term="Forwarder" value={order.forwarder} />
            <Field term="Container" value={order.container} />
            <Field term="Ship" value={order.ship} />
            <Field term="ETA" value={order.eta} />
          </dl>
        </Surface>
      </div>
      <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </>
  );
}

function Field({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{term}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
