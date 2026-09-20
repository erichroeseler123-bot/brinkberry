/**
 * Brinkberry Embeddable B2B Partner Widget MVP
 *
 * Dedicated, lightweight, high-performance widget endpoint for tourism partners,
 * tour operators, hotel portals, and destination sites (e.g. Welcome to New Orleans Tours).
 *
 * Pre-pins coordinates to the target city (zero geolocation permissions required).
 * Clamped strictly to the rolling 48-hour window with real source images, direct ticket links,
 * partner attribution, and permissive frame headers for iframe embedding.
 */

const { executeHybridFeed } = require('../lib/providers/engine');

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const KNOWN_CITIES = {
  'new-orleans': { name: 'New Orleans', state: 'LA', lat: 29.9511, lon: -90.0715 },
  'new orleans': { name: 'New Orleans', state: 'LA', lat: 29.9511, lon: -90.0715 },
  'nola': { name: 'New Orleans', state: 'LA', lat: 29.9511, lon: -90.0715 },
  'denver': { name: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903 },
  'boulder': { name: 'Boulder', state: 'CO', lat: 40.0150, lon: -105.2705 },
  'golden': { name: 'Golden', state: 'CO', lat: 39.7555, lon: -105.2211 },
  'aurora': { name: 'Aurora', state: 'CO', lat: 39.7294, lon: -104.8319 },
  'chicago': { name: 'Chicago', state: 'IL', lat: 41.8781, lon: -87.6298 },
  'eau-claire': { name: 'Eau Claire', state: 'WI', lat: 44.8113, lon: -91.4985 },
  'eau claire': { name: 'Eau Claire', state: 'WI', lat: 44.8113, lon: -91.4985 },
  'austin': { name: 'Austin', state: 'TX', lat: 30.2672, lon: -97.7431 },
  'nashville': { name: 'Nashville', state: 'TN', lat: 36.1627, lon: -86.7816 },
  'miami': { name: 'Miami', state: 'FL', lat: 25.7617, lon: -80.1918 }
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

// Simple rate limit tracker (in-memory IP bucket per minute)
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 120; // 120 requests per minute per IP
  const record = rateLimitMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > record.reset) {
    record.count = 1;
    record.reset = now + windowMs;
  } else {
    record.count++;
  }
  rateLimitMap.set(ip, record);
  return record.count <= limit;
}

module.exports = async (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).send('Rate limit exceeded. Please try again in 1 minute.');
  }

  const u = new URL(req.url, 'https://brinkberry.local');
  const cityRaw = u.searchParams.get('city');
  const cityParam = cityRaw ? cityRaw.toLowerCase().trim() : '';
  const rawPartner = u.searchParams.get('partner') || 'partner';
  const theme = (u.searchParams.get('theme') || 'dark').toLowerCase();
  const limit = Math.min(Math.max(Number(u.searchParams.get('limit')) || 4, 1), 8);

  // Validate partner ID format (safe alphanumeric and underscores/hyphens)
  const safePartner = /^[a-z0-9_-]{2,32}$/i.test(rawPartner) ? rawPartner : 'partner';

  // Resolve target city coordinates
  let cityInfo = cityParam ? KNOWN_CITIES[cityParam] : null;
  if (!cityInfo) {
    const latStr = u.searchParams.get('lat');
    const lonStr = u.searchParams.get('lon') || u.searchParams.get('lng');
    const lat = latStr !== null && latStr.trim() !== '' ? Number(latStr) : NaN;
    const lon = lonStr !== null && lonStr.trim() !== '' ? Number(lonStr) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      cityInfo = {
        name: u.searchParams.get('cityName') || 'Local Area',
        state: '',
        lat,
        lon
      };
    } else {
      // Default to New Orleans if unresolvable
      cityInfo = KNOWN_CITIES['new-orleans'];
    }
  }

  // Permissive frame embedding headers for partner sites
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "frame-ancestors *; default-src 'self' 'unsafe-inline' https:; img-src * data:;");
  // Omit restrictive X-Frame-Options or set to ALLOWALL so iframes render seamlessly
  res.removeHeader?.('X-Frame-Options');

  // Query rolling 48-hour feed
  const now = new Date();
  const startIso = now.toISOString();
  const endIso = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

  let events = [];
  try {
    const hybridResult = await executeHybridFeed({
      lat: cityInfo.lat,
      lon: cityInfo.lon,
      radiusMiles: 25,
      window: '48h',
      windowStart: startIso,
      windowEnd: endIso,
      mode: '',
      curatedEvents: [],
      enableDynamic: true
    });
    events = (hybridResult?.events || []).slice(0, limit);
  } catch (err) {
    console.error('[Widget] Feed execution error:', err.message);
  }

  const isLight = theme === 'light';
  const bg = isLight ? '#f9f8fc' : '#0e0b17';
  const cardBg = isLight ? '#ffffff' : '#171224';
  const cardBorder = isLight ? '#e6e0f0' : '#29213b';
  const text = isLight ? '#1a1624' : '#f5eff8';
  const textDim = isLight ? '#675c78' : '#9d91b0';
  const primary = '#ffb86b';
  const primaryDark = '#201000';
  const accent = '#ff2e63';

  const fullRadarUrl = `${ORIGIN}/?city=${encodeURIComponent(cityInfo.name)}&utm_source=${encodeURIComponent(safePartner)}&utm_medium=widget&utm_campaign=city_radar`;

  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Happening in ${esc(cityInfo.name)} · Brinkberry Radar</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: ${bg};
      color: ${text};
      padding: 12px;
      line-height: 1.4;
      font-size: 14px;
    }
    .widget-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid ${cardBorder};
    }
    .widget-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: ${accent};
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(255, 46, 99, 0.7);
      animation: pulse 2s infinite;
      display: inline-block;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 46, 99, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(255, 46, 99, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 46, 99, 0); }
    }
    .window-badge {
      font-size: 11px;
      font-weight: 700;
      color: ${textDim};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .card {
      background: ${cardBg};
      border: 1px solid ${cardBorder};
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.15s, border-color 0.15s;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: #554473;
    }
    .card-img {
      height: 120px;
      position: relative;
      overflow: hidden;
      background: #201730;
    }
    .card-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .card-badge {
      position: absolute;
      bottom: 8px;
      left: 8px;
      background: rgba(12, 9, 20, 0.85);
      backdrop-filter: blur(4px);
      border: 1px solid #3d2f54;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      color: #fff;
    }
    .card-no-img {
      padding: 10px 12px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-no-img .card-badge {
      position: static;
      display: inline-block;
    }
    .card-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .card-title {
      font-size: 14px;
      font-weight: 800;
      color: ${text};
      line-height: 1.25;
      margin-bottom: 4px;
    }
    .card-meta {
      font-size: 12px;
      color: ${textDim};
      margin-bottom: 3px;
    }
    .card-footer {
      margin-top: auto;
      padding-top: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid ${cardBorder};
    }
    .card-price {
      font-size: 12px;
      font-weight: 800;
      color: ${primary};
    }
    .btn-ticket {
      background: ${primary};
      color: ${primaryDark};
      font-size: 11px;
      font-weight: 800;
      padding: 5px 11px;
      border-radius: 999px;
      text-decoration: none;
      display: inline-block;
      transition: background 0.15s;
    }
    .btn-ticket:hover {
      background: #ffa84d;
    }
    .widget-footer {
      margin-top: 12px;
      padding-top: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: ${textDim};
    }
    .widget-footer a {
      color: ${primary};
      text-decoration: none;
      font-weight: 700;
    }
    .widget-footer a:hover {
      text-decoration: underline;
    }
    .empty-state {
      padding: 24px 12px;
      text-align: center;
      color: ${textDim};
    }
  </style>
</head>
<body>
  <div class="widget-header">
    <div class="widget-title">
      <span class="pulse-dot"></span>
      Happening in ${esc(cityInfo.name)}
    </div>
    <div class="window-badge">Next 48 Hours</div>
  </div>

  ${events.length === 0 ? `
    <div class="empty-state">
      <p style="margin-bottom: 8px">Finding the next live events for ${esc(cityInfo.name)}…</p>
      <a href="${esc(fullRadarUrl)}" target="_blank" rel="noopener noreferrer" style="color:${primary}; font-weight:700; text-decoration:none;">
        Open Live Event Radar →
      </a>
    </div>
  ` : `
    <div class="grid">
      ${events.map(e => {
        const timeStr = new Date(e.start).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        const clickUrl = `/api/click?url=${encodeURIComponent(e.ticketUrl)}&eventId=${encodeURIComponent(e.id)}&surface=widget_${encodeURIComponent(safePartner)}&partner=${encodeURIComponent(safePartner)}`;

        return `
          <article class="card">
            ${e.image ? `
              <div class="card-img">
                <img src="${esc(e.image)}" alt="${esc(e.title)}" loading="lazy">
                <span class="card-badge">${esc(e.category)}</span>
              </div>
            ` : `
              <div class="card-no-img">
                <span class="card-badge">${esc(e.category)}</span>
              </div>
            `}
            <div class="card-body">
              <div class="card-title">${esc(e.title)}</div>
              <div class="card-meta">📍 ${esc(e.venue)}${e.city ? `, ${esc(e.city)}` : ''}</div>
              <div class="card-meta">⏰ ${esc(timeStr)}${e.distanceMiles != null ? ` · <b>${e.distanceMiles.toFixed(1)} mi</b>` : ''}</div>
              <div class="card-footer">
                <div class="card-price">${esc(e.priceDisplay || 'Details')}</div>
                <a class="btn-ticket" href="${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">
                  Get Tickets →
                </a>
              </div>
              ${(e.source === 'seatgeek' || e.provenance?.provider === 'seatgeek') ? `
                <div style="font-size:10.5px; color:${textDim}; margin-top:6px; display:flex; justify-content:flex-end;">
                  <a href="https://seatgeek.com" target="_blank" rel="noopener noreferrer" style="color:${textDim}; text-decoration:none;">
                    Tickets via SeatGeek ↗
                  </a>
                </div>
              ` : ''}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `}

  <div class="widget-footer">
    <span>Powered by <b>Brinkberry</b> · <a href="${ORIGIN}/terms" target="_blank" rel="noopener noreferrer" style="color:${textDim}; text-decoration:none; font-size:11px;">Terms</a></span>
    <a href="${esc(fullRadarUrl)}" target="_blank" rel="noopener noreferrer">
      Explore Full Live Radar →
    </a>
  </div>
</body>
</html>`);
};
