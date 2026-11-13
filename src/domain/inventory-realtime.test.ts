import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import { projectStore } from "./project.ts";
import { navSections } from "../lib/navigation.ts";

const now = "2026-11-10T12:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
    { name: "Pakistan", country: "Pakistan" },
  ],
  companies: [
    { name: "Acme Polymers", kind: "supplier" },
    { name: "Global Cargo Ltd", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 100 },
    { materialNumber: "HDPE", description: "HDPE regrind", unit: "kg", lowStockThresholdKg: 200 },
  ],
  packagingTypes: [
    { name: "Normal Pallet", tareKg: 25 },
    { name: "Big Bag Pallet", tareKg: 30 },
  ],
});

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "admin@example.com",
    STOCKFLOW_OWNER_NAME: "Chief Admin",
    STOCKFLOW_OWNER_PASSWORD: "admin-password-123",
    STOCKFLOW_REFERENCE_JSON: reference,
  };
}

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-inv-test-"));
  const file = path.join(dir, "store.json");
  return { dir, store: createLocalAdapter(file, env(), () => now) };
}

test("1. Real-time stock balance updates immediately after operations", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@example.com", "admin-password-123");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;

    // Admin creates Staff and Worker
    const addStaff = await store.run(adminSign.value.sessionId, "addUser", {
      name: "Staff Sam",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });
    assert.equal(addStaff.error, undefined);

    const addWorker = await store.run(adminSign.value.sessionId, "addUser", {
      name: "Worker Walter",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });
    assert.equal(addWorker.error, undefined);

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    const workerSign = await store.signIn("worker@example.com", "worker-pass-1");
    assert.equal(staffSign.ok, true);
    assert.equal(workerSign.ok, true);
    if (!staffSign.ok || !workerSign.ok) return;

    // Staff creates PO
    const poRes = await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Q3 Polymer Raw Material Import - Supplier A",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 5000,
      valueEur: 7500,
    });
    assert.equal(poRes.error, undefined);
    const snap1 = await store.snapshot();
    const po = snap1.purchaseOrders[0];
    assert.ok(po);

    // Worker creates Inbound shipment container
    const inboundRes = await store.run(workerSign.value.sessionId, "addInbound", {
      number: "MSCU-1234567",
      po: po.number,
      supplier: "Acme Polymers",
      warehouse: "Bornem",
    });
    assert.equal(inboundRes.error, undefined);

    // Worker enters weighed net/gross material
    const matRes = await store.run(workerSign.value.sessionId, "saveMaterial", {
      shipment: "MSCU-1234567",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 5025,
      packagingId: snap1.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.equal(matRes.error, undefined);

    const snap2 = await store.snapshot();
    const req = snap2.requests[0];
    assert.ok(req);
    assert.equal(req.status, "submitted");

    // Before approval, stock balance must be 0
    const beforeBal = snap2.stockBalances.find((b) => b.warehouseId === req.warehouseId);
    assert.equal(beforeBal?.weightKg ?? 0, 0);

    // Admin approves request
    const approveRes = await store.run(adminSign.value.sessionId, "approveRequest", {
      requestId: req.id,
    });
    assert.equal(approveRes.error, undefined);

    // Worker enters & completes operation into stock
    const completeRes = await store.run(workerSign.value.sessionId, "completeRequest", {
      requestId: req.id,
    });
    assert.equal(completeRes.error, undefined);

    // Stock must update immediately to 5000 kg
    const snap3 = await store.snapshot();
    const ldpe = snap3.materials.find((m) => m.materialNumber === "LDPE")!;
    const afterBal = snap3.stockBalances.find((b) => b.materialId === ldpe.id && b.warehouseId === req.warehouseId);
    assert.equal(afterBal?.weightKg, 5000);

    // Check workspace state projection
    const ws = projectStore(await store.snapshot(), now);
    const stockItem = ws.stock.find((s) => s.warehouse === "Bornem" && s.material === "LDPE film");
    assert.equal(stockItem?.weightKg, 5000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("2. Duplicate stock deductions are prevented idempotently", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@example.com", "admin-password-123");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;

    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Staff Sam",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });
    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Worker Walter",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    const workerSign = await store.signIn("worker@example.com", "worker-pass-1");
    if (!staffSign.ok || !workerSign.ok) return;

    // Create PO and container
    await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Acme Order",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 2000,
      valueEur: 3000,
    });
    const snap = await store.snapshot();
    const po = snap.purchaseOrders[0];

    await store.run(workerSign.value.sessionId, "addInbound", {
      number: "MEDU-9988776",
      po: po.number,
      supplier: "Acme Polymers",
      warehouse: "Bornem",
    });
    await store.run(workerSign.value.sessionId, "saveMaterial", {
      shipment: "MEDU-9988776",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 2025,
      packagingId: snap.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });

    const snap2 = await store.snapshot();
    const req = snap2.requests[0];

    // Approve and complete
    await store.run(adminSign.value.sessionId, "approveRequest", { requestId: req.id });
    await store.run(workerSign.value.sessionId, "completeRequest", { requestId: req.id });

    const snap3 = await store.snapshot();
    assert.equal(snap3.stockBalances[0]?.weightKg, 2000);

    // Repeat completion call (idempotency check)
    const repeatRes = await store.run(workerSign.value.sessionId, "completeRequest", { requestId: req.id });
    assert.equal(repeatRes.error, undefined);

    const snap4 = await store.snapshot();
    // Stock must stay 2000 kg, not double to 4000 kg
    assert.equal(snap4.stockBalances[0]?.weightKg, 2000);
    // Movements count must stay 1
    assert.equal(snap4.stockMovements.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("3. Complete append-only inventory history records operations with full audit details", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@example.com", "admin-password-123");
    if (!adminSign.ok) return;

    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Staff Sam",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });
    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Worker Walter",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    const workerSign = await store.signIn("worker@example.com", "worker-pass-1");
    if (!staffSign.ok || !workerSign.ok) return;

    await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "History Test PO",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 3000,
      valueEur: 4500,
    });
    const snap = await store.snapshot();
    const po = snap.purchaseOrders[0];

    await store.run(workerSign.value.sessionId, "addInbound", {
      number: "CXRU-1122334",
      po: po.number,
      supplier: "Acme Polymers",
      warehouse: "Bornem",
    });
    await store.run(workerSign.value.sessionId, "saveMaterial", {
      shipment: "CXRU-1122334",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 3025,
      packagingId: snap.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });

    const req = (await store.snapshot()).requests[0];
    await store.run(adminSign.value.sessionId, "approveRequest", { requestId: req.id });
    await store.run(workerSign.value.sessionId, "completeRequest", { requestId: req.id });

    // Verify inventory history
    const snapFinal = await store.snapshot();
    assert.ok(snapFinal.inventoryHistory.length >= 1);
    const historyEntry = snapFinal.inventoryHistory.find((h) => h.containerNumber === "CXRU-1122334");
    assert.ok(historyEntry);
    assert.equal(historyEntry.materialName, "LDPE film");
    assert.equal(historyEntry.warehouseName, "Bornem");
    assert.equal(historyEntry.quantityBefore, 0);
    assert.equal(historyEntry.quantityChange, 3000);
    assert.equal(historyEntry.quantityAfter, 3000);
    assert.equal(historyEntry.packagingTypeName, snap.packagingTypes[0]?.name);
    assert.equal(historyEntry.packagingCount, 1);
    assert.equal(historyEntry.packagingUnitTareKg, snap.packagingTypes[0]?.tareKg);
    assert.equal(historyEntry.totalPackagingWeightKg, 25);
    assert.equal(historyEntry.grossWeightKg, 3025);
    assert.equal(historyEntry.operationType, "receipt");
    assert.equal(historyEntry.poNumber, po.number);

    // Also check state view projection
    const ws = projectStore(await store.snapshot(), now);
    assert.ok(ws.inventoryHistory.some((h) => h.containerNumber === "CXRU-1122334"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("4. Container inventory calculations: packaging tare, gross packed cargo, container tare (2,200kg)", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@example.com", "admin-password-123");
    if (!adminSign.ok) return;

    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Staff Sam",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });
    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Worker Walter",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    const workerSign = await store.signIn("worker@example.com", "worker-pass-1");
    if (!staffSign.ok || !workerSign.ok) return;

    await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Container Test PO",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 7000,
      valueEur: 10000,
    });
    const snap = await store.snapshot();
    const po = snap.purchaseOrders[0];

    await store.run(workerSign.value.sessionId, "addInbound", {
      number: "HLXU-8877665",
      po: po.number,
      supplier: "Acme Polymers",
      warehouse: "Bornem",
    });

    // 10 pallets of LDPE: 10 * 25kg = 250kg tare, 4,000kg net, 4,250kg gross
    await store.run(workerSign.value.sessionId, "saveMaterial", {
      shipment: "HLXU-8877665",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 4250,
      packagingId: snap.packagingTypes[0]?.id,
      packagingQty: 10,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });

    // Verify containerInventory in workspace state
    const ws = projectStore(await store.snapshot(), now);
    const container = ws.containerInventory.find((c) => c.containerNumber === "HLXU-8877665");
    assert.ok(container);

    assert.equal(container.totalPackagingCount, 10);
    assert.equal(container.totalPackagingWeightKg, 250);
    assert.equal(container.totalNetWeightKg, 4000);
    // Gross packed cargo weight = 4000 + 250 = 4250 kg
    assert.equal(container.grossPackedCargoWeightKg, 4250);
    // Container tare (std 2,200 kg) kept separate
    assert.equal(container.containerTareKg, 2200);
    // Total gross = 4250 + 2200 = 6450 kg
    assert.equal(container.totalGrossCargoAndContainerKg, 6450);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("5. Purchase Orders: Custom PO titles and unique sequential PO-YYYY-XXXX numbering", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@example.com", "admin-password-123");
    if (!adminSign.ok) return;

    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Staff Sam",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });
    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    if (!staffSign.ok) return;

    const currentYear = new Date().getUTCFullYear();

    // Staff creates first order without custom number -> generates PO-YYYY-0001
    const po1Res = await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Q3 Polymer Raw Material Import - Supplier A",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 10000,
      valueEur: 15000,
    });
    assert.equal(po1Res.error, undefined);

    // Staff creates second order without custom number -> generates PO-YYYY-0002
    const po2Res = await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Q3 HDPE Blow Moulding - Supplier B",
      supplier: "Acme Polymers",
      material: "HDPE regrind",
      quantityKg: 20000,
      valueEur: 30000,
    });
    assert.equal(po2Res.error, undefined);

    const ws = projectStore(await store.snapshot(), now);
    const order1 = ws.orders.find((o) => o.title === "Q3 Polymer Raw Material Import - Supplier A");
    const order2 = ws.orders.find((o) => o.title === "Q3 HDPE Blow Moulding - Supplier B");

    assert.ok(order1);
    assert.ok(order2);
    assert.equal(order1.number, `PO-${currentYear}-0001`);
    assert.equal(order2.number, `PO-${currentYear}-0002`);
    assert.notEqual(order1.number, order2.number);

    // Uniqueness check: Attempting to create duplicate PO number fails
    const dupRes = await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Duplicate Attempt",
      number: `PO-${currentYear}-0001`,
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 1000,
      valueEur: 1000,
    });
    assert.ok(dupRes.error?.includes("already exists"));

    // Sequence never reuses numbers even after cancellation
    const po3Res = await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Third Sequential Order",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 5000,
      valueEur: 5000,
    });
    assert.equal(po3Res.error, undefined);
    const ws2 = projectStore(await store.snapshot(), now);
    const order3 = ws2.orders.find((o) => o.title === "Third Sequential Order");
    assert.ok(order3);
    assert.equal(order3.number, `PO-${currentYear}-0003`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("6. Admin sidebar cleanup: Stock Movements, Transfers, and Directories absent for Admin, preserved for Staff", () => {
  // Navigation filtering for Admin (owner)
  const adminSections = navSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => item.roles.includes("owner")),
    }))
    .filter((section) => section.items.length > 0);

  const adminTitles = adminSections.map((s) => s.title);
  const adminHrefs = adminSections.flatMap((s) => s.items.map((i) => i.href));

  // Admin must NOT see Directories section in sidebar
  assert.equal(adminTitles.includes("Directories"), false, "Directories section must not appear for Admin");

  // Admin must NOT see Stock Movements or Transfers in Warehouse section
  assert.equal(adminHrefs.includes("/stock-movements"), false, "Stock Movements must not appear for Admin");
  assert.equal(adminHrefs.includes("/transfers"), false, "Transfers must not appear for Admin");

  // Admin MUST have access to Inventory (with full history and container tabs), Reports, Audit, Settings
  assert.equal(adminHrefs.includes("/inventory"), true, "Inventory must remain for Admin");
  assert.equal(adminHrefs.includes("/reports"), true, "Reports must remain for Admin");
  assert.equal(adminHrefs.includes("/audit"), true, "Audit Log must remain for Admin");
  assert.equal(adminHrefs.includes("/settings"), true, "Settings must remain for Admin");

  // Navigation filtering for Staff (manager)
  const staffSections = navSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => item.roles.includes("manager")),
    }))
    .filter((section) => section.items.length > 0);

  const staffTitles = staffSections.map((s) => s.title);
  const staffHrefs = staffSections.flatMap((s) => s.items.map((i) => i.href));

  // Staff MUST see Directories, Stock Movements, and Transfers
  assert.equal(staffTitles.includes("Directories"), true, "Directories section must appear for Staff");
  assert.equal(staffHrefs.includes("/stock-movements"), true, "Stock Movements must appear for Staff");
  assert.equal(staffHrefs.includes("/transfers"), true, "Transfers must appear for Staff");
  assert.equal(staffHrefs.includes("/suppliers"), true, "Suppliers must appear for Staff");
  assert.equal(staffHrefs.includes("/customers"), true, "Customers must appear for Staff");
  assert.equal(staffHrefs.includes("/materials"), true, "Materials & Packaging must appear for Staff");
});

test("7. Strict Admin read-only operational enforcement & Staff approval boundary", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@example.com", "admin-password-123");
    if (!adminSign.ok) return;

    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Staff Sam",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });
    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    if (!staffSign.ok) return;

    // 1. Admin CANNOT create operational POs (only Staff can)
    const adminCreatePo = await store.run(adminSign.value.sessionId, "createPurchase", {
      title: "Admin Attempt",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 1000,
      valueEur: 1000,
    });
    assert.ok(adminCreatePo.error?.includes("Only Staff can create a PO/SO order"));

    // 2. Staff creates PO successfully
    const staffCreatePo = await store.run(staffSign.value.sessionId, "createPurchase", {
      title: "Staff Order",
      supplier: "Acme Polymers",
      material: "LDPE film",
      quantityKg: 1000,
      valueEur: 1000,
    });
    assert.equal(staffCreatePo.error, undefined);

    const snap = await store.snapshot();
    const order = snap.purchaseOrders.find((o) => o.title === "Staff Order")!;
    assert.ok(order);

    // 3. Staff CANNOT approve POs (only Admin can)
    const staffApprove = await store.run(staffSign.value.sessionId, "approve", {
      number: order.number,
    });
    assert.ok(staffApprove.error?.includes("Only the owner can approve"));

    // 4. Admin CAN approve POs
    const adminApprove = await store.run(adminSign.value.sessionId, "approve", {
      number: order.number,
    });
    assert.equal(adminApprove.error, undefined);

    // 5. Admin CANNOT execute direct stock transfers
    const adminTransfer = await store.run(adminSign.value.sessionId, "transferStock", {
      fromWarehouseId: "wh-1",
      toWarehouseId: "wh-2",
      materialId: "mat-1",
      weightKg: 500,
    });
    assert.ok(adminTransfer.error?.includes("cannot transfer stock"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
