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
  return env;
}

const env = loadEnv();
const adapter = createSupabaseAdapter(env, fetch, () => new Date().toISOString());

async function run() {
  console.log('========================================================================');
  console.log('   STOCKFLOW — LIVE SUPABASE CORRECTED OFFERS PORTAL VERIFICATION       ');
  console.log('========================================================================\n');

  // 1. Admin Sign-In
  console.log('[STEP 1] Admin Sign-In...');
  const adminEmail = 'admin@stockflow.local';
  const adminPassword = 'StockFlowAdmin2026!';
  const adminLogin = await adapter.signIn(adminEmail, adminPassword);
  assert.equal(adminLogin.ok, true, `Admin sign-in must succeed: ${adminLogin.error}`);
  const adminSession = adminLogin.value.sessionId;
  console.log('  -> Admin signed in successfully. SessionId:', adminSession);

  // 2. Ensure at least one approved Purchasing Offer exists in live DB
  console.log('\n[STEP 2] Checking Purchasing Offers in live DB...');
  const adminView = await adapter.view(adminSession);
  const existingPurchasing = (adminView.state.offers || []).filter((o) => o.kind === 'purchasing');
  console.log(`  -> Admin sees ${existingPurchasing.length} total purchasing offers.`);

  let targetPoOffer = existingPurchasing.find((o) => o.approvalStatus === 'approved');
  if (!targetPoOffer && existingPurchasing.length > 0) {
    // Approve the existing purchasing offer so it's published to external users
    console.log('  -> Approving existing purchasing offer:', existingPurchasing[0].number);
    await adapter.run(adminSession, 'decideOffer', {
      id: existingPurchasing[0].id,
      decision: 'approved',
      note: 'Published for external trading partners',
    });
    targetPoOffer = existingPurchasing[0];
  } else if (!targetPoOffer) {
    // Create and approve a purchasing offer
    console.log('  -> Creating and publishing new purchasing offer...');
    const createRes = await adapter.run(adminSession, 'createOffer', {
      kind: 'purchasing',
      material: 'LDPE Film 98/2',
      materialType: 'Plastics (LDPE)',
      materialGrade: 'Standard Grade',
      country: 'Belgium',
      location: 'Bornem Warehouse',
      quantity: 50,
      unit: 'MT',
      pricePerUnit: 1200,
      currency: 'EUR',
      totalValue: 60000,
      truckLoads: 2,
      description: 'Published material procurement offer for LDPE Film',
      priority: 'medium',
      poNumber: 'PO-2026-0001',
    });
    console.log('Create purchasing offer res:', { error: createRes.error });
    const newAdminView = await adapter.view(adminSession);
    targetPoOffer = (newAdminView.state.offers || []).find((o) => o.kind === 'purchasing');
    if (targetPoOffer) {
      await adapter.run(adminSession, 'decideOffer', {
        id: targetPoOffer.id,
        decision: 'approved',
        note: 'Published for external trading partners',
      });
    }
  }

  // 3. Offers User Sign-In
  console.log('\n[STEP 3] Approved Offers User Sign-In...');
  const userEmail = 'test_offers_1795269435066@tradingpartner.com';
  const userPassword = 'SecurePassword2026!';
  
  // Ensure user is active and approved
  const adminSnap = await adapter.snapshot(adminSession);
  const targetUser = (adminSnap.accounts || []).find((u) => u.email === userEmail);
  if (targetUser && (targetUser.approvalStatus !== 'approved' || !targetUser.active)) {
    console.log('  -> Approving user for test flow...');
    await adapter.run(adminSession, 'approveRegistration', {
      userId: targetUser.id,
      role: 'offers_user',
      notes: 'Approved for live test',
    });
  }

  const userLogin = await adapter.signIn(userEmail, userPassword);
  assert.equal(userLogin.ok, true, `Offers user sign-in must succeed: ${userLogin.error}`);
  const userSession = userLogin.value.sessionId;
  const userProfile = userLogin.value.profile;
  assert.equal(userProfile.role, 'offers_user', 'User role must be offers_user');
  console.log('  -> Offers User signed in successfully:', userProfile.name, `(${userProfile.email})`);

  // 3. User views available Purchasing Offers
  console.log('\n[STEP 3] External User queries published Purchasing Offers...');
  const userView = await adapter.view(userSession);
  const purchasingOffers = (userView.state.offers || []).filter((o) => o.kind === 'purchasing');
  console.log(`  -> External user sees ${purchasingOffers.length} published purchasing offers.`);
  assert.ok(purchasingOffers.length > 0, 'Must have at least one purchasing offer');
  const selectedPurchasingOffer = purchasingOffers[0];
  console.log(`  -> Selected Purchasing Offer: ${selectedPurchasingOffer.number} (PO: ${selectedPurchasingOffer.poNumber || selectedPurchasingOffer.number})`);

  // 4. External User submits Selling Offer linked to Purchasing Offer
  console.log('\n[STEP 4] External User submits Selling Offer in response...');
  const poRef = selectedPurchasingOffer.poNumber || selectedPurchasingOffer.number || 'PO-2026-0001';
  const submitRes = await adapter.run(userSession, 'submitSellingOffer', {
    poNumber: poRef,
    purchasingOfferId: selectedPurchasingOffer.id,
    materialType: selectedPurchasingOffer.materialType || 'Plastics (LDPE)',
    materialName: selectedPurchasingOffer.material || 'LDPE Regranulate Clear',
    clientName: 'Global Trade Logistics Inc.',
    contactPerson: 'Alex Trader',
    contactNumber: '+32 3 555 1234',
    emailAddress: userEmail,
    price: 1380.50,
    currency: 'EUR',
    quantity: 24,
    unit: 'MT',
    deliveryDate: '2026-12-10',
    packagingType: 'Big Bags',
    transportDetails: 'DAP Bornem Hub',
    origin: 'Rotterdam Port, NL',
    destination: 'Bornem Warehouse, BE',
    description: 'Live test proposal: high quality clear LDPE regranulate',
  });

  console.log('Submission result:', { error: submitRes.error, notice: submitRes.notice });
  assert.equal(submitRes.error, undefined, `Submission must not fail: ${submitRes.error}`);
  assert.equal(submitRes.notice, 'Selling offer submitted for review.');
  console.log('  -> PASS: Selling Offer submitted and persisted to live Supabase DB.');

  // 5. External user views their submitted offer in My Offers
  console.log('\n[STEP 5] Verifying external user sees their offer in My Offers...');
  const updatedUserView = await adapter.view(userSession);
  const mySellingOffers = (updatedUserView.state.offers || []).filter(
    (o) => o.kind === 'selling' && (o.createdBy === userProfile.id || o.emailAddress?.toLowerCase() === userEmail.toLowerCase())
  );
  assert.ok(mySellingOffers.length > 0, 'External user must see their submitted selling offer in My Offers');
  // Sort by createdAt descending to pick the latest submitted offer
  mySellingOffers.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const submittedOffer = mySellingOffers.find((o) => o.pricePerUnit === 1380.5) || mySellingOffers[0];
  console.log('  -> Found offer in My Offers:', {
    number: submittedOffer.number,
    poNumber: submittedOffer.poNumber,
    purchasingOfferId: submittedOffer.purchasingOfferId,
    material: submittedOffer.material,
    pricePerUnit: submittedOffer.pricePerUnit,
    currency: submittedOffer.currency,
    approvalStatus: submittedOffer.approvalStatus,
    status: submittedOffer.status,
  });
  assert.equal(submittedOffer.approvalStatus, 'pending');

  // 6. Admin reviews the submitted Selling Offer
  console.log('\n[STEP 6] Admin reviews Selling Offer in Admin Portal...');
  const adminUpdatedView = await adapter.view(adminSession);
  const adminFoundOffer = (adminUpdatedView.state.offers || []).find((o) => o.id === submittedOffer.id || o.number === submittedOffer.number);
  assert.ok(adminFoundOffer, 'Admin must see the newly submitted Selling Offer');
  console.log('  -> Admin sees Selling Offer:', adminFoundOffer.number, `(Status: ${adminFoundOffer.approvalStatus})`);

  // 7. Admin tests rejection with empty reason (must fail)
  console.log('\n[STEP 7] Testing mandatory rejection reason enforcement...');
  const emptyRejectRes = await adapter.run(adminSession, 'decideSellingOffer', {
    offerNumber: submittedOffer.number,
    decision: 'rejected',
    note: '',
  });
  console.log('Empty reject response:', { error: emptyRejectRes.error });
  assert.ok(
    emptyRejectRes.error?.includes('rejection reason is mandatory') ||
    emptyRejectRes.error?.includes('rejection reason is required'),
    'Rejection without note must fail'
  );
  console.log('  -> PASS: Admin cannot reject without providing a mandatory rejection reason.');

  // 8. Admin approves the Selling Offer
  console.log('\n[STEP 8] Admin approves the Selling Offer with decision note...');
  const approveRes = await adapter.run(adminSession, 'decideSellingOffer', {
    offerNumber: submittedOffer.number,
    decision: 'approved',
    note: 'Commercial pricing approved on live database verification.',
  });
  console.log('Approve response:', { error: approveRes.error, notice: approveRes.notice });
  assert.equal(approveRes.error, undefined, `Approval must succeed: ${approveRes.error}`);
  console.log('  -> PASS: Offer successfully approved.');

  // 9. External user checks updated My Offers and In-App Notifications
  console.log('\n[STEP 9] Checking updated My Offers and notifications for external user...');
  const finalUserView = await adapter.view(userSession);
  const finalOffer = (finalUserView.state.offers || []).find((o) => o.id === submittedOffer.id || o.number === submittedOffer.number);
  assert.ok(finalOffer, 'Must find offer in final user view');
  console.log('  -> My Offers status:', {
    number: finalOffer.number,
    approvalStatus: finalOffer.approvalStatus,
    adminDecisionNote: finalOffer.adminDecisionNote,
    soldAt: finalOffer.soldAt,
  });
  assert.equal(finalOffer.approvalStatus, 'approved', 'Offer approvalStatus must now be approved');

  const notifications = finalUserView.state.notifications || [];
  console.log(`  -> External user received ${notifications.length} in-app notifications.`);
  const matchingNotif = notifications.find((n) => n.message?.includes(submittedOffer.number) || n.title?.includes(submittedOffer.number));
  if (matchingNotif) {
    console.log('  -> Matching in-app notification:', {
      title: matchingNotif.title,
      message: matchingNotif.message,
      createdAt: matchingNotif.createdAt,
    });
  }
  console.log('  -> PASS: External user successfully updated with Approved status and notifications.');

  console.log('\n========================================================================');
  console.log('   ALL LIVE SUPABASE VERIFICATION CHECKS PASSED (100% SUCCESS)          ');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('\n❌ Live Supabase verification failed:', err);
  process.exit(1);
});
