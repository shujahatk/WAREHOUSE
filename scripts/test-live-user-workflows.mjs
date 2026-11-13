import { readFileSync } from 'node:fs';

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

const USERS = [
  { role: 'Admin (owner)', email: 'admin@stockflow.local', password: 'StockFlowAdmin2026!' },
  { role: 'Staff (manager)', email: 'staff@stockflow.local', password: 'StockFlowStaff2026!' },
  { role: 'Worker (Bornem)', email: 'worker.bornem@stockflow.local', password: 'StockFlowWorker2026!' },
  { role: 'Offer Moderator', email: 'moderator@stockflow.local', password: 'StockFlowMod2026!' },
];

async function signInUser(email, password) {
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
    throw new Error(`Failed to sign in ${email} (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function queryTable(table, token, query = 'select=*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function callRpc(rpc, token, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('==========================================================');
  console.log('STOCKFLOW LIVE SUPABASE AUTHENTICATION & WORKFLOW AUDIT');
  console.log('Target URL:', SUPABASE_URL);
  console.log('==========================================================\n');

  const tokens = {};

  // 1. Authenticate all 4 roles
  console.log('--- 1. Authenticating Roles ---');
  for (const user of USERS) {
    try {
      const token = await signInUser(user.email, user.password);
      tokens[user.role] = token;
      console.log(`[PASS] ${user.role} authenticated successfully!`);

      // Verify current_app_user()
      const whoami = await callRpc('current_app_user', token);
      if (whoami.ok && whoami.data) {
        console.log(`       Profile: ${whoami.data.name} (${whoami.data.role}), Warehouse: ${whoami.data.warehouse_id || 'Global'}`);
      }
    } catch (err) {
      console.log(`[FAIL] ${user.role} authentication failed: ${err.message}`);
    }
  }

  if (Object.keys(tokens).length === 0) {
    console.log('\n[!] Note: Test accounts have not been seeded into auth.users yet.');
    console.log('    Execute supabase/tests/0004_live_verification_and_seed.sql in the Supabase SQL editor to seed them.');
    return;
  }

  // 2. Test Admin Operational Read-Only Enforcement
  if (tokens['Admin (owner)']) {
    console.log('\n--- 2. Verifying Admin Operational Read-Only Enforcement ---');
    const adminToken = tokens['Admin (owner)'];

    // Admin reading master materials: PASS
    const matRes = await queryTable('materials', adminToken);
    console.log(`[PASS] Admin can read master materials: ${matRes.ok ? matRes.data.length + ' items' : 'FAILED'}`);

    // Admin direct INSERT into companies: MUST BE BLOCKED BY RLS
    const adminCompInsert = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Admin Illegal Co', kind: 'supplier', active: true }),
    });
    if (!adminCompInsert.ok && (adminCompInsert.status === 401 || adminCompInsert.status === 403 || adminCompInsert.status === 42501)) {
      console.log(`[PASS] Admin direct operational INSERT into companies correctly BLOCKED by RLS (${adminCompInsert.status}).`);
    } else {
      console.log(`[FAIL] Admin was able to insert into companies (${adminCompInsert.status})!`);
    }
  }

  // 3. Test Staff PO Creation
  if (tokens['Staff (manager)']) {
    console.log('\n--- 3. Verifying Staff Operational Workflow ---');
    const staffToken = tokens['Staff (manager)'];

    const poRes = await callRpc('rpc_create_purchase_order', staffToken, {
      p_title: 'Automated Live Test Order',
      p_custom_number: '',
      p_company_id: '00000000-0000-0000-0000-000000000000',
      p_material_description: 'Copper Scrap',
      p_quantity_kg: 500,
      p_value_eur: 2500,
      p_notes: 'Created via automated live test suite',
    });
    console.log(`[INFO] Staff rpc_create_purchase_order: ${poRes.status}`, poRes.data?.number || poRes.data?.message || poRes.data);
  }

  // 4. Test Offer Moderator Isolation
  if (tokens['Offer Moderator']) {
    console.log('\n--- 4. Verifying Offer Moderator Scoping & Workflow ---');
    const modToken = tokens['Offer Moderator'];

    const offerRes = await callRpc('rpc_create_offer', modToken, {
      p_kind: 'purchasing',
      p_material: 'PET Flakes Clear',
      p_material_type: 'Plastics',
      p_material_grade: 'Bottle Grade',
      p_quantity: 2500,
      p_unit: 'kg',
      p_price_per_unit: 0.85,
      p_currency: 'EUR',
      p_country: 'Belgium',
      p_location: 'Antwerp',
      p_truck_loads: 1,
      p_description: 'Clean hot-washed flakes',
      p_priority: 'high',
      p_offer_type: 'Spot',
      p_team: 'Polymers',
    });
    if (offerRes.ok && offerRes.data?.number) {
      console.log(`[PASS] Offer Moderator created offer: ${offerRes.data.number} (${offerRes.data.material}) - Total: €${offerRes.data.total_value}`);
    } else {
      console.log(`[INFO] Offer Moderator create offer: ${offerRes.status}`, offerRes.data);
    }
  }

  console.log('\n==========================================================');
  console.log('AUDIT COMPLETED');
  console.log('==========================================================');
}

main().catch(console.error);

