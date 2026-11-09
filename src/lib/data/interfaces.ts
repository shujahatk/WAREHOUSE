import type {
  Annex7Record,
  AuditLogEntry,
  Company,
  CustomsRecord,
  DemurrageRecord,
  DocumentKind,
  DocumentRecord,
  DomainRole,
  Material,
  PackagingType,
  PoMessage,
  PurchaseOrder,
  PurchaseOrderLine,
  RequestLine,
  RequestRecord,
  Shipment,
  StockBalance,
  StockMovement,
  UserProfile,
  Warehouse,
  GeneralRequestCategory,
  GeneralRequestPriority,
  WorkerGeneralRequest,
  WorkerGeneralRequestAttachment,
} from "@/domain/schemas";
import type { Result } from "@/domain/result";

export type SessionUser = {
  sessionId: string;
  profile: UserProfile;
};

export type CreatedUser = {
  profile: UserProfile;
  temporaryPassword: string;
};

export type FileObject = {
  key: string;
  name: string;
  mime: string;
  bytes: Buffer;
};

export type SignedUrl = {
  url: string;
  expiresAt: string;
};

export interface UserRepository {
  list(actorId?: string): Promise<UserProfile[]>;
  create(input: {
    name: string;
    email: string;
    role: DomainRole;
    warehouseName: string | null;
    companyName: string | null;
    password?: string;
    actorId: string;
  }): Promise<Result<CreatedUser>>;
  updateRole(input: {
    email: string;
    role: DomainRole;
    warehouseName: string | null;
    companyName: string | null;
    actorId: string;
  }): Promise<Result<UserProfile>>;
  deactivate(input: { email: string; actorId: string }): Promise<Result<UserProfile>>;
}

export interface AuthRepository {
  signIn(email: string, password: string): Promise<Result<SessionUser>>;
  signOut(sessionId: string): Promise<void>;
  currentSession(sessionId: string): Promise<UserProfile | null>;
  createUser(input: Parameters<UserRepository["create"]>[0]): Promise<Result<CreatedUser>>;
  deactivateUser(input: { email: string; actorId: string }): Promise<Result<UserProfile>>;
}

export interface PurchaseOrderRepository {
  list(actorId?: string): Promise<PurchaseOrder[]>;
  lines(purchaseOrderId: string): Promise<PurchaseOrderLine[]>;
  create(input: {
    supplier: string;
    material: string;
    quantityKg: number;
    valueEur: number;
    actorId: string;
  }): Promise<Result<PurchaseOrder>>;
  submit(input: {
    number: string;
    notes: string;
    actorId: string;
  }): Promise<Result<PurchaseOrder>>;
  approve(input: { number: string; actorId: string }): Promise<Result<PurchaseOrder>>;
  reject(input: { number: string; actorId: string }): Promise<Result<PurchaseOrder>>;
  edit(input: {
    number: string;
    supplier: string;
    material: string;
    quantityKg: number;
    valueEur: number;
    actorId: string;
  }): Promise<Result<PurchaseOrder>>;
  delete(input: { number: string; actorId: string }): Promise<Result<PurchaseOrder>>;
}

export interface ShipmentRepository {
  list(actorId?: string): Promise<Shipment[]>;
  create(input: {
    direction: "inbound" | "outbound";
    number: string;
    po: string;
    party: string;
    warehouse: string;
    container?: string;
    actorId: string;
  }): Promise<Result<Shipment>>;
  saveMeta(input: {
    direction: "inbound" | "outbound";
    number: string;
    po: string;
    container: string;
    party: string;
    actorId: string;
  }): Promise<Result<Shipment>>;
  advance(input: {
    direction: "inbound" | "outbound";
    number: string;
    actorId: string;
  }): Promise<Result<Shipment>>;
  overrideDispatch(input: {
    number: string;
    reason: string;
    actorId: string;
  }): Promise<Result<Shipment>>;
}

export interface RequestRepository {
  list(actorId?: string): Promise<RequestRecord[]>;
  lines(requestId: string): Promise<RequestLine[]>;
  submit(input: {
    shipmentId: string;
    actorId: string;
  }): Promise<Result<RequestRecord>>;
  approve(input: { requestId: string; actorId: string }): Promise<Result<RequestRecord>>;
  decline(input: { requestId: string; actorId: string; reason: string }): Promise<Result<RequestRecord>>;
  sendBack(input: { requestId: string; actorId: string; note: string }): Promise<Result<RequestRecord>>;
  complete(input: { requestId: string; actorId: string }): Promise<Result<RequestRecord>>;
  softDelete(input: { requestId: string; actorId: string }): Promise<Result<RequestRecord>>;
  assignWorker(input: { requestId: string; workerId: string; actorId: string }): Promise<Result<RequestRecord>>;
}

export interface GeneralRequestRepository {
  list(actorId?: string): Promise<WorkerGeneralRequest[]>;
  attachments(requestId: string): Promise<WorkerGeneralRequestAttachment[]>;
  create(input: {
    category: GeneralRequestCategory;
    priority?: GeneralRequestPriority;
    description: string;
    shipmentId?: string | null;
    documentIds?: string[];
    actorId: string;
  }): Promise<Result<WorkerGeneralRequest>>;
  decide(input: {
    requestId: string;
    decision: "under_review" | "approved" | "declined" | "sent_back" | "completed";
    responseNote?: string;
    actorId: string;
  }): Promise<Result<WorkerGeneralRequest>>;
  softDelete(input: { requestId: string; actorId: string }): Promise<Result<WorkerGeneralRequest>>;
}

export interface InventoryRepository {
  balances(actorId?: string): Promise<StockBalance[]>;
  movements(actorId?: string): Promise<StockMovement[]>;
  setThreshold(input: { materialId: string; lowStockThresholdKg: number; actorId: string }): Promise<Result<Material>>;
  applyMovement(input: {
    requestId: string;
    requestLineId: string;
    materialId: string;
    warehouseId: string;
    direction: "in" | "out";
    weightKg: number;
    actorId: string;
  }): Promise<Result<StockMovement>>;
  transferStock(input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    materialId: string;
    weightKg: number;
    actorId: string;
  }): Promise<Result<{ outMovement: StockMovement; inMovement: StockMovement }>>;
  postCorrection(input: {
    requestId: string;
    materialId: string;
    deltaKg: number;
    reason: string;
    actorId: string;
  }): Promise<Result<StockMovement>>;
  checkConsistency(actorId?: string): Promise<{
    ok: boolean;
    mismatches: { materialId: string; warehouseId: string; balanceKg: number; sumMovementsKg: number }[];
  }>;
}

export interface DocumentRepository {
  list(actorId?: string): Promise<DocumentRecord[]>;
}

export interface CustomsRepository {
  list(actorId?: string): Promise<CustomsRecord[]>;
  save(input: {
    number: string;
    reference: string;
    procedureNote: string;
    goodsDescription: string;
    declarantReference: string;
    actorId: string;
  }): Promise<Result<CustomsRecord>>;
  confirmSeller(input: { number: string; actorId: string }): Promise<Result<Shipment>>;
  confirmCustoms(input: {
    number: string;
    name: string;
    mime: string;
    size: number;
    bytesBase64: string;
    fileId?: string;
    actorId: string;
  }): Promise<Result<CustomsRecord>>;
}

export interface DemurrageRepository {
  list(actorId?: string): Promise<DemurrageRecord[]>;
}

export interface Annex7Repository {
  list(actorId?: string): Promise<Annex7Record[]>;
  upload(input: {
    shipment: string;
    direction: "inbound" | "outbound";
    reference: string;
    name: string;
    mime: string;
    size: number;
    notes: string;
    bytesBase64: string;
    fileId?: string;
    actorId: string;
  }): Promise<Result<Annex7Record>>;
  review(input: { id: string; actorId: string }): Promise<Result<Annex7Record>>;
  approve(input: { id: string; actorId: string }): Promise<Result<Annex7Record>>;
}

export interface ChatRepository {
  list(actorId?: string): Promise<PoMessage[]>;
  send(input: {
    purchaseOrderId: string | null;
    scope: PoMessage["scope"];
    authorId: string;
    body: string;
  }): Promise<Result<PoMessage>>;
}

export interface AuditRepository {
  list(actorId?: string): Promise<AuditLogEntry[]>;
}

export interface ReportRepository {
  stock(): Promise<{ materialId: string; warehouseId: string; weightKg: number; lowStockThresholdKg: number }[]>;
  purchases(): Promise<{ count: number; quantityKg: number; valueEur: number }>;
  movements(): Promise<StockMovement[]>;
}

export type UploadTargetMetadata = {
  filename: string;
  mime: string;
  byteSize: number;
  kind: DocumentKind;
  requestId?: string | null;
  requestNumber?: string | null;
  shipmentId?: string | null;
  poNumber?: string | null;
  containerNumber?: string | null;
  warehouse?: string | null;
  notes?: string | null;
  actorId: string;
};

export type UploadTarget = {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  readableName: string;
};

export type ConfirmUploadInput = {
  fileId: string;
  bytesBase64?: string;
  actorId: string;
};

export interface FileStorage {
  put(input: { name: string; mime: string; bytes: Buffer }): Promise<Result<{ key: string }>>;
  signedUrl(key: string): Promise<Result<SignedUrl>>;
  delete(key: string): Promise<Result<void>>;
  createUploadTarget(metadata: UploadTargetMetadata): Promise<Result<UploadTarget>>;
  confirmUpload(input: ConfirmUploadInput): Promise<Result<DocumentRecord>>;
}

export interface DirectoryRepository {
  warehouses(): Promise<Warehouse[]>;
  companies(): Promise<Company[]>;
  materials(): Promise<Material[]>;
  packagingTypes(): Promise<PackagingType[]>;
  addPackagingType(input: { label: string; tareKg: number | null; actorId: string }): Promise<Result<PackagingType>>;
}

export type Services = {
  users: UserRepository;
  auth: AuthRepository;
  purchaseOrders: PurchaseOrderRepository;
  shipments: ShipmentRepository;
  requests: RequestRepository;
  generalRequests: GeneralRequestRepository;
  inventory: InventoryRepository;
  documents: DocumentRepository;
  customs: CustomsRepository;
  demurrage: DemurrageRepository;
  annex7: Annex7Repository;
  chat: ChatRepository;
  audit: AuditRepository;
  reports: ReportRepository;
  files: FileStorage;
  directory: DirectoryRepository;
};
