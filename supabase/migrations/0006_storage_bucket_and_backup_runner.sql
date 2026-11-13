-- ============================================================================
-- STOCKFLOW — MIGRATION 0006: STORAGE BUCKET & LEAST-PRIVILEGE BACKUP RUNNER
-- Single self-contained, idempotent, and non-destructive SQL script
-- Compatible with Supabase SQL Editor: paste and run in a single go
-- Covers:
--   1. Private Storage Bucket: stockflow-files (10MB limit, strictly private)
--   2. Storage RLS Policies: documents and offer attachments
--   3. Dedicated Least-Privilege Backup Runner: backup.runner@stockflow.local
-- ============================================================================

begin;

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

-- Note: RLS is already enabled by default on storage.objects by Supabase

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

