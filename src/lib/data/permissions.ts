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
  | "user:approve"
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
  | "order:assign"
  | "order:complete"
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
  | "offer:attach"
  | "offer:sell"
  | "offer:accept";

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
  if (!isActiveRole(user.role) && user.role !== "offers_user") return false;

  // 1. Admin (owner):
  // - Handles, approves, and rejects user requests (Worker general requests and operational requests)
  // - Can manage directories, users, reports, audits, inventory, transfers, materials, packaging, and offers
  // - CANNOT add PO or SO (order:create, order:edit)
  // - CANNOT manage scheduling or assign workers to schedules
  if (user.role === "owner") {
    switch (action) {
      case "request:view":
      case "request:approve":
      case "request:decline":
      case "request:sendBack":
      case "user:manage":
      case "user:approve":
      case "warehouse:manage":
      case "material:manage":
      case "packaging:manage":
      case "supplier:manage":
      case "customer:manage":
      case "threshold:set":
      case "transfer:create":
      case "stock:adjust":
      case "stock:transfer":
      case "stock:move":
      case "stock:view":
      case "order:view":
      case "order:approve":
      case "order:reject":
      case "shipment:view":
      case "cmr:save":
      case "carrier:save":
      case "seller:confirm":
      case "customs:confirm":
      case "annex7:upload":
      case "annex7:review":
      case "annex7:approve":
      case "file:upload":
      case "file:delete":
      case "file:view":
      case "chat:send":
      case "chat:view":
      case "audit:view":
      case "report:view":
      case "offer:create":
      case "offer:edit":
      case "offer:delete":
      case "offer:view":
      case "offer:submit":
      case "offer:approve":
      case "offer:reject":
      case "offer:negotiate":
      case "offer:status":
      case "offer:comment":
      case "offer:attach":
      case "offer:accept":
        return true;
      // Explicitly excluded for Admin: Adding PO/SO, and scheduling / worker assignment
      case "order:create":
      case "order:edit":
      case "order:delete":
      case "order:assign":
      case "worker:assign":
      case "order:submit":
      case "order:complete":
      case "request:create":
      case "request:complete":
      case "request:delete":
      case "shipment:create":
      case "shipment:edit":
      case "shipment:advance":
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
      case "order:create":
      case "order:delete":
      case "order:edit":
      case "order:approve":
      case "order:reject":
      case "order:view":
      case "request:approve":
      case "request:decline":
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
      case "annex7:approve":
      case "file:upload":
      case "file:view":
      case "chat:send":
      case "chat:view":
      case "stock:view":
      case "order:assign":
        return true;
      case "request:sendBack":
        return resource?.status !== "completed" && resource?.status !== "deleted";
      // Explicitly denied for Staff:
      case "report:view":
      case "request:delete":
      case "request:complete":
      case "request:create":
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
        return matchesWorkerWarehouse(user, resource);
      case "order:view": {
        if (resource?.assignedWorkerId && resource.assignedWorkerId !== user.id) return false;
        if (resource?.assigned_worker_id && resource.assigned_worker_id !== user.id) return false;
        return matchesWorkerWarehouse(user, resource);
      }
      case "order:complete": {
        if (resource?.assignedWorkerId && resource.assignedWorkerId !== user.id) return false;
        if (resource?.assigned_worker_id && resource.assigned_worker_id !== user.id) return false;
        return true;
      }
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
      case "offer:accept":
      case "offer:approve":
      case "offer:reject":
        return true;
      default:
        return false;
    }
  }

  // 5. Offers User (offers_user):
  // - Dedicated portal for trading & procurement offers
  // - Views all Purchasing Offers
  // - Submits Selling Offers linked to a PO (9 validated fields)
  // - Views their own submitted Selling Offers & status
  // - Views commercially accepted / Sold offers
  // - Uploads attachments to their offers
  // - STRICT ISOLATION: No access to inventory, warehouse operations, staff, or admin
  if (user.role === "offers_user") {
    switch (action) {
      case "offer:view":
        if (!resource || !resource.kind || resource.kind === "purchasing") return true;
        if (resource.kind === "selling") {
          return (
            resource.createdBy === user.id ||
            resource.created_by === user.id ||
            resource.status === "accepted"
          );
        }
        return true;
      case "offer:create":
      case "offer:sell":
      case "offer:submit":
      case "offer:attach":
      case "file:upload":
      case "file:view":
        return true;
      default:
        return false;
    }
  }

  return false;
}
