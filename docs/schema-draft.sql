-- StockFlow schema draft for a later Supabase phase.
-- Documentation only. Do not execute this file. Do not install it.
-- No row level security, grants, or storage buckets are defined here.
-- Weights are kilograms. Timestamps are UTC.

create table warehouses (
  id uuid primary key,
  name text not null,
  country text not null,
  active boolean not null
);

create unique index warehouses_name_key on warehouses (lower(name));

create table companies (
  id uuid primary key,
  name text not null,
  kind text not null check (kind in ('supplier', 'customer')),
  active boolean not null
);

create unique index companies_name_kind_key on companies (lower(name), kind);

create table materials (
  id uuid primary key,
  material_number text not null,
  description text not null,
  unit text not null,
  low_stock_threshold_kg numeric(14, 3) not null check (low_stock_threshold_kg >= 0)
);

create unique index materials_number_key on materials (lower(material_number));

create table packaging_types (
  id uuid primary key,
  name text not null,
  tare_kg numeric(14, 3) not null check (tare_kg >= 0),
  active boolean not null
);

create unique index packaging_types_name_key on packaging_types (lower(name));

create table users (
  id uuid primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('owner', 'worker', 'manager', 'customer')),
  warehouse_id uuid references warehouses (id),
  company_id uuid references companies (id),
  active boolean not null,
  password_hash text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (role <> 'worker' or warehouse_id is not null),
  check (role = 'worker' or warehouse_id is null),
  check (role <> 'customer' or company_id is not null),
  check (role = 'customer' or company_id is null)
);

create unique index users_email_key on users (lower(email));

create table purchase_orders (
  id uuid primary key,
  number text not null unique,
  company_id uuid not null references companies (id),
  status text not null check (status in ('draft', 'submitted', 'approved', 'declined')),
  value_eur numeric(14, 2) not null check (value_eur >= 0),
  notes text not null,
  created_by uuid not null references users (id),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table purchase_order_lines (
  id uuid primary key,
  purchase_order_id uuid not null references purchase_orders (id),
  material_id uuid references materials (id),
  description text not null,
  quantity_kg numeric(14, 3) not null check (quantity_kg >= 0)
);

create table shipments (
  id uuid primary key,
  reference text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  purchase_order_id uuid references purchase_orders (id),
  container_number text not null,
  warehouse_id uuid not null references warehouses (id),
  origin_country text not null,
  destination_country text not null,
  status text not null check (status in (
    'Planned', 'In transit', 'Arrived', 'Registered', 'Unloading', 'Completed',
    'Loading', 'Loaded', 'Dispatched'
  )),
  carrier_name text not null,
  handed_over_at timestamptz,
  annex7_required boolean not null,
  seller_status text not null check (seller_status in ('Pending', 'Confirmed')),
  seller_company text not null,
  seller_confirmed_by text not null,
  seller_confirmed_at text not null,
  override_reason text,
  override_by text,
  override_at timestamptz,
  unique (direction, reference)
);

create unique index shipments_inbound_container_key
  on shipments (lower(container_number))
  where direction = 'inbound' and container_number <> '';

create table requests (
  id uuid primary key,
  number text not null unique check (number ~ '^REQ-[0-9]{4}-[0-9]{4}$'),
  type text not null check (type in ('loading', 'unloading')),
  shipment_id uuid not null references shipments (id),
  purchase_order_id uuid references purchase_orders (id),
  container_number text not null,
  warehouse_id uuid not null references warehouses (id),
  created_by uuid not null references users (id),
  status text not null check (status in (
    'submitted', 'approved', 'declined', 'sent_back', 'completed', 'deleted'
  )),
  decline_reason text,
  sent_back_note text,
  approved_by uuid references users (id),
  approved_at timestamptz,
  entered_by uuid references users (id),
  entered_at timestamptz,
  deleted_by uuid references users (id),
  deleted_at timestamptz,
  created_at timestamptz not null,
  check (status <> 'declined' or decline_reason is not null),
  check (status <> 'sent_back' or sent_back_note is not null),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  check (status <> 'completed' or (entered_by is not null and entered_at is not null)),
  check (status <> 'deleted' or (deleted_by is not null and deleted_at is not null))
);

create unique index requests_one_open_per_shipment
  on requests (shipment_id)
  where status in ('submitted', 'approved', 'sent_back');

create table request_lines (
  id uuid primary key,
  request_id uuid not null references requests (id),
  material_id uuid not null references materials (id),
  packaging_type_id uuid not null references packaging_types (id),
  package_count integer not null check (package_count > 0),
  gross_kg numeric(14, 3) not null check (gross_kg >= 0),
  tare_total_kg numeric(14, 3) not null,
  net_kg numeric(14, 3) not null,
  check (net_kg = round(gross_kg - tare_total_kg, 3)),
  check (net_kg > 0)
);

create table documents (
  id uuid primary key,
  kind text not null check (kind in ('cmr', 'photo', 'annex7', 'customs_proof', 'other')),
  category text not null check (category in ('Purchase', 'Container', 'Customs', 'Transport', 'Annex 7')),
  shipment_id uuid references shipments (id),
  purchase_order_id uuid references purchase_orders (id),
  name text not null,
  mime text not null,
  byte_size integer not null check (byte_size >= 0),
  storage_key text not null,
  cmr_reference text,
  cmr_carrier text,
  cmr_goods_description text,
  cmr_remarks text,
  cmr_entered_by text,
  cmr_entered_at timestamptz,
  created_by uuid not null references users (id),
  created_at timestamptz not null
);

create unique index documents_one_cmr_per_shipment
  on documents (shipment_id)
  where kind = 'cmr' and shipment_id is not null;

create table request_photos (
  id uuid primary key,
  request_id uuid not null references requests (id),
  document_id uuid not null references documents (id)
);

create table stock_balances (
  id uuid primary key,
  material_id uuid not null references materials (id),
  warehouse_id uuid not null references warehouses (id),
  weight_kg numeric(14, 3) not null check (weight_kg >= 0),
  unique (material_id, warehouse_id)
);

create table stock_movements (
  id uuid primary key,
  material_id uuid not null references materials (id),
  warehouse_id uuid not null references warehouses (id),
  weight_kg numeric(14, 3) not null check (weight_kg > 0),
  direction text not null check (direction in ('in', 'out')),
  request_id uuid not null references requests (id),
  request_line_id uuid not null references request_lines (id),
  created_at timestamptz not null,
  created_by uuid not null references users (id),
  unique (request_line_id, direction)
);

create table customs_records (
  id uuid primary key,
  shipment_id uuid not null unique references shipments (id),
  reference text not null,
  procedure_note text not null,
  goods_description text not null,
  declarant_reference text not null,
  confirmed_by uuid references users (id),
  confirmed_at timestamptz,
  proof_document_id uuid references documents (id)
);

create table demurrage_records (
  id uuid primary key,
  shipment_id uuid not null unique references shipments (id),
  started_at timestamptz,
  free_minutes integer not null check (free_minutes >= 0),
  rate_per_minute numeric(14, 4) not null check (rate_per_minute >= 0),
  completed_at timestamptz,
  elapsed_minutes integer check (elapsed_minutes is null or elapsed_minutes >= 0),
  billable_minutes integer check (billable_minutes is null or billable_minutes >= 0),
  charge_eur numeric(14, 2) check (charge_eur is null or charge_eur >= 0)
);

create table annex7_records (
  id uuid primary key,
  shipment_id uuid not null references shipments (id),
  document_id uuid not null references documents (id),
  reference text not null,
  status text not null check (status in ('uploaded', 'under_review', 'approved')),
  notes text not null,
  uploaded_by uuid not null references users (id),
  uploaded_at timestamptz not null
);

create table po_messages (
  id uuid primary key,
  purchase_order_id uuid references purchase_orders (id),
  scope text not null check (scope in ('purchase-order', 'seller', 'internal')),
  author_id uuid not null references users (id),
  body text not null,
  created_at timestamptz not null
);

create table audit_log (
  id uuid primary key,
  user_id uuid not null references users (id),
  action text not null,
  target_type text not null,
  target_id text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null
);

-- Local adapter only. Do not create these in Supabase.
-- Sessions belong to Supabase Auth. File bytes belong to Storage.
-- request_sequence (year integer, next integer) and the file HMAC secret
-- are process details of the JSON store, not business tables.
