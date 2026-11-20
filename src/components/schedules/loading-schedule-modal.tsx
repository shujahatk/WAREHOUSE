"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  ATTACHMENT_KIND_LABELS,
  formatKg,
  roundKg,
  summarizeScheduleMaterials,
  type OperationScheduleAttachmentKind,
  type OperationScheduleView,
} from "@/domain/view";

type MaterialEntry = {
  id: string;
  materialName: string;
  packagingTypeId: string;
  packagingTypeName: string;
  packageCount: number;
  tarePerPackageKg: number;
  grossWeightKg: number;
  netWeightKg: number;
};

type PendingAttachment = {
  id: string;
  name: string;
  kind: OperationScheduleAttachmentKind;
  mime: string;
  size: number;
  url: string;
};

const LOADING_ATTACHMENT_CATEGORIES: { kind: OperationScheduleAttachmentKind; label: string }[] = [
  { kind: "before_loading_photo", label: "Photographs Before Loading" },
  { kind: "during_loading_photo", label: "Photographs During Loading" },
  { kind: "loaded_vehicle_photo", label: "Photographs of Loaded Vehicle" },
  { kind: "weighbridge_ticket", label: "Weighbridge Tickets" },
  { kind: "cmr_document", label: "CMR Documents" },
  { kind: "annex_vii", label: "Annex VII Documents" },
  { kind: "other", label: "Other Supporting Documents" },
];

const PACKAGING_PRESETS = [
  { label: "Big Bag", tareKg: 2.5 },
  { label: "Standard Pallet", tareKg: 25 },
  { label: "Octabin", tareKg: 18 },
  { label: "Steel Drum", tareKg: 15 },
  { label: "Plastic Drum", tareKg: 8.5 },
  { label: "IBC Tote", tareKg: 60 },
  { label: "Bale", tareKg: 1.5 },
  { label: "Box / Carton", tareKg: 2 },
  { label: "Loose / Bulk", tareKg: 0 },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialSchedule?: OperationScheduleView | null;
};

export function LoadingScheduleModal({ isOpen, onClose, onCreated, initialSchedule }: Props) {
  if (!isOpen) return null;
  return (
    <LoadingScheduleModalContent
      key={initialSchedule?.id || "new-loading"}
      onClose={onClose}
      onCreated={onCreated}
      initialSchedule={initialSchedule}
    />
  );
}

function LoadingScheduleModalContent({
  onClose,
  onCreated,
  initialSchedule,
}: {
  onClose: () => void;
  onCreated?: () => void;
  initialSchedule?: OperationScheduleView | null;
}) {
  const { state, createOperationSchedule, updateOperationSchedule, uploadScheduleAttachment } = useDemo();
  const isEditing = Boolean(initialSchedule);

  // Sales Orders for linking (Outbound / Loading only links to active Sales Orders)
  const salesOrders = useMemo(
    () =>
      (state.orders || []).filter(
        (o) => !o.isRemoved && (o.type === "SO" || o.number.toUpperCase().startsWith("SO-"))
      ),
    [state.orders]
  );

  // Customers from directory
  const customers = useMemo(
    () => (state.directory?.companies || []).filter((c) => c.kind === "customer"),
    [state.directory]
  );

  // Known materials from stock & orders
  const knownMaterials = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.stock || []) if (s.material) set.add(s.material);
    for (const o of state.orders || []) if (o.material) set.add(o.material);
    return Array.from(set).sort();
  }, [state.stock, state.orders]);

  // Packaging choices
  const packagingChoices = useMemo(() => {
    const list: { id: string; label: string; tareKg: number }[] = [];
    const seen = new Set<string>();
    for (const p of state.packaging || []) {
      list.push({ id: p.id, label: p.label, tareKg: p.tareKg ?? 0 });
      seen.add(p.label.toLowerCase());
    }
    for (const preset of PACKAGING_PRESETS) {
      if (!seen.has(preset.label.toLowerCase())) {
        list.push({ id: preset.label, label: preset.label, tareKg: preset.tareKg });
      }
    }
    return list;
  }, [state.packaging]);

  // A. Sales & Customer Details State
  const [selectedOrderId, setSelectedOrderId] = useState(initialSchedule?.purchaseOrderId || "");
  const [soNumber, setSoNumber] = useState(initialSchedule?.poSoNumber || "");
  const [customer, setCustomer] = useState(initialSchedule?.partnerName || "");
  const [sellerName, setSellerName] = useState(initialSchedule?.sellerName || "");
  const [sellingPrice, setSellingPrice] = useState(
    initialSchedule?.sellingPrice ? String(initialSchedule.sellingPrice) : ""
  );
  const [currency, setCurrency] = useState(initialSchedule?.currency || "EUR");
  const [warehouseId, setWarehouseId] = useState(
    initialSchedule?.warehouseId || state.directory.warehouses[0]?.id || ""
  );
  const [origin, setOrigin] = useState(
    initialSchedule?.origin && initialSchedule.origin !== "—"
      ? initialSchedule.origin
      : state.directory.warehouses[0]?.name || ""
  );
  const [destination, setDestination] = useState(
    initialSchedule?.destination && initialSchedule.destination !== "—" ? initialSchedule.destination : ""
  );
  const [annex7Required, setAnnex7Required] = useState(initialSchedule?.annex7Required ?? false);
  const [transportPrice, setTransportPrice] = useState(
    initialSchedule?.transportPrice ? String(initialSchedule.transportPrice) : ""
  );
  const [scheduledDate, setScheduledDate] = useState(
    initialSchedule?.scheduledDate
      ? initialSchedule.scheduledDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [assignedWorkerId, setAssignedWorkerId] = useState(initialSchedule?.assignedWorkerId || "");

  // C. Loading & Dispatch Information State
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState(
    initialSchedule?.vehicleRegistrationNumber || ""
  );
  const [transportCompany, setTransportCompany] = useState(initialSchedule?.transportCompany || "");
  const [driverName, setDriverName] = useState(initialSchedule?.driverName || "");
  const [driverContactNumber, setDriverContactNumber] = useState(
    initialSchedule?.driverContactNumber || ""
  );
  const [actualArrivalTime, setActualArrivalTime] = useState(
    initialSchedule?.actualArrivalTime ? initialSchedule.actualArrivalTime.slice(0, 16) : ""
  );
  const [actualStartTime, setActualStartTime] = useState(
    initialSchedule?.actualStartTime ? initialSchedule.actualStartTime.slice(0, 16) : ""
  );
  const [actualEndTime, setActualEndTime] = useState(
    initialSchedule?.actualEndTime ? initialSchedule.actualEndTime.slice(0, 16) : ""
  );
  const [cmrNumber, setCmrNumber] = useState(initialSchedule?.cmrNumber || "");

  // D. Attachments & Remarks State
  const [instructions, setInstructions] = useState(initialSchedule?.instructions || "");
  const [operationalRemarks, setOperationalRemarks] = useState(initialSchedule?.workerRemarks || "");
  const [selectedAttachmentKind, setSelectedAttachmentKind] =
    useState<OperationScheduleAttachmentKind>("before_loading_photo");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active warehouse workers
  const activeWorkers = (state.accounts || []).filter(
    (u) => u.role === "worker" && u.status === "Active"
  );

  // B. Material entries
  const [items, setItems] = useState<MaterialEntry[]>(() => {
    if (initialSchedule && initialSchedule.items.length > 0) {
      return initialSchedule.items.map((it) => ({
        id: it.id,
        materialName: it.materialName,
        packagingTypeId: it.packagingTypeId,
        packagingTypeName: it.packagingTypeName,
        packageCount: it.packageCount,
        tarePerPackageKg: it.tarePerPackageKg,
        grossWeightKg: it.grossWeightKg,
        netWeightKg: it.netWeightKg,
      }));
    }
    const defaultPkg = packagingChoices[0];
    return [
      {
        id: "row-1",
        materialName: "",
        packagingTypeId: defaultPkg?.id || "Big Bag",
        packagingTypeName: defaultPkg?.label || "Big Bag",
        packageCount: 1,
        tarePerPackageKg: defaultPkg?.tareKg ?? 2.5,
        grossWeightKg: 0,
        netWeightKg: 0,
      },
    ];
  });

  // Handle selecting an existing SO from dropdown
  const handleSelectExistingSo = (selectedSoNum: string) => {
    setSoNumber(selectedSoNum);
    const matched = salesOrders.find((o) => o.number.toUpperCase() === selectedSoNum.toUpperCase());
    if (matched) {
      setSelectedOrderId(matched.id || "");
      if (matched.customerCompany || matched.supplier) setCustomer(matched.customerCompany || matched.supplier);
      if (matched.sellerName) setSellerName(matched.sellerName);
      if (matched.valueEur !== undefined) setSellingPrice(String(matched.valueEur));
      if (matched.transportPrice !== undefined && matched.transportPrice > 0) {
        setTransportPrice(String(matched.transportPrice));
      }
      if (matched.currency) setCurrency(matched.currency);
      if (matched.origin) setOrigin(matched.origin);
      if (matched.destination) setDestination(matched.destination);
      if (matched.scheduledDate) setScheduledDate(matched.scheduledDate.slice(0, 10));
      if (matched.annex7Required !== undefined) setAnnex7Required(Boolean(matched.annex7Required));
      if (matched.warehouseId) {
        setWarehouseId(matched.warehouseId);
      } else if (matched.warehouse && matched.warehouse !== "—") {
        const wh = state.directory.warehouses.find(
          (w) => w.name.toLowerCase() === matched.warehouse.toLowerCase()
        );
        if (wh) {
          setWarehouseId(wh.id);
          if (!matched.origin) setOrigin(wh.name);
        }
      }
      if (matched.material && matched.material !== "—" && items.length === 1 && !items[0].materialName) {
        updateItem(items[0].id, {
          materialName: matched.material,
          grossWeightKg:
            matched.quantityKg > 0
              ? matched.quantityKg + items[0].packageCount * items[0].tarePerPackageKg
              : 0,
        });
      }
    } else {
      setSelectedOrderId("");
    }
  };

  const addMaterialRow = () => {
    const pkg = packagingChoices[0];
    setItems((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length + 1}`,
        materialName: "",
        packagingTypeId: pkg?.id || "Big Bag",
        packagingTypeName: pkg?.label || "Big Bag",
        packageCount: 1,
        tarePerPackageKg: pkg?.tareKg ?? 2.5,
        grossWeightKg: 0,
        netWeightKg: 0,
      },
    ]);
  };

  const removeMaterialRow = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  const updateItem = (id: string, patch: Partial<MaterialEntry>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...patch };

        // Recalculate net weight: Gross - (Count * Tare)
        const gross = Number(updated.grossWeightKg) || 0;
        const count = Math.max(1, Math.round(Number(updated.packageCount) || 1));
        const tare = Number(updated.tarePerPackageKg) >= 0 ? Number(updated.tarePerPackageKg) : 0;
        const totalTare = roundKg(count * tare);
        const net = Math.max(0, roundKg(gross - totalTare));

        return {
          ...updated,
          packageCount: count,
          tarePerPackageKg: tare,
          grossWeightKg: gross,
          netWeightKg: net,
        };
      })
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        if (isEditing && initialSchedule) {
          await uploadScheduleAttachment({
            scheduleId: initialSchedule.id,
            name: file.name,
            kind: selectedAttachmentKind,
            mime: file.type || "application/octet-stream",
            size: file.size,
            url: dataUrl,
          });
        } else {
          setPendingAttachments((prev) => [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              kind: selectedAttachmentKind,
              mime: file.type || "application/octet-stream",
              size: file.size,
              url: dataUrl,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // E. Loading calculations & material-wise summary
  const totalGrossWeight = roundKg(items.reduce((sum, i) => sum + (Number(i.grossWeightKg) || 0), 0));
  const totalTareWeight = roundKg(
    items.reduce((sum, i) => sum + i.packageCount * (Number(i.tarePerPackageKg) || 0), 0)
  );
  const totalNetWeight = roundKg(items.reduce((sum, i) => sum + (Number(i.netWeightKg) || 0), 0));
  const totalPackages = items.reduce((sum, i) => sum + (Number(i.packageCount) || 0), 0);
  const materialWiseSummary = useMemo(() => summarizeScheduleMaterials(items), [items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!soNumber.trim()) {
      setErrorMessage("Please enter or select an SO Number.");
      return;
    }
    if (!customer.trim()) {
      setErrorMessage("Please enter the Customer / Buyer name.");
      return;
    }
    if (!warehouseId) {
      setErrorMessage("Please select an Origin Warehouse.");
      return;
    }
    if (!assignedWorkerId) {
      setErrorMessage("Please assign an active warehouse worker.");
      return;
    }
    if (!scheduledDate) {
      setErrorMessage("Please select a scheduled loading date.");
      return;
    }

    for (const item of items) {
      if (!item.materialName.trim()) {
        setErrorMessage("Please specify the Material Type for all entries.");
        return;
      }
      if (item.grossWeightKg <= 0) {
        setErrorMessage(`Gross weight must be greater than zero for ${item.materialName}.`);
        return;
      }
      if (item.netWeightKg <= 0) {
        setErrorMessage(
          `Net weight must be greater than zero for ${item.materialName}. Gross weight must exceed packaging tare.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: initialSchedule?.id,
        type: "loading",
        purchaseOrderId: selectedOrderId || initialSchedule?.purchaseOrderId || undefined,
        poSoNumber: soNumber.trim().toUpperCase(),
        partnerName: customer.trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        annex7Required,
        transportPrice: Number(transportPrice) || 0,
        currency,
        sellerName: sellerName.trim() || null,
        sellingPrice: Number(sellingPrice) || 0,
        scheduledDate,
        warehouseId,
        assignedWorkerId,
        vehicleRegistrationNumber: vehicleRegistrationNumber.trim(),
        transportCompany: transportCompany.trim(),
        driverName: driverName.trim(),
        driverContactNumber: driverContactNumber.trim(),
        cmrNumber: cmrNumber.trim(),
        actualArrivalTime: actualArrivalTime ? new Date(actualArrivalTime).toISOString() : null,
        actualStartTime: actualStartTime ? new Date(actualStartTime).toISOString() : null,
        actualEndTime: actualEndTime ? new Date(actualEndTime).toISOString() : null,
        instructions: instructions.trim(),
        workerRemarks: operationalRemarks.trim(),
        items: items.map((i) => ({
          materialName: i.materialName.trim(),
          packagingTypeId: i.packagingTypeId,
          packagingTypeName: i.packagingTypeName,
          packageCount: i.packageCount,
          tarePerPackageKg: i.tarePerPackageKg,
          grossWeightKg: i.grossWeightKg,
          netWeightKg: i.netWeightKg,
        })),
        attachments: pendingAttachments.map((a) => ({
          name: a.name,
          kind: a.kind,
          mime: a.mime,
          size: a.size,
          url: a.url,
        })),
      };

      const err = isEditing
        ? await updateOperationSchedule(payload)
        : await createOperationSchedule(payload);

      if (err) {
        setErrorMessage(err);
      } else {
        onCreated?.();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-900/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-neutral-200 overflow-hidden my-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                OUTBOUND / SALES
              </span>
              <h2 className="text-lg font-bold text-neutral-900">
                {isEditing ? `Edit Loading Schedule (${initialSchedule?.scheduleNumber})` : "Loading Schedule Form"}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              Complete outbound sales order details, material weights, vehicle &amp; dispatch info, attachments, and assign a warehouse worker.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {errorMessage ? (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm font-medium text-rose-700">
              ⚠️ {errorMessage}
            </div>
          ) : null}

          {/* Datalists */}
          <datalist id="lod-so-list">
            {salesOrders.map((so) => (
              <option key={so.number} value={so.number}>
                {so.supplier} — {so.material}
              </option>
            ))}
          </datalist>
          <datalist id="lod-customer-list">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <datalist id="lod-material-list">
            {knownMaterials.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          {/* SECTION A: Sales and Customer Details */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 mb-3 border-b border-neutral-200 pb-2">
              A. Sales &amp; Customer Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* SO Number (linked to existing Sales Orders) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  SO Number (Link Existing or New) <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    list="lod-so-list"
                    placeholder="e.g. SO-2026-0042"
                    value={soNumber}
                    onChange={(e) => handleSelectExistingSo(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 uppercase focus:border-emerald-600 focus:outline-none"
                  />
                  {salesOrders.length > 0 ? (
                    <select
                      aria-label="Select existing SO"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleSelectExistingSo(e.target.value);
                      }}
                      className="w-28 rounded-lg border border-neutral-300 bg-neutral-100 px-2 py-2 text-xs font-semibold text-neutral-700 focus:border-emerald-600 focus:outline-none"
                    >
                      <option value="">Link SO...</option>
                      {salesOrders.map((so) => (
                        <option key={so.number} value={so.number}>
                          {so.number}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>

              {/* Customer / Buyer */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Customer / Buyer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="lod-customer-list"
                  placeholder="e.g. Apex Polymers Ltd"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Seller Name */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Seller Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Trader Name"
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Selling Price & Currency */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Selling Price
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <div className="w-28 shrink-0">
                    <CurrencySelect value={currency} onChange={setCurrency} />
                  </div>
                </div>
              </div>

              {/* Transport Price */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Transport Price ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={transportPrice}
                  onChange={(e) => setTransportPrice(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Annex VII (Yes / No) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Annex VII (Yes / No)
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-300 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setAnnex7Required(true)}
                    className={`rounded-md py-1.5 text-xs font-bold transition ${annex7Required
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "text-neutral-600 hover:bg-neutral-100"
                      }`}
                  >
                    Yes (Required)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnex7Required(false)}
                    className={`rounded-md py-1.5 text-xs font-bold transition ${!annex7Required
                      ? "bg-neutral-800 text-white shadow-2xs"
                      : "text-neutral-600 hover:bg-neutral-100"
                      }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Origin Warehouse */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Origin Warehouse <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={warehouseId}
                  onChange={(e) => {
                    const newWhId = e.target.value;
                    setWarehouseId(newWhId);
                    const wh = state.directory.warehouses.find((w) => w.id === newWhId);
                    if (wh) setOrigin(wh.name);
                  }}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                >
                  {state.directory.warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.country})
                    </option>
                  ))}
                </select>
              </div>

              {/* Origin Location / Loading Bay */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Origin Location / Loading Dock
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bornem Depot Dock B"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Destination
                </label>
                <input
                  type="text"
                  placeholder="e.g. Customer Plant, Eindhoven NL"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Scheduled Loading Date */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Scheduled Loading Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Assigned Worker */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Assigned Worker <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={assignedWorkerId}
                  onChange={(e) => setAssignedWorkerId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-600 focus:outline-none"
                >
                  <option value="">Select active worker...</option>
                  {activeWorkers.map((w) => (
                    <option key={w.id || w.email} value={w.id || w.name}>
                      {w.name} ({w.warehouse || "Warehouse"})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION B: Material Details (Multiple Material Entries) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-neutral-200 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                  B. Material Details ({items.length} {items.length === 1 ? "Entry" : "Entries"})
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Specify materials to load. Assigned Worker records &amp; verifies actual loaded weights.
                </p>
              </div>
              <button
                type="button"
                onClick={addMaterialRow}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition-colors"
              >
                + Add Another Material
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5">Material Type *</th>
                    <th className="px-3 py-2.5">Packaging Type</th>
                    <th className="px-3 py-2.5 w-28">Number of Packages</th>
                    <th className="px-3 py-2.5 w-32">Packaging Tare Weight (kg)</th>
                    <th className="px-3 py-2.5 w-32">Gross Weight (kg) *</th>
                    <th className="px-3 py-2.5 w-32">Net Weight (kg)</th>
                    <th className="px-2 py-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {items.map((row) => (
                    <tr key={row.id}>
                      {/* Material Type */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          required
                          list="lod-material-list"
                          placeholder="e.g. HDPE Regrind Flakes"
                          value={row.materialName}
                          onChange={(e) => updateItem(row.id, { materialName: e.target.value })}
                          className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </td>

                      {/* Packaging Type */}
                      <td className="px-3 py-2">
                        <select
                          value={row.packagingTypeId}
                          onChange={(e) => {
                            const pId = e.target.value;
                            const pkg = packagingChoices.find((p) => p.id === pId);
                            updateItem(row.id, {
                              packagingTypeId: pId,
                              packagingTypeName: pkg?.label || pId,
                              tarePerPackageKg: pkg?.tareKg ?? 0,
                            });
                          }}
                          className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                        >
                          {packagingChoices.map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.label} ({pkg.tareKg} kg)
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Number of Packages */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          required
                          value={row.packageCount}
                          onChange={(e) =>
                            updateItem(row.id, { packageCount: Math.max(1, parseInt(e.target.value, 10) || 1) })
                          }
                          className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </td>

                      {/* Packaging Tare Weight (kg) */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.tarePerPackageKg}
                          onChange={(e) =>
                            updateItem(row.id, { tarePerPackageKg: Math.max(0, parseFloat(e.target.value) || 0) })
                          }
                          className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </td>

                      {/* Gross Weight (kg) */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          required
                          placeholder="0.0"
                          value={row.grossWeightKg || ""}
                          onChange={(e) =>
                            updateItem(row.id, { grossWeightKg: Math.max(0, parseFloat(e.target.value) || 0) })
                          }
                          className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </td>

                      {/* Net Weight (kg) */}
                      <td className="px-3 py-2 font-bold text-emerald-900 tabular-nums bg-emerald-50/40">
                        {formatKg(row.netWeightKg)}
                      </td>

                      {/* Remove row */}
                      <td className="px-2 py-2 text-center">
                        {items.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeMaterialRow(row.id)}
                            className="text-neutral-400 hover:text-rose-600 font-bold"
                            title="Remove material row"
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION C: Loading and Dispatch Information */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800 mb-3 border-b border-neutral-200 pb-2">
              C. Loading &amp; Dispatch Information (Vehicle, Driver, Timestamps &amp; CMR)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Vehicle Registration Number */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Vehicle Registration Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1-ABC-987 / NL-44-XY"
                  value={vehicleRegistrationNumber}
                  onChange={(e) => setVehicleRegistrationNumber(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 uppercase focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Transport Company */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Transport Company
                </label>
                <input
                  type="text"
                  placeholder="e.g. Van Derksen Logistics"
                  value={transportCompany}
                  onChange={(e) => setTransportCompany(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Driver Name */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Driver Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Marc Peeters"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Driver Contact Number */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Driver Contact Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +32 470 12 34 56"
                  value={driverContactNumber}
                  onChange={(e) => setDriverContactNumber(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Actual Arrival Time */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Actual Arrival Time
                </label>
                <input
                  type="datetime-local"
                  value={actualArrivalTime}
                  onChange={(e) => setActualArrivalTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Actual Loading Start Time */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Actual Loading Start Time
                </label>
                <input
                  type="datetime-local"
                  value={actualStartTime}
                  onChange={(e) => setActualStartTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Actual Loading Completion Time */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Actual Loading Completion Time
                </label>
                <input
                  type="datetime-local"
                  value={actualEndTime}
                  onChange={(e) => setActualEndTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* CMR Number / Reference */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  CMR Number / Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. CMR-2026-88412"
                  value={cmrNumber}
                  onChange={(e) => setCmrNumber(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 uppercase focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION D: Loading Attachments & Operational Remarks */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                  D. Loading Attachments &amp; Operational Remarks
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Attach photos before/during/after loading, weighbridge tickets, CMR documents, or Annex VII forms.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedAttachmentKind}
                  onChange={(e) => setSelectedAttachmentKind(e.target.value as OperationScheduleAttachmentKind)}
                  className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 focus:border-emerald-600 focus:outline-none"
                >
                  {LOADING_ATTACHMENT_CATEGORIES.map((cat) => (
                    <option key={cat.kind} value={cat.kind}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800">
                  <span>+ Upload Photo / PDF</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Category Checklist Pills */}
            <div className="flex flex-wrap gap-1.5">
              {LOADING_ATTACHMENT_CATEGORIES.map((cat) => {
                const count =
                  pendingAttachments.filter((a) => a.kind === cat.kind).length +
                  (initialSchedule?.attachments.filter((a) => a.kind === cat.kind).length || 0);
                return (
                  <button
                    key={cat.kind}
                    type="button"
                    onClick={() => setSelectedAttachmentKind(cat.kind)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition ${selectedAttachmentKind === cat.kind
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                      : count > 0
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-neutral-200 bg-white text-neutral-600"
                      }`}
                  >
                    {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Uploaded Files List */}
            {(pendingAttachments.length > 0 || (initialSchedule && initialSchedule.attachments.length > 0)) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(initialSchedule?.attachments || []).map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-800 truncate">{att.name}</p>
                      <p className="text-[10px] text-neutral-500">
                        {ATTACHMENT_KIND_LABELS[att.kind] || att.kind}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 ml-2">Saved</span>
                  </div>
                ))}
                {pendingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-800 truncate">{att.name}</p>
                      <p className="text-[10px] text-emerald-700">
                        {ATTACHMENT_KIND_LABELS[att.kind] || att.kind}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(att.id)}
                      className="text-rose-600 hover:text-rose-800 font-bold ml-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Instructions for Assigned Worker
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Photograph empty trailer before loading. Ensure straps and corner protectors are fitted."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Operational Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Record any loading notes, seal number, or dispatch observations..."
                  value={operationalRemarks}
                  onChange={(e) => setOperationalRemarks(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION E: Loading Calculations & Material-Wise Weight Summary */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-950 border-b border-emerald-200 pb-2">
              E. Loading Calculations &amp; Material-Wise Weight Summary
            </h3>

            {/* 4 Key Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <span className="text-[11px] font-semibold text-neutral-500 block">Total Package Quantity</span>
                <span className="text-lg font-bold text-neutral-900">{totalPackages}</span>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <span className="text-[11px] font-semibold text-neutral-500 block">Total Gross Weight</span>
                <span className="text-lg font-bold text-neutral-900">{formatKg(totalGrossWeight)}</span>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <span className="text-[11px] font-semibold text-neutral-500 block">Total Packaging Tare Weight</span>
                <span className="text-lg font-bold text-neutral-700">{formatKg(totalTareWeight)}</span>
              </div>
              <div className="rounded-lg border border-emerald-300 bg-emerald-100/70 p-3">
                <span className="text-[11px] font-bold text-emerald-800 block">Total Net Weight</span>
                <span className="text-lg font-bold text-emerald-950">{formatKg(totalNetWeight)}</span>
              </div>
            </div>

            {/* Material-wise weight summary table */}
            {materialWiseSummary.length > 0 && (
              <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                <div className="bg-neutral-50 px-3 py-1.5 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                  Material-Wise Weight Summary
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-100 text-neutral-500">
                    <tr>
                      <th className="px-3 py-1.5">Material Type</th>
                      <th className="px-3 py-1.5 text-right">Packages</th>
                      <th className="px-3 py-1.5 text-right">Gross Weight</th>
                      <th className="px-3 py-1.5 text-right">Tare Weight</th>
                      <th className="px-3 py-1.5 text-right">Net Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {materialWiseSummary.map((m) => (
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

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving Schedule..."
                : isEditing
                  ? "Save Loading Schedule Changes"
                  : "Create Loading Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
