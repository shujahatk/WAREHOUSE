"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatEuro, formatKg, visibleOrders, type OrderStatus } from "@/domain/view";
import { canPerform } from "@/lib/permissions";

const filters: Array<OrderStatus | "All"> = ["All", "Approved", "Pending", "Planned", "Rejected"];

export function PurchaseList() {
  const { state, createPurchase, notice } = useDemo();
  const { identity } = useSession();
  const query = useWorkspaceSearch().trim().toLowerCase();
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [supplier, setSupplier] = useState("");
  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState("1000");
  const [value, setValue] = useState("10000");
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const owned = visibleOrders(state, actor);
  const canCreate = canPerform(identity.role, "create-order");
  const rows = useMemo(
    () =>
      owned.filter((order) => {
        const matchesFilter = filter === "All" || order.status === filter;
        const haystack = `${order.number} ${order.supplier} ${order.material} ${order.customerCompany} ${order.notes}`.toLowerCase();
        return matchesFilter && (query.length === 0 || haystack.includes(query));
      }),
    [filter, owned, query],
  );

  return (
    <>
      <PageTitle
        title="PO & SO Orders"
        subtitle="Operational Purchase Orders (unloading) and Sales Orders (loading)."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {filters
              .filter((item) => item !== "All")
              .map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(filter === item ? "All" : item)}
                  className={`h-8 rounded-full px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${filter === item ? "bg-neutral-950 text-white" : "border border-neutral-300 bg-white text-neutral-700"}`}
                >
                  {item} ({owned.filter((order) => order.status === item).length})
                </button>
              ))}
          </div>
        }
      />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canCreate ? (
        <Surface className="mb-4 p-4">
          <h2 className="text-sm font-semibold">New PO / SO order</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-4"
            onSubmit={(event) => void (async () => {
              event.preventDefault();
              const error = await createPurchase({
                supplier,
                material,
                quantityKg: Number(quantity),
                valueEur: Number(value),
              });
              if (!error) {
                setSupplier("");
                setMaterial("");
              }
            })()}
          >
            <label className="text-xs text-neutral-500">
              Supplier / Customer
              <input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
            </label>
            <label className="text-xs text-neutral-500">
              Material
              <input value={material} onChange={(event) => setMaterial(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
            </label>
            <label className="text-xs text-neutral-500">
              Quantity kg
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
            </label>
            <label className="text-xs text-neutral-500">
              Value EUR
              <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
            </label>
            <button type="submit" className="h-10 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white sm:col-span-4 sm:justify-self-start">
              Create order
            </button>
          </form>
        </Surface>
      ) : null}
      {rows.length === 0 ? (
        <Surface className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-neutral-950">No matching orders</p>
        </Surface>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((order) => (
              <li key={order.number}>
                <Link href={`/purchases/${order.number}`} className="block rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{order.number}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {order.customerCompany || order.supplier} · {order.material === "—" ? "Material not recorded" : order.material}
                      </p>
                    </div>
                    <StatusPill label={order.status} />
                  </div>
                  <p className="mt-2 text-sm">
                    {order.quantityKg > 0 ? formatKg(order.quantityKg) : "Quantity not recorded"} · {order.valueEur > 0 ? formatEuro(order.valueEur) : "Value not recorded"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Surface className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
                <tr>
                  {["Order Number", "Supplier / Customer", "Material", "Quantity", "Value", "Status", "Date"].map((header) => (
                    <th key={header} scope="col" className="px-4 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr key={order.number} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/purchases/${order.number}`} className="underline-offset-4 hover:underline">
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{order.customerCompany || order.supplier}</td>
                    <td className="px-4 py-3">{order.material === "—" ? "Not recorded" : order.material}</td>
                    <td className="px-4 py-3 tabular-nums">{order.quantityKg > 0 ? formatKg(order.quantityKg) : "Not recorded"}</td>
                    <td className="px-4 py-3 tabular-nums">{order.valueEur > 0 ? formatEuro(order.valueEur) : "Not recorded"}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={order.status} />
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </>
      )}
    </>
  );
}
