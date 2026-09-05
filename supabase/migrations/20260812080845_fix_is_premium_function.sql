-- K-02 FİX: is_premium() fonksiyonu gerçek kontrole döndürüldü
-- 11 Ağustos 2026'da disable_premium_gating tarafından "select true" yapılan
-- fonksiyon, bu migration ile production mantığına geri getirildi.
-- Canlıdan okunan gerçek içerik (referans):

create or replace function public.is_premium()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_premium and (premium_until is null or premium_until > now())
     from public.profiles
     where id = auth.uid()),
    false
  );
$$;

comment on function public.is_premium() is
  'K-02 fix (2026-08-12): disable_premium_gating (select true) geri alındı. '
  'profiles.is_premium AND premium_until kontrolü yeniden aktif.';
