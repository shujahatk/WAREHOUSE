-- Migration 0015: Fix Offers User Registration to require Admin approval
-- Ensures that rpc_register_offers_user strictly delegates to rpc_register_user, setting approval_status = 'pending' and active = false.

create or replace function public.rpc_register_offers_user(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_company text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notes text;
begin
  v_notes := trim(coalesce(p_notes, ''));
  if p_company is not null and length(trim(p_company)) > 0 then
    if length(v_notes) > 0 then
      v_notes := v_notes || ' (Company: ' || trim(p_company) || ')';
    else
      v_notes := 'Company: ' || trim(p_company);
    end if;
  end if;

  return public.rpc_register_user(
    p_auth_user_id => p_auth_user_id,
    p_email => p_email,
    p_name => p_name,
    p_phone => case when p_company is not null and length(trim(p_company)) > 0 then 'Company: ' || trim(p_company) else null end,
    p_notes => nullif(v_notes, ''),
    p_requested_role => 'offers_user'
  );
end;
$$;

revoke all on function public.rpc_register_offers_user(uuid, text, text, text, text) from public;
grant execute on function public.rpc_register_offers_user(uuid, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
