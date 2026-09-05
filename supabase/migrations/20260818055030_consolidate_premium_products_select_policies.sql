-- premium_products: iki permissive SELECT policy'sini (public_read + admin_write'in SELECT'i)
-- tek policy'de birlestir. Efektif izin AYNI kalir: is_active OR is_admin().
-- Yazma (INSERT/UPDATE/DELETE) icin ayri, sadece admin policy'leri eklenir.

alter policy premium_products_public_read
  on public.premium_products
  using (is_active or is_admin());

drop policy premium_products_admin_write on public.premium_products;

create policy premium_products_admin_insert
  on public.premium_products
  for insert
  to authenticated
  with check (is_admin());

create policy premium_products_admin_update
  on public.premium_products
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy premium_products_admin_delete
  on public.premium_products
  for delete
  to authenticated
  using (is_admin());
