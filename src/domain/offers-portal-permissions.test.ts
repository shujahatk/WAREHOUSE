import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalAdapter } from "./local-adapter.ts";
import { canAccess } from "../lib/permissions.ts";
import { visibleOffers, type Actor } from "./view.ts";

const now = "2026-11-16T10:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
  ],
  companies: [
    { name: "Acme Polymers", kind: "supplier" },
    { name: "Global Trading NV", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
  ],
  packagingTypes: [{ name: "Normal Pallet", tareKg: 25 }],
});

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "rm-offers-permissions-test-"));
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    STOCKFLOW_OWNER_EMAIL: "admin@stockflow.local",
    STOCKFLOW_OWNER_NAME: "Admin User",
    STOCKFLOW_OWNER_PASSWORD: "AdminPassword123!",
    STOCKFLOW_REFERENCE_JSON: reference,
  };
  const store = createLocalAdapter(path.join(dir, "store.json"), env, () => now);
  return { dir, store };
}

describe("Offers User Portal Permissions & Registration Approval (12 Core Scenarios)", () => {
  it("Scenario 1: New user registers successfully with pending status", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const reg = await store.run(null, "registerOffersUser", {
        name: "Trader Alex",
        email: "alex@globalplastics.com",
        password: "TraderPassword123!",
        company: "Global Plastics Ltd",
        notes: "Interested in LDPE scrap",
      });
      assert.equal(reg.error, undefined);
      assert.ok(reg.notice?.includes("Registration submitted") || reg.notice?.includes("pending"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 2: Pending user cannot log in and receives clear pending message", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "registerOffersUser", {
        name: "Pending Trader",
        email: "pending@trader.com",
        password: "TraderPassword123!",
        company: "Trader Co",
      });

      const login = await store.signIn("pending@trader.com", "TraderPassword123!");
      assert.equal(login.ok, false);
      assert.match(login.error, /pending administrator approval/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 3: Admin sees pending registration requests with applicant details", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "registerOffersUser", {
        name: "Applicant Jane",
        email: "jane@applicant.com",
        password: "JanePassword123!",
        company: "Applicant Corp",
        notes: "Polymer importer",
      });

      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);

      const adminView = await store.view(adminSign.value.sessionId);
      const pending = adminView.state.accounts.find((a) => a.email === "jane@applicant.com");
      assert.ok(pending);
      assert.equal(pending.approvalStatus, "pending");
      assert.equal(pending.name, "Applicant Jane");
      assert.equal(pending.role, "offers_user");
      assert.ok(pending.registrationNotes?.includes("Applicant Corp"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 4: Admin approves registration and user can log in immediately", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "registerOffersUser", {
        name: "Approved User",
        email: "approved@trader.com",
        password: "ApprovedPass123!",
        company: "Approved Ltd",
      });

      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);

      const adminView = await store.view(adminSign.value.sessionId);
      const user = adminView.state.accounts.find((a) => a.email === "approved@trader.com");
      assert.ok(user);

      const approveRes = await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: user.id,
        decision: "approve",
        notes: "Approved after VAT verification",
      });
      assert.equal(approveRes.error, undefined);

      const userLogin = await store.signIn("approved@trader.com", "ApprovedPass123!");
      assert.equal(userLogin.ok, true);
      assert.equal(userLogin.value.profile.role, "offers_user");
      assert.equal(userLogin.value.profile.approvalStatus, "approved");
      assert.equal(userLogin.value.profile.active, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 5: Admin rejects registration with mandatory reason; rejected user cannot log in", async () => {
    const { dir, store } = createTestAdapter();
    try {
      await store.run(null, "registerOffersUser", {
        name: "Rejected User",
        email: "rejected@spam.com",
        password: "RejectedPass123!",
      });

      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);

      const adminView = await store.view(adminSign.value.sessionId);
      const user = adminView.state.accounts.find((a) => a.email === "rejected@spam.com");
      assert.ok(user);

      // Attempt rejection without mandatory reason must fail
      const badReject = await store.run(adminSign.value.sessionId, "rejectRegistration", {
        userId: user.id,
        reason: "",
      });
      assert.notEqual(badReject.error, undefined);
      assert.match(badReject.error!, /mandatory/i);

      // Rejection with reason succeeds
      const goodReject = await store.run(adminSign.value.sessionId, "rejectRegistration", {
        userId: user.id,
        reason: "Failed business credential verification",
      });
      assert.equal(goodReject.error, undefined);

      // Rejected user cannot log in
      const rejectedLogin = await store.signIn("rejected@spam.com", "RejectedPass123!");
      assert.equal(rejectedLogin.ok, false);
      assert.match(rejectedLogin.error, /declined|rejected/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 6: Offers User can see all published Purchasing Offers", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);

      // Create Moderator and approved Offers User
      await store.run(adminSign.value.sessionId, "addUser", {
        name: "Mod Mark",
        email: "mod@stockflow.local",
        role: "moderator",
        password: "ModPassword123!",
      });
      const modSign = await store.signIn("mod@stockflow.local", "ModPassword123!");
      assert.equal(modSign.ok, true);

      // Moderator creates 2 Purchasing Offers
      await store.run(modSign.value.sessionId, "createOffer", {
        kind: "purchasing",
        material: "LDPE Clear Film Scrap",
        materialType: "Plastics",
        materialGrade: "Grade A",
        quantity: 24000,
        unit: "kg",
        pricePerUnit: 0.85,
        currency: "EUR",
        country: "Belgium",
        truckLoads: 1,
        description: "Monthly scrap lot",
      });

      await store.run(modSign.value.sessionId, "createOffer", {
        kind: "purchasing",
        material: "HDPE Blow Regrind",
        materialType: "Plastics",
        materialGrade: "Natural",
        quantity: 40000,
        unit: "kg",
        pricePerUnit: 1.10,
        currency: "EUR",
        country: "Netherlands",
        truckLoads: 2,
        description: "Regrind from drums",
      });

      // Register and approve Offers User
      await store.run(null, "registerOffersUser", {
        name: "Trader Bob",
        email: "bob@trader.com",
        password: "BobPassword123!",
      });
      const bobUser = (await store.view(adminSign.value.sessionId)).state.accounts.find((a) => a.email === "bob@trader.com");
      await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: bobUser?.id,
        decision: "approve",
      });

      const bobSign = await store.signIn("bob@trader.com", "BobPassword123!");
      assert.equal(bobSign.ok, true);

      const bobView = await store.view(bobSign.value.sessionId);
      const bobPurchasing = bobView.state.offers.filter((o) => o.kind === "purchasing");
      assert.equal(bobPurchasing.length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 7: Offers User cannot see Selling Offers belonging to others", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);

      // Create Moderator
      await store.run(adminSign.value.sessionId, "addUser", {
        name: "Mod Mark",
        email: "mod@stockflow.local",
        role: "moderator",
        password: "ModPassword123!",
      });
      const modSign = await store.signIn("mod@stockflow.local", "ModPassword123!");
      assert.equal(modSign.ok, true);

      // Moderator creates a Selling Offer (internal)
      await store.run(modSign.value.sessionId, "createOffer", {
        kind: "selling",
        material: "Internal Stock PP Granules",
        materialType: "Plastics",
        quantity: 50000,
        unit: "kg",
        pricePerUnit: 1.65,
        currency: "EUR",
        country: "Belgium",
        truckLoads: 2,
      });

      // Create Another Trader who submits a selling offer
      await store.run(null, "registerOffersUser", {
        name: "Trader Charlie",
        email: "charlie@otherdealer.com",
        password: "CharliePassword123!",
      });
      const charlieUser = (await store.view(adminSign.value.sessionId)).state.accounts.find((a) => a.email === "charlie@otherdealer.com");
      await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: charlieUser?.id,
        decision: "approve",
      });
      const charlieSign = await store.signIn("charlie@otherdealer.com", "CharliePassword123!");
      assert.equal(charlieSign.ok, true);

      // Charlie submits selling offer
      await store.run(charlieSign.value.sessionId, "submitSellingOffer", {
        poNumber: "PO-2026-CH01",
        materialType: "Plastics",
        materialName: "Charlie Private Flakes",
        clientName: "Private Client",
        contactNumber: "+33 1 23 45 67 89",
        emailAddress: "private@dealer.fr",
        price: 1.20,
        origin: "Paris, France",
        destination: "Antwerp, Belgium",
      });

      // Now Bob logs in as Offers User
      await store.run(null, "registerOffersUser", {
        name: "Trader Bob",
        email: "bob@trader.com",
        password: "BobPassword123!",
      });
      const bobUser = (await store.view(adminSign.value.sessionId)).state.accounts.find((a) => a.email === "bob@trader.com");
      await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: bobUser?.id,
        decision: "approve",
      });
      const bobSign = await store.signIn("bob@trader.com", "BobPassword123!");
      assert.equal(bobSign.ok, true);

      // Bob MUST NOT see Charlie's selling offer or Moderator's selling offer
      const bobView = await store.view(bobSign.value.sessionId);
      const bobSelling = bobView.state.offers.filter((o) => o.kind === "selling");
      assert.equal(bobSelling.length, 0); // Strictly zero selling offers visible to Bob!

      // visibleOffers view projection test
      const bobActor: Actor = { id: bobUser?.id, name: "Trader Bob", role: "offers_user", email: "bob@trader.com", warehouse: null };
      const rawStore = await store.view(adminSign.value.sessionId);
      const bobProjected = visibleOffers(rawStore.state, bobActor);
      const bobProjectedSelling = bobProjected.filter((o) => o.kind === "selling");
      assert.equal(bobProjectedSelling.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 8: Offers User can submit Selling Offer linked to Purchasing Offer ID / PO", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);
      if (!adminSign.ok) return;

      // Create Moderator
      await store.run(adminSign.value.sessionId, "addUser", {
        name: "Mod Mark",
        email: "mod@stockflow.local",
        role: "moderator",
        password: "ModPassword123!",
      });
      const modSign = await store.signIn("mod@stockflow.local", "ModPassword123!");
      assert.equal(modSign.ok, true);
      if (!modSign.ok) return;

      // Moderator creates purchasing offer with specific PO
      const createPoOffer = await store.run(modSign.value.sessionId, "createOffer", {
        kind: "purchasing",
        material: "PET Bottle Flakes Clear",
        materialType: "Plastics",
        materialGrade: "Clear Flakes",
        quantity: 48000,
        unit: "kg",
        pricePerUnit: 0.95,
        currency: "EUR",
        country: "Belgium",
        truckLoads: 2,
        poNumber: "PO-2026-PET-01",
      });
      assert.equal(createPoOffer.error, undefined);

      const allOffers = (await store.view(adminSign.value.sessionId)).state.offers;
      const purchOffer = allOffers.find((o) => o.poNumber === "PO-2026-PET-01");
      assert.ok(purchOffer);

      // Approved Offers User logs in
      await store.run(null, "registerOffersUser", {
        name: "Trader Bob",
        email: "bob@trader.com",
        password: "BobPassword123!",
      });
      const bobUser = (await store.view(adminSign.value.sessionId)).state.accounts.find((a) => a.email === "bob@trader.com");
      await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: bobUser?.id,
        decision: "approve",
      });
      const bobSign = await store.signIn("bob@trader.com", "BobPassword123!");
      assert.equal(bobSign.ok, true);
      if (!bobSign.ok) return;

      // Bob submits Selling Offer responding to the Purchasing Offer
      const submitRes = await store.run(bobSign.value.sessionId, "submitSellingOffer", {
        purchasingOfferId: purchOffer.id,
        poNumber: "PO-2026-PET-01",
        materialType: "Plastics",
        materialName: "PET Bottle Flakes Clear - High Purity",
        clientName: "CleanPET Recycling Ltd",
        contactNumber: "+31 10 987 6543",
        emailAddress: "sales@cleanpet.nl",
        price: 0.92,
        currency: "EUR",
        origin: "Rotterdam, Netherlands",
        destination: "Bornem, Belgium",
        quantity: 48000,
        truckLoads: 2,
      });
      assert.equal(submitRes.error, undefined);

      // Verify the created Selling Offer is associated with purchasingOfferId
      const adminViewAfter = await store.view(adminSign.value.sessionId);
      const submittedSelling = adminViewAfter.state.offers.find((o) => o.clientName === "CleanPET Recycling Ltd");
      assert.ok(submittedSelling);
      assert.equal(submittedSelling.kind, "selling");
      assert.equal(submittedSelling.purchasingOfferId, purchOffer.id);
      assert.equal(submittedSelling.poNumber, "PO-2026-PET-01");
      assert.equal(submittedSelling.approvalStatus, "pending");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 9: Offers User can ONLY see their own submitted Selling Offers", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);
      if (!adminSign.ok) return;

      // Setup Trader Bob
      await store.run(null, "registerOffersUser", {
        name: "Trader Bob",
        email: "bob@trader.com",
        password: "BobPassword123!",
      });
      const bobUser = (await store.view(adminSign.value.sessionId)).state.accounts.find((a) => a.email === "bob@trader.com");
      await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: bobUser?.id,
        decision: "approve",
      });
      const bobSign = await store.signIn("bob@trader.com", "BobPassword123!");
      assert.equal(bobSign.ok, true);
      if (!bobSign.ok) return;

      // Bob submits Selling Offer
      await store.run(bobSign.value.sessionId, "submitSellingOffer", {
        poNumber: "PO-BOB-01",
        materialType: "Plastics",
        materialName: "Bob Material",
        clientName: "Bob Client",
        contactNumber: "+32 490 00 00",
        emailAddress: "bob@client.be",
        price: 1.50,
        origin: "Antwerp",
        destination: "Ghent",
      });

      // Verify Bob sees his own selling offer
      const bobView = await store.view(bobSign.value.sessionId);
      const bobSelling = bobView.state.offers.filter((o) => o.kind === "selling");
      assert.equal(bobSelling.length, 1);
      assert.equal(bobSelling[0].clientName, "Bob Client");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 10: Offers User CANNOT edit or withdraw submitted Selling Offers (locked)", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);
      if (!adminSign.ok) return;

      await store.run(null, "registerOffersUser", {
        name: "Trader Bob",
        email: "bob@trader.com",
        password: "BobPassword123!",
      });
      const bobUser = (await store.view(adminSign.value.sessionId)).state.accounts.find((a) => a.email === "bob@trader.com");
      await store.run(adminSign.value.sessionId, "decideOffersUserRegistration", {
        userId: bobUser?.id,
        decision: "approve",
      });
      const bobSign = await store.signIn("bob@trader.com", "BobPassword123!");
      assert.equal(bobSign.ok, true);
      if (!bobSign.ok) return;

      await store.run(bobSign.value.sessionId, "submitSellingOffer", {
        poNumber: "PO-LOCKED-01",
        materialType: "Plastics",
        materialName: "Locked Material",
        clientName: "Locked Client",
        contactNumber: "+32 490 00 00",
        emailAddress: "locked@client.be",
        price: 2.00,
        origin: "Brussels",
        destination: "Liege",
      });

      const bobView = await store.view(bobSign.value.sessionId);
      const offer = bobView.state.offers.find((o) => o.poNumber === "PO-LOCKED-01");
      assert.ok(offer);

      // Attempting to edit offer as offers_user must fail
      const editTry = await store.run(bobSign.value.sessionId, "updateOffer", {
        offerId: offer.id,
        material: "Hacked Material",
      });
      assert.notEqual(editTry.error, undefined);

      // Attempting to delete offer as offers_user must fail
      const deleteTry = await store.run(bobSign.value.sessionId, "deleteOffer", {
        offerId: offer.id,
        reason: "User wants to withdraw",
      });
      assert.notEqual(deleteTry.error, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Scenario 11: Route permissions strictly enforce role boundaries", () => {
    // Offers User permissions (canAccess(role, pathname))
    assert.equal(canAccess("offers_user", "/offers"), true);
    assert.equal(canAccess("offers_user", "/offers/purchasing"), true);
    assert.equal(canAccess("offers_user", "/offers/selling"), false); // STRICTLY FORBIDDEN
    assert.equal(canAccess("offers_user", "/offers/selling/sub-path"), false); // STRICTLY FORBIDDEN
    assert.equal(canAccess("offers_user", "/warehouses"), false);
    assert.equal(canAccess("offers_user", "/inventory"), false);
    assert.equal(canAccess("offers_user", "/users"), false);
    assert.equal(canAccess("offers_user", "/analytics"), false);
    assert.equal(canAccess("offers_user", "/stock-movements"), false);
    assert.equal(canAccess("offers_user", "/worker"), false);

    // Moderator permissions
    assert.equal(canAccess("moderator", "/offers"), true);
    assert.equal(canAccess("moderator", "/offers/purchasing"), true);
    assert.equal(canAccess("moderator", "/offers/selling"), true);
    assert.equal(canAccess("moderator", "/inventory"), false);
    assert.equal(canAccess("moderator", "/warehouses"), false);
    assert.equal(canAccess("moderator", "/users"), false);

    // Worker permissions
    assert.equal(canAccess("worker", "/tasks"), false);
    assert.equal(canAccess("worker", "/dashboard"), true);
    assert.equal(canAccess("worker", "/offers"), false);
    assert.equal(canAccess("worker", "/users"), false);
  });

  it("Scenario 12: Existing internal roles continue working correctly", async () => {
    const { dir, store } = createTestAdapter();
    try {
      const adminSign = await store.signIn("admin@stockflow.local", "AdminPassword123!");
      assert.equal(adminSign.ok, true);
      if (!adminSign.ok) return;

      // Create Manager (Staff) and Worker
      await store.run(adminSign.value.sessionId, "addUser", {
        name: "Staff Sam",
        email: "staff@stockflow.local",
        role: "manager",
        password: "StaffPassword123!",
      });

      await store.run(adminSign.value.sessionId, "addUser", {
        name: "Worker Will",
        email: "worker@stockflow.local",
        role: "worker",
        warehouse: "Bornem",
        password: "WorkerPassword123!",
      });

      const staffSign = await store.signIn("staff@stockflow.local", "StaffPassword123!");
      assert.equal(staffSign.ok, true);
      if (!staffSign.ok) return;

      const workerSign = await store.signIn("worker@stockflow.local", "WorkerPassword123!");
      assert.equal(workerSign.ok, true);
      if (!workerSign.ok) return;

      // Staff creates PO
      const createPo = await store.run(staffSign.value.sessionId, "createPurchase", {
        number: "PO-2026-NORMAL",
        supplier: "Acme Polymers",
        material: "LDPE",
        quantityKg: 20000,
        valueEur: 25000,
      });
      assert.equal(createPo.error, undefined);

      // Staff assigns to worker
      const assignPo = await store.run(staffSign.value.sessionId, "assignWorkerPo", {
        poNumber: "PO-2026-NORMAL",
        workerId: workerSign.value.profile.id,
        scheduledDate: "2026-11-16",
      });
      assert.equal(assignPo.error, undefined);

      // Worker completes task
      const completePo = await store.run(workerSign.value.sessionId, "completeWorkerPo", {
        poNumber: "PO-2026-NORMAL",
        completionNotes: "Received and inspected",
      });
      assert.equal(completePo.error, undefined);

      const poState = (await store.view(staffSign.value.sessionId)).state.orders.find((o) => o.number === "PO-2026-NORMAL");
      assert.equal(poState?.executionStatus, "completed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
