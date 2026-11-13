"use client";

import { useState } from "react";
import { DirectoryBoard } from "@/components/ref/directory-board";
import { CsvImportModal } from "@/components/import/csv-import-modal";
import { Icon } from "@/components/icons";

export default function CustomersPage() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Customers</h1>
          <p className="text-xs text-neutral-500">
            Customer directory. Open sales counts orders with status Open and leaves drafts out of that count.
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
            href="/api/reports/export?type=customers"
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
        kind="customers"
        caption="Customers"
        searchPlaceholder="Search customers"
        minWidthClassName="min-w-[640px]"
      />

      <CsvImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        defaultEntity="customers"
      />
    </>
  );
}
