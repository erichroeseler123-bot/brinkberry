BEGIN;

-- 1. Enable RLS across all core tables
ALTER TABLE IF EXISTS public.canonical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.source_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.source_health_logs ENABLE ROW LEVEL SECURITY;

-- 2. Grants for public read-only discovery
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.canonical_events TO anon, authenticated;
GRANT SELECT ON public.venues TO anon, authenticated;
GRANT SELECT ON public.sources TO anon, authenticated;

-- 3. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "p_public_read_canonical_events" ON public.canonical_events;
DROP POLICY IF EXISTS "p_service_only_canonical_events" ON public.canonical_events;
DROP POLICY IF EXISTS "p_public_read_venues" ON public.venues;
DROP POLICY IF EXISTS "p_service_only_venues" ON public.venues;
DROP POLICY IF EXISTS "p_public_read_sources" ON public.sources;
DROP POLICY IF EXISTS "p_service_only_sources" ON public.sources;
DROP POLICY IF EXISTS "p_service_only_source_events" ON public.source_events;
DROP POLICY IF EXISTS "p_service_only_source_health_logs" ON public.source_health_logs;

-- 4. Canonical Events: Public read published/non-deleted events
CREATE POLICY "p_public_read_canonical_events"
  ON public.canonical_events
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL AND event_status = 'published');

CREATE POLICY "p_service_only_canonical_events"
  ON public.canonical_events
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

-- 5. Venues: Public read
CREATE POLICY "p_public_read_venues"
  ON public.venues
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "p_service_only_venues"
  ON public.venues
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

-- 6. Sources: Public read active sources
CREATE POLICY "p_public_read_sources"
  ON public.sources
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "p_service_only_sources"
  ON public.sources
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

-- 7. Source Events & Health Logs: Service role only
CREATE POLICY "p_service_only_source_events"
  ON public.source_events
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

CREATE POLICY "p_service_only_source_health_logs"
  ON public.source_health_logs
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMIT;
