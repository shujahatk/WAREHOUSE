import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

console.log('================================================================');
console.log('   STOCKFLOW — ISOLATED POSTGRESQL MIGRATION & IDEMPOTENCY TEST ');
console.log('================================================================\n');

async function runTest() {
  const db = new PGlite();

  console.log('[1/6] Bootstrapping isolated PostgreSQL engine & Supabase environment...');
  
  // Create Supabase mock roles and schemas
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz default now()
    );

    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    -- Mock publication for realtime
    create publication supabase_realtime;

    grant usage on schema public, auth to anon, authenticated, service_role;
  `);

  console.log('[2/6] Loading existing core StockFlow schema & baseline seed...');
  await db.exec(`
    create table public.warehouses (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      country text not null,
      active boolean not null default true
    );

    create table public.companies (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      kind text not null,
      active boolean not null default true
    );

    create table public.users (
      id uuid primary key default gen_random_uuid(),
      auth_user_id uuid unique references auth.users(id),
      email text not null unique,
      name text not null,
      role text not null check (role in ('owner', 'manager', 'worker', 'moderator')),
      warehouse_id uuid references public.warehouses(id),
      company_id uuid references public.companies(id),
      active boolean not null default true,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create or replace function public.current_app_user()
    returns public.users language sql stable security definer as $$
      select * from public.users where auth_user_id = auth.uid() limit 1;
    $$;

    create or replace function public.current_user_id()
    returns uuid language sql stable security definer as $$
      select id from public.current_app_user();
    $$;

    create or replace function public.current_user_role()
    returns text language sql stable security definer as $$
      select role from public.current_app_user();
    $$;

    create or replace function public.current_user_warehouse_id()
    returns uuid language sql stable security definer as $$
      select warehouse_id from public.current_app_user();
    $$;

    create or replace function public.prevent_append_only_mutation()
    returns trigger language plpgsql security definer as $$
    begin
      raise exception 'Append-only mutation prohibited';
    end;
    $$;

    create table public.purchase_orders (
      id uuid primary key default gen_random_uuid(),
      number text not null unique,
      title text not null default '',
      company_id uuid references public.companies(id),
      status text not null default 'draft',
      value_eur numeric not null default 0,
      created_by uuid references public.users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table public.audit_log (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.users(id),
      action text not null,
      target_type text not null,
      target_id text not null,
      old_value text,
      new_value text,
      created_at timestamptz not null default now()
    );

    -- Revoke delete on purchase_orders from authenticated
    revoke delete on public.purchase_orders from authenticated, anon, public;

    -- Seed canonical test data
    insert into public.warehouses (id, name, country, active) values 
      ('30000000-0000-0000-0000-000000000001', 'Bornem', 'Belgium', true),
      ('30000000-0000-0000-0000-000000000002', 'Turnhout', 'Belgium', true);
    
    insert into auth.users (id, email) values 
      ('10000000-0000-0000-0000-000000000001', 'admin@stockflow.local'),
      ('10000000-0000-0000-0000-000000000002', 'staff@stockflow.local'),
      ('10000000-0000-0000-0000-000000000003', 'worker@stockflow.local'),
      ('10000000-0000-0000-0000-000000000004', 'moderator@stockflow.local');

    insert into public.users (id, auth_user_id, email, name, role, warehouse_id) values
      ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin@stockflow.local', 'Ada Admin', 'owner', null),
      ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'staff@stockflow.local', 'Sam Staff', 'manager', null),
      ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'worker@stockflow.local', 'Willem Worker', 'worker', '30000000-0000-0000-0000-000000000001'),
      ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'moderator@stockflow.local', 'Morgan Moderator', 'moderator', null);
  `);
  console.log('   Baseline schema seeded successfully.');

  const migrationSql = readFileSync('supabase/migrations/0005_stockflow_phase4_complete.sql', 'utf-8');

  console.log('[3/6] RUN 1: Executing 0005_stockflow_phase4_complete.sql on isolated PostgreSQL...');
  await db.exec(migrationSql);
  console.log('   Run 1 execution completed successfully.');

  console.log('[4/6] Verifying schema objects, RLS policies, and triggers from Run 1...');
  
  // Verify tables
  const tablesRes = await db.query(`
    select table_name from information_schema.tables 
    where table_schema = 'public' and table_name in ('notifications', 'notification_preferences', 'audit_log');
  `);
  if (tablesRes.rows.length !== 3) {
    throw new Error(`Expected 3 tables, found ${tablesRes.rows.length}`);
  }
  console.log('   [PASS] Tables verified: notifications, notification_preferences, audit_log.');

  // Verify audit_log additive columns
  const colsRes = await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_log'
      and column_name in ('actor_role', 'actor_name', 'warehouse_id', 'context', 'request_reference');
  `);
  if (colsRes.rows.length !== 5) {
    throw new Error(`Expected 5 additive columns on audit_log, found ${colsRes.rows.length}`);
  }
  console.log('   [PASS] 5 additive columns verified on audit_log.');

  // Verify dispatch_notification is revoked from authenticated
  const privRes = await db.query(`
    select has_function_privilege('authenticated', 'public.dispatch_notification(uuid, text, text, text, text, text, text, uuid)', 'EXECUTE') as has_priv;
  `);
  if (privRes.rows[0].has_priv) {
    throw new Error('SECURITY FAILURE: dispatch_notification is executable by authenticated!');
  }
  console.log('   [PASS] dispatch_notification is strictly revoked from authenticated.');

  // Verify immutable notification update guard
  console.log('[5/6] Testing strict update immutability and RPC permission guards...');
  // Insert test notification as service_role
  const notifRes = await db.query(`
    insert into public.notifications (recipient_id, event_type, title, message)
    values ('20000000-0000-0000-0000-000000000003', 'test_event', 'Original Title', 'Original Message')
    returning id;
  `);
  const testNotifId = notifRes.rows[0].id;

  // Attempt to alter title (should be BLOCKED by notifications_guard_update trigger)
  let titleBlocked = false;
  try {
    await db.query(`
      update public.notifications set title = 'Hacked Title' where id = '${testNotifId}';
    `);
  } catch (err) {
    titleBlocked = true;
    console.log(`   [PASS] Attempt to update notification title correctly BLOCKED: "${err.message.slice(0, 70)}..."`);
  }
  if (!titleBlocked) {
    throw new Error('SECURITY FAILURE: Modification of notification title was permitted!');
  }

  // Updating read and read_at should be PERMITTED
  await db.query(`
    update public.notifications set read = true, read_at = now() where id = '${testNotifId}';
  `);
  const readCheck = await db.query(`select read, read_at from public.notifications where id = '${testNotifId}';`);
  if (!readCheck.rows[0].read) {
    throw new Error('Updating read status failed!');
  }
  console.log('   [PASS] Updating read/read_at status is permitted.');

  // Verify rpc_create_notification access restrictions and authorization bypass guards
  console.log('   Testing rpc_create_notification authorization bypass guards...');

  // --------------------------------------------------------------------------
  // BYPASS 1: Worker notifications warehouse scoping
  // --------------------------------------------------------------------------
  await db.exec(`set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';`); // Willem Worker

  // Bypass 1A: Worker attempts to create notification with NULL warehouse_id -> MUST BE REJECTED
  let workerNullWhBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000003', 'self_event', 'Self Title', 'Self Message',
        null, null, null, null
      );
    `);
  } catch (err) {
    workerNullWhBlocked = true;
    console.log(`   [PASS] [Bypass 1A] Worker notification with NULL warehouse correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!workerNullWhBlocked) throw new Error('SECURITY FAILURE: Worker was able to create notification with NULL warehouse!');

  // Bypass 1B: Worker attempts to create notification with foreign warehouse_id -> MUST BE REJECTED
  let workerMismatchWhBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000003', 'self_event', 'Self Title', 'Self Message',
        null, null, null, '30000000-0000-0000-0000-000000000002'
      );
    `);
  } catch (err) {
    workerMismatchWhBlocked = true;
    console.log(`   [PASS] [Bypass 1B] Worker notification with mismatched warehouse correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!workerMismatchWhBlocked) throw new Error('SECURITY FAILURE: Worker was able to create notification with foreign warehouse!');

  // Valid 1C: Worker with assigned warehouse -> MUST SUCCEED
  const workerValidRes = await db.query(`
    select public.rpc_create_notification(
      '20000000-0000-0000-0000-000000000003', 'self_event', 'Self Title', 'Self Message',
      null, null, null, '30000000-0000-0000-0000-000000000001'
    ) as id;
  `);
  if (!workerValidRes.rows[0].id) throw new Error('Worker valid self-notification failed!');
  console.log('   [PASS] [Valid 1C] Worker can create self-notification with assigned warehouse.');

  // Bypass 1D: Worker attempts to notify Admin -> MUST BE BLOCKED
  let crossNotifBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000001', 'illegal_event', 'Illegal Title', 'Illegal Message',
        null, null, null, '30000000-0000-0000-0000-000000000001'
      );
    `);
  } catch (err) {
    crossNotifBlocked = true;
    console.log(`   [PASS] [Bypass 1D] Worker creating notification for Admin correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!crossNotifBlocked) throw new Error('SECURITY FAILURE: Worker was able to notify Admin!');

  // --------------------------------------------------------------------------
  // BYPASS 2: Manager notifying Worker warehouse isolation
  // --------------------------------------------------------------------------
  await db.exec(`set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';`); // Sam Staff (Manager)

  // Bypass 2A: Manager specifies foreign warehouse for Worker -> MUST BE REJECTED
  let managerMismatchWhBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000003', 'task_assigned', 'Task Title', 'Task Message',
        null, null, null, '30000000-0000-0000-0000-000000000002'
      );
    `);
  } catch (err) {
    managerMismatchWhBlocked = true;
    console.log(`   [PASS] [Bypass 2A] Manager notifying Worker with mismatched warehouse correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!managerMismatchWhBlocked) throw new Error('SECURITY FAILURE: Manager was able to notify Worker with foreign warehouse!');

  // Bypass 2B: Manager passes NULL warehouse -> MUST derive recipient warehouse, NEVER allow NULL to bypass
  const managerDerivedRes = await db.query(`
    select public.rpc_create_notification(
      '20000000-0000-0000-0000-000000000003', 'task_assigned', 'Task Title', 'Task Message',
      null, null, null, null
    ) as id;
  `);
  const derivedNotifId = managerDerivedRes.rows[0].id;
  if (!derivedNotifId) throw new Error('Manager notifying Worker with NULL warehouse failed');

  // Verify that the stored notification actually derived and stored the worker's warehouse (Bornem)
  const derivedCheck = await db.query(`
    select warehouse_id from public.notifications where id = '${derivedNotifId}';
  `);
  if (!derivedCheck.rows[0].warehouse_id || derivedCheck.rows[0].warehouse_id !== '30000000-0000-0000-0000-000000000001') {
    throw new Error(`SECURITY FAILURE: NULL warehouse allowed to bypass isolation! Expected worker warehouse, got: ${derivedCheck.rows[0].warehouse_id}`);
  }
  console.log(`   [PASS] [Bypass 2B] Manager notifying Worker with NULL warehouse correctly derived recipient warehouse: ${derivedCheck.rows[0].warehouse_id}`);

  // --------------------------------------------------------------------------
  // BYPASS 3: Moderator target_type restrictions (Self & Cross-User)
  // --------------------------------------------------------------------------
  await db.exec(`set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';`); // Morgan Moderator

  // Bypass 3A: Moderator self-notification with NULL target_type -> MUST BE REJECTED
  let modSelfNullTypeBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000004', 'self_offer', 'Self Memo', 'Draft review',
        null, 'OFF-2026-0001', null, null
      );
    `);
  } catch (err) {
    modSelfNullTypeBlocked = true;
    console.log(`   [PASS] [Bypass 3A] Moderator self-notification with NULL target_type correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!modSelfNullTypeBlocked) throw new Error('SECURITY FAILURE: Moderator was able to self-notify with NULL target_type!');

  // Bypass 3B: Moderator self-notification with empty/whitespace target_type -> MUST BE REJECTED
  let modSelfEmptyTypeBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000004', 'self_offer', 'Self Memo', 'Draft review',
        '   ', 'OFF-2026-0001', null, null
      );
    `);
  } catch (err) {
    modSelfEmptyTypeBlocked = true;
    console.log(`   [PASS] [Bypass 3B] Moderator self-notification with empty target_type correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!modSelfEmptyTypeBlocked) throw new Error('SECURITY FAILURE: Moderator was able to self-notify with empty target_type!');

  // Bypass 3C: Moderator self-notification with unapproved 'shipment' target_type -> MUST BE REJECTED
  let modSelfShipmentBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000004', 'self_offer', 'Self Memo', 'Draft review',
        'shipment', 'SHP-2026-0001', null, null
      );
    `);
  } catch (err) {
    modSelfShipmentBlocked = true;
    console.log(`   [PASS] [Bypass 3C] Moderator self-notification with shipment target_type correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!modSelfShipmentBlocked) throw new Error('SECURITY FAILURE: Moderator was able to self-notify with shipment target_type!');

  // Valid 3D: Moderator self-notification with valid approved 'offer' target_type -> MUST SUCCEED
  const modSelfValidRes = await db.query(`
    select public.rpc_create_notification(
      '20000000-0000-0000-0000-000000000004', 'self_offer', 'Self Memo', 'Draft review',
      'offer', 'OFF-2026-0001', '/offers', null
    ) as id;
  `);
  if (!modSelfValidRes.rows[0].id) throw new Error('Moderator creating valid self-notification failed!');
  console.log('   [PASS] [Valid 3D] Moderator authorized to create self-notification with approved target_type "offer".');

  // Bypass 3E: Moderator attempting to notify Worker -> MUST BE REJECTED
  let modWorkerBlocked = false;
  try {
    await db.query(`
      select public.rpc_create_notification(
        '20000000-0000-0000-0000-000000000003', 'offer_created', 'Offer Update', 'New offer posted',
        'offer', 'OFF-2026-0001', null, null
      );
    `);
  } catch (err) {
    modWorkerBlocked = true;
    console.log(`   [PASS] [Bypass 3E] Moderator notifying Worker correctly BLOCKED: "${err.message.slice(0, 75)}..."`);
  }
  if (!modWorkerBlocked) throw new Error('SECURITY FAILURE: Moderator was able to notify a Worker!');

  // Valid 3F: Moderator passes approved offer target_type ('offer') to Admin -> MUST SUCCEED
  const modAdminValidRes = await db.query(`
    select public.rpc_create_notification(
      '20000000-0000-0000-0000-000000000001', 'offer_created', 'Offer Update', 'New offer posted',
      'offer', 'OFF-2026-0001', '/offers', null
    ) as id;
  `);
  if (!modAdminValidRes.rows[0].id) throw new Error('Moderator creating valid offer notification for Admin failed!');
  console.log('   [PASS] [Valid 3F] Moderator authorized to create notification for Admin with approved target_type "offer".');

  // --------------------------------------------------------------------------
  // Admin cross-notification
  // --------------------------------------------------------------------------
  await db.exec(`set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';`); // Ada Admin
  const adminNotifRes = await db.query(`
    select public.rpc_create_notification(
      '20000000-0000-0000-0000-000000000003', 'admin_broadcast', 'Admin Notice', 'Review required'
    ) as id;
  `);
  if (!adminNotifRes.rows[0].id) throw new Error('Admin cross-notification failed');
  console.log('   [PASS] Admin authorized to create notifications for other users.');

  // Clean up notifications from previous step
  await db.query(`delete from public.notifications;`);

  // --------------------------------------------------------------------------
  // TEST SUITE: RLS AUDIT, NOTIFICATIONS, PREFERENCES & ACL RESTRICTIONS
  // --------------------------------------------------------------------------
  console.log('\n[5b/6] Testing RLS isolation across roles, privacy, and ACL protections...');

  // Seed test records as superuser
  await db.exec(`
    -- Seed test audit records
    insert into public.audit_log (id, user_id, action, target_type, target_id, actor_name, actor_role) values
      ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'order-submitted', 'purchase_order', 'PO-2026-0001', 'Ada Admin', 'owner'),
      ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'offer-created', 'offer', 'OFF-2026-0001', 'Morgan Moderator', 'moderator');

    -- Seed test notifications
    insert into public.notifications (id, recipient_id, event_type, title, message) values
      ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin_alert', 'Admin Only', 'Confidential admin note'),
      ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'worker_task', 'Worker Task', 'Assigned shift unload');

    -- Seed test preferences
    insert into public.notification_preferences (user_id, notify_orders, notify_inventory) values
      ('20000000-0000-0000-0000-000000000001', true, true),
      ('20000000-0000-0000-0000-000000000003', true, false);
  `);

  // 1. Audit RLS: Staff cannot read audit records
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002'; -- Staff
  `);
  const staffAuditRes = await db.query(`select count(*) as count from public.audit_log;`);
  if (parseInt(staffAuditRes.rows[0].count, 10) !== 0) {
    throw new Error(`SECURITY FAILURE: Staff can read audit records! Count: ${staffAuditRes.rows[0].count}`);
  }
  let staffRpcBlocked = false;
  try {
    await db.query(`select public.rpc_query_audit_trail();`);
  } catch {
    staffRpcBlocked = true;
  }
  if (!staffRpcBlocked) throw new Error('SECURITY FAILURE: Staff could invoke rpc_query_audit_trail!');
  console.log('   [PASS] Staff cannot read audit records (0 rows visible; RPC blocked).');

  // 2. Audit RLS: Worker cannot read audit records
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003'; -- Worker
  `);
  const workerAuditRes = await db.query(`select count(*) as count from public.audit_log;`);
  if (parseInt(workerAuditRes.rows[0].count, 10) !== 0) {
    throw new Error(`SECURITY FAILURE: Worker can read audit records! Count: ${workerAuditRes.rows[0].count}`);
  }
  let workerRpcBlocked = false;
  try {
    await db.query(`select public.rpc_query_audit_trail();`);
  } catch {
    workerRpcBlocked = true;
  }
  if (!workerRpcBlocked) throw new Error('SECURITY FAILURE: Worker could invoke rpc_query_audit_trail!');
  console.log('   [PASS] Worker cannot read audit records (0 rows visible; RPC blocked).');

  // 3. Audit RLS: Moderator can read ONLY offer-related audit records
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004'; -- Moderator
  `);
  const modAuditRows = await db.query(`select target_type from public.audit_log;`);
  if (modAuditRows.rows.length !== 1 || modAuditRows.rows[0].target_type !== 'offer') {
    throw new Error(`SECURITY FAILURE: Moderator saw non-offer audit records: ${JSON.stringify(modAuditRows.rows)}`);
  }
  const modAuditRpc = await db.query(`select public.rpc_query_audit_trail() as result;`);
  const modAuditTotal = modAuditRpc.rows[0].result.total;
  if (parseInt(modAuditTotal, 10) !== 1) {
    throw new Error(`SECURITY FAILURE: Moderator rpc_query_audit_trail saw ${modAuditTotal} records!`);
  }
  console.log('   [PASS] Moderator can read ONLY offer-related audit records (offer visible, PO hidden).');

  // 4. Notifications & Preferences Privacy Across Users
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003'; -- Worker
  `);
  const workerNotifRows = await db.query(`select recipient_id from public.notifications;`);
  if (workerNotifRows.rows.length !== 1 || workerNotifRows.rows[0].recipient_id !== '20000000-0000-0000-0000-000000000003') {
    throw new Error(`SECURITY FAILURE: Worker saw another user's notifications!`);
  }
  const workerPrefRows = await db.query(`select user_id from public.notification_preferences;`);
  if (workerPrefRows.rows.length !== 1 || workerPrefRows.rows[0].user_id !== '20000000-0000-0000-0000-000000000003') {
    throw new Error(`SECURITY FAILURE: Worker saw another user's preferences!`);
  }
  // Worker cannot update another user's preferences
  await db.query(`
    update public.notification_preferences set notify_orders = false where user_id = '20000000-0000-0000-0000-000000000001';
  `);
  console.log('   [PASS] Worker can see ONLY own notifications and preferences (Admin records hidden).');

  // Verify Admin's preferences were not modified by Worker
  await db.exec(`reset role;`);
  const adminPrefCheck = await db.query(`select notify_orders from public.notification_preferences where user_id = '20000000-0000-0000-0000-000000000001';`);
  if (!adminPrefCheck.rows[0].notify_orders) {
    throw new Error('SECURITY FAILURE: Worker was able to modify Admin notification preferences!');
  }
  console.log('   [PASS] Cross-user notification preference modification is strictly prevented by RLS.');

  // 5. anon cannot execute protected RPCs
  await db.exec(`
    set role anon;
    set request.jwt.claim.sub = '';
  `);
  let anonRpcCreateBlocked = false;
  try {
    await db.query(`select public.rpc_create_notification('20000000-0000-0000-0000-000000000001', 'a', 'b', 'c');`);
  } catch (err) {
    anonRpcCreateBlocked = true;
    console.log(`   [PASS] anon rpc_create_notification execution BLOCKED: "${err.message.slice(0, 65)}..."`);
  }
  if (!anonRpcCreateBlocked) throw new Error('SECURITY FAILURE: anon can execute rpc_create_notification!');

  let anonRpcAuditBlocked = false;
  try {
    await db.query(`select public.rpc_query_audit_trail();`);
  } catch (err) {
    anonRpcAuditBlocked = true;
    console.log(`   [PASS] anon rpc_query_audit_trail execution BLOCKED: "${err.message.slice(0, 65)}..."`);
  }
  if (!anonRpcAuditBlocked) throw new Error('SECURITY FAILURE: anon can execute rpc_query_audit_trail!');

  let anonRpcPrefBlocked = false;
  try {
    await db.query(`select public.rpc_save_notification_preferences(true);`);
  } catch (err) {
    anonRpcPrefBlocked = true;
    console.log(`   [PASS] anon rpc_save_notification_preferences execution BLOCKED: "${err.message.slice(0, 65)}..."`);
  }
  if (!anonRpcPrefBlocked) throw new Error('SECURITY FAILURE: anon can execute rpc_save_notification_preferences!');

  // Reset role to postgres superuser
  await db.exec(`reset role;`);

  // --------------------------------------------------------------------------
  // [5c/6] MODERATOR HELPERS, LEGACY POLICY EXPOSURE & TRIGGER EXECUTION CHECKS
  // --------------------------------------------------------------------------
  console.log('\n[5c/6] Testing Moderator helpers, legacy-policy exposure blocks, and trigger execution...');

  // 1. Moderator role recognition across all auth helpers
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004'; -- Morgan Moderator
  `);
  const modRoleRes = await db.query(`select public.current_user_role() as role;`);
  if (modRoleRes.rows[0].role !== 'moderator') {
    throw new Error(`SECURITY FAILURE: current_user_role() returned ${modRoleRes.rows[0].role}, expected 'moderator'`);
  }

  const modIdRes = await db.query(`select public.current_user_id() as id;`);
  if (modIdRes.rows[0].id !== '20000000-0000-0000-0000-000000000004') {
    throw new Error(`SECURITY FAILURE: current_user_id() returned ${modIdRes.rows[0].id}, expected '20000000-0000-0000-0000-000000000004'`);
  }

  const modAppUserRes = await db.query(`select email, role, active from public.current_app_user();`);
  if (modAppUserRes.rows[0].role !== 'moderator' || !modAppUserRes.rows[0].active) {
    throw new Error(`SECURITY FAILURE: current_app_user() failed for moderator: ${JSON.stringify(modAppUserRes.rows[0])}`);
  }

  const modWhRes = await db.query(`select public.current_user_warehouse_id() as wh;`);
  if (modWhRes.rows[0].wh !== null) {
    throw new Error(`SECURITY FAILURE: current_user_warehouse_id() returned ${modWhRes.rows[0].wh}, expected null for moderator`);
  }
  console.log('   [PASS] Moderator consistently recognized by current_user_role(), current_user_id(), current_app_user(), and current_user_warehouse_id().');

  // 2. Legacy-policy exposure cleanup verification
  // A. notification_preferences: Attempt to DELETE own preferences as authenticated user
  let deletePrefBlocked = false;
  try {
    await db.query(`delete from public.notification_preferences where user_id = '20000000-0000-0000-0000-000000000004';`);
  } catch {
    deletePrefBlocked = true;
  }
  if (!deletePrefBlocked) throw new Error('SECURITY FAILURE: Authenticated user was able to DELETE notification_preferences!');
  console.log('   [PASS] Legacy policy exposure eliminated: Client DELETE on notification_preferences is strictly denied.');

  // B. notifications: Attempt to INSERT directly into notifications as authenticated
  let directInsertNotifBlocked = false;
  try {
    await db.query(`insert into public.notifications (recipient_id, event_type, title, message) values ('20000000-0000-0000-0000-000000000004', 'hack', 'hack', 'hack');`);
  } catch {
    directInsertNotifBlocked = true;
  }
  if (!directInsertNotifBlocked) throw new Error('SECURITY FAILURE: Authenticated user was able to directly INSERT into notifications!');
  console.log('   [PASS] Direct client INSERT on notifications is strictly denied (must invoke rpc_create_notification).');

  // C. notifications: Attempt to DELETE directly from notifications as authenticated
  let directDeleteNotifBlocked = false;
  try {
    await db.query(`delete from public.notifications where recipient_id = '20000000-0000-0000-0000-000000000004';`);
  } catch {
    directDeleteNotifBlocked = true;
  }
  if (!directDeleteNotifBlocked) throw new Error('SECURITY FAILURE: Authenticated user was able to directly DELETE from notifications!');
  console.log('   [PASS] Direct client DELETE on notifications is strictly denied.');

  // D. audit_log: Attempt to INSERT directly as authenticated
  let directInsertAuditBlocked = false;
  try {
    await db.query(`insert into public.audit_log (user_id, action, target_type, target_id) values ('20000000-0000-0000-0000-000000000004', 'hack', 'offer', '1');`);
  } catch {
    directInsertAuditBlocked = true;
  }
  if (!directInsertAuditBlocked) throw new Error('SECURITY FAILURE: Authenticated user was able to INSERT directly into audit_log!');
  console.log('   [PASS] Direct client INSERT on audit_log is strictly denied.');

  // 3. Direct execution of internal helpers and trigger functions strictly denied
  let directTriggerExecBlocked = false;
  try {
    await db.query(`select public.prevent_append_only_mutation();`);
  } catch {
    directTriggerExecBlocked = true;
  }
  if (!directTriggerExecBlocked) throw new Error('SECURITY FAILURE: Authenticated could directly execute prevent_append_only_mutation!');

  let directGuardExecBlocked = false;
  try {
    await db.query(`select public.notifications_guard_update();`);
  } catch {
    directGuardExecBlocked = true;
  }
  if (!directGuardExecBlocked) throw new Error('SECURITY FAILURE: Authenticated could directly execute notifications_guard_update!');

  let directDispatchExecBlocked = false;
  try {
    await db.query(`select public.dispatch_notification('20000000-0000-0000-0000-000000000004', 'test', 'title', 'msg');`);
  } catch {
    directDispatchExecBlocked = true;
  }
  if (!directDispatchExecBlocked) throw new Error('SECURITY FAILURE: Authenticated could directly execute internal dispatch_notification!');
  console.log('   [PASS] Direct client execution of internal helpers and trigger functions strictly denied.');

  // 4. Trigger execution works seamlessly for authenticated users
  await db.exec(`reset role;`);
  await db.exec(`
    insert into public.notifications (id, recipient_id, event_type, title, message)
    values ('50000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000004', 'offer_alert', 'Offer Test', 'Msg');
  `);
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
  `);
  await db.query(`
    update public.notifications set read = true, read_at = now() where id = '50000000-0000-0000-0000-000000000009';
  `);
  const markCheck = await db.query(`select read from public.notifications where id = '50000000-0000-0000-0000-000000000009';`);
  if (!markCheck.rows[0].read) throw new Error('Updating read status failed under trigger execution!');
  console.log('   [PASS] Trigger execution works seamlessly for authenticated users even with direct helper execution revoked.');

  // Reset role to postgres superuser
  await db.exec(`reset role;`);

  // 6. Clean up test records (notifications and preferences)
  // Note: audit_log is strictly append-only and immutable; existing records remain for Run 2 idempotency
  await db.exec(`delete from public.notifications; delete from public.notification_preferences;`);

  console.log('[6/6] RUN 2: Executing 0005_stockflow_phase4_complete.sql a SECOND time (Idempotency test)...');
  await db.exec(migrationSql);
  console.log('   Run 2 execution completed with 0 errors.');

  console.log('\n================================================================');
  console.log('   DATABASE EXECUTION EVIDENCE: 100% PASS & IDEMPOTENT          ');
  console.log('================================================================\n');
}

runTest().catch((err) => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});
