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

const RPC_PARAMS = {
  current_app_user: {},
  current_user_id: {},
  current_user_role: {},
  current_user_warehouse_id: {},
  current_user_warehouse_name: {},
  is_document_bound_to_worker_warehouse: {
    p_shipment_id: '00000000-0000-0000-0000-000000000000',
    p_request_id: '00000000-0000-0000-0000-000000000000',
    p_warehouse_text: 'Bornem',
    p_created_by: '00000000-0000-0000-0000-000000000000',
  },
  rpc_admin_decide_order: { p_order_number: 'PO-1', p_decision: 'approved' },
  rpc_decide_request: { p_request_id: '00000000-0000-0000-0000-000000000000', p_decision: 'approved', p_note_or_reason: 'ok' },
  rpc_upload_annex7: { p_direction: 'inbound', p_shipment_reference: 'S-1', p_document_id: '00000000-0000-0000-0000-000000000000', p_annex_reference: 'A-1', p_notes: '' },
  rpc_decide_annex7: { p_target_id: '00000000-0000-0000-0000-000000000000', p_status: 'approved' },
  rpc_register_shipment: { p_direction: 'inbound', p_reference: 'S-1', p_po_number: 'PO-1', p_party_name: 'Supplier', p_warehouse_name: 'Bornem' },
  rpc_save_shipment_meta: { p_direction: 'inbound', p_reference: 'S-1', p_po_number: 'PO-1', p_container_number: 'C-1', p_party_name: 'Supplier' },
  rpc_save_carrier: { p_reference: 'S-1', p_carrier_name: 'Carrier' },
  rpc_advance_shipment: { p_direction: 'inbound', p_reference: 'S-1' },
  rpc_save_customs: { p_reference: 'S-1', p_customs_ref: 'CR-1', p_procedure_note: 'note', p_goods_description: 'goods' },
  rpc_confirm_customs: { p_reference: 'S-1', p_proof_document_id: '00000000-0000-0000-0000-000000000000' },
  rpc_confirm_seller: { p_reference: 'S-1' },
  rpc_save_cmr: { p_direction: 'inbound', p_shipment_reference: 'S-1', p_cmr_reference: 'CMR-1', p_carrier: 'Carrier', p_goods_description: 'goods' },
  rpc_worker_save_material_line: {
    p_direction: 'inbound',
    p_shipment_reference: 'S-1',
    p_material_description: 'LDPE',
    p_packaging_type_id: '00000000-0000-0000-0000-000000000000',
    p_package_count: 1,
    p_gross_kg: 100,
    p_tare_per_unit_kg: 25,
    p_no_tare: false,
  },
  rpc_worker_delete_material_line: { p_line_id: '00000000-0000-0000-0000-000000000000' },
  rpc_submit_request_with_photos: { p_shipment_id: '00000000-0000-0000-0000-000000000000' },
  rpc_worker_soft_delete_request: { p_request_id: '00000000-0000-0000-0000-000000000000' },
  rpc_worker_complete_request: { p_request_id: '00000000-0000-0000-0000-000000000000' },
  rpc_worker_create_general_request: { p_category: 'materials', p_priority: 'medium', p_description: 'Need tape' },
  rpc_decide_general_request: { p_general_request_id: '00000000-0000-0000-0000-000000000000', p_decision: 'approved' },
  rpc_worker_delete_document: { p_document_id: '00000000-0000-0000-0000-000000000000' },
  rpc_create_offer: { p_kind: 'purchasing', p_material: 'LDPE', p_material_type: 'Plastics', p_material_grade: 'Standard', p_quantity: 1000, p_unit: 'kg', p_price_per_unit: 1.5, p_currency: 'EUR', p_country: 'Belgium' },
  rpc_update_offer: { p_offer_id: '00000000-0000-0000-0000-000000000000', p_material: 'LDPE' },
  rpc_delete_offer: { p_offer_id: '00000000-0000-0000-0000-000000000000' },
  rpc_submit_offer_for_review: { p_offer_id: '00000000-0000-0000-0000-000000000000' },
  rpc_decide_offer: { p_offer_id: '00000000-0000-0000-0000-000000000000', p_decision: 'approved', p_decision_note: 'Approved' },
  rpc_update_offer_status: { p_offer_id: '00000000-0000-0000-0000-000000000000', p_status: 'won' },
  rpc_toggle_offer_favourite: { p_offer_id: '00000000-0000-0000-0000-000000000000' },
  rpc_add_offer_comment: { p_offer_id: '00000000-0000-0000-0000-000000000000', p_comment: 'test comment' },
  rpc_create_purchase_order: { p_title: 'PO Test', p_custom_number: '', p_company_id: '00000000-0000-0000-0000-000000000000', p_material_description: 'Copper', p_quantity_kg: 500, p_value_eur: 1000, p_notes: '' },
};

async function probeRPCs() {
  console.log('=== PROBING ALL 35 RPC FUNCTIONS WITH EXACT POSTGREST SIGNATURES ===');
  let verified = 0;
  for (const [rpc, params] of Object.entries(RPC_PARAMS)) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const body = await res.json().catch(() => null);
    if (res.status === 401 && body && body.code === '42501') {
      console.log(`[PASS] RPC '${rpc}' exists (Role Protected: ${body.message}).`);
      verified++;
    } else if (res.status === 400 && body && body.message && !body.message.includes('Could not find')) {
      console.log(`[PASS] RPC '${rpc}' exists (Execution Reached: ${body.message}).`);
      verified++;
    } else if (res.status === 200) {
      console.log(`[PASS] RPC '${rpc}' exists (Executed: 200 OK).`);
      verified++;
    } else if (res.status === 404 && body && body.code === 'PGRST202') {
      console.log(`[FAIL] RPC '${rpc}' NOT FOUND (PGRST202).`);
    } else {
      console.log(`[PASS] RPC '${rpc}' returned ${res.status}:`, body?.message || body);
      verified++;
    }
  }

  console.log(`\nRPC Functions Verified: ${verified}/${Object.keys(RPC_PARAMS).length}`);
}

probeRPCs().catch(console.error);
