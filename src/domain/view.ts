import type { Role } from "@/lib/permissions";
import type { SectionMode } from "@/lib/packaging";
import type {
  GeneralRequestCategory,
  GeneralRequestPriority,
  GeneralRequestStatus,
  OfferKind,
  OfferStatus as DomainOfferStatus,
  OfferApprovalStatus as DomainOfferApprovalStatus,
  OfferPriority as DomainOfferPriority,
  OfferAttachmentKind,
} from "./schemas";
export type {
  GeneralRequestCategory,
  GeneralRequestPriority,
  GeneralRequestStatus,
  OfferKind,
  DomainOfferStatus,
  DomainOfferApprovalStatus,
  DomainOfferPriority,
  OfferAttachmentKind,
};

export type OfferStatusView = "Draft" | "Received" | "Under Review" | "Negotiating" | "Won" | "Lost";
export type OfferPriorityView = "Low" | "Medium" | "High" | "Urgent";
export type OfferApprovalView = "Pending" | "Approved" | "Rejected";

export const OFFER_STATUS_LABELS: Record<string, OfferStatusView> = {
  draft: "Draft",
  received: "Received",
  under_review: "Under Review",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export const OFFER_PRIORITY_LABELS: Record<string, OfferPriorityView> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const OFFER_APPROVAL_LABELS: Record<string, OfferApprovalView> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export type OfferAttachmentView = {
  id: string;
  offerId: string;
  name: string;
  kind: "image" | "document";
  mime: string;
  byteSize: number;
  url: string | null;
  storageKey: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
};

export type OfferCommentView = {
  id: string;
  offerId: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  comment: string;
  createdAt: string;
};

export type OfferActivityView = {
  id: string;
  offerId: string;
  actorId: string;
  actorName: string;
  action: string;
  details: string;
  createdAt: string;
};

export type OfferView = {
  id: string;
  number: string;
  kind: "purchasing" | "selling";
  kindLabel: "Purchasing Offer" | "Selling Offer";
  material: string;
  materialType: string;
  materialGrade: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  currency: string;
  totalValue: number;
  country: string;
  location: string;
  truckLoads: number;
  description: string;
  priority: OfferPriorityView;
  priorityKey: "low" | "medium" | "high" | "urgent";
  offerType: string;
  team: string;
  status: OfferStatusView;
  statusKey: "draft" | "received" | "under_review" | "negotiating" | "won" | "lost";
  approvalStatus: "pending" | "approved" | "rejected";
  approvalLabel: OfferApprovalView;
  adminDecisionNote: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  isFavourite: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
  attachments: OfferAttachmentView[];
  comments: OfferCommentView[];
  activities: OfferActivityView[];
};

export type OfferDashboardStats = {
  totalOffers: number;
  pending: number;
  underReview: number;
  negotiating: number;
  won: number;
  lost: number;
  truckLoads: number;
  purchasingCount: number;
  sellingCount: number;
};

export type OrderStatus = "Approved" | "Pending" | "Planned" | "Rejected" | "Received";
export type ContainerStatus = "Planned" | "Registered" | "Unloading" | "In transit" | "Arrived" | "Loaded" | "Completed";
export type OutboundStatus = "Planned" | "Loading" | "Loaded" | "Dispatched";
export type TransferStatus = "Submitted" | "Completed";

export type DemoOrder = {
  number: string;
  title: string;
  supplier: string;
  material: string;
  warehouse: string;
  quantityKg: number;
  valueEur: number;
  unitPrice: string;
  incoterms: string;
  status: OrderStatus;
  date: string;
  owner: string;
  supplierEmail: string;
  forwarder: string;
  container: string;
  ship: string;
  eta: string;
  customerCompany: string;
  notes: string;
};

export type ShipmentSection = {
  id: string;
  material: string;
  mode: SectionMode;
  grossKg: number | null;
  packagingId: string;
  packagingQty: number | null;
  tarePerUnitKg: number | null;
  totalTareKg: number;
  netKg: number | null;
  count: number | null;
};

export type CmrRecord = {
  reference: string;
  carrier: string;
  goodsDescription: string;
  remarks: string;
  enteredBy: string;
  enteredAt: string;
};

export type ShipmentAttachment = {
  id: string;
  shipment: string;
  po: string;
  name: string;
  mime: string;
  role: "cmr" | "photo" | "annex7" | "customs_proof" | "other";
  size: number;
  url: string | null;
  cmr: CmrRecord | null;
  requestId?: string | null;
  requestNumber?: string | null;
  containerNumber?: string | null;
  warehouse?: string | null;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
  uploadedAt?: string | null;
  originalFilename?: string | null;
  readableName?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type PostedMovement = {
  id: string;
  kind: "Inbound" | "Outbound" | "Transfer";
  reference: string;
  material: string;
  from: string;
  to: string;
  netKg: number;
  date: string;
  note: string;
};

export type Demurrage = {
  startedAt: string | null;
  completedAt: string | null;
  freeMinutes: number;
  ratePerMinute: number;
  elapsedMinutes: number | null;
  billableMinutes: number | null;
  chargeEUR: number | null;
};

export type DemoContainer = {
  number: string;
  po: string;
  supplier: string;
  origin: string;
  warehouse: string;
  status: ContainerStatus;
  eta: string;
  sections: ShipmentSection[];
  containerNumber: string;
  demurrage: Demurrage;
};

export type DemoStock = {
  id: string;
  material: string;
  category: string;
  packaging: string;
  quantity: number;
  weightKg: number;
  reorder: number;
  warehouse: string;
  location: string;
};

export type ContainerPackagingDetail = {
  packagingTypeId: string;
  packagingTypeName: string;
  packageCount: number;
  emptyUnitTareKg: number;
  totalPackagingWeightKg: number;
};

export type ContainerMaterialDetail = {
  materialId: string;
  materialName: string;
  netWeightKg: number;
  grossWeightKg: number;
  packagings: ContainerPackagingDetail[];
};

export type ContainerInventoryView = {
  id: string;
  containerNumber: string;
  shipmentReference: string;
  poNumber: string | null;
  warehouse: string;
  status: string;
  direction: "inbound" | "outbound";
  materials: ContainerMaterialDetail[];
  totalPackagingCount: number;
  totalPackagingWeightKg: number;
  totalNetWeightKg: number;
  grossPackedCargoWeightKg: number; // Net material weight + Total packaging weight
  containerTareKg: number; // Shipping container tare weight (kept separate)
  totalGrossCargoAndContainerKg: number;
  updatedAt: string;
};

export type InventoryHistoryView = {
  id: string;
  materialName: string;
  warehouseName: string;
  containerNumber: string | null;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  packagingTypeName: string | null;
  packagingCount: number | null;
  packagingUnitTareKg: number | null;
  totalPackagingWeightKg: number | null;
  grossWeightKg: number | null;
  operationType: string;
  operationReason: string;
  reference: string;
  poNumber: string | null;
  soNumber: string | null;
  performedByName: string;
  createdAt: string;
};

export type SwissCustoms = {
  reference: string;
  procedureNote: string;
  goodsDescription: string;
  declarantReference: string;
};

export type SellerConfirmation = {
  status: "Pending" | "Confirmed";
  company: string;
  confirmedBy: string;
  confirmedAt: string;
};

export type CustomsConfirmation = {
  status: "Pending" | "Confirmed";
  confirmedBy: string;
  confirmedAt: string;
  proofName: string;
  proofMime: string;
  proofSize: number;
};

export type DispatchOverride = {
  reason: string;
  by: string;
  at: string;
};

export type ShipmentAuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export type DemoOutbound = {
  number: string;
  customer: string;
  material: string;
  weightKg: number;
  warehouse: string;
  status: OutboundStatus;
  date: string;
  po: string;
  container: string;
  sections: ShipmentSection[];
  carrier: string;
  handover: string;
  customs: SwissCustoms;
  sellerConfirmation: SellerConfirmation;
  customsConfirmation: CustomsConfirmation;
  dispatchOverride: DispatchOverride | null;
  audit: ShipmentAuditEntry[];
};

export const EMPTY_CUSTOMS: SwissCustoms = {
  reference: "",
  procedureNote: "",
  goodsDescription: "",
  declarantReference: "",
};

export const PENDING_SELLER: SellerConfirmation = {
  status: "Pending",
  company: "",
  confirmedBy: "",
  confirmedAt: "",
};

export const PENDING_CUSTOMS_CONFIRMATION: CustomsConfirmation = {
  status: "Pending",
  confirmedBy: "",
  confirmedAt: "",
  proofName: "",
  proofMime: "",
  proofSize: 0,
};

export type DemoTransfer = {
  id: string;
  clientKey: string;
  from: string;
  to: string;
  material: string;
  quantity: number;
  weightKg: number;
  status: TransferStatus;
};

export type DemoMessage = {
  id: string;
  author: string;
  role: string;
  text: string;
  time: string;
};

export type DemoConversation = {
  id: string;
  title: string;
  po: string;
  scope: "purchase-order" | "internal" | "seller";
  customerCompany: string;
  supplier: string;
  messages: DemoMessage[];
};

export type AnnexStatus = "Uploaded" | "Under Review" | "Approved";

export type AnnexDetails = {
  reference: string;
  shipment: string;
  direction: "inbound" | "outbound";
  notes: string;
  status: AnnexStatus;
  uploadedBy: string;
  uploadedAt: string;
  mime: string;
  size: number;
  history: ShipmentAuditEntry[];
};

export type DemoDocument = {
  id: string;
  name: string;
  category: "Purchase" | "Container" | "Customs" | "Transport" | "Annex 7";
  meta: string;
  origin: "selected" | "annex7";
  po: string;
  url: string | null;
  annex: AnnexDetails | null;
};

export type DemoActivity = {
  id: string;
  text: string;
  status: string;
  href: string;
  actor?: string;
  actorRole?: string;
  module?: string;
  recordId?: string;
  warehouse?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  context?: string | null;
  requestReference?: string | null;
  createdAt?: string;
};

export type DemoNotification = {
  id: string;
  eventType: string;
  title: string;
  message: string;
  targetType?: string;
  targetId?: string;
  link?: string;
  warehouse?: string | null;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
};

export type PublicUser = {
  email: string;
  name: string;
  role: Role;
  warehouse: string | null;
  company: string | null;
  status: "Active" | "Inactive";
};

export type DemoIdentity = PublicUser;

export type PackagingView = {
  id: string;
  label: string;
  tareKg: number | null;
  preset: boolean;
};

export type RequestViewLine = {
  id: string;
  materialId: string;
  material: string;
  packagingTypeId: string;
  packagingName: string;
  packageCount: number;
  grossKg: number;
  tareTotalKg: number;
  netKg: number;
};

export type RequestView = {
  id: string;
  number: string;
  type: "loading" | "unloading";
  shipmentId: string;
  shipmentReference: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  containerNumber: string;
  warehouseId: string;
  warehouse: string;
  createdBy: string;
  createdByName: string;
  status: "submitted" | "approved" | "declined" | "sent_back" | "completed" | "deleted";
  declineReason: string | null;
  sentBackNote: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  enteredBy: string | null;
  enteredByName: string | null;
  enteredAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
  deletedAt: string | null;
  createdAt: string;
  lines: RequestViewLine[];
};

export const GENERAL_REQUEST_CATEGORY_LABELS: Record<GeneralRequestCategory, string> = {
  materials_packaging: "Materials / Packaging",
  stock_issue: "Stock / Inventory Issue",
  loading_unloading: "Loading / Unloading",
  equipment_maintenance: "Equipment / Maintenance",
  missing_documents: "Missing Documents / Information",
  other: "Other Operational Request",
};

export const GENERAL_REQUEST_PRIORITY_LABELS: Record<GeneralRequestPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const GENERAL_REQUEST_STATUS_LABELS: Record<GeneralRequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  declined: "Rejected",
  sent_back: "Info Requested",
  completed: "Completed",
  deleted: "Deleted",
};

export type GeneralRequestAttachmentView = {
  id: string;
  documentId: string;
  name: string;
  mime: string;
  byteSize: number;
  url: string | null;
  storageKey: string;
};

export type GeneralRequestView = {
  id: string;
  number: string;
  category: GeneralRequestCategory;
  categoryLabel: string;
  priority: GeneralRequestPriority;
  priorityLabel: string;
  description: string;
  warehouseId: string;
  warehouse: string;
  shipmentId: string | null;
  shipmentReference: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  createdBy: string;
  createdByName: string;
  status: GeneralRequestStatus;
  statusLabel: string;
  responseNote: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: GeneralRequestAttachmentView[];
};

export type WorkspaceState = {
  orders: DemoOrder[];
  containers: DemoContainer[];
  stock: DemoStock[];
  outbound: DemoOutbound[];
  transfers: DemoTransfer[];
  conversations: DemoConversation[];
  documents: DemoDocument[];
  activity: DemoActivity[];
  accounts: PublicUser[];
  packaging: PackagingView[];
  attachments: ShipmentAttachment[];
  postedMovements: PostedMovement[];
  requests: RequestView[];
  generalRequests: GeneralRequestView[];
  offers: OfferView[];
  containerInventory: ContainerInventoryView[];
  inventoryHistory: InventoryHistoryView[];
  notifications: DemoNotification[];
  directory: {
    warehouses: { id: string; name: string; country: string }[];
    companies: { id: string; name: string; kind: "supplier" | "customer" }[];
  };
};

export type DemoState = WorkspaceState;

export type Actor = {
  name: string;
  role: Role;
  warehouse: string | null;
  email: string;
  company?: string | null;
};

export function emptyWorkspace(): WorkspaceState {
  return {
    orders: [],
    containers: [],
    stock: [],
    outbound: [],
    transfers: [],
    conversations: [],
    documents: [],
    activity: [],
    accounts: [],
    packaging: [],
    attachments: [],
    postedMovements: [],
    requests: [],
    generalRequests: [],
    offers: [],
    containerInventory: [],
    inventoryHistory: [],
    notifications: [],
    directory: { warehouses: [], companies: [] },
  };
}

export function visibleOffers(
  state: WorkspaceState,
  actor: { role: Role; name?: string; email?: string },
): OfferView[] {
  if (actor.role !== "owner" && actor.role !== "moderator") {
    return [];
  }
  return state.offers || [];
}

export function calculateOfferStats(offers: OfferView[]): OfferDashboardStats {
  const stats: OfferDashboardStats = {
    totalOffers: offers.length,
    pending: 0,
    underReview: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
    truckLoads: 0,
    purchasingCount: 0,
    sellingCount: 0,
  };

  for (const offer of offers) {
    if (offer.statusKey === "draft" || offer.statusKey === "received") {
      stats.pending += 1;
    } else if (offer.statusKey === "under_review") {
      stats.underReview += 1;
    } else if (offer.statusKey === "negotiating") {
      stats.negotiating += 1;
    } else if (offer.statusKey === "won") {
      stats.won += 1;
    } else if (offer.statusKey === "lost") {
      stats.lost += 1;
    }

    stats.truckLoads += offer.truckLoads || 0;
    if (offer.kind === "purchasing") stats.purchasingCount += 1;
    if (offer.kind === "selling") stats.sellingCount += 1;
  }

  return stats;
}

export function visibleGeneralRequests(
  state: WorkspaceState,
  actor: { role: Role; name: string; warehouse?: string | null },
): GeneralRequestView[] {
  if (actor.role === "worker") {
    // Workers must ONLY see and track their own requests
    return state.generalRequests.filter((req) => req.createdByName === actor.name);
  }
  return state.generalRequests;
}

export function handoverStatus(shipment: { carrier: string; handover: string }): "Not recorded" | "Carrier recorded" | "Handover recorded" {
  if (!shipment.carrier.trim()) return "Not recorded";
  if (!shipment.handover.trim()) return "Carrier recorded";
  return "Handover recorded";
}

export function customsComplete(customs: SwissCustoms | undefined): boolean {
  if (!customs) return false;
  return Boolean(customs.reference.trim() && customs.procedureNote.trim() && customs.goodsDescription.trim());
}

export function dispatchPhase3Blocks(shipment: DemoOutbound): string[] {
  const reasons: string[] = [];
  if (!shipment.carrier.trim()) reasons.push("Enter a carrier name before dispatch.");
  return reasons;
}

const euro = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatEuro(value: number): string {
  return euro.format(value);
}

export function formatKg(value: number): string {
  return `${new Intl.NumberFormat("en-US").format(value)} kg`;
}

export const DEMURRAGE_FREE_MINUTES = 120;
export const DEMURRAGE_RATE_PER_MINUTE = 1;
export const DEMURRAGE_TIME_ZONE = "Europe/Zurich";

const zurichClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEMURRAGE_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function emptyDemurrage(): Demurrage {
  return {
    startedAt: null,
    completedAt: null,
    freeMinutes: DEMURRAGE_FREE_MINUTES,
    ratePerMinute: DEMURRAGE_RATE_PER_MINUTE,
    elapsedMinutes: null,
    billableMinutes: null,
    chargeEUR: null,
  };
}

export function formatInstant(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return `${zurichClock.format(date)} ${DEMURRAGE_TIME_ZONE}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function demurrageFromMinutes(elapsedMinutes: number, freeMinutes = DEMURRAGE_FREE_MINUTES, ratePerMinute = DEMURRAGE_RATE_PER_MINUTE) {
  const elapsed = Math.max(0, Math.floor(elapsedMinutes));
  const billableMinutes = Math.max(0, elapsed - freeMinutes);
  return { elapsedMinutes: elapsed, billableMinutes, chargeEUR: billableMinutes * ratePerMinute };
}

export type DemurrageSnapshot = {
  phase: "not-started" | "running" | "stopped";
  elapsedMinutes: number;
  billableMinutes: number;
  chargeEUR: number;
  freeMinutes: number;
  ratePerMinute: number;
  remainingMs: number;
  deadlineMs: number | null;
  overtime: boolean;
};

export function demurrageSnapshot(container: Pick<DemoContainer, "status" | "demurrage">, nowMs: number): DemurrageSnapshot {
  const freeMinutes = container.demurrage?.freeMinutes ?? DEMURRAGE_FREE_MINUTES;
  const ratePerMinute = container.demurrage?.ratePerMinute ?? DEMURRAGE_RATE_PER_MINUTE;
  const idle: DemurrageSnapshot = {
    phase: "not-started",
    elapsedMinutes: 0,
    billableMinutes: 0,
    chargeEUR: 0,
    freeMinutes,
    ratePerMinute,
    remainingMs: freeMinutes * 60000,
    deadlineMs: null,
    overtime: false,
  };
  if (container.status !== "Unloading" && container.status !== "Completed") return idle;
  if (container.status === "Completed") {
    const stored = container.demurrage?.chargeEUR != null;
    return {
      phase: "stopped",
      elapsedMinutes: stored ? (container.demurrage?.elapsedMinutes ?? 0) : 0,
      billableMinutes: stored ? (container.demurrage?.billableMinutes ?? 0) : 0,
      chargeEUR: stored ? (container.demurrage?.chargeEUR ?? 0) : 0,
      freeMinutes,
      ratePerMinute,
      remainingMs: 0,
      deadlineMs: container.demurrage?.startedAt ? Date.parse(container.demurrage.startedAt) + freeMinutes * 60000 : null,
      overtime: stored ? (container.demurrage?.billableMinutes ?? 0) > 0 : false,
    };
  }
  if (!container.demurrage?.startedAt) return { ...idle, phase: "not-started" };
  const start = Date.parse(container.demurrage.startedAt);
  if (!Number.isFinite(start)) return idle;
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - start) / 60000));
  const priced = demurrageFromMinutes(elapsedMinutes, freeMinutes, ratePerMinute);
  const deadlineMs = start + freeMinutes * 60000;
  return {
    phase: "running",
    ...priced,
    freeMinutes,
    ratePerMinute,
    remainingMs: Math.max(0, deadlineMs - nowMs),
    deadlineMs,
    overtime: nowMs >= deadlineMs,
  };
}

export function demurrageLabel(container: DemoContainer, nowMs: number | null): string {
  if (container.status !== "Unloading" && container.status !== "Completed") return "Demurrage not started";
  if (container.status === "Completed") {
    if (container.demurrage.chargeEUR == null) return "Completed · no demurrage recorded";
    return `Final ${formatEuro(container.demurrage.chargeEUR)}`;
  }
  if (!container.demurrage.startedAt) return "Unloading · timer not started";
  if (nowMs == null) return "Unloading · updating clock";
  const snap = demurrageSnapshot(container, nowMs);
  if (snap.overtime) return `Overtime ${snap.billableMinutes} min · ${formatEuro(snap.chargeEUR)}`;
  return `Free time ${formatDuration(snap.remainingMs)}`;
}

export function stockStatus(row: DemoStock): "Out of stock" | "Low stock" | "In stock" {
  if (row.quantity <= 0) return "Out of stock";
  if (row.quantity <= row.reorder) return "Low stock";
  return "In stock";
}

export function sameParty(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = (left ?? "").trim().toLowerCase();
  const b = (right ?? "").trim().toLowerCase();
  return a.length > 0 && a === b;
}

export function visibleStock(state: DemoState, role: Role, warehouse: string | null): DemoStock[] {
  if (role === "customer") return [];
  if (role === "worker" && warehouse) return state.stock.filter((row) => row.warehouse === warehouse);
  return state.stock;
}

export function visibleOrders(state: DemoState, actor: Actor): DemoOrder[] {
  if (actor.role !== "customer") return state.orders;
  return state.orders.filter((order) => sameParty(order.customerCompany, actor.company));
}

export function canReadOrder(actor: Actor, order: DemoOrder): boolean {
  if (actor.role !== "customer") return true;
  return sameParty(order.customerCompany, actor.company);
}

export function canOpenPoThread(actor: Actor, order: DemoOrder): boolean {
  if (actor.role === "customer") return sameParty(order.customerCompany, actor.company);
  return actor.role === "owner" || actor.role === "data-entry" || actor.role === "manager";
}

export function visibleContainers(state: DemoState, actor: Actor): DemoContainer[] {
  if (actor.role === "worker" && actor.warehouse) return state.containers.filter((row) => row.warehouse === actor.warehouse);
  if (actor.role !== "customer") return state.containers;
  const numbers = new Set(visibleOrders(state, actor).map((order) => order.number.trim().toLowerCase()));
  return state.containers.filter((row) => numbers.has(row.po.trim().toLowerCase()));
}

export function visibleOutbound(state: DemoState, actor: Actor): DemoOutbound[] {
  if (actor.role === "worker" && actor.warehouse) return state.outbound.filter((row) => row.warehouse === actor.warehouse);
  if (actor.role !== "customer") return state.outbound;
  return state.outbound.filter((row) => sameParty(row.customer, actor.company));
}

function findShipment(state: DemoState, direction: "inbound" | "outbound", number: string) {
  if (direction === "inbound") return state.containers.find((row) => row.number === number);
  return state.outbound.find((row) => row.number === number);
}

export function visibleDocuments(state: DemoState, actor: Actor): DemoDocument[] {
  return state.documents.filter((document) => {
    if (document.origin === "annex7" && document.annex) {
      const record = findShipment(state, document.annex.direction, document.annex.shipment);
      if (actor.role === "customer") {
        if (!record) return false;
        if (document.annex.direction === "outbound") return sameParty((record as DemoOutbound).customer, actor.company);
        return visibleContainers(state, actor).some((row) => row.number === document.annex?.shipment);
      }
      if (actor.role === "worker") return record !== undefined && record.warehouse === actor.warehouse;
      return true;
    }
    if (actor.role !== "customer") return true;
    const numbers = visibleOrders(state, actor)
      .map((order) => order.number.trim().toLowerCase())
      .filter((number) => number.length > 0);
    if (numbers.length === 0) return false;
    const haystack = `${document.name} ${document.meta} ${document.po}`.toLowerCase();
    return numbers.some((number) => haystack.includes(number));
  });
}

export function canReadConversation(actor: Actor, conversation: DemoConversation): boolean {
  if (conversation.scope === "seller") return actor.role === "owner" || actor.role === "data-entry" || actor.role === "manager";
  if (conversation.scope === "internal") return actor.role === "owner" || actor.role === "data-entry" || actor.role === "manager" || actor.role === "worker";
  if (conversation.scope !== "purchase-order") return false;
  if (actor.role === "customer") return sameParty(conversation.customerCompany, actor.company);
  return actor.role === "owner" || actor.role === "data-entry" || actor.role === "manager";
}

export function canOpenSellerThread(actor: Actor): boolean {
  return actor.role === "owner" || actor.role === "data-entry" || actor.role === "manager";
}

export type DemoTask = { href: string; title: string; detail: string; count: number };

export function openTasks(state: DemoState, actor: Actor): DemoTask[] {
  if (actor.role !== "owner" && actor.role !== "manager" && actor.role !== "worker") return [];
  const pending = state.orders.filter((order) => order.status === "Pending");
  const receiving = state.containers.filter((row) => {
    if (row.status === "Completed") return false;
    const order = state.orders.find((item) => item.number === row.po);
    if (order?.status === "Rejected") return false;
    if (actor.role === "worker") return (row.status === "Unloading" || row.status === "Registered") && row.warehouse === actor.warehouse;
    if (actor.role === "manager") return row.status === "Planned" || row.status === "In transit" || row.status === "Arrived" || row.status === "Loaded";
    return actor.role === "owner";
  });
  const shipments = state.outbound.filter((row) => {
    if (row.status === "Dispatched") return false;
    if (actor.role === "worker") return row.warehouse === actor.warehouse;
    if (actor.role === "manager") return row.status === "Planned" || !row.po.trim() || !row.container.trim();
    return actor.role === "owner";
  });
  const tasks: DemoTask[] = [];
  if (actor.role === "owner" && pending.length > 0) {
    tasks.push({ href: "/purchases", title: "Approve pending PO/SO orders", detail: pending.map((order) => order.number).join(", "), count: pending.length });
  }
  const pendingRequests = (state.requests ?? []).filter((req) => req.status === "submitted");
  if (actor.role === "owner" && pendingRequests.length > 0) {
    tasks.push({
      href: "/tasks",
      title: "Approve worker loading/unloading requests",
      detail: pendingRequests.map((req) => `${req.number} (${req.warehouse})`).join(", "),
      count: pendingRequests.length,
    });
  }
  const approvedRequests = (state.requests ?? []).filter(
    (req) => req.status === "approved" && (!actor.warehouse || req.warehouse === actor.warehouse),
  );
  if (actor.role === "worker" && approvedRequests.length > 0) {
    tasks.push({
      href: "/tasks",
      title: "Complete approved requests into stock",
      detail: approvedRequests.map((req) => `${req.number} (${req.warehouse})`).join(", "),
      count: approvedRequests.length,
    });
  }
  const sentBackRequests = (state.requests ?? []).filter((req) => req.status === "sent_back" && (!actor.warehouse || req.warehouse === actor.warehouse));
  if (actor.role === "worker" && sentBackRequests.length > 0) {
    tasks.push({
      href: "/tasks",
      title: "Requests sent back for revision",
      detail: sentBackRequests.map((req) => `${req.number}: ${req.sentBackNote ?? "Needs revision"}`).join(", "),
      count: sentBackRequests.length,
    });
  }
  if (receiving.length > 0) {
    tasks.push({ href: "/containers", title: "Incoming / unloading containers", detail: receiving.map((row) => row.number).join(", "), count: receiving.length });
  }
  if (shipments.length > 0) {
    tasks.push({ href: "/outbound", title: "Outgoing / loading shipments", detail: shipments.map((row) => row.number).join(", "), count: shipments.length });
  }
  return tasks;
}

export function listPublicUsers(state: DemoState): PublicUser[] {
  return state.accounts;
}

export function reportCsv(rows: DemoStock[]): string {
  const lines = ["Material,Category,Warehouse,Quantity,WeightKg,Reorder,Status"];
  for (const row of rows) {
    lines.push([row.material, row.category, row.warehouse, String(row.quantity), String(row.weightKg), String(row.reorder), stockStatus(row)].join(","));
  }
  return lines.join("\n");
}
