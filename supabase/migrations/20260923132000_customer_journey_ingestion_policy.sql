grant insert on public.customer_journey_events to anon;
grant usage, select on sequence public.customer_journey_events_id_seq to anon;

create policy "Anonymous visitors record journey events"
on public.customer_journey_events for insert to anon
with check (
  source in ('website', 'payment')
  and char_length(session_id) between 8 and 100
  and jsonb_typeof(metadata) = 'object'
);
