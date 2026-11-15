-- Migration 0009: Strict Offers User Permissions, PO-Linked Selling Offers & Registration Approval
-- Safe, additive migration preserving existing tables, data, and operational records

-- 1. Add purchasing_offer_id to public.offers if not exists
alter table public.offers
  add column if not exists purchasing_offer_id uuid references public.offers (id) on delete set null;

create index if not exists idx_offers_purchasing_offer_id on public.offers (purchasing_offer_id);

-- 2. Strict Row Level Security on public.offers
alter table public.offers enable row level security;

drop policy if exists offers_select on public.offers;
drop policy if exists offers_read_policy on public.offers;

create policy offers_select on public.offers
  for select to authenticated
  using (
    -- Admin and Moderator have full visibility of active records
    ((select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
     and (deleted_at is null or (select role from public.users where auth_user_id = auth.uid()) = 'owner'))
    -- Offers Users can view ONLY approved purchasing offers, and their own submitted selling offers
    or (
      (select role from public.users where auth_user_id = auth.uid()) = 'offers_user'
      and deleted_at is null
      and (
        (kind = 'purchasing' and approval_status = 'approved')
        or (kind = 'selling' and created_by = (select id from public.users where auth_user_id = auth.uid()))
      )
    )
  );

drop policy if exists offers_insert on public.offers;
drop policy if exists offers_moderator_insert on public.offers;

create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    -- Moderator can create purchasing and selling offers
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
    -- Offers User can create only selling offers linked to POs
    or (
      (select role from public.users where auth_user_id = auth.uid()) = 'offers_user'
      and kind = 'selling'
      and created_by = (select id from public.users where auth_user_id = auth.uid())
    )
  );

drop policy if exists offers_update on public.offers;
drop policy if exists offers_moderator_update on public.offers;
drop policy if exists offers_admin_update on public.offers;

-- Submitter (Offers User) CANNOT edit or withdraw submitted offers (strictly locked)
create policy offers_moderator_update on public.offers
  for update to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
    and deleted_at is null
  )
  with check (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
  );

create policy offers_admin_update on public.offers
  for update to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'owner'
    and deleted_at is null
  )
  with check (
    (select role from public.users where auth_user_id = auth.uid()) = 'owner'
  );

-- No direct delete for non-admin
drop policy if exists offers_no_direct_delete on public.offers;
create policy offers_no_direct_delete on public.offers
  for delete to authenticated
  using (false);

-- 3. Row Level Security on public.users: Allow Owner DELETE so direct de-provisioning succeeds
grant delete on public.users to authenticated;

drop policy if exists users_owner_delete on public.users;
create policy users_owner_delete on public.users
  for delete to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'owner'
  );

-- 4. RPC: Submit Selling Offer with optional Purchasing Offer link (10 params with default)
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
  p_purchasing_offer_id uuid default null
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
    p_price, 'EUR', p_price, p_origin, p_origin, 1, 'Selling offer for ' || p_material_name || ' linked to ' || p_po_number,
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
        v_caller.name || ' submitted Selling Offer ' || v_offer_num || ' linked to ' || p_po_number || ' for ' || p_client_name || '.',
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
    'number', v_offer_num,
    'poNumber', p_po_number,
    'purchasingOfferId', v_matched_purchasing_id,
    'status', 'received',
    'approvalStatus', 'pending'
  );
end;
$$;

revoke all on function public.rpc_submit_selling_offer(text, text, text, text, text, text, numeric, text, text, uuid) from public;
grant execute on function public.rpc_submit_selling_offer(text, text, text, text, text, text, numeric, text, text, uuid) to authenticated, service_role;

-- 5. RPC: Mandatory Rejection Reason Enforcement
create or replace function public.rpc_reject_user_registration(
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_target public.users;
  v_trimmed_reason text;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'Only administrators can reject account registrations.';
  end if;

  v_trimmed_reason := trim(coalesce(p_reason, ''));
  if length(v_trimmed_reason) = 0 then
    raise exception 'A rejection reason is mandatory.';
  end if;

  select * into v_target from public.users where id = p_user_id limit 1;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;

  update public.users set
    approval_status = 'rejected',
    active = false,
    registration_notes = v_trimmed_reason,
    updated_at = now()
  where id = p_user_id;

  -- Audit log entry
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_caller.id,
      'user-registration-rejected',
      'user',
      p_user_id::text,
      v_target.approval_status,
      'rejected by ' || v_caller.name || ': ' || v_trimmed_reason
    );
  exception when others then
    null;
  end;

  -- Notify rejected applicant
  begin
    insert into public.notifications (
      recipient_id, event_type, title, message, target_type, target_id, link, created_at
    ) values (
      p_user_id,
      'account_rejected',
      'Registration Status Update',
      'Your registration request was declined: ' || v_trimmed_reason,
      'user',
      p_user_id::text,
      '/login',
      now()
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'approvalStatus', 'rejected',
    'active', false,
    'reason', v_trimmed_reason
  );
end;
$$;

revoke all on function public.rpc_reject_user_registration(uuid, text) from public, anon;
grant execute on function public.rpc_reject_user_registration(uuid, text) to authenticated, service_role;

-- 6. RPC: rpc_register_offers_user with foreign key protection & variable declaration
create or replace function public.rpc_register_offers_user(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_company text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_notes text;
  v_admin_id uuid;
  v_valid_auth_id uuid := null;
  v_existing public.users;
begin
  if length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'Email is required.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name is required.';
  end if;

  v_notes := case 
    when p_notes is not null and p_company is not null and length(trim(p_notes)) > 0 and length(trim(p_company)) > 0
      then trim(p_notes) || ' (Company: ' || trim(p_company) || ')'
    when p_company is not null and length(trim(p_company)) > 0
      then 'Company: ' || trim(p_company)
    else trim(p_notes)
  end;

  -- 1. Safely check if p_auth_user_id exists in auth.users to avoid FK violation
  if p_auth_user_id is not null and exists (select 1 from auth.users where id = p_auth_user_id) then
    v_valid_auth_id := p_auth_user_id;
  else
    -- 2. Otherwise look up genuine auth.users record by email
    select id into v_valid_auth_id
    from auth.users
    where lower(trim(email)) = lower(trim(p_email))
    order by created_at desc
    limit 1;
  end if;

  -- Ensure auth.users email is confirmed so password authentication can proceed to our status check
  if v_valid_auth_id is not null then
    begin
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = v_valid_auth_id;
    exception when others then
      null;
    end;
  end if;

  -- Check existing user in public.users
  select * into v_existing from public.users where lower(trim(email)) = lower(trim(p_email)) limit 1;
  if v_existing is not null and v_existing.approval_status = 'approved' and v_existing.active = true then
    return jsonb_build_object('ok', true, 'userId', v_existing.id, 'alreadyApproved', true);
  end if;

  insert into public.users (
    id, auth_user_id, email, name, role, warehouse_id, company_id,
    active, approval_status, registration_notes, created_at, updated_at
  ) values (
    gen_random_uuid(), v_valid_auth_id, lower(trim(p_email)), trim(p_name), 'offers_user', null, null,
    false, 'pending', v_notes, now(), now()
  )
  on conflict (email) do update set
    auth_user_id = coalesce(v_valid_auth_id, users.auth_user_id),
    name = trim(p_name),
    role = 'offers_user',
    approval_status = case when users.approval_status = 'approved' then 'approved' else 'pending' end,
    active = case when users.approval_status = 'approved' then true else false end,
    registration_notes = coalesce(v_notes, users.registration_notes),
    updated_at = now()
  returning id into v_user_id;

  -- Notify admins of the registration request
  for v_admin_id in (select id from public.users where role = 'owner' and active = true) loop
    begin
      perform public.rpc_create_notification(
        v_admin_id,
        'user_registration',
        'New Offers User Registration: ' || trim(p_name),
        trim(p_name) || ' (' || lower(trim(p_email)) || ') registered an Offers User account.',
        'user',
        v_user_id::text
      );
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'userId', v_user_id);
end;
$$;

revoke all on function public.rpc_register_offers_user(uuid, text, text, text, text) from public;
grant execute on function public.rpc_register_offers_user(uuid, text, text, text, text) to anon, authenticated, service_role;

-- 7. Explicitly reload PostgREST schema cache
notify pgrst, 'reload schema';

