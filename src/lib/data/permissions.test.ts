import assert from "node:assert/strict";
import test from "node:test";
import { can, type AuthUser } from "./permissions.ts";

const owner: AuthUser = {
  id: "u-owner-1",
  email: "owner@example.com",
  name: "Ada Admin",
  role: "owner",
  warehouseId: null,
  companyId: null,
  active: true,
};

const manager: AuthUser = {
  id: "u-manager-1",
  email: "staff@example.com",
  name: "Charlie Staff",
  role: "manager",
  warehouseId: null,
  companyId: null,
  active: true,
};

const workerBremen: AuthUser = {
  id: "u-worker-1",
  email: "worker-bremen@example.com",
  name: "Bob Worker",
  role: "worker",
  warehouseId: "wh-bremen",
  warehouse: "Bornem",
  companyId: null,
  active: true,
};

const legacyCustomer: AuthUser = {
  id: "u-cust-1",
  email: "customer@meridian.com",
  name: "Diana Customer",
  role: "customer",
  warehouseId: null,
  companyId: "co-meridian",
  active: true,
};

const inactiveOwner: AuthUser = {
  ...owner,
  id: "u-owner-inactive",
  active: false,
};

test("inactive users and non-active legacy roles are denied all actions", () => {
  assert.equal(can(inactiveOwner, "order:approve"), false);
  assert.equal(can(inactiveOwner, "request:view"), false);
  assert.equal(can(null, "request:view"), false);

  // Legacy customer role is denied all actions in Phase 1
  assert.equal(can(legacyCustomer, "order:submit"), false);
  assert.equal(can(legacyCustomer, "order:view", { companyId: "co-meridian" }), false);
  assert.equal(can(legacyCustomer, "request:view"), false);
  assert.equal(can(legacyCustomer, "file:view", { companyId: "co-meridian" }), false);
});

test("Admin (owner) views all operational data/documents/images and approves/rejects requests, but cannot edit, delete, or directly modify operational records", () => {
  // Allowed: viewing all operational data, documents, images, reports, and audit logs
  assert.equal(can(owner, "order:view"), true);
  assert.equal(can(owner, "request:view"), true);
  assert.equal(can(owner, "shipment:view"), true);
  assert.equal(can(owner, "file:view"), true);
  assert.equal(can(owner, "stock:view"), true);
  assert.equal(can(owner, "audit:view"), true);
  assert.equal(can(owner, "report:view"), true);

  // Allowed: approving/rejecting requests, orders, and Annex VII, plus system administration
  assert.equal(can(owner, "order:approve"), true);
  assert.equal(can(owner, "order:reject"), true);
  assert.equal(can(owner, "request:approve"), true);
  assert.equal(can(owner, "request:decline"), true);
  assert.equal(can(owner, "request:sendBack"), true);
  assert.equal(can(owner, "annex7:review"), true);
  assert.equal(can(owner, "annex7:approve"), true);
  assert.equal(can(owner, "user:manage"), true);
  assert.equal(can(owner, "warehouse:manage"), true);
  assert.equal(can(owner, "material:manage"), true);
  assert.equal(can(owner, "packaging:manage"), true);
  assert.equal(can(owner, "threshold:set"), true);

  // Denied: creating, editing, deleting, or directly modifying operational records, completing operations, stock adjustments, or transfers
  assert.equal(can(owner, "order:create"), false);
  assert.equal(can(owner, "order:edit", { status: "submitted" }), false);
  assert.equal(can(owner, "order:edit", { status: "approved" }), false);
  assert.equal(can(owner, "order:delete"), false);
  assert.equal(can(owner, "request:create"), false);
  assert.equal(can(owner, "request:complete", { status: "approved" }), false);
  assert.equal(can(owner, "request:delete", { status: "submitted" }), false);
  assert.equal(can(owner, "request:delete", { status: "completed" }), false);
  assert.equal(can(owner, "worker:assign"), false);
  assert.equal(can(owner, "shipment:create"), false);
  assert.equal(can(owner, "shipment:edit"), false);
  assert.equal(can(owner, "shipment:advance"), false);
  assert.equal(can(owner, "file:upload"), false);
  assert.equal(can(owner, "file:delete"), false);
  assert.equal(can(owner, "annex7:upload"), false);
  assert.equal(can(owner, "cmr:save"), false);
  assert.equal(can(owner, "carrier:save"), false);
  assert.equal(can(owner, "supplier:manage"), false);
  assert.equal(can(owner, "customer:manage"), false);
  assert.equal(can(owner, "stock:move"), false);
  assert.equal(can(owner, "stock:adjust"), false);
  assert.equal(can(owner, "stock:transfer"), false);
  assert.equal(can(owner, "transfer:create"), false);
});

test("Staff (manager) can create/edit PO/SO even after start, manage suppliers/customers, and view all operations, but cannot delete, approve, assign workers, or adjust/transfer stock", () => {
  // Allowed for Staff
  assert.equal(can(manager, "order:create"), true);
  assert.equal(can(manager, "order:edit", { status: "submitted" }), true);
  assert.equal(can(manager, "order:edit", { status: "approved" }), true);
  assert.equal(can(manager, "order:view"), true);
  assert.equal(can(manager, "supplier:manage"), true);
  assert.equal(can(manager, "customer:manage"), true);
  assert.equal(can(manager, "shipment:create"), true);
  assert.equal(can(manager, "shipment:edit"), true);
  assert.equal(can(manager, "shipment:view"), true);
  assert.equal(can(manager, "request:view"), true);
  assert.equal(can(manager, "request:sendBack", { status: "submitted" }), true);
  assert.equal(can(manager, "file:upload"), true);
  assert.equal(can(manager, "file:view"), true);
  assert.equal(can(manager, "stock:view"), true);

  // Strictly prohibited for Staff (including Administration: users, reports, audit, settings)
  assert.equal(can(manager, "report:view"), false);
  assert.equal(can(manager, "audit:view"), false);
  assert.equal(can(manager, "order:delete"), false);
  assert.equal(can(manager, "order:approve"), false);
  assert.equal(can(manager, "order:reject"), false);
  assert.equal(can(manager, "request:delete"), false);
  assert.equal(can(manager, "request:approve"), false);
  assert.equal(can(manager, "request:decline"), false);
  assert.equal(can(manager, "request:complete", { status: "approved" }), false);
  assert.equal(can(manager, "worker:assign"), false);
  assert.equal(can(manager, "stock:move"), false);
  assert.equal(can(manager, "stock:adjust"), false);
  assert.equal(can(manager, "stock:transfer"), false);
  assert.equal(can(manager, "transfer:create"), false);
  assert.equal(can(manager, "user:manage"), false);
  assert.equal(can(manager, "warehouse:manage"), false);
  assert.equal(can(manager, "material:manage"), false);
  assert.equal(can(manager, "packaging:manage"), false);
});

test("Worker permissions: scoped to assigned warehouse, can complete approved operations and upload CMR/Annex VII/photos, cannot approve or adjust/transfer stock", () => {
  // Allowed at assigned warehouse
  assert.equal(can(workerBremen, "request:create", { warehouseId: "wh-bremen" }), true);
  assert.equal(can(workerBremen, "request:view", { warehouseId: "wh-bremen" }), true);
  assert.equal(can(workerBremen, "shipment:view", { warehouseId: "wh-bremen" }), true);
  assert.equal(can(workerBremen, "cmr:save", { warehouseId: "wh-bremen" }), true);
  assert.equal(can(workerBremen, "annex7:upload", { warehouseId: "wh-bremen" }), true);
  assert.equal(can(workerBremen, "file:upload", { warehouseId: "wh-bremen" }), true);

  // Worker can complete APPROVED operations at their assigned warehouse, but not unapproved ones
  assert.equal(can(workerBremen, "request:complete", { warehouseId: "wh-bremen", status: "approved" }), true);
  assert.equal(can(workerBremen, "request:complete", { warehouseId: "wh-bremen", status: "submitted" }), false);
  assert.equal(can(workerBremen, "request:complete", { warehouseId: "wh-turnhout", status: "approved" }), false);

  // Denied at other warehouses
  assert.equal(can(workerBremen, "request:create", { warehouseId: "wh-turnhout" }), false);
  assert.equal(can(workerBremen, "request:view", { warehouseId: "wh-turnhout" }), false);
  assert.equal(can(workerBremen, "shipment:view", { warehouseId: "wh-turnhout" }), false);

  // Worker cannot approve/decline requests, manage PO/SO, assign workers, or adjust/transfer stock
  assert.equal(can(workerBremen, "request:approve"), false);
  assert.equal(can(workerBremen, "request:decline"), false);
  assert.equal(can(workerBremen, "order:create"), false);
  assert.equal(can(workerBremen, "order:edit"), false);
  assert.equal(can(workerBremen, "order:delete"), false);
  assert.equal(can(workerBremen, "worker:assign"), false);
  // Worker can post stock movements at their assigned warehouse (during operation completion)
  assert.equal(can(workerBremen, "stock:move", { warehouseId: "wh-bremen" }), true);
  assert.equal(can(workerBremen, "stock:move", { warehouseId: "wh-turnhout" }), false);
  assert.equal(can(workerBremen, "stock:adjust"), false);
  assert.equal(can(workerBremen, "stock:transfer"), false);
  assert.equal(can(workerBremen, "transfer:create"), false);
  assert.equal(can(workerBremen, "user:manage"), false);

  // Worker can delete their own request while submitted, declined, or sent back
  assert.equal(can(workerBremen, "request:delete", { createdBy: "u-worker-1", status: "submitted" }), true);
  assert.equal(can(workerBremen, "request:delete", { createdBy: "u-worker-1", status: "declined" }), true);
  assert.equal(can(workerBremen, "request:delete", { createdBy: "u-worker-1", status: "sent_back" }), true);
  assert.equal(can(workerBremen, "request:delete", { createdBy: "u-worker-1", status: "approved" }), false);
  assert.equal(can(workerBremen, "request:delete", { createdBy: "u-worker-1", status: "completed" }), false);
  assert.equal(can(workerBremen, "request:delete", { createdBy: "u-worker-other", status: "submitted" }), false);
});
