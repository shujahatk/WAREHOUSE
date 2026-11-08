"use client";

import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { PackagingEditor } from "@/components/settings/packaging-editor";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatKg } from "@/domain/view";

export default function MaterialsPage() {
  const { state } = useDemo();
  const query = useWorkspaceSearch().trim().toLowerCase();

  const materialGroups = new Map<
    string,
    { material: string; category: string; totalKg: number; warehouses: string[]; reorder: number }
  >();

  for (const row of state.stock) {
    const existing = materialGroups.get(row.material) ?? {
      material: row.material,
      category: row.category || "kg",
      totalKg: 0,
      warehouses: [],
      reorder: row.reorder,
    };
    existing.totalKg += row.weightKg;
    if (row.warehouse && !existing.warehouses.includes(row.warehouse)) {
      existing.warehouses.push(row.warehouse);
    }
    materialGroups.set(row.material, existing);
  }

  const materials = [...materialGroups.values()].filter((row) =>
    `${row.material} ${row.category} ${row.warehouses.join(" ")}`.toLowerCase().includes(query),
  );

  return (
    <>
      <PageTitle
        title="Materials & Packaging"
        subtitle="Master catalog of tracked materials and packaging tare weights."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="overflow-x-auto">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-950">Materials catalog</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Tracked material categories and total stock across warehouses.</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
              <tr>
                {["Material", "Unit", "Warehouses", "Total stock", "Reorder threshold"].map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No matching materials.
                  </td>
                </tr>
              ) : (
                materials.map((item) => (
                  <tr key={item.material} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium text-neutral-950">{item.material}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.category}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.warehouses.join(", ") || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{formatKg(item.totalKg)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatKg(item.reorder)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Surface>
        <PackagingEditor />
      </div>
    </>
  );
}

