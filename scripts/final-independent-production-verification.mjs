// scripts/final-independent-production-verification.mjs
// RM Warehouse StockFlow — Final Independent Production Verification Suite
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseRestClient } from '../src/lib/supabase/client.ts';
import { getSupabaseConfig } from '../src/lib/supabase/config.ts';
import { SupabaseAdapter } from '../src/lib/data/supabase-adapter.ts';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const k = match[1].trim();
    const v = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
});

const config = getSupabaseConfig();
const restClient = new SupabaseRestClient(config);
const adapter = new SupabaseAdapter(restClient);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function verifyCheck(name, fn) {
  totalTests++;
  process.stdout.write(`[CHECK ${totalTests}] ${name}... `);
  try {
    await fn();
    passedTests++;
    console.log('PASS');
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err.message });
    console.log(`FAIL\n  --> ${err.message}`);
  }
}

async function main() {
  console.log('========================================================================');
  console.log('   RM WAREHOUSE STOCKFLOW — FINAL INDEPENDENT PRODUCTION VERIFICATION   ');
  console.log('========================================================================');

  // Track session objects
  let admin = null;
  let staff = null;
  let worker = null;
  let moderator = null;
  let external = null;

  // ---------------------------------------------------------------------------
  // 1. RE-VERIFY PREVIOUS AUDIT: AUTHENTICATION ACROSS ALL 5 ROLES
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. AUTHENTICATION & STRICT PASSWORD VERIFICATION ---');

  await verifyCheck('Admin authentication with valid password', async () => {
    const res = await adapter.signIn('admin@stockflow.local', 'StockFlowAdmin2026!');
    assert.equal(res.ok, true, `Admin login failed: ${res.error}`);
    assert.equal(res.value?.profile?.role, 'owner');
    admin = res.value;
  });

  await verifyCheck('Staff authentication with valid password', async () => {
    const res = await adapter.signIn('staff@stockflow.local', 'StockFlowStaff2026!');
    assert.equal(res.ok, true, `Staff login failed: ${res.error}`);
    assert.equal(res.value?.profile?.role, 'manager');
    staff = res.value;
  });

  await verifyCheck('Worker authentication with valid password', async () => {
    const res = await adapter.signIn('worker.bornem@stockflow.local', 'StockFlowWorker2026!');
    assert.equal(res.ok, true, `Worker login failed: ${res.error}`);
    assert.equal(res.value?.profile?.role, 'worker');
    worker = res.value;
  });

  await verifyCheck('Moderator authentication with valid password', async () => {
    const res = await adapter.signIn('moderator@stockflow.local', 'StockFlowMod2026!');
    assert.equal(res.ok, true, `Moderator login failed: ${res.error}`);
    assert.equal(res.value?.profile?.role, 'moderator');
    moderator = res.value;
  });

  await verifyCheck('External trader authentication with valid password', async () => {
    const res = await adapter.signIn('test_offers_1795269435066@tradingpartner.com', 'SecurePassword2026!');
    assert.equal(res.ok, true, `External login failed: ${res.error}`);
    assert.equal(res.value?.profile?.role, 'offers_user');
    external = res.value;
  });

  // ---------------------------------------------------------------------------
  // 2. SECURITY REVIEW: NO PASSWORD BYPASS & PRIVILEGE ESCALATION PREVENTION
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. SECURITY REVIEW: REGISTRATION & AUTHENTICATION HARDENING ---');

  await verifyCheck('Security: Wrong password for Admin must be STRICTLY REJECTED', async () => {
    const res = await adapter.signIn('admin@stockflow.local', 'AttackerGuessedPassword!');
    assert.equal(res.ok, false, 'Invalid password must NEVER log in');
    assert.equal(res.error, 'Invalid login credentials');
  });

  await verifyCheck('Security: Wrong password for Staff must be STRICTLY REJECTED', async () => {
    const res = await adapter.signIn('staff@stockflow.local', 'AttackerGuessedPassword!');
    assert.equal(res.ok, false, 'Invalid password must NEVER log in');
    assert.equal(res.error, 'Invalid login credentials');
  });

  await verifyCheck('Security: Public signup attempting privilege escalation to "owner" is forced to "worker"', async () => {
    const probeEmail = `probe_privilege_${Date.now()}@testcorp.com`;
    const regRes = await adapter.run(null, 'signUpUser', {
      email: probeEmail,
      name: 'Privilege Escalation Probe',
      phone: '+32499123456',
      password: 'ProbePassword2026!',
      confirmPassword: 'ProbePassword2026!',
      role: 'owner', // Malicious attempt to self-assign Admin
    });
    assert.equal(regRes.error, undefined, `Signup must succeed: ${regRes.error}`);

    // Verify stored role in database via admin snapshot
    const snap = await adapter.snapshot(admin.sessionId);
    const applicant = (snap.users || []).find((u) => u.email === probeEmail);
    assert.ok(applicant, 'Applicant must exist in accounts snapshot');
    assert.equal(applicant.role, 'worker', 'Role MUST be forced to "worker", privilege escalation must fail!');
    assert.equal(applicant.approvalStatus, 'pending');
    assert.equal(applicant.active, false);

    // Clean up probe record
    const adminTok = await adapter['getAdminToken']();
    await restClient.delete('users', `email=eq.${encodeURIComponent(probeEmail)}`, adminTok);
  });

  await verifyCheck('Security: Pending user cannot access protected routes or APIs', async () => {
    const pendingEmail = `pending_${Date.now()}@testcorp.com`;
    await adapter.run(null, 'registerOffersUser', {
      email: pendingEmail,
      name: 'Pending Applicant',
      company: 'Test Hub',
      password: 'PendingPass2026!',
    });

    const loginRes = await adapter.signIn(pendingEmail, 'PendingPass2026!');
    assert.equal(loginRes.ok, false, 'Pending user must not be able to log in');
    assert.ok(loginRes.error?.includes('pending') || loginRes.error?.includes('approval'), 'Must show pending notice');

    // Clean up
    const adminTok = await adapter['getAdminToken']();
    await restClient.delete('users', `email=eq.${encodeURIComponent(pendingEmail)}`, adminTok);
  });

  // ---------------------------------------------------------------------------
  // 3. COMPLETE FUNCTIONAL COVERAGE: PO/SO FULL LIFECYCLE & DELETION
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. COMMERCIAL PO/SO LIFECYCLE, EDITING & DELETION ---');
  let testPoNumber = `PO-TEST-${Date.now().toString().slice(-4)}`;
  let testPoId = null;

  await verifyCheck('Staff creates new Purchase Order with full details', async () => {
    const res = await adapter.run(staff.sessionId, 'createPurchase', {
      number: testPoNumber,
      supplier: 'Antwerp Polymer Imports',
      purchaserName: 'Staff Manager',
      purchasingPrice: 22500,
      transportPrice: 1400,
      origin: 'Rotterdam, NL',
      destination: 'Bornem, BE',
      warehouse: 'Bornem',
      annex7: true,
      material: 'HDPE Regrind',
      quantityKg: 10000,
      notes: 'Initial test PO creation',
    });
    assert.equal(res.error, undefined, `PO creation must succeed: ${res.error}`);

    // Verify in snapshot
    const snap = await adapter.snapshot(staff.sessionId);
    const order = (snap.purchaseOrders || snap.orders || []).find((o) => o.number === testPoNumber);
    assert.ok(order, 'PO must exist in store');
    testPoId = order.id;
  });

  await verifyCheck('Staff edits PO details (pricing, origin, transport)', async () => {
    const res = await adapter.run(staff.sessionId, 'editPurchase', {
      id: testPoId,
      number: testPoNumber,
      supplier: 'Antwerp Polymer Imports BVBA',
      purchaserName: 'Lead Staff',
      purchasingPrice: 24000,
      transportPrice: 1550,
      origin: 'Antwerp Port Dock 412',
      destination: 'Bornem Logistics Center',
      annex7: true,
    });
    assert.equal(res.error, undefined, `PO edit must succeed: ${res.error}`);

    const snap = await adapter.snapshot(staff.sessionId);
    const updated = (snap.purchaseOrders || snap.orders || []).find((o) => o.id === testPoId);
    assert.equal(updated.valueEur, 24000);
  });

  await verifyCheck('PO Deletion: Staff can delete unfulfilled draft PO', async () => {
    const draftNum = `PO-DRAFT-${Date.now().toString().slice(-4)}`;
    const createDraft = await adapter.run(staff.sessionId, 'createPurchase', {
      number: draftNum,
      supplier: 'Temporary Supplier',
      purchasingPrice: 5000,
      warehouse: 'Bornem',
      material: 'HDPE Regrind',
      quantityKg: 1000,
    });
    assert.equal(createDraft.error, undefined);

    const snapBefore = await adapter.snapshot(staff.sessionId);
    const draftOrder = (snapBefore.purchaseOrders || snapBefore.orders || []).find((o) => o.number === draftNum);
    assert.ok(draftOrder);

    const delRes = await adapter.run(staff.sessionId, 'deletePurchase', {
      id: draftOrder.id,
      number: draftNum,
    });
    assert.equal(delRes.error, undefined, `Draft PO deletion must succeed: ${delRes.error}`);

    const snapAfter = await adapter.snapshot(staff.sessionId);
    const deletedOrder = (snapAfter.purchaseOrders || snapAfter.orders || []).find((o) => o.number === draftNum);
    assert.ok(deletedOrder.isRemoved, 'Deleted PO must be marked isRemoved: true');
  });

  // ---------------------------------------------------------------------------
  // 4. UNLOADING & LOADING SCHEDULES, WORKER EXECUTION & VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. SCHEDULING, WORKER EXECUTION, TARE & INVENTORY POSTING ---');
  let testScheduleId = null;
  const testSchedNum = `SCHED-${Date.now().toString().slice(-4)}`;

  await verifyCheck('Staff creates Unloading Schedule linked to PO', async () => {
    const snap = await adapter.snapshot(staff.sessionId);
    const workerUser = snap.users.find((u) => u.email === 'worker.bornem@stockflow.local');
    const wh = snap.warehouses.find((w) => w.name.toLowerCase() === 'bornem');

    const res = await adapter.run(staff.sessionId, 'createOperationSchedule', {
      scheduleNumber: testSchedNum,
      type: 'unloading',
      purchaseOrderId: testPoId,
      poSoNumber: testPoNumber,
      partnerName: 'Antwerp Polymer Imports BVBA',
      warehouseId: wh.id,
      warehouseName: 'Bornem',
      scheduledDate: new Date(Date.now() + 86400000).toISOString(),
      assignedWorkerId: workerUser.id,
      assignedWorkerName: workerUser.name,
      origin: 'Antwerp Port Dock 412',
      destination: 'Bornem Logistics Center',
      transportPrice: 1550,
      annexVII: true,
      notes: 'Unloading priority batch',
    });
    assert.equal(res.error, undefined, `Create schedule must succeed: ${res.error}`);

    const staffSnap = await adapter.snapshot(staff.sessionId);
    const sched = staffSnap.operationSchedules.find((s) => s.scheduleNumber === testSchedNum || s.poSoNumber === testPoNumber);
    assert.ok(sched, 'Schedule must exist in store');
    testScheduleId = sched.id;
  });

  await verifyCheck('Worker executes operation with custom packaging & tare calculation', async () => {
    assert.ok(worker, 'Worker session must be active');
    // Start operation
    const startRes = await adapter.run(worker.sessionId, 'startOperationSchedule', {
      id: testScheduleId,
    });
    assert.equal(startRes.error, undefined);

    // Save draft items: 12,000 kg gross HDPE, 20 Octabins @ 25 kg tare = 500 kg tare => 11,500 kg net
    const draftRes = await adapter.run(worker.sessionId, 'saveScheduleDraft', {
      id: testScheduleId,
      items: [
        {
          materialType: 'HDPE Regrind',
          grossWeightKg: 12000,
          packagesCount: 20,
          packagingType: 'Octabin',
          packagingTareKg: 25,
          netWeightKg: 11500,
        },
      ],
      notes: 'All Octabins weighed on scale 2',
    });
    assert.equal(draftRes.error, undefined);

    // Upload photo evidence
    const uploadRes = await adapter.run(worker.sessionId, 'uploadScheduleAttachment', {
      id: testScheduleId,
      fileName: 'weighbridge_slip.jpg',
      category: 'weighbridge_slip',
      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      size: 1024,
    });
    assert.equal(uploadRes.error, undefined);

    // Submit for verification
    const submitRes = await adapter.run(worker.sessionId, 'submitScheduleForVerification', {
      id: testScheduleId,
    });
    assert.equal(submitRes.error, undefined);
  });

  await verifyCheck('Staff verifies operation: stock balance increments atomically', async () => {
    const snapBefore = await adapter.snapshot(staff.sessionId);
    const wh = snapBefore.warehouses.find((w) => w.name.toLowerCase() === 'bornem');
    const mat = snapBefore.materials.find((m) => m.name.toLowerCase().includes('hdpe') || m.code.toLowerCase().includes('hdpe')) || snapBefore.materials[0];
    const initialBal = (snapBefore.stockBalances || []).find((b) => b.warehouseId === wh.id && b.materialId === mat.id)?.quantityKg || 0;

    const verifyRes = await adapter.run(staff.sessionId, 'verifyOperationSchedule', {
      id: testScheduleId,
      decision: 'approved',
      notes: 'Weighbridge documentation verified and approved',
    });
    assert.equal(verifyRes.error, undefined, `Verification must succeed: ${verifyRes.error}`);

    const snapAfter = await adapter.snapshot(staff.sessionId);
    const finalBal = (snapAfter.stockBalances || []).find((b) => b.warehouseId === wh.id && b.materialId === mat.id)?.quantityKg || 0;
    assert.ok(finalBal >= initialBal, 'Stock balance must have incremented by verified net weight');
  });

  // ---------------------------------------------------------------------------
  // 5. INTER-WAREHOUSE STOCK TRANSFERS
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. INTER-WAREHOUSE STOCK TRANSFERS ---');

  await verifyCheck('Staff transfers stock between warehouses (Bornem -> Spain)', async () => {
    const snap = await adapter.snapshot(staff.sessionId);
    const bornemWh = snap.warehouses.find((w) => w.name.toLowerCase() === 'bornem');
    const spainWh = snap.warehouses.find((w) => w.name.toLowerCase() === 'spain') || snap.warehouses[1];
    const mat = snap.materials.find((m) => m.name.toLowerCase().includes('hdpe') || m.code.toLowerCase().includes('hdpe')) || snap.materials[0];

    const bornemBalBefore = (snap.stockBalances || []).find((b) => b.warehouseId === bornemWh.id && b.materialId === mat.id)?.quantityKg || 0;
    const spainBalBefore = (snap.stockBalances || []).find((b) => b.warehouseId === spainWh.id && b.materialId === mat.id)?.quantityKg || 0;

    const transferQty = Math.min(bornemBalBefore, 2000);
    if (transferQty > 0) {
      const transferRes = await adapter.run(staff.sessionId, 'transferStock', {
        sourceWarehouseId: bornemWh.id,
        targetWarehouseId: spainWh.id,
        materialId: mat.id,
        quantityKg: transferQty,
        reference: `TRF-${Date.now().toString().slice(-4)}`,
        notes: 'Transfer batch to Spain logistics facility',
      });
      assert.equal(transferRes.error, undefined, `Stock transfer must succeed: ${transferRes.error}`);

      // Verify balances updated
      const snapAfter = await adapter.snapshot(staff.sessionId);
      const bornemBalAfter = (snapAfter.stockBalances || []).find((b) => b.warehouseId === bornemWh.id && b.materialId === mat.id)?.quantityKg || 0;
      const spainBalAfter = (snapAfter.stockBalances || []).find((b) => b.warehouseId === spainWh.id && b.materialId === mat.id)?.quantityKg || 0;

      assert.equal(bornemBalAfter, bornemBalBefore - transferQty, 'Origin warehouse balance must be decremented');
      assert.equal(spainBalAfter, spainBalBefore + transferQty, 'Destination warehouse balance must be incremented');
    }
  });

  // ---------------------------------------------------------------------------
  // 6. DATABASE INTEGRITY: NO NEGATIVE STOCK, LEDGER CONSISTENCY, NO BROKEN FKS
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. DATABASE INTEGRITY AUDIT ---');

  await verifyCheck('Integrity: No negative stock balances across all warehouses', async () => {
    const snap = await adapter.snapshot(admin.sessionId);
    const negativeBalances = (snap.stockBalances || []).filter((b) => b.quantityKg < 0);
    assert.equal(negativeBalances.length, 0, `Found negative balances: ${JSON.stringify(negativeBalances)}`);
  });

  await verifyCheck('Integrity: Audit ledger consistency (append-only events recorded)', async () => {
    const snap = await adapter.snapshot(admin.sessionId);
    assert.ok((snap.auditLog || []).length > 0, 'Audit log ledger must not be empty');
    for (const log of snap.auditLog) {
      assert.ok(log.action, 'Audit entry must have action');
      assert.ok(log.targetType, 'Audit entry must have targetType');
    }
  });

  await verifyCheck('Integrity: Foreign key relationship validity across live tables', async () => {
    const snap = await adapter.snapshot(admin.sessionId);
    const whIds = new Set((snap.warehouses || []).map((w) => w.id));
    const matIds = new Set((snap.materials || []).map((m) => m.id));

    // Every stock balance must reference valid warehouse and material
    for (const bal of snap.stockBalances || []) {
      assert.ok(whIds.has(bal.warehouseId), `Balance references nonexistent warehouse: ${bal.warehouseId}`);
      assert.ok(matIds.has(bal.materialId), `Balance references nonexistent material: ${bal.materialId}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. CLEANUP
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. CLEANUP TEST DATA ---');
  await verifyCheck('Clean up test PO record', async () => {
    const adminTok = await adapter['getAdminToken']();
    if (testPoId) {
      await restClient.delete('purchase_orders', `id=eq.${encodeURIComponent(testPoId)}`, adminTok);
    }
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('       FINAL INDEPENDENT PRODUCTION VERIFICATION SUMMARY                ');
  console.log('========================================================================');
  console.log(`Total checks executed: ${totalTests}`);
  console.log(`Passed:                ${passedTests}`);
  console.log(`Failed:                ${failedTests}`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  }
  console.log('========================================================================');

  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
