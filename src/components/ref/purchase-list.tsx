"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import {
  OPERATION_SCHEDULE_STATUS_LABELS,
  formatKg,
  visibleOrders,
  type DemoOrder,
  type OperationScheduleStatus,
  type OrderStatus,
} from "@/domain/view";
import { canPerform } from "@/lib/permissions";
import { CurrencySelect } from "@/components/ui/currency-select";
import { formatMoney } from "@/lib/currency";

const STATUS_FILTERS: Array<OrderStatus | "All"> = ["All", "Approved", "Pending", "Planned", "Rejected"];
const TYPE_FILTERS = ["All", "PO", "SO"] as const;
const ANNEX_FILTERS = ["All", "Yes", "No"] as const;
type SortKey =
  | "date_desc"
  | "date_asc"
  | "number_asc"
  | "number_desc"
  | "value_desc"
  | "value_asc"
  | "qty_desc"
  | "partner_asc"
  | "scheduled_asc";

export function PurchaseList({ initialType = "All" }: { initialType?: "All" | "PO" | "SO" } = {}) {
  const { state, createPurchase, editPurchase, deletePurchase, removePoSoNumber, notice } = useDemo();
  const { identity } = useSession();
  const globalQuery = useWorkspaceSearch().trim().toLowerCase();

  // Search, Filters, Sorting & Pagination
  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>(initialType);
  const [warehouseFilter, setWarehouseFilter] = useState<string>("All");
  const [annexFilter, setAnnexFilter] = useState<(typeof ANNEX_FILTERS)[number]>("All");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modals state
  const [addModalType, setAddModalType] = useState<"PO" | "SO" | null>(null);
  const [editOrder, setEditOrder] = useState<DemoOrder | null>(null);
  const [removeOrder, setRemoveOrder] = useState<DemoOrder | null>(null);

  // Add Form state
  const [addNumber, setAddNumber] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addPartner, setAddPartner] = useState("");
  const [addPurchaserOrSeller, setAddPurchaserOrSeller] = useState("");
  const [addMaterial, setAddMaterial] = useState("");
  const [addQuantity, setAddQuantity] = useState("1000");
  const [addValue, setAddValue] = useState("10000");
  const [addTransportPrice, setAddTransportPrice] = useState("0");
  const [addCurrency, setAddCurrency] = useState("EUR");
  const [addOrigin, setAddOrigin] = useState("");
  const [addDestination, setAddDestination] = useState("");
  const [addWarehouse, setAddWarehouse] = useState("Bornem");
  const [addPickupDate, setAddPickupDate] = useState("");
  const [addScheduledDate, setAddScheduledDate] = useState("");
  const [addAnnex7, setAddAnnex7] = useState(false);
  const [addNotes, setAddNotes] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Form state
  const [editNumber, setEditNumber] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPartner, setEditPartner] = useState("");
  const [editPurchaserOrSeller, setEditPurchaserOrSeller] = useState("");
  const [editMaterial, setEditMaterial] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editTransportPrice, setEditTransportPrice] = useState("0");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [editOrigin, setEditOrigin] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editWarehouse, setEditWarehouse] = useState("");
  const [editPickupDate, setEditPickupDate] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editAnnex7, setEditAnnex7] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete / Remove Form state
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
  const canManagePoSo = canPerform(identity.role, "create-order");
  const allOrders = visibleOrders(state, actor);
  const activeOrders = useMemo(
    () =>
      allOrders.filter(
        (order) => !order.isRemoved && !(typeof order.notes === "string" && order.notes.includes("[REMOVED]"))
      ),
    [allOrders]
  );

  const poCount = useMemo(
    () =>
      activeOrders.filter((o) => (o.type || (o.number.toUpperCase().startsWith("SO") ? "SO" : "PO")) === "PO").length,
    [activeOrders]
  );
  const soCount = useMemo(
    () =>
      activeOrders.filter((o) => (o.type || (o.number.toUpperCase().startsWith("SO") ? "SO" : "PO")) === "SO").length,
    [activeOrders]
  );

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
    for (const o of activeOrders) if (o.supplier) s.add(o.supplier);
    for (const c of state.directory?.companies || []) if (c.kind === "supplier" && c.name) s.add(c.name);
    return Array.from(s);
  }, [activeOrders, state.directory]);

  const existingCustomers = useMemo(() => {
    const c = new Set<string>();
    for (const o of activeOrders) if (o.customerCompany) c.add(o.customerCompany);
    for (const comp of state.directory?.companies || []) if (comp.kind === "customer" && comp.name) c.add(comp.name);
    return Array.from(c);
  }, [activeOrders, state.directory]);

  const combinedQuery = `${globalQuery} ${localSearch.trim().toLowerCase()}`.trim();

  // Filtered & sorted rows
  const sortedRows = useMemo(() => {
    const filtered = activeOrders.filter((order) => {
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

      // Annex VII filter
      if (annexFilter !== "All") {
        const req = Boolean(order.annex7Required);
        if (annexFilter === "Yes" && !req) return false;
        if (annexFilter === "No" && req) return false;
      }

      // Search query
      if (combinedQuery.length > 0) {
        const haystack = [
          order.number,
          order.title,
          order.supplier,
          order.customerCompany,
          order.purchaserName || "",
          order.sellerName || "",
          order.material,
          order.warehouse,
          order.origin || "",
          order.destination || "",
          order.notes,
        ]
          .join(" ")
          .toLowerCase();
        const terms = combinedQuery.split(/\s+/).filter(Boolean);
        if (!terms.every((term) => haystack.includes(term))) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return (a.createdAt || a.date).localeCompare(b.createdAt || b.date);
        case "date_desc":
          return (b.createdAt || b.date).localeCompare(a.createdAt || a.date);
        case "number_asc":
          return a.number.localeCompare(b.number);
        case "number_desc":
          return b.number.localeCompare(a.number);
        case "value_desc":
          return b.valueEur - a.valueEur;
        case "value_asc":
          return a.valueEur - b.valueEur;
        case "qty_desc":
          return b.quantityKg - a.quantityKg;
        case "partner_asc":
          return (a.supplier || a.customerCompany || "").localeCompare(b.supplier || b.customerCompany || "");
        case "scheduled_asc":
          return (a.scheduledDate || "9999-99-99").localeCompare(b.scheduledDate || "9999-99-99");
        default:
          return 0;
      }
    });
  }, [activeOrders, statusFilter, typeFilter, warehouseFilter, annexFilter, combinedQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  // Handlers for Add Modal
  function handleOpenAddModal(type: "PO" | "SO") {
    const defaultWh = identity.warehouse || "Bornem";
    const today = new Date().toISOString().slice(0, 10);
    setAddModalType(type);
    setAddNumber("");
    setAddTitle("");
    setAddPartner("");
    setAddPurchaserOrSeller(identity.name || "");
    setAddMaterial(type === "PO" ? "Raw Plastic Granulate" : "Finished Polymers");
    setAddQuantity("1000");
    setAddValue("10000");
    setAddTransportPrice("0");
    setAddCurrency("EUR");
    setAddOrigin(type === "PO" ? "Antwerp, Belgium" : defaultWh);
    setAddDestination(type === "PO" ? defaultWh : "Rotterdam, Netherlands");
    setAddWarehouse(defaultWh);
    setAddPickupDate(today);
    setAddScheduledDate(today);
    setAddAnnex7(false);
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
    const parsedTransport = Number(addTransportPrice || 0);

    if (!trimmedPartner) {
      setAddError(`Please enter a ${addModalType === "PO" ? "supplier" : "customer / buyer"} name.`);
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
      setAddError(`${addModalType === "PO" ? "Purchasing" : "Selling"} price must be zero or positive.`);
      return;
    }
    if (!Number.isFinite(parsedTransport) || parsedTransport < 0) {
      setAddError("Transport price must be zero or positive.");
      return;
    }

    // Duplicate check
    if (trimmedNumber) {
      const exists = activeOrders.some(
        (o) => o.number.toLowerCase() === trimmedNumber.toLowerCase()
      );
      if (exists) {
        setAddError(`Order number ${trimmedNumber} already exists in active records.`);
        return;
      }
    }

    const whRecord = (state.directory?.warehouses || []).find(
      (w) => w.name.toLowerCase() === addWarehouse.toLowerCase() || w.id === addWarehouse
    );

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
        purchaserName: addModalType === "PO" ? (addPurchaserOrSeller.trim() || null) : null,
        sellerName: addModalType === "SO" ? (addPurchaserOrSeller.trim() || null) : null,
        material: trimmedMaterial,
        quantityKg: parsedQty,
        valueEur: parsedVal,
        transportPrice: parsedTransport,
        currency: addCurrency,
        origin: addOrigin.trim(),
        destination: addDestination.trim(),
        warehouse: addWarehouse,
        warehouseId: whRecord?.id ?? null,
        pickupDate: addPickupDate || null,
        scheduledDate: addScheduledDate || null,
        annex7Required: addAnnex7,
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
    const isSo = order.type === "SO" || order.number.toUpperCase().startsWith("SO");
    setEditOrder(order);
    setEditNumber(order.number);
    setEditTitle(order.title || "");
    setEditPartner(order.supplier || order.customerCompany || "");
    setEditPurchaserOrSeller(isSo ? (order.sellerName || "") : (order.purchaserName || ""));
    setEditMaterial(order.material === "—" ? "" : order.material);
    setEditQuantity(String(order.quantityKg));
    setEditValue(String(order.valueEur));
    setEditTransportPrice(String(order.transportPrice ?? 0));
    setEditCurrency(order.currency || "EUR");
    setEditOrigin(order.origin || "");
    setEditDestination(order.destination || "");
    setEditWarehouse(order.warehouse === "—" ? "Bornem" : order.warehouse);
    setEditPickupDate(order.pickupDate ? order.pickupDate.slice(0, 10) : "");
    setEditScheduledDate(order.scheduledDate ? order.scheduledDate.slice(0, 10) : "");
    setEditAnnex7(Boolean(order.annex7Required));
    setEditNotes(order.notes || "");
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder || editPending) return;

    const isSo = editOrder.type === "SO" || editOrder.number.toUpperCase().startsWith("SO");
    const trimmedNumber = editNumber.trim();
    const trimmedPartner = editPartner.trim();
    const trimmedMaterial = editMaterial.trim();
    const parsedQty = Number(editQuantity);
    const parsedVal = Number(editValue);
    const parsedTransport = Number(editTransportPrice || 0);

    if (!trimmedNumber) {
      setEditError(`${isSo ? "SO" : "PO"} reference number is required.`);
      return;
    }
    if (trimmedNumber.toLowerCase() !== editOrder.number.toLowerCase()) {
      const collision = activeOrders.find(
        (o) => o.id !== editOrder.id && o.number.toLowerCase() === trimmedNumber.toLowerCase()
      );
      if (collision) {
        setEditError(`Order reference ${trimmedNumber} is already in use by another active order.`);
        return;
      }
    }
    if (!trimmedPartner) {
      setEditError(`${isSo ? "Customer / Buyer" : "Supplier"} name is required.`);
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
      setEditError(`${isSo ? "Selling" : "Purchasing"} price must be zero or positive.`);
      return;
    }
    if (!Number.isFinite(parsedTransport) || parsedTransport < 0) {
      setEditError("Transport price must be zero or positive.");
      return;
    }

    const whRecord = (state.directory?.warehouses || []).find(
      (w) => w.name.toLowerCase() === editWarehouse.toLowerCase() || w.id === editWarehouse
    );

    setEditPending(true);
    setEditError(null);

    try {
      const err = await editPurchase(editOrder.number, {
        id: editOrder.id,
        newNumber: trimmedNumber !== editOrder.number ? trimmedNumber : undefined,
        title: editTitle.trim() || undefined,
        partner: trimmedPartner,
        supplier: !isSo ? trimmedPartner : undefined,
        customer: isSo ? trimmedPartner : undefined,
        purchaserName: !isSo ? (editPurchaserOrSeller.trim() || null) : undefined,
        sellerName: isSo ? (editPurchaserOrSeller.trim() || null) : undefined,
        material: trimmedMaterial,
        quantityKg: parsedQty,
        valueEur: parsedVal,
        transportPrice: parsedTransport,
        currency: editCurrency,
        origin: editOrigin.trim(),
        destination: editDestination.trim(),
        warehouse: editWarehouse,
        warehouseId: whRecord?.id ?? null,
        pickupDate: editPickupDate || null,
        scheduledDate: editScheduledDate || null,
        annex7Required: editAnnex7,
        notes: editNotes.trim(),
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

  // Handlers for Delete / Remove Modal
  function handleOpenRemoveModal(order: DemoOrder) {
    setRemoveOrder(order);
    setRemoveError(null);
  }

  async function handleRemoveSubmit() {
    if (!removeOrder || removePending) return;

    setRemovePending(true);
    setRemoveError(null);

    try {
      const err = deletePurchase
        ? await deletePurchase(removeOrder.id || removeOrder.number)
        : await removePoSoNumber(removeOrder.number);
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
          setRemoveOrder(null);
        } else {
          setRemoveError(err);
        }
      } else {
        setRemoveOrder(null);
      }
    } catch (ex) {
      setRemoveError(ex instanceof Error ? ex.message : "Failed to delete order.");
    } finally {
      setRemovePending(false);
    }
  }

  return (
    <>
      {/* Header with Title and Staff Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title={
            typeFilter === "PO"
              ? "Purchase Orders (PO) Management"
              : typeFilter === "SO"
                ? "Sales Orders (SO) Management"
                : "PO & SO Database Management"
          }
          subtitle={
            isStaff
              ? "Staff commercial & logistics hub · Create, view, edit, and delete Purchase Orders (inbound unloading) and Sales Orders (outbound loading) across all warehouses."
              : "Enterprise purchase orders (inbound unloading) and sales orders (outbound loading) with linked warehouse schedules."
          }
        />

        {canManagePoSo ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenAddModal("PO")}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 transition min-h-[40px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              + Create Purchase Order (PO)
            </button>
            <button
              type="button"
              onClick={() => handleOpenAddModal("SO")}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-800 transition min-h-[40px]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              + Create Sales Order (SO)
            </button>
          </div>
        ) : null}
      </div>

      {/* Dedicated PO / SO / All Management Tabs */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
        <button
          type="button"
          onClick={() => {
            setTypeFilter("All");
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            typeFilter === "All"
              ? "bg-neutral-950 text-white shadow-xs"
              : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <span>All Orders (PO & SO)</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeFilter === "All" ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-700"}`}>
            {activeOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTypeFilter("PO");
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            typeFilter === "PO"
              ? "bg-emerald-700 text-white shadow-xs"
              : "border border-emerald-200 bg-emerald-50/50 text-emerald-900 hover:bg-emerald-100/60"
          }`}
        >
          <span>Purchase Orders (PO · Inbound)</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeFilter === "PO" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"}`}>
            {poCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTypeFilter("SO");
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            typeFilter === "SO"
              ? "bg-sky-700 text-white shadow-xs"
              : "border border-sky-200 bg-sky-50/50 text-sky-900 hover:bg-sky-100/60"
          }`}
        >
          <span>Sales Orders (SO · Outbound)</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeFilter === "SO" ? "bg-white/20 text-white" : "bg-sky-100 text-sky-800"}`}>
            {soCount}
          </span>
        </button>
      </div>

      {notice ? (
        <div className="my-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-medium text-emerald-900">
          {notice}
        </div>
      ) : null}

      {/* Search, Filter & Sort Bar */}
      <Surface className="my-4 p-3.5 space-y-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Input */}
          <div className="sm:col-span-2">
            <label htmlFor="poso-search" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Search PO / SO Records
            </label>
            <input
              id="poso-search"
              type="search"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by PO/SO #, supplier, customer, purchaser/seller, material, origin, destination…"
              className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
            />
          </div>

          {/* Warehouse Filter */}
          <div>
            <label htmlFor="wh-filter" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Warehouse
            </label>
            <select
              id="wh-filter"
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="All">All Warehouses ({activeOrders.length})</option>
              {warehouseOptions.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
          </div>

          {/* Annex VII Filter */}
          <div>
            <label htmlFor="annex-filter" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Annex VII
            </label>
            <select
              id="annex-filter"
              value={annexFilter}
              onChange={(e) => {
                setAnnexFilter(e.target.value as (typeof ANNEX_FILTERS)[number]);
                setCurrentPage(1);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="All">All (Yes & No)</option>
              <option value="Yes">Annex VII Required (Yes)</option>
              <option value="No">No Annex VII</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label htmlFor="sort-order" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Sort By
            </label>
            <select
              id="sort-order"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="date_desc">Date Created (Newest First)</option>
              <option value="date_asc">Date Created (Oldest First)</option>
              <option value="number_asc">Reference Number (A → Z)</option>
              <option value="number_desc">Reference Number (Z → A)</option>
              <option value="value_desc">Order Price (High → Low)</option>
              <option value="value_asc">Order Price (Low → High)</option>
              <option value="qty_desc">Quantity kg (High → Low)</option>
              <option value="partner_asc">Supplier / Customer (A → Z)</option>
              <option value="scheduled_asc">Scheduled Date (Earliest)</option>
            </select>
          </div>
        </div>

        {/* Status Filter Pills & Result Count */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((st) => {
              const count = activeOrders.filter((o) => st === "All" || o.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st);
                    setCurrentPage(1);
                  }}
                  className={`h-7 rounded-full px-2.5 text-[11px] font-medium transition ${
                    statusFilter === st
                      ? "bg-neutral-950 text-white"
                      : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {st} ({count})
                </button>
              );
            })}
          </div>
          <div className="text-xs text-neutral-500">
            Showing <strong>{paginatedRows.length}</strong> of <strong>{sortedRows.length}</strong> orders
          </div>
        </div>
      </Surface>

      {/* Orders List / Table */}
      {sortedRows.length === 0 ? (
        <Surface className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-neutral-900">No matching orders found</p>
          <p className="mt-1 text-xs text-neutral-500">
            {canManagePoSo
              ? "Use '+ Create Purchase Order (PO)' or '+ Create Sales Order (SO)' to create a new database record."
              : "No orders match your filter criteria."}
          </p>
        </Surface>
      ) : (
        <>
          {/* Mobile Card View */}
          <ul className="space-y-2.5 md:hidden">
            {paginatedRows.map((order) => {
              const isSo = order.type === "SO" || order.number.toUpperCase().startsWith("SO");
              const linkedSchedules = order.linkedSchedules || [];
              return (
                <li key={order.id || order.number}>
                  <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isSo ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isSo ? "SO (Loading)" : "PO (Unloading)"}
                          </span>
                          <span className="font-mono text-xs font-bold text-neutral-900">
                            {order.number}
                          </span>
                          {order.annex7Required ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              Annex VII
                            </span>
                          ) : null}
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
                          {isSo && order.sellerName ? ` · Seller: ${order.sellerName}` : ""}
                          {!isSo && order.purchaserName ? ` · Purchaser: ${order.purchaserName}` : ""}
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
                        <span className="text-neutral-400">{isSo ? "Selling:" : "Purchasing:"}</span>{" "}
                        <span className="font-semibold text-neutral-900 font-mono">
                          {formatMoney(order.valueEur, order.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Transport:</span>{" "}
                        <span className="font-mono">
                          {order.transportPrice ? formatMoney(order.transportPrice, order.currency) : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Route:</span>{" "}
                        {order.origin || "—"} &rarr; {order.destination || "—"}
                      </div>
                      <div>
                        <span className="text-neutral-400">Scheduled:</span>{" "}
                        {order.scheduledDate || "Not set"}
                      </div>
                      <div>
                        <span className="text-neutral-400">Schedules:</span>{" "}
                        {linkedSchedules.length > 0 ? `${linkedSchedules.length} linked` : "None"}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-neutral-100 pt-2.5">
                      <Link
                        href={`/purchases/${encodeURIComponent(order.number)}`}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Details & History
                      </Link>
                      {canManagePoSo ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(order)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRemoveModal(order)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop Table View */}
          <Surface className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-neutral-500 bg-neutral-50/70 border-b border-neutral-200">
                <tr>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Type & Reference</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Partner & Contact</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Material & Qty</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Commercial Prices</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Origin / Destination / WH</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Dates & Annex VII</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Linked Schedules</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3.5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {paginatedRows.map((order) => {
                  const isSo = order.type === "SO" || order.number.toUpperCase().startsWith("SO");
                  const linkedSchedules = order.linkedSchedules || [];
                  return (
                    <tr key={order.id || order.number} className="hover:bg-neutral-50/60 transition align-top">
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isSo ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isSo ? "SO" : "PO"}
                          </span>
                          <Link
                            href={`/purchases/${encodeURIComponent(order.number)}`}
                            className="font-mono text-xs font-bold text-neutral-950 hover:underline"
                          >
                            {order.number}
                          </Link>
                        </div>
                        <Link
                          href={`/purchases/${encodeURIComponent(order.number)}`}
                          className="mt-1 block text-xs font-medium text-neutral-700 hover:text-neutral-950 hover:underline line-clamp-1"
                        >
                          {order.title || order.number}
                        </Link>
                      </td>

                      <td className="px-3.5 py-3 text-xs">
                        <div className="font-semibold text-neutral-900">
                          {order.customerCompany || order.supplier || "—"}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {isSo
                            ? `Seller: ${order.sellerName || "—"}`
                            : `Purchaser: ${order.purchaserName || "—"}`}
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-xs">
                        <div className="font-medium text-neutral-900">
                          {order.material === "—" ? "Not recorded" : order.material}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-600 tabular-nums mt-0.5">
                          {order.quantityKg > 0 ? formatKg(order.quantityKg) : "—"}
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-xs whitespace-nowrap">
                        <div className="font-mono font-semibold text-neutral-900 tabular-nums">
                          {isSo ? "Sell: " : "Buy: "}
                          {formatMoney(order.valueEur, order.currency)}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-500 tabular-nums mt-0.5">
                          Transport: {order.transportPrice ? formatMoney(order.transportPrice, order.currency) : formatMoney(0, order.currency)}
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-xs">
                        <div className="font-semibold text-neutral-900">
                          WH: {order.warehouse && order.warehouse !== "—" ? order.warehouse : "Bornem"}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {order.origin || "—"} &rarr; {order.destination || "—"}
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-xs">
                        <div className="text-neutral-800">
                          <span className="text-neutral-500">{isSo ? "Load:" : "Unload:"}</span>{" "}
                          <span className="font-medium">{order.scheduledDate || "—"}</span>
                        </div>
                        {!isSo && order.pickupDate ? (
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Pickup: {order.pickupDate}
                          </div>
                        ) : null}
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              order.annex7Required
                                ? "bg-amber-100 text-amber-900"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            Annex VII: {order.annex7Required ? "Yes" : "No"}
                          </span>
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-xs">
                        {linkedSchedules.length > 0 ? (
                          <div className="space-y-1">
                            {linkedSchedules.slice(0, 2).map((s) => (
                              <Link
                                key={s.id}
                                href={s.type === "loading" ? "/schedules/loading" : "/schedules/unloading"}
                                className="block rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] hover:bg-neutral-100"
                              >
                                <span className="font-mono font-semibold text-neutral-900">{s.scheduleNumber}</span>
                                <span className="ml-1 text-neutral-500">
                                  ({OPERATION_SCHEDULE_STATUS_LABELS[s.status as OperationScheduleStatus] || s.status})
                                </span>
                              </Link>
                            ))}
                            {linkedSchedules.length > 2 ? (
                              <span className="text-[10px] text-neutral-500">
                                +{linkedSchedules.length - 2} more
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-neutral-400">No linked schedules</span>
                        )}
                      </td>

                      <td className="px-3.5 py-3">
                        <StatusPill label={order.status} />
                      </td>

                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/purchases/${encodeURIComponent(order.number)}`}
                            className="rounded px-2.5 py-1 text-xs font-medium text-neutral-700 border border-neutral-200 hover:bg-neutral-100"
                          >
                            View
                          </Link>
                          {canManagePoSo ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(order)}
                                className="rounded px-2.5 py-1 text-xs font-medium text-neutral-800 border border-neutral-300 hover:bg-neutral-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenRemoveModal(order)}
                                className="rounded px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Surface>

          {/* Pagination Footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-700">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-900"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span>
                Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* CREATE PO / SO MODAL */}
      {/* ========================================================================= */}
      {addModalType ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl transition-all my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    addModalType === "PO" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {addModalType === "PO" ? "INBOUND PO" : "OUTBOUND SO"}
                </span>
                <h3 className="text-base font-bold text-neutral-950">
                  {addModalType === "PO"
                    ? "Create New Purchase Order (Inbound / Unloading)"
                    : "Create New Sales Order (Outbound / Loading)"}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Custom Number (Optional) */}
                <div>
                  <label className="block font-semibold text-neutral-700">
                    {addModalType} Reference Number (Auto-generated if blank)
                  </label>
                  <input
                    type="text"
                    value={addNumber}
                    onChange={(e) => setAddNumber(e.target.value)}
                    placeholder={`Next sequential ${addModalType}-${new Date().getFullYear()}-XXXX`}
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>

                {/* Order Title */}
                <div>
                  <label className="block font-semibold text-neutral-700">Order Title / Summary</label>
                  <input
                    type="text"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder={
                      addModalType === "PO"
                        ? "e.g. Q4 Polymer Inbound - Supplier Antwerp"
                        : "e.g. Q4 Polymer Dispatch - Customer Rotterdam"
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>

                {/* Partner (Supplier / Customer) */}
                <div>
                  <label className="block font-semibold text-neutral-700">
                    {addModalType === "PO" ? "Supplier Company" : "Customer / Buyer Company"}{" "}
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

                {/* Purchaser Name / Seller Name */}
                <div>
                  <label className="block font-semibold text-neutral-700">
                    {addModalType === "PO" ? "Purchaser Name" : "Seller Name"}
                  </label>
                  <input
                    type="text"
                    value={addPurchaserOrSeller}
                    onChange={(e) => setAddPurchaserOrSeller(e.target.value)}
                    placeholder={addModalType === "PO" ? "Enter purchaser representative…" : "Enter seller representative…"}
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Material & Quantity */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Material Type / Specification <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addMaterial}
                    onChange={(e) => setAddMaterial(e.target.value)}
                    placeholder="e.g. LDPE Regrind Film Grade A"
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Expected Quantity (kg) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Commercial Prices & Currency */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-neutral-700">
                    {addModalType === "PO" ? "Purchasing Price" : "Selling Price"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    required
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">Transport Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addTransportPrice}
                    onChange={(e) => setAddTransportPrice(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
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

              {/* Origin, Destination & Warehouse */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-neutral-700">Origin</label>
                  <input
                    type="text"
                    value={addOrigin}
                    onChange={(e) => setAddOrigin(e.target.value)}
                    placeholder="Origin city / country"
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">Destination</label>
                  <input
                    type="text"
                    value={addDestination}
                    onChange={(e) => setAddDestination(e.target.value)}
                    placeholder="Destination city / country"
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">
                    Warehouse <span className="text-red-500">*</span>
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
              </div>

              {/* Dates & Annex VII */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-neutral-700">Pickup Date</label>
                  <input
                    type="date"
                    value={addPickupDate}
                    onChange={(e) => setAddPickupDate(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">
                    {addModalType === "PO" ? "Scheduled Unloading Date" : "Scheduled Loading Date"}
                  </label>
                  <input
                    type="date"
                    value={addScheduledDate}
                    onChange={(e) => setAddScheduledDate(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700">Annex VII Required?</label>
                  <select
                    value={addAnnex7 ? "yes" : "no"}
                    onChange={(e) => setAddAnnex7(e.target.value === "yes")}
                    className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes — Annex VII Required</option>
                  </select>
                </div>
              </div>

              {/* Operational Notes */}
              <div>
                <label className="block font-semibold text-neutral-700">Operational Notes</label>
                <input
                  type="text"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  placeholder="Special instructions, container specs, customs notes…"
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
                  {addPending
                    ? "Saving to Database…"
                    : addModalType === "PO"
                      ? "Create Purchase Order"
                      : "Create Sales Order"}
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
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl transition-all my-auto max-h-[92vh] overflow-y-auto">
            {(() => {
              const isSo = editOrder.type === "SO" || editOrder.number.toUpperCase().startsWith("SO");
              const linkedSchedules = editOrder.linkedSchedules || [];
              return (
                <>
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            isSo ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isSo ? "EDIT SALES ORDER (SO)" : "EDIT PURCHASE ORDER (PO)"}
                        </span>
                        <h3 className="text-base font-bold text-neutral-950">
                          {editOrder.number}
                        </h3>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Update commercial, logistics, dates, Annex VII, and reference details in the database.
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

                  {/* Warning if linked to existing schedules */}
                  {linkedSchedules.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 leading-relaxed">
                      <p className="font-bold">
                        ⚠️ Linked to {linkedSchedules.length} Warehouse Schedule{linkedSchedules.length > 1 ? "s" : ""}:{" "}
                        {linkedSchedules.map((s) => `${s.scheduleNumber} (${s.status})`).join(", ")}
                      </p>
                      <p className="mt-1">
                        Changes to this {isSo ? "Sales Order" : "Purchase Order"} will automatically synchronize with active linked schedules while strictly preserving historical data on completed operations.
                      </p>
                    </div>
                  ) : null}

                  {editError ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
                      {editError}
                    </div>
                  ) : null}

                  <form onSubmit={(e) => void handleEditSubmit(e)} className="mt-4 space-y-3.5 text-xs">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-semibold text-neutral-700">
                          {isSo ? "SO Reference Number" : "PO Reference Number"}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                          required
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>

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
                        <label className="block font-semibold text-neutral-700">
                          {isSo ? "Customer / Buyer Company" : "Supplier Company"}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editPartner}
                          onChange={(e) => setEditPartner(e.target.value)}
                          required
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-neutral-700">
                          {isSo ? "Seller Name" : "Purchaser Name"}
                        </label>
                        <input
                          type="text"
                          value={editPurchaserOrSeller}
                          onChange={(e) => setEditPurchaserOrSeller(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block font-semibold text-neutral-700">
                          Material <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editMaterial}
                          onChange={(e) => setEditMaterial(e.target.value)}
                          required
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-neutral-700">
                          Quantity (kg) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          required
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block font-semibold text-neutral-700">
                          {isSo ? "Selling Price" : "Purchasing Price"}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          required
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-neutral-700">Transport Price</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editTransportPrice}
                          onChange={(e) => setEditTransportPrice(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 font-mono focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-neutral-700">Currency</label>
                        <div className="mt-1">
                          <CurrencySelect value={editCurrency} onChange={setEditCurrency} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block font-semibold text-neutral-700">Origin</label>
                        <input
                          type="text"
                          value={editOrigin}
                          onChange={(e) => setEditOrigin(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-neutral-700">Destination</label>
                        <input
                          type="text"
                          value={editDestination}
                          onChange={(e) => setEditDestination(e.target.value)}
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
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block font-semibold text-neutral-700">Pickup Date</label>
                        <input
                          type="date"
                          value={editPickupDate}
                          onChange={(e) => setEditPickupDate(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-neutral-700">
                          {isSo ? "Scheduled Loading Date" : "Scheduled Unloading Date"}
                        </label>
                        <input
                          type="date"
                          value={editScheduledDate}
                          onChange={(e) => setEditScheduledDate(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-neutral-700">Annex VII Required?</label>
                        <select
                          value={editAnnex7 ? "yes" : "no"}
                          onChange={(e) => setEditAnnex7(e.target.value === "yes")}
                          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-xs text-neutral-900 focus:border-neutral-950 focus:outline-hidden"
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes — Annex VII Required</option>
                        </select>
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
                        {editPending ? "Saving Changes…" : "Save Changes"}
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* DELETE PO / SO CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {removeOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transition-all">
            {(() => {
              const isSo = removeOrder.type === "SO" || removeOrder.number.toUpperCase().startsWith("SO");
              const linkedSchedules = removeOrder.linkedSchedules || [];
              return (
                <>
                  <div className="flex items-center gap-3 text-red-600">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                    <h3 className="text-base font-bold text-neutral-900">
                      Delete {isSo ? "Sales Order" : "Purchase Order"} {removeOrder.number}?
                    </h3>
                  </div>

                  <p className="mt-3 text-xs text-neutral-600 leading-relaxed">
                    Are you sure you want to delete{" "}
                    <strong className="text-neutral-900">{removeOrder.number}</strong> (
                    {removeOrder.title || removeOrder.supplier || removeOrder.customerCompany})?
                  </p>

                  {linkedSchedules.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                      <p className="font-bold">
                        ⚠️ Warning: Linked to {linkedSchedules.length} Existing Schedule{linkedSchedules.length > 1 ? "s" : ""}
                      </p>
                      <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
                        {linkedSchedules.map((s) => (
                          <li key={s.id}>
                            <span className="font-mono font-semibold">{s.scheduleNumber}</span> ·{" "}
                            {OPERATION_SCHEDULE_STATUS_LABELS[s.status as OperationScheduleStatus] || s.status} ·{" "}
                            {s.scheduledDate}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5">
                        To protect data integrity, deleting this order will archive it from active PO/SO lists while <strong>strictly preserving</strong> linked schedule operations and historical records.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
                      <p className="font-semibold text-neutral-900">Database & Audit Integrity:</p>
                      <p className="mt-1">
                        Deleting this {isSo ? "SO" : "PO"} removes it from active operations and records the deletion in the audit trail while preserving any historical warehouse records.
                      </p>
                    </div>
                  )}

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
                      {removePending ? "Deleting…" : `Confirm Delete ${isSo ? "SO" : "PO"}`}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </>
  );
}
