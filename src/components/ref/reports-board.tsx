"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { formatKg, stockStatus } from "@/domain/view";
import { formatSharePercents } from "@/lib/format";

function groupShares(rows: { category: string; warehouse: string; weightKg: number }[], key: (row: { category: string; warehouse: string; weightKg: number }) => string) {
  const weights = new Map<string, number>();
  for (const row of rows) weights.set(key(row), (weights.get(key(row)) ?? 0) + row.weightKg);
  const entries = [...weights.entries()];
  const shares = formatSharePercents(entries.map((entry) => entry[1]));
  return entries.map(([name, weight], index) => ({ name, weight, share: shares[index] ?? "0.0%" }));
}

export function ReportsBoard() {
  const { state } = useDemo();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const stock = state.stock.filter((row) => `${row.material} ${row.category} ${row.warehouse}`.toLowerCase().includes(needle));
  const totalWeight = stock.reduce((sum, row) => sum + row.weightKg, 0);
  const purchaseValue = state.orders.reduce((sum, order) => sum + order.valueEur, 0);
  const salesWeight = state.outbound.reduce((sum, shipment) => sum + shipment.weightKg, 0);
  const categories = groupShares(stock, (row) => row.category);
  const sites = groupShares(stock, (row) => row.warehouse);

  function download(type: string = "stock") {
    const link = document.createElement("a");
    link.href = `/api/reports/export?type=${type}`;
    link.setAttribute("download", `stockflow-${type}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <>
      <PageTitle
        title="Reports"
        subtitle="Inventory and operational figures derived directly from repository interfaces. Export data filtered to your role permissions."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => download("stock")}
              className="h-9 rounded-lg bg-neutral-950 px-3 text-xs font-medium text-white transition hover:bg-neutral-800"
            >
              Export stock CSV
            </button>
            <button
              type="button"
              onClick={() => download("movements")}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Export movements CSV
            </button>
            <button
              type="button"
              onClick={() => download("shipments")}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Export shipments CSV
            </button>
            <button
              type="button"
              onClick={() => download("requests")}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Export requests CSV
            </button>
            <button
              type="button"
              onClick={() => download("demurrage")}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Export demurrage CSV
            </button>
          </div>
        }
      />
      <label className="mb-4 block text-xs text-neutral-500">
        Filter materials
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 h-10 w-full max-w-sm rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Surface className="p-4">
          <p className="text-xs text-neutral-500">Purchase value</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">€{purchaseValue.toLocaleString("en-US")}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-neutral-500">Inventory weight</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatKg(totalWeight)}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-neutral-500">Outgoing weight</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatKg(salesWeight)}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-neutral-500">Materials shown</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{stock.length}</p>
        </Surface>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Surface className="p-4">
          <h2 className="text-sm font-semibold">Warehouse distribution</h2>
          <ul className="mt-3 space-y-3">
            {sites.map((site) => (
              <li key={site.name} className="flex items-center justify-between text-sm">
                <span>{site.name}</span>
                <span className="tabular-nums">
                  {formatKg(site.weight)} · {site.share}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
        <Surface className="p-4">
          <h2 className="text-sm font-semibold">Category breakdown</h2>
          <ul className="mt-3 space-y-3">
            {categories.map((category) => (
              <li key={category.name} className="flex items-center justify-between text-sm">
                <span>{category.name}</span>
                <span className="tabular-nums">{category.share}</span>
              </li>
            ))}
          </ul>
        </Surface>
      </div>
      <Surface className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
            <tr>
              {["Material", "Category", "Warehouse", "Quantity", "Weight", "Status"].map((header) => (
                <th key={header} scope="col" className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No materials match this filter.
                </td>
              </tr>
            ) : (
              stock.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium">{row.material}</td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3">{row.warehouse}</td>
                  <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
                  <td className="px-4 py-3 tabular-nums">{formatKg(row.weightKg)}</td>
                  <td className="px-4 py-3">{stockStatus(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Surface>
      <p className="mt-3 text-xs text-neutral-500">
        Exported CSV reports reflect live stock, movement, shipment, request, and demurrage records.
      </p>
    </>
  );
}
