/**
 * Denver Comedy Pilot Dashboard & Telemetry API
 *
 * Provides real-time operational transparency for the Denver Comedy Pilot:
 * - /denver/comedy & open mic guide views
 * - Venue-page views
 * - Official box office ticket clicks
 * - Fan demand signals
 * - Social card visits (Open Graph & Instagram Stories)
 * - Venue claim requests & verification status
 * - Submissions & community corrections
 * - Empty searches
 * - Living Verified Denver Comedy Pilot Calendar inspection
 * - Reviewable Venue Claim & Outreach Packets (DRAFTS ONLY - NOT AUTO-SENT)
 */

const { getPilotMetricsSummary } = require('../lib/telemetry');
const { getVenuesByCity, getDynamicSeedShows } = require('../lib/comedy/registry');
const { getDenverPilotPackets } = require('../lib/comedy/outreach-pilot');

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

function renderPilotDashboardHtml(summary, denverVenues, denverShows, outreachPackets) {
  const m = summary.metrics;
  const guideTotal = m.guideViews.total || 0;
  const venueTotal = Object.values(m.venueViews || {}).reduce((a, b) => a + b, 0);
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
  <title>Denver Comedy Pilot Dashboard — Brinkberry</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    :root {
      --bg: #07050e;
      --card-bg: #110c1c;
      --card-border: #241b34;
      --text: #f5effc;
      --text-dim: #9c90af;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --verified-green: #00d26a;
      --blue: #58a6ff;
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
      background: rgba(0, 210, 106, 0.12);
      border: 1px solid rgba(0, 210, 106, 0.35);
      color: var(--verified-green);
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 700;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--verified-green);
      box-shadow: 0 0 8px var(--verified-green);
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
    .badge-green { background: rgba(0, 210, 106, 0.15); color: var(--verified-green); }
    .badge-orange { background: rgba(255, 184, 107, 0.15); color: var(--primary); }
    .badge-blue { background: rgba(88, 166, 255, 0.15); color: var(--blue); }
    
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
      background: #1e172e;
      color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn:hover {
      opacity: 0.9;
    }
    
    .guardrail-card {
      background: linear-gradient(135deg, rgba(38,20,55,0.7), rgba(18,13,28,0.9));
      border: 1px solid #3d2757;
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
      color: #ded6ec;
      font-size: 13px;
    }
    .guardrail-list li {
      margin-bottom: 6px;
    }

    .accordion-item {
      background: #0d0917;
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
      background: #140e24;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 14px;
      margin-top: 12px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      color: #e5def0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand">
          <span>🎤 Denver Comedy Pilot Dashboard</span>
        </div>
        <div class="brand-sub">Real-time operational radar, verified calendar inventory, and outreach readiness for Denver, Colorado.</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span class="status-badge"><span class="status-dot"></span> Pilot Active</span>
        <a href="/denver/comedy" target="_blank" class="btn btn-secondary">Open /denver/comedy ↗</a>
      </div>
    </div>

    <!-- Security & Architecture Guardrails -->
    <div class="guardrail-card">
      <div class="guardrail-title">🛡️ Architectural Guardrails & Pilot Integrity</div>
      <ul class="guardrail-list">
        <li><strong>Ticketing Lockdown Active:</strong> Direct checkout is disabled (<code>403 Forbidden: prototype_disabled</code>). Outbound ticket links route to official box offices only.</li>
        <li><strong>Living Calendar Offsets:</strong> Show dates are tied to official URLs with dynamic civil time offsets clamped to the live 48-hour radar window (no stale static dates).</li>
        <li><strong>Zero Unsolicited Auto-Emails:</strong> Venue claim packets are reviewable drafts strictly for operator inspection. No emails are dispatched automatically.</li>
        <li><strong>Privacy Protection:</strong> Raw IPs are never stored long-term; anti-abuse hashes are salted SHA-256 with 30-day deduplication.</li>
      </ul>
    </div>

    <!-- 8 Pilot KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">1. Guide Page Views</div>
        <div class="kpi-value">${guideTotal}</div>
        <div class="kpi-meta">Comedy: ${m.guideViews.denverComedy} · Open Mics: ${m.guideViews.denverOpenMics}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">2. Venue Page Views</div>
        <div class="kpi-value">${venueTotal}</div>
        <div class="kpi-meta">${Object.keys(m.venueViews || {}).length} rooms viewed</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">3. Official Ticket Clicks</div>
        <div class="kpi-value">${clickTotal}</div>
        <div class="kpi-meta">Direct to club box offices</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">4. Fan Demand Signals</div>
        <div class="kpi-value">${demandTotal}</div>
        <div class="kpi-meta">"Bring comic to city" requests</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">5. Social Card Visits</div>
        <div class="kpi-value">${cardTotal}</div>
        <div class="kpi-meta">Web: ${m.socialCardVisits.html} · Story (1080x1920): ${m.socialCardVisits.story}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">6. Venue Claim Requests</div>
        <div class="kpi-value">${claimTotal}</div>
        <div class="kpi-meta">Official domain verification</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">7. Submissions / Corrections</div>
        <div class="kpi-value">${correctionTotal}</div>
        <div class="kpi-meta">New: ${m.submissionsAndCorrections.submissions} · Edits: ${m.submissionsAndCorrections.corrections}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">8. Empty Searches</div>
        <div class="kpi-value">${emptyTotal}</div>
        <div class="kpi-meta">Denver: ${m.emptySearches.denverCount} gaps logged</div>
      </div>
    </div>

    <!-- Verified Denver Comedy Pilot Calendar Table -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Verified Denver Comedy Pilot Calendar (${denverShows.length} Living Shows)</h2>
        <span class="badge badge-green">Dynamic 48h Window</span>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Show Title</th>
              <th>Venue &amp; Neighborhood</th>
              <th>Date / Time</th>
              <th>Type / Age</th>
              <th>Comedians</th>
              <th>Official Source &amp; Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${denverShows.map(s => {
              const startFormatted = new Date(s.start_time).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
              const comediansStr = s.comedy?.comedians?.join(', ') || 'Showcase Lineup';
              return `
              <tr>
                <td><strong>${esc(s.title)}</strong></td>
                <td>
                  <div><a href="/venue/${esc(s.venueSlug)}" style="color:var(--primary);text-decoration:none;">${esc(s.venue_name)}</a></div>
                  <div style="font-size:11.5px;color:var(--text-dim);">${esc(s.neighborhood || 'Denver')}</div>
                </td>
                <td>
                  <div>${esc(startFormatted)}</div>
                  <div style="font-size:11px;color:var(--text-dim);">${esc(s.comedy?.recurrenceText || 'Scheduled')}</div>
                </td>
                <td>
                  <span class="badge badge-orange">${esc(s.comedy?.showType || 'standup')}</span>
                  <span class="badge badge-blue">${esc(s.comedy?.ageLimit || '21+')}</span>
                </td>
                <td>${esc(comediansStr)}</td>
                <td>
                  <div><a href="${esc(s.official_source_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:none;font-size:12px;">Official Box Office ↗</a></div>
                  <div style="font-size:10.5px;color:var(--verified-green);">✓ Verified ${esc(new Date(s.lastVerifiedAt).toLocaleDateString())}</div>
                </td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <a href="/event/${esc(s.id)}" class="btn btn-secondary" style="padding:4px 8px;font-size:11px;">Radar</a>
                    <a href="/card/${esc(s.id)}" target="_blank" class="btn btn-secondary" style="padding:4px 8px;font-size:11px;">Card</a>
                    <a href="/card/${esc(s.id)}/story" target="_blank" class="btn btn-secondary" style="padding:4px 8px;font-size:11px;">Story</a>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Verified Denver Rooms & Outreach Packets -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Denver Pilot Rooms &amp; Claim Packets (${outreachPackets.length} Reviewable Drafts)</h2>
        <span class="badge badge-orange">Drafts Only · No Auto-Send</span>
      </div>
      <p style="color:var(--text-dim);font-size:13.5px;margin-top:0;">
        Personalized outreach copy prepared for Denver club operators and open-mic hosts. Operators can claim their page, confirm their box office link, and receive live demand metrics at zero cost.
      </p>

      ${outreachPackets.map(p => `
        <div class="accordion-item">
          <div class="accordion-summary">
            <div>
              <strong style="font-size:15px;color:#fff;">${esc(p.venueName)}</strong>
              <span style="font-size:12px;color:var(--text-dim);margin-left:8px;">📍 ${esc(p.neighborhood)}</span>
              <div style="font-size:12px;color:var(--primary);margin-top:2px;">Contact: ${esc(p.targetContactRole)} (${esc(p.contactEmailSuggestion)})</div>
            </div>
            <div style="display:flex;gap:8px;">
              <a href="/venue/${esc(p.venueSlug)}" target="_blank" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;">Live Page ↗</a>
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

    <div style="text-align:center;color:var(--text-dim);font-size:12.5px;margin-top:40px;">
      Brinkberry Live Radar · Denver Comedy Pilot Engine · Telemetry &amp; Outreach Console
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
    const summary = getPilotMetricsSummary('denver');
    const denverVenues = getVenuesByCity('Denver');
    const allShows = getDynamicSeedShows();
    const denverShows = allShows.filter(s => s.city?.toLowerCase().includes('denver'));
    const outreachPackets = getDenverPilotPackets();

    // GET /api/comedy/pilot-metrics
    if (u.pathname === '/api/comedy/pilot-metrics' || u.searchParams.get('format') === 'json') {
      return res.status(200).json({
        success: true,
        summary,
        inventory: {
          denverVenuesCount: denverVenues.length,
          denverShowsCount: denverShows.length,
          outreachPacketsCount: outreachPackets.length
        },
        denverVenues: denverVenues.map(v => ({
          slug: v.slug,
          name: v.name,
          city: v.city,
          officialBoxOfficeConfirmed: v.officialBoxOfficeConfirmed,
          website: v.website
        })),
        outreachPackets: outreachPackets.map(p => ({
          venueSlug: p.venueSlug,
          venueName: p.venueName,
          claimUrl: p.claimUrl,
          contactEmailSuggestion: p.contactEmailSuggestion
        }))
      });
    }

    // GET /admin/pilot
    return res.status(200).send(renderPilotDashboardHtml(summary, denverVenues, denverShows, outreachPackets));
  } catch (err) {
    console.error('Pilot dashboard error:', err);
    return res.status(500).send('Pilot dashboard error');
  }
};
