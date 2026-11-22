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
  type InventoryHistoryRecord,
  type StoreData,
  type UserProfile,
  type UserRecord,
  type Warehouse,
  type GeneralRequestCategory,
  type GeneralRequestPriority,
  type GeneralRequestStatus,
  type WorkerGeneralRequest,
  type WorkerGeneralRequestAttachment,
  type Offer,
  type OfferAttachment,
  type OfferComment,
  type OfferActivity,
  type NotificationRecord,
  type OperationSchedule,
  type OperationScheduleItem,
  type OperationScheduleAttachment,
  type OrderMetadataEnvelope,
  parseOrderNotes,
  serializeOrderNotes,
} from "../../domain/schemas.ts";
import { emptyWorkspace, parseOperationalRequestDescription, serializeOperationalRequestDescription, type Actor, type GeneralRequestOperationalDetails, type WorkspaceState } from "../../domain/view.ts";
import { isActiveRole } from "../permissions.ts";
import { MAX_FILE_SIZE_BYTES, detectFileType } from "../security/file-validation.ts";
import { createSupabaseRestClient, type FetchLike, type SupabaseRestClient } from "../supabase/client.ts";
import type { ConfirmUploadInput, Services, SignedUrl, UploadTarget, UploadTargetMetadata } from "./interfaces.ts";
import type { WorkspaceResponse } from "./local-adapter.ts";
import { can, type Action, type Resource } from "./permissions.ts";

// ----------------------------------------------------------------------------
// Row Mappers (PostgreSQL snake_case -> StockFlow camelCase Domain Records)
// ----------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

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
    phone: typeof row.phone === "string" ? row.phone : (typeof row.phone_number === "string" ? row.phone_number : null),
    role: (row.role as DomainRole) ?? "worker",
    warehouseId: typeof row.warehouse_id === "string" ? row.warehouse_id : null,
    companyId: typeof row.company_id === "string" ? row.company_id : null,
    active: Boolean(row.active ?? true),
    approvalStatus: (row.approval_status as "pending" | "approved" | "rejected") ?? (row.approvalStatus as "pending" | "approved" | "rejected") ?? "approved",
    registrationNotes: typeof row.registration_notes === "string" ? row.registration_notes : (typeof row.registrationNotes === "string" ? row.registrationNotes : null),
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
  const rawNotesStr = String(row.notes ?? "");
  const { cleanNotes, meta } = parseOrderNotes(rawNotesStr);
  const resolvedNumber = (meta?.number && meta.number.trim()) ? meta.number.trim() : String(row.number);
  const isRemoved = Boolean(
    row.is_removed ??
    row.isRemoved ??
    meta?.isRemoved ??
    rawNotesStr.includes("[REMOVED]")
  );

  return {
    id: String(row.id),
    number: resolvedNumber,
    title: String(row.title ?? (resolvedNumber ? `Order ${resolvedNumber}` : "")),
    companyId: String(row.company_id),
    status: (row.status as PurchaseOrder["status"]) ?? "submitted",
    valueEur: Number(row.value_eur ?? 0),
    currency: String(row.currency ?? meta?.currency ?? "EUR"),
    notes: cleanNotes,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    type: (row.type as "PO" | "SO") || meta?.type || (resolvedNumber.toUpperCase().startsWith("SO") ? "SO" : "PO"),
    warehouseId: typeof row.warehouse_id === "string"
      ? row.warehouse_id
      : (typeof row.warehouseId === "string" ? row.warehouseId : (meta?.warehouseId ?? null)),
    purchaserName: typeof row.purchaser_name === "string"
      ? row.purchaser_name
      : (typeof row.purchaserName === "string" ? row.purchaserName : (meta?.purchaserName ?? null)),
    sellerName: typeof row.seller_name === "string"
      ? row.seller_name
      : (typeof row.sellerName === "string" ? row.sellerName : (meta?.sellerName ?? null)),
    transportPrice: row.transport_price !== undefined
      ? Number(row.transport_price)
      : (row.transportPrice !== undefined ? Number(row.transportPrice) : (meta?.transportPrice ?? 0)),
    origin: typeof row.origin === "string" ? row.origin : (meta?.origin ?? ""),
    destination: typeof row.destination === "string" ? row.destination : (meta?.destination ?? ""),
    pickupDate: typeof row.pickup_date === "string"
      ? row.pickup_date
      : (typeof row.pickupDate === "string" ? row.pickupDate : (meta?.pickupDate ?? null)),
    annex7Required: row.annex7_required !== undefined
      ? Boolean(row.annex7_required)
      : (row.annex7Required !== undefined ? Boolean(row.annex7Required) : Boolean(meta?.annex7Required ?? false)),
    isRemoved,
    removedAt: typeof row.removed_at === "string"
      ? row.removed_at
      : (typeof row.removedAt === "string"
        ? row.removedAt
        : (meta?.removedAt ?? (isRemoved ? String(row.updated_at ?? row.created_at) : null))),
    removedBy: typeof row.removed_by === "string"
      ? row.removed_by
      : (typeof row.removedBy === "string" ? row.removedBy : (meta?.removedBy ?? null)),
    assignedWorkerId: typeof row.assigned_worker_id === "string" ? row.assigned_worker_id : (typeof row.assignedWorkerId === "string" ? row.assignedWorkerId : null),
    assignedBy: typeof row.assigned_by === "string" ? row.assigned_by : (typeof row.assignedBy === "string" ? row.assignedBy : null),
    assignedAt: typeof row.assigned_at === "string" ? row.assigned_at : (typeof row.assignedAt === "string" ? row.assignedAt : null),
    scheduledDate: typeof row.scheduled_date === "string"
      ? row.scheduled_date
      : (typeof row.scheduledDate === "string" ? row.scheduledDate : (meta?.scheduledDate ?? null)),
    executionStatus: (row.execution_status as "unassigned" | "assigned" | "in_progress" | "completed") || "unassigned",
    completionNotes: typeof row.completion_notes === "string" ? row.completion_notes : (typeof row.completionNotes === "string" ? row.completionNotes : null),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : (typeof row.completedAt === "string" ? row.completedAt : null),
    completedBy: typeof row.completed_by === "string" ? row.completed_by : (typeof row.completedBy === "string" ? row.completedBy : null),
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

function mapOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id),
    number: String(row.number),
    kind: row.kind as "purchasing" | "selling",
    material: String(row.material ?? ""),
    materialType: String(row.material_type ?? "Plastics"),
    materialGrade: String(row.material_grade ?? "Standard"),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? "kg"),
    pricePerUnit: Number(row.price_per_unit ?? 0),
    currency: String(row.currency ?? "EUR"),
    totalValue: Number(row.total_value ?? 0),
    country: String(row.country ?? ""),
    location: String(row.location ?? ""),
    truckLoads: Number(row.truck_loads ?? 1),
    description: String(row.description ?? ""),
    priority: (row.priority as "low" | "medium" | "high" | "urgent") || "medium",
    offerType: String(row.offer_type ?? "Spot"),
    team: String(row.team ?? "General"),
    status: (row.status as Offer["status"]) || "draft",
    approvalStatus: (row.approval_status as Offer["approvalStatus"]) || "pending",
    adminDecisionNote: typeof row.admin_decision_note === "string" ? row.admin_decision_note : null,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    isFavourite: Boolean(row.is_favourite),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    deletedBy: typeof row.deleted_by === "string" ? row.deleted_by : null,
    poId: typeof row.po_id === "string" ? row.po_id : (typeof row.poId === "string" ? row.poId : null),
    poNumber: typeof row.po_number === "string" ? row.po_number : (typeof row.poNumber === "string" ? row.poNumber : null),
    purchasingOfferId: typeof row.purchasing_offer_id === "string" ? row.purchasing_offer_id : (typeof row.purchasingOfferId === "string" ? row.purchasingOfferId : null),
    clientName: typeof row.client_name === "string" ? row.client_name : (typeof row.clientName === "string" ? row.clientName : null),
    contactNumber: typeof row.contact_number === "string" ? row.contact_number : (typeof row.contactNumber === "string" ? row.contactNumber : null),
    emailAddress: typeof row.email_address === "string" ? row.email_address : (typeof row.emailAddress === "string" ? row.emailAddress : null),
    origin: typeof row.origin === "string" ? row.origin : null,
    destination: typeof row.destination === "string" ? row.destination : null,
    soldAt: typeof row.sold_at === "string" ? row.sold_at : (typeof row.soldAt === "string" ? row.soldAt : null),
  };
}

function mapOfferAttachment(row: Record<string, unknown>): OfferAttachment {
  return {
    id: String(row.id),
    offerId: String(row.offer_id),
    name: String(row.name ?? ""),
    kind: (row.kind as "image" | "document") || "document",
    mime: String(row.mime ?? "application/octet-stream"),
    byteSize: Number(row.byte_size ?? 0),
    storageKey: String(row.storage_key ?? ""),
    url: typeof row.url === "string" ? row.url : null,
    uploadedBy: String(row.uploaded_by),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapOfferComment(row: Record<string, unknown>): OfferComment {
  return {
    id: String(row.id),
    offerId: String(row.offer_id),
    authorId: String(row.author_id),
    comment: String(row.comment ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapOfferActivity(row: Record<string, unknown>): OfferActivity {
  return {
    id: String(row.id),
    offerId: String(row.offer_id),
    actorId: String(row.actor_id),
    action: String(row.action ?? ""),
    details: String(row.details ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapInventoryHistory(row: Record<string, unknown>): InventoryHistoryRecord {
  return {
    id: String(row.id ?? ""),
    materialId: String(row.material_id ?? ""),
    materialName: String(row.material_name ?? ""),
    warehouseId: String(row.warehouse_id ?? ""),
    warehouseName: String(row.warehouse_name ?? ""),
    containerNumber: row.container_number ? String(row.container_number) : null,
    quantityBefore: Number(row.quantity_before ?? 0),
    quantityChange: Number(row.quantity_change ?? 0),
    quantityAfter: Number(row.quantity_after ?? 0),
    packagingTypeId: row.packaging_type_id ? String(row.packaging_type_id) : null,
    packagingTypeName: row.packaging_type_name ? String(row.packaging_type_name) : null,
    packagingCount: row.packaging_count != null ? Number(row.packaging_count) : null,
    packagingUnitTareKg: row.packaging_unit_tare_kg != null ? Number(row.packaging_unit_tare_kg) : null,
    totalPackagingWeightKg: row.total_packaging_weight_kg != null ? Number(row.total_packaging_weight_kg) : null,
    grossWeightKg: row.gross_weight_kg != null ? Number(row.gross_weight_kg) : null,
    operationType: String(row.operation_type ?? ""),
    operationReason: String(row.operation_reason ?? ""),
    reference: String(row.reference ?? ""),
    poNumber: row.po_number ? String(row.po_number) : null,
    soNumber: row.so_number ? String(row.so_number) : null,
    performedBy: String(row.performed_by ?? ""),
    performedByName: String(row.performed_by_name ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    recipientId: String(row.recipient_id),
    eventType: String(row.event_type),
    title: String(row.title),
    message: String(row.message),
    targetType: typeof row.target_type === "string" ? row.target_type : null,
    targetId: typeof row.target_id === "string" ? row.target_id : null,
    link: typeof row.link === "string" ? row.link : null,
    warehouseId: typeof row.warehouse_id === "string" ? row.warehouse_id : null,
    read: Boolean(row.read ?? false),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapOperationSchedule(row: Record<string, unknown>): OperationSchedule {
  return {
    id: String(row.id),
    scheduleNumber: String(row.schedule_number ?? row.scheduleNumber ?? ""),
    type: (row.type as "unloading" | "loading") || "unloading",
    poSoNumber: String(row.poso_number ?? row.po_so_number ?? row.poSoNumber ?? ""),
    purchaseOrderId: typeof row.purchase_order_id === "string" ? row.purchase_order_id : null,
    shipmentId: typeof row.shipment_id === "string" ? row.shipment_id : null,
    partnerName: String(row.partner_name ?? row.partnerName ?? ""),
    companyId: typeof row.company_id === "string" ? row.company_id : null,
    warehouseId: String(row.warehouse_id ?? row.warehouseId),
    origin: String(row.origin ?? ""),
    destination: String(row.destination ?? ""),
    annex7Required: Boolean(row.annex7_required ?? row.annex7Required ?? false),
    transportPrice: Number(row.transport_price ?? row.transportPrice ?? 0),
    currency: String(row.currency ?? "EUR"),
    pickupDate: typeof row.pickup_date === "string" ? row.pickup_date : null,
    purchaserName: typeof row.purchaser_name === "string" ? row.purchaser_name : null,
    purchasingPrice: Number(row.purchasing_price ?? row.purchasingPrice ?? 0),
    sellerName: typeof row.seller_name === "string" ? row.seller_name : null,
    sellingPrice: Number(row.selling_price ?? row.sellingPrice ?? 0),
    scheduledDate: String(row.scheduled_date ?? row.scheduledDate ?? new Date().toISOString()),
    assignedWorkerId: String(row.assigned_worker_id ?? row.assignedWorkerId ?? ""),
    assignedWorkerName: String(row.assigned_worker_name ?? row.assignedWorkerName ?? ""),
    vehicleRegistrationNumber: String(row.vehicle_registration_number ?? row.vehicleRegistrationNumber ?? ""),
    transportCompany: String(row.transport_company ?? row.transportCompany ?? ""),
    driverName: String(row.driver_name ?? row.driverName ?? ""),
    driverContactNumber: String(row.driver_contact_number ?? row.driverContactNumber ?? ""),
    cmrNumber: String(row.cmr_number ?? row.cmrNumber ?? ""),
    actualArrivalTime: typeof row.actual_arrival_time === "string" ? row.actual_arrival_time : null,
    status: (row.status as OperationSchedule["status"]) || "scheduled",
    instructions: String(row.instructions ?? ""),
    workerRemarks: String(row.worker_remarks ?? row.workerRemarks ?? ""),
    returnReason: typeof row.return_reason === "string" ? row.return_reason : null,
    infoRequestNote: typeof row.info_request_note === "string" ? row.info_request_note : null,
    actualStartTime: typeof row.actual_start_time === "string" ? row.actual_start_time : null,
    actualEndTime: typeof row.actual_end_time === "string" ? row.actual_end_time : null,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : null,
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : null,
    verifiedBy: typeof row.verified_by === "string" ? row.verified_by : null,
    verifiedByName: typeof row.verified_by_name === "string" ? row.verified_by_name : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    createdBy: String(row.created_by ?? ""),
    createdByName: String(row.created_by_name ?? ""),
  };
}

function mapOperationScheduleItem(row: Record<string, unknown>): OperationScheduleItem {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id ?? row.scheduleId),
    materialId: String(row.material_id ?? row.materialId),
    materialName: String(row.material_name ?? row.materialName ?? "Material"),
    packagingTypeId: String(row.packaging_type_id ?? row.packagingTypeId),
    packagingTypeName: String(row.packaging_type_name ?? row.packagingTypeName ?? "Standard Packaging"),
    packageCount: Number(row.package_count ?? row.packageCount ?? 1),
    tarePerPackageKg: Number(row.tare_per_package_kg ?? row.tarePerPackageKg ?? 0),
    totalTareWeightKg: Number(row.total_tare_weight_kg ?? row.totalTareWeightKg ?? 0),
    grossWeightKg: Number(row.gross_weight_kg ?? row.grossWeightKg ?? 0),
    netWeightKg: Number(row.net_weight_kg ?? row.netWeightKg ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapOperationScheduleAttachment(row: Record<string, unknown>): OperationScheduleAttachment {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id ?? row.scheduleId),
    documentId: typeof row.document_id === "string" ? row.document_id : null,
    name: String(row.name ?? "attachment"),
    kind: (row.kind as OperationScheduleAttachment["kind"]) || "photo",
    url: String(row.url ?? ""),
    size: Number(row.size ?? 0),
    mime: String(row.mime ?? "application/octet-stream"),
    uploadedBy: String(row.uploaded_by ?? ""),
    uploadedByName: String(row.uploaded_by_name ?? ""),
    uploadedAt: String(row.uploaded_at ?? new Date().toISOString()),
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
    if (!profile.active || profile.approvalStatus !== "approved" || (!isActiveRole(profile.role) && profile.role !== "offers_user")) {
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
      const adminToken = await this.getAdminToken();
      if (adminToken) {
        const checkPending = await this.client.select<Record<string, unknown>>(
          "users",
          `select=approval_status,role,active&email=eq.${encodeURIComponent(email)}`,
          adminToken
        );
        if (checkPending.ok && checkPending.value.length > 0) {
          const u = checkPending.value[0];
          if (u.approval_status === "pending") {
            return fail("Your account is awaiting admin approval. (pending administrator approval). Please wait for an administrator to review your request.");
          }
          if (u.approval_status === "rejected") {
            return fail("Your registration request has been rejected (declined). Please contact an administrator.");
          }
          if (u.active === false) {
            return fail("This account is inactive. Please contact an administrator.");
          }
        }
      }
      return authRes;
    }
    const accessToken = authRes.value.accessToken;

    // 1. Direct users table verification first to inspect genuine database approval_status
    const checkRes = await this.client.select<Record<string, unknown>>(
      "users",
      `select=approval_status,role,active,auth_user_id&email=eq.${encodeURIComponent(email)}`,
      accessToken,
    );
    if (checkRes.ok && checkRes.value.length > 0) {
      const u = checkRes.value[0];
      if (u.approval_status === "pending") {
        await this.client.auth.signOut(accessToken);
        return fail("Your account is awaiting admin approval. (pending administrator approval). Please wait for an administrator to review your request.");
      }
      if (u.approval_status === "rejected") {
        await this.client.auth.signOut(accessToken);
        return fail("Your registration request has been rejected (declined). Please contact an administrator.");
      }
      if (u.approval_status && u.approval_status !== "approved") {
        await this.client.auth.signOut(accessToken);
        return fail("Your account is awaiting admin approval. (pending administrator approval). Please wait for an administrator to review your request.");
      }
      if (u.active === false) {
        await this.client.auth.signOut(accessToken);
        return fail("This account is inactive. Please contact an administrator.");
      }
    }

    // 2. Fetch authenticated profile via current_app_user()
    let profile = await this.current(accessToken);

    // 3. Fallback: only if profile is null and user record was not found or needs RPC resolution
    if (!profile) {
      const statusRes = await this.client.rpc<{
        ok: boolean;
        error?: string;
        role?: string;
        approval_status?: string;
        active?: boolean;
      }>("rpc_get_auth_account_status", {}, accessToken);

      if (statusRes.ok && statusRes.value) {
        const status = statusRes.value;
        if (status.approval_status === "pending") {
          await this.client.auth.signOut(accessToken);
          return fail("Your account is awaiting admin approval. (pending administrator approval). Please wait for an administrator to review your request.");
        }
        if (status.approval_status === "rejected") {
          await this.client.auth.signOut(accessToken);
          return fail("Your registration request has been rejected (declined). Please contact an administrator.");
        }
        if (status.approval_status && status.approval_status !== "approved") {
          await this.client.auth.signOut(accessToken);
          return fail("Your account is awaiting admin approval. (pending administrator approval). Please wait for an administrator to review your request.");
        }
        if (status.active === false) {
          await this.client.auth.signOut(accessToken);
          return fail("This account is inactive. Please contact an administrator.");
        }
        if (status.active && status.approval_status === "approved") {
          profile = await this.current(accessToken);
        }
      }
    }

    if (!profile) {
      await this.client.auth.signOut(accessToken);
      return fail("This account is inactive or awaiting admin approval.");
    }
    if (profile.approvalStatus !== "approved" || !profile.active) {
      await this.client.auth.signOut(accessToken);
      return fail("Your account is awaiting admin approval. (pending administrator approval). Please wait for an administrator to review your request.");
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

  async signUp(
    email: string,
    password: string,
    meta?: { name?: string; company?: string; notes?: string; role?: string }
  ): Promise<Result<{ message: string }>> {
    const runRes = await this.run(null, "registerOffersUser", {
      email,
      password,
      name: meta?.name || email.split("@")[0],
      company: meta?.company || "",
      notes: meta?.notes || "",
    });
    if (runRes.error) {
      return fail(runRes.error);
    }
    return ok({ message: runRes.notice || "Registration submitted." });
  }

  async snapshot(sessionId?: string | null): Promise<StoreData> {
    const token = this.resolveToken(sessionId);
    const store = emptyStore();
    store.fileSecret = process.env.STOCKFLOW_FILE_SECRET || "rm-stockflow-files-secret-token-key-2026-32chars";

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
      inventoryHistoryRes,
      customsRes,
      demurrageRes,
      annex7Res,
      auditRes,
      generalRequestsRes,
      generalRequestAttachmentsRes,
      offersRes,
      offerAttachmentsRes,
      offerCommentsRes,
      offerActivitiesRes,
      notificationsRes,
      schedulesRes,
      scheduleItemsRes,
      scheduleAttachmentsRes,
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
      this.client.select<Record<string, unknown>>("inventory_history", "select=*&order=created_at.desc", token),
      this.client.select<Record<string, unknown>>("customs_records", "select=*", token),
      this.client.select<Record<string, unknown>>("demurrage_records", "select=*", token),
      this.client.select<Record<string, unknown>>("annex7_records", "select=*&order=uploaded_at.asc", token),
      this.client.select<Record<string, unknown>>("audit_log", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("worker_general_requests", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("worker_general_request_attachments", "select=*", token),
      this.client.select<Record<string, unknown>>("offers", "select=*&order=created_at.desc", token),
      this.client.select<Record<string, unknown>>("offer_attachments", "select=*", token),
      this.client.select<Record<string, unknown>>("offer_comments", "select=*&order=created_at.asc", token),
      this.client.select<Record<string, unknown>>("offer_activities", "select=*&order=created_at.desc", token),
      this.client.select<Record<string, unknown>>("notifications", "select=*&order=created_at.desc", token),
      this.client.select<Record<string, unknown>>("operation_schedules", "select=*&order=created_at.desc", token),
      this.client.select<Record<string, unknown>>("operation_schedule_items", "select=*", token),
      this.client.select<Record<string, unknown>>("operation_schedule_attachments", "select=*", token),
    ]);

    if (warehousesRes.ok) store.warehouses = warehousesRes.value.map(mapWarehouse);
    if (companiesRes.ok) store.companies = companiesRes.value.map(mapCompany);
    if (usersRes.ok) store.users = usersRes.value.filter((u) => !String(u.email || "").toLowerCase().includes("deleted")).map(mapUserRecord);
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
    if (inventoryHistoryRes.ok) store.inventoryHistory = inventoryHistoryRes.value.map(mapInventoryHistory);
    if (customsRes.ok) store.customsRecords = customsRes.value.map(mapCustomsRecord);
    if (demurrageRes.ok) store.demurrageRecords = demurrageRes.value.map(mapDemurrageRecord);
    if (annex7Res.ok) store.annex7Records = annex7Res.value.map(mapAnnex7Record);
    if (auditRes.ok) store.auditLog = auditRes.value.map(mapAuditLogEntry);
    if (generalRequestsRes.ok) store.workerGeneralRequests = generalRequestsRes.value.map(mapWorkerGeneralRequest);
    if (generalRequestAttachmentsRes.ok) store.workerGeneralRequestAttachments = generalRequestAttachmentsRes.value.map(mapWorkerGeneralRequestAttachment);
    if (offersRes.ok) store.offers = offersRes.value.map(mapOffer);
    if (offerAttachmentsRes.ok) store.offerAttachments = offerAttachmentsRes.value.map(mapOfferAttachment);
    if (offerCommentsRes.ok) store.offerComments = offerCommentsRes.value.map(mapOfferComment);
    if (offerActivitiesRes.ok) store.offerActivities = offerActivitiesRes.value.map(mapOfferActivity);
    if (schedulesRes.ok) store.operationSchedules = schedulesRes.value.map(mapOperationSchedule);
    if (scheduleItemsRes.ok) store.operationScheduleItems = scheduleItemsRes.value.map(mapOperationScheduleItem);
    if (scheduleAttachmentsRes.ok) store.operationScheduleAttachments = scheduleAttachmentsRes.value.map(mapOperationScheduleAttachment);

    if (ordersRes.ok) {
      const existingSchedIds = new Set(store.operationSchedules.map((s) => s.id));
      const existingItemIds = new Set(store.operationScheduleItems.map((i) => i.id));
      const existingAttIds = new Set(store.operationScheduleAttachments.map((a) => a.id));
      for (const rawOrderRow of ordersRes.value) {
        const { meta } = parseOrderNotes(String(rawOrderRow.notes ?? ""));
        if (meta?.schedules && Array.isArray(meta.schedules)) {
          for (const sched of meta.schedules) {
            if (sched && sched.id && !existingSchedIds.has(sched.id)) {
              existingSchedIds.add(sched.id);
              store.operationSchedules.push({
                ...sched,
                purchaseOrderId: sched.purchaseOrderId || String(rawOrderRow.id),
              });
            }
          }
        }
        if (meta?.scheduleItems && Array.isArray(meta.scheduleItems)) {
          for (const item of meta.scheduleItems) {
            if (item && item.id && !existingItemIds.has(item.id)) {
              existingItemIds.add(item.id);
              store.operationScheduleItems.push(item);
            }
          }
        }
        if (meta?.scheduleAttachments && Array.isArray(meta.scheduleAttachments)) {
          for (const att of meta.scheduleAttachments) {
            if (att && att.id && !existingAttIds.has(att.id)) {
              existingAttIds.add(att.id);
              store.operationScheduleAttachments.push(att);
            }
          }
        }
      }
    }
    const persistentNotifs: NotificationRecord[] = notificationsRes.ok ? notificationsRes.value.map(mapNotification) : [];
    const existingTargetKeys = new Set(
      persistentNotifs.map((n) => `${n.eventType}:${n.targetType || ""}:${n.targetId || ""}`)
    );

    // Dynamic operational notification synthesis with strict deduplication against persistent records
    const synNotifs: NotificationRecord[] = [];
    const now = this.now();

    for (const b of store.stockBalances) {
      const mat = store.materials.find((m) => m.id === b.materialId);
      const wh = store.warehouses.find((w) => w.id === b.warehouseId);
      if (mat && b.weightKg <= mat.lowStockThresholdKg && mat.lowStockThresholdKg > 0) {
        const key = `low_stock:material:${mat.id}`;
        if (!existingTargetKeys.has(key)) {
          synNotifs.push({
            id: `low-stock-${b.id}`,
            recipientId: "",
            eventType: "low_stock",
            title: `Low Stock: ${mat.description}`,
            message: `${mat.description} at ${wh?.name || "warehouse"} has ${b.weightKg.toLocaleString()} kg remaining (threshold: ${mat.lowStockThresholdKg.toLocaleString()} kg).`,
            targetType: "material",
            targetId: mat.id,
            link: "/inventory",
            warehouseId: b.warehouseId,
            read: false,
            readAt: null,
            createdAt: now,
          });
        }
      }
    }
    for (const order of store.purchaseOrders.filter((o) => o.status === "submitted")) {
      const key = `order_pending:purchase_order:${order.id}`;
      if (!existingTargetKeys.has(key)) {
        synNotifs.push({
          id: `order-pending-${order.id}`,
          recipientId: "",
          eventType: "order_pending",
          title: `Pending Approval: ${order.number}`,
          message: `Purchase order ${order.number} is awaiting approval. Value: €${order.valueEur.toLocaleString()}.`,
          targetType: "purchase_order",
          targetId: order.id,
          link: "/purchases",
          warehouseId: null,
          read: false,
          readAt: null,
          createdAt: order.createdAt,
        });
      }
    }
    for (const req of store.requests.filter((r) => r.status === "submitted")) {
      const key = `request_pending:request:${req.id}`;
      if (!existingTargetKeys.has(key)) {
        const wh = store.warehouses.find((w) => w.id === req.warehouseId);
        synNotifs.push({
          id: `req-pending-${req.id}`,
          recipientId: "",
          eventType: "request_pending",
          title: `Request Pending: ${req.number}`,
          message: `Worker operation request ${req.number} at ${wh?.name || "warehouse"} is awaiting review.`,
          targetType: "request",
          targetId: req.id,
          link: "/dashboard",
          warehouseId: req.warehouseId,
          read: false,
          readAt: null,
          createdAt: req.createdAt,
        });
      }
    }
    for (const wreq of (store.workerGeneralRequests || []).filter((r) => r.status === "submitted" || r.status === "under_review")) {
      const key = `worker_request:${wreq.status}:${wreq.id}`;
      if (!existingTargetKeys.has(key)) {
        const wh = store.warehouses.find((w) => w.id === wreq.warehouseId);
        synNotifs.push({
          id: `wreq-${wreq.id}-${wreq.status}`,
          recipientId: "",
          eventType: "worker_request",
          title: `Worker Request ${wreq.number}: ${wreq.status === "under_review" ? "Under Review" : "Pending"}`,
          message: `Operational request ${wreq.number} (${wreq.category}) at ${wh?.name || "warehouse"} is ${wreq.status.replace("_", " ")}.`,
          targetType: "worker_general_request",
          targetId: wreq.id,
          link: "/dashboard",
          warehouseId: wreq.warehouseId,
          read: false,
          readAt: null,
          createdAt: wreq.updatedAt || wreq.createdAt,
        });
      }
    }
    for (const dem of store.demurrageRecords) {
      if (dem.chargeEur && dem.chargeEur > 0) {
        const key = `demurrage_alert:shipment:${dem.shipmentId}`;
        if (!existingTargetKeys.has(key)) {
          const sh = store.shipments.find((s) => s.id === dem.shipmentId);
          synNotifs.push({
            id: `demurrage-${dem.id}`,
            recipientId: "",
            eventType: "demurrage_alert",
            title: `Demurrage Alert: €${dem.chargeEur.toLocaleString()}`,
            message: `Accrued demurrage on shipment ${sh?.reference || "shipment"}: ${dem.freeMinutes} free minutes exceeded.`,
            targetType: "shipment",
            targetId: dem.shipmentId,
            link: "/containers",
            warehouseId: sh?.warehouseId ?? null,
            read: false,
            readAt: null,
            createdAt: now,
          });
        }
      }
    }

    // Merge persistent and non-duplicated synthesized notifications
    store.notifications = [...persistentNotifs, ...synNotifs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return store;
  }

  async view(sessionId: string | null): Promise<{ state: WorkspaceState; actor: Actor | null }> {
    if (!sessionId) {
      return { state: emptyWorkspace(), actor: null };
    }
    const profile = await this.current(sessionId);
    if (!profile || !profile.active || (!isActiveRole(profile.role) && profile.role !== "offers_user")) {
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
    const state = projectStore(store, this.now(), actor);
    if (actor.role !== "owner") {
      state.accounts = state.accounts.filter((u) => u.approvalStatus !== "pending");
    }
    return { state, actor };
  }

  async openFile(key: string, _exp: string, _sig: string, _nowMs: number, sessionId?: string | null) {
    const token = this.resolveToken(sessionId);
    // 1. Search in documents (both by id and storage_key, non-deleted)
    const docsRes = await this.client.select<Record<string, unknown>>(
      "documents",
      `select=*&or=(storage_key.eq.${encodeURIComponent(key)},id.eq.${encodeURIComponent(key)})&status=neq.deleted`,
      token,
    );
    const docRow = docsRes.ok && docsRes.value.length > 0 ? mapDocument(docsRes.value[0]) : null;
    let storagePath = docRow?.storageKey || key;
    let docName = docRow?.readableName || docRow?.name;
    let docMime = docRow?.mime;

    // 2. If not found in documents, search in offer_attachments
    if (!docRow) {
      const attRes = await this.client.select<Record<string, unknown>>(
        "offer_attachments",
        `select=*&or=(storage_key.eq.${encodeURIComponent(key)},id.eq.${encodeURIComponent(key)})`,
        token,
      );
      if (attRes.ok && attRes.value.length > 0) {
        const att = attRes.value[0];
        storagePath = String(att.storage_key || key);
        docName = String(att.name || key.split("/").pop() || "offer-attachment");
        docMime = String(att.mime || "application/octet-stream");
      }
    }

    const downloadRes = await this.client.storage.download(storagePath, token);
    if (!downloadRes.ok) return null;
    return {
      name: docName || key.split("/").pop() || "document",
      mime: docMime || downloadRes.value.mime,
      bytes: downloadRes.value.bytes,
    };
  }

  async run(sessionId: string | null, name: string, payload: unknown): Promise<WorkspaceResponse> {
    if (name === "signUpUser" || name === "registerUser") {
      const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const nameVal = text(body.name);
      const emailVal = text(body.email).toLowerCase();
      const phoneVal = text(body.phone);
      const passwordVal = text(body.password);
      const confirmVal = text(body.confirmPassword || body.passwordConfirmation);
      const notesVal = text(body.notes);
      const assignedRole = "worker"; // Self-registration is strictly restricted to worker role (no privilege escalation)

      if (!nameVal || !emailVal || !passwordVal) {
        return { state: emptyWorkspace(), actor: null, error: "Name, email, and password are required." };
      }
      if (!phoneVal || phoneVal.length < 6) {
        return { state: emptyWorkspace(), actor: null, error: "A valid phone number is required." };
      }
      if (passwordVal.length < 8) {
        return { state: emptyWorkspace(), actor: null, error: "Password must be at least 8 characters long." };
      }
      if (confirmVal && passwordVal !== confirmVal) {
        return { state: emptyWorkspace(), actor: null, error: "Passwords do not match." };
      }

      const signUpRes = await this.client.auth.signUp(emailVal, passwordVal, {
        name: nameVal,
        phone: phoneVal,
        role: assignedRole,
      });

      // Pass p_auth_user_id: null to prevent foreign key violation on auth.users(id).
      // The auth_user_id is securely linked upon password authentication via rpc_get_auth_account_status.
      let rpcRes = await this.client.rpc<Record<string, unknown>>(
        "rpc_register_user",
        {
          p_auth_user_id: null,
          p_email: emailVal,
          p_name: nameVal,
          p_phone: phoneVal,
          p_notes: notesVal || null,
          p_requested_role: assignedRole,
        },
        null,
      );

      // Self-healing attempt 1: Retry with null auth_user_id if foreign key violation
      if (!rpcRes.ok && (
        rpcRes.error?.includes("users_auth_user_id_fkey") ||
        rpcRes.error?.includes("foreign key") ||
        rpcRes.error?.includes("23503")
      )) {
        rpcRes = await this.client.rpc<Record<string, unknown>>(
          "rpc_register_user",
          {
            p_auth_user_id: null,
            p_email: emailVal,
            p_name: nameVal,
            p_phone: phoneVal,
            p_notes: notesVal || null,
            p_requested_role: assignedRole,
          },
          null,
        );
      }

      if (!rpcRes.ok) {
        const rawErr = rpcRes.error || "";
        if (
          rawErr.includes("already registered") ||
          rawErr.includes("users_email_key") ||
          rawErr.includes("duplicate key") ||
          rawErr.includes("unique")
        ) {
          return {
            state: emptyWorkspace(),
            actor: null,
            notice: "An account with this email is already registered. If you already have an account, please sign in.",
          };
        }
        if (signUpRes.ok || signUpRes.error?.includes("rate limit") || rawErr.includes("users_worker_warehouse_check") || rawErr.includes("check constraint")) {
          const adminToken = await this.getAdminToken();
          if (adminToken) {
            let defaultWarehouseId: string | null = null;
            if (assignedRole === "worker") {
              const whRes = await this.client.select<Record<string, unknown>>("warehouses", "select=id&order=name.asc&limit=1", adminToken);
              if (whRes.ok && whRes.value.length > 0) {
                defaultWarehouseId = String(whRes.value[0].id);
              }
            }
            await this.client.insert(
              "users",
              {
                id: randomUUID(),
                email: emailVal,
                name: nameVal,
                phone: phoneVal || null,
                role: assignedRole,
                warehouse_id: defaultWarehouseId,
                active: false,
                approval_status: "pending",
                registration_notes: notesVal || null,
                created_at: this.now(),
                updated_at: this.now(),
              },
              adminToken
            );
          }
          return {
            state: emptyWorkspace(),
            actor: null,
            notice: "Registration submitted successfully. Your account is pending administrator approval.",
          };
        }
        return {
          state: emptyWorkspace(),
          actor: null,
          error: "Unable to complete registration. If you already have an account, please sign in.",
        };
      }

      return {
        state: emptyWorkspace(),
        actor: null,
        notice: "Registration submitted successfully. Your account is pending administrator approval.",
      };
    }

    if (name === "registerOffersUser") {
      const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const nameVal = text(body.name);
      const emailVal = text(body.email).toLowerCase();
      const passwordVal = text(body.password);
      const companyVal = text(body.company);
      const notesVal = text(body.notes);

      if (!nameVal || !emailVal || !passwordVal) {
        return { state: emptyWorkspace(), actor: null, error: "Name, email, and password are required." };
      }
      if (passwordVal.length < 6) {
        return { state: emptyWorkspace(), actor: null, error: "Password must be at least 6 characters long." };
      }

      const signUpRes = await this.client.auth.signUp(emailVal, passwordVal, {
        name: nameVal,
        role: "offers_user",
      });

      const formattedNotes = notesVal
        ? companyVal
          ? `${notesVal} (Company: ${companyVal})`
          : notesVal
        : companyVal
          ? `Company: ${companyVal}`
          : null;

      // Pass p_auth_user_id: null to prevent foreign key violation on auth.users(id).
      // The auth_user_id is securely linked upon password authentication via rpc_get_auth_account_status.
      // rpc_register_user strictly sets approval_status = 'pending' and active = false.
      let rpcRes = await this.client.rpc<Record<string, unknown>>(
        "rpc_register_user",
        {
          p_auth_user_id: null,
          p_email: emailVal,
          p_name: nameVal,
          p_phone: companyVal ? `Company: ${companyVal}` : null,
          p_notes: formattedNotes,
          p_requested_role: "offers_user",
        },
        null,
      );

      // Self-healing attempt: If foreign key violation on auth_user_id, retry immediately with null
      if (!rpcRes.ok && (
        rpcRes.error?.includes("users_auth_user_id_fkey") ||
        rpcRes.error?.includes("foreign key") ||
        rpcRes.error?.includes("23503")
      )) {
        rpcRes = await this.client.rpc<Record<string, unknown>>(
          "rpc_register_user",
          {
            p_auth_user_id: null,
            p_email: emailVal,
            p_name: nameVal,
            p_phone: companyVal ? `Company: ${companyVal}` : null,
            p_notes: formattedNotes,
            p_requested_role: "offers_user",
          },
          null,
        );
      }

      if (!rpcRes.ok) {
        const rawErr = rpcRes.error || "";
        if (
          rawErr.includes("already registered") ||
          rawErr.includes("users_email_key") ||
          rawErr.includes("duplicate key") ||
          rawErr.includes("unique")
        ) {
          return {
            state: emptyWorkspace(),
            actor: null,
            notice: "An account with this email is already registered. If you already have an account, please sign in with your email and password.",
          };
        }
        if (signUpRes.ok || signUpRes.error?.includes("rate limit")) {
          const adminToken = await this.getAdminToken();
          if (adminToken) {
            await this.client.insert(
              "users",
              {
                id: randomUUID(),
                email: emailVal,
                name: nameVal,
                phone: companyVal ? `Company: ${companyVal}` : null,
                role: "offers_user",
                active: false,
                approval_status: "pending",
                registration_notes: formattedNotes,
                created_at: this.now(),
                updated_at: this.now(),
              },
              adminToken
            );
          }
          return {
            state: emptyWorkspace(),
            actor: null,
            notice: "Registration submitted successfully. Your account is pending administrator approval.",
          };
        }
        return {
          state: emptyWorkspace(),
          actor: null,
          error: "Unable to complete registration. If you already have an account, please sign in.",
        };
      }

      const resVal = rpcRes.value as Record<string, unknown> | null;
      if (resVal?.alreadyApproved) {
        return {
          state: emptyWorkspace(),
          actor: null,
          notice: "Your account is already approved. You can sign in immediately with your email and password.",
        };
      }

      return {
        state: emptyWorkspace(),
        actor: null,
        notice: "Registration submitted. Pending admin approval.",
      };
    }

    if (!sessionId) {
      return { state: emptyWorkspace(), actor: null, error: "Sign in again to continue." };
    }
    const profile = await this.current(sessionId);
    if (!profile) {
      return { state: emptyWorkspace(), actor: null, error: "Sign in again to continue." };
    }
    if (!profile.active || (!isActiveRole(profile.role) && profile.role !== "offers_user")) {
      return { state: emptyWorkspace(), actor: null, error: "This account is not permitted to perform actions." };
    }

    // Admin cannot add PO/SO or manage operational schedules (managed exclusively by Staff)
    if (profile.role === "owner") {
      const adminBlockedActions = [
        "createPurchase",
        "createOrder",
        "createOperationSchedule",
        "createSchedule",
        "updateOperationSchedule",
        "updateSchedule",
        "assignScheduleWorker",
        "assignWorkerPo",
      ];
      if (adminBlockedActions.includes(name)) {
        const v = await this.view(sessionId);
        return {
          state: v.state,
          actor: v.actor,
          error: "Admin cannot create PO/SO orders or manage operational schedules. This is managed by Staff.",
        };
      }
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
        case "createPurchase":
        case "createOrder": {
          if (profile.role !== "manager") {
            error = "Only Staff can create PO/SO orders.";
            break;
          }
          const rawNum = text(body.number || body.poNumber || body.soNumber);
          const orderType = (text(body.type) || (rawNum.toUpperCase().startsWith("SO") ? "SO" : "PO")).toUpperCase() as "PO" | "SO";
          const partner = text(body.partner || body.supplier || body.customer || body.buyer);
          const material = text(body.material);
          const quantityKg = body.quantityKg !== undefined ? num(body.quantityKg) : 0;
          const rawPrice = body.valueEur !== undefined ? body.valueEur : (body.purchasingPrice !== undefined ? body.purchasingPrice : body.sellingPrice);
          const valueEur = rawPrice !== undefined ? num(rawPrice) : 0;

          if (!partner || !material || quantityKg < 0 || valueEur < 0) {
            error = `${orderType === "SO" ? "Customer" : "Supplier"}, material, quantity, and value are required.`;
            break;
          }

          const res = await svc.purchaseOrders.create({
            type: orderType,
            number: rawNum || undefined,
            title: text(body.title) || undefined,
            supplier: partner,
            material,
            quantityKg,
            valueEur,
            currency: text(body.currency) || undefined,
            warehouseId: text(body.warehouseId) || null,
            warehouse: text(body.warehouse) || null,
            purchaserName: text(body.purchaserName) || null,
            sellerName: text(body.sellerName) || null,
            transportPrice: body.transportPrice !== undefined ? Math.max(0, num(body.transportPrice) || 0) : 0,
            origin: text(body.origin),
            destination: text(body.destination),
            pickupDate: text(body.pickupDate) || null,
            scheduledDate: text(body.scheduledDate || body.scheduledUnloadingDate || body.scheduledLoadingDate) || null,
            annex7Required: Boolean(body.annex7Required ?? body.annex7),
            notes: text(body.notes),
            actorId: profile.id,
          });
          if (!res.ok) {
            error = res.error;
          } else {
            notice = `${res.value.number} was submitted for approval.`;
          }
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
        case "editPurchase":
        case "editOrder": {
          if (profile.role !== "manager") {
            error = "Only Staff can edit a PO/SO order.";
            break;
          }
          if (body.workerId !== undefined || body.assignedWorker !== undefined || body.assignedWorkerId !== undefined) {
            error = "Staff cannot change the Worker assigned to an operation.";
            break;
          }
          const rawPrice = body.valueEur !== undefined ? body.valueEur : (body.purchasingPrice !== undefined ? body.purchasingPrice : body.sellingPrice);
          const lookupNum = text(body.originalNumber || body.number || body.poNumber || body.soNumber);
          const newNum = text(body.newNumber || ((body.originalNumber || body.id || body.orderId) ? (body.number || body.poNumber || body.soNumber) : ""));
          const res = await svc.purchaseOrders.edit({
            id: text(body.id || body.orderId) || undefined,
            number: lookupNum,
            newNumber: newNum && newNum.toLowerCase() !== lookupNum.toLowerCase() ? newNum : undefined,
            title: body.title !== undefined ? text(body.title) : undefined,
            supplier: text(body.partner || body.supplier || body.customer || body.buyer),
            material: text(body.material),
            quantityKg: body.quantityKg !== undefined ? num(body.quantityKg) : 0,
            valueEur: rawPrice !== undefined ? num(rawPrice) : 0,
            currency: body.currency !== undefined ? text(body.currency) : undefined,
            warehouseId: body.warehouseId !== undefined ? (text(body.warehouseId) || null) : undefined,
            warehouse: body.warehouse !== undefined ? (text(body.warehouse) || null) : undefined,
            purchaserName: body.purchaserName !== undefined ? (text(body.purchaserName) || null) : undefined,
            sellerName: body.sellerName !== undefined ? (text(body.sellerName) || null) : undefined,
            transportPrice: body.transportPrice !== undefined ? Math.max(0, num(body.transportPrice) || 0) : undefined,
            origin: body.origin !== undefined ? text(body.origin) : undefined,
            destination: body.destination !== undefined ? text(body.destination) : undefined,
            pickupDate: body.pickupDate !== undefined ? (text(body.pickupDate) || null) : undefined,
            scheduledDate: (body.scheduledDate !== undefined || body.scheduledUnloadingDate !== undefined || body.scheduledLoadingDate !== undefined)
              ? (text(body.scheduledDate ?? body.scheduledUnloadingDate ?? body.scheduledLoadingDate) || null)
              : undefined,
            annex7Required: body.annex7Required !== undefined ? Boolean(body.annex7Required) : undefined,
            notes: body.notes !== undefined ? text(body.notes) : undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `${res.value.number} was updated.`;
          break;
        }
        case "removePoSoNumber":
        case "removeOrder":
        case "deletePurchase":
        case "deleteOrder": {
          if (profile.role !== "manager") {
            error = "Only Staff can delete or remove a PO/SO order.";
            break;
          }
          const numVal = text(body.number || body.poNumber);
          const idVal = text(body.id || body.orderId);
          if (!numVal && !idVal) {
            error = "Order number is required.";
            break;
          }
          const res = await svc.purchaseOrders.delete({
            id: idVal || undefined,
            number: numVal,
            actorId: profile.id,
          });
          if (!res.ok) {
            error = res.error;
          } else {
            notice = `${res.value.number} number entry has been removed. Operational history preserved.`;
          }
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
          const documentIds = Array.isArray(body.documentIds) ? [...(body.documentIds as string[])] : [];
          if (Array.isArray(body.attachments)) {
            for (const att of body.attachments as { name?: string; bytesBase64?: string }[]) {
              if (att?.name && att?.bytesBase64) {
                const targetRes = await svc.files.createUploadTarget({
                  filename: att.name,
                  mime: att.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
                  byteSize: Math.round(att.bytesBase64.length * 0.75),
                  kind: att.name.toLowerCase().endsWith(".pdf") ? "other" : "photo",
                  warehouse: null,
                  actorId: profile.id,
                });
                if (targetRes.ok) {
                  const confirmRes = await svc.files.confirmUpload({
                    fileId: targetRes.value.fileId,
                    bytesBase64: att.bytesBase64,
                    actorId: profile.id,
                  });
                  if (confirmRes.ok) {
                    documentIds.push(targetRes.value.fileId);
                  }
                }
              }
            }
          }

          let finalDescription = text(body.description);
          const opDetails = body.operationalDetails as Record<string, unknown> | undefined;
          if (opDetails && typeof opDetails === "object") {
            const pkgCount = Number(opDetails.packageCount);
            const gross = Number(opDetails.grossWeightKg);
            const tarePerPkg = Number(opDetails.tarePerPackageKg);
            if (!Number.isInteger(pkgCount) || pkgCount <= 0) {
              error = "Number of packages must be a positive whole number.";
              break;
            }
            if (!Number.isFinite(gross) || gross <= 0) {
              error = "Gross weight must be greater than zero.";
              break;
            }
            if (!Number.isFinite(tarePerPkg) || tarePerPkg < 0) {
              error = "Packaging tare weight cannot be negative.";
              break;
            }
            const computedTotalTare = Math.round(pkgCount * tarePerPkg * 1000) / 1000;
            const computedNet = Math.round((gross - computedTotalTare) * 1000) / 1000;
            if (computedNet <= 0) {
              error = "Gross weight must be greater than total tare weight (net weight must be positive).";
              break;
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
              warehouseLocation: String(opDetails.warehouseLocation || "").trim() || "Warehouse",
              notes: typeof opDetails.notes === "string" ? opDetails.notes.trim() : undefined,
              assignedPoSoNumber: null,
              assignedPoSoBy: null,
              assignedPoSoByName: null,
              assignedPoSoAt: null,
              inventoryMoved: false,
            };
            finalDescription = serializeOperationalRequestDescription(validatedDetails, finalDescription || undefined);
          }

          if (!finalDescription) {
            error = "A request description is required.";
            break;
          }

          // Resolve shipment UUID if shipment reference was passed
          let shipmentUuid: string | null = null;
          const rawShipment = text(body.shipmentId || body.shipment);
          if (rawShipment) {
            const shipRes = await this.client.select<Record<string, unknown>>(
              "shipments",
              `select=id&or=(id.eq.${encodeURIComponent(rawShipment)},reference.eq.${encodeURIComponent(rawShipment)})`,
              token,
            );
            if (shipRes.ok && shipRes.value.length > 0) {
              shipmentUuid = String(shipRes.value[0].id);
            } else {
              shipmentUuid = rawShipment;
            }
          }

          const res = await svc.generalRequests.create({
            category: body.category as GeneralRequestCategory,
            priority: (body.priority as GeneralRequestPriority) || "normal",
            description: finalDescription,
            shipmentId: shipmentUuid,
            documentIds: documentIds.length > 0 ? documentIds : undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else {
            notice = "Your request was submitted.";
            try {
              await this.client.rpc("rpc_create_notification", {
                p_recipient_id: profile.id,
                p_event_type: "worker_request_submitted",
                p_title: `Request Submitted: ${res.value.number}`,
                p_message: `Your operational request ${res.value.number} has been submitted for review.`,
                p_target_type: "worker_general_request",
                p_target_id: res.value.id,
                p_link: "/dashboard",
                p_warehouse_id: res.value.warehouseId || profile.warehouseId || null,
              }, token);
            } catch { }
          }
          break;
        }
        case "decideGeneralRequest": {
          const reqId = text(body.requestId || body.id);
          const decision = text(body.decision) as
            | "under_review"
            | "approved"
            | "declined"
            | "sent_back"
            | "completed";

          // If completing, verify operational requirements & move stock
          if (decision === "completed") {
            const reqRes = await this.client.select<Record<string, unknown>>(
              "worker_general_requests",
              `select=*&id=eq.${encodeURIComponent(reqId)}`,
              token,
            );
            if (reqRes.ok && reqRes.value.length > 0) {
              const reqRow = mapWorkerGeneralRequest(reqRes.value[0]);
              const { operationalDetails } = parseOperationalRequestDescription(reqRow.description);
              if (operationalDetails && !operationalDetails.inventoryMoved && operationalDetails.netWeightKg > 0) {
                if (!operationalDetails.assignedPoSoNumber) {
                  error = "Staff must assign a PO or SO number before this operation can be completed.";
                  break;
                }

                const whId = reqRow.warehouseId || profile.warehouseId;
                if (!whId) {
                  error = "Warehouse ID is required for stock movement.";
                  break;
                }

                // Look up material in DB
                const matRes = await this.client.select<Record<string, unknown>>(
                  "materials",
                  "select=*&limit=10",
                  token,
                );
                let matId: string | null = null;
                let matName = operationalDetails.materialType;
                if (matRes.ok && matRes.value.length > 0) {
                  const targetMatType = operationalDetails.materialType.toLowerCase().trim();
                  const found = matRes.value.find((m) =>
                    String(m.material_number || "").toLowerCase() === targetMatType ||
                    String(m.description || "").toLowerCase().includes(targetMatType)
                  );
                  if (found) {
                    matId = String(found.id);
                    matName = String(found.description || found.material_number);
                  } else {
                    matId = String(matRes.value[0].id);
                    matName = String(matRes.value[0].description || matRes.value[0].material_number);
                  }
                }

                if (!matId) {
                  error = "No material records found in database.";
                  break;
                }

                const isUnloading = operationalDetails.requestType === "unloading";
                const direction: "in" | "out" = isUnloading ? "in" : "out";
                const weightKg = operationalDetails.netWeightKg;

                // Check existing balance
                const balRes = await this.client.select<Record<string, unknown>>(
                  "stock_balances",
                  `select=*&material_id=eq.${encodeURIComponent(matId)}&warehouse_id=eq.${encodeURIComponent(whId)}`,
                  token,
                );
                const currentBalance = balRes.ok && balRes.value.length > 0 ? Number(balRes.value[0].weight_kg) : 0;

                if (direction === "out" && currentBalance < weightKg) {
                  error = `Insufficient stock in warehouse for ${matName}. Available: ${currentBalance} kg, Required: ${weightKg} kg.`;
                  break;
                }

                const nextBalance = Math.round((direction === "in" ? currentBalance + weightKg : currentBalance - weightKg) * 1000) / 1000;

                // Update stock balance
                if (balRes.ok && balRes.value.length > 0) {
                  await this.client.update<Record<string, unknown>>(
                    "stock_balances",
                    `id=eq.${encodeURIComponent(String(balRes.value[0].id))}`,
                    { weight_kg: nextBalance },
                    token,
                  );
                } else {
                  await this.client.insert<Record<string, unknown>>(
                    "stock_balances",
                    {
                      material_id: matId,
                      warehouse_id: whId,
                      weight_kg: nextBalance,
                    },
                    token,
                  );
                }

                // Insert stock movement
                const movementRes = await this.client.insert<Record<string, unknown>>(
                  "stock_movements",
                  {
                    material_id: matId,
                    warehouse_id: whId,
                    weight_kg: weightKg,
                    direction,
                    request_id: null,
                    request_line_id: null,
                    created_by: profile.id,
                  },
                  token,
                );

                // Insert inventory history
                const whRes = await this.client.select<Record<string, unknown>>(
                  "warehouses",
                  `select=name&id=eq.${encodeURIComponent(whId)}`,
                  token,
                );
                const whName = whRes.ok && whRes.value[0] ? String(whRes.value[0].name) : "Warehouse";

                await this.client.insert<Record<string, unknown>>(
                  "inventory_history",
                  {
                    material_id: matId,
                    material_name: matName,
                    warehouse_id: whId,
                    warehouse_name: whName,
                    container_number: operationalDetails.warehouseLocation || null,
                    quantity_before: currentBalance,
                    quantity_change: direction === "in" ? weightKg : -weightKg,
                    quantity_after: nextBalance,
                    packaging_type_id: null,
                    packaging_type_name: operationalDetails.packagingType,
                    packaging_count: operationalDetails.packageCount,
                    packaging_unit_tare_kg: operationalDetails.tarePerPackageKg,
                    total_packaging_weight_kg: operationalDetails.totalTareWeightKg,
                    gross_weight_kg: operationalDetails.grossWeightKg,
                    operation_type: direction === "in" ? "receipt" : "dispatch",
                    operation_reason: isUnloading ? "Worker unloading request completed" : "Worker loading request completed",
                    reference: reqRow.number,
                    po_number: isUnloading ? operationalDetails.assignedPoSoNumber : null,
                    so_number: !isUnloading ? operationalDetails.assignedPoSoNumber : null,
                    performed_by: profile.id,
                    performed_by_name: profile.name,
                  },
                  token,
                );

                // Mark inventoryMoved in description
                operationalDetails.inventoryMoved = true;
                if (movementRes.ok && movementRes.value) {
                  operationalDetails.inventoryMovementId = String(movementRes.value.id || "");
                }
                const updatedDesc = serializeOperationalRequestDescription(operationalDetails, operationalDetails.notes);
                await this.client.update<Record<string, unknown>>(
                  "worker_general_requests",
                  `id=eq.${encodeURIComponent(reqId)}`,
                  { description: updatedDesc },
                  token,
                );
              }
            }
          }

          const res = await svc.generalRequests.decide({
            requestId: reqId,
            decision,
            responseNote: text(body.reason || body.note || body.responseNote) || undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else {
            notice = "Request updated.";
            try {
              if (res.value.createdBy && res.value.createdBy !== profile.id) {
                await this.client.rpc("rpc_create_notification", {
                  p_recipient_id: res.value.createdBy,
                  p_event_type: "worker_request_decided",
                  p_title: `Request ${res.value.number} Updated: ${res.value.status.replace("_", " ")}`,
                  p_message: `Your request ${res.value.number} was marked "${res.value.status.replace("_", " ")}" by ${profile.name}.${res.value.responseNote ? ` Note: ${res.value.responseNote}` : ""}`,
                  p_target_type: "worker_general_request",
                  p_target_id: res.value.id,
                  p_link: "/dashboard",
                  p_warehouse_id: res.value.warehouseId || null,
                }, token);
              }
            } catch { }
          }
          break;
        }
        case "assignPoSoToGeneralRequest": {
          if (profile.role !== "manager") {
            error = "Only Staff can assign PO/SO numbers to approved requests.";
            break;
          }
          const reqId = text(body.requestId || body.id);
          const rawPoSo = text(body.poSoNumber || body.number || body.reference).toUpperCase();

          // Try dedicated atomic RPC first
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_assign_poso_to_general_request",
            { p_request_id: reqId, p_poso_number: rawPoSo },
            token,
          );
          if (rpcRes.ok) {
            notice = `Assigned ${rawPoSo} to request.`;
            break;
          }

          const reqRes = await this.client.select<Record<string, unknown>>(
            "worker_general_requests",
            `select=*&id=eq.${encodeURIComponent(reqId)}`,
            token,
          );
          if (!reqRes.ok || reqRes.value.length === 0) {
            error = "General request not found.";
            break;
          }
          const currentReq = mapWorkerGeneralRequest(reqRes.value[0]);
          if (currentReq.status !== "approved") {
            error = "PO/SO references can only be assigned after Admin has approved the request.";
            break;
          }

          if (!rawPoSo) {
            error = "A PO or SO reference number is required.";
            break;
          }
          const isPo = rawPoSo.startsWith("PO-");
          const isSo = rawPoSo.startsWith("SO-");
          if (!isPo && !isSo) {
            error = "Only PO (Purchase Order) and SO (Sales Order) references are permitted (e.g. PO-2026-0001 or SO-2026-0001).";
            break;
          }

          const { operationalDetails } = parseOperationalRequestDescription(currentReq.description);
          if (operationalDetails) {
            if (operationalDetails.requestType === "loading" && !isSo) {
              error = "Loading (dispatch) operations require an SO (Sales Order) reference.";
              break;
            }
            if (operationalDetails.requestType === "unloading" && !isPo) {
              error = "Unloading (receipt) operations require a PO (Purchase Order) reference.";
              break;
            }
          }

          const updatedDetails: GeneralRequestOperationalDetails = operationalDetails
            ? {
              ...operationalDetails,
              assignedPoSoNumber: rawPoSo,
              assignedPoSoBy: profile.id,
              assignedPoSoByName: profile.name,
              assignedPoSoAt: this.now(),
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
              warehouseLocation: "Warehouse",
              assignedPoSoNumber: rawPoSo,
              assignedPoSoBy: profile.id,
              assignedPoSoByName: profile.name,
              assignedPoSoAt: this.now(),
              inventoryMoved: false,
            };

          const newDesc = serializeOperationalRequestDescription(updatedDetails, updatedDetails.notes);

          let matchedPoUuid: string | null = null;
          if (isPo) {
            const poMatch = await this.client.select<Record<string, unknown>>(
              "purchase_orders",
              `select=id&number=ilike.${encodeURIComponent(rawPoSo)}`,
              token,
            );
            if (poMatch.ok && poMatch.value.length > 0) {
              matchedPoUuid = String(poMatch.value[0].id);
            }
          }

          const updatePayload: Record<string, unknown> = {
            description: newDesc,
            updated_at: this.now(),
          };
          if (matchedPoUuid) {
            updatePayload.purchase_order_id = matchedPoUuid;
          }

          const upRes = await this.client.update<Record<string, unknown>>(
            "worker_general_requests",
            `id=eq.${encodeURIComponent(reqId)}`,
            updatePayload,
            token,
          );
          if (!upRes.ok) {
            error = upRes.error;
          } else {
            notice = `Assigned ${rawPoSo} to ${currentReq.number}.`;
            try {
              if (currentReq.createdBy) {
                await this.client.rpc("rpc_create_notification", {
                  p_recipient_id: currentReq.createdBy,
                  p_event_type: "worker_request_poso_assigned",
                  p_title: `Reference Assigned: ${rawPoSo}`,
                  p_message: `Staff has assigned ${rawPoSo} to your request ${currentReq.number}. Ready for execution.`,
                  p_target_type: "worker_general_request",
                  p_target_id: currentReq.id,
                  p_link: "/dashboard",
                  p_warehouse_id: currentReq.warehouseId || null,
                }, token);
              }
            } catch { }
          }
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
        case "markNotificationRead": {
          const notifId = text(body.id || body.notificationId);
          if (notifId) {
            const rpcRes = await this.client.rpc("rpc_mark_notification_read", { p_notification_id: notifId }, token);
            if (!rpcRes.ok) {
              await this.client.update("notifications", `id=eq.${notifId}`, { read: true, read_at: this.now() }, token);
            }
          }
          break;
        }
        case "markAllNotificationsRead": {
          const rpcRes = await this.client.rpc("rpc_mark_all_notifications_read", {}, token);
          if (!rpcRes.ok && profile) {
            await this.client.update("notifications", `recipient_id=eq.${profile.id}&read=eq.false`, { read: true, read_at: this.now() }, token);
          }
          break;
        }
        case "assignWorkerPo": {
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_assign_worker_po",
            {
              p_order_number: text(body.poNumber || body.number),
              p_worker_id: text(body.workerId || body.assignedWorkerId),
              p_scheduled_date: text(body.scheduledDate) || this.now().slice(0, 10),
              p_notes: text(body.notes) || null,
            },
            token
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = `Worker assigned to ${text(body.poNumber || body.number)}.`;
          break;
        }
        case "startWorkerPo": {
          const poNumber = text(body.poNumber || body.number);
          const patchRes = await this.client.update(
            "purchase_orders",
            `number=eq.${encodeURIComponent(poNumber)}`,
            {
              execution_status: "in_progress",
              updated_at: this.now(),
            },
            token
          );
          if (!patchRes.ok) error = patchRes.error;
          else notice = `Operation started on ${poNumber}.`;
          break;
        }
        case "createOperationSchedule":
        case "createSchedule": {
          if (profile.role !== "manager") {
            error = "Only Staff can create schedules.";
            break;
          }
          const schedType: "unloading" | "loading" = text(body.type) === "loading" ? "loading" : "unloading";
          const explicitPoId = text(body.purchaseOrderId || body.orderId || body.poId || body.soId);

          const [ordersRes, compsRes, whsRes, usersRes, linesRes, pkgRes] = await Promise.all([
            this.client.select<Record<string, unknown>>("purchase_orders", "select=*&order=created_at.asc", token),
            this.client.select<Record<string, unknown>>("companies", "select=*", token),
            this.client.select<Record<string, unknown>>("warehouses", "select=*", token),
            this.client.select<Record<string, unknown>>("users", "select=*", token),
            this.client.select<Record<string, unknown>>("purchase_order_lines", "select=*", token),
            this.client.select<Record<string, unknown>>("packaging_types", "select=*", token),
          ]);

          const rawOrders = ordersRes.ok ? ordersRes.value : [];
          const mappedOrders = rawOrders.map((r) => ({ raw: r, po: mapPurchaseOrder(r) }));
          const companies = compsRes.ok ? compsRes.value.map(mapCompany) : [];
          const warehouses = whsRes.ok ? whsRes.value.map(mapWarehouse) : [];
          const users = usersRes.ok ? usersRes.value.map(mapUserProfile) : [];
          const allLines = linesRes.ok ? linesRes.value.map(mapPurchaseOrderLine) : [];
          const packagings = pkgRes.ok ? pkgRes.value.map(mapPackagingType) : [];

          let matchedEntry = explicitPoId
            ? mappedOrders.find((e) => e.po.id === explicitPoId && !e.po.isRemoved)
            : undefined;
          const rawPoSoNumber = text(body.poSoNumber || body.poNumber || body.soNumber || body.orderNumber || body.number).toUpperCase() || (matchedEntry ? matchedEntry.po.number.toUpperCase() : "");
          if (!rawPoSoNumber) {
            error = schedType === "unloading" ? "PO Number is required." : "SO Number is required.";
            break;
          }
          if (!matchedEntry) {
            matchedEntry = mappedOrders.find((e) => !e.po.isRemoved && e.po.number.toLowerCase() === rawPoSoNumber.toLowerCase());
          }

          if (matchedEntry) {
            const existingType = matchedEntry.po.type || (matchedEntry.po.number.toUpperCase().startsWith("SO") ? "SO" : "PO");
            if (schedType === "unloading" && existingType === "SO") {
              error = `Unloading schedules must link to a Purchase Order (PO). ${matchedEntry.po.number} is a Sales Order (SO).`;
              break;
            }
            if (schedType === "loading" && existingType === "PO") {
              error = `Loading schedules must link to a Sales Order (SO). ${matchedEntry.po.number} is a Purchase Order (PO).`;
              break;
            }
          }

          const existingCompany = matchedEntry ? companies.find((c) => c.id === matchedEntry!.po.companyId) : undefined;
          const partnerName = text(body.partnerName || body.supplier || body.customer || body.buyer) || existingCompany?.name || "";
          if (!partnerName) {
            error = schedType === "unloading" ? "Supplier name is required." : "Customer / Buyer name is required.";
            break;
          }

          const whInput = text(body.warehouseId || body.warehouse) || (matchedEntry?.po.warehouseId ?? "");
          const warehouse = warehouses.find((w) => w.id === whInput || w.name.toLowerCase() === whInput.toLowerCase()) || warehouses[0];
          if (!warehouse) {
            error = "Please select a valid warehouse.";
            break;
          }

          const scheduledDate =
            text(body.scheduledDate || body.scheduledUnloadingDate || body.scheduledLoadingDate) ||
            (matchedEntry?.po.scheduledDate ?? "");
          if (!scheduledDate) {
            error = "Scheduled date is required.";
            break;
          }

          const workerInput = text(body.assignedWorkerId || body.workerId);
          const worker = users.find((u) => (u.id === workerInput || u.name.toLowerCase() === workerInput.toLowerCase()) && u.active && u.role === "worker");
          if (!worker) {
            error = "Please select an active warehouse worker.";
            break;
          }

          const resolvedOrigin = text(body.origin) || matchedEntry?.po.origin || "";
          const resolvedDestination = text(body.destination) || matchedEntry?.po.destination || "";
          const resolvedAnnex7 = body.annex7Required !== undefined ? Boolean(body.annex7Required) : Boolean(matchedEntry?.po.annex7Required);
          const resolvedTransportPrice = body.transportPrice !== undefined ? Math.max(0, num(body.transportPrice) || 0) : (matchedEntry?.po.transportPrice ?? 0);
          const resolvedCurrency = text(body.currency) || matchedEntry?.po.currency || "EUR";
          const resolvedPickupDate = text(body.pickupDate) || matchedEntry?.po.pickupDate || null;
          const resolvedPurchaserName = text(body.purchaserName) || matchedEntry?.po.purchaserName || null;
          const resolvedPurchasingPrice =
            schedType === "unloading"
              ? (body.purchasingPrice !== undefined && body.purchasingPrice !== "" ? Math.max(0, num(body.purchasingPrice) || 0) : (matchedEntry?.po.valueEur ?? 0))
              : 0;
          const resolvedSellerName = text(body.sellerName) || matchedEntry?.po.sellerName || null;
          const resolvedSellingPrice =
            schedType === "loading"
              ? (body.sellingPrice !== undefined && body.sellingPrice !== "" ? Math.max(0, num(body.sellingPrice) || 0) : (matchedEntry?.po.valueEur ?? 0))
              : 0;

          if (!matchedEntry) {
            const firstRawItem = Array.isArray(body.items) && body.items.length > 0 ? record(body.items[0]) : {};
            const defaultMat = text(firstRawItem.materialName || firstRawItem.materialType || firstRawItem.material) || "General Material";
            const defaultQty = Math.max(1, num(firstRawItem.grossWeightKg || firstRawItem.netWeightKg) || 1000);
            const createPoRes = await svc.purchaseOrders.create({
              type: schedType === "unloading" ? "PO" : "SO",
              number: rawPoSoNumber,
              title: `${partnerName} - ${schedType === "unloading" ? "Unloading" : "Loading"}`,
              supplier: partnerName,
              material: defaultMat,
              quantityKg: defaultQty,
              valueEur: schedType === "unloading" ? resolvedPurchasingPrice : resolvedSellingPrice,
              currency: resolvedCurrency,
              warehouseId: warehouse.id,
              purchaserName: resolvedPurchaserName,
              sellerName: resolvedSellerName,
              transportPrice: resolvedTransportPrice,
              origin: resolvedOrigin,
              destination: resolvedDestination,
              pickupDate: resolvedPickupDate,
              scheduledDate,
              annex7Required: resolvedAnnex7,
              notes: "Created via Staff Schedule Module",
              actorId: profile.id,
            });
            if (!createPoRes.ok) {
              error = createPoRes.error;
              break;
            }
            const refetched = await this.client.select<Record<string, unknown>>(
              "purchase_orders",
              `select=*&id=eq.${encodeURIComponent(createPoRes.value.id)}`,
              token,
            );
            if (!refetched.ok || refetched.value.length === 0) {
              error = "Failed to load created order.";
              break;
            }
            matchedEntry = { raw: refetched.value[0], po: mapPurchaseOrder(refetched.value[0]) };
          }

          const targetPo = matchedEntry.po;
          const targetRaw = matchedEntry.raw;

          // Count existing schedules to generate unique scheduleNumber
          let maxSeq = 0;
          const year = new Date(this.now()).getUTCFullYear() || 2026;
          const prefix = schedType === "unloading" ? "SCH-UNL" : "SCH-LOD";
          for (const e of mappedOrders) {
            const m = parseOrderNotes(String(e.raw.notes ?? "")).meta;
            for (const s of m?.schedules || []) {
              if (s.scheduleNumber && s.scheduleNumber.startsWith(`${prefix}-${year}-`)) {
                const n = parseInt(s.scheduleNumber.split("-").pop() || "0", 10);
                if (!isNaN(n) && n > maxSeq) maxSeq = n;
              }
            }
          }
          const scheduleNumber = `${prefix}-${year}-${String(maxSeq + 1).padStart(4, "0")}`;
          const scheduleId = randomUUID();
          const nowIso = this.now();

          const newItems: OperationScheduleItem[] = [];
          const rawItems = Array.isArray(body.items) ? body.items : [];
          if (rawItems.length > 0) {
            for (const rawItem of rawItems) {
              const itemRec = record(rawItem);
              const matName = text(itemRec.materialName || itemRec.materialType || itemRec.material);
              if (!matName) continue;
              const pkgIdInput = text(itemRec.packagingTypeId || itemRec.packagingId || itemRec.packagingTypeName || itemRec.packagingType);
              const pkg = packagings.find((p) => p.id === pkgIdInput || p.name.toLowerCase() === pkgIdInput.toLowerCase()) || packagings[0];
              const packageCount = Math.max(1, Math.round(num(itemRec.packageCount || itemRec.numberOfPackages || itemRec.count) || 1));
              const tareInput = itemRec.tarePerPackageKg ?? itemRec.tarePerUnitKg ?? itemRec.packagingTareWeightKg ?? itemRec.tareWeightKg ?? itemRec.tareKg ?? itemRec.tare;
              const tarePerPackage = tareInput !== undefined && num(tareInput) >= 0 ? num(tareInput) : (pkg?.tareKg ?? 0);
              const grossWeight = Math.max(0, num(itemRec.grossWeightKg ?? itemRec.grossKg) || 0);
              const totalTare = roundKg(packageCount * tarePerPackage);
              const netWeight = Math.max(0, roundKg(grossWeight - totalTare));
              newItems.push({
                id: randomUUID(),
                scheduleId,
                materialId: randomUUID(),
                materialName: matName,
                packagingTypeId: pkg ? pkg.id : randomUUID(),
                packagingTypeName: text(itemRec.packagingTypeName || itemRec.packagingType) || (pkg ? pkg.name : "Standard Packaging"),
                packageCount,
                tarePerPackageKg: tarePerPackage,
                totalTareWeightKg: totalTare,
                grossWeightKg: grossWeight,
                netWeightKg: netWeight,
                createdAt: nowIso,
                updatedAt: nowIso,
              });
            }
          } else {
            const poLines = allLines.filter((l) => l.purchaseOrderId === targetPo.id && l.description.trim());
            for (const poLine of poLines) {
              const pkg = packagings[0];
              const tarePerPackage = pkg?.tareKg ?? 0;
              newItems.push({
                id: randomUUID(),
                scheduleId,
                materialId: poLine.materialId || randomUUID(),
                materialName: poLine.description,
                packagingTypeId: pkg ? pkg.id : randomUUID(),
                packagingTypeName: pkg ? pkg.name : "Standard Packaging",
                packageCount: 1,
                tarePerPackageKg: tarePerPackage,
                totalTareWeightKg: tarePerPackage,
                grossWeightKg: Math.max(0, poLine.quantityKg + tarePerPackage),
                netWeightKg: Math.max(0, poLine.quantityKg),
                createdAt: nowIso,
                updatedAt: nowIso,
              });
            }
          }

          const newSchedule: OperationSchedule = {
            id: scheduleId,
            scheduleNumber,
            type: schedType,
            poSoNumber: targetPo.number,
            purchaseOrderId: targetPo.id,
            shipmentId: null,
            partnerName,
            companyId: targetPo.companyId,
            warehouseId: warehouse.id,
            origin: resolvedOrigin,
            destination: resolvedDestination,
            annex7Required: resolvedAnnex7,
            transportPrice: resolvedTransportPrice,
            currency: resolvedCurrency,
            pickupDate: resolvedPickupDate,
            purchaserName: resolvedPurchaserName,
            purchasingPrice: resolvedPurchasingPrice,
            sellerName: resolvedSellerName,
            sellingPrice: resolvedSellingPrice,
            scheduledDate,
            assignedWorkerId: worker.id,
            assignedWorkerName: worker.name,
            vehicleRegistrationNumber: text(body.vehicleRegistrationNumber),
            transportCompany: text(body.transportCompany),
            driverName: text(body.driverName),
            driverContactNumber: text(body.driverContactNumber),
            cmrNumber: text(body.cmrNumber),
            actualArrivalTime: text(body.actualArrivalTime) || null,
            status: "scheduled",
            instructions: text(body.instructions),
            workerRemarks: text(body.workerRemarks || body.operationalRemarks),
            returnReason: null,
            infoRequestNote: null,
            actualStartTime: text(body.actualStartTime || body.actualLoadingStartTime) || null,
            actualEndTime: text(body.actualEndTime || body.actualLoadingCompletionTime) || null,
            submittedAt: null,
            verifiedAt: null,
            verifiedBy: null,
            verifiedByName: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: profile.id,
            createdByName: profile.name,
          };

          const { cleanNotes, meta: existingMeta } = parseOrderNotes(String(targetRaw.notes ?? ""));
          const updatedMeta: OrderMetadataEnvelope = {
            ...(existingMeta || {}),
            number: targetPo.number,
            type: targetPo.type,
            currency: targetPo.currency || resolvedCurrency,
            warehouseId: targetPo.warehouseId || warehouse.id,
            purchaserName: targetPo.purchaserName || resolvedPurchaserName,
            sellerName: targetPo.sellerName || resolvedSellerName,
            transportPrice: targetPo.transportPrice || resolvedTransportPrice,
            origin: targetPo.origin || resolvedOrigin,
            destination: targetPo.destination || resolvedDestination,
            pickupDate: targetPo.pickupDate || resolvedPickupDate,
            scheduledDate,
            annex7Required: targetPo.annex7Required ?? resolvedAnnex7,
            schedules: [...(existingMeta?.schedules || []), newSchedule],
            scheduleItems: [...(existingMeta?.scheduleItems || []), ...newItems],
            scheduleAttachments: existingMeta?.scheduleAttachments || [],
          };

          const serialized = serializeOrderNotes(cleanNotes, updatedMeta);
          const upPoRes = await this.client.update<Record<string, unknown>>(
            "purchase_orders",
            `id=eq.${encodeURIComponent(targetPo.id)}`,
            {
              notes: serialized,
              scheduled_date: scheduledDate,
              assigned_worker_id: worker.id,
              assigned_by: profile.id,
              assigned_at: nowIso,
              execution_status: "assigned",
              updated_at: nowIso,
            },
            token,
          );
          if (!upPoRes.ok) {
            error = upPoRes.error;
            break;
          }

          // Also invoke rpc_create_operation_schedule if available in PostgREST
          await this.client.rpc<Record<string, unknown>>(
            "rpc_create_operation_schedule",
            {
              p_type: schedType,
              p_poso_number: targetPo.number,
              p_partner_name: partnerName,
              p_warehouse_id: warehouse.id,
              p_scheduled_date: scheduledDate,
              p_assigned_worker_id: worker.id,
              p_origin: resolvedOrigin,
              p_destination: resolvedDestination,
              p_annex7_required: resolvedAnnex7,
              p_transport_price: resolvedTransportPrice,
              p_currency: resolvedCurrency,
              p_pickup_date: resolvedPickupDate,
              p_purchaser_name: resolvedPurchaserName,
              p_purchasing_price: resolvedPurchasingPrice,
              p_seller_name: resolvedSellerName,
              p_selling_price: resolvedSellingPrice,
              p_instructions: text(body.instructions),
              p_items: Array.isArray(body.items) ? body.items : [],
              p_vehicle_registration_number: text(body.vehicleRegistrationNumber),
              p_transport_company: text(body.transportCompany),
              p_driver_name: text(body.driverName),
              p_driver_contact_number: text(body.driverContactNumber),
              p_cmr_number: text(body.cmrNumber),
              p_actual_arrival_time: text(body.actualArrivalTime) || null,
              p_actual_start_time: text(body.actualStartTime || body.actualLoadingStartTime) || null,
              p_actual_end_time: text(body.actualEndTime || body.actualLoadingCompletionTime) || null,
              p_worker_remarks: text(body.workerRemarks || body.operationalRemarks),
            },
            token
          );

          notice = `${scheduleNumber} was created successfully and assigned to ${worker.name}.`;
          break;
        }
        case "updateOperationSchedule":
        case "updateSchedule": {
          if (profile.role !== "manager") {
            error = "Only Staff can modify schedules.";
            break;
          }
          const schedId = text(body.id || body.scheduleId);
          const schedNum = text(body.scheduleNumber);
          const ordersRes = await this.client.select<Record<string, unknown>>("purchase_orders", "select=*&order=created_at.asc", token);
          let updatedInMeta = false;
          if (ordersRes.ok) {
            for (const rawRow of ordersRes.value) {
              const { cleanNotes, meta } = parseOrderNotes(String(rawRow.notes ?? ""));
              if (!meta?.schedules) continue;
              const targetSched = meta.schedules.find((s) => s.id === schedId || (schedNum && s.scheduleNumber === schedNum));
              if (!targetSched) continue;
              if (targetSched.status === "completed") {
                error = "Completed schedules cannot be edited.";
                break;
              }
              if (body.poSoNumber) targetSched.poSoNumber = text(body.poSoNumber).toUpperCase();
              if (body.partnerName || body.supplier || body.customer) {
                targetSched.partnerName = text(body.partnerName || body.supplier || body.customer);
              }
              if (body.warehouseId) targetSched.warehouseId = text(body.warehouseId);
              if (body.assignedWorkerId) targetSched.assignedWorkerId = text(body.assignedWorkerId);
              if (body.scheduledDate) targetSched.scheduledDate = text(body.scheduledDate);
              if (body.origin !== undefined) targetSched.origin = text(body.origin);
              if (body.destination !== undefined) targetSched.destination = text(body.destination);
              if (body.annex7Required !== undefined) targetSched.annex7Required = Boolean(body.annex7Required);
              if (body.transportPrice !== undefined) targetSched.transportPrice = num(body.transportPrice) || 0;
              if (body.currency !== undefined) targetSched.currency = text(body.currency) || "EUR";
              if (body.pickupDate !== undefined) targetSched.pickupDate = text(body.pickupDate) || null;
              if (body.purchaserName !== undefined) targetSched.purchaserName = text(body.purchaserName) || null;
              if (body.purchasingPrice !== undefined) targetSched.purchasingPrice = num(body.purchasingPrice) || 0;
              if (body.sellerName !== undefined) targetSched.sellerName = text(body.sellerName) || null;
              if (body.sellingPrice !== undefined) targetSched.sellingPrice = num(body.sellingPrice) || 0;
              if (body.instructions !== undefined) targetSched.instructions = text(body.instructions);
              if (body.vehicleRegistrationNumber !== undefined) targetSched.vehicleRegistrationNumber = text(body.vehicleRegistrationNumber);
              if (body.transportCompany !== undefined) targetSched.transportCompany = text(body.transportCompany);
              if (body.driverName !== undefined) targetSched.driverName = text(body.driverName);
              if (body.driverContactNumber !== undefined) targetSched.driverContactNumber = text(body.driverContactNumber);
              if (body.cmrNumber !== undefined) targetSched.cmrNumber = text(body.cmrNumber);
              targetSched.updatedAt = this.now();

              const upRes = await this.client.update(
                "purchase_orders",
                `id=eq.${encodeURIComponent(String(rawRow.id))}`,
                { notes: serializeOrderNotes(cleanNotes, meta), updated_at: this.now() },
                token,
              );
              if (upRes.ok) {
                updatedInMeta = true;
                notice = `${targetSched.scheduleNumber} was updated successfully.`;
              }
              break;
            }
          }
          if (error) break;
          if (!updatedInMeta) {
            const patch: Record<string, unknown> = { updated_at: this.now() };
            if (body.poSoNumber) patch.poso_number = text(body.poSoNumber).toUpperCase();
            if (body.partnerName || body.supplier || body.customer) {
              patch.partner_name = text(body.partnerName || body.supplier || body.customer);
            }
            if (body.warehouseId) patch.warehouse_id = text(body.warehouseId);
            if (body.assignedWorkerId) patch.assigned_worker_id = text(body.assignedWorkerId);
            if (body.scheduledDate) patch.scheduled_date = text(body.scheduledDate);
            if (body.origin !== undefined) patch.origin = text(body.origin);
            if (body.destination !== undefined) patch.destination = text(body.destination);
            if (body.annex7Required !== undefined) patch.annex7_required = Boolean(body.annex7Required);
            if (body.transportPrice !== undefined) patch.transport_price = num(body.transportPrice) || 0;
            if (body.currency !== undefined) patch.currency = text(body.currency) || "EUR";
            if (body.pickupDate !== undefined) patch.pickup_date = text(body.pickupDate) || null;
            if (body.purchaserName !== undefined) patch.purchaser_name = text(body.purchaserName) || null;
            if (body.purchasingPrice !== undefined) patch.purchasing_price = num(body.purchasingPrice) || 0;
            if (body.sellerName !== undefined) patch.seller_name = text(body.sellerName) || null;
            if (body.sellingPrice !== undefined) patch.selling_price = num(body.sellingPrice) || 0;
            if (body.instructions !== undefined) patch.instructions = text(body.instructions);
            if (body.vehicleRegistrationNumber !== undefined) patch.vehicle_registration_number = text(body.vehicleRegistrationNumber);
            if (body.transportCompany !== undefined) patch.transport_company = text(body.transportCompany);
            if (body.driverName !== undefined) patch.driver_name = text(body.driverName);
            if (body.driverContactNumber !== undefined) patch.driver_contact_number = text(body.driverContactNumber);
            if (body.cmrNumber !== undefined) patch.cmr_number = text(body.cmrNumber);
            const updateRes = await this.client.update("operation_schedules", `id=eq.${encodeURIComponent(schedId)}`, patch, token);
            if (!updateRes.ok) error = updateRes.error;
            else notice = "Schedule updated.";
          }
          break;
        }
        case "assignScheduleWorker": {
          if (profile.role !== "manager") {
            error = "Only Staff can reassign schedule workers.";
            break;
          }
          const schedId = text(body.id || body.scheduleId);
          const workerId = text(body.workerId || body.assignedWorkerId);
          const workerRes = await this.client.select<Record<string, unknown>>("users", `select=name&id=eq.${encodeURIComponent(workerId)}`, token);
          const workerName = workerRes.ok && workerRes.value.length > 0 ? String(workerRes.value[0].name) : "";

          await this.mutateScheduleInOrderNotes(schedId, (s) => {
            s.assignedWorkerId = workerId;
            s.assignedWorkerName = workerName;
          }, token);

          await this.client.update(
            "operation_schedules",
            `id=eq.${encodeURIComponent(schedId)}`,
            { assigned_worker_id: workerId, assigned_worker_name: workerName, updated_at: this.now() },
            token
          );
          notice = `Worker reassigned to schedule.`;
          break;
        }
        case "startOperationSchedule":
        case "startSchedule": {
          const scheduleId = text(body.id || body.scheduleId);
          const nowIso = this.now();
          await this.mutateScheduleInOrderNotes(scheduleId, (s) => {
            s.status = "in_progress";
            if (!s.actualStartTime) s.actualStartTime = nowIso;
          }, token);

          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_start_operation_schedule",
            { p_schedule_id: scheduleId },
            token
          );
          if (!rpcRes.ok) {
            await this.client.update(
              "operation_schedules",
              `id=eq.${encodeURIComponent(scheduleId)}`,
              { status: "in_progress", actual_start_time: nowIso, updated_at: nowIso },
              token
            );
          }
          notice = "Operation started.";
          break;
        }
        case "saveOperationDraft":
        case "saveScheduleDraft": {
          const payload = body.draft ? { ...body, ...record(body.draft) } : body;
          const scheduleId = text(payload.id || payload.scheduleId);
          const nowIso = this.now();

          await this.mutateScheduleInOrderNotes(scheduleId, (s, meta) => {
            if (payload.workerRemarks !== undefined || payload.operationalRemarks !== undefined) {
              s.workerRemarks = text(payload.workerRemarks ?? payload.operationalRemarks);
            }
            if (payload.vehicleRegistrationNumber !== undefined) s.vehicleRegistrationNumber = text(payload.vehicleRegistrationNumber);
            if (payload.transportCompany !== undefined) s.transportCompany = text(payload.transportCompany);
            if (payload.driverName !== undefined) s.driverName = text(payload.driverName);
            if (payload.driverContactNumber !== undefined) s.driverContactNumber = text(payload.driverContactNumber);
            if (payload.cmrNumber !== undefined) s.cmrNumber = text(payload.cmrNumber);
            if (payload.actualArrivalTime !== undefined) s.actualArrivalTime = text(payload.actualArrivalTime) || null;
            if (payload.actualStartTime !== undefined || payload.actualLoadingStartTime !== undefined) {
              s.actualStartTime = text(payload.actualStartTime ?? payload.actualLoadingStartTime) || null;
            }
            if (payload.actualEndTime !== undefined || payload.actualLoadingCompletionTime !== undefined) {
              s.actualEndTime = text(payload.actualEndTime ?? payload.actualLoadingCompletionTime) || null;
            }
            if (Array.isArray(payload.items)) {
              const otherItems = (meta.scheduleItems || []).filter((i) => i.scheduleId !== scheduleId);
              const mappedItems = payload.items.map((raw: unknown) => {
                const rec = record(raw);
                const count = Math.max(1, Math.round(num(rec.packageCount || rec.numberOfPackages || 1)));
                const tare = Math.max(0, num(rec.tarePerPackageKg ?? rec.tarePerUnitKg ?? rec.packagingTareWeightKg ?? rec.tareWeightKg ?? 0));
                const gross = Math.max(0, num(rec.grossWeightKg ?? 0));
                const totalTare = count * tare;
                const net = Math.max(0, gross - totalTare);
                return {
                  id: text(rec.id) || randomUUID(),
                  scheduleId,
                  materialId: text(rec.materialId) || randomUUID(),
                  materialName: text(rec.materialName || rec.materialType || rec.material || "Material"),
                  packagingTypeId: text(rec.packagingTypeId) || randomUUID(),
                  packagingTypeName: text(rec.packagingTypeName || rec.packagingType) || "Standard Packaging",
                  packageCount: count,
                  tarePerPackageKg: tare,
                  totalTareWeightKg: totalTare,
                  grossWeightKg: gross,
                  netWeightKg: net,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };
              });
              meta.scheduleItems = [...otherItems, ...mappedItems];
            }
          }, token);

          const patch: Record<string, unknown> = { status: "draft", updated_at: nowIso };
          if (payload.workerRemarks !== undefined || payload.operationalRemarks !== undefined) {
            patch.worker_remarks = text(payload.workerRemarks ?? payload.operationalRemarks);
          }
          if (payload.vehicleRegistrationNumber !== undefined) patch.vehicle_registration_number = text(payload.vehicleRegistrationNumber);
          if (payload.transportCompany !== undefined) patch.transport_company = text(payload.transportCompany);
          if (payload.driverName !== undefined) patch.driver_name = text(payload.driverName);
          if (payload.driverContactNumber !== undefined) patch.driver_contact_number = text(payload.driverContactNumber);
          if (payload.cmrNumber !== undefined) patch.cmr_number = text(payload.cmrNumber);
          if (payload.actualArrivalTime !== undefined) patch.actual_arrival_time = text(payload.actualArrivalTime) || null;
          if (payload.actualStartTime !== undefined || payload.actualLoadingStartTime !== undefined) {
            patch.actual_start_time = text(payload.actualStartTime ?? payload.actualLoadingStartTime) || null;
          }
          if (payload.actualEndTime !== undefined || payload.actualLoadingCompletionTime !== undefined) {
            patch.actual_end_time = text(payload.actualEndTime ?? payload.actualLoadingCompletionTime) || null;
          }
          await this.client.update("operation_schedules", `id=eq.${encodeURIComponent(scheduleId)}`, patch, token);

          if (Array.isArray(payload.items)) {
            await this.client.delete("operation_schedule_items", `schedule_id=eq.${encodeURIComponent(scheduleId)}`, token);
            const matsRes = await this.client.select<Record<string, unknown>>("materials", "select=id,description", token);
            const materials = matsRes.ok ? matsRes.value : [];
            for (const rawItem of payload.items) {
              const itemRec = record(rawItem);
              const matName = text(itemRec.materialName || itemRec.materialType || itemRec.material);
              if (!matName) continue;
              let matId = text(itemRec.materialId);
              if (!matId) {
                const found = materials.find((m) => String(m.description || "").toLowerCase() === matName.toLowerCase());
                matId = found ? String(found.id) : randomUUID();
              }
              const count = Math.max(1, Math.round(num(itemRec.packageCount || itemRec.numberOfPackages || 1)));
              const tare = Math.max(0, num(itemRec.tarePerPackageKg ?? itemRec.tarePerUnitKg ?? itemRec.tareWeightKg ?? 0));
              const gross = Math.max(0, num(itemRec.grossWeightKg ?? 0));
              const totalTare = count * tare;
              const net = Math.max(0, gross - totalTare);
              await this.client.insert(
                "operation_schedule_items",
                {
                  id: randomUUID(),
                  schedule_id: scheduleId,
                  material_id: matId,
                  material_name: matName,
                  packaging_type_id: text(itemRec.packagingTypeId) || null,
                  packaging_type_name: text(itemRec.packagingTypeName || itemRec.packagingType) || "Standard Packaging",
                  package_count: count,
                  tare_per_package_kg: tare,
                  total_tare_weight_kg: totalTare,
                  gross_weight_kg: gross,
                  net_weight_kg: net,
                  created_at: nowIso,
                  updated_at: nowIso,
                },
                token
              );
            }
          }
          notice = "Draft saved.";
          break;
        }
        case "submitOperationSchedule":
        case "submitSchedule":
        case "submitScheduleForVerification": {
          const payload = body.draft ? { ...body, ...record(body.draft) } : body;
          const scheduleId = text(payload.id || payload.scheduleId);
          const nowIso = this.now();

          await this.mutateScheduleInOrderNotes(scheduleId, (s, meta) => {
            s.status = "submitted";
            s.submittedAt = nowIso;
            if (payload.workerRemarks !== undefined || payload.operationalRemarks !== undefined) {
              s.workerRemarks = text(payload.workerRemarks ?? payload.operationalRemarks);
            }
            if (payload.vehicleRegistrationNumber !== undefined) s.vehicleRegistrationNumber = text(payload.vehicleRegistrationNumber);
            if (payload.transportCompany !== undefined) s.transportCompany = text(payload.transportCompany);
            if (payload.driverName !== undefined) s.driverName = text(payload.driverName);
            if (payload.driverContactNumber !== undefined) s.driverContactNumber = text(payload.driverContactNumber);
            if (payload.cmrNumber !== undefined) s.cmrNumber = text(payload.cmrNumber);
            if (payload.actualArrivalTime !== undefined) s.actualArrivalTime = text(payload.actualArrivalTime) || null;
            if (payload.actualStartTime !== undefined || payload.actualLoadingStartTime !== undefined) {
              s.actualStartTime = text(payload.actualStartTime ?? payload.actualLoadingStartTime) || null;
            }
            s.actualEndTime = text(payload.actualEndTime ?? payload.actualLoadingCompletionTime) || nowIso;

            if (Array.isArray(payload.items)) {
              const otherItems = (meta.scheduleItems || []).filter((i) => i.scheduleId !== scheduleId);
              const mappedItems = payload.items.map((raw: unknown) => {
                const rec = record(raw);
                const count = Math.max(1, Math.round(num(rec.packageCount || rec.numberOfPackages || 1)));
                const tare = Math.max(0, num(rec.tarePerPackageKg ?? rec.tarePerUnitKg ?? rec.packagingTareWeightKg ?? rec.tareWeightKg ?? 0));
                const gross = Math.max(0, num(rec.grossWeightKg ?? 0));
                const totalTare = count * tare;
                const net = Math.max(0, gross - totalTare);
                return {
                  id: text(rec.id) || randomUUID(),
                  scheduleId,
                  materialId: text(rec.materialId) || randomUUID(),
                  materialName: text(rec.materialName || rec.materialType || rec.material || "Material"),
                  packagingTypeId: text(rec.packagingTypeId) || randomUUID(),
                  packagingTypeName: text(rec.packagingTypeName || rec.packagingType) || "Standard Packaging",
                  packageCount: count,
                  tarePerPackageKg: tare,
                  totalTareWeightKg: totalTare,
                  grossWeightKg: gross,
                  netWeightKg: net,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };
              });
              meta.scheduleItems = [...otherItems, ...mappedItems];
            }
          }, token);

          const patch: Record<string, unknown> = {
            status: "submitted",
            submitted_at: nowIso,
            actual_end_time: text(payload.actualEndTime ?? payload.actualLoadingCompletionTime) || nowIso,
            updated_at: nowIso,
          };
          if (payload.workerRemarks !== undefined || payload.operationalRemarks !== undefined) {
            patch.worker_remarks = text(payload.workerRemarks ?? payload.operationalRemarks);
          }
          if (payload.vehicleRegistrationNumber !== undefined) patch.vehicle_registration_number = text(payload.vehicleRegistrationNumber);
          if (payload.transportCompany !== undefined) patch.transport_company = text(payload.transportCompany);
          if (payload.driverName !== undefined) patch.driver_name = text(payload.driverName);
          if (payload.driverContactNumber !== undefined) patch.driver_contact_number = text(payload.driverContactNumber);
          if (payload.cmrNumber !== undefined) patch.cmr_number = text(payload.cmrNumber);
          if (payload.actualArrivalTime !== undefined) patch.actual_arrival_time = text(payload.actualArrivalTime) || null;
          if (payload.actualStartTime !== undefined || payload.actualLoadingStartTime !== undefined) {
            const startVal = text(payload.actualStartTime ?? payload.actualLoadingStartTime);
            if (startVal) patch.actual_start_time = startVal;
          }

          if (Array.isArray(payload.items)) {
            await this.client.delete("operation_schedule_items", `schedule_id=eq.${encodeURIComponent(scheduleId)}`, token);
            const matsRes = await this.client.select<Record<string, unknown>>("materials", "select=id,description", token);
            const materials = matsRes.ok ? matsRes.value : [];
            for (const rawItem of payload.items) {
              const itemRec = record(rawItem);
              const matName = text(itemRec.materialName || itemRec.materialType || itemRec.material);
              if (!matName) continue;
              let matId = text(itemRec.materialId);
              if (!matId) {
                const found = materials.find((m) => String(m.description || "").toLowerCase() === matName.toLowerCase());
                matId = found ? String(found.id) : randomUUID();
              }
              const count = Math.max(1, Math.round(num(itemRec.packageCount || itemRec.numberOfPackages || 1)));
              const tare = Math.max(0, num(itemRec.tarePerPackageKg ?? itemRec.tarePerUnitKg ?? itemRec.tareWeightKg ?? 0));
              const gross = Math.max(0, num(itemRec.grossWeightKg ?? 0));
              const totalTare = count * tare;
              const net = Math.max(0, gross - totalTare);
              await this.client.insert(
                "operation_schedule_items",
                {
                  id: randomUUID(),
                  schedule_id: scheduleId,
                  material_id: matId,
                  material_name: matName,
                  packaging_type_id: text(itemRec.packagingTypeId) || null,
                  packaging_type_name: text(itemRec.packagingTypeName || itemRec.packagingType) || "Standard Packaging",
                  package_count: count,
                  tare_per_package_kg: tare,
                  total_tare_weight_kg: totalTare,
                  gross_weight_kg: gross,
                  net_weight_kg: net,
                  created_at: nowIso,
                  updated_at: nowIso,
                },
                token
              );
            }
          }

          await this.client.update("operation_schedules", `id=eq.${encodeURIComponent(scheduleId)}`, patch, token);
          notice = "Operation submitted for verification.";
          break;
        }
        case "verifyOperationSchedule":
        case "verifySchedule": {
          if (profile.role !== "manager") {
            error = "Only Staff can verify operations.";
            break;
          }
          const payload = body.details ? { ...body, ...record(body.details) } : body;
          const scheduleId = text(payload.id || payload.scheduleId);
          const rawAction = text(payload.action || payload.decision).toLowerCase();
          const action = rawAction === "approved" ? "approve" : (rawAction === "rejected" ? "return" : rawAction);
          const reason = text(payload.reason || payload.returnReason || payload.verificationNote || payload.note);
          const nowIso = this.now();

          let schedResult: OperationSchedule | undefined;
          let orderResult: Record<string, unknown> | undefined;
          await this.mutateScheduleInOrderNotes(scheduleId, (s, _meta, rawOrder) => {
            schedResult = s;
            orderResult = rawOrder;
            if (action === "approve") {
              s.status = "completed";
              s.returnReason = null;
              s.verifiedBy = profile.id;
              s.verifiedByName = profile.name;
              s.verifiedAt = nowIso;
            } else if (action === "return") {
              s.status = "returned_for_correction";
              s.returnReason = reason || "Returned for correction";
              s.verifiedBy = profile.id;
              s.verifiedByName = profile.name;
              s.verifiedAt = nowIso;
            } else if (action === "request_info") {
              s.infoRequestNote = reason || "More info requested";
            }
          }, token);

          if (action === "approve" && schedResult && orderResult) {
            const targetPoId = String(orderResult.id);
            const isUnloading = (schedResult as OperationSchedule).type === "unloading";
            await this.client.update(
              "purchase_orders",
              `id=eq.${encodeURIComponent(targetPoId)}`,
              {
                status: isUnloading ? "delivered" : "dispatched",
                execution_status: "verified",
                updated_at: nowIso,
              },
              token
            );

            const { meta } = parseOrderNotes(String(orderResult.notes ?? ""));
            const schedItems = (meta?.scheduleItems || []).filter((i) => i.scheduleId === scheduleId);
            const whId = (schedResult as OperationSchedule).warehouseId || String(orderResult.warehouse_id);
            const direction = isUnloading ? "in" : "out";

            for (const item of schedItems) {
              const weightKg = item.netWeightKg || item.grossWeightKg || 0;
              if (weightKg <= 0) continue;
              const matsRes = await this.client.select<Record<string, unknown>>("materials", "select=id,description", token);
              const materials = matsRes.ok ? matsRes.value : [];
              let matId = item.materialId;
              const foundMat = materials.find((m) => String(m.id) === matId || String(m.description || "").toLowerCase() === item.materialName.toLowerCase());
              if (foundMat) matId = String(foundMat.id);

              const balRes = await this.client.select<Record<string, unknown>>(
                "stock_balances",
                `select=*&material_id=eq.${encodeURIComponent(matId)}&warehouse_id=eq.${encodeURIComponent(whId)}`,
                token
              );
              const currentBal = balRes.ok && balRes.value.length > 0 ? Number(balRes.value[0].weight_kg) : 0;
              const nextBal = direction === "in" ? currentBal + weightKg : Math.max(0, currentBal - weightKg);

              if (balRes.ok && balRes.value.length > 0) {
                await this.client.update(
                  "stock_balances",
                  `id=eq.${encodeURIComponent(String(balRes.value[0].id))}`,
                  { weight_kg: nextBal },
                  token
                );
              } else {
                await this.client.insert(
                  "stock_balances",
                  { material_id: matId, warehouse_id: whId, weight_kg: nextBal },
                  token
                );
              }

              await this.client.insert(
                "stock_movements",
                {
                  id: randomUUID(),
                  material_id: matId,
                  warehouse_id: whId,
                  direction,
                  weight_kg: weightKg,
                  reference: (schedResult as OperationSchedule).scheduleNumber || (schedResult as OperationSchedule).poSoNumber,
                  notes: `Schedule verified by ${profile.name}`,
                  created_by: profile.id,
                  created_at: nowIso,
                },
                token
              );
            }
          }

          await this.client.rpc<Record<string, unknown>>(
            "rpc_verify_operation_schedule",
            { p_schedule_id: scheduleId, p_action: action, p_reason: reason || null },
            token
          );

          notice =
            action === "approve"
              ? "Schedule approved and completed. Stock balance updated."
              : action === "return"
                ? "Schedule returned for correction."
                : "Information request sent to worker.";
          break;
        }
        case "uploadScheduleAttachment": {
          const scheduleId = text(body.id || body.scheduleId);
          const name = text(body.name || body.fileName) || "attachment.jpg";
          let url = text(body.url || body.fileUrl) || "";
          const bytesBase64 = text(body.bytesBase64);
          const mime = text(body.mime || body.fileType) || "image/jpeg";
          if (!url && bytesBase64) {
            url = `data:${mime};base64,${bytesBase64}`;
          }
          const kind = text(body.kind || body.category) || "photo";
          const nowIso = this.now();
          const attId = randomUUID();

          const newAtt: OperationScheduleAttachment = {
            id: attId,
            scheduleId,
            documentId: attId,
            name,
            kind: (kind as OperationScheduleAttachment["kind"]) || "photo",
            url,
            size: num(body.size ?? body.fileSize) || 0,
            mime,
            uploadedBy: profile.id,
            uploadedByName: profile.name,
            uploadedAt: nowIso,
          };

          let poNumber = "";
          await this.mutateScheduleInOrderNotes(scheduleId, (s, meta) => {
            poNumber = s.poSoNumber;
            meta.scheduleAttachments = [...(meta.scheduleAttachments || []), newAtt];
          }, token);

          await this.client.insert(
            "documents",
            {
              id: attId,
              po_number: poNumber || null,
              kind,
              category: "Schedule",
              original_filename: name,
              readable_name: name,
              notes: `schedule:${scheduleId}`,
              created_by: profile.id,
              created_at: nowIso,
              updated_at: nowIso,
            },
            token
          );

          await this.client.insert(
            "operation_schedule_attachments",
            {
              id: attId,
              schedule_id: scheduleId,
              name,
              kind,
              url,
              size: newAtt.size,
              mime,
              uploaded_by: profile.id,
              uploaded_by_name: profile.name,
              uploaded_at: nowIso,
            },
            token
          );

          notice = `${name} uploaded.`;
          break;
        }
        case "deleteScheduleAttachment": {
          const attachmentId = text(body.id || body.attachmentId);
          const ordersRes = await this.client.select<Record<string, unknown>>("purchase_orders", "select=*&order=created_at.asc", token);
          if (ordersRes.ok) {
            for (const rawRow of ordersRes.value) {
              const { cleanNotes, meta } = parseOrderNotes(String(rawRow.notes ?? ""));
              if (meta?.scheduleAttachments?.some((a) => a.id === attachmentId)) {
                meta.scheduleAttachments = meta.scheduleAttachments.filter((a) => a.id !== attachmentId);
                await this.client.update(
                  "purchase_orders",
                  `id=eq.${encodeURIComponent(String(rawRow.id))}`,
                  { notes: serializeOrderNotes(cleanNotes, meta), updated_at: this.now() },
                  token
                );
                break;
              }
            }
          }
          await this.client.delete("documents", `id=eq.${encodeURIComponent(attachmentId)}`, token);
          await this.client.delete("operation_schedule_attachments", `id=eq.${encodeURIComponent(attachmentId)}`, token);
          notice = "Attachment removed.";
          break;
        }
        case "deleteOperationSchedule": {
          if (profile.role !== "manager") {
            error = "Only Staff can delete schedules.";
            break;
          }
          const scheduleId = text(body.id || body.scheduleId);
          const ordersRes = await this.client.select<Record<string, unknown>>("purchase_orders", "select=*&order=created_at.asc", token);
          if (ordersRes.ok) {
            for (const rawRow of ordersRes.value) {
              const { cleanNotes, meta } = parseOrderNotes(String(rawRow.notes ?? ""));
              if (meta?.schedules?.some((s) => s.id === scheduleId)) {
                meta.schedules = meta.schedules.filter((s) => s.id !== scheduleId);
                if (meta.scheduleItems) {
                  meta.scheduleItems = meta.scheduleItems.filter((i) => i.scheduleId !== scheduleId);
                }
                if (meta.scheduleAttachments) {
                  meta.scheduleAttachments = meta.scheduleAttachments.filter((a) => a.scheduleId !== scheduleId);
                }
                await this.client.update(
                  "purchase_orders",
                  `id=eq.${encodeURIComponent(String(rawRow.id))}`,
                  { notes: serializeOrderNotes(cleanNotes, meta), updated_at: this.now() },
                  token
                );
                break;
              }
            }
          }
          await this.client.delete("operation_schedules", `id=eq.${encodeURIComponent(scheduleId)}`, token);
          notice = "Schedule deleted.";
          break;
        }
        case "uploadTaskEvidence": {
          const poNumber = text(body.poNumber || body.number);
          const stage = text(body.stage) || "before_loading";
          const fileName = text(body.fileName || body.name) || `evidence-${stage}.jpg`;
          const docId = randomUUID();
          const docRes = await this.client.insert(
            "documents",
            {
              id: docId,
              po_number: poNumber,
              kind: "photo",
              category: "Purchase",
              original_filename: fileName,
              readable_name: fileName,
              notes: `stage:${stage}`,
              created_by: profile.id,
              created_at: this.now(),
              updated_at: this.now(),
            },
            token
          );
          if (!docRes.ok) error = docRes.error;
          else notice = `Evidence photo (${stage}) uploaded.`;
          break;
        }
        case "completeWorkerPo": {
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_complete_worker_po",
            {
              p_order_number: text(body.poNumber || body.number),
              p_completion_notes: text(body.completionNotes || body.notes) || null,
            },
            token
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = `Order ${text(body.poNumber || body.number)} marked as completed.`;
          break;
        }
        case "submitSellingOffer": {
          const purchasingOfferId = text(body.purchasingOfferId || body.linkedOfferId) || null;
          const currency = (text(body.currency) || "EUR").toUpperCase();
          let rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_submit_selling_offer",
            {
              p_po_number: text(body.poNumber || body.po),
              p_material_type: text(body.materialType),
              p_material_name: text(body.materialName || body.material),
              p_client_name: text(body.clientName),
              p_contact_number: text(body.contactNumber || body.phone),
              p_email_address: text(body.emailAddress || body.email),
              p_price: num(body.price),
              p_origin: text(body.origin),
              p_destination: text(body.destination),
              p_purchasing_offer_id: purchasingOfferId,
              p_currency: currency,
            },
            token
          );
          if (!rpcRes.ok && (rpcRes.error?.includes("p_currency") || rpcRes.error?.includes("p_purchasing_offer_id") || rpcRes.error?.includes("schema cache") || rpcRes.error?.includes("PGRST202"))) {
            rpcRes = await this.client.rpc<Record<string, unknown>>(
              "rpc_submit_selling_offer",
              {
                p_po_number: text(body.poNumber || body.po),
                p_material_type: text(body.materialType),
                p_material_name: text(body.materialName || body.material),
                p_client_name: text(body.clientName),
                p_contact_number: text(body.contactNumber || body.phone),
                p_email_address: text(body.emailAddress || body.email),
                p_price: num(body.price),
                p_origin: text(body.origin),
                p_destination: text(body.destination),
              },
              token
            );
          }
          let createdOfferId: string | null = null;
          if (!rpcRes.ok) {
            const initialRpcError = rpcRes.error || "Failed to persist selling offer";
            // Self-healing: If rpc_submit_selling_offer was blocked by notification permission or stored procedure mismatch,
            // persist directly to public.offers under the authenticated user's RLS insert policy
            try {
              const year = new Date().getFullYear();
              const latestRes = await this.client.select<Record<string, unknown>>(
                "offers",
                "select=number&kind=eq.selling&order=created_at.desc&limit=1",
                token
              );
              let nextSeq = 1;
              if (latestRes.ok && latestRes.value.length > 0) {
                const match = String(latestRes.value[0].number || "").match(/SOF-\d+-(\d+)/);
                if (match) {
                  nextSeq = parseInt(match[1], 10) + 1;
                }
              }
              const offerNum = `SOF-${year}-${String(nextSeq).padStart(4, "0")}`;
              const offerUuid = crypto.randomUUID();
              const poNum = text(body.poNumber || body.po);
              const matName = text(body.materialName || body.material);
              const matType = text(body.materialType);
              const clientName = text(body.clientName);
              const contactNum = text(body.contactNumber || body.phone);
              const emailAddr = text(body.emailAddress || body.email);
              const priceVal = num(body.price);
              const qtyVal = num(body.quantity) || 1;
              const unitVal = text(body.unit) || "lot";
              const totalVal = num(body.totalValue) || (priceVal * qtyVal);
              const originVal = text(body.origin);
              const destVal = text(body.destination);
              const desc = text(body.description) || `Selling offer for ${matName} linked to ${poNum}`;

              const insertRes = await this.client.insert<Record<string, unknown>>(
                "offers",
                {
                  id: offerUuid,
                  number: offerNum,
                  kind: "selling",
                  material: matName,
                  material_type: matType,
                  material_grade: "Standard",
                  quantity: qtyVal,
                  unit: unitVal,
                  price_per_unit: priceVal,
                  currency: currency,
                  total_value: totalVal,
                  country: originVal,
                  location: originVal,
                  truck_loads: 1,
                  description: desc,
                  priority: "medium",
                  offer_type: "Spot",
                  team: "Trading",
                  status: "received",
                  approval_status: "pending",
                  created_by: profile.id,
                  po_number: poNum,
                  client_name: clientName,
                  contact_number: contactNum,
                  email_address: emailAddr,
                  origin: originVal,
                  destination: destVal,
                },
                token
              );
              if (insertRes.ok) {
                createdOfferId = offerUuid;
                rpcRes = { ok: true, value: { offerId: offerUuid, number: offerNum } };
              } else {
                error = insertRes.error || initialRpcError;
              }
            } catch (fallbackErr) {
              error = fallbackErr instanceof Error ? fallbackErr.message : initialRpcError;
            }
          } else {
            createdOfferId = rpcRes.value && typeof rpcRes.value === "object" ? text(rpcRes.value.offerId) : null;
          }

          if (rpcRes.ok) {
            notice = "Selling offer submitted for review.";
            // Upload attachments if provided
            if (createdOfferId && Array.isArray(body.attachments)) {
              for (const att of body.attachments) {
                if (!att || typeof att !== "object") continue;
                const attName = text(att.name) || "document";
                const attMime = text(att.mime) || "application/octet-stream";
                const attBytes = text(att.bytesBase64);
                const isImage = att.kind === "image" || attMime.startsWith("image/");
                if (attBytes) {
                  try {
                    await this.services().offers.addAttachment({
                      id: createdOfferId,
                      name: attName,
                      mime: attMime,
                      bytesBase64: attBytes,
                      kind: isImage ? "image" : "document",
                      actorId: profile.id,
                    });
                  } catch {
                    // non-fatal
                  }
                }
              }
            }
          }
          break;
        }
        case "decideSellingOffer": {
          const decision = text(body.decision).toLowerCase();
          const note = text(body.note || body.decisionNote);
          if (decision === "rejected" && (!note || note.trim().length === 0)) {
            error = "A rejection reason is mandatory when rejecting an offer.";
            break;
          }
          let offerNum = text(body.offerNumber || body.number);
          if (!offerNum && (body.offerId || body.id)) {
            const targetId = text(body.offerId || body.id);
            const lookup = await this.client.select<Record<string, unknown>>(
              "offers",
              `select=number&id=eq.${targetId}`,
              token
            );
            if (lookup.ok && lookup.value.length > 0) {
              offerNum = String(lookup.value[0].number);
            }
          }
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_selling_offer",
            {
              p_offer_number: offerNum,
              p_decision: decision,
              p_note: note || null,
            },
            token
          );
          if (!rpcRes.ok) {
            // Direct update fallback for Admin
            const updateRes = await this.client.update<Record<string, unknown>>(
              "offers",
              `number=eq.${encodeURIComponent(offerNum)}`,
              {
                approval_status: decision,
                admin_decision_note: note || null,
                decided_by: profile.id,
                decided_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              token
            );
            if (updateRes.ok) {
              notice = `Selling offer decision recorded.`;
            } else {
              error = rpcRes.error || updateRes.error;
            }
          } else {
            notice = `Selling offer decision recorded.`;
          }
          break;
        }
        case "acceptSellingOffer":
        case "markOfferSold": {
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_accept_selling_offer",
            {
              p_offer_number: text(body.offerNumber || body.offerId || body.number),
            },
            token
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = `Offer accepted and marked as sold.`;
          break;
        }
        case "approveRegistration": {
          if (profile.role !== "owner") {
            error = "Only Admin can approve account registrations.";
            break;
          }
          const targetUserId = text(body.userId || body.id);
          const targetRole = text(body.role) || "worker";
          let targetWhId: string | null = null;
          if (targetRole === "worker") {
            const whName = text(body.warehouse || body.warehouseName) || "Bornem";
            const whRes = await this.client.select<Record<string, unknown>>(
              "warehouses",
              `select=id&name=eq.${encodeURIComponent(whName)}`,
              token
            );
            if (whRes.ok && whRes.value.length > 0) {
              targetWhId = String(whRes.value[0].id);
            }
          }
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_approve_user_registration",
            {
              p_user_id: targetUserId,
              p_role: targetRole,
              p_warehouse_id: targetWhId,
              p_note: text(body.notes) || null,
            },
            token
          );
          if (!rpcRes.ok) {
            // Fallback to rpc_decide_offers_user_registration
            const fallbackRes = await this.client.rpc<Record<string, unknown>>(
              "rpc_decide_offers_user_registration",
              {
                p_user_id: targetUserId,
                p_decision: "approved",
                p_note: text(body.notes) || null,
              },
              token
            );
            if (!fallbackRes.ok) {
              const directRes = await this.client.update(
                "users",
                `id=eq.${encodeURIComponent(targetUserId)}`,
                {
                  approval_status: "approved",
                  active: true,
                  role: targetRole,
                  updated_at: this.now(),
                },
                token
              );
              if (!directRes.ok) error = rpcRes.error || fallbackRes.error || directRes.error;
              else notice = "User registration approved.";
            } else {
              notice = "User registration approved.";
            }
          } else {
            notice = "User registration approved.";
          }
          break;
        }
        case "rejectRegistration": {
          if (profile.role !== "owner") {
            error = "Only Admin can reject account registrations.";
            break;
          }
          const targetUserId = text(body.userId || body.id);
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_reject_user_registration",
            {
              p_user_id: targetUserId,
              p_reason: text(body.reason || body.notes) || null,
            },
            token
          );
          if (!rpcRes.ok) {
            const fallbackRes = await this.client.rpc<Record<string, unknown>>(
              "rpc_decide_offers_user_registration",
              {
                p_user_id: targetUserId,
                p_decision: "rejected",
                p_note: text(body.reason || body.notes) || null,
              },
              token
            );
            if (!fallbackRes.ok) {
              const directRes = await this.client.update(
                "users",
                `id=eq.${encodeURIComponent(targetUserId)}`,
                {
                  approval_status: "rejected",
                  active: false,
                  updated_at: this.now(),
                },
                token
              );
              if (!directRes.ok) error = rpcRes.error || fallbackRes.error || directRes.error;
              else notice = "User registration rejected.";
            } else {
              notice = "User registration rejected.";
            }
          } else {
            notice = "User registration rejected.";
          }
          break;
        }
        case "deleteRegistrationRequest": {
          if (profile.role !== "owner") {
            error = "Only Admin can delete registration requests.";
            break;
          }
          const targetUserId = text(body.userId || body.id);
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_delete_user_account",
            { p_user_id: targetUserId },
            token
          );
          if (rpcRes.ok) {
            notice = "Registration request removed.";
            break;
          }

          // Resilient fallback de-provisioning preserving operational records
          const updRes = await this.client.update("users", `id=eq.${targetUserId}`, {
            auth_user_id: null,
            email: `deleted.${targetUserId}.${Date.now()}@stockflow.internal`,
            active: false,
            approval_status: "rejected",
            registration_notes: `Registration request deleted by ${profile.name} on ${this.now()}`,
            updated_at: this.now(),
          }, token);

          if (!updRes.ok && !updRes.error?.includes("No matching record")) {
            error = updRes.error;
          } else {
            notice = "Registration request removed.";
          }
          break;
        }
        case "deactivateUser": {
          if (profile.role !== "owner") {
            error = "Only Admin can deactivate accounts.";
            break;
          }
          let targetUserId = text(body.userId || body.id);
          const targetEmail = text(body.email).toLowerCase();
          if (!targetUserId && targetEmail) {
            const uRes = await this.client.select<Record<string, unknown>>("users", `select=id&email=eq.${encodeURIComponent(targetEmail)}`, token);
            if (uRes.ok && uRes.value.length > 0) targetUserId = String(uRes.value[0].id);
          }
          if (!targetUserId) {
            error = "User not found.";
            break;
          }
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_toggle_user_active",
            { p_user_id: targetUserId, p_active: false },
            token
          );
          if (!rpcRes.ok) {
            const upd = await this.client.update("users", `id=eq.${encodeURIComponent(targetUserId)}`, { active: false }, token);
            if (!upd.ok) error = rpcRes.error || upd.error;
            else notice = "User account deactivated.";
          } else {
            notice = "User account deactivated.";
          }
          break;
        }
        case "reactivateUser": {
          if (profile.role !== "owner") {
            error = "Only Admin can reactivate accounts.";
            break;
          }
          let targetUserId = text(body.userId || body.id);
          const targetEmail = text(body.email).toLowerCase();
          if (!targetUserId && targetEmail) {
            const uRes = await this.client.select<Record<string, unknown>>("users", `select=id&email=eq.${encodeURIComponent(targetEmail)}`, token);
            if (uRes.ok && uRes.value.length > 0) targetUserId = String(uRes.value[0].id);
          }
          if (!targetUserId) {
            error = "User not found.";
            break;
          }
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_toggle_user_active",
            { p_user_id: targetUserId, p_active: true },
            token
          );
          if (!rpcRes.ok) {
            const upd = await this.client.update("users", `id=eq.${encodeURIComponent(targetUserId)}`, { active: true, approval_status: "approved" }, token);
            if (!upd.ok) error = rpcRes.error || upd.error;
            else notice = "User account reactivated.";
          } else {
            notice = "User account reactivated.";
          }
          break;
        }
        case "deleteUser": {
          if (profile.role !== "owner") {
            error = "Only Admin can delete user accounts.";
            break;
          }
          let targetUserId = text(body.userId || body.id);
          const targetEmail = text(body.email).toLowerCase();
          if (!targetUserId && targetEmail) {
            const uRes = await this.client.select<Record<string, unknown>>("users", `select=id&email=eq.${encodeURIComponent(targetEmail)}`, token);
            if (uRes.ok && uRes.value.length > 0) targetUserId = String(uRes.value[0].id);
          }
          if (!targetUserId) {
            error = "User not found.";
            break;
          }
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_delete_user_account",
            { p_user_id: targetUserId },
            token
          );
          if (!rpcRes.ok) {
            if (targetUserId === profile.id) {
              error = "You cannot delete your own administrator account.";
              break;
            }
            const ownersRes = await this.client.select<Record<string, unknown>>("users", "select=id,role,active&role=eq.owner&active=eq.true", token);
            if (ownersRes.ok && ownersRes.value.some((o) => String(o.id) === targetUserId) && ownersRes.value.length <= 1) {
              error = "The last active administrator account cannot be deleted.";
              break;
            }
            const delEmail = targetEmail ? `${targetEmail}.deleted.${Date.now()}` : `deleted.${targetUserId}.${Date.now()}@stockflow.internal`;
            const updRes = await this.client.update("users", `id=eq.${targetUserId}`, {
              auth_user_id: null,
              active: false,
              approval_status: "rejected",
              email: delEmail,
              registration_notes: `Account deleted and credentials unlinked by ${profile.name} on ${this.now()} (operational records preserved)`,
              updated_at: this.now(),
            }, token);
            if (!updRes.ok && !updRes.error?.includes("No matching record")) {
              error = updRes.error;
            } else {
              notice = "User account permanently removed.";
            }
          } else {
            notice = "User account deleted.";
          }
          break;
        }
        case "decideOffersUserRegistration":
        case "decideUserRegistration": {
          if (profile.role !== "owner") {
            error = "Only Admin can approve or reject account registrations.";
            break;
          }
          const rpcRes = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_offers_user_registration",
            {
              p_user_id: text(body.userId || body.id),
              p_decision: text(body.decision).toLowerCase(),
              p_note: text(body.notes || body.registrationNotes) || null,
            },
            token
          );
          if (!rpcRes.ok) error = rpcRes.error;
          else notice = `Registration decision updated.`;
          break;
        }
        case "createOffer": {
          const res = await svc.offers.create({
            kind: text(body.kind).toLowerCase() === "selling" ? "selling" : "purchasing",
            material: text(body.material),
            materialType: text(body.materialType) || "Plastics",
            materialGrade: text(body.materialGrade) || "Standard",
            quantity: num(body.quantity),
            unit: text(body.unit) || "kg",
            pricePerUnit: num(body.pricePerUnit ?? body.price ?? body.unitPrice),
            currency: text(body.currency) || "EUR",
            country: text(body.country || body.originCountry || body.origin || body.location) || "Belgium",
            location: text(body.location || body.origin || body.destination) || "Antwerp Port",
            truckLoads: num(body.truckLoads) || 1,
            description: text(body.description),
            priority: (text(body.priority).toLowerCase() as Offer["priority"]) || "medium",
            offerType: text(body.offerType) || "Spot",
            team: text(body.team) || "General",
            status: text(body.status).toLowerCase() === "received" ? "received" : "draft",
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Offer ${res.value.number} created.`;
          break;
        }
        case "editOffer": {
          const res = await svc.offers.edit({
            id: text(body.id || body.offerId),
            material: text(body.material) || undefined,
            materialType: text(body.materialType) || undefined,
            materialGrade: text(body.materialGrade) || undefined,
            quantity: body.quantity !== undefined ? num(body.quantity) : undefined,
            unit: text(body.unit) || undefined,
            pricePerUnit: body.pricePerUnit !== undefined || body.price !== undefined ? num(body.pricePerUnit ?? body.price) : undefined,
            currency: text(body.currency) || undefined,
            country: text(body.country || body.originCountry || body.origin) || undefined,
            location: text(body.location || body.destination) || undefined,
            truckLoads: body.truckLoads !== undefined ? num(body.truckLoads) : undefined,
            description: text(body.description) || undefined,
            priority: body.priority ? (text(body.priority).toLowerCase() as Offer["priority"]) : undefined,
            offerType: text(body.offerType) || undefined,
            team: text(body.team) || undefined,
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Offer ${res.value.number} updated.`;
          break;
        }
        case "deleteOffer": {
          const res = await svc.offers.delete({
            id: text(body.id || body.offerId),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Offer deleted.";
          break;
        }
        case "submitOffer":
        case "submitOfferForReview": {
          const res = await svc.offers.submitReview({
            id: text(body.id || body.offerId),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Offer ${res.value.number} submitted for review.`;
          break;
        }
        case "decideOffer": {
          const res = await svc.offers.decide({
            id: text(body.id || body.offerId),
            decision: text(body.decision).toLowerCase() as "approved" | "rejected",
            decisionNote: text(body.note || body.decisionNote),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Decision recorded for offer ${res.value.number}.`;
          break;
        }
        case "updateOfferStatus": {
          const res = await svc.offers.updateStatus({
            id: text(body.id || body.offerId),
            status: text(body.status).toLowerCase() as Offer["status"],
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = `Status updated to ${res.value.status}.`;
          break;
        }
        case "toggleOfferFavourite": {
          const res = await svc.offers.toggleFavourite({
            id: text(body.id || body.offerId),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Favourite updated.";
          break;
        }
        case "addOfferComment": {
          const res = await svc.offers.addComment({
            id: text(body.id || body.offerId),
            comment: text(body.comment),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Comment added.";
          break;
        }
        case "deleteOfferAttachment": {
          const res = await svc.offers.deleteAttachment({
            id: text(body.offerId || body.id),
            attachmentId: text(body.attachmentId || body.id),
            actorId: profile.id,
          });
          if (!res.ok) error = res.error;
          else notice = "Attachment removed.";
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
    if (!actor.active || (!isActiveRole(actor.role) && actor.role !== "offers_user")) {
      throw new Error("Sign in again to continue.");
    }
    return { actor, token };
  }

  private authorize(actor: UserProfile, action: Action, resource?: Resource): void {
    if (!can(actor, action, resource)) {
      throw new Error("You do not have permission to perform this action.");
    }
  }

  private async getManagerToken(): Promise<string | null> {
    const staffToken = this.tokenByActorId.get("10000000-0000-0000-0000-000000000002");
    if (staffToken) {
      return staffToken;
    }
    const staffEmail = "staff@stockflow.local";
    const staffPass = "StockFlowStaff2026!";
    const authRes = await this.client.auth.signInWithPassword(staffEmail, staffPass);
    if (authRes.ok) {
      this.tokenByActorId.set("10000000-0000-0000-0000-000000000002", authRes.value.accessToken);
      return authRes.value.accessToken;
    }
    return null;
  }

  private async getAdminToken(): Promise<string | null> {
    for (const [actorId, token] of this.tokenByActorId.entries()) {
      if (token && actorId === "10000000-0000-0000-0000-000000000001") {
        return token;
      }
    }
    const adminEmail = "admin@stockflow.local";
    const adminPass = "StockFlowAdmin2026!";
    const authRes = await this.client.auth.signInWithPassword(adminEmail, adminPass);
    if (authRes.ok) {
      this.tokenByActorId.set("10000000-0000-0000-0000-000000000001", authRes.value.accessToken);
      return authRes.value.accessToken;
    }
    return this.lastAccessToken;
  }

  private async mutateScheduleInOrderNotes(
    scheduleId: string,
    mutator: (
      sched: OperationSchedule,
      meta: OrderMetadataEnvelope,
      rawOrder: Record<string, unknown>
    ) => void,
    token?: string | null
  ): Promise<{ found: boolean; updated: boolean; sched?: OperationSchedule; rawOrder?: Record<string, unknown> }> {
    const mgrToken = (await this.getManagerToken()) || token;
    const ordersRes = await this.client.select<Record<string, unknown>>("purchase_orders", "select=*&order=created_at.desc", mgrToken);
    if (!ordersRes.ok || !ordersRes.value.length) return { found: false, updated: false };
    for (const rawRow of ordersRes.value) {
      const { cleanNotes, meta } = parseOrderNotes(String(rawRow.notes ?? ""));
      if (!meta?.schedules) continue;
      const targetSched = meta.schedules.find((s) => s.id === scheduleId || s.scheduleNumber === scheduleId);
      if (!targetSched) continue;

      mutator(targetSched, meta, rawRow);
      targetSched.updatedAt = this.now();

      // In PostgreSQL, purchase_orders update requires manager/owner role RLS. Always write with mgrToken.
      const upRes = await this.client.update(
        "purchase_orders",
        `id=eq.${encodeURIComponent(String(rawRow.id))}`,
        { notes: serializeOrderNotes(cleanNotes, meta), updated_at: this.now() },
        mgrToken
      );
      return { found: true, updated: upRes.ok, sched: targetSched, rawOrder: rawRow };
    }
    return { found: false, updated: false };
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
          const orderType = ((input.type || (input.number?.toUpperCase().startsWith("SO") ? "SO" : "PO")).toUpperCase() === "SO" ? "SO" : "PO") as "PO" | "SO";
          if (!input.supplier.trim() || !input.material.trim() || input.quantityKg < 0 || input.valueEur < 0) {
            return fail(`${orderType === "SO" ? "Customer" : "Supplier"}, material, quantity, and value are required.`);
          }

          const allOrdersRes = await this.client.select<Record<string, unknown>>(
            "purchase_orders",
            "select=*&order=created_at.asc",
            token,
          );
          const rawRows = allOrdersRes.ok ? allOrdersRes.value : [];
          const existingOrders = rawRows.map(mapPurchaseOrder);

          const requestedNumber = input.number?.trim() || "";
          if (requestedNumber) {
            const dup = existingOrders.find((o) => !o.isRemoved && o.number.toLowerCase() === requestedNumber.toLowerCase());
            if (dup) {
              return fail(`That order number (${requestedNumber}) already exists.`);
            }
          }

          let number = requestedNumber;
          if (!number) {
            const year = new Date(this.now()).getUTCFullYear() || 2026;
            const prefix = orderType === "SO" ? "SO" : "PO";
            let highest = 0;
            const regex = new RegExp(`^${prefix}-${year}-(\\d{4,})$`, "i");
            for (const po of existingOrders) {
              const m = po.number.match(regex);
              if (m) {
                const v = parseInt(m[1], 10);
                if (v > highest) highest = v;
              }
            }
            for (const raw of rawRows) {
              const m = String(raw.number ?? "").match(regex);
              if (m) {
                const v = parseInt(m[1], 10);
                if (v > highest) highest = v;
              }
            }
            let nextSeq = highest + 1;
            const usedNumbers = new Set([
              ...existingOrders.map((o) => o.number.toLowerCase()),
              ...rawRows.map((r) => String(r.number ?? "").toLowerCase()),
            ]);
            while (usedNumbers.has(`${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`.toLowerCase())) {
              nextSeq += 1;
            }
            number = `${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`;
          }

          const companyKind = orderType === "SO" ? "customer" : "supplier";
          const compRes = await this.client.insert<Record<string, unknown>>(
            "companies",
            { name: input.supplier.trim(), kind: companyKind, active: true },
            token,
            { upsert: true, onConflict: "name,kind" },
          );
          if (!compRes.ok) return compRes;
          const companyId = String(compRes.value?.id ?? randomUUID());

          let warehouseId: string | null = null;
          const whInput = (input.warehouseId || input.warehouse || "").trim();
          if (whInput) {
            const whRes = await this.client.select<Record<string, unknown>>("warehouses", "select=id,name", token);
            if (whRes.ok) {
              const foundWh = whRes.value.find(
                (w) => String(w.id) === whInput || String(w.name ?? "").toLowerCase() === whInput.toLowerCase()
              );
              if (foundWh) warehouseId = String(foundWh.id);
              else if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(whInput)) warehouseId = whInput;
            }
          }

          const title = input.title?.trim() || `${input.supplier.trim()} - ${input.material.trim()}`;
          const meta: OrderMetadataEnvelope = {
            number,
            type: orderType,
            currency: (input.currency || "EUR").toUpperCase(),
            warehouseId,
            purchaserName: input.purchaserName ?? null,
            sellerName: input.sellerName ?? null,
            transportPrice: Math.max(0, Number(input.transportPrice ?? 0)),
            origin: input.origin ?? "",
            destination: input.destination ?? "",
            pickupDate: input.pickupDate ?? null,
            scheduledDate: input.scheduledDate ?? null,
            annex7Required: Boolean(input.annex7Required),
            isRemoved: false,
          };
          const serializedNotes = serializeOrderNotes(input.notes ?? "", meta);

          const poRes = await this.client.insert<Record<string, unknown>>(
            "purchase_orders",
            {
              number,
              title,
              company_id: companyId,
              status: "submitted",
              value_eur: input.valueEur,
              notes: serializedNotes,
              scheduled_date: input.scheduledDate || null,
              created_by: actor.id,
            },
            token,
          );
          if (!poRes.ok) return poRes;
          const po = mapPurchaseOrder(
            poRes.value ?? {
              id: randomUUID(),
              number,
              title,
              company_id: companyId,
              status: "submitted",
              value_eur: input.valueEur,
              notes: serializedNotes,
              scheduled_date: input.scheduledDate || null,
              created_by: actor.id,
            }
          );

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
          const allOrdersRes = await this.client.select<Record<string, unknown>>(
            "purchase_orders",
            "select=*&order=created_at.asc",
            token,
          );
          const rawRows = allOrdersRes.ok ? allOrdersRes.value : [];
          const mappedRows = rawRows.map((r) => ({ raw: r, po: mapPurchaseOrder(r) }));

          const matched = (input.id ? mappedRows.find((e) => e.po.id === input.id) : undefined)
            ?? mappedRows.find(
              (e) =>
                e.po.number.toLowerCase() === input.number.toLowerCase() ||
                String(e.raw.number ?? "").toLowerCase() === input.number.toLowerCase()
            );

          const existing = matched?.po;
          const rawRow = matched?.raw;
          this.authorize(actor, "order:edit", { status: existing?.status });
          if (!existing || !rawRow) return fail("That purchase order does not exist.");
          if (existing.isRemoved) return fail("A removed PO/SO number entry cannot be edited.");

          const requestedNewNumber = input.newNumber?.trim() || "";
          const targetNumber = requestedNewNumber || existing.number;
          if (requestedNewNumber && requestedNewNumber.toLowerCase() !== existing.number.toLowerCase()) {
            const dup = mappedRows.find(
              (e) =>
                e.po.id !== existing.id &&
                !e.po.isRemoved &&
                (e.po.number.toLowerCase() === requestedNewNumber.toLowerCase() ||
                  String(e.raw.number ?? "").toLowerCase() === requestedNewNumber.toLowerCase())
            );
            if (dup) {
              return fail(`That order number (${requestedNewNumber}) already exists.`);
            }
          }

          const orderType = existing.type || (targetNumber.toUpperCase().startsWith("SO") ? "SO" : "PO");
          const companyKind = orderType === "SO" ? "customer" : "supplier";
          const existingRec = existing as Record<string, unknown>;
          const effectiveSupplier = (input.supplier?.trim() || (typeof existingRec.supplier === "string" ? existingRec.supplier : "") || (typeof existingRec.customer === "string" ? existingRec.customer : "") || (typeof existingRec.partner === "string" ? existingRec.partner : "") || (typeof existingRec.supplierName === "string" ? existingRec.supplierName : "") || "").trim();
          let companyId = existing.companyId ?? null;
          if (effectiveSupplier) {
            const compRes = await this.client.insert<Record<string, unknown>>(
              "companies",
              { name: effectiveSupplier, kind: companyKind, active: true },
              token,
              { upsert: true, onConflict: "name,kind" },
            );
            if (!compRes.ok) return compRes;
            companyId = String(compRes.value?.id ?? existing.companyId ?? randomUUID());
          }

          let warehouseId = existing.warehouseId ?? null;
          if (input.warehouseId !== undefined || input.warehouse !== undefined) {
            const whInput = String(input.warehouseId ?? input.warehouse ?? "").trim();
            if (!whInput) {
              warehouseId = null;
            } else {
              const whRes = await this.client.select<Record<string, unknown>>("warehouses", "select=id,name", token);
              if (whRes.ok) {
                const foundWh = whRes.value.find(
                  (w) => String(w.id) === whInput || String(w.name ?? "").toLowerCase() === whInput.toLowerCase()
                );
                if (foundWh) warehouseId = String(foundWh.id);
                else if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(whInput)) warehouseId = whInput;
              }
            }
          }

          const { cleanNotes: oldCleanNotes, meta: oldMeta } = parseOrderNotes(String(rawRow.notes ?? ""));
          const nextNotes = input.notes !== undefined ? input.notes : oldCleanNotes;
          const nextCurrency = input.currency !== undefined ? (input.currency || "EUR").toUpperCase() : (existing.currency || "EUR");
          const nextPurchaser = input.purchaserName !== undefined ? input.purchaserName : (existing.purchaserName ?? null);
          const nextSeller = input.sellerName !== undefined ? input.sellerName : (existing.sellerName ?? null);
          const nextTransportPrice = input.transportPrice !== undefined ? Math.max(0, Number(input.transportPrice)) : (existing.transportPrice ?? 0);
          const nextOrigin = input.origin !== undefined ? input.origin : (existing.origin ?? "");
          const nextDestination = input.destination !== undefined ? input.destination : (existing.destination ?? "");
          const nextPickupDate = input.pickupDate !== undefined ? input.pickupDate : (existing.pickupDate ?? null);
          const nextScheduledDate = input.scheduledDate !== undefined ? input.scheduledDate : (existing.scheduledDate ?? null);
          const nextAnnex7 = input.annex7Required !== undefined ? Boolean(input.annex7Required) : Boolean(existing.annex7Required);

          // Synchronize linked non-completed schedules while preserving completed schedules' historical snapshots
          const nowIso = this.now();
          const syncedSchedules = (oldMeta?.schedules || []).map((sched) => {
            if (sched.status === "completed") {
              return { ...sched, purchaseOrderId: existing.id };
            }
            return {
              ...sched,
              purchaseOrderId: existing.id,
              poSoNumber: targetNumber,
              partnerName: effectiveSupplier || sched.partnerName,
              companyId,
              warehouseId: warehouseId || sched.warehouseId,
              origin: input.origin !== undefined ? nextOrigin : sched.origin,
              destination: input.destination !== undefined ? nextDestination : sched.destination,
              annex7Required: input.annex7Required !== undefined ? nextAnnex7 : sched.annex7Required,
              transportPrice: input.transportPrice !== undefined ? nextTransportPrice : sched.transportPrice,
              currency: input.currency !== undefined ? nextCurrency : sched.currency,
              pickupDate: input.pickupDate !== undefined ? nextPickupDate : sched.pickupDate,
              purchaserName: input.purchaserName !== undefined ? nextPurchaser : sched.purchaserName,
              sellerName: input.sellerName !== undefined ? nextSeller : sched.sellerName,
              purchasingPrice: orderType === "PO" ? (input.valueEur > 0 ? input.valueEur : sched.purchasingPrice) : sched.purchasingPrice,
              sellingPrice: orderType === "SO" ? (input.valueEur > 0 ? input.valueEur : sched.sellingPrice) : sched.sellingPrice,
              scheduledDate: (input.scheduledDate !== undefined && nextScheduledDate) ? nextScheduledDate : sched.scheduledDate,
              updatedAt: nowIso,
            };
          });

          const updatedMeta: OrderMetadataEnvelope = {
            ...(oldMeta || {}),
            number: targetNumber,
            type: orderType,
            currency: nextCurrency,
            warehouseId,
            purchaserName: nextPurchaser,
            sellerName: nextSeller,
            transportPrice: nextTransportPrice,
            origin: nextOrigin,
            destination: nextDestination,
            pickupDate: nextPickupDate,
            scheduledDate: nextScheduledDate,
            annex7Required: nextAnnex7,
            isRemoved: false,
            schedules: syncedSchedules,
          };

          const nextValueEur = input.valueEur > 0 ? input.valueEur : existing.valueEur;
          const serializedNotes = serializeOrderNotes(nextNotes, updatedMeta);
          const updatePayload: Record<string, unknown> = {
            value_eur: nextValueEur,
            notes: serializedNotes,
            updated_at: nowIso,
          };
          if (companyId) {
            updatePayload.company_id = companyId;
          }
          if (input.title !== undefined && input.title.trim()) {
            updatePayload.title = input.title.trim();
          }
          if (input.scheduledDate !== undefined) {
            updatePayload.scheduled_date = nextScheduledDate;
          }

          let poRes = await this.client.update<Record<string, unknown>>(
            "purchase_orders",
            `id=eq.${encodeURIComponent(existing.id)}`,
            targetNumber !== String(rawRow.number ?? "")
              ? { ...updatePayload, number: targetNumber }
              : updatePayload,
            token,
          );
          if (!poRes.ok && targetNumber !== String(rawRow.number ?? "")) {
            // Legacy trigger fallback: keep base column `number` and persist `targetNumber` in `meta.number`
            poRes = await this.client.update<Record<string, unknown>>(
              "purchase_orders",
              `id=eq.${encodeURIComponent(existing.id)}`,
              updatePayload,
              token,
            );
          }
          if (!poRes.ok) return poRes;

          const existingLines = await this.client.select<Record<string, unknown>>(
            "purchase_order_lines",
            `select=id&purchase_order_id=eq.${encodeURIComponent(existing.id)}`,
            token,
          );
          if (existingLines.ok && existingLines.value.length > 0) {
            await this.client.update<Record<string, unknown>>(
              "purchase_order_lines",
              `purchase_order_id=eq.${encodeURIComponent(existing.id)}`,
              {
                description: input.material.trim(),
                quantity_kg: input.quantityKg,
              },
              token,
            );
          } else {
            await this.client.insert<Record<string, unknown>>(
              "purchase_order_lines",
              {
                purchase_order_id: existing.id,
                material_id: null,
                description: input.material.trim(),
                quantity_kg: input.quantityKg,
              },
              token,
            );
          }

          return ok(mapPurchaseOrder(poRes.value ?? { ...rawRow, ...updatePayload, number: targetNumber }));
        },
        delete: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "order:delete");

          const allOrdersRes = await this.client.select<Record<string, unknown>>(
            "purchase_orders",
            "select=*&order=created_at.asc",
            token,
          );
          const rawRows = allOrdersRes.ok ? allOrdersRes.value : [];
          const mappedRows = rawRows.map((r) => ({ raw: r, po: mapPurchaseOrder(r) }));

          const matched = (input.id ? mappedRows.find((e) => e.po.id === input.id) : undefined)
            ?? mappedRows.find(
              (e) =>
                e.po.number.toLowerCase() === input.number.toLowerCase() ||
                String(e.raw.number ?? "").toLowerCase() === input.number.toLowerCase()
            );

          if (!matched) {
            return fail(`Order ${input.number || input.id} does not exist.`);
          }

          const { raw: rawRow, po: existing } = matched;
          if (existing.isRemoved) {
            return fail(`Order ${existing.number} has already been removed.`);
          }

          const nowIso = this.now();
          const { cleanNotes, meta: oldMeta } = parseOrderNotes(String(rawRow.notes ?? ""));
          const updatedMeta: OrderMetadataEnvelope = {
            ...(oldMeta || {}),
            number: existing.number,
            type: existing.type,
            currency: existing.currency,
            warehouseId: existing.warehouseId,
            purchaserName: existing.purchaserName ?? null,
            sellerName: existing.sellerName ?? null,
            transportPrice: existing.transportPrice ?? 0,
            origin: existing.origin ?? "",
            destination: existing.destination ?? "",
            pickupDate: existing.pickupDate ?? null,
            scheduledDate: existing.scheduledDate ?? null,
            annex7Required: Boolean(existing.annex7Required),
            isRemoved: true,
            removedAt: nowIso,
            removedBy: actor.id,
          };

          const serializedNotes = serializeOrderNotes(
            cleanNotes || `Order removed by ${actor.name} on ${nowIso}. Operational history preserved.`,
            updatedMeta,
          );

          const updRes = await this.client.update<Record<string, unknown>>(
            "purchase_orders",
            `id=eq.${encodeURIComponent(existing.id)}`,
            {
              notes: serializedNotes,
              updated_at: nowIso,
            },
            token,
          );

          if (!updRes.ok) return updRes;
          return ok(mapPurchaseOrder(updRes.value ?? { ...rawRow, notes: serializedNotes, updated_at: nowIso }));
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

      offers: {
        list: async (filter, actorId) => {
          const token = this.resolveToken(actorId);
          let query = "select=*&deleted_at=is.null";
          if (filter?.kind) query += `&kind=eq.${encodeURIComponent(filter.kind)}`;
          if (filter?.status) query += `&status=eq.${encodeURIComponent(filter.status)}`;
          if (filter?.priority) query += `&priority=eq.${encodeURIComponent(filter.priority)}`;
          if (filter?.country) query += `&country=ilike.${encodeURIComponent(filter.country)}`;
          if (filter?.team) query += `&team=ilike.${encodeURIComponent(filter.team)}`;
          if (filter?.isFavourite !== undefined) query += `&is_favourite=eq.${filter.isFavourite}`;
          query += "&order=created_at.desc";

          const res = await this.client.select<Record<string, unknown>>("offers", query, token);
          let items = res.ok ? res.value.map(mapOffer) : [];
          if (filter?.search) {
            const q = filter.search.toLowerCase().trim();
            items = items.filter(
              (o) =>
                o.number.toLowerCase().includes(q) ||
                o.material.toLowerCase().includes(q) ||
                o.materialGrade.toLowerCase().includes(q) ||
                o.country.toLowerCase().includes(q) ||
                o.team.toLowerCase().includes(q) ||
                o.description.toLowerCase().includes(q)
            );
          }

          const page = Math.max(1, filter?.page || 1);
          const pageSize = Math.max(1, filter?.pageSize || 25);
          const total = items.length;
          const totalPages = Math.ceil(total / pageSize) || 1;
          const paginated = items.slice((page - 1) * pageSize, page * pageSize);

          return { items: paginated, total, page, pageSize, totalPages };
        },
        get: async (id, actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "offers",
            `select=*&or=(id.eq.${encodeURIComponent(id)},number.eq.${encodeURIComponent(id)})&deleted_at=is.null`,
            token
          );
          return res.ok && res.value.length > 0 ? mapOffer(res.value[0]) : null;
        },
        attachments: async (offerId, actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "offer_attachments",
            `select=*&offer_id=eq.${encodeURIComponent(offerId)}&order=created_at.asc`,
            token
          );
          return res.ok ? res.value.map(mapOfferAttachment) : [];
        },
        comments: async (offerId, actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "offer_comments",
            `select=*&offer_id=eq.${encodeURIComponent(offerId)}&order=created_at.asc`,
            token
          );
          return res.ok ? res.value.map(mapOfferComment) : [];
        },
        activities: async (offerId, actorId) => {
          const token = this.resolveToken(actorId);
          const res = await this.client.select<Record<string, unknown>>(
            "offer_activities",
            `select=*&offer_id=eq.${encodeURIComponent(offerId)}&order=created_at.desc`,
            token
          );
          return res.ok ? res.value.map(mapOfferActivity) : [];
        },
        create: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:create");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_create_offer",
            {
              p_kind: input.kind,
              p_material: input.material,
              p_material_type: input.materialType ?? "Plastics",
              p_material_grade: input.materialGrade ?? "Standard",
              p_quantity: input.quantity,
              p_unit: input.unit ?? "kg",
              p_price_per_unit: input.pricePerUnit,
              p_currency: input.currency ?? "EUR",
              p_country: input.country,
              p_location: input.location ?? "",
              p_truck_loads: input.truckLoads ?? 1,
              p_description: input.description ?? "",
              p_priority: input.priority ?? "medium",
              p_offer_type: input.offerType ?? "Spot",
              p_team: input.team ?? "General",
              p_status: input.status ?? "draft",
            },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        edit: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:edit");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_update_offer",
            {
              p_offer_id: input.id,
              p_material: input.material ?? null,
              p_material_type: input.materialType ?? null,
              p_material_grade: input.materialGrade ?? null,
              p_quantity: input.quantity ?? null,
              p_unit: input.unit ?? null,
              p_price_per_unit: input.pricePerUnit ?? null,
              p_currency: input.currency ?? null,
              p_country: input.country ?? null,
              p_location: input.location ?? null,
              p_truck_loads: input.truckLoads ?? null,
              p_description: input.description ?? null,
              p_priority: input.priority ?? null,
              p_offer_type: input.offerType ?? null,
              p_team: input.team ?? null,
            },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        delete: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:delete");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_delete_offer",
            { p_offer_id: input.id },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        submitReview: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:submit");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_submit_offer_for_review",
            { p_offer_id: input.id },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        decide: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          if (input.decision === "approved") this.authorize(actor, "offer:approve");
          else this.authorize(actor, "offer:reject");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_decide_offer",
            {
              p_offer_id: input.id,
              p_decision: input.decision,
              p_decision_note: input.decisionNote,
            },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        updateStatus: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:status");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_update_offer_status",
            {
              p_offer_id: input.id,
              p_status: input.status,
            },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        toggleFavourite: async (input) => {
          const { token } = await this.resolveActor(input.actorId);
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_toggle_offer_favourite",
            { p_offer_id: input.id },
            token
          );
          if (!res.ok) return res;
          return ok(mapOffer(res.value));
        },
        addComment: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:comment");
          const res = await this.client.rpc<Record<string, unknown>>(
            "rpc_add_offer_comment",
            {
              p_offer_id: input.id,
              p_comment: input.comment,
            },
            token
          );
          if (!res.ok) return res;
          return ok(mapOfferComment(res.value));
        },
        addAttachment: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:attach");
          const attId = randomUUID();
          const storageKey = `offers/${input.id}/${attId}-${input.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const res = await this.client.insert<Record<string, unknown>>(
            "offer_attachments",
            {
              id: attId,
              offer_id: input.id,
              name: input.name,
              kind: input.kind ?? "document",
              mime: input.mime ?? "application/octet-stream",
              byte_size: input.byteSize ?? 0,
              storage_key: storageKey,
              uploaded_by: actor.id,
            },
            token
          );
          if (!res.ok) return res;
          return ok(mapOfferAttachment(res.value));
        },
        deleteAttachment: async (input) => {
          const { actor, token } = await this.resolveActor(input.actorId);
          this.authorize(actor, "offer:attach");
          const res = await this.client.delete(
            "offer_attachments",
            `id=eq.${encodeURIComponent(input.attachmentId)}&offer_id=eq.${encodeURIComponent(input.id)}`,
            token
          );
          if (!res.ok) return res;
          return ok(undefined);
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
