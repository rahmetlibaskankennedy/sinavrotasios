
ALTER TABLE manual_deneme_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY manual_deneme_pool_admin_read ON manual_deneme_pool
  FOR SELECT TO authenticated USING ((SELECT is_admin()));

CREATE POLICY manual_deneme_pool_admin_insert ON manual_deneme_pool
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_admin()));

CREATE POLICY manual_deneme_pool_admin_update ON manual_deneme_pool
  FOR UPDATE TO authenticated USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

CREATE POLICY manual_deneme_pool_admin_delete ON manual_deneme_pool
  FOR DELETE TO authenticated USING ((SELECT is_admin()));
