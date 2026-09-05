-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-05).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- Sinav tarihi kullaniciya ozel bir ayar degil - "Gorevde Yukselme" sinavinin
-- tarihi herkes icin AYNI, tek bir resmi tarih. Onceki tasarimda her
-- kullanici kendi profilinden kendi tarihini giriyordu; bu yanlisti (ve
-- kafa karistirici olurdu - herkes farkli bir "sinava kalan" gorseydi).
-- Genel bir key-value ayar tablosu: herkes OKUYABILIR, sadece admin
-- YAZABILIR. Ileride baska genel ayarlar icin de kullanilabilir.
create table public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy app_settings_read on public.app_settings
  for select using (true);

create policy app_settings_admin_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.app_settings from public, anon;
grant select on public.app_settings to authenticated, anon;
grant insert, update, delete on public.app_settings to authenticated;

insert into public.app_settings (key, value) values ('exam_date', null);
