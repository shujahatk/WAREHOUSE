import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canAccess } from "../lib/permissions.ts";
import { navSections, mobileTabs } from "../lib/navigation.ts";
import { createLocalAdapter } from "./local-adapter.ts";

const now = "2026-11-21T10:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [{ name: "Bornem", country: "Belgium" }],
  companies: [
    { name: "Benelux Plastics BV", kind: "supplier" },
    { name: "Rotterdam Recycling NV", kind: "customer" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
  ],
  packagingTypes: [{ name: "Big Bags", tareKg: 25 }],
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
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-corrected-portal-test-"));
  const file = path.join(dir, "store.json");
  return { dir, store: createLocalAdapter(file, env(), () => now) };
}

test("Corrected External Offers Portal — Navigation & Role Boundaries", () => {
  // 1. Desktop Sidebar Navigation for offers_user
  const visibleSectionsForOffersUser = navSections
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => item.roles.includes("offers_user")),
    }))
    .filter((section) => section.items.length > 0);

  // Must have ONLY ONE section: "Offers"
  assert.equal(visibleSectionsForOffersUser.length, 1, "Only one section must be visible to Offers User");
  assert.equal(visibleSectionsForOffersUser[0].title, "Offers", "Visible section must be Offers");

  // In that section, there must be EXACTLY TWO items: Purchasing Offers and My Offers
  const offerItems = visibleSectionsForOffersUser[0].items;
  assert.equal(offerItems.length, 2, "Offers section must contain exactly two items for Offers User");
  assert.equal(offerItems[0].href, "/offers/purchasing");
  assert.equal(offerItems[0].label, "Purchasing Offers");
  assert.equal(offerItems[1].href, "/offers/my-offers");
  assert.equal(offerItems[1].label, "My Offers");

  // Must NOT display any internal modules
  const allHrefsForOffersUser = visibleSectionsForOffersUser.flatMap((s) => s.items.map((i) => i.href));
  assert.ok(!allHrefsForOffersUser.includes("/dashboard"), "Must not display Dashboard");
  assert.ok(!allHrefsForOffersUser.includes("/purchases"), "Must not display PO & SO Orders");
  assert.ok(!allHrefsForOffersUser.includes("/inventory"), "Must not display Inventory");
  assert.ok(!allHrefsForOffersUser.includes("/stock-movements"), "Must not display Stock Movements");
  assert.ok(!allHrefsForOffersUser.includes("/transfers"), "Must not display Transfers");
  assert.ok(!allHrefsForOffersUser.includes("/suppliers"), "Must not display Suppliers");
  assert.ok(!allHrefsForOffersUser.includes("/customers"), "Must not display Customers");
  assert.ok(!allHrefsForOffersUser.includes("/materials"), "Must not display Materials");
  assert.ok(!allHrefsForOffersUser.includes("/users"), "Must not display Users");
  assert.ok(!allHrefsForOffersUser.includes("/reports"), "Must not display Reports");
  assert.ok(!allHrefsForOffersUser.includes("/audit"), "Must not display Audit Log");
  assert.ok(!allHrefsForOffersUser.includes("/settings"), "Must not display Settings");
  assert.ok(!allHrefsForOffersUser.includes("/offers/selling"), "Must not display internal Selling Offers desk");
  assert.ok(!allHrefsForOffersUser.includes("/offers/sold"), "Must not display internal Sold ledger");

  // 2. Mobile Bottom Navigation for offers_user
  const mobileTabsForOffersUser = mobileTabs.filter((tab) => tab.roles.includes("offers_user"));
  assert.equal(mobileTabsForOffersUser.length, 2, "Mobile bottom bar must contain exactly 2 tabs for Offers User");
  assert.equal(mobileTabsForOffersUser[0].href, "/offers/purchasing");
  assert.equal(mobileTabsForOffersUser[1].href, "/offers/my-offers");

  // 3. Route Access Control
  assert.equal(canAccess("offers_user", "/offers/purchasing"), true);
  assert.equal(canAccess("offers_user", "/offers/purchasing/POF-2026-0001"), true);
  assert.equal(canAccess("offers_user", "/offers/my-offers"), true);
  assert.equal(canAccess("offers_user", "/offers/my-offers/SOF-2026-0001"), true);
  assert.equal(canAccess("offers_user", "/offers"), true);
  assert.equal(canAccess("offers_user", "/offers/some-offer-id"), true);
  assert.equal(canAccess("offers_user", "/notifications"), true);

  // Strictly Forbidden Routes:
  assert.equal(canAccess("offers_user", "/offers/selling"), false);
  assert.equal(canAccess("offers_user", "/offers/selling/sub"), false);
  assert.equal(canAccess("offers_user", "/offers/sold"), false);
  assert.equal(canAccess("offers_user", "/offers/sold/sub"), false);
  assert.equal(canAccess("offers_user", "/dashboard"), false);
  assert.equal(canAccess("offers_user", "/inventory"), false);
  assert.equal(canAccess("offers_user", "/purchases"), false);
  assert.equal(canAccess("offers_user", "/transfers"), false);
  assert.equal(canAccess("offers_user", "/users"), false);
  assert.equal(canAccess("offers_user", "/settings"), false);
  assert.equal(canAccess("offers_user", "/reports"), false);
  assert.equal(canAccess("offers_user", "/audit"), false);
  assert.equal(canAccess("offers_user", "/suppliers"), false);
  assert.equal(canAccess("offers_user", "/customers"), false);
  assert.equal(canAccess("offers_user", "/materials"), false);
  assert.equal(canAccess("offers_user", "/schedules/loading"), false);
  assert.equal(canAccess("offers_user", "/schedules/unloading"), false);
  assert.equal(canAccess("offers_user", "/verification"), false);
});

test("Corrected External Offers Portal — End-to-End Submission, Locking, Privacy & Admin Decisions", async () => {
  const { dir, store } = createTestAdapter();

  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);

    // 1. Add Moderator to create Purchasing Offers
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      password: "mod-pass-1",
      role: "moderator",
    });
    const modSign = await store.signIn("moderator@example.com", "mod-pass-1");
    assert.equal(modSign.ok, true);

    // 2. Create Published Purchasing Offer
    const poResult = await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "LDPE Film 98/2",
      materialType: "Plastics (LDPE)",
      materialGrade: "Clear Grade A",
      quantity: 50,
      unit: "MT",
      pricePerUnit: 1200,
      currency: "EUR",
      totalValue: 60000,
      country: "Belgium",
      location: "Bornem Warehouse",
      truckLoads: 2,
      description: "Looking for 50 MT clear regranulate or film waste",
      priority: "medium",
      poNumber: "PO-2026-0001",
    });
    assert.equal(poResult.error, undefined);
    const modViewInitial = await store.view(modSign.value.sessionId);
    const purchasingOfferId = modViewInitial.state.offers[0].id;

    // 3. Register two external trading partners
    const regResBob = await store.run(null, "registerOffersUser", {
      name: "Bob Trader",
      email: "bob@tradingcorp.com",
      password: "BobPassword2026!",
      company: "Trading Corp International",
      notes: "Benelux recycling partner",
    });
    assert.equal(regResBob.error, undefined);

    const regResCharlie = await store.run(null, "registerOffersUser", {
      name: "Charlie Vendor",
      email: "charlie@vendorlogistics.com",
      password: "CharliePassword2026!",
      company: "Vendor Logistics BV",
      notes: "German plastics supplier",
    });
    assert.equal(regResCharlie.error, undefined);

    // 4. Pending check: Neither can log in while pending
    const bobPendingLogin = await store.signIn("bob@tradingcorp.com", "BobPassword2026!");
    assert.equal(bobPendingLogin.ok, false);
    assert.ok(bobPendingLogin.error?.includes("awaiting admin approval") || bobPendingLogin.error?.includes("pending"));

    // 5. Admin approves Bob and Charlie
    const adminView = await store.view(ownerSign.value.sessionId);
    const bobAccount = adminView.state.accounts.find((a) => a.email === "bob@tradingcorp.com")!;
    const charlieAccount = adminView.state.accounts.find((a) => a.email === "charlie@vendorlogistics.com")!;

    await store.run(ownerSign.value.sessionId, "decideOffersUserRegistration", {
      userId: bobAccount.id,
      decision: "approved",
      notes: "Verified business identity",
    });
    await store.run(ownerSign.value.sessionId, "decideOffersUserRegistration", {
      userId: charlieAccount.id,
      decision: "approved",
      notes: "Verified business identity",
    });

    // 6. Bob logs in successfully
    const bobSign = await store.signIn("bob@tradingcorp.com", "BobPassword2026!");
    assert.equal(bobSign.ok, true);
    assert.equal(bobSign.value.profile.role, "offers_user");

    const charlieSign = await store.signIn("charlie@vendorlogistics.com", "CharliePassword2026!");
    assert.equal(charlieSign.ok, true);
    assert.equal(charlieSign.value.profile.role, "offers_user");

    // 7. Sourcing check: Bob can view the published Purchasing Offer
    const bobInitialView = await store.view(bobSign.value.sessionId);
    const bobPurchasingOffers = bobInitialView.state.offers.filter((o) => o.kind === "purchasing");
    assert.equal(bobPurchasingOffers.length, 1);
    assert.equal(bobPurchasingOffers[0].material, "LDPE Film 98/2");
    assert.equal(bobPurchasingOffers[0].poNumber, "PO-2026-0001");

    // 8. Bob submits Selling Offer linked to Purchasing Offer
    const initialStock = bobInitialView.state.stock.reduce((acc, s) => acc + s.weightKg, 0);

    const submitRes = await store.run(bobSign.value.sessionId, "submitSellingOffer", {
      poNumber: "PO-2026-0001",
      purchasingOfferId: purchasingOfferId,
      materialType: "Plastics (LDPE)",
      materialName: "LDPE Regranulate Clear",
      clientName: "Trading Corp International",
      contactPerson: "Bob Trader",
      contactNumber: "+32 3 555 1234",
      emailAddress: "bob@tradingcorp.com",
      price: 1350,
      currency: "EUR",
      quantity: 25,
      unit: "MT",
      deliveryDate: "2026-12-05",
      packagingType: "Big Bags",
      transportDetails: "DAP Bornem Warehouse",
      origin: "Rotterdam Port, NL",
      destination: "Bornem Warehouse, BE",
      description: "First-class clear regranulate with complete test specs",
      attachments: [
        {
          name: "COA-Spec.pdf",
          mime: "application/pdf",
          bytesBase64: "JVBERi0xLjQKJcfsj6IKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFI",
          kind: "document",
        },
      ],
    });
    assert.equal(submitRes.error, undefined);
    assert.equal(submitRes.notice, "Selling offer submitted for review.");

    // 9. Verify stock did NOT change
    const postSubmitView = await store.view(bobSign.value.sessionId);
    const postStock = postSubmitView.state.stock.reduce((acc, s) => acc + s.weightKg, 0);
    assert.equal(postStock, initialStock, "Inventory must remain completely untouched");

    // 10. Privacy Isolation check: Charlie CANNOT see Bob's submitted Selling Offer
    const charlieView = await store.view(charlieSign.value.sessionId);
    const charlieSellingOffers = charlieView.state.offers.filter((o) => o.kind === "selling");
    assert.equal(charlieSellingOffers.length, 0, "Charlie must see ZERO selling offers");

    // Bob can see his OWN submitted offer
    const bobView = await store.view(bobSign.value.sessionId);
    const bobSellingOffers = bobView.state.offers.filter((o) => o.kind === "selling");
    assert.equal(bobSellingOffers.length, 1, "Bob sees exactly his own submitted offer");
    const bobOffer = bobSellingOffers[0];
    assert.equal(bobOffer.poNumber, "PO-2026-0001");
    assert.equal(bobOffer.purchasingOfferId, purchasingOfferId);
    assert.equal(bobOffer.quantity, 25);
    assert.equal(bobOffer.unit, "MT");
    assert.equal(bobOffer.pricePerUnit, 1350);
    assert.equal(bobOffer.totalValue, 33750);
    assert.equal(bobOffer.approvalStatus, "pending");
    assert.ok(bobOffer.description.includes("2026-12-05"));
    assert.ok(bobOffer.description.includes("Big Bags"));

    // 11. Lock check: Bob cannot edit or delete his offer
    const bobEditRes = await store.run(bobSign.value.sessionId, "editOffer", {
      id: bobOffer.id,
      price: 1400,
    });
    assert.notEqual(bobEditRes.error, undefined, "Bob must NOT be able to edit submitted offer");

    const bobDeleteRes = await store.run(bobSign.value.sessionId, "deleteOffer", {
      id: bobOffer.id,
    });
    assert.notEqual(bobDeleteRes.error, undefined, "Bob must NOT be able to delete submitted offer");

    // 12. Offer Decision Workflow:
    // Moderator rejection without reason fails
    const modEmptyReject = await store.run(modSign.value.sessionId, "decideSellingOffer", {
      offerId: bobOffer.id,
      decision: "rejected",
      note: "",
    });
    assert.notEqual(modEmptyReject.error, undefined, "Moderator rejection must require a reason");

    // Moderator approves with note
    const modApprove = await store.run(modSign.value.sessionId, "decideSellingOffer", {
      offerId: bobOffer.id,
      decision: "approved",
      note: "Commercial pricing clearance granted by procurement manager.",
    });
    assert.equal(modApprove.error, undefined);

    // 13. Verify updated status and in-app notification for Bob
    const bobFinalView = await store.view(bobSign.value.sessionId);
    const bobFinalOffer = bobFinalView.state.offers.find((o) => o.id === bobOffer.id)!;
    assert.equal(bobFinalOffer.approvalStatus, "approved");
    assert.equal(bobFinalOffer.adminDecisionNote, "Commercial pricing clearance granted by procurement manager.");

    // Bob receives in-app notification
    const bobNotif = bobFinalView.state.notifications.find((n) => n.title.includes("Approved") || n.title.includes("approved"));
    assert.ok(bobNotif, "Bob must receive notification on offer approval");
    assert.ok(bobNotif.message.includes("Commercial pricing clearance granted"));

    // 14. Rejection flow test with Charlie
    const charlieSubmit = await store.run(charlieSign.value.sessionId, "submitSellingOffer", {
      poNumber: "PO-2026-0001",
      purchasingOfferId: purchasingOfferId,
      materialType: "Plastics (LDPE)",
      materialName: "LDPE Off-Grade",
      clientName: "Vendor Logistics BV",
      contactNumber: "+49 211 555 4321",
      emailAddress: "charlie@vendorlogistics.com",
      price: 2600,
      origin: "Dusseldorf",
      destination: "Bornem",
    });
    assert.equal(charlieSubmit.error, undefined);
    const charlieViewAfterSubmit = await store.view(charlieSign.value.sessionId);
    const charlieOffer = charlieViewAfterSubmit.state.offers.find((o) => o.kind === "selling")!;

    // Moderator rejects with mandatory reason
    const adminReject = await store.run(modSign.value.sessionId, "decideSellingOffer", {
      offerId: charlieOffer.id,
      decision: "rejected",
      note: "Off-grade material does not meet European circularity technical specs.",
    });
    assert.equal(adminReject.error, undefined);

    // Charlie sees rejection in My Offers and receives in-app notification
    const charlieFinalView = await store.view(charlieSign.value.sessionId);
    const charlieFinalOffer = charlieFinalView.state.offers.find((o) => o.id === charlieOffer.id)!;
    assert.equal(charlieFinalOffer.approvalStatus, "rejected");
    assert.equal(charlieFinalOffer.statusKey, "lost");
    assert.equal(
      charlieFinalOffer.adminDecisionNote,
      "Off-grade material does not meet European circularity technical specs."
    );

    const charlieNotif = charlieFinalView.state.notifications.find((n) => n.title.includes("Rejected") || n.title.includes("rejected"));
    assert.ok(charlieNotif, "Charlie must receive notification on offer rejection");
    assert.ok(charlieNotif.message.includes("Off-grade material does not meet"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
