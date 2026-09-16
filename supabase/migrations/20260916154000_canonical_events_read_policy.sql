BEGIN;

DROP POLICY IF EXISTS "p_public_read_canonical_events" ON public.canonical_events;

CREATE POLICY "p_public_read_canonical_events"
  ON public.canonical_events
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL AND (event_status IS NULL OR event_status != 'rejected'));

COMMIT;
