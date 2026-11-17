"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { formatKg, visibleStock } from "@/domain/view";
import { Icon } from "@/components/icons";
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
    <div className="space-y-4 pb-28">
      {/* Title & Live Sync Indicator */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Warehouse Inventory
          </h1>
          <p className="text-xs text-slate-400">
            {identity.warehouse ? `${identity.warehouse} Depot` : "All Locations"} · Real-time stock balance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-[#121B2E] px-3 py-1 text-xs text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isSyncing ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
            <span className="font-medium text-slate-300">
              {isSyncing ? "Syncing..." : lastSyncedAt ? "Live Synced" : "Connected"}
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
          <span className="text-xs text-slate-400">Total Net Stock</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-400">
            {formatKg(totalWeight)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{identity.warehouse} Depot</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
          <span className="text-xs text-slate-400">Materials Tracked</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">
            {scopedStock.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">Active SKUs</p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-md">
          <span className="text-xs text-slate-400">Containers in Depot</span>
          <p className="mt-1 text-2xl font-bold tracking-tight text-violet-400">
            {containerRows.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">With cargo on site</p>
        </div>
      </div>

      {/* Tabs: Material Stock vs Container Cargo */}
      <div className="flex rounded-xl border border-slate-800 bg-[#0E1626] p-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={`flex-1 rounded-lg py-2 font-semibold transition ${
            activeTab === "stock"
              ? "bg-violet-600 text-white shadow-md shadow-violet-950/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Material Stock ({scopedStock.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("containers")}
          className={`flex-1 rounded-lg py-2 font-semibold transition ${
            activeTab === "containers"
              ? "bg-violet-600 text-white shadow-md shadow-violet-950/40"
              : "text-slate-400 hover:text-white"
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
          placeholder={`Search ${activeTab === "stock" ? "materials, categories, bins..." : "container number, PO, materials..."}`}
          className={WORKER_THEME.input}
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-3.5 text-xs text-slate-400 hover:text-white"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Content */}
      {activeTab === "stock" ? (
        <div className="space-y-2.5">
          {filteredStock.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#121B2E] p-8 text-center text-xs text-slate-400">
              No matching materials in inventory.
            </div>
          ) : (
            filteredStock.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{row.material}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Category: <span className="text-slate-300 font-medium">{row.category}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Depot: {row.warehouse} · Bin: {row.location || "General Floor"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-bold text-emerald-400">{formatKg(row.weightKg)}</p>
                    <p className="text-[11px] text-slate-400">
                      {row.quantity > 0 ? `${row.quantity} unit(s)` : "Bulk balance"}
                    </p>
                    <span
                      className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.weightKg > 1000
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
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
            <div className="rounded-2xl border border-slate-800 bg-[#121B2E] p-8 text-center text-xs text-slate-400">
              No containers currently holding cargo in this warehouse.
            </div>
          ) : (
            containerRows.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-800/80 bg-[#121B2E] p-4 shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">
                        {item.containerNumber}
                      </span>
                      {item.poNumber ? (
                        <span className="rounded bg-violet-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                          {item.poNumber}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ref: {item.shipmentReference} · {item.warehouse}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300 font-medium">
                    Tare: {formatKg(item.containerTareKg)}
                  </span>
                </div>

                {/* Materials Breakdown */}
                <div className="rounded-xl bg-[#0E1626] p-3 text-xs space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 block">
                    Cargo Materials
                  </span>
                  {item.materials.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between text-slate-300">
                      <span>{m.materialName}</span>
                      <span className="font-bold text-emerald-400">{formatKg(m.netWeightKg)} Net</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-slate-800 pt-1 text-slate-400 font-medium">
                    <span>Gross Cargo Weight:</span>
                    <span className="text-white">{formatKg(item.grossPackedCargoWeightKg)}</span>
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
