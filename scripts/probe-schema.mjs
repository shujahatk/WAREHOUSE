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

const TABLES = [
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
  'documents',
  'request_photos',
  'worker_general_request_attachments',
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

const RPCS = [
  'current_app_user',
  'current_user_id',
  'current_user_role',
  'current_user_warehouse_id',
  'current_user_warehouse_name',
  'is_document_bound_to_worker_warehouse',
  'rpc_admin_decide_order',
  'rpc_decide_request',
  'rpc_upload_annex7',
  'rpc_decide_annex7',
  'rpc_register_shipment',
  'rpc_save_shipment_meta',
  'rpc_save_carrier',
  'rpc_advance_shipment',
  'rpc_save_customs',
  'rpc_confirm_customs',
  'rpc_confirm_seller',
  'rpc_save_cmr',
  'rpc_worker_save_material_line',
  'rpc_worker_delete_material_line',
  'rpc_submit_request_with_photos',
  'rpc_worker_soft_delete_request',
  'rpc_worker_complete_request',
  'rpc_worker_create_general_request',
  'rpc_decide_general_request',
  'rpc_worker_delete_document',
  'rpc_create_offer',
  'rpc_update_offer',
  'rpc_delete_offer',
  'rpc_submit_offer_for_review',
  'rpc_decide_offer',
  'rpc_update_offer_status',
  'rpc_toggle_offer_favourite',
  'rpc_add_offer_comment',
  'rpc_create_purchase_order',
];

async function probe() {
  console.log('=== PROBING 29 TABLES VIA POSTGREST ===');
  let tablePass = 0;
  for (const table of TABLES) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      method: 'GET',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    });

    const body = await res.json().catch(() => null);
    // 200 = accessible, 401 = exists but requires authenticated role (PostgreSQL 42501 permission denied), 404 = does not exist
    if (res.status === 200) {
      console.log(`[PASS] Table '${table}' exists (Public Readable). Rows: ${Array.isArray(body) ? body.length : 'N/A'}`);
      tablePass++;
    } else if (res.status === 401 && body && body.code === '42501') {
      console.log(`[PASS] Table '${table}' exists (Authenticated/RLS Protected). Hint: ${body.message}`);
      tablePass++;
    } else if (res.status === 404) {
      console.log(`[FAIL] Table '${table}' NOT FOUND (404).`);
    } else {
      console.log(`[?] Table '${table}' returned ${res.status}:`, body);
    }
  }

  console.log(`\nTables verified: ${tablePass}/${TABLES.length}`);

  console.log('\n=== PROBING RPC FUNCTIONS VIA POSTGREST ===');
  let rpcPass = 0;
  for (const rpc of RPCS) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const body = await res.json().catch(() => null);
    // If function does not exist: PGRST202 or 404
    // If function exists: 401 (permission denied for function), or 400 (parameter mismatch), or 200
    if (res.status === 404 && body && body.code === 'PGRST202' && body.message && body.message.includes('Could not find the function')) {
      // Check if it's because of missing parameters (meaning function exists, just needs params)
      if (body.details && body.details.includes('Searched for the function') && !body.details.includes('no matches were found')) {
        console.log(`[PASS] RPC '${rpc}' exists (Requires arguments).`);
        rpcPass++;
      } else {
        // Let's test with dummy params or check message
        console.log(`[CHECK] RPC '${rpc}': 404 PGRST202: ${body.details || body.message}`);
      }
    } else if (res.status === 401 && body && body.code === '42501') {
      console.log(`[PASS] RPC '${rpc}' exists (Authenticated-only execution).`);
      rpcPass++;
    } else if (res.status === 400) {
      console.log(`[PASS] RPC '${rpc}' exists (Parameter check triggered). Message: ${body?.message}`);
      rpcPass++;
    } else if (res.status === 200) {
      console.log(`[PASS] RPC '${rpc}' executed successfully.`);
      rpcPass++;
    } else {
      console.log(`[?] RPC '${rpc}' returned ${res.status}:`, body);
    }
  }

  console.log(`\nRPCs verified: ${rpcPass}/${RPCS.length}`);
}

probe().catch(console.error);

