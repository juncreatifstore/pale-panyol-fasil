alter table public.sales_settings
  add column if not exists homepage_video_url text;

alter table public.orders
  add column if not exists public_checkout_token uuid;

create unique index if not exists orders_public_checkout_token_idx
  on public.orders(public_checkout_token)
  where public_checkout_token is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-media',
  'book-media',
  true,
  157286400,
  array['application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload book media" on storage.objects;
create policy "Admins upload book media"
on storage.objects for insert to authenticated
with check (bucket_id = 'book-media' and (select private.is_admin()));

drop policy if exists "Admins update book media" on storage.objects;
create policy "Admins update book media"
on storage.objects for update to authenticated
using (bucket_id = 'book-media' and (select private.is_admin()))
with check (bucket_id = 'book-media' and (select private.is_admin()));

drop policy if exists "Admins delete book media" on storage.objects;
create policy "Admins delete book media"
on storage.objects for delete to authenticated
using (bucket_id = 'book-media' and (select private.is_admin()));

update public.sales_settings
set photo_urls = '[]'::jsonb
where id = true
  and photo_urls = '["https://pale-panyol-fasil.vercel.app/pale-panyol-fasil-cover.jpg"]'::jsonb;
