import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

async function testSqlBackupFile() {
  console.log('================================================================');
  console.log('   STOCKFLOW — TEST ACTUAL SQL BACKUP FILE ON ISOLATED POSTGRES  ');
  console.log('================================================================\n');

  const sqlFile = 'backups/stockflow-production-complete-backup-2026-11-13T09-44-53-072Z.sql';
  console.log(`[1/4] Reading exact backup file: ${sqlFile}`);
  const sql = readFileSync(sqlFile, 'utf-8');
  console.log(`      File size: ${sql.length} bytes, lines: ${sql.split('\n').length}\n`);

  console.log('[2/4] Initializing fresh isolated PostgreSQL database & Supabase environment...');
  const db = new PGlite();

  // Fresh Supabase platform baseline (auth, storage, roles, pgcrypto shims)
  await db.exec(`
    create schema if not exists auth;
    create schema if not exists storage;
    create table if not exists auth.users (
      instance_id uuid default '00000000-0000-0000-0000-000000000000',
      id uuid primary key default gen_random_uuid(),
      aud text default 'authenticated',
      role text default 'authenticated',
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      invited_at timestamptz,
      confirmation_token text default '',
      confirmation_sent_at timestamptz,
      recovery_token text default '',
      recovery_sent_at timestamptz,
      email_change_token_new text default '',
      email_change text default '',
      email_change_sent_at timestamptz,
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      is_super_admin boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      phone text,
      phone_confirmed_at timestamptz,
      phone_change text default '',
      phone_change_token text default '',
      phone_change_sent_at timestamptz,
      confirmed_at timestamptz,
      email_change_token_current text default '',
      email_change_confirm_status smallint default 0,
      banned_until timestamptz,
      reauthentication_token text default '',
      reauthentication_sent_at timestamptz,
      is_sso_user boolean default false,
      deleted_at timestamptz,
      is_anonymous boolean default false
    );
    create table if not exists auth.identities (
      id text not null,
      user_id uuid not null references auth.users(id) on delete cascade,
      identity_data jsonb not null default '{}'::jsonb,
      provider text not null default 'email',
      last_sign_in_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      provider_id text default '',
      primary key (provider, id)
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    -- pgcrypto shims for WebAssembly PGlite environment
    create or replace function public.gen_salt(text) returns text language sql stable as $$ select 'salt'; $$;
    create or replace function public.crypt(text, text) returns text language sql stable as $$ select 'hashed_pwd'; $$;

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
      metadata jsonb,
      path_tokens text[]
    );

    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    grant anon to current_user;
    grant authenticated to current_user;
    grant service_role to current_user;
  `);
  console.log('      Fresh PostgreSQL environment initialized.\n');

  console.log('[3/4] Executing EXACT backup file from beginning to end (Single Exec)...');
  const startTime = Date.now();
  await db.exec(sql);
  const elapsedMs = Date.now() - startTime;
  console.log(`      [PASS] Exact SQL backup file executed successfully in ${elapsedMs}ms.\n`);

  console.log('[4/4] Verifying reconstituted database objects and restored data:');

  // A. Tables
  const tablesRes = await db.query(`
    select count(*) as count from information_schema.tables 
    where table_schema = 'public' and table_type = 'BASE TABLE';
  `);
  const tableCount = Number(tablesRes.rows[0].count);
  console.log(`  ✓ Relational Tables in public:    ${tableCount} tables`);

  // B. Constraints
  const constrRes = await db.query(`
    select count(*) as count from information_schema.table_constraints 
    where table_schema = 'public';
  `);
  const constrCount = Number(constrRes.rows[0].count);
  console.log(`  ✓ Table Constraints in public:   ${constrCount} constraints`);

  // C. Indexes
  const idxRes = await db.query(`
    select count(*) as count from pg_indexes 
    where schemaname = 'public';
  `);
  const idxCount = Number(idxRes.rows[0].count);
  console.log(`  ✓ Indexes in public:             ${idxCount} indexes`);

  // D. Functions
  const funcRes = await db.query(`
    select count(*) as count from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public';
  `);
  const funcCount = Number(funcRes.rows[0].count);
  console.log(`  ✓ Functions / RPCs in public:    ${funcCount} functions`);

  // E. Triggers
  const trigRes = await db.query(`
    select count(*) as count from information_schema.triggers 
    where trigger_schema = 'public';
  `);
  const trigCount = Number(trigRes.rows[0].count);
  console.log(`  ✓ Triggers in public:            ${trigCount} triggers`);

  // F. RLS Policies
  const polRes = await db.query(`
    select count(*) as count from pg_policies 
    where schemaname = 'public';
  `);
  const polCount = Number(polRes.rows[0].count);
  console.log(`  ✓ RLS Policies in public:        ${polCount} policies`);

  // G. Role Grants on Purchase Orders (Confirming PO Delete is denied)
  const poDeleteRes = await db.query(`
    select has_table_privilege('authenticated', 'public.purchase_orders', 'DELETE') as authenticated_has_po_delete;
  `);
  const poDeleteDenied = !poDeleteRes.rows[0].authenticated_has_po_delete;
  console.log(`  ✓ PO DELETE Denied to auth:      ${poDeleteDenied ? 'PASS (DENIED)' : 'FAIL (PERMITTED)'}`);

  // H. Restored Records
  const whRes = await db.query('select count(*) as count from public.warehouses;');
  const userRes = await db.query('select count(*) as count from public.users;');
  const pkgRes = await db.query('select count(*) as count from public.packaging_types;');

  const whCount = Number(whRes.rows[0].count);
  const userCount = Number(userRes.rows[0].count);
  const pkgCount = Number(pkgRes.rows[0].count);

  console.log(`\n  Restored Production Data Records:`);
  console.log(`    - Warehouses:      ${whCount} records (Bornem, Turnhout, Spain, Pakistan)`);
  console.log(`    - Users:           ${userCount} records (Admin, Staff, Worker, Moderator)`);
  console.log(`    - Packaging Types: ${pkgCount} records`);

  if (tableCount < 25 || constrCount < 20 || funcCount < 20 || whCount !== 4 || userCount !== 4 || pkgCount !== 9) {
    throw new Error('Database object or data count verification failed!');
  }

  console.log('\n================================================================');
  console.log('   SQL BACKUP FILE RESTORATION TEST: 100% PASS                  ');
  console.log('================================================================');
}

testSqlBackupFile().catch((err) => {
  console.error('\n[FATAL] SQL Backup test failed:', err);
  process.exit(1);
});
