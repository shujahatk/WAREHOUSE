// scripts/test-live-login-request-permissions.mjs
// Verifies live login/registration request permissions with actual Admin and Staff accounts against Supabase
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseRestClient } from '../src/lib/supabase/client.ts';
import { getSupabaseConfig } from '../src/lib/supabase/config.ts';
import { SupabaseAdapter } from '../src/lib/data/supabase-adapter.ts';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf8');
envContent.split(/\r?\n/).forEach((line) => {
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

async function main() {
  console.log('========================================================================');
  console.log('  TESTING LIVE LOGIN REQUEST PERMISSIONS (ADMIN vs STAFF ACCOUNTS)     ');
  console.log('========================================================================\n');

  // 1. Sign in Admin and Staff
  console.log('1. Authenticating actual Admin account...');
  const adminSign = await adapter.signIn('admin@stockflow.local', 'StockFlowAdmin2026!');
  assert.equal(adminSign.ok, true, `Admin login failed: ${adminSign.error}`);
  assert.equal(adminSign.value?.profile?.role, 'owner');
  console.log('   Admin authenticated successfully (role: owner)\n');

  console.log('2. Authenticating actual Staff account...');
  const staffSign = await adapter.signIn('staff@stockflow.local', 'StockFlowStaff2026!');
  assert.equal(staffSign.ok, true, `Staff login failed: ${staffSign.error}`);
  assert.equal(staffSign.value?.profile?.role, 'manager');
  console.log('   Staff authenticated successfully (role: manager)\n');

  // 2. Submit a new registration request
  const testEmail = `test_applicant_${Date.now()}@stockflow-verify.local`;
  console.log(`3. Submitting new login/registration request for: ${testEmail}...`);
  const regRes = await adapter.run(null, 'signUpUser', {
    name: 'Live Applicant Test',
    email: testEmail,
    phone: '+32499887766',
    password: 'ApplicantPassword2026!',
    confirmPassword: 'ApplicantPassword2026!',
    notes: 'Live verification registration test',
  });
  assert.equal(regRes.error, undefined, `Registration failed: ${regRes.error}`);
  console.log('   Registration submitted: status is pending\n');

  // 3b. Pending user sign in check (must be blocked)
  console.log('3b. Verifying pending applicant login is strictly blocked...');
  const pendingLogin = await adapter.signIn(testEmail, 'ApplicantPassword2026!');
  assert.equal(pendingLogin.ok, false, 'Pending user must not log in');
  assert.ok(
    pendingLogin.error?.includes('pending') || pendingLogin.error?.includes('approval'),
    `Expected pending approval notice, got: ${pendingLogin.error}`
  );
  console.log(`   PASS: Pending user blocked with error: "${pendingLogin.error}"\n`);
  console.log('4. Checking Admin view of accounts...');
  const adminView = await adapter.view(adminSign.value.sessionId);
  const pendingInAdmin = adminView.state.accounts.find((u) => u.email === testEmail);
  assert.ok(pendingInAdmin, 'Admin MUST see pending login/registration requests');
  assert.equal(pendingInAdmin.approvalStatus, 'pending');
  console.log(`   PASS: Admin sees applicant ${pendingInAdmin.email} with status pending\n`);

  // 4. Staff view check
  console.log('5. Checking Staff view of accounts...');
  const staffView = await adapter.view(staffSign.value.sessionId);
  const pendingInStaff = staffView.state.accounts.find((u) => u.email === testEmail);
  assert.equal(pendingInStaff, undefined, 'Staff MUST NOT see pending login/registration requests');
  console.log('   PASS: Staff cannot see the pending login/registration request\n');

  // 5. Staff direct mutation attempts
  console.log('6. Testing Staff direct approval attempt via adapter API...');
  const staffApprove = await adapter.run(staffSign.value.sessionId, 'approveRegistration', {
    userId: pendingInAdmin.id,
    role: 'worker',
    warehouse: 'Bornem',
  });
  assert.equal(staffApprove.error, 'Only Admin can approve account registrations.');
  console.log(`   PASS: Staff approval blocked with error: "${staffApprove.error}"\n`);

  console.log('7. Testing Staff direct rejection attempt via adapter API...');
  const staffReject = await adapter.run(staffSign.value.sessionId, 'rejectRegistration', {
    userId: pendingInAdmin.id,
    reason: 'Staff unauthorized attempt',
  });
  assert.equal(staffReject.error, 'Only Admin can reject account registrations.');
  console.log(`   PASS: Staff rejection blocked with error: "${staffReject.error}"\n`);

  console.log('8. Testing Staff direct deletion attempt of registration request...');
  const staffDelete = await adapter.run(staffSign.value.sessionId, 'deleteRegistrationRequest', {
    userId: pendingInAdmin.id,
  });
  assert.equal(staffDelete.error, 'Only Admin can delete registration requests.');
  console.log(`   PASS: Staff delete request blocked with error: "${staffDelete.error}"\n`);

  // 6. Direct Supabase RPC calls with Staff token
  console.log('9. Testing direct Supabase RPC call with Staff Bearer token...');
  const staffToken = adapter.resolveToken(staffSign.value.sessionId);
  const staffRpcApprove = await restClient.rpc(
    'rpc_approve_user_registration',
    {
      p_user_id: pendingInAdmin.id,
      p_role: 'worker',
      p_warehouse_id: null,
      p_note: 'Staff direct RPC exploit',
    },
    staffToken
  );
  assert.equal(staffRpcApprove.ok, false, 'Direct RPC approval by Staff must fail at database level');
  assert.match(staffRpcApprove.error ?? '', /Only administrators can approve account registrations/i);
  console.log(`   PASS: Supabase RPC rejected Staff direct approval: "${staffRpcApprove.error}"\n`);

  const staffRpcReject = await restClient.rpc(
    'rpc_reject_user_registration',
    {
      p_user_id: pendingInAdmin.id,
      p_reason: 'Staff direct RPC exploit',
    },
    staffToken
  );
  assert.equal(staffRpcReject.ok, false, 'Direct RPC rejection by Staff must fail at database level');
  assert.match(staffRpcReject.error ?? '', /Only administrators can reject account registrations/i);
  console.log(`   PASS: Supabase RPC rejected Staff direct rejection: "${staffRpcReject.error}"\n`);

  // 7. Admin approval
  console.log('10. Admin approving the registration request...');
  const adminApprove = await adapter.run(adminSign.value.sessionId, 'approveRegistration', {
    userId: pendingInAdmin.id,
    role: 'worker',
    warehouse: 'Bornem',
    notes: 'Approved by Administrator during live verification',
  });
  assert.equal(adminApprove.error, undefined, `Admin approval failed: ${adminApprove.error}`);
  console.log('   PASS: Admin successfully approved registration\n');

  // 8. Verify approved user status in database
  console.log('11. Verifying database approval status updated to approved...');
  const afterApproveView = await adapter.view(adminSign.value.sessionId);
  const approvedUser = afterApproveView.state.accounts.find((u) => u.email === testEmail);
  assert.ok(approvedUser, 'Approved user must exist in accounts');
  assert.equal(approvedUser.approvalStatus, 'approved');
  assert.equal(approvedUser.role, 'worker');
  assert.equal(approvedUser.status, 'Active');
  console.log('   PASS: User account successfully updated to approved, active, role=worker\n');

  // 9. Cleanup test user
  console.log('12. Cleaning up approved test user via Admin...');
  const cleanup = await adapter.run(adminSign.value.sessionId, 'deleteUser', {
    userId: pendingInAdmin.id,
  });
  assert.equal(cleanup.error, undefined, `Cleanup failed: ${cleanup.error}`);
  console.log('   PASS: Test user removed successfully\n');

  // 10. Test Admin Rejection flow with another applicant
  const rejectEmail = `test_reject_${Date.now()}@stockflow-verify.local`;
  console.log(`13. Submitting applicant for rejection test: ${rejectEmail}...`);
  await adapter.run(null, 'signUpUser', {
    name: 'Reject Applicant Test',
    email: rejectEmail,
    phone: '+32499112233',
    password: 'RejectPassword2026!',
    confirmPassword: 'RejectPassword2026!',
    notes: 'Live verification rejection test',
  });

  const adminViewForReject = await adapter.view(adminSign.value.sessionId);
  const rejectApplicant = adminViewForReject.state.accounts.find((u) => u.email === rejectEmail);
  assert.ok(rejectApplicant, 'Admin must see applicant for rejection');

  console.log('14. Admin rejecting applicant with mandatory reason...');
  const adminReject = await adapter.run(adminSign.value.sessionId, 'rejectRegistration', {
    userId: rejectApplicant.id,
    reason: 'Application does not meet logistics criteria',
  });
  assert.equal(adminReject.error, undefined, `Admin rejection failed: ${adminReject.error}`);
  console.log('   PASS: Admin successfully rejected registration request\n');

  console.log('15. Verifying rejected applicant login attempts are rejected...');
  const rejectedLogin = await adapter.signIn(rejectEmail, 'RejectPassword2026!');
  assert.equal(rejectedLogin.ok, false, 'Rejected applicant must not log in');
  assert.ok(
    rejectedLogin.error?.includes('rejected (declined)'),
    `Expected rejection notice, got: ${rejectedLogin.error}`
  );
  console.log(`   PASS: Rejected user blocked with message: "${rejectedLogin.error}"\n`);

  console.log('16. Cleaning up rejected test user via Admin...');
  const cleanupReject = await adapter.run(adminSign.value.sessionId, 'deleteUser', {
    userId: rejectApplicant.id,
  });
  assert.equal(cleanupReject.error, undefined, `Cleanup failed: ${cleanupReject.error}`);
  console.log('   PASS: Rejected test record cleaned up successfully\n');

  console.log('========================================================================');
  console.log('  ALL LIVE LOGIN REQUEST PERMISSION CHECKS PASSED 100%!                ');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('\nFAIL: Live verification check failed:', err);
  process.exit(1);
});
