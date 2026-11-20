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
  const [activeTab, setActiveTab] = useState<"all" | "unloading" | "loading" | "containers">("all");
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

  // Worker's assigned operation schedules (strictly assigned only)
  const allSchedules = state.schedules ?? [];
  const mySchedules = allSchedules.filter((s) => {
    if (s.assignedWorkerId && identity.id && s.assignedWorkerId === identity.id) return true;
    if (s.assignedWorkerName && s.assignedWorkerName.toLowerCase() === identity.name.toLowerCase()) return true;
    return false;
  });

  const schedulesScheduled = mySchedules.filter((s) => s.status === "scheduled");
  const schedulesInProgress = mySchedules.filter((s) => s.status === "in_progress" || s.status === "draft");
  const schedulesReturned = mySchedules.filter((s) => s.status === "returned_for_correction");
  const schedulesSubmitted = mySchedules.filter((s) => s.status === "submitted" || s.status === "resubmitted");
  const schedulesCompleted = mySchedules.filter((s) => s.status === "completed");

  const todayDateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  // Filtered schedules for current tab
  const displayedSchedules = mySchedules.filter((s) => {
    if (activeTab === "unloading" && s.type !== "unloading") return false;
    if (activeTab === "loading" && s.type !== "loading") return false;

    if (statusFilter === "scheduled" && s.status !== "scheduled") return false;
    if (statusFilter === "in_progress" && s.status !== "in_progress" && s.status !== "draft") return false;
    if (statusFilter === "returned" && s.status !== "returned_for_correction") return false;
    if (statusFilter === "submitted" && s.status !== "submitted" && s.status !== "resubmitted") return false;
    if (statusFilter === "completed" && s.status !== "completed") return false;

    return true;
  });

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Header Bar: Compact Operator Console */}
      <div className="rounded-2xl border border-neutral-200/90 bg-white p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Shift Active
              </span>
              <span className="text-neutral-300">·</span>
              <span className="text-xs font-semibold text-neutral-600">
                {identity.warehouse ?? "Bornem"} Depot
              </span>
              <span className="text-neutral-300">·</span>
              <span className="text-xs text-neutral-500">{todayDateStr}</span>
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
              Welcome, {identity.name}
            </h1>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-center">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Assigned</span>
              <span className="text-base font-bold text-neutral-900">{mySchedules.length}</span>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-center">
              <span className="text-[10px] font-bold uppercase text-purple-700 block">In Progress</span>
              <span className="text-base font-bold text-purple-900">{schedulesInProgress.length}</span>
            </div>
            {schedulesReturned.length > 0 && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-center animate-pulse">
                <span className="text-[10px] font-bold uppercase text-rose-700 block">Action Req.</span>
                <span className="text-base font-bold text-rose-900">{schedulesReturned.length}</span>
              </div>
            )}
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-center">
              <span className="text-[10px] font-bold uppercase text-blue-700 block">Submitted</span>
              <span className="text-base font-bold text-blue-900">{schedulesSubmitted.length}</span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center">
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">Completed</span>
              <span className="text-base font-bold text-emerald-900">{schedulesCompleted.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Priority Alert: Operations Returned for Correction */}
      {schedulesReturned.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-400 bg-rose-50/90 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-bold text-rose-950">
                  {schedulesReturned.length} Operation(s) Returned for Correction
                </h3>
                <p className="mt-0.5 text-xs text-rose-800">
                  Warehouse staff requested updates to recorded scale weights, packaging tare, or photo evidence.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab("all");
                setStatusFilter("returned");
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-rose-700 px-4 text-xs font-bold text-white shadow-xs hover:bg-rose-800 transition shrink-0"
            >
              Review Returned Operations →
            </button>
          </div>
        </div>
      )}

      {/* Demurrage Alert if Overtime */}
      {criticalDemurrageContainer && demurrageSnap?.overtime && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <Icon name="bell" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-rose-900">Demurrage Overtime</span>
                  <span className="font-mono text-xs font-bold">
                    {criticalDemurrageContainer.containerNumber || criticalDemurrageContainer.number}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-700">
                  {demurrageLabel(criticalDemurrageContainer, now)} · Accumulated: {formatEuro(demurrageSnap.chargeEUR)}
                </p>
              </div>
            </div>
            <Link
              href={`/containers/${criticalDemurrageContainer.number}`}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-rose-700 px-4 text-xs font-bold text-white shadow-xs hover:bg-rose-800 shrink-0"
            >
              Resume Container Unloading →
            </Link>
          </div>
        </div>
      )}

      {/* 2. Assigned Operations List */}
      <div className="rounded-2xl border border-neutral-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-col gap-2.5 border-b border-neutral-200/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                activeTab === "all" ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              All Assigned ({mySchedules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("unloading")}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                activeTab === "unloading" ? "bg-white text-emerald-900 shadow-2xs" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              ↓ Unloading ({mySchedules.filter((s) => s.type === "unloading").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("loading")}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                activeTab === "loading" ? "bg-white text-blue-900 shadow-2xs" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              ↑ Loading ({mySchedules.filter((s) => s.type === "loading").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("containers")}
              className={`rounded-lg px-3 py-1 font-semibold transition ${
                activeTab === "containers" ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              Containers ({scopedContainers.length + scopedOutbound.length})
            </button>
          </div>

          {/* Status Filter Pills */}
          {activeTab !== "containers" && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
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
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                    statusFilter === chip.id
                      ? "bg-neutral-900 text-white shadow-2xs"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Schedules Cards View */}
        {activeTab !== "containers" ? (
          <div className="space-y-3">
            {displayedSchedules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 py-12 text-center text-xs text-neutral-500">
                No operation schedules matching your current filters.
              </div>
            ) : (
              displayedSchedules.map((schedule) => {
                const isUnloading = schedule.type === "unloading";
                const isSched = schedule.status === "scheduled";
                const isWorking = schedule.status === "in_progress" || schedule.status === "draft";
                const isRet = schedule.status === "returned_for_correction";
                const isSub = schedule.status === "submitted" || schedule.status === "resubmitted";
                const isDone = schedule.status === "completed";

                // Total calculated net weight for preview
                const totalNetKg = (schedule.items || []).reduce((s, it) => s + (Number(it.netWeightKg) || 0), 0);
                const attachmentsCount = schedule.attachments?.length || 0;

                // Step progress mapping (1 to 4)
                const currentStep = isDone ? 4 : isSub ? 3 : isWorking || isRet ? 2 : 1;

                return (
                  <div
                    key={schedule.id}
                    onClick={() => setSelectedSchedule(schedule)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md active:scale-[0.99] ${
                      isRet
                        ? "border-rose-400 bg-rose-50/40 hover:bg-white hover:border-rose-500"
                        : isUnloading
                        ? "border-neutral-200/90 bg-white hover:border-emerald-500"
                        : "border-neutral-200/90 bg-white hover:border-blue-500"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left: Direction Badge, Operation & Party */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${
                              isUnloading
                                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                : "bg-blue-100 text-blue-900 border-blue-300"
                            }`}
                          >
                            {isUnloading ? "↓ INBOUND UNLOADING" : "↑ OUTBOUND LOADING"}
                          </span>

                          <span className="font-mono text-sm font-bold text-neutral-900">
                            {schedule.scheduleNumber}
                          </span>

                          <span className="rounded bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-800">
                            {schedule.poSoNumber}
                          </span>

                          {schedule.annex7Required && (
                            <span className="rounded bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold">
                              Annex VII
                            </span>
                          )}
                        </div>

                        {/* Customer / Supplier */}
                        <div className="text-xs text-neutral-700">
                          <span className="text-neutral-500">{isUnloading ? "Supplier:" : "Customer:"}</span>{" "}
                          <strong className="text-neutral-900 text-sm font-bold">{schedule.partnerName}</strong>
                          <span className="text-neutral-400 mx-1.5">·</span>
                          <span className="text-neutral-600">Depot: {schedule.warehouseName}</span>
                          <span className="text-neutral-400 mx-1.5">·</span>
                          <span className="text-neutral-600">Date: {schedule.scheduledDate.slice(0, 10)}</span>
                        </div>

                        {/* Materials & Evidence Preview Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {schedule.items && schedule.items.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800 border border-neutral-200">
                              <span>📦 {schedule.items.length} line(s)</span>
                              {totalNetKg > 0 && (
                                <>
                                  <span className="text-neutral-400">·</span>
                                  <strong className="text-neutral-900">{formatKg(totalNetKg)}</strong>
                                </>
                              )}
                            </span>
                          ) : null}

                          {attachmentsCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 border border-neutral-200">
                              <span>📷</span>
                              <span>{attachmentsCount} photo(s)/doc(s)</span>
                            </span>
                          )}

                          {schedule.vehicleRegistrationNumber && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-mono font-medium text-neutral-700 border border-neutral-200">
                              <span>🚛</span>
                              <span>{schedule.vehicleRegistrationNumber}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Stepper Progress & Direct Action Button */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2.5 shrink-0 pt-2 sm:pt-0 border-t border-neutral-100 sm:border-0">
                        {/* 4-step progress dots */}
                        <div className="flex items-center gap-1" title={`Step ${currentStep} of 4`}>
                          {[1, 2, 3, 4].map((stepIdx) => (
                            <span
                              key={stepIdx}
                              className={`h-2 rounded-full transition-all ${
                                stepIdx < currentStep
                                  ? "w-4 bg-emerald-600"
                                  : stepIdx === currentStep
                                  ? isRet
                                    ? "w-6 bg-rose-600 animate-pulse"
                                    : "w-6 bg-emerald-700"
                                  : "w-2 bg-neutral-200"
                              }`}
                            />
                          ))}
                        </div>

                        {/* Direct Action Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSchedule(schedule);
                          }}
                          className={`inline-flex h-9 items-center justify-center gap-1 rounded-xl px-4 text-xs font-bold shadow-xs transition active:scale-95 ${
                            isRet
                              ? "bg-rose-700 text-white hover:bg-rose-800"
                              : isSched
                              ? "bg-emerald-800 text-white hover:bg-emerald-900"
                              : isWorking
                              ? "bg-emerald-800 text-white hover:bg-emerald-900"
                              : isSub
                              ? "border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                              : "border border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
                          }`}
                        >
                          {isRet
                            ? "Fix & Resubmit →"
                            : isSched
                            ? "Start Operation →"
                            : isWorking
                            ? "Record Weights →"
                            : isSub
                            ? "Under Review →"
                            : "View Receipt →"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Containers List */
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
                  <div className="py-12 text-center text-xs text-neutral-500">
                    No active containers currently assigned to {identity.warehouse ?? "this depot"}.
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
                    className="block rounded-2xl border border-neutral-200/90 bg-neutral-50/70 p-3.5 transition-all hover:border-emerald-400 hover:bg-white hover:shadow-2xs active:scale-[0.99]"
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
                        <span className="text-xs font-semibold text-emerald-800 hover:text-emerald-950">
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

      {/* 3. Quick Stock & Schedule Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/inventory"
          className="group rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-2xs hover:border-emerald-400 transition-all"
        >
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold text-neutral-800">Depot Stock on Hand</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Icon name="inventory" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            {formatKg(totalStockKg)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {stock.length} materials registered at {identity.warehouse ?? "Bornem"}
          </p>
        </Link>

        <Link
          href="/schedules/unloading"
          className="group rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-2xs hover:border-emerald-400 transition-all"
        >
          <div className="flex items-center justify-between text-neutral-600">
            <span className="text-xs font-bold text-neutral-800">Operational Schedules</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
              <Icon name="containers" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            {mySchedules.length}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Active and upcoming operations assigned to you
          </p>
        </Link>
      </div>

      {/* 4. Worker Schedule Modal */}
      <WorkerScheduleModal
        schedule={selectedSchedule}
        isOpen={Boolean(selectedSchedule)}
        onClose={() => setSelectedSchedule(null)}
      />
    </div>
  );
}
