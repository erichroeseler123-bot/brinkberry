/**
 * Race Track & Touring Series Canonical Entity Pages
 *
 * Serves rich profiles for verified race tracks and touring series:
 * - Surface type, banking, length, sanctioning bodies
 * - Upcoming races in the rolling 48-hour window with timeline breakdown
 * - Live Open-Meteo weather radar cue (Green flag status / rainout watch)
 * - Direct box office link & 100% Free claim banner
 * - Touring series profile with "Bring This Series to My Home Track" console
 */

const { getTrackBySlug, getTouringSeriesBySlug, getAllTracks } = require('../lib/racing/registry');
const { trackTrackView, trackEventView } = require('../lib/telemetry');
const { buildSafeAffiliateUrl } = require('../lib/affiliate');

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

function renderTrackPage(track, selectedWindow = '48h') {
  const normWindow = String(selectedWindow || '48h').toLowerCase().replace(/-/g, '_').trim();
  const windowTitles = {
    '48h': 'Upcoming Races (Next 48 Hours)',
    'this_weekend': 'This Weekend’s Races',
    'next_weekend': 'Next Weekend’s Schedule',
    '30d': 'Next 30 Days Racing Outlook',
    'season': 'Full Season Schedule'
  };
  const activeTitle = windowTitles[normWindow] || 'Upcoming Races';

  const races = track.upcomingRaces || [];
  const racesHtml = races.length > 0
    ? races.map(r => {
        const start = r.start_time ? new Date(r.start_time).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }) : (r.greenFlagTime ? `Green Flag ${r.greenFlagTime}` : 'Master Schedule');
        const safeUrl = buildSafeAffiliateUrl(r.sourceType || 'custom', r.ticket_url, r.id);
        const classesStr = (r.classes || []).join(', ');

        return `
        <article class="race-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <span class="badge badge-green">🟢 Green Flag ${esc(r.greenFlagTime)}</span>
              <span class="badge badge-surface">${esc(r.surfaceDisplay)}</span>
              <span class="badge badge-sanction">${esc(r.sanction)}</span>
            </div>
            <div style="color:var(--text-dim); font-size:13px; font-weight:700;">${esc(start)}</div>
          </div>

          <h3 class="race-title">${esc(r.title)}</h3>
          <div class="race-classes">🏎️ Divisions: <strong>${esc(classesStr)}</strong></div>
          <p class="race-desc">${esc(r.description || '')}</p>

          <div class="timeline-bar">
            <span>Gates: <b>${esc(r.gateTime)}</b></span>
            <span>Hot Laps: <b>${esc(r.hotLapsTime)}</b></span>
            <span>Racing: <b>${esc(r.greenFlagTime)}</b></span>
            <span>Admission: <b>${esc(r.generalAdmissionPrice)}</b></span>
          </div>

          <div class="race-actions">
            <a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Official Box Office / Tickets ↗</a>
            <a href="/card/race/${esc(r.id)}" target="_blank" class="btn btn-secondary">Race Flyer Card</a>
            <a href="/card/race/${esc(r.id)}/story" target="_blank" class="btn btn-secondary">1080×1920 Story</a>
          </div>
        </article>`;
      }).join('')
    : `<div class="empty-state">
        <p>No races scheduled for ${esc(activeTitle.toLowerCase())}.</p>
        ${track.website ? `<p><a href="${esc(track.website)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Visit Official Track Calendar →</a></p>` : ''}
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(track.name)} — Live Racing Schedule &amp; Track Radar | Brinkberry</title>
  <meta name="description" content="${esc(track.tagline || track.description || '')}">
  <link rel="canonical" href="${ORIGIN}/track/${esc(track.slug)}">
  <style>
    :root {
      --bg: #07040d;
      --card-bg: #120b1e;
      --card-border: #26193b;
      --text: #f5effc;
      --text-dim: #9c90af;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --green: #00d26a;
      --blue: #58a6ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 24px 16px 80px;
    }
    .container {
      max-width: 840px;
      margin: 0 auto;
    }
    .top-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
    }
    .top-nav a {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
    }
    .top-nav a:hover { color: #fff; }
    .hero {
      background: linear-gradient(135deg, rgba(34, 18, 51, 0.7) 0%, rgba(18, 11, 28, 0.9) 100%);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 24px;
    }
    .verified-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 210, 106, 0.15);
      border: 1px solid rgba(0, 210, 106, 0.35);
      color: var(--green);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 30px;
      font-weight: 850;
      color: #fff;
    }
    .tagline {
      font-size: 16px;
      color: var(--primary);
      margin-bottom: 14px;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .spec-item {
      font-size: 13px;
      color: var(--text-dim);
    }
    .spec-item b {
      color: #fff;
      display: block;
      font-size: 14.5px;
      margin-top: 2px;
    }
    .claim-banner {
      background: #150d24;
      border: 1px dashed var(--card-border);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .race-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 18px;
    }
    .race-title {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 8px;
    }
    .race-classes {
      font-size: 14px;
      color: var(--primary);
      margin-bottom: 8px;
    }
    .race-desc {
      font-size: 13.5px;
      color: #ded6ec;
      margin-bottom: 14px;
    }
    .timeline-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      background: #0d0717;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 16px;
    }
    .timeline-bar b { color: #fff; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      margin-right: 6px;
    }
    .badge-green { background: rgba(0, 210, 106, 0.15); color: var(--green); }
    .badge-surface { background: rgba(255, 184, 107, 0.15); color: var(--primary); }
    .badge-sanction { background: rgba(88, 166, 255, 0.15); color: var(--blue); }
    .race-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
    }
    .btn-primary { background: var(--primary); color: var(--primary-dark); }
    .window-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 18px 0 20px;
    }
    .tab-btn {
      background: #140c22;
      border: 1px solid var(--card-border);
      color: var(--text-dim);
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .tab-btn:hover {
      background: #25163c;
      color: #fff;
      border-color: #553d75;
    }
    .tab-btn.active {
      background: var(--primary);
      color: var(--primary-dark);
      border-color: var(--primary);
      font-weight: 800;
      box-shadow: 0 0 12px rgba(255, 184, 107, 0.35);
    }
    .btn-secondary { background: #1c122a; color: var(--text); border: 1px solid var(--card-border); }
    .btn:hover { opacity: 0.9; }
    .empty-state {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="top-nav">
      <a href="/denver/racing">← Live Racing Radar</a>
      <a href="/track/${esc(track.slug)}/claim" style="color:var(--primary);">Promoter / Track Claim ↗</a>
    </nav>

    <header class="hero" style="${track.imageUrl ? `background: linear-gradient(180deg, rgba(14, 10, 24, 0.6) 0%, rgba(14, 10, 24, 0.95) 100%), url('${esc(track.imageUrl)}') center/cover no-repeat; border-color: rgba(255, 255, 255, 0.15);` : ''}">
      <div class="verified-pill">✓ Verified Track Venue · Official Box Office Confirmed</div>
      <h1>${esc(track.name)}</h1>
      <div class="tagline">${esc(track.tagline)}</div>
      <p style="color:var(--text-dim); font-size:14px; margin:0;">${esc(track.description)}</p>

      <div class="specs-grid">
        <div class="spec-item">SURFACE<b>${esc(track.surfaceDisplay)}</b></div>
        <div class="spec-item">TRACK LENGTH<b>${esc(track.length)}</b></div>
        <div class="spec-item">BANKING<b>${esc(track.banking || 'Flat')}</b></div>
        <div class="spec-item">LOCATION<b>${esc(track.city)}, ${esc(track.state)}</b></div>
      </div>
    </header>

    <!-- 100% Free Claim Banner -->
    <div class="claim-banner">
      <div>
        <strong style="color:#fff; font-size:14px;">Operate ${esc(track.name)}?</strong>
        <div style="color:var(--text-dim); font-size:12.5px;">Claim official management, confirm box office URLs, and publish weather alerts at zero cost.</div>
      </div>
      <a href="/track/${esc(track.slug)}/claim" class="btn btn-secondary">Claim Track Page</a>
    </div>

    <!-- Planning Windows Navigation -->
    <div class="window-tabs">
      <a href="/track/${esc(track.slug)}?window=48h" class="tab-btn ${normWindow === '48h' ? 'active' : ''}">⚡ 48h Radar</a>
      <a href="/track/${esc(track.slug)}?window=this_weekend" class="tab-btn ${normWindow === 'this_weekend' ? 'active' : ''}">🏁 This Weekend</a>
      <a href="/track/${esc(track.slug)}?window=next_weekend" class="tab-btn ${normWindow === 'next_weekend' ? 'active' : ''}">📅 Next Weekend</a>
      <a href="/track/${esc(track.slug)}?window=30d" class="tab-btn ${normWindow === '30d' ? 'active' : ''}">🗓️ Next 30 Days</a>
      <a href="/track/${esc(track.slug)}?window=season" class="tab-btn ${normWindow === 'season' ? 'active' : ''}">🏆 Full Season</a>
    </div>

    <!-- Upcoming Races Schedule -->
    <section>
      <h2 style="font-size:20px; font-weight:800; color:#fff; margin-bottom:16px;">${esc(activeTitle)}</h2>
      ${racesHtml}
    </section>
  </div>
</body>
</html>`;
}

function renderSeriesPage(series) {
  const allTracks = getAllTracks();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(series.name)} — Tour Radar &amp; Fan Demand | Brinkberry</title>
  <meta name="description" content="${esc(series.description)}">
  <link rel="canonical" href="${ORIGIN}/series/${esc(series.slug)}">
  <style>
    :root {
      --bg: #07040d;
      --card-bg: #120b1e;
      --card-border: #26193b;
      --text: #f5effc;
      --text-dim: #9c90af;
      --primary: #ffb86b;
      --green: #00d26a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, system-ui, sans-serif;
      padding: 24px 16px 80px;
    }
    .container { max-width: 760px; margin: 0 auto; }
    .hero {
      background: linear-gradient(135deg, rgba(34, 18, 51, 0.7) 0%, rgba(18, 11, 28, 0.9) 100%);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 24px;
    }
    h1 { margin: 0 0 10px; font-size: 28px; font-weight: 850; }
    .demand-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
    }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #ded6ec; margin-bottom: 6px; }
    input, select {
      width: 100%;
      background: #180e28;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 14px;
    }
    .btn-submit {
      background: var(--primary);
      color: #201000;
      font-weight: 800;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14.5px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="margin-bottom:16px;">
      <a href="/denver/racing" style="color:var(--primary);text-decoration:none;font-weight:700;">← Live Racing Radar</a>
    </div>

    <div class="hero">
      <span style="display:inline-block;padding:3px 8px;border-radius:6px;background:rgba(88,166,255,0.15);color:#58a6ff;font-size:12px;font-weight:700;margin-bottom:8px;">🏁 National Touring Series</span>
      <h1>${esc(series.name)}</h1>
      <p style="color:var(--text-dim); margin-bottom:12px;">${esc(series.description)}</p>
      <div><a href="${esc(series.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);font-size:13.5px;font-weight:700;">Official Series Website ↗</a></div>
    </div>

    <div class="demand-box">
      <h2 style="font-size:18px; margin-top:0;">Bring ${esc(series.name)} to Your Home Track</h2>
      <p style="color:var(--text-dim); font-size:13.5px; margin-bottom:18px;">
        Signal demand for this touring series to book dates at your local speedway. Demand counts are aggregated and shared with promoters.
      </p>

      <form id="demandForm">
        <div class="field">
          <label>Select Target Race Track</label>
          <select id="trackSelect" required>
            <option value="">-- Choose local track --</option>
            ${allTracks.map(t => `<option value="${esc(t.slug)}">${esc(t.name)} (${esc(t.city)}, ${esc(t.state)})</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Your Email (Optional - notified if date is scheduled)</label>
          <input type="email" id="emailInput" placeholder="fan@example.com">
        </div>

        <div class="field" style="display:flex; align-items:flex-start; gap:8px;">
          <input type="checkbox" id="consentCheck" style="width:auto; margin-top:4px;">
          <label for="consentCheck" style="font-size:12.5px; color:var(--text-dim); line-height:1.4;">
            I consent to Brinkberry retaining my email solely to notify me if ${esc(series.name)} books an event at this track.
          </label>
        </div>

        <button type="submit" class="btn-submit">Signal Fan Demand</button>
        <div id="demandMsg" style="margin-top:12px; font-size:13.5px; font-weight:700;"></div>
      </form>
    </div>

    <script>
      document.getElementById('demandForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const track = document.getElementById('trackSelect').value;
        const email = document.getElementById('emailInput').value;
        const consent = document.getElementById('consentCheck').checked;
        const msg = document.getElementById('demandMsg');

        try {
          const res = await fetch('/api/racing/demand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entitySlug: '${series.slug}', trackSlug: track, email, consent })
          });
          const data = await res.json();
          if (res.ok) {
            msg.style.color = '#00d26a';
            msg.textContent = 'Demand recorded! ' + data.totalDemand + ' fans have requested ' + '${series.name}' + '.';
          } else {
            msg.style.color = '#ff2e63';
            msg.textContent = data.error || 'Failed to record demand.';
          }
        } catch (_) {
          msg.style.color = '#ff2e63';
          msg.textContent = 'Network error. Please try again.';
        }
      });
    </script>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.send) res.send = function(html) {
    if (this.setHeader) this.setHeader('Content-Type', 'text/html; charset=utf-8');
    this.end(html);
    return this;
  };

  try {
    const u = new URL(req.url || '/', 'https://brinkberry.local');
    const parts = u.pathname.split('/').filter(Boolean);
    const type = parts[0]?.toLowerCase(); // 'track' or 'series'
    const slug = parts[1]?.toLowerCase();

    if (!slug) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body><h1>Page Not Found</h1></body></html>');
    }

    if (type === 'track') {
      const windowParam = u.searchParams.get('window') || '48h';
      const track = getTrackBySlug(slug, windowParam);
      if (!track) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body><h1>Track Not Found</h1></body></html>');
      }
      trackTrackView(track.slug);
      trackEventView(track.slug, 'track_page');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderTrackPage(track, windowParam));
    }

    if (type === 'series') {
      const series = getTouringSeriesBySlug(slug);
      if (!series) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body><h1>Series Not Found</h1></body></html>');
      }
      trackEventView(series.slug, 'series_page');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderSeriesPage(series));
    }

    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(404).send('<!doctype html><html><body><h1>Entity Not Found</h1></body></html>');
  } catch (err) {
    console.error('Racing entity error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send('Entity temporarily unavailable');
  }
};
