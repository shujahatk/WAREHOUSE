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
  const RPCS = [
    'rpc_create_notification',
    'rpc_mark_notification_read',
    'rpc_mark_all_notifications_read',
    'rpc_save_notification_preferences',
    'rpc_get_notification_preferences',
    'rpc_query_audit_trail',
  ];

  for (const rpc of RPCS) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => null);
    // If not found in cache, PostgREST returns 404 with "no matches were found in the schema cache"
    const notFound = res.status === 404 && body?.details?.includes('no matches were found in the schema cache');
    const exists = !notFound && (res.status === 200 || res.status === 400 || res.status === 404 || res.status === 409);
    report(`RPC '${rpc}' exists in schema cache`, exists, `HTTP ${res.status} (${body?.code || 'OK'})`);
  }

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
  for (const rpc of ['rpc_create_notification', 'rpc_query_audit_trail', 'rpc_save_notification_preferences']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    report(`anon execution of '${rpc}' blocked`, res.status === 401 || res.status === 403, `HTTP ${res.status}`);
  }

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

  // 7. Verify Storage Bucket 'stockflow-files'
  console.log('\n--- 7. Storage Bucket Verification ---');
  const bucketsRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminToken}` },
  });
  if (bucketsRes.ok) {
    const buckets = await bucketsRes.json();
    const sfBucket = buckets.find(b => b.id === 'stockflow-files');
    report("Storage bucket 'stockflow-files' exists", Boolean(sfBucket), sfBucket ? `Found bucket ${sfBucket.id}` : 'Bucket not found');
    report("Storage bucket 'stockflow-files' is private", sfBucket?.public === false, sfBucket ? `public=${sfBucket.public}` : 'N/A');
  } else {
    report("Storage bucket 'stockflow-files' exists", false, `HTTP ${bucketsRes.status}`);
    report("Storage bucket 'stockflow-files' is private", false, `HTTP ${bucketsRes.status}`);
  }

  // 8. Verify Dedicated Least-Privilege Backup Runner User
  console.log('\n--- 8. Dedicated Backup Runner Verification ---');
  const backupAuth = await authenticate('backup.runner@stockflow.local', 'StockFlowBackup2026!Secure');
  report("Dedicated backup runner user authenticates", backupAuth.ok, backupAuth.ok ? `User ${backupAuth.user?.id}` : `Auth failed: ${backupAuth.error}`);

  console.log('\n================================================================');
  console.log(`   LIVE VERIFICATION SUMMARY: ${passed}/${total} CHECKS PASSED  `);
  console.log('================================================================');
  return { passed, total };
}

verifyLive().catch(console.error);
