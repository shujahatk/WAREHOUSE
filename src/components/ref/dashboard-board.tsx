"use client";

import Link from "next/link";
import { useDemo } from "@/components/providers/workspace-provider";
import { KpiCard, PageTitle, PrimaryLink, StatusPill, Surface } from "@/components/ref/chrome";
import { useLiveNow } from "@/components/ref/live-clock";
import { useSession } from "@/components/shell/auth-gate";
import { demurrageLabel, formatKg, visibleContainers, visibleOrders, visibleOutbound, visibleStock } from "@/domain/view";
import { canAccess, canPerform, roleLabel } from "@/lib/permissions";

export function DashboardBoard() {
  const { state } = useDemo();
  const { identity } = useSession();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const stock = visibleStock(state, identity.role, identity.warehouse);
  const orders = visibleOrders(state, actor);
  const containers = visibleContainers(state, actor);
  const outbound = visibleOutbound(state, actor);
  const pendingOrders = orders.filter((order) => order.status === "Pending").length;
  const pendingRequests = state.requests.filter((req) => req.status === "submitted").length;
  const inboundOpen = containers.filter((row) => row.status !== "Completed").length;
  const outboundOpen = outbound.filter((row) => row.status !== "Dispatched").length;
  const byWarehouse = new Map<string, number>();
  for (const row of stock) {
    byWarehouse.set(row.warehouse, (byWarehouse.get(row.warehouse) ?? 0) + row.weightKg);
  }
  const activity = state.activity
    .filter((item) => canAccess(identity.role, item.href))
    .slice(0, 5);
  const stockWeight = stock.reduce((sum, row) => sum + row.weightKg, 0);
  const lowStock = stock.filter((row) => row.quantity <= row.reorder).length;
  const unloading = containers.filter((row) => row.status === "Unloading");
  const now = useLiveNow(unloading.some((row) => Boolean(row.demurrage.startedAt)));

  return (
    <>
      <PageTitle
        title="Dashboard"
        subtitle={
          identity.role === "worker"
            ? `${identity.name} · ${roleLabel(identity.role)} · ${identity.warehouse ?? "Assigned warehouse"}`
            : `${identity.name} · ${roleLabel(identity.role)}`
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {identity.role === "worker" ? (
          <>
            <KpiCard label="Assigned stock" value={formatKg(stockWeight)} detail={identity.warehouse ?? "Warehouse"} />
            <KpiCard label="At or below reorder" value={String(lowStock)} detail="Includes out of stock" />
          </>
        ) : (
          <>
            <KpiCard label="PO & SO orders" value={String(orders.length)} detail={`${pendingOrders} pending order(s)`} />
            <KpiCard label="Pending requests" value={String(pendingRequests)} detail="Awaiting Admin approval" />
          </>
        )}
        <KpiCard label="Incoming open" value={String(inboundOpen)} detail="Not completed" />
        <KpiCard label="Outgoing open" value={String(outboundOpen)} detail="Not dispatched" />
      </div>
      {unloading.length > 0 ? (
        <Surface className="mt-4 p-4">
          <h2 className="text-sm font-semibold">Demurrage</h2>
          <ul className="mt-2 space-y-2">
            {unloading.map((row) => (
              <li key={row.number} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/containers/${row.number}`} className="underline underline-offset-4">
                  {row.number}
                </Link>
                <span>{demurrageLabel(row, now)}</span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        <Surface className="p-4 lg:col-span-3">
          <h2 className="text-sm font-semibold text-neutral-950">Recent activity</h2>
          <ul className="mt-3 divide-y divide-neutral-100">
            {activity.length === 0 ? <li className="py-3 text-sm text-neutral-600">No recent activity.</li> : null}
            {activity.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                <Link href={item.href} className="text-sm text-neutral-800 hover:underline">
                  {item.text}
                </Link>
                <StatusPill label={item.status} />
              </li>
            ))}
          </ul>
        </Surface>
        <div className="grid gap-3 lg:col-span-2">
          <Surface className="p-4">
            <h2 className="text-sm font-semibold text-neutral-950">Stock by warehouse</h2>
            <ul className="mt-3 space-y-3">
              {[...byWarehouse.entries()].map(([name, weight]) => (
                <li key={name} className="flex items-center justify-between text-sm">
                  <span>{name}</span>
                  <span className="font-medium tabular-nums">{formatKg(weight)}</span>
                </li>
              ))}
            </ul>
            <Link href="/inventory" className="mt-4 inline-flex text-sm font-medium underline underline-offset-4">
              View inventory
            </Link>
          </Surface>
          <Surface className="p-4">
            <h2 className="text-sm font-semibold text-neutral-950">Quick actions</h2>
            <div className="mt-3 grid gap-2">
              <PrimaryLink href="/tasks">Loading & Unloading Requests</PrimaryLink>
              {canPerform(identity.role, "create-order") ? <PrimaryLink href="/purchases">PO & SO Orders</PrimaryLink> : null}
              {canPerform(identity.role, "create-transfer") ? <PrimaryLink href="/transfers">Create transfer</PrimaryLink> : null}
              <PrimaryLink href="/documents">Review documents</PrimaryLink>
              <PrimaryLink href="/documents#annex-7">Annex VII</PrimaryLink>
              {canAccess(identity.role, "/reports") ? <PrimaryLink href="/reports">Open reports</PrimaryLink> : null}
            </div>
          </Surface>
        </div>
      </div>
    </>
  );
}
