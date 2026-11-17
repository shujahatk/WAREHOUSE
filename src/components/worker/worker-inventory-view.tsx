"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { formatKg, visibleStock } from "@/domain/view";
import { WORKER_THEME } from "./worker-theme";

export function WorkerInventoryView() {
  const { state, isSyncing, lastSyncedAt } = useDemo();
  const { identity } = useSession();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"stock" | "containers">("stock");

  const scopedStock = visibleStock(state, identity.role, identity.warehouse);
  const totalWeight = scopedStock.reduce((acc, row) => acc + row.weightKg, 0);

  // Filter stock
  const filteredStock = scopedStock.filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      row.material.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q) ||
      row.location.toLowerCase().includes(q)
    );
  });

  // Filter container inventory
  const containerRows = (state.containerInventory || []).filter((item) => {
    if (identity.warehouse && item.warehouse !== identity.warehouse) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const matNames = item.materials.map((m) => m.materialName).join(" ").toLowerCase();
    return (
      item.containerNumber.toLowerCase().includes(q) ||
      item.shipmentReference.toLowerCase().includes(q) ||
      matNames.includes(q)
    );
  });

  return (
    <div className="space-y-4 pb-12">
      {/* Title & Live Sync Indicator */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
            Depot Stock &amp; Inventory
          </h1>
          <p className="text-xs text-neutral-500">
            {identity.warehouse ? `${identity.warehouse} Depot` : "All Locations"} · Current verified balance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
            <span
              className={`h-2 w-2 rounded-full ${isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-600"
                }`}
            />
            <span className="font-semibold text-emerald-900">
              {isSyncing ? "Syncing..." : lastSyncedAt ? "Live Synced" : "Connected"}
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200/90 bg-white p-3.5 sm:p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500">Total Net Stock</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-800">
            {formatKg(totalWeight)}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">{identity.warehouse} Depot</p>
        </div>

        <div className="rounded-xl border border-neutral-200/90 bg-white p-3.5 sm:p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500">Active SKUs</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            {scopedStock.length}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Material types</p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-neutral-200/90 bg-white p-3.5 sm:p-4 shadow-2xs">
          <span className="text-xs font-semibold text-neutral-500">Depot Containers</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-blue-900">
            {containerRows.length}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">With cargo in depot</p>
        </div>
      </div>

      {/* Tabs: Material Stock vs Container Cargo */}
      <div className="flex rounded-xl border border-neutral-200 bg-neutral-100 p-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={`flex-1 rounded-lg py-2 font-bold transition ${activeTab === "stock"
            ? "bg-white text-emerald-900 shadow-2xs border border-neutral-200/60"
            : "text-neutral-600 hover:text-neutral-900"
            }`}
        >
          Material Stock ({scopedStock.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("containers")}
          className={`flex-1 rounded-lg py-2 font-bold transition ${activeTab === "containers"
            ? "bg-white text-emerald-900 shadow-2xs border border-neutral-200/60"
            : "text-neutral-600 hover:text-neutral-900"
            }`}
        >
          Container Cargo ({containerRows.length})
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === "stock" ? "material name, category, bin location..." : "container number, PO, material..."}`}
          className={WORKER_THEME.input}
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-3.5 text-xs text-neutral-500 hover:text-neutral-800"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Content */}
      {activeTab === "stock" ? (
        <div className="space-y-2.5">
          {filteredStock.length === 0 ? (
            <div className="rounded-xl border border-neutral-200/90 bg-white p-8 text-center text-xs text-neutral-500 shadow-2xs">
              No matching materials in inventory.
            </div>
          ) : (
            filteredStock.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">{row.material}</h3>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      Category: <span className="font-semibold text-neutral-800">{row.category}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      Depot: {row.warehouse} · Bin: {row.location || "General Floor"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-bold text-emerald-800">{formatKg(row.weightKg)}</p>
                    <p className="text-[11px] text-neutral-500">
                      {row.quantity > 0 ? `${row.quantity} unit(s)` : "Bulk balance"}
                    </p>
                    <span
                      className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${row.weightKg > 1000
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                    >
                      {row.weightKg > 1000 ? "In Stock" : "Low Stock"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {containerRows.length === 0 ? (
            <div className="rounded-xl border border-neutral-200/90 bg-white p-8 text-center text-xs text-neutral-500 shadow-2xs">
              No containers currently holding cargo in this warehouse.
            </div>
          ) : (
            containerRows.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-neutral-900">
                        {item.containerNumber}
                      </span>
                      {item.poNumber ? (
                        <span className="rounded bg-neutral-100 border border-neutral-300 px-1.5 py-0.5 text-[10px] font-bold text-neutral-800">
                          {item.poNumber}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Ref: {item.shipmentReference} · {item.warehouse}
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-100 border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-700 font-semibold">
                    Tare: {formatKg(item.containerTareKg)}
                  </span>
                </div>

                {/* Materials Breakdown */}
                <div className="rounded-lg bg-neutral-50 border border-neutral-200/80 p-3 text-xs space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-neutral-500 block">
                    Cargo Materials
                  </span>
                  {item.materials.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between text-neutral-800">
                      <span className="font-medium">{m.materialName}</span>
                      <span className="font-bold text-emerald-800">{formatKg(m.netWeightKg)} Net</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-neutral-200 pt-1 text-neutral-600 font-medium">
                    <span>Gross Cargo Weight:</span>
                    <span className="text-neutral-900 font-bold">{formatKg(item.grossPackedCargoWeightKg)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
