CREATE POLICY tf_pool_premium_read ON public.tf_pool
  FOR SELECT
  USING ((SELECT is_admin()) OR (SELECT is_premium()));
