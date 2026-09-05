-- purchases.product_id icin FK'yi kapsayan index yoktu (advisor: unindexed_foreign_keys).
-- purchases_product_id_fkey uzerinden yapilan lookup/join'leri hizlandirir. Salt eklemeli, geriye donusu DROP INDEX.
create index if not exists purchases_product_id_idx on public.purchases (product_id);
