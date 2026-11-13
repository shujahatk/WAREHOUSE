import type { DomainRole } from "../../domain/schemas.ts";
import { isActiveRole } from "../permissions.ts";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: DomainRole;
  warehouseId: string | null;
  companyId: string | null;
  active: boolean;
  warehouse?: string | null;
  company?: string | null;
};

export type Action =
  | "user:manage"
  | "warehouse:manage"
  | "material:manage"
  | "packaging:manage"
  | "supplier:manage"
  | "customer:manage"
  | "order:create"
  | "order:submit"
  | "order:approve"
  | "order:reject"
  | "order:delete"
  | "order:edit"
  | "order:view"
  | "request:create"
  | "request:approve"
  | "request:decline"
  | "request:sendBack"
  | "request:complete"
  | "request:delete"
  | "request:view"
  | "worker:assign"
  | "shipment:create"
  | "shipment:edit"
  | "shipment:advance"
  | "shipment:override"
  | "shipment:view"
  | "seller:confirm"
  | "customs:edit"
  | "customs:confirm"
  | "cmr:save"
  | "carrier:save"
  | "threshold:set"
  | "transfer:create"
  | "stock:adjust"
  | "stock:transfer"
  | "chat:send"
  | "chat:view"
  | "annex7:upload"
  | "annex7:review"
  | "annex7:approve"
  | "file:upload"
  | "file:delete"
  | "file:view"
  | "stock:move"
  | "stock:view"
  | "audit:view"
  | "report:view"
  | "offer:create"
  | "offer:edit"
  | "offer:delete"
  | "offer:view"
  | "offer:submit"
  | "offer:approve"
  | "offer:reject"
  | "offer:negotiate"
  | "offer:status"
  | "offer:comment"
  | "offer:attach";

export type Resource = {
  warehouseId?: string | null;
  warehouse?: string | null;
  companyId?: string | null;
  createdBy?: string | null;
  status?: string | null;
  scope?: string | null;
  [key: string]: unknown;
};

function matchesWorkerWarehouse(user: AuthUser, resource?: Resource): boolean {
  if (!user.warehouseId && !user.warehouse) return false;
  if (resource?.warehouseId && user.warehouseId && resource.warehouseId !== user.warehouseId && resource.warehouseId !== user.warehouse) {
    return false;
  }
  if (resource?.warehouse && user.warehouse && resource.warehouse !== user.warehouse && resource.warehouse !== user.warehouseId) {
    return false;
  }
  return true;
}

/**
 * Authorization function: can(user, action, resource)
 * Enforces the confirmed 3-role matrix:
 * 1. Admin (owner)
 * 2. Staff (manager)
 * 3. Worker (worker)
 */
export function can(
  user: AuthUser | null | undefined,
  action: Action,
  resource?: Resource,
): boolean {
  if (!user || !user.active) return false;
  if (!isActiveRole(user.role)) return false;

  // 1. Admin (owner):
  // - Views all operational data, documents, images, reports, and audit logs across all warehouses
  // - Approves, rejects (declines), or sends back requests (and approves/rejects orders & Annex VII)
  // - Manages users, warehouses, materials, packaging, and low-stock thresholds
  // - CANNOT create, edit, delete, or directly modify operational records (PO/SO, shipments, requests, files)
  // - CANNOT complete warehouse operations, adjust stock, or execute transfers
  if (user.role === "owner") {
    switch (action) {
      case "order:view":
      case "request:view":
      case "shipment:view":
      case "file:view":
      case "stock:view":
      case "audit:view":
      case "report:view":
      case "chat:view":
      case "request:approve":
      case "request:decline":
      case "request:sendBack":
      case "order:approve":
      case "order:reject":
      case "annex7:review":
      case "annex7:approve":
      case "user:manage":
      case "warehouse:manage":
      case "material:manage":
      case "packaging:manage":
      case "threshold:set":
      case "offer:view":
      case "offer:approve":
      case "offer:reject":
      case "offer:comment":
        return true;
      case "offer:create":
      case "offer:edit":
      case "offer:delete":
      case "offer:submit":
      case "offer:negotiate":
      case "offer:status":
      case "offer:attach":
        return false;
      case "order:create":
      case "order:submit":
      case "order:edit":
      case "order:delete":
      case "request:create":
      case "request:complete":
      case "request:delete":
      case "worker:assign":
      case "shipment:create":
      case "shipment:edit":
      case "shipment:advance":
      case "shipment:override":
      case "seller:confirm":
      case "customs:edit":
      case "customs:confirm":
      case "cmr:save":
      case "carrier:save":
      case "transfer:create":
      case "stock:adjust":
      case "stock:transfer":
      case "stock:move":
      case "annex7:upload":
      case "file:upload":
      case "file:delete":
      case "supplier:manage":
      case "customer:manage":
      case "chat:send":
      default:
        return false;
    }
  }

  // 2. Staff (manager):
  // - Creates and edits PO/SO records (in advance or in response to Worker requests, including after operations start)
  // - Manages suppliers, customers, and contact info
  // - Views all operations across all warehouses and enters operational details
  // - CANNOT delete/cancel PO/SO records or Worker requests
  // - CANNOT assign or change the responsible Worker
  // - CANNOT approve or reject Worker requests
  // - CANNOT perform Admin-only stock adjustments or transfers
  if (user.role === "manager") {
    switch (action) {
      case "order:create":
        return true;
      case "order:edit":
        return resource?.status !== "declined";
      case "order:view":
      case "supplier:manage":
      case "customer:manage":
      case "shipment:create":
      case "shipment:edit":
      case "shipment:advance":
      case "shipment:view":
      case "request:view":
      case "customs:edit":
      case "customs:confirm":
      case "seller:confirm":
      case "cmr:save":
      case "carrier:save":
      case "annex7:upload":
      case "annex7:review":
      case "file:upload":
      case "file:view":
      case "chat:send":
      case "chat:view":
      case "stock:view":
        return true;
      case "request:sendBack":
        return resource?.status !== "completed" && resource?.status !== "deleted";
      // Explicitly denied for Staff:
      case "report:view":
      case "order:delete":
      case "order:reject":
      case "order:approve":
      case "request:delete":
      case "request:approve":
      case "request:decline":
      case "request:complete":
      case "request:create":
      case "worker:assign":
      case "stock:move":
      case "stock:adjust":
      case "stock:transfer":
      case "transfer:create":
      case "user:manage":
      case "warehouse:manage":
      case "material:manage":
      case "packaging:manage":
      case "threshold:set":
      case "file:delete":
      case "shipment:override":
      case "annex7:approve":
      case "audit:view":
      default:
        return false;
    }
  }

  // 3. Worker (worker):
  // - Submits unloading (PO) and loading (SO) requests for assigned warehouse
  // - Completes approved loading and unloading operations
  // - Uploads required photos, CMR, and Annex VII; selects packaging materials
  // - Views own requests and operation history
  // - CANNOT approve own requests, manage users/master data, delete PO/SO, change assigned Worker, or perform stock adjustments/transfers
  if (user.role === "worker") {
    switch (action) {
      case "request:create":
      case "request:view":
      case "shipment:create":
      case "shipment:edit":
      case "shipment:advance":
      case "shipment:view":
      case "cmr:save":
      case "carrier:save":
      case "annex7:upload":
      case "stock:move":
      case "stock:view":
      case "order:view":
        return matchesWorkerWarehouse(user, resource);
      case "request:complete":
        if (resource?.status !== "approved") return false;
        return matchesWorkerWarehouse(user, resource);
      case "request:delete":
        if (resource?.status === "completed" || resource?.status === "approved") return false;
        if (resource?.status && !["submitted", "declined", "sent_back"].includes(resource.status)) return false;
        if (!matchesWorkerWarehouse(user, resource)) return false;
        return Boolean(!resource?.createdBy || resource.createdBy === user.id);
      case "file:upload":
        if (!matchesWorkerWarehouse(user, resource)) return false;
        if (resource?.createdBy && resource.createdBy !== user.id) return false;
        return true;
      case "file:delete":
        if (resource?.status === "completed") return false;
        if (!matchesWorkerWarehouse(user, resource)) return false;
        if (resource?.createdBy && resource.createdBy !== user.id) return false;
        return true;
      case "file:view":
        return matchesWorkerWarehouse(user, resource);
      case "chat:send":
      case "chat:view":
        return resource?.scope !== "seller";
      // Explicitly denied for Worker:
      case "request:approve":
      case "request:decline":
      case "request:sendBack":
      case "order:create":
      case "order:edit":
      case "order:approve":
      case "order:reject":
      case "order:delete":
      case "worker:assign":
      case "stock:adjust":
      case "stock:transfer":
      case "transfer:create":
      case "user:manage":
      case "warehouse:manage":
      case "material:manage":
      case "packaging:manage":
      case "supplier:manage":
      case "customer:manage":
      case "threshold:set":
      case "audit:view":
      default:
        return false;
    }
  }

  // 4. Sales & Purchasing Offer Moderator:
  // - Creates, edits, deletes (soft-delete), reviews, negotiates, and manages purchasing & selling offers
  // - Submits offers for Admin review
  // - Updates permitted offer statuses (negotiating, won, lost)
  // - Manages offer attachments (images & documents) and adds comments/notes
  // - Views offer activity and history
  // - CANNOT approve or reject offers (Admin only)
  // - CANNOT access warehouse operations, inventory, shipments, requests, or administrative settings
  if (user.role === "moderator") {
    switch (action) {
      case "offer:create":
      case "offer:edit":
      case "offer:delete":
      case "offer:view":
      case "offer:submit":
      case "offer:negotiate":
      case "offer:status":
      case "offer:comment":
      case "offer:attach":
        return true;
      case "offer:approve":
      case "offer:reject":
      default:
        return false;
    }
  }

  return false;
}
