"use client";

import { useMemo, useState } from "react";
import type { OperationScheduleView } from "@/domain/view";
import { formatKg } from "@/domain/view";
import { StatusPill } from "@/components/ref/chrome";
import { Icon } from "@/components/icons";

type Props = {
  schedules: OperationScheduleView[];
  onSelectSchedule: (schedule: OperationScheduleView) => void;
  onEditSchedule?: (schedule: OperationScheduleView) => void;
  typeFilter?: "all" | "unloading" | "loading";
};

export function ScheduleListView({
  schedules,
  onSelectSchedule,
  onEditSchedule,
  typeFilter = "all",
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"date_desc" | "date_asc">("date_desc");

  // Filtered schedules
  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (typeFilter !== "all" && s.type !== typeFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (warehouseFilter !== "all" && s.warehouseName.toLowerCase() !== warehouseFilter.toLowerCase()) return false;
      if (workerFilter !== "all" && s.assignedWorkerName.toLowerCase() !== workerFilter.toLowerCase()) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesNumber = s.scheduleNumber.toLowerCase().includes(query);
        const matchesPoSo = s.poSoNumber.toLowerCase().includes(query);
        const matchesPartner = s.partnerName.toLowerCase().includes(query);
        const matchesWorker = s.assignedWorkerName.toLowerCase().includes(query);
        const matchesWh = s.warehouseName.toLowerCase().includes(query);
        const matchesMaterials = s.items.some((i) => i.materialName.toLowerCase().includes(query));
        return matchesNumber || matchesPoSo || matchesPartner || matchesWorker || matchesWh || matchesMaterials;
      }

      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.scheduledDate).getTime() || 0;
      const timeB = new Date(b.scheduledDate).getTime() || 0;
      return sortOrder === "date_desc" ? timeB - timeA : timeA - timeB;
    });
  }, [schedules, typeFilter, statusFilter, warehouseFilter, workerFilter, searchTerm, sortOrder]);

  // Unique warehouses and workers for filters
  const uniqueWarehouses = useMemo(() => {
    const set = new Set<string>();
    for (const s of schedules) {
      if (s.warehouseName) set.add(s.warehouseName);
    }
    return Array.from(set).sort();
  }, [schedules]);

  const uniqueWorkers = useMemo(() => {
    const set = new Set<string>();
    for (const s of schedules) {
      if (s.assignedWorkerName) set.add(s.assignedWorkerName);
    }
    return Array.from(set).sort();
  }, [schedules]);

  const statusBadges: Record<string, { label: string; bg: string; text: string; border: string }> = {
    scheduled: { label: "Scheduled", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    in_progress: { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    draft: { label: "Draft Saved", bg: "bg-neutral-100", text: "text-neutral-700", border: "border-neutral-300" },
    submitted: { label: "Pending Verification", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
    resubmitted: { label: "Resubmitted", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
    returned_for_correction: { label: "Returned for Correction", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    completed: { label: "Completed", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by PO/SO, Partner, Worker, or Material..."
              className="w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            ) : null}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="draft">Draft Saved</option>
              <option value="submitted">Pending Verification</option>
              <option value="returned_for_correction">Returned for Correction</option>
              <option value="completed">Completed</option>
            </select>

            {/* Warehouse Filter */}
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">All Warehouses</option>
              {uniqueWarehouses.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>

            {/* Worker Filter */}
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">All Workers</option>
              {uniqueWorkers.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>

            {/* Sort Order */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "date_desc" | "date_asc")}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-emerald-600 focus:outline-none"
            >
              <option value="date_desc">Newest Date First</option>
              <option value="date_asc">Oldest Date First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table / List Container */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <Icon name="containers" className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-neutral-900">No schedules found</h3>
            <p className="mt-1 text-xs text-neutral-500">
              {searchTerm || statusFilter !== "all" || warehouseFilter !== "all" || workerFilter !== "all"
                ? "No operational schedules match your active filters."
                : `No ${typeFilter === "all" ? "" : typeFilter} schedules have been created yet.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Schedule / Order</th>
                  <th scope="col" className="px-4 py-3">Partner</th>
                  <th scope="col" className="px-4 py-3">Warehouse / Date</th>
                  <th scope="col" className="px-4 py-3">Assigned Worker</th>
                  <th scope="col" className="px-4 py-3">Materials / Net KG</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {filtered.map((sched) => {
                  const badge = statusBadges[sched.status] || {
                    label: sched.status,
                    bg: "bg-neutral-100",
                    text: "text-neutral-700",
                    border: "border-neutral-200",
                  };
                  const dateStr = sched.scheduledDate ? new Date(sched.scheduledDate).toLocaleDateString() : "—";
                  const isUnloading = sched.type === "unloading";

                  return (
                    <tr
                      key={sched.id}
                      className="hover:bg-neutral-50/70 transition-colors cursor-pointer"
                      onClick={() => onSelectSchedule(sched)}
                    >
                      {/* Schedule / Order */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isUnloading ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isUnloading ? "Unload" : "Load"}
                          </span>
                          <span className="font-semibold text-neutral-900">{sched.poSoNumber}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">{sched.scheduleNumber}</div>
                      </td>

                      {/* Partner */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-neutral-900">{sched.partnerName}</div>
                        <div className="text-xs text-neutral-500">
                          {sched.origin && sched.destination
                            ? `${sched.origin} → ${sched.destination}`
                            : sched.origin || sched.destination || "—"}
                        </div>
                      </td>

                      {/* Warehouse / Date */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-neutral-900">{sched.warehouseName}</div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1">
                          <span>📅 {dateStr}</span>
                          {sched.annex7Required ? (
                            <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                              Annex VII
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Worker */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-neutral-900">{sched.assignedWorkerName || "Unassigned"}</div>
                        <div className="text-xs text-neutral-500">
                          {sched.actualStartTime
                            ? `Started ${new Date(sched.actualStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : "Not started"}
                        </div>
                      </td>

                      {/* Materials / Net KG */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-neutral-900 tabular-nums">
                          {sched.totalNetWeightKg > 0 ? formatKg(sched.totalNetWeightKg) : "—"}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {sched.items.length} material{sched.items.length !== 1 ? "s" : ""} · {sched.totalPackageCount} pkgs
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              sched.status === "completed"
                                ? "bg-emerald-500"
                                : sched.status === "in_progress"
                                ? "bg-amber-500 animate-pulse"
                                : sched.status === "submitted"
                                ? "bg-purple-500 animate-pulse"
                                : sched.status === "returned_for_correction"
                                ? "bg-rose-500"
                                : "bg-blue-500"
                            }`}
                          />
                          {badge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectSchedule(sched)}
                            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors"
                          >
                            View
                          </button>
                          {onEditSchedule && sched.status !== "completed" ? (
                            <button
                              type="button"
                              onClick={() => onEditSchedule(sched)}
                              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors"
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
