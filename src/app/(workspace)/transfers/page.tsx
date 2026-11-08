"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { formatKg } from "@/domain/view";
import { canPerform } from "@/lib/permissions";

const warehouses = ["Bremen", "Turnhout", "Spain"];

export default function TransfersPage() {
  const { state, transfer, notice } = useDemo();
  const { identity } = useSession();
  const canCreate = canPerform(identity.role, "create-transfer");
  const [from, setFrom] = useState(identity.warehouse ?? "Bremen");
  const [to, setTo] = useState("Spain");
  const [material, setMaterial] = useState("LDPE ROLLEN");
  const [quantity, setQuantity] = useState("1");
  const [key] = useState(() => `transfer-${identity.email}`);

  return (
    <>
      <PageTitle title="Transfers" subtitle="Inter-warehouse stock transfers." />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canCreate ? (
        <Surface className="mb-4 max-w-xl p-4">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              transfer({ clientKey: `${key}-${from}-${to}-${material}-${quantity}-${state.transfers.length}`, from, to, material, quantity: Number(quantity) });
            }}
          >
            <label className="text-xs text-neutral-500">
              From
              <select value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm">
                {warehouses.map((site) => (
                  <option key={site}>{site}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-500">
              To
              <select value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm">
                {warehouses.map((site) => (
                  <option key={site}>{site}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-500">
              Material
              <input value={material} onChange={(event) => setMaterial(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
            </label>
            <label className="text-xs text-neutral-500">
              Quantity
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
            </label>
            <button type="submit" className="h-11 rounded-lg bg-neutral-950 text-sm font-medium text-white">
              Confirm transfer
            </button>
          </form>
        </Surface>
      ) : (
        <p className="mb-3 text-sm text-neutral-600">Read-only view of inter-warehouse stock transfers.</p>
      )}
      <ul className="space-y-2">
        {state.transfers.length === 0 ? (
          <li className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-600">No transfers yet.</li>
        ) : (
          state.transfers.map((item) => (
            <li key={item.id} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
              <p className="font-medium">
                {item.material} · {item.quantity} · {formatKg(item.weightKg)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {item.from} → {item.to} · {item.status}
              </p>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
