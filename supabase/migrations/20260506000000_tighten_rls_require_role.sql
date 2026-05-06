-- Tighten SELECT policies: require assigned role instead of just being authenticated.
-- This prevents self-registered users (with no assigned role) from reading financial data.

-- dashboard_data
DROP POLICY IF EXISTS "Authenticated users can view dashboard data" ON public.dashboard_data;
CREATE POLICY "Users with assigned role can view dashboard data"
  ON public.dashboard_data
  FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );

-- monthly_snapshots
DROP POLICY IF EXISTS "Authenticated users can view monthly snapshots" ON public.monthly_snapshots;
CREATE POLICY "Users with assigned role can view monthly snapshots"
  ON public.monthly_snapshots
  FOR SELECT
  USING (
    public.is_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );
