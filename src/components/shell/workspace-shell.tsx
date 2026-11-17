"use client";

import { type ReactNode } from "react";
import { useSession } from "@/components/shell/auth-gate";
import { normalizeRole } from "@/lib/permissions";
import { WorkerLayout } from "@/components/worker/worker-layout";
import { AppShell } from "@/components/shell/app-shell";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { identity, ready } = useSession();

  // If session is still initializing, render sleek dark loading state to prevent flash
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-neutral-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-700 border-t-transparent" />
          <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            Loading StockFlow…
          </p>
        </div>
      </div>
    );
  }

  const role = normalizeRole(identity.role);

  // Dedicated Worker layout for workers: 100% isolated from Admin/Staff
  if (role === "worker") {
    return <WorkerLayout>{children}</WorkerLayout>;
  }

  // Admin, Staff, and Moderator retain standard corporate AppShell
  return <AppShell>{children}</AppShell>;
}
