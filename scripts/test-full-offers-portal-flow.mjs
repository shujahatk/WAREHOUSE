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
  console.log('   STOCKFLOW — COMPREHENSIVE OFFERS USER AUTH & APPROVAL VERIFICATION   ');
  console.log('========================================================================\n');

  const testEmail = 'test_offers_1795269435066@tradingpartner.com';
  const testPassword = 'SecurePassword2026!';
  const testName = 'Alex Trader';
  const testCompany = 'Global Trade Logistics Inc.';
  const testNotes = 'Enterprise purchasing partner registration';

  // ---------------------------------------------------------
  // STEP 1: Registration Workflow
  // ---------------------------------------------------------
  console.log('[STEP 1] Testing Offers Portal User Registration...');
  const regRes = await adapter.run(null, 'registerOffersUser', {
    name: testName,
    email: testEmail,
    password: testPassword,
    company: testCompany,
    notes: testNotes,
  });

  console.log('Registration response:', { error: regRes.error, notice: regRes.notice });
  assert.equal(regRes.error, undefined, 'Registration must not return an error');
  assert.ok(
    regRes.notice?.includes('Pending admin approval') || regRes.notice?.includes('pending'),
    `Notice should indicate pending approval, got: ${regRes.notice}`
  );

  // Verify status directly in database via admin session
  const adminSign = await adapter.signIn('admin@stockflow.local', 'StockFlowAdmin2026!');
  assert.equal(adminSign.ok, true, 'Admin sign-in must succeed');
  const adminSession = adminSign.value.sessionId;

  const snap1 = await adapter.snapshot(adminSession);
  const registeredUser = snap1.users.find(u => u.email === testEmail);
  assert.ok(registeredUser, `User ${testEmail} must exist in the database`);
  console.log('Database verification:', {
    id: registeredUser.id,
    email: registeredUser.email,
    role: registeredUser.role,
    approvalStatus: registeredUser.approvalStatus,
    active: registeredUser.active,
    notes: registeredUser.registrationNotes,
  });
  assert.equal(registeredUser.approvalStatus, 'pending', 'DB approvalStatus MUST be pending');
  assert.equal(registeredUser.active, false, 'DB active MUST be false');
  assert.equal(registeredUser.role, 'offers_user', 'DB role MUST be offers_user');
  console.log('  -> PASS: User registered with pending status, inactive, and unprivileged role.\n');

  // ---------------------------------------------------------
  // STEP 2: Block Unapproved Account
  // ---------------------------------------------------------
  console.log('[STEP 2] Attempting login as unapproved/pending user...');
  const pendingLogin = await adapter.signIn(testEmail, testPassword);
  console.log('Pending login result:', {
    ok: pendingLogin.ok,
    error: !pendingLogin.ok ? pendingLogin.error : null,
  });
  assert.equal(pendingLogin.ok, false, 'Pending user MUST NOT be allowed to sign in');
  assert.ok(
    pendingLogin.error?.includes('awaiting admin approval') || pendingLogin.error?.includes('pending administrator approval'),
    `Expected pending approval error message, got: ${pendingLogin.error}`
  );
  console.log('  -> PASS: Pending user blocked with "awaiting admin approval" message.\n');

  // ---------------------------------------------------------
  // STEP 3: Admin Approval Workflow
  // ---------------------------------------------------------
  console.log('[STEP 3] Admin reviews and approves the registration request...');
  // Confirm user is visible in Admin's pending requests list
  const pendingRequests = snap1.users.filter(u => u.approvalStatus === 'pending');
  const inPendingList = pendingRequests.some(u => u.email === testEmail);
  assert.ok(inPendingList, `User ${testEmail} must appear in Admin pending requests list`);
  console.log(`Found user in Admin pending list (${pendingRequests.length} total pending requests)`);

  // Admin approves user
  const approveRes = await adapter.run(adminSession, 'approveRegistration', {
    userId: registeredUser.id,
    role: 'offers_user',
    notes: 'Approved for Enterprise Material Purchasing & Offers Portal',
  });
  console.log('Admin approval response:', { error: approveRes.error, notice: approveRes.notice });
  assert.equal(approveRes.error, undefined, 'Admin approval must succeed');
  assert.equal(approveRes.notice, 'User registration approved.');

  // Verify in database that status changed to approved and active
  const snap2 = await adapter.snapshot(adminSession);
  const approvedUser = snap2.users.find(u => u.email === testEmail);
  console.log('Approved user in DB:', {
    id: approvedUser.id,
    approvalStatus: approvedUser.approvalStatus,
    active: approvedUser.active,
    role: approvedUser.role,
  });
  assert.equal(approvedUser.approvalStatus, 'approved', 'DB approvalStatus must now be approved');
  assert.equal(approvedUser.active, true, 'DB active must now be true');
  console.log('  -> PASS: User status transitioned to approved and active.\n');

  // ---------------------------------------------------------
  // STEP 4: Approved User Login
  // ---------------------------------------------------------
  console.log('[STEP 4] Approved user attempts login...');
  const approvedLogin = await adapter.signIn(testEmail, testPassword);
  console.log('Approved login result:', {
    ok: approvedLogin.ok,
    role: approvedLogin.ok ? approvedLogin.value.profile.role : null,
    name: approvedLogin.ok ? approvedLogin.value.profile.name : null,
  });
  assert.equal(approvedLogin.ok, true, 'Approved user login must succeed');
  assert.equal(approvedLogin.value.profile.role, 'offers_user');
  assert.equal(approvedLogin.value.profile.approvalStatus, 'approved');
  assert.equal(approvedLogin.value.profile.active, true);

  // Verify session hydration / refresh
  const hydrated = await adapter.current(approvedLogin.value.sessionId);
  assert.ok(hydrated, 'Session hydration must succeed');
  assert.equal(hydrated.email, testEmail);
  assert.equal(hydrated.role, 'offers_user');
  console.log('  -> PASS: Approved user signed in successfully with full Offers User access.\n');

  // ---------------------------------------------------------
  // STEP 5: Rejection Workflow
  // ---------------------------------------------------------
  console.log('[STEP 5] Admin rejects user...');
  const rejectRes = await adapter.run(adminSession, 'rejectRegistration', {
    userId: registeredUser.id,
    reason: 'Unverified business entity documentation',
  });
  console.log('Admin rejection response:', { error: rejectRes.error, notice: rejectRes.notice });
  assert.equal(rejectRes.error, undefined, 'Admin rejection must succeed');
  assert.equal(rejectRes.notice, 'User registration rejected.');

  // Verify in database that status changed to rejected and inactive
  const snap3 = await adapter.snapshot(adminSession);
  const rejectedUser = snap3.users.find(u => u.email === testEmail);
  console.log('Rejected user in DB:', {
    id: rejectedUser.id,
    approvalStatus: rejectedUser.approvalStatus,
    active: rejectedUser.active,
  });
  assert.equal(rejectedUser.approvalStatus, 'rejected', 'DB approvalStatus must now be rejected');
  assert.equal(rejectedUser.active, false, 'DB active must now be false');

  // Attempt login as rejected user
  console.log('Attempting login as rejected user...');
  const rejectedLogin = await adapter.signIn(testEmail, testPassword);
  console.log('Rejected login result:', {
    ok: rejectedLogin.ok,
    error: !rejectedLogin.ok ? rejectedLogin.error : null,
  });
  assert.equal(rejectedLogin.ok, false, 'Rejected user MUST NOT be allowed to sign in');
  assert.ok(
    rejectedLogin.error?.includes('rejected') || rejectedLogin.error?.includes('declined'),
    `Expected rejection message, got: ${rejectedLogin.error}`
  );
  console.log('  -> PASS: Rejected user blocked from login with explicit rejection notice.\n');

  // Reset user to approved for normal state
  await adapter.run(adminSession, 'approveRegistration', {
    userId: registeredUser.id,
    role: 'offers_user',
    notes: 'Restored approved status post-test',
  });

  console.log('========================================================================');
  console.log('   ALL 5 LIVE SUPABASE VERIFICATION STAGES PASSED EMPIRICALLY!         ');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('\nTEST FAILED WITH ERROR:', err);
  process.exit(1);
});
