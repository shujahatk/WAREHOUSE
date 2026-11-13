import { randomBytes, randomUUID } from "node:crypto";
import { canOperateWarehouse, canPerform, isActiveRole, normalizeRole, type Role } from "../lib/permissions.ts";
import { can } from "../lib/data/permissions.ts";
import { checkUploadRateLimit } from "../lib/security/rate-limit.ts";
import { detectFileType, MAX_FILE_SIZE_BYTES } from "../lib/security/file-validation.ts";
import type { ConfirmUploadInput, UploadTarget, UploadTargetMetadata } from "../lib/data/interfaces.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";
import { fail, ok, type Result } from "./result.ts";
import { upsertCompany, upsertWarehouse } from "./seed.ts";
import {
  parseOperationalRequestDescription,
  serializeOperationalRequestDescription,
  type GeneralRequestOperationalDetails,
} from "./view.ts";
import {
  issues,
  netKg,
  requestLineSchema,
  requestSchema,
  roundKg,
  userRecordSchema,
  generalRequestCategorySchema,
  generalRequestPrioritySchema,
  type DocumentKind,
  type DocumentRecord,
  type GeneralRequestStatus,
  type PurchaseOrder,
  type RequestRecord,
  type Shipment,
  type StockMovement,
  type StoreData,
  type UserProfile,
  type UserRecord,
  type WorkerGeneralRequest,
  type Offer,
  type OfferAttachment,
  type OfferComment,
} from "./schemas.ts";

export type CommandResult = { error?: string; notice?: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function profile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    warehouseId: user.warehouseId,
    companyId: user.companyId,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function audit(
  store: StoreData,
  userId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: string,
  now: string,
  oldValue: string | null = null,
  options?: {
    actorRole?: string | null;
    actorName?: string | null;
    warehouseId?: string | null;
    context?: string | null;
    requestReference?: string | null;
  }
) {
  const user = store.users.find((u) => u.id === userId);
  store.auditLog.push({
    id: randomUUID(),
    userId,
    action,
    targetType,
    targetId,
    oldValue,
    newValue: detail,
    createdAt: now,
    actorRole: options?.actorRole ?? user?.role ?? null,
    actorName: options?.actorName ?? user?.name ?? null,
    warehouseId: options?.warehouseId ?? user?.warehouseId ?? null,
    context: options?.context ?? null,
    requestReference: options?.requestReference ?? null,
  });
}

function notify(
  store: StoreData,
  recipientId: string,
  eventType: string,
  title: string,
  message: string,
  now: string,
  options?: {
    targetType?: string | null;
    targetId?: string | null;
    link?: string | null;
    warehouseId?: string | null;
  }
) {
  if (!store.notifications) store.notifications = [];
  store.notifications.push({
    id: randomUUID(),
    recipientId,
    eventType,
    title,
    message,
    targetType: options?.targetType ?? null,
    targetId: options?.targetId ?? null,
    link: options?.link ?? null,
    warehouseId: options?.warehouseId ?? null,
    read: false,
    readAt: null,
    createdAt: now,
  });
}

export function notifyRole(
  store: StoreData,
  role: Role,
  eventType: string,
  title: string,
  message: string,
  now: string,
  options?: {
    targetType?: string | null;
    targetId?: string | null;
    link?: string | null;
    warehouseId?: string | null;
  }
) {
  const recipients = store.users.filter((u) => u.active && u.role === role && (!options?.warehouseId || !u.warehouseId || u.warehouseId === options.warehouseId));
  for (const r of recipients) {
    notify(store, r.id, eventType, title, message, now, options);
  }
}

function same(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function warehouseOf(store: StoreData, user: UserRecord): string | null {
  if (!user.warehouseId) return null;
  return store.warehouses.find((item) => item.id === user.warehouseId)?.name ?? null;
}

function deny(role: Role, action: Parameters<typeof canPerform>[1], message: string): CommandResult | null {
  if (!canPerform(role, action)) return { error: message };
  return null;
}

function shipmentByRef(store: StoreData, direction: "inbound" | "outbound", reference: string): Shipment | undefined {
  return store.shipments.find((item) => item.direction === direction && same(item.reference, reference));
}

function orderByNumber(store: StoreData, number: string): PurchaseOrder | undefined {
  return store.purchaseOrders.find((item) => same(item.number, number));
}

function ensureOrder(store: StoreData, number: string, companyId: string, actorId: string, now: string): PurchaseOrder {
  const found = orderByNumber(store, number);
  if (found) return found;
  const created: PurchaseOrder = {
    id: randomUUID(),
    number,
    title: `Order ${number}`,
    companyId,
    status: "draft",
    valueEur: 0,
    notes: "",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  store.purchaseOrders.push(created);
  return created;
}

function peekRequestNumber(store: StoreData, now: string): string {
  const year = Number(now.slice(0, 4));
  const row = store.requestSequence.find((item) => item.year === year);
  return `REQ-${year}-${String((row?.next ?? 0) + 1).padStart(4, "0")}`;
}

function commitRequestNumber(store: StoreData, now: string) {
  const year = Number(now.slice(0, 4));
  const row = store.requestSequence.find((item) => item.year === year);
  if (row) row.next += 1;
  else store.requestSequence.push({ year, next: 1 });
}

export function nextPurchaseOrderNumber(store: StoreData, now: string): string {
  const currentYear = new Date(now).getUTCFullYear() || new Date().getUTCFullYear();
  if (!store.poSequence) {
    store.poSequence = [];
  }
  let seq = store.poSequence.find((item) => item.year === currentYear);
  if (!seq) {
    let highest = 0;
    const regex = new RegExp(`^PO-${currentYear}-(\\d{4,})$`, "i");
    for (const po of store.purchaseOrders) {
      const match = po.number.match(regex);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > highest) highest = val;
      }
    }
    seq = { year: currentYear, next: highest + 1 };
    store.poSequence.push(seq);
  }

  while (store.purchaseOrders.some((po) => same(po.number, `PO-${currentYear}-${String(seq!.next).padStart(4, "0")}`))) {
    seq.next += 1;
  }

  const numStr = `PO-${currentYear}-${String(seq.next).padStart(4, "0")}`;
  seq.next += 1;
  return numStr;
}

export function cleanupExpiredPendingUploads(store: StoreData, now: string): number {
  const cutoff = Date.parse(now) - 24 * 60 * 60 * 1000;
  const expiredDocs = store.documents.filter(
    (item) => item.status === "pending" && Date.parse(item.createdAt) < cutoff
  );
  if (expiredDocs.length === 0) return 0;
  const expiredIds = new Set(expiredDocs.map((d) => d.id));
  const expiredKeys = new Set(expiredDocs.map((d) => d.storageKey));
  store.documents = store.documents.filter((d) => !expiredIds.has(d.id));
  store.blobs = store.blobs.filter((b) => !expiredKeys.has(b.key));
  store.requestPhotos = store.requestPhotos.filter((rp) => !expiredIds.has(rp.documentId));
  return expiredDocs.length;
}

export function submitRequestWithPendingPhotos(
  store: StoreData,
  shipment: Shipment,
  actorId: string,
  now: string
): Result<RequestRecord> {
  cleanupExpiredPendingUploads(store, now);

  const activePhotos = store.documents.filter(
    (d) => d.shipmentId === shipment.id && d.kind === "photo" && d.status !== "deleted"
  );
  const pendingPhotos = store.documents.filter(
    (d) =>
      d.createdBy === actorId &&
      d.kind === "photo" &&
      d.status === "pending" &&
      (!d.shipmentId || d.shipmentId === shipment.id)
  );

  if (activePhotos.length === 0 && pendingPhotos.length === 0) {
    return fail("A request cannot be submitted without at least one photo.");
  }

  const requestResult = ensureRequest(store, shipment, actorId, now);
  if (!requestResult.ok) return requestResult;
  const request = requestResult.value;

  const warehouse = store.warehouses.find((w) => w.id === shipment.warehouseId)?.name ?? null;
  const poNumber = store.purchaseOrders.find((p) => p.id === shipment.purchaseOrderId)?.number ?? null;

  let photoIndex = 1;
  for (const photo of pendingPhotos) {
    photo.status = "active";
    photo.requestId = request.id;
    photo.requestNumber = request.number;
    photo.shipmentId = shipment.id;
    photo.containerNumber = shipment.containerNumber || request.containerNumber;
    photo.warehouse = warehouse;
    photo.poNumber = poNumber;

    const ext = extensionForMime(photo.mime, photo.originalFilename || photo.name);
    const targetRef = request.number || shipment.containerNumber || "REQ";
    photo.readableName = computeReadableName(targetRef, photo.kind, photoIndex++, ext);
    photo.name = photo.readableName;
    const oldKey = photo.storageKey;
    const timestamp = Date.parse(photo.createdAt) || Date.parse(now) || Date.now();
    photo.storageKey = computeStorageKey(photo.kind, targetRef, timestamp, photo.id, ext);

    const blob = store.blobs.find((b) => b.key === oldKey);
    if (blob) {
      blob.key = photo.storageKey;
      blob.name = photo.readableName;
    }

    if (!store.requestPhotos.some((rp) => rp.requestId === request.id && rp.documentId === photo.id)) {
      store.requestPhotos.push({
        id: randomUUID(),
        requestId: request.id,
        documentId: photo.id,
      });
    }

    audit(
      store,
      actorId,
      "file-uploaded",
      "document",
      photo.id,
      `${photo.readableName || photo.name} was attached to request ${request.number}.`,
      now
    );
  }

  return ok(request);
}

export function ensureRequest(store: StoreData, shipment: Shipment, actorId: string, now: string): Result<RequestRecord> {
  const open = store.requests.find((item) => item.shipmentId === shipment.id && item.status !== "deleted" && item.status !== "declined" && item.status !== "completed");
  if (open) return ok(open);
  const created = {
    id: randomUUID(),
    number: peekRequestNumber(store, now),
    type: shipment.direction === "inbound" ? "unloading" : "loading",
    shipmentId: shipment.id,
    purchaseOrderId: shipment.purchaseOrderId,
    containerNumber: shipment.containerNumber,
    warehouseId: shipment.warehouseId,
    createdBy: actorId,
    status: "submitted" as const,
    declineReason: null,
    sentBackNote: null,
    approvedBy: null,
    approvedAt: null,
    enteredBy: null,
    enteredAt: null,
    deletedBy: null,
    deletedAt: null,
    createdAt: now,
  };
  const parsed = requestSchema.safeParse(created);
  if (!parsed.success) return fail(issues(parsed.error));
  commitRequestNumber(store, now);
  store.requests.push(parsed.data);
  audit(store, actorId, "request-submitted", "request", parsed.data.id, `${parsed.data.number} was submitted. Stock was not changed.`, now);
  return ok(parsed.data);
}

export function approveRequest(store: StoreData, requestId: string, actor: UserRecord, now: string): Result<RequestRecord> {
  if (actor.role !== "owner") return fail("Only the owner can approve a request.");
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) return fail("That request does not exist.");
  if (request.status !== "submitted") return fail("Only a submitted request can be approved.");
  request.status = "approved";
  request.approvedBy = actor.id;
  request.approvedAt = now;
  audit(store, actor.id, "request-approved", "request", request.id, `${request.number} was approved. Stock was not changed.`, now, "submitted");
  return ok(request);
}

export function declineRequest(store: StoreData, requestId: string, actor: UserRecord, reason: string, now: string): Result<RequestRecord> {
  if (actor.role !== "owner") return fail("Only the owner can decline a request.");
  if (!reason.trim()) return fail("A decline reason is required.");
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) return fail("That request does not exist.");
  if (request.status === "completed" || request.status === "deleted") return fail("That request can no longer be declined.");
  request.status = "declined";
  request.declineReason = reason.trim();
  audit(store, actor.id, "request-declined", "request", request.id, `${request.number} was declined. ${reason.trim()}`, now);
  return ok(request);
}

export function sendBackRequest(store: StoreData, requestId: string, actor: UserRecord, note: string, now: string): Result<RequestRecord> {
  if (actor.role !== "owner" && actor.role !== "manager") return fail("Only the owner or a manager can send a request back.");
  if (!note.trim()) return fail("A note is required when a request is sent back.");
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) return fail("That request does not exist.");
  if (request.status === "completed" || request.status === "deleted") return fail("That request can no longer be sent back.");
  request.status = "sent_back";
  request.sentBackNote = note.trim();
  audit(store, actor.id, "request-sent-back", "request", request.id, `${request.number} was sent back. ${note.trim()}`, now);
  return ok(request);
}

export function softDeleteRequest(store: StoreData, requestId: string, actor: UserRecord, now: string): Result<RequestRecord> {
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) return fail("That request does not exist.");
  if (request.status === "completed") return fail("A completed request cannot be deleted. Record a correcting entry instead.");
  if (actor.role === "owner") return fail("Admin cannot delete operational records.");
  if (actor.role === "manager") return fail("Staff cannot delete or cancel requests.");
  if (request.createdBy !== actor.id) return fail("Only the worker who created a request can delete it.");
  if (!["submitted", "declined", "sent_back"].includes(request.status)) {
    return fail("A worker can delete own requests only while submitted, declined or sent back.");
  }
  if (request.status === "deleted") return ok(request);
  request.status = "deleted";
  request.deletedBy = actor.id;
  request.deletedAt = now;
  audit(store, actor.id, "request-deleted", "request", request.id, `${request.number} was marked deleted. The record was kept.`, now);
  return ok(request);
}

export function createGeneralRequest(
  store: StoreData,
  actor: UserRecord,
  payload: Record<string, unknown>,
  now: string
): Result<WorkerGeneralRequest> {
  if (actor.role !== "worker") {
    return fail("Only a Worker can submit a warehouse request.");
  }
  if (!actor.warehouseId) {
    return fail("A worker must be assigned to one warehouse.");
  }

  const categoryResult = generalRequestCategorySchema.safeParse(payload.category);
  if (!categoryResult.success) {
    return fail("Choose a valid request category.");
  }

  const priorityResult = generalRequestPrioritySchema.safeParse(payload.priority || "normal");
  const priority = priorityResult.success ? priorityResult.data : "normal";

  const description = text(payload.description);
  if (!description && !payload.operationalDetails) {
    return fail("A request description is required.");
  }

  let finalDescription = description;
  const opDetails = payload.operationalDetails as Record<string, unknown> | undefined;
  if (opDetails && typeof opDetails === "object") {
    const pkgCount = Number(opDetails.packageCount);
    const gross = Number(opDetails.grossWeightKg);
    const tarePerPkg = Number(opDetails.tarePerPackageKg);
    if (!Number.isInteger(pkgCount) || pkgCount <= 0) {
      return fail("Number of packages must be a positive whole number.");
    }
    if (!Number.isFinite(gross) || gross <= 0) {
      return fail("Gross weight must be greater than zero.");
    }
    if (!Number.isFinite(tarePerPkg) || tarePerPkg < 0) {
      return fail("Packaging tare weight cannot be negative.");
    }
    const computedTotalTare = Math.round(pkgCount * tarePerPkg * 1000) / 1000;
    const computedNet = Math.round((gross - computedTotalTare) * 1000) / 1000;
    if (computedNet <= 0) {
      return fail("Gross weight must be greater than total tare weight (net weight must be positive).");
    }
    const validatedDetails: GeneralRequestOperationalDetails = {
      requestType: (opDetails.requestType === "loading" ? "loading" : "unloading") as "loading" | "unloading",
      materialType: String(opDetails.materialType || "").trim() || "General Material",
      materialDescription: String(opDetails.materialDescription || "").trim(),
      packagingType: String(opDetails.packagingType || "").trim() || "Standard Packaging",
      packageCount: pkgCount,
      grossWeightKg: gross,
      tarePerPackageKg: tarePerPkg,
      totalTareWeightKg: computedTotalTare,
      netWeightKg: computedNet,
      warehouseLocation: String(opDetails.warehouseLocation || "").trim() || (warehouseOf(store, actor) ?? "Warehouse"),
      notes: typeof opDetails.notes === "string" ? opDetails.notes.trim() : undefined,
      assignedPoSoNumber: null,
      assignedPoSoBy: null,
      assignedPoSoByName: null,
      assignedPoSoAt: null,
      inventoryMoved: false,
    };
    finalDescription = serializeOperationalRequestDescription(validatedDetails, description || undefined);
  }

  let shipmentId: string | null = null;
  let purchaseOrderId: string | null = null;
  const shipmentInput = text(payload.shipment || payload.shipmentId || payload.shipmentReference);
  if (shipmentInput) {
    const shipment = store.shipments.find(
      (s) => s.id === shipmentInput || s.reference.toLowerCase() === shipmentInput.toLowerCase()
    );
    if (!shipment || shipment.warehouseId !== actor.warehouseId) {
      return fail("Shipment does not belong to your assigned warehouse.");
    }
    shipmentId = shipment.id;
    purchaseOrderId = shipment.purchaseOrderId ?? null;
  }

  const year = new Date(now).getUTCFullYear();
  let seq = store.requestSequence.find((entry) => entry.year === year);
  if (!seq) {
    seq = { year, next: 1 };
    store.requestSequence.push(seq);
  }
  const number = `REQ-${year}-${String(seq.next).padStart(4, "0")}`;
  seq.next += 1;

  const reqId = randomUUID();
  const generalReq: WorkerGeneralRequest = {
    id: reqId,
    number,
    category: categoryResult.data,
    priority,
    description: finalDescription,
    warehouseId: actor.warehouseId,
    shipmentId,
    purchaseOrderId,
    createdBy: actor.id,
    status: "submitted",
    responseNote: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!store.workerGeneralRequests) {
    store.workerGeneralRequests = [];
  }
  if (!store.workerGeneralRequestAttachments) {
    store.workerGeneralRequestAttachments = [];
  }

  const docIds = Array.isArray(payload.documentIds) ? (payload.documentIds as string[]) : [];
  for (const docId of docIds) {
    const doc = store.documents.find((d) => d.id === docId && d.createdBy === actor.id && d.status !== "deleted");
    if (doc) {
      doc.status = "active";
      doc.requestNumber = number;
      store.workerGeneralRequestAttachments.push({
        id: randomUUID(),
        generalRequestId: reqId,
        documentId: doc.id,
      });
    }
  }

  const attachments = Array.isArray(payload.attachments) ? (payload.attachments as Record<string, unknown>[]) : [];
  for (const item of attachments) {
    const name = text(item.name);
    const bytesBase64 = text(item.bytesBase64);
    if (name && bytesBase64) {
      const buffer = Buffer.from(bytesBase64, "base64");
      const detected = detectFileType(buffer);
      if (detected.valid) {
        const documentId = randomUUID();
        const ext = detected.ext;
        const kind: DocumentKind = detected.mime.startsWith("image/") ? "photo" : "other";
        const storageKey = computeStorageKey(kind, number, Date.parse(now) || Date.now(), documentId, ext);
        const existingCount = store.documents.filter((d) => d.kind === kind).length;
        const readableName = computeReadableName(number, kind, existingCount + 1, ext);
        putBlob(store, readableName, detected.mime, bytesBase64, storageKey);

        store.documents.push({
          id: documentId,
          kind,
          category: "Container",
          shipmentId: shipmentId ?? null,
          purchaseOrderId: purchaseOrderId ?? null,
          requestId: null,
          requestNumber: number,
          poNumber: null,
          containerNumber: null,
          warehouse: warehouseOf(store, actor),
          notes: null,
          originalFilename: name,
          readableName,
          status: "active",
          name: readableName,
          mime: detected.mime,
          byteSize: buffer.length,
          storageKey,
          cmrReference: null,
          cmrCarrier: null,
          cmrGoodsDescription: null,
          cmrRemarks: null,
          cmrEnteredBy: null,
          cmrEnteredAt: null,
          createdBy: actor.id,
          createdAt: now,
        });

        store.workerGeneralRequestAttachments.push({
          id: randomUUID(),
          generalRequestId: reqId,
          documentId,
        });
      }
    }
  }

  store.workerGeneralRequests.push(generalReq);
  audit(
    store,
    actor.id,
    "general-request-submitted",
    "general-request",
    reqId,
    `${number} (${categoryResult.data}) was submitted.`,
    now
  );
  return ok(generalReq);
}

export function decideGeneralRequest(
  store: StoreData,
  actor: UserRecord,
  payload: Record<string, unknown>,
  now: string
): Result<WorkerGeneralRequest> {
  const reqId = text(payload.requestId || payload.id);
  const request = (store.workerGeneralRequests || []).find((r) => r.id === reqId);
  if (!request) return fail("General request not found.");

  let decision = text(payload.decision);
  if (decision === "rejected") decision = "declined";

  const oldStatus = request.status;
  const cleanNote = text(payload.reason || payload.note || payload.responseNote);

  if (decision === "approved" || decision === "declined") {
    if (actor.role !== "owner") {
      return fail("Only Admin can approve or decline a worker request.");
    }
    if (oldStatus !== "submitted" && oldStatus !== "under_review" && oldStatus !== "sent_back") {
      return fail(`Transition from ${oldStatus} to ${decision} is not permitted.`);
    }
    if (decision === "declined" && !cleanNote) {
      return fail("A decline reason is required.");
    }
  } else if (decision === "under_review" || decision === "sent_back") {
    if (actor.role !== "manager") {
      return fail("Only Staff can review or request additional information for requests.");
    }
    if (oldStatus !== "submitted" && oldStatus !== "under_review" && oldStatus !== "sent_back") {
      return fail(`Transition from ${oldStatus} to ${decision} is not permitted.`);
    }
    if (decision === "sent_back" && !cleanNote) {
      return fail("A note is required when sending a request back.");
    }
  } else if (decision === "completed") {
    if (actor.role !== "manager" && actor.role !== "worker") {
      return fail("Only Staff or Worker can process and complete approved work.");
    }
    if (oldStatus !== "approved") {
      return fail("Only approved requests can be completed.");
    }

    // Stage 4: Operational completion and automated stock movement
    const { operationalDetails } = parseOperationalRequestDescription(request.description);
    if (operationalDetails && !operationalDetails.inventoryMoved && operationalDetails.netWeightKg > 0) {
      if (!operationalDetails.assignedPoSoNumber) {
        return fail("Staff must assign a PO or SO number before this operation can be completed.");
      }

      const whId = request.warehouseId || actor.warehouseId || (store.warehouses.length > 0 ? store.warehouses[0].id : randomUUID());
      const targetMatType = operationalDetails.materialType.toLowerCase().trim();
      let mat = store.materials.find(
        (m) => m.materialNumber.toLowerCase() === targetMatType || m.description.toLowerCase().includes(targetMatType)
      );
      if (!mat && store.materials.length > 0) {
        mat = store.materials[0];
      }
      const matId = mat?.id || randomUUID();
      const isUnloading = operationalDetails.requestType === "unloading";
      const direction: "in" | "out" = isUnloading ? "in" : "out";
      const weightKg = operationalDetails.netWeightKg;

      const balance = store.stockBalances.find((b) => b.materialId === matId && b.warehouseId === whId);
      const current = balance?.weightKg ?? 0;

      if (direction === "out" && current < weightKg) {
        return fail(`Insufficient stock in warehouse for ${mat?.description || operationalDetails.materialType}. Available: ${current} kg, Required: ${weightKg} kg.`);
      }

      const next = roundKg(direction === "in" ? current + weightKg : current - weightKg);
      if (balance) {
        balance.weightKg = next;
      } else {
        store.stockBalances.push({
          id: randomUUID(),
          materialId: matId,
          warehouseId: whId,
          weightKg: next,
        });
      }

      const movementId = randomUUID();
      const movement: StockMovement = {
        id: movementId,
        materialId: matId,
        warehouseId: whId,
        weightKg,
        direction,
        requestId: request.id,
        requestLineId: request.id,
        createdAt: now,
        createdBy: actor.id,
      };
      store.stockMovements.push(movement);

      const wh = store.warehouses.find((w) => w.id === whId);
      const pkg = store.packagingTypes.find((p) => p.name.toLowerCase() === operationalDetails.packagingType.toLowerCase());

      if (!store.inventoryHistory) store.inventoryHistory = [];
      store.inventoryHistory.push({
        id: randomUUID(),
        materialId: matId,
        materialName: mat?.description ?? operationalDetails.materialType,
        warehouseId: whId,
        warehouseName: wh?.name ?? "Warehouse",
        containerNumber: operationalDetails.warehouseLocation || null,
        quantityBefore: current,
        quantityChange: direction === "in" ? weightKg : -weightKg,
        quantityAfter: next,
        packagingTypeId: pkg?.id ?? null,
        packagingTypeName: operationalDetails.packagingType,
        packagingCount: operationalDetails.packageCount,
        packagingUnitTareKg: operationalDetails.tarePerPackageKg,
        totalPackagingWeightKg: operationalDetails.totalTareWeightKg,
        grossWeightKg: operationalDetails.grossWeightKg,
        operationType: direction === "in" ? "receipt" : "dispatch",
        operationReason: isUnloading ? "Worker unloading request completed" : "Worker loading request completed",
        reference: request.number,
        poNumber: isUnloading ? operationalDetails.assignedPoSoNumber : null,
        soNumber: !isUnloading ? operationalDetails.assignedPoSoNumber : null,
        performedBy: actor.id,
        performedByName: actor.name,
        createdAt: now,
      });

      operationalDetails.inventoryMoved = true;
      operationalDetails.inventoryMovementId = movementId;
      request.description = serializeOperationalRequestDescription(operationalDetails, operationalDetails.notes);
    }
  } else {
    return fail(`Invalid decision: ${decision}.`);
  }

  request.status = decision as GeneralRequestStatus;
  if (cleanNote) {
    request.responseNote = cleanNote;
  }
  request.decidedBy = actor.id;
  request.decidedAt = now;
  request.updatedAt = now;

  audit(
    store,
    actor.id,
    `general-request-${decision}`,
    "general-request",
    request.id,
    `${request.number} is now ${decision}.`,
    now,
    oldStatus
  );

  return ok(request);
}

export function assignPoSoToGeneralRequest(
  store: StoreData,
  actor: UserRecord,
  payload: Record<string, unknown>,
  now: string
): Result<WorkerGeneralRequest> {
  if (actor.role !== "manager") {
    return fail("Only Staff can assign PO/SO numbers to approved requests.");
  }
  const reqId = text(payload.requestId || payload.id);
  const request = (store.workerGeneralRequests || []).find((r) => r.id === reqId);
  if (!request) return fail("General request not found.");

  if (request.status !== "approved") {
    return fail("PO/SO references can only be assigned after Admin has approved the request.");
  }

  const rawPoSo = text(payload.poSoNumber || payload.number || payload.reference).toUpperCase();
  if (!rawPoSo) {
    return fail("A PO or SO reference number is required.");
  }

  // Strictly enforce only PO- or SO- prefix
  const isPo = rawPoSo.startsWith("PO-");
  const isSo = rawPoSo.startsWith("SO-");
  if (!isPo && !isSo) {
    return fail("Only PO (Purchase Order) and SO (Sales Order) references are permitted (e.g. PO-2026-0001 or SO-2026-0001).");
  }

  const { operationalDetails } = parseOperationalRequestDescription(request.description);
  if (operationalDetails) {
    // If requestType is loading (dispatch), require SO
    if (operationalDetails.requestType === "loading" && !isSo) {
      return fail("Loading (dispatch) operations require an SO (Sales Order) reference.");
    }
    // If requestType is unloading (receipt), require PO
    if (operationalDetails.requestType === "unloading" && !isPo) {
      return fail("Unloading (receipt) operations require a PO (Purchase Order) reference.");
    }
  }

  // Prevent duplicate PO/SO reference conflict across existing active assigned requests
  const conflict = (store.workerGeneralRequests || []).find(
    (r) =>
      r.id !== request.id &&
      r.status !== "deleted" &&
      r.status !== "declined" &&
      parseOperationalRequestDescription(r.description).operationalDetails?.assignedPoSoNumber === rawPoSo
  );
  if (conflict) {
    return fail(`Reference number ${rawPoSo} is already assigned to request ${conflict.number}.`);
  }

  const updatedDetails: GeneralRequestOperationalDetails = operationalDetails
    ? {
        ...operationalDetails,
        assignedPoSoNumber: rawPoSo,
        assignedPoSoBy: actor.id,
        assignedPoSoByName: actor.name,
        assignedPoSoAt: now,
      }
    : {
        requestType: isPo ? "unloading" : "loading",
        materialType: "General Material",
        materialDescription: "",
        packagingType: "Standard Packaging",
        packageCount: 1,
        grossWeightKg: 0,
        tarePerPackageKg: 0,
        totalTareWeightKg: 0,
        netWeightKg: 0,
        warehouseLocation: warehouseOf(store, actor) ?? "Warehouse",
        assignedPoSoNumber: rawPoSo,
        assignedPoSoBy: actor.id,
        assignedPoSoByName: actor.name,
        assignedPoSoAt: now,
        inventoryMoved: false,
      };

  request.description = serializeOperationalRequestDescription(updatedDetails, updatedDetails.notes);

  // Link to existing purchase order if matching PO exists
  const existingPo = store.purchaseOrders.find((p) => p.number.toUpperCase() === rawPoSo);
  if (existingPo) {
    request.purchaseOrderId = existingPo.id;
  }

  request.updatedAt = now;

  audit(
    store,
    actor.id,
    "general-request-poso-assigned",
    "general-request",
    request.id,
    `Assigned ${rawPoSo} to ${request.number}. Ready for warehouse execution.`,
    now,
    request.status
  );

  return ok(request);
}

export function softDeleteGeneralRequest(
  store: StoreData,
  actor: UserRecord,
  requestId: string,
  now: string
): Result<WorkerGeneralRequest> {
  const request = (store.workerGeneralRequests || []).find((r) => r.id === requestId);
  if (!request) return fail("General request not found.");

  if (actor.role === "owner") return fail("Admin cannot delete operational records.");
  if (actor.role === "manager") return fail("Staff cannot delete or cancel requests.");
  if (request.createdBy !== actor.id) return fail("Only the worker who created a request can delete it.");
  if (!["submitted", "declined", "sent_back"].includes(request.status)) {
    return fail("A worker can delete own requests only while submitted, declined or sent back.");
  }

  if (request.status === "deleted") return ok(request);
  request.status = "deleted";
  request.updatedAt = now;
  audit(
    store,
    actor.id,
    "general-request-deleted",
    "general-request",
    request.id,
    `${request.number} was marked deleted.`,
    now
  );
  return ok(request);
}

export function nextOfferNumber(store: StoreData, kind: "purchasing" | "selling", now: string): string {
  const year = new Date(now).getUTCFullYear();
  const prefix = kind === "purchasing" ? "POF" : "SOF";
  if (!store.offerSequence) store.offerSequence = [];
  let seq = store.offerSequence.find((s) => s.kind === kind && s.year === year);
  if (!seq) {
    seq = { kind, year, next: 1 };
    store.offerSequence.push(seq);
  }
  const current = seq.next;
  seq.next += 1;
  return `${prefix}-${year}-${String(current).padStart(4, "0")}`;
}

export function createOffer(
  store: StoreData,
  actor: UserRecord,
  payload: Record<string, unknown>,
  now: string
): Result<Offer> {
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can create offers.");
  }

  const kind = text(payload.kind).toLowerCase() as "purchasing" | "selling";
  if (kind !== "purchasing" && kind !== "selling") {
    return fail("Offer kind must be either purchasing or selling.");
  }

  const material = text(payload.material);
  if (!material) return fail("Material name/specification is required.");

  const materialType = text(payload.materialType) || "Plastics";
  const materialGrade = text(payload.materialGrade) || "Standard";

  const quantity = typeof payload.quantity === "number" ? payload.quantity : parseFloat(String(payload.quantity || 0));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return fail("Quantity must be a positive number.");
  }

  const unit = text(payload.unit) || "kg";
  const pricePerUnit = typeof payload.pricePerUnit === "number" ? payload.pricePerUnit : parseFloat(String(payload.pricePerUnit || 0));
  if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
    return fail("Price per unit must be zero or greater.");
  }

  const currency = (text(payload.currency) || "EUR").toUpperCase();
  const totalValue = Math.round(quantity * pricePerUnit * 100) / 100;

  const country = text(payload.country);
  if (!country) return fail("Location/Country is required.");

  const location = text(payload.location);
  const truckLoads = typeof payload.truckLoads === "number" ? Math.max(0, Math.floor(payload.truckLoads)) : parseInt(String(payload.truckLoads || 1), 10) || 1;
  const description = text(payload.description);
  
  const priorityRaw = text(payload.priority).toLowerCase();
  const priority = (["low", "medium", "high", "urgent"].includes(priorityRaw) ? priorityRaw : "medium") as "low" | "medium" | "high" | "urgent";

  const offerType = text(payload.offerType) || "Spot";
  const team = text(payload.team) || "General";
  const statusRaw = text(payload.status).toLowerCase();
  const status = (statusRaw === "received" ? "received" : "draft") as "draft" | "received";

  if (!store.offers) store.offers = [];
  if (!store.offerAttachments) store.offerAttachments = [];
  if (!store.offerComments) store.offerComments = [];
  if (!store.offerActivities) store.offerActivities = [];

  const offerId = randomUUID();
  const number = nextOfferNumber(store, kind, now);

  const offer: Offer = {
    id: offerId,
    number,
    kind,
    material,
    materialType,
    materialGrade,
    quantity,
    unit,
    pricePerUnit,
    currency,
    totalValue,
    country,
    location,
    truckLoads,
    description,
    priority,
    offerType,
    team,
    status,
    approvalStatus: "pending",
    adminDecisionNote: null,
    decidedBy: null,
    decidedAt: null,
    isFavourite: false,
    createdBy: actor.id,
    createdAt: now,
    updatedBy: null,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
  };

  store.offers.push(offer);

  // Handle attachments if provided
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  for (const rawAtt of attachments) {
    const attRec = record(rawAtt);
    const attName = text(attRec.name) || "attachment";
    const attMime = text(attRec.mime) || "application/octet-stream";
    const isImage = attRec.kind === "image" || attMime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(attName);
    const attId = randomUUID();
    const storageKey = `offers/${offerId}/${attId}-${attName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    
    let byteSize = 0;
    if (typeof attRec.bytesBase64 === "string" && attRec.bytesBase64) {
      const buffer = Buffer.from(attRec.bytesBase64, "base64");
      byteSize = buffer.byteLength;
      store.blobs.push({
        key: storageKey,
        name: attName,
        mime: attMime,
        bytesBase64: attRec.bytesBase64,
      });
    }

    store.offerAttachments.push({
      id: attId,
      offerId,
      name: attName,
      kind: isImage ? "image" : "document",
      mime: attMime,
      byteSize: byteSize || (typeof attRec.byteSize === "number" ? attRec.byteSize : 0),
      storageKey,
      url: null,
      uploadedBy: actor.id,
      createdAt: now,
    });
  }

  // Record activity
  store.offerActivities.push({
    id: randomUUID(),
    offerId,
    actorId: actor.id,
    action: "created",
    details: `Created ${kind} offer ${number} (${material}, ${quantity} ${unit} @ ${currency} ${pricePerUnit})`,
    createdAt: now,
  });

  audit(store, actor.id, "offer-created", "offer", offerId, `Created ${kind} offer ${number}`, now);

  return ok(offer);
}

export function editOffer(
  store: StoreData,
  actor: UserRecord,
  payload: Record<string, unknown>,
  now: string
): Result<Offer> {
  if (actor.role === "owner") {
    return fail("Admin cannot directly edit offer operational records.");
  }
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can edit offers.");
  }

  const offerId = text(payload.id || payload.offerId);
  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  if (payload.material !== undefined) {
    const material = text(payload.material);
    if (!material) return fail("Material specification cannot be empty.");
    offer.material = material;
  }
  if (payload.materialType !== undefined) offer.materialType = text(payload.materialType) || "Plastics";
  if (payload.materialGrade !== undefined) offer.materialGrade = text(payload.materialGrade) || "Standard";

  if (payload.quantity !== undefined) {
    const quantity = typeof payload.quantity === "number" ? payload.quantity : parseFloat(String(payload.quantity || 0));
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Quantity must be a positive number.");
    offer.quantity = quantity;
  }
  if (payload.unit !== undefined) offer.unit = text(payload.unit) || "kg";

  if (payload.pricePerUnit !== undefined) {
    const price = typeof payload.pricePerUnit === "number" ? payload.pricePerUnit : parseFloat(String(payload.pricePerUnit || 0));
    if (!Number.isFinite(price) || price < 0) return fail("Price per unit must be zero or greater.");
    offer.pricePerUnit = price;
  }
  if (payload.currency !== undefined) offer.currency = (text(payload.currency) || "EUR").toUpperCase();

  offer.totalValue = Math.round(offer.quantity * offer.pricePerUnit * 100) / 100;

  if (payload.country !== undefined) {
    const country = text(payload.country);
    if (!country) return fail("Location/Country is required.");
    offer.country = country;
  }
  if (payload.location !== undefined) offer.location = text(payload.location);
  if (payload.truckLoads !== undefined) {
    offer.truckLoads = typeof payload.truckLoads === "number" ? Math.max(0, Math.floor(payload.truckLoads)) : parseInt(String(payload.truckLoads || 1), 10) || 1;
  }
  if (payload.description !== undefined) offer.description = text(payload.description);
  if (payload.priority !== undefined) {
    const priorityRaw = text(payload.priority).toLowerCase();
    if (["low", "medium", "high", "urgent"].includes(priorityRaw)) {
      offer.priority = priorityRaw as "low" | "medium" | "high" | "urgent";
    }
  }
  if (payload.offerType !== undefined) offer.offerType = text(payload.offerType) || "Spot";
  if (payload.team !== undefined) offer.team = text(payload.team) || "General";

  offer.updatedBy = actor.id;
  offer.updatedAt = now;

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "edited",
    details: "Updated offer details",
    createdAt: now,
  });

  audit(store, actor.id, "offer-edited", "offer", offer.id, `Edited offer ${offer.number}`, now);

  return ok(offer);
}

export function softDeleteOffer(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  now: string
): Result<Offer> {
  if (actor.role === "owner") {
    return fail("Admin cannot directly delete offer records.");
  }
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can delete offers.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  offer.deletedAt = now;
  offer.deletedBy = actor.id;
  offer.updatedAt = now;

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "deleted",
    details: "Offer deleted by moderator",
    createdAt: now,
  });

  audit(store, actor.id, "offer-deleted", "offer", offer.id, `Deleted offer ${offer.number}`, now);

  return ok(offer);
}

export function submitOfferForReview(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  now: string
): Result<Offer> {
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can submit offers for review.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  if (offer.status !== "draft" && offer.status !== "received") {
    return fail("Only draft or received offers can be submitted for review.");
  }

  offer.status = "under_review";
  offer.approvalStatus = "pending";
  offer.updatedBy = actor.id;
  offer.updatedAt = now;

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "submitted_for_review",
    details: "Submitted offer for Admin review",
    createdAt: now,
  });

  audit(store, actor.id, "offer-submitted", "offer", offer.id, `Submitted offer ${offer.number} for review`, now);

  return ok(offer);
}

export function decideOffer(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  decision: "approved" | "rejected",
  decisionNote: string,
  now: string
): Result<Offer> {
  if (actor.role !== "owner") {
    return fail("Only Admin can approve or reject offers.");
  }

  const note = decisionNote ? decisionNote.trim() : "";
  if (!note) {
    return fail("A decision note is mandatory when approving or rejecting an offer.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  if (decision === "approved") {
    offer.approvalStatus = "approved";
    offer.adminDecisionNote = note;
    offer.decidedBy = actor.id;
    offer.decidedAt = now;
    offer.updatedAt = now;
  } else if (decision === "rejected") {
    offer.approvalStatus = "rejected";
    offer.status = "lost";
    offer.adminDecisionNote = note;
    offer.decidedBy = actor.id;
    offer.decidedAt = now;
    offer.updatedAt = now;
  } else {
    return fail("Invalid decision: must be approved or rejected.");
  }

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: decision,
    details: `Admin decision: ${decision}. Note: ${note}`,
    createdAt: now,
  });

  audit(store, actor.id, `offer-${decision}`, "offer", offer.id, `Admin ${decision} offer ${offer.number}: ${note}`, now);

  return ok(offer);
}

export function updateOfferStatus(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  newStatus: string,
  now: string
): Result<Offer> {
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can update offer statuses.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  const validStatuses = ["draft", "received", "under_review", "negotiating", "won", "lost"];
  const statusKey = newStatus.trim().toLowerCase();
  if (!validStatuses.includes(statusKey)) {
    return fail(`Invalid offer status: ${newStatus}`);
  }

  const oldStatus = offer.status;
  offer.status = statusKey as Offer["status"];
  offer.updatedBy = actor.id;
  offer.updatedAt = now;

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "status_changed",
    details: `Status changed from ${oldStatus} to ${statusKey}`,
    createdAt: now,
  });

  audit(store, actor.id, "offer-status-changed", "offer", offer.id, `Status of offer ${offer.number} changed to ${statusKey}`, now);

  return ok(offer);
}

export function toggleOfferFavourite(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  now: string
): Result<Offer> {
  if (actor.role !== "moderator" && actor.role !== "owner") {
    return fail("Unauthorized to toggle favourite status.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  offer.isFavourite = !offer.isFavourite;
  offer.updatedAt = now;

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "favourite_toggled",
    details: offer.isFavourite ? "Added to favourites" : "Removed from favourites",
    createdAt: now,
  });

  return ok(offer);
}

export function addOfferComment(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  commentText: string,
  now: string
): Result<OfferComment> {
  if (actor.role !== "moderator" && actor.role !== "owner") {
    return fail("Unauthorized to add offer comments.");
  }

  const commentStr = commentText ? commentText.trim() : "";
  if (!commentStr) return fail("Comment text cannot be empty.");

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  if (!store.offerComments) store.offerComments = [];
  const comment: OfferComment = {
    id: randomUUID(),
    offerId: offer.id,
    authorId: actor.id,
    comment: commentStr,
    createdAt: now,
  };

  store.offerComments.push(comment);

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "comment_added",
    details: `Added note/comment: ${commentStr.slice(0, 80)}${commentStr.length > 80 ? "..." : ""}`,
    createdAt: now,
  });

  return ok(comment);
}

export function addOfferAttachment(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  attachment: { name: string; mime?: string; bytesBase64?: string; byteSize?: number; kind?: "image" | "document" },
  now: string
): Result<OfferAttachment> {
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can manage offer attachments.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  const name = text(attachment.name) || "attachment";
  const mime = text(attachment.mime) || "application/octet-stream";
  const isImage = attachment.kind === "image" || mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);
  const attId = randomUUID();
  const storageKey = `offers/${offer.id}/${attId}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  let byteSize = 0;
  if (typeof attachment.bytesBase64 === "string" && attachment.bytesBase64) {
    const buf = Buffer.from(attachment.bytesBase64, "base64");
    byteSize = buf.byteLength;
    store.blobs.push({
      key: storageKey,
      name,
      mime,
      bytesBase64: attachment.bytesBase64,
    });
  }

  if (!store.offerAttachments) store.offerAttachments = [];
  const attRecord: OfferAttachment = {
    id: attId,
    offerId: offer.id,
    name,
    kind: isImage ? "image" : "document",
    mime,
    byteSize: byteSize || (typeof attachment.byteSize === "number" ? attachment.byteSize : 0),
    storageKey,
    url: null,
    uploadedBy: actor.id,
    createdAt: now,
  };

  store.offerAttachments.push(attRecord);

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "attachment_added",
    details: `Added ${attRecord.kind}: ${name}`,
    createdAt: now,
  });

  return ok(attRecord);
}

export function deleteOfferAttachment(
  store: StoreData,
  actor: UserRecord,
  offerId: string,
  attachmentId: string,
  now: string
): Result<void> {
  if (actor.role !== "moderator") {
    return fail("Only a Sales & Purchasing Offer Moderator can manage offer attachments.");
  }

  const offer = (store.offers || []).find((o) => (o.id === offerId || o.number === offerId) && !o.deletedAt);
  if (!offer) return fail("Offer not found.");

  const index = (store.offerAttachments || []).findIndex((att) => att.id === attachmentId && att.offerId === offer.id);
  if (index === -1) return fail("Attachment not found.");

  const removed = store.offerAttachments[index];
  store.offerAttachments.splice(index, 1);

  if (!store.offerActivities) store.offerActivities = [];
  store.offerActivities.push({
    id: randomUUID(),
    offerId: offer.id,
    actorId: actor.id,
    action: "attachment_deleted",
    details: `Removed attachment: ${removed.name}`,
    createdAt: now,
  });

  return ok(undefined);
}

export function assignRequestWorker(
  store: StoreData,
  requestId: string,
  workerId: string,
  actor: UserRecord,
  now: string,
): Result<RequestRecord> {
  if (!canPerform(actor.role, "assign-worker")) {
    return fail("Direct modification of request worker assignment is not permitted.");
  }
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) return fail("That request does not exist.");
  const worker = store.users.find((item) => item.id === workerId && item.active);
  if (!worker || worker.role !== "worker") {
    return fail("Target user must be an active worker.");
  }
  const previousWorkerId = request.createdBy;
  request.createdBy = worker.id;
  audit(
    store,
    actor.id,
    "worker-assigned",
    "request",
    request.id,
    `${request.number} responsible worker changed to ${worker.name}.`,
    now,
    previousWorkerId,
  );
  return ok(request);
}

export function deletePurchaseOrder(
  store: StoreData,
  number: string,
  actor: UserRecord,
  now: string,
): Result<PurchaseOrder> {
  if (!canPerform(actor.role, "delete-order")) {
    return fail("Operational PO/SO records cannot be deleted.");
  }
  const order = orderByNumber(store, number);
  if (!order) return fail("That purchase order does not exist.");
  store.purchaseOrders = store.purchaseOrders.filter((item) => item.id !== order.id);
  store.purchaseOrderLines = store.purchaseOrderLines.filter((item) => item.purchaseOrderId !== order.id);
  audit(store, actor.id, "order-deleted", "purchase-order", order.id, `${order.number} was deleted.`, now, order.status);
  return ok(order);
}

export function applyStockMovement(
  store: StoreData,
  input: { requestId: string; requestLineId: string; materialId: string; warehouseId: string; direction: "in" | "out"; weightKg: number; actorId: string },
  now: string,
): Result<StockMovement> {
  const existing = store.stockMovements.find((item) => item.requestLineId === input.requestLineId && item.direction === input.direction);
  if (existing) return ok(existing);
  if (!(input.weightKg > 0)) return fail("A stock movement must be greater than zero kilograms.");
  const balance = store.stockBalances.find((item) => item.materialId === input.materialId && item.warehouseId === input.warehouseId);
  const current = balance?.weightKg ?? 0;
  const next = roundKg(input.direction === "in" ? current + input.weightKg : current - input.weightKg);
  if (next < 0) return fail("That movement would make stock negative.");
  if (balance) balance.weightKg = next;
  else store.stockBalances.push({ id: randomUUID(), materialId: input.materialId, warehouseId: input.warehouseId, weightKg: next });
  const movement: StockMovement = {
    id: randomUUID(),
    materialId: input.materialId,
    warehouseId: input.warehouseId,
    weightKg: input.weightKg,
    direction: input.direction,
    requestId: input.requestId,
    requestLineId: input.requestLineId,
    createdAt: now,
    createdBy: input.actorId,
  };
  store.stockMovements.push(movement);

  const request = store.requests.find((r) => r.id === input.requestId);
  const line = store.requestLines.find((l) => l.id === input.requestLineId);
  const shipment = request ? store.shipments.find((s) => s.id === request.shipmentId) : null;
  const order = shipment ? store.purchaseOrders.find((po) => po.id === shipment.purchaseOrderId) : null;
  const warehouse = store.warehouses.find((w) => w.id === input.warehouseId);
  const material = store.materials.find((m) => m.id === input.materialId);
  const packaging = line?.packagingTypeId ? store.packagingTypes.find((p) => p.id === line.packagingTypeId) : null;
  const performer = store.users.find((u) => u.id === input.actorId);
  const pkgCount = line?.packageCount ?? null;
  const pkgUnitTare = packaging?.tareKg ?? (line && line.packageCount > 0 ? roundKg(line.tareTotalKg / line.packageCount) : null);
  const totalPkgWeight = line ? line.tareTotalKg : null;
  const grossWeight = line?.grossKg ?? (totalPkgWeight != null ? roundKg(input.weightKg + totalPkgWeight) : input.weightKg);

  if (!store.inventoryHistory) store.inventoryHistory = [];
  store.inventoryHistory.push({
    id: randomUUID(),
    materialId: input.materialId,
    materialName: material?.description ?? "Material",
    warehouseId: input.warehouseId,
    warehouseName: warehouse?.name ?? "Warehouse",
    containerNumber: shipment?.containerNumber || shipment?.reference || null,
    quantityBefore: current,
    quantityChange: input.direction === "in" ? input.weightKg : -input.weightKg,
    quantityAfter: next,
    packagingTypeId: packaging?.id ?? null,
    packagingTypeName: packaging?.name ?? null,
    packagingCount: pkgCount,
    packagingUnitTareKg: pkgUnitTare,
    totalPackagingWeightKg: totalPkgWeight,
    grossWeightKg: grossWeight,
    operationType: input.direction === "in" ? "receipt" : "dispatch",
    operationReason: request?.type === "unloading" ? "Container unloading receipt" : "Container loading dispatch",
    reference: request?.number ?? input.requestId,
    poNumber: order?.number ?? null,
    soNumber: null,
    performedBy: input.actorId,
    performedByName: performer?.name ?? "Worker",
    createdAt: now,
  });

  return ok(movement);
}

export function completeRequest(store: StoreData, requestId: string, actor: UserRecord, now: string): Result<RequestRecord> {
  if (actor.role !== "worker") return fail("Only the assigned warehouse worker can complete an approved operation.");
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) return fail("That request does not exist.");
  if (actor.role === "worker" && actor.warehouseId !== request.warehouseId) {
    return fail("You can only complete operations at your assigned warehouse.");
  }
  if (request.status === "completed") return ok(request);
  if (request.status !== "approved") return fail("Stock changes only after Admin approves the request and the operation is completed.");
  const lines = store.requestLines.filter((item) => item.requestId === request.id);
  if (lines.length === 0) return fail("This request has no net-weight lines to enter.");
  const direction = request.type === "unloading" ? "in" : "out";
  const requiredByMaterial = new Map<string, number>();
  for (const line of lines) {
    if (!(line.netKg > 0)) return fail("A stock movement must be greater than zero kilograms.");
    const alreadyApplied = store.stockMovements.some((item) => item.requestLineId === line.id && item.direction === direction);
    if (!alreadyApplied && direction === "out") {
      requiredByMaterial.set(line.materialId, roundKg((requiredByMaterial.get(line.materialId) ?? 0) + line.netKg));
    }
  }
  if (direction === "out") {
    for (const [materialId, requiredKg] of requiredByMaterial.entries()) {
      const current = store.stockBalances.find((item) => item.materialId === materialId && item.warehouseId === request.warehouseId)?.weightKg ?? 0;
      if (current < requiredKg) return fail("That movement would make stock negative.");
    }
  }
  for (const line of lines) {
    const applied = applyStockMovement(
      store,
      { requestId: request.id, requestLineId: line.id, materialId: line.materialId, warehouseId: request.warehouseId, direction, weightKg: line.netKg, actorId: actor.id },
      now,
    );
    if (!applied.ok) return applied;
  }
  request.status = "completed";
  request.enteredBy = actor.id;
  request.enteredAt = now;
  audit(store, actor.id, "request-completed", "request", request.id, `${request.number} was entered. Stock moved once.`, now, "approved");
  return ok(request);
}

export function transferStock(
  store: StoreData,
  input: { fromWarehouseId: string; toWarehouseId: string; materialId: string; weightKg: number; actor: UserRecord; clientKey?: string },
  now: string,
): Result<{ outMovement: StockMovement; inMovement: StockMovement }> {
  if (!can(input.actor, "stock:transfer")) {
    return fail("This role cannot transfer stock.");
  }
  if (input.fromWarehouseId === input.toWarehouseId) {
    return fail("Choose two different warehouses.");
  }
  if (!(input.weightKg > 0)) {
    return fail("Transfer weight must be greater than zero kilograms.");
  }
  if (
    input.clientKey &&
    store.auditLog.some((item) => (item.action === "transfer-requested" || item.action === "stock-transferred") && item.oldValue === input.clientKey)
  ) {
    return fail("That transfer was already submitted.");
  }
  const fromWh = store.warehouses.find((w) => w.id === input.fromWarehouseId);
  const toWh = store.warehouses.find((w) => w.id === input.toWarehouseId);
  if (!fromWh || !toWh) return fail("Warehouse not found.");
  const mat = store.materials.find((m) => m.id === input.materialId);
  if (!mat) return fail("Material not found.");

  const fromBalance = store.stockBalances.find(
    (b) => b.warehouseId === input.fromWarehouseId && b.materialId === input.materialId,
  );
  const currentFrom = fromBalance?.weightKg ?? 0;
  if (currentFrom < input.weightKg) {
    return fail("Insufficient stock at source warehouse.");
  }

  // Atomic stock updates
  const nextFrom = roundKg(currentFrom - input.weightKg);
  if (fromBalance) fromBalance.weightKg = nextFrom;

  let toBalance = store.stockBalances.find(
    (b) => b.warehouseId === input.toWarehouseId && b.materialId === input.materialId,
  );
  const nextTo = roundKg((toBalance?.weightKg ?? 0) + input.weightKg);
  if (toBalance) {
    toBalance.weightKg = nextTo;
  } else {
    toBalance = {
      id: randomUUID(),
      materialId: input.materialId,
      warehouseId: input.toWarehouseId,
      weightKg: nextTo,
    };
    store.stockBalances.push(toBalance);
  }

  const transferRequestId = randomUUID();
  const lineId = randomUUID();
  const outMovement: StockMovement = {
    id: randomUUID(),
    materialId: input.materialId,
    warehouseId: input.fromWarehouseId,
    weightKg: input.weightKg,
    direction: "out",
    requestId: transferRequestId,
    requestLineId: lineId,
    createdAt: now,
    createdBy: input.actor.id,
  };
  const inMovement: StockMovement = {
    id: randomUUID(),
    materialId: input.materialId,
    warehouseId: input.toWarehouseId,
    weightKg: input.weightKg,
    direction: "in",
    requestId: transferRequestId,
    requestLineId: lineId,
    createdAt: now,
    createdBy: input.actor.id,
  };
  store.stockMovements.push(outMovement, inMovement);

  if (!store.inventoryHistory) store.inventoryHistory = [];
  store.inventoryHistory.push({
    id: randomUUID(),
    materialId: input.materialId,
    materialName: mat.description,
    warehouseId: input.fromWarehouseId,
    warehouseName: fromWh.name,
    containerNumber: null,
    quantityBefore: currentFrom,
    quantityChange: -input.weightKg,
    quantityAfter: nextFrom,
    packagingTypeId: null,
    packagingTypeName: null,
    packagingCount: null,
    packagingUnitTareKg: null,
    totalPackagingWeightKg: null,
    grossWeightKg: input.weightKg,
    operationType: "transfer_out",
    operationReason: `Transfer to ${toWh.name}`,
    reference: transferRequestId,
    poNumber: null,
    soNumber: null,
    performedBy: input.actor.id,
    performedByName: input.actor.name,
    createdAt: now,
  });
  store.inventoryHistory.push({
    id: randomUUID(),
    materialId: input.materialId,
    materialName: mat.description,
    warehouseId: input.toWarehouseId,
    warehouseName: toWh.name,
    containerNumber: null,
    quantityBefore: roundKg(nextTo - input.weightKg),
    quantityChange: input.weightKg,
    quantityAfter: nextTo,
    packagingTypeId: null,
    packagingTypeName: null,
    packagingCount: null,
    packagingUnitTareKg: null,
    totalPackagingWeightKg: null,
    grossWeightKg: input.weightKg,
    operationType: "transfer_in",
    operationReason: `Transfer from ${fromWh.name}`,
    reference: transferRequestId,
    poNumber: null,
    soNumber: null,
    performedBy: input.actor.id,
    performedByName: input.actor.name,
    createdAt: now,
  });

  audit(
    store,
    input.actor.id,
    "stock-transferred",
    "transfer",
    transferRequestId,
    `Transferred ${input.weightKg} kg of ${mat.description} from ${fromWh.name} to ${toWh.name}.`,
    now,
    input.clientKey ?? null,
  );

  return ok({ outMovement, inMovement });
}

export function postCorrection(
  store: StoreData,
  input: { requestId: string; materialId: string; deltaKg: number; reason: string; actor: UserRecord },
  now: string,
): Result<StockMovement> {
  if (!can(input.actor, "stock:adjust")) {
    return fail("This role cannot post a stock adjustment.");
  }
  if (!input.reason.trim()) {
    return fail("A reason is required for inventory corrections.");
  }
  if (input.deltaKg === 0) {
    return fail("Correction delta cannot be zero.");
  }
  const request = store.requests.find((r) => r.id === input.requestId);
  if (!request) return fail("That request does not exist.");
  if (request.status !== "completed") {
    return fail("Corrections can only be posted against a completed request.");
  }
  const mat = store.materials.find((m) => m.id === input.materialId);
  if (!mat) return fail("Material not found.");

  const balance = store.stockBalances.find(
    (b) => b.warehouseId === request.warehouseId && b.materialId === input.materialId,
  );
  const current = balance?.weightKg ?? 0;
  const next = roundKg(current + input.deltaKg);
  if (next < 0) {
    return fail("Correction would make stock negative.");
  }

  if (balance) {
    balance.weightKg = next;
  } else {
    store.stockBalances.push({
      id: randomUUID(),
      materialId: input.materialId,
      warehouseId: request.warehouseId,
      weightKg: next,
    });
  }

  const movement: StockMovement = {
    id: randomUUID(),
    materialId: input.materialId,
    warehouseId: request.warehouseId,
    weightKg: Math.abs(input.deltaKg),
    direction: input.deltaKg > 0 ? "in" : "out",
    requestId: request.id,
    requestLineId: randomUUID(),
    createdAt: now,
    createdBy: input.actor.id,
  };
  store.stockMovements.push(movement);

  if (!store.inventoryHistory) store.inventoryHistory = [];
  store.inventoryHistory.push({
    id: randomUUID(),
    materialId: input.materialId,
    materialName: mat.description,
    warehouseId: request.warehouseId,
    warehouseName: store.warehouses.find((w) => w.id === request.warehouseId)?.name ?? "Warehouse",
    containerNumber: null,
    quantityBefore: current,
    quantityChange: input.deltaKg,
    quantityAfter: next,
    packagingTypeId: null,
    packagingTypeName: null,
    packagingCount: null,
    packagingUnitTareKg: null,
    totalPackagingWeightKg: null,
    grossWeightKg: Math.abs(input.deltaKg),
    operationType: "adjustment",
    operationReason: input.reason.trim(),
    reference: request.number,
    poNumber: null,
    soNumber: null,
    performedBy: input.actor.id,
    performedByName: input.actor.name,
    createdAt: now,
  });

  audit(
    store,
    input.actor.id,
    "stock-corrected",
    "request",
    request.id,
    `Corrected stock by ${input.deltaKg > 0 ? `+${input.deltaKg}` : input.deltaKg} kg for ${mat.description}. Reason: ${input.reason.trim()}`,
    now,
  );

  return ok(movement);
}

export function checkInventoryConsistency(
  store: StoreData,
): { ok: boolean; mismatches: { materialId: string; warehouseId: string; balanceKg: number; sumMovementsKg: number }[] } {
  const keys = new Set<string>();
  for (const b of store.stockBalances) {
    keys.add(`${b.materialId}::${b.warehouseId}`);
  }
  for (const m of store.stockMovements) {
    keys.add(`${m.materialId}::${m.warehouseId}`);
  }

  const mismatches: { materialId: string; warehouseId: string; balanceKg: number; sumMovementsKg: number }[] = [];
  for (const key of keys) {
    const [materialId, warehouseId] = key.split("::");
    const balance = store.stockBalances.find((b) => b.materialId === materialId && b.warehouseId === warehouseId)?.weightKg ?? 0;
    const sumMovements = roundKg(
      store.stockMovements
        .filter((m) => m.materialId === materialId && m.warehouseId === warehouseId)
        .reduce((sum, m) => (m.direction === "in" ? sum + m.weightKg : sum - m.weightKg), 0),
    );

    if (Math.abs(balance - sumMovements) > 0.0001) {
      mismatches.push({
        materialId,
        warehouseId,
        balanceKg: balance,
        sumMovementsKg: sumMovements,
      });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

function putBlob(store: StoreData, name: string, mime: string, bytesBase64: string, customKey?: string): string {
  const key = customKey || randomUUID();
  store.blobs.push({ key, name, mime, bytesBase64 });
  return key;
}

export function computeStorageKey(kind: string, targetRef: string, timestamp: number, fileId: string, ext: string): string {
  const cleanRef = (targetRef || "general").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanExt = (ext || "bin").replace(/^\./, "");
  return `${kind}/${cleanRef}/${timestamp}-${fileId}.${cleanExt}`;
}

export function computeReadableName(targetRef: string, kind: string, index: number, ext: string): string {
  const cleanRef = (targetRef || "DOC").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanExt = (ext || "bin").replace(/^\./, "");
  return `${cleanRef}_${kind.toUpperCase()}_${index}.${cleanExt}`;
}

export function extensionForMime(mime: string, filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  if (match) return match[1].toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export function categoryForKind(kind: DocumentKind): "Purchase" | "Container" | "Customs" | "Transport" | "Annex 7" {
  switch (kind) {
    case "photo":
      return "Container";
    case "cmr":
      return "Transport";
    case "annex7":
      return "Annex 7";
    case "customs_proof":
      return "Customs";
    default:
      return "Purchase";
  }
}

export function createUploadTarget(
  store: StoreData,
  actor: UserRecord | null,
  metadata: UploadTargetMetadata,
  now: string
): Result<UploadTarget> {
  if (actor) {
    const warehouse = metadata.warehouse
      ? store.warehouses.find((w) => w.name === metadata.warehouse || w.id === metadata.warehouse)?.id ?? null
      : actor.warehouseId;
    if (!can(actor, "file:upload", { warehouseId: warehouse, createdBy: metadata.actorId })) {
      return fail("This role cannot upload files.");
    }
  }

  if (metadata.byteSize > MAX_FILE_SIZE_BYTES) {
    return fail(`File exceeds 10 MB limit (${(metadata.byteSize / (1024 * 1024)).toFixed(1)} MB).`);
  }

  const isUuid = (val: string | null | undefined): boolean =>
    Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  const resolvedShipment = metadata.shipmentId
    ? store.shipments.find(
      (s) =>
        s.id === metadata.shipmentId ||
        s.reference === metadata.shipmentId ||
        s.containerNumber === metadata.shipmentId
    )
    : metadata.containerNumber
      ? store.shipments.find(
        (s) => s.containerNumber === metadata.containerNumber || s.reference === metadata.containerNumber
      )
      : null;

  const resolvedShipmentId = resolvedShipment
    ? resolvedShipment.id
    : isUuid(metadata.shipmentId)
      ? metadata.shipmentId!
      : null;

  const resolvedRequest = metadata.requestId
    ? store.requests.find((r) => r.id === metadata.requestId || r.number === metadata.requestId)
    : null;

  const resolvedRequestId = resolvedRequest
    ? resolvedRequest.id
    : isUuid(metadata.requestId)
      ? metadata.requestId!
      : null;

  const fileId = randomUUID();
  const ext = extensionForMime(metadata.mime, metadata.filename);
  const targetRef = metadata.requestNumber || metadata.containerNumber || (resolvedShipment ? resolvedShipment.reference : metadata.shipmentId) || "general";
  const timestamp = Date.parse(now) || Date.now();
  const storageKey = computeStorageKey(metadata.kind, targetRef, timestamp, fileId, ext);

  const existingCount = store.documents.filter(
    (d) =>
      d.kind === metadata.kind &&
      ((metadata.requestNumber && d.requestNumber === metadata.requestNumber) ||
        (resolvedShipmentId && d.shipmentId === resolvedShipmentId) ||
        (metadata.containerNumber && d.containerNumber === metadata.containerNumber))
  ).length;

  const readableName = computeReadableName(targetRef, metadata.kind, existingCount + 1, ext);

  const doc: DocumentRecord = {
    id: fileId,
    kind: metadata.kind,
    category: categoryForKind(metadata.kind),
    shipmentId: resolvedShipmentId,
    purchaseOrderId: metadata.poNumber
      ? store.purchaseOrders.find((p) => p.number === metadata.poNumber)?.id ?? null
      : resolvedShipment?.purchaseOrderId ?? null,
    requestId: resolvedRequestId,
    requestNumber: metadata.requestNumber ?? resolvedRequest?.number ?? null,
    poNumber: metadata.poNumber ?? null,
    containerNumber: metadata.containerNumber ?? resolvedShipment?.containerNumber ?? null,
    warehouse:
      metadata.warehouse ??
      (resolvedShipment
        ? store.warehouses.find((w) => w.id === resolvedShipment.warehouseId)?.name ?? null
        : actor?.warehouseId
          ? warehouseOf(store, actor)
          : null),
    notes: metadata.notes ?? null,
    originalFilename: metadata.filename,
    readableName,
    status: metadata.requestId ? "active" : "pending",
    name: readableName,
    mime: metadata.mime,
    byteSize: metadata.byteSize,
    storageKey,
    cmrReference: null,
    cmrCarrier: null,
    cmrGoodsDescription: null,
    cmrRemarks: null,
    cmrEnteredBy: null,
    cmrEnteredAt: null,
    createdBy: metadata.actorId,
    createdAt: now,
  };

  store.documents.push(doc);

  return ok({
    fileId,
    uploadUrl: `/api/files/upload?target=${fileId}`,
    storageKey,
    readableName,
  });
}

export function confirmUpload(
  store: StoreData,
  actor: UserRecord | null,
  input: ConfirmUploadInput,
  now: string
): Result<DocumentRecord> {
  const doc = store.documents.find((d) => d.id === input.fileId);
  if (!doc) {
    return fail("File upload target not found.");
  }

  if (input.bytesBase64) {
    const buffer = Buffer.from(input.bytesBase64, "base64");
    const detected = detectFileType(buffer);
    if (!detected.valid) {
      store.documents = store.documents.filter((d) => d.id !== doc.id);
      return fail(detected.error || "Invalid file content.");
    }

    doc.byteSize = buffer.length;
    doc.mime = detected.mime;
    store.blobs.push({
      key: doc.storageKey,
      name: doc.readableName || doc.name,
      mime: detected.mime,
      bytesBase64: input.bytesBase64,
    });
  }

  if (doc.requestId) {
    doc.status = "active";
    if (doc.kind === "photo" && !store.requestPhotos.some((rp) => rp.requestId === doc.requestId && rp.documentId === doc.id)) {
      store.requestPhotos.push({
        id: randomUUID(),
        requestId: doc.requestId,
        documentId: doc.id,
      });
    }
  }

  const actorId = actor?.id ?? input.actorId;
  audit(
    store,
    actorId,
    "file-uploaded",
    "document",
    doc.id,
    `${doc.readableName || doc.name} (${doc.kind}) was uploaded.`,
    now
  );

  return ok(doc);
}

function duplicateEquipment(store: StoreData, shipmentId: string, containerNumber: string): boolean {
  const needle = containerNumber.trim().toLowerCase();
  if (!needle) return false;
  return store.shipments.some((item) => item.direction === "inbound" && item.id !== shipmentId && item.containerNumber.trim().toLowerCase() === needle);
}

export function applyCommand(store: StoreData, actor: UserRecord, name: string, payload: unknown, now: string): CommandResult {
  const body = record(payload);
  switch (name) {
    case "createPurchase":
      return createPurchase(store, actor, body, now);
    case "submitOrder":
      return submitOrder(store, actor, body, now);
    case "approve":
      return setOrderStatus(store, actor, text(body.number), "approved", now);
    case "reject":
      return setOrderStatus(store, actor, text(body.number), "declined", now);
    case "editPurchase":
      return editPurchase(store, actor, body, now);
    case "deletePurchase":
    case "deleteOrder":
      return asCommand(deletePurchaseOrder(store, text(body.number), actor, now), "Purchase order was deleted.");
    case "assignWorker":
      return asCommand(assignRequestWorker(store, text(body.requestId), text(body.workerId), actor, now), "Worker was assigned.");
    case "addInbound":
      return addShipment(store, actor, "inbound", body, now);
    case "addOutbound":
      return addShipment(store, actor, "outbound", body, now);
    case "saveMeta":
      return saveMeta(store, actor, body, now);
    case "saveMaterial":
      return saveMaterial(store, actor, body, now);
    case "deleteMaterial":
      return deleteMaterial(store, actor, body, now);
    case "unload":
      return advance(store, actor, "inbound", text(body.number), now);
    case "dispatch":
      return advance(store, actor, "outbound", text(body.number), now);
    case "saveCustoms":
      return saveCustoms(store, actor, body, now);
    case "confirmSeller":
      return confirmSeller(store, actor, text(body.number), now);
    case "confirmCustoms":
      return confirmCustoms(store, actor, body, now);
    case "saveCmr":
      return saveCmr(store, actor, body, now);
    case "saveCarrier":
      return saveCarrier(store, actor, body, now);
    case "overrideDispatch":
      return overrideDispatch(store, actor, body, now);
    case "setThreshold":
      return setThreshold(store, actor, body, now);
    case "addPackagingType":
      return addPackaging(store, actor, body, now);
    case "transfer":
      return transfer(store, actor, body, now);
    case "message":
    case "messagePo":
    case "messageSeller":
      return sendChat(store, actor, name, body, now);
    case "addUser":
      return addUser(store, actor, body, now);
    case "changeRole":
      return changeRole(store, actor, body, now);
    case "attachFile":
      return attachOne(store, actor, body, now);
    case "attachFiles":
      return attachMany(store, actor, payload, now);
    case "detachFile":
      return detachFile(store, actor, text(body.id), now);
    case "selectDocument":
      return selectDocument(store, actor, body, now);
    case "addAnnex":
      return addAnnex(store, actor, body, now);
    case "reviewAnnex":
      return setAnnex(store, actor, text(body.id), "under_review", now);
    case "approveAnnex":
      return setAnnex(store, actor, text(body.id), "approved", now);
    case "reset":
      return resetOperational(store, actor, now);
    case "approveRequest":
      return asCommand(approveRequest(store, text(body.requestId), actor, now), "Request was approved.");
    case "completeRequest":
      return asCommand(completeRequest(store, text(body.requestId), actor, now), "Request was entered and completed into stock.");
    case "transferStock":
      return asCommand(
        transferStock(
          store,
          {
            fromWarehouseId: text(body.fromWarehouseId),
            toWarehouseId: text(body.toWarehouseId),
            materialId: text(body.materialId),
            weightKg: num(body.weightKg),
            actor,
            clientKey: text(body.clientKey) || undefined,
          },
          now,
        ),
        "Stock was transferred.",
      );
    case "postCorrection":
      return asCommand(
        postCorrection(
          store,
          {
            requestId: text(body.requestId),
            materialId: text(body.materialId),
            deltaKg: num(body.deltaKg),
            reason: text(body.reason),
            actor,
          },
          now,
        ),
        "Stock correction was posted.",
      );
    case "declineRequest":
      return asCommand(declineRequest(store, text(body.requestId), actor, text(body.reason), now), "Request was declined.");
    case "sendBackRequest":
      return asCommand(sendBackRequest(store, text(body.requestId), actor, text(body.note), now), "Request was sent back to the worker.");
    case "deleteRequest":
      return asCommand(softDeleteRequest(store, text(body.requestId), actor, now), "Request was deleted.");
    case "createGeneralRequest":
      return asCommand(createGeneralRequest(store, actor, record(body), now), "Your request was submitted.");
    case "decideGeneralRequest":
      return asCommand(decideGeneralRequest(store, actor, record(body), now), "Request updated.");
    case "assignPoSoToGeneralRequest":
      return asCommand(assignPoSoToGeneralRequest(store, actor, record(body), now), "PO/SO reference assigned.");
    case "deleteGeneralRequest":
      return asCommand(softDeleteGeneralRequest(store, actor, text(body.requestId || body.id), now), "Request was deleted.");
    case "createOffer":
      return asCommand(createOffer(store, actor, record(body), now), "Offer created.");
    case "editOffer":
      return asCommand(editOffer(store, actor, record(body), now), "Offer updated.");
    case "deleteOffer":
      return asCommand(softDeleteOffer(store, actor, text(body.offerId || body.id), now), "Offer deleted.");
    case "submitOffer":
    case "submitOfferForReview":
      return asCommand(submitOfferForReview(store, actor, text(body.offerId || body.id), now), "Offer submitted for review.");
    case "decideOffer":
      return asCommand(
        decideOffer(
          store,
          actor,
          text(body.offerId || body.id),
          (text(body.decision) === "rejected" ? "rejected" : "approved") as "approved" | "rejected",
          text(body.note || body.decisionNote),
          now,
        ),
        "Decision recorded.",
      );
    case "updateOfferStatus":
      return asCommand(updateOfferStatus(store, actor, text(body.offerId || body.id), text(body.status), now), "Status updated.");
    case "toggleOfferFavourite":
      return asCommand(toggleOfferFavourite(store, actor, text(body.offerId || body.id), now), "Favourite updated.");
    case "addOfferComment":
      return asCommand(addOfferComment(store, actor, text(body.offerId || body.id), text(body.comment), now), "Comment added.");
    case "addOfferAttachment": {
      const attRecord = record(body.attachment || body);
      return asCommand(
        addOfferAttachment(
          store,
          actor,
          text(body.offerId || body.id),
          {
            name: text(attRecord.name) || "attachment",
            mime: typeof attRecord.mime === "string" ? attRecord.mime : undefined,
            bytesBase64: typeof attRecord.bytesBase64 === "string" ? attRecord.bytesBase64 : undefined,
            byteSize: typeof attRecord.byteSize === "number" ? attRecord.byteSize : undefined,
            kind: attRecord.kind === "image" ? "image" : attRecord.kind === "document" ? "document" : undefined,
          },
          now,
        ),
        "Attachment added.",
      );
    }
    case "deleteOfferAttachment":
      return asCommand(deleteOfferAttachment(store, actor, text(body.offerId || body.id), text(body.attachmentId || body.id), now), "Attachment removed.");
    case "markNotificationRead":
      return asCommand(markNotificationRead(store, actor, text(body.id || body.notificationId), now), "Notification marked as read.");
    case "markAllNotificationsRead":
      return asCommand(markAllNotificationsRead(store, actor, now), "All notifications marked as read.");
    case "createRequest": {
      if (actor.role !== "worker") {
        return { error: "Only a Worker can submit a loading or unloading request." };
      }
      const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
      const shipment = shipmentByRef(store, direction, text(body.shipment));
      if (!shipment) return { error: "That shipment does not exist." };
      if (actor.role === "worker") {
        const whName = store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "";
        if (!canOperateWarehouse(actor.role, warehouseOf(store, actor), whName)) {
          return { error: "You can only submit requests for your assigned warehouse." };
        }
      }
      const req = submitRequestWithPendingPhotos(store, shipment, actor.id, now);
      return req.ok ? { notice: `Request ${req.value.number} is ${req.value.status}.` } : { error: req.error };
    }
    default:
      return { error: "That action is not available." };
  }
}

function asCommand(result: Result<unknown>, defaultNotice = "Saved."): CommandResult {
  return result.ok ? { notice: defaultNotice } : { error: result.error };
}

function createPurchase(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "create-order", "Only Staff can create a PO/SO order.");
  if (blocked) return blocked;
  const supplier = text(body.supplier);
  const material = text(body.material);
  const quantityKg = num(body.quantityKg);
  const valueEur = num(body.valueEur);
  if (!supplier || !material || !Number.isFinite(quantityKg) || quantityKg < 0 || !Number.isFinite(valueEur) || valueEur < 0) {
    return { error: "Supplier, material, quantity, and value are required." };
  }
  const requestedNumber = text(body.number);
  if (requestedNumber && orderByNumber(store, requestedNumber)) {
    return { error: "That purchase order number already exists." };
  }
  const number = requestedNumber || nextPurchaseOrderNumber(store, now);
  const title = text(body.title) || `${supplier} - ${material}`;
  const company = upsertCompany(store, supplier, "supplier", randomUUID);
  const order: PurchaseOrder = {
    id: randomUUID(),
    number,
    title,
    companyId: company.id,
    status: "submitted",
    valueEur,
    notes: text(body.notes),
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  store.purchaseOrders.push(order);
  store.purchaseOrderLines.push({
    id: randomUUID(),
    purchaseOrderId: order.id,
    materialId: null,
    description: material,
    quantityKg,
  });
  audit(store, actor.id, "order-created", "purchase-order", order.id, `${order.number} (${order.title}) was submitted for approval.`, now);
  return { notice: `${order.number} was submitted for approval.` };
}

function submitOrder(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "submit-order", "Only a customer can submit a purchase order.");
  if (blocked) return blocked;
  const number = text(body.number);
  const notes = text(body.notes);
  if (!number) return { error: "Enter the purchase order number." };
  if (!actor.companyId) return { error: "This customer is not linked to a company." };
  if (orderByNumber(store, number)) return { error: "That purchase order number already exists." };
  const title = text(body.title) || `Order ${number}`;
  const order: PurchaseOrder = {
    id: randomUUID(),
    number,
    title,
    companyId: actor.companyId,
    status: "submitted",
    valueEur: 0,
    notes,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  store.purchaseOrders.push(order);
  audit(store, actor.id, "order-submitted", "purchase-order", order.id, `${number} was submitted for approval.`, now);
  return { notice: `${number} was submitted for approval. Stock and shipments were not changed.` };
}

function setOrderStatus(store: StoreData, actor: UserRecord, number: string, status: "approved" | "declined", now: string): CommandResult {
  const action = status === "approved" ? "approve-order" : "reject-order";
  const blocked = deny(actor.role, action, status === "approved" ? "Only the owner can approve a purchase order." : "Only the owner can reject a purchase order.");
  if (blocked) return blocked;
  const order = orderByNumber(store, number);
  if (!order) return { error: "That purchase order does not exist." };
  if (order.status !== "submitted") return { error: "Only a pending purchase order can be approved or rejected." };
  order.status = status;
  order.updatedAt = now;
  audit(store, actor.id, status === "approved" ? "order-approved" : "order-declined", "purchase-order", order.id, `${order.number} was ${status}.`, now, "submitted");
  return { notice: `${order.number} is ${status}.` };
}

function editPurchase(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "edit-order", "Only Staff can edit a PO/SO order.");
  if (blocked) return blocked;
  if (body.workerId !== undefined || body.assignedWorker !== undefined) {
    return { error: "Staff cannot assign or change the responsible worker." };
  }
  const order = orderByNumber(store, text(body.number));
  if (!order) return { error: "That purchase order does not exist." };
  if (order.status === "declined") return { error: "A declined purchase order cannot be edited." };
  const supplier = text(body.supplier);
  const material = text(body.material);
  const quantityKg = num(body.quantityKg);
  const valueEur = num(body.valueEur);
  if (!supplier || !material || !Number.isFinite(quantityKg) || quantityKg < 0 || !Number.isFinite(valueEur) || valueEur < 0) {
    return { error: "Supplier, material, quantity, and value are required." };
  }
  const company = upsertCompany(store, supplier, "supplier", randomUUID);
  order.companyId = company.id;
  order.valueEur = valueEur;
  if (body.title !== undefined) {
    order.title = text(body.title) || order.title;
  }
  if (body.notes !== undefined) {
    order.notes = text(body.notes);
  }
  order.updatedAt = now;
  const line = store.purchaseOrderLines.find((item) => item.purchaseOrderId === order.id);
  if (line) {
    line.description = material;
    line.quantityKg = quantityKg;
  } else {
    store.purchaseOrderLines.push({ id: randomUUID(), purchaseOrderId: order.id, materialId: null, description: material, quantityKg });
  }
  audit(store, actor.id, "order-edited", "purchase-order", order.id, `${order.number} was edited.`, now);
  return { notice: `${order.number} was updated.` };
}

function addShipment(store: StoreData, actor: UserRecord, direction: "inbound" | "outbound", body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "register-shipment", "Only Staff or an assigned Worker can create a shipment.");
  if (blocked) return blocked;
  const reference = text(body.number);
  const po = text(body.po);
  const warehouseName = text(body.warehouse);
  const party = text(direction === "inbound" ? body.supplier : body.customer);
  const containerNumber = direction === "outbound" ? text(body.container) : "";
  if (!reference || !po || !warehouseName || !party || (direction === "outbound" && !containerNumber)) {
    return { error: direction === "inbound" ? "Container number, PO number, supplier, and warehouse are required." : "Shipment number, PO number, container number, client, and warehouse are required." };
  }
  if (actor.role === "worker" && !canOperateWarehouse(actor.role, warehouseOf(store, actor), warehouseName)) {
    return { error: "You can only create shipments at your assigned warehouse." };
  }
  if (shipmentByRef(store, direction, reference)) return { error: direction === "inbound" ? "That container number already exists." : "That shipment number already exists." };
  const warehouse = upsertWarehouse(store, warehouseName, "Not recorded", randomUUID);
  const company = upsertCompany(store, party, direction === "inbound" ? "supplier" : "customer", randomUUID);
  const order = ensureOrder(store, po, company.id, actor.id, now);
  const shipment: Shipment = {
    id: randomUUID(),
    reference,
    direction,
    purchaseOrderId: order.id,
    containerNumber,
    warehouseId: warehouse.id,
    originCountry: direction === "inbound" ? "" : warehouse.country,
    destinationCountry: direction === "inbound" ? warehouse.country : "",
    status: "Planned",
    carrierName: "",
    handedOverAt: null,
    annex7Required: false,
    sellerStatus: "Pending",
    sellerCompany: "",
    sellerConfirmedBy: "",
    sellerConfirmedAt: "",
    overrideReason: null,
    overrideBy: null,
    overrideAt: null,
  };
  store.shipments.push(shipment);
  store.demurrageRecords.push({
    id: randomUUID(),
    shipmentId: shipment.id,
    startedAt: null,
    freeMinutes: 120,
    ratePerMinute: 1,
    completedAt: null,
    elapsedMinutes: null,
    billableMinutes: null,
    chargeEur: null,
  });
  audit(store, actor.id, "shipment-created", "shipment", shipment.id, `${reference} was added as Planned.`, now);
  return { notice: `${reference} was added as Planned.` };
}

function saveMeta(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "edit-shipment", "This role cannot edit the shipment.");
  if (blocked) return blocked;
  if ((body.workerId !== undefined || body.assignedWorker !== undefined) && actor.role !== "owner") {
    return { error: "Staff cannot assign or change the responsible worker." };
  }
  const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
  const shipment = shipmentByRef(store, direction, text(body.number));
  if (!shipment) return { error: "That shipment does not exist." };
  if (actor.role === "worker") {
    const whName = store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "";
    if (!canOperateWarehouse(actor.role, warehouseOf(store, actor), whName)) {
      return { error: "You can only change shipments at your warehouse." };
    }
  }
  if (shipment.status === "Completed" || shipment.status === "Dispatched") return { error: "This shipment is already closed." };
  const containerNumber = text(body.container);
  if (duplicateEquipment(store, shipment.id, containerNumber)) return { error: "That equipment number is already used on another inbound shipment." };
  const po = text(body.po);
  const party = text(body.party);
  if (po) {
    const kind = direction === "inbound" ? "supplier" : "customer";
    const company = party ? upsertCompany(store, party, kind, randomUUID) : store.companies.find((item) => item.id === (orderByNumber(store, po)?.companyId ?? ""));
    const order = ensureOrder(store, po, company?.id ?? upsertCompany(store, party || "Unnamed", kind, randomUUID).id, actor.id, now);
    shipment.purchaseOrderId = order.id;
    if (party && company) order.companyId = company.id;
  }
  shipment.containerNumber = containerNumber;
  audit(store, actor.id, "shipment-edited", "shipment", shipment.id, `${shipment.reference} details were saved.`, now);
  return { notice: `${shipment.reference} was updated.` };
}

function saveMaterial(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "edit-shipment", "This role cannot add a material section.");
  if (blocked) return blocked;
  if (actor.role === "manager") {
    return { error: "Managers are read-only on request details. Send the request back to the worker with a note to have corrections made." };
  }
  const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
  const shipment = shipmentByRef(store, direction, text(body.shipment));
  if (!shipment) return { error: "That shipment does not exist." };
  const assigned = warehouseOf(store, actor);
  if (!canOperateWarehouse(actor.role, assigned, store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "")) {
    if (actor.role === "worker") return { error: "You can only change shipments at your warehouse." };
  }
  if (text(body.mode) === "count") return { error: "Count-only lines are not stored. Enter a gross weight so net weight is greater than zero." };
  const materialName = text(body.material);
  const packaging = store.packagingTypes.find((item) => item.id === text(body.packagingId) && item.active);
  if (!materialName) return { error: "Enter a material type." };
  if (!packaging) return { error: "Choose an active packaging type." };
  const grossKg = num(body.grossKg);
  const packageCount = num(body.packagingQty);
  const tarePerUnit = body.noTare === true ? 0 : num(body.tarePerUnitKg);
  if (!Number.isFinite(grossKg) || !Number.isInteger(packageCount) || packageCount <= 0 || !Number.isFinite(tarePerUnit) || tarePerUnit < 0) {
    return { error: "Gross weight, package count, and tare are required." };
  }
  const tareTotalKg = roundKg(tarePerUnit * packageCount);
  const line = {
    id: randomUUID(),
    requestId: "",
    materialId: "",
    packagingTypeId: packaging.id,
    packageCount,
    grossKg,
    tareTotalKg,
    netKg: netKg(grossKg, tareTotalKg),
  };
  const request = ensureRequest(store, shipment, actor.id, now);
  if (!request.ok) return { error: request.error };
  if (request.value.status === "approved" || request.value.status === "completed") {
    return { error: "Requests are never edited in place once approved or completed. To fix a mistake, delete the request and create a new one, or make a separate correcting entry." };
  }
  const material = store.materials.find((item) => item.description.toLowerCase() === materialName.toLowerCase()) ?? {
    id: randomUUID(),
    materialNumber: materialName,
    description: materialName,
    unit: "kg",
    lowStockThresholdKg: 0,
  };
  if (!store.materials.includes(material)) store.materials.push(material);
  line.requestId = request.value.id;
  line.materialId = material.id;
  const parsed = requestLineSchema.safeParse(line);
  if (!parsed.success) return { error: issues(parsed.error) };
  store.requestLines.push(parsed.data);
  audit(store, actor.id, "request-line-added", "request", request.value.id, `${request.value.number} gained ${parsed.data.netKg} kg net. Stock was not changed.`, now);
  return { notice: `${parsed.data.netKg} kg net was added to ${request.value.number}. Stock was not changed.` };
}

function deleteMaterial(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "edit-shipment", "This role cannot remove a material section.");
  if (blocked) return blocked;
  if (actor.role === "manager") {
    return { error: "Managers are read-only on request details. Send the request back to the worker with a note to have corrections made." };
  }
  const line = store.requestLines.find((item) => item.id === text(body.sectionId));
  if (!line) return { error: "That material section does not exist." };
  const request = store.requests.find((item) => item.id === line.requestId);
  if (!request) return { error: "That request does not exist." };
  if (actor.role === "worker") {
    const whName = store.warehouses.find((item) => item.id === request.warehouseId)?.name ?? "";
    if (!canOperateWarehouse(actor.role, warehouseOf(store, actor), whName)) {
      return { error: "You can only change shipments at your warehouse." };
    }
  }
  if (request.status === "approved" || request.status === "completed") {
    return { error: "Requests are never edited in place once approved or completed. To fix a mistake, delete the request and create a new one, or make a separate correcting entry." };
  }
  store.requestLines = store.requestLines.filter((item) => item.id !== line.id);
  audit(store, actor.id, "request-line-removed", "request", request.id, `A line was removed from ${request.number}.`, now);
  return { notice: `The line was removed from ${request.number}.` };
}

function advance(store: StoreData, actor: UserRecord, direction: "inbound" | "outbound", reference: string, now: string): CommandResult {
  const shipment = shipmentByRef(store, direction, reference);
  if (!shipment) return { error: "That shipment does not exist." };
  const warehouse = store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "";
  if (actor.role === "worker" && !canOperateWarehouse(actor.role, warehouseOf(store, actor), warehouse)) {
    return { error: `You can only work shipments at ${warehouseOf(store, actor) ?? "your warehouse"}.` };
  }
  if (direction === "inbound") return advanceInbound(store, actor, shipment, now);
  return advanceOutbound(store, actor, shipment, now);
}

function advanceInbound(store: StoreData, actor: UserRecord, shipment: Shipment, now: string): CommandResult {
  const next = shipment.status === "Planned" || shipment.status === "In transit" || shipment.status === "Arrived" ? "Registered" : shipment.status === "Registered" ? "Unloading" : shipment.status === "Unloading" ? "Completed" : null;
  if (!next) return { error: "This shipment cannot move to another status." };
  const blocked = deny(actor.role, next === "Registered" ? "register-shipment" : "unload", "This role cannot take that status step.");
  if (blocked) return blocked;
  shipment.status = next;
  if (next === "Unloading") {
    const demurrage = store.demurrageRecords.find((item) => item.shipmentId === shipment.id);
    if (demurrage && !demurrage.startedAt) demurrage.startedAt = now;
  }
  if (next === "Completed") finishDemurrage(store, shipment.id, now);
  const request = ensureRequest(store, shipment, actor.id, now);
  if (!request.ok) return { error: request.error };
  audit(store, actor.id, "shipment-status", "shipment", shipment.id, `${shipment.reference} is now ${next}.`, now);
  return { notice: `${shipment.reference} is now ${next}. ${request.value.number} is ${request.value.status}. Stock was not changed.` };
}

function advanceOutbound(store: StoreData, actor: UserRecord, shipment: Shipment, now: string): CommandResult {
  const blocked = deny(actor.role, "dispatch", "This role cannot change outbound status.");
  if (blocked) return blocked;
  const next = shipment.status === "Planned" ? "Loading" : shipment.status === "Loading" ? "Loaded" : shipment.status === "Loaded" ? "Dispatched" : null;
  if (!next) return { error: "This shipment cannot move to another status." };
  if (next === "Dispatched") {
    if (!shipment.purchaseOrderId || !shipment.containerNumber.trim()) return { error: "PO number, container number, client, and warehouse are required before dispatch." };
    if (!shipment.overrideReason && !shipment.carrierName.trim()) {
      return { error: "Enter a carrier name before dispatch." };
    }
  }
  shipment.status = next;
  const request = ensureRequest(store, shipment, actor.id, now);
  if (!request.ok) return { error: request.error };
  audit(store, actor.id, "shipment-status", "shipment", shipment.id, `${shipment.reference} is now ${next}.`, now);
  return { notice: `${shipment.reference} is now ${next}. ${request.value.number} is ${request.value.status}. Stock was not changed.` };
}

function finishDemurrage(store: StoreData, shipmentId: string, now: string) {
  const demurrage = store.demurrageRecords.find((item) => item.shipmentId === shipmentId);
  if (!demurrage || demurrage.completedAt) return;
  demurrage.completedAt = now;
  if (!demurrage.startedAt) {
    demurrage.elapsedMinutes = 0;
    demurrage.billableMinutes = 0;
    demurrage.chargeEur = 0;
    return;
  }
  const elapsed = Math.max(0, Math.floor((Date.parse(now) - Date.parse(demurrage.startedAt)) / 60000));
  demurrage.elapsedMinutes = elapsed;
  demurrage.billableMinutes = Math.max(0, elapsed - demurrage.freeMinutes);
  demurrage.chargeEur = demurrage.billableMinutes * demurrage.ratePerMinute;
}

function saveCustoms(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "edit-customs", "This role cannot edit outbound customs information.");
  if (blocked) return blocked;
  const shipment = shipmentByRef(store, "outbound", text(body.number));
  if (!shipment) return { error: "That shipment does not exist." };
  if (shipment.status === "Dispatched") return { error: "Customs information stays as recorded once the shipment is dispatched." };
  const reference = text(body.reference);
  const procedureNote = text(body.procedureNote);
  const goodsDescription = text(body.goodsDescription);
  const declarantReference = text(body.declarantReference);
  if (!reference || !procedureNote || !goodsDescription) return { error: "Customs reference, procedure note, and goods description are required." };
  const existing = store.customsRecords.find((item) => item.shipmentId === shipment.id);
  if (existing) {
    existing.reference = reference;
    existing.procedureNote = procedureNote;
    existing.goodsDescription = goodsDescription;
    existing.declarantReference = declarantReference;
  } else {
    store.customsRecords.push({
      id: randomUUID(),
      shipmentId: shipment.id,
      reference,
      procedureNote,
      goodsDescription,
      declarantReference,
      confirmedBy: null,
      confirmedAt: null,
      proofDocumentId: null,
    });
  }
  audit(store, actor.id, "customs-saved", "shipment", shipment.id, `Customs reference ${reference} was saved.`, now);
  return { notice: `Customs information for ${shipment.reference} was saved.` };
}

function confirmSeller(store: StoreData, actor: UserRecord, reference: string, now: string): CommandResult {
  const blocked = deny(actor.role, "confirm-seller", "Only Admin or Staff can record seller confirmation.");
  if (blocked) return blocked;
  const shipment = shipmentByRef(store, "outbound", reference);
  if (!shipment) return { error: "That shipment does not exist." };
  const order = shipment.purchaseOrderId ? store.purchaseOrders.find((item) => item.id === shipment.purchaseOrderId) : undefined;
  const company = actor.companyId
    ? store.companies.find((item) => item.id === actor.companyId)
    : order
      ? store.companies.find((item) => item.id === order.companyId)
      : undefined;
  if (!company || !order || order.companyId !== company.id) return { error: "You cannot confirm a shipment for another company." };
  if (shipment.status === "Dispatched") return { error: "This shipment is already dispatched." };
  if (shipment.sellerStatus === "Confirmed") return { notice: `${shipment.reference} is already confirmed by ${shipment.sellerConfirmedBy}.` };
  shipment.sellerStatus = "Confirmed";
  shipment.sellerCompany = company.name;
  shipment.sellerConfirmedBy = actor.name;
  shipment.sellerConfirmedAt = now;
  audit(store, actor.id, "seller-confirmed", "shipment", shipment.id, `${actor.name} confirmed this shipment for ${company.name}.`, now);
  return { notice: `${shipment.reference} is confirmed for ${company.name}.` };
}

function confirmCustoms(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "confirm-customs", "This role cannot record customs confirmation.");
  if (blocked) return blocked;
  const shipment = shipmentByRef(store, "outbound", text(body.number));
  if (!shipment) return { error: "That shipment does not exist." };
  const fileId = text(body.fileId);
  let documentId: string;
  if (fileId) {
    const existing = store.documents.find((d) => d.id === fileId);
    if (!existing) return { error: "Uploaded proof document not found." };
    documentId = existing.id;
    existing.shipmentId = shipment.id;
    existing.purchaseOrderId = shipment.purchaseOrderId;
  } else {
    const bytes = text(body.bytesBase64);
    const name = text(body.name);
    if (!bytes || !name) return { error: "Choose a proof file before recording customs confirmation." };
    const buffer = Buffer.from(bytes, "base64");
    const detected = detectFileType(buffer);
    if (!detected.valid) return { error: detected.error || "Invalid file content." };

    documentId = randomUUID();
    const ext = detected.ext;
    const storageKey = computeStorageKey("customs_proof", shipment.reference, Date.parse(now) || Date.now(), documentId, ext);
    const existingCount = store.documents.filter((d) => d.kind === "customs_proof" && d.shipmentId === shipment.id).length;
    const readableName = computeReadableName(shipment.reference, "customs_proof", existingCount + 1, ext);

    putBlob(store, readableName, detected.mime, bytes, storageKey);
    const poNumber = store.purchaseOrders.find((p) => p.id === shipment.purchaseOrderId)?.number ?? null;
    const warehouse = store.warehouses.find((w) => w.id === shipment.warehouseId)?.name ?? null;

    store.documents.push({
      id: documentId,
      kind: "customs_proof",
      category: "Customs",
      shipmentId: shipment.id,
      purchaseOrderId: shipment.purchaseOrderId,
      requestId: null,
      requestNumber: null,
      poNumber,
      containerNumber: shipment.containerNumber || null,
      warehouse,
      notes: null,
      originalFilename: name,
      readableName,
      status: "active",
      name: readableName,
      mime: detected.mime,
      byteSize: buffer.length,
      storageKey,
      cmrReference: null,
      cmrCarrier: null,
      cmrGoodsDescription: null,
      cmrRemarks: null,
      cmrEnteredBy: null,
      cmrEnteredAt: null,
      createdBy: actor.id,
      createdAt: now,
    });
    audit(store, actor.id, "file-uploaded", "document", documentId, `${readableName} was uploaded for customs confirmation of ${shipment.reference}.`, now);
  }
  const customs = store.customsRecords.find((item) => item.shipmentId === shipment.id) ?? {
    id: randomUUID(),
    shipmentId: shipment.id,
    reference: "",
    procedureNote: "",
    goodsDescription: "",
    declarantReference: "",
    confirmedBy: null,
    confirmedAt: null,
    proofDocumentId: null,
  };
  if (!store.customsRecords.includes(customs)) store.customsRecords.push(customs);
  customs.confirmedBy = actor.id;
  customs.confirmedAt = now;
  customs.proofDocumentId = documentId;
  audit(store, actor.id, "customs-confirmed", "shipment", shipment.id, `${actor.name} recorded customs confirmation.`, now);
  return { notice: `Customs confirmation for ${shipment.reference} was recorded.` };
}

function saveCarrier(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const shipment = shipmentByRef(store, "outbound", text(body.number));
  if (!shipment) return { error: "That shipment does not exist." };
  const blocked = deny(actor.role, canPerform(actor.role, "dispatch") ? "dispatch" : "register-shipment", "This role cannot record the carrier.");
  if (blocked) return blocked;
  if (actor.role === "worker") {
    const whName = store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "";
    if (!canOperateWarehouse(actor.role, warehouseOf(store, actor), whName)) {
      return { error: "You can only change shipments at your warehouse." };
    }
  }
  shipment.carrierName = text(body.carrier);
  shipment.handedOverAt = text(body.handover) || null;
  audit(store, actor.id, "carrier-saved", "shipment", shipment.id, `Carrier ${shipment.carrierName || "cleared"} was saved.`, now);
  return { notice: `Carrier details for ${shipment.reference} were saved.` };
}

function saveCmr(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "save-cmr", "This role cannot save CMR details.");
  if (blocked) return blocked;
  const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
  const shipment = shipmentByRef(store, direction, text(body.shipment));
  if (!shipment) return { error: "That shipment does not exist." };
  if (actor.role === "worker") {
    const whName = store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "";
    if (!canOperateWarehouse(actor.role, warehouseOf(store, actor), whName)) {
      return { error: "You can only change shipments at your warehouse." };
    }
  }
  const document = store.documents.find((item) => item.shipmentId === shipment.id && item.kind === "cmr");
  if (!document) return { error: "Attach the CMR file before entering details." };
  const reference = text(body.reference);
  const goods = text(body.goodsDescription);
  if (!reference || !goods) return { error: "CMR reference and goods description are required." };
  document.cmrReference = reference;
  document.cmrCarrier = text(body.carrier);
  document.cmrGoodsDescription = goods;
  document.cmrRemarks = text(body.remarks);
  document.cmrEnteredBy = actor.name;
  document.cmrEnteredAt = now;
  audit(store, actor.id, "cmr-saved", "document", document.id, `CMR ${reference} was saved for ${shipment.reference}.`, now);
  return { notice: `CMR details for ${shipment.reference} were saved.` };
}

function overrideDispatch(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "override-dispatch", "Only the owner can authorize a dispatch override.");
  if (blocked) return blocked;
  const reason = text(body.reason);
  if (!reason) return { error: "Enter an override reason. A blank reason is not accepted." };
  const shipment = shipmentByRef(store, "outbound", text(body.number));
  if (!shipment) return { error: "That shipment does not exist." };
  if (shipment.status !== "Loaded") return { error: "Only a Loaded shipment can be dispatched, including under an override." };
  if (!shipment.carrierName.trim() || !shipment.containerNumber.trim() || !shipment.purchaseOrderId) {
    return { error: "Carrier, PO number, and container number are required. An override does not skip them." };
  }
  shipment.overrideReason = reason;
  shipment.overrideBy = actor.name;
  shipment.overrideAt = now;
  shipment.status = "Dispatched";
  const request = ensureRequest(store, shipment, actor.id, now);
  if (!request.ok) return { error: request.error };
  audit(store, actor.id, "dispatch-override", "shipment", shipment.id, `Owner override: ${reason}`, now);
  return { notice: `${shipment.reference} is dispatched under an owner override. Stock was not changed.` };
}

function setThreshold(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "set-threshold", "Only the owner can change a low-stock threshold.");
  if (blocked) return blocked;
  const minimum = num(body.minimum);
  if (!Number.isFinite(minimum) || minimum < 0) return { error: "The low-stock threshold must be zero or greater, in kilograms." };
  const balance = store.stockBalances.find((item) => item.id === text(body.id));
  const material = balance ? store.materials.find((item) => item.id === balance.materialId) : store.materials.find((item) => item.id === text(body.id));
  if (!material) return { error: "That material does not exist." };
  material.lowStockThresholdKg = minimum;
  audit(store, actor.id, "threshold-set", "material", material.id, `${material.description} is flagged at or below ${minimum} kg.`, now);
  return { notice: `${material.description} is now flagged at or below ${minimum} kg. Quantity and weight were not changed.` };
}

function addPackaging(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "manage-packaging", "Only the owner can add a packaging type.");
  if (blocked) return blocked;
  const name = text(body.label);
  const tare = body.tareKg == null ? 0 : num(body.tareKg);
  if (!name || !Number.isFinite(tare) || tare < 0) return { error: "Name and tare, in kilograms, are required." };
  if (store.packagingTypes.some((item) => same(item.name, name))) return { error: "That packaging type already exists." };
  store.packagingTypes.push({ id: randomUUID(), name, tareKg: tare, active: true });
  audit(store, actor.id, "packaging-added", "packaging", name, `${name} was added.`, now);
  return { notice: `${name} was added.` };
}

function transfer(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "create-transfer", "This role cannot transfer stock.");
  if (blocked) return blocked;
  const from = text(body.from);
  const to = text(body.to);
  const material = text(body.material);
  const quantity = num(body.quantity);
  const clientKey = text(body.clientKey);
  if (!from || !to || !material || !Number.isFinite(quantity) || quantity <= 0) return { error: "From, to, material, and quantity are required." };
  if (same(from, to)) return { error: "Choose two different warehouses." };
  if (
    clientKey &&
    store.auditLog.some((item) => (item.action === "transfer-requested" || item.action === "stock-transferred") && item.oldValue === clientKey)
  ) {
    return { notice: "That transfer was already submitted." };
  }
  const fromWh = store.warehouses.find((w) => w.id === from || same(w.name, from));
  const toWh = store.warehouses.find((w) => w.id === to || same(w.name, to));
  const mat = store.materials.find((m) => m.id === material || same(m.description, material) || same(m.materialNumber, material));
  if (fromWh && toWh && mat) {
    const hasBalance = store.stockBalances.some((b) => b.warehouseId === fromWh.id && b.materialId === mat.id && b.weightKg > 0);
    if (hasBalance) {
      const moved = transferStock(
        store,
        {
          fromWarehouseId: fromWh.id,
          toWarehouseId: toWh.id,
          materialId: mat.id,
          weightKg: quantity,
          actor,
          clientKey: clientKey || undefined,
        },
        now,
      );
      if (!moved.ok) return { error: moved.error };
      const id = moved.value.outMovement.requestId;
      audit(
        store,
        actor.id,
        "transfer-requested",
        "transfer",
        id,
        JSON.stringify({ id, clientKey, from: fromWh.name, to: toWh.name, material: mat.description, quantity, weightKg: quantity, status: "Completed" }),
        now,
        clientKey || null,
      );
      return { notice: `Transferred ${quantity} kg of ${mat.description} from ${fromWh.name} to ${toWh.name}.` };
    }
  }
  const id = randomUUID();
  audit(
    store,
    actor.id,
    "transfer-requested",
    "transfer",
    id,
    JSON.stringify({ id, clientKey, from, to, material, quantity, weightKg: quantity }),
    now,
    clientKey,
  );
  return { notice: "The transfer was submitted. Stock was not changed." };
}

function sendChat(store: StoreData, actor: UserRecord, name: string, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "send-chat", "This role cannot send that message.");
  if (blocked) return blocked;
  const message = text(body.text);
  if (!message) return { error: "Enter a message before sending." };
  const conversationId = text(body.conversationId);
  const [scopePart, ...poRest] = conversationId.split(":");
  let scope: "seller" | "internal" | "purchase-order" = name === "messageSeller" ? "seller" : "purchase-order";
  if (scopePart === "seller" || scopePart === "internal" || scopePart === "purchase-order") scope = scopePart;
  if (scope === "seller" && actor.role !== "owner" && actor.role !== "manager") return { error: "Only the owner or a manager can write to the supplier." };
  const poNumber = text(body.po || body.number) || poRest.join(":");
  const order = poNumber ? orderByNumber(store, poNumber) : undefined;
  if ((scope === "purchase-order" || scope === "seller") && !order) return { error: "That purchase order does not exist." };
  if (scope === "purchase-order" && actor.role === "customer" && order && order.companyId !== actor.companyId) {
    return { error: "You can only write on purchase orders for your company." };
  }
  store.poMessages.push({
    id: randomUUID(),
    purchaseOrderId: order?.id ?? null,
    scope,
    authorId: actor.id,
    body: message,
    createdAt: now,
  });
  audit(store, actor.id, "message-sent", "purchase-order", order?.id ?? actor.id, message, now);
  return { notice: "The message was saved." };
}

function addUser(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "manage-users", "Only the owner can add a user.");
  if (blocked) return blocked;
  const role = normalizeRole(text(body.role));
  if (!role) return { error: "Choose Admin (owner), Staff (manager), or Worker (worker)." };
  const email = text(body.email);
  const name = text(body.name);
  if (!email || !name) return { error: "Name and email are required." };
  if (store.users.some((item) => same(item.email, email))) return { error: "That email is already in use." };
  const warehouse = role === "worker" ? upsertWarehouse(store, text(body.warehouse) || "Unassigned", "Not recorded", randomUUID) : null;
  if (role === "worker" && !text(body.warehouse)) return { error: "A worker must be assigned to one warehouse." };
  const temporaryPassword = randomBytes(9).toString("base64url");
  const parsed = userRecordSchema.safeParse({
    id: randomUUID(),
    email,
    name,
    role,
    warehouseId: warehouse?.id ?? null,
    companyId: null,
    active: true,
    passwordHash: hashPassword(text(body.password) || temporaryPassword),
    createdAt: now,
    updatedAt: now,
  });
  if (!parsed.success) return { error: issues(parsed.error) };
  store.users.push(parsed.data);
  audit(store, actor.id, "user-created", "user", parsed.data.id, `${name} was added as ${role}.`, now);
  return { notice: `${name} was added. Temporary password: ${text(body.password) || temporaryPassword}` };
}

function changeRole(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "manage-users", "Only the owner can change a role.");
  if (blocked) return blocked;
  const role = normalizeRole(text(body.role));
  if (!role) return { error: "Choose Admin (owner), Staff (manager), or Worker (worker)." };
  const user = store.users.find((item) => same(item.email, text(body.email)));
  if (!user) return { error: "That user does not exist." };
  if (user.role === "owner" && role !== "owner" && store.users.filter((item) => item.role === "owner" && item.active).length < 2) {
    return { error: "The last active owner cannot change role." };
  }
  if (role === "worker" && !text(body.warehouse)) return { error: "A worker must be assigned to one warehouse." };
  const warehouse = role === "worker" ? upsertWarehouse(store, text(body.warehouse), "Not recorded", randomUUID) : null;
  user.role = role;
  user.warehouseId = warehouse?.id ?? null;
  user.companyId = null;
  user.updatedAt = now;
  const parsed = userRecordSchema.safeParse(user);
  if (!parsed.success) return { error: issues(parsed.error) };
  audit(store, actor.id, "role-changed", "user", user.id, `${user.email} is now ${role}.`, now);
  return { notice: `${user.name} is now ${role}.` };
}

function attachOne(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "add-document", "This role cannot attach a file.");
  if (blocked) return blocked;
  const rate = checkUploadRateLimit(actor.id);
  if (!rate.allowed) return { error: `Upload rate limit exceeded. Please wait ${rate.retryAfterSeconds} seconds before uploading again.` };
  const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
  const shipment = shipmentByRef(store, direction, text(body.shipment));
  if (!shipment) return { error: "That shipment does not exist." };
  const warehouse = store.warehouses.find((w) => w.id === shipment.warehouseId)?.name ?? null;
  if (!can(actor, "file:upload", { warehouseId: warehouse, createdBy: actor.id })) {
    return { error: "You do not have permission to upload files for this warehouse." };
  }
  const bytes = text(body.bytesBase64);
  const name = text(body.name);
  if (!bytes || !name) return { error: "Choose a non-empty file before attaching it." };
  const buffer = Buffer.from(bytes, "base64");
  const detected = detectFileType(buffer);
  if (!detected.valid) return { error: detected.error || "Invalid file content." };

  const role = text(body.role) === "photo" ? "photo" : "cmr";
  if (role === "cmr" && store.documents.some((item) => item.shipmentId === shipment.id && item.kind === "cmr")) {
    return { error: "This shipment already has a CMR. Remove it before attaching another." };
  }

  const documentId = randomUUID();
  const ext = detected.ext;
  const targetRef = shipment.reference;
  const timestamp = Date.parse(now) || Date.now();
  const storageKey = computeStorageKey(role, targetRef, timestamp, documentId, ext);
  const existingCount = store.documents.filter((d) => d.kind === role && d.shipmentId === shipment.id).length;
  const readableName = computeReadableName(targetRef, role, existingCount + 1, ext);

  putBlob(store, readableName, detected.mime, bytes, storageKey);
  const poNumber = store.purchaseOrders.find((p) => p.id === shipment.purchaseOrderId)?.number ?? null;

  let requestId: string | null = null;
  let requestNumber: string | null = null;

  if (role === "photo") {
    const request = ensureRequest(store, shipment, actor.id, now);
    if (request.ok) {
      requestId = request.value.id;
      requestNumber = request.value.number;
      store.requestPhotos.push({ id: randomUUID(), requestId: request.value.id, documentId });
    }
  }

  store.documents.push({
    id: documentId,
    kind: role,
    category: role === "cmr" ? "Transport" : "Container",
    shipmentId: shipment.id,
    purchaseOrderId: shipment.purchaseOrderId,
    requestId,
    requestNumber,
    poNumber,
    containerNumber: shipment.containerNumber || null,
    warehouse,
    notes: text(body.notes) || null,
    originalFilename: name,
    readableName,
    status: "active",
    name: readableName,
    mime: detected.mime,
    byteSize: buffer.length,
    storageKey,
    cmrReference: null,
    cmrCarrier: null,
    cmrGoodsDescription: null,
    cmrRemarks: null,
    cmrEnteredBy: null,
    cmrEnteredAt: null,
    createdBy: actor.id,
    createdAt: now,
  });

  audit(store, actor.id, "file-uploaded", "document", documentId, `${readableName} was attached to ${shipment.reference}.`, now);
  return { notice: `${readableName} was stored for ${shipment.reference}.` };
}

function attachMany(store: StoreData, actor: UserRecord, payload: unknown, now: string): CommandResult {
  const drafts = Array.isArray(payload) ? payload : record(payload).drafts;
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Choose a non-empty file before attaching it." };
  let notice = "Files were stored.";
  for (const draft of drafts) {
    const result = attachOne(store, actor, record(draft), now);
    if (result.error) return result;
    notice = result.notice ?? notice;
  }
  return { notice };
}

function detachFile(store: StoreData, actor: UserRecord, id: string, now: string): CommandResult {
  const blocked = deny(actor.role, "add-document", "This role cannot remove a file.");
  if (blocked) return blocked;
  const document = store.documents.find((item) => item.id === id);
  if (!document) return { error: "That file does not exist." };
  if (!can(actor, "file:delete", { warehouseId: document.warehouse, createdBy: document.createdBy })) {
    return { error: "You do not have permission to delete this file." };
  }
  store.documents = store.documents.filter((item) => item.id !== id);
  store.blobs = store.blobs.filter((item) => item.key !== document.storageKey);
  store.requestPhotos = store.requestPhotos.filter((item) => item.documentId !== id);
  audit(store, actor.id, "file-deleted", "document", id, `${document.readableName || document.name} was deleted.`, now);
  return { notice: `${document.readableName || document.name} was removed.` };
}

function selectDocument(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "add-document", "This role cannot add a document.");
  if (blocked) return blocked;
  const name = text(body.name);
  const bytes = text(body.bytesBase64);
  if (!name || !bytes) return { error: "Choose a file. Nothing is added until it is stored." };
  const buffer = Buffer.from(bytes, "base64");
  const detected = detectFileType(buffer);
  if (!detected.valid) return { error: detected.error || "Invalid file content." };
  const category = text(body.category);
  const allowed = ["Purchase", "Container", "Customs", "Transport", "Annex 7"];
  if (!allowed.includes(category)) return { error: "Choose a document category." };

  const documentId = randomUUID();
  const ext = detected.ext;
  const kind = category === "Customs" ? "customs_proof" : "other";
  const storageKey = computeStorageKey(kind, "DOC", Date.parse(now) || Date.now(), documentId, ext);
  const existingCount = store.documents.filter((d) => d.kind === kind).length;
  const readableName = computeReadableName("DOC", kind, existingCount + 1, ext);

  putBlob(store, readableName, detected.mime, bytes, storageKey);
  store.documents.push({
    id: documentId,
    kind,
    category: category as "Purchase",
    shipmentId: null,
    purchaseOrderId: null,
    requestId: null,
    requestNumber: null,
    poNumber: null,
    containerNumber: null,
    warehouse: warehouseOf(store, actor),
    notes: text(body.notes) || null,
    originalFilename: name,
    readableName,
    status: "active",
    name: readableName,
    mime: detected.mime,
    byteSize: buffer.length,
    storageKey,
    cmrReference: null,
    cmrCarrier: null,
    cmrGoodsDescription: null,
    cmrRemarks: null,
    cmrEnteredBy: null,
    cmrEnteredAt: null,
    createdBy: actor.id,
    createdAt: now,
  });
  audit(store, actor.id, "file-uploaded", "document", documentId, `${readableName} was stored.`, now);
  return { notice: `${readableName} was stored.` };
}

function addAnnex(store: StoreData, actor: UserRecord, body: Record<string, unknown>, now: string): CommandResult {
  const blocked = deny(actor.role, "add-annex", "This role cannot add an Annex 7 file.");
  if (blocked) return blocked;
  const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
  const shipment = shipmentByRef(store, direction, text(body.shipment));
  if (!shipment) return { error: "Choose the shipment this file belongs to." };
  if (actor.role === "worker") {
    const whName = store.warehouses.find((item) => item.id === shipment.warehouseId)?.name ?? "";
    if (!canOperateWarehouse(actor.role, warehouseOf(store, actor), whName)) {
      return { error: "You can only change shipments at your warehouse." };
    }
  }
  const reference = text(body.reference);
  if (!reference) return { error: "Reference and a file are required." };

  const fileId = text(body.fileId);
  let documentId: string;
  if (fileId) {
    const existing = store.documents.find((d) => d.id === fileId);
    if (!existing) return { error: "Uploaded Annex 7 document not found." };
    documentId = existing.id;
    existing.shipmentId = shipment.id;
    existing.purchaseOrderId = shipment.purchaseOrderId;
  } else {
    const bytes = text(body.bytesBase64);
    const name = text(body.name);
    if (!bytes || !name) return { error: "Reference and a file are required." };
    const buffer = Buffer.from(bytes, "base64");
    const detected = detectFileType(buffer);
    if (!detected.valid) return { error: detected.error || "Invalid file content." };

    documentId = randomUUID();
    const ext = detected.ext;
    const storageKey = computeStorageKey("annex7", shipment.reference, Date.parse(now) || Date.now(), documentId, ext);
    const existingCount = store.documents.filter((d) => d.kind === "annex7" && d.shipmentId === shipment.id).length;
    const readableName = computeReadableName(shipment.reference, "annex7", existingCount + 1, ext);

    putBlob(store, readableName, detected.mime, bytes, storageKey);
    const poNumber = store.purchaseOrders.find((p) => p.id === shipment.purchaseOrderId)?.number ?? null;
    const warehouse = store.warehouses.find((w) => w.id === shipment.warehouseId)?.name ?? null;

    store.documents.push({
      id: documentId,
      kind: "annex7",
      category: "Annex 7",
      shipmentId: shipment.id,
      purchaseOrderId: shipment.purchaseOrderId,
      requestId: null,
      requestNumber: null,
      poNumber,
      containerNumber: shipment.containerNumber || null,
      warehouse,
      notes: text(body.notes) || null,
      originalFilename: name,
      readableName,
      status: "active",
      name: readableName,
      mime: detected.mime,
      byteSize: buffer.length,
      storageKey,
      cmrReference: null,
      cmrCarrier: null,
      cmrGoodsDescription: null,
      cmrRemarks: null,
      cmrEnteredBy: null,
      cmrEnteredAt: null,
      createdBy: actor.id,
      createdAt: now,
    });
    audit(store, actor.id, "file-uploaded", "document", documentId, `${readableName} was uploaded for Annex 7 of ${shipment.reference}.`, now);
  }
  store.annex7Records.push({
    id: randomUUID(),
    shipmentId: shipment.id,
    documentId,
    reference,
    status: "uploaded",
    notes: text(body.notes),
    uploadedBy: actor.id,
    uploadedAt: now,
  });
  shipment.annex7Required = true;
  audit(store, actor.id, "annex7-uploaded", "shipment", shipment.id, `${reference} was uploaded. It is not approved.`, now);
  return { notice: `${reference} was uploaded and is waiting for review.` };
}

function setAnnex(store: StoreData, actor: UserRecord, id: string, status: "under_review" | "approved", now: string): CommandResult {
  const blocked = deny(actor.role, status === "approved" ? "approve-annex" : "review-annex", status === "approved" ? "Only the owner can approve an Annex 7 file." : "This role cannot review an Annex 7 file.");
  if (blocked) return blocked;
  const annex = store.annex7Records.find((item) => item.documentId === id || item.id === id);
  if (!annex) return { error: "That Annex 7 record does not exist." };
  annex.status = status;
  audit(store, actor.id, status === "approved" ? "annex7-approved" : "annex7-reviewed", "document", annex.documentId, `${annex.reference} is ${status}.`, now);
  return { notice: `${annex.reference} is ${status === "approved" ? "approved" : "under review"}.` };
}

function resetOperational(store: StoreData, actor: UserRecord, now: string): CommandResult {
  if (actor.role !== "owner") return { error: "Only the owner can clear operational records." };
  store.sessions = store.sessions.filter((item) => item.userId === actor.id);
  store.purchaseOrders = [];
  store.purchaseOrderLines = [];
  store.shipments = [];
  store.requests = [];
  store.requestLines = [];
  store.requestPhotos = [];
  store.documents = [];
  store.blobs = [];
  store.stockBalances = [];
  store.stockMovements = [];
  store.customsRecords = [];
  store.demurrageRecords = [];
  store.annex7Records = [];
  store.poMessages = [];
  store.auditLog = [];
  store.requestSequence = [];
  store.users = store.users.filter((item) => item.role === "owner" || item.id === actor.id);
  audit(store, actor.id, "operational-reset", "user", actor.id, "Operational records were cleared. Reference data and the owner account remain.", now);
  return { notice: "Operational records were cleared. Reference data and the owner account remain." };
}

export function sessionProfile(store: StoreData, sessionId: string, now: string): UserProfile | null {
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) return null;
  if (session.expiresAt <= now) {
    store.sessions = store.sessions.filter((item) => item.id !== sessionId);
    return null;
  }
  const user = store.users.find((item) => item.id === session.userId && item.active);
  if (!user || !isActiveRole(user.role)) return null;
  return profile(user);
}

export function signInUser(store: StoreData, email: string, password: string, now: string): Result<{ sessionId: string; profile: UserProfile }> {
  const user = store.users.find((item) => same(item.email, email));
  if (!user || !verifyPassword(password, user.passwordHash)) return fail("Those credentials were not recognized.");
  if (!user.active) return fail("This account is inactive.");
  if (!isActiveRole(user.role)) return fail("This account role is no longer active.");
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.parse(now) + 12 * 60 * 60 * 1000).toISOString();
  store.sessions.push({ id: sessionId, userId: user.id, expiresAt });
  return ok({ sessionId, profile: profile(user) });
}

export function signOutUser(store: StoreData, sessionId: string) {
  store.sessions = store.sessions.filter((item) => item.id !== sessionId);
}

export function deactivateByEmail(store: StoreData, actor: UserRecord, email: string, now: string): Result<UserProfile> {
  if (actor.role !== "owner") return fail("Only the owner can deactivate a user.");
  const user = store.users.find((item) => same(item.email, email));
  if (!user) return fail("That user does not exist.");
  if (user.role === "owner" && store.users.filter((item) => item.role === "owner" && item.active).length < 2) {
    return fail("The last active owner cannot be deactivated.");
  }
  user.active = false;
  user.updatedAt = now;
  store.sessions = store.sessions.filter((item) => item.userId !== user.id);
  audit(store, actor.id, "user-deactivated", "user", user.id, `${user.email} was deactivated.`, now);
  return ok(profile(user));
}

export function markNotificationRead(store: StoreData, actor: UserRecord, notificationId: string, now: string): Result<boolean> {
  if (!store.notifications) store.notifications = [];
  const target = store.notifications.find((n) => n.id === notificationId && n.recipientId === actor.id);
  if (!target) return fail("Notification not found.");
  target.read = true;
  target.readAt = now;
  return ok(true);
}

export function markAllNotificationsRead(store: StoreData, actor: UserRecord, now: string): Result<number> {
  if (!store.notifications) store.notifications = [];
  let count = 0;
  for (const n of store.notifications) {
    if (n.recipientId === actor.id && !n.read) {
      n.read = true;
      n.readAt = now;
      count++;
    }
  }
  return ok(count);
}
