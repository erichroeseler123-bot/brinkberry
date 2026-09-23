/**
 * Shareable Social Show Cards & Visual Previews
 *
 * Generates high-contrast, beautiful visual cards for Instagram Stories,
 * Twitter/X/Bluesky link previews, and mobile sharing.
 */

const { getComedyShowById } = require('../lib/comedy/registry');
const { buildSafeAffiliateUrl } = require('../lib/affiliate');
const { trackSocialCardVisit } = require('../lib/telemetry');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
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

async function resolveEvent(id) {
  if (!id) return null;

  // 1. Check in-memory / indie registry
  const comedyShow = getComedyShowById(id);
  if (comedyShow) {
    return {
      id: comedyShow.id,
      title: comedyShow.title,
      venue: comedyShow.venue_name || comedyShow.venue,
      city: comedyShow.city,
      start: comedyShow.start_time || comedyShow.start,
      price: comedyShow.price_display || comedyShow.price || 'Details on site',
      showType: comedyShow.comedy?.showType || 'Stand-Up',
      ageLimit: comedyShow.comedy?.ageLimit || '21+',
      comedians: comedyShow.comedy?.comedians || [],
      ticketUrl: comedyShow.canonical_url || comedyShow.ticketUrl || `${ORIGIN}/event/${comedyShow.id}`
    };
  }

  // 2. Query Supabase canonical_events for UUID
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/canonical_events?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: {
        apikey: KEY,
        authorization: `Bearer ${KEY}`
      }
    });
    if (res.ok) {
      const list = await res.json();
      if (list && list.length > 0) {
        const row = list[0];
        return {
          id: row.id,
          title: row.title,
          venue: row.venue_name || 'Live Venue',
          city: row.city || 'Nearby',
          start: row.start_time,
          price: row.price_display || 'Details on site',
          showType: row.category || 'Live Event',
          ageLimit: row.age_limit || '',
          comedians: row.performers || [],
          ticketUrl: buildSafeAffiliateUrl(row.source, row.canonical_url, row.id)
        };
      }
    }
  } catch (_) {}

  return null;
}

function generateSvgCard(event) {
  const startFmt = new Date(event.start).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const lineupStr = event.comedians && event.comedians.length
    ? event.comedians.join(', ')
    : event.showType || 'Live Stand-Up';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="bgGlow" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#ff2e63" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#ffb86b" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#080612" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#191228"/>
      <stop offset="100%" stop-color="#0e0a1a"/>
    </linearGradient>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff2e63"/>
      <stop offset="100%" stop-color="#ffb86b"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#080612"/>
  <rect width="1200" height="630" fill="url(#bgGlow)"/>

  <!-- Card Border & Container -->
  <rect x="50" y="40" width="1100" height="550" rx="28" fill="url(#cardGrad)" stroke="#322448" stroke-width="2"/>

  <!-- Top Brand Row -->
  <g transform="translate(90, 80)">
    <circle cx="12" cy="12" r="8" fill="#ff2e63"/>
    <text x="32" y="19" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="900" fill="#ffffff">Brinkberry</text>
    <rect x="180" y="0" width="160" height="28" rx="14" fill="#221832" stroke="#483664"/>
    <text x="195" y="19" font-family="-apple-system, system-ui, sans-serif" font-size="12.5" font-weight="800" fill="#00d26a">⚡ LIVE RADAR</text>
    <text x="820" y="19" font-family="-apple-system, system-ui, sans-serif" font-size="14" font-weight="700" fill="#ffb86b">${esc(event.city)}</text>
  </g>

  <!-- Show Title (wrapped or sized) -->
  <text x="90" y="210" font-family="-apple-system, system-ui, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-0.02em">
    ${esc(event.title.length > 36 ? event.title.substring(0, 36) + '…' : event.title)}
  </text>

  <!-- Lineup / Host -->
  <text x="90" y="265" font-family="-apple-system, system-ui, sans-serif" font-size="24" font-weight="700" fill="#ffb86b">
    🎤 ${esc(lineupStr.length > 50 ? lineupStr.substring(0, 50) + '…' : lineupStr)}
  </text>

  <!-- Venue & Time Info Card -->
  <g transform="translate(90, 310)">
    <rect width="1020" height="130" rx="18" fill="#130d22" stroke="#2c1e40"/>
    <text x="30" y="50" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="800" fill="#ffffff">📍 ${esc(event.venue)}</text>
    <text x="30" y="95" font-family="-apple-system, system-ui, sans-serif" font-size="20" font-weight="700" fill="#cbbfe2">⏰ ${esc(startFmt)}</text>

    <rect x="800" y="35" width="180" height="60" rx="30" fill="url(#badgeGrad)"/>
    <text x="890" y="72" font-family="-apple-system, system-ui, sans-serif" font-size="18" font-weight="900" fill="#120508" text-anchor="middle">Official Tickets</text>
  </g>

  <!-- Footer Tags & Promise -->
  <g transform="translate(90, 490)">
    <rect x="0" y="0" width="110" height="32" rx="16" fill="#251a3a"/>
    <text x="55" y="21" font-family="-apple-system, system-ui, sans-serif" font-size="13" font-weight="750" fill="#ffb86b" text-anchor="middle">${esc(event.showType)}</text>

    ${event.ageLimit ? `
      <rect x="120" y="0" width="80" height="32" rx="16" fill="#251a3a"/>
      <text x="160" y="21" font-family="-apple-system, system-ui, sans-serif" font-size="13" font-weight="750" fill="#ff2e63" text-anchor="middle">${esc(event.ageLimit)}</text>
    ` : ''}

    <text x="1020" y="22" font-family="-apple-system, system-ui, sans-serif" font-size="14" font-weight="600" fill="#9b90ad" text-anchor="end">
      brinkberry.com/event/${esc(event.id.substring(0, 14))}
    </text>
  </g>
</svg>`;
}

function generateVerticalSvgCard(event) {
  const startFmt = new Date(event.start).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const lineupStr = event.comedians && event.comedians.length
    ? event.comedians.join(', ')
    : event.showType || 'Live Stand-Up';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <radialGradient id="vertGlow" cx="50%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#ff2e63" stop-opacity="0.38"/>
      <stop offset="45%" stop-color="#ffb86b" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#080612" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="vertCard" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181128"/>
      <stop offset="100%" stop-color="#0c0817"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff2e63"/>
      <stop offset="100%" stop-color="#ffb86b"/>
    </linearGradient>
  </defs>

  <!-- Background Canvas -->
  <rect width="1080" height="1920" fill="#080612"/>
  <rect width="1080" height="1920" fill="url(#vertGlow)"/>

  <!-- Outer Frame -->
  <rect x="50" y="60" width="980" height="1800" rx="36" fill="url(#vertCard)" stroke="#322248" stroke-width="3"/>

  <!-- Top Branding -->
  <g transform="translate(100, 140)">
    <circle cx="20" cy="20" r="14" fill="#ff2e63"/>
    <text x="50" y="32" font-family="-apple-system, system-ui, sans-serif" font-size="36" font-weight="900" fill="#ffffff">Brinkberry</text>
    <rect x="270" y="4" width="220" height="40" rx="20" fill="#241738" stroke="#4a3668"/>
    <text x="295" y="30" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="800" fill="#00d26a">⚡ LIVE RADAR</text>
    <text x="880" y="32" font-family="-apple-system, system-ui, sans-serif" font-size="24" font-weight="800" fill="#ffb86b" text-anchor="end">${esc(event.city)}</text>
  </g>

  <!-- Title & Lineup Section -->
  <g transform="translate(100, 320)">
    <rect x="0" y="0" width="160" height="38" rx="19" fill="#25173a"/>
    <text x="80" y="25" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="800" fill="#ffb86b" text-anchor="middle">${esc(event.showType).toUpperCase()}</text>

    <text x="0" y="110" font-family="-apple-system, system-ui, sans-serif" font-size="60" font-weight="900" fill="#ffffff" letter-spacing="-0.02em">
      ${esc(event.title.length > 38 ? event.title.substring(0, 38) + '…' : event.title)}
    </text>

    <text x="0" y="190" font-family="-apple-system, system-ui, sans-serif" font-size="34" font-weight="750" fill="#ffb86b">
      🎤 ${esc(lineupStr.length > 45 ? lineupStr.substring(0, 45) + '…' : lineupStr)}
    </text>
  </g>

  <!-- Main Info Card (Venue & Time) -->
  <g transform="translate(100, 680)">
    <rect width="880" height="480" rx="30" fill="#120c20" stroke="#2c1d42" stroke-width="2"/>

    <text x="50" y="90" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="750" fill="#9b8eaf" text-transform="uppercase" letter-spacing="0.08em">VENUE &amp; LOCATION</text>
    <text x="50" y="150" font-family="-apple-system, system-ui, sans-serif" font-size="42" font-weight="900" fill="#ffffff">📍 ${esc(event.venue)}</text>
    <text x="50" y="200" font-family="-apple-system, system-ui, sans-serif" font-size="26" font-weight="600" fill="#b9accc">${esc(event.city)}</text>

    <line x1="50" y1="245" x2="830" y2="245" stroke="#251938" stroke-width="2"/>

    <text x="50" y="315" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="750" fill="#9b8eaf" text-transform="uppercase" letter-spacing="0.08em">DATE &amp; SHOWTIME</text>
    <text x="50" y="375" font-family="-apple-system, system-ui, sans-serif" font-size="38" font-weight="900" fill="#ffb86b">⏰ ${esc(startFmt)}</text>

    <rect x="50" y="415" width="140" height="36" rx="18" fill="#25193a"/>
    <text x="120" y="440" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle">${esc(event.price || 'Check event')}</text>

    ${event.ageLimit ? `
      <rect x="205" y="415" width="100" height="36" rx="18" fill="#25193a"/>
      <text x="255" y="440" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="800" fill="#ff2e63" text-anchor="middle">${esc(event.ageLimit)}</text>
    ` : ''}
  </g>

  <!-- Big Social / Story Call To Action -->
  <g transform="translate(100, 1260)">
    <rect width="880" height="180" rx="30" fill="url(#accentGrad)"/>
    <text x="440" y="85" font-family="-apple-system, system-ui, sans-serif" font-size="36" font-weight="900" fill="#120508" text-anchor="middle">
      🎟️ GET OFFICIAL TICKETS
    </text>
    <text x="440" y="130" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="800" fill="#201000" text-anchor="middle">
      Swipe Up / Tap Link in Bio
    </text>
  </g>

  <!-- Footer Brand Assurance -->
  <g transform="translate(100, 1540)">
    <rect width="880" height="180" rx="24" fill="#110a1c" stroke="#251838"/>
    <text x="50" y="65" font-family="-apple-system, system-ui, sans-serif" font-size="20" font-weight="850" fill="#00d26a">✓ 100% FREE DISCOVERY &amp; DIRECT BOX OFFICE</text>
    <text x="50" y="105" font-family="-apple-system, system-ui, sans-serif" font-size="18" font-weight="500" fill="#9b8eaf">
      Brinkberry never marks up ticket prices or charges surprise consumer fees.
    </text>
    <text x="50" y="145" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="700" fill="#ffb86b">
      brinkberry.com/event/${esc(event.id.substring(0, 14))}
    </text>
  </g>
</svg>`;
}

function renderHtmlCard(event) {
  const startFmt = new Date(event.start).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const cardUrl = `${ORIGIN}/card/${event.id}`;
  const eventUrl = `${ORIGIN}/event/${event.id}`;
  const svgUrl = `${ORIGIN}/card/${event.id}/svg`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(event.title)} — Shareable Show Card | Brinkberry</title>
  <meta name="description" content="${esc(event.title)} at ${esc(event.venue)} in ${esc(event.city)}. Verified tickets & show card.">
  
  <meta property="og:title" content="${esc(event.title)} · ${esc(event.venue)}">
  <meta property="og:description" content="Catch it live ${esc(startFmt)}. Official tickets & details on Brinkberry.">
  <meta property="og:image" content="${esc(svgUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${esc(svgUrl)}">

  <style>
    :root {
      --bg: #07050e;
      --card-bg: #140d24;
      --card-border: #2e2046;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --text: #f6f0fd;
      --text-dim: #a195b5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 24px 16px 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 580px;
      width: 100%;
    }
    .nav-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .nav-row a {
      color: var(--primary);
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
    }
    .poster-card {
      background: linear-gradient(135deg, #1b122e 0%, #0d0918 100%);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 32px 28px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.5);
      position: relative;
      overflow: hidden;
    }
    .poster-card::before {
      content: '';
      position: absolute;
      top: -40px;
      right: -40px;
      width: 160px;
      height: 160px;
      background: radial-gradient(circle, rgba(255, 46, 99, 0.25), transparent 70%);
      pointer-events: none;
    }
    .badge-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .radar-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      font-weight: 800;
      color: #00d26a;
      background: rgba(0, 210, 106, 0.12);
      border: 1px solid rgba(0, 210, 106, 0.3);
      padding: 3px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .city-tag {
      font-size: 13px;
      font-weight: 750;
      color: var(--primary);
    }
    h1.title {
      font-size: 26px;
      font-weight: 900;
      line-height: 1.2;
      margin: 0 0 10px;
      color: #fff;
    }
    .lineup {
      font-size: 15px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 20px;
    }
    .venue-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .venue-name {
      font-size: 16px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 4px;
    }
    .time-slot {
      font-size: 14.5px;
      color: #dfd5f0;
      font-weight: 600;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-ticket {
      display: block;
      text-align: center;
      background: var(--primary);
      color: var(--primary-dark);
      padding: 14px;
      border-radius: 999px;
      font-size: 15px;
      font-weight: 850;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn-ticket:hover { background: #ffa84d; }
    .btn-share {
      display: block;
      text-align: center;
      background: #231936;
      border: 1px solid #453464;
      color: #fff;
      padding: 12px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-share:hover { background: #2f224a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav-row">
      <a href="/event/${esc(event.id)}">← Back to Radar Event</a>
      <a href="${esc(svgUrl)}" target="_blank">View SVG Poster Card ↗</a>
    </div>

    <div class="poster-card">
      <div class="badge-bar">
        <span class="radar-tag">● Live Radar</span>
        <span class="city-tag">${esc(event.city)}</span>
      </div>

      <h1 class="title">${esc(event.title)}</h1>
      ${event.comedians && event.comedians.length ? `<div class="lineup">🎤 Lineup: ${esc(event.comedians.join(', '))}</div>` : ''}

      <div class="venue-box">
        <div class="venue-name">📍 ${esc(event.venue)}</div>
        <div class="time-slot">⏰ ${esc(startFmt)}</div>
      </div>

      <div class="actions">
        <a href="${esc(event.ticketUrl)}" target="_blank" rel="noopener noreferrer" class="btn-ticket">Get Official Tickets →</a>
        <button id="shareBtn" class="btn-share">🔗 Copy Link to Share</button>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
          <a href="/card/${esc(event.id)}/svg" target="_blank" class="btn-share" style="flex:1; text-align:center; text-decoration:none;">
            🖼️ Twitter / OG Card (1200×630)
          </a>
          <a href="/card/${esc(event.id)}/story" target="_blank" class="btn-share" style="flex:1; text-align:center; text-decoration:none; background:#ff2e63; border-color:#ff4777; color:#fff;">
            📸 Instagram Story (1080×1920)
          </a>
        </div>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('shareBtn').onclick = async () => {
      const url = window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({
            title: ${JSON.stringify(event.title)},
            text: ${JSON.stringify(event.title + ' at ' + event.venue + ' · ' + startFmt)},
            url
          });
          return;
        } catch (_) {}
      }
      await navigator.clipboard.writeText(url);
      alert('Show card link copied to clipboard!');
    };
  </script>
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

    // Pattern: /card/:id, /card/:id/svg, /card/:id/story, /card/:id/vertical.svg
    const match = p.match(/^\/(?:api\/)?card\/([0-9a-zA-Z_-]+)(?:\/(?:svg|story|vertical)|\.(?:svg))?$/i);
    const id = match ? match[1] : (u.searchParams.get('id') || req.query?.id);

    if (!id) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body><h1>Card Not Found</h1></body></html>');
    }

    const event = await resolveEvent(id);
    if (!event) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body><h1>Event Not Found</h1></body></html>');
    }

    const isStory = p.endsWith('/story') || p.endsWith('/story.svg') || p.endsWith('/vertical.svg') || p.endsWith('/vertical') || u.searchParams.get('format') === 'story' || u.searchParams.get('format') === 'vertical' || u.searchParams.get('size') === '1080x1920';
    const isSvg = p.endsWith('/svg') || p.endsWith('.svg') || u.searchParams.get('format') === 'svg' || isStory;
    const format = isStory ? 'story' : (isSvg ? 'svg' : 'html');
    trackSocialCardVisit(id, format);

    if (isStory) {
      res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
      res.setHeader('cache-control', 'public, max-age=3600, s-maxage=7200');
      return res.status(200).send(generateVerticalSvgCard(event));
    }

    if (isSvg) {
      res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
      res.setHeader('cache-control', 'public, max-age=3600, s-maxage=7200');
      return res.status(200).send(generateSvgCard(event));
    }

    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(200).send(renderHtmlCard(event));
  } catch (err) {
    console.error('Card handler error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send('<!doctype html><html><body><h1>Card temporarily unavailable</h1></body></html>');
  }
};
