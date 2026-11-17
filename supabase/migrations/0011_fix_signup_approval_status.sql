-- Migration 0011: Fix User Signup Approval Status & Strict Server-Side Enforcement
-- Ensures pending accounts strictly remain pending until an administrator explicitly approves them.
-- Prevents any automatic approval or role escalation during sign-in.

-- 1. Redefine rpc_get_auth_account_status to safely link auth_user_id without auto-approving
create or replace function public.rpc_get_auth_account_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_auth_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthenticated');
  end if;

  -- Step 1: Look up user by auth_user_id
  select * into v_user
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  -- Step 2: If not linked yet, look up authenticated user's email in auth.users
  if v_user is null then
    select lower(trim(email)) into v_auth_email
    from auth.users
    where id = auth.uid()
    limit 1;

    if v_auth_email is not null then
      -- Link auth_user_id to public.users matching email WITHOUT changing approval_status or active flag
      update public.users
      set auth_user_id = auth.uid(),
          updated_at = now()
      where lower(trim(email)) = v_auth_email
        and auth_user_id is null
      returning * into v_user;
    end if;
  end if;

  -- If still null, do not auto-create an approved user!
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Profile not found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_user.id,
    'email', v_user.email,
    'name', v_user.name,
    'role', v_user.role,
    'active', v_user.active,
    'approval_status', v_user.approval_status
  );
end;
$$;

revoke all on function public.rpc_get_auth_account_status() from public, anon;
grant execute on function public.rpc_get_auth_account_status() to authenticated, service_role;

-- 2. Update users_select RLS policy to allow authenticated users to inspect their own status by auth.uid or JWT email claim
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    (select public.current_user_role()) in ('owner', 'manager')
    or ((select public.current_user_role()) = 'worker' and id = (select public.current_user_id()))
    or (auth.uid() is not null and auth_user_id = auth.uid())
    or (auth.uid() is not null and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
  );

-- 3. Notify PostgREST schema cache
notify pgrst, 'reload schema';
