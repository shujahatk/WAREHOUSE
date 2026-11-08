import { z } from "zod";

export const domainRoleSchema = z.enum(["owner", "worker", "manager", "customer"]);
export const companyKindSchema = z.enum(["supplier", "customer"]);
export const purchaseStatusSchema = z.enum(["draft", "submitted", "approved", "declined"]);
export const shipmentDirectionSchema = z.enum(["inbound", "outbound"]);
export const shipmentStatusSchema = z.enum([
  "Planned",
  "In transit",
  "Arrived",
  "Registered",
  "Unloading",
  "Completed",
  "Loading",
  "Loaded",
  "Dispatched",
]);
export const requestTypeSchema = z.enum(["loading", "unloading"]);
export const requestStatusSchema = z.enum(["submitted", "approved", "declined", "sent_back", "completed", "deleted"]);
export const documentKindSchema = z.enum(["cmr", "photo", "annex7", "customs_proof", "other"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const documentCategorySchema = z.enum(["Purchase", "Container", "Customs", "Transport", "Annex 7"]);
export const movementDirectionSchema = z.enum(["in", "out"]);
export const annexStatusSchema = z.enum(["uploaded", "under_review", "approved"]);
export const messageScopeSchema = z.enum(["purchase-order", "seller", "internal"]);
export const sellerStatusSchema = z.enum(["Pending", "Confirmed"]);

const id = z.uuid();
const stamp = z.string().min(1);
const label = z.string().trim().min(1);

export function roundKg(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function netKg(grossKg: number, tareTotalKg: number): number {
  return roundKg(grossKg - tareTotalKg);
}

const userFields = {
  id,
  email: z.email(),
  name: label,
  role: domainRoleSchema,
  warehouseId: id.nullable(),
  companyId: id.nullable(),
  active: z.boolean(),
  createdAt: stamp,
  updatedAt: stamp,
};

function refineUser(user: { role: string; warehouseId: string | null; companyId: string | null }, ctx: z.RefinementCtx) {
    if (user.role === "worker" && !user.warehouseId) {
      ctx.addIssue({ code: "custom", message: "A worker must be assigned to one warehouse.", path: ["warehouseId"] });
    }
    if (user.role !== "worker" && user.warehouseId) {
      ctx.addIssue({ code: "custom", message: "Only a worker has a warehouse assignment.", path: ["warehouseId"] });
    }
    if (user.role === "customer" && !user.companyId) {
      ctx.addIssue({ code: "custom", message: "A customer must belong to one company.", path: ["companyId"] });
    }
    if (user.role !== "customer" && user.companyId) {
      ctx.addIssue({ code: "custom", message: "Only a customer belongs to a company.", path: ["companyId"] });
    }
}

export const userRecordSchema = z.object({ ...userFields, passwordHash: z.string().min(1) }).superRefine(refineUser);
export const userProfileSchema = z.object(userFields).superRefine(refineUser);

export const warehouseSchema = z.object({
  id,
  name: label,
  country: label,
  active: z.boolean(),
});

export const companySchema = z.object({
  id,
  name: label,
  kind: companyKindSchema,
  active: z.boolean(),
});

export const materialSchema = z.object({
  id,
  materialNumber: label,
  description: label,
  unit: label,
  lowStockThresholdKg: z.number().refine((value) => Number.isFinite(value) && value >= 0, "Low-stock threshold must be zero or greater, in kilograms."),
});

export const packagingTypeSchema = z.object({
  id,
  name: label,
  tareKg: z.number().refine((value) => Number.isFinite(value) && value >= 0, "Tare must be zero or greater, in kilograms."),
  active: z.boolean(),
});

export const purchaseOrderSchema = z.object({
  id,
  number: label,
  companyId: id,
  status: purchaseStatusSchema,
  valueEur: z.number().refine((value) => Number.isFinite(value) && value >= 0, "Value must be zero or greater."),
  notes: z.string(),
  createdBy: id,
  createdAt: stamp,
  updatedAt: stamp,
});

export const purchaseOrderLineSchema = z.object({
  id,
  purchaseOrderId: id,
  materialId: id.nullable(),
  description: z.string(),
  quantityKg: z.number().refine((value) => Number.isFinite(value) && value >= 0, "Quantity must be zero or greater, in kilograms."),
});

export const shipmentSchema = z.object({
  id,
  reference: label,
  direction: shipmentDirectionSchema,
  purchaseOrderId: id.nullable(),
  containerNumber: z.string(),
  warehouseId: id,
  originCountry: z.string(),
  destinationCountry: z.string(),
  status: shipmentStatusSchema,
  carrierName: z.string(),
  handedOverAt: stamp.nullable(),
  annex7Required: z.boolean(),
  sellerStatus: sellerStatusSchema,
  sellerCompany: z.string(),
  sellerConfirmedBy: z.string(),
  sellerConfirmedAt: z.string(),
  overrideReason: z.string().nullable(),
  overrideBy: z.string().nullable(),
  overrideAt: z.string().nullable(),
});

export const requestSchema = z.object({
  id,
  number: z.string().regex(/^REQ-\d{4}-\d{4}$/, "Request number must look like REQ-2026-0001."),
  type: requestTypeSchema,
  shipmentId: id,
  purchaseOrderId: id.nullable(),
  containerNumber: z.string(),
  warehouseId: id,
  createdBy: id,
  status: requestStatusSchema,
  declineReason: z.string().nullable(),
  sentBackNote: z.string().nullable(),
  approvedBy: id.nullable(),
  approvedAt: stamp.nullable(),
  enteredBy: id.nullable(),
  enteredAt: stamp.nullable(),
  deletedBy: id.nullable(),
  deletedAt: stamp.nullable(),
  createdAt: stamp,
});

export const requestLineSchema = z
  .object({
    id,
    requestId: id,
    materialId: id,
    packagingTypeId: id,
    packageCount: z.number(),
    grossKg: z.number(),
    tareTotalKg: z.number(),
    netKg: z.number(),
  })
  .superRefine((line, ctx) => {
    if (!Number.isInteger(line.packageCount) || line.packageCount <= 0) {
      ctx.addIssue({ code: "custom", message: "Package count must be a whole number greater than zero.", path: ["packageCount"] });
    }
    if (!Number.isFinite(line.grossKg) || line.grossKg < 0) {
      ctx.addIssue({ code: "custom", message: "Gross weight must be zero or greater, in kilograms.", path: ["grossKg"] });
    }
    const expected = netKg(line.grossKg, line.tareTotalKg);
    if (line.netKg !== expected) {
      ctx.addIssue({ code: "custom", message: "Net weight must equal gross weight minus tare.", path: ["netKg"] });
    }
    if (!(line.netKg > 0)) {
      ctx.addIssue({ code: "custom", message: "Net weight must be greater than zero.", path: ["netKg"] });
    }
  });

export const requestPhotoSchema = z.object({
  id,
  requestId: id,
  documentId: id,
});

export const documentStatusSchema = z.enum(["pending", "active", "deleted"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentSchema = z.object({
  id,
  kind: documentKindSchema,
  category: documentCategorySchema,
  shipmentId: id.nullable(),
  purchaseOrderId: id.nullable(),
  requestId: id.nullable().default(null),
  requestNumber: z.string().nullable().default(null),
  poNumber: z.string().nullable().default(null),
  containerNumber: z.string().nullable().default(null),
  warehouse: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  originalFilename: z.string().nullable().default(null),
  readableName: z.string().nullable().default(null),
  status: documentStatusSchema.default("active"),
  name: label,
  mime: z.string(),
  byteSize: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  cmrReference: z.string().nullable(),
  cmrCarrier: z.string().nullable(),
  cmrGoodsDescription: z.string().nullable(),
  cmrRemarks: z.string().nullable(),
  cmrEnteredBy: z.string().nullable(),
  cmrEnteredAt: stamp.nullable(),
  createdBy: id,
  createdAt: stamp,
});

export const stockBalanceSchema = z.object({
  id,
  materialId: id,
  warehouseId: id,
  weightKg: z.number().refine((value) => Number.isFinite(value) && value >= 0, "Stock weight cannot be negative."),
});

export const stockMovementSchema = z.object({
  id,
  materialId: id,
  warehouseId: id,
  weightKg: z.number().refine((value) => Number.isFinite(value) && value > 0, "A stock movement must be greater than zero kilograms."),
  direction: movementDirectionSchema,
  requestId: id,
  requestLineId: id,
  createdAt: stamp,
  createdBy: id,
});

export const customsRecordSchema = z.object({
  id,
  shipmentId: id,
  reference: z.string(),
  procedureNote: z.string(),
  goodsDescription: z.string(),
  declarantReference: z.string(),
  confirmedBy: id.nullable(),
  confirmedAt: stamp.nullable(),
  proofDocumentId: id.nullable(),
});

export const demurrageRecordSchema = z.object({
  id,
  shipmentId: id,
  startedAt: stamp.nullable(),
  freeMinutes: z.number().int().nonnegative(),
  ratePerMinute: z.number().nonnegative(),
  completedAt: stamp.nullable(),
  elapsedMinutes: z.number().int().nonnegative().nullable(),
  billableMinutes: z.number().int().nonnegative().nullable(),
  chargeEur: z.number().nonnegative().nullable(),
});

export const annex7RecordSchema = z.object({
  id,
  shipmentId: id,
  documentId: id,
  reference: label,
  status: annexStatusSchema,
  notes: z.string(),
  uploadedBy: id,
  uploadedAt: stamp,
});

export const poMessageSchema = z.object({
  id,
  purchaseOrderId: id.nullable(),
  scope: messageScopeSchema,
  authorId: id,
  body: label,
  createdAt: stamp,
});

export const auditLogEntrySchema = z.object({
  id,
  userId: id,
  action: label,
  targetType: label,
  targetId: z.string().min(1),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  createdAt: stamp,
});

export const sessionSchema = z.object({
  id,
  userId: id,
  expiresAt: stamp,
});

export const blobSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  mime: z.string(),
  bytesBase64: z.string(),
});

export const storeSchema = z.object({
  users: z.array(userRecordSchema),
  sessions: z.array(sessionSchema),
  warehouses: z.array(warehouseSchema),
  companies: z.array(companySchema),
  materials: z.array(materialSchema),
  packagingTypes: z.array(packagingTypeSchema),
  purchaseOrders: z.array(purchaseOrderSchema),
  purchaseOrderLines: z.array(purchaseOrderLineSchema),
  shipments: z.array(shipmentSchema),
  requests: z.array(requestSchema),
  requestLines: z.array(requestLineSchema),
  requestPhotos: z.array(requestPhotoSchema),
  documents: z.array(documentSchema),
  blobs: z.array(blobSchema),
  stockBalances: z.array(stockBalanceSchema),
  stockMovements: z.array(stockMovementSchema),
  customsRecords: z.array(customsRecordSchema),
  demurrageRecords: z.array(demurrageRecordSchema),
  annex7Records: z.array(annex7RecordSchema),
  poMessages: z.array(poMessageSchema),
  auditLog: z.array(auditLogEntrySchema),
  requestSequence: z.array(z.object({ year: z.number().int(), next: z.number().int().nonnegative() })),
  fileSecret: z.string(),
});

export const referenceSeedSchema = z.object({
  warehouses: z.array(z.object({ name: label, country: label })).default([]),
  companies: z.array(z.object({ name: label, kind: companyKindSchema })).default([]),
  materials: z
    .array(
      z.object({
        materialNumber: label,
        description: label,
        unit: label,
        lowStockThresholdKg: z.number().nonnegative(),
      }),
    )
    .default([]),
  packagingTypes: z.array(z.object({ name: label, tareKg: z.number().nonnegative() })).default([]),
});

export type DomainRole = z.infer<typeof domainRoleSchema>;
export type UserRecord = z.infer<typeof userRecordSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type Warehouse = z.infer<typeof warehouseSchema>;
export type Company = z.infer<typeof companySchema>;
export type Material = z.infer<typeof materialSchema>;
export type PackagingType = z.infer<typeof packagingTypeSchema>;
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;
export type Shipment = z.infer<typeof shipmentSchema>;
export type RequestRecord = z.infer<typeof requestSchema>;
export type RequestLine = z.infer<typeof requestLineSchema>;
export type RequestPhoto = z.infer<typeof requestPhotoSchema>;
export type DocumentRecord = z.infer<typeof documentSchema>;
export type StockBalance = z.infer<typeof stockBalanceSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type CustomsRecord = z.infer<typeof customsRecordSchema>;
export type DemurrageRecord = z.infer<typeof demurrageRecordSchema>;
export type Annex7Record = z.infer<typeof annex7RecordSchema>;
export type PoMessage = z.infer<typeof poMessageSchema>;
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type StoreData = z.infer<typeof storeSchema>;

export function emptyStore(): StoreData {
  return {
    users: [],
    sessions: [],
    warehouses: [],
    companies: [],
    materials: [],
    packagingTypes: [],
    purchaseOrders: [],
    purchaseOrderLines: [],
    shipments: [],
    requests: [],
    requestLines: [],
    requestPhotos: [],
    documents: [],
    blobs: [],
    stockBalances: [],
    stockMovements: [],
    customsRecords: [],
    demurrageRecords: [],
    annex7Records: [],
    poMessages: [],
    auditLog: [],
    requestSequence: [],
    fileSecret: "",
  };
}

export function issues(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}
