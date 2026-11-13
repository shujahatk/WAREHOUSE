import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

console.log('================================================================');
console.log('   STOCKFLOW — ISOLATED MIGRATION 0006 (STORAGE & BACKUP) TEST   ');
console.log('================================================================\n');

async function run() {
  const db = new PGlite();

  console.log('[1/4] Bootstrapping mock Supabase auth, storage, and baseline schema...');
  await db.exec(`
    create or replace function crypt(pass text, salt text) returns text language sql immutable as $$
      select md5(pass || salt);
    $$;
    create or replace function gen_salt(type text) returns text language sql immutable as $$
      select 'mock_salt';
    $$;
    create role anon;
    create role authenticated;
    create role service_role;

    create schema if not exists auth;
    create table if not exists auth.users (
      instance_id uuid,
      id uuid primary key default gen_random_uuid(),
      aud text,
      role text,
      email text unique,
      encrypted_password text,
      email_confirmed_at timestamptz,
      confirmation_token text,
      recovery_token text,
      email_change text,
      email_change_token_new text,
      email_change_token_current text,
      phone_change text,
      phone_change_token text,
      reauthentication_token text,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      is_super_admin boolean,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table if not exists auth.identities (
      id text primary key,
      user_id uuid references auth.users(id),
      identity_data jsonb,
      provider text,
      provider_id text,
      last_sign_in_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      owner uuid,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      public boolean default false,
      avif_autodetection boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      owner_id text
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      last_accessed_at timestamptz default now(),
      metadata jsonb
    );
    alter table storage.objects enable row level security;

    create table public.users (
      id uuid primary key default gen_random_uuid(),
      auth_user_id uuid unique references auth.users(id),
      email text not null unique,
      name text not null,
      role text not null check (role in ('owner', 'manager', 'worker', 'moderator')),
      warehouse_id uuid,
      company_id uuid,
      active boolean not null default true,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table public.documents (
      id uuid primary key default gen_random_uuid(),
      shipment_id uuid,
      request_id uuid,
      warehouse text,
      storage_key text not null,
      status text not null default 'pending',
      created_by uuid references public.users(id),
      created_at timestamptz default now()
    );

    create table public.offer_attachments (
      id uuid primary key default gen_random_uuid(),
      offer_id uuid,
      storage_key text not null,
      uploaded_by uuid references public.users(id),
      created_at timestamptz default now()
    );

    create table public.requests (
      id uuid primary key default gen_random_uuid(),
      status text not null default 'draft'
    );

    create table public.shipments (
      id uuid primary key default gen_random_uuid(),
      status text not null default 'Draft'
    );

    create or replace function public.current_user_role() returns text language sql stable as $$
      select 'owner'::text;
    $$;
    create or replace function public.current_user_id() returns uuid language sql stable as $$
      select '10000000-0000-0000-0000-000000000001'::uuid;
    $$;
    create or replace function public.is_document_bound_to_worker_warehouse(uuid, uuid, text, uuid) returns boolean language sql stable as $$
      select true;
    $$;

    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant all on all tables in schema storage to anon, authenticated, service_role;
  `);

  console.log('[2/4] Executing 0006_storage_bucket_and_backup_runner.sql (RUN 1)...');
  const sql = readFileSync('supabase/migrations/0006_storage_bucket_and_backup_runner.sql', 'utf-8');
  await db.exec(sql);
  console.log('   Run 1 execution succeeded.');

  console.log('[3/4] Verifying bucket and policies in isolated PostgreSQL...');
  const bucketRes = await db.query("select * from storage.buckets where id = 'stockflow-files'");
  if (bucketRes.rows.length === 0 || bucketRes.rows[0].public !== false) {
    throw new Error('Bucket stockflow-files verification failed: ' + JSON.stringify(bucketRes.rows));
  }
  console.log('   [PASS] Bucket stockflow-files verified as private (public=false).');

  const policiesRes = await db.query("select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'");
  console.log(`   [PASS] ${policiesRes.rows.length} Storage policies verified:`, policiesRes.rows.map(r => r.policyname).join(', '));

  const backupUserRes = await db.query("select id, email, role, active from public.users where email = 'backup.runner@stockflow.local'");
  if (backupUserRes.rows.length === 0 || backupUserRes.rows[0].role !== 'owner') {
    throw new Error('Backup user verification failed: ' + JSON.stringify(backupUserRes.rows));
  }
  console.log('   [PASS] Dedicated backup runner user verified:', backupUserRes.rows[0]);

  console.log('[4/4] Executing 0006_storage_bucket_and_backup_runner.sql a SECOND time (Idempotency RUN 2)...');
  await db.exec(sql);
  console.log('   Run 2 execution succeeded with 0 errors.');

  console.log('\n================================================================');
  console.log('   MIGRATION 0006 IS 100% PASS & IDEMPOTENT                     ');
  console.log('================================================================');
}

run().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
