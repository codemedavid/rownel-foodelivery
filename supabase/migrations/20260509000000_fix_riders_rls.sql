-- Replace overly permissive riders/rider_settings RLS policies.
-- The old "Authenticated manage riders" allowed any logged-in user (including
-- customers) to approve/reject/delete rider profiles. Rider management now
-- requires app_metadata.role='admin' in the JWT — set server-side via the
-- Supabase Admin API in Convex riderActions, which also bypasses RLS via the
-- service role key.

DROP POLICY IF EXISTS "Authenticated manage riders" ON riders;
DROP POLICY IF EXISTS "Authenticated manage rider_settings" ON rider_settings;
DROP POLICY IF EXISTS "Authenticated manage rider settings" ON rider_settings;

CREATE POLICY "Admin manage riders"
  ON riders FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin manage rider_settings"
  ON rider_settings FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
