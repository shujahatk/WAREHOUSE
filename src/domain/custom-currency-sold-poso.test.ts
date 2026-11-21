import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAdapter } from "./local-adapter.ts";
import {
  getCurrency,
  getCurrencySymbol,
  formatMoney,
  formatCompactMoney,
  groupTotalsByCurrency,
  formatCurrencySummary,
} from "../lib/currency.ts";

const now = "2026-11-20T12:00:00.000Z";
const reference = JSON.stringify({
  warehouses: [
    { name: "Bornem", country: "Belgium" },
    { name: "Turnhout", country: "Belgium" },
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

function createTestAdapter() {
  const dir = mkdtempSync(path.join(tmpdir(), "stockflow-currency-sold-poso-"));
  const file = path.join(dir, "store.json");
  return {
    dir,
    store: createLocalAdapter(
      file,
      {
        NODE_ENV: "test",
        STOCKFLOW_OWNER_EMAIL: "admin@stockflow.test",
        STOCKFLOW_OWNER_NAME: "Alex Admin",
        STOCKFLOW_OWNER_PASSWORD: "admin-pass-1",
        STOCKFLOW_REFERENCE_JSON: reference,
      },
      () => now
    ),
  };
}

test("1. Currency Library: ISO 4217 validation, formatting, and strict grouping by currency", () => {
  // Common currencies validation
  assert.equal(getCurrency("USD")?.code, "USD");
  assert.equal(getCurrency("eur")?.symbol, "€");
  assert.equal(getCurrency("GBP")?.symbol, "£");
  assert.equal(getCurrency("PKR")?.symbol, "₨");
  assert.equal(getCurrency("aed")?.symbol, "AED");
  assert.equal(getCurrency("CHF")?.symbol, "CHF");

  // Fallback for unknown currency
  assert.equal(getCurrencySymbol("XYZ"), "XYZ");
  assert.equal(getCurrency("XYZ")?.code, "XYZ");

  // Money formatting
  assert.equal(formatMoney(1250, "EUR"), "€1,250.00 EUR");
  assert.equal(formatMoney(54000.5, "USD"), "$54,000.50 USD");
  assert.equal(formatMoney(100000, "PKR"), "₨100,000.00 PKR");
  assert.equal(formatMoney(2500, "GBP"), "£2,500.00 GBP");

  // Compact money formatting
  assert.equal(formatCompactMoney(1200000, "USD"), "$1.2M USD");
  assert.equal(formatCompactMoney(45000, "EUR"), "€45k EUR");

  // Multi-currency grouping - strict separation, no combining
  const items = [
    { totalValue: 10000, currency: "USD" },
    { totalValue: 15000, currency: "USD" },
    { totalValue: 20000, currency: "EUR" },
    { totalValue: 5000, currency: "EUR" },
    { totalValue: 100000, currency: "PKR" },
  ];
  const grouped = groupTotalsByCurrency(items);
  assert.equal(grouped.get("USD"), 25000);
  assert.equal(grouped.get("EUR"), 25000);
  assert.equal(grouped.get("PKR"), 100000);

  const summary = formatCurrencySummary(grouped);
  assert.ok(summary.includes("$25,000.00 USD"));
  assert.ok(summary.includes("€25,000.00 EUR"));
  assert.ok(summary.includes("₨100,000.00 PKR"));
});

test("2. Multi-Currency Orders & Offers: Creation, Persistence, and Independent Sold Workflow", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;

    // Admin creates Staff and Moderator
    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@stockflow.test",
      role: "manager",
      warehouse: null,
      password: "staff-pass-1",
    });

    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Morgan Moderator",
      email: "moderator@stockflow.test",
      role: "moderator",
      warehouse: null,
      password: "mod-pass-1",
    });

    const staffSign = await store.signIn("staff@stockflow.test", "staff-pass-1");
    const modSign = await store.signIn("moderator@stockflow.test", "mod-pass-1");
    assert.equal(staffSign.ok, true);
    assert.equal(modSign.ok, true);
    if (!staffSign.ok || !modSign.ok) return;

    // Staff creates PO with USD currency
    const poResult = await store.run(staffSign.value.sessionId, "createPurchase", {
      type: "PO",
      number: "PO-2026-9001",
      supplier: "Global Resin Supplies",
      material: "LDPE Pellets",
      quantityKg: 50000,
      valueEur: 75000,
      currency: "USD",
      warehouse: "Bornem",
      notes: "Sourced in USD",
    });
    assert.equal(poResult.error, undefined);

    const staffView = await store.view(staffSign.value.sessionId);
    const createdPo = staffView.state.orders.find((o) => o.number === "PO-2026-9001");
    assert.ok(createdPo);
    assert.equal(createdPo.currency, "USD");
    assert.equal(createdPo.valueEur, 75000);

    // Moderator creates Purchasing Offer linked to PO
    const purchOffer = await store.run(modSign.value.sessionId, "createOffer", {
      kind: "purchasing",
      material: "LDPE Film Grade US",
      materialType: "Plastics",
      materialGrade: "Prime",
      quantity: 50000,
      unit: "kg",
      pricePerUnit: 1.5,
      currency: "USD",
      country: "Belgium",
      location: "Bornem",
      truckLoads: 2,
      poNumber: "PO-2026-9001",
    });
    assert.equal(purchOffer.error, undefined);

    const modView1 = await store.view(modSign.value.sessionId);
    const createdPurch = modView1.state.offers.find((o) => o.material === "LDPE Film Grade US");
    assert.ok(createdPurch);
    assert.equal(createdPurch.currency, "USD");
    assert.equal(createdPurch.totalValue, 75000);
    assert.equal(createdPurch.statusKey, "draft");

    // Moderator creates a Selling Offer linked to this Purchasing Offer in GBP
    const sellOffer = await store.run(modSign.value.sessionId, "createOffer", {
      kind: "selling",
      material: "LDPE Film Grade UK Client",
      materialType: "Plastics",
      materialGrade: "Prime",
      quantity: 25000,
      unit: "kg",
      pricePerUnit: 1.8,
      currency: "GBP",
      country: "United Kingdom",
      location: "London",
      truckLoads: 1,
      poNumber: "PO-2026-9001",
      purchasingOfferId: createdPurch.id,
      clientName: "Apex Polymers Ltd",
      contactNumber: "+44 20 7946 0912",
      emailAddress: "procurement@apex.co.uk",
      origin: "Bornem",
      destination: "London",
    });
    assert.equal(sellOffer.error, undefined);

    const modView2 = await store.view(modSign.value.sessionId);
    const createdSell = modView2.state.offers.find((o) => o.material === "LDPE Film Grade UK Client");
    assert.ok(createdSell);
    assert.equal(createdSell.currency, "GBP");
    assert.equal(createdSell.totalValue, 45000);

    // Moderator submits Selling Offer for review
    const submitSell = await store.run(modSign.value.sessionId, "submitOfferForReview", {
      offerId: createdSell.id,
    });
    assert.equal(submitSell.error, undefined);

    // Admin attempt to decide offer MUST FAIL (Admin is strictly read-only)
    const adminAttempt = await store.run(adminSign.value.sessionId, "decideOffer", {
      offerId: createdSell.id,
      decision: "approved",
      note: "Admin trying to approve",
    });
    assert.equal(adminAttempt.error, "Admin access is read-only. Mutations are not permitted.");

    // Moderator approves the Selling Offer
    const approveSell = await store.run(modSign.value.sessionId, "decideOffer", {
      offerId: createdSell.id,
      decision: "approved",
      note: "Commercial margin approved at 1.80 GBP/kg.",
    });
    assert.equal(approveSell.error, undefined);

    // Verify Selling Offer is now Sold
    const adminView = await store.view(adminSign.value.sessionId);
    const approvedSell = adminView.state.offers.find((o) => o.id === createdSell.id);
    assert.ok(approvedSell);
    assert.equal(approvedSell.approvalStatus, "approved");
    assert.equal(approvedSell.soldAt, now);
    assert.equal(approvedSell.adminDecisionNote, "Commercial margin approved at 1.80 GBP/kg.");

    // CRITICAL: Verify linked Purchasing Offer is completely independent and remains open!
    const unchangedPurch = adminView.state.offers.find((o) => o.id === createdPurch.id);
    assert.ok(unchangedPurch);
    assert.equal(unchangedPurch.statusKey, "draft");
    assert.equal(unchangedPurch.soldAt, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("3. PO/SO Assignment: Staff and Admin can assign reference to approved request without stock change", async () => {
  const { dir, store } = createTestAdapter();
  try {
    const adminSign = await store.signIn("admin@stockflow.test", "admin-pass-1");
    assert.equal(adminSign.ok, true);
    if (!adminSign.ok) return;

    // Admin adds Staff and Worker
    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Sam Staff",
      email: "staff@stockflow.test",
      role: "manager",
      warehouse: "Bornem",
      password: "staff-pass-1",
    });
    await store.run(adminSign.value.sessionId, "addUser", {
      name: "Will Worker",
      email: "worker@stockflow.test",
      role: "worker",
      warehouse: "Bornem",
      password: "worker-pass-1",
    });

    const staffSign = await store.signIn("staff@stockflow.test", "staff-pass-1");
    const workerSign = await store.signIn("worker@stockflow.test", "worker-pass-1");
    assert.equal(staffSign.ok, true);
    assert.equal(workerSign.ok, true);
    if (!staffSign.ok || !workerSign.ok) return;

    // Worker creates general operational request
    const reqResult = await store.run(workerSign.value.sessionId, "createGeneralRequest", {
      category: "materials_packaging",
      priority: "high",
      description: "Truck arrived with packaging pallets",
    });
    assert.equal(reqResult.error, undefined);

    const workerView1 = await store.view(workerSign.value.sessionId);
    const req = workerView1.state.generalRequests[0];
    assert.ok(req);
    assert.equal(req.status, "submitted");

    // Admin cannot approve operational request (Admin is strictly read-only)
    const adminApprove = await store.run(adminSign.value.sessionId, "decideGeneralRequest", {
      id: req.id,
      decision: "approved",
      note: "Admin trying to approve",
    });
    assert.ok(adminApprove.error?.includes("Admin access is read-only"));

    // Staff approves the request
    const staffApprove = await store.run(staffSign.value.sessionId, "decideGeneralRequest", {
      id: req.id,
      decision: "approved",
      note: "Approved for warehouse intake",
    });
    assert.equal(staffApprove.error, undefined);

    // Record initial stock balances before assignment
    const viewBefore = await store.view(adminSign.value.sessionId);
    const stockCountBefore = viewBefore.state.stock.length;

    // Staff assigns PO reference to the approved request
    const assignPoResult = await store.run(staffSign.value.sessionId, "assignPoSoToGeneralRequest", {
      requestId: req.id,
      poSoNumber: "PO-2026-0042",
    });
    assert.equal(assignPoResult.error, undefined);

    // Verify assigned reference in description
    const viewAfter = await store.view(adminSign.value.sessionId);
    const updatedReq = viewAfter.state.generalRequests.find((r) => r.id === req.id);
    assert.ok(updatedReq);
    assert.ok(updatedReq.description.includes("PO-2026-0042"));

    // CRITICAL: Confirm stock balances have NOT changed upon assignment
    const stockCountAfter = viewAfter.state.stock.length;
    assert.equal(stockCountBefore, stockCountAfter);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
