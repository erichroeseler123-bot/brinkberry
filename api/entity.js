/**
 * Deep Entity Pages: Venues & Comedians
 *
 * Serves canonical entity pages for verified comedy clubs/rooms and comedians.
 * Adheres strictly to Brinkberry's immediate live-radar principle:
 * Only renders when genuine normalized records exist with active schedules,
 * otherwise returning a clean 404.
 */

const { getVenueBySlug, getComedianBySlug } = require('../lib/comedy/registry');
const { getLedgerByShowId, calculateMomentumBadge } = require('../lib/comedy/ledger');
const { buildSafeAffiliateUrl } = require('../lib/affiliate');
const { trackEventView, trackVenueView } = require('../lib/telemetry');

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

function renderVenuePage(venue) {
  const shows = venue.upcomingShows || [];
  const showsHtml = shows.length > 0
    ? shows.map(s => {
        const start = new Date(s.start_time).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        const comediansStr = s.comedy?.comedians?.length ? s.comedy.comedians.join(', ') : 'Stand-up Lineup';
        const safeUrl = buildSafeAffiliateUrl(s.source || 'custom', s.canonical_url, s.id);
        const ledger = getLedgerByShowId(s.id);
        const momentum = ledger ? calculateMomentumBadge(ledger.capacity, ledger.ticketsSold) : null;
        const momentumBadgeHtml = momentum && momentum.level !== 'normal'
          ? `<span class="badge" style="background:rgba(255,184,107,0.15); color:#ffb86b; border:1px solid rgba(255,184,107,0.35);">🔥 ${esc(momentum.badge)}</span>`
          : '';
        return `
        <article class="show-card">
          <div class="show-time">${esc(start)}</div>
          <h3 class="show-title">${esc(s.title)}</h3>
          <div class="show-lineup">🎤 Lineup: <strong>${esc(comediansStr)}</strong></div>
          <div class="show-meta">
            <span class="badge badge-type">${esc(s.comedy?.showType || 'standup')}</span>
            <span class="badge badge-age">${esc(s.comedy?.ageLimit || '21+')}</span>
            <span class="badge badge-price">${esc(s.price_display || 'Check event')}</span>
            ${momentumBadgeHtml}
            ${s.comedy?.recurring ? `<span class="badge badge-recurring">🔄 ${esc(s.comedy.recurrenceText || 'Recurring')}</span>` : ''}
          </div>
          <p class="show-desc">${esc(s.description || '')}</p>
          <div class="show-actions">
            <a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Get Tickets / Details</a>
            <a href="/event/${esc(s.id)}" class="btn btn-secondary">Radar View</a>
            <a href="/card/${esc(s.id)}" target="_blank" class="btn btn-secondary">Social Card ↗</a>
          </div>
        </article>`;
      }).join('')
    : `<div class="empty-shows">
        <p>No upcoming shows listed for the immediate 48-hour window.</p>
        ${venue.website ? `<p style="margin-top:14px;"><a href="${esc(venue.website)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Visit Official Box Office &amp; Calendar →</a></p>` : ''}
      </div>`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ComedyClub',
    name: venue.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: venue.address,
      addressLocality: venue.city,
      addressRegion: venue.state || '',
      addressCountry: venue.country || 'US'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: venue.lat,
      longitude: venue.lon
    },
    url: `${ORIGIN}/venue/${venue.slug}`,
    description: venue.description
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(venue.name)} — Live Comedy Schedule & Venue Radar | Brinkberry</title>
  <meta name="description" content="${esc(venue.tagline || venue.description || '')}">
  <link rel="canonical" href="${ORIGIN}/venue/${esc(venue.slug)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root {
      --bg: #07050d;
      --card-bg: #110d1c;
      --card-border: #231c33;
      --text: #f6f2fb;
      --text-dim: #9b90ad;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --verified-green: #00d26a;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 0 16px 60px;
    }
    .wrap {
      max-width: 840px;
      margin: 0 auto;
      padding-top: 24px;
    }
    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
    }
    .brand {
      color: #fff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 800;
    }
    .brand b { color: var(--accent); }
    .back-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
    }
    .venue-header {
      background: linear-gradient(135deg, rgba(32, 22, 53, 0.7) 0%, rgba(17, 13, 28, 0.9) 100%);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 30px;
      margin-bottom: 30px;
      position: relative;
    }
    .verified-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 210, 106, 0.15);
      border: 1px solid rgba(0, 210, 106, 0.35);
      color: var(--verified-green);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(24px, 4vw, 34px);
      font-weight: 900;
    }
    .address {
      color: var(--text-dim);
      font-size: 14.5px;
      margin-bottom: 14px;
    }
    .tagline {
      color: #ded6ec;
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 800;
      margin: 36px 0 18px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .show-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 16px;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .show-card:hover {
      border-color: #3f315a;
      transform: translateY(-2px);
    }
    .show-time {
      font-size: 13px;
      color: var(--primary);
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .show-title {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 800;
      color: #fff;
    }
    .show-lineup {
      font-size: 14px;
      color: #dfd8ed;
      margin-bottom: 12px;
    }
    .show-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .badge {
      font-size: 11.5px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-type { background: rgba(255, 184, 107, 0.15); color: var(--primary); border: 1px solid rgba(255, 184, 107, 0.3); }
    .badge-age { background: rgba(255, 46, 99, 0.15); color: var(--accent); border: 1px solid rgba(255, 46, 99, 0.3); }
    .badge-price { background: rgba(255, 255, 255, 0.08); color: #fff; border: 1px solid rgba(255, 255, 255, 0.12); }
    .badge-recurring { background: rgba(0, 210, 106, 0.12); color: var(--verified-green); border: 1px solid rgba(0, 210, 106, 0.25); }
    .show-desc {
      color: var(--text-dim);
      font-size: 14px;
      margin: 0 0 16px;
      line-height: 1.5;
    }
    .show-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--primary);
      color: var(--primary-dark);
      border: none;
    }
    .btn-primary:hover { background: #ffa84d; }
    .btn-secondary {
      background: #1d172c;
      color: #ded6ec;
      border: 1px solid #372a4f;
    }
    .btn-secondary:hover { background: #2b2140; color: #fff; }
    .empty-shows {
      background: var(--card-bg);
      border: 1px dashed var(--card-border);
      border-radius: 16px;
      padding: 40px 20px;
      text-align: center;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <a class="back-link" href="/${esc(venue.city.toLowerCase())}/comedy">← ${esc(venue.city)} Comedy Radar</a>
    </nav>

    <!-- Public Discovery Index Record (Claim workflow deprecated; all public schedules indexed without accounts) -->
    <!-- Compatibility metadata: Verified Venue index record (legacy claim route deprecated: /venue/${esc(venue.slug)}/claim) -->
    <header class="venue-header">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <div class="verified-pill">✓ Official Schedule Indexed</div>
        <a href="/submit?venue=${encodeURIComponent(venue.slug)}" style="color:var(--text-dim); font-size:12px; text-decoration:none;">Update schedule, feed, or cancellation →</a>
      </div>
      <h1>${esc(venue.name)}</h1>
      <div class="address">📍 ${esc(venue.address)} · ${esc(venue.city)}</div>
      <div class="tagline">${esc(venue.tagline || '')}</div>
      <p style="color:var(--text-dim);font-size:14px;margin:0;">${esc(venue.description || '')}</p>
    </header>

    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--card-border); border-radius:12px; padding:12px 16px; font-size:12.5px; color:var(--text-dim); margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span>ℹ️</span>
        <span><b>Public Discovery Index:</b> Schedules are indexed automatically from public box office sources. Ticket links route directly to official primary sellers with zero markups. No venue signup, accounts, or ownership verification required.</span>
      </div>
      <a href="/submit?venue=${encodeURIComponent(venue.slug)}" style="color:var(--primary); font-size:12px; text-decoration:none; white-space:nowrap;">Suggest feed or correction →</a>
    </div>

    <h2 class="section-title">🎭 Upcoming Shows (Next 48 Hours)</h2>
    <div class="shows-list">
      ${showsHtml}
    </div>
  </div>
</body>
</html>`;
}

function renderComedianPage(comedian) {
  const shows = comedian.upcomingShows || [];
  const showsHtml = shows.map(s => {
    const start = new Date(s.start_time).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    const safeUrl = buildSafeAffiliateUrl(s.source || 'custom', s.canonical_url, s.id);
    const ledger = getLedgerByShowId(s.id);
    const momentum = ledger ? calculateMomentumBadge(ledger.capacity, ledger.ticketsSold) : null;
    const momentumBadgeHtml = momentum && momentum.level !== 'normal'
      ? `<span class="badge" style="background:rgba(255,184,107,0.15); color:#ffb86b; border:1px solid rgba(255,184,107,0.35);">🔥 ${esc(momentum.badge)}</span>`
      : '';
    return `
    <article class="show-card">
      <div class="show-time">${esc(start)}</div>
      <h3 class="show-title">${esc(s.title)}</h3>
      <div class="show-lineup">📍 Venue: <strong><a href="/venue/${esc(s.venueSlug || '')}" style="color:var(--primary);text-decoration:none;">${esc(s.venue_name)}</a></strong> (${esc(s.city)})</div>
      <div class="show-meta">
        <span class="badge badge-type">${esc(s.comedy?.showType || 'standup')}</span>
        <span class="badge badge-age">${esc(s.comedy?.ageLimit || '21+')}</span>
        <span class="badge badge-price">${esc(s.price_display || 'Check event')}</span>
        ${momentumBadgeHtml}
      </div>
      <p class="show-desc">${esc(s.description || '')}</p>
      <div class="show-actions">
        <a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Get Tickets</a>
        <a href="/event/${esc(s.id)}" class="btn btn-secondary">Radar View</a>
        <a href="/card/${esc(s.id)}" target="_blank" class="btn btn-secondary">Social Card ↗</a>
      </div>
    </article>`;
  }).join('');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: comedian.name,
    jobTitle: 'Stand-Up Comedian',
    url: `${ORIGIN}/comedian/${comedian.slug}`,
    description: comedian.tagline
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(comedian.name)} — Upcoming Comedy Shows | Brinkberry</title>
  <meta name="description" content="Catch ${esc(comedian.name)} live in the next 48 hours. Verified schedule, showtimes, venues, and ticket links.">
  <link rel="canonical" href="${ORIGIN}/comedian/${esc(comedian.slug)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root {
      --bg: #07050d;
      --card-bg: #110d1c;
      --card-border: #231c33;
      --text: #f6f2fb;
      --text-dim: #9b90ad;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --verified-green: #00d26a;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 0 16px 60px;
    }
    .wrap {
      max-width: 840px;
      margin: 0 auto;
      padding-top: 24px;
    }
    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
    }
    .brand { color: #fff; text-decoration: none; font-size: 16px; font-weight: 800; }
    .brand b { color: var(--accent); }
    .back-link { color: var(--primary); text-decoration: none; font-size: 13.5px; font-weight: 600; }
    .comic-header {
      background: linear-gradient(135deg, rgba(38, 22, 53, 0.7) 0%, rgba(17, 13, 28, 0.9) 100%);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 30px;
      margin-bottom: 30px;
    }
    .comic-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 184, 107, 0.15);
      border: 1px solid rgba(255, 184, 107, 0.35);
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 34px); font-weight: 900; }
    .tagline { color: var(--text-dim); font-size: 15px; }
    .section-title { font-size: 20px; font-weight: 800; margin: 36px 0 18px; }
    .show-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 16px;
    }
    .show-time { font-size: 13px; color: var(--primary); font-weight: 750; text-transform: uppercase; margin-bottom: 6px; }
    .show-title { margin: 0 0 8px; font-size: 18px; font-weight: 800; color: #fff; }
    .show-lineup { font-size: 14px; color: #dfd8ed; margin-bottom: 12px; }
    .show-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .badge { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; }
    .badge-type { background: rgba(255, 184, 107, 0.15); color: var(--primary); border: 1px solid rgba(255, 184, 107, 0.3); }
    .badge-age { background: rgba(255, 46, 99, 0.15); color: var(--accent); border: 1px solid rgba(255, 46, 99, 0.3); }
    .badge-price { background: rgba(255, 255, 255, 0.08); color: #fff; border: 1px solid rgba(255, 255, 255, 0.12); }
    .show-desc { color: var(--text-dim); font-size: 14px; margin: 0 0 16px; line-height: 1.5; }
    .show-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 700; text-decoration: none; cursor: pointer; }
    .btn-primary { background: var(--primary); color: var(--primary-dark); border: none; }
    .btn-secondary { background: #1d172c; color: #ded6ec; border: 1px solid #372a4f; }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <a class="back-link" href="/">← Live Event Radar</a>
    </nav>

    <header class="comic-header">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          <div class="comic-badge">🎤 Stand-Up Comedian</div>
          <h1>${esc(comedian.name)}</h1>
          <div class="tagline">${esc(comedian.tagline)}</div>
        </div>
        <button id="shareComicBtn" class="btn btn-secondary" style="padding:10px 20px; font-size:13.5px; border-radius:999px;">
          🔗 Share Comedian Profile
        </button>
      </div>
    </header>

    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--card-border); border-radius:12px; padding:10px 14px; font-size:12.5px; color:var(--text-dim); margin-bottom:20px; display:flex; align-items:center; gap:8px;">
      <span>ℹ️</span>
      <span><b>Independent Live Radar:</b> Brinkberry is an independent discovery platform. Ticket links direct to official venue box offices and authorized primary sellers. Details are subject to change.</span>
    </div>

    <h2 class="section-title">🎭 Verified Shows in the Next 48 Hours</h2>
    <div class="shows-list">
      ${showsHtml}
    </div>

    <section class="demand-section" style="background:#120d20; border:1px solid var(--card-border); border-radius:18px; padding:26px; margin:40px 0 20px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="font-size:22px;">📢</span>
        <h2 style="font-size:20px; font-weight:850; margin:0; color:#fff;">Bring ${esc(comedian.name)} to Your City</h2>
      </div>
      <p style="color:var(--text-dim); font-size:14px; margin:0 0 16px; line-height:1.5;">
        Independent touring routes where fans gather. Signal your city to give ${esc(comedian.name)} and local room bookers verified proof of audience demand.
      </p>

      ${comedian.demand?.topCities?.length ? `
      <div style="margin-bottom:20px; background:rgba(255,255,255,0.02); border:1px solid var(--card-border); border-radius:12px; padding:12px 16px;">
        <div style="font-size:12px; font-weight:750; color:var(--primary); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px;">Fan Demand Signal Leaderboard (${comedian.demand.totalDemand} ${comedian.demand.totalDemand === 1 ? 'Fan Request' : 'Fan Requests'})</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${comedian.demand.topCities.map((c, i) => `
            <span style="background:#1d162c; border:1px solid #36294d; border-radius:999px; padding:4px 12px; font-size:12.5px; color:#ded6ec;">
              <b>#${i+1}</b> ${esc(c.city)} <span style="color:var(--primary); font-weight:700;">(${c.count} ${c.count === 1 ? 'request' : 'requests'})</span>
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <form id="demandForm" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
        <input type="text" id="demandCity" placeholder="City name (e.g. Austin, TX or Chicago)" required
               style="flex:1 1 180px; min-width:160px; background:#0a0714; border:1px solid #36294d; border-radius:999px; padding:12px 18px; color:#fff; font-size:14px; outline:none;">
        <input type="text" id="demandZip" placeholder="Zip / Postal"
               style="width:105px; background:#0a0714; border:1px solid #36294d; border-radius:999px; padding:12px 14px; color:#fff; font-size:14px; outline:none;">
        <input type="email" id="demandEmail" placeholder="Email (optional tour alert)"
               style="flex:1 1 180px; min-width:160px; background:#0a0714; border:1px solid #36294d; border-radius:999px; padding:12px 16px; color:#fff; font-size:14px; outline:none;">
        <button type="submit" class="btn btn-primary" style="padding:12px 22px; font-size:14px; white-space:nowrap; border:none; cursor:pointer;">
          Demand Show 🚀
        </button>

        <div style="width:100%; display:flex; align-items:center; gap:8px; margin-top:8px;">
          <label style="font-size:12px; color:#cfc5df; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="demandConsent" checked style="accent-color:var(--primary); width:15px; height:15px;">
            Keep me updated if ${esc(comedian.name)} announces a show in my city. (Optional, zero spam, opt out anytime).
          </label>
        </div>
      </form>
      <div id="demandFeedback" style="margin-top:12px; font-size:13.5px; display:none;"></div>
      <p style="color:#786e88; font-size:11.5px; margin:10px 0 0;">Strictly privacy-safe. IPs are hashed for rate limiting and 30-day deduplication. No commercial spam.</p>
    </section>

    <script>
      (function() {
        const shareBtn = document.getElementById('shareComicBtn');
        if (shareBtn) {
          shareBtn.onclick = async () => {
            const shareData = {
              title: ${JSON.stringify(comedian.name + ' — Upcoming Comedy Shows | Brinkberry')},
              text: ${JSON.stringify('Catch ' + comedian.name + ' live. Verified comedy tour radar and schedule on Brinkberry:')},
              url: window.location.href
            };
            if (navigator.share) {
              try { await navigator.share(shareData); return; } catch (_) {}
            }
            await navigator.clipboard.writeText(window.location.href);
            alert('Comedian profile link copied to clipboard!');
          };
        }

        const form = document.getElementById('demandForm');
        const feedback = document.getElementById('demandFeedback');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const city = document.getElementById('demandCity').value.trim();
          const postalCode = document.getElementById('demandZip').value.trim();
          const emailInput = document.getElementById('demandEmail');
          const email = emailInput ? emailInput.value.trim() : null;
          const consentBox = document.getElementById('demandConsent');
          const consent = Boolean(consentBox ? consentBox.checked : false);

          if (!city) return;

          feedback.style.display = 'block';
          feedback.style.color = 'var(--text-dim)';
          feedback.textContent = 'Logging fan request...';

          try {
            const res = await fetch('/api/comedy/demand', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                comicSlug: ${JSON.stringify(comedian.slug)},
                comicName: ${JSON.stringify(comedian.name)},
                city,
                postalCode,
                email,
                consent
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              feedback.style.color = 'var(--verified-green)';
              feedback.textContent = '✓ ' + (data.message || ('Demand recorded! ' + data.city + ' now has ' + data.cityCount + ' fan requests.'));
              form.reset();
            } else {
              feedback.style.color = 'var(--accent)';
              feedback.textContent = 'Error: ' + (data.error || 'Could not log demand.');
            }
          } catch (err) {
            feedback.style.color = 'var(--accent)';
            feedback.textContent = 'Network error recording demand. Please try again.';
          }
        });
      })();
    </script>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, ORIGIN);
    const parts = u.pathname.split('/').filter(Boolean);
    const type = parts[0]?.toLowerCase(); // 'venue' or 'comedian'
    const slug = parts[1]?.toLowerCase();

    if (!slug) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Entity Not Found</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    if (type === 'venue') {
      const venue = getVenueBySlug(slug);
      if (!venue) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Venue Not Found</h1><p>We only maintain pages for verified comedy venues with scheduled shows.</p><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
      }
      trackEventView(venue.slug, 'venue_page');
      trackVenueView(venue.slug);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderVenuePage(venue));
    }

    if (type === 'comedian') {
      const comedian = getComedianBySlug(slug);
      if (!comedian) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Comedian Not Found</h1><p>No active shows found for this comedian in the immediate 48-hour window.</p><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
      }
      trackEventView(comedian.slug, 'comedian_page');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderComedianPage(comedian));
    }

    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Page Not Found</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
  } catch (err) {
    console.error('Entity page error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send('Server error');
  }
};
