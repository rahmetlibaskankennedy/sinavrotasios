-- ============================================================================
-- KRİTİK GÜVENLİK DÜZELTMESİ: "Kullanıcı kendi profilini güncelleyebilir"
-- policy'si (with_check = null) kullanıcının kendi satırındaki HERHANGİ bir
-- sütunu değiştirmesine izin veriyordu — is_admin, is_premium, premium_until
-- dahil. Yani her kullanıcı kendi kendine admin/premium verebiliyordu.
-- RLS satır bazlı olduğu için tek başına sütun kısıtlayamıyor; bu yüzden bir
-- BEFORE UPDATE trigger ile çözüyoruz: admin olmayan biri bu üç sütunu
-- değiştirmeye çalışırsa, değişiklik sessizce eski değerine geri döner.
-- admin_set_premium()/admin panel akışı etkilenmiyor çünkü auth.uid() (ve
-- dolayısıyla is_admin()) SECURITY DEFINER içinde de gerçek çağıran kullanıcıyı
-- gösterir.
--
-- NOT: Bu migration production'a doğrudan (Supabase MCP bağlantısı üzerinden)
-- uygulandı ve trigger orada doğrulandı; bu dosya sadece repo/CLI ile senkron
-- kalması için ekleniyor.
-- ============================================================================
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.is_admin := old.is_admin;
    new.is_premium := old.is_premium;
    new.premium_until := old.premium_until;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_privileged_profile_columns on public.profiles;
create trigger trg_protect_privileged_profile_columns
before update on public.profiles
for each row execute function public.protect_privileged_profile_columns();
