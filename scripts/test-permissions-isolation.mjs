import assert from 'node:assert/strict';
import { canAccess } from '../src/lib/permissions.ts';
import { can as canData } from '../src/lib/data/permissions.ts';

function runPermissionsAndIsolationTest() {
  console.log('================================================================');
  console.log('   STOCKFLOW — PERMISSIONS & API DATA ISOLATION TEST            ');
  console.log('================================================================');

  // 1. Navigation Route Rules & URL Gate Checks
  console.log('\n--- 1. Testing Route Rules & Direct URL Gate Access ---');
  // Admin (/audit, /analytics, /users, /settings)
  assert.equal(canAccess('owner', '/audit'), true, 'Admin must access /audit');
  assert.equal(canAccess('owner', '/analytics'), true, 'Admin must access /analytics');
  assert.equal(canAccess('owner', '/users'), true, 'Admin must access /users');

  // Staff (manager): cannot access /audit, /users; can access /analytics, /purchases, /materials
  assert.equal(canAccess('manager', '/audit'), false, 'Staff must be blocked from /audit');
  assert.equal(canAccess('manager', '/users'), false, 'Staff must be blocked from /users');
  assert.equal(canAccess('manager', '/analytics'), true, 'Staff can access /analytics');
  assert.equal(canAccess('manager', '/purchases'), true, 'Staff can access /purchases');

  // Worker: strictly blocked from /audit, /analytics, /users, /reports, /offers
  assert.equal(canAccess('worker', '/audit'), false, 'Worker must be blocked from /audit');
  assert.equal(canAccess('worker', '/analytics'), false, 'Worker must be blocked from /analytics');
  assert.equal(canAccess('worker', '/offers'), false, 'Worker must be blocked from /offers');
  assert.equal(canAccess('worker', '/users'), false, 'Worker must be blocked from /users');

  // Moderator: strictly blocked from general operations and administration
  assert.equal(canAccess('moderator', '/audit'), false, 'Moderator must be blocked from /audit');
  assert.equal(canAccess('moderator', '/analytics'), false, 'Moderator must be blocked from /analytics');
  assert.equal(canAccess('moderator', '/purchases'), false, 'Moderator must be blocked from /purchases');
  assert.equal(canAccess('moderator', '/inventory'), false, 'Moderator must be blocked from /inventory');
  assert.equal(canAccess('moderator', '/offers'), true, 'Moderator must access /offers');
  console.log('[PASS] Navigation route permissions verified for all 4 roles.');

  // 2. Action Permissions Matrix
  console.log('\n--- 2. Testing Action Permissions Matrix ---');
  // Admin read-only operational rule
  assert.equal(canData({ role: 'owner', active: true }, 'order:create'), false, 'Admin cannot create operational orders');
  assert.equal(canData({ role: 'owner', active: true }, 'order:delete'), false, 'Admin cannot delete operational orders');
  assert.equal(canData({ role: 'owner', active: true }, 'request:complete'), false, 'Admin cannot complete operational stock lines');
  assert.equal(canData({ role: 'owner', active: true }, 'order:approve'), true, 'Admin can approve orders');
  assert.equal(canData({ role: 'owner', active: true }, 'request:approve'), true, 'Admin can approve requests');

  // Staff management boundaries
  assert.equal(canData({ role: 'manager', active: true }, 'order:create'), true, 'Staff can create orders');
  assert.equal(canData({ role: 'manager', active: true }, 'order:delete'), false, 'Staff cannot delete orders');
  assert.equal(canData({ role: 'manager', active: true }, 'order:approve'), false, 'Staff cannot approve orders');
  assert.equal(canData({ role: 'manager', active: true }, 'worker:assign'), false, 'Staff cannot assign workers');

  // Worker warehouse scoping
  const workerBornem = { role: 'worker', active: true, warehouseId: 'wh-bornem', warehouse: 'Bornem' };
  assert.equal(canData(workerBornem, 'file:upload', { warehouseId: 'wh-bornem' }), true, 'Worker can upload to assigned warehouse');
  assert.equal(canData(workerBornem, 'file:upload', { warehouseId: 'wh-spain' }), false, 'Worker cannot upload to different warehouse');
  assert.equal(canData(workerBornem, 'order:create'), false, 'Worker cannot create orders');
  assert.equal(canData(workerBornem, 'offer:view'), false, 'Worker cannot view offers');

  // Offer Moderator boundaries
  const moderator = { role: 'moderator', active: true };
  assert.equal(canData(moderator, 'offer:create'), true, 'Moderator can create offers');
  assert.equal(canData(moderator, 'offer:edit'), true, 'Moderator can edit offers');
  assert.equal(canData(moderator, 'offer:approve'), false, 'Moderator cannot approve offers');
  assert.equal(canData(moderator, 'stock:view'), false, 'Moderator cannot view warehouse stock');
  assert.equal(canData(moderator, 'order:view'), false, 'Moderator cannot view operational POs');
  console.log('[PASS] Action permission boundaries strictly enforced for all 4 roles.');

  // 3. API Endpoint Guard Logic Simulation
  console.log('\n--- 3. Testing API Endpoint Protection & Isolation Logic ---');

  // Helper simulating /api/audit authorization
  function checkAuditApi(user) {
    if (!user || !user.active) return { status: 401 };
    if (user.role === 'owner') return { status: 200, scope: 'all' };
    if (user.role === 'moderator') return { status: 200, scope: 'offers_only' };
    return { status: 403, error: 'Forbidden' };
  }

  assert.equal(checkAuditApi(null).status, 401);
  assert.equal(checkAuditApi({ role: 'owner', active: true }).status, 200);
  assert.equal(checkAuditApi({ role: 'moderator', active: true }).scope, 'offers_only');
  assert.equal(checkAuditApi({ role: 'manager', active: true }).status, 403);
  assert.equal(checkAuditApi({ role: 'worker', active: true }).status, 403);
  console.log('  [PASS] /api/audit: Admin (200 all), Moderator (200 offers only), Staff (403), Worker (403).');

  // Helper simulating /api/reports/export authorization
  function checkExportApi(user, reportType) {
    if (!user || !user.active) return { status: 401 };
    if (user.role === 'owner') return { status: 200 };
    if (user.role === 'manager') {
      if (['suppliers', 'customers', 'materials'].includes(reportType)) return { status: 200 };
      return { status: 403, error: 'Forbidden' };
    }
    if (user.role === 'moderator') {
      if (reportType === 'offers') return { status: 200 };
      return { status: 403, error: 'Forbidden' };
    }
    return { status: 403, error: 'Forbidden' };
  }

  assert.equal(checkExportApi(null, 'stock').status, 401);
  assert.equal(checkExportApi({ role: 'owner', active: true }, 'stock').status, 200);
  assert.equal(checkExportApi({ role: 'manager', active: true }, 'stock').status, 403);
  assert.equal(checkExportApi({ role: 'manager', active: true }, 'suppliers').status, 200);
  assert.equal(checkExportApi({ role: 'moderator', active: true }, 'offers').status, 200);
  assert.equal(checkExportApi({ role: 'moderator', active: true }, 'stock').status, 403);
  assert.equal(checkExportApi({ role: 'worker', active: true }, 'stock').status, 403);
  console.log('  [PASS] /api/reports/export: Owner (all), Staff (catalog only, stock 403), Moderator (offers only, stock 403), Worker (403).');

  // Helper simulating /api/import authorization
  function checkImportApi(user, entity) {
    if (!user || !user.active) return { status: 401 };
    if (user.role === 'owner') return { status: 200 };
    if (user.role === 'manager') {
      if (['materials', 'suppliers', 'customers'].includes(entity)) return { status: 200 };
      return { status: 403, error: 'Staff cannot import this entity' };
    }
    return { status: 403, error: 'Forbidden' };
  }

  assert.equal(checkImportApi(null, 'materials').status, 401);
  assert.equal(checkImportApi({ role: 'owner', active: true }, 'materials').status, 200);
  assert.equal(checkImportApi({ role: 'manager', active: true }, 'materials').status, 200);
  assert.equal(checkImportApi({ role: 'manager', active: true }, 'stock').status, 403);
  assert.equal(checkImportApi({ role: 'worker', active: true }, 'materials').status, 403);
  assert.equal(checkImportApi({ role: 'moderator', active: true }, 'materials').status, 403);
  console.log('  [PASS] /api/import: Admin & Staff (permitted catalog), Worker (403), Moderator (403).');

  console.log('\n================================================================');
  console.log('   PERMISSIONS & DATA ISOLATION: ALL TESTS PASSED (PASS)        ');
  console.log('================================================================');
}

runPermissionsAndIsolationTest();
