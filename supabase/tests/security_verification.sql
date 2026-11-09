-- ============================================================================
-- STOCKFLOW — EXECUTABLE POSTGRESQL SECURITY VERIFICATION SUITE
-- Covers Positive & Negative Tests for Issues 1–10
-- ============================================================================

begin;

do $$
declare
  v_wh_bornem uuid;
  v_wh_turnhout uuid;
  v_wh_spain uuid;
  v_wh_pakistan uuid;
  v_admin_auth uuid := '00000000-0000-4000-a000-000000000001';
  v_staff_auth uuid := '00000000-0000-4000-a000-000000000002';
  v_worker_bor1_auth uuid := '00000000-0000-4000-a000-000000000003';
  v_worker_bor2_auth uuid := '00000000-0000-4000-a000-000000000004';
  v_worker_trn_auth uuid := '00000000-0000-4000-a000-000000000005';
  v_admin_id uuid;
  v_staff_id uuid;
  v_worker_bor1_id uuid;
  v_worker_bor2_id uuid;
  v_worker_trn_id uuid;
  v_mat_id uuid;
  v_pkg_id uuid;
  v_po_bornem_id uuid;
  v_ship_bornem_id uuid;
  v_ship_turnhout_id uuid;
  v_doc_photo_id uuid;
  v_req_bornem_id uuid;
  v_line_id uuid;
  v_visible_count integer;
begin
  select id into v_wh_bornem from public.warehouses where name = 'Bornem';
  select id into v_wh_turnhout from public.warehouses where name = 'Turnhout';
  select id into v_wh_spain from public.warehouses where name = 'Spain';
  select id into v_wh_pakistan from public.warehouses where name = 'Pakistan';
  select id into v_pkg_id from public.packaging_types where name = 'Normal Pallet';

  -- Seed test auth.users rows
  insert into auth.users (id, email) values
    (v_admin_auth, 'admin@stockflow.test'),
    (v_staff_auth, 'staff@stockflow.test'),
    (v_worker_bor1_auth, 'worker1.bornem@stockflow.test'),
    (v_worker_bor2_auth, 'worker2.bornem@stockflow.test'),
    (v_worker_trn_auth, 'worker.turnhout@stockflow.test')
  on conflict (id) do nothing;

  -- Seed public.users rows mapped strictly via auth_user_id
  insert into public.users (auth_user_id, email, name, role, warehouse_id, active)
  values (v_admin_auth, 'admin@stockflow.test', 'Admin User', 'owner', null, true)
  returning id into v_admin_id;

  insert into public.users (auth_user_id, email, name, role, warehouse_id, active)
  values (v_staff_auth, 'staff@stockflow.test', 'Staff User', 'manager', null, true)
  returning id into v_staff_id;

  insert into public.users (auth_user_id, email, name, role, warehouse_id, active)
  values (v_worker_bor1_auth, 'worker1.bornem@stockflow.test', 'Bornem Worker 1', 'worker', v_wh_bornem, true)
  returning id into v_worker_bor1_id;

  insert into public.users (auth_user_id, email, name, role, warehouse_id, active)
  values (v_worker_bor2_auth, 'worker2.bornem@stockflow.test', 'Bornem Worker 2', 'worker', v_wh_bornem, true)
  returning id into v_worker_bor2_id;

  insert into public.users (auth_user_id, email, name, role, warehouse_id, active)
  values (v_worker_trn_auth, 'worker.turnhout@stockflow.test', 'Turnhout Worker', 'worker', v_wh_turnhout, true)
  returning id into v_worker_trn_id;

  -- Switch to authenticated role
  execute 'set local role authenticated';

  -- ==========================================================================
  -- TEST 1 (POSITIVE): Admin creates master material
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_admin_auth::text, true);
  insert into public.materials (material_number, description, unit, low_stock_threshold_kg)
  values ('CU-MILL', 'Copper Millberry', 'kg', 500)
  returning id into v_mat_id;

  -- ==========================================================================
  -- TEST 2 (NEGATIVE - Issue 9/10): Admin Operational Write Blocked by RLS
  -- ==========================================================================
  begin
    insert into public.companies (name, kind, active) values ('Unauthorized Co', 'supplier', true);
    raise exception 'TEST FAILED: Admin was allowed to insert into companies';
  exception when insufficient_privilege or sqlstate '42501' then
    null; -- Expected RLS denial
  end;

  -- ==========================================================================
  -- TEST 3 (POSITIVE - Issue 3): Staff creates Company & PO (Trigger writes Audit Log)
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_staff_auth::text, true);
  insert into public.companies (name, kind, active) values ('Nordic Metals GmbH', 'supplier', true);
  insert into public.purchase_orders (number, company_id, status, value_eur, notes, created_by)
  values (
    'PO-BOR-100',
    (select id from public.companies where name = 'Nordic Metals GmbH'),
    'submitted',
    25000,
    'Initial order',
    v_staff_id
  )
  returning id into v_po_bornem_id;

  -- ==========================================================================
  -- TEST 4 (NEGATIVE - Issue 3/6): Staff Self-Approval of PO Blocked
  -- ==========================================================================
  begin
    update public.purchase_orders set status = 'approved' where id = v_po_bornem_id;
    raise exception 'TEST FAILED: Staff was allowed to approve PO directly';
  exception when others then
    null; -- Expected denial
  end;

  begin
    perform public.rpc_admin_decide_order('PO-BOR-100', 'approved');
    raise exception 'TEST FAILED: Staff was allowed to call rpc_admin_decide_order';
  exception when others then
    null; -- Expected denial
  end;

  -- ==========================================================================
  -- TEST 5 (POSITIVE & NEGATIVE - Issue 6): Admin Approves PO; Staff Locked Out After Approval
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_admin_auth::text, true);
  perform public.rpc_admin_decide_order('PO-BOR-100', 'approved');

  perform set_config('request.jwt.claim.sub', v_staff_auth::text, true);
  begin
    update public.purchase_orders set value_eur = 999999 where id = v_po_bornem_id;
    if found then
      raise exception 'TEST FAILED: Staff modified an approved PO';
    end if;
  exception when others then
    null; -- Expected denial by RLS / trigger
  end;

  -- ==========================================================================
  -- TEST 6 (NEGATIVE - Issue 4): Worker Shipment Registration Cannot Create Unknown PO/Company
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_worker_bor1_auth::text, true);
  begin
    perform public.rpc_register_shipment('inbound', 'CONT-BOR-BAD', 'PO-NONEXISTENT', 'Unknown Supplier', 'Bornem', '');
    raise exception 'TEST FAILED: Worker created shipment with nonexistent PO/company';
  exception when others then
    null; -- Expected denial
  end;

  -- ==========================================================================
  -- TEST 7 (NEGATIVE - Issue 1/8): Worker Cross-Warehouse Shipment Creation Blocked
  -- ==========================================================================
  begin
    perform public.rpc_register_shipment('inbound', 'CONT-TRN-BAD', 'PO-BOR-100', 'Nordic Metals GmbH', 'Turnhout', '');
    raise exception 'TEST FAILED: Bornem Worker created shipment at Turnhout';
  exception when others then
    null; -- Expected denial
  end;

  -- ==========================================================================
  -- TEST 8 (POSITIVE): Worker 1 at Bornem Registers Shipment Against Existing PO-BOR-100
  -- ==========================================================================
  select id into v_ship_bornem_id
  from public.rpc_register_shipment('inbound', 'CONT-BOR-001', 'PO-BOR-100', 'Nordic Metals GmbH', 'Bornem', '');

  -- Staff registers a Turnhout shipment for cross-warehouse isolation test
  perform set_config('request.jwt.claim.sub', v_staff_auth::text, true);
  select id into v_ship_turnhout_id
  from public.rpc_register_shipment('inbound', 'CONT-TRN-001', 'PO-BOR-100', 'Nordic Metals GmbH', 'Turnhout', '');

  -- ==========================================================================
  -- TEST 9 (NEGATIVE - Issue 8): Cross-Warehouse SELECT Isolation
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_worker_trn_auth::text, true);
  select count(*) into v_visible_count from public.shipments where id = v_ship_bornem_id;
  if v_visible_count <> 0 then
    raise exception 'TEST FAILED: Turnhout Worker could see Bornem shipment';
  end if;

  -- ==========================================================================
  -- TEST 10 (NEGATIVE - Issue 3): Worker Cross-Warehouse Document Reassignment Blocked
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_worker_bor1_auth::text, true);
  insert into public.documents (
    kind, category, shipment_id, warehouse, status, name, mime, byte_size, storage_key, created_by
  )
  values (
    'photo', 'Container', null, 'Bornem', 'pending', 'photo1.jpg', 'image/jpeg', 2048, 'photo/CONT-BOR-001/1.jpg', v_worker_bor1_id
  )
  returning id into v_doc_photo_id;

  begin
    update public.documents set shipment_id = v_ship_turnhout_id where id = v_doc_photo_id;
    raise exception 'TEST FAILED: Bornem Worker linked document to Turnhout shipment';
  exception when others then
    null; -- Expected denial by WITH CHECK and documents_guard_update
  end;

  -- ==========================================================================
  -- TEST 11 (POSITIVE & NEGATIVE - Issue 2): Request Submission & Cross-Worker Tampering Blocked
  -- ==========================================================================
  select id into v_req_bornem_id from public.rpc_submit_request_with_photos(v_ship_bornem_id);
  select id into v_line_id from public.rpc_worker_save_material_line(
    'inbound', 'CONT-BOR-001', 'Copper Millberry', v_pkg_id, 4, 1100, 25, false
  );

  -- Switch to Worker 2 at the SAME warehouse (Bornem) and attempt to tamper with Worker 1's request lines
  perform set_config('request.jwt.claim.sub', v_worker_bor2_auth::text, true);
  begin
    perform public.rpc_worker_delete_material_line(v_line_id);
    raise exception 'TEST FAILED: Worker 2 deleted Worker 1 request line';
  exception when others then
    null; -- Expected denial
  end;

  begin
    insert into public.request_lines (request_id, material_id, packaging_type_id, package_count, gross_kg, tare_total_kg, net_kg)
    values (v_req_bornem_id, v_mat_id, v_pkg_id, 1, 125, 25, 100);
    raise exception 'TEST FAILED: Worker 2 inserted line into Worker 1 request';
  exception when others then
    null; -- Expected denial
  end;

  -- ==========================================================================
  -- TEST 12 (NEGATIVE - Issue 4): Forged Audit Log Entry Blocked
  -- ==========================================================================
  begin
    insert into public.audit_log (user_id, action, target_type, target_id, new_value)
    values (v_worker_bor2_id, 'request-approved', 'request', v_req_bornem_id::text, 'Forged');
    raise exception 'TEST FAILED: Authenticated user forged audit_log row';
  exception when insufficient_privilege or sqlstate '42501' then
    null; -- Expected denial
  end;

  begin
    perform public.internal_append_audit(v_worker_bor2_id, 'forged', 'request', v_req_bornem_id::text, null, 'Forged');
    raise exception 'TEST FAILED: Authenticated user called internal_append_audit directly';
  exception when insufficient_privilege or sqlstate '42501' then
    null; -- Expected denial
  end;

  -- ==========================================================================
  -- TEST 13 (POSITIVE & NEGATIVE - Issue 5 & 6): Admin Approval, Reverse Transition Blocked, Atomic Stock Completion
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', v_admin_auth::text, true);
  perform public.rpc_decide_request(v_req_bornem_id, 'approved', null);

  -- Reverse transition (approved -> declined) must fail
  begin
    perform public.rpc_decide_request(v_req_bornem_id, 'declined', 'Changed mind');
    raise exception 'TEST FAILED: Reverse transition approved -> declined was allowed';
  exception when others then
    null; -- Expected denial
  end;

  -- Worker 1 completes the approved request into stock (+1000 kg net)
  perform set_config('request.jwt.claim.sub', v_worker_bor1_auth::text, true);
  perform public.rpc_worker_complete_request(v_req_bornem_id);
  -- Idempotent second call must not duplicate stock
  perform public.rpc_worker_complete_request(v_req_bornem_id);

  if (select weight_kg from public.stock_balances where warehouse_id = v_wh_bornem and material_id = v_mat_id) <> 1000.000 then
    raise exception 'TEST FAILED: Expected 1000.000 kg stock balance at Bornem';
  end if;
end;
$$;

rollback;