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
  visibleStock,
} from "@/domain/view";
import { Icon } from "@/components/icons";
import { WORKER_THEME } from "./worker-theme";

export function WorkerDashboard() {
  const { state } = useDemo();
  const { identity } = useSession();
  const [activeTab, setActiveTab] = useState<"all" | "inbound" | "outbound">("all");

  const actor = {
    name: identity.name,
    role: identity.role,
    warehouse: identity.warehouse,
    email: identity.email,
    company: identity.company,
  };

  const scopedContainers = visibleContainers(state, actor);
  const scopedOutbound = visibleOutbound(state, actor);
  const stock = visibleStock(state, identity.role, identity.warehouse);
  const totalStockKg = stock.reduce((sum, item) => sum + item.weightKg, 0);

  // Demurrage monitoring
  const unloadingContainers = scopedContainers.filter(
    (c) => c.status === "Unloading" && Boolean(c.demurrage?.startedAt)
  );
  const now = useLiveNow(unloadingContainers.length > 0);

  // Check if any container is currently in overtime / warning
  const criticalDemurrageContainer = unloadingContainers.find((c) => {
    if (!now) return false;
    const snap = demurrageSnapshot(c, now);
    return snap.overtime;
  }) ?? unloadingContainers[0];

  const demurrageSnap = criticalDemurrageContainer && now
    ? demurrageSnapshot(criticalDemurrageContainer, now)
    : null;

  // Operational metrics
  const inboundPending = scopedContainers.filter((c) => c.status !== "Completed");
  const outboundPending = scopedOutbound.filter((o) => o.status !== "Dispatched");
  const totalActiveTasks = inboundPending.length + outboundPending.length;

  // Requests created by this worker
  const myRequests = (state.generalRequests || []).filter((r) => r.createdByName === identity.name);
  const pendingRequestsCount = myRequests.filter(
    (r) => r.status === "submitted" || r.status === "under_review"
  ).length;

  return (
    <div className="space-y-4 pb-10">
      {/* 1. Worker Shift Greeting Banner */}
      <div className="rounded-2xl border border-slate-700/60 bg-[#202A3D] p-4 sm:p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/20" />
              <span className="text-xs font-semibold tracking-wide uppercase text-emerald-400">
                Shift Active
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-xs text-slate-300 font-medium">
                {identity.warehouse ? `${identity.warehouse} Depot` : "Warehouse Floor"}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
              Hello, {identity.name}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Warehouse operational console: manage unloading, loading, and real-time stock recording.
            </p>
          </div>
          <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-[#162032] text-[#8B7DF0] border border-slate-700/60">
            <Icon name="dashboard" />
          </div>
        </div>

        {/* Quick Shift Summary Bar */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/60 pt-3 text-xs sm:grid-cols-4">
          <div>
            <span className="text-slate-400">Warehouse:</span>
            <p className="font-semibold text-white">{identity.warehouse ?? "Bornem"}</p>
          </div>
          <div>
            <span className="text-slate-400">Active Tasks:</span>
            <p className="font-semibold text-[#8B7DF0]">{totalActiveTasks} operations</p>
          </div>
          <div>
            <span className="text-slate-400">Stock on Site:</span>
            <p className="font-semibold text-emerald-400">{formatKg(totalStockKg)}</p>
          </div>
          <div>
            <span className="text-slate-400">My Requests:</span>
            <p className="font-semibold text-amber-400">{pendingRequestsCount} pending</p>
          </div>
        </div>
      </div>

      {/* 2. Demurrage Alert Banner (High-Visibility Red if overtime/warning) */}
      {criticalDemurrageContainer ? (
        <div
          className={`rounded-2xl border p-4 shadow-sm transition-all ${
            demurrageSnap?.overtime
              ? "border-rose-500/60 bg-rose-500/10 text-rose-300"
              : "border-amber-500/50 bg-amber-500/10 text-amber-300"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  demurrageSnap?.overtime ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                }`}
              >
                <Icon name="bell" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold tracking-wider uppercase ${
                      demurrageSnap?.overtime ? "text-rose-400" : "text-amber-400"
                    }`}
                  >
                    {demurrageSnap?.overtime ? "Demurrage Charge Overtime" : "Active Demurrage Timer"}
                  </span>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {criticalDemurrageContainer.containerNumber || criticalDemurrageContainer.number}
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-0.5">
                  {demurrageLabel(criticalDemurrageContainer, now)}
                  {demurrageSnap?.overtime && demurrageSnap.chargeEUR > 0
                    ? ` · Incurred: ${formatEuro(demurrageSnap.chargeEUR)}`
                    : ""}
                </p>
              </div>
            </div>
            <Link
              href={`/containers/${criticalDemurrageContainer.number}`}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-rose-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 active:scale-95 transition"
            >
              Resume Unloading →
            </Link>
          </div>
        </div>
      ) : null}

      {/* 3. 2x2 Mobile KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Inbound Active */}
        <Link
          href="/containers"
          className="group rounded-2xl border border-slate-700/60 bg-[#202A3D] p-3.5 sm:p-4 shadow-sm transition hover:border-slate-500 active:scale-95"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Inbound</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#162032] text-blue-400 border border-slate-700/50">
              <Icon name="containers" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {inboundPending.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {unloadingContainers.length > 0
              ? `${unloadingContainers.length} unloading now`
              : "Incoming containers"}
          </p>
        </Link>

        {/* Outbound Active */}
        <Link
          href="/outbound"
          className="group rounded-2xl border border-slate-700/60 bg-[#202A3D] p-3.5 sm:p-4 shadow-sm transition hover:border-slate-500 active:scale-95"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Outbound</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#162032] text-[#8B7DF0] border border-slate-700/50">
              <Icon name="outbound" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {outboundPending.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Loading & dispatch</p>
        </Link>

        {/* Site Stock */}
        <Link
          href="/inventory"
          className="group rounded-2xl border border-slate-700/60 bg-[#202A3D] p-3.5 sm:p-4 shadow-sm transition hover:border-slate-500 active:scale-95"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Stock On Hand</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#162032] text-emerald-400 border border-slate-700/50">
              <Icon name="inventory" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-white truncate">
            {formatKg(totalStockKg)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{stock.length} materials tracked</p>
        </Link>

        {/* My Requests */}
        <Link
          href="/tasks"
          className="group rounded-2xl border border-slate-700/60 bg-[#202A3D] p-3.5 sm:p-4 shadow-sm transition hover:border-slate-500 active:scale-95"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">My Requests</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#162032] text-amber-400 border border-slate-700/50">
              <Icon name="documents" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {myRequests.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{pendingRequestsCount} awaiting review</p>
        </Link>
      </div>

      {/* 4. Large Primary Touch Actions (min 48px) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Link
          href="/containers"
          className="flex h-14 min-h-[52px] items-center justify-between rounded-xl bg-[#6655E8] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5846db] active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
              <Icon name="containers" />
            </div>
            <div className="text-left">
              <p className="leading-tight">Inbound Operations</p>
              <p className="text-[11px] text-violet-200 font-normal">
                {inboundPending.length} container(s) awaiting action
              </p>
            </div>
          </div>
          <span>→</span>
        </Link>

        <Link
          href="/outbound"
          className="flex h-14 min-h-[52px] items-center justify-between rounded-xl border border-slate-700/60 bg-[#202A3D] px-4 text-sm font-semibold text-slate-100 shadow-sm transition hover:bg-[#28354c] active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#162032] text-slate-300 border border-slate-700/50">
              <Icon name="outbound" />
            </div>
            <div className="text-left">
              <p className="leading-tight">Outbound Operations</p>
              <p className="text-[11px] text-slate-400 font-normal">
                {outboundPending.length} shipment(s) ready to load
              </p>
            </div>
          </div>
          <span>→</span>
        </Link>
      </div>

      {/* 5. Assigned Operations List */}
      <div className="rounded-2xl border border-slate-700/60 bg-[#202A3D] p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Assigned Depot Operations</h2>
            <p className="text-[11px] text-slate-400">
              Tap any shipment to open the loading / unloading workflow
            </p>
          </div>
          {/* Segmented Filter */}
          <div className="flex rounded-lg border border-slate-700/60 bg-[#162032] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                activeTab === "all" ? "bg-[#6655E8] text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inbound")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                activeTab === "inbound" ? "bg-[#6655E8] text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              In ({inboundPending.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("outbound")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                activeTab === "outbound" ? "bg-[#6655E8] text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Out ({outboundPending.length})
            </button>
          </div>
        </div>

        {/* List of Shipments */}
        <div className="mt-3 space-y-2.5">
          {(() => {
            const list: {
              type: "inbound" | "outbound";
              id: string;
              ref: string;
              po: string;
              party: string;
              status: string;
              containerEquipment: string;
              date: string;
            }[] = [];

            if (activeTab === "all" || activeTab === "inbound") {
              for (const c of scopedContainers) {
                list.push({
                  type: "inbound",
                  id: c.number,
                  ref: c.number,
                  po: c.po,
                  party: c.supplier,
                  status: c.status,
                  containerEquipment: c.containerNumber || "Equipment not set",
                  date: c.eta || "Pending ETA",
                });
              }
            }

            if (activeTab === "all" || activeTab === "outbound") {
              for (const o of scopedOutbound) {
                list.push({
                  type: "outbound",
                  id: o.number,
                  ref: o.number,
                  po: o.po,
                  party: o.customer,
                  status: o.status,
                  containerEquipment: o.container || "Equipment not set",
                  date: o.date,
                });
              }
            }

            if (list.length === 0) {
              return (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active operations assigned to {identity.warehouse ?? "this depot"}.
                </div>
              );
            }

            return list.map((item) => {
              const isInbound = item.type === "inbound";
              const isDone = item.status === "Completed" || item.status === "Dispatched";
              const isWorking = item.status === "Unloading" || item.status === "Loading";

              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={isInbound ? `/containers/${item.id}` : `/outbound/${item.id}`}
                  className="block rounded-xl border border-slate-700/60 bg-[#162032] p-3.5 transition hover:border-slate-500 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isInbound
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              : "bg-[#6655E8]/15 text-[#8B7DF0] border border-[#6655E8]/30"
                          }`}
                        >
                          {isInbound ? "Inbound" : "Outbound"}
                        </span>
                        <span className="font-bold text-white text-sm">{item.ref}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        <span className="text-slate-400">PO:</span> {item.po || "N/A"} ·{" "}
                        <span className="text-slate-400">{isInbound ? "From:" : "To:"}</span> {item.party}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Equipment: {item.containerEquipment} · {item.date}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isDone
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : isWorking
                            ? "bg-[#6655E8]/20 text-[#8B7DF0] border border-[#6655E8]/30"
                            : "bg-[#202A3D] text-slate-300 border border-slate-700"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-[11px] font-medium text-[#8B7DF0] hover:text-[#a599f5] flex items-center gap-1 mt-1">
                        Open Workflow →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
