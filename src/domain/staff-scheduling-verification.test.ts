import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import { canAccess, canPerform } from "../lib/permissions.ts";
import { navSections } from "../lib/navigation.ts";

const now = "2026-11-20T12:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
  ],
  companies: [
    { name: "Apex Polymers Ltd", kind: "customer" },
    { name: "Global Resin Supplies", kind: "supplier" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE Pellets", unit: "kg", lowStockThresholdKg: 25 },
    { materialNumber: "HDPE", description: "HDPE Granulate", unit: "kg", lowStockThresholdKg: 50 },
  ],
  packagingTypes: [{ name: "Standard Pallet", tareKg: 25 }],
});

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-scheduling-test-"));
  const file = path.join(dir, "store.json");
  return {
    dir,
    store: createLocalAdapter(
      file,
      {
        NODE_ENV: "test",
        STOCKFLOW_OWNER_EMAIL: "admin@stockflow.test",
        STOCKFLOW_OWNER_NAME: "Alex Admin",
        STOCKFLOW_OWNER_PASSWORD: "admin-pass-1",
        STOCKFLOW_REFERENCE_JSON: reference,
      },
      () => now
    ),
  };
}

test("1. Role Boundaries: Navigation & Permissions for Staff, Worker, and Admin", () => {
  // Staff (manager) should NOT see Requests in navigation
  const staffLinks = navSections
    .flatMap((section) => section.items)
    .filter((item) => item.roles.includes("manager"))
    .map((item) => item.label);

  assert.ok(
    !staffLinks.includes("Requests"),
    "Staff navigation must not contain Requests"
  );
  assert.ok(
    !staffLinks.includes("All Requests"),
    "Staff navigation must not contain All Requests"
  );

  // Staff MUST see Unloading Schedules, Loading Schedules, and Verification
  assert.ok(
    staffLinks.includes("Unloading Schedule"),
    "Staff navigation must contain Unloading Schedule"
  );
  assert.ok(
    staffLinks.includes("Loading Schedule"),
    "Staff navigation must contain Loading Schedule"
  );
  assert.ok(
    staffLinks.includes("Pending Verification"),
    "Staff navigation must contain Pending Verification"
  );

  // Permission checks
  assert.equal(canAccess("manager", "/schedules/unloading"), true);
  assert.equal(canAccess("manager", "/schedules/loading"), true);
  assert.equal(canAccess("manager", "/verification"), true);
  assert.equal(canPerform("manager", "create-schedule"), true);
  assert.equal(canPerform("manager", "verify-schedule"), true);

  // Worker permissions: Worker CANNOT verify schedules
  assert.equal(canPerform("worker", "verify-schedule"), false);
  assert.equal(canPerform("worker", "start-schedule"), true);
  assert.equal(canPerform("worker", "submit-schedule"), true);
});

test("2. Staff Direct Schedule Creation (PO Unloading & SO Loading) without Admin Approval", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const token = adminSign.value.sessionId;

    // Create active warehouse worker
    await store.run(token, "addUser", {
      name: "John Warehouse",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const supplierId = snap.companies.find((c) => c.kind === "supplier")?.id || "comp-supplier";
    const customerId = snap.companies.find((c) => c.kind === "customer")?.id || "comp-customer";
    const materialId = snap.materials[0]?.id || "mat-ldpe";
    const worker = snap.users.find((u) => u.email === "worker@stockflow.test");
    assert.ok(worker, "Worker must exist");

    // 1. Staff creates Unloading Schedule directly with PO details & material items
    const runUnloading = await store.run(token, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-2026-0042",
      partnerName: "Global Resin Supplies",
      companyId: supplierId,
      warehouseId: warehouseId,
      origin: "Rotterdam Port",
      destination: "Bornem Depot Dock A",
      annex7Required: true,
      transportPrice: 650,
      currency: "EUR",
      pickupDate: "2026-11-22",
      purchaserName: "Elena Staff",
      purchasingPrice: 24500,
      scheduledDate: "2026-11-25",
      assignedWorkerId: worker.id,
      instructions: "Inspect seal before opening. Verify 20 big bags.",
      items: [
        {
          materialId,
          materialName: "LDPE Pellets Grade A",
          packagingType: "Big Bag",
          packageCount: 20,
          tareWeightKg: 2.5,
          grossWeightKg: 20050,
          netWeightKg: 20000,
        },
      ],
    });

    assert.equal(runUnloading.error, undefined, "Creating unloading schedule should not error");
    const unloadingSchedule = runUnloading.state.schedules.find((s) => s.poSoNumber === "PO-2026-0042");
    assert.ok(unloadingSchedule, "Schedule should be found in workspace state");
    assert.ok(unloadingSchedule.scheduleNumber.startsWith("SCH-UNL-"), "Schedule number starts with SCH-UNL-");
    assert.equal(unloadingSchedule.status, "scheduled", "Status is immediately scheduled without admin approval");
    assert.equal(unloadingSchedule.totalGrossWeightKg, 20050);
    assert.equal(unloadingSchedule.totalTareWeightKg, 50); // 20 * 2.5
    assert.equal(unloadingSchedule.totalNetWeightKg, 20000);

    // 2. Staff creates Loading Schedule directly with SO details & material items
    const runLoading = await store.run(token, "createOperationSchedule", {
      type: "loading",
      poSoNumber: "SO-2026-0088",
      partnerName: "Apex Polymers Ltd",
      companyId: customerId,
      warehouseId: warehouseId,
      origin: "Bornem Depot Dock B",
      destination: "Antwerp Production Facility",
      annex7Required: false,
      transportPrice: 400,
      currency: "EUR",
      sellerName: "Elena Staff",
      sellingPrice: 31000,
      scheduledDate: "2026-11-26",
      assignedWorkerId: worker.id,
      instructions: "Pallet wrap mandatory.",
      items: [
        {
          materialId,
          materialName: "HDPE Granulate",
          packagingType: "Pallet",
          packageCount: 10,
          tareWeightKg: 25,
          grossWeightKg: 10250,
          netWeightKg: 10000,
        },
      ],
    });

    assert.equal(runLoading.error, undefined, "Creating loading schedule should not error");
    const loadingSchedule = runLoading.state.schedules.find((s) => s.poSoNumber === "SO-2026-0088");
    assert.ok(loadingSchedule, "Loading schedule should be found in workspace state");
    assert.ok(loadingSchedule.scheduleNumber.startsWith("SCH-LOD-"), "Schedule number starts with SCH-LOD-");
    assert.equal(loadingSchedule.status, "scheduled");
    assert.equal(loadingSchedule.totalGrossWeightKg, 10250);
    assert.equal(loadingSchedule.totalTareWeightKg, 250); // 10 * 25
    assert.equal(loadingSchedule.totalNetWeightKg, 10000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("3. Complete Worker Lifecycle: Start -> Save Draft -> Submit for Verification", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const token = adminSign.value.sessionId;

    await store.run(token, "addUser", {
      name: "John Warehouse",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const materialId = snap.materials[0]?.id || "mat-ldpe";
    const worker = snap.users.find((u) => u.email === "worker@stockflow.test");
    assert.ok(worker);

    // 1. Create schedule
    const createRes = await store.run(token, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-2026-0099",
      partnerName: "Global Resin Supplies",
      warehouseId,
      origin: "Rotterdam",
      destination: "Bornem",
      scheduledDate: "2026-11-20",
      assignedWorkerId: worker.id,
      items: [
        {
          materialId,
          materialName: "LDPE Pellets",
          packagingType: "Big Bag",
          packageCount: 10,
          tareWeightKg: 2,
          grossWeightKg: 10020,
          netWeightKg: 10000,
        },
      ],
    });
    const sched = createRes.state.schedules.find((s) => s.poSoNumber === "PO-2026-0099");
    assert.ok(sched, "Schedule must exist");
    const schedId = sched.id;

    // 2. Worker signs in
    const workerSign = await store.signIn("worker@stockflow.test", "worker-pass-1");
    assert.equal(workerSign.ok, true);
    if (!workerSign.ok) return;
    const workerToken = workerSign.value.sessionId;

    // 2. Worker starts operation
    const startRes = await store.run(workerToken, "startOperationSchedule", { scheduleId: schedId });
    assert.equal(startRes.error, undefined);
    let s = startRes.state.schedules.find((x) => x.id === schedId);
    assert.equal(s?.status, "in_progress", "Status should be in_progress");
    assert.ok(s?.actualStartTime, "Actual start time recorded");

    // 3. Worker records photo attachment
    const attachRes = await store.run(workerToken, "uploadScheduleAttachment", {
      scheduleId: schedId,
      name: "seal-photo.jpg",
      mime: "image/jpeg",
      url: "data:image/jpeg;base64,sample-bytes",
      size: 45000,
      kind: "seal",
    });
    assert.equal(attachRes.error, undefined);

    // 4. Worker saves draft
    const draftRes = await store.run(workerToken, "saveOperationDraft", {
      scheduleId: schedId,
      items: [
        {
          materialId,
          materialName: "LDPE Pellets",
          packagingType: "Big Bag",
          packageCount: 12,
          tareWeightKg: 2.5,
          grossWeightKg: 12030,
          netWeightKg: 12000,
        },
      ],
      workerRemarks: "Two extra big bags found in container.",
    });
    assert.equal(draftRes.error, undefined);
    s = draftRes.state.schedules.find((x) => x.id === schedId);
    assert.equal(s?.status, "draft", "Status is draft");
    assert.equal(s?.workerRemarks, "Two extra big bags found in container.");

    // 5. Worker submits for verification
    const submitRes = await store.run(workerToken, "submitOperationSchedule", {
      scheduleId: schedId,
      workerRemarks: "All 12 big bags unloaded and weighed on scale #2.",
    });
    assert.equal(submitRes.error, undefined);
    s = submitRes.state.schedules.find((x) => x.id === schedId);
    assert.equal(s?.status, "submitted", "Status should be submitted");
    assert.ok(s?.submittedAt, "Submitted at timestamp should be populated");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("4. Staff Verification: Return for Correction -> Resubmit Workflow", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const token = adminSign.value.sessionId;

    await store.run(token, "addUser", {
      name: "John Warehouse",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const materialId = snap.materials[0]?.id || "mat-ldpe";
    const worker = snap.users.find((u) => u.email === "worker@stockflow.test");
    assert.ok(worker);

    const createRes = await store.run(token, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-2026-CORR",
      partnerName: "Supplier Test",
      warehouseId,
      origin: "Origin",
      destination: "Destination",
      scheduledDate: "2026-11-20",
      assignedWorkerId: worker.id,
      items: [
        {
          materialId,
          materialName: "LDPE",
          packagingType: "Pallet",
          packageCount: 5,
          tareWeightKg: 20,
          grossWeightKg: 5100,
          netWeightKg: 5000,
        },
      ],
    });
    const sched = createRes.state.schedules.find((s) => s.poSoNumber === "PO-2026-CORR");
    assert.ok(sched);
    const schedId = sched.id;

    // Start & submit
    await store.run(token, "startOperationSchedule", { scheduleId: schedId });
    await store.run(token, "submitOperationSchedule", { scheduleId: schedId });

    // Staff returns for correction with mandatory reason
    const returnRes = await store.run(token, "verifyOperationSchedule", {
      scheduleId: schedId,
      action: "return",
      reason: "Please re-weigh pallet #3; tare weight seems incorrect.",
    });
    assert.equal(returnRes.error, undefined);
    let s = returnRes.state.schedules.find((x) => x.id === schedId);
    assert.equal(s?.status, "returned_for_correction");
    assert.equal(s?.returnReason, "Please re-weigh pallet #3; tare weight seems incorrect.");

    // Worker corrects and resubmits
    const resubmitRes = await store.run(token, "submitOperationSchedule", {
      scheduleId: schedId,
      items: [
        {
          materialId,
          materialName: "LDPE",
          packagingType: "Pallet",
          packageCount: 5,
          tareWeightKg: 25,
          grossWeightKg: 5125,
          netWeightKg: 5000,
        },
      ],
      workerRemarks: "Pallet #3 tare weight re-verified as 25kg standard pallet.",
    });
    assert.equal(resubmitRes.error, undefined);
    s = resubmitRes.state.schedules.find((x) => x.id === schedId);
    assert.equal(s?.status, "resubmitted");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("5. Staff Verification: Approve & Complete with Idempotent Stock Movement Posting", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const token = adminSign.value.sessionId;

    await store.run(token, "addUser", {
      name: "John Warehouse",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const materialId = snap.materials[0]?.id || "mat-ldpe";
    const worker = snap.users.find((u) => u.email === "worker@stockflow.test");
    assert.ok(worker);

    const createRes = await store.run(token, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-2026-COMPLETE",
      partnerName: "Supplier Real",
      warehouseId,
      origin: "Port",
      destination: "Depot",
      scheduledDate: "2026-11-20",
      assignedWorkerId: worker.id,
      items: [
        {
          materialId,
          materialName: "LDPE Pellets",
          packagingType: "Big Bag",
          packageCount: 10,
          tareWeightKg: 2,
          grossWeightKg: 10020,
          netWeightKg: 10000,
        },
      ],
    });
    const sched = createRes.state.schedules.find((s) => s.poSoNumber === "PO-2026-COMPLETE");
    assert.ok(sched);
    const schedId = sched.id;

    // Start & submit
    await store.run(token, "startOperationSchedule", { scheduleId: schedId });
    await store.run(token, "submitOperationSchedule", { scheduleId: schedId });

    // Initial stock balance
    const preMovements = (await store.snapshot()).stockMovements.filter((m) => m.scheduleId === schedId);
    assert.equal(preMovements.length, 0, "No movements before approval");

    // Staff approves and completes operation
    const approveRes = await store.run(token, "verifyOperationSchedule", {
      scheduleId: schedId,
      action: "approve",
      note: "Verified against scale slip.",
    });
    assert.equal(approveRes.error, undefined);
    const postSnap = await store.snapshot();
    const s = postSnap.operationSchedules.find((x) => x.id === schedId);
    assert.equal(s?.status, "completed", "Status is completed");
    assert.ok(s?.verifiedAt, "Verified at timestamp populated");

    // Check stock movements posted
    const postMovements = postSnap.stockMovements.filter((m) => m.scheduleId === schedId);
    assert.equal(postMovements.length, 1, "Exactly one stock movement posted");
    assert.equal(postMovements[0].direction, "in");
    assert.equal(postMovements[0].weightKg, 10000);

    // Idempotency check: approving a completed schedule does NOT create duplicate movements
    const approveAgainRes = await store.run(token, "verifyOperationSchedule", {
      scheduleId: schedId,
      action: "approve",
    });
    assert.equal(approveAgainRes.error, undefined);
    const postSnap2 = await store.snapshot();
    const postMovements2 = postSnap2.stockMovements.filter((m) => m.scheduleId === schedId);
    assert.equal(
      postMovements2.length,
      1,
      "Stock movements remain exactly 1 after duplicate approval (idempotent)"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("6. Loading Schedule (Outbound SO) Verification & Stock Balance Deduction", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const token = adminSign.value.sessionId;

    await store.run(token, "addUser", {
      name: "John Warehouse",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const materialId = snap.materials[0]?.id || "mat-ldpe";
    const worker = snap.users.find((u) => u.email === "worker@stockflow.test");
    assert.ok(worker);

    // Initial stock receipt so there is stock to dispatch
    const createUnload = await store.run(token, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-STOCK-INIT",
      partnerName: "Supplier Real",
      warehouseId,
      origin: "Port",
      destination: "Depot",
      scheduledDate: "2026-11-20",
      assignedWorkerId: worker.id,
      items: [
        {
          materialId,
          materialName: "LDPE Pellets",
          packagingType: "Big Bag",
          packageCount: 20,
          tareWeightKg: 2,
          grossWeightKg: 20040,
          netWeightKg: 20000,
        },
      ],
    });
    const unloadId = createUnload.state.schedules.find((s) => s.poSoNumber === "PO-STOCK-INIT")?.id;
    assert.ok(unloadId);
    await store.run(token, "startOperationSchedule", { scheduleId: unloadId });
    await store.run(token, "submitOperationSchedule", { scheduleId: unloadId });
    await store.run(token, "verifyOperationSchedule", { scheduleId: unloadId, action: "approve" });

    // Balance should now have 20000 kg
    const balanceBefore = (await store.snapshot()).stockBalances.find(
      (b) => b.warehouseId === warehouseId && b.materialId === materialId
    );
    assert.equal(balanceBefore?.weightKg, 20000, "Initial stock balance 20,000 kg");

    // Now create Loading Schedule for outbound dispatch
    const createLoad = await store.run(token, "createOperationSchedule", {
      type: "loading",
      poSoNumber: "SO-DISPATCH-01",
      partnerName: "Buyer Real",
      warehouseId,
      origin: "Depot",
      destination: "Client Factory",
      scheduledDate: "2026-11-21",
      assignedWorkerId: worker.id,
      items: [
        {
          materialId,
          materialName: "LDPE Pellets",
          packagingType: "Big Bag",
          packageCount: 8,
          tareWeightKg: 2,
          grossWeightKg: 8016,
          netWeightKg: 8000,
        },
      ],
    });
    const loadId = createLoad.state.schedules.find((s) => s.poSoNumber === "SO-DISPATCH-01")?.id;
    assert.ok(loadId);

    // Worker starts and submits loading operation
    await store.run(token, "startOperationSchedule", { scheduleId: loadId });
    await store.run(token, "submitOperationSchedule", { scheduleId: loadId });

    // Staff approves and completes loading schedule
    const approveLoad = await store.run(token, "verifyOperationSchedule", {
      scheduleId: loadId,
      action: "approve",
      note: "Loaded and dispatched successfully.",
    });
    assert.equal(approveLoad.error, undefined);

    const postLoadSnap = await store.snapshot();
    const loadSchedule = postLoadSnap.operationSchedules.find((s) => s.id === loadId);
    assert.equal(loadSchedule?.status, "completed");

    // Check outbound stock movement
    const loadMovement = postLoadSnap.stockMovements.find((m) => m.scheduleId === loadId);
    assert.ok(loadMovement, "Outbound movement must exist");
    assert.equal(loadMovement?.direction, "out", "Direction is out for loading");
    assert.equal(loadMovement?.weightKg, 8000, "Deducted 8,000 kg net");

    // Check balance after dispatch: 20000 - 8000 = 12000
    const balanceAfter = postLoadSnap.stockBalances.find(
      (b) => b.warehouseId === warehouseId && b.materialId === materialId
    );
    assert.equal(balanceAfter?.weightKg, 12000, "Balance reduced from 20,000 to 12,000 kg");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("7. Security Barrier: Worker Cannot Verify or Mark Completed", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const adminToken = adminSign.value.sessionId;

    await store.run(adminToken, "addUser", {
      name: "John Warehouse",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const materialId = snap.materials[0]?.id || "mat-ldpe";
    const worker = snap.users.find((u) => u.email === "worker@stockflow.test");
    assert.ok(worker);

    const createRes = await store.run(adminToken, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-SEC-01",
      partnerName: "Supplier Test",
      warehouseId,
      origin: "Origin",
      destination: "Destination",
      scheduledDate: "2026-11-20",
      assignedWorkerId: worker.id,
      items: [
        {
          materialId,
          materialName: "LDPE",
          packagingType: "Pallet",
          packageCount: 1,
          tareWeightKg: 20,
          grossWeightKg: 1020,
          netWeightKg: 1000,
        },
      ],
    });
    const schedId = createRes.state.schedules.find((s) => s.poSoNumber === "PO-SEC-01")?.id;
    assert.ok(schedId);

    // Worker signs in
    const workerSign = await store.signIn("worker@stockflow.test", "worker-pass-1");
    assert.equal(workerSign.ok, true);
    if (!workerSign.ok) return;
    const workerToken = workerSign.value.sessionId;

    // Worker attempts to verify / complete the operation directly
    const verifyAttempt = await store.run(workerToken, "verifyOperationSchedule", {
      scheduleId: schedId,
      action: "approve",
    });

    // Verification must be rejected because workers cannot verify operations
    assert.ok(
      verifyAttempt.error !== undefined,
      "Worker must NOT be permitted to verify or complete an operation"
    );
    assert.ok(
      verifyAttempt.error?.includes("Only Staff or Admin can verify operations"),
      `Expected permission error, got: ${verifyAttempt.error}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("8. Independent Verification: Complete Unloading Schedule Form (All Fields, Multi-Materials, Material-Wise Summary, All 6 Attachment Categories, Refresh & Re-Login Persistence)", async () => {
  const { dir, store } = createTestAdapter();
  const file = path.join(dir, "store.json");
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const adminToken = adminSign.value.sessionId;

    // Create Staff and Worker accounts
    await store.run(adminToken, "addUser", {
      name: "Elena Staff",
      email: "elena.staff@stockflow.test",
      role: "manager",
      warehouse: "Bornem",
      password: "staff-pass-1",
    });
    await store.run(adminToken, "addUser", {
      name: "John Warehouse",
      email: "john.worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const staffSign = await store.signIn("elena.staff@stockflow.test", "staff-pass-1");
    assert.equal(staffSign.ok, true);
    if (!staffSign.ok) return;
    const staffToken = staffSign.value.sessionId;

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const worker = snap.users.find((u) => u.email === "john.worker@stockflow.test");
    assert.ok(worker);

    // 1. Validate required field errors
    const missingPo = await store.run(staffToken, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "",
      partnerName: "Global Resin Supplies",
      warehouseId,
      scheduledDate: "2026-11-25",
      assignedWorkerId: worker.id,
    });
    assert.equal(missingPo.error, "PO Number is required.");

    const missingSupplier = await store.run(staffToken, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-2026-9001",
      partnerName: "",
      warehouseId,
      scheduledDate: "2026-11-25",
      assignedWorkerId: worker.id,
    });
    assert.equal(missingSupplier.error, "Supplier name is required.");

    // 2. Create Unloading Schedule with all Section A fields
    const createRes = await store.run(staffToken, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-2026-9001",
      partnerName: "Global Resin Supplies",
      purchaserName: "Elena Staff",
      purchasingPrice: 48200,
      currency: "EUR",
      origin: "Rotterdam Port Terminal 4",
      destination: "Bornem Depot Yard A",
      warehouseId,
      annex7Required: true,
      transportPrice: 850,
      pickupDate: "2026-11-23",
      scheduledDate: "2026-11-25",
      assignedWorkerId: worker.id,
      instructions: "Weigh all bags and pallets separately.",
      items: [
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Big Bag",
          packageCount: 10,
          tarePerPackageKg: 2.5,
          grossWeightKg: 10025,
          netWeightKg: 10000,
        },
      ],
    });
    assert.equal(createRes.error, undefined);
    const created = createRes.state.schedules.find((s) => s.poSoNumber === "PO-2026-9001");
    assert.ok(created);
    const scheduleId = created.id;

    // Verify all Section A fields
    assert.equal(created.poSoNumber, "PO-2026-9001");
    assert.equal(created.partnerName, "Global Resin Supplies");
    assert.equal(created.purchaserName, "Elena Staff");
    assert.equal(created.purchasingPrice, 48200);
    assert.equal(created.origin, "Rotterdam Port Terminal 4");
    assert.equal(created.destination, "Bornem Depot Yard A");
    assert.equal(created.warehouseName, "Bornem");
    assert.equal(created.annex7Required, true);
    assert.equal(created.transportPrice, 850);
    assert.equal(created.pickupDate, "2026-11-23");
    assert.equal(created.scheduledDate, "2026-11-25");
    assert.equal(created.assignedWorkerId, worker.id);

    // 3. Worker logs in, starts operation, enters multiple materials (including 2 entries of LDPE Pellets + 1 of HDPE Granulate)
    const workerSign = await store.signIn("john.worker@stockflow.test", "worker-pass-1");
    assert.equal(workerSign.ok, true);
    if (!workerSign.ok) return;
    const workerToken = workerSign.value.sessionId;

    await store.run(workerToken, "startOperationSchedule", { scheduleId });

    // Save draft with 3 material entries
    const draftRes = await store.run(workerToken, "saveOperationDraft", {
      scheduleId,
      workerRemarks: "Unloaded 2 lots of LDPE Pellets and 1 lot of HDPE Granulate. Packaging intact.",
      items: [
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Big Bag",
          packageCount: 10,
          tarePerPackageKg: 2.5,
          grossWeightKg: 10025,
          netWeightKg: 10000,
        },
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Standard Pallet",
          packageCount: 4,
          tarePerPackageKg: 25,
          grossWeightKg: 4100,
          netWeightKg: 4000,
        },
        {
          materialName: "HDPE Granulate",
          packagingTypeName: "Octabin",
          packageCount: 6,
          tarePerPackageKg: 18,
          grossWeightKg: 6108,
          netWeightKg: 6000,
        },
      ],
    });
    assert.equal(draftRes.error, undefined);

    // 4. Upload all 6 Unloading Attachment categories (photos + PDFs)
    const unloadingAttachments = [
      { name: "ldpe-material.jpg", kind: "material_photo", mime: "image/jpeg", url: "data:image/jpeg;base64,aGVsbG8=" },
      { name: "octabin-packaging.jpg", kind: "packaging_photo", mime: "image/jpeg", url: "data:image/jpeg;base64,aGVsbG8=" },
      { name: "weighbridge-slip-9001.pdf", kind: "weighbridge_ticket", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
      { name: "delivery-note-9001.pdf", kind: "delivery_document", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
      { name: "annex-vii-9001.pdf", kind: "annex_vii", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
      { name: "quality-cert.pdf", kind: "other", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
    ];
    for (const att of unloadingAttachments) {
      const up = await store.run(workerToken, "uploadScheduleAttachment", {
        scheduleId,
        ...att,
        size: 12040,
      });
      assert.equal(up.error, undefined);
    }

    // 5. Submit for verification
    const subRes = await store.run(workerToken, "submitOperationSchedule", { scheduleId });
    assert.equal(subRes.error, undefined);

    // 6. Verify calculations & Material-wise weight summary
    const submitted = subRes.state.schedules.find((s) => s.id === scheduleId);
    assert.ok(submitted);
    assert.equal(submitted.totalPackageCount, 20); // 10 + 4 + 6
    assert.equal(submitted.totalGrossWeightKg, 20233); // 10025 + 4100 + 6108
    assert.equal(submitted.totalTareWeightKg, 233); // 25 + 100 + 108
    assert.equal(submitted.totalNetWeightKg, 20000); // 10000 + 4000 + 6000
    assert.equal(submitted.materialSummary.length, 2, "3 rows grouped into 2 distinct Material Types");

    const ldpeSummary = submitted.materialSummary.find((m) => m.materialName === "LDPE Pellets");
    assert.ok(ldpeSummary);
    assert.equal(ldpeSummary.entryCount, 2);
    assert.equal(ldpeSummary.totalPackageCount, 14);
    assert.equal(ldpeSummary.totalGrossWeightKg, 14125);
    assert.equal(ldpeSummary.totalTareWeightKg, 125);
    assert.equal(ldpeSummary.totalNetWeightKg, 14000);

    const hdpeSummary = submitted.materialSummary.find((m) => m.materialName === "HDPE Granulate");
    assert.ok(hdpeSummary);
    assert.equal(hdpeSummary.entryCount, 1);
    assert.equal(hdpeSummary.totalPackageCount, 6);
    assert.equal(hdpeSummary.totalNetWeightKg, 6000);

    assert.equal(submitted.attachments.length, 6);

    // 7. Staff requests additional info, then approves & completes
    const infoRes = await store.run(staffToken, "verifyOperationSchedule", {
      scheduleId,
      action: "request_info",
      note: "Confirmed scale B calibration certificate.",
    });
    assert.equal(infoRes.error, undefined);
    assert.equal(
      infoRes.state.schedules.find((s) => s.id === scheduleId)?.infoRequestNote,
      "Confirmed scale B calibration certificate."
    );

    const approveRes = await store.run(staffToken, "verifyOperationSchedule", {
      scheduleId,
      action: "approve",
    });
    assert.equal(approveRes.error, undefined);

    // 8. Simulate app refresh and re-login on a brand new LocalAdapter instance reading from disk
    const reloadedAdapter = createLocalAdapter(
      file,
      {
        NODE_ENV: "test",
        STOCKFLOW_OWNER_EMAIL: "admin@stockflow.test",
        STOCKFLOW_OWNER_NAME: "Alex Admin",
        STOCKFLOW_OWNER_PASSWORD: "admin-pass-1",
        STOCKFLOW_REFERENCE_JSON: reference,
      },
      () => now
    );
    const reSign = await reloadedAdapter.signIn("elena.staff@stockflow.test", "staff-pass-1");
    assert.equal(reSign.ok, true);
    if (!reSign.ok) return;
    const viewed = await reloadedAdapter.view(reSign.value.sessionId);
    const persisted = viewed.state.schedules.find((s) => s.id === scheduleId);
    assert.ok(persisted, "Schedule persists after reload and re-login");
    assert.equal(persisted.status, "completed");
    assert.equal(persisted.items.length, 3);
    assert.equal(persisted.attachments.length, 6);
    assert.equal(persisted.totalNetWeightKg, 20000);
    assert.equal(persisted.workerRemarks, "Unloaded 2 lots of LDPE Pellets and 1 lot of HDPE Granulate. Packaging intact.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("9. Independent Verification: Complete Loading Schedule Form (All Fields, Vehicle/Driver/Timestamps/CMR, All 7 Attachment Categories, Outbound Inventory Deduction, Refresh & Re-Login Persistence)", async () => {
  const { dir, store } = createTestAdapter();
  const file = path.join(dir, "store.json");
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;
    const adminToken = adminSign.value.sessionId;

    await store.run(adminToken, "addUser", {
      name: "Elena Staff",
      email: "elena.staff@stockflow.test",
      role: "manager",
      warehouse: "Bornem",
      password: "staff-pass-1",
    });
    await store.run(adminToken, "addUser", {
      name: "John Warehouse",
      email: "john.worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const staffSign = await store.signIn("elena.staff@stockflow.test", "staff-pass-1");
    assert.equal(staffSign.ok, true);
    if (!staffSign.ok) return;
    const staffToken = staffSign.value.sessionId;

    const snap = await store.snapshot();
    const warehouseId = snap.warehouses[0]?.id || "wh-bornem";
    const worker = snap.users.find((u) => u.email === "john.worker@stockflow.test");
    assert.ok(worker);

    // Seed 25,000 kg LDPE Pellets in Bornem so we can test outbound deduction
    const seedRes = await store.run(staffToken, "createOperationSchedule", {
      type: "unloading",
      poSoNumber: "PO-SEED-STOCK",
      partnerName: "Global Resin Supplies",
      warehouseId,
      scheduledDate: "2026-11-20",
      assignedWorkerId: worker.id,
      items: [
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Big Bag",
          packageCount: 25,
          tarePerPackageKg: 2,
          grossWeightKg: 25050,
          netWeightKg: 25000,
        },
      ],
    });
    const seedId = seedRes.state.schedules.find((s) => s.poSoNumber === "PO-SEED-STOCK")?.id;
    assert.ok(seedId);
    await store.run(staffToken, "startOperationSchedule", { scheduleId: seedId });
    await store.run(staffToken, "submitOperationSchedule", { scheduleId: seedId });
    await store.run(staffToken, "verifyOperationSchedule", { scheduleId: seedId, action: "approve" });

    // 1. Create Loading Schedule with all Section A fields
    const createLoadRes = await store.run(staffToken, "createOperationSchedule", {
      type: "loading",
      poSoNumber: "SO-2026-7701",
      partnerName: "Apex Polymers Ltd",
      sellerName: "Marcus Sales",
      sellingPrice: 36500,
      currency: "EUR",
      warehouseId,
      origin: "Bornem Depot Dock 3",
      destination: "Apex Plant Eindhoven, NL",
      annex7Required: true,
      transportPrice: 620,
      scheduledDate: "2026-11-26",
      assignedWorkerId: worker.id,
      instructions: "Ensure trailer floor is swept clean before loading.",
      items: [
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Big Bag",
          packageCount: 15,
          tarePerPackageKg: 2,
          grossWeightKg: 15030,
          netWeightKg: 15000,
        },
      ],
    });
    assert.equal(createLoadRes.error, undefined);
    const loadingSched = createLoadRes.state.schedules.find((s) => s.poSoNumber === "SO-2026-7701");
    assert.ok(loadingSched);
    const loadId = loadingSched.id;

    // Verify Section A fields
    assert.equal(loadingSched.poSoNumber, "SO-2026-7701");
    assert.equal(loadingSched.partnerName, "Apex Polymers Ltd");
    assert.equal(loadingSched.sellerName, "Marcus Sales");
    assert.equal(loadingSched.sellingPrice, 36500);
    assert.equal(loadingSched.warehouseName, "Bornem");
    assert.equal(loadingSched.origin, "Bornem Depot Dock 3");
    assert.equal(loadingSched.destination, "Apex Plant Eindhoven, NL");
    assert.equal(loadingSched.annex7Required, true);
    assert.equal(loadingSched.transportPrice, 620);
    assert.equal(loadingSched.scheduledDate, "2026-11-26");
    assert.equal(loadingSched.assignedWorkerId, worker.id);

    // 2. Worker logs in, starts operation, records actual materials + Section C (Vehicle, Transport Company, Driver, Timestamps, CMR)
    const workerSign = await store.signIn("john.worker@stockflow.test", "worker-pass-1");
    assert.equal(workerSign.ok, true);
    if (!workerSign.ok) return;
    const workerToken = workerSign.value.sessionId;

    await store.run(workerToken, "startOperationSchedule", { scheduleId: loadId });

    const draftLoad = await store.run(workerToken, "saveOperationDraft", {
      scheduleId: loadId,
      vehicleRegistrationNumber: "1-TRK-889",
      transportCompany: "Van Derksen Logistics B.V.",
      driverName: "Hendrik De Vries",
      driverContactNumber: "+31 6 1234 5678",
      actualArrivalTime: "2026-11-26T08:15:00.000Z",
      actualStartTime: "2026-11-26T08:30:00.000Z",
      actualEndTime: "2026-11-26T09:45:00.000Z",
      cmrNumber: "CMR-NL-2026-99412",
      workerRemarks: "Loaded 15 big bags in two rows, strapped and sealed with seal #S-4491.",
      items: [
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Big Bag",
          packageCount: 10,
          tarePerPackageKg: 2,
          grossWeightKg: 10020,
          netWeightKg: 10000,
        },
        {
          materialName: "LDPE Pellets",
          packagingTypeName: "Big Bag",
          packageCount: 5,
          tarePerPackageKg: 2,
          grossWeightKg: 5010,
          netWeightKg: 5000,
        },
      ],
    });
    assert.equal(draftLoad.error, undefined);

    // 3. Upload all 7 Loading Attachment categories (photos + PDFs)
    const loadingAttachments = [
      { name: "empty-trailer-before.jpg", kind: "before_loading_photo", mime: "image/jpeg", url: "data:image/jpeg;base64,aGVsbG8=" },
      { name: "forklift-during-loading.jpg", kind: "during_loading_photo", mime: "image/jpeg", url: "data:image/jpeg;base64,aGVsbG8=" },
      { name: "loaded-strapped-vehicle.jpg", kind: "loaded_vehicle_photo", mime: "image/jpeg", url: "data:image/jpeg;base64,aGVsbG8=" },
      { name: "outbound-weighbridge.pdf", kind: "weighbridge_ticket", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
      { name: "signed-cmr-99412.pdf", kind: "cmr_document", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
      { name: "outbound-annex-vii.pdf", kind: "annex_vii", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
      { name: "packing-list-7701.pdf", kind: "other", mime: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" },
    ];
    for (const att of loadingAttachments) {
      const up = await store.run(workerToken, "uploadScheduleAttachment", {
        scheduleId: loadId,
        ...att,
        size: 15400,
      });
      assert.equal(up.error, undefined);
    }

    // 4. Worker submits for verification
    const submitLoad = await store.run(workerToken, "submitOperationSchedule", {
      scheduleId: loadId,
      actualEndTime: "2026-11-26T09:45:00.000Z",
    });
    assert.equal(submitLoad.error, undefined);

    // 5. Staff approves & completes loading schedule
    const approveLoad = await store.run(staffToken, "verifyOperationSchedule", {
      scheduleId: loadId,
      action: "approve",
    });
    assert.equal(approveLoad.error, undefined);

    // 6. Verify inventory deduction: 25,000 - 15,000 = 10,000 kg remaining
    const snapAfter = await store.snapshot();
    const ldpeMat = snapAfter.materials.find((m) => m.description === "LDPE Pellets");
    const bal = snapAfter.stockBalances.find((b) => b.warehouseId === warehouseId && b.materialId === ldpeMat?.id);
    assert.equal(bal?.weightKg, 10000, "Origin warehouse inventory deducted exactly once from 25,000 to 10,000 kg");

    // 7. Simulate refresh & re-login from disk store
    const reloadedAdapter = createLocalAdapter(
      file,
      {
        NODE_ENV: "test",
        STOCKFLOW_OWNER_EMAIL: "admin@stockflow.test",
        STOCKFLOW_OWNER_NAME: "Alex Admin",
        STOCKFLOW_OWNER_PASSWORD: "admin-pass-1",
        STOCKFLOW_REFERENCE_JSON: reference,
      },
      () => now
    );
    const reSign = await reloadedAdapter.signIn("elena.staff@stockflow.test", "staff-pass-1");
    assert.equal(reSign.ok, true);
    if (!reSign.ok) return;
    const viewed = await reloadedAdapter.view(reSign.value.sessionId);
    const persisted = viewed.state.schedules.find((s) => s.id === loadId);
    assert.ok(persisted);
    assert.equal(persisted.status, "completed");
    assert.equal(persisted.vehicleRegistrationNumber, "1-TRK-889");
    assert.equal(persisted.transportCompany, "Van Derksen Logistics B.V.");
    assert.equal(persisted.driverName, "Hendrik De Vries");
    assert.equal(persisted.driverContactNumber, "+31 6 1234 5678");
    assert.equal(persisted.actualArrivalTime, "2026-11-26T08:15:00.000Z");
    assert.equal(persisted.actualStartTime, "2026-11-26T08:30:00.000Z");
    assert.equal(persisted.actualEndTime, "2026-11-26T09:45:00.000Z");
    assert.equal(persisted.cmrNumber, "CMR-NL-2026-99412");
    assert.equal(persisted.totalPackageCount, 15);
    assert.equal(persisted.totalGrossWeightKg, 15030);
    assert.equal(persisted.totalTareWeightKg, 30);
    assert.equal(persisted.totalNetWeightKg, 15000);
    assert.equal(persisted.materialSummary.length, 1);
    assert.equal(persisted.materialSummary[0].totalNetWeightKg, 15000);
    assert.equal(persisted.attachments.length, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
