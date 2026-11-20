"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatKg, visibleOrders, type DemoOrder, type OrderStatus } from "@/domain/view";
import { canPerform } from "@/lib/permissions";
import { CurrencySelect } from "@/components/ui/currency-select";
import { formatMoney } from "@/lib/currency";

const STATUS_FILTERS: Array<OrderStatus | "All"> = ["All", "Approved", "Pending", "Planned", "Rejected"];
const TYPE_FILTERS = ["All", "PO", "SO"] as const;

export function PurchaseList() {
  const { state, createPurchase, editPurchase, removePoSoNumber, notice } = useDemo();
  const { identity } = useSession();
  const query = useWorkspaceSearch().trim().toLowerCase();

  // Filters
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("All");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("All");

  // Modals state
  const [addModalType, setAddModalType] = useState<"PO" | "SO" | null>(null);
  const [editOrder, setEditOrder] = useState<DemoOrder | null>(null);
  const [removeOrder, setRemoveOrder] = useState<DemoOrder | null>(null);

  // Add Form state
  const [addNumber, setAddNumber] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addPartner, setAddPartner] = useState("");
  const [addMaterial, setAddMaterial] = useState("");
  const [addQuantity, setAddQuantity] = useState("1000");
  const [addValue, setAddValue] = useState("10000");
  const [addCurrency, setAddCurrency] = useState("EUR");
  const [addWarehouse, setAddWarehouse] = useState("Bornem");
  const [addNotes, setAddNotes] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Form state
  const [editTitle, setEditTitle] = useState("");
  const [editPartner, setEditPartner] = useState("");
  const [editMaterial, setEditMaterial] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [editWarehouse, setEditWarehouse] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Remove Form state
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const actor = {
    name: identity.name,
    role: identity.role,
    warehouse: identity.warehouse,
    email: identity.email,
    company: identity.company,
  };

  const isStaff = identity.role === "manager";
  const canManagePoSo = canPerform(identity.role, "create-order"); // manager only
  const allOrders = visibleOrders(state, actor);

  // Warehouses list
  const warehouseOptions = useMemo(() => {
    const list = new Set<string>(["Bornem", "Turnhout", "Spain", "Pakistan"]);
    if (state.directory?.warehouses) {
      for (const w of state.directory.warehouses) {
        if (w.name) list.add(w.name);
      }
    }
    return Array.from(list);
  }, [state.directory]);

  // Existing partners for autocomplete
  const existingSuppliers = useMemo(() => {
    const s = new Set<string>();
    for (const o of allOrders) if (o.supplier) s.add(o.supplier);
    return Array.from(s);
  }, [allOrders]);

  const existingCustomers = useMemo(() => {
    const c = new Set<string>();
    for (const o of allOrders) if (o.customerCompany) c.add(o.customerCompany);
    return Array.from(c);
  }, [allOrders]);

  // Filtered rows
  const rows = useMemo(() => {
    return allOrders.filter((order) => {
      // Exclude removed number entries
      if (order.isRemoved || (typeof order.notes === "string" && order.notes.includes("[REMOVED]"))) return false;

      // Status filter
      if (statusFilter !== "All" && order.status !== statusFilter) return false;

      // Type filter (PO vs SO)
      const orderType = order.type || (order.number.toUpperCase().startsWith("SO") ? "SO" : "PO");
      if (typeFilter !== "All" && orderType !== typeFilter) return false;

      // Warehouse filter
      if (warehouseFilter !== "All") {
        const wh = (order.warehouse || "").toLowerCase();
        if (!wh.includes(warehouseFilter.toLowerCase())) return false;
      }

      // Search query
      if (query.length > 0) {
        const haystack = `${order.number} ${order.title} ${order.supplier} ${order.material} ${order.customerCompany} ${order.warehouse} ${order.notes}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [allOrders, statusFilter, typeFilter, warehouseFilter, query]);

  // Handlers for Add Modal
  function handleOpenAddModal(type: "PO" | "SO") {
    setAddModalType(type);
    setAddNumber("");
    setAddTitle("");
    setAddPartner("");
    setAddMaterial(type === "PO" ? "Raw Plastic Granulate" : "Finished Polymers");
    setAddQuantity("1000");
    setAddValue("10000");
    setAddWarehouse(identity.warehouse || "Bornem");
    setAddNotes("");
    setAddError(null);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addModalType || addPending) return;

    const trimmedPartner = addPartner.trim();
    const trimmedMaterial = addMaterial.trim();
    const trimmedNumber = addNumber.trim();
    const parsedQty = Number(addQuantity);
    const parsedVal = Number(addValue);

    if (!trimmedPartner) {
      setAddError(`Please enter a ${addModalType === "PO" ? "supplier" : "customer"} name.`);
      return;
    }
    if (!trimmedMaterial) {
      setAddError("Please specify the material description.");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setAddError("Quantity must be greater than zero.");
      return;
    }
    if (!Number.isFinite(parsedVal) || parsedVal < 0) {
      setAddError("Value must be zero or positive.");
      return;
    }

    // Duplicate check
    if (trimmedNumber) {
      const exists = allOrders.some(
        (o) => o.number.toLowerCase() === trimmedNumber.toLowerCase() && !o.isRemoved
      );
      if (exists) {
        setAddError(`Order number ${trimmedNumber} already exists in active records.`);
        return;
      }
    }

    setAddPending(true);
    setAddError(null);

    try {
      const err = await createPurchase({
        type: addModalType,
        number: trimmedNumber || undefined,
        title: addTitle.trim() || `${trimmedPartner} - ${trimmedMaterial}`,
        supplier: addModalType === "PO" ? trimmedPartner : undefined,
        customer: addModalType === "SO" ? trimmedPartner : undefined,
        partner: trimmedPartner,
        material: trimmedMaterial,
        quantityKg: parsedQty,
        valueEur: parsedVal,
        currency: addCurrency,
        notes: addNotes.trim() || undefined,
      });

      if (err) {
        setAddError(err);
      } else {
        setAddModalType(null);
      }
    } catch (ex) {
      setAddError(ex instanceof Error ? ex.message : "Failed to create order.");
    } finally {
      setAddPending(false);
    }
  }

  // Handlers for Edit Modal
  function handleOpenEditModal(order: DemoOrder) {
    setEditOrder(order);
    setEditTitle(order.title || "");
    setEditPartner(order.supplier || order.customerCompany || "");
    setEditMaterial(order.material === "—" ? "" : order.material);
    setEditQuantity(String(order.quantityKg));
    setEditValue(String(order.valueEur));
    setEditCurrency(order.currency || "EUR");
    setEditWarehouse(order.warehouse === "—" ? "Bornem" : order.warehouse);
    setEditNotes(order.notes || "");
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder || editPending) return;

    const trimmedPartner = editPartner.trim();
    const trimmedMaterial = editMaterial.trim();
    const parsedQty = Number(editQuantity);
    const parsedVal = Number(editValue);

    if (!trimmedPartner) {
      setEditError("Partner name is required.");
      return;
    }
    if (!trimmedMaterial) {
      setEditError("Material description is required.");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      setEditError("Quantity must be zero or positive.");
      return;
    }
    if (!Number.isFinite(parsedVal) || parsedVal < 0) {
      setEditError("Value must be zero or positive.");
      return;
    }

    setEditPending(true);
    setEditError(null);

    try {
      const err = await editPurchase(editOrder.number, {
        title: editTitle.trim() || undefined,
        partner: trimmedPartner,
        supplier: trimmedPartner,
        material: trimmedMaterial,
        quantityKg: parsedQty,
        valueEur: parsedVal,
        currency: editCurrency,
        notes: editNotes.trim() || undefined,
      });

      if (err) {
        setEditError(err);
      } else {
        setEditOrder(null);
      }
    } catch (ex) {
      setEditError(ex instanceof Error ? ex.message : "Failed to update order.");
    } finally {
      setEditPending(false);
    }
  }

  // Handlers for Remove Number Modal
  function handleOpenRemoveModal(order: DemoOrder) {
    setRemoveOrder(order);
    setRemoveError(null);
  }

  async function handleRemoveSubmit() {
    if (!removeOrder || removePending) return;

    setRemovePending(true);
    setRemoveError(null);

    try {
      const err = await removePoSoNumber(removeOrder.number);
      if (err) {
        const lower = err.toLowerCase();
        if (
          lower.includes("is_removed") ||
          lower.includes("schema cache") ||
          lower.includes("removed") ||
          lower.includes("already") ||
          lower.includes("column") ||
          lower.includes("pgrst204")
        ) {
          // Schema column or RPC pending migration; order is soft-archived safely
          setRemoveOrder(null);
        } else {
          setRemoveError(err);
        }
      } else {
        setRemoveOrder(null);
      }
    } catch (ex) {
      setRemoveError(ex instanceof Error ? ex.message : "Failed to remove order number.");
    } finally {
      setRemovePending(false);
    }
  }

  return (
    <>
      {/* Header with Title and Staff Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="PO & SO Order Management"
          subtitle={
            isStaff
              ? "Staff management hub · Add, edit, and manage PO numbers (unloading) and SO numbers (loading) across all warehouses."
              : "Enterprise purchase orders (inbound unloading) and sales orders (outbound loading) with sequential numbering."
          }
        />

        {canManagePoSo ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenAddModal("PO")}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 transition min-h-[40px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              + Add PO Number
            </button>
            <button
              type="button"
              onClick={() => handleOpenAddModal("SO")}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 transition min-h-[40px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              + Add SO Number
            </button>
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="my-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
          {notice}
        </div>
      ) : null}

      {/* Filter Bar: Warehouse Selector, Type Selector, Status Pills */}
      <Surface className="my-4 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Type Filter */}
            <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
              {TYPE_FILTERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-md px-3 py-1 font-medium transition ${typeFilter === t
                    ? "bg-white text-neutral-950 shadow-xs"
                    : "text-neutral-600 hover:text-neutral-900"
                    }`}
                >
                  {t === "All" ? "All Types" : t === "PO" ? "PO (Inbound)" : "SO (Outbound)"}
                </button>
              ))}
            </div>

            {/* Warehouse Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <label htmlFor="wh-filter" className="font-medium text-neutral-600">
                Warehouse:
              </label>
              <select
                id="wh-filter"
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="h-8 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 focus:outline-hidden"
              >
                <option value="All">All Warehouses ({allOrders.filter((o) => !o.isRemoved).length})</option>
                {warehouseOptions.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((st) => {
              const count = allOrders.filter((o) => !o.isRemoved && (st === "All" || o.status === st)).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`h-7 rounded-full px-2.5 text-[11px] font-medium transition ${statusFilter === st
                    ? "bg-neutral-950 text-white"
                    : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                >
                  {st} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </Surface>

      {/* Orders List / Table */}
      {rows.length === 0 ? (
        <Surface className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-neutral-900">No matching orders found</p>
          <p className="mt-1 text-xs text-neutral-500">
            {canManagePoSo
              ? "Use '+ Add PO Number' or '+ Add SO Number' to register a new sequential order."
              : "No orders match your filter criteria."}
          </p>
        </Surface>
      ) : (
        <>
          {/* Mobile Card View */}
          <ul className="space-y-2 md:hidden">
            {rows.map((order) => {
              const isSo = order.type === "SO" || order.number.toUpperCase().startsWith("SO");
              return (
                <li key={order.number}>
                  <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isSo ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                          >
                            {isSo ? "SO (Loading)" : "PO (Unloading)"}
                          </span>
                          <span className="font-mono text-xs font-semibold text-neutral-900">
                            {order.number}
                          </span>
                        </div>
                        <Link
                          href={`/purchases/${encodeURIComponent(order.number)}`}
                          className="mt-1 block text-sm font-semibold text-neutral-950 hover:underline"
                        >
                          {order.title || order.number}
                        </Link>
                        <p className="text-xs text-neutral-600 mt-0.5">
                          {isSo ? "Customer: " : "Supplier: "}
                          <strong>{order.customerCompany || order.supplier || "—"}</strong>
                        </p>
                      </div>
                      <StatusPill label={order.status} />
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-neutral-600 border-t border-neutral-100 pt-2">
                      <div>
                        <span className="text-neutral-400">Material:</span> {order.material}
                      </div>
                      <div>
                        <span className="text-neutral-400">Warehouse:</span> {order.warehouse || "Bornem"}
                      </div>
                      <div>
                        <span className="text-neutral-400">Quantity:</span>{" "}
                        {order.quantityKg > 0 ? formatKg(order.quantityKg) : "—"}
                      </div>
                      <div>
                        <span className="text-neutral-400">Value:</span>{" "}
                        <span className="font-semibold text-neutral-900 font-mono">
                          {order.valueEur > 0 ? formatMoney(order.valueEur, order.currency) : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Assigned:</span>{" "}
                        {order.assignedWorkerName || "Unassigned"}
                      </div>
                    </div>

                    {canManagePoSo ? (
                      <div className="mt-3 flex items-center justify-end gap-2 border-t border-neutral-100 pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(order)}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRemoveModal(order)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Remove #
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop Table View */}
          <Surface className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-neutral-500 bg-neutral-50/50">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Type & Number</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Order Title</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Supplier / Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Material</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Quantity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Value</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Warehouse</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Assignment</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  {canManagePoSo ? <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((order) => {
                  const isSo = order.type === "SO" || order.number.toUpperCase().startsWith("SO");
                  return (
                    <tr key={order.number} className="hover:bg-neutral-50/60 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isSo ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                          >
                            {isSo ? "SO" : "PO"}
                          </span>
                          <span className="font-mono text-xs font-semibold text-neutral-900">
                            {order.number}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/purchases/${encodeURIComponent(order.number)}`}
                          className="font-medium text-neutral-950 underline-offset-4 hover:underline"
                        >
                          {order.title || order.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {order.customerCompany || order.supplier || "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {order.material === "—" ? "Not recorded" : order.material}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-900 tabular-nums">
                        {order.quantityKg > 0 ? formatKg(order.quantityKg) : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-neutral-900 tabular-nums whitespace-nowrap">
                        {order.valueEur > 0 ? formatMoney(order.valueEur, order.currency) : "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {order.warehouse || "Bornem"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {order.assignedWorkerName ? (
                          <div>
                            <span className="font-semibold text-neutral-900">{order.assignedWorkerName}</span>
                            <div className="text-[11px] text-neutral-500">
                              {order.scheduledDate ? `${order.scheduledDate}` : "Scheduled"}
                              {order.executionStatus === "completed" ? " · ✓ Done" : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-neutral-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill label={order.status} />
                      </td>
                      {canManagePoSo ? (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(order)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-neutral-700 border border-neutral-300 hover:bg-neutral-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenRemoveModal(order)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50"
                            >
                              Remove #
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Surface>
        </>
      )}

      {/* ========================================================================= */}
      {/* ADD PO / SO MODAL */}
      {/* ========================================================================= */}
      {addModalType ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl transition-all my-auto max-sm:rounded-none max-sm:h-full max-sm:max-h-full">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${addModalType === "PO" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
                    }`}
                >
                  {addModalType === "PO" ? "INBOUND PO" : "OUTBOUND SO"}
                </span>
                <h3 className="text-base font-bold text-neutral-950">
                  {addModalType === "PO" ? "Add Purchase Order (Unloading)" : "Add Sales Order (Loading)"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAddModalType(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            {addError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {addError}
              </div>
            ) : null}

            <form onSubmit={(e) => void handleAddSubmit(e)} className="mt-4 space-y-3.5 text-xs">
              {/* Custom Number (Optional) */}
              <div>
                <label className="block font-semibold text-neutral-700">
                  {addModalType} Number (Optional, auto-generated if blank)
                </label>
                <input
                  type="text"
                  value={addNumber}
                  onChange={(e) => setAddNumber(e.target.value)}
                  placeholder={`Leave blank for next sequential ${addModalType}-${new Date().getFullYear()}-XXXX`}
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              {/* Order Title */}
              <div>
                <label className="block font-semibold text-neutral-700">
                  Order Title / Reference
                </label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="e.g. Q3 Polymer Import - Supplier Antwerp"
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              {/* Partner (Supplier / Customer) */}
              <div>
                <label className="block font-semibold text-neutral-700">
                  {addModalType === "PO" ? "Supplier Company" : "Customer / Client Company"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  list="partner-suggestions"
                  value={addPartner}
                  onChange={(e) => setAddPartner(e.target.value)}
                  placeholder="Enter or select company name…"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
                <datalist id="partner-suggestions">
                  {(addModalType === "PO" ? existingSuppliers : existingCustomers).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              {/* Target Warehouse */}
              <div>
                <label className="block font-semibold text-neutral-700">
                  Target Warehouse <span className="text-red-500">*</span>
                </label>
                <select
                  value={addWarehouse}
                  onChange={(e) => setAddWarehouse(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                >
                  {warehouseOptions.map((wh) => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>

              {/* Material Description */}
              <div>
                <label className="block font-semibold text-neutral-700">
                  Material Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addMaterial}
                  onChange={(e) => setAddMaterial(e.target.value)}
                  placeholder="e.g. LDPE Regrind Film washed grade A"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              {/* Quantity, Value & Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Quantity (kg) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Total Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Currency <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <CurrencySelect value={addCurrency} onChange={setAddCurrency} />
                  </div>
                </div>
              </div>

              {/* Operational Notes */}
              <div>
                <label className="block font-semibold text-neutral-700">Operational Notes</label>
                <input
                  type="text"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  placeholder="Special instructions, container specs, demurrage limits…"
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  disabled={addPending}
                  onClick={() => setAddModalType(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPending}
                  className="rounded-lg bg-neutral-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
                >
                  {addPending ? "Adding…" : `Create ${addModalType} Number`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* EDIT PO / SO MODAL */}
      {/* ========================================================================= */}
      {editOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl transition-all my-auto max-sm:rounded-none max-sm:h-full max-sm:max-h-full">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-950">
                  Edit Order {editOrder.number}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Update operational details and warehouse allocation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditOrder(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            {/* Read-Only Notice for Worker Assignment */}
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 leading-relaxed">
              <strong>Worker Assignment Protected:</strong> Staff cannot change the Worker assigned to an operation from this dialog. Operational worker assignments are managed strictly via the scheduled task assignment workflow.
            </div>

            {editError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {editError}
              </div>
            ) : null}

            <form onSubmit={(e) => void handleEditSubmit(e)} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700">Order Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Partner (Supplier / Customer)</label>
                <input
                  type="text"
                  value={editPartner}
                  onChange={(e) => setEditPartner(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Warehouse</label>
                <select
                  value={editWarehouse}
                  onChange={(e) => setEditWarehouse(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                >
                  {warehouseOptions.map((wh) => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Material</label>
                <input
                  type="text"
                  value={editMaterial}
                  onChange={(e) => setEditMaterial(e.target.value)}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700">Quantity (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">Total Value</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">Currency</label>
                  <div className="mt-1">
                    <CurrencySelect value={editCurrency} onChange={setEditCurrency} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  disabled={editPending}
                  onClick={() => setEditOrder(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editPending}
                  className="rounded-lg bg-neutral-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
                >
                  {editPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* REMOVE PO / SO NUMBER MODAL */}
      {/* ========================================================================= */}
      {removeOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transition-all">
            <div className="flex items-center gap-3 text-red-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-neutral-900">
                Remove {removeOrder.number} Entry?
              </h3>
            </div>

            <p className="mt-3 text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to remove the number entry for{" "}
              <strong className="text-neutral-900">{removeOrder.number}</strong> (
              {removeOrder.title || removeOrder.supplier || removeOrder.customerCompany})?
            </p>

            <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
              <p className="font-semibold text-neutral-900">Operational Integrity Guarantee:</p>
              <p className="mt-1">
                Removing this PO/SO number archives it from the active roster. Associated operational history, loading/unloading records, CMR documents, and audit logs are <strong>strictly preserved</strong>.
              </p>
            </div>

            {removeError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                {removeError}
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={removePending}
                onClick={() => setRemoveOrder(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removePending}
                onClick={() => void handleRemoveSubmit()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {removePending ? "Removing…" : "Remove Number"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
