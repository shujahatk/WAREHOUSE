"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/providers/workspace-provider";
import { Surface } from "@/components/ref/chrome";
import { useSession } from "@/components/shell/auth-gate";
import { formatInstant, visibleContainers, visibleDocuments, visibleOutbound } from "@/domain/view";
import { canPerform } from "@/lib/permissions";
import { UploadCapture } from "@/components/files/upload-capture";

export function AnnexDesk({ shipment, direction }: { shipment?: string; direction?: "inbound" | "outbound" }) {
  const demo = useDemo();
  const { identity } = useSession();
  const actor = { name: identity.name, role: identity.role, warehouse: identity.warehouse, email: identity.email, company: identity.company };
  const records = visibleDocuments(demo.state, actor).filter((item) => {
    if (item.origin !== "annex7" || !item.annex) return false;
    if (!shipment) return true;
    return item.annex.shipment === shipment && item.annex.direction === direction;
  });
  const canAdd = canPerform(identity.role, "add-annex");
  const canReview = canPerform(identity.role, "review-annex");
  const canApprove = canPerform(identity.role, "approve-annex");
  const options = [
    ...visibleContainers(demo.state, actor).map((row) => ({ direction: "inbound" as const, number: row.number, label: `${row.number} · inbound · ${row.po || "PO not recorded"}` })),
    ...visibleOutbound(demo.state, actor).map((row) => ({ direction: "outbound" as const, number: row.number, label: `${row.number} · outbound · ${row.po || "PO not recorded"}` })),
  ];

  return (
    <div id={shipment ? undefined : "annex-7"}>
    <Surface className="p-4">
      <h2 className="text-sm font-semibold">Annex VII</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Annex VII cross-border movement documentation linked to loading and unloading shipments.
      </p>
      {records.length === 0 ? <p className="mt-3 text-sm text-neutral-600">No Annex VII document is linked here.</p> : null}
      <ul className="mt-3 space-y-3">
        {records.map((item) => {
          const annex = item.annex;
          if (!annex) return null;
          const fileUrl = item.url;
          const href = annex.direction === "inbound" ? `/containers/${annex.shipment}` : `/outbound/${annex.shipment}`;
          return (
            <li key={item.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{annex.reference}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {item.name} · {annex.status} · {annex.uploadedBy} · {annex.uploadedAt ? formatInstant(annex.uploadedAt) : "Time not recorded"}
                  </p>
                </div>
                <span className="rounded-full border border-neutral-300 px-2 py-1 text-xs">{annex.status}</span>
              </div>
              <p className="mt-2 text-sm">
                <Link href={href} className="underline underline-offset-4">
                  {annex.shipment}
                </Link>
                {item.po.trim() ? ` · ${item.po}` : " · Order not recorded"}
              </p>
              {annex.notes ? <p className="mt-2 text-sm text-neutral-700">{annex.notes}</p> : null}
              {fileUrl ? (
                <a href={fileUrl} className="mt-3 inline-flex h-10 items-center rounded-lg border border-neutral-950 px-3 text-sm">
                  View file
                </a>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {canReview && annex.status === "Uploaded" ? (
                  <button type="button" onClick={() => demo.reviewAnnex(item.id)} className="h-10 rounded-lg border border-neutral-950 px-3 text-sm">
                    Mark under review
                  </button>
                ) : null}
                {canApprove && annex.status !== "Approved" ? (
                  <button type="button" onClick={() => demo.approveAnnex(item.id)} className="h-10 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white">
                    Approve document
                  </button>
                ) : null}
              </div>
              {annex.history.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                  {annex.history.map((entry) => (
                    <li key={entry.id} className="text-xs leading-5 text-neutral-600">
                      {formatInstant(entry.at)} · {entry.actor} · {entry.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canAdd ? <AnnexUpload shipment={shipment} direction={direction} options={options} /> : null}
    </Surface>
    </div>
  );
}

function AnnexUpload({
  shipment,
  direction,
  options,
}: {
  shipment?: string;
  direction?: "inbound" | "outbound";
  options: { direction: "inbound" | "outbound"; number: string; label: string }[];
}) {
  const { addAnnex } = useDemo();
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState(shipment && direction ? `${direction}:${shipment}` : options[0] ? `${options[0].direction}:${options[0].number}` : "");
  const [uploadedDoc, setUploadedDoc] = useState<{ id: string; filename: string; mime: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fieldClass = "mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950";
  const [chosenDirection, chosenShipment] = (shipment && direction ? `${direction}:${shipment}` : link).split(":");

  return (
    <form
      className="mt-4 grid gap-3 border-t border-neutral-100 pt-4"
      onSubmit={(event) => void (async () => {
        event.preventDefault();
        if (!reference.trim()) {
          setError("Enter a document reference.");
          return;
        }
        if (!chosenShipment || (chosenDirection !== "inbound" && chosenDirection !== "outbound")) {
          setError("Choose the shipment this file belongs to.");
          return;
        }
        if (!uploadedDoc) {
          setError("Take a photo or choose a PDF/image file first.");
          return;
        }
        const failed = await addAnnex({
          id: `annex-${chosenShipment}`,
          reference,
          shipment: chosenShipment,
          direction: chosenDirection as "inbound" | "outbound",
          name: uploadedDoc.filename,
          mime: uploadedDoc.mime,
          size: uploadedDoc.size,
          notes,
          fileId: uploadedDoc.id,
          bytesBase64: "",
        });
        if (failed) {
          setError(failed);
          return;
        }
        setError(null);
        setReference("");
        setNotes("");
        setUploadedDoc(null);
      })()}
    >
      <h3 className="text-sm font-semibold">Add Annex 7 file</h3>
      <label className="text-xs text-neutral-500">
        Document reference
        <input value={reference} onChange={(event) => setReference(event.target.value)} className={fieldClass} />
      </label>
      {shipment && direction ? (
        <p className="text-sm">Linked to {shipment}</p>
      ) : (
        <label className="text-xs text-neutral-500">
          Shipment
          <select value={link} onChange={(event) => setLink(event.target.value)} className={fieldClass}>
            {options.map((option) => (
              <option key={`${option.direction}:${option.number}`} value={`${option.direction}:${option.number}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-xs text-neutral-500">
        Notes, optional
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-950" />
      </label>
      <div>
        <label className="text-xs text-neutral-500">Annex 7 document (PDF or image)</label>
        <UploadCapture
          kind="annex7"
          acceptPdf={true}
          multiple={false}
          shipmentReference={chosenShipment}
          notes={notes}
          label="Capture or pick Annex 7"
          helperText="Take photo or choose file (PDF or image). Uploads immediately."
          onUploadSuccess={(docId, name) => {
            setUploadedDoc({ id: docId, filename: name, mime: "application/pdf", size: 0 });
            setError(null);
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-neutral-950">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={!uploadedDoc} className="h-11 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white disabled:opacity-40">
        Record Annex 7
      </button>
    </form>
  );
}
