BEGIN;

-- 1. Grant SELECT on source_events for count aggregation and public verification
GRANT SELECT ON public.source_events TO anon, authenticated;

DROP POLICY IF EXISTS "p_public_read_source_events" ON public.source_events;
CREATE POLICY "p_public_read_source_events"
  ON public.source_events
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
