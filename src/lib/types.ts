export type PurchaseStatus = "draft" | "pending" | "received";
export type ContainerStatus = "scheduled" | "in_transit" | "customs" | "arrived";
export type MovementType = "inbound" | "outbound" | "transfer" | "adjustment";
export type SaleStatus = "draft" | "open" | "fulfilled";

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  city: string;
  country: string;
  capacityKg: number;
};

export type InventoryLot = {
  id: string;
  sku: string;
  name: string;
  category: string;
  warehouseId: string;
  quantity: number;
  unit: string;
  weightKg: number;
  reorderPoint: number;
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  country: string;
  leadTimeDays: number;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  city: string;
  paymentTerms: string;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status: PurchaseStatus;
  expectedOn: string;
  weightKg: number;
};

export type Container = {
  id: string;
  number: string;
  origin: string;
  warehouseId: string;
  status: ContainerStatus;
  eta: string;
  weightKg: number;
  purchaseOrderNumber: string | null;
};

export type StockMovement = {
  id: string;
  occurredOn: string;
  type: MovementType;
  sku: string;
  description: string;
  fromLabel: string;
  toLabel: string;
  weightKg: number;
  reference: string;
};

export type Sale = {
  id: string;
  number: string;
  customerId: string;
  warehouseId: string;
  status: SaleStatus;
  orderedOn: string;
  weightKg: number;
};

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  cadence: string;
};
