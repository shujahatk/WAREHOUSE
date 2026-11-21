"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BackLink, PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import {
  OPERATION_SCHEDULE_STATUS_LABELS,
  canReadOrder,
  formatKg,
  type OperationScheduleStatus,
} from "@/domain/view";
import { canPerform } from "@/lib/permissions";
import { CurrencySelect } from "@/components/ui/currency-select";
import { formatMoney } from "@/lib/currency";
import { AttachmentPreviewModal, type PreviewAttachmentItem } from "@/components/files/attachment-preview-modal";
import { compressImageIfNeeded, fileToBase64 } from "@/lib/client-image";

export function PurchaseDetail({ number }: { number: string }) {
  const router = useRouter();
  const {
    state,
    approve,
    reject,
    editPurchase,
    deletePurchase,
    removePoSoNumber,
    assignWorkerPo,
    completeWorkerPo,
    selectDocument,
    notice,
  } = useDemo();
  const { identity } = useSession();
  const actor = {
    name: identity.name,
    role: identity.role,
    warehouse: identity.warehouse,
    email: identity.email,
    company: identity.company,
  };
  const decodedNumber = decodeURIComponent(number);
  const found = state.orders.find(
    (item) => item.number.toLowerCase() === decodedNumber.toLowerCase() || item.id === decodedNumber
  );
  const order = found && canReadOrder(actor, found) ? found : undefined;

  const isSo = Boolean(order && (order.type === "SO" || order.number.toUpperCase().startsWith("SO")));

  // Edit form state
  const [editNumber, setEditNumber] = useState(order?.number ?? "");
  const [title, setTitle] = useState(order?.title ?? "");
  const [partner, setPartner] = useState(order?.supplier || order?.customerCompany || "");
  const [purchaserOrSeller, setPurchaserOrSeller] = useState(
    isSo ? (order?.sellerName ?? "") : (order?.purchaserName ?? "")
  );
  const [material, setMaterial] = useState(order?.material === "—" ? "" : (order?.material ?? ""));
  const [quantity, setQuantity] = useState(order ? String(order.quantityKg) : "");
  const [value, setValue] = useState(order ? String(order.valueEur) : "");
  const [transportPrice, setTransportPrice] = useState(order ? String(order.transportPrice ?? 0) : "0");
  const [currency, setCurrency] = useState(order?.currency || "EUR");
  const [origin, setOrigin] = useState(order?.origin ?? "");
  const [destination, setDestination] = useState(order?.destination ?? "");
  const [warehouse, setWarehouse] = useState(
    order?.warehouse && order.warehouse !== "—" ? order.warehouse : "Bornem"
  );
  const [pickupDate, setPickupDate] = useState(order?.pickupDate ? order.pickupDate.slice(0, 10) : "");
  const [orderScheduledDate, setOrderScheduledDate] = useState(
    order?.scheduledDate ? order.scheduledDate.slice(0, 10) : ""
  );
  const [annex7Required, setAnnex7Required] = useState(Boolean(order?.annex7Required));
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [previewItem, setPreviewItem] = useState<PreviewAttachmentItem | null>(null);

  // Worker assignment state (Staff / Admin)
  const workers = (state.accounts || []).filter((a) => a.role === "worker");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(
    () => order?.assignedWorkerId ?? workers[0]?.id ?? workers[0]?.email ?? ""
  );
  const [todayStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tomorrowStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [scheduledDate, setScheduledDate] = useState<string>(
    () => order?.scheduledDate ?? new Date().toISOString().slice(0, 10)
  );
  const [assignNotes, setAssignNotes] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Worker execution state
  const isAssignedWorker =
    identity.role === "worker" &&
    (order?.assignedWorkerId === identity.id || order?.assignedWorkerName === identity.name);
  const [completionNotes, setCompletionNotes] = useState(order?.completionNotes ?? "");
  const [completing, setCompleting] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const warehouseOptions = useMemo(() => {
    const list = new Set<string>(["Bornem", "Turnhout", "Spain", "Pakistan"]);
    for (const w of state.directory?.warehouses || []) {
      if (w.name) list.add(w.name);
    }
    return Array.from(list);
  }, [state.directory]);

  const orderHistory = useMemo(() => {
    if (!order) return [];
    const targetNum = order.number.toLowerCase();
    const targetId = (order.id || "").toLowerCase();
    return (state.activity || []).filter((entry) => {
      const recId = (entry.recordId || "").toLowerCase();
      const txt = (entry.text || "").toLowerCase();
      return (
        (targetId && recId === targetId) ||
        recId === targetNum ||
        txt.includes(targetNum)
      );
    });
  }, [order, state.activity]);

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
  const canEdit = canPerform(identity.role, "edit-order") && !order.isRemoved;
  const canDelete = canPerform(identity.role, "delete-order") && !order.isRemoved;
  const linkedSchedules = order.linkedSchedules || [];

  async function handleSaveOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!order || savingEdit) return;
    setEditError(null);
    const trimmedNum = editNumber.trim();
    const trimmedPartner = partner.trim();
    const trimmedMaterial = material.trim();
    const parsedQty = Number(quantity);
    const parsedVal = Number(value);
    const parsedTransport = Number(transportPrice || 0);

    if (!trimmedNum) {
      setEditError(`${isSo ? "SO" : "PO"} reference number is required.`);
      return;
    }
    if (!trimmedPartner || !trimmedMaterial) {
      setEditError("Partner and material are required.");
      return;
    }

    const whRecord = (state.directory?.warehouses || []).find(
      (w) => w.name.toLowerCase() === warehouse.toLowerCase() || w.id === warehouse
    );

    setSavingEdit(true);
    try {
      const error = await editPurchase(order.number, {
        id: order.id,
        newNumber: trimmedNum !== order.number ? trimmedNum : undefined,
        title: title.trim(),
        partner: trimmedPartner,
        supplier: !isSo ? trimmedPartner : undefined,
        customer: isSo ? trimmedPartner : undefined,
        purchaserName: !isSo ? (purchaserOrSeller.trim() || null) : undefined,
        sellerName: isSo ? (purchaserOrSeller.trim() || null) : undefined,
        material: trimmedMaterial,
        quantityKg: parsedQty,
        valueEur: parsedVal,
        transportPrice: parsedTransport,
        currency,
        origin: origin.trim(),
        destination: destination.trim(),
        warehouse,
        warehouseId: whRecord?.id ?? null,
        pickupDate: pickupDate || null,
        scheduledDate: orderScheduledDate || null,
        annex7Required,
        notes: notes.trim(),
      });
      if (error) {
        setEditError(error);
      } else if (trimmedNum !== order.number) {
        router.replace(`/purchases/${encodeURIComponent(trimmedNum)}`);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!order || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const err = deletePurchase
        ? await deletePurchase(order.id || order.number)
        : await removePoSoNumber(order.number);
      if (err) {
        setDeleteError(err);
      } else {
        router.push("/purchases");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink href="/purchases" label="PO & SO Orders" />
        <div className="flex items-center gap-2">
          <Link
            href={isSo ? "/schedules/loading" : "/schedules/unloading"}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            {isSo ? "Go to Loading Schedules →" : "Go to Unloading Schedules →"}
          </Link>
          {canDelete ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Delete {isSo ? "SO" : "PO"}
            </button>
          ) : null}
        </div>
      </div>

      <PageTitle
        title={order.title || order.number}
        subtitle={`${isSo ? "Sales Order (SO · Outbound Loading)" : "Purchase Order (PO · Inbound Unloading)"} · ${order.number} · ${order.customerCompany || order.supplier || "—"} · ${order.warehouse || "Bornem"} · Created ${order.date}`}
        action={<StatusPill label={order.status} />}
      />

      {notice ? (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-medium text-emerald-900">
          {notice}
        </div>
      ) : null}

      {canApprove || canReject ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {canApprove ? (
            <button
              type="button"
              onClick={() => void approve(order.number)}
              className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
            >
              Approve order
            </button>
          ) : null}
          {canReject ? (
            <button
              type="button"
              onClick={() => void reject(order.number)}
              className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950"
            >
              Reject order
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Full Staff Edit Form */}
      {canEdit ? (
        <Surface className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-neutral-950">
                Edit {isSo ? "Sales Order (SO)" : "Purchase Order (PO)"} Details
              </h2>
              <p className="text-xs text-neutral-500">
                Update any commercial, supplier/customer, route, schedule date, or Annex VII field directly in the database.
              </p>
            </div>
            {linkedSchedules.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                Linked to {linkedSchedules.length} schedule{linkedSchedules.length > 1 ? "s" : ""} (auto-synced)
              </span>
            ) : null}
          </div>

          {editError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
              {editError}
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSaveOrder(e)} className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
            <label className="font-medium text-neutral-700">
              {isSo ? "SO Reference Number" : "PO Reference Number"}
              <input
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs font-mono text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700 sm:col-span-2">
              Order Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              {isSo ? "Customer / Buyer" : "Supplier"}
              <input
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              {isSo ? "Seller Name" : "Purchaser Name"}
              <input
                value={purchaserOrSeller}
                onChange={(e) => setPurchaserOrSeller(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              Material
              <input
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              Quantity (kg)
              <input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs font-mono text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              {isSo ? "Selling Price" : "Purchasing Price"}
              <input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs font-mono text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              Transport Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={transportPrice}
                onChange={(e) => setTransportPrice(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs font-mono text-neutral-950"
              />
            </label>

            <div>
              <span className="block font-medium text-neutral-700">Currency</span>
              <div className="mt-1">
                <CurrencySelect value={currency} onChange={setCurrency} />
              </div>
            </div>

            <label className="font-medium text-neutral-700">
              Origin
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              Destination
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              Warehouse
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950"
              >
                {warehouseOptions.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            </label>

            <label className="font-medium text-neutral-700">
              Pickup Date
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              {isSo ? "Scheduled Loading Date" : "Scheduled Unloading Date"}
              <input
                type="date"
                value={orderScheduledDate}
                onChange={(e) => setOrderScheduledDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <label className="font-medium text-neutral-700">
              Annex VII Required?
              <select
                value={annex7Required ? "yes" : "no"}
                onChange={(e) => setAnnex7Required(e.target.value === "yes")}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-950"
              >
                <option value="no">No</option>
                <option value="yes">Yes — Annex VII Required</option>
              </select>
            </label>

            <label className="font-medium text-neutral-700 sm:col-span-3">
              Operational Notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-950"
              />
            </label>

            <div className="sm:col-span-3 flex items-center justify-end">
              <button
                type="submit"
                disabled={savingEdit}
                className="h-9 rounded-lg bg-neutral-950 px-5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save Order Details"}
              </button>
            </div>
          </form>
        </Surface>
      ) : null}

      {/* Linked Warehouse Schedules Section */}
      <Surface className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
          <div>
            <h2 className="text-sm font-bold text-neutral-950">
              Linked Warehouse {isSo ? "Loading" : "Unloading"} Schedules ({linkedSchedules.length})
            </h2>
            <p className="text-xs text-neutral-500">
              Schedules linked to this {isSo ? "Sales Order" : "Purchase Order"} by database ID ({order.id || order.number}).
            </p>
          </div>
          <Link
            href={isSo ? "/schedules/loading" : "/schedules/unloading"}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {isSo ? "Manage Loading Schedules" : "Manage Unloading Schedules"}
          </Link>
        </div>

        {linkedSchedules.length === 0 ? (
          <p className="mt-3 text-xs text-neutral-500">
            No {isSo ? "loading" : "unloading"} schedules are linked to {order.number} yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {linkedSchedules.map((sched) => (
              <div
                key={sched.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-neutral-950">{sched.scheduleNumber}</span>
                    <span className="rounded bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-800">
                      {OPERATION_SCHEDULE_STATUS_LABELS[sched.status as OperationScheduleStatus] || sched.status}
                    </span>
                  </div>
                  <p className="mt-1 text-neutral-600">
                    Scheduled: <strong>{sched.scheduledDate}</strong> · Worker:{" "}
                    <strong>{sched.assignedWorkerName || "Unassigned"}</strong>
                  </p>
                  <p className="mt-0.5 text-neutral-500">
                    Net Weight: <strong>{formatKg(sched.totalNetWeightKg)}</strong>
                  </p>
                </div>
                <Link
                  href={sched.type === "loading" ? "/schedules/loading" : "/schedules/unloading"}
                  className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
                >
                  Open &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {/* Staff / Admin Worker Assignment Section */}
      {identity.role === "manager" || identity.role === "owner" ? (
        <Surface className="mb-4 border-indigo-200 bg-indigo-50/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Worker Task Assignment & Scheduling</h2>
              <p className="text-xs text-neutral-600">
                Staff can assign this order to a specific worker and schedule it for today or future dates.
              </p>
            </div>
            {order.assignedWorkerName ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  order.executionStatus === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                ● {order.executionStatus === "completed" ? "Completed" : "Assigned"}: {order.assignedWorkerName}
                {order.scheduledDate ? ` · ${order.scheduledDate}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
                Unassigned
              </span>
            )}
          </div>

          {identity.role === "manager" ? (
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
                    className={`text-[11px] font-medium underline ${
                      scheduledDate === todayStr ? "text-indigo-600 font-bold" : "text-neutral-500"
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduledDate(tomorrowStr)}
                    className={`text-[11px] font-medium underline ${
                      scheduledDate === tomorrowStr ? "text-indigo-600 font-bold" : "text-neutral-500"
                    }`}
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
          ) : (
            <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-100/70 p-3 text-xs text-neutral-600">
              Admin view only. Worker task scheduling and assignments are managed by Staff.
            </div>
          )}

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

      {/* Complete Order Specifications & Attached Documents */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Surface className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Complete {isSo ? "Sales Order (SO)" : "Purchase Order (PO)"} Specifications</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field term={isSo ? "SO Reference" : "PO Reference"} value={order.number} />
            <Field term="Order Type" value={isSo ? "SO (Outbound Loading)" : "PO (Inbound Unloading)"} />
            <Field term="Status" value={order.status} />
            <Field
              term={isSo ? "Customer / Buyer" : "Supplier"}
              value={order.customerCompany || order.supplier || "—"}
            />
            <Field
              term={isSo ? "Seller Name" : "Purchaser Name"}
              value={(isSo ? order.sellerName : order.purchaserName) || "Not recorded"}
            />
            <Field term="Warehouse" value={order.warehouse || "Bornem"} />
            <Field term="Material" value={order.material === "—" ? "Not recorded" : order.material} />
            <Field term="Quantity" value={order.quantityKg > 0 ? formatKg(order.quantityKg) : "Not recorded"} />
            <Field
              term={isSo ? "Selling Price" : "Purchasing Price"}
              value={formatMoney(order.valueEur, order.currency)}
            />
            <Field
              term="Transport Price"
              value={formatMoney(order.transportPrice ?? 0, order.currency)}
            />
            <Field term="Currency" value={order.currency || "EUR"} />
            <Field term="Annex VII Required" value={order.annex7Required ? "Yes" : "No"} />
            <Field term="Origin" value={order.origin || "Not recorded"} />
            <Field term="Destination" value={order.destination || "Not recorded"} />
            <Field term="Pickup Date" value={order.pickupDate || "Not recorded"} />
            <Field
              term={isSo ? "Scheduled Loading Date" : "Scheduled Unloading Date"}
              value={order.scheduledDate || "Not scheduled"}
            />
            <Field term="Created Date" value={order.date} />
            <Field term="Notes" value={order.notes.trim() ? order.notes : "None"} />
          </dl>
        </Surface>

        <Surface className="p-4">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-3">
            <h2 className="text-sm font-semibold">Attached Documents</h2>
            <Link
              href="/documents"
              className="text-xs font-medium text-neutral-600 hover:text-neutral-900 underline underline-offset-4"
            >
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
                  <Link
                    href="/documents"
                    className="mt-2 inline-block text-xs font-medium text-neutral-900 underline underline-offset-4"
                  >
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
                          <p className="text-xs font-medium text-neutral-900 truncate">
                            {att.readableName || att.name}
                          </p>
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

        {/* Record History & Audit Trail */}
        <Surface className="p-4 lg:col-span-3">
          <h2 className="text-sm font-semibold">Order Audit & Operational History</h2>
          {orderHistory.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">
              Created on {order.date} by {order.owner || "Staff"}. No additional history events recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100 text-xs">
              {orderHistory.slice(0, 20).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-semibold text-neutral-900">{item.actor || "Staff"}</span>{" "}
                    <span className="text-neutral-600">{item.text}</span>
                  </div>
                  <span className="font-mono text-[11px] text-neutral-400">
                    {item.createdAt ? item.createdAt.slice(0, 16).replace("T", " ") : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-neutral-950">
              Delete {isSo ? "Sales Order" : "Purchase Order"} {order.number}?
            </h3>
            <p className="mt-2 text-xs text-neutral-600">
              Are you sure you want to delete <strong>{order.number}</strong>?
            </p>
            {linkedSchedules.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <p className="font-bold">
                  ⚠️ Warning: Linked to {linkedSchedules.length} schedule{linkedSchedules.length > 1 ? "s" : ""} (
                  {linkedSchedules.map((s) => s.scheduleNumber).join(", ")})
                </p>
                <p className="mt-1">
                  Deleting this order archives it from active PO/SO lists while preserving all completed and linked schedule operations.
                </p>
              </div>
            ) : null}
            {deleteError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {deleteError}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                {deleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </>
  );
}

function Field({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{term}</dt>
      <dd className="mt-1 font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
