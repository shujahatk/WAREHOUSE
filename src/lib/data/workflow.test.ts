import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "../../domain/local-adapter.ts";

const now = "2026-10-22T08:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bremen", country: "Germany" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
  ],
  companies: [
    { name: "North Mill", kind: "supplier" },
    { name: "Meridian Packaging", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
  ],
  packagingTypes: [
    { name: "Normal Pallet", tareKg: 25 },
  ],
});

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "owner@example.com",
    STOCKFLOW_OWNER_NAME: "Ada Owner",
    STOCKFLOW_OWNER_PASSWORD: "owner-pass-1",
    STOCKFLOW_REFERENCE_JSON: reference,
  };
}

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-wf-"));
  const file = path.join(dir, "store.json");
  const store = createLocalAdapter(file, env(), () => now);
  return { dir, store };
}

test("core rule: worker creates request, Admin approves, worker completes approved operation into stock", async () => {
  const { dir, store } = setup();
  try {
    // 1. Authenticate owner and seed worker & staff (using 'staff' alias to verify normalization)
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    const addWorker = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "worker-pass-1",
    });
    assert.equal(addWorker.error, undefined);

    const addStaff = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Charlie Staff",
      email: "manager@example.com",
      role: "staff",
      password: "manager-pass-1",
    });
    assert.equal(addStaff.error, undefined);

    // Verify customer/management/data-entry roles cannot be added
    const invalidRoleAdd = await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Legacy Customer",
      email: "customer@example.com",
      role: "customer",
      company: "Meridian Packaging",
      password: "cust-pass-1",
    });
    assert.match(invalidRoleAdd.error ?? "", /Choose Admin \(owner\), Staff \(manager\), or Worker \(worker\)/);

    const snap1 = await store.snapshot();
    const workerUser = snap1.users.find((u) => u.email === "worker@example.com");
    const managerUser = snap1.users.find((u) => u.email === "manager@example.com");
    assert.ok(workerUser && managerUser);
    assert.equal(managerUser.role, "manager");

    // Sign in as Staff (manager) and Worker (Bremen)
    const managerAuth = await store.signIn("manager@example.com", "manager-pass-1");
    assert.equal(managerAuth.ok, true);
    if (!managerAuth.ok) return;

    const workerAuth = await store.signIn("worker@example.com", "worker-pass-1");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    // 2. Admin cannot create shipments; Staff registers the inbound shipment
    const adminInboundBlocked = await store.run(ownerAuth.value.sessionId, "addInbound", {
      number: "IN-2026-001",
      po: "PO-777",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.match(adminInboundBlocked.error ?? "", /Only Staff or an assigned Worker can create a shipment/);

    const inbound = await store.run(managerAuth.value.sessionId, "addInbound", {
      number: "IN-2026-001",
      po: "PO-777",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.equal(inbound.error, undefined);

    // 4. Worker adds material section -> creates submitted request REQ-2026-0001
    const materialAdded = await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-2026-001",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 125,
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.equal(materialAdded.error, undefined);
    assert.match(materialAdded.notice ?? "", /REQ-2026-0001/);
    assert.match(materialAdded.notice ?? "", /Stock was not changed/);

    // Verify stock is still empty
    const snap2 = await store.snapshot();
    const req1 = snap2.requests.find((r) => r.number === "REQ-2026-0001");
    assert.ok(req1);
    assert.equal(req1.status, "submitted");
    assert.equal(snap2.stockMovements.length, 0);
    assert.equal(snap2.stockBalances.length, 0);

    // Staff and Admin cannot edit request lines directly
    const managerEditBlocked = await store.run(managerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-2026-001",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 200,
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.match(managerEditBlocked.error ?? "", /Managers are read-only/);

    const adminEditReqLinesBlocked = await store.run(ownerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-2026-001",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 200,
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.match(adminEditReqLinesBlocked.error ?? "", /This role cannot add a material section/);

    // Neither Staff nor Admin can delete Worker requests
    const staffDeleteReqBlocked = await store.run(managerAuth.value.sessionId, "deleteRequest", {
      requestId: req1.id,
    });
    assert.match(staffDeleteReqBlocked.error ?? "", /Staff cannot delete or cancel requests/);

    const adminDeleteReqBlocked = await store.run(ownerAuth.value.sessionId, "deleteRequest", {
      requestId: req1.id,
    });
    assert.match(adminDeleteReqBlocked.error ?? "", /Admin cannot delete operational records/);

    // Staff cannot approve or reject Worker requests
    const staffApproveBlocked = await store.run(managerAuth.value.sessionId, "approveRequest", {
      requestId: req1.id,
    });
    assert.match(staffApproveBlocked.error ?? "", /Only the owner can approve a request/);

    // Worker cannot approve own request
    const workerApproveBlocked = await store.run(workerAuth.value.sessionId, "approveRequest", {
      requestId: req1.id,
    });
    assert.match(workerApproveBlocked.error ?? "", /Only the owner can approve a request/);

    // Worker cannot complete request before Admin approval
    const prematureComplete = await store.run(workerAuth.value.sessionId, "completeRequest", {
      requestId: req1.id,
    });
    assert.match(prematureComplete.error ?? "", /Admin approves the request/);

    // Direct modification of responsible Worker is blocked for Staff and Admin
    const staffAssignBlocked = await store.run(managerAuth.value.sessionId, "assignWorker", {
      requestId: req1.id,
      workerId: workerUser.id,
    });
    assert.match(staffAssignBlocked.error ?? "", /Direct modification of request worker assignment is not permitted/);

    const adminAssignBlocked = await store.run(ownerAuth.value.sessionId, "assignWorker", {
      requestId: req1.id,
      workerId: workerUser.id,
    });
    assert.match(adminAssignBlocked.error ?? "", /Direct modification of request worker assignment is not permitted/);

    // 6. Worker realizes a mistake and soft-deletes request to fix it
    const deleteResult = await store.run(workerAuth.value.sessionId, "deleteRequest", {
      requestId: req1.id,
    });
    assert.equal(deleteResult.error, undefined);

    const snap3 = await store.snapshot();
    const req1Deleted = snap3.requests.find((r) => r.id === req1.id);
    assert.equal(req1Deleted?.status, "deleted");
    assert.equal(req1Deleted?.deletedBy, workerUser.id);
    assert.ok(snap3.auditLog.some((a) => a.action === "request-deleted"));

    // 7. Worker creates fresh request REQ-2026-0002 with correct figures
    const correctMaterial = await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-2026-001",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 225, // net = 225 - 25 = 200 kg
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.equal(correctMaterial.error, undefined);
    assert.match(correctMaterial.notice ?? "", /REQ-2026-0002/);

    const snap4 = await store.snapshot();
    const req2 = snap4.requests.find((r) => r.number === "REQ-2026-0002");
    assert.ok(req2);
    assert.equal(req2.status, "submitted");
    assert.equal(snap4.stockBalances.length, 0);

    // 8. Admin approves the request
    const approveResult = await store.run(ownerAuth.value.sessionId, "approveRequest", {
      requestId: req2.id,
    });
    assert.equal(approveResult.error, undefined);

    const snap5 = await store.snapshot();
    const req2Approved = snap5.requests.find((r) => r.id === req2.id);
    assert.equal(req2Approved?.status, "approved");
    assert.equal(req2Approved?.approvedBy, ownerAuth.value.profile.id);
    assert.equal(snap5.stockMovements.length, 0);
    assert.equal(snap5.stockBalances.length, 0);

    // 9. Editing material lines is rejected once request is approved
    const editApprovedBlocked = await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-2026-001",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 300,
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.match(editApprovedBlocked.error ?? "", /never edited in place once approved/);

    // Neither Staff nor Admin can complete approved request (only the assigned Worker can complete operations)
    const staffCompleteBlocked = await store.run(managerAuth.value.sessionId, "completeRequest", {
      requestId: req2.id,
    });
    assert.match(staffCompleteBlocked.error ?? "", /Only the assigned warehouse worker can complete/);

    const adminCompleteBlocked = await store.run(ownerAuth.value.sessionId, "completeRequest", {
      requestId: req2.id,
    });
    assert.match(adminCompleteBlocked.error ?? "", /Only the assigned warehouse worker can complete/);

    // 10. Worker completes approved operation -> posts to stock!
    const completeResult = await store.run(workerAuth.value.sessionId, "completeRequest", {
      requestId: req2.id,
    });
    assert.equal(completeResult.error, undefined);

    const snap6 = await store.snapshot();
    const req2Completed = snap6.requests.find((r) => r.id === req2.id);
    assert.equal(req2Completed?.status, "completed");
    assert.equal(req2Completed?.enteredBy, workerUser.id);
    assert.equal(snap6.stockMovements.length, 1);
    assert.equal(snap6.stockMovements[0]?.weightKg, 200);
    assert.equal(snap6.stockMovements[0]?.direction, "in");
    assert.equal(snap6.stockBalances[0]?.weightKg, 200);

    // 11. Idempotency: repeating completeRequest leaves movements and balances identical
    const repeatComplete = await store.run(workerAuth.value.sessionId, "completeRequest", {
      requestId: req2.id,
    });
    assert.equal(repeatComplete.error, undefined);

    const snap7 = await store.snapshot();
    assert.equal(snap7.stockMovements.length, 1);
    assert.equal(snap7.stockBalances[0]?.weightKg, 200);

    // 12. Completed requests cannot be deleted
    const deleteCompletedBlocked = await store.run(workerAuth.value.sessionId, "deleteRequest", {
      requestId: req2.id,
    });
    assert.match(deleteCompletedBlocked.error ?? "", /completed request cannot be deleted/);

    // 12b. Staff creates and edits PO/SO records (including after approval/start); Admin can approve/reject PO/SO but cannot create, edit, or delete PO/SO
    const adminCreatePoBlocked = await store.run(ownerAuth.value.sessionId, "createPurchase", {
      number: "PO-ADMIN-BLOCKED",
      supplier: "North Mill",
      material: "LDPE film",
      quantityKg: 1000,
      valueEur: 500,
    });
    assert.match(adminCreatePoBlocked.error ?? "", /Only Staff can create a PO\/SO order/);

    const staffCreatePo = await store.run(managerAuth.value.sessionId, "createPurchase", {
      number: "PO-STAFF-100",
      supplier: "North Mill",
      material: "LDPE film",
      quantityKg: 1000,
      valueEur: 500,
    });
    assert.equal(staffCreatePo.error, undefined);

    // Admin approves PO-STAFF-100
    const adminApprovePo = await store.run(ownerAuth.value.sessionId, "approve", {
      number: "PO-STAFF-100",
    });
    assert.equal(adminApprovePo.error, undefined);

    // Admin cannot edit PO-STAFF-100
    const adminEditPoBlocked = await store.run(ownerAuth.value.sessionId, "editPurchase", {
      number: "PO-STAFF-100",
      supplier: "North Mill",
      material: "LDPE film",
      quantityKg: 1500,
      valueEur: 750,
    });
    assert.match(adminEditPoBlocked.error ?? "", /Only Staff can edit a PO\/SO order/);

    // Staff edits PO-STAFF-100 after approval and while operations are running
    const staffEditApprovedPo = await store.run(managerAuth.value.sessionId, "editPurchase", {
      number: "PO-STAFF-100",
      supplier: "North Mill",
      material: "LDPE film",
      quantityKg: 1250,
      valueEur: 625,
      notes: "Updated transport and material quantity after unloading started",
    });
    assert.equal(staffEditApprovedPo.error, undefined);
    const snapPo = await store.snapshot();
    const updatedPo = snapPo.purchaseOrders.find((p) => p.number === "PO-STAFF-100");
    assert.equal(updatedPo?.valueEur, 625);
    assert.equal(updatedPo?.notes, "Updated transport and material quantity after unloading started");

    // Operational PO/SO records cannot be deleted by Staff or Admin
    const staffDeletePoBlocked = await store.run(managerAuth.value.sessionId, "deletePurchase", {
      number: "PO-STAFF-100",
    });
    assert.match(staffDeletePoBlocked.error ?? "", /Operational PO\/SO records cannot be deleted/);

    const adminDeletePoBlocked = await store.run(ownerAuth.value.sessionId, "deletePurchase", {
      number: "PO-STAFF-100",
    });
    assert.match(adminDeletePoBlocked.error ?? "", /Operational PO\/SO records cannot be deleted/);

    // 12c. Worker can delete a declined request
    const inbound2 = await store.run(workerAuth.value.sessionId, "addInbound", {
      number: "IN-2026-002",
      po: "PO-778",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.equal(inbound2.error, undefined);

    const createReq3 = await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-2026-002",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 125,
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.equal(createReq3.error, undefined);
    const snap7b = await store.snapshot();
    const req3 = snap7b.requests.find((r) => r.number === "REQ-2026-0003")!;
    const declineResult = await store.run(ownerAuth.value.sessionId, "declineRequest", {
      requestId: req3.id,
      reason: "Incorrect packaging tare selected",
    });
    assert.equal(declineResult.error, undefined);
    const deleteDeclined = await store.run(workerAuth.value.sessionId, "deleteRequest", {
      requestId: req3.id,
    });
    assert.equal(deleteDeclined.error, undefined);
    const snap7c = await store.snapshot();
    assert.equal(snap7c.requests.find((r) => r.id === req3.id)?.status, "deleted");

    // 13. Direct stock transfers and stock adjustments are denied for Admin, Staff, and Worker
    const mat = snap7.materials[0];
    const bremen = snap7.warehouses.find((w) => w.name === "Bremen")!;
    const turnhout = snap7.warehouses.find((w) => w.name === "Turnhout")!;
    assert.ok(mat && bremen && turnhout);

    for (const session of [ownerAuth.value.sessionId, managerAuth.value.sessionId, workerAuth.value.sessionId]) {
      const transferBlocked = await store.run(session, "transferStock", {
        fromWarehouseId: bremen.id,
        toWarehouseId: turnhout.id,
        materialId: mat.id,
        weightKg: 25,
      });
      assert.match(transferBlocked.error ?? "", /This role cannot transfer stock/);

      const correctionBlocked = await store.run(session, "postCorrection", {
        requestId: req2.id,
        materialId: mat.id,
        deltaKg: 10,
        reason: "Direct stock adjustment attempt",
      });
      assert.match(correctionBlocked.error ?? "", /This role cannot post a stock adjustment/);
    }

    // 14. Consistency check: balance must strictly equal the sum of movements
    const consistency = await store.services().inventory.checkConsistency(ownerAuth.value.profile.id);
    assert.equal(consistency.ok, true);
    assert.equal(consistency.mismatches.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("phase 4 concurrency: simultaneous completions with Promise.all never double-post stock", async () => {
  const { dir, store } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Bremen Worker",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "worker-pass-1",
    });
    const workerAuth = await store.signIn("worker@example.com", "worker-pass-1");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    // Create shipment and material line as Worker
    const snap = await store.snapshot();
    await store.run(workerAuth.value.sessionId, "addInbound", {
      number: "IN-CONCURRENCY-1",
      po: "PO-CONC",
      supplier: "North Mill",
      warehouse: "Bremen",
    });

    await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-CONCURRENCY-1",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 100,
      packagingId: snap.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });

    const snap1 = await store.snapshot();
    const request = snap1.requests.find((r) => r.containerNumber === "IN-CONCURRENCY-1" || r.shipmentId === snap1.shipments[0]?.id);
    assert.ok(request);

    // Owner approves
    await store.services().requests.approve({ requestId: request.id, actorId: ownerAuth.value.profile.id });

    // Concurrent completions by assigned Worker using Promise.all
    const [res1, res2] = await Promise.all([
      store.services().requests.complete({ requestId: request.id, actorId: workerAuth.value.profile.id }),
      store.services().requests.complete({ requestId: request.id, actorId: workerAuth.value.profile.id }),
    ]);

    assert.equal(res1.ok, true);
    assert.equal(res2.ok, true);

    const finalSnap = await store.snapshot();
    // Net weight is 75 kg (100 - 25)
    assert.equal(finalSnap.stockMovements.length, 1);
    assert.equal(finalSnap.stockMovements[0]?.weightKg, 75);
    assert.equal(finalSnap.stockBalances[0]?.weightKg, 75);

    // Consistency check passes
    const consistency = await store.services().inventory.checkConsistency(ownerAuth.value.profile.id);
    assert.equal(consistency.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Stage 1 & 2 security: unauthenticated view isolation, session logout/deactivation, and Worker cross-warehouse command isolation", async () => {
  const { dir, store } = setup();
  try {
    // 1. Unauthenticated view(null) returns emptyWorkspace() and never exposes accounts or operational records
    const unauthView = await store.view(null);
    assert.equal(unauthView.actor, null);
    assert.equal(unauthView.state.accounts.length, 0);
    assert.equal(unauthView.state.orders.length, 0);
    assert.equal(unauthView.state.containers.length, 0);
    assert.equal(unauthView.state.stock.length, 0);

    // 2. Unauthenticated command execution is rejected
    const unauthRun = await store.run(null, "createPurchase", {
      number: "PO-UNAUTH",
      supplier: "North Mill",
      material: "LDPE film",
      quantityKg: 100,
      valueEur: 50,
    });
    assert.match(unauthRun.error ?? "", /Sign in again/);

    // 3. Sign in as Admin and create Bremen Worker, Turnhout shipment, and Staff
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Bremen Worker",
      email: "bremen@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "bremen-pass-1",
    });

    await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Staff Member",
      email: "staff@example.com",
      role: "staff",
      password: "staff-pass-1",
    });

    const bremenAuth = await store.signIn("bremen@example.com", "bremen-pass-1");
    assert.equal(bremenAuth.ok, true);
    if (!bremenAuth.ok) return;

    const staffAuth = await store.signIn("staff@example.com", "staff-pass-1");
    assert.equal(staffAuth.ok, true);
    if (!staffAuth.ok) return;

    await store.run(staffAuth.value.sessionId, "addInbound", {
      number: "IN-TURNHOUT-1",
      po: "PO-TURN-1",
      supplier: "North Mill",
      warehouse: "Turnhout",
    });

    await store.run(staffAuth.value.sessionId, "addOutbound", {
      number: "OUT-TURNHOUT-1",
      po: "SO-TURN-1",
      customer: "Meridian Packaging",
      warehouse: "Turnhout",
      container: "CONT-T1",
    });

    // 4. Worker assigned to Bremen is blocked from creating/editing/operating Turnhout shipments
    const crossAddInbound = await store.run(bremenAuth.value.sessionId, "addInbound", {
      number: "IN-TURNHOUT-2",
      po: "PO-TURN-2",
      supplier: "North Mill",
      warehouse: "Turnhout",
    });
    assert.match(crossAddInbound.error ?? "", /assigned warehouse/);

    const crossSaveMeta = await store.run(bremenAuth.value.sessionId, "saveMeta", {
      number: "IN-TURNHOUT-1",
      direction: "inbound",
      container: "CNTR-HACK",
      po: "PO-TURN-1",
    });
    assert.match(crossSaveMeta.error ?? "", /your warehouse/);

    const crossSaveCarrier = await store.run(bremenAuth.value.sessionId, "saveCarrier", {
      number: "OUT-TURNHOUT-1",
      carrier: "Unauthorized Carrier",
    });
    assert.match(crossSaveCarrier.error ?? "", /your warehouse/);

    const crossSaveCmr = await store.run(bremenAuth.value.sessionId, "saveCmr", {
      shipment: "IN-TURNHOUT-1",
      direction: "inbound",
      reference: "CMR-999",
      goodsDescription: "LDPE",
    });
    assert.match(crossSaveCmr.error ?? "", /your warehouse/);

    const crossAddAnnex = await store.run(bremenAuth.value.sessionId, "addAnnex", {
      shipment: "IN-TURNHOUT-1",
      direction: "inbound",
      reference: "ANNEX-999",
      name: "annex.pdf",
      bytesBase64: Buffer.from("%PDF-1.4 test").toString("base64"),
    });
    assert.match(crossAddAnnex.error ?? "", /your warehouse/);

    const crossCreateReq = await store.run(bremenAuth.value.sessionId, "createRequest", {
      shipment: "IN-TURNHOUT-1",
      direction: "inbound",
    });
    assert.match(crossCreateReq.error ?? "", /assigned warehouse/);

    // 5. Staff and Admin are blocked from submitting Worker loading/unloading requests
    const staffCreateReq = await store.run(staffAuth.value.sessionId, "createRequest", {
      shipment: "IN-TURNHOUT-1",
      direction: "inbound",
    });
    assert.match(staffCreateReq.error ?? "", /Only a Worker can submit/);

    const adminCreateReq = await store.run(ownerAuth.value.sessionId, "createRequest", {
      shipment: "IN-TURNHOUT-1",
      direction: "inbound",
    });
    assert.match(adminCreateReq.error ?? "", /Only a Worker can submit/);

    const staffPackagingBlocked = await store.run(staffAuth.value.sessionId, "addPackagingType", {
      label: "Custom Box",
      tareKg: 10,
    });
    assert.match(staffPackagingBlocked.error ?? "", /Only the owner can add a packaging type/);

    const workerPackagingBlocked = await store.run(bremenAuth.value.sessionId, "addPackagingType", {
      label: "Custom Box",
      tareKg: 10,
    });
    assert.match(workerPackagingBlocked.error ?? "", /Only the owner can add a packaging type/);

    // Admin can add custom packaging type
    const adminPackagingOk = await store.run(ownerAuth.value.sessionId, "addPackagingType", {
      label: "Heavy Steel Crate",
      tareKg: 85,
    });
    assert.equal(adminPackagingOk.error, undefined);

    // 6. Session termination on signOut and user deactivation
    await store.signOut(staffAuth.value.sessionId);
    const afterLogoutView = await store.view(staffAuth.value.sessionId);
    assert.equal(afterLogoutView.actor, null);
    assert.equal(afterLogoutView.state.accounts.length, 0);

    // Deactivate Bremen worker -> active session immediately invalidated
    const deactivated = await store.services().users.deactivate({
      email: "bremen@example.com",
      actorId: ownerAuth.value.profile.id,
    });
    assert.equal(deactivated.ok, true);
    const afterDeactivateRun = await store.run(bremenAuth.value.sessionId, "addInbound", {
      number: "IN-BREMEN-9",
      po: "PO-9",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.match(afterDeactivateRun.error ?? "", /Sign in again/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Stage 3 & 4 data integrity: multi-line outbound partial failure rollback and duplicate completion idempotency", async () => {
  const { dir, store } = setup();
  try {
    const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerAuth.ok, true);
    if (!ownerAuth.ok) return;

    await store.run(ownerAuth.value.sessionId, "addUser", {
      name: "Bremen Worker",
      email: "bremen@example.com",
      role: "worker",
      warehouse: "Bremen",
      password: "bremen-pass-1",
    });
    const workerAuth = await store.signIn("bremen@example.com", "bremen-pass-1");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    const snap0 = await store.snapshot();
    const palletId = snap0.packagingTypes[0]!.id; // Normal Pallet = 25 kg tare

    // 1. Seed 100 kg of LDPE film into Bremen via an approved & completed inbound request
    await store.run(workerAuth.value.sessionId, "addInbound", {
      number: "IN-SEED-100",
      po: "PO-SEED-100",
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "IN-SEED-100",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 125, // net = 100 kg
      packagingId: palletId,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    const seedReq = (await store.snapshot()).requests[0]!;
    await store.run(ownerAuth.value.sessionId, "approveRequest", { requestId: seedReq.id });
    await store.run(workerAuth.value.sessionId, "completeRequest", { requestId: seedReq.id });

    assert.equal((await store.snapshot()).stockBalances[0]?.weightKg, 100);

    // 2. Create an outbound loading shipment with TWO lines of LDPE film:
    //    Line 1: net 60 kg (gross 85 - 25 tare) -> individually <= 100 kg
    //    Line 2: net 60 kg (gross 85 - 25 tare) -> individually <= 100 kg, but combined = 120 kg > 100 kg!
    await store.run(workerAuth.value.sessionId, "addOutbound", {
      number: "OUT-MULTI-FAIL",
      po: "SO-MULTI-1",
      customer: "Meridian Packaging",
      warehouse: "Bremen",
      container: "CONT-MULTI-1",
    });
    await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "OUT-MULTI-FAIL",
      direction: "outbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 85, // net = 60 kg
      packagingId: palletId,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "OUT-MULTI-FAIL",
      direction: "outbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 85, // net = 60 kg
      packagingId: palletId,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });

    const outReq = (await store.snapshot()).requests.find((r) => r.type === "loading")!;
    assert.ok(outReq);
    await store.run(ownerAuth.value.sessionId, "approveRequest", { requestId: outReq.id });

    // 3. Attempt to complete the 120 kg outbound request against 100 kg stock:
    //    Must fail AND must NOT deduct Line 1's 60 kg!
    const failedComplete = await store.run(workerAuth.value.sessionId, "completeRequest", {
      requestId: outReq.id,
    });
    assert.match(failedComplete.error ?? "", /make stock negative/);

    const snapAfterFail = await store.snapshot();
    assert.equal(snapAfterFail.stockBalances[0]?.weightKg, 100);
    assert.equal(snapAfterFail.stockMovements.length, 1); // Only the initial seed movement exists!
    assert.equal(snapAfterFail.requests.find((r) => r.id === outReq.id)?.status, "approved");

    const consistency1 = await store.services().inventory.checkConsistency(ownerAuth.value.profile.id);
    assert.equal(consistency1.ok, true);

    // 4. Now test valid outbound loading request (net 40 kg) -> deducts to 60 kg
    await store.run(workerAuth.value.sessionId, "addOutbound", {
      number: "OUT-VALID-40",
      po: "SO-VALID-40",
      customer: "Meridian Packaging",
      warehouse: "Bremen",
      container: "CONT-VALID-40",
    });
    await store.run(workerAuth.value.sessionId, "saveMaterial", {
      shipment: "OUT-VALID-40",
      direction: "outbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 65, // net = 40 kg
      packagingId: palletId,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    const validOutReq = (await store.snapshot()).requests.find((r) => r.id !== outReq.id && r.type === "loading")!;
    await store.run(ownerAuth.value.sessionId, "approveRequest", { requestId: validOutReq.id });
    const completedOut = await store.run(workerAuth.value.sessionId, "completeRequest", { requestId: validOutReq.id });
    assert.equal(completedOut.error, undefined);

    const snapAfterOut = await store.snapshot();
    const bremenWh = snapAfterOut.warehouses.find((w) => w.name === "Bremen")!;
    assert.equal(snapAfterOut.stockBalances.find((b) => b.warehouseId === bremenWh.id)?.weightKg, 60);

    // 5. Verify UI `transfer` command is blocked for Admin and Worker
    const adminTransferBlocked = await store.run(ownerAuth.value.sessionId, "transfer", {
      clientKey: "tx-unique-key-1",
      from: "Bremen",
      to: "Spain",
      material: "LDPE film",
      quantity: 25,
    });
    assert.match(adminTransferBlocked.error ?? "", /This role cannot transfer stock/);

    const consistency2 = await store.services().inventory.checkConsistency(ownerAuth.value.profile.id);
    assert.equal(consistency2.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
