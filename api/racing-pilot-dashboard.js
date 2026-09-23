/**
 * Grassroots Motorsports Pilot Dashboard & Telemetry API
 *
 * Provides real-time operational transparency for the Motorsports & Race Track Pilot:
 * - /colorado/racing, dirt oval, and short track guide views
 * - Track profile views (/track/:slug)
 * - Official box office & cash gate ticket clicks
 * - Fan demand signals ("Bring Series to Track")
 * - Social race card visits (Open Graph & Instagram Stories)
 * - Track claim requests & verification status
 * - Race updates and rainout community reports
 * - Empty searches
 * - Living Verified Grassroots Race Calendar inspection (48h rolling window)
 * - Reviewable Track Claim & Outreach Packets (DRAFTS ONLY - NOT AUTO-SENT)
 */

const { getRacingPilotMetricsSummary } = require('../lib/telemetry');
const { getAllTracks, getAllScheduledRaces, getDynamicSeedRaces, getAllTouringSeries } = require('../lib/racing/registry');
const { getRacingPilotPackets } = require('../lib/racing/outreach-pilot');

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function renderRacingPilotDashboardHtml(summary, tracks, races, outreachPackets, seriesList) {
  const m = summary.metrics;
  const guideTotal = m.guideViews.total || 0;
  const trackTotal = Object.values(m.trackViews || {}).reduce((a, b) => a + b, 0);
  const clickTotal = m.officialTicketClicks.total || 0;
  const demandTotal = m.fanDemandSignals.total || 0;
  const cardTotal = m.socialCardVisits.total || 0;
  const claimTotal = m.claimRequests.total || 0;
  const correctionTotal = m.submissionsAndCorrections.total || 0;
  const emptyTotal = m.emptySearches.total || 0;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Motorsports Pilot Dashboard — Brinkberry Racing Radar</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    :root {
      --bg: #090b10;
      --card-bg: #111622;
      --card-border: #1e2838;
      --text: #f0f4f8;
      --text-dim: #8b99ab;
      --primary: #f59e0b;
      --primary-dark: #291800;
      --accent: #ef4444;
      --racing-green: #10b981;
      --blue: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 24px 20px 80px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 28px;
    }
    .brand {
      font-size: 22px;
      font-weight: 850;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-sub {
      color: var(--text-dim);
      font-size: 14px;
      font-weight: 400;
      margin-top: 4px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--racing-green);
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--racing-green);
      box-shadow: 0 0 8px var(--racing-green);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-dim);
      margin-bottom: 8px;
    }
    .kpi-value {
      font-size: 32px;
      font-weight: 850;
      color: #fff;
      line-height: 1.1;
    }
    .kpi-meta {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 8px;
    }
    .section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .section-title {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      margin: 0;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .badge-green { background: rgba(16, 185, 129, 0.15); color: var(--racing-green); }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: var(--primary); }
    .badge-blue { background: rgba(56, 189, 248, 0.15); color: var(--blue); }
    .badge-red { background: rgba(239, 68, 68, 0.15); color: var(--accent); }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      color: var(--text-dim);
      font-weight: 600;
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 700;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: var(--primary);
      color: var(--primary-dark);
    }
    .btn-secondary {
      background: #192130;
      color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn:hover {
      opacity: 0.9;
    }
    
    .guardrail-card {
      background: linear-gradient(135deg, rgba(20,28,45,0.8), rgba(12,16,24,0.95));
      border: 1px solid #23354e;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .guardrail-title {
      font-size: 15px;
      font-weight: 800;
      color: var(--primary);
      margin: 0 0 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .guardrail-list {
      margin: 0;
      padding-left: 20px;
      color: #d1d9e2;
      font-size: 13px;
    }
    .guardrail-list li {
      margin-bottom: 6px;
    }

    .accordion-item {
      background: #0c1017;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      margin-bottom: 12px;
      padding: 16px;
    }
    .accordion-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    .copy-box {
      background: #141b25;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 14px;
      margin-top: 12px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      color: #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand">
          <span>🏁 Motorsports &amp; Short Track Pilot Operations</span>
        </div>
        <div class="brand-sub">Real-time telemetry, living race day radar, and verified track outreach console.</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span class="status-badge"><span class="status-dot"></span> Racing Pilot Active</span>
        <a href="/denver/racing" target="_blank" class="btn btn-secondary">Open /denver/racing ↗</a>
      </div>
    </div>

    <!-- Architectural Guardrails & Pilot Integrity -->
    <div class="guardrail-card">
      <div class="guardrail-title">🛡️ Architectural Guardrails &amp; Short Track Integrity</div>
      <ul class="guardrail-list">
        <li><strong>Ticketing Lockdown Active:</strong> Direct checkout is disabled (<code>403 Forbidden: prototype_disabled</code>). Outbound ticket links route to official track box offices or disclose cash-at-gate policies.</li>
        <li><strong>Living Race Day Offsets:</strong> Race night dates are tied to official track URLs with dynamic civil time offsets clamped to the live 48-hour radar window (no stale static dates).</li>
        <li><strong>Zero Unsolicited Auto-Emails:</strong> Track claim packets are reviewable drafts strictly for operator inspection. No emails are dispatched automatically.</li>
        <li><strong>Privacy Protection:</strong> Raw IPs are never stored long-term; fan demand signals use salted SHA-256 hashes with 30-day anti-abuse throttling.</li>
      </ul>
    </div>

    <!-- 8 Racing Pilot KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">1. Racing Guide Views</div>
        <div class="kpi-value">${guideTotal}</div>
        <div class="kpi-meta">CO: ${m.guideViews.coloradoRacing} · Dirt: ${m.guideViews.dirtOvals} · Asphalt: ${m.guideViews.asphaltOvals} · Drag: ${m.guideViews.dragStrips}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">2. Track Profile Views</div>
        <div class="kpi-value">${trackTotal}</div>
        <div class="kpi-meta">${Object.keys(m.trackViews || {}).length} tracks inspected</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">3. Box Office / Gate Clicks</div>
        <div class="kpi-value">${clickTotal}</div>
        <div class="kpi-meta">Direct to official track ticketing</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">4. Fan Demand Signals</div>
        <div class="kpi-value">${demandTotal}</div>
        <div class="kpi-meta">"Bring Series to Track" signals</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">5. Social Race Cards</div>
        <div class="kpi-value">${cardTotal}</div>
        <div class="kpi-meta">Web: ${m.socialCardVisits.html} · Story (1080x1920): ${m.socialCardVisits.story} · SVG: ${m.socialCardVisits.svg}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">6. Track Claim Requests</div>
        <div class="kpi-value">${claimTotal}</div>
        <div class="kpi-meta">Promoter verification requests</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">7. Rainouts / Updates</div>
        <div class="kpi-value">${correctionTotal}</div>
        <div class="kpi-meta">Rainouts: ${m.submissionsAndCorrections.rainouts || 0} · Updates: ${m.submissionsAndCorrections.scheduleUpdates || 0}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">8. Empty Searches</div>
        <div class="kpi-value">${emptyTotal}</div>
        <div class="kpi-meta">Track/series demand gaps logged</div>
      </div>
    </div>

    <!-- Verified Living Grassroots Race Calendar Table -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Verified Living Race Calendar (${races.length} Living Races)</h2>
        <span class="badge badge-green">Dynamic 48h Window</span>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Race Title</th>
              <th>Track &amp; Surface</th>
              <th>Date / Green Flag</th>
              <th>Divisions &amp; Classes</th>
              <th>Weather Status</th>
              <th>Official Source &amp; Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${races.map(r => {
              const startFormatted = new Date(r.start_time).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
              const divisionsStr = r.racing?.divisions?.join(', ') || 'Weekly Classes';
              const weatherClass = r.racing?.weatherStatus === 'rained_out' ? 'badge-red' :
                                   r.racing?.weatherStatus === 'weather_watch' ? 'badge-amber' : 'badge-green';
              const weatherLabel = (r.racing?.weatherStatus || 'green_flag').replace('_', ' ').toUpperCase();

              return `
              <tr>
                <td><strong>${esc(r.title)}</strong></td>
                <td>
                  <div><a href="/track/${esc(r.trackSlug)}" style="color:var(--primary);text-decoration:none;font-weight:600;">${esc(r.trackName)}</a></div>
                  <div style="font-size:11.5px;color:var(--text-dim);">${esc(r.location || r.city)} · ${esc(r.racing?.surface || 'Oval')}</div>
                </td>
                <td>
                  <div>${esc(startFormatted)}</div>
                  <div style="font-size:11px;color:var(--text-dim);">Green Flag: ${esc(r.racing?.greenFlagTime || 'TBD')}</div>
                </td>
                <td>
                  <div style="max-width:260px;font-size:12.5px;">${esc(divisionsStr)}</div>
                </td>
                <td>
                  <span class="badge ${weatherClass}">${esc(weatherLabel)}</span>
                </td>
                <td>
                  <div><a href="${esc(r.official_source_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:none;font-size:12px;">Official Box Office ↗</a></div>
                  <div style="font-size:10.5px;color:var(--racing-green);">✓ Verified ${esc(new Date(r.lastVerifiedAt).toLocaleDateString())}</div>
                </td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <a href="/event/${esc(r.id)}" class="btn btn-secondary" style="padding:4px 8px;font-size:11px;">Radar</a>
                    <a href="/card/race/${esc(r.id)}" target="_blank" class="btn btn-secondary" style="padding:4px 8px;font-size:11px;">Card</a>
                    <a href="/card/race/${esc(r.id)}/story" target="_blank" class="btn btn-secondary" style="padding:4px 8px;font-size:11px;">Story</a>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Reviewable Track Claim & Outreach Packets -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Track Promoter Claim Packets (${outreachPackets.length} Reviewable Drafts)</h2>
        <span class="badge badge-amber">Drafts Only · Zero Auto-Send</span>
      </div>
      <p style="color:var(--text-dim);font-size:13.5px;margin-top:0;">
        Personalized outreach copy prepared for track promoters and race directors. Promoters can claim their page, confirm their box office link, and receive live fan demand metrics at zero cost.
      </p>

      ${outreachPackets.map(p => `
        <div class="accordion-item">
          <div class="accordion-summary">
            <div>
              <strong style="font-size:15px;color:#fff;">${esc(p.trackName)}</strong>
              <span style="font-size:12px;color:var(--text-dim);margin-left:8px;">📍 ${esc(p.location)}</span>
              <div style="font-size:12px;color:var(--primary);margin-top:2px;">Contact: ${esc(p.targetContactRole)} (${esc(p.contactEmailSuggestion)})</div>
            </div>
            <div style="display:flex;gap:8px;">
              <a href="/track/${esc(p.trackSlug)}" target="_blank" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;">Live Profile ↗</a>
              <a href="${esc(p.claimUrl)}" target="_blank" class="btn btn-primary" style="padding:4px 10px;font-size:12px;">Claim Link</a>
            </div>
          </div>
          <div style="margin-top:12px;">
            <div style="font-size:12px;color:var(--text-dim);"><strong>Subject:</strong> ${esc(p.emailSubject)}</div>
            <div class="copy-box">${esc(p.emailBody)}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Touring Series Roster -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">National &amp; Regional Touring Series (${seriesList.length} Seed Series)</h2>
        <span class="badge badge-blue">Fan Demand Enabled</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
        ${seriesList.map(s => `
          <div style="background:#0c1017;border:1px solid var(--card-border);border-radius:12px;padding:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <strong style="color:#fff;font-size:15px;">${esc(s.name)}</strong>
              <span class="badge badge-blue">${esc(s.discipline)}</span>
            </div>
            <p style="color:var(--text-dim);font-size:12.5px;margin:8px 0 12px;">${esc(s.description)}</p>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:11.5px;color:var(--primary);">${esc(s.sanctioningBody)}</span>
              <a href="/series/${esc(s.slug)}" target="_blank" class="btn btn-secondary" style="padding:3px 8px;font-size:11px;">Demand Page ↗</a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="text-align:center;color:var(--text-dim);font-size:12.5px;margin-top:40px;">
      Brinkberry Live Radar · Grassroots Motorsports Pilot Engine · Operations &amp; Telemetry Console
    </div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.json) res.json = function(d) {
    if (this.setHeader) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(d));
    return this;
  };
  if (!res.send) res.send = function(html) {
    if (this.setHeader) this.setHeader('Content-Type', 'text/html; charset=utf-8');
    this.end(html);
    return this;
  };

  try {
    const u = new URL(req.url || '/', 'https://brinkberry.local');
    const summary = getRacingPilotMetricsSummary('colorado');
    const allTracks = getAllTracks();
    const allRaces = getAllScheduledRaces();
    const outreachPackets = getRacingPilotPackets();
    const allSeries = getAllTouringSeries();

    // GET /api/racing/pilot-metrics
    if (u.pathname === '/api/racing/pilot-metrics' || u.searchParams.get('format') === 'json') {
      return res.status(200).json({
        success: true,
        summary,
        inventory: {
          tracksCount: allTracks.length,
          racesCount: allRaces.length,
          outreachPacketsCount: outreachPackets.length,
          touringSeriesCount: allSeries.length
        },
        tracks: allTracks.map(t => ({
          slug: t.slug,
          name: t.name,
          city: t.city,
          state: t.state,
          surface: t.trackType,
          officialBoxOfficeConfirmed: t.officialBoxOfficeConfirmed,
          website: t.website
        })),
        outreachPackets: outreachPackets.map(p => ({
          trackSlug: p.trackSlug,
          trackName: p.trackName,
          claimUrl: p.claimUrl,
          contactEmailSuggestion: p.contactEmailSuggestion
        }))
      });
    }

    // GET /admin/pilot-racing or /racing/pilot
    return res.status(200).send(renderRacingPilotDashboardHtml(summary, allTracks, allRaces, outreachPackets, allSeries));
  } catch (err) {
    console.error('Racing pilot dashboard error:', err);
    return res.status(500).send('Racing pilot dashboard error');
  }
};
