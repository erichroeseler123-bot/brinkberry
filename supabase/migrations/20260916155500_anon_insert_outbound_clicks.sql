BEGIN;

GRANT INSERT ON public.outbound_clicks TO anon, authenticated;

DROP POLICY IF EXISTS "p_anon_insert_outbound_clicks" ON public.outbound_clicks;
CREATE POLICY "p_anon_insert_outbound_clicks"
  ON public.outbound_clicks
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

COMMIT;
