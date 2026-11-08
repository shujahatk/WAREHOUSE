"use client";

import Link from "next/link";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { formatKg, openTasks } from "@/domain/view";
import { roleLabel } from "@/lib/permissions";

export function TaskBoard() {
  const { state } = useDemo();
  const { identity } = useSession();
  const tasks = openTasks(state, identity);
  const requests = state.requests.filter((req) => {
    if (req.status === "deleted") return false;
    if (identity.role === "worker" && identity.warehouse) {
      return req.warehouse === identity.warehouse;
    }
    return true;
  });

  return (
    <>
      <PageTitle
        title="Loading & Unloading Requests"
        subtitle={
          identity.role === "worker"
            ? `${identity.warehouse ?? "Assigned warehouse"} · Worker operational requests and history`
            : `${roleLabel(identity.role)} · Operational requests and action queue across warehouses`
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold text-neutral-950">Action queue</h2>
          <ul className="space-y-2">
            {tasks.length === 0 ? (
              <li>
                <Surface className="px-4 py-6 text-sm text-neutral-600">
                  No open action items.
                </Surface>
              </li>
            ) : null}
            {tasks.map((task) => (
              <li key={task.title}>
                <Link href={task.href}>
                  <Surface className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{task.detail}</p>
                    </div>
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-neutral-950 px-2 text-xs font-medium text-white">
                      {task.count}
                    </span>
                  </Surface>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold text-neutral-950">Requests & operation history</h2>
          <Surface className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
                <tr>
                  {["Request", "Type", "Order", "Warehouse", "Net weight", "Status", "Operation"].map((header) => (
                    <th key={header} scope="col" className="px-4 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      No loading or unloading requests recorded yet.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => {
                    const netTotal = req.lines.reduce((sum, line) => sum + line.netKg, 0);
                    const href = req.type === "unloading" ? `/containers/${req.shipmentReference}` : `/outbound/${req.shipmentReference}`;
                    return (
                      <tr key={req.id} className="border-t border-neutral-100">
                        <td className="px-4 py-3 font-medium text-neutral-950">{req.number}</td>
                        <td className="px-4 py-3 capitalize">{req.type}</td>
                        <td className="px-4 py-3">{req.purchaseOrderNumber ?? "—"}</td>
                        <td className="px-4 py-3">{req.warehouse}</td>
                        <td className="px-4 py-3 tabular-nums">{formatKg(netTotal)}</td>
                        <td className="px-4 py-3">
                          <StatusPill label={req.status} />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={href} className="text-xs font-medium text-neutral-950 underline underline-offset-4">
                            Open {req.shipmentReference}
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Surface>
        </div>
      </div>
    </>
  );
}
