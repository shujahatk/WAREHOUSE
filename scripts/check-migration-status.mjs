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

async function check() {
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@stockflow.local',
      password: 'StockFlowAdmin2026!',
    }),
  });
  if (!authRes.ok) {
    console.error('Failed to authenticate admin:', authRes.status);
    return;
  }
  const { access_token } = await authRes.json();

  const tables = ['notifications', 'notification_preferences', 'audit_log'];
  for (const t of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${access_token}` },
    });
    console.log(`Table ${t}: HTTP ${res.status}`);
    if (res.ok) {
      const rows = await res.json();
      console.log(`  Rows sample:`, rows);
    } else {
      const err = await res.text();
      console.log(`  Error:`, err);
    }
  }

  const rpcs = [
    'rpc_query_audit_trail',
    'rpc_mark_notification_read',
    'rpc_mark_all_notifications_read',
    'rpc_create_notification',
    'rpc_save_notification_preferences',
    'rpc_get_notification_preferences',
  ];
  for (const rpc of rpcs) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    console.log(`RPC ${rpc}: HTTP ${res.status}`);
  }
}

check().catch(console.error);

