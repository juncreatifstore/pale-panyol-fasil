create table if not exists public.integration_secret_status (
  provider text not null references public.integration_settings(provider) on delete cascade,
  secret_key text not null,
  configured_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (provider, secret_key)
);

alter table public.integration_secret_status enable row level security;
create policy "Admins manage integration secret status"
on public.integration_secret_status for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create or replace function private.integration_secret_allowed(p_provider text, p_key text)
returns boolean language sql immutable set search_path = '' as $$
  select (p_provider, p_key) in (
    ('mercado_pago','access_token'), ('mercado_pago','webhook_secret'),
    ('stripe','secret_key'), ('stripe','webhook_secret'),
    ('whatsapp','access_token'), ('whatsapp','phone_number_id'),
    ('whatsapp','api_version'), ('whatsapp','verify_token'), ('whatsapp','app_secret'),
    ('openai','api_key'), ('openai','model'),
    ('claude','api_key'), ('claude','model'),
    ('shipping','api_url'), ('shipping','api_key')
  );
$$;

create or replace function public.admin_set_integration_secret(p_provider text, p_key text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := 'ppf_' || p_provider || '_' || p_key; v_id uuid;
begin
  if not private.is_admin() then raise exception 'forbidden'; end if;
  if not private.integration_secret_allowed(p_provider, p_key) then raise exception 'invalid integration field'; end if;
  if p_value is null or length(btrim(p_value)) = 0 or length(p_value) > 10000 then raise exception 'invalid secret value'; end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_value, v_name, 'Pale Panyol Fasil admin integration secret');
  else
    perform vault.update_secret(v_id, p_value, v_name, 'Pale Panyol Fasil admin integration secret');
  end if;
  insert into public.integration_secret_status(provider, secret_key, configured_at, updated_by)
  values (p_provider, p_key, now(), auth.uid())
  on conflict (provider, secret_key) do update set configured_at = excluded.configured_at, updated_by = excluded.updated_by;
  update public.integration_settings set secret_configured = true, updated_by = auth.uid(), updated_at = now() where provider = p_provider;
end;
$$;

create or replace function public.admin_delete_integration_secret(p_provider text, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden'; end if;
  if not private.integration_secret_allowed(p_provider, p_key) then raise exception 'invalid integration field'; end if;
  delete from vault.secrets where name = 'ppf_' || p_provider || '_' || p_key;
  delete from public.integration_secret_status where provider = p_provider and secret_key = p_key;
  update public.integration_settings s
  set secret_configured = exists(select 1 from public.integration_secret_status x where x.provider = p_provider), updated_by = auth.uid(), updated_at = now()
  where s.provider = p_provider;
end;
$$;

create or replace function public.runtime_get_integration_secrets()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(provider, values_json), '{}'::jsonb)
  from (
    select s.provider, jsonb_object_agg(s.secret_key, v.decrypted_secret) as values_json
    from public.integration_secret_status s
    join vault.decrypted_secrets v on v.name = 'ppf_' || s.provider || '_' || s.secret_key
    group by s.provider
  ) grouped;
$$;

revoke all on function public.admin_set_integration_secret(text,text,text) from public, anon;
grant execute on function public.admin_set_integration_secret(text,text,text) to authenticated;
revoke all on function public.admin_delete_integration_secret(text,text) from public, anon;
grant execute on function public.admin_delete_integration_secret(text,text) to authenticated;
revoke all on function public.runtime_get_integration_secrets() from public, anon, authenticated;
grant execute on function public.runtime_get_integration_secrets() to service_role;
