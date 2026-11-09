"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { handoverStatus, visibleOutbound } from "@/domain/view";
import { canPerform } from "@/lib/permissions";

export default function OutboundPage() {
  const { state, addOutbound, notice } = useDemo();
  const { identity } = useSession();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const rows = visibleOutbound(state, actor);

  return (
    <>
      <PageTitle title="Outgoing / Loading" subtitle={identity.role === "worker" ? `Loading operations at ${identity.warehouse}` : "Outgoing shipments and loading operations across warehouses"} />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canPerform(identity.role, "register-shipment") ? <OutboundCreate onCreate={addOutbound} /> : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.number}>
            <Link href={`/outbound/${row.number}`} className="block rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.number}</p>
                  <p className="mt-1 text-sm text-neutral-700">
                    {row.customer || "Customer not recorded"} · {row.po.trim() ? row.po : "SO / PO not recorded"} · {row.container.trim() ? row.container : "Container not recorded"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {row.warehouse} · {row.date}
                    {row.weightKg > 0 ? ` · ${row.weightKg.toLocaleString("en-US")} kg` : ""}
                    {` · ${handoverStatus(row)}`}
                    {` · ${row.carrier.trim() ? row.carrier : "Carrier not recorded"}`}
                    {row.handover.trim() ? ` · handover ${row.handover}` : ""}
                  </p>
                </div>
                <StatusPill label={row.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <Surface className="px-4 py-8 text-sm text-neutral-600">No outgoing shipments for this view.</Surface> : null}
    </>
  );
}

function OutboundCreate({
  onCreate,
}: {
  onCreate: (draft: { number: string; po: string; container: string; customer: string; warehouse: string }) => Promise<string | undefined>;
}) {
  const [number, setNumber] = useState("");
  const [po, setPo] = useState("");
  const [container, setContainer] = useState("");
  const [customer, setCustomer] = useState("");
  const [warehouse, setWarehouse] = useState("Bornem");
  const [error, setError] = useState<string | null>(null);
  return (
    <Surface className="mb-4 p-4">
      <h2 className="text-sm font-semibold">New outgoing / loading shipment</h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => void (async () => {
          event.preventDefault();
          if (!number.trim() || !po.trim() || !container.trim() || !customer.trim()) {
            setError("Shipment number, SO / PO number, container number, and customer are required.");
            return;
          }
          setError(null);
          const failed = await onCreate({ number, po, container, customer, warehouse });
          if (!failed) {
            setNumber("");
            setPo("");
            setContainer("");
            setCustomer("");
          }
        })()}
      >
        <label className="text-xs text-neutral-500">
          Shipment number
          <input value={number} onChange={(event) => setNumber(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          SO / PO number
          <input value={po} onChange={(event) => setPo(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Container number
          <input value={container} onChange={(event) => setContainer(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Customer
          <input value={customer} onChange={(event) => setCustomer(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Warehouse
          <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm">
            {["Bornem", "Turnhout", "Spain", "Pakistan"].map((site) => (
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
