import type { StatusTone } from "@/lib/table";
import type {
  ContainerStatus,
  InventoryLot,
  MovementType,
  PurchaseStatus,
  SaleStatus,
} from "@/lib/types";

type StatusPresentation = {
  label: string;
  tone: StatusTone;
};

const purchaseStatus: Record<PurchaseStatus, StatusPresentation> = {
  draft: { label: "Draft", tone: "neutral" },
  pending: { label: "Pending", tone: "attention" },
  received: { label: "Received", tone: "solid" },
};

const containerStatus: Record<ContainerStatus, StatusPresentation> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  in_transit: { label: "In transit", tone: "attention" },
  customs: { label: "Customs", tone: "solid" },
  arrived: { label: "Arrived", tone: "quiet" },
};

const movementType: Record<MovementType, StatusPresentation> = {
  inbound: { label: "Inbound", tone: "solid" },
  outbound: { label: "Outbound", tone: "attention" },
  transfer: { label: "Transfer", tone: "neutral" },
  adjustment: { label: "Adjustment", tone: "quiet" },
};

const saleStatus: Record<SaleStatus, StatusPresentation> = {
  draft: { label: "Draft", tone: "neutral" },
  open: { label: "Open", tone: "attention" },
  fulfilled: { label: "Fulfilled", tone: "solid" },
};

export function stockPresentation(lot: InventoryLot): StatusPresentation {
  if (lot.quantity <= 0) {
    return { label: "Out of stock", tone: "solid" };
  }

  if (lot.quantity <= lot.reorderPoint) {
    return { label: "Low stock", tone: "attention" };
  }

  return { label: "In stock", tone: "quiet" };
}

export function capacityPresentation(utilization: number): StatusPresentation {
  if (utilization >= 0.8) {
    return { label: "Tight", tone: "attention" };
  }

  if (utilization >= 0.5) {
    return { label: "Balanced", tone: "neutral" };
  }

  return { label: "Open capacity", tone: "quiet" };
}

export function purchasePresentation(status: PurchaseStatus): StatusPresentation {
  return purchaseStatus[status];
}

export function containerPresentation(status: ContainerStatus): StatusPresentation {
  return containerStatus[status];
}

export function movementPresentation(type: MovementType): StatusPresentation {
  return movementType[type];
}

export function salePresentation(status: SaleStatus): StatusPresentation {
  return saleStatus[status];
}
