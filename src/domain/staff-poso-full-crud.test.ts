import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLocalAdapter, type LocalAdapter } from "./local-adapter.ts";
import { canPerform } from "../lib/permissions.ts";

const now = "2026-11-21T09:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
    { name: "Pakistan", country: "Pakistan" },
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

const TEST_ENV = {
  NODE_ENV: "test" as const,
  STOCKFLOW_OWNER_EMAIL: "owner@example.com",
  STOCKFLOW_OWNER_NAME: "Admin Owner",
  STOCKFLOW_OWNER_PASSWORD: "owner-pass-1",
  STOCKFLOW_REFERENCE_JSON: reference,
};

function createTestAdapter() {
  const dir = mkdtempSync(join(tmpdir(), "stockflow-staff-poso-crud-"));
  const filePath = join(dir, "store.json");
  const store = createLocalAdapter(filePath, TEST_ENV, () => now);
  return { dir, filePath, store };
}

async function setupUsers(store: LocalAdapter) {
  const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
  assert.ok(ownerSign.ok);
  const ownerSession = ownerSign.value.sessionId;

  await store.run(ownerSession, "addUser", {
    name: "Sam Staff",
    email: "staff@example.com",
    role: "manager",
    password: "staff-pass-1",
  });

  await store.run(ownerSession, "addUser", {
    name: "Willem Worker",
    email: "worker.bornem@example.com",
    role: "worker",
    warehouse: "Bornem",
    password: "worker-pass-1",
  });

  const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
  assert.ok(staffSign.ok);

  const workerSign = await store.signIn("worker.bornem@example.com", "worker-pass-1");
  assert.ok(workerSign.ok);

  return {
    ownerSession,
    staffSession: staffSign.value.sessionId,
    workerSession: workerSign.value.sessionId,
    workerProfile: workerSign.value.profile,
  };
}

test("Scenario 1, 2 & 3: Staff can Create, Edit (all fields + reference number), and Delete a Purchase Order (PO)", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const { staffSession } = await setupUsers(store);

    // 1. Create PO with all commercial & logistics fields
    const createRes = await store.run(staffSession, "createPurchase", {
      type: "PO",
      number: "PO-2026-5001",
      title: "Antwerp HDPE Inbound Batch",
      supplier: "Borealis Polymers NV",
      purchaserName: "Sam Staff (Procurement)",
      material: "HDPE Regrind Grade A",
      quantityKg: 24000,
      valueEur: 19200,
      transportPrice: 850,
      currency: "EUR",
      origin: "Antwerp, Belgium",
      destination: "Bornem, Belgium",
      warehouse: "Bornem",
      pickupDate: "2026-11-22",
      scheduledDate: "2026-11-24",
      annex7Required: true,
      notes: "Deliver to Unloading Bay 2 with weighbridge certificate",
    });
    assert.equal(createRes.error, undefined);

    const viewAfterCreate = await store.view(staffSession);
    const createdPo = viewAfterCreate.state.orders.find((o) => o.number === "PO-2026-5001");
    assert.ok(createdPo, "Created PO must exist in database view");
    assert.ok(createdPo.id, "Created PO must have a stable database UUID");
    assert.equal(createdPo.type, "PO");
    assert.equal(createdPo.supplier, "Borealis Polymers NV");
    assert.equal(createdPo.purchaserName, "Sam Staff (Procurement)");
    assert.equal(createdPo.material, "HDPE Regrind Grade A");
    assert.equal(createdPo.quantityKg, 24000);
    assert.equal(createdPo.valueEur, 19200);
    assert.equal(createdPo.transportPrice, 850);
    assert.equal(createdPo.currency, "EUR");
    assert.equal(createdPo.origin, "Antwerp, Belgium");
    assert.equal(createdPo.destination, "Bornem, Belgium");
    assert.equal(createdPo.warehouse, "Bornem");
    assert.equal(createdPo.pickupDate, "2026-11-22");
    assert.equal(createdPo.scheduledDate, "2026-11-24");
    assert.equal(createdPo.annex7Required, true);
    assert.equal(createdPo.notes, "Deliver to Unloading Bay 2 with weighbridge certificate");

    // 2. Edit PO (all fields including PO reference number, supplier, purchaser, prices, dates, warehouse, Annex VII)
    const editRes = await store.run(staffSession, "editPurchase", {
      id: createdPo.id,
      number: "PO-2026-5001",
      newNumber: "PO-2026-5001-REV2",
      title: "Turnhout LDPE Inbound Revised",
      supplier: "TotalEnergies Antwerp",
      purchaserName: "Elena Vanderstraeten",
      material: "LDPE Film Washed",
      quantityKg: 28500,
      valueEur: 22800,
      transportPrice: 1120,
      currency: "USD",
      origin: "Ghent, Belgium",
      destination: "Turnhout, Belgium",
      warehouse: "Turnhout",
      pickupDate: "2026-11-25",
      scheduledDate: "2026-11-27",
      annex7Required: false,
      notes: "Updated route to Turnhout warehouse",
    });
    assert.equal(editRes.error, undefined);

    const viewAfterEdit = await store.view(staffSession);
    const editedPo = viewAfterEdit.state.orders.find((o) => o.id === createdPo.id);
    assert.ok(editedPo, "Edited PO must persist under the same stable database ID");
    assert.equal(editedPo.number, "PO-2026-5001-REV2");
    assert.equal(editedPo.title, "Turnhout LDPE Inbound Revised");
    assert.equal(editedPo.supplier, "TotalEnergies Antwerp");
    assert.equal(editedPo.purchaserName, "Elena Vanderstraeten");
    assert.equal(editedPo.material, "LDPE Film Washed");
    assert.equal(editedPo.quantityKg, 28500);
    assert.equal(editedPo.valueEur, 22800);
    assert.equal(editedPo.transportPrice, 1120);
    assert.equal(editedPo.currency, "USD");
    assert.equal(editedPo.origin, "Ghent, Belgium");
    assert.equal(editedPo.destination, "Turnhout, Belgium");
    assert.equal(editedPo.warehouse, "Turnhout");
    assert.equal(editedPo.pickupDate, "2026-11-25");
    assert.equal(editedPo.scheduledDate, "2026-11-27");
    assert.equal(editedPo.annex7Required, false);
    assert.equal(editedPo.notes, "Updated route to Turnhout warehouse");

    // 3. Delete PO and verify database behavior
    const delRes = await store.run(staffSession, "deletePurchase", {
      id: editedPo.id,
      number: editedPo.number,
    });
    assert.equal(delRes.error, undefined);

    const viewAfterDelete = await store.view(staffSession);
    const activeAfterDelete = viewAfterDelete.state.orders.filter((o) => !o.isRemoved);
    assert.equal(
      activeAfterDelete.some((o) => o.id === editedPo.id),
      false,
      "Deleted PO must no longer appear in active orders"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Scenario 4: Staff can Create, Edit (all fields + reference number), and Delete a Sales Order (SO)", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const { staffSession } = await setupUsers(store);

    // 1. Create SO
    const createSoRes = await store.run(staffSession, "createPurchase", {
      type: "SO",
      number: "SO-2026-6001",
      title: "Rotterdam PP Granulate Export",
      customer: "EuroPlast Recycling GmbH",
      sellerName: "Lucas De Vries (Sales)",
      material: "PP Homopolymer Granules",
      quantityKg: 20000,
      valueEur: 26500,
      transportPrice: 950,
      currency: "EUR",
      origin: "Bornem, Belgium",
      destination: "Rotterdam, Netherlands",
      warehouse: "Bornem",
      scheduledDate: "2026-11-26",
      annex7Required: true,
      notes: "Customer requires CMR & Annex VII signed before departure",
    });
    assert.equal(createSoRes.error, undefined);

    const viewAfterCreate = await store.view(staffSession);
    const createdSo = viewAfterCreate.state.orders.find((o) => o.number === "SO-2026-6001");
    assert.ok(createdSo);
    assert.equal(createdSo.type, "SO");
    assert.equal(createdSo.customerCompany, "EuroPlast Recycling GmbH");
    assert.equal(createdSo.sellerName, "Lucas De Vries (Sales)");
    assert.equal(createdSo.valueEur, 26500);
    assert.equal(createdSo.transportPrice, 950);
    assert.equal(createdSo.origin, "Bornem, Belgium");
    assert.equal(createdSo.destination, "Rotterdam, Netherlands");
    assert.equal(createdSo.scheduledDate, "2026-11-26");
    assert.equal(createdSo.annex7Required, true);

    // 2. Edit SO
    const editSoRes = await store.run(staffSession, "editPurchase", {
      id: createdSo.id,
      number: "SO-2026-6001",
      newNumber: "SO-2026-6001-B",
      title: "Hamburg PP Granulate Export Updated",
      customer: "Hansa Polymer Trading AG",
      sellerName: "Marieke Janssens",
      material: "PP Copolymer Pellets",
      quantityKg: 22500,
      valueEur: 31000,
      transportPrice: 1350,
      currency: "GBP",
      origin: "Turnhout, Belgium",
      destination: "Hamburg, Germany",
      warehouse: "Turnhout",
      scheduledDate: "2026-11-29",
      annex7Required: false,
      notes: "Changed destination to Hamburg",
    });
    assert.equal(editSoRes.error, undefined);

    const viewAfterEdit = await store.view(staffSession);
    const editedSo = viewAfterEdit.state.orders.find((o) => o.id === createdSo.id);
    assert.ok(editedSo);
    assert.equal(editedSo.number, "SO-2026-6001-B");
    assert.equal(editedSo.customerCompany, "Hansa Polymer Trading AG");
    assert.equal(editedSo.sellerName, "Marieke Janssens");
    assert.equal(editedSo.valueEur, 31000);
    assert.equal(editedSo.transportPrice, 1350);
    assert.equal(editedSo.currency, "GBP");
    assert.equal(editedSo.origin, "Turnhout, Belgium");
    assert.equal(editedSo.destination, "Hamburg, Germany");
    assert.equal(editedSo.warehouse, "Turnhout");
    assert.equal(editedSo.scheduledDate, "2026-11-29");
    assert.equal(editedSo.annex7Required, false);

    // 3. Delete SO
    const delSoRes = await store.run(staffSession, "deletePurchase", {
      id: editedSo.id,
      number: editedSo.number,
    });
    assert.equal(delSoRes.error, undefined);

    const viewAfterDelete = await store.view(staffSession);
    assert.equal(
      viewAfterDelete.state.orders.filter((o) => !o.isRemoved).some((o) => o.id === editedSo.id),
      false
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Scenario 5, 6, 7 & 8: PO/SO Schedule Linking by Stable ID, Auto-Population, Type Validation, and Historical Accuracy after PO/SO Changes", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const { staffSession, workerSession, workerProfile } = await setupUsers(store);

    // Create PO and SO first
    await store.run(staffSession, "createPurchase", {
      type: "PO",
      number: "PO-2026-7100",
      supplier: "Nordic Poly Supplies",
      purchaserName: "Sam Purchaser",
      material: "PET Clear Flakes",
      quantityKg: 15000,
      valueEur: 12000,
      transportPrice: 600,
      currency: "EUR",
      origin: "Malmo, Sweden",
      destination: "Bornem, Belgium",
      warehouse: "Bornem",
      pickupDate: "2026-11-20",
      scheduledDate: "2026-11-22",
      annex7Required: true,
    });

    await store.run(staffSession, "createPurchase", {
      type: "SO",
      number: "SO-2026-8100",
      customer: "Iberia Plastics SL",
      sellerName: "Sam Seller",
      material: "HDPE Blow Molding",
      quantityKg: 10000,
      valueEur: 14500,
      transportPrice: 750,
      currency: "EUR",
      origin: "Bornem, Belgium",
      destination: "Valencia, Spain",
      warehouse: "Bornem",
      scheduledDate: "2026-11-23",
      annex7Required: true,
    });

    const initialView = await store.view(staffSession);
    const po = initialView.state.orders.find((o) => o.number === "PO-2026-7100")!;
    const so = initialView.state.orders.find((o) => o.number === "SO-2026-8100")!;
    assert.ok(po.id);
    assert.ok(so.id);
    const orderCountBeforeSchedules = initialView.state.orders.length;

    // Cross-type validation: Unloading schedule must reject SO; Loading schedule must reject PO
    const invalidUnloadWithSo = await store.run(staffSession, "createOperationSchedule", {
      type: "unloading",
      purchaseOrderId: so.id,
      poSoNumber: so.number,
      assignedWorkerId: workerProfile.id,
    });
    assert.ok(invalidUnloadWithSo.error);
    assert.match(invalidUnloadWithSo.error, /Unloading schedules must link to a Purchase Order/i);

    const invalidLoadWithPo = await store.run(staffSession, "createOperationSchedule", {
      type: "loading",
      purchaseOrderId: po.id,
      poSoNumber: po.number,
      assignedWorkerId: workerProfile.id,
    });
    assert.ok(invalidLoadWithPo.error);
    assert.match(invalidLoadWithPo.error, /Loading schedules must link to a Sales Order/i);

    // 5 & 7. Link PO to an Unloading Schedule by stable purchaseOrderId and verify auto-population of supplier & commercial details
    const unloadRes = await store.run(staffSession, "createOperationSchedule", {
      type: "unloading",
      purchaseOrderId: po.id,
      assignedWorkerId: workerProfile.id,
    });
    assert.equal(unloadRes.error, undefined);

    // 6 & 7. Link SO to a Loading Schedule by stable purchaseOrderId and verify auto-population of customer & commercial details
    const loadRes = await store.run(staffSession, "createOperationSchedule", {
      type: "loading",
      purchaseOrderId: so.id,
      assignedWorkerId: workerProfile.id,
    });
    assert.equal(loadRes.error, undefined);

    const viewAfterSchedules = await store.view(staffSession);
    // Verify no duplicate PO/SO records were created when assigning schedules
    assert.equal(viewAfterSchedules.state.orders.length, orderCountBeforeSchedules);

    const unloadSched = viewAfterSchedules.state.schedules.find((s) => s.type === "unloading")!;
    const loadSched = viewAfterSchedules.state.schedules.find((s) => s.type === "loading")!;
    assert.ok(unloadSched);
    assert.ok(loadSched);

    // Verify stable ID linking and auto-populated details
    assert.equal(unloadSched.purchaseOrderId, po.id);
    assert.equal(unloadSched.poSoNumber, "PO-2026-7100");
    assert.equal(unloadSched.partnerName, "Nordic Poly Supplies");
    assert.equal(unloadSched.purchaserName, "Sam Purchaser");
    assert.equal(unloadSched.purchasingPrice, 12000);
    assert.equal(unloadSched.transportPrice, 600);
    assert.equal(unloadSched.origin, "Malmo, Sweden");
    assert.equal(unloadSched.destination, "Bornem, Belgium");
    assert.equal(unloadSched.pickupDate, "2026-11-20");
    assert.equal(unloadSched.scheduledDate, "2026-11-22");
    assert.equal(unloadSched.annex7Required, true);
    assert.equal(unloadSched.items.length, 1);
    assert.equal(unloadSched.items[0].materialName, "PET Clear Flakes");

    assert.equal(loadSched.purchaseOrderId, so.id);
    assert.equal(loadSched.poSoNumber, "SO-2026-8100");
    assert.equal(loadSched.partnerName, "Iberia Plastics SL");
    assert.equal(loadSched.sellerName, "Sam Seller");
    assert.equal(loadSched.sellingPrice, 14500);
    assert.equal(loadSched.transportPrice, 750);
    assert.equal(loadSched.origin, "Bornem, Belgium");
    assert.equal(loadSched.destination, "Valencia, Spain");
    assert.equal(loadSched.scheduledDate, "2026-11-23");
    assert.equal(loadSched.annex7Required, true);

    // 8a. Edit active PO and verify linked active unloading schedule synchronizes automatically
    const editActivePo = await store.run(staffSession, "editPurchase", {
      id: po.id,
      number: "PO-2026-7100",
      newNumber: "PO-2026-7100-UPD",
      supplier: "Nordic Poly Supplies AB",
      purchaserName: "Updated Purchaser",
      material: "PET Clear Flakes",
      quantityKg: 15000,
      valueEur: 13500,
      transportPrice: 680,
      origin: "Gothenburg, Sweden",
      destination: "Bornem, Belgium",
    });
    assert.equal(editActivePo.error, undefined);

    const viewAfterActivePoEdit = await store.view(staffSession);
    const syncedUnloadSched = viewAfterActivePoEdit.state.schedules.find((s) => s.id === unloadSched.id)!;
    assert.equal(syncedUnloadSched.purchaseOrderId, po.id);
    assert.equal(syncedUnloadSched.poSoNumber, "PO-2026-7100-UPD");
    assert.equal(syncedUnloadSched.partnerName, "Nordic Poly Supplies AB");
    assert.equal(syncedUnloadSched.purchaserName, "Updated Purchaser");
    assert.equal(syncedUnloadSched.purchasingPrice, 13500);
    assert.equal(syncedUnloadSched.transportPrice, 680);
    assert.equal(syncedUnloadSched.origin, "Gothenburg, Sweden");

    // 8b. Complete the unloading schedule, then edit the PO again and verify the completed schedule preserves its historical accuracy!
    await store.run(workerSession, "startOperationSchedule", { id: unloadSched.id });
    await store.run(workerSession, "uploadScheduleAttachment", {
      scheduleId: unloadSched.id,
      name: "weighbridge.jpg",
      kind: "weighbridge_ticket",
      mime: "image/jpeg",
      size: 1024,
      url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    });
    await store.run(workerSession, "submitOperationSchedule", {
      id: unloadSched.id,
      workerRemarks: "Unloaded 15,000 kg net",
    });
    const verifyRes = await store.run(staffSession, "verifyOperationSchedule", {
      id: unloadSched.id,
      action: "approve",
    });
    assert.equal(verifyRes.error, undefined);

    // Now edit the PO after the schedule is completed
    await store.run(staffSession, "editPurchase", {
      id: po.id,
      number: "PO-2026-7100-UPD",
      supplier: "Post-Completion Supplier Change",
      material: "PET Clear Flakes",
      quantityKg: 15000,
      valueEur: 99999,
    });

    const viewAfterCompletedEdit = await store.view(staffSession);
    const completedUnloadSched = viewAfterCompletedEdit.state.schedules.find((s) => s.id === unloadSched.id)!;
    assert.equal(completedUnloadSched.status, "completed");
    assert.equal(completedUnloadSched.purchaseOrderId, po.id);
    // Completed operation preserves historical snapshot
    assert.equal(completedUnloadSched.partnerName, "Nordic Poly Supplies AB");
    assert.equal(completedUnloadSched.purchasingPrice, 13500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Scenario 9 & 10: Unauthorized Workers cannot perform Staff CRUD operations, and all operations persist across logout, login, and fresh adapter reload", async () => {
  const { dir, filePath, store } = createTestAdapter();
  try {
    const { staffSession, workerSession } = await setupUsers(store);

    // 9. Worker permission checks
    assert.equal(canPerform("worker", "create-order"), false);
    assert.equal(canPerform("worker", "edit-order"), false);
    assert.equal(canPerform("worker", "delete-order"), false);
    assert.equal(canPerform("worker", "remove-order"), false);

    // Staff creates a PO
    await store.run(staffSession, "createPurchase", {
      type: "PO",
      number: "PO-2026-9001",
      supplier: "Persistent Supplier NV",
      purchaserName: "Sam Staff",
      material: "HDPE Pipe Grade",
      quantityKg: 18000,
      valueEur: 16400,
      transportPrice: 520,
      currency: "EUR",
      origin: "Brussels, Belgium",
      destination: "Bornem, Belgium",
      warehouse: "Bornem",
      annex7Required: true,
    });

    // Worker attempts to create PO -> blocked
    const workerCreate = await store.run(workerSession, "createPurchase", {
      type: "PO",
      number: "PO-WORKER-HACK",
      supplier: "Unauthorized",
      material: "Plastic",
      quantityKg: 100,
      valueEur: 100,
    });
    assert.ok(workerCreate.error);

    // Worker attempts to edit PO -> blocked
    const workerEdit = await store.run(workerSession, "editPurchase", {
      number: "PO-2026-9001",
      supplier: "Worker Tamper",
      material: "Plastic",
      quantityKg: 100,
      valueEur: 100,
    });
    assert.ok(workerEdit.error);

    // Worker attempts to delete PO -> blocked
    const workerDelete = await store.run(workerSession, "deletePurchase", {
      number: "PO-2026-9001",
    });
    assert.ok(workerDelete.error);

    const workerRemove = await store.run(workerSession, "removePoSoNumber", {
      number: "PO-2026-9001",
    });
    assert.ok(workerRemove.error);

    // 10. Logout, re-instantiate adapter from disk (simulating full page refresh / server restart), and login again
    await store.signOut(staffSession);

    const reloadedStore = createLocalAdapter(filePath, TEST_ENV, () => "2026-11-21T10:00:00.000Z");
    const relogin = await reloadedStore.signIn("staff@example.com", "staff-pass-1");
    assert.ok(relogin.ok);

    const refreshedView = await reloadedStore.view(relogin.value.sessionId);
    const persistedPo = refreshedView.state.orders.find((o) => o.number === "PO-2026-9001");
    assert.ok(persistedPo, "PO must persist after logout, adapter reload, and login");
    assert.equal(persistedPo.supplier, "Persistent Supplier NV");
    assert.equal(persistedPo.purchaserName, "Sam Staff");
    assert.equal(persistedPo.valueEur, 16400);
    assert.equal(persistedPo.transportPrice, 520);
    assert.equal(persistedPo.origin, "Brussels, Belgium");
    assert.equal(persistedPo.destination, "Bornem, Belgium");
    assert.equal(persistedPo.annex7Required, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
