"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useIsMounted } from "@/lib/use-mounted";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useLiveNow } from "@/components/ref/live-clock";
import { useSession } from "@/components/shell/auth-gate";
import {
  demurrageLabel,
  formatKg,
  visibleContainers,
  visibleStock,
  type OperationScheduleView,
} from "@/domain/view";
import { canPerform, roleLabel } from "@/lib/permissions";
import { WorkerDashboard } from "@/components/worker/worker-dashboard";
import { Icon } from "@/components/icons";

export function DashboardBoard() {
  const { state } = useDemo();
  const { identity } = useSession();
  const mounted = useIsMounted();
  const currentRole = mounted ? identity.role : "worker";
  const isWorker = currentRole === "worker";

  // Dynamic filter state
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "unloading" | "loading">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [workerFilter, setWorkerFilter] = useState<string>("all");

  const actor = useMemo(
    () => ({
      name: identity.name,
      role: currentRole,
      warehouse: identity.warehouse,
      email: identity.email,
      company: identity.company,
    }),
    [identity.name, currentRole, identity.warehouse, identity.email, identity.company]
  );

  const stock = isWorker ? [] : visibleStock(state, currentRole, identity.warehouse);
  const containers = isWorker ? [] : visibleContainers(state, actor);
  const unloadingContainers = containers.filter((row) => row.status === "Unloading");
  const now = useLiveNow(!isWorker && unloadingContainers.some((row) => Boolean(row.demurrage.startedAt)));

  // Operation schedules list
  const schedules: OperationScheduleView[] = state.schedules ?? [];

  // Filtered schedules according to dynamic filters
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      // Warehouse filter
      if (warehouseFilter !== "all" && s.warehouseName !== warehouseFilter && s.warehouseId !== warehouseFilter) {
        return false;
      }
      // Type filter
      if (typeFilter !== "all" && s.type !== typeFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== "all" && s.status !== statusFilter) {
        return false;
      }
      // Worker filter
      if (workerFilter !== "all" && s.assignedWorkerId !== workerFilter && s.assignedWorkerName !== workerFilter) {
        return false;
      }
      return true;
    });
  }, [schedules, warehouseFilter, typeFilter, statusFilter, workerFilter]);

  // Workers list from accounts
  const workers = useMemo(() => (state.accounts ?? []).filter((u) => u.role === "worker"), [state.accounts]);
  const warehouses = state.directory?.warehouses ?? [
    { id: "wh-bornem", name: "Bornem" },
    { id: "wh-antwerp", name: "Antwerp" },
  ];

  // Worker workload aggregation
  const workerWorkload = useMemo(() => {
    return workers.map((w) => {
      const assigned = schedules.filter((s) => s.assignedWorkerId === w.id || s.assignedWorkerName === w.name);
      const active = assigned.filter((s) => s.status === "in_progress" || s.status === "scheduled" || s.status === "draft").length;
      const submitted = assigned.filter((s) => s.status === "submitted" || s.status === "resubmitted").length;
      const completed = assigned.filter((s) => s.status === "completed").length;
      return {
        id: w.id,
        name: w.name,
        warehouse: w.warehouse,
        active,
        submitted,
        completed,
        total: assigned.length,
      };
    });
  }, [workers, schedules]);

  // Warehouse stock summary
  const byWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stock) {
      map.set(row.warehouse, (map.get(row.warehouse) ?? 0) + row.weightKg);
    }
    return map;
  }, [stock]);

  // Combined operational activity feed
  const recentSchedules = useMemo(
    () =>
      [...schedules]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [schedules]
  );

  // If worker, delegate to specialized worker mobile portal
  if (isWorker) {
    return <WorkerDashboard />;
  }

  // Aggregate Metrics derived from real database records
  const totalUnloading = filteredSchedules.filter((s) => s.type === "unloading");
  const totalLoading = filteredSchedules.filter((s) => s.type === "loading");

  const scheduledOps = filteredSchedules.filter((s) => s.status === "scheduled");
  const inProgressOps = filteredSchedules.filter((s) => s.status === "in_progress" || s.status === "draft");
  const pendingVerificationOps = filteredSchedules.filter((s) => s.status === "submitted" || s.status === "resubmitted");
  const completedOps = filteredSchedules.filter((s) => s.status === "completed");

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueOps = filteredSchedules.filter(
    (s) => s.scheduledDate < todayStr && s.status !== "completed"
  );

  // Material weights (kg)
  const incomingKg = totalUnloading.reduce((sum, s) => sum + s.totalNetWeightKg, 0);
  const outgoingKg = totalLoading.reduce((sum, s) => sum + s.totalNetWeightKg, 0);

  return (
    <div className="space-y-5">
      {/* Header with Quick Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Dashboard & Analytics"
          subtitle={`${identity.name} · ${roleLabel(currentRole)} · Unified Operations Management`}
        />

        {/* Quick Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          {canPerform(currentRole, "create-schedule") ? (
            <>
              <Link
                href="/schedules/unloading"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 shadow-2xs hover:bg-neutral-50"
              >
                <Icon name="containers" />
                <span>+ Unloading Schedule</span>
              </Link>
              <Link
                href="/schedules/loading"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 shadow-2xs hover:bg-neutral-50"
              >
                <Icon name="outbound" />
                <span>+ Loading Schedule</span>
              </Link>
            </>
          ) : null}

          {canPerform(currentRole, "verify-schedule") ? (
            <Link
              href="/verification"
              className="relative inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-800 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-900"
            >
              <Icon name="check" />
              <span>Pending Verification</span>
              {pendingVerificationOps.length > 0 ? (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-neutral-950">
                  {pendingVerificationOps.length}
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Dynamic Filters Bar */}
      <Surface className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-neutral-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-neutral-900">Filters:</span>

            {/* Date Range Filter */}
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {(["all", "today", "week", "month"] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setDateFilter(range)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                    dateFilter === range ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {range === "all" ? "All Time" : range === "week" ? "This Week" : range === "month" ? "This Month" : "Today"}
                </button>
              ))}
            </div>

            {/* Warehouse Filter */}
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="h-8 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 outline-none focus:border-emerald-600"
            >
              <option value="all">All Warehouses</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.name}>
                  {wh.name}
                </option>
              ))}
            </select>

            {/* Operation Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "unloading" | "loading")}
              className="h-8 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 outline-none focus:border-emerald-600"
            >
              <option value="all">All Operations</option>
              <option value="unloading">Unloading (Incoming)</option>
              <option value="loading">Loading (Outgoing)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 outline-none focus:border-emerald-600"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="returned_for_correction">Returned for Correction</option>
              <option value="completed">Completed</option>
            </select>

            {/* Worker Filter */}
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="h-8 rounded-lg border border-neutral-300 bg-white px-2.5 text-xs text-neutral-800 outline-none focus:border-emerald-600"
            >
              <option value="all">All Workers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.warehouse ?? "All"})
                </option>
              ))}
            </select>
          </div>

          {(dateFilter !== "all" || warehouseFilter !== "all" || typeFilter !== "all" || statusFilter !== "all" || workerFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setDateFilter("all");
                setWarehouseFilter("all");
                setTypeFilter("all");
                setStatusFilter("all");
                setWorkerFilter("all");
              }}
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </Surface>

      {/* Primary KPI Grid (8 Cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Unloading Ops */}
        <Surface className="p-4">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Unloading Ops</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="containers" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{totalUnloading.length}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {totalUnloading.filter((s) => s.status === "scheduled").length} scheduled · {totalUnloading.filter((s) => s.status === "in_progress").length} active
          </p>
        </Surface>

        {/* 2. Loading Ops */}
        <Surface className="p-4">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Loading Ops</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="outbound" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{totalLoading.length}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {totalLoading.filter((s) => s.status === "scheduled").length} scheduled · {totalLoading.filter((s) => s.status === "in_progress").length} active
          </p>
        </Surface>

        {/* 3. Pending Verification */}
        <Surface className={`p-4 ${pendingVerificationOps.length > 0 ? "border-amber-300 bg-amber-50/40" : ""}`}>
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">Pending Verification</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <Icon name="check" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-900">{pendingVerificationOps.length}</p>
          <p className="mt-1 text-xs text-amber-700">
            {pendingVerificationOps.length > 0 ? "Requires Staff review & approval" : "All submissions verified"}
          </p>
        </Surface>

        {/* 4. Completed Operations */}
        <Surface className="p-4">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Completed</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <Icon name="check" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-900">{completedOps.length}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {Math.round((completedOps.length / (filteredSchedules.length || 1)) * 100)}% completion rate
          </p>
        </Surface>

        {/* 5. In Progress & Active */}
        <Surface className="p-4">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">In Progress</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="refresh" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-blue-900">{inProgressOps.length}</p>
          <p className="mt-1 text-xs text-neutral-500">Operations underway by workers</p>
        </Surface>

        {/* 6. Overdue Operations */}
        <Surface className={`p-4 ${overdueOps.length > 0 ? "border-rose-300 bg-rose-50/40" : ""}`}>
          <div className="flex items-center justify-between text-neutral-500">
            <span className={`text-xs font-semibold uppercase tracking-wider ${overdueOps.length > 0 ? "text-rose-800" : ""}`}>
              Overdue
            </span>
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${overdueOps.length > 0 ? "bg-rose-100 text-rose-700" : "bg-neutral-100 text-neutral-500"}`}>
              <Icon name="bell" />
            </span>
          </div>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${overdueOps.length > 0 ? "text-rose-900" : "text-neutral-900"}`}>
            {overdueOps.length}
          </p>
          <p className={`mt-1 text-xs ${overdueOps.length > 0 ? "text-rose-700 font-medium" : "text-neutral-500"}`}>
            {overdueOps.length > 0 ? "Past scheduled date & uncompleted" : "None overdue"}
          </p>
        </Surface>

        {/* 7. Total Incoming Weight */}
        <Surface className="p-4">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Incoming Tonnage</span>
            <span className="text-xs font-bold text-neutral-400">NET</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{formatKg(incomingKg)}</p>
          <p className="mt-1 text-xs text-neutral-500">{(incomingKg / 1000).toFixed(2)} MT total inbound</p>
        </Surface>

        {/* 8. Total Outgoing Weight */}
        <Surface className="p-4">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Outgoing Tonnage</span>
            <span className="text-xs font-bold text-neutral-400">NET</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{formatKg(outgoingKg)}</p>
          <p className="mt-1 text-xs text-neutral-500">{(outgoingKg / 1000).toFixed(2)} MT total outbound</p>
        </Surface>
      </div>

      {/* Main 2-Column Dashboard Layout */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left Column (3 spans): Trends, Schedules Stream & Worker Workload */}
        <div className="space-y-4 lg:col-span-3">
          {/* Operational Status Breakdown */}
          <Surface className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Operational Lifecycle Distribution</h2>
                <p className="text-xs text-neutral-500">Current schedule states across warehouses</p>
              </div>
              <span className="text-xs font-semibold text-neutral-500">{filteredSchedules.length} Total</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-center">
                <span className="text-[11px] font-semibold text-neutral-600 block">Scheduled</span>
                <span className="text-lg font-bold text-neutral-900">{scheduledOps.length}</span>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-center">
                <span className="text-[11px] font-semibold text-blue-700 block">In Progress</span>
                <span className="text-lg font-bold text-blue-900">{inProgressOps.length}</span>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-center">
                <span className="text-[11px] font-semibold text-amber-800 block">Pending Review</span>
                <span className="text-lg font-bold text-amber-900">{pendingVerificationOps.length}</span>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                <span className="text-[11px] font-semibold text-emerald-800 block">Completed</span>
                <span className="text-lg font-bold text-emerald-900">{completedOps.length}</span>
              </div>
            </div>
          </Surface>

          {/* Worker Workload Summary */}
          <Surface className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Worker Workload & Allocation</h2>
                <p className="text-xs text-neutral-500">Operations assigned to active warehouse personnel</p>
              </div>
            </div>

            <div className="mt-3 divide-y divide-neutral-100 overflow-x-auto">
              {workerWorkload.length === 0 ? (
                <p className="py-4 text-center text-xs text-neutral-500">No warehouse workers registered.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500 font-semibold">
                      <th className="py-2">Worker</th>
                      <th className="py-2">Depot</th>
                      <th className="py-2 text-center">Active</th>
                      <th className="py-2 text-center">Submitted</th>
                      <th className="py-2 text-center">Done</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {workerWorkload.map((w) => (
                      <tr key={w.id} className="hover:bg-neutral-50/60">
                        <td className="py-2.5 font-semibold text-neutral-900">{w.name}</td>
                        <td className="py-2.5 text-neutral-500">{w.warehouse || "All"}</td>
                        <td className="py-2.5 text-center">
                          <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-800">
                            {w.active}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                            {w.submitted}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                            {w.completed}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-bold text-neutral-900">{w.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Surface>

          {/* Recent Operational Activity Stream */}
          <Surface className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Recent Operational Activity</h2>
                <p className="text-xs text-neutral-500">Live log of loading, unloading & verification events</p>
              </div>
            </div>

            <ul className="mt-3 divide-y divide-neutral-100">
              {recentSchedules.length === 0 ? (
                <li className="py-4 text-center text-xs text-neutral-500">No operational schedules created yet.</li>
              ) : (
                recentSchedules.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            s.type === "unloading" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {s.type}
                        </span>
                        <Link
                          href={s.type === "unloading" ? "/schedules/unloading" : "/schedules/loading"}
                          className="font-mono text-xs font-bold text-neutral-900 hover:text-emerald-800 hover:underline"
                        >
                          {s.scheduleNumber}
                        </Link>
                        <span className="text-xs text-neutral-500">· {s.warehouseName}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-600 truncate">
                        {s.partnerName} · {s.assignedWorkerName} · {formatKg(s.totalNetWeightKg)}
                      </p>
                    </div>
                    <StatusPill label={s.status.replace(/_/g, " ")} />
                  </li>
                ))
              )}
            </ul>
          </Surface>
        </div>

        {/* Right Column (2 spans): Demurrage, Warehouse Stock & Quick Actions */}
        <div className="space-y-4 lg:col-span-2">
          {/* Active Demurrage Alert / Monitor */}
          {unloadingContainers.length > 0 ? (
            <Surface className="border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                  <Icon name="bell" />
                  Active Demurrage Monitor
                </h2>
                <span className="text-[11px] font-bold text-amber-800">
                  {unloadingContainers.length} active
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {unloadingContainers.map((row) => (
                  <li key={row.number} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <Link href={`/containers/${row.number}`} className="font-mono font-bold text-neutral-900 underline">
                      {row.containerNumber || row.number}
                    </Link>
                    <span className="font-medium text-amber-950">{demurrageLabel(row, now)}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          {/* Stock by Warehouse */}
          <Surface className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Depot Stock Levels</h2>
                <p className="text-xs text-neutral-500">On-hand inventory by facility</p>
              </div>
              <Link href="/inventory" className="text-xs font-semibold text-emerald-800 hover:underline">
                View all →
              </Link>
            </div>

            <ul className="mt-3 space-y-2.5">
              {[...byWarehouse.entries()].map(([name, weight]) => (
                <li key={name} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/70 p-2 text-xs">
                  <span className="font-medium text-neutral-800">{name}</span>
                  <span className="font-bold tabular-nums text-neutral-900">{formatKg(weight)}</span>
                </li>
              ))}
              {byWarehouse.size === 0 && (
                <li className="py-2 text-center text-xs text-neutral-500">No stock records on hand.</li>
              )}
            </ul>
          </Surface>

          {/* Operational Quick Actions (No Requests for Staff!) */}
          <Surface className="p-4">
            <h2 className="text-sm font-bold text-neutral-900">Operations Command</h2>
            <div className="mt-3 space-y-2">
              <Link
                href="/schedules/unloading"
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2.5 text-xs font-medium text-neutral-800 hover:border-emerald-300 hover:bg-neutral-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 font-bold">IN</span>
                  <span>Unloading Schedules Calendar</span>
                </div>
                <span>→</span>
              </Link>
              <Link
                href="/schedules/loading"
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2.5 text-xs font-medium text-neutral-800 hover:border-emerald-300 hover:bg-neutral-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-emerald-700 font-bold">OUT</span>
                  <span>Loading Schedules Calendar</span>
                </div>
                <span>→</span>
              </Link>
              <Link
                href="/verification"
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs font-medium text-amber-950 hover:bg-amber-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-amber-700 font-bold">VER</span>
                  <span>Pending Staff Verification</span>
                </div>
                <span className="font-bold text-amber-800">{pendingVerificationOps.length}</span>
              </Link>
              {canPerform(currentRole, "create-order") ? (
                <Link
                  href="/purchases"
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2.5 text-xs font-medium text-neutral-800 hover:border-emerald-300 hover:bg-neutral-50 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 font-bold">PO</span>
                    <span>Purchase & Sales Orders</span>
                  </div>
                  <span>→</span>
                </Link>
              ) : null}
              <Link
                href="/documents#annex-7"
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2.5 text-xs font-medium text-neutral-800 hover:border-emerald-300 hover:bg-neutral-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 font-bold">DOC</span>
                  <span>Annex VII Documents</span>
                </div>
                <span>→</span>
              </Link>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
