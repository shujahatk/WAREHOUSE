import { readFileSync } from 'node:fs';

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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function authenticate(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, error: errText };
  }
  const data = await res.json();
  return { ok: true, token: data.access_token, user: data.user };
}

async function verifyLive() {
  console.log('================================================================');
  console.log('   STOCKFLOW — POST-MIGRATION LIVE SUPABASE VERIFICATION       ');
  console.log('================================================================\n');

  const adminAuth = await authenticate('admin@stockflow.local', 'StockFlowAdmin2026!');
  const staffAuth = await authenticate('staff@stockflow.local', 'StockFlowStaff2026!');
  const workerAuth = await authenticate('worker.bornem@stockflow.local', 'StockFlowWorker2026!');
  const modAuth = await authenticate('moderator@stockflow.local', 'StockFlowMod2026!');

  if (!adminAuth.ok || !staffAuth.ok || !workerAuth.ok || !modAuth.ok) {
    console.error('Authentication failure during setup:', {
      admin: adminAuth.ok,
      staff: staffAuth.ok,
      worker: workerAuth.ok,
      moderator: modAuth.ok,
    });
    process.exit(1);
  }

  const adminToken = adminAuth.token;
  const staffToken = staffAuth.token;
  const workerToken = workerAuth.token;
  const modToken = modAuth.token;

  let passed = 0;
  let total = 0;

  function report(name, ok, detail) {
    total++;
    if (ok) {
      console.log(`[PASS] ${name}: ${detail}`);
      passed++;
    } else {
      console.log(`[FAIL] ${name}: ${detail}`);
    }
  }

  // 1. Verify Phase 4 Tables exist and are accessible
  console.log('--- 1. Phase 4 Tables Existence & RLS ---');
  for (const table of ['audit_log', 'notifications', 'notification_preferences']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}` },
    });
    report(`Table '${table}' exists in live schema`, res.status === 200, `HTTP ${res.status}`);
  }

  // 2. Verify Phase 4 RPC Functions Accessibility
  console.log('\n--- 2. Phase 4 RPC Functions Accessibility ---');
  // 2a. rpc_create_notification
  const createNotifRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_create_notification`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_recipient_id: '10000000-0000-0000-0000-000000000001',
      p_event_type: 'verification',
      p_title: 'Verification Ping',
      p_message: 'Testing RPC exists'
    }),
  });
  report("RPC 'rpc_create_notification' exists & callable", createNotifRes.status === 200, `HTTP ${createNotifRes.status}`);

  // 2b. rpc_mark_notification_read
  const markReadRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_mark_notification_read`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_notification_id: '00000000-0000-0000-0000-000000000000' }),
  });
  report("RPC 'rpc_mark_notification_read' exists & callable", markReadRes.status === 200, `HTTP ${markReadRes.status}`);

  // 2c. rpc_mark_all_notifications_read
  const markAllRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_mark_all_notifications_read`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  report("RPC 'rpc_mark_all_notifications_read' exists & callable", markAllRes.status === 200, `HTTP ${markAllRes.status}`);

  // 2d. rpc_save_notification_preferences
  const savePrefRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_save_notification_preferences`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_notify_orders: true, p_notify_inventory: true, p_notify_requests: true, p_notify_offers: true, p_notify_demurrage: true }),
  });
  report("RPC 'rpc_save_notification_preferences' exists & callable", savePrefRes.status === 200, `HTTP ${savePrefRes.status}`);

  // 2e. rpc_get_notification_preferences
  const getPrefRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_get_notification_preferences`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  report("RPC 'rpc_get_notification_preferences' exists & callable", getPrefRes.status === 200, `HTTP ${getPrefRes.status}`);

  // 2f. rpc_query_audit_trail
  const auditRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_query_audit_trail`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_page: 1, p_page_size: 10 }),
  });
  report("RPC 'rpc_query_audit_trail' exists & callable", auditRpcRes.status === 200, `HTTP ${auditRpcRes.status}`);

  // 3. Verify Purchase Orders Immutability Guard
  console.log('\n--- 3. Purchase Orders Immutability Guard ---');
  const delPoRes = await fetch(`${SUPABASE_URL}/rest/v1/purchase_orders?id=eq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}` },
  });
  report('purchase_orders DELETE denied to authenticated', delPoRes.status === 401 || delPoRes.status === 403, `HTTP ${delPoRes.status}`);

  // 4. Verify Audit Log Immutability Guard
  console.log('\n--- 4. Audit Log Immutability Guard ---');
  const delAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_log?id=eq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}` },
  });
  report('audit_log DELETE denied to authenticated', delAuditRes.status === 401 || delAuditRes.status === 403, `HTTP ${delAuditRes.status}`);

  const insertAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'direct_insert_attempt' }),
  });
  report('audit_log direct client INSERT denied', insertAuditRes.status === 401 || insertAuditRes.status === 403, `HTTP ${insertAuditRes.status}`);

  // 5. Verify Anon RPC Execution Denied
  console.log('\n--- 5. Anon RPC Execution Denied ---');
  const anonNotifRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_create_notification`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_recipient_id: '10000000-0000-0000-0000-000000000001',
      p_event_type: 'anon_attack',
      p_title: 'Anon Title',
      p_message: 'Anon Message'
    }),
  });
  report("anon execution of 'rpc_create_notification' blocked", anonNotifRes.status === 401 || anonNotifRes.status === 403, `HTTP ${anonNotifRes.status}`);

  const anonAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_query_audit_trail`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_page: 1, p_page_size: 10 }),
  });
  report("anon execution of 'rpc_query_audit_trail' blocked", anonAuditRes.status === 401 || anonAuditRes.status === 403, `HTTP ${anonAuditRes.status}`);

  const anonPrefRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_save_notification_preferences`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_notify_orders: true }),
  });
  report("anon execution of 'rpc_save_notification_preferences' blocked", anonPrefRes.status === 401 || anonPrefRes.status === 403, `HTTP ${anonPrefRes.status}`);

  // 6. Verify Role Scoping & Isolation
  console.log('\n--- 6. Role Boundaries & Privacy Verification ---');
  // Staff cannot query audit_log
  const staffAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_log?select=*`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${staffToken}` },
  });
  report('Staff audit_log read restricted', staffAuditRes.status === 403 || (staffAuditRes.status === 200 && (await staffAuditRes.json()).length === 0), `HTTP ${staffAuditRes.status}`);

  // Worker cannot query audit_log
  const workerAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_log?select=*`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${workerToken}` },
  });
  report('Worker audit_log read restricted', workerAuditRes.status === 403 || (workerAuditRes.status === 200 && (await workerAuditRes.json()).length === 0), `HTTP ${workerAuditRes.status}`);

  // Moderator cannot notify with invalid target_type
  const modBypassRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_create_notification`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${modToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_recipient_id: '10000000-0000-0000-0000-000000000004',
      p_event_type: 'offer_update',
      p_title: 'Invalid Target',
      p_message: 'Testing target_type restriction',
      p_target_type: 'shipment'
    }),
  });
  report('Moderator restricted to offer-only target_type', modBypassRes.status === 400, `HTTP ${modBypassRes.status}`);

  // Worker cannot notify with mismatched warehouse
  const workerBypassRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_create_notification`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_recipient_id: '10000000-0000-0000-0000-000000000003',
      p_event_type: 'worker_task',
      p_title: 'Wrong Wh',
      p_message: 'Testing warehouse restriction',
      p_warehouse_id: '00000000-0000-0000-0000-000000000099'
    }),
  });
  report('Worker isolated to assigned warehouse', workerBypassRes.status === 400, `HTTP ${workerBypassRes.status}`);

  // 7. Verify Storage Bucket 'stockflow-files'
  console.log('\n--- 7. Storage Bucket Verification ---');
  // Test upload to stockflow-files with unsupported mime type -> proves bucket exists & enforces mime types
  const bucketProbeRes = await fetch(`${SUPABASE_URL}/storage/v1/object/stockflow-files/probe.txt`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'text/plain' },
    body: 'probe',
  });
  const bucketProbeBody = await bucketProbeRes.json().catch(() => ({}));
  report("Storage bucket 'stockflow-files' exists", bucketProbeBody.code === 'InvalidMimeType' || bucketProbeRes.status === 200, `HTTP ${bucketProbeRes.status} (${bucketProbeBody.code})`);
  report("Storage bucket enforces allowed MIME types (rejects text/plain)", bucketProbeBody.code === 'InvalidMimeType', `code: ${bucketProbeBody.code}`);

  // Test RLS on storage.objects without document row -> proves RLS is enforced
  const rlsProbeRes = await fetch(`${SUPABASE_URL}/storage/v1/object/stockflow-files/probe.png`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'image/png' },
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  const rlsProbeBody = await rlsProbeRes.json().catch(() => ({}));
  report("Storage RLS policy enforced on storage.objects (AccessDenied on unauthorized upload)", rlsProbeBody.code === 'AccessDenied', `HTTP ${rlsProbeRes.status} (${rlsProbeBody.code})`);

  // 8. Verify Dedicated Least-Privilege Backup Runner User
  console.log('\n--- 8. Dedicated Backup Runner Verification ---');
  const backupAuth = await authenticate('backup.runner@stockflow.local', 'StockFlowBackup2026!Secure');
  report("Dedicated backup runner user authenticates", backupAuth.ok, backupAuth.ok ? `User ID: ${backupAuth.user?.id}` : `Auth failed: ${backupAuth.error}`);

  // Test that backup runner can SELECT from audit_log and notifications
  if (backupAuth.ok) {
    const backupAuditRes = await fetch(`${SUPABASE_URL}/rest/v1/audit_log?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${backupAuth.token}` },
    });
    report("Backup runner can read audit_log", backupAuditRes.status === 200, `HTTP ${backupAuditRes.status}`);

    const backupNotifRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${backupAuth.token}` },
    });
    report("Backup runner can read notifications", backupNotifRes.status === 200, `HTTP ${backupNotifRes.status}`);

    const backupPoDelete = await fetch(`${SUPABASE_URL}/rest/v1/purchase_orders?id=eq.00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${backupAuth.token}` },
    });
    report("Backup runner cannot DELETE purchase_orders (least-privilege immutability)", backupPoDelete.status === 403, `HTTP ${backupPoDelete.status}`);
  }

  console.log('\n================================================================');
  console.log(`   LIVE VERIFICATION SUMMARY: ${passed}/${total} CHECKS PASSED  `);
  console.log('================================================================');
  return { passed, total };
}

verifyLive().catch(console.error);
