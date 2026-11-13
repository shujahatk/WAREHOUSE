-- ============================================================================
-- STOCKFLOW — OFFERS MANAGEMENT MIGRATION (PURCHASING & SELLING OFFERS)
-- Roles: Admin (owner), Staff (manager), Worker (worker), Moderator (moderator)
-- ============================================================================

-- 1. Extend user role check to include 'moderator'
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('owner', 'manager', 'worker', 'moderator'));

alter table public.users drop constraint if exists users_worker_warehouse_check;
alter table public.users add constraint users_worker_warehouse_check check (
  (role = 'worker' and warehouse_id is not null and company_id is null)
  or (role in ('owner', 'manager', 'moderator') and warehouse_id is null and company_id is null)
);

-- 2. Sequence for Offer Numbers (POF-YYYY-XXXX and SOF-YYYY-XXXX)
create table if not exists public.offer_sequences (
  kind text not null check (kind in ('purchasing', 'selling')),
  year integer not null check (year >= 2020),
  next_val integer not null default 1 check (next_val >= 1),
  primary key (kind, year)
);

alter table public.offer_sequences enable row level security;

-- 3. Core Offers Table
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

-- 4. Offer Attachments (Images & Documents)
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

-- 5. Offer Comments & Notes
create table public.offer_comments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete restrict,
  comment text not null check (length(trim(comment)) > 0),
  created_at timestamptz not null default now()
);

create index offer_comments_offer_idx on public.offer_comments (offer_id);

-- 6. Offer Activity History
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
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

alter table public.offers enable row level security;
alter table public.offer_attachments enable row level security;
alter table public.offer_comments enable row level security;
alter table public.offer_activities enable row level security;

-- Offers RLS
-- Moderator and Admin can view all non-deleted offers
create policy "offers_read_policy" on public.offers
  for select to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
    and (deleted_at is null or (select role from public.users where auth_user_id = auth.uid()) = 'owner')
  );

-- Moderator can insert offers
create policy "offers_moderator_insert" on public.offers
  for insert to authenticated
  with check (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
  );

-- Moderator can update non-deleted offers (cannot alter admin decision directly)
create policy "offers_moderator_update" on public.offers
  for update to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
    and deleted_at is null
  )
  with check (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
  );

-- Admin can update offers only for approval/rejection decision notes and favourite flag
create policy "offers_admin_update" on public.offers
  for update to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'owner'
    and deleted_at is null
  )
  with check (
    (select role from public.users where auth_user_id = auth.uid()) = 'owner'
  );

-- Direct deletion is blocked for everyone; soft-deletion is done via update
create policy "offers_no_direct_delete" on public.offers
  for delete to authenticated
  using (false);

-- Attachments RLS
create policy "offer_attachments_read" on public.offer_attachments
  for select to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
  );

create policy "offer_attachments_moderator_insert" on public.offer_attachments
  for insert to authenticated
  with check (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
  );

create policy "offer_attachments_moderator_delete" on public.offer_attachments
  for delete to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) = 'moderator'
  );

-- Comments RLS
create policy "offer_comments_read" on public.offer_comments
  for select to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
  );

create policy "offer_comments_insert" on public.offer_comments
  for insert to authenticated
  with check (
    (select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
  );

-- Activities RLS
create policy "offer_activities_read" on public.offer_activities
  for select to authenticated
  using (
    (select role from public.users where auth_user_id = auth.uid()) in ('owner', 'moderator')
  );

-- ----------------------------------------------------------------------------
-- 8. RPC DEFINITIONS
-- ----------------------------------------------------------------------------

-- Helper: next offer number
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

-- 8.1 Create Offer
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

grant execute on function public.rpc_create_offer to authenticated;

-- 8.2 Update Offer
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

grant execute on function public.rpc_update_offer to authenticated;

-- 8.3 Soft Delete Offer
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
    deleted_at = now(),
    deleted_by = v_caller.id,
    updated_at = now()
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

grant execute on function public.rpc_delete_offer to authenticated;

-- 8.4 Submit Offer for Review
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
    status = 'under_review',
    approval_status = 'pending',
    updated_by = v_caller.id,
    updated_at = now()
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

grant execute on function public.rpc_submit_offer_for_review to authenticated;

-- 8.5 Admin Decide Offer (Approve / Reject)
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
  v_new_status text;
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

  v_new_status := case when p_decision = 'rejected' then 'lost' else 'negotiating' end;

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

grant execute on function public.rpc_decide_offer to authenticated;

-- 8.6 Update Offer Status (Moderator status management: negotiating, won, lost)
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
    status = p_status,
    updated_by = v_caller.id,
    updated_at = now()
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

grant execute on function public.rpc_update_offer_status to authenticated;

-- 8.7 Toggle Favourite
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
    is_favourite = not is_favourite,
    updated_at = now()
  where id = p_offer_id and deleted_at is null
  returning * into v_offer;

  if not found then
    raise exception 'NOT_FOUND: Offer not found.';
  end if;

  return v_offer;
end;
$$;

grant execute on function public.rpc_toggle_offer_favourite to authenticated;

-- 8.8 Add Offer Comment
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

grant execute on function public.rpc_add_offer_comment to authenticated;

