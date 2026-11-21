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
  type OperationScheduleView,
} from "@/domain/view";
import { Icon } from "@/components/icons";
import { WORKER_THEME } from "./worker-theme";
import { WorkerScheduleModal } from "./worker-schedule-modal";

export function WorkerShipmentsView({ direction }: { direction: "inbound" | "outbound" }) {
  const { state } = useDemo();
  const { identity } = useSession();
  const [viewMode, setViewMode] = useState<"schedules" | "containers">("schedules");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<OperationScheduleView | null>(null);

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

  // Operation schedules for this direction (strictly scoped to assigned worker)
  const targetScheduleType = isInbound ? "unloading" : "loading";
  const schedules = (state.schedules || []).filter((s) => {
    if (s.type !== targetScheduleType) return false;
    const matchId = Boolean(s.assignedWorkerId && identity.id && s.assignedWorkerId === identity.id);
    const matchName = Boolean(s.assignedWorkerName && identity.name && s.assignedWorkerName.toLowerCase() === identity.name.toLowerCase());
    return matchId || matchName;
  });

  // Demurrage live timer
  const now = useLiveNow(
    isInbound && containers.some((c) => c.status === "Unloading" && Boolean(c.demurrage?.startedAt))
  );

  // Filtered schedules
  const filteredSchedules = schedules.filter((s) => {
    if (statusFilter !== "all") {
      if (statusFilter === "active" && (s.status === "completed")) return false;
      if (statusFilter === "in-progress" && s.status !== "in_progress" && s.status !== "draft") return false;
      if (statusFilter === "done" && s.status !== "completed") return false;
      if (statusFilter === "returned" && s.status !== "returned_for_correction") return false;
    }

    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      s.scheduleNumber.toLowerCase().includes(query) ||
      s.poSoNumber.toLowerCase().includes(query) ||
      s.partnerName.toLowerCase().includes(query) ||
      s.warehouseName.toLowerCase().includes(query)
    );
  });

  // Filter list for legacy containers
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
      {/* Title & Mode Switcher */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
            {isInbound ? "Unloading Operations" : "Loading Operations"}
          </h1>
          <p className="text-xs text-neutral-500">
            {identity.warehouse ? `${identity.warehouse} Depot` : "All Warehouses"} ·{" "}
            {viewMode === "schedules" ? `${filteredSchedules.length} schedule(s)` : `${filteredItems.length} shipment(s)`}
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("schedules")}
            className={`rounded-md px-3 py-1 font-semibold transition ${
              viewMode === "schedules"
                ? "bg-white text-neutral-900 shadow-2xs"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Schedules ({schedules.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("containers")}
            className={`rounded-md px-3 py-1 font-semibold transition ${
              viewMode === "containers"
                ? "bg-white text-neutral-900 shadow-2xs"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Containers ({isInbound ? containers.length : outboundList.length})
          </button>
        </div>
      </div>

      {/* Search Bar & Quick Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${isInbound ? "PO, schedule, supplier..." : "SO, schedule, customer..."}`}
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
            All ({viewMode === "schedules" ? schedules.length : (isInbound ? containers.length : outboundList.length)})
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
            In Progress
          </button>
          {viewMode === "schedules" ? (
            <button
              type="button"
              onClick={() => setStatusFilter("returned")}
              className={`min-h-[40px] whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold transition ${
                statusFilter === "returned"
                  ? "bg-amber-800 text-white shadow-xs"
                  : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              Returned for Correction
            </button>
          ) : null}
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

      {/* SCHEDULES VIEW */}
      {viewMode === "schedules" ? (
        filteredSchedules.length === 0 ? (
          <div className="rounded-xl border border-neutral-200/90 bg-white p-8 text-center shadow-2xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
              <Icon name={isInbound ? "containers" : "outbound"} />
            </div>
            <h3 className="mt-3 text-sm font-bold text-neutral-900">No operation schedules found</h3>
            <p className="mt-1 text-xs text-neutral-500">
              {search ? "Try adjusting your search query." : "No operations matching the selected filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSchedules.map((schedule) => {
              const isSched = schedule.status === "scheduled";
              const isWorking = schedule.status === "in_progress" || schedule.status === "draft";
              const isRet = schedule.status === "returned_for_correction";
              const isSub = schedule.status === "submitted" || schedule.status === "resubmitted";
              const isDone = schedule.status === "completed";

              return (
                <div
                  key={schedule.id}
                  onClick={() => setSelectedSchedule(schedule)}
                  className={`cursor-pointer overflow-hidden rounded-xl border bg-white p-4 transition-all shadow-2xs hover:border-emerald-400 active:scale-[0.99] ${
                    isRet
                      ? "border-amber-300 bg-amber-50/30"
                      : isWorking
                      ? "border-blue-300 bg-blue-50/20"
                      : "border-neutral-200/90"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-neutral-900">
                          {schedule.scheduleNumber}
                        </span>
                        <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700">
                          {schedule.poSoNumber}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-neutral-800 font-semibold">
                        <span className="text-neutral-500 font-normal">
                          {isInbound ? "Supplier:" : "Customer:"}
                        </span>{" "}
                        {schedule.partnerName}
                      </p>

                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        Date: <strong className="text-neutral-800">{schedule.scheduledDate}</strong> · Depot: {schedule.warehouseName}
                        {schedule.annex7Required ? " · Annex VII Required" : ""}
                      </p>

                      {schedule.items && schedule.items.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {schedule.items.map((it, i) => (
                            <span
                              key={it.id || i}
                              className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700"
                            >
                              <span>{it.materialName}</span>
                              <span className="text-neutral-400">·</span>
                              <span className="font-bold">{formatKg(it.netWeightKg)}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isDone
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
                          ? "Returned for Correction"
                          : isSub
                          ? "Under Review"
                          : schedule.status.replace(/_/g, " ")}
                      </span>

                      <span className="text-xs font-bold text-emerald-800 hover:text-emerald-950">
                        {isSched
                          ? "Start Operation →"
                          : isWorking || isRet
                          ? "Open Worksheet →"
                          : "View Details →"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* CONTAINERS VIEW */
        filteredItems.length === 0 ? (
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
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-neutral-900">
                            {item.number}
                          </span>
                          {item.po ? (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                              PO: {item.po}
                            </span>
                          ) : null}
                          {hasAnnex ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              Annex VII
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-neutral-700">
                          <span className="text-neutral-500">{isInbound ? "Supplier:" : "Customer:"}</span>{" "}
                          <strong className="text-neutral-900">{party}</strong>
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          Equipment: {equip || "Not assigned"} · {item.warehouse}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : isWorking
                              ? "bg-blue-100 text-blue-800 border border-blue-300"
                              : "bg-neutral-100 text-neutral-700 border border-neutral-300"
                          }`}
                        >
                          {item.status}
                        </span>
                        <Link
                          href={isInbound ? `/containers/${item.number}` : `/outbound/${item.number}`}
                          className="text-xs font-bold text-emerald-800 hover:text-emerald-950"
                        >
                          Open Workflow →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Schedule Execution Modal */}
      <WorkerScheduleModal
        schedule={selectedSchedule}
        isOpen={Boolean(selectedSchedule)}
        onClose={() => setSelectedSchedule(null)}
      />
    </div>
  );
}
