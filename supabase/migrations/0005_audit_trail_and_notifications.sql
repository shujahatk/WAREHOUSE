-- ============================================================================
-- STOCKFLOW — MIGRATION 0005: COMPLETE AUDIT TRAIL & NOTIFICATION CENTRE
-- Additive, non-destructive migration extending existing audit_log and adding notifications
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND AUDIT LOG (ADDITIVE ONLY)
-- ----------------------------------------------------------------------------

alter table public.audit_log
  add column if not exists actor_role text,
  add column if not exists actor_name text,
  add column if not exists warehouse_id uuid references public.warehouses (id) on delete set null,
  add column if not exists context text,
  add column if not exists request_reference text;

create index if not exists audit_log_user_idx on public.audit_log (user_id);
create index if not exists audit_log_action_idx on public.audit_log (action);
create index if not exists audit_log_warehouse_idx on public.audit_log (warehouse_id);
create index if not exists audit_log_target_type_idx on public.audit_log (target_type);

-- Allow Moderator to select only offer-related audit entries
drop policy if exists audit_log_moderator_select on public.audit_log;
create policy audit_log_moderator_select on public.audit_log
  for select to authenticated
  using (
    public.current_user_role() = 'moderator'
    and target_type in ('offer', 'offer_comment', 'offer_attachment', 'offer_sequence')
  );

-- ----------------------------------------------------------------------------
-- 2. SECURE PAGINATED AUDIT RPC (rpc_query_audit_trail)
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

  -- Only Owner (Admin) and Moderator (offers only) can view audit
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
    -- Moderator restriction
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

grant execute on function public.rpc_query_audit_trail to authenticated;

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATIONS TABLE & RLS
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

create index if not exists notifications_recipient_read_idx
  on public.notifications (recipient_id, read, created_at desc);
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- RLS: Recipients can only SELECT and UPDATE (mark as read) their own notifications
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
  for select to authenticated
  using (recipient_id = public.current_user_id());

drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
  for update to authenticated
  using (recipient_id = public.current_user_id())
  with check (recipient_id = public.current_user_id());

-- Client cannot directly insert or delete notifications
revoke insert, delete, truncate on public.notifications from public, anon, authenticated;
grant select, update on public.notifications to authenticated;

-- ----------------------------------------------------------------------------
-- 4. NOTIFICATION RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 4.1 Internal helper: dispatch notification safely with duplicate prevention
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
  -- Prevent duplicates within 60 seconds for same recipient, event_type, and target_id
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

-- 4.2 Authenticated create notification RPC
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
  v_id uuid;
begin
  v_caller := public.current_app_user();
  if v_caller.id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.notifications (
    recipient_id, event_type, title, message, target_type, target_id, link, warehouse_id
  ) values (
    p_recipient_id, p_event_type, p_title, p_message, p_target_type, p_target_id, p_link, p_warehouse_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 4.3 Mark single notification as read
create or replace function public.rpc_mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notifications
  set read = true, read_at = now()
  where id = p_notification_id
    and recipient_id = public.current_user_id();
  return found;
end;
$$;

-- 4.4 Mark all notifications as read for caller
create or replace function public.rpc_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.notifications
  set read = true, read_at = now()
  where recipient_id = public.current_user_id()
    and read = false;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.dispatch_notification to authenticated;
grant execute on function public.rpc_create_notification to authenticated;
grant execute on function public.rpc_mark_notification_read to authenticated;
grant execute on function public.rpc_mark_all_notifications_read to authenticated;

-- ----------------------------------------------------------------------------
-- 5. NOTIFICATION PREFERENCES TABLE & RLS
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
  using (user_id = public.current_user_id());

drop policy if exists notification_preferences_user_upsert on public.notification_preferences;
create policy notification_preferences_user_upsert on public.notification_preferences
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

grant select, insert, update on public.notification_preferences to authenticated;

-- ----------------------------------------------------------------------------
-- 6. NOTIFICATION PREFERENCES RPC FUNCTIONS
-- ----------------------------------------------------------------------------

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

grant execute on function public.rpc_save_notification_preferences to authenticated;
grant execute on function public.rpc_get_notification_preferences to authenticated;

-- ----------------------------------------------------------------------------
-- 7. REALTIME PUBLICATION FOR NOTIFICATIONS & PREFERENCES
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table publi l.c.notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notification_preferences'
  ) then
    alter publication supabase_realtime add table public.notification_preferences;
  end if;
exception when others then null;
end;
$$;

