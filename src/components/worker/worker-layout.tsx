"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useSession } from "@/components/shell/auth-gate";
import { WorkspaceSearch } from "@/components/shell/search-context";
import { canAccess } from "@/lib/permissions";
import { WorkerHeader } from "./worker-header";
import { WorkerBottomNav } from "./worker-bottom-nav";
import { WORKER_THEME } from "./worker-theme";

export function WorkerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const allowed = canAccess("worker", pathname);

  return (
    <WorkspaceSearch.Provider value={query}>
      <div className="min-h-screen bg-[#F8FAFC] text-neutral-900 flex flex-col font-sans antialiased overflow-x-hidden">
        {/* Fixed Top Header for Workers */}
        <WorkerHeader />

        {/* Main Operational Mobile Viewport */}
        <main className="flex-1 w-full max-w-lg mx-auto px-3.5 pt-3 pb-36 sm:px-4 sm:pt-4">
          {allowed ? (
            children
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-neutral-900 shadow-2xs mt-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-lg font-bold">
                ✕
              </div>
              <h2 className="mt-3 text-lg font-bold text-neutral-900">Access Restricted</h2>
              <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                Your Warehouse Worker account is limited to depot operations, shipments, and inventory.
                Administrative and purchasing portals are reserved for Staff and Admin.
              </p>
              <Link
                href="/dashboard"
                className={`mt-5 inline-flex ${WORKER_THEME.btnPrimary}`}
              >
                Back to Worker Dashboard
              </Link>
            </div>
          )}
        </main>

        {/* Fixed Bottom Navigation for Workers */}
        <WorkerBottomNav />
      </div>
    </WorkspaceSearch.Provider>
  );
}
