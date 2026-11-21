import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import { visibleOrders, type Actor } from "./view.ts";

const now = "2026-11-14T12:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
  ],
  companies: [
    { name: "Acme Polymers", kind: "supplier" },
    { name: "Meridian Packaging", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
  ],
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
  const dir = mkdtempSync(path.join(tmpdir(), "rm-work-test-"));
  const store = createLocalAdapter(path.join(dir, "store.json"), env(), () => now);
  return { dir, store };
}

test("1. Worker PO/SO Assignment Workflow: Staff assigns and schedules; Worker sees only assigned records", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // 1. Create Staff and two Workers
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Will Worker",
      email: "will@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "will-pass-1",
    });

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "bob@example.com",
      role: "worker",
      warehouse: "Turnhout",
      password: "bob-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    const willSign = await store.signIn("will@example.com", "will-pass-1");
    const bobSign = await store.signIn("bob@example.com", "bob-pass-1");
    assert.equal(staffSign.ok, true);
    assert.equal(willSign.ok, true);
    assert.equal(bobSign.ok, true);
    if (!staffSign.ok || !willSign.ok || !bobSign.ok) return;

    // 2. Staff creates PO-1001 and PO-1002
    await store.run(staffSign.value.sessionId, "createPurchase", {
      number: "PO-2026-1001",
      supplier: "Acme Polymers",
      material: "LDPE",
      quantityKg: 20000,
      valueEur: 30000,
      notes: "Urgent shipment for Bornem",
    });

    await store.run(staffSign.value.sessionId, "createPurchase", {
      number: "PO-2026-1002",
      supplier: "Acme Polymers",
      material: "LDPE",
      quantityKg: 15000,
      valueEur: 22500,
      notes: "Tomorrow shipment for Turnhout",
    });

    // Worker cannot create PO
    const workerPoCreate = await store.run(willSign.value.sessionId, "createPurchase", {
      number: "PO-2026-9999",
      supplier: "Acme Polymers",
      material: "LDPE",
      quantityKg: 1000,
      valueEur: 1500,
    });
    assert.notEqual(workerPoCreate.error, undefined);

    // Initial check: Will Worker sees 0 orders before assignment
    const willViewInitial = await store.view(willSign.value.sessionId);
    const willActor: Actor = { name: "Will Worker", role: "worker", warehouse: "Bornem", email: "will@example.com" };
    const willOrdersBefore = visibleOrders(willViewInitial.state, willActor);
    assert.equal(willOrdersBefore.length, 0);

    // 3. Staff assigns PO-1001 to Will Worker scheduled for Today (2026-11-14)
    const assignToday = await store.run(staffSign.value.sessionId, "assignWorkerPo", {
      poNumber: "PO-2026-1001",
      workerId: willSign.value.profile.id,
      scheduledDate: "2026-11-14",
      notes: "Unload at Bay 3",
    });
    assert.equal(assignToday.error, undefined);

    // 4. Staff assigns PO-1002 to Will Worker scheduled for Tomorrow (2026-11-15)
    const assignTomorrow = await store.run(staffSign.value.sessionId, "assignWorkerPo", {
      poNumber: "PO-2026-1002",
      workerId: willSign.value.profile.id,
      scheduledDate: "2026-11-15",
      notes: "Unload at Bay 1 tomorrow",
    });
    assert.equal(assignTomorrow.error, undefined);

    // 5. Worker view isolation: Will sees both assigned POs; Bob sees 0
    const willView = await store.view(willSign.value.sessionId);
    const bobView = await store.view(bobSign.value.sessionId);
    const bobActor: Actor = { name: "Bob Worker", role: "worker", warehouse: "Turnhout", email: "bob@example.com" };

    const willOrders = visibleOrders(willView.state, willActor);
    const bobOrders = visibleOrders(bobView.state, bobActor);
    assert.equal(willOrders.length, 2);
    assert.equal(bobOrders.length, 0);

    // Check scheduling: Today vs Upcoming
    const todayOrders = willOrders.filter((o) => o.scheduledDate === "2026-11-14");
    const upcomingOrders = willOrders.filter((o) => (o.scheduledDate ?? "") > "2026-11-14");
    assert.equal(todayOrders.length, 1);
    assert.equal(todayOrders[0].number, "PO-2026-1001");
    assert.equal(upcomingOrders.length, 1);
    assert.equal(upcomingOrders[0].number, "PO-2026-1002");

    // 6. Worker completes work on PO-1001
    const completeRes = await store.run(willSign.value.sessionId, "completeWorkerPo", {
      poNumber: "PO-2026-1001",
      completionNotes: "Unloaded 20 pallets without damage. Weight slip verified.",
    });
    assert.equal(completeRes.error, undefined);

    const willViewAfter = await store.view(willSign.value.sessionId);
    const updatedPo = willViewAfter.state.orders.find((o) => o.number === "PO-2026-1001");
    assert.equal(updatedPo?.executionStatus, "completed");
    assert.equal(updatedPo?.completionNotes, "Unloaded 20 pallets without damage. Weight slip verified.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("2. New Offers User Account Type: Registration -> Pending Approval -> Admin Approval/Rejection", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // 1. New user registers as Offers User
    const regRes = await store.run(null, "registerOffersUser", {
      name: "Olivia Offers",
      email: "olivia@trader.com",
      password: "olivia-pass-1",
      company: "Trader Global BV",
      notes: "European plastics trading desk",
    });
    assert.equal(regRes.error, undefined);

    // 2. Pending user CANNOT sign in
    const signInPending = await store.signIn("olivia@trader.com", "olivia-pass-1");
    assert.equal(signInPending.ok, false);
    assert.match(signInPending.error, /pending administrator approval/i);

    // 3. Admin sees registration and approves
    const adminView = await store.view(ownerSign.value.sessionId);
    const pendingUser = adminView.state.accounts.find((a) => a.email === "olivia@trader.com");
    assert.equal(pendingUser?.approvalStatus, "pending");

    const approveRes = await store.run(ownerSign.value.sessionId, "decideOffersUserRegistration", {
      userId: pendingUser?.id,
      decision: "approve",
      notes: "Verified VAT number and trade license.",
    });
    assert.equal(approveRes.error, undefined);

    // 4. Approved user CAN now sign in
    const signInApproved = await store.signIn("olivia@trader.com", "olivia-pass-1");
    assert.equal(signInApproved.ok, true);
    if (!signInApproved.ok) return;
    assert.equal(signInApproved.value.profile.role, "offers_user");
    assert.equal(signInApproved.value.profile.approvalStatus, "approved");

    // 5. Test rejection workflow on a second user
    await store.run(null, "registerOffersUser", {
      name: "Spam User",
      email: "spam@untrusted.com",
      password: "spam-pass-1",
    });
    const spamView = await store.view(ownerSign.value.sessionId);
    const spamUser = spamView.state.accounts.find((a) => a.email === "spam@untrusted.com");
    await store.run(ownerSign.value.sessionId, "decideOffersUserRegistration", {
      userId: spamUser?.id,
      decision: "reject",
      notes: "Unverified identity",
    });

    const signInRejected = await store.signIn("spam@untrusted.com", "spam-pass-1");
    assert.equal(signInRejected.ok, false);
    assert.match(signInRejected.error, /rejected/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("3. Offers User Portal & 9-Field Selling Offer Submission linked to PO", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Create moderator and purchasing offer
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      role: "moderator",
      password: "mod-pass-1",
    });
    const modSign = await store.signIn("moderator@example.com", "mod-pass-1");
    assert.equal(modSign.ok, true);
    if (!modSign.ok) return;

    await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "LDPE Film Grade A",
      materialType: "Plastics",
      materialGrade: "Clear Film",
      quantity: 50000,
      unit: "kg",
      pricePerUnit: 1.25,
      currency: "EUR",
      country: "Belgium",
      truckLoads: 2,
      description: "Available from Bornem warehouse",
    });

    // Create and approve Offers User
    await store.run(null, "registerOffersUser", {
      name: "Olivia Offers",
      email: "olivia@trader.com",
      password: "olivia-pass-1",
      company: "Trader Global",
    });
    const adminView = await store.view(ownerSign.value.sessionId);
    const regUser = adminView.state.accounts.find((a) => a.email === "olivia@trader.com");
    await store.run(ownerSign.value.sessionId, "decideOffersUserRegistration", {
      userId: regUser?.id,
      decision: "approve",
    });

    const userSign = await store.signIn("olivia@trader.com", "olivia-pass-1");
    assert.equal(userSign.ok, true);
    if (!userSign.ok) return;

    // Offers User can see purchasing offers
    const userView = await store.view(userSign.value.sessionId);
    assert.equal(userView.state.offers.length, 1);
    assert.equal(userView.state.offers[0].material, "LDPE Film Grade A");

    // Offers User submits 9-field selling offer linked to PO-2026-1001
    const submitSelling = await store.run(userSign.value.sessionId, "submitSellingOffer", {
      poNumber: "PO-2026-1001",
      materialType: "Plastics",
      materialName: "LDPE Recycled Pellets",
      clientName: "EuroPolymers Ltd",
      contactNumber: "+32 491 123 456",
      emailAddress: "procurement@europolymers.com",
      price: 1.45,
      currency: "EUR",
      origin: "Antwerp, Belgium",
      destination: "Duisburg, Germany",
      quantity: 24000,
      truckLoads: 1,
      notes: "Immediate dispatch ready",
    });
    assert.equal(submitSelling.error, undefined);

    // Verify Selling Offer is stored with pending approval
    const viewAfterSelling = await store.view(userSign.value.sessionId);
    const mySellingOffer = viewAfterSelling.state.offers.find((o) => o.kind === "selling");
    assert.ok(mySellingOffer);
    assert.equal(mySellingOffer.approvalStatus, "pending");
    assert.equal(mySellingOffer.clientName, "EuroPolymers Ltd");
    assert.equal(mySellingOffer.poNumber, "PO-2026-1001");
    assert.equal(mySellingOffer.pricePerUnit, 1.45);
    assert.equal(mySellingOffer.origin, "Antwerp, Belgium");
    assert.equal(mySellingOffer.destination, "Duisburg, Germany");

    // Offers User strictly cannot access warehouse/inventory
    const inventoryTry = await store.run(userSign.value.sessionId, "createPurchase", {
      supplier: "Illegal",
      material: "Illegal",
      quantityKg: 100,
      valueEur: 100,
    });
    assert.notEqual(inventoryTry.error, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("4. Admin Selling Offer Approval & Automatic Sold Section Transition", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Register and approve offers user
    await store.run(null, "registerOffersUser", {
      name: "Olivia Offers",
      email: "olivia@trader.com",
      password: "olivia-pass-1",
    });
    const regUser = (await store.view(ownerSign.value.sessionId)).state.accounts.find((a) => a.email === "olivia@trader.com");
    await store.run(ownerSign.value.sessionId, "decideOffersUserRegistration", {
      userId: regUser?.id,
      decision: "approve",
    });

    const userSign = await store.signIn("olivia@trader.com", "olivia-pass-1");
    if (!userSign.ok) return;

    // User submits selling offer
    await store.run(userSign.value.sessionId, "submitSellingOffer", {
      poNumber: "PO-2026-8888",
      materialType: "Plastics",
      materialName: "HDPE Blow Moulding Flakes",
      clientName: "EcoPackaging NV",
      contactNumber: "+31 20 555 7890",
      emailAddress: "buyer@ecopack.nl",
      price: 1.85,
      quantity: 40000,
      origin: "Rotterdam",
      destination: "Ghent",
    });

    const userOffers = (await store.view(userSign.value.sessionId)).state.offers;
    const submittedOffer = userOffers.find((o) => o.kind === "selling");
    assert.ok(submittedOffer);
    assert.equal(submittedOffer.approvalStatus, "pending");

    // Add Moderator
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Mona Moderator",
      email: "mod@stockflow.test",
      role: "moderator",
      warehouse: null,
      password: "pass-mod",
    });
    const modSign = await store.signIn("mod@stockflow.test", "pass-mod");
    assert.equal(modSign.ok, true);
    if (!modSign.ok) return;

    // 1. Admin attempt to approve selling offer is BLOCKED (strictly read-only)
    const adminApprove = await store.run(ownerSign.value.sessionId, "decideSellingOffer", {
      offerId: submittedOffer.id,
      decision: "approve",
      notes: "Pricing and credit terms verified with client.",
    });
    assert.equal(adminApprove.error, "Admin access is read-only. Mutations are not permitted.");

    // Moderator reviews and approves the selling offer
    const modApprove = await store.run(modSign.value.sessionId, "decideSellingOffer", {
      offerId: submittedOffer.id,
      decision: "approve",
      notes: "Pricing and credit terms verified with client.",
    });
    assert.equal(modApprove.error, undefined);

    const afterApproval = (await store.view(ownerSign.value.sessionId)).state.offers.find((o) => o.id === submittedOffer.id);
    assert.equal(afterApproval?.approvalStatus, "approved");
    assert.equal(afterApproval?.statusKey, "received");

    // 2. Commercial Acceptance moves it to SOLD (by Moderator)
    const acceptRes = await store.run(modSign.value.sessionId, "acceptSellingOffer", {
      offerId: submittedOffer.id,
      notes: "Deal finalized and commercially accepted by client.",
    });
    assert.equal(acceptRes.error, undefined);

    const soldOffer = (await store.view(ownerSign.value.sessionId)).state.offers.find((o) => o.id === submittedOffer.id);
    assert.equal(soldOffer?.statusKey, "accepted");
    assert.ok(soldOffer?.soldAt);

    // Filter into sections as in UI
    const allOffers = (await store.view(ownerSign.value.sessionId)).state.offers;
    const soldList = allOffers.filter((o) => o.statusKey === "accepted" || o.statusKey === "sold" || Boolean(o.soldAt));
    const activeSellingList = allOffers.filter((o) => o.kind === "selling" && o.statusKey !== "accepted" && o.statusKey !== "sold" && !o.soldAt);

    assert.equal(soldList.length, 1);
    assert.equal(soldList[0].id, submittedOffer.id);
    assert.equal(activeSellingList.length, 0); // cleanly moved to Sold without duplication
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
