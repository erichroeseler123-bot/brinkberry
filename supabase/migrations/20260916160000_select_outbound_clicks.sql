BEGIN;

GRANT SELECT ON public.outbound_clicks TO anon, authenticated;

DROP POLICY IF EXISTS "p_anon_select_outbound_clicks" ON public.outbound_clicks;
CREATE POLICY "p_anon_select_outbound_clicks"
  ON public.outbound_clicks
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
