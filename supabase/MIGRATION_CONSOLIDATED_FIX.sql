-- ============================================================================
-- StockFlow Consolidated Fix Migration: PO/SO Removal, User Deletion & Auth Status
--
-- Apply this SQL in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dyluiydjzbmrhzgpaxqq/sql/new
--
-- 1. Adds PO/SO type, warehouse, and removal tracking columns to purchase_orders
-- 2. Defines rpc_remove_poso_number for safe number removal preserving operational history
-- 3. Defines rpc_delete_user_account for safe user de-provisioning
-- 4. Defines rpc_get_auth_account_status without automatic role escalation
-- 5. Grants table & RPC permissions to authenticated and service_role
-- 6. Reloads PostgREST schema cache
-- ============================================================================

-- 1. Extend purchase_orders table with removal and typing columns
alter table public.purchase_orders
  add column if not exists type text check (type in ('PO', 'SO')) default 'PO',
  add column if not exists is_removed boolean not null default false,
  add column if not exists removed_at timestamptz default null,
  add column if not exists removed_by uuid default null references public.users(id),
  add column if not exists warehouse_id uuid default null references public.warehouses(id);

create index if not exists idx_purchase_orders_is_removed on public.purchase_orders(is_removed);
create index if not exists idx_purchase_orders_type on public.purchase_orders(type);
create index if not exists idx_purchase_orders_warehouse_id on public.purchase_orders(warehouse_id);

-- 2. RPC: rpc_remove_poso_number (Staff & Admin)
create or replace function public.rpc_remove_poso_number(
  p_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_order public.purchase_orders;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role not in ('manager', 'owner') then
    raise exception 'Only Staff can remove a PO/SO number.';
  end if;

  select * into v_order
  from public.purchase_orders
  where lower(trim(number)) = lower(trim(p_number))
  limit 1;

  if v_order.id is null then
    raise exception 'Order % does not exist.', p_number;
  end if;

  if v_order.is_removed then
    return jsonb_build_object('ok', true, 'message', 'Order is already removed.');
  end if;

  update public.purchase_orders
  set
    is_removed = true,
    removed_at = now(),
    removed_by = v_caller.id,
    updated_at = now()
  where id = v_order.id;

  -- Append audit log (preserving operational history)
  begin
    perform set_config('stockflow.in_trusted_rpc', 'true', true);
    perform public.internal_append_audit(
      v_caller.id,
      'poso-number-removed',
      'purchase-order',
      v_order.id::text,
      v_order.number,
      v_order.number || ' number entry was removed by ' || v_caller.name || '. Operational history, shipments, evidence, and audit logs are preserved.'
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'number', v_order.number,
    'message', 'Order number removed successfully. Operational records preserved.'
  );
end;
$$;

revoke all on function public.rpc_remove_poso_number(text) from public, anon;
grant execute on function public.rpc_remove_poso_number(text) to authenticated, service_role;

-- 3. RPC: rpc_delete_user_account (Admin only, handles operational record integrity)
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

  if v_target.role = 'owner' then
    select count(*) into v_active_owners from public.users where role = 'owner' and active = true;
    if v_active_owners <= 1 then
      raise exception 'The last active administrator account cannot be deleted.';
    end if;
  end if;

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
      registration_notes = 'Account deactivated by ' || v_caller.name || ' on ' || now()::text || ' (operational records preserved)',
      updated_at = now()
    where id = p_user_id;

    begin
      perform set_config('stockflow.in_trusted_rpc', 'true', true);
      perform public.internal_append_audit(
        v_caller.id,
        'user-account-deactivated',
        'user',
        p_user_id::text,
        v_target.email,
        'Credentials unlinked and deactivated by ' || v_caller.name || ' (historical records preserved)'
      );
    exception when others then
      null;
    end;

    return jsonb_build_object('ok', true, 'action', 'deactivated_unlinked', 'userId', p_user_id);
  else
    -- Delete row directly
    delete from public.users where id = p_user_id;

    begin
      perform set_config('stockflow.in_trusted_rpc', 'true', true);
      perform public.internal_append_audit(
        v_caller.id,
        'user-account-deleted',
        'user',
        p_user_id::text,
        v_target.email,
        'User record permanently deleted by ' || v_caller.name
      );
    exception when others then
      null;
    end;

    return jsonb_build_object('ok', true, 'action', 'deleted', 'userId', p_user_id);
  end if;
end;
$$;

revoke all on function public.rpc_delete_user_account(uuid) from public, anon;
grant execute on function public.rpc_delete_user_account(uuid) to authenticated, service_role;

-- 4. RPC: rpc_get_auth_account_status
create or replace function public.rpc_get_auth_account_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_auth_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthenticated');
  end if;

  -- Step 1: Look up user by auth_user_id
  select * into v_user
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  -- Step 2: If not linked yet, look up authenticated user's email in auth.users
  if v_user is null then
    select lower(trim(email)) into v_auth_email
    from auth.users
    where id = auth.uid()
    limit 1;

    if v_auth_email is not null then
      update public.users
      set auth_user_id = auth.uid(),
          updated_at = now()
      where lower(trim(email)) = v_auth_email
        and auth_user_id is null
      returning * into v_user;
    end if;
  end if;

  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Profile not found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_user.id,
    'email', v_user.email,
    'name', v_user.name,
    'role', v_user.role,
    'active', v_user.active,
    'approval_status', v_user.approval_status
  );
end;
$$;

revoke all on function public.rpc_get_auth_account_status() from public, anon;
grant execute on function public.rpc_get_auth_account_status() to authenticated, service_role;

-- 5. Table Grants & RLS Policies
grant select, insert, update on public.purchase_orders to authenticated, service_role;
grant select, insert, update on public.purchase_order_lines to authenticated, service_role;
grant select, insert, update, delete on public.users to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, anon, service_role;
grant execute on function public.current_app_user() to authenticated, anon, service_role;

drop policy if exists users_owner_delete on public.users;
create policy users_owner_delete on public.users
  for delete to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'owner'
  );

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or ((select public.current_user_role()) = 'worker' and id = (select public.current_user_id()))
    or (auth.uid() is not null and auth_user_id = auth.uid())
    or (auth.uid() is not null and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
  );

-- 6. Reload PostgREST schema cache
notify pgrst, 'reload schema';
