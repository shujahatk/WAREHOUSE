"use client";

import { useMemo, useState } from "react";
import type { OperationScheduleView } from "@/domain/view";
import { StatusPill } from "@/components/ref/chrome";
import { Icon } from "@/components/icons";

type Props = {
  schedules: OperationScheduleView[];
  onSelectSchedule: (schedule: OperationScheduleView) => void;
  typeFilter?: "all" | "unloading" | "loading";
};

export function ScheduleCalendarView({ schedules, onSelectSchedule, typeFilter = "all" }: Props) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  // Calendar days calculation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    // Adjust so week starts on Monday (0 is Monday, 6 is Sunday)
    const startingOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{
      date: Date;
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    const now = new Date();
    const nowStr = now.toISOString().slice(0, 10);

    // Prev month days
    for (let i = startingOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      const str = d.toISOString().slice(0, 10);
      days.push({
        date: d,
        dateString: str,
        dayNumber: daysInPrevMonth - i,
        isCurrentMonth: false,
        isToday: str === nowStr,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const str = dateObj.toISOString().slice(0, 10);
      days.push({
        date: dateObj,
        dateString: str,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: str === nowStr,
      });
    }

    // Next month days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const dateObj = new Date(year, month + 1, d);
      const str = dateObj.toISOString().slice(0, 10);
      days.push({
        date: dateObj,
        dateString: str,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: str === nowStr,
      });
    }

    return days;
  }, [year, month]);

  // Group schedules by date string (YYYY-MM-DD)
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, OperationScheduleView[]>();
    for (const sched of schedules) {
      if (typeFilter !== "all" && sched.type !== typeFilter) continue;
      const dateKey = (sched.scheduledDate || "").slice(0, 10);
      if (!dateKey) continue;
      const list = map.get(dateKey) || [];
      list.push(sched);
      map.set(dateKey, list);
    }
    return map;
  }, [schedules, typeFilter]);

  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      {/* Calendar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/50 p-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-neutral-900">
            {monthNames[month]} {year}
          </h3>
          <span className="rounded-full bg-neutral-200/60 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
            {schedules.length} {typeFilter === "all" ? "total schedules" : `${typeFilter} schedules`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={today}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors shadow-xs"
          >
            Today
          </button>
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white shadow-xs">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors rounded-l-lg border-r border-neutral-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors rounded-r-lg"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-100/60 text-center text-xs font-semibold uppercase tracking-wider text-neutral-600">
        {daysOfWeek.map((day) => (
          <div key={day} className="py-2.5">
            {day}
          </div>
        ))}
      </div>

      {/* Grid of Days */}
      <div className="grid grid-cols-7 divide-x divide-y divide-neutral-200 bg-neutral-200">
        {calendarDays.map((cell) => {
          const daySchedules = schedulesByDate.get(cell.dateString) || [];
          return (
            <div
              key={cell.dateString}
              className={`min-h-[110px] sm:min-h-[130px] p-2 transition-colors flex flex-col justify-between ${
                cell.isCurrentMonth ? "bg-white" : "bg-neutral-50/70 text-neutral-400"
              } ${cell.isToday ? "bg-emerald-50/30" : ""}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    cell.isToday
                      ? "bg-emerald-600 text-white font-bold"
                      : cell.isCurrentMonth
                      ? "text-neutral-800"
                      : "text-neutral-400"
                  }`}
                >
                  {cell.dayNumber}
                </span>
                {daySchedules.length > 0 ? (
                  <span className="text-[10px] font-medium text-neutral-500">
                    {daySchedules.length} op{daySchedules.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>

              {/* Day's schedules */}
              <div className="space-y-1.5 overflow-y-auto max-h-[90px] pr-0.5">
                {daySchedules.map((s) => {
                  const isUnloading = s.type === "unloading";
                  const statusColors: Record<string, string> = {
                    scheduled: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
                    in_progress: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
                    draft: "bg-neutral-100 text-neutral-700 border-neutral-300 hover:bg-neutral-200",
                    submitted: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
                    resubmitted: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100",
                    returned_for_correction: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
                    completed: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
                  };
                  const colorClass = statusColors[s.status] || "bg-neutral-50 text-neutral-700 border-neutral-200";

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSchedule(s)}
                      className={`w-full text-left rounded-md border p-1.5 transition-all text-xs shadow-2xs cursor-pointer block ${colorClass}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold truncate">
                          {isUnloading ? "📥" : "📤"} {s.poSoNumber}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider font-bold opacity-80">
                          {s.status === "in_progress" ? "In Prog" : s.status === "submitted" ? "Verify" : s.status === "completed" ? "Done" : s.status}
                        </span>
                      </div>
                      <div className="text-[11px] truncate text-neutral-600 mt-0.5">
                        {s.partnerName} · {s.assignedWorkerName || "Worker"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
