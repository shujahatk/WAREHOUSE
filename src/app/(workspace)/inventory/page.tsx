"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatKg, stockStatus, visibleStock } from "@/domain/view";
import { canPerform } from "@/lib/permissions"
  ;
type SortKey = "material" | "quantity" | "weight" | "warehouse";
export default function InventoryPage() {
  const { state, setThreshold, notice } = useDemo();
  const { identity } = useSession();
  const query = useWorkspaceSearch().trim().toLowerCase();

  const [warehouse, setWarehouse] = useState(identity.warehouse ?? "All");
  const [sort, setSort] = useState<SortKey>("material");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scoped = visibleStock(state, identity.role, identity.warehouse);
  const sites = ["All", ...new Set(scoped.map((row) => row.warehouse))];
  const rows = scoped
    .filter((row) => {
      const matchesSite = warehouse === "All" || row.warehouse === warehouse;
      const haystack = `${row.material} ${row.category} ${row.location} ${row.warehouse}`.toLowerCase();
      return matchesSite && haystack.includes(query);
    })
    .sort((left, right) => {
      if (sort === "quantity") return left.quantity - right.quantity;
      if (sort === "weight") return left.weightKg - right.weightKg;
      if (sort === "warehouse") return left.warehouse.localeCompare(right.warehouse) || left.material.localeCompare(right.material);
      return left.material.localeCompare(right.material);
    });
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  return (
    <>
      <PageTitle
        title="Inventory"
        subtitle={identity.role === "worker" ? `Showing ${identity.warehouse} only` : "All warehouses"}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {sites.map((site) => (
          <button
            key={site}
            type="button"
            onClick={() => setWarehouse(site)}
            className={`rounded-full px-3 py-1 text-xs ${warehouse === site ? "bg-neutral-950 text-white" : "border border-neutral-300 bg-white"}`}
          >
            {site}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">Sort</span>
        {(
          [
            ["material", "Material"],
            ["quantity", "Quantity"],
            ["weight", "Weight"],
            ["warehouse", "Warehouse"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={`rounded-full px-3 py-1 text-xs ${sort === key ? "bg-neutral-950 text-white" : "border border-neutral-300 bg-white"}`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-neutral-500">
          {rows.length} of {scoped.length}
        </span>
      </div>
      {selected ? (
        <Surface className="mb-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-neutral-500">{selected.category}</p>
              <h2 className="text-sm font-semibold">{selected.material}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {selected.warehouse} · {selected.location} · {selected.packaging}
              </p>
            </div>
            <StatusPill label={stockStatus(selected)} />
          </div>
          <p className="mt-3 text-sm">
            Quantity {selected.quantity} · {formatKg(selected.weightKg)} · minimum {selected.reorder}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">The minimum is stored for this material at {selected.warehouse}. Another warehouse can use a different minimum.</p>
          {canPerform(identity.role, "set-threshold") ? <ThresholdForm key={selected.id} id={selected.id} current={selected.reorder} onSave={setThreshold} /> : null}
          {notice ? <p className="mt-2 text-sm text-neutral-800">{notice}</p> : null}
        </Surface>
      ) : null}
      <Surface className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
            <tr>
              {["Material", "Category", "Warehouse", "Quantity", "Weight", "Minimum", "Status"].map((header) => (
                <th key={header} scope="col" className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No matching materials.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium">
                    <button type="button" onClick={() => setSelectedId(row.id)} className="underline-offset-4 hover:underline">
                      {row.material}
                    </button>
                  </td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3">{row.warehouse}</td>
                  <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
                  <td className="px-4 py-3 tabular-nums">{formatKg(row.weightKg)}</td>
                  <td className="px-4 py-3 tabular-nums">{row.reorder}</td>
                  <td className="px-4 py-3">
                    <StatusPill label={stockStatus(row)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Surface>
      <ul className="mt-3 space-y-2 md:hidden">
        {rows.length === 0 ? <li className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-sm text-neutral-600">No matching materials.</li> : null}
        {rows.map((row) => (
          <li key={`${row.id}-card`}>
            <button type="button" onClick={() => setSelectedId(row.id)} className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-left text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{row.material}</p>
                <StatusPill label={stockStatus(row)} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {row.category} · {row.warehouse} · {row.location}
              </p>
              <p className="mt-2">
                Qty {row.quantity} · {formatKg(row.weightKg)} · minimum {row.reorder}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ThresholdForm({ id, current, onSave }: { id: string; current: number; onSave: (draft: { id: string; minimum: number }) => Promise<string | undefined> }) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => void (async () => {
        event.preventDefault();
        if (!/^\d+$/.test(value.trim())) {
          setError("The minimum quantity must be a whole number, zero or greater.");
          return;
        }
        setError(null);
        const failed = await onSave({ id, minimum: Number(value) });
        if (failed) setError(failed);
      })()}
    >
      <label className="text-xs text-neutral-500">
        Minimum quantity
        <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm sm:w-40" />
      </label>
      <button type="submit" className="h-11 rounded-lg border border-neutral-950 px-3 text-sm font-medium">
        Save threshold
      </button>
      {error ? <p className="text-xs text-neutral-950 sm:mb-3">{error}</p> : null}
    </form>
  );
}
