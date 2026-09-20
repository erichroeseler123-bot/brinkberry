const { isValidTicketUrl } = require('../lib/affiliate');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function logClickTelemetry(eventId, targetUrl, surface) {
  // Telemetry requires server-side service role key; skip safely if unavailable
  if (!SERVICE_ROLE_KEY) return;
  
  const payload = {
    event_id: eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null,
    target_url: targetUrl,
    surface: String(surface || 'feed').slice(0, 50)
  };

  try {
    fetch(`${SUPABASE_URL}/rest/v1/outbound_clicks`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Non-blocking telemetry failure must never impact user flow
    });
  } catch (_) {
    // Non-blocking failure
  }
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const target = u.searchParams.get('url') || u.searchParams.get('dest');
    const eventId = u.searchParams.get('eventId');
    const partner = u.searchParams.get('partner');
    const surfaceParam = u.searchParams.get('surface');
    const surface = surfaceParam || (partner ? `widget_${partner}` : 'feed');

    if (!target) {
      return res.status(400).json({ error: 'Missing target url parameter' });
    }

    if (!isValidTicketUrl(target)) {
      return res.status(400).json({ error: 'Invalid or disallowed destination URL' });
    }

    // Telemetry logging is isolated and non-blocking
    logClickTelemetry(eventId, target, surface);

    res.writeHead(302, {
      Location: target,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });
    res.end();
  } catch (err) {
    console.error('Click redirect error:', err);
    res.status(500).json({ error: 'Internal redirect error' });
  }
};
