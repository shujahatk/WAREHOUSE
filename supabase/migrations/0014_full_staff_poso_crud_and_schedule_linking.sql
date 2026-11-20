-- ============================================================================
-- StockFlow Migration 0014: Full Staff PO/SO Database Access & Schedule Linking
--
-- 1. Adds full commercial & logistics columns to public.purchase_orders
-- 2. Updates purchase_orders & purchase_order_lines triggers so Staff (manager)
--    can edit all PO/SO fields (including reference number and approved orders)
-- 3. Updates Row Level Security (RLS) policies on purchase_orders and
--    purchase_order_lines for full Staff CRUD while keeping Workers blocked
--    and preserving Admin oversight boundaries
-- 4. Adds indexes on foreign keys and lookup columns
-- ============================================================================

-- 1. Extend public.purchase_orders with all PO/SO commercial & logistics columns
alter table public.purchase_orders
  add column if not exists type text check (type in ('PO', 'SO')) default 'PO',
  add column if not exists currency text not null default 'EUR',
  add column if not exists warehouse_id uuid default null references public.warehouses(id) on delete set null,
  add column if not exists purchaser_name text default null,
  add column if not exists seller_name text default null,
  add column if not exists transport_price numeric not null default 0 check (transport_price >= 0),
  add column if not exists origin text not null default '',
  add column if not exists destination text not null default '',
  add column if not exists pickup_date text default null,
  add column if not exists annex7_required boolean not null default false,
  add column if not exists is_removed boolean not null default false,
  add column if not exists removed_at timestamptz default null,
  add column if not exists removed_by uuid default null references public.users(id) on delete set null;

create index if not exists idx_purchase_orders_type on public.purchase_orders(type);
create index if not exists idx_purchase_orders_warehouse_id on public.purchase_orders(warehouse_id);
create index if not exists idx_purchase_orders_is_removed on public.purchase_orders(is_removed);
create index if not exists idx_purchase_orders_removed_by on public.purchase_orders(removed_by);

-- 2. Update purchase_orders & purchase_order_lines guard triggers for full Staff PO/SO CRUD
create or replace function public.enforce_purchase_order_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_user_role();
  v_actor_id uuid := public.current_user_id();
  v_in_rpc boolean := coalesce(current_setting('stockflow.in_trusted_rpc', true), '') = 'true';
begin
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Immutable purchase order identity columns cannot be modified.';
  end if;

  if not v_in_rpc and v_role not in ('manager', 'owner') then
    raise exception 'Only Staff can edit PO/SO orders.';
  end if;

  -- Direct updates by Staff cannot change status to approved or declined unless in trusted RPC
  if not v_in_rpc and v_role = 'manager' and new.status is distinct from old.status and new.status in ('approved', 'declined') then
    raise exception 'Staff cannot approve or reject purchase order status directly.';
  end if;

  new.updated_at := now();

  if not v_in_rpc and v_role = 'manager' and v_actor_id is not null then
    perform public.internal_append_audit(
      v_actor_id,
      'order-edited',
      'purchase-order',
      new.id::text,
      old.number,
      new.number || ' was edited.'
    );
  end if;

  return new;
end;
$$;

create or replace function public.enforce_purchase_order_line_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  v_exists boolean;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select exists(select 1 from public.purchase_orders where id = v_po_id) into v_exists;
  if not v_exists then
    raise exception 'Parent purchase order does not exist.';
  end if;

  return coalesce(new, old);
end;
$$;

-- 3. Update RLS Policies on public.purchase_orders and public.purchase_order_lines
drop policy if exists purchase_orders_manager_insert on public.purchase_orders;
create policy purchase_orders_manager_insert on public.purchase_orders
  for insert with check (
    (select public.current_user_role()) = 'manager'
    and created_by = (select public.current_user_id())
  );

drop policy if exists purchase_orders_manager_update on public.purchase_orders;
create policy purchase_orders_manager_update on public.purchase_orders
  for update using (
    (select public.current_user_role()) = 'manager'
  )
  with check (
    (select public.current_user_role()) = 'manager'
  );

drop policy if exists purchase_orders_manager_delete on public.purchase_orders;
create policy purchase_orders_manager_delete on public.purchase_orders
  for delete using (
    (select public.current_user_role()) = 'manager'
  );

drop policy if exists purchase_order_lines_manager_insert on public.purchase_order_lines;
create policy purchase_order_lines_manager_insert on public.purchase_order_lines
  for insert with check (
    (select public.current_user_role()) = 'manager'
  );

drop policy if exists purchase_order_lines_manager_update on public.purchase_order_lines;
create policy purchase_order_lines_manager_update on public.purchase_order_lines
  for update using (
    (select public.current_user_role()) = 'manager'
  )
  with check (
    (select public.current_user_role()) = 'manager'
  );

drop policy if exists purchase_order_lines_manager_delete on public.purchase_order_lines;
create policy purchase_order_lines_manager_delete on public.purchase_order_lines
  for delete using (
    (select public.current_user_role()) = 'manager'
  );

-- 4. Grant table permissions to authenticated role (governed by RLS)
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;

notify pgrst, 'reload schema';
