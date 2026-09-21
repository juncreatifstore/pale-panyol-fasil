create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null unique,
  customer_first_name text,
  language text not null default 'ht' check (language in ('ht','es','fr','en')),
  current_step text not null default 'welcome',
  customer_data jsonb not null default '{}'::jsonb,
  order_id uuid references public.orders(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  whatsapp_message_id text unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  content text not null,
  ai_intent text,
  ai_next_action text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_created_idx on public.whatsapp_messages(conversation_id, created_at desc);
create index if not exists whatsapp_conversations_last_message_idx on public.whatsapp_conversations(last_message_at desc);
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
grant select, insert, update, delete on public.whatsapp_conversations to authenticated;
grant select, insert, update, delete on public.whatsapp_messages to authenticated;

create policy "Admins manage WhatsApp conversations" on public.whatsapp_conversations for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins manage WhatsApp messages" on public.whatsapp_messages for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
