"use client";

import { useEffect, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { Icon } from "@/components/icons";
import { formatInstant } from "@/domain/view";

type AuditEntry = {
  id: string;
  createdAt: string;
  userId: string;
  actorName: string;
  actorRole: string;
  action: string;
  module: string;
  targetId: string;
  details: string;
  oldValue: string | null;
  newValue: string | null;
  warehouse: string | null;
  context: string | null;
  requestReference: string | null;
};

type AuditResponse = {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isScoped?: boolean;
  error?: string;
};

export default function AuditLogPage() {
  const { actor } = useDemo();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [isScoped, setIsScoped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  // Diff Modal State
  const [activeModalEntry, setActiveModalEntry] = useState<AuditEntry | null>(null);

  // Load audit records from server endpoint
  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (moduleFilter !== "all") params.set("module", moduleFilter);
    if (warehouseFilter !== "all") params.set("warehouse", warehouseFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    if (dateRange !== "all") {
      const now = new Date();
      if (dateRange === "today") {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.set("startDate", today.toISOString());
      } else if (dateRange === "7d") {
        const past = new Date(now.getTime() - 7 * 86400000);
        params.set("startDate", past.toISOString());
      } else if (dateRange === "30d") {
        const past = new Date(now.getTime() - 30 * 86400000);
        params.set("startDate", past.toISOString());
      }
    }

    fetch(`/api/audit?${params.toString()}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) throw new Error("Access restricted: Only Admin and Offer Moderator can view audit logs.");
          throw new Error(`Failed to load audit records (${res.status})`);
        }
        return res.json();
      })
      .then((data: AuditResponse) => {
        if (!cancelled) {
          setEntries(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
          setIsScoped(Boolean(data.isScoped));
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error loading audit records.");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search, roleFilter, moduleFilter, warehouseFilter, dateRange, page, pageSize]);

  // Handle Export CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (moduleFilter !== "all") params.set("module", moduleFilter);
    if (warehouseFilter !== "all") params.set("warehouse", warehouseFilter);
    params.set("format", "csv");
    window.open(`/api/audit?${params.toString()}`, "_blank");
  };

  // Handle Export JSON
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `stockflow-audit-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (actor?.role !== "owner" && actor?.role !== "moderator") {
    return (
      <>
        <PageTitle
          title="Audit Log"
          subtitle="Tamper-evident chronological record of system events, modifications, and user actions."
        />
        <Surface className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
            <Icon name="settings" className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-neutral-900">Access Restricted</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Audit logs are only accessible to administrators and offer moderators. Please switch to an authorized role.
          </p>
        </Surface>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Audit Log"
          subtitle={
            isScoped
              ? "Scoped record of all offer events, status updates, comments, and attachments."
              : "Complete tamper-evident chronological record of all system events, modifications, and user actions."
          }
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          >
            <Icon name="reports" className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
          >
            <Icon name="documents" className="h-3.5 w-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {isScoped ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-800">
          <span className="font-semibold">Offer Moderator Audit Scope:</span> You are viewing the audit trail filtered specifically for offer negotiations, comments, attachments, and status updates.
        </div>
      ) : null}

      {/* Filter and Search Bar */}
      <Surface className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search user, action, ID..."
              className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute inset-y-0 right-2 flex items-center text-xs text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            ) : null}
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            >
              <option value="all">All Roles</option>
              <option value="owner">Admin (Owner)</option>
              <option value="manager">Staff (Manager)</option>
              <option value="worker">Worker</option>
              <option value="moderator">Offer Moderator</option>
              <option value="system">System</option>
            </select>
          </div>

          {/* Module Filter */}
          <div>
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            >
              <option value="all">All Modules</option>
              <option value="purchase-order">Purchase Orders</option>
              <option value="shipment">Shipments & Operations</option>
              <option value="request">Worker Requests</option>
              <option value="offer">Offers</option>
              <option value="document">Documents & CMR</option>
              <option value="user">User Accounts</option>
              <option value="inventory">Inventory & Stock</option>
            </select>
          </div>

          {/* Warehouse Filter */}
          <div>
            <select
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            >
              <option value="all">All Warehouses</option>
              <option value="bornem">Bornem (Belgium)</option>
              <option value="turnhout">Turnhout (Belgium)</option>
              <option value="spain">Spain</option>
              <option value="pakistan">Pakistan</option>
            </select>
          </div>

          {/* Date Range */}
          <div>
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>
      </Surface>

      {/* Main Table */}
      <Surface className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50/50 text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Timestamp</th>
              <th scope="col" className="px-4 py-3">User & Role</th>
              <th scope="col" className="px-4 py-3">Module / Action</th>
              <th scope="col" className="px-4 py-3">Details</th>
              <th scope="col" className="px-4 py-3">Warehouse</th>
              <th scope="col" className="px-4 py-3 text-right">Inspection</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-neutral-500">
                  Loading audit log records…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-red-600">
                  {error}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-neutral-500">
                  No audit log entries match the current search or filters.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                    {formatInstant(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-neutral-950 text-xs">{entry.actorName}</div>
                    <div className="text-[10px] text-neutral-500 capitalize">{entry.actorRole}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <StatusPill label={entry.action} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-neutral-400 uppercase font-mono">{entry.module}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-700 max-w-xs truncate" title={entry.details}>
                    {entry.details}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">
                    {entry.warehouse || "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setActiveModalEntry(entry)}
                      className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-950"
                    >
                      Inspect Diff
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-xs sm:flex-row">
          <div className="flex items-center gap-2 text-neutral-500">
            <span>
              Showing <span className="font-medium text-neutral-900">{total > 0 ? (page - 1) * pageSize + 1 : 0}</span> to{" "}
              <span className="font-medium text-neutral-900">{Math.min(page * pageSize, total)}</span> of{" "}
              <span className="font-medium text-neutral-900">{total}</span> events
            </span>
            <span>•</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-700"
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-neutral-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </Surface>

      {/* Before / After Diff Modal */}
      {activeModalEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-neutral-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">Audit Record Inspection</h3>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Event ID: <span className="font-mono text-neutral-700">{activeModalEntry.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalEntry(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-3 sm:grid-cols-4">
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase">Actor</span>
                  <p className="font-medium text-neutral-900">{activeModalEntry.actorName}</p>
                  <p className="text-[10px] text-neutral-500 capitalize">{activeModalEntry.actorRole}</p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase">Action</span>
                  <p className="font-medium text-neutral-900">{activeModalEntry.action}</p>
                  <p className="text-[10px] text-neutral-500 uppercase">{activeModalEntry.module}</p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase">Target Record</span>
                  <p className="font-medium font-mono text-neutral-900 truncate" title={activeModalEntry.targetId}>
                    {activeModalEntry.targetId || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase">Timestamp</span>
                  <p className="font-medium text-neutral-900 tabular-nums">
                    {formatInstant(activeModalEntry.createdAt)}
                  </p>
                </div>
              </div>

              {activeModalEntry.warehouse ? (
                <div>
                  <span className="font-semibold text-neutral-700">Warehouse: </span>
                  <span className="text-neutral-600">{activeModalEntry.warehouse}</span>
                </div>
              ) : null}

              {activeModalEntry.requestReference ? (
                <div>
                  <span className="font-semibold text-neutral-700">Request Reference: </span>
                  <span className="font-mono text-neutral-600">{activeModalEntry.requestReference}</span>
                </div>
              ) : null}

              {/* Before vs After Change Diffs */}
              <div className="space-y-3">
                <h4 className="font-medium text-neutral-950">Change Comparison (Diff)</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                    <span className="text-[11px] font-semibold text-red-700">Before (Old Value)</span>
                    <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] text-neutral-800 whitespace-pre-wrap">
                      {activeModalEntry.oldValue || "— (No previous state)"}
                    </pre>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <span className="text-[11px] font-semibold text-emerald-700">After (New Value)</span>
                    <pre className="mt-2 max-h-48 overflow-auto font-mono text-[11px] text-neutral-800 whitespace-pre-wrap">
                      {activeModalEntry.newValue || activeModalEntry.details || "—"}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-neutral-100 pt-3">
              <button
                type="button"
                onClick={() => setActiveModalEntry(null)}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
