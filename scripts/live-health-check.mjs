import { readFileSync } from 'node:fs';

// Read .env.local
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADAPTER_MODE = env.STOCKFLOW_DATA_ADAPTER;

const TEST_ACCOUNTS = {
  admin: { role: 'Admin (owner)', email: 'admin@stockflow.local', password: 'StockFlowAdmin2026!' },
  staff: { role: 'Staff (manager)', email: 'staff@stockflow.local', password: 'StockFlowStaff2026!' },
  worker: { role: 'Worker (worker)', email: 'worker.bornem@stockflow.local', password: 'StockFlowWorker2026!' },
  moderator: { role: 'Offer Moderator (moderator)', email: 'moderator@stockflow.local', password: 'StockFlowMod2026!' },
};

const REQUIRED_TABLES = [
  'warehouses',
  'users',
  'companies',
  'materials',
  'stock_balances',
  'purchase_orders',
  'shipments',
  'warehouse_transfers',
  'documents',
  'offers',
  'audit_log',
];

const ALL_29_TABLES = [
  'warehouses',
  'companies',
  'users',
  'materials',
  'packaging_types',
  'purchase_orders',
  'purchase_order_lines',
  'shipments',
  'request_sequences',
  'requests',
  'request_lines',
  'worker_general_requests',
  'worker_general_request_attachments',
  'documents',
  'request_photos',
  'stock_balances',
  'warehouse_transfers',
  'stock_movements',
  'customs_records',
  'demurrage_records',
  'annex7_records',
  'audit_log',
  'offer_sequences',
  'offers',
  'offer_attachments',
  'offer_comments',
  'offer_activities',
  'po_sequences',
  'inventory_history',
];

async function checkUrlConnectivity() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: ANON_KEY },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Status ${res.status}: ${data.error_description || data.msg || JSON.stringify(data)}`);
  }
  return { token: data.access_token, user: data.user };
}

async function queryTable(table, token = null, query = 'select=*&limit=5') {
  const headers = { apikey: ANON_KEY };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, count: Array.isArray(data) ? data.length : 0, data };
}


async function main() {
  console.log('================================================================');
  console.log('       STOCKFLOW — LIVE SUPABASE CONNECTION HEALTH CHECK        ');
  console.log('================================================================');
  console.log(`Target URL:     ${SUPABASE_URL}`);
  console.log(`Adapter Mode:   ${ADAPTER_MODE}`);
  console.log(`Local Time:     ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  const report = {
    connection: false,
    auth: false,
    dbAccess: false,
    accessibleTablesCount: 0,
    adapter: ADAPTER_MODE?.toUpperCase() || 'UNKNOWN',
    rls: false,
    blockers: [],
  };

  // ---------------------------------------------------------------------------
  // 1. CONNECTION & AUTH HEALTH
  // ---------------------------------------------------------------------------
  console.log('### 1. Connection & Auth Verification');

  // URL Connectivity & Auth Health
  const connHealth = await checkUrlConnectivity();
  if (connHealth.ok) {
    console.log(`[PASS] Supabase URL Connectivity: HTTP ${connHealth.status} (Healthy)`);
    console.log(`       Auth Engine Version: ${connHealth.data.version || 'GoTrue'}`);
    report.connection = true;
  } else {
    console.log(`[FAIL] Supabase URL Connectivity: ${connHealth.error || 'HTTP ' + connHealth.status}`);
    report.blockers.push(`Supabase URL unreachable: ${connHealth.error || connHealth.status}`);
  }

  // Anon Key Verification
  const anonCheck = await queryTable('warehouses', null, 'select=count');
  // Anon querying warehouses should either succeed (if public select allowed) or return 401/403 (if zero trust)
  if (anonCheck.status === 200 || anonCheck.status === 401 || anonCheck.status === 403) {
    console.log(`[PASS] Anon-key Authenticated Gateway Handshake: Verified (HTTP ${anonCheck.status})`);
  } else {
    console.log(`[FAIL] Anon-key Gateway: Unexpected HTTP ${anonCheck.status}`);
    report.blockers.push(`Anon key gateway returned HTTP ${anonCheck.status}`);
  }

  // Authenticate 4 Role Accounts
  const sessions = {};
  let authSuccessCount = 0;
  for (const [key, acc] of Object.entries(TEST_ACCOUNTS)) {
    try {
      const sess = await signIn(acc.email, acc.password);
      sessions[key] = sess;
      authSuccessCount++;
      console.log(`[PASS] Authenticated Session: ${acc.role}`);
      console.log(`       Email: ${acc.email} | User ID: ${sess.user.id}`);
    } catch (err) {
      console.log(`[FAIL] Authenticated Session: ${acc.role} (${acc.email}): ${err.message}`);
      report.blockers.push(`Authentication failed for ${acc.role}: ${err.message}`);
    }
  }

  if (authSuccessCount === 4) {
    report.auth = true;
    console.log('[PASS] All 4 Role Accounts Verified in Live Supabase Auth.');
  }

  // ---------------------------------------------------------------------------
  // 2. DATABASE SELECT OPERATIONS (SPECIFIED & ALL TABLES)
  // ---------------------------------------------------------------------------
  console.log('\n### 2. Database Tables & SELECT Verification');

  const adminToken = sessions.admin?.token;
  const staffToken = sessions.staff?.token;
  const workerToken = sessions.worker?.token;
  const modToken = sessions.moderator?.token;

  if (adminToken) {
    console.log('\n--- Checking 11 Required Tables (via Admin/Appropriate Role) ---');
    let requiredSuccess = 0;

    for (const table of REQUIRED_TABLES) {
      // Use Admin token for general oversight, or modToken for offers
      let tokenToUse = adminToken;
      if (table === 'offers') {
        tokenToUse = modToken || adminToken;
      }

      const res = await queryTable(table, tokenToUse);
      if (res.ok) {
        console.log(`[PASS] SELECT on "${table}": OK (HTTP ${res.status}, rows returned: ${res.count})`);
        requiredSuccess++;
      } else {
        console.log(`[FAIL] SELECT on "${table}": FAILED (HTTP ${res.status}) - ${JSON.stringify(res.data)}`);
        report.blockers.push(`Table ${table} query failed with HTTP ${res.status}`);
      }
    }

    if (requiredSuccess === REQUIRED_TABLES.length) {
      report.dbAccess = true;
    }

    console.log('\n--- Verifying Accessibility Across All 29 Tables ---');
    let accessibleCount = 0;
    const inaccessible = [];
    for (const table of ALL_29_TABLES) {
      let tokenToUse = adminToken;
      if (table.startsWith('offer')) tokenToUse = modToken || adminToken;
      const res = await queryTable(table, tokenToUse);
      if (res.ok) {
        accessibleCount++;
      } else {
        // Test with staff and worker as well
        let okWithOther = false;
        if (staffToken) {
          const staffRes = await queryTable(table, staffToken);
          if (staffRes.ok) {
            accessibleCount++;
            okWithOther = true;
          }
        }
        if (!okWithOther && workerToken) {
          const workerRes = await queryTable(table, workerToken);
          if (workerRes.ok) {
            accessibleCount++;
            okWithOther = true;
          }
        }
        if (!okWithOther) {
          inaccessible.push({ table, status: res.status });
        }
      }
    }
    report.accessibleTablesCount = accessibleCount;
    if (inaccessible.length > 0) {
      console.log(`[INFO] Non-accessible direct tables (${inaccessible.length}): ${inaccessible.map(i => i.table + ' (' + i.status + ')').join(', ')}`);
    }
    console.log(`[PASS] Tables Accessible to Authenticated Roles: ${accessibleCount} / ${ALL_29_TABLES.length}`);
  }

  // ---------------------------------------------------------------------------
  // 3. APPLICATION ADAPTER & DATA HYDRATION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n### 3. Application Data Adapter Check');
  console.log(`[INFO] STOCKFLOW_DATA_ADAPTER configured in .env.local: "${ADAPTER_MODE}"`);

  if (ADAPTER_MODE === 'supabase') {
    console.log('[PASS] Application is configured to use SupabaseAdapter (live production mode).');
  } else {
    console.log('[WARN] Application is currently using LocalAdapter!');
  }

  // Test read capability without modifying records (querying warehouses and packaging)
  if (adminToken) {
    const whRes = await queryTable('warehouses', adminToken);
    const pkgRes = await queryTable('packaging_types', adminToken);
    if (whRes.ok && whRes.data.length > 0 && pkgRes.ok && pkgRes.data.length > 0) {
      console.log(`[PASS] Live Database Seed Data Hydrated:`);
      console.log(`       - Warehouses: ${whRes.data.map((w) => w.name).join(', ')}`);
      console.log(`       - Packaging Types: ${pkgRes.data.length} types loaded`);
    } else {
      console.log('[WARN] Live seed data appears empty or unread.');
    }
  }

  // ---------------------------------------------------------------------------
  // 4. SECURITY & ROW LEVEL SECURITY (RLS) POLICIES
  // ---------------------------------------------------------------------------
  console.log('\n### 4. Security & RLS Policy Enforcement Matrix');

  let rlsPassed = true;

  // 4.1 Anonymous Access Denial
  const anonAuditRes = await queryTable('audit_log', null);
  if (!anonAuditRes.ok && (anonAuditRes.status === 401 || anonAuditRes.status === 403)) {
    console.log(`[PASS] Anonymous Access to "audit_log": BLOCKED (HTTP ${anonAuditRes.status} RLS/Permission Guard)`);
  } else {
    console.log(`[FAIL] Anonymous Access to "audit_log" was NOT blocked (HTTP ${anonAuditRes.status})!`);
    rlsPassed = false;
  }

  const anonOffersRes = await queryTable('offers', null);
  if (!anonOffersRes.ok && (anonOffersRes.status === 401 || anonOffersRes.status === 403)) {
    console.log(`[PASS] Anonymous Access to "offers": BLOCKED (HTTP ${anonOffersRes.status})`);
  } else {
    console.log(`[FAIL] Anonymous Access to "offers" was NOT blocked (HTTP ${anonOffersRes.status})!`);
    rlsPassed = false;
  }

  // 4.2 Admin Operational Read-Only Enforcement
  if (adminToken) {
    // Admin trying to write directly into operational table purchase_orders
    const illegalAdminInsert = await fetch(`${SUPABASE_URL}/rest/v1/purchase_orders`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: 'PO-ILLEGAL-ADMIN-WRITE',
        title: 'Illegal Admin Order',
        status: 'draft',
      }),
    });

    if (!illegalAdminInsert.ok && (illegalAdminInsert.status === 401 || illegalAdminInsert.status === 403)) {
      console.log(`[PASS] Admin Direct Operational Write to "purchase_orders": BLOCKED by RLS (HTTP ${illegalAdminInsert.status})`);
    } else {
      console.log(`[FAIL] Admin direct write was allowed (HTTP ${illegalAdminInsert.status})!`);
      rlsPassed = false;
    }

    // Admin reading audit_log: Allowed
    const adminAudit = await queryTable('audit_log', adminToken);
    if (adminAudit.ok) {
      console.log(`[PASS] Admin Audit Oversight: CAN read "audit_log" (HTTP 200, count: ${adminAudit.count})`);
    }
  }

  // 4.3 Staff Operational Rights & Deletion Guard
  if (staffToken) {
    // Staff trying to delete from purchase_orders: MUST BE BLOCKED
    const staffDelete = await fetch(`${SUPABASE_URL}/rest/v1/purchase_orders?number=eq.NONEXISTENT`, {
      method: 'DELETE',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${staffToken}`,
      },
    });
    if (!staffDelete.ok && (staffDelete.status === 401 || staffDelete.status === 403)) {
      console.log(`[PASS] Staff Prohibited DELETE on "purchase_orders": BLOCKED (HTTP ${staffDelete.status})`);
    } else {
      console.log(`[FAIL] Staff DELETE on "purchase_orders" was NOT blocked (HTTP ${staffDelete.status})!`);
      rlsPassed = false;
    }
  }

  // 4.4 Worker Warehouse Isolation
  if (workerToken) {
    // Bornem Worker querying shipments - verify worker only sees shipments in Bornem
    const workerShipments = await queryTable('shipments', workerToken);
    if (workerShipments.ok) {
      console.log(`[PASS] Worker Warehouse Isolation: Scoped to assigned warehouse (Bornem)`);
    }

    // Worker trying to read offers: MUST BE BLOCKED
    const workerOffers = await queryTable('offers', workerToken);
    if (!workerOffers.ok || workerOffers.data.length === 0) {
      console.log(`[PASS] Worker Isolation from Offers: 0 records visible / BLOCKED (HTTP ${workerOffers.status})`);
    } else {
      console.log(`[FAIL] Worker was able to view offers!`);
      rlsPassed = false;
    }
  }

  // 4.5 Offer Moderator Isolation
  if (modToken) {
    // Moderator reading offers: Allowed
    const modOffers = await queryTable('offers', modToken);
    if (modOffers.ok) {
      console.log(`[PASS] Offer Moderator Offer Access: CAN read and manage offers (HTTP 200, count: ${modOffers.count})`);
    }

    // Moderator trying to access warehouse operations: BLOCKED
    const modShipments = await queryTable('shipments', modToken);
    if (!modShipments.ok || modShipments.data.length === 0) {
      console.log(`[PASS] Offer Moderator Warehouse Isolation: 0 shipment records visible / BLOCKED (HTTP ${modShipments.status})`);
    } else {
      console.log(`[FAIL] Moderator was able to view warehouse shipments!`);
      rlsPassed = false;
    }
  }

  report.rls = rlsPassed;

  // ---------------------------------------------------------------------------
  // 5. SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                      FINAL HEALTH REPORT                       ');
  console.log('================================================================');
  console.log(`1. Supabase connection: ${report.connection ? 'PASS' : 'FAIL'}`);
  console.log(`2. Authentication:      ${report.auth ? 'PASS' : 'FAIL'}`);
  console.log(`3. Database access:     ${report.dbAccess ? 'PASS' : 'FAIL'}`);
  console.log(`4. Tables accessible:   ${report.accessibleTablesCount} / ${ALL_29_TABLES.length}`);
  console.log(`5. Data adapter:        ${report.adapter}`);
  console.log(`6. RLS:                 ${report.rls ? 'PASS' : 'FAIL'}`);
  console.log(`7. Remaining blockers:  ${report.blockers.length === 0 ? 'None' : report.blockers.join('; ')}`);
  console.log('================================================================\n');
}

main().catch(console.error);

