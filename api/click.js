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

function isAdminAuthorized(req, u) {
  const authHeader = req.headers?.['authorization'] || '';
  const adminKeyHeader = req.headers?.['x-admin-key'] || '';
  const queryToken = u?.searchParams?.get('admin_token') || u?.searchParams?.get('token') || u?.searchParams?.get('key') || '';
  const token = (authHeader.replace(/^Bearer\s+/i, '').trim()) || adminKeyHeader.trim() || queryToken.trim();
  
  if (!token) return false;
  
  const validTokens = [
    process.env.ADMIN_TOKEN,
    process.env.ADMIN_AUDIT_TOKEN,
    process.env.BRINKBERRY_ADMIN_KEY,
    process.env.CRON_SECRET
  ].filter(Boolean);
  
  return validTokens.includes(token);
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

    // Read latest rows verification endpoint (Admin only)
    if (u.searchParams.get('read_latest') === '1') {
      if (!isAdminAuthorized(req, u)) {
        return res.status(401).json({ error: 'Admin authorization required' });
      }
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

    // Date-filtered partner engagement report (Admin only)
    if (u.searchParams.get('report') === '1' || u.searchParams.get('partner_report') === '1') {
      if (!isAdminAuthorized(req, u)) {
        return res.status(401).json({ error: 'Admin authorization required' });
      }
      if (!SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'No SERVICE_ROLE_KEY' });
      }
      try {
        const partnerFilter = u.searchParams.get('partner')?.trim().toLowerCase() || null;
        const days = Math.max(1, Math.min(Number(u.searchParams.get('days')) || 7, 90));

        let sinceIso = u.searchParams.get('since') || u.searchParams.get('start_date');
        if (!sinceIso) {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - days);
          sinceIso = d.toISOString();
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(sinceIso)) {
          sinceIso = `${sinceIso}T00:00:00.000Z`;
        }

        let untilIso = u.searchParams.get('until') || u.searchParams.get('end_date');
        if (!untilIso) {
          untilIso = new Date().toISOString();
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(untilIso)) {
          untilIso = `${untilIso}T23:59:59.999Z`;
        }

        const limit = Math.max(1, Math.min(Number(u.searchParams.get('limit')) || 1000, 5000));

        let queryUrl = `${SUPABASE_URL}/rest/v1/outbound_clicks?select=*&created_at=gte.${encodeURIComponent(sinceIso)}&created_at=lte.${encodeURIComponent(untilIso)}&order=created_at.desc&limit=${limit}`;
        if (partnerFilter && partnerFilter !== 'all') {
          queryUrl += `&surface=eq.widget_${encodeURIComponent(partnerFilter)}`;
        }

        const queryRes = await fetch(queryUrl, {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            authorization: `Bearer ${SERVICE_ROLE_KEY}`
          },
          signal: AbortSignal.timeout(4000)
        });

        if (!queryRes.ok) {
          return res.status(queryRes.status).json({ error: 'Failed to fetch report from Supabase', details: await queryRes.text() });
        }

        const rows = await queryRes.json();
        const records = Array.isArray(rows) ? rows : [];

        const dailyEngagement = {};
        const clicksByPartner = {};
        const clicksByTarget = {};

        for (const r of records) {
          const day = (r.created_at || '').slice(0, 10) || 'unknown';
          dailyEngagement[day] = (dailyEngagement[day] || 0) + 1;

          const surf = r.surface || 'unspecified';
          clicksByPartner[surf] = (clicksByPartner[surf] || 0) + 1;

          const targetDomain = (() => {
            try { return new URL(r.target_url).hostname; } catch { return r.target_url || 'unknown'; }
          })();
          clicksByTarget[targetDomain] = (clicksByTarget[targetDomain] || 0) + 1;
        }

        const reportData = {
          status: 'ok',
          metricType: 'event_click_engagement',
          partner: partnerFilter || 'all',
          period: {
            start: sinceIso,
            end: untilIso,
            days
          },
          totalClicks: records.length,
          dailyEngagement,
          clicksByPartner,
          clicksByTargetDomain: clicksByTarget,
          note: 'Event click counts measure outbound visitor engagement and referral interest from the partner site. Clicks do not demonstrate or establish completed ticket purchases, conversions, or commission revenue.',
          recordsCount: records.length,
          records: records.slice(0, 200)
        };

        if (u.searchParams.get('format') === 'html') {
          const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Partner Click Engagement Report · Brinkberry</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0e0b17; color: #f4eff8; padding: 24px; max-width: 900px; margin: 0 auto; line-height: 1.5; }
    h1 { font-size: 22px; margin-bottom: 8px; color: #ffb86b; }
    .meta { color: #9b90aa; font-size: 13.5px; margin-bottom: 24px; }
    .card { background: #171224; border: 1px solid #281f38; border-radius: 12px; padding: 18px; margin-bottom: 18px; }
    .stat-val { font-size: 36px; font-weight: 900; color: #ff2e63; }
    .stat-label { font-size: 12px; text-transform: uppercase; color: #9b90aa; letter-spacing: 0.05em; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #281f38; }
    th { color: #9b90aa; font-size: 11.5px; text-transform: uppercase; }
    .disclaimer { background: rgba(255, 184, 107, 0.08); border: 1px solid rgba(255, 184, 107, 0.25); border-radius: 8px; padding: 12px; font-size: 12.5px; color: #e0d8f0; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>Partner Click Engagement Report</h1>
  <div class="meta">Partner: <b>${esc(reportData.partner)}</b> · Period: ${esc(reportData.period.start.slice(0, 10))} to ${esc(reportData.period.end.slice(0, 10))} (${reportData.period.days} days)</div>
  <div class="card">
    <div class="stat-label">Total Outbound Event Clicks</div>
    <div class="stat-val">${reportData.totalClicks}</div>
  </div>
  <div class="card">
    <h3>Daily Engagement Trend</h3>
    <table>
      <thead><tr><th>Date</th><th>Clicks</th></tr></thead>
      <tbody>
        ${Object.entries(reportData.dailyEngagement).map(([d, c]) => `<tr><td>${esc(d)}</td><td><b>${c}</b></td></tr>`).join('') || '<tr><td colspan="2">No clicks in period</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="card">
    <h3>Breakdown by Partner Surface</h3>
    <table>
      <thead><tr><th>Surface</th><th>Clicks</th></tr></thead>
      <tbody>
        ${Object.entries(reportData.clicksByPartner).map(([p, c]) => `<tr><td>${esc(p)}</td><td><b>${c}</b></td></tr>`).join('') || '<tr><td colspan="2">No clicks in period</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="disclaimer">
    ⚠️ <b>Reporting Note:</b> ${esc(reportData.note)}
  </div>
</body>
</html>`);
        }

        return res.status(200).json(reportData);
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

    if (isVerify && !isAdminAuthorized(req, u)) {
      return res.status(401).json({ error: 'Admin authorization required' });
    }

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
