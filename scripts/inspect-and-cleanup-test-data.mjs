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

async function signInAdmin() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@stockflow.local',
      password: 'StockFlowAdmin2026!',
    }),
  });
  if (!res.ok) throw new Error(`Admin sign in failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function inspectTable(table, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { table, status: res.status, rows: [] };
  const rows = await res.json();
  return { table, status: res.status, rows };
}

async function run() {
  console.log('================================================================');
  console.log('   STOCKFLOW — LIVE SUPABASE TEST DATA AUDIT & INVENTORY        ');
  console.log('================================================================');

  const token = await signInAdmin();

  const tables = [
    'companies',
    'purchase_orders',
    'purchase_order_lines',
    'shipments',
    'requests',
    'request_lines',
    'worker_general_requests',
    'worker_general_request_attachments',
    'documents',
    'request_photos',
    'stock_balances',
    'warehouse_transfers',
    'stock_movements',
    'offers',
    'offer_attachments',
    'offer_comments',
    'offer_activities',
    'audit_log',
  ];

  const report = {};
  for (const t of tables) {
    const res = await inspectTable(t, token);
    report[t] = res.rows;
    console.log(`  Table ${t.padEnd(35)} : ${res.rows.length} rows`);
    if (res.rows.length > 0 && res.rows.length <= 10) {
      for (const r of res.rows) {
        console.log(`    - ID: ${r.id || r.reference || r.number || 'unknown'}, Data:`, JSON.stringify(r).slice(0, 120));
      }
    }
  }

  return report;
}

run().catch(console.error);

