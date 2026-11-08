"use client";

import { useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { canPerform } from "@/lib/permissions";
import { useSession } from "@/components/shell/auth-gate";

export function PackagingEditor() {
  const { state, addPackagingType, notice } = useDemo();
  const { identity } = useSession();
  const [label, setLabel] = useState("");
  const [tare, setTare] = useState("");
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = canPerform(identity.role, "manage-packaging");

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Packaging & tare definitions</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">Standard packaging types and unit tare weights used during loading and unloading operations.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {state.packaging.map((item) => (
          <li key={item.id}>
            {item.label}: {item.tareKg == null ? "manual tare or no tare" : `${item.tareKg} kg`}
          </li>
        ))}
      </ul>
      {canManage ? (
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => void (async () => {
          event.preventDefault();
          let tareKg: number | null = null;
          if (!manual) {
            const parsed = Number(tare);
            if (!Number.isFinite(parsed) || parsed < 0) {
              setError("Tare per unit must be zero or greater, in kilograms.");
              return;
            }
            tareKg = parsed;
          }
          setError(null);
          const failed = await addPackagingType({ label, tareKg });
          if (!failed) {
            setLabel("");
            setTare("");
          }
        })()}
      >
        <label className="text-xs text-neutral-500">
          Name
          <input value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Tare per unit (kg)
          <input value={tare} disabled={manual} onChange={(event) => setTare(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm disabled:bg-neutral-100" />
        </label>
        <label className="flex h-11 items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} />
          Manual tare or no tare
        </label>
        {error ? <p className="text-xs text-neutral-950 sm:col-span-2">{error}</p> : null}
        {notice ? <p className="text-xs text-neutral-700 sm:col-span-2">{notice}</p> : null}
        <button type="submit" className="h-11 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white sm:justify-self-start">
          Add packaging
        </button>
      </form>
      ) : null}
    </section>
  );
}
