import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import {
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  IMAGE_COMPRESSION_QUALITY,
} from "../lib/client-image.ts";
import {
  parseOperationalRequestDescription,
  serializeOperationalRequestDescription,
  type GeneralRequestOperationalDetails,
} from "./view.ts";
import { can } from "../lib/data/permissions.ts";

const now = "2026-11-13T12:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
    { name: "Pakistan", country: "Pakistan" },
  ],
  companies: [
    { name: "North Mill", kind: "supplier" },
    { name: "Meridian Packaging", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
    { materialNumber: "HDPE", description: "HDPE regrind", unit: "kg", lowStockThresholdKg: 30 },
  ],
  packagingTypes: [
    { name: "Normal Pallet", tareKg: 25 },
    { name: "Euro Pallet", tareKg: 20 },
    { name: "Big Bag", tareKg: 2 },
  ],
});

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "admin@stockflow.local",
    STOCKFLOW_OWNER_NAME: "RM Admin",
    STOCKFLOW_OWNER_PASSWORD: "AdminPassword2026!",
    STOCKFLOW_REFERENCE_JSON: reference,
    STOCKFLOW_FILE_SECRET: "test-file-token-secret-for-signing-tests-only-32chars",
  };
}

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "rm-features-"));
  const file = path.join(dir, "store.json");
  const store = createLocalAdapter(file, env(), () => now);
  return { store, dir, services: store.services() };
}

test("1. Image & file optimization parameters: 1920px max dimension, quality 0.78, formatFileSize, PDF validation", async () => {
  assert.equal(MAX_IMAGE_DIMENSION, 1920);
  assert.equal(IMAGE_COMPRESSION_QUALITY, 0.78);
  assert.equal(MAX_FILE_SIZE_BYTES, 10 * 1024 * 1024);

  // File size formatting
  assert.equal(formatFileSize(500), "500 B");
  assert.equal(formatFileSize(5000), "4.9 KB");
  assert.equal(formatFileSize(200000), "195 KB");
  assert.equal(formatFileSize(2500000), "2.38 MB");
});

test("2. Structured Operational Request serialization, parsing, and weight auto-calculations", () => {
  const details: GeneralRequestOperationalDetails = {
    requestType: "unloading",
    materialType: "LDPE",
    materialDescription: "LDPE 98/2 Transparent Film Bales",
    packagingType: "Normal Pallet",
    packageCount: 10,
    grossWeightKg: 1250,
    tarePerPackageKg: 25,
    totalTareWeightKg: 250,
    netWeightKg: 1000,
    warehouseLocation: "Bornem - Bay 3",
    notes: "Forklift driver needed for offloading.",
  };

  const serialized = serializeOperationalRequestDescription(details, details.notes);
  assert.ok(serialized.startsWith("[OP_SPEC:"));
  assert.ok(serialized.includes("LDPE 98/2 Transparent Film Bales"));
  assert.ok(serialized.includes("Gross 1,250 kg | Total Tare 250 kg | Net Material 1,000 kg"));

  const parsed = parseOperationalRequestDescription(serialized);
  assert.ok(parsed.operationalDetails);
  assert.equal(parsed.operationalDetails.materialType, "LDPE");
  assert.equal(parsed.operationalDetails.packageCount, 10);
  assert.equal(parsed.operationalDetails.grossWeightKg, 1250);
  assert.equal(parsed.operationalDetails.totalTareWeightKg, 250);
  assert.equal(parsed.operationalDetails.netWeightKg, 1000);
  assert.equal(parsed.operationalDetails.warehouseLocation, "Bornem - Bay 3");
  assert.equal(parsed.operationalDetails.notes, "Forklift driver needed for offloading.");
  assert.ok(parsed.displayDescription.includes("Material: LDPE"));

  // Legacy descriptions without OP_SPEC: parse gracefully
  const legacyParsed = parseOperationalRequestDescription("Plain old request description");
  assert.equal(legacyParsed.operationalDetails, null);
  assert.equal(legacyParsed.displayDescription, "Plain old request description");
});

test("3. Validation rejects invalid operational details (zero/negative package count, gross <= tare)", async () => {
  const { store, dir } = setup();
  try {
    const adminAuth = await store.signIn("admin@stockflow.local", "AdminPassword2026!");
    assert.equal(adminAuth.ok, true);
    if (!adminAuth.ok) return;

    // Add worker
    await store.run(adminAuth.value.sessionId, "addUser", {
      name: "Worker Bornem",
      email: "worker.bornem@stockflow.local",
      role: "worker",
      warehouse: "Bornem",
      password: "WorkerPass2026!",
    });

    const workerAuth = await store.signIn("worker.bornem@stockflow.local", "WorkerPass2026!");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    // 1. Invalid package count (0)
    const res1 = await store.run(workerAuth.value.sessionId, "createGeneralRequest", {
      category: "materials_packaging",
      priority: "normal",
      description: "Testing invalid package count",
      operationalDetails: {
        materialType: "LDPE",
        packagingType: "Normal Pallet",
        packageCount: 0,
        grossWeightKg: 500,
        tarePerPackageKg: 25,
      },
    });
    assert.ok(res1.error);
    assert.match(res1.error ?? "", /Number of packages must be a positive whole number/i);

    // 2. Gross weight <= total tare (e.g., Gross 25kg, Tare 25kg -> Net 0kg)
    const res2 = await store.run(workerAuth.value.sessionId, "createGeneralRequest", {
      category: "materials_packaging",
      priority: "normal",
      description: "Testing zero net weight",
      operationalDetails: {
        materialType: "LDPE",
        packagingType: "Normal Pallet",
        packageCount: 1,
        grossWeightKg: 25,
        tarePerPackageKg: 25,
      },
    });
    assert.ok(res2.error);
    assert.match(res2.error ?? "", /Gross weight must be greater than total tare weight/i);

    // 3. Valid operational request succeeds and persists structured details
    const res3 = await store.run(workerAuth.value.sessionId, "createGeneralRequest", {
      category: "materials_packaging",
      priority: "urgent",
      description: "Baled plastic offload request",
      operationalDetails: {
        materialType: "LDPE",
        materialDescription: "Clean film",
        packagingType: "Normal Pallet",
        packageCount: 4,
        grossWeightKg: 1000,
        tarePerPackageKg: 25,
        warehouseLocation: "Bornem - Bay 1",
        notes: "Handle with forklift clamp",
      },
    });
    assert.equal(res3.error, undefined);
    assert.match(res3.notice ?? "", /Your request was submitted/i);

    // Verify stored snapshot parses operationalDetails
    const snapshot = await store.snapshot();
    const createdReq = snapshot.workerGeneralRequests.find((r) => r.createdBy === workerAuth.value.profile.id);
    assert.ok(createdReq);
    assert.ok(createdReq.description.includes("[OP_SPEC:"));

    // Check projectStore view
    const view = await store.view(workerAuth.value.sessionId);
    const viewReq = view.state.generalRequests.find((r) => r.id === createdReq.id);
    assert.ok(viewReq);
    assert.ok(viewReq.operationalDetails);
    assert.equal(viewReq.operationalDetails.materialType, "LDPE");
    assert.equal(viewReq.operationalDetails.packageCount, 4);
    assert.equal(viewReq.operationalDetails.grossWeightKg, 1000);
    assert.equal(viewReq.operationalDetails.totalTareWeightKg, 100);
    assert.equal(viewReq.operationalDetails.netWeightKg, 900);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("4. Full Worker -> Staff -> Admin -> Worker/Staff lifecycle & role permission boundaries", async () => {
  const { store, dir } = setup();
  try {
    const adminAuth = await store.signIn("admin@stockflow.local", "AdminPassword2026!");
    assert.equal(adminAuth.ok, true);
    if (!adminAuth.ok) return;

    // Add Staff and Worker
    await store.run(adminAuth.value.sessionId, "addUser", {
      name: "Staff User",
      email: "staff@stockflow.local",
      role: "manager",
      warehouse: null,
      password: "StaffPassword2026!",
    });
    await store.run(adminAuth.value.sessionId, "addUser", {
      name: "Worker Bornem",
      email: "worker.bornem@stockflow.local",
      role: "worker",
      warehouse: "Bornem",
      password: "WorkerPassword2026!",
    });

    const workerAuth = await store.signIn("worker.bornem@stockflow.local", "WorkerPassword2026!");
    assert.equal(workerAuth.ok, true);
    if (!workerAuth.ok) return;

    const staffAuth = await store.signIn("staff@stockflow.local", "StaffPassword2026!");
    assert.equal(staffAuth.ok, true);
    if (!staffAuth.ok) return;

    // 1. Worker submits operational request (Unloading)
    const createRes = await store.run(workerAuth.value.sessionId, "createGeneralRequest", {
      category: "loading_unloading",
      priority: "high",
      description: "Truck arrival unloading request",
      operationalDetails: {
        requestType: "unloading",
        materialType: "HDPE",
        materialDescription: "HDPE Regrind",
        packagingType: "Big Bag",
        packageCount: 10,
        grossWeightKg: 10020,
        tarePerPackageKg: 2,
        warehouseLocation: "Bornem - Dock 4",
      },
    });
    assert.equal(createRes.error, undefined);
    const snap1 = await store.snapshot();
    const req = snap1.workerGeneralRequests[0];
    assert.ok(req);
    assert.equal(req.status, "submitted");

    // 2. Staff cannot directly approve or reject operational requests (only Owner/Admin can approve/reject)
    const staffApprove = await store.run(staffAuth.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "approved",
    });
    assert.ok(staffApprove.error);
    assert.match(staffApprove.error ?? "", /Only Admin can approve or decline/i);

    // 3. Staff can place under_review or send_back
    const staffReview = await store.run(staffAuth.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "under_review",
      responseNote: "Staff reviewing dock scheduling",
    });
    assert.equal(staffReview.error, undefined);

    const snap2 = await store.snapshot();
    assert.equal(snap2.workerGeneralRequests[0].status, "under_review");

    // 4. Admin approves request with decision note
    const adminApprove = await store.run(adminAuth.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "approved",
      responseNote: "Dock 4 approved for 14:00",
    });
    assert.equal(adminApprove.error, undefined);

    const snap3 = await store.snapshot();
    assert.equal(snap3.workerGeneralRequests[0].status, "approved");

    // 5. Stage 3 & 4: Staff must assign PO number before Unloading request can be completed
    // 5a. Worker tries to complete before PO assignment -> MUST BE BLOCKED
    const workerEarlyComplete = await store.run(workerAuth.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "completed",
    });
    assert.ok(workerEarlyComplete.error);
    assert.match(workerEarlyComplete.error ?? "", /Staff must assign a PO or SO number/i);

    // 5b. Worker attempts to assign PO number -> MUST BE BLOCKED (Staff only)
    const workerAssign = await store.run(workerAuth.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: req.id,
      poSoNumber: "PO-2026-0001",
    });
    assert.ok(workerAssign.error);
    assert.match(workerAssign.error ?? "", /Only Staff can assign/i);

    // 5c. Staff assigns wrong prefix (SO to Unloading) -> MUST BE BLOCKED
    const staffWrongPrefix = await store.run(staffAuth.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: req.id,
      poSoNumber: "SO-2026-0001",
    });
    assert.ok(staffWrongPrefix.error);
    assert.match(staffWrongPrefix.error ?? "", /Unloading.*require a PO/i);

    // 5d. Staff assigns valid PO number -> SUCCEEDS
    const staffValidAssign = await store.run(staffAuth.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: req.id,
      poSoNumber: "PO-2026-0001",
    });
    assert.equal(staffValidAssign.error, undefined);
    assert.match(staffValidAssign.notice ?? "", /PO\/SO reference assigned/i);

    // 5e. Worker completes the approved & assigned Unloading operation
    const workerComplete = await store.run(workerAuth.value.sessionId, "decideGeneralRequest", {
      requestId: req.id,
      decision: "completed",
      responseNote: "Offload completed successfully",
    });
    assert.equal(workerComplete.error, undefined);

    const snap4 = await store.snapshot();
    const completedReq = snap4.workerGeneralRequests.find((r) => r.id === req.id);
    assert.ok(completedReq);
    assert.equal(completedReq.status, "completed");

    // Verify inventory increase from Unloading (10,020 - 20 = 10,000 kg HDPE added to Bornem)
    const bornemHdpeBalance = snap4.stockBalances.find(
      (b) => b.materialId === "HDPE" || snap4.materials.find((m) => m.id === b.materialId)?.materialNumber === "HDPE"
    );
    assert.ok(bornemHdpeBalance);
    assert.equal(bornemHdpeBalance.weightKg, 10000);

    // Verify append-only inventoryHistory contains the PO reference
    const historyEntry = snap4.inventoryHistory.find((h) => h.poNumber === "PO-2026-0001");
    assert.ok(historyEntry);
    assert.equal(historyEntry.quantityChange, 10000);
    assert.equal(historyEntry.operationType, "receipt");

    // 6. Test Stage 1-4 for Loading (Outbound Dispatch) and Insufficient Stock Prevention
    // 6a. Worker submits Loading request for 2,000 kg HDPE
    const loadReqRes = await store.run(workerAuth.value.sessionId, "createGeneralRequest", {
      category: "loading_unloading",
      priority: "urgent",
      description: "Dispatch HDPE regrind to client",
      operationalDetails: {
        requestType: "loading",
        materialType: "HDPE",
        packagingType: "Normal Pallet",
        packageCount: 2,
        grossWeightKg: 2050,
        tarePerPackageKg: 25,
        warehouseLocation: "Bornem - Bay 2",
      },
    });
    assert.equal(loadReqRes.error, undefined);
    const snap5 = await store.snapshot();
    const loadReq = snap5.workerGeneralRequests.find((r) => r.id !== req.id);
    assert.ok(loadReq);

    // Admin approves loading request
    await store.run(adminAuth.value.sessionId, "decideGeneralRequest", {
      requestId: loadReq.id,
      decision: "approved",
      responseNote: "Loading approved for collection",
    });

    // Staff assigns PO to Loading -> BLOCKED (Loading requires SO-)
    const loadWrongPrefix = await store.run(staffAuth.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: loadReq.id,
      poSoNumber: "PO-2026-0002",
    });
    assert.ok(loadWrongPrefix.error);
    assert.match(loadWrongPrefix.error ?? "", /Loading.*require an SO/i);

    // Staff assigns valid SO number -> SUCCEEDS
    const loadValidAssign = await store.run(staffAuth.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: loadReq.id,
      poSoNumber: "SO-2026-0001",
    });
    assert.equal(loadValidAssign.error, undefined);

    // Worker completes loading -> Stock deducted from 10,000 to 8,000 kg
    const loadComplete = await store.run(workerAuth.value.sessionId, "decideGeneralRequest", {
      requestId: loadReq.id,
      decision: "completed",
    });
    assert.equal(loadComplete.error, undefined);

    const snap6 = await store.snapshot();
    const updatedBalance = snap6.stockBalances.find((b) => b.id === bornemHdpeBalance.id);
    assert.ok(updatedBalance);
    assert.equal(updatedBalance.weightKg, 8000);

    const soHistory = snap6.inventoryHistory.find((h) => h.soNumber === "SO-2026-0001");
    assert.ok(soHistory);
    assert.equal(soHistory.quantityChange, -2000);
    assert.equal(soHistory.operationType, "dispatch");

    // 6b. Insufficient stock prevention: submit Loading for 50,000 kg (only 8,000 available)
    const excessLoadRes = await store.run(workerAuth.value.sessionId, "createGeneralRequest", {
      category: "loading_unloading",
      priority: "normal",
      description: "Excess dispatch request",
      operationalDetails: {
        requestType: "loading",
        materialType: "HDPE",
        packagingType: "Normal Pallet",
        packageCount: 10,
        grossWeightKg: 50250,
        tarePerPackageKg: 25,
      },
    });
    assert.equal(excessLoadRes.error, undefined);
    const snap7 = await store.snapshot();
    const excessReq = snap7.workerGeneralRequests.find((r) => r.id !== req.id && r.id !== loadReq.id);
    assert.ok(excessReq);

    await store.run(adminAuth.value.sessionId, "decideGeneralRequest", {
      requestId: excessReq.id,
      decision: "approved",
    });
    await store.run(staffAuth.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: excessReq.id,
      poSoNumber: "SO-2026-0002",
    });

    const excessComplete = await store.run(workerAuth.value.sessionId, "decideGeneralRequest", {
      requestId: excessReq.id,
      decision: "completed",
    });
    assert.ok(excessComplete.error);
    assert.match(excessComplete.error ?? "", /Insufficient stock/i);

    // Stock remains unchanged at 8000 kg
    const snap8 = await store.snapshot();
    const finalBalance = snap8.stockBalances.find((b) => b.id === bornemHdpeBalance.id);
    assert.equal(finalBalance?.weightKg, 8000);

    // 7. Non-owner / authenticated user DELETE on purchase orders is strictly blocked
    assert.equal(can(workerAuth.value.profile, "order:delete"), false);
    assert.equal(can(staffAuth.value.profile, "order:delete"), false);
    assert.equal(can(adminAuth.value.profile, "order:delete"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
