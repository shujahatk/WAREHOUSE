"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import type { OperationScheduleView } from "@/domain/view";
import { PageTitle } from "@/components/ref/chrome";
import { ScheduleListView } from "@/components/schedules/schedule-list-view";
import { ScheduleCalendarView } from "@/components/schedules/schedule-calendar-view";
import { LoadingScheduleModal } from "@/components/schedules/loading-schedule-modal";
import { ScheduleDetailsDrawer } from "@/components/schedules/schedule-details-drawer";
import { WorkerScheduleModal } from "@/components/worker/worker-schedule-modal";

export default function LoadingSchedulePage() {
  const { state } = useDemo();
  const { identity } = useSession();
  const isOffice = identity.role === "owner" || identity.role === "manager";

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<OperationScheduleView | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<OperationScheduleView | null>(null);

  const isWorker = identity.role === "worker";

  // Loading schedules only (strictly scoped to assigned worker if Worker role)
  const loadingSchedules = useMemo(() => {
    return (state.schedules || []).filter((s) => {
      if (s.type !== "loading") return false;
      if (isWorker) {
        const matchId = Boolean(s.assignedWorkerId && identity.id && s.assignedWorkerId === identity.id);
        const matchName = Boolean(s.assignedWorkerName && identity.name && s.assignedWorkerName.toLowerCase() === identity.name.toLowerCase());
        return matchId || matchName;
      }
      return true;
    });
  }, [state.schedules, isWorker, identity.id, identity.name]);

  // KPIs
  const scheduledCount = loadingSchedules.filter((s) => s.status === "scheduled").length;
  const inProgressCount = loadingSchedules.filter((s) => s.status === "in_progress").length;
  const pendingVerifyCount = loadingSchedules.filter((s) => s.status === "submitted" || s.status === "resubmitted").length;
  const completedCount = loadingSchedules.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title="Loading Schedules"
          subtitle="Plan, schedule, and monitor outbound container loading operations and worker assignments."
        />

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === "list"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              List View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === "calendar"
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              Calendar View
            </button>
          </div>

          {/* Create Button (Staff Only) */}
          {identity.role === "manager" ? (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors flex items-center gap-1.5"
            >
              <span>+</span> New Loading Schedule
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Scheduled</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">{scheduledCount}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">Awaiting start</div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs">
          <div className="text-xs font-medium text-amber-700 uppercase tracking-wider">In Progress</div>
          <div className="text-2xl font-bold text-amber-900 mt-1 tabular-nums">{inProgressCount}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Being loaded</div>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 shadow-2xs">
          <div className="text-xs font-medium text-purple-700 uppercase tracking-wider">Pending Verify</div>
          <div className="text-2xl font-bold text-purple-900 mt-1 tabular-nums">{pendingVerifyCount}</div>
          <div className="text-[11px] text-purple-600 mt-0.5">Submitted by worker</div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Completed</div>
          <div className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">{completedCount}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Dispatched</div>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === "list" ? (
        <ScheduleListView
          schedules={loadingSchedules}
          typeFilter="loading"
          onSelectSchedule={(sched) => setSelectedSchedule(sched)}
          onEditSchedule={identity.role === "manager" ? ((sched) => setEditingSchedule(sched)) : undefined}
        />
      ) : (
        <ScheduleCalendarView
          schedules={loadingSchedules}
          typeFilter="loading"
          onSelectSchedule={(sched) => setSelectedSchedule(sched)}
        />
      )}

      {/* Create / Edit Modal */}
      <LoadingScheduleModal
        isOpen={isCreateModalOpen || Boolean(editingSchedule)}
        initialSchedule={editingSchedule}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingSchedule(null);
        }}
      />

      {/* Worker Console Modal */}
      {isWorker && (
        <WorkerScheduleModal
          schedule={selectedSchedule}
          isOpen={Boolean(selectedSchedule)}
          onClose={() => setSelectedSchedule(null)}
        />
      )}

      {/* Details Drawer (Staff & Admin) */}
      {!isWorker && (
        <ScheduleDetailsDrawer
          schedule={selectedSchedule}
          isOpen={Boolean(selectedSchedule)}
          onClose={() => setSelectedSchedule(null)}
          onEdit={identity.role === "manager" ? ((sched) => setEditingSchedule(sched)) : undefined}
        />
      )}
    </div>
  );
}
