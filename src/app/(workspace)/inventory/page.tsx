"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatKg, stockStatus, visibleStock } from "@/domain/view";
import { canPerform } from "@/lib/permissions";

type TabKey = "stock" | "containers" | "history";
type SortKey = "material" | "quantity" | "weight" | "warehouse";

export default function InventoryPage() {
  const { state, setThreshold, notice, isSyncing, lastSyncedAt } = useDemo();
  const { identity } = useSession();
  const query = useWorkspaceSearch().trim().toLowerCase();

  const [activeTab, setActiveTab] = useState<TabKey>("stock");
  const [warehouse, setWarehouse] = useState(identity.warehouse ?? "All");
  const [sort, setSort] = useState<SortKey>("material");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Material Stock
  const scopedStock = visibleStock(state, identity.role, identity.warehouse);
  const sites = ["All", ...new Set(scopedStock.map((row) => row.warehouse))];
  const stockRows = scopedStock
    .filter((row) => {
      const matchesSite = warehouse === "All" || row.warehouse === warehouse;
      const haystack = `${row.material} ${row.category} ${row.location} ${row.warehouse}`.toLowerCase();
      return matchesSite && haystack.includes(query);
    })
    .sort((left, right) => {
      if (sort === "quantity") return left.quantity - right.quantity;
      if (sort === "weight") return left.weightKg - right.weightKg;
      if (sort === "warehouse") return left.warehouse.localeCompare(right.warehouse) || left.material.localeCompare(right.material);
      return left.material.localeCompare(right.material);
    });
  const selectedStock = stockRows.find((row) => row.id === selectedId) ?? null;

  // Container Inventory
  const containerRows = (state.containerInventory || []).filter((item) => {
    if (identity.role === "worker" && identity.warehouse && item.warehouse !== identity.warehouse) {
      return false;
    }
    if (warehouse !== "All" && item.warehouse !== warehouse) {
      return false;
    }
    if (!query) return true;
    const matNames = item.materials.map((m) => m.materialName).join(" ");
    const haystack = `${item.containerNumber} ${item.shipmentReference} ${item.poNumber || ""} ${item.warehouse} ${matNames}`.toLowerCase();
    return haystack.includes(query);
  });

  // Inventory History (Append-Only)
  const historyRows = (state.inventoryHistory || []).filter((entry) => {
    if (identity.role === "worker" && identity.warehouse && entry.warehouseName !== identity.warehouse) {
      return false;
    }
    if (warehouse !== "All" && entry.warehouseName !== warehouse) {
      return false;
    }
    if (!query) return true;
    const haystack = `${entry.materialName} ${entry.warehouseName} ${entry.containerNumber || ""} ${entry.operationType} ${entry.operationReason} ${entry.reference} ${entry.poNumber || ""} ${entry.performedByName}`.toLowerCase();
    return haystack.includes(query);
  });

  return (
    <>
      <PageTitle
        title="Inventory"
        subtitle={identity.role === "worker" ? `Showing ${identity.warehouse} only` : "Real-time warehouse stock, container cargo, and append-only audit history."}
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs shadow-xs">
              <span className={`inline-block h-2 w-2 rounded-full ${isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className="font-medium text-neutral-700">
                {isSyncing ? "Syncing..." : lastSyncedAt ? `Live (${lastSyncedAt.toLocaleTimeString()})` : "Live Sync"}
              </span>
            </div>
          </div>
        }
      />

      {/* Primary Navigation Tabs */}
      <div className="mb-4 flex border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "stock"
              ? "border-neutral-950 text-neutral-950 font-semibold"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Warehouse Stock ({stockRows.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("containers")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "containers"
              ? "border-neutral-950 text-neutral-950 font-semibold"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Container Breakdown ({containerRows.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "border-neutral-950 text-neutral-950 font-semibold"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Inventory History ({historyRows.length})
        </button>
      </div>

      {/* Warehouse Filter Chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">Warehouse:</span>
        {sites.map((site) => (
          <button
            key={site}
            type="button"
            onClick={() => setWarehouse(site)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              warehouse === site ? "bg-neutral-950 text-white" : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {site}
          </button>
        ))}
      </div>

      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}

      {/* TAB 1: Warehouse Stock */}
      {activeTab === "stock" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500">Sort</span>
            {(
              [
                ["material", "Material"],
                ["quantity", "Quantity"],
                ["weight", "Weight"],
                ["warehouse", "Warehouse"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`rounded-full px-3 py-1 text-xs ${sort === key ? "bg-neutral-950 text-white" : "border border-neutral-300 bg-white"}`}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-neutral-500">
              {stockRows.length} of {scopedStock.length}
            </span>
          </div>

          {selectedStock ? (
            <Surface className="mb-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-500">{selectedStock.category}</p>
                  <h2 className="text-sm font-semibold">{selectedStock.material}</h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    {selectedStock.warehouse} · {selectedStock.location} · {selectedStock.packaging}
                  </p>
                </div>
                <StatusPill label={stockStatus(selectedStock)} />
              </div>
              <p className="mt-3 text-sm">
                Quantity {selectedStock.quantity} · {formatKg(selectedStock.weightKg)} · minimum {selectedStock.reorder}
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">The minimum threshold is stored for this material at {selectedStock.warehouse}.</p>
              {canPerform(identity.role, "set-threshold") ? <ThresholdForm key={selectedStock.id} id={selectedStock.id} current={selectedStock.reorder} onSave={setThreshold} /> : null}
            </Surface>
          ) : null}

          <Surface className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
                <tr>
                  {["Material", "Category", "Warehouse", "Quantity", "Weight", "Minimum", "Status"].map((header) => (
                    <th key={header} scope="col" className="px-4 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      No matching materials.
                    </td>
                  </tr>
                ) : (
                  stockRows.map((row) => (
                    <tr key={row.id} className="border-t border-neutral-100 hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => setSelectedId(row.id)} className="underline-offset-4 hover:underline">
                          {row.material}
                        </button>
                      </td>
                      <td className="px-4 py-3">{row.category}</td>
                      <td className="px-4 py-3">{row.warehouse}</td>
                      <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
                      <td className="px-4 py-3 tabular-nums">{formatKg(row.weightKg)}</td>
                      <td className="px-4 py-3 tabular-nums">{row.reorder}</td>
                      <td className="px-4 py-3">
                        <StatusPill label={stockStatus(row)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Surface>

          <ul className="mt-3 space-y-2 md:hidden">
            {stockRows.length === 0 ? <li className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-sm text-neutral-600">No matching materials.</li> : null}
            {stockRows.map((row) => (
              <li key={`${row.id}-card`}>
                <button type="button" onClick={() => setSelectedId(row.id)} className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-left text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{row.material}</p>
                    <StatusPill label={stockStatus(row)} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {row.category} · {row.warehouse} · {row.location}
                  </p>
                  <p className="mt-2 text-xs">
                    Qty {row.quantity} · {formatKg(row.weightKg)} · minimum {row.reorder}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* TAB 2: Container Breakdown */}
      {activeTab === "containers" && (
        <div className="space-y-4">
          {containerRows.length === 0 ? (
            <Surface className="px-4 py-12 text-center text-sm text-neutral-500">
              No containers found matching current criteria.
            </Surface>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {containerRows.map((container) => (
                <Surface key={container.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
                    <div>
                      <h3 className="font-mono text-base font-bold text-neutral-950">{container.containerNumber}</h3>
                      <p className="text-xs text-neutral-500">
                        Ref: {container.shipmentReference} {container.poNumber ? `· PO: ${container.poNumber}` : ""} · {container.warehouse}
                      </p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700 capitalize">
                      {container.direction} ({container.status})
                    </span>
                  </div>

                  {/* Materials & Packaging Breakdown */}
                  <div className="mt-3 space-y-2">
                    <h4 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Materials & Packaging Types</h4>
                    {container.materials.map((m) => (
                      <div key={m.materialId} className="rounded-lg bg-neutral-50 p-2.5 text-xs">
                        <div className="flex justify-between font-semibold text-neutral-900">
                          <span>{m.materialName}</span>
                          <span className="tabular-nums">Net: {formatKg(m.netWeightKg)}</span>
                        </div>
                        {m.packagings.length > 0 && (
                          <div className="mt-1.5 space-y-1 text-neutral-600">
                            {m.packagings.map((pkg) => (
                              <div key={pkg.packagingTypeId} className="flex justify-between pl-2 border-l-2 border-neutral-300">
                                <span>{pkg.packageCount}x {pkg.packagingTypeName} (unit: {pkg.emptyUnitTareKg} kg)</span>
                                <span className="tabular-nums font-mono">tare: {formatKg(pkg.totalPackagingWeightKg)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Weight Summary Table */}
                  <div className="mt-4 border-t border-neutral-100 pt-3 text-xs">
                    <div className="grid grid-cols-2 gap-y-1">
                      <span className="text-neutral-500">Total Net Cargo Weight:</span>
                      <span className="text-right font-medium tabular-nums">{formatKg(container.totalNetWeightKg)}</span>

                      <span className="text-neutral-500">Total Packaging Tare:</span>
                      <span className="text-right font-medium tabular-nums">+{formatKg(container.totalPackagingWeightKg)}</span>

                      <span className="font-semibold text-neutral-800">Gross Packed Cargo Weight:</span>
                      <span className="text-right font-bold text-neutral-900 tabular-nums">{formatKg(container.grossPackedCargoWeightKg)}</span>

                      <span className="text-neutral-500">Shipping Container Tare (std):</span>
                      <span className="text-right font-medium tabular-nums font-mono">+{formatKg(container.containerTareKg)}</span>

                      <span className="font-bold text-neutral-950 border-t border-neutral-200 pt-1">Total Gross (Cargo + Container):</span>
                      <span className="text-right font-bold text-neutral-950 border-t border-neutral-200 pt-1 tabular-nums">{formatKg(container.totalGrossCargoAndContainerKg)}</span>
                    </div>
                  </div>
                </Surface>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Inventory History (Append-Only) */}
      {activeTab === "history" && (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-[11px] tracking-wide text-neutral-500 uppercase bg-neutral-50/75">
              <tr>
                {["Timestamp", "Warehouse", "Material", "Operation", "Delta", "Before", "After", "Container / Ref", "Actor"].map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">
                    No inventory history records found.
                  </td>
                </tr>
              ) : (
                historyRows.map((entry) => {
                  const isPositive = entry.quantityChange > 0;
                  return (
                    <tr key={entry.id} className="border-t border-neutral-100 hover:bg-neutral-50/50">
                      <td className="px-4 py-2.5 text-xs text-neutral-600 whitespace-nowrap">
                        {entry.createdAt.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-neutral-900">{entry.warehouseName}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-neutral-900">{entry.materialName}</span>
                        {entry.packagingTypeName && (
                          <div className="text-[11px] text-neutral-500">
                            {entry.packagingCount}x {entry.packagingTypeName} (tare: {entry.packagingUnitTareKg} kg)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          entry.operationType === "receipt" ? "bg-emerald-100 text-emerald-800" :
                          entry.operationType === "dispatch" ? "bg-blue-100 text-blue-800" :
                          entry.operationType.startsWith("transfer") ? "bg-purple-100 text-purple-800" :
                          "bg-amber-100 text-amber-800"
                        }`}>
                          {entry.operationType.replace("_", " ")}
                        </span>
                        <div className="text-[11px] text-neutral-500 truncate max-w-[180px]">{entry.operationReason}</div>
                      </td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${isPositive ? "text-emerald-600" : "text-neutral-900"}`}>
                        {isPositive ? `+${formatKg(entry.quantityChange)}` : formatKg(entry.quantityChange)}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-xs text-neutral-500">{formatKg(entry.quantityBefore)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs font-medium text-neutral-900">{formatKg(entry.quantityAfter)}</td>
                      <td className="px-4 py-2.5 text-xs text-neutral-600">
                        {entry.containerNumber ? <span className="font-mono">{entry.containerNumber}</span> : "—"}
                        {entry.poNumber && <div className="text-[11px] text-neutral-500 font-mono">PO: {entry.poNumber}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-700 whitespace-nowrap">{entry.performedByName}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Surface>
      )}
    </>
  );
}

function ThresholdForm({ id, current, onSave }: { id: string; current: number; onSave: (draft: { id: string; minimum: number }) => Promise<string | undefined> }) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => void (async () => {
        event.preventDefault();
        if (!/^\d+$/.test(value.trim())) {
          setError("The minimum quantity must be a whole number, zero or greater.");
          return;
        }
        setError(null);
        const failed = await onSave({ id, minimum: Number(value) });
        if (failed) setError(failed);
      })()}
    >
      <label className="text-xs text-neutral-500">
        Minimum quantity
        <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm sm:w-40" />
      </label>
      <button type="submit" className="h-10 rounded-lg border border-neutral-950 px-3 text-sm font-medium">
        Save threshold
      </button>
      {error ? <p className="text-xs text-neutral-950 sm:mb-3">{error}</p> : null}
    </form>
  );
}
