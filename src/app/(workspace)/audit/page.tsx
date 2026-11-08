"use client";

import Link from "next/link";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { formatInstant } from "@/domain/view";

export default function AuditLogPage() {
  const { state } = useDemo();
  const query = useWorkspaceSearch().trim().toLowerCase();

  const entries = state.activity.filter((entry) =>
    `${entry.status} ${entry.text} ${entry.actor ?? ""} ${entry.createdAt ?? ""}`.toLowerCase().includes(query),
  );

  return (
    <>
      <PageTitle
        title="Audit Log"
        subtitle="Complete chronological record of system actions, users, affected records, and timestamps."
      />
      <Surface className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
            <tr>
              {["Action", "User", "Details", "Timestamp", "Record"].map((header) => (
                <th key={header} scope="col" className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No audit log entries match the current search.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <StatusPill label={entry.status} />
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-950">{entry.actor ?? "System"}</td>
                  <td className="px-4 py-3 text-neutral-600">{entry.text}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums">
                    {entry.createdAt ? formatInstant(entry.createdAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={entry.href} className="text-xs font-medium text-neutral-950 underline underline-offset-4">
                      View record
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Surface>
    </>
  );
}

