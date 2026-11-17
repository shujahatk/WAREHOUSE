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

  // Demurrage monitoring for active unloading
  const unloadingContainers = scopedContainers.filter(
    (c) => c.status === "Unloading" && Boolean(c.demurrage?.startedAt)
  );
  const now = useLiveNow(unloadingContainers.length > 0);

  const criticalDemurrageContainer = unloadingContainers.find((c) => {
    if (!now) return false;
    const snap = demurrageSnapshot(c, now);
    return snap.overtime;
  }) ?? unloadingContainers[0];

  const demurrageSnap = criticalDemurrageContainer && now
    ? demurrageSnapshot(criticalDemurrageContainer, now)
    : null;

  // Operational metrics
  const inboundWorking = scopedContainers.filter((c) => c.status === "Unloading");
  const inboundPending = scopedContainers.filter((c) => c.status !== "Completed" && c.status !== "Unloading");
  const inboundCompleted = scopedContainers.filter((c) => c.status === "Completed");

  const outboundWorking = scopedOutbound.filter((o) => o.status === "Loading");
  const outboundPending = scopedOutbound.filter((o) => o.status !== "Dispatched" && o.status !== "Loading");
  const outboundCompleted = scopedOutbound.filter((o) => o.status === "Dispatched");

  const inProgressTotal = inboundWorking.length + outboundWorking.length;
  const pendingTotal = inboundPending.length + outboundPending.length;
  const completedTotal = inboundCompleted.length + outboundCompleted.length;

  // Requests created by this worker
  const myRequests = (state.generalRequests || []).filter((r) => r.createdByName === identity.name);
  const pendingRequestsCount = myRequests.filter(
    (r) => r.status === "submitted" || r.status === "under_review"
  ).length;

  const todayDateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Worker Shift Welcome Header */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-500/20" />
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                Shift Active
              </span>
              <span className="text-neutral-400">·</span>
              <span className="text-xs font-medium text-neutral-600">
                {todayDateStr}
              </span>
            </div>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
              Hello, {identity.name}
            </h1>
            <p className="mt-0.5 text-xs text-neutral-600">
              Assigned depot: <strong className="text-neutral-900">{identity.warehouse ?? "Bornem"}</strong>. Check active operations and pending shipments below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              {identity.warehouse ?? "Depot"} Console
            </span>
          </div>
        </div>

        {/* 3-State Operational Task Summary */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-neutral-200/80 pt-3 text-center">
          <div className="rounded-lg bg-blue-50/80 border border-blue-200/80 p-2.5">
            <span className="text-[11px] font-semibold text-blue-800 block">In Progress</span>
            <span className="text-xl font-bold text-blue-900">{inProgressTotal}</span>
          </div>
          <div className="rounded-lg bg-amber-50/80 border border-amber-200/80 p-2.5">
            <span className="text-[11px] font-semibold text-amber-800 block">Pending Work</span>
            <span className="text-xl font-bold text-amber-900">{pendingTotal}</span>
          </div>
          <div className="rounded-lg bg-emerald-50/80 border border-emerald-200/80 p-2.5">
            <span className="text-[11px] font-semibold text-emerald-800 block">Completed</span>
            <span className="text-xl font-bold text-emerald-900">{completedTotal}</span>
          </div>
        </div>
      </div>

      {/* 2. Critical Demurrage / Active Timer Card (if applicable) */}
      {criticalDemurrageContainer ? (
        <div
          className={`rounded-xl border p-4 shadow-2xs transition-all ${
            demurrageSnap?.overtime
              ? "border-rose-300 bg-rose-50 text-rose-950"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  demurrageSnap?.overtime ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                }`}
              >
                <Icon name="bell" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold tracking-wider uppercase ${
                      demurrageSnap?.overtime ? "text-rose-800" : "text-amber-900"
                    }`}
                  >
                    {demurrageSnap?.overtime ? "Demurrage Charge Overtime" : "Active Unloading Timer"}
                  </span>
                  <span className="font-mono text-xs font-bold">
                    {criticalDemurrageContainer.containerNumber || criticalDemurrageContainer.number}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-700">
                  {demurrageLabel(criticalDemurrageContainer, now)}
                  {demurrageSnap?.overtime && demurrageSnap.chargeEUR > 0
                    ? ` · Accumulated charge: ${formatEuro(demurrageSnap.chargeEUR)}`
                    : " · Free allowance: 120 minutes"}
                </p>
                <p className="mt-1 text-[11px] text-neutral-600">
                  What to do: Complete unloading and record materials to stop demurrage calculation.
                </p>
              </div>
            </div>
            <Link
              href={`/containers/${criticalDemurrageContainer.number}`}
              className={`inline-flex h-11 min-h-[44px] items-center justify-center rounded-xl px-4 text-xs font-bold text-white shadow-xs transition active:scale-95 shrink-0 ${
                demurrageSnap?.overtime
                  ? "bg-rose-700 hover:bg-rose-800"
                  : "bg-amber-800 hover:bg-amber-900"
              }`}
            >
              Resume Unloading Container →
            </Link>
          </div>
        </div>
      ) : null}

      {/* 3. Primary Operational Actions (Large Touch Buttons) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/containers"
          className="flex h-16 min-h-[56px] items-center justify-between rounded-xl bg-emerald-800 px-4 text-white shadow-xs transition hover:bg-emerald-900 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700/60 text-white">
              <Icon name="containers" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-tight">Inbound Unloading</p>
              <p className="text-xs text-emerald-100/90 font-normal mt-0.5">
                {scopedContainers.filter((c) => c.status !== "Completed").length} container(s) awaiting action
              </p>
            </div>
          </div>
          <span className="text-lg font-bold">→</span>
        </Link>

        <Link
          href="/outbound"
          className="flex h-16 min-h-[56px] items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 text-neutral-900 shadow-2xs transition hover:bg-neutral-50 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
              <Icon name="outbound" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-tight">Outbound Loading</p>
              <p className="text-xs text-neutral-500 font-normal mt-0.5">
                {scopedOutbound.filter((o) => o.status !== "Dispatched").length} shipment(s) scheduled
              </p>
            </div>
          </div>
          <span className="text-lg font-bold text-neutral-500">→</span>
        </Link>
      </div>

      {/* 4. Assigned Operations List */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-2 border-b border-neutral-200/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900">Current Assigned Operations</h2>
            <p className="text-xs text-neutral-500">
              Select an operation to record weights, upload photos, or complete work
            </p>
          </div>

          {/* Segmented Filter */}
          <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                activeTab === "all"
                  ? "bg-white text-neutral-900 shadow-2xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              All ({scopedContainers.length + scopedOutbound.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inbound")}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                activeTab === "inbound"
                  ? "bg-white text-neutral-900 shadow-2xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              Inbound ({scopedContainers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("outbound")}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                activeTab === "outbound"
                  ? "bg-white text-neutral-900 shadow-2xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              Outbound ({scopedOutbound.length})
            </button>
          </div>
        </div>

        {/* List of Shipments */}
        <div className="mt-3.5 space-y-2.5">
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
                <div className="py-8 text-center text-xs text-neutral-500">
                  No active operations currently assigned to {identity.warehouse ?? "this depot"}.
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
                  className="block rounded-xl border border-neutral-200/90 bg-neutral-50/70 p-3.5 transition-all hover:border-emerald-300 hover:bg-white hover:shadow-2xs active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isInbound
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {isInbound ? "Inbound" : "Outbound"}
                        </span>
                        <span className="font-bold text-neutral-900 text-sm">{item.ref}</span>
                        {item.po ? (
                          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700">
                            {item.po}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-neutral-700">
                        <span className="text-neutral-500">{isInbound ? "Supplier:" : "Customer:"}</span>{" "}
                        <strong className="text-neutral-900">{item.party || "Not set"}</strong>
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        Equipment: {item.containerEquipment} · Date: {item.date}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isDone
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : isWorking
                            ? "bg-blue-100 text-blue-800 border border-blue-300"
                            : "bg-neutral-100 text-neutral-700 border border-neutral-300"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1">
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

      {/* 5. Quick Stock Balance & My Requests Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/inventory"
          className="group rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold text-neutral-800">Warehouse Stock on Hand</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Icon name="inventory" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            {formatKg(totalStockKg)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {stock.length} materials registered at {identity.warehouse ?? "depot"}
          </p>
        </Link>

        <Link
          href="/tasks"
          className="group rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold text-neutral-800">My Requests</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              <Icon name="documents" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            {myRequests.length}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {pendingRequestsCount} request(s) awaiting Admin approval
          </p>
        </Link>
      </div>
    </div>
  );
}
