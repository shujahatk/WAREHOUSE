"use client";

import Link from "next/link";
import { useState } from "react";
import { BackLink, PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { canReadOrder, formatEuro, formatKg } from "@/domain/view";
import { canPerform } from "@/lib/permissions";

export function PurchaseDetail({ number }: { number: string }) {
  const { state, approve, reject, editPurchase, notice } = useDemo();
  const { identity } = useSession();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const found = state.orders.find((item) => item.number.toLowerCase() === number.toLowerCase());
  const order = found && canReadOrder(actor, found) ? found : undefined;
  const [supplier, setSupplier] = useState(order?.supplier ?? "");
  const [material, setMaterial] = useState(order?.material ?? "");
  const [quantity, setQuantity] = useState(order ? String(order.quantityKg) : "");
  const [value, setValue] = useState(order ? String(order.valueEur) : "");
  if (!order) {
    return (
      <>
        <BackLink href="/purchases" label="PO & SO Orders" />
        <Surface className="p-6">
          <h1 className="text-lg font-semibold">Order not found</h1>
        </Surface>
      </>
    );
  }
  const pending = order.status === "Pending";
  const canApprove = canPerform(identity.role, "approve-order") && pending;
  const canReject = canPerform(identity.role, "reject-order") && pending;
  const canEdit = canPerform(identity.role, "edit-order") && order.status !== "Rejected";

  return (
    <>
      <BackLink href="/purchases" label="PO & SO Orders" />
      <PageTitle
        title={order.number}
        subtitle={`${order.customerCompany && order.customerCompany !== order.supplier ? `${order.customerCompany} · ` : ""}${order.supplier} · ${order.date} · ${order.number}`}
        action={<StatusPill label={order.status} />}
      />
      {notice ? <p className="mb-3 text-sm text-neutral-700">{notice}</p> : null}
      {canApprove || canReject ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {canApprove ? (
            <button type="button" onClick={() => approve(order.number)} className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white">
              Approve order
            </button>
          ) : null}
          {canReject ? (
            <button type="button" onClick={() => reject(order.number)} className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950">
              Reject order
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mb-4 text-sm text-neutral-600">
          This order is {order.status.toLowerCase()}.
        </p>
      )}
      {canEdit ? (
        <form
          className="mb-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
          onSubmit={(event) => void (async () => {
            event.preventDefault();
            const error = await editPurchase(order.number, {
              supplier,
              material,
              quantityKg: Number(quantity),
              valueEur: Number(value),
            });
            if (!error) {
              setSupplier(supplier.trim());
              setMaterial(material.trim());
            }
          })()}
        >
          <label className="text-xs text-neutral-500">
            Supplier / Customer
            <input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Material
            <input value={material} onChange={(event) => setMaterial(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Quantity kg
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <label className="text-xs text-neutral-500">
            Value EUR
            <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950" />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white sm:col-span-2 sm:justify-self-start">
            Save order details
          </button>
        </form>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <Surface className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Material</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Field term="Customer" value={order.customerCompany.trim() ? order.customerCompany : "Internal order"} />
            <Field term="Material" value={order.material === "—" ? "Not recorded" : order.material} />
            <Field term="Quantity" value={order.quantityKg > 0 ? formatKg(order.quantityKg) : "Not recorded"} />
            <Field term="Notes" value={order.notes.trim() ? order.notes : "None"} />
            <Field term="Incoterms" value={order.incoterms} />
            <Field term="Value" value={order.valueEur > 0 ? formatEuro(order.valueEur) : "Not recorded"} />
          </dl>
        </Surface>
        <Surface className="flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <Link href="/documents" className="text-sm font-medium underline underline-offset-4">
              View Documents
            </Link>
          </div>
        </Surface>
        <Surface className="p-4">
          <h2 className="text-sm font-semibold">Supplier / Customer</h2>
          <p className="mt-3 text-sm font-medium">{order.supplier}</p>
          <p className="mt-1 text-xs text-neutral-500">{order.supplierEmail}</p>
        </Surface>
        <Surface className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Transport</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Field term="Forwarder" value={order.forwarder} />
            <Field term="Container" value={order.container} />
            <Field term="Ship" value={order.ship} />
            <Field term="ETA" value={order.eta} />
          </dl>
        </Surface>
      </div>
    </>
  );
}

function Field({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{term}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
