-- ============================================================================
-- STOCKFLOW / RM — MIGRATION 0007: WORKER ASSIGNMENTS & OFFERS USER PORTAL
-- 1. Worker PO/SO Assignment & Date Scheduling (Today / Tomorrow / Future)
-- 2. Offers User Account Type with Registration & Admin Approval Workflow
-- 3. Selling Offers linked to POs (9 validated fields) & Admin Approval
-- 4. Automatic Sold Section when Selling Offers are commercially Accepted
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND USERS TABLE FOR OFFERS USER ROLE & REGISTRATION APPROVAL
-- ----------------------------------------------------------------------------

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('owner', 'manager', 'worker', 'moderator', 'offers_user'));

alter table public.users drop constraint if exists users_worker_warehouse_check;
alter table public.users add constraint users_worker_warehouse_check check (
  (role = 'worker' and warehouse_id is not null and company_id is null)
  or (role in ('owner', 'manager', 'moderator', 'offers_user') and warehouse_id is null and company_id is null)
);

alter table public.users
  add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.users
  add column if not exists registration_notes text;

create index if not exists idx_users_approval_status on public.users (approval_status);

-- Update current_app_user() to support active approved offers_user
create or replace function public.current_app_user()
returns public.users
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.*
  from public.users u
  where auth.uid() is not null
    and u.auth_user_id = auth.uid()
    and u.active = true
    and u.approval_status = 'approved'
    and u.role in ('owner', 'manager', 'worker', 'moderator', 'offers_user')
  limit 1;
$$;

revoke all on function public.current_app_user() from public, anon;
grant execute on function public.current_app_user() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. EXTEND PURCHASE_ORDERS FOR WORKER ASSIGNMENTS & SCHEDULING
-- ----------------------------------------------------------------------------

alter table public.purchase_orders
  add column if not exists assigned_worker_id uuid references public.users (id) on delete set null;

alter table public.purchase_orders
  add column if not exists assigned_by uuid references public.users (id) on delete set null;

alter table public.purchase_orders
  add column if not exists assigned_at timestamptz;

alter table public.purchase_orders
  add column if not exists scheduled_date date;

alter table public.purchase_orders
  add column if not exists execution_status text not null default 'unassigned'
  check (execution_status in ('unassigned', 'assigned', 'in_progress', 'completed'));

alter table public.purchase_orders
  add column if not exists completion_notes text;

alter table public.purchase_orders
  add column if not exists completed_at timestamptz;

alter table public.purchase_orders
  add column if not exists completed_by uuid references public.users (id) on delete set null;

create index if not exists idx_po_assigned_worker on public.purchase_orders (assigned_worker_id);
create index if not exists idx_po_scheduled_date on public.purchase_orders (scheduled_date);
create index if not exists idx_po_execution_status on public.purchase_orders (execution_status);

-- ----------------------------------------------------------------------------
-- 3. EXTEND OFFERS TABLE FOR SELLING OFFERS LINKED TO POs & SOLD DEALS
-- ----------------------------------------------------------------------------

alter table public.offers
  add column if not exists po_id uuid references public.purchase_orders (id) on delete set null;

alter table public.offers
  add column if not exists po_number text;

alter table public.offers
  add column if not exists client_name text;

alter table public.offers
  add column if not exists contact_number text;

alter table public.offers
  add column if not exists email_address text;

alter table public.offers
  add column if not exists origin text;

alter table public.offers
  add column if not exists destination text;

alter table public.offers
  add column if not exists sold_at timestamptz;

alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check
  check (status in ('draft', 'received', 'under_review', 'negotiating', 'won', 'lost', 'accepted'));

create index if not exists idx_offers_po_number on public.offers (po_number);
create index if not exists idx_offers_sold_at on public.offers (sold_at);

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- Ensure RLS on purchase_orders enforces worker assignment privacy
alter table public.purchase_orders enable row level security;

drop policy if exists po_select on public.purchase_orders;
drop policy if exists po_worker_select on public.purchase_orders;
drop policy if exists po_staff_admin_select on public.purchase_orders;

create policy po_staff_admin_select on public.purchase_orders
  for select to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) in ('owner', 'manager')
  );

create policy po_worker_select on public.purchase_orders
  for select to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'worker'
    and assigned_worker_id = (select id from public.users where auth_user_id = auth.uid())
  );

-- NEVER grant DELETE on purchase_orders to authenticated users
revoke delete on public.purchase_orders from authenticated;

-- Offers RLS policies
alter table public.offers enable row level security;

drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers
  for select to authenticated
  using (
    -- Admin and Moderator have full visibility of active records
    ((select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
     and (deleted_at is null or (select role from public.users where auth_user_id = auth.uid()) = 'owner'))
    -- Offers Users can view all approved purchasing offers, sold deals, and their own submitted selling offers
    or (
      (select role from public.users where auth_user_id = auth.uid()) = 'offers_user'
      and deleted_at is null
      and (
        (kind = 'purchasing' and approval_status = 'approved')
        or created_by = (select id from public.users where auth_user_id = auth.uid())
        or status = 'accepted'
      )
    )
  );

drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    -- Moderator can create offers
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
    -- Offers User can create only selling offers linked to POs
    or (
      (select role from public.users where auth_user_id = auth.uid()) = 'offers_user'
      and kind = 'selling'
      and created_by = (select id from public.users where auth_user_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RPC FUNCTIONS FOR WORKER ASSIGNMENTS & OFFERS WORKFLOWS
-- ----------------------------------------------------------------------------

-- 5.1 Staff assigns PO/SO to worker with scheduled date
create or replace function public.rpc_assign_worker_po(
  p_order_number text,
  p_worker_id uuid,
  p_scheduled_date date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_order public.purchase_orders;
  v_worker public.users;
begin
  v_caller := public.current_app_user();
  if v_caller is null or v_caller.role not in ('owner', 'manager') then
    raise exception 'Unauthorized: Only Staff or Admin can assign workers to orders.';
  end if;

  select * into v_order from public.purchase_orders where number = p_order_number;
  if v_order is null then
    raise exception 'Order not found: %', p_order_number;
  end if;

  select * into v_worker from public.users where id = p_worker_id and active = true;
  if v_worker is null or v_worker.role != 'worker' then
    raise exception 'Target user is not an active Worker.';
  end if;

  update public.purchase_orders
  set assigned_worker_id = v_worker.id,
      assigned_by = v_caller.id,
      assigned_at = now(),
      scheduled_date = coalesce(p_scheduled_date, current_date),
      execution_status = 'assigned',
      notes = case when p_notes is not null and length(trim(p_notes)) > 0 then trim(p_notes) else notes end,
      updated_at = now()
  where id = v_order.id;

  -- Create in-app notification for the assigned worker
  perform public.rpc_create_notification(
    v_worker.id,
    'assignment',
    'New Task Assigned: ' || v_order.number,
    'You have been assigned order ' || v_order.number || ' scheduled for ' || to_char(coalesce(p_scheduled_date, current_date), 'YYYY-MM-DD') || '.',
    'purchase_order',
    v_order.number
  );

  return jsonb_build_object(
    'ok', true,
    'orderNumber', v_order.number,
    'assignedWorkerId', v_worker.id,
    'assignedWorkerName', v_worker.name,
    'scheduledDate', to_char(coalesce(p_scheduled_date, current_date), 'YYYY-MM-DD'),
    'executionStatus', 'assigned'
  );
end;
$$;

-- 5.2 Worker completes assigned task with evidence
create or replace function public.rpc_complete_worker_po(
  p_order_number text,
  p_completion_notes text default null
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
  if v_caller is null then
    raise exception 'Unauthorized.';
  end if;

  select * into v_order from public.purchase_orders where number = p_order_number;
  if v_order is null then
    raise exception 'Order not found: %', p_order_number;
  end if;

  if v_caller.role = 'worker' and (v_order.assigned_worker_id is null or v_order.assigned_worker_id != v_caller.id) then
    raise exception 'You are not the assigned worker for this order.';
  end if;

  update public.purchase_orders
  set execution_status = 'completed',
      completion_notes = p_completion_notes,
      completed_at = now(),
      completed_by = v_caller.id,
      updated_at = now()
  where id = v_order.id;

  -- Notify assigner if recorded
  if v_order.assigned_by is not null then
    perform public.rpc_create_notification(
      v_order.assigned_by,
      'completion',
      'Task Completed: ' || v_order.number,
      v_caller.name || ' has marked task ' || v_order.number || ' as completed.',
      'purchase_order',
      v_order.number
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'orderNumber', v_order.number,
    'executionStatus', 'completed',
    'completedAt', now()
  );
end;
$$;

-- 5.3 Submit Selling Offer linked to PO (All 9 required fields)
create or replace function public.rpc_submit_selling_offer(
  p_po_number text,
  p_material_type text,
  p_material_name text,
  p_client_name text,
  p_contact_number text,
  p_email_address text,
  p_price numeric,
  p_origin text,
  p_destination text
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

  select * into v_order from public.purchase_orders where number = p_po_number;

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
    po_id, po_number, client_name, contact_number, email_address, origin, destination
  ) values (
    v_offer_id, v_offer_num, 'selling', p_material_name, p_material_type, 'Standard', 1, 'lot',
    p_price, 'EUR', p_price, p_origin, p_origin, 1, 'Selling offer for ' || p_material_name || ' linked to ' || p_po_number,
    'medium', 'Spot', 'Trading', 'received', 'pending', v_caller.id, now(), now(),
    v_order.id, p_po_number, p_client_name, p_contact_number, p_email_address, p_origin, p_destination
  );

  -- Notify Admins of the new Selling Offer submission
  for v_admin_id in (select id from public.users where role = 'owner' and active = true) loop
    perform public.rpc_create_notification(
      v_admin_id,
      'offer_submission',
      'New Selling Offer: ' || v_offer_num,
      v_caller.name || ' submitted Selling Offer ' || v_offer_num || ' linked to ' || p_po_number || ' for ' || p_client_name || '.',
      'offer',
      v_offer_id::text
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'offerId', v_offer_id,
    'number', v_offer_num,
    'poNumber', p_po_number,
    'status', 'received',
    'approvalStatus', 'pending'
  );
end;
$$;

-- 5.4 Admin reviews and approves/rejects Selling Offer
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
begin
  v_caller := public.current_app_user();
  if v_caller is null or v_caller.role != 'owner' then
    raise exception 'Unauthorized: Only Admin can approve or reject selling offers.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select * into v_offer from public.offers where number = p_offer_number and deleted_at is null;
  if v_offer is null then
    raise exception 'Offer not found: %', p_offer_number;
  end if;

  update public.offers
  set approval_status = p_decision,
      admin_decision_note = p_note,
      decided_by = v_caller.id,
      decided_at = now(),
      updated_at = now()
  where id = v_offer.id;

  -- In-app notification to submitting user
  perform public.rpc_create_notification(
    v_offer.created_by,
    'offer_decision',
    'Selling Offer ' || p_decision || ': ' || v_offer.number,
    'Admin has ' || p_decision || ' your Selling Offer ' || v_offer.number || case when p_note is not null and length(trim(p_note)) > 0 then '. Note: ' || trim(p_note) else '.' end,
    'offer',
    v_offer.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'offerNumber', v_offer.number,
    'approvalStatus', p_decision,
    'decidedAt', now()
  );
end;
$$;

-- 5.5 Commercial Acceptance -> Move to Sold
create or replace function public.rpc_accept_selling_offer(
  p_offer_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  v_caller := public.current_app_user();
  if v_caller is null or v_caller.role not in ('owner', 'moderator') then
    raise exception 'Unauthorized: Only Admin or Moderator can accept an offer.';
  end if;

  select * into v_offer from public.offers where number = p_offer_number and deleted_at is null;
  if v_offer is null then
    raise exception 'Offer not found: %', p_offer_number;
  end if;

  if v_offer.approval_status != 'approved' then
    raise exception 'Only approved offers can be commercially accepted.';
  end if;

  update public.offers
  set status = 'accepted',
      sold_at = now(),
      updated_at = now()
  where id = v_offer.id;

  -- In-app notification to submitter
  perform public.rpc_create_notification(
    v_offer.created_by,
    'offer_sold',
    'Deal Accepted & Marked as Sold: ' || v_offer.number,
    'Your Selling Offer ' || v_offer.number || ' has reached commercial acceptance and is now marked as Sold.',
    'offer',
    v_offer.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'offerNumber', v_offer.number,
    'status', 'accepted',
    'soldAt', now()
  );
end;
$$;

-- 5.6 Admin approves or rejects Offers User registration
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
  if v_caller is null or v_caller.role != 'owner' then
    raise exception 'Unauthorized: Only Admin can approve or reject account registrations.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select * into v_target from public.users where id = p_user_id;
  if v_target is null then
    raise exception 'User not found.';
  end if;

  update public.users
  set approval_status = p_decision,
      active = (p_decision = 'approved'),
      registration_notes = coalesce(p_note, registration_notes),
      updated_at = now()
  where id = v_target.id;

  -- In-app notification to user
  perform public.rpc_create_notification(
    v_target.id,
    'account_' || p_decision,
    'Registration ' || p_decision,
    case when p_decision = 'approved'
      then 'Your Offers User registration has been approved. You can now access the Offers Portal.'
      else 'Your Offers User registration was rejected.' || case when p_note is not null then ' Note: ' || p_note else '' end
    end,
    'user',
    v_target.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'userId', v_target.id,
    'approvalStatus', p_decision,
    'active', (p_decision = 'approved')
  );
end;
$$;

-- Grant execution permissions
grant execute on function public.rpc_assign_worker_po(text, uuid, date, text) to authenticated, service_role;
grant execute on function public.rpc_complete_worker_po(text, text) to authenticated, service_role;
grant execute on function public.rpc_submit_selling_offer(text, text, text, text, text, text, numeric, text, text) to authenticated, service_role;
grant execute on function public.rpc_decide_selling_offer(text, text, text) to authenticated, service_role;
grant execute on function public.rpc_accept_selling_offer(text) to authenticated, service_role;
grant execute on function public.rpc_decide_offers_user_registration(uuid, text, text) to authenticated, service_role;

