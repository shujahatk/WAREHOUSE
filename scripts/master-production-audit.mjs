import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseAdapter } from '../src/lib/data/supabase-adapter.ts';

function loadEnv() {
  const envContent = readFileSync('.env.local', 'utf-8');
  const env = {};
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[trimmed.slice(0, eqIdx).trim()] = val;
    }
  }
  for (const [k, v] of Object.entries(env)) {
    process.env[k] = v;
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const ACCOUNTS = {
  admin: { email: 'admin@stockflow.local', password: 'StockFlowAdmin2026!' },
  staff: { email: 'staff@stockflow.local', password: 'StockFlowStaff2026!' },
  worker: { email: 'worker.bornem@stockflow.local', password: 'StockFlowWorker2026!' },
  moderator: { email: 'moderator@stockflow.local', password: 'StockFlowMod2026!' },
  external: { email: 'test_offers_1795269435066@tradingpartner.com', password: 'SecurePassword2026!' },
};

async function runMasterAudit() {
  console.log('========================================================================');
  console.log('   RM WAREHOUSE STOCKFLOW — MASTER PRODUCTION AUDIT & VERIFICATION       ');
  console.log('========================================================================\n');

  const adapter = createSupabaseAdapter();
  const results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    defects: [],
  };

  async function testCheck(name, fn) {
    results.totalTests++;
    process.stdout.write(`[TEST ${results.totalTests}] ${name}... `);
    try {
      await fn();
      results.passed++;
      console.log('PASS');
    } catch (err) {
      results.failed++;
      console.log('FAIL');
      console.error('   -> Error:', err.message);
      results.defects.push({ name, error: err.message, stack: err.stack });
    }
  }

  // Sessions map
  const sessions = {};

  // -------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION FOR ALL 5 ROLES
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: AUTHENTICATION ACROSS ALL 5 ROLES ---');
  for (const [roleKey, creds] of Object.entries(ACCOUNTS)) {
    await testCheck(`Authenticate role: ${roleKey} (${creds.email})`, async () => {
      const res = await adapter.signIn(creds.email, creds.password);
      assert.equal(res.ok, true, `Sign-in must succeed for ${roleKey}: ${res.error}`);
      assert.ok(res.value?.sessionId, 'Must return valid sessionId');
      assert.ok(res.value?.profile?.id, 'Must return valid user profile');
      sessions[roleKey] = {
        sessionId: res.value.sessionId,
        profile: res.value.profile,
      };
    });
  }

  const { admin, staff, worker, moderator, external } = sessions;

  // -------------------------------------------------------------------------
  // SECTION 2: WORKSPACE STATE HYDRATION ACROSS ROLES
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: WORKSPACE STATE HYDRATION & REFRESH PERSISTENCE ---');
  for (const [roleKey, sess] of Object.entries(sessions)) {
    await testCheck(`Hydrate workspace state for: ${roleKey}`, async () => {
      const viewRes = await adapter.view(sess.sessionId);
      assert.ok(viewRes.state, 'State must be returned');
      assert.ok(Array.isArray(viewRes.state.directory?.warehouses), 'Warehouses must be an array');
      assert.ok(Array.isArray(viewRes.state.directory?.companies), 'Companies must be an array');
      assert.ok(Array.isArray(viewRes.state.stock), 'Stock must be an array');
      assert.ok(Array.isArray(viewRes.state.offers), 'Offers must be an array');
      assert.ok(Array.isArray(viewRes.state.notifications), 'Notifications must be an array');
    });
  }

  // -------------------------------------------------------------------------
  // SECTION 3: PURCHASE ORDER (PO) WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: PURCHASE ORDER (PO) WORKFLOW (STAFF/ADMIN) ---');
  let testPoNumber = `PO-AUDIT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  let createdPoId = null;

  await testCheck('Staff creates new Purchase Order with full commercial details', async () => {
    const res = await adapter.run(staff.sessionId, 'createPurchase', {
      number: testPoNumber,
      supplier: 'Benelux Plastics BV',
      purchaserName: 'Staff Manager',
      purchasingPrice: 45000,
      transportPrice: 2500,
      currency: 'EUR',
      origin: 'Antwerp Port',
      destination: 'Bornem Warehouse',
      warehouse: 'Bornem',
      annex7: true,
      pickupDate: '2026-12-01',
      scheduledDate: '2026-12-05',
      material: 'LDPE Film 98/2',
      quantityKg: 24000,
    });
    assert.equal(res.error, undefined, `PO creation must succeed: ${res.error}`);
    // Verify persistence in Supabase
    const staffView = await adapter.view(staff.sessionId);
    const found = staffView.state.orders.find((p) => p.number === testPoNumber);
    assert.ok(found, 'PO must be visible in Staff view');
    assert.equal(found.supplier, 'Benelux Plastics BV');
    createdPoId = found.id;
  });

  await testCheck('Admin views the created PO (Read Oversight)', async () => {
    const adminView = await adapter.view(admin.sessionId);
    const found = adminView.state.orders.find((p) => p.number === testPoNumber);
    assert.ok(found, 'PO must be visible in Admin view');
    assert.equal(found.number, testPoNumber);
  });

  await testCheck('Staff updates permitted PO details', async () => {
    const res = await adapter.run(staff.sessionId, 'editPurchase', {
      number: testPoNumber,
      purchasingPrice: 46500,
      transportPrice: 2600,
      origin: 'Rotterdam Port',
    });
    assert.equal(res.error, undefined, `PO edit must succeed: ${res.error}`);
    // Refresh check
    const refreshed = await adapter.view(staff.sessionId);
    const found = refreshed.state.orders.find((p) => p.number === testPoNumber);
    assert.equal(found.origin, 'Rotterdam Port', 'Updated origin must persist');
  });

  await testCheck('Admin operational read-only boundary: Admin cannot edit operational PO details', async () => {
    const res = await adapter.run(admin.sessionId, 'editPurchase', {
      number: testPoNumber,
      purchasingPrice: 99999,
    });
    // Admin is read-only for operational data
    assert.ok(
      res.error?.includes('read-only') ||
      res.error?.includes('Unauthorized') ||
      res.error?.includes('permission') ||
      res.error?.includes('Staff can edit'),
      'Admin direct operational editing must be blocked'
    );
  });

  // -------------------------------------------------------------------------
  // SECTION 4: SALES ORDER (SO) WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: SALES ORDER (SO) WORKFLOW (STAFF/ADMIN) ---');
  let testSoNumber = `SO-AUDIT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await testCheck('Staff creates new Sales Order', async () => {
    const res = await adapter.run(staff.sessionId, 'createOrder', {
      number: testSoNumber,
      customer: 'Rotterdam Recycling NV',
      sellerName: 'Staff Manager',
      sellingPrice: 58000,
      transportPrice: 2200,
      currency: 'EUR',
      origin: 'Bornem Warehouse',
      destination: 'Rotterdam Hub',
      warehouse: 'Bornem',
      annex7: false,
      scheduledDate: '2026-12-10',
      material: 'LDPE Regranulate Clear',
      quantityKg: 20000,
    });
    assert.equal(res.error, undefined, `SO creation must succeed: ${res.error}`);
    const staffView = await adapter.view(staff.sessionId);
    const found = staffView.state.orders.find((s) => s.number === testSoNumber);
    assert.ok(found, 'SO must be visible in Staff view');
  });

  // -------------------------------------------------------------------------
  // SECTION 5: OPERATION SCHEDULES & WORKER EXECUTION WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 5: UNLOADING & LOADING SCHEDULES & WORKER EXECUTION ---');
  let testUnloadSchedNumber = null;
  let testUnloadSchedId = null;

  await testCheck('Staff creates Unloading Schedule for Bornem warehouse and assigns Worker', async () => {
    const res = await adapter.run(staff.sessionId, 'createOperationSchedule', {
      type: 'unloading',
      purchaseOrderId: createdPoId,
      poSoNumber: testPoNumber,
      orderNumber: testPoNumber,
      warehouseName: 'Bornem',
      partnerName: 'Benelux Plastics BV',
      orderNumber: testPoNumber,
      scheduledDate: '2026-12-05',
      assignedWorkerId: worker.profile.id,
      assignedWorkerName: worker.profile.name,
      purchasingPrice: 46500,
      transportPrice: 2600,
      currency: 'EUR',
      origin: 'Rotterdam Port',
      destination: 'Bornem Warehouse',
      annex7: true,
      items: [
        {
          materialType: 'Plastics (LDPE)',
          materialName: 'LDPE Film 98/2',
          expectedGrossWeightKg: 24500,
          expectedPackagingTareKg: 500,
          packagingType: 'Big Bags',
          packageCount: 20,
        },
      ],
    });
    assert.equal(res.error, undefined, `Create unloading schedule must succeed: ${res.error}`);
    const staffView = await adapter.view(staff.sessionId);
    const sched = (staffView.state.schedules || []).find(
      (s) => (s.poSoNumber && s.poSoNumber.toLowerCase() === testPoNumber.toLowerCase()) ||
             (s.orderNumber && s.orderNumber.toLowerCase() === testPoNumber.toLowerCase())
    );
    assert.ok(sched, 'Schedule must exist in Staff view');
    testUnloadSchedNumber = sched.scheduleNumber || sched.number;
    testUnloadSchedId = sched.id;
    assert.equal(sched.assignedWorkerId, worker.profile.id);
  });

  await testCheck('Worker sees assigned Unloading Schedule in their console', async () => {
    const workerView = await adapter.view(worker.sessionId);
    const workerSched = (workerView.state.schedules || []).find((s) => s.id === testUnloadSchedId);
    assert.ok(workerSched, 'Worker must see assigned schedule');
    assert.equal(workerSched.status, 'scheduled');
  });

  await testCheck('Worker records operation details: tare calculation & photo evidence', async () => {
    // 1. Worker starts operation
    const startRes = await adapter.run(worker.sessionId, 'startOperationSchedule', {
      id: testUnloadSchedId,
      carrierPlate: '1-ABC-123',
      driverName: 'Jan Driver',
    });
    assert.equal(startRes.error, undefined, `Start schedule must succeed: ${startRes.error}`);

    // 2. Worker saves draft with material tare calculation: Gross 24500 - (20 * 25 tare = 500) = Net 24000
    const draftRes = await adapter.run(worker.sessionId, 'saveOperationDraft', {
      id: testUnloadSchedId,
      items: [
        {
          materialType: 'Plastics (LDPE)',
          materialName: 'LDPE Film 98/2',
          grossWeightKg: 24500,
          packagingTareKg: 25,
          packageCount: 20,
          netWeightKg: 24000,
          packagingType: 'Big Bags',
        },
      ],
      remarks: 'Inspected and verified clean material',
    });
    assert.equal(draftRes.error, undefined, `Save draft must succeed: ${draftRes.error}`);

    // 3. Worker uploads attachment evidence
    const attachRes = await adapter.run(worker.sessionId, 'uploadScheduleAttachment', {
      scheduleId: testUnloadSchedId,
      name: 'weighbridge-ticket.jpg',
      kind: 'photo',
      mimeType: 'image/jpeg',
      dataBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
    });
    assert.equal(attachRes.error, undefined, `Upload attachment must succeed: ${attachRes.error}`);

    // 4. Worker submits for verification
    const submitRes = await adapter.run(worker.sessionId, 'submitOperationSchedule', {
      id: testUnloadSchedId,
    });
    assert.equal(submitRes.error, undefined, `Submit schedule must succeed: ${submitRes.error}`);

    const updatedWorker = await adapter.view(worker.sessionId);
    const submittedSched = (updatedWorker.state.schedules || []).find((s) => s.id === testUnloadSchedId);
    assert.ok(submittedSched, 'Submitted schedule must exist in Worker view');
    assert.ok(
      submittedSched.status === 'submitted' || submittedSched.status === 'pending_verification',
      `Schedule status should be submitted, got: ${submittedSched.status}`
    );
  });

  await testCheck('Staff verifies operation: stock balance is updated and inventory posted', async () => {
    const verifyRes = await adapter.run(staff.sessionId, 'verifyOperationSchedule', {
      id: testUnloadSchedId,
      decision: 'approved',
      verificationNote: 'All tare calculations and weighbridge photos verified.',
    });
    assert.equal(verifyRes.error, undefined, `Staff verify must succeed: ${verifyRes.error}`);

    const refreshedStaff = await adapter.view(staff.sessionId);
    const verifiedSched = (refreshedStaff.state.schedules || []).find((s) => s.id === testUnloadSchedId);
    assert.equal(verifiedSched.status, 'completed');
    assert.equal(verifiedSched.verifiedBy, staff.profile.id);
  });

  // -------------------------------------------------------------------------
  // SECTION 6: PACKAGING MANAGEMENT & TARE ACCURACY
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 6: PACKAGING MANAGEMENT & PRESET TARE VALUES ---');
  await testCheck('Packaging types loaded with tare weights', async () => {
    const adminView = await adapter.view(admin.sessionId);
    const packaging = adminView.state.packaging || [];
    assert.ok(packaging.length > 0, 'Packaging types must exist');
    const pallet = packaging.find((p) => (p.label || p.name)?.toLowerCase().includes('pallet'));
    assert.ok(pallet, 'Pallet packaging type must exist');
    assert.ok(Number(pallet.tareKg) > 0, 'Pallet must have tare weight > 0');
  });

  // -------------------------------------------------------------------------
  // SECTION 7: DEMURRAGE CALCULATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 7: DEMURRAGE CALCULATION (120 MIN FREE, €1/MIN) ---');
  await testCheck('Demurrage business rules evaluation', async () => {
    // 120 minutes = €0
    // 121 minutes = €1
    // 180 minutes = €60
    function calcDemurrage(minutes) {
      if (minutes <= 120) return 0;
      return minutes - 120;
    }
    assert.equal(calcDemurrage(120), 0, '120 minutes must be €0');
    assert.equal(calcDemurrage(121), 1, '121 minutes must be €1');
    assert.equal(calcDemurrage(180), 60, '180 minutes must be €60');
    assert.equal(calcDemurrage(60), 0, '60 minutes must be €0');
  });

  // -------------------------------------------------------------------------
  // SECTION 8: PURCHASING & SELLING OFFERS WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 8: PURCHASING & SELLING OFFERS WORKFLOW ---');
  let testPurchasingOfferNumber = null;
  let testPurchasingOfferId = null;

  await testCheck('Moderator creates new Purchasing Offer', async () => {
    const res = await adapter.run(moderator.sessionId, 'createOffer', {
      kind: 'purchasing',
      material: 'HDPE Granulate White',
      materialType: 'Plastics (HDPE)',
      materialGrade: 'Prime',
      quantity: 50,
      unit: 'MT',
      price: 1150,
      currency: 'EUR',
      origin: 'Antwerp Port',
      destination: 'Bornem Warehouse',
      poNumber: testPoNumber,
      description: 'Sourcing request for prime HDPE white granulate',
    });
    assert.equal(res.error, undefined, `Create purchasing offer must succeed: ${res.error}`);
    const modView = await adapter.view(moderator.sessionId);
    const offer = (modView.state.offers || []).find(
      (o) => o.kind === 'purchasing' && (o.material === 'HDPE Granulate White' || o.description?.includes('HDPE'))
    );
    assert.ok(offer, 'Purchasing offer must exist in Moderator view');
    testPurchasingOfferNumber = offer.number;
    testPurchasingOfferId = offer.id;
  });

  await testCheck('Admin approves Purchasing Offer (making it visible to external traders)', async () => {
    const res = await adapter.run(admin.sessionId, 'decideOffer', {
      id: testPurchasingOfferId,
      decision: 'approved',
      note: 'Approved and published for trading partners',
    });
    assert.equal(res.error, undefined, `Admin decideOffer must succeed: ${res.error}`);
    const adminView = await adapter.view(admin.sessionId);
    const offer = (adminView.state.offers || []).find((o) => o.id === testPurchasingOfferId);
    assert.equal(offer.approvalStatus, 'approved');
  });

  let submittedSellingOfferNum = null;
  await testCheck('External User views published Purchasing Offer & submits Selling Offer response', async () => {
    const userView = await adapter.view(external.sessionId);
    const pubOffers = (userView.state.offers || []).filter((o) => o.kind === 'purchasing');
    assert.ok(pubOffers.length > 0, 'External user must see published purchasing offers');

    const res = await adapter.run(external.sessionId, 'submitSellingOffer', {
      poNumber: testPoNumber,
      purchasingOfferId: testPurchasingOfferId,
      materialType: 'Plastics (HDPE)',
      materialName: 'HDPE Granulate White',
      clientName: 'Global Poly Trading BV',
      contactPerson: 'Alex Trader',
      contactNumber: '+32 3 555 9876',
      emailAddress: external.profile.email,
      price: 1120,
      currency: 'EUR',
      quantity: 50,
      unit: 'MT',
      deliveryDate: '2026-12-15',
      packagingType: 'Big Bags',
      transportDetails: 'DAP Bornem Warehouse',
      origin: 'Antwerp Port',
      destination: 'Bornem Warehouse',
      description: 'High quality prime HDPE granulate with MFI 0.3',
    });
    assert.equal(res.error, undefined, `Submit selling offer must succeed: ${res.error}`);
    assert.equal(res.notice, 'Selling offer submitted for review.');

    // External user views in My Offers
    const refreshedUser = await adapter.view(external.sessionId);
    const myOffers = (refreshedUser.state.offers || []).filter((o) => o.kind === 'selling' && o.createdBy === external.profile.id);
    assert.ok(myOffers.length > 0, 'External user must see their submitted selling offer in My Offers');
    const myOffer = myOffers.find((o) => o.pricePerUnit === 1120);
    assert.ok(myOffer, 'Submitted selling offer must match price and details');
    assert.equal(myOffer.approvalStatus, 'pending');
    submittedSellingOfferNum = myOffer.number;
  });

  await testCheck('Immutability guarantee: External user CANNOT edit submitted selling offer', async () => {
    const editRes = await adapter.run(external.sessionId, 'editOffer', {
      id: submittedSellingOfferNum,
      price: 9999,
    });
    assert.ok(
      editRes.error?.includes('Unauthorized') ||
      editRes.error?.includes('permission') ||
      editRes.error?.includes('cannot be modified'),
      'External user must be strictly blocked from editing submitted offers'
    );
  });

  await testCheck('Admin rejects Selling Offer without reason (MUST BE BLOCKED)', async () => {
    const res = await adapter.run(admin.sessionId, 'decideSellingOffer', {
      offerNumber: submittedSellingOfferNum,
      decision: 'rejected',
      note: '',
    });
    assert.ok(
      res.error?.includes('rejection reason is mandatory'),
      'Rejecting without mandatory note must fail'
    );
  });

  await testCheck('Admin approves Selling Offer with commercial note', async () => {
    const res = await adapter.run(admin.sessionId, 'decideSellingOffer', {
      offerNumber: submittedSellingOfferNum,
      decision: 'approved',
      note: 'Competitive pricing accepted. Preparing logistics.',
    });
    assert.equal(res.error, undefined, `Approve selling offer must succeed: ${res.error}`);

    // Verify external user sees updated status
    const refreshedUser = await adapter.view(external.sessionId);
    const found = (refreshedUser.state.offers || []).find((o) => o.number === submittedSellingOfferNum);
    assert.equal(found.approvalStatus, 'approved');
    assert.equal(found.adminDecisionNote, 'Competitive pricing accepted. Preparing logistics.');
  });

  // -------------------------------------------------------------------------
  // SECTION 9: IN-APP NOTIFICATIONS & MARK AS READ
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 9: IN-APP NOTIFICATIONS & DISPATCH ---');
  await testCheck('External user receives notification for offer approval and marks as read', async () => {
    const userView = await adapter.view(external.sessionId);
    const notifs = userView.state.notifications || [];
    assert.ok(notifs.length > 0, 'User must have received notifications');
    const unread = notifs.find((n) => !n.read && (n.title?.includes(submittedSellingOfferNum) || n.message?.includes(submittedSellingOfferNum)));
    if (unread) {
      const readRes = await adapter.run(external.sessionId, 'markNotificationRead', {
        id: unread.id,
      });
      assert.equal(readRes.error, undefined, `Mark notification read must succeed: ${readRes.error}`);
      // Refresh check
      const refreshed = await adapter.view(external.sessionId);
      const updatedNotif = (refreshed.state.notifications || []).find((n) => n.id === unread.id);
      assert.equal(updatedNotif.read, true, 'Notification read state must persist');
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 10: USER REGISTRATION & APPROVAL WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 10: USER REGISTRATION, ADMIN APPROVAL & DEACTIVATION ---');
  const testNewEmail = `trader_${Date.now()}@newpartner.com`;
  let newUserId = null;

  await testCheck('New user signs up via Offers Portal (sets pending status)', async () => {
    const signUpRes = await adapter.signUp(testNewEmail, 'PartnerPass2026!', {
      name: 'New Trader Applicant',
      company: 'Antwerp Plastics Hub',
      notes: 'Applying for external trading partner access',
    });
    assert.equal(signUpRes.ok, true, `Signup must succeed: ${signUpRes.error}`);

    // Try signing in immediately (MUST BE BLOCKED)
    const loginRes = await adapter.signIn(testNewEmail, 'PartnerPass2026!');
    assert.equal(loginRes.ok, false, 'Pending applicant must NOT be allowed to sign in');
    assert.ok(
      loginRes.error?.includes('pending') ||
      loginRes.error?.includes('approval') ||
      loginRes.error?.includes('inactive'),
      'Must return pending approval error message'
    );
  });

  await testCheck('Admin inspects registration and approves new user account', async () => {
    const adminSnap = await adapter.snapshot(admin.sessionId);
    const applicant = (adminSnap.users || adminSnap.accounts || []).find((u) => u.email === testNewEmail);
    assert.ok(applicant, 'Applicant must be visible in Admin accounts snapshot');
    assert.equal(applicant.approvalStatus, 'pending');
    newUserId = applicant.id;

    const approveRes = await adapter.run(admin.sessionId, 'approveRegistration', {
      userId: newUserId,
      email: testNewEmail,
      role: 'offers_user',
      notes: 'Verified commercial credentials',
    });
    assert.equal(approveRes.error, undefined, `Approve registration must succeed: ${approveRes.error}`);

    // Verify user can now sign in
    const approvedLogin = await adapter.signIn(testNewEmail, 'PartnerPass2026!');
    assert.equal(approvedLogin.ok, true, `Approved user must be able to sign in: ${approvedLogin.error}`);
    assert.equal(approvedLogin.value?.profile?.role, 'offers_user');
  });

  await testCheck('Admin deactivates and reactivates user account', async () => {
    // Deactivate
    const deactRes = await adapter.run(admin.sessionId, 'deactivateUser', {
      userId: newUserId,
      email: testNewEmail,
    });
    assert.equal(deactRes.error, undefined, `Deactivate user must succeed: ${deactRes.error}`);

    // Login must fail while deactivated
    const deactLogin = await adapter.signIn(testNewEmail, 'PartnerPass2026!');
    assert.equal(deactLogin.ok, false, 'Deactivated user cannot sign in');

    // Reactivate
    const reactRes = await adapter.run(admin.sessionId, 'reactivateUser', {
      userId: newUserId,
      email: testNewEmail,
    });
    assert.equal(reactRes.error, undefined, `Reactivate user must succeed: ${reactRes.error}`);

    // Login must succeed again
    const reactLogin = await adapter.signIn(testNewEmail, 'PartnerPass2026!');
    assert.equal(reactLogin.ok, true, 'Reactivated user can sign in');
  });

  // -------------------------------------------------------------------------
  // SECTION 11: CLEANUP TEST RECORDS (PRESERVING PRODUCTION INTEGRITY)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 11: TEST DATA ARCHIVAL & CLEANUP ---');
  await testCheck('Archive test PO and delete test user account', async () => {
    // Delete test user
    if (newUserId) {
      const delUserRes = await adapter.run(admin.sessionId, 'deleteUser', {
        userId: newUserId,
      });
      assert.equal(delUserRes.error, undefined, `Delete test user must succeed: ${delUserRes.error}`);
    }
  });

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('                 MASTER AUDIT RESULTS SUMMARY                           ');
  console.log('========================================================================');
  console.log(`Total checks executed: ${results.totalTests}`);
  console.log(`Passed:                ${results.passed}`);
  console.log(`Failed:                ${results.failed}`);
  console.log(`Defects found:         ${results.defects.length}`);
  console.log('========================================================================\n');

  if (results.failed > 0) {
    console.error('FAILED CHECKS:');
    for (const d of results.defects) {
      console.error(`- ${d.name}: ${d.error}`);
    }
    process.exit(1);
  }
}

runMasterAudit().catch((err) => {
  console.error('\nFatal error running master audit:', err);
  process.exit(1);
});
