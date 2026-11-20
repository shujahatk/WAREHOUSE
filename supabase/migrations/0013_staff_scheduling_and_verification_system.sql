-- ============================================================================
-- StockFlow Migration 0013: Staff Scheduling & Verification System
--
-- 1. Creates operation_schedules, operation_schedule_items, operation_schedule_attachments
-- 2. Extends stock_movements with schedule_id and schedule_item_id
-- 3. Enables Row Level Security and defines role-scoped access policies
-- 4. Implements atomic RPCs:
--    - rpc_create_operation_schedule (Direct Staff/Admin PO/SO & Schedule Creation)
--    - rpc_start_operation_schedule (Worker operation start)
--    - rpc_save_operation_draft (Worker draft progress with materials, vehicle/dispatch info & timestamps)
--    - rpc_submit_operation_schedule (Worker submission for review)
--    - rpc_verify_operation_schedule (Staff/Admin approval, idempotent stock movement, or return)
-- ============================================================================

-- 1. Tables Creation
create table if not exists public.operation_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_number text not null unique,
  type text not null check (type in ('unloading', 'loading')),
  poso_number text not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  shipment_id uuid references public.shipments(id) on delete set null,
  partner_name text not null,
  company_id uuid references public.companies(id) on delete set null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  origin text not null default '',
  destination text not null default '',
  annex7_required boolean not null default false,
  transport_price numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  pickup_date timestamptz,
  purchaser_name text,
  purchasing_price numeric(12,2) not null default 0,
  seller_name text,
  selling_price numeric(12,2) not null default 0,
  scheduled_date timestamptz not null,
  assigned_worker_id uuid not null references public.users(id) on delete restrict,
  assigned_worker_name text not null default '',
  -- Loading & Dispatch Vehicle / Driver / Timestamp fields
  vehicle_registration_number text not null default '',
  transport_company text not null default '',
  driver_name text not null default '',
  driver_contact_number text not null default '',
  cmr_number text not null default '',
  actual_arrival_time timestamptz,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'in_progress', 'draft', 'submitted', 'returned_for_correction', 'resubmitted', 'completed')
  ),
  instructions text not null default '',
  worker_remarks text not null default '',
  return_reason text,
  info_request_note text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  verified_by_name text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure columns exist if table was already created prior to migration extension
alter table public.operation_schedules
  add column if not exists vehicle_registration_number text not null default '',
  add column if not exists transport_company text not null default '',
  add column if not exists driver_name text not null default '',
  add column if not exists driver_contact_number text not null default '',
  add column if not exists cmr_number text not null default '',
  add column if not exists actual_arrival_time timestamptz,
  add column if not exists info_request_note text;

create table if not exists public.operation_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.operation_schedules(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_name text not null,
  packaging_type_id uuid references public.packaging_types(id) on delete set null,
  packaging_type_name text not null default 'Standard Packaging',
  package_count integer not null default 1 check (package_count > 0),
  tare_per_package_kg numeric(12,3) not null default 0 check (tare_per_package_kg >= 0),
  total_tare_weight_kg numeric(12,3) not null default 0 check (total_tare_weight_kg >= 0),
  gross_weight_kg numeric(12,3) not null default 0 check (gross_weight_kg >= 0),
  net_weight_kg numeric(12,3) not null default 0 check (net_weight_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operation_schedule_attachments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.operation_schedules(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  name text not null,
  kind text not null default 'photo' check (
    kind in (
      'material_photo',
      'packaging_photo',
      'before_loading_photo',
      'during_loading_photo',
      'loaded_vehicle_photo',
      'weighbridge_ticket',
      'delivery_document',
      'cmr_document',
      'annex_vii',
      'other',
      'photo',
      'document',
      'weight_ticket',
      'cmr',
      'cargo',
      'seal',
      'damage'
    )
  ),
  url text not null,
  size bigint not null default 0,
  mime text not null default 'application/octet-stream',
  uploaded_by uuid not null references public.users(id) on delete restrict,
  uploaded_by_name text not null default '',
  uploaded_at timestamptz not null default now()
);

-- 2. Extend stock_movements for direct schedule support
alter table public.stock_movements
  add column if not exists schedule_id uuid references public.operation_schedules(id) on delete set null,
  add column if not exists schedule_item_id uuid references public.operation_schedule_items(id) on delete set null;

alter table public.stock_movements drop constraint if exists stock_movements_valid_source_check;
alter table public.stock_movements add constraint stock_movements_valid_source_check
  check (
    (request_id is not null and request_line_id is not null) or
    (transfer_id is not null) or
    (schedule_id is not null)
  );

-- 3. Grants & Row Level Security
grant select, insert, update, delete on public.operation_schedules to authenticated;
grant select, insert, update, delete on public.operation_schedule_items to authenticated;
grant select, insert, update, delete on public.operation_schedule_attachments to authenticated;

alter table public.operation_schedules enable row level security;
alter table public.operation_schedule_items enable row level security;
alter table public.operation_schedule_attachments enable row level security;

-- Policies for operation_schedules
drop policy if exists operation_schedules_select on public.operation_schedules;
create policy operation_schedules_select on public.operation_schedules
  for select to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or (
      (select public.current_user_role()) = 'worker'
      and (
        assigned_worker_id = (select public.current_user_id())
        or warehouse_id = (select warehouse_id from public.users where id = (select public.current_user_id()))
      )
    )
  );

drop policy if exists operation_schedules_insert on public.operation_schedules;
create policy operation_schedules_insert on public.operation_schedules
  for insert to authenticated
  with check ((select public.current_user_role()) in ('owner', 'manager'));

drop policy if exists operation_schedules_update on public.operation_schedules;
create policy operation_schedules_update on public.operation_schedules
  for update to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or (
      (select public.current_user_role()) = 'worker'
      and assigned_worker_id = (select public.current_user_id())
      and status in ('scheduled', 'in_progress', 'draft', 'returned_for_correction')
    )
  )
  with check (
    (select public.current_user_role()) in ('owner', 'manager')
    or (
      (select public.current_user_role()) = 'worker'
      and assigned_worker_id = (select public.current_user_id())
      and status in ('scheduled', 'in_progress', 'draft', 'submitted', 'resubmitted', 'returned_for_correction')
    )
  );

-- Policies for operation_schedule_items
drop policy if exists operation_schedule_items_select on public.operation_schedule_items;
create policy operation_schedule_items_select on public.operation_schedule_items
  for select to authenticated
  using (
    exists (
      select 1 from public.operation_schedules s
      where s.id = schedule_id
      and (
        (select public.current_user_role()) in ('owner', 'manager')
        or s.assigned_worker_id = (select public.current_user_id())
      )
    )
  );

drop policy if exists operation_schedule_items_modify on public.operation_schedule_items;
create policy operation_schedule_items_modify on public.operation_schedule_items
  for all to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or exists (
      select 1 from public.operation_schedules s
      where s.id = schedule_id
      and s.assigned_worker_id = (select public.current_user_id())
      and s.status in ('scheduled', 'in_progress', 'draft', 'returned_for_correction')
    )
  );

-- Policies for operation_schedule_attachments
drop policy if exists operation_schedule_attachments_select on public.operation_schedule_attachments;
create policy operation_schedule_attachments_select on public.operation_schedule_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.operation_schedules s
      where s.id = schedule_id
      and (
        (select public.current_user_role()) in ('owner', 'manager')
        or s.assigned_worker_id = (select public.current_user_id())
      )
    )
  );

drop policy if exists operation_schedule_attachments_modify on public.operation_schedule_attachments;
create policy operation_schedule_attachments_modify on public.operation_schedule_attachments
  for all to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or uploaded_by = (select public.current_user_id())
  );

-- 4. Atomic RPCs

-- A. rpc_create_operation_schedule (Staff or Admin creates schedule directly)
create or replace function public.rpc_create_operation_schedule(
  p_type text,
  p_poso_number text,
  p_partner_name text,
  p_warehouse_id uuid,
  p_scheduled_date timestamptz,
  p_assigned_worker_id uuid,
  p_origin text default '',
  p_destination text default '',
  p_annex7_required boolean default false,
  p_transport_price numeric default 0,
  p_currency text default 'EUR',
  p_pickup_date timestamptz default null,
  p_purchaser_name text default null,
  p_purchasing_price numeric default 0,
  p_seller_name text default null,
  p_selling_price numeric default 0,
  p_instructions text default '',
  p_items jsonb default '[]'::jsonb,
  p_vehicle_registration_number text default '',
  p_transport_company text default '',
  p_driver_name text default '',
  p_driver_contact_number text default '',
  p_cmr_number text default '',
  p_actual_arrival_time timestamptz default null,
  p_actual_start_time timestamptz default null,
  p_actual_end_time timestamptz default null,
  p_worker_remarks text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_worker public.users;
  v_warehouse public.warehouses;
  v_company public.companies;
  v_po public.purchase_orders;
  v_shipment public.shipments;
  v_schedule_id uuid;
  v_schedule_number text;
  v_prefix text;
  v_year int;
  v_seq int;
  v_item jsonb;
  v_mat_id uuid;
  v_pkg_id uuid;
  v_pkg_tare numeric;
  v_count int;
  v_gross numeric;
  v_tare numeric;
  v_net numeric;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role not in ('owner', 'manager') then
    raise exception 'Unauthorized: Only Staff or Admin can create schedules.';
  end if;

  select * into v_worker from public.users where id = p_assigned_worker_id and active = true and role = 'worker';
  if v_worker.id is null then
    raise exception 'Please select an active warehouse worker.';
  end if;

  select * into v_warehouse from public.warehouses where id = p_warehouse_id;
  if v_warehouse.id is null then
    raise exception 'Warehouse not found.';
  end if;

  v_prefix := case when p_type = 'unloading' then 'SCH-UNL' else 'SCH-LOD' end;
  v_year := extract(year from coalesce(p_scheduled_date, now()))::int;

  select coalesce(max(nullif(regexp_replace(schedule_number, '^.*-', ''), '')::int), 0) + 1
  into v_seq
  from public.operation_schedules
  where schedule_number like (v_prefix || '-' || v_year || '-%');

  v_schedule_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  v_schedule_id := gen_random_uuid();

  -- Link or create Company
  select * into v_company from public.companies where lower(name) = lower(trim(p_partner_name)) limit 1;
  if v_company.id is null then
    insert into public.companies (id, name, kind, active)
    values (gen_random_uuid(), trim(p_partner_name), case when p_type = 'unloading' then 'supplier' else 'customer' end, true)
    returning * into v_company;
  end if;

  -- Link or create Purchase/Sales Order
  select * into v_po from public.purchase_orders where upper(number) = upper(trim(p_poso_number)) limit 1;
  if v_po.id is null then
    insert into public.purchase_orders (
      id, number, title, company_id, status, value_eur, currency, notes,
      type, warehouse_id, assigned_worker_id, assigned_by, assigned_at,
      scheduled_date, execution_status, created_by, created_at, updated_at
    )
    values (
      gen_random_uuid(), upper(trim(p_poso_number)),
      p_partner_name || ' - ' || case when p_type = 'unloading' then 'Unloading' else 'Loading' end,
      v_company.id, 'approved',
      case when p_type = 'unloading' then coalesce(p_purchasing_price, 0) else coalesce(p_selling_price, 0) end,
      coalesce(p_currency, 'EUR'), 'Created via Staff Schedule System',
      case when p_type = 'unloading' then 'PO' else 'SO' end,
      v_warehouse.id, v_worker.id, v_caller.id, now(),
      p_scheduled_date, 'assigned', v_caller.id, now(), now()
    )
    returning * into v_po;
  else
    update public.purchase_orders
    set assigned_worker_id = v_worker.id, assigned_by = v_caller.id, assigned_at = now(),
        scheduled_date = p_scheduled_date, execution_status = 'assigned', updated_at = now()
    where id = v_po.id;
  end if;

  -- Link or create Shipment
  select * into v_shipment from public.shipments where purchase_order_id = v_po.id or upper(reference) = upper(trim(p_poso_number)) limit 1;
  if v_shipment.id is null then
    insert into public.shipments (
      id, reference, direction, purchase_order_id, container_number, warehouse_id,
      origin_country, destination_country, status, carrier_name, annex7_required,
      seller_status, seller_company, seller_confirmed_by, seller_confirmed_at
    )
    values (
      gen_random_uuid(), upper(trim(p_poso_number)),
      case when p_type = 'unloading' then 'inbound' else 'outbound' end,
      v_po.id, upper(trim(p_poso_number)), v_warehouse.id,
      coalesce(nullif(p_origin, ''), 'EU'), coalesce(nullif(p_destination, ''), 'EU'),
      'Planned', coalesce(nullif(p_transport_company, ''), 'Standard Freight'), coalesce(p_annex7_required, false),
      'Confirmed', p_partner_name, v_caller.name, now()
    )
    returning * into v_shipment;
  end if;

  -- Insert Operation Schedule
  insert into public.operation_schedules (
    id, schedule_number, type, poso_number, purchase_order_id, shipment_id,
    partner_name, company_id, warehouse_id, origin, destination, annex7_required,
    transport_price, currency, pickup_date, purchaser_name, purchasing_price,
    seller_name, selling_price, scheduled_date, assigned_worker_id, assigned_worker_name,
    vehicle_registration_number, transport_company, driver_name, driver_contact_number,
    cmr_number, actual_arrival_time, actual_start_time, actual_end_time,
    status, instructions, worker_remarks, created_by, created_by_name, created_at, updated_at
  )
  values (
    v_schedule_id, v_schedule_number, p_type, upper(trim(p_poso_number)), v_po.id, v_shipment.id,
    p_partner_name, v_company.id, v_warehouse.id, coalesce(p_origin, ''), coalesce(p_destination, ''),
    coalesce(p_annex7_required, false), coalesce(p_transport_price, 0), coalesce(p_currency, 'EUR'),
    p_pickup_date, p_purchaser_name, coalesce(p_purchasing_price, 0),
    p_seller_name, coalesce(p_selling_price, 0), p_scheduled_date,
    v_worker.id, v_worker.name,
    coalesce(p_vehicle_registration_number, ''), coalesce(p_transport_company, ''),
    coalesce(p_driver_name, ''), coalesce(p_driver_contact_number, ''),
    coalesce(p_cmr_number, ''), p_actual_arrival_time, p_actual_start_time, p_actual_end_time,
    'scheduled', coalesce(p_instructions, ''), coalesce(p_worker_remarks, ''),
    v_caller.id, v_caller.name, now(), now()
  );

  -- Insert Schedule Items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id into v_mat_id from public.materials where lower(description) = lower(trim(v_item->>'materialName')) or id::text = (v_item->>'materialId') limit 1;
    if v_mat_id is null then
      insert into public.materials (id, material_number, description, unit, low_stock_threshold_kg)
      values (gen_random_uuid(), trim(v_item->>'materialName'), trim(v_item->>'materialName'), 'kg', 0)
      returning id into v_mat_id;
    end if;

    select id, tare_kg into v_pkg_id, v_pkg_tare from public.packaging_types where id::text = (v_item->>'packagingTypeId') limit 1;
    v_count := greatest(1, coalesce((v_item->>'packageCount')::int, 1));
    v_tare := coalesce((v_item->>'tarePerPackageKg')::numeric, (v_item->>'tareWeightKg')::numeric, v_pkg_tare, 0);
    v_gross := coalesce((v_item->>'grossWeightKg')::numeric, 0);
    v_net := greatest(0, v_gross - (v_count * v_tare));

    insert into public.operation_schedule_items (
      id, schedule_id, material_id, material_name, packaging_type_id, packaging_type_name,
      package_count, tare_per_package_kg, total_tare_weight_kg, gross_weight_kg, net_weight_kg,
      created_at, updated_at
    )
    values (
      gen_random_uuid(), v_schedule_id, v_mat_id, coalesce(v_item->>'materialName', 'Material'),
      v_pkg_id, coalesce(v_item->>'packagingTypeName', v_item->>'packagingType', 'Standard Packaging'),
      v_count, v_tare, (v_count * v_tare), v_gross, v_net, now(), now()
    );
  end loop;

  -- Create notification for assigned worker
  insert into public.notifications (
    id, recipient_id, event_type, title, message, target_type, target_id, link, warehouse_id, read, created_at
  )
  values (
    gen_random_uuid(), v_worker.id, 'schedule_assigned',
    'New Schedule Assigned',
    'You have been assigned to ' || (case when p_type = 'unloading' then 'Unloading' else 'Loading' end) || ' schedule ' || v_schedule_number || ' (' || upper(trim(p_poso_number)) || ').',
    'schedule', v_schedule_id::text, '/worker', v_warehouse.id::text, false, now()
  );

  return jsonb_build_object(
    'ok', true,
    'schedule_id', v_schedule_id,
    'schedule_number', v_schedule_number,
    'message', v_schedule_number || ' created successfully and assigned to ' || v_worker.name
  );
end;
$$;

-- B. rpc_start_operation_schedule (Worker starts operation)
create or replace function public.rpc_start_operation_schedule(
  p_schedule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_sched public.operation_schedules;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null then raise exception 'Unauthorized.'; end if;

  select * into v_sched from public.operation_schedules where id = p_schedule_id;
  if v_sched.id is null then raise exception 'Schedule not found.'; end if;

  if v_caller.role = 'worker' and v_sched.assigned_worker_id != v_caller.id then
    raise exception 'You can only start operations assigned to you.';
  end if;

  if v_sched.status = 'completed' then
    raise exception 'This operation is already completed.';
  end if;

  update public.operation_schedules
  set status = 'in_progress',
      actual_start_time = coalesce(actual_start_time, now()),
      updated_at = now()
  where id = p_schedule_id;

  if v_sched.purchase_order_id is not null then
    update public.purchase_orders
    set execution_status = 'in_progress', updated_at = now()
    where id = v_sched.purchase_order_id;
  end if;

  return jsonb_build_object('ok', true, 'status', 'in_progress');
end;
$$;

-- C. rpc_verify_operation_schedule (Staff or Admin approves, returns, or requests info)
create or replace function public.rpc_verify_operation_schedule(
  p_schedule_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_sched public.operation_schedules;
  v_item record;
  v_bal record;
  v_before numeric;
  v_change numeric;
  v_after numeric;
  v_already boolean;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null or v_caller.role not in ('owner', 'manager') then
    raise exception 'Unauthorized: Only Staff or Admin can verify operations.';
  end if;

  select * into v_sched from public.operation_schedules where id = p_schedule_id;
  if v_sched.id is null then raise exception 'Schedule not found.'; end if;

  if p_action = 'approve' then
    if v_sched.status = 'completed' then
      return jsonb_build_object('ok', true, 'message', 'Schedule is already completed.');
    end if;

    -- Check idempotent stock movement posting
    select exists(select 1 from public.stock_movements where schedule_id = p_schedule_id) into v_already;
    if not v_already then
      for v_item in select * from public.operation_schedule_items where schedule_id = p_schedule_id
      loop
        select * into v_bal from public.stock_balances
        where material_id = v_item.material_id and warehouse_id = v_sched.warehouse_id
        for update;

        if v_bal.id is null then
          insert into public.stock_balances (id, material_id, warehouse_id, weight_kg)
          values (gen_random_uuid(), v_item.material_id, v_sched.warehouse_id, 0)
          returning * into v_bal;
        end if;

        v_before := v_bal.weight_kg;
        v_change := case when v_sched.type = 'unloading' then v_item.net_weight_kg else -v_item.net_weight_kg end;
        v_after := greatest(0, v_before + v_change);

        update public.stock_balances set weight_kg = v_after where id = v_bal.id;

        insert into public.stock_movements (
          id, material_id, warehouse_id, weight_kg, direction,
          schedule_id, schedule_item_id, created_at, created_by
        )
        values (
          gen_random_uuid(), v_item.material_id, v_sched.warehouse_id, v_item.net_weight_kg,
          case when v_sched.type = 'unloading' then 'in' else 'out' end,
          v_sched.id, v_item.id, now(), v_caller.id
        );

        insert into public.inventory_history (
          id, material_id, material_name, warehouse_id, warehouse_name,
          container_number, quantity_before, quantity_change, quantity_after,
          packaging_type_id, packaging_type_name, packaging_count,
          packaging_unit_tare_kg, total_packaging_weight_kg, gross_weight_kg,
          operation_type, operation_reason, reference, po_number, so_number,
          performed_by, performed_by_name, created_at
        )
        values (
          gen_random_uuid(), v_item.material_id, v_item.material_name, v_sched.warehouse_id,
          (select name from public.warehouses where id = v_sched.warehouse_id),
          v_sched.poso_number, v_before, v_change, v_after,
          v_item.packaging_type_id, v_item.packaging_type_name, v_item.package_count,
          v_item.tare_per_package_kg, v_item.total_tare_weight_kg, v_item.gross_weight_kg,
          case when v_sched.type = 'unloading' then 'Unloading Receipt' else 'Loading Dispatch' end,
          'Schedule Verification Approval', v_sched.schedule_number,
          case when v_sched.type = 'unloading' then v_sched.poso_number else null end,
          case when v_sched.type = 'loading' then v_sched.poso_number else null end,
          v_caller.id, v_caller.name, now()
        );
      end loop;
    end if;

    update public.operation_schedules
    set status = 'completed', verified_at = now(), verified_by = v_caller.id,
        verified_by_name = v_caller.name, updated_at = now()
    where id = p_schedule_id;

    if v_sched.purchase_order_id is not null then
      update public.purchase_orders
      set execution_status = 'completed', completed_at = now(), completed_by = v_caller.id, updated_at = now()
      where id = v_sched.purchase_order_id;
    end if;

    if v_sched.shipment_id is not null then
      update public.shipments
      set status = case when v_sched.type = 'unloading' then 'Completed' else 'Dispatched' end
      where id = v_sched.shipment_id;
    end if;

    insert into public.notifications (
      id, recipient_id, event_type, title, message, target_type, target_id, link, read, created_at
    )
    values (
      gen_random_uuid(), v_sched.assigned_worker_id, 'schedule_completed',
      'Schedule Approved & Completed',
      v_sched.schedule_number || ' has been approved and completed by ' || v_caller.name || '.',
      'schedule', v_sched.id::text, '/worker', false, now()
    );

    return jsonb_build_object('ok', true, 'status', 'completed');
  elsif p_action = 'return' then
    if trim(coalesce(p_reason, '')) = '' then
      raise exception 'A return reason is required.';
    end if;

    update public.operation_schedules
    set status = 'returned_for_correction', return_reason = trim(p_reason), updated_at = now()
    where id = p_schedule_id;

    insert into public.notifications (
      id, recipient_id, event_type, title, message, target_type, target_id, link, read, created_at
    )
    values (
      gen_random_uuid(), v_sched.assigned_worker_id, 'schedule_returned',
      'Schedule Returned for Correction',
      v_sched.schedule_number || ' was returned for correction: ' || trim(p_reason),
      'schedule', v_sched.id::text, '/worker', false, now()
    );

    return jsonb_build_object('ok', true, 'status', 'returned_for_correction');
  elsif p_action = 'request_info' then
    if trim(coalesce(p_reason, '')) = '' then
      raise exception 'An information request note is required.';
    end if;

    update public.operation_schedules
    set info_request_note = trim(p_reason), updated_at = now()
    where id = p_schedule_id;

    insert into public.notifications (
      id, recipient_id, event_type, title, message, target_type, target_id, link, read, created_at
    )
    values (
      gen_random_uuid(), v_sched.assigned_worker_id, 'schedule_info_requested',
      'Information Requested on Schedule',
      v_sched.schedule_number || ' requires additional info: ' || trim(p_reason),
      'schedule', v_sched.id::text, '/worker', false, now()
    );

    return jsonb_build_object('ok', true, 'status', v_sched.status);
  else
    raise exception 'Invalid verification action.';
  end if;
end;
$$;
