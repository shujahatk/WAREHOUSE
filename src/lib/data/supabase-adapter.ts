import { randomUUID } from "node:crypto";
import {
  categoryForKind,
  checkInventoryConsistency,
  computeReadableName,
  computeStorageKey,
  extensionForMime,
} from "../../domain/commands.ts";
import { projectStore } from "../../domain/project.ts";
import { fail, ok, type Result } from "../../domain/result.ts";
import {
  emptyStore,
  roundKg,
  type Annex7Record,
  type AuditLogEntry,
  type Company,
  type CustomsRecord,
  type DemurrageRecord,
  type DocumentRecord,
  type DomainRole,
  type Material,
  type PackagingType,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type RequestLine,
  type RequestPhoto,
  type RequestRecord,
  type Shipment,
  type StockBalance,
  type StockMovement,
  type StoreData,
  type UserProfile,
  type UserRecord,
  type Warehouse,
  type GeneralRequestCategory,
  type GeneralRequestPriority,
  type GeneralRequestStatus,
  type WorkerGeneralRequest,
  type WorkerGeneralRequestAttachment,
} from "../../domain/schemas.ts";
import { emptyWorkspace, type Actor, type WorkspaceState } from "../../domain/view.ts";
import { isActiveRole } from "../permissions.ts";
import { MAX_FILE_SIZE_BYTES, detectFileType } from "../security/file-validation.ts";
import { createSupabaseRestClient, type FetchLike, type SupabaseRestClient } from "../supabase/client.ts";
import type { ConfirmUploadInput, Services, SignedUrl, UploadTarget, UploadTargetMetadata } from "./interfaces.ts";
import type { WorkspaceResponse } from "./local-adapter.ts";
import { can, type Action, type Resource } from "./permissions.ts";

// ----------------------------------------------------------------------------
// Row Mappers (PostgreSQL snake_case -> StockFlow camelCase Domain Records)
// ----------------------------------------------------------------------------

function mapWarehouse(row: Record<string, unknown>): Warehouse {
  return {
    id: String(row.id),
    name: String(row.name),
    country: String(row.country),
    active: Boolean(row.active ?? true),
  };
}

function mapCompany(row: Record<string, unknown>): Company {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind === "customer" ? "customer" : "supplier",
    active: Boolean(row.active ?? true),
  };
}

function mapUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: (row.role as DomainRole) ?? "worker",
    warehouseId: typeof row.warehouse_id === "string" ? row.warehouse_id : null,
    companyId: typeof row.company_id === "string" ? row.company_id : null,
    active: Boolean(row.active ?? true),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapUserRecord(row: Record<string, unknown>): UserRecord {
  return {
    ...mapUserProfile(row),
    passwordHash: "supabase-auth-managed",
  };
}

function mapMaterial(row: Record<string, unknown>): Material {
  return {
    id: String(row.id),
    materialNumber: String(row.material_number),
    description: String(row.description),
    unit: String(row.unit ?? "kg"),
    lowStockThresholdKg: Number(row.low_stock_threshold_kg ?? 0),
  };
}

function mapPackagingType(row: Record<string, unknown>): PackagingType {
  return {
    id: String(row.id),
    name: String(row.name),
    tareKg: Number(row.tare_kg ?? 0),
    active: Boolean(row.active ?? true),
  };
}

function mapPurchaseOrder(row: Record<string, unknown>): PurchaseOrder {
  return {
    id: String(row.id),
    number: String(row.number),
    companyId: String(row.company_id),
    status: (row.status as PurchaseOrder["status"]) ?? "submitted",
    valueEur: Number(row.value_eur ?? 0),
    notes: String(row.notes ?? ""),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapPurchaseOrderLine(row: Record<string, unknown>): PurchaseOrderLine {
  return {
    id: String(row.id),
    purchaseOrderId: String(row.purchase_order_id),
    materialId: typeof row.material_id === "string" ? row.material_id : null,
    description: String(row.description ?? ""),
    quantityKg: Number(row.quantity_kg ?? 0),
  };
}

function mapShipment(row: Record<string, unknown>): Shipment {
  return {
    id: String(row.id),
    reference: String(row.reference),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    purchaseOrderId: typeof row.purchase_order_id === "string" ? row.purchase_order_id : null,
    containerNumber: String(row.container_number ?? ""),
    warehouseId: String(row.warehouse_id),
    originCountry: String(row.origin_country ?? ""),
    destinationCountry: String(row.destination_country ?? ""),
    status: (row.status as Shipment["status"]) ?? "Registered",
    carrierName: String(row.carrier_name ?? ""),
    handedOverAt: typeof row.handed_over_at === "string" ? row.handed_over_at : null,
    annex7Required: Boolean(row.annex7_required ?? true),
    sellerStatus: row.seller_status === "Confirmed" ? "Confirmed" : "Pending",
    sellerCompany: String(row.seller_company ?? ""),
    sellerConfirmedBy: String(row.seller_confirmed_by ?? ""),
    sellerConfirmedAt: String(row.seller_confirmed_at ?? ""),
    overrideReason: typeof row.override_reason === "string" ? row.override_reason : null,
    overrideBy: typeof row.override_by === "string" ? row.override_by : null,
    overrideAt: typeof row.override_at === "string" ? row.override_at : null,
  };
}

function mapRequest(row: Record<string, unknown>): RequestRecord {
  return {
    id: String(row.id),
    number: String(row.number),
    type: row.type === "loading" ? "loading" : "unloading",
    shipmentId: String(row.shipment_id),
    purchaseOrderId: typeof row.purchase_order_id === "string" ? row.purchase_order_id : null,
    containerNumber: String(row.container_number ?? ""),
    warehouseId: String(row.warehouse_id),
    createdBy: String(row.created_by),
    status: (row.status as RequestRecord["status"]) ?? "submitted",
    declineReason: typeof row.decline_reason === "string" ? row.decline_reason : null,
    sentBackNote: typeof row.sent_back_note === "string" ? row.sent_back_note : null,
    approvedBy: typeof row.approved_by === "string" ? row.approved_by : null,
    approvedAt: typeof row.approved_at === "string" ? row.approved_at : null,
    enteredBy: typeof row.entered_by === "string" ? row.entered_by : null,
    enteredAt: typeof row.entered_at === "string" ? row.entered_at : null,
    deletedBy: typeof row.deleted_by === "string" ? row.deleted_by : null,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapRequestLine(row: Record<string, unknown>): RequestLine {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    materialId: String(row.material_id),
    packagingTypeId: String(row.packaging_type_id),
    packageCount: Number(row.package_count ?? 1),
    grossKg: Number(row.gross_kg ?? 0),
    tareTotalKg: Number(row.tare_total_kg ?? 0),
    netKg: Number(row.net_kg ?? 0),
  };
}

function mapRequestPhoto(row: Record<string, unknown>): RequestPhoto {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    documentId: String(row.document_id),
  };
}

function mapDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    kind: (row.kind as DocumentRecord["kind"]) ?? "other",
    category: (row.category as DocumentRecord["category"]) ?? "Purchase",
    shipmentId: typeof row.shipment_id === "string" ? row.shipment_id : null,
    purchaseOrderId: typeof row.purchase_order_id === "string" ? row.purchase_order_id : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    requestNumber: typeof row.request_number === "string" ? row.request_number : null,
    poNumber: typeof row.po_number === "string" ? row.po_number : null,
    containerNumber: typeof row.container_number === "string" ? row.container_number : null,
    warehouse: typeof row.warehouse === "string" ? row.warehouse : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    originalFilename: typeof row.original_filename === "string" ? row.original_filename : null,
    readableName: typeof row.readable_name === "string" ? row.readable_name : null,
    status: (row.status as DocumentRecord["status"]) ?? "active",
    name: String(row.name ?? ""),
    mime: String(row.mime ?? "application/octet-stream"),
    byteSize: Number(row.byte_size ?? 0),
    storageKey: String(row.storage_key ?? ""),
    cmrReference: typeof row.cmr_reference === "string" ? row.cmr_reference : null,
    cmrCarrier: typeof row.cmr_carrier === "string" ? row.cmr_carrier : null,
    cmrGoodsDescription: typeof row.cmr_goods_description === "string" ? row.cmr_goods_description : null,
    cmrRemarks: typeof row.cmr_remarks === "string" ? row.cmr_remarks : null,
    cmrEnteredBy: typeof row.cmr_entered_by === "string" ? row.cmr_entered_by : null,
    cmrEnteredAt: typeof row.cmr_entered_at === "string" ? row.cmr_entered_at : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapStockBalance(row: Record<string, unknown>): StockBalance {
  return {
    id: String(row.id),
    materialId: String(row.material_id),
    warehouseId: String(row.warehouse_id),
    weightKg: Number(row.weight_kg ?? 0),
  };
}

function mapStockMovement(row: Record<string, unknown>): StockMovement {
  const fallbackId = String(row.transfer_id ?? row.id);
  return {
    id: String(row.id),
    materialId: String(row.material_id),
    warehouseId: String(row.warehouse_id),
    weightKg: Number(row.weight_kg ?? 0),
    direction: row.direction === "out" ? "out" : "in",
    requestId: typeof row.request_id === "string" ? row.request_id : fallbackId,
    requestLineId: typeof row.request_line_id === "string" ? row.request_line_id : fallbackId,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    createdBy: String(row.created_by),
  };
}

function mapCustomsRecord(row: Record<string, unknown>): CustomsRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    reference: String(row.reference ?? ""),
    procedureNote: String(row.procedure_note ?? ""),
    goodsDescription: String(row.goods_description ?? ""),
    declarantReference: String(row.declarant_reference ?? ""),
    confirmedBy: typeof row.confirmed_by === "string" ? row.confirmed_by : null,
    confirmedAt: typeof row.confirmed_at === "string" ? row.confirmed_at : null,
    proofDocumentId: typeof row.proof_document_id === "string" ? row.proof_document_id : null,
  };
}

function mapDemurrageRecord(row: Record<string, unknown>): DemurrageRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    freeMinutes: Number(row.free_minutes ?? 120),
    ratePerMinute: Number(row.rate_per_minute ?? 1),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    elapsedMinutes: row.elapsed_minutes !== null && row.elapsed_minutes !== undefined ? Number(row.elapsed_minutes) : null,
    billableMinutes: row.billable_minutes !== null && row.billable_minutes !== undefined ? Number(row.billable_minutes) : null,
    chargeEur: row.charge_eur !== null && row.charge_eur !== undefined ? Number(row.charge_eur) : null,
  };
}

function mapAnnex7Record(row: Record<string, unknown>): Annex7Record {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    documentId: String(row.document_id),
    reference: String(row.reference),
    status: (row.status as Annex7Record["status"]) ?? "uploaded",
    notes: String(row.notes ?? ""),
    uploadedBy: String(row.uploaded_by),
    uploadedAt: String(row.uploaded_at ?? new Date().toISOString()),
  };
}

function mapAuditLogEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    oldValue: typeof row.old_value === "string" ? row.old_value : null,
    newValue: typeof row.new_value === "string" ? row.new_value : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapWorkerGeneralRequest(row: Record<string, unknown>): WorkerGeneralRequest {
  return {
    id: String(row.id),
    number: String(row.number),
    category: row.category as GeneralRequestCategory,
    priority: (row.priority as GeneralRequestPriority) || "normal",
    description: String(row.description ?? ""),
    warehouseId: String(row.warehouse_id),
    shipmentId: typeof row.shipment_id === "string" ? row.shipment_id : null,
    purchaseOrderId: typeof row.purchase_order_id === "string" ? row.purchase_order_id : null,
    createdBy: String(row.created_by),
    status: (row.status as GeneralRequestStatus) || "submitted",
    responseNote: typeof row.response_note === "string" ? row.response_note : null,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapWorkerGeneralRequestAttachment(row: Record<string, unknown>): WorkerGeneralRequestAttachment {
  return {
    id: String(row.id),
    generalRequestId: String(row.general_request_id),
    documentId: String(row.document_id),
  };
}

// ----------------------------------------------------------------------------
// SupabaseAdapter Implementation
// ----------------------------------------------------------------------------

export class SupabaseAdapter {
  readonly client: SupabaseRestClient;
  private readonly now: () => string;
  private readonly tokenByActorId = new Map<string, string>();
  private lastAccessToken: string | null = null;

  constructor(client: SupabaseRestClient, now: () => string = () => new Date().toISOString()) {
    this.client = client;
    this.now = now;
  }

  private resolveToken(sessionOrActorId?: string | null): string | null {
    if (!sessionOrActorId) return this.lastAccessToken;
    // If it's a mapped actor UUID, resolve its stored JWT; otherwise treat sessionId as the JWT itself
    return this.tokenByActorId.get(sessionOrActorId) ?? sessionOrActorId;
  }

  async current(sessionId: string): Promise<UserProfile | null> {
    if (!sessionId) return null;
    const token = this.resolveToken(sessionId);
    const res = await this.client.rpc<Record<string, unknown> | null>("current_app_user", {}, token);
    if (!res.ok || !res.value || typeof res.value.id !== "string") {
      return null;
    }
    const profile = mapUserProfile(res.value);
    if (!profile.active || !isActiveRole(profile.role)) {
      return null;
    }
    if (token) {
      this.tokenByActorId.set(profile.id, token);
      this.lastAccessToken = token;
    }
    return profile;
  }

  async signIn(email: string, password: string): Promise<Result<{ sessionId: string; profile: UserProfile }>> {
    const authRes = await this.client.auth.signInWithPassword(email, password);
    if (!authRes.ok) {
      return authRes;
    }
    const accessToken = authRes.value.accessToken;
    const profile = await this.current(accessToken);
    if (!profile) {
      await this.client.auth.signOut(accessToken);
      return fail("This account is inactive or not linked to an active StockFlow profile.");
    }
    this.tokenByActorId.set(profile.id, accessToken);
    this.lastAccessToken = accessToken;
    return ok({ sessionId: accessToken, profile });
  }

  async signOut(sessionId: string): Promise<void> {
    const token = this.resolveToken(sessionId);
    if (token) {
      await this.client.auth.signOut(token);
      for (const [actorId, savedToken] of this.tokenByActorId.entries()) {
        if (savedToken === token || actorId === sessionId) {
          this.tokenByActorId.delete(actorId);
        }
      }
      if (this.lastAccessToken === token) {
        this.lastAccessToken = null;
      }
    }
  }

  async snapshot(sessionId?: string | null): Promise<StoreData> {
    const token = this.resolveToken(sessionId);
    const store = emptyStore();

    const [
      warehousesRes,
      companiesRes,
      usersRes,
      materialsRes,
      packagingRes,
      ordersRes,
      orderLinesRes,
      shipmentsRes,
      requestsRes,
      requestLinesRes,
      requestPhotosRes,
      documentsRes,
      balancesRes,
      movementsRes,
      customsRes,
      demurrageRes,
      annex7Res,
      auditRes,
      generalRequestsRes,
      generalRequestAttachmentsRes,
    ] = await Promise.all([
      this.client.select<Record<string, unknown>>("warehouses", "select=*&order=name.asc", token),
      this.client.select<Record<string, unknown>>("companies", "select=*&order=name.asc", token),
      this.client.select<Record<string, unknown>>("users", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("materials", "select=*&order=material_number.asc", token),
      this.client.select<Record<string, unknown>>("packaging_types", "select=*&order=name.asc", token),
      this.client.select<Record<string, unknown>>("purchase_orders", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("purchase_order_lines", "select=*", token),
      this.client.select<Record<string, unknown>>("shipments", "select=*", token),
      this.client.select<Record<string, unknown>>("requests", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("request_lines", "select=*", token),
      this.client.select<Record<string, unknown>>("request_photos", "select=*", token),
      this.client.select<Record<string, unknown>>("documents", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("stock_balances", "select=*", token),
      this.client.select<Record<string, unknown>>("stock_movements", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("customs_records", "select=*", token),
      this.client.select<Record<string, unknown>>("demurrage_records", "select=*", token),
      this.client.select<Record<string, unknown>>("annex7_records", "select=*&order=uploaded_at.asc", token),
      this.client.select<Record<string, unknown>>("audit_log", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("worker_general_requests", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("worker_general_request_attachments", "select=*", token),
    ]);

    if (warehousesRes.ok) store.warehouses = warehousesRes.value.map(mapWarehouse);
    if (companiesRes.ok) store.companies = companiesRes.value.map(mapCompany);
    if (usersRes.ok) store.users = usersRes.value.map(mapUserRecord);
    if (materialsRes.ok) store.materials = materialsRes.value.map(mapMaterial);
    if (packagingRes.ok) store.packagingTypes = packagingRes.value.map(mapPackagingType);
    if (ordersRes.ok) store.purchaseOrders = ordersRes.value.map(mapPurchaseOrder);
    if (orderLinesRes.ok) store.purchaseOrderLines = orderLinesRes.value.map(mapPurchaseOrderLine);
    if (shipmentsRes.ok) store.shipments = shipmentsRes.value.map(mapShipment);
    if (requestsRes.ok) store.requests = requestsRes.value.map(mapRequest);
    if (requestLinesRes.ok) store.requestLines = requestLinesRes.value.map(mapRequestLine);
    if (requestPhotosRes.ok) store.requestPhotos = requestPhotosRes.value.map(mapRequestPhoto);
    if (documentsRes.ok) store.documents = documentsRes.value.map(mapDocument);
    if (balancesRes.ok) store.stockBalances = balancesRes.value.map(mapStockBalance);
    if (movementsRes.ok) store.stockMovements = movementsRes.value.map(mapStockMovement);
    if (customsRes.ok) store.customsRecords = customsRes.value.map(mapCustomsRecord);
    if (demurrageRes.ok) store.demurrageRecords = demurrageRes.value.map(mapDemurrageRecord);
    if (annex7Res.ok) store.annex7Records = annex7Res.value.map(mapAnnex7Record);
    if (auditRes.ok) store.auditLog = auditRes.value.map(mapAuditLogEntry);
    if (generalRequestsRes.ok) store.workerGeneralRequests = generalRequestsRes.value.map(mapWorkerGeneralRequest);
    if (generalRequestAttachmentsRes.ok) store.workerGeneralRequestAttachments = generalRequestAttachmentsRes.value.map(mapWorkerGeneralRequestAttachment);

    return store;
  }

  async view(sessionId: string | null): Promise<{ state: WorkspaceState; actor: Actor | null }> {
    if (!sessionId) {
      return { state: emptyWorkspace(), actor: null };
    }
    const profile = await this.current(sessionId);
    if (!profile || !profile.active || !isActiveRole(profile.role)) {
      return { state: emptyWorkspace(), actor: null };
    }
    const store = await this.snapshot(sessionId);
    if (!store.users.some((u) => u.id === profile.id)) {
      store.users.push({ ...profile, passwordHash: "supabase-auth-managed" });
    }
    const actor: Actor = {
      name: profile.name,
      role: profile.role,
      email: profile.email,
      warehouse: profile.warehouseId
        ? (store.warehouses.find((w) => w.id === profile.warehouseId)?.name ?? null)
        : null,
      company: profile.companyId
        ? (store.companies.find((c) => c.id === profile.companyId)?.name ?? null)
        : null,
    };
    return { state: projectStore(store, this.now()), actor };
  }

  async openFile(key: string, _exp: string, _sig: string, _nowMs: number, sessionId?: string | null) {
    const token = this.resolveToken(sessionId);
    const docsRes = await this.client.select<Record<string, unknown>>(
      "documents",
      `select=*&or=(storage_key.eq.${encodeURIComponent(key)},id.eq.${encodeURIComponent(key)})&status=eq.active`,
      token,
    );
    const docRow = docsRes.ok && docsRes.value.length > 0 ? mapDocument(docsRes.value[0]) : null;
    const storagePath = docRow?.storageKey || key;
    const downloadRes = await this.client.storage.download(storagePath, token);
    if (!downloadRes.ok) return null;
    return {
      name: docRow?.readableName || docRow?.name || key.split("/").pop() || "document",
      mime: docRow?.mime || downloadRes.value.mime,
      bytes: downloadRes.value.bytes,
    };
  }

  async run(sessionId: string | null, name: string, payload: unknown): Promise<WorkspaceResponse> {
    if (!sessionId) {
      return { state: emptyWorkspace(), actor: null, error: "Sign in again to continue." };
    }
    const profile = await this.current(sessionId);
    if (!profile) {
      return { state: emptyWorkspace(), actor: null, error: "Sign in again to continue." };
    }
    if (!profile.active || !isActiveRole(profile.role)) {
      return { state: emptyWorkspace(), actor: null, error: "This account is not permitted to perform actions." };
    }

    const token = this.resolveToken(sessionId) ?? sessionId;
    const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

    let error: string | undefined;
    let notice: string | undefined;

    const svc = this.services();

    try {
      switch (name) {
        case "createPurchase": {
          const res = await svc.purchaseOrders.create({
            supplier: text(body.supplier),
            material: text(body.material),
            quantityKg: num(body.quantityKg),
            valueEur: num(body.valueEur),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.number} was submitted for approval.`;
          break;
        }
        case "approve": {
          const res = await svc.purchaseOrders.approve({ number: text(body.number), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = `${res.value.number} is approved.`;
          break;
        }
        case "reject": {
          const res = await svc.purchaseOrders.reject({ number: text(body.number), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = `${res.value.number} is declined.`;
          break;
        }
        case "editPurchase": {
          const res = await svc.purchaseOrders.edit({
            number: text(body.number),
            supplier: text(body.supplier),
            material: text(body.material),
            quantityKg: num(body.quantityKg),
            valueEur: num(body.valueEur),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.number} was updated.`;
          break;
        }
        case "deletePurchase":
        case "deleteOrder": {
          const res = await svc.purchaseOrders.delete({ number: text(body.number), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = "Purchase order was deleted.";
          break;
        }
        case "addInbound":
        case "addOutbound": {
          const direction = name === "addInbound" ? "inbound" : "outbound";
          const party = text(body.party || (direction === "inbound" ? body.supplier : body.customer));
          const res = await svc.shipments.create({
            direction,
            number: text(body.number),
            po: text(body.po),
            party,
            warehouse: text(body.warehouse),
            container: text(body.container),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.reference} was registered.`;
          break;
        }
        case "saveMeta": {
          const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
          const res = await svc.shipments.saveMeta({
            direction,
            number: text(body.number),
            po: text(body.po),
            container: text(body.container),
            party: text(body.party),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Shipment ${res.value.reference} details were saved.`;
          break;
        }
        case "saveCarrier": {
          const handedOverAtRaw = text(body.handover || body.handedOverAt);
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_save_carrier",
            {
              p_reference: text(body.number),
              p_carrier_name: text(body.carrier),
              p_handed_over_at: handedOverAtRaw ? new Date(handedOverAtRaw).toISOString() : null,
            },
            token,
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = `Carrier details for ${text(body.number)} were saved.`;
          break;
        }
        case "unload":
        case "dispatch": {
          const direction = name === "unload" ? "inbound" : "outbound";
          const res = await svc.shipments.advance({
            direction,
            number: text(body.number),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.reference} moved to ${res.value.status}.`;
          break;
        }
        case "overrideDispatch": {
          const res = await svc.shipments.overrideDispatch({
            number: text(body.number),
            reason: text(body.reason),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Dispatch override recorded for ${res.value.reference}.`;
          break;
        }
        case "saveMaterial": {
          if (text(body.mode) === "count") {
            error = "Count-only lines are not stored. Enter a gross weight so net weight is greater than zero.";
            break;
          }
          const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_worker_save_material_line",
            {
              p_direction: direction,
              p_shipment_reference: text(body.shipment),
              p_material_description: text(body.material || body.description),
              p_packaging_type_id: text(body.packagingId || body.packagingTypeId),
              p_package_count: Math.trunc(num(body.packagingQty ?? body.packageCount) || 1),
              p_gross_kg: num(body.grossKg),
              p_tare_per_unit_kg:
                body.tarePerUnitKg !== undefined && body.tarePerUnitKg !== null && String(body.tarePerUnitKg) !== ""
                  ? num(body.tarePerUnitKg)
                  : null,
              p_no_tare: Boolean(body.noTare),
            },
            token,
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = "Material and packaging line was saved on the request.";
          break;
        }
        case "deleteMaterial": {
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_worker_delete_material_line",
            { p_line_id: text(body.sectionId || body.id) },
            token,
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = "Material line was removed from the request.";
          break;
        }
        case "saveCmr": {
          const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_save_cmr",
            {
              p_direction: direction,
              p_shipment_reference: text(body.shipment),
              p_cmr_reference: text(body.reference),
              p_carrier: text(body.carrier),
              p_goods_description: text(body.goodsDescription),
              p_remarks: text(body.remarks),
            },
            token,
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = `CMR ${text(body.reference)} was saved.`;
          break;
        }
        case "saveCustoms": {
          const res = await svc.customs.save({
            number: text(body.number),
            reference: text(body.reference),
            procedureNote: text(body.procedureNote),
            goodsDescription: text(body.goodsDescription),
            declarantReference: text(body.declarantReference),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Customs record for ${text(body.number)} was saved.`;
          break;
        }
        case "confirmSeller": {
          const res = await svc.customs.confirmSeller({ number: text(body.number), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = `Seller details confirmed for ${res.value.reference}.`;
          break;
        }
        case "confirmCustoms": {
          const res = await svc.customs.confirmCustoms({
            number: text(body.number),
            name: text(body.name),
            mime: text(body.mime),
            size: num(body.size),
            bytesBase64: text(body.bytesBase64),
            fileId: text(body.fileId) || undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Customs confirmed for ${text(body.number)}.`;
          break;
        }
        case "addAnnex": {
          const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
          const res = await svc.annex7.upload({
            shipment: text(body.shipment),
            direction,
            reference: text(body.reference),
            name: text(body.name),
            mime: text(body.mime),
            size: num(body.size),
            notes: text(body.notes),
            bytesBase64: text(body.bytesBase64),
            fileId: text(body.fileId) || undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Annex 7 ${res.value.reference} was uploaded.`;
          break;
        }
        case "attachFile":
        case "attachFiles": {
          const drafts = Array.isArray(payload)
            ? payload
            : Array.isArray(body.drafts)
              ? body.drafts
              : [body];
          if (drafts.length === 0) {
            error = "Choose a non-empty file before attaching it.";
            break;
          }
          for (const rawDraft of drafts) {
            const draft = rawDraft && typeof rawDraft === "object" ? (rawDraft as Record<string, unknown>) : {};
            const direction = text(draft.direction) === "outbound" ? "outbound" : "inbound";
            const shipRef = text(draft.shipment);
            const shipRes = await this.client.select<Record<string, unknown>>(
              "shipments",
              `select=*&direction=eq.${direction}&or=(reference.eq.${encodeURIComponent(shipRef)},container_number.eq.${encodeURIComponent(shipRef)})`,
              token,
            );
            if (!shipRes.ok || shipRes.value.length === 0) {
              error = "That shipment does not exist.";
              break;
            }
            const shipment = mapShipment(shipRes.value[0]);
            const roleStr = text(draft.role);
            const kind =
              roleStr === "cmr"
                ? "cmr"
                : roleStr === "customs"
                  ? "customs_proof"
                  : roleStr === "document"
                    ? "other"
                    : "photo";
            if (kind === "cmr") {
              const existingCmr = await this.client.select<Record<string, unknown>>(
                "documents",
                `select=*&shipment_id=eq.${encodeURIComponent(shipment.id)}&kind=eq.cmr&status=neq.deleted`,
                token,
              );
              if (existingCmr.ok && existingCmr.value.length > 0) {
                error = "Only one CMR document is allowed per shipment.";
                break;
              }
            }
            const targetRes = await svc.files.createUploadTarget({
              filename: text(draft.name),
              mime: text(draft.mime) || "application/octet-stream",
              byteSize: num(draft.size),
              kind,
              shipmentId: shipment.id,
              containerNumber: shipment.containerNumber || shipment.reference,
              notes: text(draft.notes) || undefined,
              actorId: profile.id,
            });
            if (!targetRes.ok) {
              error = targetRes.error;
              break;
            }
            const confirmRes = await svc.files.confirmUpload({
              fileId: targetRes.value.fileId,
              bytesBase64: text(draft.bytesBase64),
              actorId: profile.id,
            });
            if (!confirmRes.ok) {
              error = confirmRes.error;
              break;
            }
            notice = `${confirmRes.value.readableName || confirmRes.value.name} was stored for ${shipment.reference}.`;
          }
          break;
        }
        case "selectDocument": {
          const category = text(body.category) || "Purchase";
          const kind = category === "Customs" ? "customs_proof" : "other";
          const targetRes = await svc.files.createUploadTarget({
            filename: text(body.name),
            mime: text(body.mime) || "application/octet-stream",
            byteSize: num(body.size),
            kind,
            notes: text(body.notes) || undefined,
            actorId: profile.id,
          });
          if (!targetRes.ok) {
            error = targetRes.error;
            break;
          }
          const confirmRes = await svc.files.confirmUpload({
            fileId: targetRes.value.fileId,
            bytesBase64: text(body.bytesBase64),
            actorId: profile.id,
          });
          if (!confirmRes.ok) error = confirmRes.error;
          else notice = `${confirmRes.value.readableName || confirmRes.value.name} was stored.`;
          break;
        }
        case "reviewAnnex": {
          const res = await svc.annex7.review({ id: text(body.id), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = `Annex 7 ${res.value.reference} is under review.`;
          break;
        }
        case "approveAnnex": {
          const res = await svc.annex7.approve({ id: text(body.id), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = `Annex 7 ${res.value.reference} is approved.`;
          break;
        }
        case "approveRequest": {
          const res = await svc.requests.approve({ requestId: text(body.requestId), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = "Request was approved.";
          break;
        }
        case "declineRequest": {
          const res = await svc.requests.decline({
            requestId: text(body.requestId),
            reason: text(body.reason),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Request was declined.";
          break;
        }
        case "sendBackRequest": {
          const res = await svc.requests.sendBack({
            requestId: text(body.requestId),
            note: text(body.note),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Request was sent back to the worker.";
          break;
        }
        case "completeRequest": {
          const res = await svc.requests.complete({ requestId: text(body.requestId), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = "Request was entered and completed into stock.";
          break;
        }
        case "deleteRequest": {
          const res = await svc.requests.softDelete({ requestId: text(body.requestId), actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = "Request was deleted.";
          break;
        }
        case "createGeneralRequest": {
          const res = await svc.generalRequests.create({
            category: body.category as GeneralRequestCategory,
            priority: (body.priority as GeneralRequestPriority) || "normal",
            description: text(body.description),
            shipmentId: text(body.shipmentId || body.shipment) || null,
            documentIds: Array.isArray(body.documentIds) ? (body.documentIds as string[]) : undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Your request was submitted.";
          break;
        }
        case "decideGeneralRequest": {
          const res = await svc.generalRequests.decide({
            requestId: text(body.requestId || body.id),
            decision: text(body.decision) as
              | "under_review"
              | "approved"
              | "declined"
              | "sent_back"
              | "completed",
            responseNote: text(body.reason || body.note || body.responseNote) || undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Request updated.";
          break;
        }
        case "deleteGeneralRequest": {
          const res = await svc.generalRequests.softDelete({
            requestId: text(body.requestId || body.id),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Request was deleted.";
          break;
        }
        case "createRequest": {
          const direction = text(body.direction) === "outbound" ? "outbound" : "inbound";
          const shipRef = text(body.shipment);
          const shipsRes = await this.client.select<Record<string, unknown>>(
            "shipments",
            `select=*&direction=eq.${direction}&or=(reference.eq.${encodeURIComponent(shipRef)},container_number.eq.${encodeURIComponent(shipRef)})`,
            token,
          );
          if (!shipsRes.ok || shipsRes.value.length === 0) {
            error = "That shipment does not exist.";
            break;
          }
          const shipment = mapShipment(shipsRes.value[0]);
          const res = await svc.requests.submit({ shipmentId: shipment.id, actorId: profile.id });
          if (!res.ok) error = res.error;
          else notice = `Request ${res.value.number} is ${res.value.status}.`;
          break;
        }
        case "detachFile": {
          const res = await svc.files.delete(text(body.id));
          if (!res.ok) error = res.error;
          else notice = "File was deleted.";
          break;
        }
        case "setThreshold": {
          const res = await svc.inventory.setThreshold({
            materialId: text(body.id),
            lowStockThresholdKg: num(body.minimum),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Low-stock threshold for ${res.value.description} is ${res.value.lowStockThresholdKg} kg.`;
          break;
        }
        case "addPackagingType": {
          const res = await svc.directory.addPackagingType({
            label: text(body.label),
            tareKg: body.tareKg !== null && body.tareKg !== undefined && String(body.tareKg) !== "" ? num(body.tareKg) : null,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.name} (${res.value.tareKg} kg tare) was added.`;
          break;
        }
        case "addUser": {
          const res = await svc.users.create({
            name: text(body.name),
            email: text(body.email),
            role: (text(body.role) as DomainRole) || "worker",
            warehouseName: text(body.warehouseName || body.warehouse) || null,
            companyName: text(body.companyName || body.company) || null,
            password: text(body.password) || undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.profile.email} was created. Temporary password: ${res.value.temporaryPassword}`;
          break;
        }
        case "changeRole": {
          const res = await svc.users.updateRole({
            email: text(body.email),
            role: (text(body.role) as DomainRole) || "worker",
            warehouseName: text(body.warehouseName || body.warehouse) || null,
            companyName: text(body.companyName || body.company) || null,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.email} is now ${res.value.role}.`;
          break;
        }
        case "assignWorker": {
          const res = await svc.requests.assignWorker({
            requestId: text(body.requestId),
            workerId: text(body.workerId),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Worker was assigned.";
          break;
        }
        case "transfer":
        case "transferStock": {
          error = "This role cannot transfer stock.";
          break;
        }
        case "postCorrection": {
          error = "Direct stock adjustments are disabled. Stock changes only through completed warehouse operations.";
          break;
        }
        default:
          error = "That action is not available.";
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "The warehouse database rejected that change.";
    }

    const viewed = await this.view(sessionId);
    return { state: viewed.state, actor: viewed.actor, error, notice };
  }

  private async resolveActor(actorId: string): Promise<{ actor: UserProfile; token: string | null }> {
    const token = this.resolveToken(actorId);
    const res = await this.client.select<Record<string, unknown>>(
      "users",
      `select=*&id=eq.${encodeURIComponent(actorId)}`,
      token,
    );
    if (!res.ok || res.value.length === 0) {
      throw new Error("Sign in again to continue.");
    }
    const actor = mapUserProfile(res.value[0]);
    if (!actor.active || !isActiveRole(actor.role)) {
      throw new Error("Sign in again to continue.");
    }
    return { actor, token };
  }

  private authorize(actor: UserProfile, action: Action, resource?: Resource): void {
    if (!can(actor, action, resource)) {
      throw new Error("You do not have permission to perform this action.");
    }
  }

  services(): Services {
    return {
      users: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>("users", "select=*&order=created_at.asc", token);
          return res.ok ? res.value.map(mapUserProfile) : [];
        },
        create: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "user:manage");
          const temporaryPassword = input.password?.trim() || `SF-${randomUUID().slice(0, 8)}!`;

          let warehouseId: string | null = null;
          if (input.role === "worker") {
            if (!input.warehouseName) {
              return fail("Choose a warehouse for a worker account.");
            }
            const whRes = await this.client.select<Record<string, unknown>>(
              "warehouses",
              `select=*&name=eq.${encodeURIComponent(input.warehouseName)}`,
              token,
            );
            if (!whRes.ok || whRes.value.length === 0) {
              return fail("That warehouse does not exist.");
            }
            warehouseId = String(whRes.value[0].id);
          }

          const authCreated = await this.client.auth.adminCreateUser({
            email: input.email,
            password: temporaryPassword,
            name: input.name,
            role: input.role,
          });
          if (!authCreated.ok) return authCreated;

          const rowRes = await this.client.insert<Record<string, unknown>>(
            "users",
            {
              auth_user_id: authCreated.value.id,
              email: input.email.trim().toLowerCase(),
              name: input.name.trim(),
              role: input.role,
              warehouse_id: warehouseId,
              company_id: null,
              active: true,
            },
            token,
          );
          if (!rowRes.ok) return rowRes;
          return ok({ profile: mapUserProfile(rowRes.value), temporaryPassword });
        },
        updateRole: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "user:manage");
          let warehouseId: string | null = null;
          if (input.role === "worker") {
            if (!input.warehouseName) return fail("Choose a warehouse for a worker account.");
            const whRes = await this.client.select<Record<string, unknown>>(
              "warehouses",
              `select=*&name=eq.${encodeURIComponent(input.warehouseName)}`,
              token,
            );
            if (!whRes.ok || whRes.value.length === 0) return fail("That warehouse does not exist.");
            warehouseId = String(whRes.value[0].id);
          }
          const updated = await this.client.update<Record<string, unknown>>(
            "users",
            `email=eq.${encodeURIComponent(input.email.trim().toLowerCase())}`,
            {
              role: input.role,
              warehouse_id: warehouseId,
              company_id: null,
              updated_at: this.now(),
            },
            token,
          );
          if (!updated.ok) return updated;
          return ok(mapUserProfile(updated.value));
        },
        deactivate: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "user:manage");
          const updated = await this.client.update<Record<string, unknown>>(
            "users",
            `email=eq.${encodeURIComponent(input.email.trim().toLowerCase())}`,
            { active: false, updated_at: this.now() },
            token,
          );
          if (!updated.ok) return updated;
          return ok(mapUserProfile(updated.value));
        },
      },

      auth: {
        signIn: (email, password) => this.signIn(email, password),
        signOut: (sessionId) => this.signOut(sessionId),
        currentSession: (sessionId) => this.current(sessionId),
        createUser: (input) => this.services().users.create(input),
        deactivateUser: (input) => this.services().users.deactivate(input),
      },

      purchaseOrders: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "purchase_orders",
            "select=*&order=created_at.asc",
            token,
          );
          return res.ok ? res.value.map(mapPurchaseOrder) : [];
        },
        lines: async (purchaseOrderId) => {
          const res = await this.client.select<Record<string, unknown>>(
            "purchase_order_lines",
            `select=*&purchase_order_id=eq.${encodeURIComponent(purchaseOrderId)}`,
            this.lastAccessToken,
          );
          return res.ok ? res.value.map(mapPurchaseOrderLine) : [];
        },
        create: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "order:create");
          if (!input.supplier.trim() || !input.material.trim() || input.quantityKg < 0 || input.valueEur < 0) {
            return fail("Supplier, material, quantity, and value are required.");
          }
          const compRes = await this.client.insert<Record<string, unknown>>(
            "companies",
            { name: input.supplier.trim(), kind: "supplier", active: true },
            token,
            { upsert: true, onConflict: "name,kind" },
          );
          if (!compRes.ok) return compRes;

          const existingOrders = await this.services().purchaseOrders.list(input.actorId);
          const number = `PO-${existingOrders.length + 1}`;
          const poRes = await this.client.insert<Record<string, unknown>>(
            "purchase_orders",
            {
              number,
              company_id: String(compRes.value.id),
              status: "submitted",
              value_eur: input.valueEur,
              notes: "",
              created_by: actor.id,
            },
            token,
          );
          if (!poRes.ok) return poRes;
          const po = mapPurchaseOrder(poRes.value);

          const lineRes = await this.client.insert<Record<string, unknown>>(
            "purchase_order_lines",
            {
              purchase_order_id: po.id,
              material_id: null,
              description: input.material.trim(),
              quantity_kg: input.quantityKg,
            },
            token,
          );
          if (!lineRes.ok) return lineRes;
          return ok(po);
        },
        submit: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "order:submit");
          return fail("Customer portal order submission is outside the 3-role operational scope.");
        },
        approve: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "order:approve");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_admin_decide_order",
            { p_order_number: input.number, p_decision: "approved" },
            token,
          );
          if (!res.ok) return res;
          return ok(mapPurchaseOrder(res.value));
        },
        reject: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "order:reject");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_admin_decide_order",
            { p_order_number: input.number, p_decision: "declined" },
            token,
          );
          if (!res.ok) return res;
          return ok(mapPurchaseOrder(res.value));
        },
        edit: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const existingList = await this.client.select<Record<string, unknown>>(
            "purchase_orders",
            `select=*&number=eq.${encodeURIComponent(input.number)}`,
            token,
          );
          const existing = existingList.ok && existingList.value[0] ? mapPurchaseOrder(existingList.value[0]) : undefined;
          this.authorize(actor, "order:edit", { status: existing?.status });
          if (!existing) return fail("That purchase order does not exist.");
          if (existing.status === "approved" || existing.status === "declined") {
            return fail("Approved or declined purchase orders are locked and cannot be edited.");
          }

          const compRes = await this.client.insert<Record<string, unknown>>(
            "companies",
            { name: input.supplier.trim(), kind: "supplier", active: true },
            token,
            { upsert: true, onConflict: "name,kind" },
          );
          if (!compRes.ok) return compRes;

          const poRes = await this.client.update<Record<string, unknown>>(
            "purchase_orders",
            `id=eq.${encodeURIComponent(existing.id)}`,
            {
              company_id: String(compRes.value.id),
              value_eur: input.valueEur,
              updated_at: this.now(),
            },
            token,
          );
          if (!poRes.ok) return poRes;

          await this.client.update<Record<string, unknown>>(
            "purchase_order_lines",
            `purchase_order_id=eq.${encodeURIComponent(existing.id)}`,
            {
              description: input.material.trim(),
              quantity_kg: input.quantityKg,
            },
            token,
          );
          return ok(mapPurchaseOrder(poRes.value));
        },
        delete: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "order:delete");
          return fail("Operational PO/SO records cannot be deleted.");
        },
      },

      shipments: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>("shipments", "select=*", token);
          return res.ok ? res.value.map(mapShipment) : [];
        },
        create: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "shipment:create");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_register_shipment",
            {
              p_direction: input.direction,
              p_reference: input.number,
              p_po_number: input.po,
              p_party_name: input.party,
              p_warehouse_name: input.warehouse,
              p_container_number: input.container ?? "",
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapShipment(res.value));
        },
        saveMeta: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const shipRes = await this.client.select<Record<string, unknown>>(
            "shipments",
            `select=*&reference=eq.${encodeURIComponent(input.number)}&direction=eq.${input.direction}`,
            token,
          );
          const existing = shipRes.ok && shipRes.value[0] ? mapShipment(shipRes.value[0]) : undefined;
          this.authorize(actor, "shipment:edit", { warehouseId: existing?.warehouseId });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_save_shipment_meta",
            {
              p_direction: input.direction,
              p_reference: input.number,
              p_po_number: input.po,
              p_container_number: input.container,
              p_party_name: input.party,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapShipment(res.value));
        },
        advance: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const shipRes = await this.client.select<Record<string, unknown>>(
            "shipments",
            `select=*&reference=eq.${encodeURIComponent(input.number)}&direction=eq.${input.direction}`,
            token,
          );
          const existing = shipRes.ok && shipRes.value[0] ? mapShipment(shipRes.value[0]) : undefined;
          this.authorize(actor, "shipment:advance", { warehouseId: existing?.warehouseId });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_advance_shipment",
            { p_direction: input.direction, p_reference: input.number },
            token,
          );
          if (!res.ok) return res;
          return ok(mapShipment(res.value));
        },
        overrideDispatch: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "shipment:override");
          return fail("Dispatch override is not permitted.");
        },
      },

      requests: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "requests",
            "select=*&order=created_at.asc",
            token,
          );
          return res.ok ? res.value.map(mapRequest) : [];
        },
        lines: async (requestId) => {
          const res = await this.client.select<Record<string, unknown>>(
            "request_lines",
            `select=*&request_id=eq.${encodeURIComponent(requestId)}`,
            this.lastAccessToken,
          );
          return res.ok ? res.value.map(mapRequestLine) : [];
        },
        submit: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const shipRes = await this.client.select<Record<string, unknown>>(
            "shipments",
            `select=*&id=eq.${encodeURIComponent(input.shipmentId)}`,
            token,
          );
          const shipment = shipRes.ok && shipRes.value[0] ? mapShipment(shipRes.value[0]) : undefined;
          if (!shipment) return fail("That shipment does not exist.");
          this.authorize(actor, "request:create", { warehouseId: shipment.warehouseId });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_submit_request_with_photos",
            { p_shipment_id: input.shipmentId },
            token,
          );
          if (!res.ok) return res;
          return ok(mapRequest(res.value));
        },
        approve: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const reqRes = await this.client.select<Record<string, unknown>>(
            "requests",
            `select=*&id=eq.${encodeURIComponent(input.requestId)}`,
            token,
          );
          const existing = reqRes.ok && reqRes.value[0] ? mapRequest(reqRes.value[0]) : undefined;
          this.authorize(actor, "request:approve", { status: existing?.status, warehouseId: existing?.warehouseId });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_request",
            { p_request_id: input.requestId, p_decision: "approved", p_note_or_reason: null },
            token,
          );
          if (!res.ok) return res;
          return ok(mapRequest(res.value));
        },
        decline: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const reqRes = await this.client.select<Record<string, unknown>>(
            "requests",
            `select=*&id=eq.${encodeURIComponent(input.requestId)}`,
            token,
          );
          const existing = reqRes.ok && reqRes.value[0] ? mapRequest(reqRes.value[0]) : undefined;
          this.authorize(actor, "request:decline", { status: existing?.status, warehouseId: existing?.warehouseId });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_request",
            { p_request_id: input.requestId, p_decision: "declined", p_note_or_reason: input.reason },
            token,
          );
          if (!res.ok) return res;
          return ok(mapRequest(res.value));
        },
        sendBack: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const reqRes = await this.client.select<Record<string, unknown>>(
            "requests",
            `select=*&id=eq.${encodeURIComponent(input.requestId)}`,
            token,
          );
          const existing = reqRes.ok && reqRes.value[0] ? mapRequest(reqRes.value[0]) : undefined;
          this.authorize(actor, "request:sendBack", { status: existing?.status, warehouseId: existing?.warehouseId });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_request",
            { p_request_id: input.requestId, p_decision: "sent_back", p_note_or_reason: input.note },
            token,
          );
          if (!res.ok) return res;
          return ok(mapRequest(res.value));
        },
        complete: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const reqRes = await this.client.select<Record<string, unknown>>(
            "requests",
            `select=*&id=eq.${encodeURIComponent(input.requestId)}`,
            token,
          );
          const existing = reqRes.ok && reqRes.value[0] ? mapRequest(reqRes.value[0]) : undefined;
          this.authorize(actor, "request:complete", {
            status: existing?.status === "completed" ? "approved" : existing?.status,
            warehouseId: existing?.warehouseId,
          });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_worker_complete_request",
            { p_request_id: input.requestId },
            token,
          );
          if (!res.ok) return res;
          return ok(mapRequest(res.value));
        },
        softDelete: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          const reqRes = await this.client.select<Record<string, unknown>>(
            "requests",
            `select=*&id=eq.${encodeURIComponent(input.requestId)}`,
            token,
          );
          const existing = reqRes.ok && reqRes.value[0] ? mapRequest(reqRes.value[0]) : undefined;
          this.authorize(actor, "request:delete", {
            status: existing?.status,
            createdBy: existing?.createdBy,
            warehouseId: existing?.warehouseId,
          });
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_worker_soft_delete_request",
            { p_request_id: input.requestId },
            token,
          );
          if (!res.ok) return res;
          return ok(mapRequest(res.value));
        },
        assignWorker: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "worker:assign");
          return fail("Direct modification of request worker assignment is not permitted.");
        },
      },

      generalRequests: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "worker_general_requests",
            "select=*&order=created_at.desc",
            token,
          );
          return res.ok ? res.value.map(mapWorkerGeneralRequest) : [];
        },
        attachments: async (requestId) => {
          const res = await this.client.select<Record<string, unknown>>(
            "worker_general_request_attachments",
            `select=*&general_request_id=eq.${encodeURIComponent(requestId)}`,
            this.lastAccessToken,
          );
          return res.ok ? res.value.map(mapWorkerGeneralRequestAttachment) : [];
        },
        create: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          if (actor.role !== "worker") {
            return fail("Only a Worker can submit a warehouse request.");
          }
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_worker_create_general_request",
            {
              p_category: input.category,
              p_priority: input.priority ?? "normal",
              p_description: input.description,
              p_shipment_id: input.shipmentId ?? null,
              p_document_ids: input.documentIds ?? null,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapWorkerGeneralRequest(res.value));
        },
        decide: async (input) => {
          const { token } = await this.resolveActor(input.actorId);
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_general_request",
            {
              p_general_request_id: input.requestId,
              p_decision: input.decision,
              p_response_note: input.responseNote ?? null,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapWorkerGeneralRequest(res.value));
        },
        softDelete: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          if (actor.role !== "worker") {
            return fail("Only the worker who created a request can delete it.");
          }
          const res = await this.client.update<Record<string, unknown>>(
            "worker_general_requests",
            `id=eq.${encodeURIComponent(input.requestId)}&created_by=eq.${encodeURIComponent(actor.id)}`,
            { status: "deleted" },
            token,
          );
          if (!res.ok) return res;
          return ok(mapWorkerGeneralRequest(res.value));
        },
      },

      inventory: {
        balances: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>("stock_balances", "select=*", token);
          return res.ok ? res.value.map(mapStockBalance) : [];
        },
        movements: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "stock_movements",
            "select=*&order=created_at.asc",
            token,
          );
          return res.ok ? res.value.map(mapStockMovement) : [];
        },
        setThreshold: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "threshold:set");
          if (!Number.isFinite(input.lowStockThresholdKg) || input.lowStockThresholdKg < 0) {
            return fail("Low-stock threshold must be zero or greater, in kilograms.");
          }
          let targetMaterialId = input.materialId;
          const balRes = await this.client.select<Record<string, unknown>>(
            "stock_balances",
            `select=material_id&id=eq.${encodeURIComponent(input.materialId)}`,
            token,
          );
          if (balRes.ok && balRes.value[0]?.material_id) {
            targetMaterialId = String(balRes.value[0].material_id);
          }
          const res = await this.client.update<Record<string, unknown>>(
            "materials",
            `id=eq.${encodeURIComponent(targetMaterialId)}`,
            { low_stock_threshold_kg: roundKg(input.lowStockThresholdKg) },
            token,
          );
          if (!res.ok) return res;
          return ok(mapMaterial(res.value));
        },
        applyMovement: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "stock:move", { warehouseId: input.warehouseId });
          return fail("Stock movements are applied atomically via rpc_worker_complete_request.");
        },
        transferStock: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "stock:transfer");
          return fail("This role cannot transfer stock.");
        },
        postCorrection: async (input) => {
          const { actor } = await this.resolveActor(input.actorId);
          this.authorize(actor, "stock:adjust");
          return fail("Direct stock adjustments are disabled.");
        },
        checkConsistency: async (actorId) => {
          if (actorId) {
            const { actor } = await this.resolveActor(actorId);
            this.authorize(actor, "stock:view");
          }
          const store = await this.snapshot(actorId);
          return checkInventoryConsistency(store);
        },
      },

      documents: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "documents",
            "select=*&order=created_at.asc",
            token,
          );
          return res.ok ? res.value.map(mapDocument) : [];
        },
      },

      customs: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>("customs_records", "select=*", token);
          return res.ok ? res.value.map(mapCustomsRecord) : [];
        },
        save: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "customs:edit");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_save_customs",
            {
              p_reference: input.number,
              p_customs_ref: input.reference,
              p_procedure_note: input.procedureNote,
              p_goods_description: input.goodsDescription,
              p_declarant_reference: input.declarantReference,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapCustomsRecord(res.value));
        },
        confirmSeller: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "seller:confirm");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_confirm_seller",
            { p_reference: input.number },
            token,
          );
          if (!res.ok) return res;
          return ok(mapShipment(res.value));
        },
        confirmCustoms: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "customs:confirm");

          const shipRes = await this.client.select<Record<string, unknown>>(
            "shipments",
            `select=*&direction=eq.outbound&or=(reference.eq.${encodeURIComponent(input.number)},container_number.eq.${encodeURIComponent(input.number)})`,
            token,
          );
          if (!shipRes.ok || shipRes.value.length === 0) {
            return fail("That outbound shipment does not exist.");
          }
          const shipment = mapShipment(shipRes.value[0]);

          let proofDocumentId = input.fileId?.trim() || "";
          if (!proofDocumentId) {
            const targetRes = await this.services().files.createUploadTarget({
              filename: input.name,
              mime: input.mime,
              byteSize: input.size,
              kind: "customs_proof",
              shipmentId: shipment.id,
              containerNumber: shipment.containerNumber,
              actorId: input.actorId,
            });
            if (!targetRes.ok) return targetRes;

            const confirmDocRes = await this.services().files.confirmUpload({
              fileId: targetRes.value.fileId,
              bytesBase64: input.bytesBase64,
              actorId: input.actorId,
            });
            if (!confirmDocRes.ok) return confirmDocRes;
            proofDocumentId = confirmDocRes.value.id;
          }

          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_confirm_customs",
            {
              p_reference: input.number,
              p_proof_document_id: proofDocumentId,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapCustomsRecord(res.value));
        },
      },

      demurrage: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>("demurrage_records", "select=*", token);
          return res.ok ? res.value.map(mapDemurrageRecord) : [];
        },
      },

      annex7: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "annex7_records",
            "select=*&order=uploaded_at.asc",
            token,
          );
          return res.ok ? res.value.map(mapAnnex7Record) : [];
        },
        upload: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "annex7:upload");

          const shipRes = await this.client.select<Record<string, unknown>>(
            "shipments",
            `select=*&direction=eq.${input.direction}&or=(reference.eq.${encodeURIComponent(input.shipment)},container_number.eq.${encodeURIComponent(input.shipment)})`,
            token,
          );
          if (!shipRes.ok || shipRes.value.length === 0) {
            return fail("That shipment does not exist.");
          }
          const shipment = mapShipment(shipRes.value[0]);

          let documentId = input.fileId?.trim() || "";
          if (!documentId) {
            const targetRes = await this.services().files.createUploadTarget({
              filename: input.name,
              mime: input.mime,
              byteSize: input.size,
              kind: "annex7",
              shipmentId: shipment.id,
              containerNumber: shipment.containerNumber,
              notes: input.notes,
              actorId: input.actorId,
            });
            if (!targetRes.ok) return targetRes;

            const docRes = await this.services().files.confirmUpload({
              fileId: targetRes.value.fileId,
              bytesBase64: input.bytesBase64,
              actorId: input.actorId,
            });
            if (!docRes.ok) return docRes;
            documentId = docRes.value.id;
          }

          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_upload_annex7",
            {
              p_direction: input.direction,
              p_shipment_reference: input.shipment,
              p_document_id: documentId,
              p_annex_reference: input.reference,
              p_notes: input.notes,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapAnnex7Record(res.value));
        },
        review: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "annex7:review");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_annex7",
            { p_target_id: input.id, p_status: "under_review" },
            token,
          );
          if (!res.ok) return res;
          return ok(mapAnnex7Record(res.value));
        },
        approve: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "annex7:approve");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_annex7",
            { p_target_id: input.id, p_status: "approved" },
            token,
          );
          if (!res.ok) return res;
          return ok(mapAnnex7Record(res.value));
        },
      },

      chat: {
        list: async () => [],
        send: async () => fail("Legacy PO chat is deferred and disabled in Supabase operational mode."),
      },

      audit: {
        list: async (actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "audit_log",
            "select=*&order=created_at.asc",
            token,
          );
          return res.ok ? res.value.map(mapAuditLogEntry) : [];
        },
      },

      reports: {
        stock: async () => {
          const store = await this.snapshot();
          return store.stockBalances.map((balance) => ({
            materialId: balance.materialId,
            warehouseId: balance.warehouseId,
            weightKg: balance.weightKg,
            lowStockThresholdKg:
              store.materials.find((item) => item.id === balance.materialId)?.lowStockThresholdKg ?? 0,
          }));
        },
        purchases: async () => {
          const store = await this.snapshot();
          return {
            count: store.purchaseOrders.length,
            quantityKg: store.purchaseOrderLines.reduce((sum, line) => sum + line.quantityKg, 0),
            valueEur: store.purchaseOrders.reduce((sum, order) => sum + order.valueEur, 0),
          };
        },
        movements: async () => (await this.snapshot()).stockMovements,
      },

      files: {
        put: async (input) => {
          const key = `other/general/${Date.now()}-${randomUUID()}-${input.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          return this.client.storage.upload(key, input.bytes, input.mime, this.lastAccessToken);
        },
        signedUrl: async (key): Promise<Result<SignedUrl>> => {
          return this.client.storage.createSignedUrl(key, 300, this.lastAccessToken);
        },
        delete: async (key) => {
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_worker_delete_document",
            { p_document_id: key },
            this.lastAccessToken,
          );
          if (!rpcRes.ok) return fail(rpcRes.error);
          const deletedDoc = mapDocument(rpcRes.value);
          if (deletedDoc.storageKey) {
            await this.client.storage.remove([deletedDoc.storageKey], this.lastAccessToken);
          }
          return ok(undefined);
        },
        createUploadTarget: async (metadata: UploadTargetMetadata): Promise<Result<UploadTarget>> => {
          const { actor, token } = await this.resolveActor(metadata.actorId);
          if (metadata.byteSize > MAX_FILE_SIZE_BYTES) {
            return fail(`File exceeds 10 MB limit (${(metadata.byteSize / (1024 * 1024)).toFixed(1)} MB).`);
          }
          this.authorize(actor, "file:upload", {
            warehouseId: actor.warehouseId,
            createdBy: actor.id,
          });

          const fileId = randomUUID();
          const ext = extensionForMime(metadata.mime, metadata.filename);
          const targetRef =
            metadata.requestNumber || metadata.containerNumber || metadata.poNumber || metadata.shipmentId || "DOC";
          const readableName = computeReadableName(targetRef, metadata.kind, 1, ext);
          const storageKey = computeStorageKey(metadata.kind, targetRef, Date.now(), fileId, ext);

          let warehouseName = metadata.warehouse ?? null;
          if (!warehouseName && actor.warehouseId) {
            const whRes = await this.client.select<Record<string, unknown>>(
              "warehouses",
              `select=*&id=eq.${encodeURIComponent(actor.warehouseId)}`,
              token,
            );
            if (whRes.ok && whRes.value[0]) {
              warehouseName = String(whRes.value[0].name);
            }
          }

          const insertRes = await this.client.insert<Record<string, unknown>>(
            "documents",
            {
              id: fileId,
              kind: metadata.kind,
              category: categoryForKind(metadata.kind),
              shipment_id: metadata.shipmentId ?? null,
              purchase_order_id: null,
              request_id: metadata.requestId ?? null,
              request_number: metadata.requestNumber ?? null,
              po_number: metadata.poNumber ?? null,
              container_number: metadata.containerNumber ?? null,
              warehouse: warehouseName,
              notes: metadata.notes ?? null,
              original_filename: metadata.filename,
              readable_name: readableName,
              status: "pending",
              name: readableName,
              mime: metadata.mime,
              byte_size: metadata.byteSize,
              storage_key: storageKey,
              created_by: actor.id,
            },
            token,
          );
          if (!insertRes.ok) return insertRes;

          return ok({
            fileId,
            uploadUrl: `/api/files/${fileId}`,
            storageKey,
            readableName,
          });
        },
        confirmUpload: async (input: ConfirmUploadInput): Promise<Result<DocumentRecord>> => {
          const { token } = await this.resolveActor(input.actorId);
          const docRes = await this.client.select<Record<string, unknown>>(
            "documents",
            `select=*&id=eq.${encodeURIComponent(input.fileId)}`,
            token,
          );
          if (!docRes.ok || docRes.value.length === 0) {
            return fail("Upload target not found or expired.");
          }
          const pendingDoc = mapDocument(docRes.value[0]);
          if (pendingDoc.status === "active") {
            return ok(pendingDoc);
          }

          let finalByteSize = pendingDoc.byteSize;
          let finalMime = pendingDoc.mime;
          if (input.bytesBase64) {
            const bytes = Buffer.from(input.bytesBase64, "base64");
            const detected = detectFileType(bytes);
            if (!detected.valid) {
              return fail(detected.error || "Unsupported or invalid file content.");
            }
            if (pendingDoc.kind === "photo" && !detected.mime.startsWith("image/")) {
              return fail("Photo uploads must be valid JPEG, PNG, WebP, or GIF images.");
            }
            finalByteSize = bytes.byteLength;
            finalMime = detected.mime;
            const uploadRes = await this.client.storage.upload(pendingDoc.storageKey, bytes, finalMime, token);
            if (!uploadRes.ok) return uploadRes;
          }

          const updatedRes = await this.client.update<Record<string, unknown>>(
            "documents",
            `id=eq.${encodeURIComponent(pendingDoc.id)}`,
            {
              status: "active",
              byte_size: finalByteSize,
              mime: finalMime,
            },
            token,
          );
          if (!updatedRes.ok) return updatedRes;
          const activeDoc = mapDocument(updatedRes.value);

          if (activeDoc.kind === "photo" && activeDoc.requestId) {
            await this.client.insert(
              "request_photos",
              {
                request_id: activeDoc.requestId,
                document_id: activeDoc.id,
              },
              token,
              { upsert: true, onConflict: "request_id,document_id" },
            );
          }

          return ok(activeDoc);
        },
      },

      directory: {
        warehouses: async () => (await this.snapshot()).warehouses,
        companies: async () => (await this.snapshot()).companies,
        materials: async () => (await this.snapshot()).materials,
        packagingTypes: async () => (await this.snapshot()).packagingTypes,
        addPackagingType: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "packaging:manage");
          if (!input.label.trim() || input.tareKg === null || !Number.isFinite(input.tareKg) || input.tareKg < 0) {
            return fail("Packaging type name and tare weight (zero or greater) are required.");
          }
          const res = await this.client.insert<Record<string, unknown>>(
            "packaging_types",
            {
              name: input.label.trim(),
              tare_kg: roundKg(input.tareKg),
              active: true,
            },
            token,
          );
          if (!res.ok) return res;
          return ok(mapPackagingType(res.value));
        },
      },
    };
  }
}

export function createSupabaseAdapter(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
  now: () => string = () => new Date().toISOString(),
): SupabaseAdapter {
  return new SupabaseAdapter(createSupabaseRestClient(env, fetchImpl), now);
}
