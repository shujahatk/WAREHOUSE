-- Migration 0016: Strict Login & Registration Request Permissions
-- 1. Admin (owner) is the ONLY role permitted to view and manage pending login/registration requests.
-- 2. Staff (manager), Worker, Moderator, and external users CANNOT view, approve, reject, or delete login requests.
-- 3. Enforces this at the Supabase RLS and database RPC levels.

-- 1. Update users_select RLS Policy on public.users
drop policy if exists users_select on public.users;

create policy users_select on public.users
  for select to authenticated
  using (
    -- Admin can view all users, including pending and rejected login requests
    (select public.current_user_role()) = 'owner'
    -- Staff can only view approved, operational users (CANNOT see pending login/registration requests)
    or ((select public.current_user_role()) = 'manager' and approval_status = 'approved')
    -- Worker can view their own record
    or ((select public.current_user_role()) = 'worker' and id = (select public.current_user_id()))
    -- Authenticated users can view their own profile by auth_user_id or JWT email
    or (auth.uid() is not null and auth_user_id = auth.uid())
    or (auth.uid() is not null and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
  );

-- 2. Ensure users_owner_insert, users_owner_update, and users_owner_delete strictly require owner
drop policy if exists users_owner_insert on public.users;
create policy users_owner_insert on public.users
  for insert with check (public.current_user_role() = 'owner');

drop policy if exists users_owner_update on public.users;
create policy users_owner_update on public.users
  for update using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

drop policy if exists users_owner_delete on public.users;
create policy users_owner_delete on public.users
  for delete using (public.current_user_role() = 'owner');

-- 3. Hardened Admin-only Registration Approval RPC
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

  -- Ensure auth.users email is confirmed upon admin approval
  begin
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where lower(trim(email)) = lower(trim(v_target.email));
  exception when others then
    null;
  end;

  update public.users set
    auth_user_id = coalesce(users.auth_user_id, (select id from auth.users where lower(trim(email)) = lower(trim(v_target.email)) order by created_at desc limit 1)),
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

-- 4. Hardened Admin-only Registration Rejection RPC
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

  -- Notify user
  begin
    insert into public.notifications (
      recipient_id, event_type, title, message, target_type, target_id, link, created_at
    ) values (
      p_user_id,
      'account_rejected',
      'Account Registration Declined',
      'Your registration was declined.' || coalesce(' Reason: ' || p_reason, ''),
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
    'active', false
  );
end;
$$;

revoke all on function public.rpc_reject_user_registration(uuid, text) from public, anon;
grant execute on function public.rpc_reject_user_registration(uuid, text) to authenticated, service_role;

-- 5. Hardened Admin-only Offers User Decision RPC
create or replace function public.rpc_decide_offers_user_registration(
  p_user_id uuid,
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
  v_target public.users;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'Unauthorized: Only Admin can approve or reject account registrations.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select * into v_target from public.users where id = p_user_id limit 1;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;

  -- Ensure auth.users email is confirmed upon admin approval
  if p_decision = 'approved' then
    begin
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now())
      where lower(trim(email)) = lower(trim(v_target.email));
    exception when others then
      null;
    end;
  end if;

  update public.users
  set auth_user_id = coalesce(users.auth_user_id, (select id from auth.users where lower(trim(email)) = lower(trim(v_target.email)) order by created_at desc limit 1)),
      approval_status = p_decision,
      active = (p_decision = 'approved'),
      registration_notes = coalesce(p_note, registration_notes),
      updated_at = now()
  where id = v_target.id;

  begin
    insert into public.notifications (
      recipient_id, event_type, title, message, target_type, target_id, link, created_at
    ) values (
      v_target.id,
      'account_' || p_decision,
      'Registration ' || upper(p_decision),
      case when p_decision = 'approved'
        then 'Your Offers User registration has been approved. You can now log in.'
        else 'Your Offers User registration was declined.' || coalesce(' Note: ' || p_note, '')
      end,
      'user',
      v_target.id::text,
      '/login',
      now()
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'userId', v_target.id,
    'approvalStatus', p_decision,
    'active', (p_decision = 'approved')
  );
end;
$$;

revoke all on function public.rpc_decide_offers_user_registration(uuid, text, text) from public, anon;
grant execute on function public.rpc_decide_offers_user_registration(uuid, text, text) to authenticated, service_role;

-- 6. Reload schema cache
notify pgrst, 'reload schema';
