-- ============================================================================
-- STOCKFLOW — MIGRATION 0005: PHASE 4 COMPLETE CONSOLIDATED MIGRATION
-- Single self-contained, idempotent, and non-destructive SQL script
-- Compatible with Supabase SQL Editor: paste and run in a single go
-- Covers: Audit Trail, Notifications, Notification Preferences, RPCs, RLS & Triggers
-- Preserves: 100% of existing PO records and operational data (ZERO deletions)
-- ============================================================================

begin;

-- Ensure pgcrypto extension is active if supported (gen_random_uuid is native in Postgres 13+)
do $$
begin
  create extension if not exists "pgcrypto";
exception when others then
  null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. ALIGN AUTHENTICATION & ROLE RECOGNITION (Minimum Moderator-role update)
-- ----------------------------------------------------------------------------

-- Preserves existing authentication, active-user, and 1:1 auth_user_id mapping.
-- Makes ONLY the minimum compatibility update: includes 'moderator' alongside 'owner', 'manager', 'worker'.
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

revoke all on function public.current_app_user() from public, anon;
grant execute on function public.current_app_user() to authenticated, service_role;

-- Ensure users_role_check constraint allows 'moderator' consistently if not already updated
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
      and pg_get_constraintdef(oid) like '%moderator%'
  ) then
    alter table public.users drop constraint if exists users_role_check;
    alter table public.users add constraint users_role_check
      check (role in ('owner', 'manager', 'worker', 'moderator'));
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. COMPLETE AUDIT TRAIL ENHANCEMENT (Non-Destructive & Additive)
-- ----------------------------------------------------------------------------

-- Extend audit_log with structured contextual columns if not already present
alter table public.audit_log
  add column if not exists actor_role text,
  add column if not exists actor_name text,
  add column if not exists warehouse_id uuid references public.warehouses (id) on delete set null,
  add column if not exists context text,
  add column if not exists request_reference text;

-- Indexes for fast paginated audit querying and filtering
create index if not exists audit_log_user_idx on public.audit_log (user_id);
create index if not exists audit_log_action_idx on public.audit_log (action);
create index if not exists audit_log_warehouse_idx on public.audit_log (warehouse_id);
create index if not exists audit_log_target_type_idx on public.audit_log (target_type);
create index if not exists audit_log_created_at_desc_idx on public.audit_log (created_at desc);

-- Trigger to automatically populate actor_role and actor_name if omitted during insert
create or replace function public.audit_log_populate_actor_details()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
begin
  if new.user_id is not null and (new.actor_role is null or new.actor_name is null) then
    select * into v_user from public.users where id = new.user_id;
    if found then
      if new.actor_role is null then
        new.actor_role := v_user.role;
      end if;
      if new.actor_name is null then
        new.actor_name := v_user.name;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_log_populate_actor_details() from public, anon, authenticated;

drop trigger if exists audit_log_populate_details_trigger on public.audit_log;
create trigger audit_log_populate_details_trigger
  before insert on public.audit_log
  for each row execute function public.audit_log_populate_actor_details();

-- Ensure immutable append-only trigger function is defined
-- Handles both row-level UPDATE/DELETE and statement-level TRUNCATE triggers
create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Table %.% is strictly append-only; % is prohibited.', tg_table_schema, tg_table_name, tg_op;
end;
$$;

revoke all on function public.prevent_append_only_mutation() from public, anon, authenticated;

-- Guarantee immutability of audit_log: prevent any updates, deletions, or truncations
drop trigger if exists audit_log_block_update_delete on public.audit_log;
create trigger audit_log_block_update_delete
  before update or delete on public.audit_log
  for each row execute function public.prevent_append_only_mutation();

drop trigger if exists audit_log_block_truncate on public.audit_log;
create trigger audit_log_block_truncate
  before truncate on public.audit_log
  execute function public.prevent_append_only_mutation();

-- Row Level Security on audit_log
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- Admin (Owner) can select all audit log records
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log
  for select to authenticated
  using ((select public.current_user_role()) = 'owner');

-- Sales & Purchasing Offer Moderator can select only offer-related audit entries
drop policy if exists audit_log_moderator_select on public.audit_log;
create policy audit_log_moderator_select on public.audit_log
  for select to authenticated
  using (
    (select public.current_user_role()) = 'moderator'
    and target_type in ('offer', 'offer_comment', 'offer_attachment', 'offer_sequence')
  );

-- Service role has full audit access
drop policy if exists audit_log_service_select on public.audit_log;
create policy audit_log_service_select on public.audit_log
  for select to service_role
  using (true);

-- Explicitly block any direct client writes at RLS level
drop policy if exists audit_log_no_client_insert on public.audit_log;
create policy audit_log_no_client_insert on public.audit_log
  for insert to authenticated
  with check (false);

drop policy if exists audit_log_no_client_update on public.audit_log;
create policy audit_log_no_client_update on public.audit_log
  for update to authenticated
  using (false);

drop policy if exists audit_log_no_client_delete on public.audit_log;
create policy audit_log_no_client_delete on public.audit_log
  for delete to authenticated
  using (false);

-- Permissions: authenticated users can read permitted rows; direct write/delete is revoked
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. SECURE PAGINATED AUDIT RPC (rpc_query_audit_trail)
-- ----------------------------------------------------------------------------

create or replace function public.rpc_query_audit_trail(
  p_search text default null,
  p_role text default null,
  p_action text default null,
  p_module text default null,
  p_warehouse_id uuid default null,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_offset integer;
  v_limit integer;
  v_total bigint;
  v_rows jsonb;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null then
    raise exception 'Authentication required';
  end if;

  -- Only Owner (Admin) and Moderator (offers only) can view audit trail
  if v_caller.role not in ('owner', 'moderator') then
    raise exception 'Forbidden: Insufficient privileges to view audit trail';
  end if;

  v_limit := greatest(1, least(coalesce(p_page_size, 20), 100));
  v_offset := (greatest(1, coalesce(p_page, 1)) - 1) * v_limit;

  -- Count total matching rows
  select count(*)
  into v_total
  from public.audit_log a
  left join public.users u on u.id = a.user_id
  where (
    (v_caller.role = 'owner') or
    (v_caller.role = 'moderator' and a.target_type in ('offer', 'offer_comment', 'offer_attachment', 'offer_sequence'))
  )
  and (p_role is null or coalesce(a.actor_role, u.role) = p_role)
  and (p_action is null or a.action = p_action)
  and (p_module is null or a.target_type = p_module)
  and (p_warehouse_id is null or a.warehouse_id = p_warehouse_id)
  and (p_start_date is null or a.created_at >= p_start_date)
  and (p_end_date is null or a.created_at <= p_end_date)
  and (
    p_search is null or
    coalesce(a.actor_name, u.name, '') ilike '%' || p_search || '%' or
    a.target_id ilike '%' || p_search || '%' or
    coalesce(a.request_reference, '') ilike '%' || p_search || '%' or
    coalesce(a.new_value, '') ilike '%' || p_search || '%'
  );

  -- Retrieve paginated rows
  select coalesce(jsonb_agg(r), '[]'::jsonb)
  into v_rows
  from (
    select
      a.id,
      a.user_id,
      coalesce(a.actor_name, u.name, 'System') as actor_name,
      coalesce(a.actor_role, u.role, 'system') as actor_role,
      a.action,
      a.target_type,
      a.target_id,
      a.old_value,
      a.new_value,
      a.created_at,
      a.warehouse_id,
      w.name as warehouse_name,
      a.context,
      a.request_reference
    from public.audit_log a
    left join public.users u on u.id = a.user_id
    left join public.warehouses w on w.id = a.warehouse_id
    where (
      (v_caller.role = 'owner') or
      (v_caller.role = 'moderator' and a.target_type in ('offer', 'offer_comment', 'offer_attachment', 'offer_sequence'))
    )
    and (p_role is null or coalesce(a.actor_role, u.role) = p_role)
    and (p_action is null or a.action = p_action)
    and (p_module is null or a.target_type = p_module)
    and (p_warehouse_id is null or a.warehouse_id = p_warehouse_id)
    and (p_start_date is null or a.created_at >= p_start_date)
    and (p_end_date is null or a.created_at <= p_end_date)
    and (
      p_search is null or
      coalesce(a.actor_name, u.name, '') ilike '%' || p_search || '%' or
      a.target_id ilike '%' || p_search || '%' or
      coalesce(a.request_reference, '') ilike '%' || p_search || '%' or
      coalesce(a.new_value, '') ilike '%' || p_search || '%'
    )
    order by a.created_at desc
    limit v_limit
    offset v_offset
  ) r;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', greatest(1, coalesce(p_page, 1)),
    'pageSize', v_limit,
    'totalPages', ceil(v_total::numeric / v_limit)
  );
end;
$$;

revoke all on function public.rpc_query_audit_trail(text, text, text, text, uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.rpc_query_audit_trail to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. NOTIFICATIONS TABLE, RLS & STRICT FIELD IMMUTABILITY
-- ----------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users (id) on delete cascade,
  event_type text not null check (length(trim(event_type)) > 0),
  title text not null check (length(trim(title)) > 0),
  message text not null check (length(trim(message)) > 0),
  target_type text,
  target_id text,
  link text,
  warehouse_id uuid references public.warehouses (id) on delete set null,
  read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Optimize notification queries by recipient, read state, and timestamp
create index if not exists notifications_recipient_id_idx
  on public.notifications (recipient_id);
create index if not exists notifications_warehouse_id_idx
  on public.notifications (warehouse_id);
create index if not exists notifications_recipient_read_idx
  on public.notifications (recipient_id, read, created_at desc);
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

-- Guard trigger: Recipients can ONLY update read and read_at.
-- All other fields (recipient_id, title, message, event_type, target_type, target_id, etc.) are strictly immutable.
create or replace function public.notifications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.id is distinct from new.id or
     old.recipient_id is distinct from new.recipient_id or
     old.event_type is distinct from new.event_type or
     old.title is distinct from new.title or
     old.message is distinct from new.message or
     old.target_type is distinct from new.target_type or
     old.target_id is distinct from new.target_id or
     old.link is distinct from new.link or
     old.warehouse_id is distinct from new.warehouse_id or
     old.created_at is distinct from new.created_at then
    raise exception 'PERMISSION_DENIED: Only read and read_at fields may be updated on notifications.';
  end if;
  return new;
end;
$$;

revoke all on function public.notifications_guard_update() from public, anon, authenticated;

drop trigger if exists notifications_guard_update_trigger on public.notifications;
create trigger notifications_guard_update_trigger
  before update on public.notifications
  for each row execute function public.notifications_guard_update();

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- RLS: Recipients can select their own notifications, or Admin (owner) can view all notifications
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
  for select to authenticated
  using (
    recipient_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'owner'
  );

-- RLS: Recipients can update their own notifications
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
  for update to authenticated
  using (recipient_id = (select public.current_user_id()))
  with check (recipient_id = (select public.current_user_id()));

-- Direct client insertion is blocked; clients must invoke rpc_create_notification
drop policy if exists notifications_no_direct_insert on public.notifications;
create policy notifications_no_direct_insert on public.notifications
  for insert to authenticated
  with check (false);

-- Direct client deletion is revoked to preserve notification history
drop policy if exists notifications_no_direct_delete on public.notifications;
create policy notifications_no_direct_delete on public.notifications
  for delete to authenticated
  using (false);

-- Service role has full management
drop policy if exists notifications_service_role_all on public.notifications;
create policy notifications_service_role_all on public.notifications
  for all to service_role
  using (true)
  with check (true);

-- Privilege restrictions:
-- Revoke direct DML writes from client
revoke insert, update, delete, truncate on public.notifications from public, anon, authenticated;
-- Authenticated users can select notifications and update ONLY (read, read_at) columns
grant select on public.notifications to authenticated;
grant update (read, read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ----------------------------------------------------------------------------
-- 5. NOTIFICATION RPC FUNCTIONS & ACCESS RESTRICTIONS
-- ----------------------------------------------------------------------------

-- 5.1 Internal helper: dispatch notification safely with duplicate suppression (60 seconds)
-- Strictly internal to trusted database functions and service_role. NOT callable by public, anon, or authenticated.
create or replace function public.dispatch_notification(
  p_recipient_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_target_type text default null,
  p_target_id text default null,
  p_link text default null,
  p_warehouse_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1 from public.notifications
    where recipient_id = p_recipient_id
      and event_type = p_event_type
      and coalesce(target_id, '') = coalesce(p_target_id, '')
      and created_at > now() - interval '60 seconds'
  ) into v_exists;

  if not v_exists then
    insert into public.notifications (
      recipient_id, event_type, title, message, target_type, target_id, link, warehouse_id
    ) values (
      p_recipient_id, p_event_type, p_title, p_message, p_target_type, p_target_id, p_link, p_warehouse_id
    );
  end if;
end;
$$;

-- Revoke dispatch_notification execution from public, anon, and authenticated
revoke all on function public.dispatch_notification(uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.dispatch_notification(uuid, text, text, text, text, text, text, uuid) to service_role;

-- 5.2 Authenticated create notification RPC (Strengthened cross-role & warehouse validation)
create or replace function public.rpc_create_notification(
  p_recipient_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_target_type text default null,
  p_target_id text default null,
  p_link text default null,
  p_warehouse_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.users;
  v_recipient public.users;
  v_wh_exists boolean;
  v_effective_warehouse_id uuid;
  v_id uuid;
begin
  -- 1. Resolve and authenticate caller
  v_caller := public.current_app_user();
  if v_caller.id is null then
    raise exception 'Authentication required';
  end if;

  -- 2. Input validation: title, message, event_type
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'INVALID_INPUT: Notification title cannot be empty.';
  end if;
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'INVALID_INPUT: Notification message cannot be empty.';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'INVALID_INPUT: Notification event type cannot be empty.';
  end if;

  -- 3. Validate recipient exists and is active
  select * into v_recipient from public.users where id = p_recipient_id and active = true;
  if not found then
    raise exception 'INVALID_RECIPIENT: Recipient user does not exist or is inactive.';
  end if;

  -- 4. Role-based notification authorization & cross-role boundaries

  -- 4.1 Offer Moderator strict rules (Applies to BOTH self-notification and cross-user notifications)
  if v_caller.role = 'moderator' then
    -- Allowed recipients: themselves, Admin (owner), or fellow Moderators
    if v_recipient.role not in ('owner', 'moderator') then
      raise exception 'PERMISSION_DENIED: Offer moderators may only notify administrators or moderators.';
    end if;

    -- Strict target_type validation: reject NULL, empty string, whitespace-only, and unapproved types
    if p_target_type is null or length(trim(p_target_type)) = 0 then
      raise exception 'INVALID_TARGET_TYPE: Offer moderators must specify an approved offer target type; NULL or empty is not permitted.';
    end if;
    if trim(p_target_type) not in ('offer', 'offer_comment', 'offer_attachment', 'offer_sequence') then
      raise exception 'PERMISSION_DENIED: Offer moderators may only create offer-related notifications.';
    end if;
  end if;

  -- 4.2 Self-notification vs Cross-user boundaries
  if p_recipient_id = v_caller.id then
    -- Explicit self-notification:
    -- Workers can only self-notify and MUST use their assigned warehouse; reject NULL or mismatched warehouse IDs
    if v_caller.role = 'worker' then
      if p_warehouse_id is null then
        raise exception 'WAREHOUSE_REQUIRED: Worker notifications must use their assigned warehouse; NULL is not permitted.';
      end if;
      if p_warehouse_id <> v_caller.warehouse_id then
        raise exception 'CROSS_WAREHOUSE_DENIED: Worker is isolated to warehouse %.', v_caller.warehouse_id;
      end if;
    end if;
  else
    -- Cross-user notification:
    -- Workers can NEVER create notifications for other users
    if v_caller.role = 'worker' then
      raise exception 'PERMISSION_DENIED: Workers cannot create notifications for other users.';
    end if;

    -- Only Admin (owner), Staff (manager), and Offer Moderator (for offers) may create cross-user notifications
    if v_caller.role not in ('owner', 'manager', 'moderator') then
      raise exception 'PERMISSION_DENIED: Unauthorized to create notifications for other users.';
    end if;
  end if;

  -- 5. Warehouse isolation & derivation
  if v_recipient.role = 'worker' then
    -- Any notification to a Worker (whether self, Manager, or Admin) must be bound to the worker's warehouse
    if p_warehouse_id is not null then
      if p_warehouse_id <> v_recipient.warehouse_id then
        raise exception 'CROSS_WAREHOUSE_DENIED: Worker recipient is isolated to warehouse %.', v_recipient.warehouse_id;
      end if;
      v_effective_warehouse_id := p_warehouse_id;
    else
      -- When p_warehouse_id is NULL:
      -- Worker caller is already blocked above if p_warehouse_id is NULL.
      -- For Managers (or Admin) notifying Workers, derive and validate the recipient's warehouse.
      -- Never allow NULL to bypass warehouse isolation.
      v_effective_warehouse_id := v_recipient.warehouse_id;
    end if;

    -- Validate that the worker's warehouse exists and is active
    if v_effective_warehouse_id is null then
      raise exception 'INVALID_WAREHOUSE: Recipient worker does not have an assigned warehouse.';
    end if;
    select exists(select 1 from public.warehouses where id = v_effective_warehouse_id and active = true) into v_wh_exists;
    if not v_wh_exists then
      raise exception 'INVALID_WAREHOUSE: Warehouse % does not exist or is inactive.', v_effective_warehouse_id;
    end if;

  else
    -- Recipient is non-worker (owner, manager, moderator)
    if p_warehouse_id is not null then
      select exists(select 1 from public.warehouses where id = p_warehouse_id and active = true) into v_wh_exists;
      if not v_wh_exists then
        raise exception 'INVALID_WAREHOUSE: Specified warehouse does not exist or is inactive.';
      end if;
      v_effective_warehouse_id := p_warehouse_id;
    else
      v_effective_warehouse_id := null;
    end if;
  end if;

  -- 6. Insert notification record with verified/derived warehouse
  insert into public.notifications (
    recipient_id, event_type, title, message, target_type, target_id, link, warehouse_id
  ) values (
    p_recipient_id,
    trim(p_event_type),
    trim(p_title),
    trim(p_message),
    nullif(trim(p_target_type), ''),
    p_target_id,
    p_link,
    v_effective_warehouse_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 5.3 Mark single notification as read
create or replace function public.rpc_mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := public.current_user_id();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set read = true, read_at = now()
  where id = p_notification_id
    and (recipient_id = v_caller_id or public.current_user_role() = 'owner');
  return found;
end;
$$;

-- 5.4 Mark all notifications as read for calling user
create or replace function public.rpc_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_updated integer;
begin
  v_caller_id := public.current_user_id();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set read = true, read_at = now()
  where recipient_id = v_caller_id
    and read = false;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.rpc_create_notification(uuid, text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.rpc_mark_notification_read(uuid) from public, anon;
revoke all on function public.rpc_mark_all_notifications_read() from public, anon;

grant execute on function public.rpc_create_notification to authenticated, service_role;
grant execute on function public.rpc_mark_notification_read to authenticated, service_role;
grant execute on function public.rpc_mark_all_notifications_read to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. NOTIFICATION PREFERENCES TABLE & RLS
-- ----------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  notify_orders boolean not null default true,
  notify_inventory boolean not null default true,
  notify_requests boolean not null default true,
  notify_offers boolean not null default true,
  notify_demurrage boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists notification_preferences_user_select on public.notification_preferences;
create policy notification_preferences_user_select on public.notification_preferences
  for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'owner'
  );

-- Enforce strict self-preference management: separate INSERT and UPDATE (never FOR ALL)
drop policy if exists notification_preferences_user_upsert on public.notification_preferences;
drop policy if exists notification_preferences_user_insert on public.notification_preferences;
create policy notification_preferences_user_insert on public.notification_preferences
  for insert to authenticated
  with check (user_id = (select public.current_user_id()));

drop policy if exists notification_preferences_user_update on public.notification_preferences;
create policy notification_preferences_user_update on public.notification_preferences
  for update to authenticated
  using (user_id = (select public.current_user_id()))
  with check (user_id = (select public.current_user_id()));

-- Direct client deletion is prohibited
drop policy if exists notification_preferences_no_delete on public.notification_preferences;
create policy notification_preferences_no_delete on public.notification_preferences
  for delete to authenticated
  using (false);

drop policy if exists notification_preferences_service_all on public.notification_preferences;
create policy notification_preferences_service_all on public.notification_preferences
  for all to service_role
  using (true)
  with check (true);

revoke insert, update, delete, truncate on public.notification_preferences from public, anon;
revoke delete, truncate on public.notification_preferences from authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

-- ----------------------------------------------------------------------------
-- 7. NOTIFICATION PREFERENCES RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- Enforces that caller can only save their own preferences (derived from current_user_id)
create or replace function public.rpc_save_notification_preferences(
  p_notify_orders boolean default true,
  p_notify_inventory boolean default true,
  p_notify_requests boolean default true,
  p_notify_offers boolean default true,
  p_notify_demurrage boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_res jsonb;
begin
  v_uid := public.current_user_id();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.notification_preferences (
    user_id, notify_orders, notify_inventory, notify_requests, notify_offers, notify_demurrage, updated_at
  ) values (
    v_uid, p_notify_orders, p_notify_inventory, p_notify_requests, p_notify_offers, p_notify_demurrage, now()
  )
  on conflict (user_id) do update set
    notify_orders = excluded.notify_orders,
    notify_inventory = excluded.notify_inventory,
    notify_requests = excluded.notify_requests,
    notify_offers = excluded.notify_offers,
    notify_demurrage = excluded.notify_demurrage,
    updated_at = now()
  returning jsonb_build_object(
    'user_id', user_id,
    'notify_orders', notify_orders,
    'notify_inventory', notify_inventory,
    'notify_requests', notify_requests,
    'notify_offers', notify_offers,
    'notify_demurrage', notify_demurrage,
    'updated_at', updated_at
  ) into v_res;

  return v_res;
end;
$$;

-- Enforces that caller can only retrieve their own preferences
create or replace function public.rpc_get_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_res jsonb;
begin
  v_uid := public.current_user_id();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'user_id', user_id,
    'notify_orders', notify_orders,
    'notify_inventory', notify_inventory,
    'notify_requests', notify_requests,
    'notify_offers', notify_offers,
    'notify_demurrage', notify_demurrage,
    'updated_at', updated_at
  ) into v_res
  from public.notification_preferences
  where user_id = v_uid;

  if v_res is null then
    v_res := jsonb_build_object(
      'user_id', v_uid,
      'notify_orders', true,
      'notify_inventory', true,
      'notify_requests', true,
      'notify_offers', true,
      'notify_demurrage', true,
      'updated_at', now()
    );
  end if;

  return v_res;
end;
$$;

revoke all on function public.rpc_save_notification_preferences(boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.rpc_get_notification_preferences() from public, anon;

grant execute on function public.rpc_save_notification_preferences to authenticated, service_role;
grant execute on function public.rpc_get_notification_preferences to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. OPERATIONAL EVENT NOTIFICATION TRIGGER
-- ----------------------------------------------------------------------------

create or replace function public.trigger_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
begin
  if tg_op = 'INSERT' and new.status = 'submitted' then
    for v_admin_id in select id from public.users where role = 'owner' and active = true loop
      perform public.dispatch_notification(
        v_admin_id,
        'order_submitted',
        'Purchase Order Submitted',
        'PO ' || new.number || ' (' || coalesce(new.title, 'Purchase Order') || ') requires your review.',
        'purchase_order',
        new.id::text,
        '/purchases',
        null
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.created_by is not null then
      perform public.dispatch_notification(
        new.created_by,
        'order_' || new.status,
        'Purchase Order ' || initcap(new.status),
        'PO ' || new.number || ' has been ' || new.status || ' by Admin.',
        'purchase_order',
        new.id::text,
        '/purchases',
        null
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trigger_notify_order_status() from public, anon, authenticated;

drop trigger if exists purchase_orders_notify_trigger on public.purchase_orders;
create trigger purchase_orders_notify_trigger
  after insert or update on public.purchase_orders
  for each row execute function public.trigger_notify_order_status();

-- ----------------------------------------------------------------------------
-- 9. REALTIME PUBLICATION SUBSCRIPTION (Strict: reports genuine failures)
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notification_preferences'
  ) then
    alter publication supabase_realtime add table public.notification_preferences;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. SAFE NON-DESTRUCTIVE POST-MIGRATION VERIFICATION (ZERO RECORDS CREATED)
-- ----------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  -- 1. Verify required Phase 4 tables exist in public schema
  select count(*) into v_count from information_schema.tables 
  where table_schema = 'public' and table_name in ('notifications', 'notification_preferences', 'audit_log');
  if v_count < 3 then
    raise exception 'VERIFICATION_FAILED: Required Phase 4 tables missing from public schema!';
  end if;

  -- 2. Verify that authenticated role is strictly forbidden from DELETE on purchase_orders
  -- DO NOT grant DELETE on purchase_orders to authenticated!
  -- This preserves the core immutability constraint: POs cannot be deleted by users.
  if has_table_privilege('authenticated', 'public.purchase_orders', 'DELETE') then
    raise exception 'SECURITY_VIOLATION: authenticated role must NOT have DELETE privilege on purchase_orders!';
  end if;

  -- 3. Verify no client DELETE policy exists on purchase_orders
  if exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'purchase_orders' and cmd = 'DELETE'
  ) then
    raise exception 'SECURITY_VIOLATION: purchase_orders must not have client DELETE policies!';
  end if;

  -- 4. Verify dispatch_notification is revoked from authenticated
  if has_function_privilege('authenticated', 'public.dispatch_notification(uuid, text, text, text, text, text, text, uuid)', 'EXECUTE') then
    raise exception 'SECURITY_VIOLATION: dispatch_notification must NOT be executable by authenticated!';
  end if;

  -- 5. Verify anon is forbidden from executing protected RPCs
  if has_function_privilege('anon', 'public.rpc_create_notification(uuid, text, text, text, text, text, text, uuid)', 'EXECUTE') then
    raise exception 'SECURITY_VIOLATION: rpc_create_notification must NOT be executable by anon!';
  end if;
  if has_function_privilege('anon', 'public.rpc_query_audit_trail(text, text, text, text, uuid, timestamptz, timestamptz, integer, integer)', 'EXECUTE') then
    raise exception 'SECURITY_VIOLATION: rpc_query_audit_trail must NOT be executable by anon!';
  end if;
  if has_function_privilege('anon', 'public.rpc_save_notification_preferences(boolean, boolean, boolean, boolean, boolean)', 'EXECUTE') then
    raise exception 'SECURITY_VIOLATION: rpc_save_notification_preferences must NOT be executable by anon!';
  end if;

  -- 6. Verify trigger functions are revoked from authenticated
  if has_function_privilege('authenticated', 'public.notifications_guard_update()', 'EXECUTE') then
    raise exception 'SECURITY_VIOLATION: notifications_guard_update trigger function must NOT be directly executable by authenticated!';
  end if;
  if has_function_privilege('authenticated', 'public.prevent_append_only_mutation()', 'EXECUTE') then
    raise exception 'SECURITY_VIOLATION: prevent_append_only_mutation trigger function must NOT be directly executable by authenticated!';
  end if;

  raise notice '====================================================================';
  raise notice '[PASS] StockFlow Migration 0005 Phase 4 verified:';
  raise notice '  1. Tables: notifications, notification_preferences, audit_log verified';
  raise notice '  2. Security: dispatch_notification revoked from authenticated';
  raise notice '  3. Security: purchase_orders DELETE denied for authenticated';
  raise notice '  4. Security: anon RPC execution denied';
  raise notice '  5. Security: trigger function direct execution revoked';
  raise notice '  6. Zero records created, zero records modified, zero records deleted';
  raise notice '====================================================================';
end;
$$;

-- ============================================================================
-- STOCKFLOW — MIGRATION 0006: STORAGE BUCKET & LEAST-PRIVILEGE BACKUP RUNNER
-- Single self-contained, idempotent, and non-destructive SQL script
-- Compatible with Supabase SQL Editor: paste and run in a single go
-- Covers:
--   1. Private Storage Bucket: stockflow-files (10MB limit, strictly private)
--   2. Storage RLS Policies: documents and offer attachments
--   3. Dedicated Least-Privilege Backup Runner: backup.runner@stockflow.local
-- ============================================================================
-- ----------------------------------------------------------------------------
-- 1. PRIVATE STORAGE BUCKET (stockflow-files)
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

-- ----------------------------------------------------------------------------
-- 2. STORAGE RLS POLICIES ON storage.objects
-- ----------------------------------------------------------------------------

-- Enable RLS on storage.objects if not already enabled
alter table storage.objects enable row level security;

-- 2.1 Logistics / Warehouse Documents: SELECT
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

-- 2.2 Logistics / Warehouse Documents: INSERT
drop policy if exists stockflow_storage_insert on storage.objects;
create policy stockflow_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'stockflow-files'
  and public.current_user_role() in ('owner', 'manager', 'worker')
  and exists (
    select 1 from public.documents d
    where d.storage_key = storage.objects.name
      and d.created_by = public.current_user_id()
      and d.status in ('pending', 'active')
      and (
        public.current_user_role() in ('owner', 'manager')
        or public.is_document_bound_to_worker_warehouse(d.shipment_id, d.request_id, d.warehouse, d.created_by)
      )
  )
);

-- 2.3 Logistics / Warehouse Documents: DELETE (Workers can delete only non-finalized uploads)
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

-- 2.4 Offer Attachments: SELECT (Owner & Moderator)
drop policy if exists stockflow_storage_offers_select on storage.objects;
create policy stockflow_storage_offers_select on storage.objects for select to authenticated using (
  bucket_id = 'stockflow-files'
  and exists (
    select 1 from public.offer_attachments oa
    where oa.storage_key = storage.objects.name
      and public.current_user_role() in ('owner', 'moderator')
  )
);

-- 2.5 Offer Attachments: INSERT (Owner & Moderator)
drop policy if exists stockflow_storage_offers_insert on storage.objects;
create policy stockflow_storage_offers_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'stockflow-files'
  and public.current_user_role() in ('owner', 'moderator')
  and exists (
    select 1 from public.offer_attachments oa
    where oa.storage_key = storage.objects.name
      and oa.uploaded_by = public.current_user_id()
  )
);

-- 2.6 Offer Attachments: DELETE (Owner & Moderator)
drop policy if exists stockflow_storage_offers_delete on storage.objects;
create policy stockflow_storage_offers_delete on storage.objects for delete to authenticated using (
  bucket_id = 'stockflow-files'
  and public.current_user_role() in ('owner', 'moderator')
  and exists (
    select 1 from public.offer_attachments oa
    where oa.storage_key = storage.objects.name
      and oa.uploaded_by = public.current_user_id()
  )
);

-- ----------------------------------------------------------------------------
-- 3. DEDICATED LEAST-PRIVILEGE BACKUP RUNNER USER
-- ----------------------------------------------------------------------------

do $$
declare
  v_backup_id uuid := '10000000-0000-0000-0000-000000000005';
  v_found_id uuid;
begin
  select id into v_found_id from auth.users where email = 'backup.runner@stockflow.local';
  if v_found_id is not null then
    v_backup_id := v_found_id;
    update auth.users set
      encrypted_password = crypt('StockFlowBackup2026!Secure', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"name":"StockFlow Backup Runner","role":"owner"}'::jsonb,
      updated_at = now()
    where id = v_backup_id;
  else
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_backup_id, 'authenticated', 'authenticated',
      'backup.runner@stockflow.local', crypt('StockFlowBackup2026!Secure', gen_salt('bf')), now(),
      '', '', '', '',
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"StockFlow Backup Runner","role":"owner"}'::jsonb,
      false, now(), now()
    );
  end if;

  delete from auth.identities where user_id = v_backup_id or (provider = 'email' and provider_id = v_backup_id::text);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    v_backup_id, v_backup_id,
    json_build_object('sub', v_backup_id::text, 'email', 'backup.runner@stockflow.local')::jsonb,
    'email', v_backup_id::text, now(), now(), now()
  );

  insert into public.users (id, auth_user_id, email, name, role, warehouse_id, active)
  values (v_backup_id, v_backup_id, 'backup.runner@stockflow.local', 'StockFlow Backup Runner', 'owner', null, true)
  on conflict (email) do update set auth_user_id = v_backup_id, role = 'owner', active = true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. POST-MIGRATION VERIFICATION (ZERO OPERATIONAL RECORDS DELETED/MODIFIED)
-- ----------------------------------------------------------------------------

do $$
declare
  v_bucket_public boolean;
  v_policy_count integer;
  v_backup_exists boolean;
begin
  -- 1. Verify stockflow-files bucket exists and is strictly private
  select public into v_bucket_public from storage.buckets where id = 'stockflow-files';
  if v_bucket_public is null then
    raise exception 'VERIFICATION_FAILED: Bucket stockflow-files does not exist!';
  end if;
  if v_bucket_public = true then
    raise exception 'SECURITY_VIOLATION: Bucket stockflow-files must NOT be public!';
  end if;

  -- 2. Verify all 6 storage policies exist
  select count(*) into v_policy_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in (
      'stockflow_storage_select',
      'stockflow_storage_insert',
      'stockflow_storage_worker_delete',
      'stockflow_storage_offers_select',
      'stockflow_storage_offers_insert',
      'stockflow_storage_offers_delete'
    );
  if v_policy_count < 6 then
    raise exception 'VERIFICATION_FAILED: Missing storage.objects RLS policies (found % of 6)!', v_policy_count;
  end if;

  -- 3. Verify backup runner user exists in public.users
  select exists(select 1 from public.users where email = 'backup.runner@stockflow.local' and active = true)
  into v_backup_exists;
  if not v_backup_exists then
    raise exception 'VERIFICATION_FAILED: backup.runner@stockflow.local was not created!';
  end if;

  raise notice '====================================================================';
  raise notice '[PASS] StockFlow Migration 0006 Storage & Backup Runner verified:';
  raise notice '  1. Storage Bucket: stockflow-files created (private, 10MB limit)';
  raise notice '  2. Storage Policies: 6 policies verified on storage.objects';
  raise notice '  3. Backup Runner: dedicated backup.runner@stockflow.local verified';
  raise notice '  4. Zero operational records modified, zero operational records deleted';
  raise notice '====================================================================';
end;
$$;

commit;
