"use client";

import { Surface } from "@/components/ref/chrome";
import { useLiveNow } from "@/components/ref/live-clock";
import { demurrageSnapshot, formatDuration, formatEuro, formatInstant, type DemoContainer } from "@/domain/view";

export function DemurragePanel({ container }: { container: DemoContainer }) {
  const running = container.status === "Unloading" && Boolean(container.demurrage.startedAt);
  const now = useLiveNow(running);
  const snap = demurrageSnapshot(container, now ?? (Date.parse(container.demurrage.startedAt ?? "") || 0));
  const waitingForClock = running && now == null;
  const warn = !waitingForClock && snap.phase === "running" && snap.overtime;

  return (
    <Surface className={`p-4 ${warn ? "border-2 border-neutral-950 bg-neutral-100" : ""}`}>
      <h2 className="text-sm font-semibold">Demurrage</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Free time is {snap.freeMinutes} minutes. After that, the estimate is {formatEuro(snap.ratePerMinute)} per billable minute. The clock starts only when unloading starts, and it is stored as a UTC timestamp shown in {`Europe/Zurich`}. Refreshing this page does not restart it. This browser demo is not a billing ledger.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-neutral-500">Unloading</dt>
          <dd>{container.status === "Unloading" ? "In progress" : container.status === "Completed" ? "Completed" : "Not started"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Charge</dt>
          <dd>{snap.phase === "not-started" ? "Not started" : snap.phase === "running" ? "Running" : "Stopped"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Unloading started</dt>
          <dd>{container.demurrage.startedAt ? formatInstant(container.demurrage.startedAt) : "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Free-time deadline</dt>
          <dd>{snap.deadlineMs ? formatInstant(snap.deadlineMs) : "Not running"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{snap.phase === "running" && snap.overtime ? "Overtime" : snap.phase === "stopped" ? "Final overtime" : "Free time remaining"}</dt>
          <dd className="font-medium tabular-nums">
            {waitingForClock
              ? "Updating clock"
              : snap.phase === "not-started"
                ? "Not running"
                : snap.phase === "running" && !snap.overtime
                  ? formatDuration(snap.remainingMs)
                  : snap.phase === "running" && now != null && snap.deadlineMs != null
                    ? formatDuration(now - snap.deadlineMs)
                    : snap.billableMinutes > 0
                      ? `${snap.billableMinutes} min`
                      : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Elapsed unloading</dt>
          <dd className="tabular-nums">
            {waitingForClock ? "Updating clock" : container.demurrage.startedAt && snap.phase === "running" && now != null ? formatDuration(now - Date.parse(container.demurrage.startedAt)) : snap.phase === "not-started" ? "00:00:00" : `${snap.elapsedMinutes} min`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Billable minutes</dt>
          <dd className="tabular-nums">{waitingForClock ? "…" : snap.billableMinutes}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">{snap.phase === "stopped" ? "Final charge" : "Estimated charge"}</dt>
          <dd className="text-base font-semibold tabular-nums">{waitingForClock ? "…" : formatEuro(snap.chargeEUR)}</dd>
        </div>
      </dl>
      {warn ? <p className="mt-3 text-sm font-medium">Free time has expired. The estimate increases by {formatEuro(snap.ratePerMinute)} for each further billable minute until unloading is completed.</p> : null}
      {container.status === "Unloading" && !container.demurrage.startedAt ? (
        <p className="mt-3 text-sm text-neutral-700">This sample is already Unloading, and no start time was stored. Demurrage has not started. The ETA does not start the clock.</p>
      ) : null}
      {snap.phase === "stopped" ? <p className="mt-3 text-sm text-neutral-700">Unloading is complete. This charge stays at {formatEuro(snap.chargeEUR)}.</p> : null}
      <p className="mt-3 text-xs leading-5 text-neutral-500">Whole minutes are billed. Elapsed time under 120 minutes, and exactly 120 minutes, stay at {formatEuro(0)}.</p>
    </Surface>
  );
}
