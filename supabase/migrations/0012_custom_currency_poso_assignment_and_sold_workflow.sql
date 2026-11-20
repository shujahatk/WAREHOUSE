-- ============================================================================
-- StockFlow Migration 0012: Custom Currency, PO/SO Assignment Fix & Sold Workflow
--
-- 1. Grants UPDATE on public.worker_general_requests to authenticated
-- 2. Defines RLS update policy on worker_general_requests for Staff and Admin
-- 3. Implements atomic rpc_assign_poso_to_general_request (Admin & Staff authorized)
-- 4. Extends purchase_orders with currency column (ISO 4217, default EUR)
-- 5. Updates rpc_submit_selling_offer to accept and persist custom currency
-- 6. Updates rpc_decide_selling_offer to manage approval, Sold ledger, and audit
--    without closing or modifying linked Purchasing Offers
-- ============================================================================

-- 1. Fix Table Grants & Permissions for worker_general_requests
grant select, update on public.worker_general_requests to authenticated;
grant select, insert, update on public.worker_general_request_attachments to authenticated;

-- 2. RLS Update Policy on worker_general_requests
drop policy if exists worker_general_requests_update on public.worker_general_requests;
create policy worker_general_requests_update on public.worker_general_requests
  for update to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or ((select public.current_user_role()) = 'worker' and created_by = (select public.current_user_id()) and status in ('submitted', 'sent_back'))
  )
  with check (
    (select public.current_user_role()) in ('owner', 'manager')
    or ((select public.current_user_role()) = 'worker' and created_by = (select public.current_user_id()) and status in ('submitted', 'sent_back'))
  );

-- 3. Atomic RPC: rpc_assign_poso_to_general_request (Staff & Admin)
create or replace function public.rpc_assign_poso_to_general_request(
  p_request_id uuid,
  p_poso_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_req public.worker_general_requests;
  v_po public.purchase_orders;
  v_trimmed text;
  v_is_po boolean;
  v_is_so boolean;
  v_desc text;
  v_new_desc text;
  v_matched_po_id uuid := null;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role not in ('owner', 'manager') then
    raise exception 'Unauthorized: Only Staff or Admin can assign PO/SO numbers to requests.';
  end if;

  v_trimmed := upper(trim(coalesce(p_poso_number, '')));
  if length(v_trimmed) = 0 then
    raise exception 'A PO or SO reference number is required.';
  end if;

  v_is_po := v_trimmed like 'PO-%';
  v_is_so := v_trimmed like 'SO-%';

  if not v_is_po and not v_is_so then
    raise exception 'Only PO (Purchase Order) and SO (Sales Order) references are permitted (e.g. PO-2026-0001 or SO-2026-0001).';
  end if;

  select * into v_req
  from public.worker_general_requests
  where id = p_request_id
  for update;

  if v_req.id is null then
    raise exception 'Request not found.';
  end if;

  if v_req.status <> 'approved' then
    raise exception 'PO/SO references can only be assigned after Admin has approved the request.';
  end if;

  -- Validate operation type against prefix
  if position('"requestType":"loading"' in v_req.description) > 0 and not v_is_so then
    raise exception 'Loading (dispatch) operations require an SO (Sales Order) reference.';
  end if;
  if position('"requestType":"unloading"' in v_req.description) > 0 and not v_is_po then
    raise exception 'Unloading (receipt) operations require a PO (Purchase Order) reference.';
  end if;

  -- If PO, check if linked purchase order exists in database
  if v_is_po then
    select * into v_po
    from public.purchase_orders
    where upper(trim(number)) = v_trimmed
    limit 1;

    if v_po.id is not null then
      v_matched_po_id := v_po.id;
    end if;
  end if;

  -- Update serialized description with assigned reference metadata
  v_desc := v_req.description;
  -- Append or replace assigned reference note in description text
  if position('Assigned Reference: ' in v_desc) > 0 then
    v_new_desc := regexp_replace(v_desc, 'Assigned Reference: [^\n]+', 'Assigned Reference: ' || v_trimmed);
  else
    v_new_desc := v_desc || E'\n' || 'Assigned Reference: ' || v_trimmed || ' by ' || v_caller.name;
  end if;

  update public.worker_general_requests
  set
    description = v_new_desc,
    purchase_order_id = coalesce(v_matched_po_id, purchase_order_id),
    updated_at = now()
  where id = v_req.id;

  -- Append audit log entry
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_caller.id,
      'request-poso-assigned',
      'worker-request',
      v_req.id::text,
      v_req.number,
      'Reference ' || v_trimmed || ' was assigned to ' || v_req.number || ' by ' || v_caller.name || '. Stock remains unchanged until operation completion.'
    );
  exception when others then
    null;
  end;

  -- Notify the worker who created the request
  if v_req.created_by is not null then
    begin
      perform public.rpc_create_notification(
        v_req.created_by,
        'worker_request_poso_assigned',
        'Reference Assigned: ' || v_trimmed,
        'Staff has assigned ' || v_trimmed || ' to your request ' || v_req.number || '. Ready for operational execution.',
        'worker_general_request',
        v_req.id::text
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'requestId', v_req.id,
    'requestNumber', v_req.number,
    'assignedPoSoNumber', v_trimmed,
    'assignedBy', v_caller.name,
    'assignedAt', now()
  );
end;
$$;

revoke all on function public.rpc_assign_poso_to_general_request(uuid, text) from public, anon;
grant execute on function public.rpc_assign_poso_to_general_request(uuid, text) to authenticated, service_role;

-- 4. Extend purchase_orders with currency column
alter table public.purchase_orders
  add column if not exists currency text not null default 'EUR';

create index if not exists idx_purchase_orders_currency on public.purchase_orders(currency);

-- 5. Update rpc_submit_selling_offer with custom currency support
create or replace function public.rpc_submit_selling_offer(
  p_po_number text,
  p_material_type text,
  p_material_name text,
  p_client_name text,
  p_contact_number text,
  p_email_address text,
  p_price numeric,
  p_origin text,
  p_destination text,
  p_purchasing_offer_id uuid default null,
  p_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_order public.purchase_orders;
  v_offer_id uuid;
  v_offer_num text;
  v_year int;
  v_seq int;
  v_admin_id uuid;
  v_matched_purchasing_id uuid := p_purchasing_offer_id;
  v_currency text := upper(trim(coalesce(p_currency, 'EUR')));
begin
  v_caller := public.current_app_user();
  if v_caller is null or v_caller.role not in ('owner', 'moderator', 'offers_user') then
    raise exception 'Unauthorized: Only Offers Users, Moderators or Admins can submit selling offers.';
  end if;

  -- 9-Field Strict Validation
  if length(trim(p_po_number)) = 0 then raise exception 'PO Number is required.'; end if;
  if length(trim(p_material_type)) = 0 then raise exception 'Material Type is required.'; end if;
  if length(trim(p_material_name)) = 0 then raise exception 'Material Name is required.'; end if;
  if length(trim(p_client_name)) = 0 then raise exception 'Client Name is required.'; end if;
  if length(trim(p_contact_number)) = 0 then raise exception 'Contact Number is required.'; end if;
  if length(trim(p_email_address)) = 0 or position('@' in p_email_address) = 0 then
    raise exception 'A valid Email Address is required.';
  end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero.'; end if;
  if length(trim(p_origin)) = 0 then raise exception 'Origin is required.'; end if;
  if length(trim(p_destination)) = 0 then raise exception 'Destination is required.'; end if;
  if length(v_currency) = 0 then v_currency := 'EUR'; end if;

  -- Look up order by number if present
  select * into v_order from public.purchase_orders where number = p_po_number limit 1;

  -- Automatically associate purchasing offer ID if not explicitly passed
  if v_matched_purchasing_id is null then
    select id into v_matched_purchasing_id
    from public.offers
    where (po_number = p_po_number or number = p_po_number)
      and kind = 'purchasing'
    order by created_at desc
    limit 1;
  end if;

  v_year := extract(year from now())::int;
  insert into public.offer_sequences (kind, year, next_val)
  values ('selling', v_year, 1)
  on conflict (kind, year) do update
  set next_val = offer_sequences.next_val + 1
  returning next_val into v_seq;

  v_offer_num := 'SOF-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
  v_offer_id := gen_random_uuid();

  insert into public.offers (
    id, number, kind, material, material_type, material_grade, quantity, unit,
    price_per_unit, currency, total_value, country, location, truck_loads, description,
    priority, offer_type, team, status, approval_status, created_by, created_at, updated_at,
    po_id, po_number, client_name, contact_number, email_address, origin, destination,
    purchasing_offer_id
  ) values (
    v_offer_id, v_offer_num, 'selling', p_material_name, p_material_type, 'Standard', 1, 'lot',
    p_price, v_currency, p_price, p_origin, p_origin, 1, 'Selling offer for ' || p_material_name || ' linked to ' || p_po_number,
    'medium', 'Spot', 'Trading', 'received', 'pending', v_caller.id, now(), now(),
    v_order.id, p_po_number, p_client_name, p_contact_number, p_email_address, p_origin, p_destination,
    v_matched_purchasing_id
  );

  -- Notify Admins of the new Selling Offer submission
  for v_admin_id in (select id from public.users where role = 'owner' and active = true) loop
    begin
      perform public.rpc_create_notification(
        v_admin_id,
        'offer_submission',
        'New Selling Offer: ' || v_offer_num,
        v_caller.name || ' submitted Selling Offer ' || v_offer_num || ' linked to ' || p_po_number || ' for ' || p_client_name || ' (' || v_currency || ' ' || p_price::text || ').',
        'offer',
        v_offer_id::text
      );
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'offerId', v_offer_id,
    'offerNumber', v_offer_num,
    'poNumber', p_po_number,
    'purchasingOfferId', v_matched_purchasing_id,
    'currency', v_currency,
    'price', p_price,
    'approvalStatus', 'pending'
  );
end;
$$;

revoke all on function public.rpc_submit_selling_offer(text, text, text, text, text, text, numeric, text, text, uuid, text) from public, anon;
grant execute on function public.rpc_submit_selling_offer(text, text, text, text, text, text, numeric, text, text, uuid, text) to authenticated, service_role;

-- 6. Update rpc_decide_selling_offer for atomic Admin Approval -> Sold Ledger
create or replace function public.rpc_decide_selling_offer(
  p_offer_number text,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
  v_clean_decision text;
begin
  v_caller := public.current_app_user();
  if v_caller is null or v_caller.role != 'owner' then
    raise exception 'Unauthorized: Only Admin can approve or reject selling offers.';
  end if;

  v_clean_decision := lower(trim(p_decision));
  if v_clean_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select * into v_offer
  from public.offers
  where number = p_offer_number and deleted_at is null
  for update;

  if v_offer is null then
    raise exception 'Offer not found: %', p_offer_number;
  end if;

  -- Prevent duplicate approvals
  if v_clean_decision = 'approved' and v_offer.approval_status = 'approved' then
    raise exception 'This offer has already been approved.';
  end if;

  -- Prevent approving rejected offers without reopening
  if v_clean_decision = 'approved' and v_offer.approval_status = 'rejected' then
    raise exception 'Rejected offers cannot be approved without an explicit reopening workflow.';
  end if;

  if v_clean_decision = 'rejected' and v_offer.approval_status = 'approved' then
    raise exception 'Approved offers cannot be rejected.';
  end if;

  if v_clean_decision = 'rejected' and (p_note is null or length(trim(p_note)) = 0) then
    raise exception 'A rejection reason is mandatory.';
  end if;

  -- Update Selling Offer:
  -- Approval marks as Sold (sold_at = now()) and keeps Purchasing Offer independent!
  update public.offers
  set
    approval_status = v_clean_decision,
    status = case when v_clean_decision = 'approved' then status else 'lost' end,
    sold_at = case when v_clean_decision = 'approved' then now() else null end,
    admin_decision_note = trim(p_note),
    decided_by = v_caller.id,
    decided_at = now(),
    updated_at = now()
  where id = v_offer.id;

  -- Append audit log entry
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_caller.id,
      case when v_clean_decision = 'approved' then 'offer-approved' else 'offer-rejected' end,
      'offer',
      v_offer.id::text,
      v_offer.approval_status,
      'Admin ' || v_caller.name || ' marked Selling Offer ' || v_offer.number || ' as ' || v_clean_decision || '.' || case when p_note is not null and length(trim(p_note)) > 0 then ' Note: ' || trim(p_note) else '' end
    );
  exception when others then
    null;
  end;

  -- Notification to submitting user
  if v_offer.created_by is not null then
    begin
      perform public.rpc_create_notification(
        v_offer.created_by,
        case when v_clean_decision = 'approved' then 'offer_sold' else 'offer_rejected' end,
        'Selling Offer ' || case when v_clean_decision = 'approved' then 'Approved (Sold)' else 'Rejected' end || ': ' || v_offer.number,
        'Admin has ' || v_clean_decision || ' your Selling Offer ' || v_offer.number || '.' || case when p_note is not null and length(trim(p_note)) > 0 then ' Note: ' || trim(p_note) else '' end,
        'offer',
        v_offer.id::text
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'offerNumber', v_offer.number,
    'approvalStatus', v_clean_decision,
    'sold', v_clean_decision = 'approved',
    'decidedAt', now()
  );
end;
$$;

revoke all on function public.rpc_decide_selling_offer(text, text, text) from public, anon;
grant execute on function public.rpc_decide_selling_offer(text, text, text) to authenticated, service_role;

-- 7. Reload PostgREST schema cache
notify pgrst, 'reload schema';
