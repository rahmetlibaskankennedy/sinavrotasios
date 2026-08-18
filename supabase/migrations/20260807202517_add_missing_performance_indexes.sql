-- Production migration history marker.
--
-- The original SQL body was applied directly in production before this source
-- repository was brought under migration control.  The deterministic schema
-- equivalent (including the required indexes) is captured in
-- 20260810195839_prod_reconciliation_snapshot.sql.  Keeping this no-op marker
-- preserves the exact remote migration order for `supabase db push`.
select 1;
