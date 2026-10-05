const { isValidTicketUrl } = require('../lib/affiliate');
const { trackTicketClick, trackPilotTicketClick } = require('../lib/telemetry');
const { getComedyShowById } = require('../lib/comedy/registry');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function logClickTelemetry(eventId, targetUrl, surface, returnRow = false) {
  // Telemetry requires server-side service role key; skip safely if unavailable
  if (!SERVICE_ROLE_KEY) return { ok: false, error: 'no_service_key' };
  
  const payload = {
    event_id: eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null,
    target_url: targetUrl,
    surface: String(surface || 'feed').slice(0, 50)
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/outbound_clicks`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: returnRow ? 'return=representation' : 'return=minimal'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500)
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = async (req, res) => {
  if (!res.status) {
    res.status = function(code) { this.statusCode = code; return this; };
  }
  if (!res.json) {
    res.json = function(data) {
      if (this.setHeader) this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }
  try {
    const u = new URL(req.url, 'https://brinkberry.local');

    // Read latest rows verification endpoint
    if (u.searchParams.get('read_latest') === '1') {
      if (!SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'No SERVICE_ROLE_KEY' });
      }
      try {
        const queryRes = await fetch(`${SUPABASE_URL}/rest/v1/outbound_clicks?select=*&order=created_at.desc&limit=5`, {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            authorization: `Bearer ${SERVICE_ROLE_KEY}`
          },
          signal: AbortSignal.timeout(3000)
        });
        const qData = await queryRes.json();
        return res.status(queryRes.status).json({
          status: queryRes.status,
          count: Array.isArray(qData) ? qData.length : 0,
          latest: qData
        });
      } catch (e) {
        return res.status(503).json({ error: e.message });
      }
    }

    const target = u.searchParams.get('url') || u.searchParams.get('dest');
    const eventId = u.searchParams.get('eventId');
    const partner = u.searchParams.get('partner');
    const surfaceParam = u.searchParams.get('surface');
    const surface = surfaceParam || (partner ? `widget_${partner}` : 'feed');
    const isVerify = u.searchParams.get('verify') === '1';

    if (!target) {
      return res.status(400).json({ error: 'Missing target url parameter' });
    }

    if (!isValidTicketUrl(target)) {
      return res.status(400).json({ error: 'Invalid or disallowed destination URL' });
    }

    // Telemetry logging is awaited to prevent lambda freeze from dropping writes
    const teleResult = await logClickTelemetry(eventId, target, surface, isVerify);
    trackTicketClick(target, eventId, surface);

    const comedyShow = eventId ? getComedyShowById(eventId) : null;
    const venueSlug = comedyShow?.venueSlug || null;
    trackPilotTicketClick(venueSlug, eventId);

    if (isVerify) {
      return res.status(200).json({
        ok: true,
        target,
        surface,
        partner,
        telemetry: teleResult
      });
    }

    if (typeof res.writeHead === 'function') {
      res.writeHead(302, {
        Location: target,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      });
    } else {
      if (res.setHeader) {
        res.setHeader('Location', target);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      }
      if (typeof res.status === 'function') {
        res.status(302);
      }
    }
    res.end();
  } catch (err) {
    console.error('Click redirect error:', err);
    res.status(500).json({ error: 'Internal redirect error' });
  }
};
