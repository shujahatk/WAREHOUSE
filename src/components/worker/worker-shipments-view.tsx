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
    <div className="space-y-4 pb-12">
      {/* Title & Warehouse Pill */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
            {isInbound ? "Inbound Containers" : "Outbound Shipments"}
          </h1>
          <p className="text-xs text-neutral-500">
            {identity.warehouse ? `${identity.warehouse} Depot` : "All Warehouses"} ·{" "}
            {filteredItems.length} {isInbound ? "container(s)" : "shipment(s)"} listed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
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
            placeholder={`Search ${isInbound ? "PO, container number, supplier..." : "SO, customer, equipment ID..."}`}
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

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`min-h-[40px] whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold transition ${
              statusFilter === "all"
                ? "bg-emerald-800 text-white shadow-xs"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            All Shipments ({isInbound ? containers.length : outboundList.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`min-h-[40px] whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold transition ${
              statusFilter === "active"
                ? "bg-emerald-800 text-white shadow-xs"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Open / Pending
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("in-progress")}
            className={`min-h-[40px] whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold transition ${
              statusFilter === "in-progress"
                ? "bg-emerald-800 text-white shadow-xs"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {isInbound ? "Unloading Now" : "Loading Now"}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("done")}
            className={`min-h-[40px] whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold transition ${
              statusFilter === "done"
                ? "bg-emerald-800 text-white shadow-xs"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Shipment Cards List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-neutral-200/90 bg-white p-8 text-center shadow-2xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
            <Icon name={isInbound ? "containers" : "outbound"} />
          </div>
          <h3 className="mt-3 text-sm font-bold text-neutral-900">No shipments found</h3>
          <p className="mt-1 text-xs text-neutral-500">
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
                className={`overflow-hidden rounded-xl border bg-white transition-all shadow-2xs ${
                  isDemurrageWarning
                    ? "border-rose-300 bg-rose-50/40"
                    : isWorking
                    ? "border-blue-300 bg-blue-50/30"
                    : "border-neutral-200/90"
                }`}
              >
                {/* Main Card Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {/* PO / SO Reference Badge */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-neutral-900 tracking-tight">
                          {item.number}
                        </span>
                        {item.po ? (
                          <span className="rounded bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                            {item.po}
                          </span>
                        ) : null}
                        {hasAnnex ? (
                          <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                            Annex VII
                          </span>
                        ) : null}
                      </div>

                      {/* Party (Supplier / Customer) */}
                      <p className="mt-1.5 text-sm font-bold text-neutral-900">
                        {party || (isInbound ? "Supplier Not Recorded" : "Customer Not Recorded")}
                      </p>
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-tight ${
                        isCompleted
                          ? "border border-emerald-300 bg-emerald-100 text-emerald-800"
                          : isWorking
                          ? "border border-blue-300 bg-blue-100 text-blue-800"
                          : "border border-neutral-300 bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {isCompleted ? "✔" : isWorking ? "●" : "○"} {item.status}
                    </span>
                  </div>

                  {/* Route & Equipment Info Block */}
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-neutral-50/90 border border-neutral-200/70 p-3 text-xs">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                        {isInbound ? "Origin & Pickup" : "Destination"}
                      </span>
                      <p className="font-semibold text-neutral-800 truncate mt-0.5">
                        {isInbound ? (item as DemoContainer).origin || "Origin not set" : item.warehouse}
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {isInbound ? `ETA: ${(item as DemoContainer).eta || "Pending"}` : (item as DemoOutbound).date}
                      </p>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                        Equipment / Container
                      </span>
                      <p className="font-mono font-bold text-neutral-800 truncate mt-0.5">
                        {equip || "No equipment ID"}
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">Depot: {item.warehouse}</p>
                    </div>
                  </div>

                  {/* Demurrage Notice Banner if applicable */}
                  {isInbound && containerItem?.status === "Unloading" ? (
                    <div
                      className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold ${
                        isDemurrageWarning
                          ? "bg-rose-100 text-rose-900 border border-rose-300"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon name="bell" />
                        {demurrageLabel(containerItem, now)}
                      </span>
                      {demurrageSnap?.chargeEUR && demurrageSnap.chargeEUR > 0 ? (
                        <span className="font-bold text-rose-700">
                          {formatEuro(demurrageSnap.chargeEUR)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Materials Preview & Toggle */}
                  <div className="mt-3 flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-200/80 pt-2.5">
                    <span className="font-medium">
                      {item.sections?.length || 0} Material Section(s) recorded
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : item.number)}
                      className="text-emerald-800 hover:text-emerald-950 font-bold flex items-center gap-1"
                    >
                      {isExpanded ? "Hide Details ▲" : "View Details ▼"}
                    </button>
                  </div>
                </div>

                {/* Expandable Details Drawer */}
                {isExpanded ? (
                  <div className="border-t border-neutral-200 bg-neutral-50/70 p-4 text-xs space-y-3">
                    <p className="font-bold text-neutral-700 uppercase tracking-wider text-[10px]">
                      Recorded Cargo Sections
                    </p>
                    {item.sections && item.sections.length > 0 ? (
                      <div className="space-y-1.5">
                        {item.sections.map((sec, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-lg bg-white border border-neutral-200 p-2.5 text-neutral-800 shadow-2xs"
                          >
                            <div>
                              <p className="font-bold text-neutral-900">{sec.material}</p>
                              <p className="text-[11px] text-neutral-500">
                                {sec.packagingId} · Qty: {sec.packagingQty || "N/A"}
                              </p>
                            </div>
                            <div className="text-right">
                              {sec.netKg != null ? (
                                <p className="font-bold text-emerald-800">{formatKg(sec.netKg)} Net</p>
                              ) : (
                                <p className="font-bold text-blue-800">{sec.count} Units</p>
                              )}
                              {sec.grossKg ? (
                                <p className="text-[10px] text-neutral-500">{formatKg(sec.grossKg)} Gross</p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-500 italic">No materials recorded yet.</p>
                    )}

                    <div className="rounded-lg border border-neutral-200 bg-white p-2.5 text-[11px] text-neutral-600">
                      ℹ Ready to work? Tap the action button below to record scale weights and inspection photos.
                    </div>
                  </div>
                ) : null}

                {/* Primary Action Button (min 48px touch target) */}
                <div className="border-t border-neutral-200 p-3 bg-neutral-50/60">
                  <Link
                    href={isInbound ? `/containers/${item.number}` : `/outbound/${item.number}`}
                    className={WORKER_THEME.btnPrimary}
                  >
                    {isInbound ? "Start Unloading / View Operation →" : "Start Loading / View Operation →"}
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
