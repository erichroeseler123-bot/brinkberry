BEGIN;

-- Revoke all table-level privileges from anon, authenticated, and public
REVOKE ALL PRIVILEGES ON TABLE public.outbound_clicks FROM anon, authenticated, public;

-- Drop any public or anonymous policies
DROP POLICY IF EXISTS "p_anon_insert_outbound_clicks" ON public.outbound_clicks;
DROP POLICY IF EXISTS "p_anon_select_outbound_clicks" ON public.outbound_clicks;

-- Ensure Row Level Security is enabled
ALTER TABLE public.outbound_clicks ENABLE ROW LEVEL SECURITY;

-- Retain access exclusively for service_role and postgres
GRANT ALL PRIVILEGES ON TABLE public.outbound_clicks TO service_role, postgres;

DROP POLICY IF EXISTS "p_service_only_outbound_clicks" ON public.outbound_clicks;
CREATE POLICY "p_service_only_outbound_clicks"
  ON public.outbound_clicks
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMIT;
