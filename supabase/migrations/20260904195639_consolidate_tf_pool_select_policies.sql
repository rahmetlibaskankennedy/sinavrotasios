-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-04).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- tf_pool'da authenticated + SELECT icin iki permissive policy vardi:
-- tf_pool_admin_read (is_admin()) ve tf_pool_premium_read (is_admin() OR
-- is_premium()). Ikincisi zaten adminleri de kapsadigi icin birincisi tam
-- yedekti (performans danismaninin "multiple_permissive_policies" uyarisi) -
-- ayni onceki premium_products_select icin yapilan birlestirmeyle ayni desen
-- (bkz. 20260818055030_consolidate_premium_products_select_policies.sql).
drop policy if exists tf_pool_admin_read on public.tf_pool;
