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
  type OperationScheduleView,
} from "@/domain/view";
import { Icon } from "@/components/icons";
import { WorkerScheduleModal } from "./worker-schedule-modal";

export function WorkerDashboard() {
  const { state } = useDemo();
  const { identity } = useSession();
  const [activeTab, setActiveTab] = useState<"all_schedules" | "unloading_schedules" | "loading_schedules" | "legacy_shipments">("all_schedules");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSchedule, setSelectedSchedule] = useState<OperationScheduleView | null>(null);

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

  // Worker's assigned operation schedules
  const allSchedules = state.schedules ?? [];
  const mySchedules = allSchedules.filter((s) => {
    if (s.assignedWorkerId && identity.id && s.assignedWorkerId === identity.id) return true;
    if (s.assignedWorkerName && s.assignedWorkerName.toLowerCase() === identity.name.toLowerCase()) return true;
    // If not strictly assigned, visible if in worker's warehouse
    if (!s.assignedWorkerId && identity.warehouse && s.warehouseName === identity.warehouse) return true;
    return true; // worker has visibility to warehouse operations
  });

  const schedulesScheduled = mySchedules.filter((s) => s.status === "scheduled");
  const schedulesInProgress = mySchedules.filter((s) => s.status === "in_progress" || s.status === "draft");
  const schedulesReturned = mySchedules.filter((s) => s.status === "returned_for_correction");
  const schedulesSubmitted = mySchedules.filter((s) => s.status === "submitted" || s.status === "resubmitted");
  const schedulesCompleted = mySchedules.filter((s) => s.status === "completed");

  // Operational metrics
  const inboundWorking = scopedContainers.filter((c) => c.status === "Unloading");
  const inboundPending = scopedContainers.filter((c) => c.status !== "Completed" && c.status !== "Unloading");
  const inboundCompleted = scopedContainers.filter((c) => c.status === "Completed");

  const outboundWorking = scopedOutbound.filter((o) => o.status === "Loading");
  const outboundPending = scopedOutbound.filter((o) => o.status !== "Dispatched" && o.status !== "Loading");
  const outboundCompleted = scopedOutbound.filter((o) => o.status === "Dispatched");

  const inProgressTotal = inboundWorking.length + outboundWorking.length + schedulesInProgress.length;
  const pendingTotal = inboundPending.length + outboundPending.length + schedulesScheduled.length + schedulesReturned.length;
  const completedTotal = inboundCompleted.length + outboundCompleted.length + schedulesCompleted.length;

  const todayDateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Filtered schedules for current tab
  const displayedSchedules = mySchedules.filter((s) => {
    if (activeTab === "unloading_schedules" && s.type !== "unloading") return false;
    if (activeTab === "loading_schedules" && s.type !== "loading") return false;

    if (statusFilter === "scheduled" && s.status !== "scheduled") return false;
    if (statusFilter === "in_progress" && s.status !== "in_progress" && s.status !== "draft") return false;
    if (statusFilter === "returned" && s.status !== "returned_for_correction") return false;
    if (statusFilter === "submitted" && s.status !== "submitted" && s.status !== "resubmitted") return false;
    if (statusFilter === "completed" && s.status !== "completed") return false;

    return true;
  });

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
              Assigned depot: <strong className="text-neutral-900">{identity.warehouse ?? "Bornem"}</strong>. Review your assigned loading & unloading schedules below.
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

      {/* Returned for Correction Priority Banner */}
      {schedulesReturned.length > 0 ? (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  {schedulesReturned.length} Operation(s) Returned for Correction
                </h3>
                <p className="mt-0.5 text-xs text-amber-800">
                  Warehouse staff has requested adjustments to recorded weights, packaging, or attachments.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab("all_schedules");
                setStatusFilter("returned");
              }}
              className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-900 shrink-0"
            >
              Review Now →
            </button>
          </div>
        </div>
      ) : null}

      {/* 2. Critical Demurrage Alert */}
      {criticalDemurrageContainer ? (
        <div
          className={`rounded-xl border p-4 shadow-2xs transition-all ${demurrageSnap?.overtime
            ? "border-rose-300 bg-rose-50 text-rose-950"
            : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${demurrageSnap?.overtime ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                  }`}
              >
                <Icon name="bell" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold tracking-wider uppercase ${demurrageSnap?.overtime ? "text-rose-800" : "text-amber-900"
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
              </div>
            </div>
            <Link
              href={`/containers/${criticalDemurrageContainer.number}`}
              className={`inline-flex h-11 min-h-[44px] items-center justify-center rounded-xl px-4 text-xs font-bold text-white shadow-xs transition active:scale-95 shrink-0 ${demurrageSnap?.overtime ? "bg-rose-700 hover:bg-rose-800" : "bg-amber-800 hover:bg-amber-900"
                }`}
            >
              Resume Unloading Container →
            </Link>
          </div>
        </div>
      ) : null}

      {/* 3. ASSIGNED OPERATIONS & SCHEDULES MODULE */}
      <div className="rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs space-y-4">
        {/* Module Header & Tab Bar */}
        <div className="flex flex-col gap-2.5 border-b border-neutral-200/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900">Assigned Operational Work</h2>
            <p className="text-xs text-neutral-500">
              Select an operation to start, record weights & package units, take photos, or submit for staff verification
            </p>
          </div>

          {/* Destination Tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all_schedules")}
              className={`rounded-md px-3 py-1 font-semibold transition ${activeTab === "all_schedules"
                ? "bg-white text-neutral-900 shadow-2xs"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              All Schedules ({mySchedules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("unloading_schedules")}
              className={`rounded-md px-3 py-1 font-semibold transition ${activeTab === "unloading_schedules"
                ? "bg-white text-neutral-900 shadow-2xs"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              My Unloading ({mySchedules.filter((s) => s.type === "unloading").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("loading_schedules")}
              className={`rounded-md px-3 py-1 font-semibold transition ${activeTab === "loading_schedules"
                ? "bg-white text-neutral-900 shadow-2xs"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              My Loading ({mySchedules.filter((s) => s.type === "loading").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("legacy_shipments")}
              className={`rounded-md px-3 py-1 font-semibold transition ${activeTab === "legacy_shipments"
                ? "bg-white text-neutral-900 shadow-2xs"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              Containers ({scopedContainers.length + scopedOutbound.length})
            </button>
          </div>
        </div>

        {/* Schedules Filter Chips (When viewing schedules) */}
        {activeTab !== "legacy_shipments" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-neutral-600 mr-1">Status:</span>
            {[
              { id: "all", label: "All" },
              { id: "scheduled", label: `Upcoming (${schedulesScheduled.length})` },
              { id: "in_progress", label: `In Progress (${schedulesInProgress.length})` },
              { id: "returned", label: `Returned (${schedulesReturned.length})` },
              { id: "submitted", label: `Submitted (${schedulesSubmitted.length})` },
              { id: "completed", label: `Completed (${schedulesCompleted.length})` },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={`rounded-full px-2.5 py-0.5 font-semibold transition ${statusFilter === chip.id
                  ? "bg-emerald-800 text-white shadow-2xs"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Schedule Cards Content */}
        {activeTab !== "legacy_shipments" ? (
          <div className="space-y-3">
            {displayedSchedules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 py-10 text-center text-xs text-neutral-500">
                No operation schedules matching your selection.
              </div>
            ) : (
              displayedSchedules.map((schedule) => {
                const isUnloading = schedule.type === "unloading";
                const isSched = schedule.status === "scheduled";
                const isWorking = schedule.status === "in_progress" || schedule.status === "draft";
                const isRet = schedule.status === "returned_for_correction";
                const isSub = schedule.status === "submitted" || schedule.status === "resubmitted";
                const isDone = schedule.status === "completed";

                return (
                  <div
                    key={schedule.id}
                    onClick={() => setSelectedSchedule(schedule)}
                    className="cursor-pointer rounded-xl border border-neutral-200/90 bg-neutral-50/70 p-4 transition-all hover:border-emerald-400 hover:bg-white hover:shadow-2xs active:scale-[0.99]"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isUnloading
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                          >
                            {isUnloading ? "Unloading (Incoming)" : "Loading (Outgoing)"}
                          </span>
                          <span className="font-mono text-sm font-bold text-neutral-900">
                            {schedule.scheduleNumber}
                          </span>
                          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700">
                            {schedule.poSoNumber}
                          </span>
                        </div>

                        <p className="mt-1.5 text-xs text-neutral-800 font-semibold">
                          <span className="text-neutral-500 font-normal">
                            {isUnloading ? "Supplier:" : "Customer:"}
                          </span>{" "}
                          {schedule.partnerName}
                        </p>

                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          Scheduled: <strong className="text-neutral-800">{schedule.scheduledDate}</strong> · Depot: {schedule.warehouseName}
                          {schedule.annex7Required ? " · Annex VII" : ""}
                        </p>

                        {/* Materials Summary */}
                        {schedule.items && schedule.items.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {schedule.items.map((it, i) => (
                              <span
                                key={it.id || i}
                                className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 border border-neutral-200"
                              >
                                <span>{it.materialName}</span>
                                <span className="text-neutral-400">·</span>
                                <span className="font-bold">{formatKg(it.netWeightKg)}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {/* Right: Status Pill & Action Prompt */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${isDone
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : isRet
                              ? "bg-amber-100 text-amber-900 border border-amber-400 animate-pulse"
                              : isSub
                                ? "bg-blue-100 text-blue-800 border border-blue-300"
                                : isWorking
                                  ? "bg-purple-100 text-purple-800 border border-purple-300"
                                  : "bg-neutral-200 text-neutral-800"
                            }`}
                        >
                          {isRet
                            ? "Action Required (Returned)"
                            : isSub
                              ? "Awaiting Staff Review"
                              : schedule.status.replace(/_/g, " ")}
                        </span>

                        <span className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1">
                          {isSched
                            ? "Start Operation →"
                            : isWorking || isRet
                              ? "Record Weights & Photos →"
                              : "View Details →"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Legacy Containers / Shipments list */
          <div className="space-y-2.5">
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
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isInbound
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
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${isDone
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
        )}
      </div>

      {/* 4. Quick Stock Balance */}
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
          href="/schedules/unloading"
          className="group rounded-xl border border-neutral-200/90 bg-white p-4 shadow-2xs hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold text-neutral-800">Schedule Calendar</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
              <Icon name="containers" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            {mySchedules.length}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Total operations assigned across all dates
          </p>
        </Link>
      </div>

      {/* 5. Worker Schedule Execution Modal */}
      <WorkerScheduleModal
        schedule={selectedSchedule}
        isOpen={Boolean(selectedSchedule)}
        onClose={() => setSelectedSchedule(null)}
      />
    </div>
  );
}
