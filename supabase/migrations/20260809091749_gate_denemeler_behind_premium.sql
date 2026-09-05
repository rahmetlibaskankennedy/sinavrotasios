-- Production migration history marker.
--
-- Premium/content-read policy evolution is consolidated in the reconciliation
-- snapshot and subsequent entitlement migrations.  This intentionally does
-- not replay an obsolete intermediate policy on a fresh database.
select 1;
