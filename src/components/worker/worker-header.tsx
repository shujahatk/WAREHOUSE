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
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-neutral-200 bg-white px-4 shadow-2xs">
        {/* Brand & Worker Portal Identity */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-800 text-xs font-bold tracking-wider text-white shadow-2xs">
              RM
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-neutral-900">
                  StockFlow
                </span>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Worker
                </span>
              </div>
              <p className="text-[11px] font-medium text-neutral-500">
                {identity.warehouse ? `${identity.warehouse} Depot` : "Warehouse Floor"}
              </p>
            </div>
          </Link>
        </div>

        {/* Right side controls: Notification Bell + Menu */}
        <div className="flex items-center gap-2">
          {/* Notification / Alert Pill */}
          <div className="relative">
            <Link
              href="/containers"
              aria-label="View notifications"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-95"
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
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-800 px-1 text-[9px] font-bold text-white">
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
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-95"
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
            className="fixed inset-0 bg-neutral-900/60 backdrop-blur-2xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-xs border-l border-neutral-200 bg-white p-5 text-neutral-900 shadow-xl flex flex-col justify-between">
              <div>
                {/* Header inside drawer */}
                <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-800 font-bold text-white text-xs">
                      RM
                    </div>
                    <div>
                      <span className="font-bold text-sm text-neutral-900 block leading-tight">Worker Console</span>
                      <span className="text-[11px] text-neutral-500">Warehouse Operations</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close menu"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    ✕
                  </button>
                </div>

                {/* Worker Identity Card */}
                <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-800 text-white font-bold text-sm shadow-2xs">
                      {identity.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-neutral-900">{identity.name}</p>
                      <p className="truncate text-xs text-neutral-600">{identity.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-emerald-200/60 pt-2.5 text-xs">
                    <span className="text-neutral-600 font-medium">Assigned Depot:</span>
                    <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-600" />
                      {identity.warehouse ?? "Bornem"}
                    </span>
                  </div>
                </div>

                {/* Navigation Links */}
                <nav className="mt-6 space-y-1">
                  <p className="px-2 text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                    Warehouse Quick Links
                  </p>
                  <Link
                    href="/dashboard"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                  >
                    <Icon name="dashboard" />
                    Dashboard
                  </Link>
                  <Link
                    href="/containers"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                  >
                    <Icon name="containers" />
                    Inbound Shipments
                  </Link>
                  <Link
                    href="/outbound"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                  >
                    <Icon name="outbound" />
                    Outbound Shipments
                  </Link>
                  <Link
                    href="/inventory"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                  >
                    <Icon name="inventory" />
                    Inventory &amp; Stock
                  </Link>
                  <Link
                    href="/stock-movements"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                  >
                    <Icon name="movements" />
                    Stock Movements
                  </Link>
                </nav>
              </div>

              {/* Drawer Footer: Sign out */}
              <div className="pt-4 border-t border-neutral-200">
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
                <p className="mt-2 text-center text-[10px] text-neutral-400">
                  StockFlow RM Logistics v2.4
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
