BEGIN;

CREATE TABLE IF NOT EXISTS public.outbound_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.canonical_events(id) ON DELETE SET NULL,
  target_url TEXT NOT NULL,
  surface TEXT DEFAULT 'feed',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.outbound_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p_service_only_outbound_clicks" ON public.outbound_clicks;
CREATE POLICY "p_service_only_outbound_clicks"
  ON public.outbound_clicks
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

COMMIT;
