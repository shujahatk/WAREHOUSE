"use client";

import { useMemo, useState } from "react";
import { useDemo } from "@/components/providers/workspace-provider";
import { AnnexDesk } from "@/components/ref/annex-desk";
import { BackLink, PageTitle, StatusPill, Surface } from "@/components/ref/chrome";
import { DemurragePanel } from "@/components/ref/demurrage-panel";
import { RequestWorkflowPanel } from "@/components/ref/request-workflow-panel";
import { useSession } from "@/components/shell/auth-gate";
import { dispatchPhase3Blocks, formatInstant, formatKg, handoverStatus, type DemoContainer, type DemoOutbound, type ShipmentAttachment, type ShipmentSection } from "@/domain/view";
import { calculateSection } from "@/lib/packaging";
import { canOperateWarehouse, canPerform } from "@/lib/permissions";
import { UploadCapture } from "@/components/files/upload-capture";
import { FileGallery } from "@/components/files/file-gallery";

type Direction = "inbound" | "outbound";

const fieldClass = "mt-1 h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-950";

function readNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function blank(value: string): string {
  return value.trim() ? value : "Not recorded";
}

export function ShipmentDesk({ direction, number }: { direction: Direction; number: string }) {
  const demo = useDemo();
  const { identity } = useSession();
  const record = direction === "inbound" ? demo.state.containers.find((item) => item.number === number) : demo.state.outbound.find((item) => item.number === number);

  if (!record) {
    return (
      <>
        <BackLink href={direction === "inbound" ? "/containers" : "/outbound"} label={direction === "inbound" ? "Incoming / Unloading" : "Outgoing / Loading"} />
        <Surface className="p-6">
          <h1 className="text-lg font-semibold">Shipment not found</h1>
        </Surface>
      </>
    );
  }

  if (identity.role === "worker" && !canOperateWarehouse(identity.role, identity.warehouse, record.warehouse)) {
    return (
      <>
        <BackLink href={direction === "inbound" ? "/containers" : "/outbound"} label={direction === "inbound" ? "Incoming / Unloading" : "Outgoing / Loading"} />
        <Surface className="p-6">
          <h1 className="text-xl font-semibold">Warehouse access denied</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            This shipment belongs to {record.warehouse}. Your worker account is limited to {identity.warehouse}. The record is not opened here.
          </p>
        </Surface>
      </>
    );
  }

  return <ShipmentForm direction={direction} record={record} />;
}

function ShipmentForm({ direction, record }: { direction: Direction; record: DemoContainer | DemoOutbound }) {
  const demo = useDemo();
  const { identity } = useSession();
  const inbound = direction === "inbound";
  const outbound = inbound ? null : (record as DemoOutbound);
  const closed = inbound ? record.status === "Completed" : record.status === "Dispatched";
  const canEditIdentity = canPerform(identity.role, "register-shipment") && !closed;
  const activeRequest = demo.state.requests.find(
    (r) =>
      r.shipmentReference === record.number &&
      r.type === (inbound ? "unloading" : "loading") &&
      r.status !== "deleted"
  );
  const requestApprovedOrCompleted =
    activeRequest?.status === "approved" || activeRequest?.status === "completed";
  const canEditSections =
    canPerform(identity.role, "edit-shipment") &&
    !closed &&
    identity.role !== "manager" &&
    !requestApprovedOrCompleted &&
    (identity.role !== "worker" || canOperateWarehouse(identity.role, identity.warehouse, record.warehouse));
  const canUploadCmr =
    canPerform(identity.role, "save-cmr") &&
    !closed &&
    (identity.role !== "worker" || canOperateWarehouse(identity.role, identity.warehouse, record.warehouse));
  const canUploadPhoto = canEditSections && identity.role === "worker";
  const canRecordHandover = Boolean(outbound) && (canPerform(identity.role, "dispatch") || canPerform(identity.role, "register-shipment")) && (identity.role !== "worker" || canOperateWarehouse(identity.role, identity.warehouse, record.warehouse));
  const files = demo.state.attachments.filter((item) => item.shipment === record.number);
  const cmr = files.find((item) => item.role === "cmr");
  const photos = files.filter((item) => item.role === "photo");
  const po = record.po;
  const party = "supplier" in record ? record.supplier : record.customer;
  const containerNumber = "supplier" in record ? record.containerNumber : record.container;

  const nextLabel = inbound
    ? record.status === "Planned" || record.status === "In transit" || record.status === "Arrived"
      ? "Mark registered"
      : record.status === "Registered"
        ? "Start unloading"
        : record.status === "Unloading"
          ? "Complete unloading"
          : null
    : record.status === "Planned"
      ? "Start loading"
      : record.status === "Loading"
        ? "Mark loaded"
        : record.status === "Loaded"
          ? "Dispatch"
          : null;
  const nextAction = inbound
    ? record.status === "Planned" || record.status === "In transit" || record.status === "Arrived"
      ? "register-shipment"
      : "unload"
    : "dispatch";
  const canAdvance = Boolean(nextLabel) && canPerform(identity.role, nextAction) && (identity.role !== "worker" || canOperateWarehouse(identity.role, identity.warehouse, record.warehouse));

  return (
    <>
      <BackLink href={inbound ? "/containers" : "/outbound"} label={inbound ? "Incoming / Unloading" : "Outgoing / Loading"} />
      <PageTitle
        title={record.number}
        subtitle={`${blank(po)} · ${blank(party)} · ${record.warehouse}`}
        action={<StatusPill label={record.status} />}
      />
      <p className="mb-3 text-sm leading-6 text-neutral-600">
        {inbound
          ? "Inbound moves Planned → Registered → Unloading → Completed. Demurrage starts at Unloading. Stock is posted when an approved unloading request is completed."
          : "Outbound moves Planned → Loading → Loaded → Dispatched. Stock is deducted when an approved loading request is completed."}
      </p>
      {demo.notice ? (
        <p role="status" className="mb-3 text-sm text-neutral-800">
          {demo.notice}
        </p>
      ) : null}
      {"demurrage" in record ? <div className="mb-4"><DemurragePanel container={record} /></div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="order-2 space-y-4 lg:order-1">
          <Surface className="p-4">
            <h2 className="text-sm font-semibold">Shipment record</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-neutral-500">{inbound ? "PO number" : "SO / PO number"}</dt>
                <dd>{blank(po)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Container number</dt>
                <dd>{blank(containerNumber)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">{inbound ? "Supplier" : "Customer"}</dt>
                <dd>{blank(party)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Warehouse</dt>
                <dd>{record.warehouse}</dd>
              </div>
              {outbound ? (
                <div>
                  <dt className="text-xs text-neutral-500">Carrier</dt>
                  <dd>{blank(outbound.carrier)}</dd>
                </div>
              ) : null}
              {outbound ? (
                <div>
                  <dt className="text-xs text-neutral-500">Handover</dt>
                  <dd>
                    {handoverStatus(outbound)}
                    {outbound.handover.trim() ? ` · ${outbound.handover}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            {outbound && outbound.weightKg > 0 ? (
              <p className="mt-3 text-xs leading-5 text-neutral-500">
                Recorded gross: {formatKg(outbound.weightKg)}. Dispatch uses net kilograms from the approved request.
              </p>
            ) : null}
            {record.status === "Loaded" && inbound ? (
              <p className="mt-3 text-sm text-neutral-700">This record is Loaded and sits outside the inbound flow. It cannot be completed from here.</p>
            ) : null}
            {canEditIdentity ? (
              <IdentityForm
                direction={direction}
                number={record.number}
                po={po}
                container={containerNumber}
                party={party}
                partyLabel={inbound ? "Supplier" : "Customer"}
              />
            ) : null}
            {outbound && canRecordHandover ? <HandoverForm number={outbound.number} carrier={outbound.carrier} handover={outbound.handover} /> : null}
            {outbound && record.status === "Loaded" && dispatchPhase3Blocks(outbound).length > 0 ? (
              <div className="mt-4 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
                <p className="text-sm font-medium">Dispatch requires carrier information</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                  {dispatchPhase3Blocks(outbound).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canAdvance && nextLabel ? (
              <button
                type="button"
                onClick={() => (inbound ? demo.unload(record.number) : demo.dispatch(record.number))}
                className="mt-4 h-11 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
              >
                {nextLabel}
              </button>
            ) : nextLabel ? (
              <p className="mt-3 text-xs text-neutral-500">This role cannot take operational status steps.</p>
            ) : (
              <p className="mt-3 text-sm text-neutral-600">This shipment is {record.status}.</p>
            )}
          </Surface>
          <RequestWorkflowPanel shipmentNumber={record.number} direction={direction} warehouse={record.warehouse} />
          <SectionEditor direction={direction} shipment={record.number} sections={record.sections} packaging={demo.state.packaging} canEdit={canEditSections} onSave={demo.saveMaterial} onRemove={demo.deleteMaterial} />
          <AnnexDesk shipment={record.number} direction={direction} />
          <PhotoPanel shipment={record.number} photos={photos} canUpload={canUploadPhoto} />
        </div>
        <div className="order-1 lg:order-2">
          <CmrPanel shipment={record.number} direction={direction} po={po} cmr={cmr} canUpload={canUploadCmr} closed={closed} />
        </div>
      </div>
    </>
  );
}

function IdentityForm({
  direction,
  number,
  po,
  container,
  party,
  partyLabel,
}: {
  direction: Direction;
  number: string;
  po: string;
  container: string;
  party: string;
  partyLabel: string;
}) {
  const { saveMeta } = useDemo();
  const [poValue, setPoValue] = useState(po);
  const [containerValue, setContainerValue] = useState(container);
  const [partyValue, setPartyValue] = useState(party);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!poValue.trim() || !containerValue.trim() || !partyValue.trim()) {
          setError("Order number, container number, and supplier or customer are required.");
          return;
        }
        setError(null);
        saveMeta({ direction, number, po: poValue, container: containerValue, party: partyValue });
      }}
    >
      <label className="text-xs text-neutral-500">
        {direction === "inbound" ? "PO number" : "SO / PO number"}
        <input value={poValue} onChange={(event) => setPoValue(event.target.value)} className={fieldClass} />
      </label>
      <label className="text-xs text-neutral-500">
        Container number
        <input value={containerValue} onChange={(event) => setContainerValue(event.target.value)} className={fieldClass} />
      </label>
      {direction === "inbound" ? <p className="text-xs leading-5 text-neutral-500">This is the equipment number. The record id {number} stays in the address and is not replaced.</p> : null}
      <label className="text-xs text-neutral-500">
        {partyLabel}
        <input value={partyValue} onChange={(event) => setPartyValue(event.target.value)} className={fieldClass} />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-neutral-950">
          {error}
        </p>
      ) : null}
      <button type="submit" className="h-11 rounded-lg border border-neutral-950 px-3 text-sm font-medium">
        Save shipment details
      </button>
    </form>
  );
}

function HandoverForm({ number, carrier, handover }: { number: string; carrier: string; handover: string }) {
  const { saveCarrier } = useDemo();
  const [carrierValue, setCarrierValue] = useState(carrier);
  const [handoverValue, setHandoverValue] = useState(handover);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!carrierValue.trim()) {
          setError("Enter the carrier name before saving handover details.");
          return;
        }
        setError(null);
        saveCarrier({ number, carrier: carrierValue, handover: handoverValue });
      }}
    >
      <label className="text-xs text-neutral-500">
        Carrier name
        <input value={carrierValue} onChange={(event) => setCarrierValue(event.target.value)} className={fieldClass} />
      </label>
      <label className="text-xs text-neutral-500">
        Handover date and time
        <input value={handoverValue} onChange={(event) => setHandoverValue(event.target.value)} placeholder="22 Oct 2026, 14:00" className={fieldClass} />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-neutral-950">
          {error}
        </p>
      ) : null}
      <button type="submit" className="h-11 rounded-lg border border-neutral-950 px-3 text-sm font-medium">
        Save handover
      </button>
    </form>
  );
}

function SectionEditor({
  direction,
  shipment,
  sections,
  packaging,
  canEdit,
  onSave,
  onRemove,
}: {
  direction: Direction;
  shipment: string;
  sections: ShipmentSection[];
  packaging: { id: string; label: string; tareKg: number | null }[];
  canEdit: boolean;
  onSave: (draft: {
    shipment: string;
    direction: Direction;
    material: string;
    mode: "weight" | "count";
    grossKg: number | null;
    packagingId: string;
    packagingQty: number | null;
    tarePerUnitKg: number | null;
    noTare: boolean;
    count: number | null;
  }) => Promise<string | undefined>;
  onRemove: (direction: Direction, shipment: string, sectionId: string) => Promise<string | undefined>;
}) {
  const [material, setMaterial] = useState("");
  const [mode, setMode] = useState<"weight" | "count">("weight");
  const [gross, setGross] = useState("");
  const [packagingId, setPackagingId] = useState(packaging[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [noTare, setNoTare] = useState(false);
  const [manualTare, setManualTare] = useState("");
  const [count, setCount] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const selected = packaging.find((item) => item.id === packagingId) ?? packaging[0];
  const effectivePackagingId = selected?.id ?? packagingId;
  const manual = selected?.tareKg == null;
  const live = useMemo(() => {
    return calculateSection({
      mode,
      grossKg: readNumber(gross),
      tarePerUnitKg: manual ? (noTare ? 0 : readNumber(manualTare)) : (selected?.tareKg ?? null),
      packagingQty: readNumber(quantity),
      noTare: manual && noTare,
    });
  }, [gross, manual, manualTare, mode, noTare, quantity, selected?.tareKg]);

  return (
    <Surface className="p-4">
      <h2 className="text-sm font-semibold">Material sections</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">Weights are kilograms. Net weight is gross minus total tare. Count-only sections do not post a weight.</p>
      <ul className="mt-3 space-y-2">
        {sections.map((section) => (
          <li key={section.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
            <p className="font-medium">{section.material}</p>
            {section.mode === "count" ? (
              <p className="mt-1 text-xs text-neutral-600">Count only: {section.count}. No weight is posted.</p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-neutral-600">
                Gross {section.grossKg ?? "—"} kg · tare {section.tarePerUnitKg ?? "—"} kg × {section.packagingQty ?? "—"} = {section.totalTareKg} kg · net {section.netKg ?? "—"} kg
              </p>
            )}
            {canEdit ? (
              <button type="button" onClick={() => onRemove(direction, shipment, section.id)} className="mt-2 h-10 text-xs underline underline-offset-4">
                Remove section
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {sections.length === 0 ? <p className="mt-3 text-sm text-neutral-600">No material section yet. A missing weight is not filled in.</p> : null}
      {canEdit ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => void (async () => {
            event.preventDefault();
            if (!material.trim()) {
              setFieldError("Enter a material type.");
              return;
            }
            if (mode === "weight" && !live.ok) {
              setFieldError(live.error);
              return;
            }
            if (mode === "count" && (!Number.isInteger(readNumber(count)) || (readNumber(count) ?? 0) <= 0)) {
              setFieldError("Enter a whole count greater than zero. No weight will be invented.");
              return;
            }
            setFieldError(null);
            const failed = await onSave({
              shipment,
              direction,
              material,
              mode,
              grossKg: readNumber(gross),
              packagingId: effectivePackagingId,
              packagingQty: readNumber(quantity),
              tarePerUnitKg: manual ? readNumber(manualTare) : (selected?.tareKg ?? null),
              noTare: manual && noTare,
              count: readNumber(count),
            });
            if (failed) {
              setFieldError(failed);
              return;
            }
            setMaterial("");
            setGross("");
            setCount("");
          })()}
        >
          <label className="text-xs text-neutral-500">
            Material type
            <input value={material} onChange={(event) => setMaterial(event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs text-neutral-500">
            Entry
            <select value={mode} onChange={(event) => setMode(event.target.value as "weight" | "count")} className={fieldClass}>
              <option value="weight">Weight in kilograms</option>
              <option value="count">Count only</option>
            </select>
          </label>
          {mode === "weight" ? (
            <>
              <label className="text-xs text-neutral-500">
                Gross weight (kg)
                <input inputMode="decimal" value={gross} onChange={(event) => setGross(event.target.value)} className={fieldClass} />
              </label>
              <label className="text-xs text-neutral-500">
                Packaging type
                <select
                  value={effectivePackagingId}
                  onChange={(event) => {
                    setPackagingId(event.target.value);
                    const next = packaging.find((item) => item.id === event.target.value);
                    setNoTare(next?.tareKg == null);
                  }}
                  className={fieldClass}
                >
                  {packaging.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {item.tareKg == null ? " · manual or no tare" : ` · ${item.tareKg} kg`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-500">
                Packaging quantity
                <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={fieldClass} />
              </label>
              {manual ? (
                <div>
                  <label className="flex h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={noTare} onChange={(event) => setNoTare(event.target.checked)} />
                    No tare
                  </label>
                  {noTare ? null : (
                    <label className="text-xs text-neutral-500">
                      Manual tare per unit (kg)
                      <input inputMode="decimal" value={manualTare} onChange={(event) => setManualTare(event.target.value)} className={fieldClass} />
                    </label>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-700">Tare per unit: {selected?.tareKg} kg</p>
              )}
              {gross.trim() === "" ? (
                <p className="text-sm text-neutral-600">Enter a gross weight to calculate net kilograms.</p>
              ) : live.ok ? (
                <p className="text-sm text-neutral-800">
                  Total tare {live.totalTareKg} kg. Net weight {live.netKg} kg.
                </p>
              ) : (
                <p role="alert" className="text-xs text-neutral-950">
                  {live.error}
                </p>
              )}
            </>
          ) : (
            <label className="text-xs text-neutral-500">
              Count
              <input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} className={fieldClass} />
            </label>
          )}
          {fieldError ? (
            <p role="alert" className="text-xs text-neutral-950">
              {fieldError}
            </p>
          ) : null}
          <button type="submit" className="h-11 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white">
            Add section
          </button>
        </form>
      ) : null}
    </Surface>
  );
}

function CmrPanel({
  shipment,
  direction,
  po,
  cmr,
  canUpload,
  closed,
}: {
  shipment: string;
  direction: Direction;
  po: string;
  cmr: ShipmentAttachment | undefined;
  canUpload: boolean;
  closed: boolean;
}) {
  const { detachFile, saveCmr } = useDemo();
  const [reference, setReference] = useState(cmr?.cmr?.reference ?? "");
  const [carrier, setCarrier] = useState(cmr?.cmr?.carrier ?? "");
  const [goods, setGoods] = useState(cmr?.cmr?.goodsDescription ?? "");
  const [remarks, setRemarks] = useState(cmr?.cmr?.remarks ?? "");
  const [detailError, setDetailError] = useState<string | null>(null);

  return (
    <Surface className="p-4">
      <h2 className="text-sm font-semibold">CMR</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Linked to {shipment}
        {po.trim() ? ` and ${po}` : ""}.
      </p>

      {cmr ? (
        <div className="mt-3">
          <FileGallery
            files={[cmr]}
            title="Attached CMR Document"
            emptyMessage="No CMR attached."
            allowDelete={canUpload && !closed}
            onDelete={async (id) => {
              await detachFile(id);
            }}
          />
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-neutral-600">No CMR attached.</p>
          {canUpload && !closed ? (
            <div className="mt-3">
              <UploadCapture
                kind="cmr"
                acceptPdf={true}
                multiple={false}
                shipmentReference={shipment}
                poNumber={po}
                label="Upload CMR"
                helperText="Take photo or choose file (PDF or image). Uploads immediately."
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">
              {closed ? "This shipment is already posted, so the CMR is left as recorded." : "This role cannot attach a CMR."}
            </p>
          )}
        </div>
      )}
      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-sm font-semibold">CMR details</h3>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Entered against the attached CMR document for {shipment}.
        </p>
        {cmr?.cmr ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500">Reference</dt>
              <dd>{cmr.cmr.reference}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Carrier</dt>
              <dd>{blank(cmr.cmr.carrier)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Goods description</dt>
              <dd>{cmr.cmr.goodsDescription}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Remarks</dt>
              <dd>{blank(cmr.cmr.remarks)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Entered by</dt>
              <dd>
                {blank(cmr.cmr.enteredBy)}
                {cmr.cmr.enteredAt ? ` · ${formatInstant(cmr.cmr.enteredAt)}` : ""}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-neutral-600">{cmr ? "No details saved yet." : "Attach the CMR file before entering details."}</p>
        )}
        {canUpload && cmr && !closed ? (
          <form
            className="mt-3 grid gap-3"
            onSubmit={(event) => void (async () => {
              event.preventDefault();
              if (!reference.trim() || !goods.trim()) {
                setDetailError("CMR reference and goods description are required.");
                return;
              }
              setDetailError(null);
              const failed = await saveCmr({ shipment, direction, reference, carrier, goodsDescription: goods, remarks });
              if (failed) setDetailError(failed);
            })()}
          >
            <label className="text-xs text-neutral-500">
              CMR reference
              <input value={reference} onChange={(event) => setReference(event.target.value)} className={fieldClass} />
            </label>
            <label className="text-xs text-neutral-500">
              Carrier, optional
              <input value={carrier} onChange={(event) => setCarrier(event.target.value)} className={fieldClass} />
            </label>
            <label className="text-xs text-neutral-500">
              Goods description
              <input value={goods} onChange={(event) => setGoods(event.target.value)} className={fieldClass} />
            </label>
            <label className="text-xs text-neutral-500">
              Remarks, optional
              <input value={remarks} onChange={(event) => setRemarks(event.target.value)} className={fieldClass} />
            </label>
            {detailError ? (
              <p role="alert" className="text-xs text-neutral-950">
                {detailError}
              </p>
            ) : null}
            <button type="submit" className="h-11 rounded-lg border border-neutral-950 px-3 text-sm font-medium">
              Save CMR details
            </button>
          </form>
        ) : null}
      </div>
    </Surface>
  );
}

function PhotoPanel({
  shipment,
  photos,
  canUpload,
}: {
  shipment: string;
  photos: ShipmentAttachment[];
  canUpload: boolean;
}) {
  const { detachFile } = useDemo();

  return (
    <Surface className="p-4">
      <h2 className="text-sm font-semibold">Shipment photos</h2>
      <p className="mt-1 text-xs leading-5 text-neutral-500">Equipment and container photos for inspection.</p>

      <div className="mt-4">
        <FileGallery
          files={photos}
          title="Inspection Photos"
          emptyMessage="No photos uploaded for this shipment yet."
          allowDelete={canUpload}
          onDelete={async (id) => {
            await detachFile(id);
          }}
        />
      </div>

      {canUpload ? (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <UploadCapture
            kind="photo"
            acceptPdf={false}
            multiple={true}
            shipmentReference={shipment}
            label="Take or upload photo"
            helperText="Tap 'Take photo' to open phone camera directly, or 'Choose file'. Uploads immediately."
          />
        </div>
      ) : null}
    </Surface>
  );
}
