"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { PackagingEditor } from "@/components/settings/packaging-editor";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatKg } from "@/domain/view";
import { CsvImportModal } from "@/components/import/csv-import-modal";
import { Icon } from "@/components/icons";

export default function MaterialsPage() {
  const { state } = useDemo();
  const [importOpen, setImportOpen] = useState(false);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Materials & Packaging"
          subtitle="Master catalog of tracked materials and packaging tare weights."
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-xs hover:bg-neutral-50"
          >
            <Icon name="documents" className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <a
            href="/api/reports/export?type=materials"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-xs hover:bg-neutral-50"
          >
            <Icon name="reports" className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
      </div>
      <CsvImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        defaultEntity="materials"
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

