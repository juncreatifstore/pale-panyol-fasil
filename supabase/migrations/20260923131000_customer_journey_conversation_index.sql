create index if not exists customer_journey_events_conversation_idx
  on public.customer_journey_events (conversation_id)
  where conversation_id is not null;
