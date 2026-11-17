"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useLiveNow } from "@/components/ref/live-clock";
import { useSession } from "@/components/shell/auth-gate";
import {
  demurrageLabel,
  demurrageSnapshot,
  formatEuro,
  formatKg,
  visibleContainers,
  visibleOutbound,
  type DemoContainer,
  type DemoOutbound,
} from "@/domain/view";
import { Icon } from "@/components/icons";
import { WORKER_THEME } from "./worker-theme";

export function WorkerShipmentsView({ direction }: { direction: "inbound" | "outbound" }) {
  const { state } = useDemo();
  const { identity } = useSession();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isInbound = direction === "inbound";
  const actor = {
    name: identity.name,
    role: identity.role,
    warehouse: identity.warehouse,
    email: identity.email,
    company: identity.company,
  };

  const containers = visibleContainers(state, actor);
  const outboundList = visibleOutbound(state, actor);

  // Demurrage live timer
  const now = useLiveNow(
    isInbound && containers.some((c) => c.status === "Unloading" && Boolean(c.demurrage?.startedAt))
  );

  // Filter list
  const filteredItems = (isInbound ? containers : outboundList).filter((item) => {
    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "active") {
        if (isInbound && (item.status === "Completed")) return false;
        if (!isInbound && (item.status === "Dispatched")) return false;
      } else if (statusFilter === "in-progress") {
        if (isInbound && item.status !== "Unloading") return false;
        if (!isInbound && item.status !== "Loading") return false;
      } else if (statusFilter === "done") {
        if (isInbound && item.status !== "Completed") return false;
        if (!isInbound && item.status !== "Dispatched") return false;
      }
    }

    // Search query
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const po = item.po?.toLowerCase() || "";
    const num = item.number.toLowerCase();
    const party = ("supplier" in item ? item.supplier : item.customer)?.toLowerCase() || "";
    const equip = ("containerNumber" in item ? item.containerNumber : item.container)?.toLowerCase() || "";
    const wh = item.warehouse.toLowerCase();

    return po.includes(query) || num.includes(query) || party.includes(query) || equip.includes(query) || wh.includes(query);
  });

  return (
    <div className="space-y-4 pb-10">
      {/* Title & Warehouse Pill */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {isInbound ? "Inbound Containers" : "Outbound Shipments"}
          </h1>
          <p className="text-xs text-slate-400">
            {identity.warehouse ? `${identity.warehouse} Depot` : "All Warehouses"} ·{" "}
            {filteredItems.length} {isInbound ? "container(s)" : "shipment(s)"} listed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-[#202A3D] px-3 py-1 text-xs font-semibold text-[#8B7DF0]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6655E8]" />
            {isInbound ? "Unloading Operations" : "Loading Operations"}
          </span>
        </div>
      </div>

      {/* Search Bar & Quick Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${isInbound ? "PO, container, supplier..." : "SO, customer, container..."}`}
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

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`min-h-[38px] whitespace-nowrap rounded-xl px-3.5 py-2 font-medium transition ${
              statusFilter === "all"
                ? "bg-[#6655E8] text-white shadow-sm"
                : "border border-slate-700/60 bg-[#202A3D] text-slate-300 hover:text-white"
            }`}
          >
            All Shipments
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`min-h-[38px] whitespace-nowrap rounded-xl px-3.5 py-2 font-medium transition ${
              statusFilter === "active"
                ? "bg-[#6655E8] text-white shadow-sm"
                : "border border-slate-700/60 bg-[#202A3D] text-slate-300 hover:text-white"
            }`}
          >
            Open / Pending
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("in-progress")}
            className={`min-h-[38px] whitespace-nowrap rounded-xl px-3.5 py-2 font-medium transition ${
              statusFilter === "in-progress"
                ? "bg-[#6655E8] text-white shadow-sm"
                : "border border-slate-700/60 bg-[#202A3D] text-slate-300 hover:text-white"
            }`}
          >
            {isInbound ? "Unloading Now" : "Loading Now"}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("done")}
            className={`min-h-[38px] whitespace-nowrap rounded-xl px-3.5 py-2 font-medium transition ${
              statusFilter === "done"
                ? "bg-[#6655E8] text-white shadow-sm"
                : "border border-slate-700/60 bg-[#202A3D] text-slate-300 hover:text-white"
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Shipment Cards List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-[#202A3D] p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#162032] text-slate-400 border border-slate-700/50">
            <Icon name={isInbound ? "containers" : "outbound"} />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-white">No shipments found</h3>
          <p className="mt-1 text-xs text-slate-400">
            {search ? "Try adjusting your search query." : "No operations matching the selected filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isExpanded = expandedId === item.number;
            const party = "supplier" in item ? item.supplier : item.customer;
            const equip = "containerNumber" in item ? item.containerNumber : item.container;
            const isCompleted = item.status === "Completed" || item.status === "Dispatched";
            const isWorking = item.status === "Unloading" || item.status === "Loading";

            // Inbound demurrage check
            const containerItem = isInbound ? (item as DemoContainer) : null;
            const demurrageSnap = containerItem && now ? demurrageSnapshot(containerItem, now) : null;
            const isDemurrageWarning = Boolean(demurrageSnap?.overtime);

            const hasAnnex = isInbound && state.attachments.some((a) => a.shipment === item.number && a.role === "annex7");

            return (
              <div
                key={item.number}
                className={`overflow-hidden rounded-2xl border transition-all shadow-sm ${
                  isDemurrageWarning
                    ? "border-rose-500/60 bg-rose-500/10"
                    : isWorking
                    ? "border-[#6655E8]/50 bg-[#202A3D]"
                    : "border-slate-700/60 bg-[#202A3D]"
                }`}
              >
                {/* Main Card Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {/* PO / SO Reference Badge */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white tracking-tight">
                          {item.number}
                        </span>
                        {item.po ? (
                          <span className="rounded-md border border-[#6655E8]/30 bg-[#6655E8]/15 px-2 py-0.5 text-xs font-semibold text-[#8B7DF0]">
                            {item.po}
                          </span>
                        ) : null}
                        {hasAnnex ? (
                          <span className="rounded-md border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                            Annex VII
                          </span>
                        ) : null}
                      </div>

                      {/* Party (Supplier / Customer) */}
                      <p className="mt-1.5 text-sm font-semibold text-slate-100">
                        {party || (isInbound ? "Supplier Not Recorded" : "Customer Not Recorded")}
                      </p>
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-tight ${
                        isCompleted
                          ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                          : isWorking
                          ? "border border-[#6655E8]/40 bg-[#6655E8]/20 text-[#8B7DF0]"
                          : "border border-slate-700 bg-[#162032] text-slate-300"
                      }`}
                    >
                      {isCompleted ? "✔" : isWorking ? "●" : "○"} {item.status}
                    </span>
                  </div>

                  {/* Route & Equipment Info */}
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#162032] border border-slate-700/50 p-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-medium">
                        {isInbound ? "Origin & Pickup" : "Destination"}
                      </span>
                      <p className="font-medium text-slate-200 truncate mt-0.5">
                        {isInbound ? (item as DemoContainer).origin || "Origin not set" : item.warehouse}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isInbound ? `ETA: ${(item as DemoContainer).eta || "Pending"}` : (item as DemoOutbound).date}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-medium">
                        Equipment / Container
                      </span>
                      <p className="font-mono font-medium text-slate-200 truncate mt-0.5">
                        {equip || "No equipment ID"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Depot: {item.warehouse}</p>
                    </div>
                  </div>

                  {/* Demurrage Notice Banner if applicable */}
                  {isInbound && containerItem?.status === "Unloading" ? (
                    <div
                      className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
                        isDemurrageWarning
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon name="bell" />
                        {demurrageLabel(containerItem, now)}
                      </span>
                      {demurrageSnap?.chargeEUR && demurrageSnap.chargeEUR > 0 ? (
                        <span className="font-bold text-rose-400">
                          {formatEuro(demurrageSnap.chargeEUR)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Materials Preview & Toggle */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/60 pt-2.5">
                    <span>
                      {item.sections?.length || 0} Material Section(s) recorded
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : item.number)}
                      className="text-[#8B7DF0] hover:text-[#a599f5] font-medium flex items-center gap-1"
                    >
                      {isExpanded ? "Hide Details ▲" : "View Details ▼"}
                    </button>
                  </div>
                </div>

                {/* Expandable Details Drawer */}
                {isExpanded ? (
                  <div className="border-t border-slate-700/60 bg-[#162032] p-4 text-xs space-y-3">
                    <p className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                      Recorded Cargo Sections
                    </p>
                    {item.sections && item.sections.length > 0 ? (
                      <div className="space-y-1.5">
                        {item.sections.map((sec, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg bg-[#202A3D] border border-slate-700/50 p-2.5 text-slate-200"
                          >
                            <div>
                              <p className="font-semibold text-white">{sec.material}</p>
                              <p className="text-[11px] text-slate-400">
                                {sec.packagingId} · Qty: {sec.packagingQty || "N/A"}
                              </p>
                            </div>
                            <div className="text-right">
                              {sec.netKg != null ? (
                                <p className="font-bold text-emerald-400">{formatKg(sec.netKg)} Net</p>
                              ) : (
                                <p className="font-bold text-[#8B7DF0]">{sec.count} Units</p>
                              )}
                              {sec.grossKg ? (
                                <p className="text-[10px] text-slate-400">{formatKg(sec.grossKg)} Gross</p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic">No materials recorded yet.</p>
                    )}

                    {/* Operational Safety Guarantee */}
                    <div className="rounded-lg border border-slate-700/50 bg-[#202A3D]/70 p-2 text-[11px] text-slate-400">
                      ℹ Warehouse Worker permissions active: Tap below to record materials, weigh cargo, capture photos, and finalize operations.
                    </div>
                  </div>
                ) : null}

                {/* Primary Action Button (min 48px touch target) */}
                <div className="border-t border-slate-700/60 p-3 bg-[#162032]">
                  <Link
                    href={isInbound ? `/containers/${item.number}` : `/outbound/${item.number}`}
                    className={WORKER_THEME.btnPrimary}
                  >
                    {isInbound ? "Open Unloading Workflow →" : "Open Loading Workflow →"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
