import assert from "node:assert/strict";
import test from "node:test";
import { navSections } from "./navigation.ts";
import {
  ACTIVE_ROLES,
  canAccess,
  canOperateWarehouse,
  canPerform,
  isActiveRole,
  normalizeRole,
  roleLabel,
} from "./permissions.ts";

test("four active roles and correct role normalization", () => {
  assert.deepEqual(ACTIVE_ROLES, ["owner", "manager", "worker", "moderator"]);
  assert.equal(ACTIVE_ROLES.length, 4);

  // Active roles
  assert.equal(isActiveRole("owner"), true);
  assert.equal(isActiveRole("manager"), true);
  assert.equal(isActiveRole("worker"), true);
  assert.equal(isActiveRole("moderator"), true);

  // Removed roles are not active
  assert.equal(isActiveRole("customer"), false);
  assert.equal(isActiveRole("management"), false);
  assert.equal(isActiveRole("data-entry"), false);

  // Role normalization
  assert.equal(normalizeRole("owner"), "owner");
  assert.equal(normalizeRole("admin"), "owner");
  assert.equal(normalizeRole("Admin"), "owner");
  assert.equal(normalizeRole("manager"), "manager");
  assert.equal(normalizeRole("staff"), "manager");
  assert.equal(normalizeRole("Staff"), "manager");
  assert.equal(normalizeRole("worker"), "worker");
  assert.equal(normalizeRole("Worker"), "worker");
  assert.equal(normalizeRole("moderator"), "moderator");
  assert.equal(normalizeRole("offer-moderator"), "moderator");
  assert.equal(normalizeRole("Moderator"), "moderator");

  // Removed / unknown roles normalize to null
  assert.equal(normalizeRole("customer"), null);
  assert.equal(normalizeRole("management"), null);
  assert.equal(normalizeRole("data-entry"), null);
  assert.equal(normalizeRole("unknown"), null);

  // Labels match Admin / Staff / Worker / Sales & Purchasing Offer Moderator
  assert.equal(roleLabel("owner"), "Admin");
  assert.equal(roleLabel("manager"), "Staff");
  assert.equal(roleLabel("worker"), "Worker");
  assert.equal(roleLabel("moderator"), "Sales & Purchasing Offer Moderator");
});

test("navigation sections and direct URL rules for Admin, Staff, Worker, and Moderator", () => {
  // Verify 6 structured sidebar sections
  assert.deepEqual(
    navSections.map((s) => s.title),
    ["Main", "Operations", "Warehouse", "Offers", "Directories", "Administration"],
  );

  // Verify no removed modules appear in navigation
  const allNavHrefs = navSections.flatMap((s) => s.items.map((i) => i.href));
  assert.equal(allNavHrefs.includes("/roadmap"), false);
  assert.equal(allNavHrefs.includes("/chat"), false);
  assert.equal(allNavHrefs.includes("/sales"), false);

  // Verify removed modules cannot be accessed by direct URL for ANY role
  for (const role of ["owner", "manager", "worker", "moderator", "customer", "management", "data-entry"] as const) {
    assert.equal(canAccess(role, "/roadmap"), false);
    assert.equal(canAccess(role, "/chat"), false);
    assert.equal(canAccess(role, "/chat/PO213344"), false);
    assert.equal(canAccess(role, "/sales"), false);
  }

  // Admin (owner) has full route access across all active modules & Administration, including Offers
  assert.equal(canAccess("owner", "/dashboard"), true);
  assert.equal(canAccess("owner", "/offers"), true);
  assert.equal(canAccess("owner", "/offers/purchasing"), true);
  assert.equal(canAccess("owner", "/offers/selling"), true);
  assert.equal(canAccess("owner", "/tasks"), true);
  assert.equal(canAccess("owner", "/purchases"), true);
  assert.equal(canAccess("owner", "/purchases/PO213344"), true);
  assert.equal(canAccess("owner", "/containers/CNTR-4587"), true);
  assert.equal(canAccess("owner", "/outbound/OUT-1184"), true);
  assert.equal(canAccess("owner", "/inventory"), true);
  assert.equal(canAccess("owner", "/stock-movements"), true);
  assert.equal(canAccess("owner", "/transfers"), true);
  assert.equal(canAccess("owner", "/warehouses"), true);
  assert.equal(canAccess("owner", "/suppliers"), true);
  assert.equal(canAccess("owner", "/customers"), true);
  assert.equal(canAccess("owner", "/materials"), true);
  assert.equal(canAccess("owner", "/users"), true);
  assert.equal(canAccess("owner", "/reports"), true);
  assert.equal(canAccess("owner", "/audit"), true);
  assert.equal(canAccess("owner", "/settings"), true);

  // Staff (manager) can access Main, Operations, Warehouse, Directories, but NOT Administration and NOT Offers
  assert.equal(canAccess("manager", "/dashboard"), true);
  assert.equal(canAccess("manager", "/offers"), false);
  assert.equal(canAccess("manager", "/offers/purchasing"), false);
  assert.equal(canAccess("manager", "/offers/selling"), false);
  assert.equal(canAccess("manager", "/tasks"), true);
  assert.equal(canAccess("manager", "/purchases"), true);
  assert.equal(canAccess("manager", "/purchases/PO213344"), true);
  assert.equal(canAccess("manager", "/containers/CNTR-4587"), true);
  assert.equal(canAccess("manager", "/outbound/OUT-1184"), true);
  assert.equal(canAccess("manager", "/inventory"), true);
  assert.equal(canAccess("manager", "/stock-movements"), true);
  assert.equal(canAccess("manager", "/transfers"), true);
  assert.equal(canAccess("manager", "/warehouses"), true);
  assert.equal(canAccess("manager", "/suppliers"), true);
  assert.equal(canAccess("manager", "/customers"), true);
  assert.equal(canAccess("manager", "/materials"), true);
  assert.equal(canAccess("manager", "/users"), false);
  assert.equal(canAccess("manager", "/reports"), false);
  assert.equal(canAccess("manager", "/audit"), false);
  assert.equal(canAccess("manager", "/settings"), false);

  // Worker can access only their operational workspace, requests, and history (NOT Offers)
  assert.equal(canAccess("worker", "/dashboard"), true);
  assert.equal(canAccess("worker", "/offers"), false);
  assert.equal(canAccess("worker", "/offers/purchasing"), false);
  assert.equal(canAccess("worker", "/offers/selling"), false);
  assert.equal(canAccess("worker", "/tasks"), true);
  assert.equal(canAccess("worker", "/containers/CNTR-4587"), true);
  assert.equal(canAccess("worker", "/outbound/OUT-1184"), true);
  assert.equal(canAccess("worker", "/inventory"), true);
  assert.equal(canAccess("worker", "/stock-movements"), true);
  assert.equal(canAccess("worker", "/documents"), true);
  assert.equal(canAccess("worker", "/purchases"), false);
  assert.equal(canAccess("worker", "/transfers"), false);
  assert.equal(canAccess("worker", "/warehouses"), false);
  assert.equal(canAccess("worker", "/suppliers"), false);
  assert.equal(canAccess("worker", "/customers"), false);
  assert.equal(canAccess("worker", "/materials"), false);
  assert.equal(canAccess("worker", "/users"), false);
  assert.equal(canAccess("worker", "/reports"), false);
  assert.equal(canAccess("worker", "/audit"), false);
  assert.equal(canAccess("worker", "/settings"), false);

  // Moderator can access Dashboard and Offers routes only
  assert.equal(canAccess("moderator", "/dashboard"), true);
  assert.equal(canAccess("moderator", "/offers"), true);
  assert.equal(canAccess("moderator", "/offers/purchasing"), true);
  assert.equal(canAccess("moderator", "/offers/selling"), true);
  assert.equal(canAccess("moderator", "/offers/OFF-2026-0001"), true);
  assert.equal(canAccess("moderator", "/tasks"), false);
  assert.equal(canAccess("moderator", "/purchases"), false);
  assert.equal(canAccess("moderator", "/containers"), false);
  assert.equal(canAccess("moderator", "/outbound"), false);
  assert.equal(canAccess("moderator", "/inventory"), false);
  assert.equal(canAccess("moderator", "/stock-movements"), false);
  assert.equal(canAccess("moderator", "/transfers"), false);
  assert.equal(canAccess("moderator", "/warehouses"), false);
  assert.equal(canAccess("moderator", "/suppliers"), false);
  assert.equal(canAccess("moderator", "/customers"), false);
  assert.equal(canAccess("moderator", "/materials"), false);
  assert.equal(canAccess("moderator", "/users"), false);
  assert.equal(canAccess("moderator", "/reports"), false);
  assert.equal(canAccess("moderator", "/audit"), false);
  assert.equal(canAccess("moderator", "/settings"), false);

  // Removed roles are denied all routes
  for (const removedRole of ["customer", "management", "data-entry"] as const) {
    assert.equal(canAccess(removedRole, "/dashboard"), false);
    assert.equal(canAccess(removedRole, "/purchases"), false);
    assert.equal(canAccess(removedRole, "/containers"), false);
    assert.equal(canAccess(removedRole, "/outbound"), false);
    assert.equal(canAccess(removedRole, "/documents"), false);
    assert.equal(canAccess(removedRole, "/users"), false);
  }
});

test("action permissions strictly enforce Admin, Staff, and Worker boundaries", () => {
  // Admin (owner): views all data/documents/images, approves/rejects requests/orders/Annex VII, manages system settings/users
  assert.equal(canPerform("owner", "approve-order"), true);
  assert.equal(canPerform("owner", "reject-order"), true);
  assert.equal(canPerform("owner", "approve-request"), true);
  assert.equal(canPerform("owner", "reject-request"), true);
  assert.equal(canPerform("owner", "review-annex"), true);
  assert.equal(canPerform("owner", "approve-annex"), true);
  assert.equal(canPerform("owner", "manage-users"), true);
  assert.equal(canPerform("owner", "manage-warehouses"), true);
  assert.equal(canPerform("owner", "manage-materials"), true);
  assert.equal(canPerform("owner", "manage-packaging"), true);
  assert.equal(canPerform("owner", "set-threshold"), true);
  assert.equal(canPerform("owner", "view-audit"), true);
  // Admin CANNOT edit, delete, or directly modify operational records, complete operations, adjust stock, or execute transfers
  assert.equal(canPerform("owner", "create-order"), false);
  assert.equal(canPerform("owner", "edit-order"), false);
  assert.equal(canPerform("owner", "delete-order"), false);
  assert.equal(canPerform("owner", "complete-request"), false);
  assert.equal(canPerform("owner", "delete-request"), false);
  assert.equal(canPerform("owner", "assign-worker"), false);
  assert.equal(canPerform("owner", "create-transfer"), false);
  assert.equal(canPerform("owner", "adjust-stock"), false);
  assert.equal(canPerform("owner", "register-shipment"), false);
  assert.equal(canPerform("owner", "edit-shipment"), false);
  assert.equal(canPerform("owner", "unload"), false);
  assert.equal(canPerform("owner", "dispatch"), false);
  assert.equal(canPerform("owner", "add-document"), false);
  assert.equal(canPerform("owner", "add-annex"), false);
  assert.equal(canPerform("owner", "save-cmr"), false);
  assert.equal(canPerform("owner", "manage-suppliers"), false);
  assert.equal(canPerform("owner", "manage-customers"), false);

  // Staff (manager) permissions
  assert.equal(canPerform("manager", "create-order"), true);
  assert.equal(canPerform("manager", "edit-order"), true);
  assert.equal(canPerform("manager", "manage-suppliers"), true);
  assert.equal(canPerform("manager", "manage-customers"), true);
  assert.equal(canPerform("manager", "register-shipment"), true);
  assert.equal(canPerform("manager", "edit-shipment"), true);
  assert.equal(canPerform("manager", "add-document"), true);
  assert.equal(canPerform("manager", "add-annex"), true);
  assert.equal(canPerform("manager", "save-cmr"), true);
  // Staff CANNOT delete/cancel orders or requests, assign workers, approve requests, or adjust/transfer stock
  assert.equal(canPerform("manager", "delete-order"), false);
  assert.equal(canPerform("manager", "approve-order"), false);
  assert.equal(canPerform("manager", "reject-order"), false);
  assert.equal(canPerform("manager", "delete-request"), false);
  assert.equal(canPerform("manager", "approve-request"), false);
  assert.equal(canPerform("manager", "reject-request"), false);
  assert.equal(canPerform("manager", "complete-request"), false);
  assert.equal(canPerform("manager", "assign-worker"), false);
  assert.equal(canPerform("manager", "create-transfer"), false);
  assert.equal(canPerform("manager", "adjust-stock"), false);
  assert.equal(canPerform("manager", "set-threshold"), false);
  assert.equal(canPerform("manager", "manage-users"), false);

  // Worker permissions
  assert.equal(canPerform("worker", "unload"), true);
  assert.equal(canPerform("worker", "dispatch"), true);
  assert.equal(canPerform("worker", "complete-request"), true);
  assert.equal(canPerform("worker", "delete-request"), true);
  assert.equal(canPerform("worker", "add-document"), true);
  assert.equal(canPerform("worker", "add-annex"), true);
  assert.equal(canPerform("worker", "save-cmr"), true);
  // Worker CANNOT approve own requests, manage users/master data, delete PO/SO, assign workers, or adjust/transfer stock
  assert.equal(canPerform("worker", "approve-request"), false);
  assert.equal(canPerform("worker", "reject-request"), false);
  assert.equal(canPerform("worker", "create-order"), false);
  assert.equal(canPerform("worker", "edit-order"), false);
  assert.equal(canPerform("worker", "delete-order"), false);
  assert.equal(canPerform("worker", "assign-worker"), false);
  assert.equal(canPerform("worker", "create-transfer"), false);
  assert.equal(canPerform("worker", "adjust-stock"), false);
  assert.equal(canPerform("worker", "manage-users"), false);
  assert.equal(canPerform("worker", "manage-suppliers"), false);
  assert.equal(canPerform("worker", "manage-customers"), false);

  // Sales & Purchasing Offer Moderator permissions
  assert.equal(canPerform("moderator", "create-offer"), true);
  assert.equal(canPerform("moderator", "edit-offer"), true);
  assert.equal(canPerform("moderator", "delete-offer"), true);
  assert.equal(canPerform("moderator", "view-offer"), true);
  assert.equal(canPerform("moderator", "submit-offer"), true);
  assert.equal(canPerform("moderator", "negotiate-offer"), true);
  assert.equal(canPerform("moderator", "status-offer"), true);
  assert.equal(canPerform("moderator", "comment-offer"), true);
  assert.equal(canPerform("moderator", "attach-offer"), true);
  // Moderator CANNOT approve or reject offers (Admin only) or perform warehouse operations
  assert.equal(canPerform("moderator", "approve-offer"), false);
  assert.equal(canPerform("moderator", "reject-offer"), false);
  assert.equal(canPerform("moderator", "create-order"), false);
  assert.equal(canPerform("moderator", "unload"), false);
  assert.equal(canPerform("moderator", "dispatch"), false);
  assert.equal(canPerform("moderator", "manage-users"), false);

  // Admin offer permissions: view, approve, reject, comment only; CANNOT create, edit, delete, negotiate, status, or attach
  assert.equal(canPerform("owner", "view-offer"), true);
  assert.equal(canPerform("owner", "approve-offer"), true);
  assert.equal(canPerform("owner", "reject-offer"), true);
  assert.equal(canPerform("owner", "comment-offer"), true);
  assert.equal(canPerform("owner", "create-offer"), false);
  assert.equal(canPerform("owner", "edit-offer"), false);
  assert.equal(canPerform("owner", "delete-offer"), false);
  assert.equal(canPerform("owner", "submit-offer"), false);
  assert.equal(canPerform("owner", "negotiate-offer"), false);
  assert.equal(canPerform("owner", "status-offer"), false);
  assert.equal(canPerform("owner", "attach-offer"), false);

  // Staff and Worker have NO offer permissions
  const offerActions = [
    "create-offer",
    "edit-offer",
    "delete-offer",
    "view-offer",
    "submit-offer",
    "approve-offer",
    "reject-offer",
    "negotiate-offer",
    "status-offer",
    "comment-offer",
    "attach-offer",
  ] as const;
  for (const act of offerActions) {
    assert.equal(canPerform("manager", act), false, `Staff should not perform ${act}`);
    assert.equal(canPerform("worker", act), false, `Worker should not perform ${act}`);
  }
});

test("warehouse operation scoping", () => {
  assert.equal(canOperateWarehouse("worker", "Bornem", "Bornem"), true);
  assert.equal(canOperateWarehouse("worker", "Bornem", "Turnhout"), false);
  assert.equal(canOperateWarehouse("owner", null, "Spain"), false);
  assert.equal(canOperateWarehouse("manager", null, "Bornem"), false);
  assert.equal(canOperateWarehouse("customer", null, "Bornem"), false);
});
