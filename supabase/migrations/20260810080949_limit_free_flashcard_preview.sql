-- Production migration history marker.
--
-- The final flashcard preview policy is reconstructed by the reconciliation
-- snapshot and later entitlement migrations.  Retain this exact version so
-- the local migration graph matches production.
select 1;
