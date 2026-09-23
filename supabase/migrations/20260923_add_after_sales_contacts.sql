alter table public.sales_settings
  add column if not exists after_sales_whatsapp text,
  add column if not exists after_sales_email text;

update public.sales_settings
set after_sales_email = coalesce(nullif(trim(after_sales_email), ''), 'contact@juncreatif.store')
where id = true;

comment on column public.sales_settings.after_sales_whatsapp is 'Numéro WhatsApp public du service après-vente, au format international.';
comment on column public.sales_settings.after_sales_email is 'Adresse e-mail publique du service après-vente.';
