/**
 * Shareable Race Night Social Cards & Visual Previews
 *
 * Generates high-impact visual cards for Instagram Stories (1080x1920),
 * Open Graph preview cards (1200x630), and mobile sharing for race events.
 */

const { getAllScheduledRaces, getTrackBySlug } = require('../lib/racing/registry');
const { trackRacingCardVisit } = require('../lib/telemetry');
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

function resolveRace(id) {
  if (!id) return null;
  const races = getAllScheduledRaces();
  return races.find(r => r.id === id) || null;
}

function generateSvgCard(race) {
  const dateStr = race.start_time ? new Date(race.start_time).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).toUpperCase() : (race.gateTime ? `DOORS ${race.gateTime}` : 'SEASON SCHEDULE');

  const classesStr = (race.classes || []).slice(0, 4).join(' · ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0712"/>
      <stop offset="50%" stop-color="#180e22"/>
      <stop offset="100%" stop-color="#07040d"/>
    </linearGradient>
    <linearGradient id="flag" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00d26a"/>
      <stop offset="100%" stop-color="#00a854"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Border Frame -->
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="#2c1f42" stroke-width="2"/>
  
  <!-- Checkered Flag Accent -->
  <path d="M 24 24 L 200 24 L 160 64 L 24 64 Z" fill="url(#flag)" opacity="0.8"/>
  <text x="44" y="50" fill="#000" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="14" letter-spacing="1">🏁 RACE NIGHT RADAR</text>

  <!-- Surface & Sanction Badges -->
  <g transform="translate(60, 110)">
    <rect x="0" y="0" width="140" height="34" rx="8" fill="#ffb86b" fill-opacity="0.15" stroke="#ffb86b" stroke-width="1.5"/>
    <text x="70" y="22" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="800" font-size="13" text-anchor="middle" letter-spacing="0.5">${esc(race.surfaceDisplay || 'Short Track')}</text>

    <rect x="152" y="0" width="220" height="34" rx="8" fill="#58a6ff" fill-opacity="0.15" stroke="#58a6ff" stroke-width="1.5"/>
    <text x="262" y="22" fill="#58a6ff" font-family="-apple-system, system-ui, sans-serif" font-weight="800" font-size="13" text-anchor="middle" letter-spacing="0.5">${esc(race.sanction || 'Weekly Series')}</text>
  </g>

  <!-- Race Title -->
  <text x="60" y="210" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="44" filter="url(#shadow)">
    ${esc(race.title.slice(0, 48))}
  </text>

  <!-- Track & City -->
  <text x="60" y="280" fill="#f5effc" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="28">
    📍 ${esc(race.trackName)} · <tspan fill="#9c90af">${esc(race.city)}</tspan>
  </text>

  <!-- Running Classes -->
  <text x="60" y="340" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="20">
    🏎️ Divisions: ${esc(classesStr)}
  </text>

  <!-- Timeline Grid -->
  <g transform="translate(60, 390)">
    <rect x="0" y="0" width="1080" height="110" rx="16" fill="#130b20" stroke="#2a1d3d" stroke-width="1"/>
    
    <text x="40" y="40" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="13" text-transform="uppercase">GATES OPEN</text>
    <text x="40" y="80" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.gateTime)}</text>

    <text x="260" y="40" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="13" text-transform="uppercase">HOT LAPS</text>
    <text x="260" y="80" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.hotLapsTime)}</text>

    <text x="480" y="40" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="13" text-transform="uppercase">GREEN FLAG</text>
    <text x="480" y="80" fill="#00d26a" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.greenFlagTime)}</text>

    <text x="720" y="40" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="13" text-transform="uppercase">ADMISSION</text>
    <text x="720" y="80" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.generalAdmissionPrice)}</text>
  </g>

  <!-- Footer Brand -->
  <g transform="translate(60, 560)">
    <text x="0" y="0" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-size="15" font-weight="600">
      ⚡ Live Radar &amp; Weather on <tspan fill="#ffb86b" font-weight="800">Brinkberry Racing</tspan> · brinkberry.com/racing
    </text>
    <text x="1080" y="0" text-anchor="end" fill="#00d26a" font-family="-apple-system, system-ui, sans-serif" font-size="15" font-weight="700">
      ✓ Official Track Schedule
    </text>
  </g>
</svg>`;
}

function generateVerticalSvgCard(race) {
  const classesList = (race.classes || []).slice(0, 5);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <linearGradient id="vbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090610"/>
      <stop offset="40%" stop-color="#160c20"/>
      <stop offset="80%" stop-color="#231230"/>
      <stop offset="100%" stop-color="#08040d"/>
    </linearGradient>
    <filter id="vshadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="24" flood-color="#000" flood-opacity="0.8"/>
    </filter>
  </defs>

  <rect width="1080" height="1920" fill="url(#vbg)"/>

  <!-- Decorative Outer Frame -->
  <rect x="40" y="40" width="1000" height="1840" rx="36" fill="none" stroke="#2d1c44" stroke-width="3"/>

  <!-- Top Badge Header -->
  <g transform="translate(80, 120)">
    <rect x="0" y="0" width="260" height="54" rx="27" fill="#00d26a" fill-opacity="0.15" stroke="#00d26a" stroke-width="2"/>
    <text x="130" y="34" fill="#00d26a" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="19" text-anchor="middle" letter-spacing="1">🏁 RACE DAY RADAR</text>
  </g>

  <!-- Track Surface & Sanction Badges -->
  <g transform="translate(80, 210)">
    <rect x="0" y="0" width="180" height="46" rx="10" fill="#ffb86b" fill-opacity="0.2" stroke="#ffb86b" stroke-width="1.5"/>
    <text x="90" y="29" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="800" font-size="18" text-anchor="middle">${esc(race.surfaceDisplay || 'Short Track')}</text>

    <rect x="196" y="0" width="280" height="46" rx="10" fill="#58a6ff" fill-opacity="0.2" stroke="#58a6ff" stroke-width="1.5"/>
    <text x="336" y="29" fill="#58a6ff" font-family="-apple-system, system-ui, sans-serif" font-weight="800" font-size="18" text-anchor="middle">${esc(race.sanction || 'Weekly Series')}</text>
  </g>

  <!-- Race Title -->
  <text x="80" y="370" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="64" filter="url(#vshadow)">
    ${esc(race.title.slice(0, 32))}
  </text>
  ${race.title.length > 32 ? `<text x="80" y="445" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="54">${esc(race.title.slice(32, 68))}</text>` : ''}

  <!-- Venue & City Box -->
  <g transform="translate(80, 530)">
    <rect x="0" y="0" width="920" height="150" rx="24" fill="#130b20" stroke="#2c1d42" stroke-width="2"/>
    <text x="40" y="60" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="36">
      📍 ${esc(race.trackName)}
    </text>
    <text x="40" y="110" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="24">
      ${esc(race.city)}
    </text>
  </g>

  <!-- Running Divisions List -->
  <g transform="translate(80, 740)">
    <text x="0" y="0" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="28" letter-spacing="1">DIVISIONS RACING TONIGHT:</text>
    ${classesList.map((cls, idx) => `
      <g transform="translate(0, ${45 + idx * 60})">
        <rect x="0" y="0" width="920" height="48" rx="12" fill="#180e28" stroke="#2c1a40" stroke-width="1"/>
        <text x="24" y="32" fill="#f5effc" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="22">🏎️ ${esc(cls)}</text>
      </g>
    `).join('')}
  </g>

  <!-- Race Day Schedule Box -->
  <g transform="translate(80, 1160)">
    <rect x="0" y="0" width="920" height="340" rx="24" fill="#140b22" stroke="#ffb86b" stroke-width="2"/>
    
    <text x="40" y="50" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="22" letter-spacing="1">EVENT TIMELINE &amp; ADMISSION</text>

    <!-- Gates -->
    <text x="40" y="110" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="20">Grandstand Gates</text>
    <text x="880" y="110" text-anchor="end" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.gateTime)}</text>

    <!-- Hot Laps -->
    <text x="40" y="165" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="20">Practice / Hot Laps</text>
    <text x="880" y="165" text-anchor="end" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.hotLapsTime)}</text>

    <!-- Green Flag -->
    <text x="40" y="225" fill="#00d26a" font-family="-apple-system, system-ui, sans-serif" font-weight="800" font-size="24">🟢 GREEN FLAG RACING</text>
    <text x="880" y="225" text-anchor="end" fill="#00d26a" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="28">${esc(race.greenFlagTime)}</text>

    <!-- Price -->
    <line x1="40" y1="260" x2="880" y2="260" stroke="#2d1d42" stroke-width="1.5"/>
    <text x="40" y="305" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="20">General Admission</text>
    <text x="880" y="305" text-anchor="end" fill="#ffb86b" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="24">${esc(race.generalAdmissionPrice)} (${esc(race.kidsPolicy)})</text>
  </g>

  <!-- Weather Radar Cue -->
  <g transform="translate(80, 1560)">
    <rect x="0" y="0" width="920" height="110" rx="20" fill="#0e1b24" stroke="#1f4b5e" stroke-width="1.5"/>
    <text x="40" y="45" fill="#58a6ff" font-family="-apple-system, system-ui, sans-serif" font-weight="850" font-size="22">🌤️ LIVE TRACK WEATHER RADAR</text>
    <text x="40" y="85" fill="#c3e8f8" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="18">Clear skies · Low precipitation chance at green flag · Track status: GREEN</text>
  </g>

  <!-- Footer Branding CTA -->
  <g transform="translate(80, 1750)">
    <text x="460" y="40" text-anchor="middle" fill="#ffffff" font-family="-apple-system, system-ui, sans-serif" font-weight="900" font-size="32">
      BRINKBERRY RACING RADAR
    </text>
    <text x="460" y="80" text-anchor="middle" fill="#9c90af" font-family="-apple-system, system-ui, sans-serif" font-weight="600" font-size="20">
      Free, real-time motorsports discovery · brinkberry.com/racing
    </text>
  </g>
</svg>`;
}

function renderHtmlCard(race) {
  const ogSvgUrl = `/card/race/${race.id}/svg`;
  const storySvgUrl = `/card/race/${race.id}/story`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(race.title)} — Race Night Card | Brinkberry</title>
  <meta property="og:title" content="${esc(race.title)} at ${esc(race.trackName)}">
  <meta property="og:description" content="Green Flag at ${esc(race.greenFlagTime)} · ${esc(race.surfaceDisplay)} · ${esc(race.generalAdmissionPrice)}">
  <meta property="og:image" content="${ORIGIN}${ogSvgUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${ORIGIN}${ogSvgUrl}">
  <style>
    :root {
      --bg: #080510;
      --card-bg: #120c1e;
      --border: #281a3b;
      --text: #f5effc;
      --text-dim: #9c90af;
      --primary: #ffb86b;
      --green: #00d26a;
      --blue: #58a6ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, system-ui, sans-serif;
      padding: 24px 16px 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .wrap {
      max-width: 640px;
      width: 100%;
    }
    .preview-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .preview-img {
      width: 100%;
      height: auto;
      display: block;
      border-bottom: 1px solid var(--border);
    }
    .card-body {
      padding: 24px;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 10px;
    }
    .meta-line {
      color: var(--text-dim);
      font-size: 14px;
      margin-bottom: 6px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
    }
    .btn-primary { background: var(--primary); color: #201000; }
    .btn-story { background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); color: #fff; }
    .btn-secondary { background: #1c132c; color: var(--text); border: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="wrap">
    <div style="margin-bottom:16px;">
      <a href="/track/${esc(race.trackSlug)}" style="color:var(--primary);text-decoration:none;font-weight:700;font-size:13.5px;">← Back to ${esc(race.trackName)}</a>
    </div>

    <div class="preview-card">
      <img class="preview-img" src="${ogSvgUrl}" alt="${esc(race.title)} Social Card Preview">
      <div class="card-body">
        <span style="display:inline-block;padding:3px 8px;border-radius:6px;background:rgba(0,210,106,0.15);color:var(--green);font-size:12px;font-weight:700;margin-bottom:8px;">🟢 Green Flag ${esc(race.greenFlagTime)}</span>
        <h1>${esc(race.title)}</h1>
        <div class="meta-line">📍 <strong>${esc(race.trackName)}</strong> (${esc(race.city)})</div>
        <div class="meta-line">🏎️ Divisions: <strong>${esc((race.classes || []).join(', '))}</strong></div>
        <div class="meta-line">🎟️ Tickets: <strong>${esc(race.generalAdmissionPrice)}</strong> · ${esc(race.kidsPolicy)}</div>

        <div class="actions">
          <a href="${storySvgUrl}" target="_blank" class="btn btn-story">📲 Download 1080×1920 Story Card</a>
          <a href="${ogSvgUrl}" target="_blank" class="btn btn-secondary">🖼️ Open Graph 1200×630 SVG</a>
          <a href="${esc(race.ticket_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Official Box Office ↗</a>
        </div>
      </div>
    </div>
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
    const p = u.pathname;

    // Pattern: /card/race/:id, /card/race/:id/svg, /card/race/:id/story
    const match = p.match(/^\/(?:api\/)?card\/race\/([0-9a-zA-Z_-]+)(?:\/(?:svg|story|vertical)|\.(?:svg))?$/i);
    const id = match ? match[1] : (u.searchParams.get('id') || req.query?.id);

    if (!id) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body><h1>Race Card Not Found</h1></body></html>');
    }

    const race = resolveRace(id);
    if (!race) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body><h1>Race Event Not Found</h1></body></html>');
    }

    const isStory = p.endsWith('/story') || p.endsWith('/story.svg') || p.endsWith('/vertical.svg') || p.endsWith('/vertical') || u.searchParams.get('format') === 'story' || u.searchParams.get('format') === 'vertical' || u.searchParams.get('size') === '1080x1920';
    const isSvg = p.endsWith('/svg') || p.endsWith('.svg') || u.searchParams.get('format') === 'svg' || isStory;
    const format = isStory ? 'story' : (isSvg ? 'svg' : 'html');

    trackRacingCardVisit(id, format);

    if (isStory) {
      res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
      res.setHeader('cache-control', 'public, max-age=3600, s-maxage=7200');
      return res.status(200).send(generateVerticalSvgCard(race));
    }

    if (isSvg) {
      res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
      res.setHeader('cache-control', 'public, max-age=3600, s-maxage=7200');
      return res.status(200).send(generateSvgCard(race));
    }

    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(200).send(renderHtmlCard(race));
  } catch (err) {
    console.error('Race card handler error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send('Card temporarily unavailable');
  }
};
