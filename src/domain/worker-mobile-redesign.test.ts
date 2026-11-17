import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { WORKER_THEME } from "../components/worker/worker-theme.ts";
import { calculateSection, PRESET_PACKAGING } from "../lib/packaging.ts";
import {
  canAccess,
  canPerform,
  canOperateWarehouse,
  normalizeRole,
} from "../lib/permissions.ts";
import {
  demurrageFromMinutes,
  demurrageSnapshot,
  emptyDemurrage,
  emptyWorkspace,
  visibleContainers,
  visibleOutbound,
  visibleStock,
  type DemoContainer,
  type DemoOutbound,
  type DemoState,
} from "../domain/view.ts";

describe("StockFlow – Worker Mobile Module Comprehensive Verification", () => {
  test("1. Design tokens conform to dark navy & purple visual language", () => {
    assert.equal(WORKER_THEME.bg, "bg-[#0B0F19]");
    assert.match(WORKER_THEME.card, /bg-\[#121B2E\]/);
    assert.match(WORKER_THEME.btnPrimary, /bg-violet-600/);
    assert.match(WORKER_THEME.btnPrimary, /min-h-\[48px\]/);
    assert.match(WORKER_THEME.input, /h-12/);
    assert.match(WORKER_THEME.select, /h-12/);
    assert.match(WORKER_THEME.btnDanger, /bg-rose-500/);
  });

  test("2. Worker Permissions & Strict Boundaries", () => {
    // Workers can access worker operational routes
    assert.equal(canAccess("worker", "/dashboard"), true);
    assert.equal(canAccess("worker", "/containers"), true);
    assert.equal(canAccess("worker", "/outbound"), true);
    assert.equal(canAccess("worker", "/inventory"), true);
    assert.equal(canAccess("worker", "/tasks"), true);
    assert.equal(canAccess("worker", "/stock-movements"), true);

    // Workers MUST NOT access Admin, Staff, or Offers portals
    assert.equal(canAccess("worker", "/users"), false);
    assert.equal(canAccess("worker", "/purchases"), false);
    assert.equal(canAccess("worker", "/transfers"), false);
    assert.equal(canAccess("worker", "/suppliers"), false);
    assert.equal(canAccess("worker", "/customers"), false);
    assert.equal(canAccess("worker", "/materials"), false);
    assert.equal(canAccess("worker", "/reports"), false);
    assert.equal(canAccess("worker", "/audit"), false);
    assert.equal(canAccess("worker", "/settings"), false);
    assert.equal(canAccess("worker", "/offers"), false);
    assert.equal(canAccess("worker", "/offers/purchasing"), false);
    assert.equal(canAccess("worker", "/offers/selling"), false);

    // Workers cannot perform administrative or master data operations
    assert.equal(canPerform("worker", "create-order"), false);
    assert.equal(canPerform("worker", "create-transfer"), false);
    assert.equal(canPerform("worker", "edit-customs"), false);
    assert.equal(canPerform("worker", "confirm-seller"), false);
    assert.equal(canPerform("worker", "manage-users"), false);
    assert.equal(canPerform("worker", "manage-warehouses"), false);
    assert.equal(canPerform("worker", "manage-materials"), false);
    assert.equal(canPerform("worker", "assign-worker-po"), false);

    // Workers CAN edit operational sections and upload CMR/photos
    assert.equal(canPerform("worker", "edit-shipment"), true);
    assert.equal(canPerform("worker", "save-cmr"), true);
    assert.equal(canPerform("worker", "unload"), true);
    assert.equal(canPerform("worker", "dispatch"), true);
  });

  test("3. Warehouse Scoping prevents cross-depot tampering", () => {
    // Alice in Bornem can operate Bornem only
    assert.equal(canOperateWarehouse("worker", "Bornem", "Bornem"), true);
    assert.equal(canOperateWarehouse("worker", "Bornem", "Antwerp"), false);
    assert.equal(canOperateWarehouse("worker", "Bornem", "Rotterdam"), false);

    // Non-workers (owner/manager) do not use worker operational scope
    assert.equal(canOperateWarehouse("owner", null, "Bornem"), false);
  });

  test("4. Material Section Weight & Packaging Calculations", () => {
    // Standard calculation: Gross 1,000kg - (Normal Pallet 25kg * 4) = Net 900kg
    const normalPallet = PRESET_PACKAGING.find((p) => p.id === "normal-pallet");
    assert.equal(normalPallet?.tareKg, 25);

    const calc1 = calculateSection({
      mode: "weight",
      grossKg: 1000,
      tarePerUnitKg: normalPallet?.tareKg ?? 25,
      packagingQty: 4,
    });
    assert.equal(calc1.ok, true);
    if (calc1.ok) {
      assert.equal(calc1.totalTareKg, 100);
      assert.equal(calc1.netKg, 900);
      assert.equal(calc1.postsWeight, true);
    }

    // Invalid gross: tare exceeds gross
    const calc2 = calculateSection({
      mode: "weight",
      grossKg: 50,
      tarePerUnitKg: 30,
      packagingQty: 2, // tare = 60kg > 50kg
    });
    assert.equal(calc2.ok, false);

    // Count-only mode: posts no weight
    const calc3 = calculateSection({
      mode: "count",
      grossKg: null,
      tarePerUnitKg: null,
      packagingQty: null,
    });
    assert.equal(calc3.ok, true);
    if (calc3.ok) {
      assert.equal(calc3.totalTareKg, 0);
      assert.equal(calc3.netKg, null);
      assert.equal(calc3.postsWeight, false);
    }

    // Bulk / No Tare: Net = Gross
    const calc4 = calculateSection({
      mode: "weight",
      grossKg: 2500,
      tarePerUnitKg: 0,
      packagingQty: 1,
      noTare: true,
    });
    assert.equal(calc4.ok, true);
    if (calc4.ok) {
      assert.equal(calc4.totalTareKg, 0);
      assert.equal(calc4.netKg, 2500);
      assert.equal(calc4.postsWeight, true);
    }
  });

  test("5. Demurrage Calculation & Overtime Triggers", () => {
    // 60 minutes elapsed (within 120min free time): 0 EUR
    const res1 = demurrageFromMinutes(60, 120, 1);
    assert.equal(res1.billableMinutes, 0);
    assert.equal(res1.chargeEUR, 0);

    // 150 minutes elapsed (30 min overtime): 30 EUR
    const res2 = demurrageFromMinutes(150, 120, 1);
    assert.equal(res2.billableMinutes, 30);
    assert.equal(res2.chargeEUR, 30);

    // Live container snapshot check
    const container: DemoContainer = {
      number: "INB-TEST-001",
      po: "PO-2026-0001",
      supplier: "Test Scrap BV",
      origin: "Rotterdam Port",
      warehouse: "Bornem",
      status: "Unloading",
      eta: "2026-11-17",
      sections: [],
      containerNumber: "MSCU-1234567",
      demurrage: {
        ...emptyDemurrage(),
        startedAt: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
        freeMinutes: 120,
        ratePerMinute: 1,
      },
    };

    const snap = demurrageSnapshot(container, Date.now());
    assert.equal(snap.phase, "running");
    assert.equal(snap.overtime, true);
    assert.equal(snap.billableMinutes >= 29, true);
    assert.equal(snap.chargeEUR >= 29, true);
  });

  test("6. Worker Scoped State Filtering across Warehouses", () => {
    const mockState: DemoState = {
      ...emptyWorkspace(),
      containers: [
        {
          number: "INB-BORNEM-1",
          po: "PO-1",
          supplier: "Sup A",
          origin: "BE",
          warehouse: "Bornem",
          status: "Registered",
          eta: "2026-11-17",
          sections: [],
          containerNumber: "C1",
          demurrage: emptyDemurrage(),
        },
        {
          number: "INB-ANTWERP-1",
          po: "PO-2",
          supplier: "Sup B",
          origin: "NL",
          warehouse: "Antwerp",
          status: "Registered",
          eta: "2026-11-17",
          sections: [],
          containerNumber: "C2",
          demurrage: emptyDemurrage(),
        },
      ],
      outbound: [
        {
          number: "OUT-BORNEM-1",
          po: "SO-1",
          customer: "Cust A",
          warehouse: "Bornem",
          status: "Planned",
          date: "2026-11-17",
          sections: [],
          container: "C3",
          carrier: "",
          handover: "",
          weightKg: 500,
          material: "Copper",
          customs: { reference: "", procedureNote: "", goodsDescription: "", declarantReference: "" },
          sellerConfirmation: { status: "Confirmed", company: "", confirmedBy: "", confirmedAt: "" },
          customsConfirmation: { status: "Confirmed", confirmedBy: "", confirmedAt: "", proofName: "", proofMime: "", proofSize: 0 },
          dispatchOverride: null,
          audit: [],
        },
        {
          number: "OUT-ANTWERP-1",
          po: "SO-2",
          customer: "Cust B",
          warehouse: "Antwerp",
          status: "Planned",
          date: "2026-11-17",
          sections: [],
          container: "C4",
          carrier: "",
          handover: "",
          weightKg: 800,
          material: "Aluminium",
          customs: { reference: "", procedureNote: "", goodsDescription: "", declarantReference: "" },
          sellerConfirmation: { status: "Confirmed", company: "", confirmedBy: "", confirmedAt: "" },
          customsConfirmation: { status: "Confirmed", confirmedBy: "", confirmedAt: "", proofName: "", proofMime: "", proofSize: 0 },
          dispatchOverride: null,
          audit: [],
        },
      ],
      stock: [
        { id: "S1", material: "Copper", category: "Metals", warehouse: "Bornem", weightKg: 1000, quantity: 10, location: "Bay 1", packaging: "Pallet", reorder: 100 },
        { id: "S2", material: "Aluminium", category: "Metals", warehouse: "Antwerp", weightKg: 2000, quantity: 20, location: "Bay 2", packaging: "Pallet", reorder: 100 },
      ],
    };

    const workerActor = {
      name: "Alice Worker",
      email: "alice@stockflow.local",
      role: "worker" as const,
      warehouse: "Bornem",
    };

    const visibleC = visibleContainers(mockState, workerActor);
    assert.equal(visibleC.length, 1);
    assert.equal(visibleC[0]?.warehouse, "Bornem");

    const visibleO = visibleOutbound(mockState, workerActor);
    assert.equal(visibleO.length, 1);
    assert.equal(visibleO[0]?.warehouse, "Bornem");

    const visibleS = visibleStock(mockState, "worker", "Bornem");
    assert.equal(visibleS.length, 1);
    assert.equal(visibleS[0]?.material, "Copper");
  });
});
