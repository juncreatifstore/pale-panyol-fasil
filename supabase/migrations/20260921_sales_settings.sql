create table if not exists public.sales_settings (
  id boolean primary key default true check (id),
  book_price_mxn numeric(10,2) not null default 625 check (book_price_mxn >= 0),
  book_pages integer not null default 278 check (book_pages > 0),
  book_chapters text,
  summary_pdf_url text,
  photo_urls jsonb not null default '[]'::jsonb,
  book_benefits jsonb not null default '[]'::jsonb,
  testimonials jsonb not null default '[]'::jsonb,
  tapachula_delivery text not null default 'Remise en main propre gratuite à Tapachula.',
  cdmx_delivery text not null default 'Livraison gratuite à un point convenu sur une ligne de métro de CDMX.',
  other_zones_delivery text not null default 'Tarif calculé selon l’adresse par Envia.com.',
  after_sales_service text not null default 'Pour toute difficulté après l’achat, écrivez à contact@juncreatif.store avec votre numéro de commande.',
  origin_postal_code text,
  origin_city text,
  origin_state text,
  origin_street text,
  origin_number text,
  origin_district text,
  origin_phone text,
  package_weight_kg numeric(8,3),
  package_length_cm numeric(8,2) not null default 22.86,
  package_width_cm numeric(8,2) not null default 15.24,
  package_height_cm numeric(8,2) not null default 1.60,
  envia_carriers jsonb not null default '["dhl","fedex","estafeta"]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.sales_settings (id, photo_urls, book_benefits)
values (
  true,
  '["https://pale-panyol-fasil.vercel.app/pale-panyol-fasil-cover.jpg"]'::jsonb,
  '["Li ede Ayisyen kominike an panyòl nan lavi chak jou.","Li esplike vokabilè, konjigasyon ak fraz pratik an kreyòl.","Li gen egzèsis pou pratike sa ou aprann yo."]'::jsonb
)
on conflict (id) do nothing;

alter table public.sales_settings enable row level security;
grant select, insert, update on public.sales_settings to authenticated;

create policy "Admins manage sales settings"
on public.sales_settings for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
