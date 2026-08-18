-- ============================================================================
-- TEMİZLİK: eski profiles_protect_admin trigger'ı (repoda hiç migration'ı
-- yoktu, muhtemelen ilk güvenlik düzeltmesi sırasında elle eklenmişti) hem
-- is_admin hem de role sütununu admin-olmayan kullanıcı için koruyordu.
--
-- role sütunu aslında kullanıcının kendi seçtiği KADRO (memur/şef/sayman/
-- şube müdürü) — yetki seviyesiyle ilgisi yok. Bu trigger yüzünden role-gate
-- ekranından yapılan kadro seçimi sessizce sunucuya kaydedilemiyordu (bkz.
-- app.js roleGateContinue -> profiles.update({ role })).
--
-- trg_protect_privileged_profile_columns (20260808000004) zaten is_admin,
-- is_premium, premium_until sütunlarını doğru şekilde koruyor; role o
-- kapsamda değil. Bu yüzden eski trigger tamamen kaldırılıyor.
--
-- NOT: Bu migration production'a doğrudan (Supabase MCP bağlantısı üzerinden)
-- uygulandı ve trigger'ın kaldırıldığı orada doğrulandı; bu dosya sadece
-- repo/CLI ile senkron kalması için ekleniyor.
-- ============================================================================
drop trigger if exists profiles_protect_admin on public.profiles;
drop function if exists public.protect_admin_column();
