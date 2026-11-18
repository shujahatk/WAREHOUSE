import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import { canPerform } from "../lib/permissions.ts";

const now = "2026-11-09T10:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
    { name: "Pakistan", country: "Pakistan" },
  ],
  companies: [{ name: "Meridian Packaging", kind: "customer" }],
  materials: [{ materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 }],
  packagingTypes: [{ name: "Normal Pallet", tareKg: 25 }],
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

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-poso-test-"));
  const file = path.join(dir, "store.json");
  return { dir, store: createLocalAdapter(file, env(), () => now) };
}

function assertSuccess<T>(result: { ok: boolean; value?: T; error?: string }): asserts result is { ok: true; value: T } {
  assert.equal(result.ok, true, result.error);
}

test("1. Worker Console: Worker cannot create PO/SO requests", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob.worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const workerSign = await store.signIn("bob.worker@example.com", "worker-pass-1");
    assertSuccess(workerSign);

    // Attempt to submit loading/unloading request
    const reqRes = await store.run(workerSign.value.sessionId, "createGeneralRequest", {
      category: "loading_unloading",
      priority: "normal",
      description: "Worker attempt to create request",
      operationalDetails: {
        requestType: "unloading",
        materialType: "LDPE",
        packageCount: 1,
        grossWeightKg: 1000,
        tarePerPackageKg: 25,
      },
    });

    assert.ok(reqRes.error);
    assert.match(reqRes.error, /Workers cannot create PO\/SO requests|PO and SO request management has been moved to Staff/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("2. Staff Module: Staff can add PO number (inbound/unloading)", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      password: "staff-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    assertSuccess(staffSign);

    const poRes = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      supplier: "Test Supplier BV",
      material: "Polyethylene Pellets",
      quantityKg: 2500,
      valueEur: 15000,
      notes: "Inbound delivery to Bornem",
    });

    assert.equal(poRes.error, undefined);
    assert.match(poRes.notice || "", /submitted for approval/i);

    const view = await store.view(staffSign.value.sessionId);
    const found = view.state.orders.find((o) => o.supplier === "Test Supplier BV");
    assert.ok(found);
    assert.equal(found.type, "PO");
    assert.match(found.number, /^PO-\d{4}-\d{4}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("3. Staff Module: Staff can add SO number (outbound/loading)", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      password: "staff-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    assertSuccess(staffSign);

    const soRes = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "SO",
      customer: "Global Polymers Ltd",
      material: "Polypropylene Film",
      quantityKg: 5000,
      valueEur: 32000,
      notes: "Outbound shipment from Turnhout",
    });

    assert.equal(soRes.error, undefined);
    assert.match(soRes.notice || "", /submitted for approval/i);

    const view = await store.view(staffSign.value.sessionId);
    const found = view.state.orders.find((o) => o.customerCompany === "Global Polymers Ltd");
    assert.ok(found);
    assert.equal(found.type, "SO");
    assert.match(found.number, /^SO-\d{4}-\d{4}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("4. Duplicate PO/SO numbers are validated and rejected", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      password: "staff-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    assertSuccess(staffSign);

    const first = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      number: "PO-2026-9999",
      supplier: "Dup Supplier",
      material: "Plastic",
      quantityKg: 100,
      valueEur: 500,
    });
    assert.equal(first.error, undefined);

    const duplicate = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      number: "PO-2026-9999",
      supplier: "Another Supplier",
      material: "Plastic",
      quantityKg: 200,
      valueEur: 800,
    });
    assert.ok(duplicate.error);
    assert.match(duplicate.error, /already exists/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("5. Staff Module: Staff can edit PO/SO information", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      password: "staff-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    assertSuccess(staffSign);

    const createRes = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      supplier: "Original Supplier",
      material: "HDPE Granules",
      quantityKg: 1000,
      valueEur: 5000,
    });
    assert.equal(createRes.error, undefined);

    const viewBefore = await store.view(staffSign.value.sessionId);
    const order = viewBefore.state.orders.find((o) => o.supplier === "Original Supplier")!;

    const editRes = await store.run(staffSign.value.sessionId, "editPurchase", {
      number: order.number,
      supplier: "Updated Supplier NV",
      material: "HDPE Granules Cleaned",
      quantityKg: 1200,
      valueEur: 6000,
      title: "Updated PO Title",
    });
    assert.equal(editRes.error, undefined);

    const viewAfter = await store.view(staffSign.value.sessionId);
    const updatedOrder = viewAfter.state.orders.find((o) => o.number === order.number)!;
    assert.equal(updatedOrder.supplier, "Updated Supplier NV");
    assert.equal(updatedOrder.quantityKg, 1200);
    assert.equal(updatedOrder.valueEur, 6000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("6. Staff CANNOT change Worker assigned to an operation", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      password: "staff-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    assertSuccess(staffSign);

    await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      supplier: "Lock Test Supplier",
      material: "Polymers",
      quantityKg: 100,
      valueEur: 500,
    });

    const view = await store.view(staffSign.value.sessionId);
    const order = view.state.orders.find((o) => o.supplier === "Lock Test Supplier")!;
    assert.ok(order);

    const editWithWorker = await store.run(staffSign.value.sessionId, "editPurchase", {
      number: order.number,
      supplier: order.supplier,
      material: order.material,
      quantityKg: order.quantityKg,
      valueEur: order.valueEur,
      workerId: "some-worker-uuid",
    });

    assert.ok(editWithWorker.error);
    assert.match(editWithWorker.error, /Staff cannot change the Worker assigned/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("7. Staff can remove PO/SO number entries while preserving operational history", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      password: "staff-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    assertSuccess(staffSign);

    const createRes = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      number: "PO-2026-7777",
      supplier: "Removal Test Partner",
      material: "PET Flakes",
      quantityKg: 3000,
      valueEur: 9000,
    });
    assert.equal(createRes.error, undefined);

    // Remove the PO/SO number entry
    const removeRes = await store.run(staffSign.value.sessionId, "removePoSoNumber", {
      number: "PO-2026-7777",
    });
    assert.equal(removeRes.error, undefined);
    assert.match(removeRes.notice || "", /removed.*Operational history preserved/i);

    // Check state: number is flagged isRemoved = true, historical record exists
    type RawOrderRecord = { id: string; number: string; isRemoved?: boolean; removedAt?: string };
    type RawLineRecord = { id: string; purchaseOrderId: string };
    type RawAuditRecord = { action: string };
    type RawStoreSnapshot = {
      purchaseOrders: RawOrderRecord[];
      purchaseOrderLines: RawLineRecord[];
      auditLogs?: RawAuditRecord[];
      auditLog?: RawAuditRecord[];
    };
    const rawState = await (store as unknown as { snapshot: () => Promise<RawStoreSnapshot> }).snapshot();
    const rawOrder = rawState.purchaseOrders.find((po) => po.number === "PO-2026-7777");
    assert.ok(rawOrder);
    assert.equal(rawOrder.isRemoved, true);
    assert.ok(rawOrder.removedAt);

    // Check lines are preserved
    const lines = rawState.purchaseOrderLines.filter((l) => l.purchaseOrderId === rawOrder.id);
    assert.ok(lines.length > 0);

    // Check audit log contains poso-number-removed
    const auditLogs = rawState.auditLogs || rawState.auditLog || [];
    const logFound = auditLogs.some((l) => l.action === "poso-number-removed");
    assert.ok(logFound);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("8. Admin retains oversight but is read-only for operational data", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(adminSign);

    // Admin cannot create operational orders
    assert.equal(canPerform("owner", "create-order"), false);
    const createRes = await store.run(adminSign.value.sessionId, "createPurchase", {
      type: "PO",
      supplier: "Admin Attempt",
      material: "Plastic",
      quantityKg: 100,
      valueEur: 500,
    });
    assert.ok(createRes.error);

    // Admin cannot edit operational orders
    assert.equal(canPerform("owner", "edit-order"), false);
    const editRes = await store.run(adminSign.value.sessionId, "editPurchase", {
      number: "PO-2026-0001",
      supplier: "Admin Attempt Edit",
      material: "Plastic",
      quantityKg: 100,
      valueEur: 500,
    });
    assert.ok(editRes.error);

    // Admin cannot remove operational numbers
    assert.equal(canPerform("owner", "remove-order"), false);
    const removeRes = await store.run(adminSign.value.sessionId, "removePoSoNumber", {
      number: "PO-2026-0001",
    });
    assert.ok(removeRes.error);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("9. Workers cannot access Staff PO/SO management", async () => {
  assert.equal(canPerform("worker", "create-order"), false);
  assert.equal(canPerform("worker", "edit-order"), false);
  assert.equal(canPerform("worker", "remove-order"), false);

  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assertSuccess(ownerSign);
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Worker Test",
      email: "worker.test@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const workerSign = await store.signIn("worker.test@example.com", "worker-pass-1");
    assertSuccess(workerSign);

    const createRes = await store.run(workerSign.value.sessionId, "createPurchase", {
      type: "PO",
      supplier: "Worker Attempt",
      material: "Plastic",
      quantityKg: 100,
      valueEur: 500,
    });
    assert.ok(createRes.error);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
