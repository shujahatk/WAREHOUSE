"use client";

import { useState, useMemo } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/ref/chrome";

type ImportEntity = "materials" | "suppliers" | "customers";

type ParsedRow = {
  raw: Record<string, string>;
  valid: boolean;
  duplicate: boolean;
  errors: string[];
};

export function CsvImportModal({
  isOpen,
  onClose,
  defaultEntity = "materials",
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultEntity?: ImportEntity;
}) {
  const { state, refresh } = useDemo();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [entity, setEntity] = useState<ImportEntity>(defaultEntity);
  const [fileName, setFileName] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultWarnings, setResultWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Existing sets for duplicate detection
  const existingMaterialCodes = useMemo(
    () => new Set(state.stock.map((s) => s.material.trim().toLowerCase())),
    [state.stock],
  );
  const existingSuppliers = useMemo(
    () => new Set(state.directory.companies.filter((c) => c.kind === "supplier").map((c) => c.name.trim().toLowerCase())),
    [state.directory.companies],
  );
  const existingCustomers = useMemo(
    () => new Set(state.directory.companies.filter((c) => c.kind === "customer").map((c) => c.name.trim().toLowerCase())),
    [state.directory.companies],
  );

  if (!isOpen) return null;

  // Step 1: Download Template CSV
  const handleDownloadTemplate = () => {
    let headers: string[] = [];
    let sampleRows: string[][] = [];

    if (entity === "materials") {
      headers = ["Material Number", "Description", "Category", "Low Stock Threshold"];
      sampleRows = [
        ["MAT-PL-001", "HDPE Regrind Flakes Blue", "Plastics", "5000"],
        ["MAT-PL-002", "LDPE Film Grade Pellets", "Plastics", "3000"],
      ];
    } else if (entity === "suppliers") {
      headers = ["Supplier Name"];
      sampleRows = [["Rotterdam Polymer Trading B.V."], ["Antwerp Scrap Logistics NV"]];
    } else if (entity === "customers") {
      headers = ["Customer Name"];
      sampleRows = [["Benelux Recyclers Group"], ["Iberia Plastics S.L."]];
    }

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `stockflow-${entity}-template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Step 2: Handle File Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      setError("Please select a valid .csv file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds 5MB size limit.");
      return;
    }

    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || "");
        parseCsv(text);
        setStep(3);
      } catch {
        setError("Failed to parse CSV file content.");
      }
    };
    reader.readAsText(file);
  };

  // CSV Parsing with basic delimiter handling
  const parseCsv = (content: string) => {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      setError("CSV must contain a header row and at least one data row.");
      return;
    }

    const header = lines[0].split(",").map((h) => h.replace(/^["']|["']$/g, "").trim());
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Match comma separated or quoted values
      const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g) || [];
      const values = matches.map((m) => {
        let val = m.replace(/^,/, "").trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        return val;
      });

      const rowObj: Record<string, string> = {};
      for (let j = 0; j < header.length; j++) {
        rowObj[header[j]] = values[j] || "";
      }

      // Validation logic
      const errors: string[] = [];
      let isDuplicate = false;

      if (entity === "materials") {
        const code = rowObj["Material Number"] || rowObj.materialNumber || values[0] || "";
        const desc = rowObj["Description"] || rowObj.description || values[1] || "";
        if (!code.trim()) errors.push("Missing material number");
        if (!desc.trim()) errors.push("Missing description");
        if (existingMaterialCodes.has(code.trim().toLowerCase())) {
          isDuplicate = true;
          errors.push("Duplicate material number");
        }
      } else if (entity === "suppliers") {
        const name = rowObj["Supplier Name"] || rowObj.name || values[0] || "";
        if (!name.trim()) errors.push("Missing supplier name");
        if (existingSuppliers.has(name.trim().toLowerCase())) {
          isDuplicate = true;
          errors.push("Supplier already exists");
        }
      } else if (entity === "customers") {
        const name = rowObj["Customer Name"] || rowObj.name || values[0] || "";
        if (!name.trim()) errors.push("Missing customer name");
        if (existingCustomers.has(name.trim().toLowerCase())) {
          isDuplicate = true;
          errors.push("Customer already exists");
        }
      }

      rows.push({
        raw: rowObj,
        valid: errors.length === 0,
        duplicate: isDuplicate,
        errors,
      });
    }

    setParsedRows(rows);
  };

  // Step 4 to 5: Execute Batch Import
  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.valid).map((r) => r.raw);
    if (validRows.length === 0) {
      setError("No valid rows to import.");
      return;
    }

    setIsSubmitting(true);
    setStep(5);
    setError(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, rows: validRows }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Batch import failed");
      }

      setResultMessage(data.message || `Successfully imported ${data.importedCount} records.`);
      setResultWarnings(data.warnings || []);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error executing import.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.filter((r) => !r.valid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">Reliable Data Import Wizard</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              5-Step guided CSV import with schema validation & duplicate detection.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="mt-4 flex items-center justify-between border-b border-neutral-100 pb-3 text-xs">
          {[
            { num: 1, label: "Template" },
            { num: 2, label: "Upload" },
            { num: 3, label: "Validate" },
            { num: 4, label: "Confirm" },
            { num: 5, label: "Result" },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  step === s.num
                    ? "bg-neutral-950 text-white"
                    : step > s.num
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </span>
              <span className={`hidden sm:inline ${step === s.num ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Error message */}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        {/* Step 1: Download Template */}
        {step === 1 ? (
          <div className="mt-5 space-y-4 text-xs">
            <div>
              <label className="block font-medium text-neutral-900">Select Entity Type to Import</label>
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value as ImportEntity)}
                className="mt-1.5 h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-neutral-800"
              >
                <option value="materials">Materials & Packaging Catalog</option>
                <option value="suppliers">Suppliers Directory</option>
                <option value="customers">Customers Directory</option>
              </select>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="font-medium text-neutral-900">Step 1: Download Standard CSV Template</p>
              <p className="mt-1 text-neutral-600">
                To guarantee zero import errors, download our pre-formatted template with verified column headers and sample data rows.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-xs hover:bg-neutral-50"
              >
                <Icon name="reports" className="h-3.5 w-3.5" />
                Download {entity} Template (.csv)
              </button>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800"
              >
                Continue to Upload →
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 2: Upload File */}
        {step === 2 ? (
          <div className="mt-5 space-y-4 text-xs">
            <div className="rounded-2xl border-2 border-dashed border-neutral-300 p-8 text-center hover:border-neutral-400 transition-colors">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <Icon name="documents" className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-neutral-900">Choose CSV File</p>
              <p className="mt-1 text-neutral-500">Select the prepared {entity} CSV file from your computer.</p>
              <label className="mt-4 inline-block cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-800">
                Browse Files
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700"
              >
                ← Back
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Preview & Validation */}
        {step === 3 ? (
          <div className="mt-4 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-neutral-950">File: {fileName}</span>
                <p className="text-neutral-500">Review rows and validation status before proceeding.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800">
                  {validCount} Valid
                </span>
                {invalidCount > 0 ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-800">
                    {invalidCount} Invalid / Duplicate
                  </span>
                ) : null}
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-[10px] uppercase text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Data Summary</th>
                    <th className="p-2.5">Validation Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {parsedRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className={row.valid ? "" : "bg-red-50/30"}>
                      <td className="p-2.5 text-neutral-500 tabular-nums">#{idx + 1}</td>
                      <td className="p-2.5">
                        {row.valid ? (
                          <StatusPill label="Arrived" />
                        ) : row.duplicate ? (
                          <StatusPill label="Warning" />
                        ) : (
                          <StatusPill label="Rejected" />
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-neutral-900 truncate max-w-xs">
                        {Object.values(row.raw).join(" · ")}
                      </td>
                      <td className="p-2.5 text-neutral-500">
                        {row.errors.length > 0 ? row.errors.join(", ") : "Ready"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={validCount === 0}
                onClick={() => setStep(4)}
                className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
              >
                Proceed to Confirmation ({validCount} valid) →
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 4: Confirmation Summary */}
        {step === 4 ? (
          <div className="mt-5 space-y-4 text-xs">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-2">
              <h4 className="font-semibold text-neutral-950">Import Confirmation Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-neutral-700 pt-2">
                <div>
                  <span className="text-neutral-400">Target Entity:</span>
                  <p className="font-semibold capitalize text-neutral-950">{entity}</p>
                </div>
                <div>
                  <span className="text-neutral-400">Source File:</span>
                  <p className="font-semibold text-neutral-950 truncate">{fileName}</p>
                </div>
                <div>
                  <span className="text-neutral-400">Valid Records to Add:</span>
                  <p className="font-semibold text-emerald-600 text-sm">{validCount}</p>
                </div>
                <div>
                  <span className="text-neutral-400">Invalid / Duplicates Skipped:</span>
                  <p className="font-semibold text-red-600 text-sm">{invalidCount}</p>
                </div>
              </div>
            </div>

            <p className="text-neutral-500">
              By confirming, the {validCount} valid records will be atomically imported into the active database. An audit trail entry will be logged for this batch operation.
            </p>

            <div className="flex justify-between pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 shadow-sm"
              >
                Confirm & Import {validCount} Records
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 5: Execution Result */}
        {step === 5 ? (
          <div className="mt-6 text-center space-y-4 text-xs">
            {isSubmitting ? (
              <div className="py-8">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
                <p className="mt-4 font-semibold text-neutral-900">Importing records...</p>
                <p className="mt-1 text-neutral-500">Performing atomic insertion and duplicate verification.</p>
              </div>
            ) : resultMessage ? (
              <div className="py-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Icon name="offers" className="h-6 w-6" />
                </div>
                <h4 className="mt-4 text-base font-semibold text-neutral-950">Import Completed</h4>
                <p className="mt-1 text-neutral-600">{resultMessage}</p>

                {resultWarnings.length > 0 ? (
                  <div className="mt-4 max-h-32 overflow-y-auto rounded-xl bg-amber-50 p-3 text-left text-amber-800 text-[11px]">
                    <span className="font-semibold">Warnings:</span>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {resultWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg bg-neutral-900 px-5 py-2 font-medium text-white hover:bg-neutral-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
