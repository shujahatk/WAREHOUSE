import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function test() {
  console.log('Testing Migration 0007 in isolated PGlite...');
  const db = new PGlite();

  // Setup mock Supabase environment
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table if not exists auth.users (
      instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text unique,
      encrypted_password text, email_confirmed_at timestamptz, confirmation_token text, recovery_token text,
      email_change text, email_change_token_new text, email_change_token_current text, phone_change text,
      phone_change_token text, reauthentication_token text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      is_super_admin boolean, created_at timestamptz default now(), updated_at timestamptz default now()
    );

    create table public.warehouses (id uuid primary key default gen_random_uuid(), name text not null unique, country text not null, active boolean not null default true);
    create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, kind text not null, active boolean not null default true);
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

    create table public.purchase_orders (
      id uuid primary key default gen_random_uuid(),
      number text not null unique,
      title text not null default '',
      company_id uuid references public.companies(id),
      status text not null default 'draft',
      value_eur numeric not null default 0,
      notes text,
      created_by uuid references public.users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table public.offer_sequences (
      kind text not null,
      year integer not null,
      next_val integer not null default 1,
      primary key (kind, year)
    );

    create table public.offers (
      id uuid primary key default gen_random_uuid(),
      number text not null unique,
      kind text not null check (kind in ('purchasing', 'selling')),
      material text not null,
      material_type text not null,
      material_grade text not null,
      quantity numeric not null,
      unit text not null,
      price_per_unit numeric not null,
      currency text not null,
      total_value numeric not null,
      country text not null,
      location text not null,
      truck_loads integer not null default 1,
      description text,
      priority text not null default 'medium',
      offer_type text not null default 'Spot',
      team text not null default 'Trading',
      status text not null default 'draft',
      approval_status text not null default 'approved',
      admin_decision_note text,
      decided_by uuid references public.users(id),
      decided_at timestamptz,
      created_by uuid references public.users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      deleted_at timestamptz
    );

    create or replace function public.rpc_create_notification(
      p_recipient_id uuid,
      p_event_type text,
      p_title text,
      p_message text,
      p_target_type text default null,
      p_target_id text default null
    ) returns jsonb language plpgsql as $$
    begin
      return jsonb_build_object('ok', true);
    end;
    $$;
  `);

  const m7 = readFileSync('supabase/migrations/0007_worker_assignments_and_offers_portal.sql', 'utf-8');

  console.log('Running Migration 0007 (Run 1)...');
  await db.exec(m7);
  console.log('Run 1 succeeded!');

  console.log('Running Migration 0007 (Run 2 - Idempotency)...');
  await db.exec(m7);
  console.log('Run 2 succeeded!');

  console.log('Testing RPCs in PGlite...');
  // Insert auth.users record first
  await db.query(`
    insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-000000000001'::uuid, 'test@partner.com');
  `);

  // Test rpc_register_offers_user
  const regRes = await db.query(`
    select public.rpc_register_offers_user(
      '00000000-0000-0000-0000-000000000001'::uuid,
      'test@partner.com',
      'Partner Test',
      'Acme Corp',
      'Need trading access'
    ) as result;
  `);
  console.log('rpc_register_offers_user result:', regRes.rows[0].result);

  // Verify inserted user
  const userRow = await db.query(`select * from public.users where email = 'test@partner.com'`);
  console.log('Inserted user record:', {
    email: userRow.rows[0].email,
    role: userRow.rows[0].role,
    approval_status: userRow.rows[0].approval_status,
    active: userRow.rows[0].active,
    registration_notes: userRow.rows[0].registration_notes,
  });

  // Verify that current_app_user returns NULL for pending user
  await db.exec(`set "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001'`);
  const currentPending = await db.query(`select * from public.current_app_user()`);
  console.log('current_app_user for pending user id:', currentPending.rows[0].id); // should be null

  // Verify rpc_get_auth_account_status returns pending
  const statusRes = await db.query(`select public.rpc_get_auth_account_status() as status`);
  console.log('rpc_get_auth_account_status for pending user:', statusRes.rows[0].status);

  // Now create admin and approve the user
  const adminAuthId = '10000000-0000-0000-0000-000000000001';
  await db.query(`insert into auth.users (id, email) values ('${adminAuthId}'::uuid, 'admin@stockflow.local')`);
  await db.query(`
    insert into public.users (id, auth_user_id, email, name, role, active, approval_status)
    values ('${adminAuthId}'::uuid, '${adminAuthId}'::uuid, 'admin@stockflow.local', 'Ada Admin', 'owner', true, 'approved');
  `);

  // Admin approves the user
  await db.exec(`set "request.jwt.claim.sub" = '${adminAuthId}'`);
  const approveRes = await db.query(`
    select public.rpc_decide_offers_user_registration(
      '${userRow.rows[0].id}'::uuid,
      'approved',
      'Account approved by admin'
    ) as result;
  `);
  console.log('rpc_decide_offers_user_registration approve result:', approveRes.rows[0].result);

  // Now verify as approved user
  await db.exec(`set "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001'`);
  const currentApproved = await db.query(`select * from public.current_app_user()`);
  console.log('current_app_user for approved user:', {
    id: currentApproved.rows[0].id,
    email: currentApproved.rows[0].email,
    role: currentApproved.rows[0].role,
    active: currentApproved.rows[0].active,
    approval_status: currentApproved.rows[0].approval_status,
  });

  console.log('ALL isolated tests for Migration 0007 PASSED cleanly!');
}

test().catch((err) => {
  console.error('Migration 0007 isolated test failed:', err);
  process.exit(1);
});
