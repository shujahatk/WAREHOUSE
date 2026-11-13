-- ============================================================================
-- STOCKFLOW — INVENTORY REALTIME, PO IMPROVEMENTS & IMMUTABLE HISTORY
-- Migration 0003: Sequential POs, Container Tracking, and Append-Only History
-- ============================================================================

-- 1. Extend purchase_orders with custom title
alter table public.purchase_orders
  add column if not exists title text not null default '';

-- 2. Dedicated sequence counter table for sequential PO numbering (PO-YYYY-XXXX)
create table if not exists public.po_sequences (
  year integer not null check (year >= 2020),
  next_val integer not null default 1 check (next_val >= 1),
  primary key (year)
);

alter table public.po_sequences enable row level security;

-- Only service role and authenticated users via RPC can manage sequences
create policy po_sequences_select on public.po_sequences
  for select to authenticated
  using (true);

-- 3. Permanent, Immutable Append-Only Inventory History
create table if not exists public.inventory_history (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete restrict,
  material_name text not null,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  warehouse_name text not null,
  container_number text,
  quantity_before numeric(14, 3) not null check (quantity_before >= 0),
  quantity_change numeric(14, 3) not null,
  quantity_after numeric(14, 3) not null check (quantity_after >= 0),
  packaging_type_id uuid references public.packaging_types (id) on delete set null,
  packaging_type_name text,
  packaging_count integer check (packaging_count is null or packaging_count >= 0),
  packaging_unit_tare_kg numeric(10, 3) check (packaging_unit_tare_kg is null or packaging_unit_tare_kg >= 0),
  total_packaging_weight_kg numeric(12, 3) check (total_packaging_weight_kg is null or total_packaging_weight_kg >= 0),
  gross_weight_kg numeric(14, 3) check (gross_weight_kg is null or gross_weight_kg >= 0),
  operation_type text not null check (length(trim(operation_type)) > 0),
  operation_reason text not null default '',
  reference text not null default '',
  po_number text,
  so_number text,
  performed_by uuid not null references public.users (id) on delete restrict,
  performed_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_hist_warehouse on public.inventory_history (warehouse_id);
create index if not exists idx_inv_hist_material on public.inventory_history (material_id);
create index if not exists idx_inv_hist_created_at on public.inventory_history (created_at desc);
create index if not exists idx_inv_hist_container on public.inventory_history (container_number);
create index if not exists idx_inv_hist_po on public.inventory_history (po_number);

alter table public.inventory_history enable row level security;

-- Read Access:
-- Admin and Staff can view all inventory history
-- Worker can view inventory history at their assigned warehouse
create policy inv_hist_select on public.inventory_history
  for select to authenticated
  using (
    public.current_user_role() in ('owner', 'manager', 'moderator')
    or (
      public.current_user_role() = 'worker'
      and warehouse_id = (select warehouse_id from public.users where id = auth.uid())
    )
  );

-- Insert Access: Only authorized operational roles (Staff / Worker via RPC or direct insert)
create policy inv_hist_insert on public.inventory_history
  for insert to authenticated
  with check (
    public.current_user_role() in ('owner', 'manager', 'worker')
  );

-- STRICT IMMUTABILITY: UPDATE and DELETE are permanently forbidden for ALL users
-- No update policy is created -> defaults to deny for all authenticated users
-- No delete policy is created -> defaults to deny for all authenticated users

-- 4. Atomic RPC to generate sequential PO number and create order
create or replace function public.rpc_create_purchase_order(
  p_title text,
  p_custom_number text,
  p_company_id uuid,
  p_material_description text,
  p_quantity_kg numeric,
  p_value_eur numeric,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_role text;
  v_user_id uuid;
  v_year integer;
  v_seq integer;
  v_number text;
  v_order_id uuid;
  v_line_id uuid;
  v_title text;
begin
  v_user_id := auth.uid();
  v_user_role := public.current_user_role();

  -- Role verification: Staff (manager) can create purchase orders
  if v_user_role not in ('manager', 'owner') then
    raise exception 'PERMISSION_DENIED: Only Staff can create purchase orders.';
  end if;

  if p_quantity_kg <= 0 then
    raise exception 'INVALID_ARGUMENT: Quantity must be greater than zero.';
  end if;

  if p_value_eur < 0 then
    raise exception 'INVALID_ARGUMENT: Value cannot be negative.';
  end if;

  v_year := extract(year from now())::integer;

  -- Atomic sequential PO numbering
  if p_custom_number is not null and length(trim(p_custom_number)) > 0 then
    v_number := trim(p_custom_number);
    if exists (select 1 from public.purchase_orders where number = v_number) then
      raise exception 'DUPLICATE_PO: Purchase order number % already exists.', v_number;
    end if;
  else
    insert into public.po_sequences (year, next_val)
    values (v_year, 1)
    on conflict (year) do update
      set next_val = public.po_sequences.next_val + 1
    returning next_val into v_seq;

    v_number := 'PO-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

    -- Ensure collision resistance in case manual POs exist
    while exists (select 1 from public.purchase_orders where number = v_number) loop
      update public.po_sequences
      set next_val = next_val + 1
      where year = v_year
      returning next_val into v_seq;

      v_number := 'PO-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
    end loop;
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), 'PO ' || v_number);

  insert into public.purchase_orders (
    number,
    title,
    company_id,
    status,
    value_eur,
    notes,
    created_by
  ) values (
    v_number,
    v_title,
    p_company_id,
    'submitted',
    p_value_eur,
    coalesce(p_notes, ''),
    v_user_id
  ) returning id into v_order_id;

  insert into public.purchase_order_lines (
    purchase_order_id,
    description,
    quantity_kg
  ) values (
    v_order_id,
    trim(p_material_description),
    p_quantity_kg
  ) returning id into v_line_id;

  -- Audit log entry
  insert into public.audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  ) values (
    v_user_id,
    'order-created',
    'purchase-order',
    v_order_id,
    v_number || ' (' || v_title || ') was submitted for approval.'
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'number', v_number,
    'title', v_title,
    'status', 'submitted'
  );
end;
$$;

-- 5. Realtime publication additions
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.purchase_orders;
    alter publication supabase_realtime add table public.stock_balances;
    alter publication supabase_realtime add table public.stock_movements;
    alter publication supabase_realtime add table public.inventory_history;
  end if;
exception
  when duplicate_object then null;
end;
$$;

