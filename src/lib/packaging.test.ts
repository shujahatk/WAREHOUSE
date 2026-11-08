import assert from "node:assert/strict";
import test from "node:test";
import { PRESET_PACKAGING, calculateSection, validateShipmentFile } from "./packaging.ts";

test("every preset tare matches the product list", () => {
  const expected: Record<string, number | null> = {
    "Small Pallet": 15,
    "Normal Pallet": 25,
    "Big Pallet": 50,
    "Carton Box": 30,
    "Wooden Box": 40,
    "Small Cage": 60,
    Cage: 120,
    "Big Cage": 160,
    "Bulk / Others": null,
  };
  assert.equal(PRESET_PACKAGING.length, 9);
  for (const item of PRESET_PACKAGING) {
    assert.equal(item.tareKg, expected[item.label]);
    if (item.tareKg == null) continue;
    const result = calculateSection({ mode: "weight", grossKg: 1000, tarePerUnitKg: item.tareKg, packagingQty: 2 });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.totalTareKg, item.tareKg * 2);
    assert.equal(result.netKg, 1000 - item.tareKg * 2);
  }
});

test("net weight recalculates and rejects invalid tare", () => {
  const first = calculateSection({ mode: "weight", grossKg: 500, tarePerUnitKg: 25, packagingQty: 4 });
  assert.equal(first.ok && first.netKg, 400);
  const changed = calculateSection({ mode: "weight", grossKg: 500, tarePerUnitKg: 25, packagingQty: 2 });
  assert.equal(changed.ok && changed.netKg, 450);
  const zero = calculateSection({ mode: "weight", grossKg: 80, tarePerUnitKg: 0, packagingQty: 0 });
  assert.equal(zero.ok && zero.netKg, 80);
  const negativeGross = calculateSection({ mode: "weight", grossKg: -1, tarePerUnitKg: 15, packagingQty: 1 });
  assert.equal(negativeGross.ok, false);
  const negativeTare = calculateSection({ mode: "weight", grossKg: 100, tarePerUnitKg: -5, packagingQty: 1 });
  assert.equal(negativeTare.ok, false);
  const fraction = calculateSection({ mode: "weight", grossKg: 100, tarePerUnitKg: 15, packagingQty: 1.5 });
  assert.equal(fraction.ok, false);
  const excessive = calculateSection({ mode: "weight", grossKg: 100, tarePerUnitKg: 160, packagingQty: 1 });
  assert.equal(excessive.ok, false);
  if (!excessive.ok) assert.match(excessive.error, /exceed/);
});

test("bulk tare is explicit and count-only posts no weight", () => {
  const missing = calculateSection({ mode: "weight", grossKg: 100, tarePerUnitKg: null, packagingQty: 1 });
  assert.equal(missing.ok, false);
  const none = calculateSection({ mode: "weight", grossKg: 100, tarePerUnitKg: 12, packagingQty: 1, noTare: true });
  assert.equal(none.ok && none.netKg, 100);
  const manual = calculateSection({ mode: "weight", grossKg: 100, tarePerUnitKg: 12, packagingQty: 2 });
  assert.equal(manual.ok && manual.totalTareKg, 24);
  assert.equal(manual.ok && manual.netKg, 76);
  const counted = calculateSection({ mode: "count", grossKg: null, tarePerUnitKg: null, packagingQty: null });
  assert.equal(counted.ok && counted.postsWeight, false);
  assert.equal(counted.ok && counted.netKg, null);
});

test("cmr and photo files reject empty or unsupported selections", () => {
  assert.match(validateShipmentFile("cmr", { name: "", type: "application/pdf", size: 10 }) ?? "", /non-empty/);
  assert.match(validateShipmentFile("cmr", { name: "cmr.pdf", type: "application/pdf", size: 0 }) ?? "", /non-empty/);
  assert.equal(validateShipmentFile("cmr", { name: "cmr.pdf", type: "application/pdf", size: 20 }), null);
  assert.equal(validateShipmentFile("photo", { name: "dock.jpg", type: "image/jpeg", size: 20 }), null);
  assert.match(validateShipmentFile("cmr", { name: "notes.txt", type: "text/plain", size: 20 }) ?? "", /PDF or an image/);
  assert.match(validateShipmentFile("photo", { name: "cmr.pdf", type: "application/pdf", size: 20 }) ?? "", /image/);
});
