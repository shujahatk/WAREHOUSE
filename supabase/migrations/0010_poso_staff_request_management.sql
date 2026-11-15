-- ============================================================================
-- StockFlow Migration 0010: Staff PO/SO Request Management & Safe Account Deletion
--
-- 1. Adds PO/SO type, warehouse, and removal tracking columns to purchase_orders
-- 2. Defines rpc_remove_poso_number for safe number removal preserving operational history
-- 3. Defines rpc_delete_user_account and grants for bulletproof account de-provisioning
-- 4. Ensures authenticated role table grants and schema cache reload
-- ============================================================================

-- 1. Extend purchase_orders table
alter table public.purchase_orders
  add column if not exists type text check (type in ('PO', 'SO')) default 'PO',
  add column if not exists is_removed boolean not null default false,
  add column if not exists removed_at timestamptz default null,
  add column if not exists removed_by uuid default null references public.users(id),
  add column if not exists warehouse_id uuid default null references public.warehouses(id);

create index if not exists idx_purchase_orders_is_removed on public.purchase_orders(is_removed);
create index if not exists idx_purchase_orders_type on public.purchase_orders(type);
create index if not exists idx_purchase_orders_warehouse_id on public.purchase_orders(warehouse_id);

-- 2. RPC: rpc_remove_poso_number (Staff only)
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

-- 4. Ensure table grants for authenticated users
grant select, insert, update on public.purchase_orders to authenticated;
grant select, insert, update on public.purchase_order_lines to authenticated;
grant select, update, delete on public.users to authenticated;

-- 5. Reload PostgREST schema cache
notify pgrst, 'reload schema';
