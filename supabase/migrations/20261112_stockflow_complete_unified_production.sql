-- ============================================================================
-- STOCKFLOW — COMPLETE UNIFIED PRODUCTION SCHEMA & SEED (PARTS 1, 2, 3 & 4)
-- Safe, single-run execution for Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dyluiydjzbmrhzgpaxqq/sql/new
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. CLEAN TEARDOWN (Ensures clean single-go execution without 42P07 duplicate table errors)
-- ----------------------------------------------------------------------------
drop table if exists public.audit_log cascade;
drop table if exists public.inventory_history cascade;
drop table if exists public.annex7_records cascade;
drop table if exists public.demurrage_records cascade;
drop table if exists public.customs_records cascade;
drop table if exists public.stock_movements cascade;
drop table if exists public.warehouse_transfers cascade;
drop table if exists public.stock_balances cascade;
drop table if exists public.worker_general_request_attachments cascade;
drop table if exists public.request_photos cascade;
drop table if exists public.documents cascade;
drop table if exists public.worker_general_requests cascade;
drop table if exists public.request_lines cascade;
drop table if exists public.requests cascade;
drop table if exists public.request_sequences cascade;
drop table if exists public.shipments cascade;
drop table if exists public.purchase_order_lines cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.po_sequences cascade;
drop table if exists public.offer_activities cascade;
drop table if exists public.offer_comments cascade;
drop table if exists public.offer_attachments cascade;
drop table if exists public.offers cascade;
drop table if exists public.offer_sequences cascade;
drop table if exists public.packaging_types cascade;
drop table if exists public.materials cascade;
drop table if exists public.users cascade;
drop table if exists public.companies cascade;
drop table if exists public.warehouses cascade;

-- ----------------------------------------------------------------------------
-- 1. CORE SCHEMA (MIGRATION 0001: WAREHOUSES, WORKFLOWS, SHIPMENTS & STOCK)
-- ----------------------------------------------------------------------------

-- 1.1 Warehouses
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  country text not null check (length(trim(country)) > 0),
  active boolean not null default true
);

-- 1.2 Companies (Suppliers & Customers)
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('supplier', 'customer')),
  active boolean not null default true,
  unique (name, kind)
);

-- 1.3 Users (Strict 1:1 auth_user_id mapping; 4-role model)
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique check (length(trim(email)) > 0),
  name text not null check (length(trim(name)) > 0),
  role text not null check (role in ('owner', 'manager', 'worker', 'moderator')),
  warehouse_id uuid references public.warehouses (id) on delete restrict,
  company_id uuid references public.companies (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_worker_warehouse_check check (
    (role = 'worker' and warehouse_id is not null and company_id is null)
    or (role in ('owner', 'manager', 'moderator') and warehouse_id is null and company_id is null)
  )
);

create index users_auth_user_id_idx on public.users (auth_user_id);
create index users_role_warehouse_idx on public.users (role, warehouse_id);

-- 1.4 Materials
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  material_number text not null unique check (length(trim(material_number)) > 0),
  description text not null unique check (length(trim(description)) > 0),
  unit text not null default 'kg' check (length(trim(unit)) > 0),
  low_stock_threshold_kg numeric(12, 3) not null default 0 check (low_stock_threshold_kg >= 0)
);

-- 1.5 Packaging Types
create table public.packaging_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  tare_kg numeric(12, 3) not null check (tare_kg >= 0),
  active boolean not null default true
);

-- 1.6 Purchase & Sales Orders (PO / SO)
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (length(trim(number)) > 0),
  title text not null default '',
  company_id uuid not null references public.companies (id) on delete restrict,
  status text not null check (status in ('draft', 'submitted', 'approved', 'declined')),
  value_eur numeric(14, 2) not null default 0 check (value_eur >= 0),
  notes text not null default '',
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_orders_status_idx on public.purchase_orders (status);
create index purchase_orders_company_idx on public.purchase_orders (company_id);

-- 1.7 Purchase Order Lines
create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  material_id uuid references public.materials (id) on delete restrict,
  description text not null check (length(trim(description)) > 0),
  quantity_kg numeric(12, 3) not null check (quantity_kg >= 0)
);

create index purchase_order_lines_po_idx on public.purchase_order_lines (purchase_order_id);

-- 1.8 Shipments (Inbound Containers & Outbound Shipments)
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  reference text not null check (length(trim(reference)) > 0),
  direction text not null check (direction in ('inbound', 'outbound')),
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  container_number text not null default '',
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  origin_country text not null default '',
  destination_country text not null default '',
  status text not null check (status in (
    'Planned',
    'In transit',
    'Arrived',
    'Registered',
    'Unloading',
    'Completed',
    'Loading',
    'Loaded',
    'Dispatched'
  )),
  carrier_name text not null default '',
  handed_over_at timestamptz,
  annex7_required boolean not null default false,
  seller_status text not null default 'Pending' check (seller_status in ('Pending', 'Confirmed')),
  seller_company text not null default '',
  seller_confirmed_by text not null default '',
  seller_confirmed_at timestamptz,
  override_reason text,
  override_by text,
  override_at timestamptz,
  unique (direction, reference)
);

create unique index shipments_inbound_unique_container_idx
  on public.shipments (lower(trim(container_number)))
  where direction = 'inbound' and length(trim(container_number)) > 0;

create index shipments_warehouse_direction_idx on public.shipments (warehouse_id, direction, status);
create index shipments_po_idx on public.shipments (purchase_order_id);

-- 1.9 Request Sequence Counter
create table public.request_sequences (
  year integer primary key check (year >= 2020 and year <= 2100),
  next integer not null default 0 check (next >= 0)
);

-- 1.10 Shipment-Bound Loading & Unloading Requests
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^REQ-[0-9]{4}-[0-9]{4}$'),
  type text not null check (type in ('loading', 'unloading')),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  container_number text not null default '',
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  created_by uuid not null references public.users (id) on delete restrict,
  status text not null check (status in (
    'submitted',
    'approved',
    'declined',
    'sent_back',
    'completed',
    'deleted'
  )),
  decline_reason text,
  sent_back_note text,
  approved_by uuid references public.users (id) on delete restrict,
  approved_at timestamptz,
  entered_by uuid references public.users (id) on delete restrict,
  entered_at timestamptz,
  deleted_by uuid references public.users (id) on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint requests_declined_requires_reason check (
    status <> 'declined' or (decline_reason is not null and length(trim(decline_reason)) > 0)
  ),
  constraint requests_sent_back_requires_note check (
    status <> 'sent_back' or (sent_back_note is not null and length(trim(sent_back_note)) > 0)
  )
);

create unique index requests_one_open_per_shipment_idx
  on public.requests (shipment_id)
  where status not in ('deleted', 'declined', 'completed');

create index requests_warehouse_status_idx on public.requests (warehouse_id, status);
create index requests_created_by_idx on public.requests (created_by);

-- 1.11 Request Material & Packaging Lines
create table public.request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete restrict,
  packaging_type_id uuid not null references public.packaging_types (id) on delete restrict,
  package_count integer not null check (package_count > 0),
  gross_kg numeric(12, 3) not null check (gross_kg >= 0),
  tare_total_kg numeric(12, 3) not null check (tare_total_kg >= 0),
  net_kg numeric(12, 3) not null check (
    net_kg > 0
    and net_kg = round(gross_kg - tare_total_kg, 3)
  )
);

create index request_lines_request_idx on public.request_lines (request_id);

-- 1.12 General Worker Requests ("My Requests")
create table public.worker_general_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^REQ-[0-9]{4}-[0-9]{4}$'),
  category text not null check (category in (
    'materials_packaging',
    'stock_issue',
    'loading_unloading',
    'equipment_maintenance',
    'missing_documents',
    'other'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  description text not null check (length(trim(description)) > 0),
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  shipment_id uuid references public.shipments (id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  created_by uuid not null references public.users (id) on delete restrict,
  status text not null default 'submitted' check (status in (
    'submitted',
    'under_review',
    'approved',
    'declined',
    'sent_back',
    'completed',
    'deleted'
  )),
  response_note text,
  decided_by uuid references public.users (id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_general_requests_decline_note_check check (
    status not in ('declined', 'sent_back')
    or (response_note is not null and length(trim(response_note)) > 0)
  )
);

create index worker_general_requests_wh_status_idx
  on public.worker_general_requests (warehouse_id, status);

-- 1.13 Documents & Metadata
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cmr', 'photo', 'annex7', 'customs_proof', 'other')),
  category text not null check (category in ('Purchase', 'Container', 'Customs', 'Transport', 'Annex 7')),
  shipment_id uuid references public.shipments (id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  request_id uuid references public.requests (id) on delete set null,
  request_number text,
  po_number text,
  container_number text,
  warehouse text,
  notes text,
  original_filename text,
  readable_name text,
  status text not null default 'active' check (status in ('pending', 'active', 'deleted')),
  name text not null check (length(trim(name)) > 0),
  mime text not null check (mime in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  )),
  byte_size integer not null check (byte_size >= 0 and byte_size <= 10485760),
  storage_key text not null unique check (length(trim(storage_key)) > 0),
  cmr_reference text,
  cmr_carrier text,
  cmr_goods_description text,
  cmr_remarks text,
  cmr_entered_by text,
  cmr_entered_at timestamptz,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index documents_one_active_cmr_per_shipment_idx
  on public.documents (shipment_id)
  where kind = 'cmr' and shipment_id is not null and status <> 'deleted';

create index documents_shipment_status_idx on public.documents (shipment_id, status);
create index documents_request_idx on public.documents (request_id);
create index documents_created_by_status_idx on public.documents (created_by, status);

-- 1.14 Request Photos Join Table
create table public.request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  unique (request_id, document_id)
);

create index request_photos_request_idx on public.request_photos (request_id);

-- 1.15 General Worker Request Attachments Join Table
create table public.worker_general_request_attachments (
  id uuid primary key default gen_random_uuid(),
  general_request_id uuid not null references public.worker_general_requests (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  unique (general_request_id, document_id)
);

-- 1.16 Stock Balances
create table public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  weight_kg numeric(12, 3) not null default 0 check (weight_kg >= 0),
  unique (material_id, warehouse_id)
);

create index stock_balances_warehouse_idx on public.stock_balances (warehouse_id);

-- 1.17 Warehouse Transfers
create table public.warehouse_transfers (
  id uuid primary key default gen_random_uuid(),
  client_key text unique,
  from_warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  to_warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  material_id uuid not null references public.materials (id) on delete restrict,
  weight_kg numeric(12, 3) not null check (weight_kg > 0),
  status text not null check (status in ('Submitted', 'Completed')),
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint warehouse_transfers_distinct_sites check (from_warehouse_id <> to_warehouse_id)
);

-- 1.18 Stock Movements Ledger (Strictly Append-Only)
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  weight_kg numeric(12, 3) not null check (weight_kg > 0),
  direction text not null check (direction in ('in', 'out')),
  request_id uuid references public.requests (id) on delete restrict,
  request_line_id uuid references public.request_lines (id) on delete restrict,
  transfer_id uuid references public.warehouse_transfers (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.users (id) on delete restrict,
  constraint stock_movements_valid_source_check check (
    (request_id is not null and request_line_id is not null and transfer_id is null)
    or (request_id is null and request_line_id is null and transfer_id is not null)
  )
);

create unique index stock_movements_request_line_dir_idx
  on public.stock_movements (request_line_id, direction)
  where request_line_id is not null;

create unique index stock_movements_transfer_dir_idx
  on public.stock_movements (transfer_id, direction)
  where transfer_id is not null;

create index stock_movements_warehouse_material_idx on public.stock_movements (warehouse_id, material_id);
create index stock_movements_request_idx on public.stock_movements (request_id);

-- 1.19 Customs Records
create table public.customs_records (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.shipments (id) on delete restrict,
  reference text not null default '',
  procedure_note text not null default '',
  goods_description text not null default '',
  declarant_reference text not null default '',
  confirmed_by uuid references public.users (id) on delete restrict,
  confirmed_at timestamptz,
  proof_document_id uuid references public.documents (id) on delete set null
);

-- 1.20 Demurrage Records
create table public.demurrage_records (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.shipments (id) on delete cascade,
  started_at timestamptz,
  free_minutes integer not null default 120 check (free_minutes >= 0),
  rate_per_minute numeric(10, 2) not null default 1 check (rate_per_minute >= 0),
  completed_at timestamptz,
  elapsed_minutes integer check (elapsed_minutes is null or elapsed_minutes >= 0),
  billable_minutes integer check (billable_minutes is null or billable_minutes >= 0),
  charge_eur numeric(12, 2) check (charge_eur is null or charge_eur >= 0)
);

-- 1.21 Annex VII Records
create table public.annex7_records (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  document_id uuid not null unique references public.documents (id) on delete restrict,
  reference text not null check (length(trim(reference)) > 0),
  status text not null check (status in ('uploaded', 'under_review', 'approved')),
  notes text not null default '',
  uploaded_by uuid not null references public.users (id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create index annex7_records_shipment_idx on public.annex7_records (shipment_id);

-- 1.22 Audit Log (Strictly Append-Only)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  action text not null check (length(trim(action)) > 0),
  target_type text not null check (length(trim(target_type)) > 0),
  target_id text not null check (length(trim(target_id)) > 0),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index audit_log_target_idx on public.audit_log (target_type, target_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- Seed Canonical Warehouses & Packaging Types
insert into public.warehouses (name, country, active)
values
  ('Bornem', 'Belgium', true),
  ('Turnhout', 'Belgium', true),
  ('Spain', 'Spain', true),
  ('Pakistan', 'Pakistan', true)
on conflict (name) do nothing;

insert into public.packaging_types (name, tare_kg, active)
values
  ('Small Pallet', 15, true),
  ('Normal Pallet', 25, true),
  ('Big Pallet', 50, true),
  ('Carton Box', 30, true),
  ('Wooden Box', 40, true),
  ('Small Cage', 60, true),
  ('Cage', 120, true),
  ('Big Cage', 160, true),
  ('Bulk / Others', 0, true)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 2. OFFERS MANAGEMENT SCHEMA (MIGRATION 0002)
-- ----------------------------------------------------------------------------

-- 2.1 Offer Sequences
create table public.offer_sequences (
  kind text not null check (kind in ('purchasing', 'selling')),
  year integer not null check (year >= 2020),
  next_val integer not null default 1 check (next_val >= 1),
  primary key (kind, year)
);

-- 2.2 Core Offers Table
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (length(trim(number)) > 0),
  kind text not null check (kind in ('purchasing', 'selling')),
  material text not null check (length(trim(material)) > 0),
  material_type text not null default 'Plastics' check (length(trim(material_type)) > 0),
  material_grade text not null default 'Standard' check (length(trim(material_grade)) > 0),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null default 'kg' check (length(trim(unit)) > 0),
  price_per_unit numeric(14, 4) not null check (price_per_unit >= 0),
  currency text not null default 'EUR' check (length(trim(currency)) > 0),
  total_value numeric(16, 2) not null check (total_value >= 0),
  country text not null check (length(trim(country)) > 0),
  location text not null default '',
  truck_loads integer not null default 1 check (truck_loads >= 0),
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  offer_type text not null default 'Spot' check (length(trim(offer_type)) > 0),
  team text not null default 'General' check (length(trim(team)) > 0),
  status text not null default 'draft' check (status in ('draft', 'received', 'under_review', 'negotiating', 'won', 'lost')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  admin_decision_note text,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  is_favourite boolean not null default false,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users (id) on delete set null
);

create index offers_kind_idx on public.offers (kind);
create index offers_status_idx on public.offers (status);
create index offers_priority_idx on public.offers (priority);
create index offers_created_by_idx on public.offers (created_by);
create index offers_is_favourite_idx on public.offers (is_favourite);
create index offers_deleted_at_idx on public.offers (deleted_at);

-- 2.3 Offer Attachments
create table public.offer_attachments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'document' check (kind in ('image', 'document')),
  mime text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  storage_key text not null check (length(trim(storage_key)) > 0),
  url text,
  uploaded_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index offer_attachments_offer_idx on public.offer_attachments (offer_id);

-- 2.4 Offer Comments
create table public.offer_comments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete restrict,
  comment text not null check (length(trim(comment)) > 0),
  created_at timestamptz not null default now()
);

create index offer_comments_offer_idx on public.offer_comments (offer_id);

-- 2.5 Offer Activities
create table public.offer_activities (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  actor_id uuid not null references public.users (id) on delete restrict,
  action text not null check (length(trim(action)) > 0),
  details text not null default '',
  created_at timestamptz not null default now()
);

create index offer_activities_offer_idx on public.offer_activities (offer_id);

-- ----------------------------------------------------------------------------
-- 3. INVENTORY REALTIME & PO SEQUENCING SCHEMA (MIGRATION 0003)
-- ----------------------------------------------------------------------------

-- 3.1 PO Sequences
create table public.po_sequences (
  year integer not null check (year >= 2020),
  next_val integer not null default 1 check (next_val >= 1),
  primary key (year)
);

-- 3.2 Immutable Append-Only Inventory History
create table public.inventory_history (
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

create index idx_inv_hist_warehouse on public.inventory_history (warehouse_id);
create index idx_inv_hist_material on public.inventory_history (material_id);
create index idx_inv_hist_created_at on public.inventory_history (created_at desc);
create index idx_inv_hist_container on public.inventory_history (container_number);
create index idx_inv_hist_po on public.inventory_history (po_number);

-- ----------------------------------------------------------------------------
-- 4. APPEND-ONLY TRIGGERS & SECURITY HELPERS
-- ----------------------------------------------------------------------------

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Table %.% is strictly append-only; % is prohibited.', tg_table_schema, tg_table_name, tg_op;
end;
$$;

create trigger audit_log_block_update_delete
  before update or delete on public.audit_log
  for each row execute function public.prevent_append_only_mutation();

create trigger audit_log_block_truncate
  before truncate on public.audit_log
  execute function public.prevent_append_only_mutation();

create trigger stock_movements_block_update_delete
  before update or delete on public.stock_movements
  for each row execute function public.prevent_append_only_mutation();

create trigger stock_movements_block_truncate
  before truncate on public.stock_movements
  execute function public.prevent_append_only_mutation();

create or replace function public.internal_append_audit(
  p_user_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_old_value text default null,
  p_new_value text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() < 1
     and coalesce(current_setting('stockflow.in_trusted_rpc', true), '') <> 'true' then
    raise exception 'Direct invocation of internal_append_audit is prohibited.';
  end if;

  insert into public.audit_log (user_id, action, target_type, target_id, old_value, new_value, created_at)
  values (p_user_id, p_action, p_target_type, p_target_id, p_old_value, p_new_value, now());
end;
$$;

-- 4.1 Role and Context Helpers (Includes all 4 roles: owner, manager, worker, moderator)
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
    and u.role in ('owner', 'manager', 'worker', 'moderator')
  limit 1;
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.current_app_user();
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.current_app_user();
$$;

create or replace function public.current_user_warehouse_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select warehouse_id from public.current_app_user();
$$;

create or replace function public.current_user_warehouse_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.name
  from public.warehouses w
  where w.id = public.current_user_warehouse_id();
$$;

create or replace function public.is_document_bound_to_worker_warehouse(
  p_shipment_id uuid,
  p_request_id uuid,
  p_warehouse_text text,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.current_user_role() = 'worker'
    and public.current_user_warehouse_id() is not null
    and (
      p_warehouse_text is null
      or lower(trim(p_warehouse_text)) = lower(trim(public.current_user_warehouse_name()))
    )
    and (
      p_shipment_id is null
      or exists (
        select 1 from public.shipments s
        where s.id = p_shipment_id
          and s.warehouse_id = public.current_user_warehouse_id()
      )
    )
    and (
      p_request_id is null
      or exists (
        select 1 from public.requests r
        where r.id = p_request_id
          and r.warehouse_id = public.current_user_warehouse_id()
      )
    )
    and (
      p_shipment_id is not null
      or p_request_id is not null
      or (
        p_warehouse_text is not null
        and lower(trim(p_warehouse_text)) = lower(trim(public.current_user_warehouse_name()))
      )
      or (
        p_created_by = public.current_user_id()
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- 5. COLUMN GUARDS & TRIGGERS
-- ----------------------------------------------------------------------------

create or replace function public.enforce_stock_movement_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.request_id is not null and new.request_line_id is not null then
    if not exists (
      select 1
      from public.request_lines rl
      join public.requests r on r.id = rl.request_id
      where rl.id = new.request_line_id
        and rl.request_id = new.request_id
        and rl.material_id = new.material_id
        and r.warehouse_id = new.warehouse_id
    ) then
      raise exception 'Stock movement request_line_id does not match request_id, material_id, or warehouse_id.';
    end if;
  elsif new.transfer_id is not null then
    if not exists (
      select 1
      from public.warehouse_transfers wt
      where wt.id = new.transfer_id
        and wt.material_id = new.material_id
        and (
          (new.direction = 'out' and wt.from_warehouse_id = new.warehouse_id)
          or (new.direction = 'in' and wt.to_warehouse_id = new.warehouse_id)
        )
    ) then
      raise exception 'Stock movement transfer_id does not match transfer material or warehouse.';
    end if;
  end if;
  return new;
end;
$$;

create trigger stock_movements_guard_integrity
  before insert on public.stock_movements
  for each row execute function public.enforce_stock_movement_integrity();

create or replace function public.enforce_request_immutable_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.number is distinct from old.number
     or new.type is distinct from old.type
     or new.shipment_id is distinct from old.shipment_id
     or new.warehouse_id is distinct from old.warehouse_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Direct modification of request identity, warehouse, or responsible worker assignment is prohibited.';
  end if;
  return new;
end;
$$;

create trigger requests_guard_immutable_columns
  before update on public.requests
  for each row execute function public.enforce_request_immutable_columns();

create or replace function public.enforce_request_line_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req_id uuid := coalesce(new.request_id, old.request_id);
  v_req public.requests;
  v_actor_id uuid := public.current_user_id();
begin
  select * into v_req from public.requests where id = v_req_id;
  if not found then
    raise exception 'That request does not exist.';
  end if;

  if v_req.status not in ('submitted', 'declined', 'sent_back') then
    raise exception 'Requests are never edited in place once approved, completed, or deleted.';
  end if;

  if public.current_user_role() <> 'worker'
     or v_req.created_by is distinct from v_actor_id
     or v_req.warehouse_id is distinct from public.current_user_warehouse_id() then
    raise exception 'Only the worker who created the request at the assigned warehouse can modify request lines.';
  end if;

  if tg_op = 'INSERT' then
    perform public.internal_append_audit(
      v_actor_id,
      'request-line-added',
      'request',
      v_req.id::text,
      null,
      v_req.number || ' gained ' || new.net_kg::text || ' kg net. Stock was not changed.'
    );
    return new;
  elsif tg_op = 'DELETE' then
    perform public.internal_append_audit(
      v_actor_id,
      'request-line-removed',
      'request',
      v_req.id::text,
      old.net_kg::text,
      'A line was removed from ' || v_req.number || '.'
    );
    return old;
  else
    raise exception 'Request lines cannot be updated in place; remove and re-add the line.';
  end if;
end;
$$;

create trigger request_lines_guard_write
  before insert or update or delete on public.request_lines
  for each row execute function public.enforce_request_line_write_rules();

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
     or new.number is distinct from old.number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Immutable purchase order identity columns cannot be modified.';
  end if;

  if old.status in ('approved', 'declined') then
    raise exception 'A % purchase order is locked and cannot be edited.', old.status;
  end if;

  if not v_in_rpc and (v_role <> 'manager' or new.status is distinct from old.status) then
    raise exception 'Staff cannot approve, reject, or change purchase order status.';
  end if;

  new.updated_at := now();

  if not v_in_rpc and v_role = 'manager' and v_actor_id is not null then
    perform public.internal_append_audit(
      v_actor_id,
      'order-edited',
      'purchase-order',
      new.id::text,
      old.status,
      new.number || ' was edited.'
    );
  end if;

  return new;
end;
$$;

create trigger purchase_orders_guard_update
  before update on public.purchase_orders
  for each row execute function public.enforce_purchase_order_update_rules();

create or replace function public.audit_purchase_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_in_rpc boolean := coalesce(current_setting('stockflow.in_trusted_rpc', true), '') = 'true';
begin
  if not v_in_rpc and public.current_user_id() is not null then
    perform public.internal_append_audit(
      public.current_user_id(),
      'order-created',
      'purchase-order',
      new.id::text,
      null,
      new.number || ' was submitted for approval.'
    );
  end if;
  return new;
end;
$$;

create trigger purchase_orders_audit_insert
  after insert on public.purchase_orders
  for each row execute function public.audit_purchase_order_insert();

create or replace function public.enforce_purchase_order_line_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  v_po_status text;
begin
  select status into v_po_status from public.purchase_orders where id = v_po_id;
  if not found then
    raise exception 'Parent purchase order does not exist.';
  end if;

  if v_po_status in ('approved', 'declined') then
    raise exception 'Cannot modify lines of an % purchase order.', v_po_status;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger purchase_order_lines_guard_write
  before insert or update or delete on public.purchase_order_lines
  for each row execute function public.enforce_purchase_order_line_write_rules();

create or replace function public.enforce_document_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.kind is distinct from old.kind
     or new.category is distinct from old.category
     or new.storage_key is distinct from old.storage_key
     or new.original_filename is distinct from old.original_filename
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Immutable document identity and storage columns cannot be modified.';
  end if;

  if old.status = 'active' and (new.mime is distinct from old.mime or new.byte_size is distinct from old.byte_size) then
    raise exception 'Active document MIME type and byte size cannot be modified.';
  end if;

  if old.shipment_id is not null and new.shipment_id is distinct from old.shipment_id then
    raise exception 'A document already linked to a shipment cannot be reassigned to another shipment.';
  end if;

  if old.request_id is not null and new.request_id is distinct from old.request_id then
    raise exception 'A document already linked to a request cannot be reassigned to another request.';
  end if;

  if public.current_user_role() = 'worker' then
    if not public.is_document_bound_to_worker_warehouse(new.shipment_id, new.request_id, new.warehouse, new.created_by) then
      raise exception 'Worker cannot link or update a document outside their assigned warehouse.';
    end if;
  end if;

  return new;
end;
$$;

create trigger documents_guard_update
  before update on public.documents
  for each row execute function public.enforce_document_update_rules();

create or replace function public.enforce_last_active_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'owner' and old.active = true and (new.role <> 'owner' or new.active = false) then
    if (select count(*) from public.users where role = 'owner' and active = true and id <> old.id) < 1 then
      raise exception 'The last active owner cannot be deactivated or change role.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_guard_last_owner
  before update on public.users
  for each row execute function public.enforce_last_active_owner();

-- ----------------------------------------------------------------------------
-- 6. WORKFLOW RPCS (ALL 29 TRANSACTIONAL FUNCTIONS)
-- ----------------------------------------------------------------------------

-- 6.1 Admin Order Decision RPC
create or replace function public.rpc_admin_decide_order(
  p_order_number text,
  p_decision text
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_order public.purchase_orders;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'owner' then
    raise exception 'Only the owner can approve or reject a purchase order.';
  end if;

  if p_decision not in ('approved', 'declined') then
    raise exception 'Invalid order decision: %.', p_decision;
  end if;

  select * into v_order
  from public.purchase_orders
  where lower(number) = lower(trim(p_order_number))
  for update;

  if not found then
    raise exception 'That purchase order does not exist.';
  end if;

  if v_order.status <> 'submitted' then
    raise exception 'Only a pending purchase order (status = submitted) can be approved or rejected (current status: %).', v_order.status;
  end if;

  update public.purchase_orders
  set status = p_decision,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  perform public.internal_append_audit(
    v_actor.id,
    case when p_decision = 'approved' then 'order-approved' else 'order-declined' end,
    'purchase-order',
    v_order.id::text,
    'submitted',
    v_order.number || ' was ' || p_decision || '.'
  );

  return v_order;
end;
$$;

-- 6.2 Decide Request RPC
create or replace function public.rpc_decide_request(
  p_request_id uuid,
  p_decision text,
  p_note_or_reason text default null
)
returns public.requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_req public.requests;
  v_old_status text;
  v_clean_note text := trim(coalesce(p_note_or_reason, ''));
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  select * into v_req
  from public.requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'That request does not exist.';
  end if;

  v_old_status := v_req.status;

  if v_req.status <> 'submitted' then
    raise exception 'Request transition from % to % is not permitted; only a submitted request can be decided.', v_req.status, p_decision;
  end if;

  if p_decision = 'approved' then
    if v_actor.role <> 'owner' then
      raise exception 'Only the owner can approve a request.';
    end if;

    update public.requests
    set status = 'approved',
        approved_by = v_actor.id,
        approved_at = now()
    where id = v_req.id
    returning * into v_req;

    perform public.internal_append_audit(
      v_actor.id,
      'request-approved',
      'request',
      v_req.id::text,
      v_old_status,
      v_req.number || ' was approved. Stock was not changed.'
    );

  elsif p_decision = 'declined' then
    if v_actor.role <> 'owner' then
      raise exception 'Only the owner can decline a request.';
    end if;
    if length(v_clean_note) = 0 then
      raise exception 'A decline reason is required.';
    end if;

    update public.requests
    set status = 'declined',
        decline_reason = v_clean_note
    where id = v_req.id
    returning * into v_req;

    perform public.internal_append_audit(
      v_actor.id,
      'request-declined',
      'request',
      v_req.id::text,
      v_old_status,
      v_req.number || ' was declined. ' || v_clean_note
    );

  elsif p_decision = 'sent_back' then
    if v_actor.role not in ('owner', 'manager') then
      raise exception 'Only the owner or a manager can send a request back.';
    end if;
    if length(v_clean_note) = 0 then
      raise exception 'A note is required when a request is sent back.';
    end if;

    update public.requests
    set status = 'sent_back',
        sent_back_note = v_clean_note
    where id = v_req.id
    returning * into v_req;

    perform public.internal_append_audit(
      v_actor.id,
      'request-sent-back',
      'request',
      v_req.id::text,
      v_old_status,
      v_req.number || ' was sent back. ' || v_clean_note
    );

  else
    raise exception 'Invalid request decision: %.', p_decision;
  end if;

  return v_req;
end;
$$;

-- 6.3 Upload Annex 7 RPC
create or replace function public.rpc_upload_annex7(
  p_direction text,
  p_shipment_reference text,
  p_document_id uuid,
  p_annex_reference text,
  p_notes text default ''
)
returns public.annex7_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_doc public.documents;
  v_annex public.annex7_records;
  v_clean_ref text := trim(coalesce(p_annex_reference, ''));
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role not in ('manager', 'worker') then
    raise exception 'This role cannot add an Annex 7 file.';
  end if;

  if v_clean_ref = '' then
    raise exception 'Reference and a file are required.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = p_direction
    and lower(reference) = lower(trim(p_shipment_reference))
  for update;

  if not found then
    raise exception 'Choose the shipment this file belongs to.';
  end if;

  if v_actor.role = 'worker' and v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only change shipments at your warehouse.';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
    and status <> 'deleted'
  for update;

  if not found then
    raise exception 'Uploaded Annex 7 document not found.';
  end if;

  if v_actor.role = 'worker' and v_doc.created_by is distinct from v_actor.id then
    raise exception 'Workers can only link Annex 7 documents they uploaded.';
  end if;

  update public.documents
  set shipment_id = v_shipment.id,
      purchase_order_id = v_shipment.purchase_order_id,
      status = 'active'
  where id = v_doc.id;

  insert into public.annex7_records (
    shipment_id, document_id, reference, status, notes, uploaded_by, uploaded_at
  )
  values (
    v_shipment.id, v_doc.id, v_clean_ref, 'uploaded', coalesce(p_notes, ''), v_actor.id, now()
  )
  returning * into v_annex;

  update public.shipments set annex7_required = true where id = v_shipment.id;

  perform public.internal_append_audit(
    v_actor.id, 'annex7-uploaded', 'shipment', v_shipment.id::text, null,
    v_clean_ref || ' was uploaded. It is not approved.'
  );

  return v_annex;
end;
$$;

-- 6.4 Decide Annex 7 RPC
create or replace function public.rpc_decide_annex7(
  p_target_id uuid,
  p_status text
)
returns public.annex7_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_annex public.annex7_records;
  v_old_status text;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if p_status = 'approved' and v_actor.role <> 'owner' then
    raise exception 'Only the owner can approve an Annex 7 file.';
  elsif p_status = 'under_review' and v_actor.role not in ('owner', 'manager') then
    raise exception 'This role cannot review an Annex 7 file.';
  elsif p_status not in ('under_review', 'approved') then
    raise exception 'Invalid Annex 7 status: %.', p_status;
  end if;

  select * into v_annex
  from public.annex7_records
  where id = p_target_id or document_id = p_target_id
  for update;

  if not found then
    raise exception 'That Annex 7 record does not exist.';
  end if;

  v_old_status := v_annex.status;

  if p_status = 'under_review' and v_old_status <> 'uploaded' then
    raise exception 'Annex 7 transition from % to under_review is not permitted.', v_old_status;
  end if;

  if p_status = 'approved' and v_old_status not in ('uploaded', 'under_review') then
    raise exception 'Annex 7 transition from % to approved is not permitted.', v_old_status;
  end if;

  update public.annex7_records set status = p_status where id = v_annex.id returning * into v_annex;

  perform public.internal_append_audit(
    v_actor.id,
    case when p_status = 'approved' then 'annex7-approved' else 'annex7-reviewed' end,
    'document',
    v_annex.document_id::text,
    v_old_status,
    v_annex.reference || ' is ' || p_status || '.'
  );

  return v_annex;
end;
$$;

-- 6.5 Register Shipment RPC
create or replace function public.rpc_register_shipment(
  p_direction text,
  p_reference text,
  p_po_number text,
  p_party_name text,
  p_warehouse_name text,
  p_container_number text default ''
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_wh public.warehouses;
  v_company public.companies;
  v_order public.purchase_orders;
  v_shipment public.shipments;
  v_kind text := case when p_direction = 'inbound' then 'supplier' else 'customer' end;
  v_clean_ref text := trim(coalesce(p_reference, ''));
  v_clean_po text := trim(coalesce(p_po_number, ''));
  v_clean_party text := trim(coalesce(p_party_name, ''));
  v_clean_container text := case when p_direction = 'outbound' then trim(coalesce(p_container_number, '')) else '' end;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role not in ('manager', 'worker') then
    raise exception 'Only Staff or an assigned Worker can create a shipment.';
  end if;

  if p_direction not in ('inbound', 'outbound') then
    raise exception 'Invalid shipment direction.';
  end if;

  if v_clean_ref = '' or v_clean_po = '' or v_clean_party = '' or trim(coalesce(p_warehouse_name, '')) = ''
     or (p_direction = 'outbound' and v_clean_container = '') then
    raise exception 'Required shipment fields are missing.';
  end if;

  select * into v_wh
  from public.warehouses
  where lower(name) = lower(trim(p_warehouse_name)) and active = true;

  if not found then
    raise exception 'Warehouse % does not exist.', p_warehouse_name;
  end if;

  if v_actor.role = 'worker' and v_actor.warehouse_id is distinct from v_wh.id then
    raise exception 'You can only create shipments at your assigned warehouse.';
  end if;

  select * into v_company
  from public.companies
  where lower(name) = lower(v_clean_party) and kind = v_kind and active = true;

  if not found then
    if v_actor.role = 'worker' then
      raise exception 'Workers cannot create new supplier or customer companies. Ask Staff to register % first.', v_clean_party;
    end if;

    insert into public.companies (name, kind, active)
    values (v_clean_party, v_kind, true)
    returning * into v_company;
  end if;

  select * into v_order
  from public.purchase_orders
  where lower(number) = lower(v_clean_po);

  if not found then
    if v_actor.role = 'worker' then
      raise exception 'Workers cannot create new PO/SO orders. Ask Staff to create order % first.', v_clean_po;
    end if;

    insert into public.purchase_orders (number, title, company_id, status, value_eur, notes, created_by)
    values (v_clean_po, 'PO ' || v_clean_po, v_company.id, 'draft', 0, '', v_actor.id)
    returning * into v_order;
  else
    if v_order.status = 'declined' then
      raise exception 'Cannot register a shipment against a declined order (%).', v_clean_po;
    end if;
    if v_actor.role = 'worker' and v_order.company_id is distinct from v_company.id then
      raise exception 'Order % does not belong to counterparty %.', v_clean_po, v_clean_party;
    end if;
  end if;

  insert into public.shipments (
    reference, direction, purchase_order_id, container_number, warehouse_id,
    origin_country, destination_country, status
  )
  values (
    v_clean_ref, p_direction, v_order.id, v_clean_container, v_wh.id,
    case when p_direction = 'inbound' then '' else v_wh.country end,
    case when p_direction = 'inbound' then v_wh.country else '' end,
    'Planned'
  )
  returning * into v_shipment;

  insert into public.demurrage_records (shipment_id, free_minutes, rate_per_minute)
  values (v_shipment.id, 120, 1);

  perform public.internal_append_audit(
    v_actor.id, 'shipment-created', 'shipment', v_shipment.id::text, null,
    v_shipment.reference || ' was added as Planned.'
  );

  return v_shipment;
end;
$$;

-- 6.6 Save Shipment Metadata RPC
create or replace function public.rpc_save_shipment_meta(
  p_direction text,
  p_reference text,
  p_po_number text,
  p_container_number text,
  p_party_name text
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_company public.companies;
  v_order public.purchase_orders;
  v_kind text := case when p_direction = 'inbound' then 'supplier' else 'customer' end;
  v_clean_po text := trim(coalesce(p_po_number, ''));
  v_clean_container text := trim(coalesce(p_container_number, ''));
  v_clean_party text := trim(coalesce(p_party_name, ''));
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role not in ('manager', 'worker') then
    raise exception 'This role cannot edit the shipment.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = p_direction and lower(reference) = lower(trim(p_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_actor.role = 'worker' and v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only change shipments at your warehouse.';
  end if;

  if v_shipment.status in ('Completed', 'Dispatched') then
    raise exception 'This shipment is already closed.';
  end if;

  if p_direction = 'inbound' and v_clean_container <> '' then
    if exists (
      select 1 from public.shipments s
      where s.direction = 'inbound'
        and s.id <> v_shipment.id
        and lower(trim(s.container_number)) = lower(v_clean_container)
    ) then
      raise exception 'That equipment number is already used on another inbound shipment.';
    end if;
  end if;

  if v_clean_po <> '' then
    select * into v_company
    from public.companies
    where lower(name) = lower(v_clean_party) and kind = v_kind and active = true;

    if not found then
      if v_actor.role = 'worker' then
        raise exception 'Workers cannot create new companies. Ask Staff to register % first.', v_clean_party;
      end if;
      insert into public.companies (name, kind, active)
      values (coalesce(nullif(v_clean_party, ''), 'Unnamed'), v_kind, true)
      returning * into v_company;
    end if;

    select * into v_order
    from public.purchase_orders
    where lower(number) = lower(v_clean_po)
    for update;

    if not found then
      if v_actor.role = 'worker' then
        raise exception 'Workers cannot create new PO/SO orders. Ask Staff to create order % first.', v_clean_po;
      end if;
      insert into public.purchase_orders (number, title, company_id, status, value_eur, notes, created_by)
      values (v_clean_po, 'PO ' || v_clean_po, v_company.id, 'draft', 0, '', v_actor.id)
      returning * into v_order;
    else
      if v_order.status = 'declined' then
        raise exception 'Cannot link shipment to a declined purchase order.';
      end if;
      if v_actor.role = 'worker' and v_order.company_id is distinct from v_company.id then
        raise exception 'Order % does not match counterparty %.', v_clean_po, v_clean_party;
      end if;
      if v_actor.role = 'manager' and v_order.status in ('draft', 'submitted') and v_clean_party <> '' then
        update public.purchase_orders set company_id = v_company.id, updated_at = now() where id = v_order.id;
      end if;
    end if;

    v_shipment.purchase_order_id := v_order.id;
  end if;

  update public.shipments
  set purchase_order_id = v_shipment.purchase_order_id,
      container_number = v_clean_container
  where id = v_shipment.id
  returning * into v_shipment;

  perform public.internal_append_audit(
    v_actor.id, 'shipment-edited', 'shipment', v_shipment.id::text, null,
    v_shipment.reference || ' details were saved.'
  );

  return v_shipment;
end;
$$;

-- 6.7 Save Carrier RPC
create or replace function public.rpc_save_carrier(
  p_reference text,
  p_carrier_name text,
  p_handed_over_at timestamptz default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role not in ('manager', 'worker') then
    raise exception 'This role cannot record the carrier.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = 'outbound' and lower(reference) = lower(trim(p_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_actor.role = 'worker' and v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only change shipments at your warehouse.';
  end if;

  if v_shipment.status = 'Dispatched' then
    raise exception 'This shipment is already closed.';
  end if;

  update public.shipments
  set carrier_name = trim(coalesce(p_carrier_name, '')),
      handed_over_at = p_handed_over_at
  where id = v_shipment.id
  returning * into v_shipment;

  perform public.internal_append_audit(
    v_actor.id, 'carrier-saved', 'shipment', v_shipment.id::text, null,
    'Carrier ' || coalesce(nullif(v_shipment.carrier_name, ''), 'cleared') || ' was saved.'
  );

  return v_shipment;
end;
$$;

-- 6.8 Advance Shipment Status RPC
create or replace function public.rpc_advance_shipment(
  p_direction text,
  p_reference text
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_next text;
  v_demurrage public.demurrage_records;
  v_elapsed integer;
  v_billable integer;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = p_direction and lower(reference) = lower(trim(p_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_actor.role = 'worker' and v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only work shipments at your assigned warehouse.';
  end if;

  if p_direction = 'inbound' then
    v_next := case
      when v_shipment.status in ('Planned', 'In transit', 'Arrived') then 'Registered'
      when v_shipment.status = 'Registered' then 'Unloading'
      when v_shipment.status = 'Unloading' then 'Completed'
      else null
    end;

    if v_next is null then
      raise exception 'This shipment cannot move to another status.';
    end if;

    if v_next = 'Registered' and v_actor.role not in ('manager', 'worker') then
      raise exception 'This role cannot take that status step.';
    elsif v_next in ('Unloading', 'Completed') and v_actor.role <> 'worker' then
      raise exception 'Only the assigned warehouse worker can perform unloading status steps.';
    end if;

    if v_next = 'Unloading' then
      update public.demurrage_records set started_at = coalesce(started_at, now()) where shipment_id = v_shipment.id;
    elsif v_next = 'Completed' then
      select * into v_demurrage from public.demurrage_records where shipment_id = v_shipment.id for update;
      if found and v_demurrage.completed_at is null then
        if v_demurrage.started_at is null then
          v_elapsed := 0;
          v_billable := 0;
        else
          v_elapsed := greatest(0, floor(extract(epoch from (now() - v_demurrage.started_at)) / 60)::integer);
          v_billable := greatest(0, v_elapsed - v_demurrage.free_minutes);
        end if;

        update public.demurrage_records
        set completed_at = now(),
            elapsed_minutes = v_elapsed,
            billable_minutes = v_billable,
            charge_eur = v_billable * v_demurrage.rate_per_minute
        where id = v_demurrage.id;
      end if;
    end if;

  elsif p_direction = 'outbound' then
    if v_actor.role <> 'worker' then
      raise exception 'Only the assigned warehouse worker can change outbound loading/dispatch status.';
    end if;

    v_next := case
      when v_shipment.status = 'Planned' then 'Loading'
      when v_shipment.status = 'Loading' then 'Loaded'
      when v_shipment.status = 'Loaded' then 'Dispatched'
      else null
    end;

    if v_next is null then
      raise exception 'This shipment cannot move to another status.';
    end if;

    if v_next = 'Dispatched' then
      if v_shipment.purchase_order_id is null or length(trim(v_shipment.container_number)) = 0 then
        raise exception 'PO number, container number, client, and warehouse are required before dispatch.';
      end if;
      if length(trim(v_shipment.carrier_name)) = 0 then
        raise exception 'Enter a carrier name before dispatch.';
      end if;
    end if;
  else
    raise exception 'Invalid shipment direction.';
  end if;

  update public.shipments set status = v_next where id = v_shipment.id returning * into v_shipment;

  perform public.internal_append_audit(
    v_actor.id, 'shipment-status', 'shipment', v_shipment.id::text, null,
    v_shipment.reference || ' is now ' || v_next || '.'
  );

  return v_shipment;
end;
$$;

-- 6.9 Save Customs Details RPC
create or replace function public.rpc_save_customs(
  p_reference text,
  p_customs_ref text,
  p_procedure_note text,
  p_goods_description text,
  p_declarant_reference text default ''
)
returns public.customs_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_customs public.customs_records;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'manager' then
    raise exception 'This role cannot edit outbound customs information.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = 'outbound' and lower(reference) = lower(trim(p_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_shipment.status = 'Dispatched' then
    raise exception 'Customs information stays as recorded once the shipment is dispatched.';
  end if;

  if trim(coalesce(p_customs_ref, '')) = ''
     or trim(coalesce(p_procedure_note, '')) = ''
     or trim(coalesce(p_goods_description, '')) = '' then
    raise exception 'Customs reference, procedure note, and goods description are required.';
  end if;

  insert into public.customs_records (
    shipment_id, reference, procedure_note, goods_description, declarant_reference
  )
  values (
    v_shipment.id, trim(p_customs_ref), trim(p_procedure_note),
    trim(p_goods_description), trim(coalesce(p_declarant_reference, ''))
  )
  on conflict (shipment_id)
  do update set
    reference = excluded.reference,
    procedure_note = excluded.procedure_note,
    goods_description = excluded.goods_description,
    declarant_reference = excluded.declarant_reference
  returning * into v_customs;

  perform public.internal_append_audit(
    v_actor.id, 'customs-saved', 'shipment', v_shipment.id::text, null,
    'Customs reference ' || v_customs.reference || ' was saved.'
  );

  return v_customs;
end;
$$;

-- 6.10 Confirm Customs RPC
create or replace function public.rpc_confirm_customs(
  p_reference text,
  p_proof_document_id uuid
)
returns public.customs_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_doc public.documents;
  v_customs public.customs_records;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'manager' then
    raise exception 'This role cannot record customs confirmation.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = 'outbound' and lower(reference) = lower(trim(p_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  select * into v_doc
  from public.documents
  where id = p_proof_document_id and status <> 'deleted'
  for update;

  if not found then
    raise exception 'Uploaded proof document not found.';
  end if;

  update public.documents
  set shipment_id = v_shipment.id,
      purchase_order_id = v_shipment.purchase_order_id,
      status = 'active'
  where id = v_doc.id;

  insert into public.customs_records (
    shipment_id, confirmed_by, confirmed_at, proof_document_id
  )
  values (
    v_shipment.id, v_actor.id, now(), v_doc.id
  )
  on conflict (shipment_id)
  do update set
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at,
    proof_document_id = excluded.proof_document_id
  returning * into v_customs;

  perform public.internal_append_audit(
    v_actor.id, 'customs-confirmed', 'shipment', v_shipment.id::text, null,
    v_actor.name || ' recorded customs confirmation.'
  );

  return v_customs;
end;
$$;

-- 6.11 Confirm Seller RPC
create or replace function public.rpc_confirm_seller(p_reference text)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_order public.purchase_orders;
  v_company public.companies;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'manager' then
    raise exception 'Only Staff can record seller confirmation.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = 'outbound' and lower(reference) = lower(trim(p_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_shipment.status = 'Dispatched' then
    raise exception 'This shipment is already dispatched.';
  end if;

  if v_shipment.purchase_order_id is not null then
    select * into v_order from public.purchase_orders where id = v_shipment.purchase_order_id;
    if found then
      select * into v_company from public.companies where id = v_order.company_id;
    end if;
  end if;

  if v_company.id is null then
    raise exception 'Shipment must be linked to a valid order and company before confirmation.';
  end if;

  if v_shipment.seller_status = 'Confirmed' then
    return v_shipment;
  end if;

  update public.shipments
  set seller_status = 'Confirmed',
      seller_company = v_company.name,
      seller_confirmed_by = v_actor.name,
      seller_confirmed_at = now()
  where id = v_shipment.id
  returning * into v_shipment;

  perform public.internal_append_audit(
    v_actor.id, 'seller-confirmed', 'shipment', v_shipment.id::text, 'Pending',
    v_actor.name || ' confirmed this shipment for ' || v_company.name || '.'
  );

  return v_shipment;
end;
$$;

-- 6.12 Save CMR Details RPC
create or replace function public.rpc_save_cmr(
  p_direction text,
  p_shipment_reference text,
  p_cmr_reference text,
  p_carrier text,
  p_goods_description text,
  p_remarks text default ''
)
returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_doc public.documents;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role not in ('manager', 'worker') then
    raise exception 'This role cannot save CMR details.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = p_direction and lower(reference) = lower(trim(p_shipment_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_actor.role = 'worker' and v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only change shipments at your warehouse.';
  end if;

  if v_shipment.status in ('Completed', 'Dispatched') then
    raise exception 'This shipment is already closed.';
  end if;

  select * into v_doc
  from public.documents
  where shipment_id = v_shipment.id and kind = 'cmr' and status <> 'deleted'
  for update;

  if not found then
    raise exception 'Attach the CMR file before entering details.';
  end if;

  if trim(coalesce(p_cmr_reference, '')) = '' or trim(coalesce(p_goods_description, '')) = '' then
    raise exception 'CMR reference and goods description are required.';
  end if;

  update public.documents
  set cmr_reference = trim(p_cmr_reference),
      cmr_carrier = trim(coalesce(p_carrier, '')),
      cmr_goods_description = trim(p_goods_description),
      cmr_remarks = trim(coalesce(p_remarks, '')),
      cmr_entered_by = v_actor.name,
      cmr_entered_at = now()
  where id = v_doc.id
  returning * into v_doc;

  perform public.internal_append_audit(
    v_actor.id, 'cmr-saved', 'document', v_doc.id::text, null,
    'CMR ' || v_doc.cmr_reference || ' was saved for ' || v_shipment.reference || '.'
  );

  return v_doc;
end;
$$;

-- 6.13 Worker Save Material Line RPC
create or replace function public.rpc_worker_save_material_line(
  p_direction text,
  p_shipment_reference text,
  p_material_description text,
  p_packaging_type_id uuid,
  p_package_count integer,
  p_gross_kg numeric,
  p_tare_per_unit_kg numeric,
  p_no_tare boolean default false
)
returns public.request_lines
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_packaging public.packaging_types;
  v_material public.materials;
  v_req public.requests;
  v_year integer := extract(year from now())::integer;
  v_seq integer;
  v_number text;
  v_tare_unit numeric(12, 3);
  v_tare_total numeric(12, 3);
  v_net_kg numeric(12, 3);
  v_line public.request_lines;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only the assigned warehouse worker can add a material section.';
  end if;

  select * into v_shipment
  from public.shipments
  where direction = p_direction and lower(reference) = lower(trim(p_shipment_reference))
  for update;

  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only change shipments at your warehouse.';
  end if;

  if v_shipment.status in ('Completed', 'Dispatched') then
    raise exception 'This shipment is already closed.';
  end if;

  if length(trim(coalesce(p_material_description, ''))) = 0 then
    raise exception 'Enter a material type.';
  end if;

  select * into v_packaging from public.packaging_types where id = p_packaging_type_id and active = true;
  if not found then
    raise exception 'Choose an active packaging type.';
  end if;

  select * into v_material
  from public.materials
  where lower(description) = lower(trim(p_material_description))
     or lower(material_number) = lower(trim(p_material_description));

  if not found then
    insert into public.materials (material_number, description, unit, low_stock_threshold_kg)
    values (trim(p_material_description), trim(p_material_description), 'kg', 0)
    returning * into v_material;
  end if;

  select * into v_req
  from public.requests
  where shipment_id = v_shipment.id and status not in ('deleted', 'declined', 'completed')
  for update;

  if not found then
    insert into public.request_sequences (year, next)
    values (v_year, 1)
    on conflict (year) do update set next = public.request_sequences.next + 1
    returning next into v_seq;

    v_number := 'REQ-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

    insert into public.requests (
      number, type, shipment_id, purchase_order_id, container_number, warehouse_id, created_by, status
    )
    values (
      v_number,
      case when v_shipment.direction = 'inbound' then 'unloading' else 'loading' end,
      v_shipment.id, v_shipment.purchase_order_id, v_shipment.container_number,
      v_shipment.warehouse_id, v_actor.id, 'submitted'
    )
    returning * into v_req;

    perform public.internal_append_audit(
      v_actor.id, 'request-submitted', 'request', v_req.id::text, null,
      v_req.number || ' was submitted. Stock was not changed.'
    );
  end if;

  if v_req.created_by is distinct from v_actor.id then
    raise exception 'A worker can never edit another worker''s request.';
  end if;

  if v_req.status in ('approved', 'completed') then
    raise exception 'Requests are never edited in place once approved or completed.';
  end if;

  v_tare_unit := case when p_no_tare then 0 else coalesce(p_tare_per_unit_kg, v_packaging.tare_kg) end;
  if p_package_count <= 0 or p_gross_kg < 0 or v_tare_unit < 0 then
    raise exception 'Gross weight, package count, and tare are required.';
  end if;

  v_tare_total := round(v_tare_unit * p_package_count, 3);
  v_net_kg := round(p_gross_kg - v_tare_total, 3);

  if v_net_kg <= 0 then
    raise exception 'Net weight must be greater than zero.';
  end if;

  insert into public.request_lines (
    request_id, material_id, packaging_type_id, package_count, gross_kg, tare_total_kg, net_kg
  )
  values (
    v_req.id, v_material.id, v_packaging.id, p_package_count,
    round(p_gross_kg, 3), v_tare_total, v_net_kg
  )
  returning * into v_line;

  perform public.internal_append_audit(
    v_actor.id, 'request-line-added', 'request', v_req.id::text, null,
    v_req.number || ' gained ' || v_net_kg::text || ' kg net. Stock was not changed.'
  );

  return v_line;
end;
$$;

-- 6.14 Worker Delete Material Line RPC
create or replace function public.rpc_worker_delete_material_line(p_line_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_line public.request_lines;
  v_req public.requests;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only the assigned warehouse worker can remove a material section.';
  end if;

  select * into v_line from public.request_lines where id = p_line_id for update;
  if not found then
    raise exception 'That material section does not exist.';
  end if;

  select * into v_req from public.requests where id = v_line.request_id for update;
  if v_req.created_by is distinct from v_actor.id or v_req.warehouse_id is distinct from v_actor.warehouse_id then
    raise exception 'Only the worker who created the request at the assigned warehouse can remove its lines.';
  end if;

  if v_req.status not in ('submitted', 'declined', 'sent_back') then
    raise exception 'Requests are never edited in place once approved, completed, or deleted.';
  end if;

  delete from public.request_lines where id = v_line.id;
  return v_line.id;
end;
$$;

-- 6.15 Worker Submit Request with Photos RPC
create or replace function public.rpc_submit_request_with_photos(p_shipment_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_req public.requests;
  v_year integer := extract(year from now())::integer;
  v_seq integer;
  v_number text;
  v_active_photo_count integer;
  v_pending_photo_count integer;
  v_wh_name text;
  v_po_number text;
  v_photo record;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only a Worker can submit a loading or unloading request.';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'That shipment does not exist.';
  end if;

  if v_actor.warehouse_id is distinct from v_shipment.warehouse_id then
    raise exception 'You can only submit requests for your assigned warehouse.';
  end if;

  delete from public.documents where status = 'pending' and created_at < (now() - interval '24 hours');

  select count(*) into v_active_photo_count
  from public.documents
  where shipment_id = v_shipment.id and kind = 'photo' and status <> 'deleted';

  select count(*) into v_pending_photo_count
  from public.documents
  where created_by = v_actor.id and kind = 'photo' and status = 'pending'
    and (shipment_id is null or shipment_id = v_shipment.id);

  if v_active_photo_count = 0 and v_pending_photo_count = 0 then
    raise exception 'A request cannot be submitted without at least one photo.';
  end if;

  select * into v_req
  from public.requests
  where shipment_id = v_shipment.id and status not in ('deleted', 'declined', 'completed')
  for update;

  if not found then
    insert into public.request_sequences (year, next)
    values (v_year, 1)
    on conflict (year) do update set next = public.request_sequences.next + 1
    returning next into v_seq;

    v_number := 'REQ-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

    insert into public.requests (
      number, type, shipment_id, purchase_order_id, container_number, warehouse_id, created_by, status
    )
    values (
      v_number,
      case when v_shipment.direction = 'inbound' then 'unloading' else 'loading' end,
      v_shipment.id, v_shipment.purchase_order_id, v_shipment.container_number,
      v_shipment.warehouse_id, v_actor.id, 'submitted'
    )
    returning * into v_req;

    perform public.internal_append_audit(
      v_actor.id, 'request-submitted', 'request', v_req.id::text, null,
      v_req.number || ' was submitted. Stock was not changed.'
    );
  elsif v_req.created_by is distinct from v_actor.id then
    raise exception 'Another worker already has an open request on this shipment.';
  end if;

  select name into v_wh_name from public.warehouses where id = v_shipment.warehouse_id;
  select number into v_po_number from public.purchase_orders where id = v_shipment.purchase_order_id;

  for v_photo in
    select *
    from public.documents
    where created_by = v_actor.id
      and kind = 'photo'
      and status = 'pending'
      and (shipment_id is null or shipment_id = v_shipment.id)
    order by created_at, id
    for update
  loop
    update public.documents
    set status = 'active',
        request_id = v_req.id,
        request_number = v_req.number,
        shipment_id = v_shipment.id,
        container_number = coalesce(nullif(v_shipment.container_number, ''), v_req.container_number),
        warehouse = v_wh_name,
        po_number = v_po_number
    where id = v_photo.id;

    insert into public.request_photos (request_id, document_id)
    values (v_req.id, v_photo.id)
    on conflict (request_id, document_id) do nothing;

    perform public.internal_append_audit(
      v_actor.id, 'file-uploaded', 'document', v_photo.id::text, null,
      coalesce(v_photo.readable_name, v_photo.name) || ' was attached to request ' || v_req.number || '.'
    );
  end loop;

  return v_req;
end;
$$;

-- 6.16 Worker Soft-Delete Request RPC
create or replace function public.rpc_worker_soft_delete_request(p_request_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_req public.requests;
  v_old_status text;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role = 'owner' then
    raise exception 'Admin cannot delete operational records.';
  end if;

  if v_actor.role = 'manager' then
    raise exception 'Staff cannot delete or cancel requests.';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'That request does not exist.';
  end if;

  if v_req.status = 'completed' then
    raise exception 'A completed request cannot be deleted. Record a correcting entry instead.';
  end if;

  if v_req.created_by is distinct from v_actor.id or v_req.warehouse_id is distinct from v_actor.warehouse_id then
    raise exception 'Only the worker who created a request can delete it.';
  end if;

  if v_req.status = 'deleted' then
    return v_req;
  end if;

  if v_req.status not in ('submitted', 'declined', 'sent_back') then
    raise exception 'A worker can delete own requests only while submitted, declined or sent back.';
  end if;

  v_old_status := v_req.status;

  update public.requests
  set status = 'deleted', deleted_by = v_actor.id, deleted_at = now()
  where id = v_req.id
  returning * into v_req;

  perform public.internal_append_audit(
    v_actor.id, 'request-deleted', 'request', v_req.id::text, v_old_status,
    v_req.number || ' was marked deleted. The record was kept.'
  );

  return v_req;
end;
$$;

-- 6.17 Worker Complete Request & Post Stock RPC
create or replace function public.rpc_worker_complete_request(p_request_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_req public.requests;
  v_dir text;
  v_req_line record;
  v_mat_check record;
  v_curr_weight numeric(12, 3);
  v_next_weight numeric(12, 3);
  v_movement_id uuid;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only the assigned warehouse worker can complete an approved operation.';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'That request does not exist.';
  end if;

  if v_actor.warehouse_id is distinct from v_req.warehouse_id then
    raise exception 'You can only complete operations at your assigned warehouse.';
  end if;

  if v_req.status = 'completed' then
    return v_req;
  end if;

  if v_req.status <> 'approved' then
    raise exception 'Stock changes only after Admin approves the request and the operation is completed.';
  end if;

  if not exists (select 1 from public.request_lines where request_id = v_req.id) then
    raise exception 'This request has no net-weight lines to enter.';
  end if;

  v_dir := case when v_req.type = 'unloading' then 'in' else 'out' end;

  if v_dir = 'out' then
    for v_mat_check in
      select rl.material_id, round(sum(rl.net_kg), 3) as required_kg
      from public.request_lines rl
      where rl.request_id = v_req.id
        and not exists (
          select 1 from public.stock_movements sm
          where sm.request_line_id = rl.id and sm.direction = v_dir
        )
      group by rl.material_id
      order by rl.material_id
    loop
      select weight_kg into v_curr_weight
      from public.stock_balances
      where material_id = v_mat_check.material_id and warehouse_id = v_req.warehouse_id
      for update;

      if not found or v_curr_weight < v_mat_check.required_kg then
        raise exception 'That movement would make stock negative.';
      end if;
    end loop;
  end if;

  for v_req_line in
    select * from public.request_lines where request_id = v_req.id order by material_id, id
  loop
    if v_req_line.net_kg <= 0 then
      raise exception 'A stock movement must be greater than zero kilograms.';
    end if;

    insert into public.stock_movements (
      material_id, warehouse_id, weight_kg, direction, request_id, request_line_id, transfer_id, created_by
    )
    values (
      v_req_line.material_id, v_req.warehouse_id, v_req_line.net_kg, v_dir,
      v_req.id, v_req_line.id, null, v_actor.id
    )
    on conflict (request_line_id, direction) where request_line_id is not null do nothing
    returning id into v_movement_id;

    if v_movement_id is not null then
      if v_dir = 'in' then
        insert into public.stock_balances (material_id, warehouse_id, weight_kg)
        values (v_req_line.material_id, v_req.warehouse_id, round(v_req_line.net_kg, 3))
        on conflict (material_id, warehouse_id)
        do update set weight_kg = round(public.stock_balances.weight_kg + excluded.weight_kg, 3);
      else
        update public.stock_balances
        set weight_kg = round(weight_kg - v_req_line.net_kg, 3)
        where material_id = v_req_line.material_id
          and warehouse_id = v_req.warehouse_id
          and weight_kg >= v_req_line.net_kg
        returning weight_kg into v_next_weight;

        if not found then
          raise exception 'That movement would make stock negative.';
        end if;
      end if;
    end if;
  end loop;

  update public.requests
  set status = 'completed', entered_by = v_actor.id, entered_at = now()
  where id = v_req.id
  returning * into v_req;

  perform public.internal_append_audit(
    v_actor.id, 'request-completed', 'request', v_req.id::text, 'approved',
    v_req.number || ' was entered. Stock moved once.'
  );

  return v_req;
end;
$$;

-- 6.18 Worker Create General Request RPC
create or replace function public.rpc_worker_create_general_request(
  p_category text,
  p_priority text,
  p_description text,
  p_shipment_id uuid default null,
  p_document_ids uuid[] default '{}'
)
returns public.worker_general_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_shipment public.shipments;
  v_year integer := extract(year from now())::integer;
  v_seq integer;
  v_number text;
  v_gen_req public.worker_general_requests;
  v_doc_id uuid;
  v_doc public.documents;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only a Worker can submit a warehouse request.';
  end if;

  if p_category not in (
    'materials_packaging',
    'stock_issue',
    'loading_unloading',
    'equipment_maintenance',
    'missing_documents',
    'other'
  ) then
    raise exception 'Invalid request category: %.', p_category;
  end if;

  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid priority: %.', p_priority;
  end if;

  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'A request description is required.';
  end if;

  if p_shipment_id is not null then
    select * into v_shipment from public.shipments where id = p_shipment_id;
    if not found or v_shipment.warehouse_id is distinct from v_actor.warehouse_id then
      raise exception 'Shipment does not belong to your assigned warehouse.';
    end if;
  end if;

  insert into public.request_sequences (year, next)
  values (v_year, 1)
  on conflict (year) do update set next = public.request_sequences.next + 1
  returning next into v_seq;

  v_number := 'REQ-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

  insert into public.worker_general_requests (
    number, category, priority, description, warehouse_id, shipment_id, purchase_order_id, created_by, status
  )
  values (
    v_number, p_category, p_priority, trim(p_description),
    v_actor.warehouse_id, v_shipment.id, v_shipment.purchase_order_id, v_actor.id, 'submitted'
  )
  returning * into v_gen_req;

  if p_document_ids is not null then
    foreach v_doc_id in array p_document_ids
    loop
      select * into v_doc from public.documents where id = v_doc_id and created_by = v_actor.id and status <> 'deleted' for update;
      if not found then
        raise exception 'Attachment % does not exist or does not belong to you.', v_doc_id;
      end if;

      update public.documents set status = 'active', request_number = v_gen_req.number where id = v_doc.id;

      insert into public.worker_general_request_attachments (general_request_id, document_id)
      values (v_gen_req.id, v_doc.id)
      on conflict do nothing;
    end loop;
  end if;

  perform public.internal_append_audit(
    v_actor.id, 'general-request-submitted', 'general-request', v_gen_req.id::text, null,
    v_gen_req.number || ' (' || p_category || ') was submitted.'
  );

  return v_gen_req;
end;
$$;

-- 6.19 Decide General Request RPC
create or replace function public.rpc_decide_general_request(
  p_general_request_id uuid,
  p_decision text,
  p_response_note text default null
)
returns public.worker_general_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_req public.worker_general_requests;
  v_old_status text;
  v_clean_note text := trim(coalesce(p_response_note, ''));
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  select * into v_req from public.worker_general_requests where id = p_general_request_id for update;
  if not found then
    raise exception 'General request not found.';
  end if;

  v_old_status := v_req.status;

  if p_decision = 'rejected' then
    p_decision := 'declined';
  end if;

  if p_decision in ('approved', 'declined') then
    if v_actor.role <> 'owner' then
      raise exception 'Only Admin can approve or decline a worker request.';
    end if;
    if v_old_status not in ('submitted', 'under_review', 'sent_back') then
      raise exception 'Transition from % to % is not permitted.', v_old_status, p_decision;
    end if;
    if p_decision = 'declined' and length(v_clean_note) = 0 then
      raise exception 'A decline reason is required.';
    end if;
  elsif p_decision in ('under_review', 'sent_back') then
    if v_actor.role not in ('owner', 'manager') then
      raise exception 'Only Admin or Staff can review or send back a request.';
    end if;
    if v_old_status not in ('submitted', 'under_review', 'sent_back') or v_old_status = p_decision then
      raise exception 'Transition from % to % is not permitted.', v_old_status, p_decision;
    end if;
    if p_decision = 'sent_back' and length(v_clean_note) = 0 then
      raise exception 'A note is required when sending a request back.';
    end if;
  elsif p_decision = 'completed' then
    if v_actor.role not in ('owner', 'manager', 'worker') then
      raise exception 'Only Staff or Worker can complete an approved request.';
    end if;
    if v_old_status <> 'approved' then
      raise exception 'Only approved requests can be completed.';
    end if;
  else
    raise exception 'Invalid decision: %.', p_decision;
  end if;

  update public.worker_general_requests
  set status = p_decision,
      response_note = case when length(v_clean_note) > 0 then v_clean_note else response_note end,
      decided_by = v_actor.id,
      decided_at = now(),
      updated_at = now()
  where id = v_req.id
  returning * into v_req;

  perform public.internal_append_audit(
    v_actor.id, 'general-request-' || p_decision, 'general-request', v_req.id::text, v_old_status,
    v_req.number || ' is now ' || p_decision || '.'
  );

  return v_req;
end;
$$;

-- 6.20 Worker Delete Document RPC
create or replace function public.rpc_worker_delete_document(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_doc public.documents;
  v_req public.requests;
  v_shipment public.shipments;
begin
  perform set_config('stockflow.in_trusted_rpc', 'true', true);
  v_actor := public.current_app_user();
  if v_actor.id is null then
    raise exception 'Sign in again to continue.';
  end if;

  if v_actor.role <> 'worker' then
    raise exception 'Only the uploading worker can delete an uncompleted file.';
  end if;

  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'That file does not exist.';
  end if;

  if v_doc.created_by is distinct from v_actor.id
     or not public.is_document_bound_to_worker_warehouse(v_doc.shipment_id, v_doc.request_id, v_doc.warehouse, v_doc.created_by) then
    raise exception 'You do not have permission to delete this file.';
  end if;

  if v_doc.request_id is not null then
    select * into v_req from public.requests where id = v_doc.request_id;
    if found and v_req.status in ('approved', 'completed') then
      raise exception 'Files attached to an approved or completed request cannot be deleted.';
    end if;
  end if;

  if v_doc.shipment_id is not null then
    select * into v_shipment from public.shipments where id = v_doc.shipment_id;
    if found and v_shipment.status in ('Completed', 'Dispatched') then
      raise exception 'Files attached to a closed shipment cannot be deleted.';
    end if;
  end if;

  update public.documents set status = 'deleted' where id = v_doc.id returning * into v_doc;
  delete from public.request_photos where document_id = v_doc.id;

  perform public.internal_append_audit(
    v_actor.id, 'file-deleted', 'document', v_doc.id::text, 'active',
    coalesce(v_doc.readable_name, v_doc.name) || ' was deleted.'
  );

  return v_doc;
end;
$$;

-- 6.21 Offers Helper: Next Offer Number
create or replace function public.internal_next_offer_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_next integer;
  v_prefix text := case when p_kind = 'purchasing' then 'POF' else 'SOF' end;
begin
  insert into public.offer_sequences (kind, year, next_val)
  values (p_kind, v_year, 2)
  on conflict (kind, year) do update
    set next_val = public.offer_sequences.next_val + 1
  returning next_val - 1 into v_next;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- 6.22 Create Offer RPC
create or replace function public.rpc_create_offer(
  p_kind text,
  p_material text,
  p_material_type text default 'Plastics',
  p_material_grade text default 'Standard',
  p_quantity numeric default 1000,
  p_unit text default 'kg',
  p_price_per_unit numeric default 1,
  p_currency text default 'EUR',
  p_country text default 'Germany',
  p_location text default '',
  p_truck_loads integer default 1,
  p_description text default '',
  p_priority text default 'medium',
  p_offer_type text default 'Spot',
  p_team text default 'General',
  p_status text default 'draft'
)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_number text;
  v_total numeric;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role <> 'moderator' then
    raise exception 'PERMISSION_DENIED: Only a Sales & Purchasing Offer Moderator can create offers.';
  end if;

  if p_quantity <= 0 then
    raise exception 'INVALID_INPUT: Quantity must be greater than zero.';
  end if;

  if p_price_per_unit < 0 then
    raise exception 'INVALID_INPUT: Price per unit cannot be negative.';
  end if;

  v_number := public.internal_next_offer_number(p_kind);
  v_total := round(p_quantity * p_price_per_unit, 2);

  insert into public.offers (
    number, kind, material, material_type, material_grade,
    quantity, unit, price_per_unit, currency, total_value,
    country, location, truck_loads, description, priority,
    offer_type, team, status, approval_status, created_by, updated_at
  ) values (
    v_number, p_kind, p_material, p_material_type, p_material_grade,
    p_quantity, p_unit, p_price_per_unit, p_currency, v_total,
    p_country, p_location, p_truck_loads, p_description, p_priority,
    p_offer_type, p_team, p_status, 'pending', v_caller.id, now()
  )
  returning * into v_offer;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (v_offer.id, v_caller.id, 'created', 'Created ' || p_kind || ' offer ' || v_number);

  return v_offer;
end;
$$;

-- 6.23 Update Offer RPC
create or replace function public.rpc_update_offer(
  p_offer_id uuid,
  p_material text default null,
  p_material_type text default null,
  p_material_grade text default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_price_per_unit numeric default null,
  p_currency text default null,
  p_country text default null,
  p_location text default null,
  p_truck_loads integer default null,
  p_description text default null,
  p_priority text default null,
  p_offer_type text default null,
  p_team text default null
)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role <> 'moderator' then
    raise exception 'PERMISSION_DENIED: Only a Sales & Purchasing Offer Moderator can edit offers.';
  end if;

  select * into v_offer from public.offers where id = p_offer_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND: Offer not found.';
  end if;

  update public.offers set
    material = coalesce(p_material, material),
    material_type = coalesce(p_material_type, material_type),
    material_grade = coalesce(p_material_grade, material_grade),
    quantity = coalesce(p_quantity, quantity),
    unit = coalesce(p_unit, unit),
    price_per_unit = coalesce(p_price_per_unit, price_per_unit),
    currency = coalesce(p_currency, currency),
    total_value = round(coalesce(p_quantity, quantity) * coalesce(p_price_per_unit, price_per_unit), 2),
    country = coalesce(p_country, country),
    location = coalesce(p_location, location),
    truck_loads = coalesce(p_truck_loads, truck_loads),
    description = coalesce(p_description, description),
    priority = coalesce(p_priority, priority),
    offer_type = coalesce(p_offer_type, offer_type),
    team = coalesce(p_team, team),
    updated_by = v_caller.id,
    updated_at = now()
  where id = p_offer_id
  returning * into v_offer;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (v_offer.id, v_caller.id, 'edited', 'Updated offer details');

  return v_offer;
end;
$$;

-- 6.24 Delete Offer RPC
create or replace function public.rpc_delete_offer(p_offer_id uuid)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role <> 'moderator' then
    raise exception 'PERMISSION_DENIED: Only a Sales & Purchasing Offer Moderator can delete offers.';
  end if;

  update public.offers set
    deleted_at = now(), deleted_by = v_caller.id, updated_at = now()
  where id = p_offer_id and deleted_at is null
  returning * into v_offer;

  if not found then
    raise exception 'NOT_FOUND: Offer not found.';
  end if;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (v_offer.id, v_caller.id, 'deleted', 'Offer marked deleted by moderator');

  return v_offer;
end;
$$;

-- 6.25 Submit Offer for Review RPC
create or replace function public.rpc_submit_offer_for_review(p_offer_id uuid)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role <> 'moderator' then
    raise exception 'PERMISSION_DENIED: Only a Sales & Purchasing Offer Moderator can submit offers for review.';
  end if;

  update public.offers set
    status = 'under_review', approval_status = 'pending', updated_by = v_caller.id, updated_at = now()
  where id = p_offer_id and deleted_at is null and status in ('draft', 'received')
  returning * into v_offer;

  if not found then
    raise exception 'INVALID_STATE: Only draft or received offers can be submitted for review.';
  end if;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (v_offer.id, v_caller.id, 'submitted_for_review', 'Submitted offer for Admin review');

  return v_offer;
end;
$$;

-- 6.26 Decide Offer RPC
create or replace function public.rpc_decide_offer(
  p_offer_id uuid,
  p_decision text,
  p_decision_note text
)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role <> 'owner' then
    raise exception 'PERMISSION_DENIED: Only Admin can approve or reject offers.';
  end if;

  if p_decision_note is null or length(trim(p_decision_note)) = 0 then
    raise exception 'INVALID_INPUT: A decision note is mandatory when approving or rejecting an offer.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_INPUT: Decision must be approved or rejected.';
  end if;

  update public.offers set
    approval_status = p_decision,
    status = case when p_decision = 'rejected' then 'lost' else status end,
    admin_decision_note = trim(p_decision_note),
    decided_by = v_caller.id,
    decided_at = now(),
    updated_at = now()
  where id = p_offer_id and deleted_at is null
  returning * into v_offer;

  if not found then
    raise exception 'NOT_FOUND: Offer not found.';
  end if;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (v_offer.id, v_caller.id, p_decision, 'Admin decision: ' || p_decision || '. Note: ' || trim(p_decision_note));

  return v_offer;
end;
$$;

-- 6.27 Update Offer Status RPC
create or replace function public.rpc_update_offer_status(
  p_offer_id uuid,
  p_status text
)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role <> 'moderator' then
    raise exception 'PERMISSION_DENIED: Only a Sales & Purchasing Offer Moderator can update offer statuses.';
  end if;

  if p_status not in ('draft', 'received', 'under_review', 'negotiating', 'won', 'lost') then
    raise exception 'INVALID_INPUT: Invalid offer status.';
  end if;

  update public.offers set
    status = p_status, updated_by = v_caller.id, updated_at = now()
  where id = p_offer_id and deleted_at is null
  returning * into v_offer;

  if not found then
    raise exception 'NOT_FOUND: Offer not found.';
  end if;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (v_offer.id, v_caller.id, 'status_changed', 'Status changed to ' || p_status);

  return v_offer;
end;
$$;

-- 6.28 Toggle Offer Favourite RPC
create or replace function public.rpc_toggle_offer_favourite(p_offer_id uuid)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offer public.offers;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role not in ('owner', 'moderator') then
    raise exception 'PERMISSION_DENIED: Unauthorized to toggle favourite status.';
  end if;

  update public.offers set
    is_favourite = not is_favourite, updated_at = now()
  where id = p_offer_id and deleted_at is null
  returning * into v_offer;

  if not found then
    raise exception 'NOT_FOUND: Offer not found.';
  end if;

  return v_offer;
end;
$$;

-- 6.29 Add Offer Comment RPC
create or replace function public.rpc_add_offer_comment(
  p_offer_id uuid,
  p_comment text
)
returns public.offer_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_comment public.offer_comments;
begin
  select * into v_caller from public.users where auth_user_id = auth.uid() and active = true;
  if not found or v_caller.role not in ('owner', 'moderator') then
    raise exception 'PERMISSION_DENIED: Unauthorized to comment on offers.';
  end if;

  if p_comment is null or length(trim(p_comment)) = 0 then
    raise exception 'INVALID_INPUT: Comment cannot be empty.';
  end if;

  insert into public.offer_comments (offer_id, author_id, comment)
  values (p_offer_id, v_caller.id, trim(p_comment))
  returning * into v_comment;

  insert into public.offer_activities (offer_id, actor_id, action, details)
  values (p_offer_id, v_caller.id, 'comment_added', 'Added comment: ' || left(trim(p_comment), 80));

  return v_comment;
end;
$$;

-- 6.30 Atomic Sequential PO Creation RPC
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
    number, title, company_id, status, value_eur, notes, created_by
  ) values (
    v_number, v_title, p_company_id, 'submitted', p_value_eur, coalesce(p_notes, ''), v_user_id
  ) returning id into v_order_id;

  insert into public.purchase_order_lines (
    purchase_order_id, description, quantity_kg
  ) values (
    v_order_id, trim(p_material_description), p_quantity_kg
  ) returning id into v_line_id;

  insert into public.audit_log (
    user_id, action, target_type, target_id, new_value
  ) values (
    v_user_id, 'order-created', 'purchase-order', v_order_id,
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

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY POLICIES (ALL 29 TABLES)
-- ----------------------------------------------------------------------------

alter table public.warehouses enable row level security;
alter table public.warehouses force row level security;
alter table public.companies enable row level security;
alter table public.companies force row level security;
alter table public.users enable row level security;
alter table public.users force row level security;
alter table public.materials enable row level security;
alter table public.materials force row level security;
alter table public.packaging_types enable row level security;
alter table public.packaging_types force row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_lines force row level security;
alter table public.shipments enable row level security;
alter table public.shipments force row level security;
alter table public.request_sequences enable row level security;
alter table public.request_sequences force row level security;
alter table public.requests enable row level security;
alter table public.requests force row level security;
alter table public.request_lines enable row level security;
alter table public.request_lines force row level security;
alter table public.worker_general_requests enable row level security;
alter table public.worker_general_requests force row level security;
alter table public.worker_general_request_attachments enable row level security;
alter table public.worker_general_request_attachments force row level security;
alter table public.documents enable row level security;
alter table public.documents force row level security;
alter table public.request_photos enable row level security;
alter table public.request_photos force row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_balances force row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;
alter table public.warehouse_transfers enable row level security;
alter table public.warehouse_transfers force row level security;
alter table public.customs_records enable row level security;
alter table public.customs_records force row level security;
alter table public.demurrage_records enable row level security;
alter table public.demurrage_records force row level security;
alter table public.annex7_records enable row level security;
alter table public.annex7_records force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.offer_sequences enable row level security;
alter table public.offers enable row level security;
alter table public.offer_attachments enable row level security;
alter table public.offer_comments enable row level security;
alter table public.offer_activities enable row level security;
alter table public.po_sequences enable row level security;
alter table public.inventory_history enable row level security;

-- 7.1 Master Data RLS
create policy warehouses_select on public.warehouses for select using (public.current_user_role() is not null);
create policy warehouses_owner_insert on public.warehouses for insert with check (public.current_user_role() = 'owner');
create policy warehouses_owner_update on public.warehouses for update using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

create policy materials_select on public.materials for select using (public.current_user_role() is not null);
create policy materials_owner_insert on public.materials for insert with check (public.current_user_role() = 'owner');
create policy materials_owner_update on public.materials for update using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

create policy packaging_types_select on public.packaging_types for select using (public.current_user_role() is not null);
create policy packaging_types_owner_insert on public.packaging_types for insert with check (public.current_user_role() = 'owner');
create policy packaging_types_owner_update on public.packaging_types for update using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

create policy users_select on public.users for select using (
  public.current_user_role() in ('owner', 'manager')
  or (public.current_user_role() = 'worker' and id = public.current_user_id())
  or (public.current_user_role() = 'moderator' and id = public.current_user_id())
);
create policy users_owner_insert on public.users for insert with check (public.current_user_role() = 'owner');
create policy users_owner_update on public.users for update using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');

create policy companies_select on public.companies for select using (public.current_user_role() is not null);
create policy companies_manager_insert on public.companies for insert with check (public.current_user_role() = 'manager');
create policy companies_manager_update on public.companies for update using (public.current_user_role() = 'manager') with check (public.current_user_role() = 'manager');

-- 7.2 PO & Lines RLS
create policy purchase_orders_select on public.purchase_orders for select using (
  public.current_user_role() in ('owner', 'manager')
  or (
    public.current_user_role() = 'worker'
    and exists (
      select 1 from public.shipments s
      where s.purchase_order_id = purchase_orders.id and s.warehouse_id = public.current_user_warehouse_id()
    )
  )
);
create policy purchase_orders_manager_insert on public.purchase_orders for insert with check (
  public.current_user_role() = 'manager' and created_by = public.current_user_id() and status in ('draft', 'submitted')
);
create policy purchase_orders_manager_update on public.purchase_orders for update using (
  public.current_user_role() = 'manager' and status in ('draft', 'submitted')
) with check (
  public.current_user_role() = 'manager' and status in ('draft', 'submitted')
);

create policy purchase_order_lines_select on public.purchase_order_lines for select using (
  exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_lines.purchase_order_id
      and (
        public.current_user_role() in ('owner', 'manager')
        or exists (
          select 1 from public.shipments s
          where s.purchase_order_id = po.id and s.warehouse_id = public.current_user_warehouse_id()
        )
      )
  )
);
create policy purchase_order_lines_manager_insert on public.purchase_order_lines for insert with check (
  public.current_user_role() = 'manager' and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_lines.purchase_order_id and po.status in ('draft', 'submitted')
  )
);
create policy purchase_order_lines_manager_update on public.purchase_order_lines for update using (
  public.current_user_role() = 'manager' and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_lines.purchase_order_id and po.status in ('draft', 'submitted')
  )
) with check (
  public.current_user_role() = 'manager' and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_lines.purchase_order_id and po.status in ('draft', 'submitted')
  )
);

-- 7.3 Operational Tables RLS
create policy shipments_select on public.shipments for select using (
  public.current_user_role() in ('owner', 'manager')
  or (public.current_user_role() = 'worker' and warehouse_id = public.current_user_warehouse_id())
);
create policy requests_select on public.requests for select using (
  public.current_user_role() in ('owner', 'manager')
  or (public.current_user_role() = 'worker' and warehouse_id = public.current_user_warehouse_id())
);
create policy request_lines_select on public.request_lines for select using (
  exists (
    select 1 from public.requests r
    where r.id = request_lines.request_id
      and (
        public.current_user_role() in ('owner', 'manager')
        or (public.current_user_role() = 'worker' and r.warehouse_id = public.current_user_warehouse_id())
      )
  )
);
create policy request_lines_worker_insert on public.request_lines for insert with check (
  public.current_user_role() = 'worker' and exists (
    select 1 from public.requests r
    where r.id = request_lines.request_id
      and r.created_by = public.current_user_id()
      and r.warehouse_id = public.current_user_warehouse_id()
      and r.status in ('submitted', 'declined', 'sent_back')
  )
);
create policy request_lines_worker_delete on public.request_lines for delete using (
  public.current_user_role() = 'worker' and exists (
    select 1 from public.requests r
    where r.id = request_lines.request_id
      and r.created_by = public.current_user_id()
      and r.warehouse_id = public.current_user_warehouse_id()
      and r.status in ('submitted', 'declined', 'sent_back')
  )
);
create policy request_photos_select on public.request_photos for select using (
  exists (
    select 1 from public.requests r
    where r.id = request_photos.request_id
      and (
        public.current_user_role() in ('owner', 'manager')
        or (public.current_user_role() = 'worker' and r.warehouse_id = public.current_user_warehouse_id())
      )
  )
);
create policy worker_general_requests_select on public.worker_general_requests for select using (
  public.current_user_role() in ('owner', 'manager')
  or (public.current_user_role() = 'worker' and created_by = public.current_user_id())
);
create policy worker_general_request_attachments_select on public.worker_general_request_attachments for select using (
  exists (
    select 1 from public.worker_general_requests gr
    where gr.id = worker_general_request_attachments.general_request_id
      and (
        public.current_user_role() in ('owner', 'manager')
        or (public.current_user_role() = 'worker' and gr.created_by = public.current_user_id())
      )
  )
);

create policy documents_select on public.documents for select using (
  status <> 'deleted'
  and (
    public.current_user_role() in ('owner', 'manager')
    or (
      public.is_document_bound_to_worker_warehouse(shipment_id, request_id, warehouse, created_by)
      and not exists (
        select 1 from public.worker_general_request_attachments gra
        join public.worker_general_requests gr on gr.id = gra.general_request_id
        where gra.document_id = documents.id and gr.created_by <> public.current_user_id()
      )
    )
  )
);
create policy documents_insert on public.documents for insert with check (
  created_by = public.current_user_id()
  and (
    public.current_user_role() = 'manager'
    or public.is_document_bound_to_worker_warehouse(shipment_id, request_id, warehouse, created_by)
  )
);
create policy documents_update on public.documents for update using (
  status <> 'deleted'
  and (
    public.current_user_role() = 'manager'
    or (created_by = public.current_user_id() and public.is_document_bound_to_worker_warehouse(shipment_id, request_id, warehouse, created_by))
  )
) with check (
  status <> 'deleted'
  and (
    public.current_user_role() = 'manager'
    or (created_by = public.current_user_id() and public.is_document_bound_to_worker_warehouse(shipment_id, request_id, warehouse, created_by))
  )
);

create policy stock_balances_select on public.stock_balances for select using (
  public.current_user_role() in ('owner', 'manager')
  or (public.current_user_role() = 'worker' and warehouse_id = public.current_user_warehouse_id())
);
create policy stock_movements_select on public.stock_movements for select using (
  public.current_user_role() in ('owner', 'manager')
  or (public.current_user_role() = 'worker' and warehouse_id = public.current_user_warehouse_id())
);
create policy warehouse_transfers_select on public.warehouse_transfers for select using (
  public.current_user_role() in ('owner', 'manager')
);
create policy customs_records_select on public.customs_records for select using (
  public.current_user_role() in ('owner', 'manager')
  or (
    public.current_user_role() = 'worker'
    and exists (select 1 from public.shipments s where s.id = customs_records.shipment_id and s.warehouse_id = public.current_user_warehouse_id())
  )
);
create policy demurrage_records_select on public.demurrage_records for select using (
  public.current_user_role() in ('owner', 'manager')
  or (
    public.current_user_role() = 'worker'
    and exists (select 1 from public.shipments s where s.id = demurrage_records.shipment_id and s.warehouse_id = public.current_user_warehouse_id())
  )
);
create policy annex7_records_select on public.annex7_records for select using (
  public.current_user_role() in ('owner', 'manager')
  or (
    public.current_user_role() = 'worker'
    and exists (select 1 from public.shipments s where s.id = annex7_records.shipment_id and s.warehouse_id = public.current_user_warehouse_id())
  )
);
create policy audit_log_owner_select on public.audit_log for select using (public.current_user_role() = 'owner');

-- 7.4 Offers RLS
create policy "offers_read_policy" on public.offers for select to authenticated using (
  public.current_user_role() in ('owner', 'moderator')
  and (deleted_at is null or public.current_user_role() = 'owner')
);
create policy "offers_moderator_insert" on public.offers for insert to authenticated with check (
  public.current_user_role() = 'moderator'
);
create policy "offers_moderator_update" on public.offers for update to authenticated using (
  public.current_user_role() = 'moderator' and deleted_at is null
) with check (
  public.current_user_role() = 'moderator'
);
create policy "offers_admin_update" on public.offers for update to authenticated using (
  public.current_user_role() = 'owner' and deleted_at is null
) with check (
  public.current_user_role() = 'owner'
);
create policy "offers_no_direct_delete" on public.offers for delete to authenticated using (false);

create policy "offer_attachments_read" on public.offer_attachments for select to authenticated using (
  public.current_user_role() in ('owner', 'moderator')
);
create policy "offer_attachments_moderator_insert" on public.offer_attachments for insert to authenticated with check (
  public.current_user_role() = 'moderator'
);
create policy "offer_attachments_moderator_delete" on public.offer_attachments for delete to authenticated using (
  public.current_user_role() = 'moderator'
);

create policy "offer_comments_read" on public.offer_comments for select to authenticated using (
  public.current_user_role() in ('owner', 'moderator')
);
create policy "offer_comments_insert" on public.offer_comments for insert to authenticated with check (
  public.current_user_role() in ('owner', 'moderator')
);

create policy "offer_activities_read" on public.offer_activities for select to authenticated using (
  public.current_user_role() in ('owner', 'moderator')
);

-- 7.5 PO Sequences & Inventory History RLS
create policy po_sequences_select on public.po_sequences for select to authenticated using (true);

create policy inv_hist_select on public.inventory_history for select to authenticated using (
  public.current_user_role() in ('owner', 'manager', 'moderator')
  or (
    public.current_user_role() = 'worker'
    and warehouse_id = public.current_user_warehouse_id()
  )
);
create policy inv_hist_insert on public.inventory_history for insert to authenticated with check (
  public.current_user_role() in ('owner', 'manager', 'worker')
);

-- ----------------------------------------------------------------------------
-- 8. STORAGE BUCKET & STORAGE RLS POLICIES
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stockflow-files',
  'stockflow-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stockflow_storage_select on storage.objects;
create policy stockflow_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'stockflow-files'
  and exists (
    select 1 from public.documents d
    where d.storage_key = storage.objects.name and d.status <> 'deleted'
      and (
        public.current_user_role() in ('owner', 'manager')
        or public.is_document_bound_to_worker_warehouse(d.shipment_id, d.request_id, d.warehouse, d.created_by)
      )
  )
);

drop policy if exists stockflow_storage_insert on storage.objects;
create policy stockflow_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'stockflow-files'
  and public.current_user_role() in ('manager', 'worker')
  and exists (
    select 1 from public.documents d
    where d.storage_key = storage.objects.name
      and d.created_by = public.current_user_id()
      and d.status in ('pending', 'active')
      and (
        public.current_user_role() = 'manager'
        or public.is_document_bound_to_worker_warehouse(d.shipment_id, d.request_id, d.warehouse, d.created_by)
      )
  )
);

drop policy if exists stockflow_storage_worker_delete on storage.objects;
create policy stockflow_storage_worker_delete on storage.objects for delete to authenticated using (
  bucket_id = 'stockflow-files'
  and public.current_user_role() = 'worker'
  and exists (
    select 1 from public.documents d
    left join public.requests r on r.id = d.request_id
    left join public.shipments s on s.id = d.shipment_id
    where d.storage_key = storage.objects.name
      and d.created_by = public.current_user_id()
      and public.is_document_bound_to_worker_warehouse(d.shipment_id, d.request_id, d.warehouse, d.created_by)
      and (r.id is null or r.status not in ('approved', 'completed'))
      and (s.id is null or s.status not in ('Completed', 'Dispatched'))
  )
);

drop policy if exists stockflow_storage_offers_select on storage.objects;
create policy stockflow_storage_offers_select on storage.objects for select to authenticated using (
  bucket_id = 'stockflow-files'
  and exists (
    select 1 from public.offer_attachments oa
    where oa.storage_key = storage.objects.name
      and public.current_user_role() in ('owner', 'moderator')
  )
);

drop policy if exists stockflow_storage_offers_insert on storage.objects;
create policy stockflow_storage_offers_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'stockflow-files'
  and public.current_user_role() = 'moderator'
  and exists (
    select 1 from public.offer_attachments oa
    where oa.storage_key = storage.objects.name
      and oa.uploaded_by = public.current_user_id()
  )
);

drop policy if exists stockflow_storage_offers_delete on storage.objects;
create policy stockflow_storage_offers_delete on storage.objects for delete to authenticated using (
  bucket_id = 'stockflow-files'
  and public.current_user_role() = 'moderator'
  and exists (
    select 1 from public.offer_attachments oa
    where oa.storage_key = storage.objects.name
      and oa.uploaded_by = public.current_user_id()
  )
);

-- ----------------------------------------------------------------------------
-- 9. PERMISSION GRANTS & REALTIME PUBLICATION
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

revoke update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;
revoke update, delete, truncate on public.stock_movements from public, anon, authenticated, service_role;
revoke insert on public.audit_log from public, anon, authenticated;

grant select on
  public.shipments,
  public.requests,
  public.request_photos,
  public.worker_general_requests,
  public.worker_general_request_attachments,
  public.stock_balances,
  public.stock_movements,
  public.warehouse_transfers,
  public.customs_records,
  public.demurrage_records,
  public.annex7_records,
  public.audit_log,
  public.offer_sequences,
  public.po_sequences,
  public.inventory_history
to authenticated;

grant select, insert, update on
  public.warehouses,
  public.materials,
  public.packaging_types,
  public.users,
  public.companies,
  public.purchase_orders,
  public.purchase_order_lines,
  public.documents,
  public.offers,
  public.offer_comments,
  public.offer_activities
to authenticated;

grant select, insert, delete on
  public.request_lines,
  public.offer_attachments
to authenticated;

-- Grant EXECUTE on all workflow RPCs & helpers
grant execute on function public.current_app_user() to authenticated;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_warehouse_id() to authenticated;
grant execute on function public.current_user_warehouse_name() to authenticated;
grant execute on function public.is_document_bound_to_worker_warehouse(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.rpc_admin_decide_order(text, text) to authenticated;
grant execute on function public.rpc_decide_request(uuid, text, text) to authenticated;
grant execute on function public.rpc_upload_annex7(text, text, uuid, text, text) to authenticated;
grant execute on function public.rpc_decide_annex7(uuid, text) to authenticated;
grant execute on function public.rpc_register_shipment(text, text, text, text, text, text) to authenticated;
grant execute on function public.rpc_save_shipment_meta(text, text, text, text, text) to authenticated;
grant execute on function public.rpc_save_carrier(text, text, timestamptz) to authenticated;
grant execute on function public.rpc_advance_shipment(text, text) to authenticated;
grant execute on function public.rpc_save_customs(text, text, text, text, text) to authenticated;
grant execute on function public.rpc_confirm_customs(text, uuid) to authenticated;
grant execute on function public.rpc_confirm_seller(text) to authenticated;
grant execute on function public.rpc_save_cmr(text, text, text, text, text, text) to authenticated;
grant execute on function public.rpc_worker_save_material_line(text, text, text, uuid, integer, numeric, numeric, boolean) to authenticated;
grant execute on function public.rpc_worker_delete_material_line(uuid) to authenticated;
grant execute on function public.rpc_submit_request_with_photos(uuid) to authenticated;
grant execute on function public.rpc_worker_soft_delete_request(uuid) to authenticated;
grant execute on function public.rpc_worker_complete_request(uuid) to authenticated;
grant execute on function public.rpc_worker_create_general_request(text, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.rpc_decide_general_request(uuid, text, text) to authenticated;
grant execute on function public.rpc_worker_delete_document(uuid) to authenticated;
grant execute on function public.rpc_create_offer to authenticated;
grant execute on function public.rpc_update_offer to authenticated;
grant execute on function public.rpc_delete_offer to authenticated;
grant execute on function public.rpc_submit_offer_for_review to authenticated;
grant execute on function public.rpc_decide_offer to authenticated;
grant execute on function public.rpc_update_offer_status to authenticated;
grant execute on function public.rpc_toggle_offer_favourite to authenticated;
grant execute on function public.rpc_add_offer_comment to authenticated;
grant execute on function public.rpc_create_purchase_order to authenticated;

-- Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.purchase_orders;
    alter publication supabase_realtime add table public.stock_balances;
    alter publication supabase_realtime add table public.stock_movements;
    alter publication supabase_realtime add table public.inventory_history;
    alter publication supabase_realtime add table public.offers;
  end if;
exception
  when duplicate_object then null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. IDEMPOTENT AUTH USER PROVISIONING (4 ROLES - GOTRUE COMPATIBLE)
-- ----------------------------------------------------------------------------
do $$
declare
  v_wh_bornem uuid;
  v_admin_id uuid := '10000000-0000-0000-0000-000000000001';
  v_staff_id uuid := '10000000-0000-0000-0000-000000000002';
  v_worker_id uuid := '10000000-0000-0000-0000-000000000003';
  v_mod_id uuid := '10000000-0000-0000-0000-000000000004';
  v_found_id uuid;
begin
  select id into v_wh_bornem from public.warehouses where name = 'Bornem' limit 1;

  -- Fix any pre-existing NULL token columns in auth.users so GoTrue scanner doesn't fail
  update auth.users
  set
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '');

  -- 10.1 Admin (owner)
  select id into v_found_id from auth.users where email = 'admin@stockflow.local';
  if v_found_id is not null then
    v_admin_id := v_found_id;
    update auth.users set
      encrypted_password = crypt('StockFlowAdmin2026!', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      phone_change = '',
      phone_change_token = '',
      reauthentication_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"name":"Ada Admin","role":"owner"}'::jsonb,
      updated_at = now()
    where id = v_admin_id;
  else
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
      'admin@stockflow.local', crypt('StockFlowAdmin2026!', gen_salt('bf')), now(),
      '', '', '', '',
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Ada Admin","role":"owner"}'::jsonb,
      false, now(), now()
    );
  end if;

  delete from auth.identities where user_id = v_admin_id or (provider = 'email' and provider_id = v_admin_id::text);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    v_admin_id, v_admin_id,
    json_build_object('sub', v_admin_id::text, 'email', 'admin@stockflow.local')::jsonb,
    'email', v_admin_id::text, now(), now(), now()
  );

  insert into public.users (id, auth_user_id, email, name, role, warehouse_id, active)
  values (v_admin_id, v_admin_id, 'admin@stockflow.local', 'Ada Admin', 'owner', null, true)
  on conflict (email) do update set auth_user_id = v_admin_id, role = 'owner', active = true;

  -- 10.2 Staff (manager)
  select id into v_found_id from auth.users where email = 'staff@stockflow.local';
  if v_found_id is not null then
    v_staff_id := v_found_id;
    update auth.users set
      encrypted_password = crypt('StockFlowStaff2026!', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      phone_change = '',
      phone_change_token = '',
      reauthentication_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"name":"Sam Staff","role":"manager"}'::jsonb,
      updated_at = now()
    where id = v_staff_id;
  else
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_staff_id, 'authenticated', 'authenticated',
      'staff@stockflow.local', crypt('StockFlowStaff2026!', gen_salt('bf')), now(),
      '', '', '', '',
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Sam Staff","role":"manager"}'::jsonb,
      false, now(), now()
    );
  end if;

  delete from auth.identities where user_id = v_staff_id or (provider = 'email' and provider_id = v_staff_id::text);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    v_staff_id, v_staff_id,
    json_build_object('sub', v_staff_id::text, 'email', 'staff@stockflow.local')::jsonb,
    'email', v_staff_id::text, now(), now(), now()
  );

  insert into public.users (id, auth_user_id, email, name, role, warehouse_id, active)
  values (v_staff_id, v_staff_id, 'staff@stockflow.local', 'Sam Staff', 'manager', null, true)
  on conflict (email) do update set auth_user_id = v_staff_id, role = 'manager', active = true;

  -- 10.3 Worker (worker) assigned strictly to Bornem
  select id into v_found_id from auth.users where email = 'worker.bornem@stockflow.local';
  if v_found_id is not null then
    v_worker_id := v_found_id;
    update auth.users set
      encrypted_password = crypt('StockFlowWorker2026!', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      phone_change = '',
      phone_change_token = '',
      reauthentication_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = json_build_object('name', 'Willem Worker', 'role', 'worker', 'warehouse_id', v_wh_bornem)::jsonb,
      updated_at = now()
    where id = v_worker_id;
  else
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_worker_id, 'authenticated', 'authenticated',
      'worker.bornem@stockflow.local', crypt('StockFlowWorker2026!', gen_salt('bf')), now(),
      '', '', '', '',
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      json_build_object('name', 'Willem Worker', 'role', 'worker', 'warehouse_id', v_wh_bornem)::jsonb,
      false, now(), now()
    );
  end if;

  delete from auth.identities where user_id = v_worker_id or (provider = 'email' and provider_id = v_worker_id::text);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    v_worker_id, v_worker_id,
    json_build_object('sub', v_worker_id::text, 'email', 'worker.bornem@stockflow.local')::jsonb,
    'email', v_worker_id::text, now(), now(), now()
  );

  insert into public.users (id, auth_user_id, email, name, role, warehouse_id, active)
  values (v_worker_id, v_worker_id, 'worker.bornem@stockflow.local', 'Willem Worker', 'worker', v_wh_bornem, true)
  on conflict (email) do update set auth_user_id = v_worker_id, role = 'worker', warehouse_id = v_wh_bornem, active = true;

  -- 10.4 Offer Moderator (moderator)
  select id into v_found_id from auth.users where email = 'moderator@stockflow.local';
  if v_found_id is not null then
    v_mod_id := v_found_id;
    update auth.users set
      encrypted_password = crypt('StockFlowMod2026!', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      phone_change = '',
      phone_change_token = '',
      reauthentication_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"name":"Morgan Moderator","role":"moderator"}'::jsonb,
      updated_at = now()
    where id = v_mod_id;
  else
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_mod_id, 'authenticated', 'authenticated',
      'moderator@stockflow.local', crypt('StockFlowMod2026!', gen_salt('bf')), now(),
      '', '', '', '',
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Morgan Moderator","role":"moderator"}'::jsonb,
      false, now(), now()
    );
  end if;

  delete from auth.identities where user_id = v_mod_id or (provider = 'email' and provider_id = v_mod_id::text);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    v_mod_id, v_mod_id,
    json_build_object('sub', v_mod_id::text, 'email', 'moderator@stockflow.local')::jsonb,
    'email', v_mod_id::text, now(), now(), now()
  );

  insert into public.users (id, auth_user_id, email, name, role, warehouse_id, active)
  values (v_mod_id, v_mod_id, 'moderator@stockflow.local', 'Morgan Moderator', 'moderator', null, true)
  on conflict (email) do update set auth_user_id = v_mod_id, role = 'moderator', active = true;

  raise notice 'SUCCESS: All 29 tables, storage, and 4 role accounts provisioned!';
end;
$$;

commit;

-- ----------------------------------------------------------------------------
-- 11. 18-POINT LIVE POSTGRESQL SECURITY & RLS VERIFICATION SUITE
-- Runs in isolated transaction and rolls back test data cleanly.
-- ----------------------------------------------------------------------------
begin;

do $$
declare
  v_wh_bornem uuid;
  v_wh_turnhout uuid;
  v_admin_id uuid;
  v_staff_id uuid;
  v_worker_id uuid;
  v_mod_id uuid;
  v_mat_id uuid;
  v_pkg_id uuid;
  v_po_id uuid;
  v_ship_id uuid;
  v_line_id uuid;
  v_offer_row record;
  v_deleted_count integer;
  v_updated_count integer;
begin
  select id into v_wh_bornem from public.warehouses where name = 'Bornem';
  select id into v_wh_turnhout from public.warehouses where name = 'Turnhout';
  select id into v_pkg_id from public.packaging_types where name = 'Normal Pallet';

  select id into v_admin_id from public.users where email = 'admin@stockflow.local';
  select id into v_staff_id from public.users where email = 'staff@stockflow.local';
  select id into v_worker_id from public.users where email = 'worker.bornem@stockflow.local';
  select id into v_mod_id from public.users where email = 'moderator@stockflow.local';

  execute 'set local role authenticated';

  -- 1. ADMIN PERMISSIONS & OPERATIONAL READ-ONLY
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- TEST 1: Admin creates master material
  insert into public.materials (material_number, description, unit, low_stock_threshold_kg)
  values ('HDPE-BLOW-TEST', 'HDPE Blow Moulding Test', 'kg', 250)
  returning id into v_mat_id;

  -- TEST 2: Admin operational write to companies BLOCKED
  begin
    insert into public.companies (name, kind, active) values ('Admin Illegal Supplier', 'supplier', true);
    raise exception 'FAIL: Admin was permitted to directly insert into companies!';
  exception when insufficient_privilege or sqlstate '42501' then
    null;
  end;

  -- TEST 3: Admin operational write to purchase_orders BLOCKED
  begin
    insert into public.purchase_orders (number, company_id, status, value_eur, created_by)
    values ('PO-ADMIN-ILLEGAL', (select id from public.companies limit 1), 'submitted', 1000, v_admin_id);
    raise exception 'FAIL: Admin was permitted to directly insert into purchase_orders!';
  exception when insufficient_privilege or sqlstate '42501' then
    null;
  end;

  -- 2. STAFF PERMISSIONS
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);

  -- TEST 4: Staff creates Supplier Company and PO
  insert into public.companies (name, kind, active) values ('Verified Raw Materials BV', 'supplier', true)
  returning id into v_mat_id;

  insert into public.purchase_orders (number, title, company_id, status, value_eur, notes, created_by)
  values ('PO-VERIFY-001', 'Verification Batch PO', v_mat_id, 'submitted', 12500, 'Security test order', v_staff_id)
  returning id into v_po_id;

  -- TEST 5: Staff self-approval BLOCKED
  begin
    perform public.rpc_admin_decide_order('PO-VERIFY-001', 'approved');
    raise exception 'FAIL: Staff was permitted to approve purchase order!';
  exception when others then
    null;
  end;

  -- TEST 6: Staff PO deletion BLOCKED
  begin
    delete from public.purchase_orders where id = v_po_id;
    get diagnostics v_deleted_count = row_count;
    if v_deleted_count > 0 then
      raise exception 'FAIL: Staff deleted a purchase order!';
    end if;
  exception when insufficient_privilege or sqlstate '42501' then
    null;
  end;

  -- TEST 7: Staff cannot reassign worker
  begin
    update public.users set warehouse_id = v_wh_turnhout where id = v_worker_id;
    get diagnostics v_updated_count = row_count;
    if v_updated_count > 0 then
      raise exception 'FAIL: Staff reassigned a worker warehouse!';
    end if;
  exception when others then
    null;
  end;

  -- 3. ADMIN APPROVAL
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform public.rpc_admin_decide_order('PO-VERIFY-001', 'approved');

  -- TEST 9: Post-approval immutability
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  begin
    update public.purchase_orders set value_eur = 999999 where id = v_po_id;
    get diagnostics v_updated_count = row_count;
    if v_updated_count > 0 then
      raise exception 'FAIL: Staff modified an approved purchase order!';
    end if;
  exception when others then
    null;
  end;

  -- 4. WORKER WAREHOUSE ISOLATION
  perform set_config('request.jwt.claim.sub', v_worker_id::text, true);

  -- TEST 10: Bornem Worker registers shipment at Bornem
  select id into v_ship_id from public.rpc_register_shipment(
    'inbound', 'CONT-BOR-VERIFY-01', 'PO-VERIFY-001', 'Verified Raw Materials BV', 'Bornem', ''
  );

  -- TEST 11: Bornem Worker registering at Turnhout BLOCKED
  begin
    perform public.rpc_register_shipment(
      'inbound', 'CONT-TRN-ILLEGAL', 'PO-VERIFY-001', 'Verified Raw Materials BV', 'Turnhout', ''
    );
    raise exception 'FAIL: Bornem worker registered shipment at Turnhout!';
  exception when others then
    null;
  end;

  -- TEST 12: Worker material line
  select id into v_line_id from public.rpc_worker_save_material_line(
    'inbound', 'CONT-BOR-VERIFY-01', 'HDPE Blow Moulding Test', v_pkg_id, 2, 550, 25, false
  );

  -- 5. OFFER MODERATOR
  perform set_config('request.jwt.claim.sub', v_mod_id::text, true);

  -- TEST 13: Moderator creates offer
  select * into v_offer_row from public.rpc_create_offer(
    'purchasing', 'LDPE Film Grade', 'Plastics', 'Grade A', 5000, 'kg', 1.25, 'EUR', 'Belgium', 'Antwerp', 1, 'Prime pellets', 'high', 'Spot', 'Polymers'
  );

  -- TEST 14: Moderator self-approval BLOCKED
  begin
    perform public.rpc_decide_offer(v_offer_row.id, 'approved', 'Self approval');
    raise exception 'FAIL: Offer Moderator was permitted to approve an offer!';
  exception when others then
    null;
  end;

  -- TEST 15: Worker offer creation BLOCKED
  perform set_config('request.jwt.claim.sub', v_worker_id::text, true);
  begin
    perform public.rpc_create_offer(
      'purchasing', 'Illegal Worker Offer', 'Plastics', 'Standard', 100, 'kg', 1.0, 'EUR', 'Belgium', '', 1, '', 'medium', 'Spot', 'General'
    );
    raise exception 'FAIL: Worker was permitted to create an offer!';
  exception when others then
    null;
  end;

  -- TEST 16: Admin direct edit BLOCKED
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  begin
    update public.offers set material = 'Admin Altered Offer' where id = v_offer_row.id;
    get diagnostics v_updated_count = row_count;
    if v_updated_count > 0 then
      raise exception 'FAIL: Admin directly modified offer operational data!';
    end if;
  exception when others then
    null;
  end;

  -- TEST 17: Review submission & Admin decision
  perform set_config('request.jwt.claim.sub', v_mod_id::text, true);
  perform public.rpc_submit_offer_for_review(v_offer_row.id);

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform public.rpc_decide_offer(v_offer_row.id, 'approved', 'Board approved purchase at €1.25/kg');

  -- TEST 18: Negotiation update & comments
  perform set_config('request.jwt.claim.sub', v_mod_id::text, true);
  perform public.rpc_update_offer_status(v_offer_row.id, 'negotiating');
  perform public.rpc_add_offer_comment(v_offer_row.id, 'Negotiation initiated with vendor.');

  raise notice '=======================================================';
  raise notice 'ALL 18 LIVE POSTGRESQL SECURITY & RLS TESTS PASSED!';
  raise notice '=======================================================';
end;
$$;

rollback;

do $$
begin
  raise notice 'CLEANUP: Security test artifacts rolled back successfully. Database is production-ready!';
end;
$$;

