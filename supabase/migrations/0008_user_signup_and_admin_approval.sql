-- Migration 0008: User Signup, Phone support, and Admin Approval System
-- Safe, additive migration preserving existing tables, data, and RLS policies

-- 1. Add phone column to public.users if not present
alter table public.users add column if not exists phone text;

create index if not exists idx_users_phone on public.users (phone);

-- Allow pending workers to not require a warehouse until approved by an administrator
alter table public.users drop constraint if exists users_worker_warehouse_check;
alter table public.users add constraint users_worker_warehouse_check check (
  (role = 'worker' and (
    (approval_status = 'approved' and active = true and warehouse_id is not null)
    or approval_status in ('pending', 'rejected')
    or active = false
  ) and company_id is null)
  or (role in ('owner', 'manager', 'moderator', 'offers_user') and warehouse_id is null and company_id is null)
);

-- 2. General Public User Registration RPC
create or replace function public.rpc_register_user(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_phone text default null,
  p_notes text default null,
  p_requested_role text default 'worker'
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
  v_assigned_role text := 'worker';
begin
  if length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'Email is required.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name is required.';
  end if;

  v_notes := trim(coalesce(p_notes, ''));

  -- Normalize requested role (never permit public signup to assign admin or manager)
  if lower(trim(coalesce(p_requested_role, ''))) in ('offers_user', 'offers-user') then
    v_assigned_role := 'offers_user';
  else
    v_assigned_role := 'worker';
  end if;

  -- 1. Check if p_auth_user_id exists in auth.users
  if p_auth_user_id is not null and exists (select 1 from auth.users where id = p_auth_user_id) then
    v_valid_auth_id := p_auth_user_id;
  else
    -- Look up genuine auth.users record by email
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

  -- Insert or update public.users as pending
  insert into public.users (
    id, auth_user_id, email, name, phone, role, warehouse_id, company_id,
    active, approval_status, registration_notes, created_at, updated_at
  ) values (
    gen_random_uuid(), v_valid_auth_id, lower(trim(p_email)), trim(p_name), trim(p_phone),
    v_assigned_role, null, null,
    false, 'pending', nullif(v_notes, ''), now(), now()
  )
  on conflict (email) do update set
    auth_user_id = coalesce(v_valid_auth_id, users.auth_user_id),
    name = trim(p_name),
    phone = coalesce(trim(p_phone), users.phone),
    role = v_assigned_role,
    approval_status = 'pending',
    active = false,
    registration_notes = nullif(v_notes, ''),
    updated_at = now()
  returning id into v_user_id;

  -- Append to audit log
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_user_id,
      'user-registration-submitted',
      'user',
      v_user_id::text,
      null,
      'Public signup submitted for ' || lower(trim(p_email)) || coalesce(' (Phone: ' || trim(p_phone) || ')', '')
    );
  exception when others then
    null;
  end;

  -- Notify all active admins immediately
  for v_admin_id in (select id from public.users where role = 'owner' and active = true) loop
    begin
      insert into public.notifications (
        recipient_id, event_type, title, message, target_type, target_id, link, created_at
      ) values (
        v_admin_id,
        'user_registration',
        'New Registration Request: ' || trim(p_name),
        trim(p_name) || ' (' || lower(trim(p_email)) || coalesce(', Tel: ' || trim(p_phone), '') || ') submitted a registration request.',
        'user',
        v_user_id::text,
        '/users',
        now()
      );
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'userId', v_user_id);
end;
$$;

revoke all on function public.rpc_register_user(uuid, text, text, text, text, text) from public;
grant execute on function public.rpc_register_user(uuid, text, text, text, text, text) to anon, authenticated, service_role;

-- 3. Admin Approval RPC (with explicit role & warehouse assignment)
create or replace function public.rpc_approve_user_registration(
  p_user_id uuid,
  p_role text,
  p_warehouse_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_target public.users;
  v_role text;
  v_warehouse_id uuid := null;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'Only administrators can approve account registrations.';
  end if;

  select * into v_target from public.users where id = p_user_id limit 1;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;

  v_role := lower(trim(p_role));
  if v_role not in ('worker', 'manager', 'moderator', 'offers_user', 'owner') then
    raise exception 'Invalid role specified: %', p_role;
  end if;

  if v_role = 'worker' then
    if p_warehouse_id is null then
      -- Fall back to Bornem warehouse if unspecified
      select id into v_warehouse_id from public.warehouses where lower(name) = 'bornem' limit 1;
      if v_warehouse_id is null then
        select id into v_warehouse_id from public.warehouses where active = true limit 1;
      end if;
    else
      v_warehouse_id := p_warehouse_id;
    end if;
  else
    v_warehouse_id := null;
  end if;

  update public.users set
    role = v_role,
    warehouse_id = v_warehouse_id,
    company_id = null,
    approval_status = 'approved',
    active = true,
    registration_notes = coalesce(p_note, registration_notes),
    updated_at = now()
  where id = p_user_id;

  -- Audit log entry
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_caller.id,
      'user-registration-approved',
      'user',
      p_user_id::text,
      v_target.approval_status || ' (' || v_target.role || ')',
      'approved (' || v_role || ') by ' || v_caller.name
    );
  exception when others then
    null;
  end;

  -- Notify user
  begin
    insert into public.notifications (
      recipient_id, event_type, title, message, target_type, target_id, link, created_at
    ) values (
      p_user_id,
      'account_approved',
      'Account Approved',
      'Your registration has been approved. You are assigned as ' || v_role || '. You can now sign in.',
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
    'role', v_role,
    'approvalStatus', 'approved',
    'active', true
  );
end;
$$;

revoke all on function public.rpc_approve_user_registration(uuid, text, uuid, text) from public, anon;
grant execute on function public.rpc_approve_user_registration(uuid, text, uuid, text) to authenticated, service_role;

-- 4. Admin Rejection RPC
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
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'Only administrators can reject account registrations.';
  end if;

  select * into v_target from public.users where id = p_user_id limit 1;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;

  update public.users set
    approval_status = 'rejected',
    active = false,
    registration_notes = coalesce(p_reason, registration_notes),
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
      'rejected by ' || v_caller.name || coalesce(': ' || p_reason, '')
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'approvalStatus', 'rejected',
    'active', false
  );
end;
$$;

revoke all on function public.rpc_reject_user_registration(uuid, text) from public, anon;
grant execute on function public.rpc_reject_user_registration(uuid, text) to authenticated, service_role;

-- 5. Admin User Account Deletion RPC (Safe handling: preserves operational records, destroys login)
create or replace function public.rpc_delete_user_account(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_target public.users;
  v_active_owners integer;
  v_has_records boolean := false;
  v_auth_id uuid;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'Only administrators can delete user accounts.';
  end if;

  if v_caller.id = p_user_id then
    raise exception 'You cannot delete your own administrator account.';
  end if;

  select * into v_target from public.users where id = p_user_id limit 1;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;

  -- Protect the last active owner/admin
  if v_target.role = 'owner' then
    select count(*) into v_active_owners from public.users where role = 'owner' and active = true;
    if v_active_owners <= 1 then
      raise exception 'The last active administrator account cannot be deleted.';
    end if;
  end if;

  v_auth_id := v_target.auth_user_id;

  -- Check if user has operational records with restrict FK
  if exists (select 1 from public.purchase_orders where created_by = p_user_id limit 1)
     or exists (select 1 from public.worker_general_requests where created_by = p_user_id limit 1)
     or exists (select 1 from public.documents where created_by = p_user_id limit 1)
     or exists (select 1 from public.stock_movements where performed_by = p_user_id limit 1)
  then
    v_has_records := true;
  end if;

  if v_has_records then
    -- Safely unlink auth and deactivate to preserve operational and audit history
    update public.users set
      auth_user_id = null,
      active = false,
      approval_status = 'rejected',
      email = v_target.email || '.deleted.' || floor(extract(epoch from now())),
      registration_notes = 'Account deleted by ' || v_caller.name || ' on ' || now()::text,
      updated_at = now()
    where id = p_user_id;

    -- Audit log
    begin
      perform set_config('stockflow.in_trusted_rpc', 'true', true);
      perform public.internal_append_audit(
        v_caller.id,
        'user-account-deleted-unlinked',
        'user',
        p_user_id::text,
        v_target.email,
        'Credentials unlinked and deactivated by ' || v_caller.name || ' (historical records preserved)'
      );
    exception when others then
      null;
    end;
  else
    -- Delete public.users record
    delete from public.users where id = p_user_id;

    -- Audit log
    begin
      perform set_config('stockflow.in_trusted_rpc', 'true', true);
      perform public.internal_append_audit(
        v_caller.id,
        'user-account-deleted',
        'user',
        p_user_id::text,
        v_target.email,
        'Permanently deleted by ' || v_caller.name
      );
    exception when others then
      null;
    end;
  end if;

  -- Revoke auth identity in auth.users if exists
  if v_auth_id is not null then
    begin
      delete from auth.users where id = v_auth_id;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'preservedRecords', v_has_records
  );
end;
$$;

revoke all on function public.rpc_delete_user_account(uuid) from public, anon;
grant execute on function public.rpc_delete_user_account(uuid) to authenticated, service_role;

-- 6. Admin User Toggle Active (Deactivate / Reactivate)
create or replace function public.rpc_toggle_user_active(
  p_user_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_target public.users;
  v_active_owners integer;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'Only administrators can activate or deactivate accounts.';
  end if;

  select * into v_target from public.users where id = p_user_id limit 1;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;

  if not p_active and v_target.role = 'owner' then
    select count(*) into v_active_owners from public.users where role = 'owner' and active = true;
    if v_active_owners <= 1 then
      raise exception 'The last active administrator account cannot be deactivated.';
    end if;
  end if;

  update public.users set
    active = p_active,
    approval_status = case when p_active and approval_status = 'rejected' then 'approved' else approval_status end,
    updated_at = now()
  where id = p_user_id;

  -- Audit log
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_caller.id,
      case when p_active then 'user-account-reactivated' else 'user-account-deactivated' end,
      'user',
      p_user_id::text,
      'active=' || v_target.active::text,
      'active=' || p_active::text || ' by ' || v_caller.name
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'active', p_active
  );
end;
$$;

revoke all on function public.rpc_toggle_user_active(uuid, boolean) from public, anon;
grant execute on function public.rpc_toggle_user_active(uuid, boolean) to authenticated, service_role;

-- 7. Ensure rpc_register_offers_user is present, handles foreign key safely, and reloads schema cache
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

  -- 1. Check if p_auth_user_id exists in auth.users
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

  -- Ensure auth.users email is confirmed so password authentication can proceed
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

-- 8. Explicitly reload PostgREST schema cache
notify pgrst, 'reload schema';
