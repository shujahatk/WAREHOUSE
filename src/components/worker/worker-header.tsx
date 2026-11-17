"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/shell/auth-gate";
import { WORKER_THEME } from "./worker-theme";

export function WorkerHeader({
  notificationCount = 0,
  hasDemurrageAlert = false,
}: {
  notificationCount?: number;
  hasDemurrageAlert?: boolean;
}) {
  const { identity, logout } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#202A3D] bg-[#080D1C] px-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6655E8] text-sm font-black tracking-tight text-white shadow-sm">
              SF
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-white">StockFlow</span>
                <span className="rounded-md border border-[#6655E8]/30 bg-[#6655E8]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#8B7DF0]">
                  Worker
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {identity.warehouse ? `${identity.warehouse} Depot` : "Warehouse Ops"}
              </p>
            </div>
          </Link>
        </div>

        {/* Right side controls: Notification Bell + Hamburger Menu */}
        <div className="flex items-center gap-2">
          {/* Notification / Alert Pill */}
          <div className="relative">
            <Link
              href="/containers"
              aria-label="View notifications"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-[#202A3D] text-slate-300 transition hover:border-slate-600 hover:text-white active:scale-95"
            >
              <Icon name="bell" />
              {hasDemurrageAlert ? (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-rose-600 text-[9px] font-bold text-white items-center justify-center">
                    !
                  </span>
                </span>
              ) : notificationCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#6655E8] px-1 text-[9px] font-bold text-white">
                  {notificationCount}
                </span>
              ) : null}
            </Link>
          </div>

          {/* Hamburger Menu Toggle */}
          <button
            type="button"
            aria-label="Open Worker Menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-[#202A3D] text-slate-300 transition hover:border-slate-600 hover:text-white active:scale-95"
          >
            <Icon name="menu" />
          </button>
        </div>
      </header>

      {/* Slide-over Mobile Drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 transition-opacity"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-xs border-l border-[#202A3D] bg-[#080D1C] p-5 text-white shadow-xl flex flex-col justify-between">
              <div>
                {/* Header inside drawer */}
                <div className="flex items-center justify-between pb-4 border-b border-[#202A3D]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6655E8] font-bold text-white text-xs">
                      SF
                    </div>
                    <span className="font-semibold text-sm">Worker Console</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close menu"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/60 bg-[#202A3D] text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {/* Worker Identity Card */}
                <div className="mt-4 rounded-xl border border-slate-700/60 bg-[#202A3D] p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6655E8]/20 text-[#8B7DF0] font-semibold text-sm border border-[#6655E8]/30">
                      {identity.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{identity.name}</p>
                      <p className="truncate text-xs text-slate-400">{identity.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-700/60 pt-2.5 text-xs">
                    <span className="text-slate-400">Assigned Depot:</span>
                    <span className="font-medium text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {identity.warehouse ?? "Bornem"}
                    </span>
                  </div>
                </div>

                {/* Navigation Links */}
                <nav className="mt-6 space-y-1">
                  <p className="px-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    Warehouse Quick Links
                  </p>
                  <Link
                    href="/dashboard"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-[#202A3D] hover:text-white transition-colors"
                  >
                    <Icon name="dashboard" />
                    Dashboard
                  </Link>
                  <Link
                    href="/containers"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-[#202A3D] hover:text-white transition-colors"
                  >
                    <Icon name="containers" />
                    Inbound Shipments
                  </Link>
                  <Link
                    href="/outbound"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-[#202A3D] hover:text-white transition-colors"
                  >
                    <Icon name="outbound" />
                    Outbound Shipments
                  </Link>
                  <Link
                    href="/inventory"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-[#202A3D] hover:text-white transition-colors"
                  >
                    <Icon name="inventory" />
                    Inventory & Stock
                  </Link>
                  <Link
                    href="/tasks"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-[#202A3D] hover:text-white transition-colors"
                  >
                    <Icon name="documents" />
                    My Requests
                  </Link>
                  <Link
                    href="/stock-movements"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-[#202A3D] hover:text-white transition-colors"
                  >
                    <Icon name="movements" />
                    Stock Movements
                  </Link>
                </nav>
              </div>

              {/* Drawer Footer: Sign out */}
              <div className="pt-4 border-t border-[#202A3D]">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    logout();
                  }}
                  className={WORKER_THEME.btnDanger}
                >
                  Sign Out
                </button>
                <p className="mt-2 text-center text-[10px] text-slate-500">
                  StockFlow RM Enterprise v2.4
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
