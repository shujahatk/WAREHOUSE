"use client";

import { useState } from "react";
import { DirectoryBoard } from "@/components/ref/directory-board";
import { CsvImportModal } from "@/components/import/csv-import-modal";
import { Icon } from "@/components/icons";

export default function SuppliersPage() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Suppliers</h1>
          <p className="text-xs text-neutral-500">
            Supplier directory. Not received counts draft and pending purchase orders. Received orders are excluded.
          </p>
        </div>
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
            href="/api/reports/export?type=suppliers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-xs hover:bg-neutral-50"
          >
            <Icon name="reports" className="h-3.5 w-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      <DirectoryBoard
        kind="suppliers"
        caption="Suppliers"
        searchPlaceholder="Search suppliers"
        minWidthClassName="min-w-[720px]"
      />

      <CsvImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        defaultEntity="suppliers"
      />
    </>
  );
}
