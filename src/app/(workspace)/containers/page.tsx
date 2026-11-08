"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useLiveNow } from "@/components/ref/live-clock";
import { useSession } from "@/components/shell/auth-gate";
import { useWorkspaceSearch } from "@/components/shell/search-context";
import { demurrageLabel, visibleContainers } from "@/domain/view";
import { canPerform } from "@/lib/permissions";

export default function ContainersPage() {
  const { state, addInbound, notice } = useDemo();
  const { identity } = useSession();
  const query = useWorkspaceSearch().trim().toLowerCase();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const scoped = visibleContainers(state, actor);
  const rows = scoped.filter((row) => `${row.number} ${row.containerNumber} ${row.po} ${row.supplier} ${row.warehouse}`.toLowerCase().includes(query));
  const now = useLiveNow(rows.some((row) => row.status === "Unloading" && Boolean(row.demurrage.startedAt)));

  return (
    <>
      <PageTitle
        title="Incoming / Unloading"
        subtitle={identity.role === "worker" ? `Assigned warehouse: ${identity.warehouse}` : "Incoming containers and unloading operations across warehouses"}
      />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canPerform(identity.role, "register-shipment") ? <InboundCreate onCreate={addInbound} /> : null}
      {rows.length === 0 ? (
        <Surface className="px-4 py-10 text-center text-sm text-neutral-600">No matching containers.</Surface>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.number}>
                <Link href={`/containers/${row.number}`} className="block rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{row.number}</p>
                    <StatusPill label={row.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {row.po} · {row.supplier} · {row.warehouse}
                    {` · ${row.containerNumber.trim() ? row.containerNumber : "Equipment number not recorded"}`}
                  </p>
                  <p className="mt-1 text-xs text-neutral-700">{demurrageLabel(row, now)}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Surface className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-neutral-500 uppercase">
                <tr>
                  {["Record", "Equipment", "PO", "Supplier", "Origin", "Warehouse", "Status", "Demurrage", "ETA"].map((header) => (
                    <th key={header} scope="col" className="px-4 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.number} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/containers/${row.number}`} className="underline-offset-4 hover:underline">
                        {row.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.containerNumber.trim() ? row.containerNumber : "Not recorded"}</td>
                    <td className="px-4 py-3">{row.po}</td>
                    <td className="px-4 py-3">{row.supplier}</td>
                    <td className="px-4 py-3">{row.origin}</td>
                    <td className="px-4 py-3">{row.warehouse}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={row.status} />
                    </td>
                    <td className="px-4 py-3 text-xs">{demurrageLabel(row, now)}</td>
                    <td className="px-4 py-3">{row.eta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </>
      )}
    </>
  );
}

function InboundCreate({ onCreate }: { onCreate: (draft: { number: string; po: string; supplier: string; warehouse: string }) => Promise<string | undefined> }) {
  const [number, setNumber] = useState("");
  const [po, setPo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [warehouse, setWarehouse] = useState("Bremen");
  const [error, setError] = useState<string | null>(null);
  return (
    <Surface className="mb-4 p-4">
      <h2 className="text-sm font-semibold">New inbound shipment</h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => void (async () => {
          event.preventDefault();
          if (!number.trim() || !po.trim() || !supplier.trim() || !warehouse.trim()) {
            setError("Container number, PO number, supplier, and warehouse are required.");
            return;
          }
          setError(null);
          const failed = await onCreate({ number, po, supplier, warehouse });
          if (!failed) {
            setNumber("");
            setPo("");
            setSupplier("");
          }
        })()}
      >
        <label className="text-xs text-neutral-500">
          Container number
          <input value={number} onChange={(event) => setNumber(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          PO number
          <input value={po} onChange={(event) => setPo(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Supplier
          <input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Warehouse
          <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm">
            {["Bremen", "Turnhout", "Spain"].map((site) => (
              <option key={site}>{site}</option>
            ))}
          </select>
        </label>
        {error ? <p className="text-xs text-neutral-950 sm:col-span-2">{error}</p> : null}
        <button type="submit" className="h-11 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white sm:justify-self-start">
          Add planned shipment
        </button>
      </form>
    </Surface>
  );
}
