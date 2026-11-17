"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useSession } from "@/components/shell/auth-gate";
import { WorkspaceSearch } from "@/components/shell/search-context";
import { canAccess } from "@/lib/permissions";
import { WorkerHeader } from "./worker-header";
import { WorkerBottomNav } from "./worker-bottom-nav";

export function WorkerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { identity } = useSession();
  const [query, setQuery] = useState("");

  const allowed = canAccess("worker", pathname);

  return (
    <WorkspaceSearch.Provider value={query}>
      <div className="min-h-screen bg-[#0B0F19] text-white flex flex-col font-sans selection:bg-violet-600 selection:text-white antialiased">
        {/* Fixed Top Header for Workers */}
        <WorkerHeader />

        {/* Main Operational Mobile Viewport */}
        <main className="flex-1 w-full max-w-xl mx-auto px-3.5 pt-3 pb-36 sm:px-5 sm:pt-4">
          {allowed ? (
            children
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-[#121B2E] p-6 text-center text-white shadow-xl mt-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xl font-bold">
                ✕
              </div>
              <h2 className="mt-3 text-lg font-bold">Access Restricted</h2>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Your Warehouse Worker account is limited to depot operations, shipments, and inventory.
                Administrative and purchasing portals are reserved for Staff and Admin.
              </p>
              <Link
                href="/dashboard"
                className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-violet-600 px-5 text-xs font-semibold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 active:scale-95 transition"
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
