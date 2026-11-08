"use client";

import { useDemo } from "@/components/providers/workspace-provider";
import { formatKg } from "@/domain/view";

export function PostedMovements() {
  const { state } = useDemo();
  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Posted stock movements</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Completed inbound unloading net weights, outgoing loading net weights, and inter-warehouse transfers.
      </p>
      {state.postedMovements.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">No stock movements posted yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {state.postedMovements.map((row) => (
            <li key={row.id} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <p className="font-medium">
                {row.kind} · {row.reference}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {row.material} · {formatKg(row.netKg)} · {row.from} → {row.to} · {row.date}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
