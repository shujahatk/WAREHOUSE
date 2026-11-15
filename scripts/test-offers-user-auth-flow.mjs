import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseAdapter } from '../src/lib/data/supabase-adapter.ts';
import { SupabaseRestClient } from '../src/lib/supabase/client.ts';

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

async function runTests() {
  console.log('====================================================');
  console.log('   OFFERS USER REGISTRATION & AUTH FLOW TEST        ');
  console.log('====================================================\n');

  const testEmail = `test_offers_${Date.now()}@tradingpartner.com`;
  const testPassword = 'SecurePassword2026!';
  const testName = 'Alex Trader';
  const testCompany = 'Global Trade Logistics';

  console.log(`1. Testing Registration for: ${testEmail}`);
  const regRes = await adapter.run(null, 'registerOffersUser', {
    name: testName,
    email: testEmail,
    password: testPassword,
    company: testCompany,
    notes: 'Direct partner trading application',
  });
  console.log('Registration response:', { error: regRes.error, notice: regRes.notice });
  assert.equal(regRes.error, undefined, `Registration should not have errors: ${regRes.error}`);
  assert.equal(regRes.notice, 'Registration submitted. Pending admin approval.');

  console.log('\n2. Testing Login BEFORE Approval (Pending state)');
  const pendingSignIn = await adapter.signIn(testEmail, testPassword);
  console.log('Pending sign-in result:', { ok: pendingSignIn.ok, error: !pendingSignIn.ok ? pendingSignIn.error : null });
  assert.equal(pendingSignIn.ok, false, 'Pending user must NOT be allowed to sign in');
  assert.ok(
    pendingSignIn.error?.includes('pending administrator approval') || pendingSignIn.error?.includes('pending'),
    `Expected pending message, got: ${pendingSignIn.error}`
  );

  console.log('\n3. Testing Incorrect Password');
  const badPassSignIn = await adapter.signIn(testEmail, 'WrongPassword123!');
  console.log('Bad password sign-in result:', { ok: badPassSignIn.ok, error: !badPassSignIn.ok ? badPassSignIn.error : null });
  assert.equal(badPassSignIn.ok, false);
  assert.ok(
    badPassSignIn.error?.includes('Invalid') || badPassSignIn.error?.includes('match') || badPassSignIn.error?.includes('credentials'),
    `Expected invalid credentials error, got: ${badPassSignIn.error}`
  );

  console.log('\n4. Admin Log in and Approve Registration');
  const adminSign = await adapter.signIn('admin@stockflow.local', 'StockFlowAdmin2026!');
  assert.equal(adminSign.ok, true, 'Admin sign-in must succeed');
  const adminSession = adminSign.value.sessionId;

  // Find the pending user ID from snapshot or direct query
  const snapshot = await adapter.snapshot(adminSession);
  const pendingUser = snapshot.users.find((u) => u.email === testEmail);
  assert.ok(pendingUser, `Pending user ${testEmail} must exist in users table`);
  console.log('Found pending user in DB:', { id: pendingUser.id, role: pendingUser.role, status: pendingUser.approvalStatus });

  // Admin approves user
  const approveRes = await adapter.run(adminSession, 'decideOffersUserRegistration', {
    userId: pendingUser.id,
    decision: 'approved',
    notes: 'Approved for global trading portal',
  });
  console.log('Admin approval response:', { error: approveRes.error, notice: approveRes.notice });
  assert.equal(approveRes.error, undefined);

  console.log('\n5. Testing Login AFTER Approval');
  const approvedSign = await adapter.signIn(testEmail, testPassword);
  console.log('Approved sign-in result:', {
    ok: approvedSign.ok,
    role: approvedSign.ok ? approvedSign.value.profile.role : null,
    name: approvedSign.ok ? approvedSign.value.profile.name : null,
  });
  assert.equal(approvedSign.ok, true, `Approved sign-in should succeed: ${!approvedSign.ok ? approvedSign.error : ''}`);
  assert.equal(approvedSign.value.profile.role, 'offers_user');

  console.log('\n6. Testing Session Hydration / Refresh (persistence across refreshes)');
  const refreshedProfile = await adapter.current(approvedSign.value.sessionId);
  assert.ok(refreshedProfile, 'Session hydration must return profile');
  assert.equal(refreshedProfile.role, 'offers_user');
  assert.equal(refreshedProfile.email, testEmail);
  console.log('Session hydration succeeded! User:', refreshedProfile.name, 'Role:', refreshedProfile.role);

  console.log('\n7. Testing View & Portal State for Offers User');
  const userView = await adapter.view(approvedSign.value.sessionId);
  assert.ok(userView.actor, 'Offers user actor must be populated in workspace view');
  assert.equal(userView.actor.role, 'offers_user');
  console.log('Workspace view actor:', userView.actor.name, '(', userView.actor.role, ')');

  console.log('\n====================================================');
  console.log('   ALL 7 OFFERS USER AUTH FLOW TESTS PASSED!        ');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('\nTEST FAILED WITH ERROR:', err);
  process.exit(1);
});
