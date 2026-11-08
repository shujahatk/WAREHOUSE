"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { Icon } from "@/components/icons";
import { stockStatus, visibleContainers, visibleStock, type DemoIdentity } from "@/domain/view";
import { roleLabel } from "@/lib/permissions";

export function TopNav({
  query,
  onQuery,
  identity,
  onLogout,
}: {
  query: string;
  onQuery: (value: string) => void;
  identity: DemoIdentity;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { state } = useDemo();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const stock = visibleStock(state, identity.role, identity.warehouse);
  const pendingRequests = state.requests.filter((req) => req.status === "submitted");
  const approvedWorkerRequests = state.requests.filter(
    (req) => req.status === "approved" && req.createdByName === identity.name,
  );
  const alerts = [
    ...visibleContainers(state, actor)
      .filter((row) => row.status === "In transit")
      .map((row) => `${row.number} is in transit to ${row.warehouse}.`),
    ...stock.filter((row) => row.quantity <= row.reorder).map((row) => `${row.material} at ${row.warehouse} is ${stockStatus(row).toLowerCase()}.`),
    ...(identity.role === "owner" && pendingRequests.length > 0
      ? [`${pendingRequests.length} loading/unloading request(s) are waiting for Admin approval.`]
      : []),
    ...(identity.role === "owner" && state.orders.some((order) => order.status === "Pending")
      ? [`${state.orders.filter((order) => order.status === "Pending").length} PO/SO order(s) are waiting for approval.`]
      : []),
    ...(identity.role === "worker" && approvedWorkerRequests.length > 0
      ? [`${approvedWorkerRequests.length} request(s) approved — ready to complete operation.`]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-neutral-950 lg:hidden">
          StockFlow
        </Link>
        <form
          role="search"
          className="relative hidden min-w-0 flex-1 sm:block lg:max-w-md"
          onSubmit={(event) => event.preventDefault()}
        >
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
            <Icon name="inventory" className="h-3.5 w-3.5" />
          </span>
          <label className="sr-only" htmlFor="workspace-search">
            Search by PO, container, supplier
          </label>
          <input
            id="workspace-search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search by PO, container, supplier..."
            className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 pr-3 pl-9 text-sm text-neutral-950 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          />
        </form>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-label="Notifications"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-800"
            >
              <Icon name="bell" />
            </button>
            {open ? (
              <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-sm">
                <p className="font-medium text-neutral-950">Alerts</p>
                {alerts.length === 0 ? <p className="mt-2 text-xs text-neutral-500">No open alerts in the current records.</p> : null}
                <ul className="mt-2 space-y-2">
                  {alerts.map((alert) => (
                    <li key={alert} className="text-xs leading-5 text-neutral-600">
                      {alert}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-neutral-200 pr-3 pl-1">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950 text-[11px] font-medium text-white">
                {identity.name.slice(0, 1)}
              </span>
              <span className="hidden text-sm font-medium text-neutral-950 sm:inline">
                {identity.name} · {roleLabel(identity.role)}
              </span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-sm">
              <p className="font-medium text-neutral-950">{identity.name}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {roleLabel(identity.role)}
                {identity.warehouse ? ` · ${identity.warehouse}` : ""}
              </p>
              <button type="button" onClick={onLogout} className="mt-3 text-sm font-medium text-neutral-950 underline underline-offset-4">
                Log out
              </button>
            </div>
          </details>
        </div>
      </div>
      <form role="search" className="relative mt-3 w-full sm:hidden" onSubmit={(event) => event.preventDefault()}>
        <label className="sr-only" htmlFor="workspace-search-mobile">
          Search by PO, container, supplier
        </label>
        <input
          id="workspace-search-mobile"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search by PO, container, supplier..."
          className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm"
        />
      </form>
    </header>
  );
}
