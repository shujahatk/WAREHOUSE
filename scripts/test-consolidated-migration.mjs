import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function test() {
  console.log('Testing consolidated migration in isolated PGlite...');
  const db = new PGlite();
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
    create table if not exists auth.identities (
      id text primary key, user_id uuid references auth.users(id), identity_data jsonb,
      provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, owner uuid, created_at timestamptz default now(),
      updated_at timestamptz default now(), public boolean default false, avif_autodetection boolean default false,
      file_size_limit bigint, allowed_mime_types text[], owner_id text
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
      last_accessed_at timestamptz default now(), metadata jsonb
    );
    alter table storage.objects enable row level security;
    create or replace function crypt(pass text, salt text) returns text language sql immutable as $$
      select md5(pass || salt);
    $$;
    create or replace function gen_salt(type text) returns text language sql immutable as $$
      select 'mock_salt';
    $$;
    create publication supabase_realtime;
    create table public.warehouses (id uuid primary key default gen_random_uuid(), name text not null unique, country text not null, active boolean not null default true);
    create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, kind text not null, active boolean not null default true);
    create table public.users (id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users(id), email text not null unique, name text not null, role text not null check (role in ('owner', 'manager', 'worker', 'moderator')), warehouse_id uuid references public.warehouses(id), company_id uuid references public.companies(id), active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.purchase_orders (id uuid primary key default gen_random_uuid(), number text not null unique, title text not null default '', company_id uuid references public.companies(id), status text not null default 'draft', value_eur numeric not null default 0, created_by uuid references public.users(id), created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.audit_log (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id), action text not null, target_type text not null, target_id text not null, old_value text, new_value text, created_at timestamptz not null default now());
    create table public.documents (id uuid primary key default gen_random_uuid(), shipment_id uuid, request_id uuid, warehouse text, storage_key text not null, status text not null default 'pending', created_by uuid references public.users(id), created_at timestamptz default now());
    create table public.offer_attachments (id uuid primary key default gen_random_uuid(), offer_id uuid, storage_key text not null, uploaded_by uuid references public.users(id), created_at timestamptz default now());
    create table public.requests (id uuid primary key default gen_random_uuid(), status text not null default 'draft');
    create table public.shipments (id uuid primary key default gen_random_uuid(), status text not null default 'Draft');
    create or replace function public.current_user_role() returns text language sql stable as $$
      select 'owner'::text;
    $$;
    create or replace function public.current_user_id() returns uuid language sql stable as $$
      select '10000000-0000-0000-0000-000000000001'::uuid;
    $$;
    create or replace function public.current_user_warehouse_id() returns uuid language sql stable as $$
      select null::uuid;
    $$;
    create or replace function public.prevent_append_only_mutation() returns trigger language plpgsql as $$
    begin
      raise exception 'mutation prohibited';
    end;
    $$;
    create or replace function public.is_document_bound_to_worker_warehouse(uuid, uuid, text, uuid) returns boolean language sql stable as $$
      select true;
    $$;
    revoke delete on public.purchase_orders from authenticated, anon, public;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant all on all tables in schema storage to anon, authenticated, service_role;
  `);

  const sql = readFileSync('supabase/migrations/0005_stockflow_phase4_and_storage_consolidated.sql', 'utf-8');
  await db.exec(sql);
  console.log('[PASS] Consolidated Run 1 succeeded');
  await db.exec(sql);
  console.log('[PASS] Consolidated Run 2 (Idempotency) succeeded');
}

test().then(() => console.log('CONSOLIDATED TEST COMPLETE: 100% PASS')).catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
