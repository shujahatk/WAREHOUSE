import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import { issues, netKg, requestLineSchema } from "./schemas.ts";

const now = "2026-10-22T08:00:00.000Z";
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

function adapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-"));
  const file = path.join(dir, "store.json");
  return { dir, store: createLocalAdapter(file, env(), () => now) };
}

test("request lines require net weight above zero and equal to gross minus tare", () => {
  assert.equal(netKg(30, 10), 20);
  const rejected = requestLineSchema.safeParse({
    id: "00000000-0000-4000-8000-000000000001",
    requestId: "00000000-0000-4000-8000-000000000002",
    materialId: "00000000-0000-4000-8000-000000000003",
    packagingTypeId: "00000000-0000-4000-8000-000000000004",
    packageCount: 2,
    grossKg: 10,
    tareTotalKg: 10,
    netKg: 0,
  });
  assert.equal(rejected.success, false);
  if (!rejected.success) assert.match(issues(rejected.error), /greater than zero/);
  const mismatched = requestLineSchema.safeParse({
    id: "00000000-0000-4000-8000-000000000001",
    requestId: "00000000-0000-4000-8000-000000000002",
    materialId: "00000000-0000-4000-8000-000000000003",
    packagingTypeId: "00000000-0000-4000-8000-000000000004",
    packageCount: 2,
    grossKg: 30,
    tareTotalKg: 10,
    netKg: 15,
  });
  assert.equal(mismatched.success, false);
});

test("the local store seeds one owner and reference data, and no operational records", async () => {
  const { dir, store } = adapter();
  try {
    const first = await store.snapshot();
    assert.equal(first.users.length, 1);
    assert.equal(first.users[0]?.role, "owner");
    assert.equal(first.users[0]?.email, "owner@example.com");
    assert.equal(first.purchaseOrders.length, 0);
    assert.equal(first.shipments.length, 0);
    assert.equal(first.requests.length, 0);
    assert.equal(first.stockBalances.length, 0);
    assert.equal(first.warehouses[0]?.name, "Bornem");
    const reopened = createLocalAdapter(path.join(dir, "store.json"), env(), () => now);
    const second = await reopened.snapshot();
    assert.equal(second.users.length, 1);
    assert.notEqual(second.users[0]?.passwordHash, "owner-pass-1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sign-in, request numbers, and stock entry stay behind the interfaces", async () => {
  const { dir, store } = adapter();
  try {
    const denied = await store.signIn("owner@example.com", "wrong-pass");
    assert.equal(denied.ok, false);
    const signed = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(signed.ok, true);
    if (!signed.ok) return;

    // Owner adds a Bremen Worker account; Worker handles warehouse unloading & completion
    const addedWorker = await store.run(signed.value.sessionId, "addUser", {
      name: "Bremen Worker",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });
    assert.equal(addedWorker.error, undefined);
    const workerSigned = await store.signIn("worker@example.com", "worker-pass-1");
    assert.equal(workerSigned.ok, true);
    if (!workerSigned.ok) return;

    const snapshot = await store.snapshot();
    const owner = snapshot.users.find((u) => u.role === "owner");
    const worker = snapshot.users.find((u) => u.role === "worker");
    assert.ok(owner && worker);

    const created = await store.run(workerSigned.value.sessionId, "addInbound", {
      number: "CNTR-1",
      po: "PO-1",
      supplier: "North Mill",
      warehouse: "Bornem",
    });
    assert.equal(created.error, undefined);
    assert.equal(created.state.containers[0]?.number, "CNTR-1");
    const weighed = await store.run(workerSigned.value.sessionId, "saveMaterial", {
      shipment: "CNTR-1",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 50,
      packagingId: snapshot.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.equal(weighed.error, undefined);
    assert.match(weighed.notice ?? "", /REQ-2026-0001/);
    const again = await store.run(workerSigned.value.sessionId, "saveMaterial", {
      shipment: "CNTR-1",
      direction: "inbound",
      material: "LDPE film",
      mode: "weight",
      grossKg: 40,
      packagingId: snapshot.packagingTypes[0]?.id,
      packagingQty: 1,
      tarePerUnitKg: 25,
      noTare: false,
      count: null,
    });
    assert.match(again.notice ?? "", /REQ-2026-0001/);
    const persisted = await store.snapshot();
    const request = persisted.requests[0];
    assert.equal(request?.number, "REQ-2026-0001");
    assert.equal(request?.status, "submitted");
    assert.equal(persisted.stockMovements.length, 0);

    // Owner approves the request, but cannot complete the operation
    const approved = await store.services().requests.approve({ requestId: request!.id, actorId: owner.id });
    assert.equal(approved.ok, true);
    await assert.rejects(
      () => store.services().requests.complete({ requestId: request!.id, actorId: owner.id }),
      /You do not have permission/,
    );

    // Assigned Worker completes the approved operation into stock
    const completed = await store.services().requests.complete({ requestId: request!.id, actorId: worker.id });
    assert.equal(completed.ok, true);
    const after = await store.snapshot();
    assert.equal(after.stockBalances[0]?.weightKg, 40);
    const repeat = await store.services().requests.complete({ requestId: request!.id, actorId: worker.id });
    assert.equal(repeat.ok, true);
    const still = await store.snapshot();
    assert.equal(still.stockMovements.length, after.stockMovements.length);
    assert.equal(still.stockBalances[0]?.weightKg, 40);
    const blocked = await store.services().users.deactivate({ email: owner.email, actorId: owner.id });
    assert.equal(blocked.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stock movement cannot drive a balance below zero and is idempotent per line", async () => {
  const { dir, store } = adapter();
  try {
    const signed = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    await store.run(signed.value.sessionId, "addUser", {
      name: "Bremen Worker",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });
    const snapshot = await store.snapshot();
    const worker = snapshot.users.find((u) => u.role === "worker");
    assert.ok(worker);
    const material = snapshot.materials[0];
    const warehouse = snapshot.warehouses[0];
    assert.ok(material && warehouse);
    const requestId = "00000000-0000-4000-8000-000000000010";
    const lineId = "00000000-0000-4000-8000-000000000011";
    const negative = await store.services().inventory.applyMovement({
      requestId,
      requestLineId: lineId,
      materialId: material.id,
      warehouseId: warehouse.id,
      direction: "out",
      weightKg: 5,
      actorId: worker.id,
    });
    assert.equal(negative.ok, false);
    const inbound = await store.services().inventory.applyMovement({
      requestId,
      requestLineId: lineId,
      materialId: material.id,
      warehouseId: warehouse.id,
      direction: "in",
      weightKg: 8,
      actorId: worker.id,
    });
    assert.equal(inbound.ok, true);
    const duplicate = await store.services().inventory.applyMovement({
      requestId,
      requestLineId: lineId,
      materialId: material.id,
      warehouseId: warehouse.id,
      direction: "in",
      weightKg: 8,
      actorId: worker.id,
    });
    assert.equal(duplicate.ok, true);
    if (inbound.ok && duplicate.ok) assert.equal(duplicate.value.id, inbound.value.id);
    const balances = await store.services().inventory.balances();
    assert.equal(balances[0]?.weightKg, 8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file storage puts, signs, and deletes a blob", async () => {
  const { dir, store } = adapter();
  try {
    const services = store.services();
    const saved = await services.files.put({ name: "proof.pdf", mime: "application/pdf", bytes: Buffer.from("hello") });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const signed = await services.files.signedUrl(saved.value.key);
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    const url = new URL(signed.value.url, "http://local");
    const opened = await store.openFile(saved.value.key, url.searchParams.get("exp") ?? "", url.searchParams.get("sig") ?? "", Date.parse(now));
    assert.equal(opened?.bytes.toString(), "hello");
    const removed = await services.files.delete(saved.value.key);
    assert.equal(removed.ok, true);
    const missing = await store.openFile(saved.value.key, url.searchParams.get("exp") ?? "", url.searchParams.get("sig") ?? "", Date.parse(now));
    assert.equal(missing, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("screens do not import legacy data or browser storage", () => {
  const roots = [path.join(process.cwd(), "src", "app"), path.join(process.cwd(), "src", "components")];
  const forbidden = ["demo-state", "demo-data", "demo-session", "demo-accounts", "document-files", "sessionStorage", "localStorage"];
  const hits: string[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        if (source.includes(token)) hits.push(`${path.relative(process.cwd(), file)}:${token}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}
