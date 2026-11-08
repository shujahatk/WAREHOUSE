import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "../../domain/local-adapter.ts";

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

function setup(nowFn: () => string) {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-logistics-"));
  const file = path.join(dir, "store.json");
  const store = createLocalAdapter(file, env(), nowFn);
  return { dir, store };
}

test("outbound dispatch requires carrier name without obsolete Swiss customs or seller confirmation gates", async () => {
  const currentTime = "2026-10-22T08:00:00.000Z";
  const { store } = setup(() => currentTime);

  // 1. Authenticate Admin (owner)
  const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
  assert.equal(ownerAuth.ok, true);
  if (!ownerAuth.ok) return;

  // Add a Staff (manager) user and a Worker user
  const managerAdd = await store.run(ownerAuth.value.sessionId, "addUser", {
    name: "Mark Staff",
    email: "manager@example.com",
    role: "manager",
    password: "manager-pass-1",
  });
  assert.equal(managerAdd.error, undefined);

  const workerAdd = await store.run(ownerAuth.value.sessionId, "addUser", {
    name: "Will Worker",
    email: "worker@example.com",
    role: "worker",
    warehouse: "Bremen",
    password: "worker-pass-1",
  });
  assert.equal(workerAdd.error, undefined);

  const workerAuth = await store.signIn("worker@example.com", "worker-pass-1");
  assert.equal(workerAuth.ok, true);
  if (!workerAuth.ok) return;

  // 2. Create outbound shipment (requires SO/PO, container, customer, warehouse)
  const createOutbound = await store.run(workerAuth.value.sessionId, "addOutbound", {
    number: "OUT-001",
    po: "SO-900",
    customer: "Meridian Packaging",
    warehouse: "Bremen",
    container: "CONT-777",
  });
  assert.equal(createOutbound.error, undefined);

  // 3. Advance to Loading, then to Loaded
  const stepToLoading = await store.run(workerAuth.value.sessionId, "dispatch", {
    number: "OUT-001",
  });
  assert.equal(stepToLoading.error, undefined);

  const stepToLoaded = await store.run(workerAuth.value.sessionId, "dispatch", {
    number: "OUT-001",
  });
  assert.equal(stepToLoaded.error, undefined);

  // 4. Advancing Loaded -> Dispatched without carrier is blocked
  const dispatchBlocked = await store.run(workerAuth.value.sessionId, "dispatch", {
    number: "OUT-001",
  });
  assert.equal(dispatchBlocked.error, "Enter a carrier name before dispatch.");

  // 5. Enter carrier name
  const carrierSaved = await store.run(workerAuth.value.sessionId, "saveCarrier", {
    number: "OUT-001",
    carrier: "EuroFreight Logistics",
  });
  assert.equal(carrierSaved.error, undefined);

  // 6. Dispatch now succeeds immediately without requiring Swiss customs or seller confirmation
  const finalDispatch = await store.run(workerAuth.value.sessionId, "dispatch", {
    number: "OUT-001",
  });
  assert.equal(finalDispatch.error, undefined);

  const snap = await store.snapshot();
  const shipment = snap.shipments.find((s) => s.reference === "OUT-001");
  assert.ok(shipment);
  assert.equal(shipment.status, "Dispatched");
  assert.equal(shipment.carrierName, "EuroFreight Logistics");
});

test("demurrage uses unloading timestamps and annex 7 stays on the linked shipment", async () => {
  let currentTime = "2026-10-22T08:00:00.000Z";
  const { store } = setup(() => currentTime);

  const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
  assert.equal(ownerAuth.ok, true);
  if (!ownerAuth.ok) return;

  await store.run(ownerAuth.value.sessionId, "addUser", {
    name: "Will Worker",
    email: "worker@example.com",
    role: "worker",
    warehouse: "Bremen",
    password: "worker-pass-1",
  });
  const workerAuth = await store.signIn("worker@example.com", "worker-pass-1");
  assert.equal(workerAuth.ok, true);
  if (!workerAuth.ok) return;

  // 1. Create inbound shipment
  const createInbound = await store.run(workerAuth.value.sessionId, "addInbound", {
    number: "IN-DEM-001",
    po: "PO-DEM-1",
    supplier: "North Mill",
    warehouse: "Bremen",
  });
  assert.equal(createInbound.error, undefined);

  let snap = await store.snapshot();
  const shipment1 = snap.shipments.find((s) => s.reference === "IN-DEM-001");
  assert.ok(shipment1);
  let demurrage1 = snap.demurrageRecords.find((d) => d.shipmentId === shipment1.id);
  assert.ok(demurrage1);
  assert.equal(demurrage1.startedAt, null);
  assert.equal(demurrage1.freeMinutes, 120);
  assert.equal(demurrage1.ratePerMinute, 1);

  // 2. Advance Planned -> Registered -> Unloading
  currentTime = "2026-10-22T08:15:00.000Z";
  await store.run(workerAuth.value.sessionId, "unload", { number: "IN-DEM-001" }); // -> Registered

  currentTime = "2026-10-22T08:30:00.000Z";
  await store.run(workerAuth.value.sessionId, "unload", { number: "IN-DEM-001" }); // -> Unloading

  snap = await store.snapshot();
  demurrage1 = snap.demurrageRecords.find((d) => d.shipmentId === shipment1.id);
  assert.equal(demurrage1?.startedAt, "2026-10-22T08:30:00.000Z");

  // 3. Complete inbound shipment after 180 minutes of unloading (60 minutes billable demurrage)
  currentTime = "2026-10-22T11:30:00.000Z"; // 3 hours = 180 minutes
  await store.run(workerAuth.value.sessionId, "unload", { number: "IN-DEM-001" }); // -> Completed

  snap = await store.snapshot();
  demurrage1 = snap.demurrageRecords.find((d) => d.shipmentId === shipment1.id);
  assert.equal(demurrage1?.completedAt, "2026-10-22T11:30:00.000Z");
  assert.equal(demurrage1?.elapsedMinutes, 180);
  assert.equal(demurrage1?.billableMinutes, 60); // 180 - 120 free
  assert.equal(demurrage1?.chargeEur, 60); // 60 * 1 EUR/min

  // 4. Test within free period (e.g. 60 min elapsed)
  const createInbound2 = await store.run(workerAuth.value.sessionId, "addInbound", {
    number: "IN-DEM-002",
    po: "PO-DEM-2",
    supplier: "North Mill",
    warehouse: "Bremen",
  });
  assert.equal(createInbound2.error, undefined);

  currentTime = "2026-10-22T12:00:00.000Z";
  await store.run(workerAuth.value.sessionId, "unload", { number: "IN-DEM-002" }); // -> Registered
  currentTime = "2026-10-22T12:10:00.000Z";
  await store.run(workerAuth.value.sessionId, "unload", { number: "IN-DEM-002" }); // -> Unloading
  currentTime = "2026-10-22T13:10:00.000Z"; // 60 min elapsed
  await store.run(workerAuth.value.sessionId, "unload", { number: "IN-DEM-002" }); // -> Completed

  snap = await store.snapshot();
  const shipment2 = snap.shipments.find((s) => s.reference === "IN-DEM-002");
  const demurrage2 = snap.demurrageRecords.find((d) => d.shipmentId === shipment2?.id);
  assert.equal(demurrage2?.elapsedMinutes, 60);
  assert.equal(demurrage2?.billableMinutes, 0);
  assert.equal(demurrage2?.chargeEur, 0);

  // 5. Annex 7 upload (by Worker) and approval (by Owner) stays linked to shipment
  const annexUpload = await store.run(workerAuth.value.sessionId, "addAnnex", {
    shipment: "IN-DEM-001",
    direction: "inbound",
    reference: "ANNEX7-2026-0042",
    name: "annex7-notification.pdf",
    mime: "application/pdf",
    size: 4096,
    notes: "Waste transboundary shipment notification",
    bytesBase64: Buffer.from("%PDF-1.4 dummy-annex-7-content").toString("base64"),
  });
  assert.equal(annexUpload.error, undefined);

  snap = await store.snapshot();
  const updatedShipment = snap.shipments.find((s) => s.reference === "IN-DEM-001");
  assert.equal(updatedShipment?.annex7Required, true);

  const annexRecord = snap.annex7Records.find((a) => a.reference === "ANNEX7-2026-0042");
  assert.ok(annexRecord);
  assert.equal(annexRecord.shipmentId, shipment1.id);
  assert.equal(annexRecord.status, "uploaded");

  // Review Annex 7
  const reviewResult = await store.run(ownerAuth.value.sessionId, "reviewAnnex", {
    id: annexRecord.id,
  });
  assert.equal(reviewResult.error, undefined);

  // Owner Approve Annex 7
  const approveResult = await store.run(ownerAuth.value.sessionId, "approveAnnex", {
    id: annexRecord.id,
  });
  assert.equal(approveResult.error, undefined);

  snap = await store.snapshot();
  const finalAnnex = snap.annex7Records.find((a) => a.id === annexRecord.id);
  assert.equal(finalAnnex?.status, "approved");
});

test("demurrage boundary conditions at 119, 120, and 121 minutes (120-minute free period, 1 EUR/min after)", async () => {
  let currentTime = "2026-10-22T08:00:00.000Z";
  const { store } = setup(() => currentTime);

  const ownerAuth = await store.signIn("owner@example.com", "owner-pass-1");
  assert.equal(ownerAuth.ok, true);
  if (!ownerAuth.ok) return;

  await store.run(ownerAuth.value.sessionId, "addUser", {
    name: "Will Worker",
    email: "worker@example.com",
    role: "worker",
    warehouse: "Bremen",
    password: "worker-pass-1",
  });
  const workerAuth = await store.signIn("worker@example.com", "worker-pass-1");
  assert.equal(workerAuth.ok, true);
  if (!workerAuth.ok) return;

  const boundaries = [
    { ref: "IN-BOUND-119", po: "PO-119", minutes: 119, expectedBillable: 0, expectedCharge: 0 },
    { ref: "IN-BOUND-120", po: "PO-120", minutes: 120, expectedBillable: 0, expectedCharge: 0 },
    { ref: "IN-BOUND-121", po: "PO-121", minutes: 121, expectedBillable: 1, expectedCharge: 1 },
  ];

  const startMs = Date.parse("2026-10-22T10:00:00.000Z");

  for (const item of boundaries) {
    currentTime = new Date(startMs).toISOString();
    const added = await store.run(workerAuth.value.sessionId, "addInbound", {
      number: item.ref,
      po: item.po,
      supplier: "North Mill",
      warehouse: "Bremen",
    });
    assert.equal(added.error, undefined);

    // Advance Planned -> Registered -> Unloading (starts demurrage timer at startMs)
    await store.run(workerAuth.value.sessionId, "unload", { number: item.ref });
    await store.run(workerAuth.value.sessionId, "unload", { number: item.ref });

    // Complete after exact elapsed minutes
    currentTime = new Date(startMs + item.minutes * 60 * 1000).toISOString();
    await store.run(workerAuth.value.sessionId, "unload", { number: item.ref });

    const snap = await store.snapshot();
    const shipment = snap.shipments.find((s) => s.reference === item.ref)!;
    const dem = snap.demurrageRecords.find((d) => d.shipmentId === shipment.id)!;
    assert.equal(dem.elapsedMinutes, item.minutes);
    assert.equal(dem.freeMinutes, 120);
    assert.equal(dem.ratePerMinute, 1);
    assert.equal(dem.billableMinutes, item.expectedBillable);
    assert.equal(dem.chargeEur, item.expectedCharge);
  }
});
