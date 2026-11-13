import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import { calculateOfferStats, type OfferView } from "./view.ts";

const now = "2026-11-10T10:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
    { name: "Spain", country: "Spain" },
    { name: "Pakistan", country: "Pakistan" },
  ],
  companies: [
    { name: "Meridian Packaging", kind: "customer" },
    { name: "Acme Polymers", kind: "supplier" },
  ],
  materials: [
    { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
    { materialNumber: "HDPE", description: "HDPE regrind", unit: "kg", lowStockThresholdKg: 50 },
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
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-offers-test-"));
  const file = path.join(dir, "store.json");
  return { dir, store: createLocalAdapter(file, env(), () => now) };
}

// Sample 1x1 GIF in base64
const validGifBase64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

test("Purchasing & Selling Offers: Moderator full CRUD and auto-calculated total value", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Add Sales & Purchasing Offer Moderator
    const addModRes = await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      role: "moderator",
      warehouse: null,
      password: "moderator-pass-1",
    });
    assert.equal(addModRes.error, undefined);

    const modSign = await store.signIn("moderator@example.com", "moderator-pass-1");
    assert.equal(modSign.ok, true);
    if (!modSign.ok) return;

    // 1. Moderator creates a Purchasing Offer
    const poResult = await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Clean transparent LDPE film rolls",
      materialType: "Plastics",
      materialGrade: "Grade A",
      country: "Belgium",
      location: "Bornem Hub",
      quantity: 24000,
      unit: "kg",
      pricePerUnit: 1.25,
      currency: "EUR",
      truckLoads: 1,
      description: "Direct mill waste, low contamination",
      priority: "high",
      team: "Polymer Procurement",
      offerType: "Spot Lot",
    });
    assert.equal(poResult.error, undefined);

    // Verify projected offer and auto-computed total value (24000 * 1.25 = 30000)
    let view = await store.view(modSign.value.sessionId);
    assert.equal(view.state.offers.length, 1);
    const offer1 = view.state.offers[0];
    assert.equal(offer1.kind, "purchasing");
    assert.equal(offer1.material, "Clean transparent LDPE film rolls");
    assert.equal(offer1.totalValue, 30000);
    assert.equal(offer1.statusKey, "draft");
    assert.equal(offer1.approvalStatus, "pending");
    assert.match(offer1.number, /^(POF|SOF|OFF)-\d{4}-\d{4}$/);
    assert.equal(offer1.createdByName, "Morgan Moderator");
    assert.equal(offer1.activities.length, 1);
    assert.equal(offer1.activities[0].action, "created");

    // 2. Moderator creates a Selling Offer
    const soResult = await store.run(modSign.value.sessionId, "createOffer", {
      kind: "selling",
      material: "Blue washed HDPE flakes",
      materialType: "Plastics",
      materialGrade: "Grade B",
      country: "Spain",
      location: "Valencia Facility",
      quantity: 40000,
      unit: "kg",
      pricePerUnit: 0.85,
      currency: "EUR",
      truckLoads: 2,
      description: "Export quality for injection moulding",
      priority: "medium",
      team: "European Sales",
      offerType: "Contract Offer",
    });
    assert.equal(soResult.error, undefined);

    view = await store.view(modSign.value.sessionId);
    assert.equal(view.state.offers.length, 2);
    const offer2 = view.state.offers.find((o) => o.kind === "selling");
    assert.ok(offer2);
    // 40000 * 0.85 = 34000
    assert.equal(offer2.totalValue, 34000);
    assert.equal(offer2.truckLoads, 2);

    // 3. Moderator edits the Purchasing Offer (updates quantity and pricePerUnit)
    const editResult = await store.run(modSign.value.sessionId, "editOffer", {
      offerId: offer1.id,
      quantity: 25000,
      pricePerUnit: 1.30,
      description: "Price renegotiated with Acme Polymers before review",
    });
    assert.equal(editResult.error, undefined);

    view = await store.view(modSign.value.sessionId);
    const updatedOffer1 = view.state.offers.find((o) => o.id === offer1.id);
    assert.ok(updatedOffer1);
    assert.equal(updatedOffer1.quantity, 25000);
    assert.equal(updatedOffer1.pricePerUnit, 1.3);
    // 25000 * 1.3 = 32500
    assert.equal(updatedOffer1.totalValue, 32500);
    assert.equal(updatedOffer1.activities.length, 2);
    assert.equal(updatedOffer1.activities[1].action, "edited");

    // 4. Moderator soft-deletes the Selling Offer
    const delResult = await store.run(modSign.value.sessionId, "deleteOffer", {
      offerId: offer2.id,
    });
    assert.equal(delResult.error, undefined);

    view = await store.view(modSign.value.sessionId);
    // Soft-deleted offer should no longer appear in visible offers
    assert.equal(view.state.offers.length, 1);
    assert.equal(view.state.offers[0].id, offer1.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Lifecycle: Moderator submission -> Admin approve/reject with mandatory decision notes -> Moderator negotiation", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      role: "moderator",
      warehouse: null,
      password: "moderator-pass-1",
    });

    const modSign = await store.signIn("moderator@example.com", "moderator-pass-1");
    assert.equal(modSign.ok, true);
    if (!modSign.ok) return;

    // Create 2 offers
    await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Offer A to Approve (LDPE)",
      country: "Belgium",
      quantity: 10000,
      unit: "kg",
      pricePerUnit: 1.0,
      currency: "EUR",
      truckLoads: 1,
    });

    await store.run(modSign.value.sessionId, "createOffer", {
      kind: "selling",
      material: "Offer B to Reject (HDPE)",
      country: "Spain",
      quantity: 20000,
      unit: "kg",
      pricePerUnit: 0.9,
      currency: "EUR",
      truckLoads: 1,
    });

    let modView = await store.view(modSign.value.sessionId);
    const offerA = modView.state.offers.find((o) => o.material.includes("Offer A"))!;
    const offerB = modView.state.offers.find((o) => o.material.includes("Offer B"))!;

    // 1. Moderator submits both offers for review
    const subA = await store.run(modSign.value.sessionId, "submitOffer", {
      offerId: offerA.id,
    });
    assert.equal(subA.error, undefined);

    const subB = await store.run(modSign.value.sessionId, "submitOffer", {
      offerId: offerB.id,
    });
    assert.equal(subB.error, undefined);

    modView = await store.view(modSign.value.sessionId);
    const subOfferA = modView.state.offers.find((o) => o.id === offerA.id)!;
    assert.equal(subOfferA.statusKey, "under_review");
    assert.equal(subOfferA.approvalStatus, "pending");

    // 2. Moderator CANNOT approve or reject offers
    const modApprove = await store.run(modSign.value.sessionId, "decideOffer", {
      offerId: offerA.id,
      decision: "approved",
      note: "Self-approval attempt",
    });
    assert.notEqual(modApprove.error, undefined);

    // 3. Admin MUST provide decision notes (empty note rejected)
    const adminEmptyNote = await store.run(ownerSign.value.sessionId, "decideOffer", {
      offerId: offerA.id,
      decision: "approved",
      note: "   ",
    });
    assert.notEqual(adminEmptyNote.error, undefined);

    // 4. Admin approves Offer A
    const adminApprove = await store.run(ownerSign.value.sessionId, "decideOffer", {
      offerId: offerA.id,
      decision: "approved",
      note: "Approved: Price is competitive with current market index.",
    });
    assert.equal(adminApprove.error, undefined);

    // 5. Admin rejects Offer B
    const adminReject = await store.run(ownerSign.value.sessionId, "decideOffer", {
      offerId: offerB.id,
      decision: "rejected",
      note: "Rejected: Customer margin is below 8% target.",
    });
    assert.equal(adminReject.error, undefined);

    const adminView = await store.view(ownerSign.value.sessionId);
    const approvedA = adminView.state.offers.find((o) => o.id === offerA.id)!;
    assert.equal(approvedA.approvalStatus, "approved");
    assert.equal(approvedA.adminDecisionNote, "Approved: Price is competitive with current market index.");
    assert.equal(approvedA.decidedByName, "Ada Owner");

    const rejectedB = adminView.state.offers.find((o) => o.id === offerB.id)!;
    assert.equal(rejectedB.statusKey, "lost");
    assert.equal(rejectedB.approvalStatus, "rejected");
    assert.equal(rejectedB.adminDecisionNote, "Rejected: Customer margin is below 8% target.");
    assert.equal(rejectedB.decidedByName, "Ada Owner");

    // 6. Moderator progresses approved Offer A to negotiating, then won
    const negRes = await store.run(modSign.value.sessionId, "updateOfferStatus", {
      offerId: offerA.id,
      status: "negotiating",
    });
    assert.equal(negRes.error, undefined);

    const wonRes = await store.run(modSign.value.sessionId, "updateOfferStatus", {
      offerId: offerA.id,
      status: "won",
    });
    assert.equal(wonRes.error, undefined);

    modView = await store.view(modSign.value.sessionId);
    const finalA = modView.state.offers.find((o) => o.id === offerA.id)!;
    assert.equal(finalA.statusKey, "won");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Admin Operational Immutability: Admin CANNOT create, edit, delete, or directly alter offer operational records", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      role: "moderator",
      warehouse: null,
      password: "moderator-pass-1",
    });

    const modSign = await store.signIn("moderator@example.com", "moderator-pass-1");
    assert.equal(modSign.ok, true);
    if (!modSign.ok) return;

    // Moderator creates an offer
    await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Operational Offer LDPE",
      country: "Belgium",
      quantity: 5000,
      unit: "kg",
      pricePerUnit: 2.0,
      currency: "EUR",
      truckLoads: 1,
    });

    const modView = await store.view(modSign.value.sessionId);
    const offer = modView.state.offers[0];

    // Admin CANNOT create offers
    const adminCreate = await store.run(ownerSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Admin Illegal Offer",
      country: "Belgium",
      quantity: 1000,
      unit: "kg",
      pricePerUnit: 1.0,
      currency: "EUR",
      truckLoads: 1,
    });
    assert.notEqual(adminCreate.error, undefined);

    // Admin CANNOT edit offer operational fields
    const adminEdit = await store.run(ownerSign.value.sessionId, "editOffer", {
      offerId: offer.id,
      quantity: 99999,
    });
    assert.notEqual(adminEdit.error, undefined);

    // Admin CANNOT delete offers
    const adminDelete = await store.run(ownerSign.value.sessionId, "deleteOffer", {
      offerId: offer.id,
    });
    assert.notEqual(adminDelete.error, undefined);

    // Admin CANNOT update status directly
    const adminStatus = await store.run(ownerSign.value.sessionId, "updateOfferStatus", {
      offerId: offer.id,
      status: "won",
    });
    assert.notEqual(adminStatus.error, undefined);

    // Admin CANNOT add attachments
    const adminAttach = await store.run(ownerSign.value.sessionId, "addOfferAttachment", {
      offerId: offer.id,
      name: "admin.jpg",
      mime: "image/jpeg",
      bytesBase64: validGifBase64,
    });
    assert.notEqual(adminAttach.error, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Staff and Worker Isolation: strictly zero access to Offers module", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    // Create Staff and Worker
    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Charlie Staff",
      email: "staff@example.com",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Bob Worker",
      email: "worker@example.com",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      role: "moderator",
      warehouse: null,
      password: "moderator-pass-1",
    });

    const staffSign = await store.signIn("staff@example.com", "staff-pass-1");
    const workerSign = await store.signIn("worker@example.com", "worker-pass-1");
    const modSign = await store.signIn("moderator@example.com", "moderator-pass-1");
    assert.equal(staffSign.ok && workerSign.ok && modSign.ok, true);
    if (!staffSign.ok || !workerSign.ok || !modSign.ok) return;

    // Moderator creates an offer
    await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Confidential Polymer Offer",
      country: "Belgium",
      quantity: 12000,
      unit: "kg",
      pricePerUnit: 1.5,
      currency: "EUR",
      truckLoads: 1,
    });

    const modView = await store.view(modSign.value.sessionId);
    const offer = modView.state.offers[0];

    // Staff workspace MUST NOT contain any offers
    const staffView = await store.view(staffSign.value.sessionId);
    assert.equal(staffView.state.offers.length, 0);

    // Worker workspace MUST NOT contain any offers
    const workerView = await store.view(workerSign.value.sessionId);
    assert.equal(workerView.state.offers.length, 0);

    // Staff commands MUST fail
    assert.notEqual((await store.run(staffSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Staff Offer",
      country: "Belgium",
      quantity: 1000,
      unit: "kg",
      pricePerUnit: 1.0,
      currency: "EUR",
      truckLoads: 1,
    })).error, undefined);

    assert.notEqual((await store.run(staffSign.value.sessionId, "editOffer", {
      offerId: offer.id,
      quantity: 5000,
    })).error, undefined);

    assert.notEqual((await store.run(staffSign.value.sessionId, "deleteOffer", {
      offerId: offer.id,
    })).error, undefined);

    assert.notEqual((await store.run(staffSign.value.sessionId, "decideOffer", {
      offerId: offer.id,
      decision: "approved",
      note: "Staff approving",
    })).error, undefined);

    // Worker commands MUST fail
    assert.notEqual((await store.run(workerSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Worker Offer",
      country: "Belgium",
      quantity: 1000,
      unit: "kg",
      pricePerUnit: 1.0,
      currency: "EUR",
      truckLoads: 1,
    })).error, undefined);

    assert.notEqual((await store.run(workerSign.value.sessionId, "deleteOffer", {
      offerId: offer.id,
    })).error, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Offer Comments, Attachments, and Favourites", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const ownerSign = await store.signIn("owner@example.com", "owner-pass-1");
    assert.equal(ownerSign.ok, true);
    if (!ownerSign.ok) return;

    await store.run(ownerSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@example.com",
      role: "moderator",
      warehouse: null,
      password: "moderator-pass-1",
    });

    const modSign = await store.signIn("moderator@example.com", "moderator-pass-1");
    assert.equal(modSign.ok, true);
    if (!modSign.ok) return;

    // Moderator creates an offer
    await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "Offer with Attachments LDPE",
      country: "Belgium",
      quantity: 10000,
      unit: "kg",
      pricePerUnit: 1.1,
      currency: "EUR",
      truckLoads: 1,
    });

    let modView = await store.view(modSign.value.sessionId);
    const offer = modView.state.offers[0];

    // 1. Moderator adds an image attachment
    const imgAtt = await store.run(modSign.value.sessionId, "addOfferAttachment", {
      offerId: offer.id,
      name: "material_sample.gif",
      mime: "image/gif",
      bytesBase64: validGifBase64,
    });
    assert.equal(imgAtt.error, undefined);

    modView = await store.view(modSign.value.sessionId);
    const offerWithAtt = modView.state.offers[0];
    assert.equal(offerWithAtt.attachments.length, 1);
    assert.equal(offerWithAtt.attachments[0].kind, "image");

    // 2. Comments: Moderator posts a comment, Admin responds
    const modComment = await store.run(modSign.value.sessionId, "addOfferComment", {
      offerId: offer.id,
      comment: "Sample passed internal melt flow index testing.",
    });
    assert.equal(modComment.error, undefined);

    const adminComment = await store.run(ownerSign.value.sessionId, "addOfferComment", {
      offerId: offer.id,
      comment: "Understood. Please obtain COA before final contract.",
    });
    assert.equal(adminComment.error, undefined);

    modView = await store.view(modSign.value.sessionId);
    const offerWithComments = modView.state.offers[0];
    assert.equal(offerWithComments.comments.length, 2);
    assert.equal(offerWithComments.comments[0].authorName, "Morgan Moderator");
    assert.equal(offerWithComments.comments[0].authorRole, "moderator");
    assert.equal(offerWithComments.comments[1].authorName, "Ada Owner");
    assert.equal(offerWithComments.comments[1].authorRole, "owner");

    // 3. Toggle favourite
    assert.equal(offerWithComments.isFavourite, false);
    const favResult = await store.run(modSign.value.sessionId, "toggleOfferFavourite", {
      offerId: offer.id,
    });
    assert.equal(favResult.error, undefined);

    modView = await store.view(modSign.value.sessionId);
    assert.equal(modView.state.offers[0].isFavourite, true);

    // 4. Delete attachment
    const attToDelete = offerWithAtt.attachments[0];
    const delAttResult = await store.run(modSign.value.sessionId, "deleteOfferAttachment", {
      offerId: offer.id,
      attachmentId: attToDelete.id,
    });
    assert.equal(delAttResult.error, undefined);

    modView = await store.view(modSign.value.sessionId);
    assert.equal(modView.state.offers[0].attachments.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Dashboard KPI Stats correctly aggregate offers data", () => {
  const dummyOffers = [
    { statusKey: "draft", truckLoads: 1, kind: "purchasing" },
    { statusKey: "received", truckLoads: 2, kind: "selling" },
    { statusKey: "under_review", truckLoads: 3, kind: "purchasing" },
    { statusKey: "negotiating", truckLoads: 1, kind: "selling" },
    { statusKey: "won", truckLoads: 4, kind: "purchasing" },
    { statusKey: "lost", truckLoads: 2, kind: "selling" },
  ] as unknown as OfferView[];

  const stats = calculateOfferStats(dummyOffers);
  assert.equal(stats.totalOffers, 6);
  assert.equal(stats.pending, 2); // draft + received
  assert.equal(stats.underReview, 1);
  assert.equal(stats.negotiating, 1);
  assert.equal(stats.won, 1);
  assert.equal(stats.lost, 1);
  assert.equal(stats.truckLoads, 13); // 1+2+3+1+4+2 = 13
  assert.equal(stats.purchasingCount, 3);
  assert.equal(stats.sellingCount, 3);
});
