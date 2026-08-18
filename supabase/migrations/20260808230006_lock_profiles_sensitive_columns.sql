-- Production migration history marker.
--
-- The final, restrictive profiles policies are recreated in
-- 20260810195839_prod_reconciliation_snapshot.sql and hardened by the later
-- migrations.  This marker retains the production migration version.
select 1;
