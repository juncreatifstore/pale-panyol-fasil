create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.whatsapp_conversations
  add column if not exists reminder_stage smallint not null default 0,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_stopped_at timestamptz;

create index if not exists whatsapp_conversations_due_reminders_idx
  on public.whatsapp_conversations (next_reminder_at)
  where next_reminder_at is not null and reminder_stopped_at is null;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'ppf_whatsapp_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text, 'ppf_whatsapp_cron_secret');
  end if;
end $$;

insert into public.integration_secret_status (provider, secret_key)
values ('whatsapp', 'cron_secret')
on conflict (provider, secret_key) do update set configured_at = now();

update public.whatsapp_conversations
set next_reminder_at = last_message_at + interval '3 hours'
where reminder_stopped_at is null
  and next_reminder_at is null
  and last_message_at >= now() - interval '21 hours'
  and current_step not in ('stopped', 'tracking', 'completed');

select cron.schedule(
  'pale-panyol-whatsapp-followups',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://xvmvppfziiymqjvhciax.supabase.co/functions/v1/whatsapp-followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ppf_whatsapp_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 15000
    );
  $cron$
);
