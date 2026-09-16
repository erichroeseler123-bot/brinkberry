const { buildSafeAffiliateUrl, isValidTicketUrl } = require('../lib/affiliate');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

async function getEvent(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_public_event`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ p_id: id })
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

module.exports = async (req, res) => {
  try {
    const id = req.query?.id;
    if (!id) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(400).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Event ID required</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    const e = await getEvent(id);
    const nowMs = Date.now();
    const startTime = e ? new Date(e.start_time).getTime() : 0;
    // Brinkberry strictly presents events in the active rolling 48-hour window
    if (!e || startTime < (nowMs - 4 * 3600e3) || startTime > (nowMs + 48 * 3600e3)) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Event Not Found</h1><p style="color:#90869e">This event is not in the active 48-hour window or is no longer listed.</p><p><a href="/" style="color:#ffb86b;font-weight:bold;text-decoration:none">← Find what’s happening right now</a></p></body></html>');
    }

    const price = e.price_status === 'free' ? 'Free' : (e.price_display || 'Check tickets');
    const startObj = new Date(e.start_time);
    const when = startObj.toLocaleString('en-US', {
      timeZone: 'America/Denver',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    const desc = [e.venue_name, e.city, price, when].filter(Boolean).join(' · ');
    const og = `${ORIGIN}/og/event/${e.id}.png`;
    const safeTarget = buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url, e.id);
    const clickUrl = `/api/click?url=${encodeURIComponent(safeTarget)}&eventId=${encodeURIComponent(e.id)}&surface=event_page`;

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: e.title,
      description: e.description || desc,
      startDate: e.start_time,
      endDate: e.end_time || undefined,
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: e.venue_name,
        address: {
          '@type': 'PostalAddress',
          addressLocality: e.city || 'Denver',
          addressRegion: e.state || 'CO',
          addressCountry: 'US'
        }
      },
      offers: {
        '@type': 'Offer',
        price: e.price_min ?? (e.price_status === 'free' ? '0' : undefined),
        priceCurrency: 'USD',
        url: safeTarget,
        availability: 'https://schema.org/InStock'
      },
      image: e.canonical_image_url ? [e.canonical_image_url] : undefined
    });

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(e.title)} — Brinkberry</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${ORIGIN}/event/${e.id}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(e.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${ORIGIN}/event/${e.id}">
  ${e.canonical_image_url ? `<meta property="og:image" content="${esc(e.canonical_image_url)}">` : `<meta property="og:image" content="${og}">`}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(e.title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    body { margin: 0; background: #080610; color: #f4eff8; font: 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
    .container { max-width: 760px; margin: auto; padding: 24px 20px 60px; }
    .nav { margin-bottom: 24px; }
    .nav a { color: #ffb86b; text-decoration: none; font-weight: 700; font-size: 15px; }
    h1 { font-size: clamp(28px, 5vw, 42px); line-height: 1.1; margin: 12px 0; font-weight: 850; }
    .meta-box { background: #171321; border: 1px solid #2a2437; border-radius: 16px; padding: 18px; margin: 20px 0; }
    .meta-row { margin: 8px 0; color: #e2daf0; font-size: 15px; }
    .meta-row b { color: #fff; margin-right: 6px; }
    .badge { display: inline-block; background: #261f36; color: #ffb86b; padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-right: 6px; margin-bottom: 6px; }
    .desc { color: #d0c5df; margin: 24px 0; line-height: 1.6; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
    .btn-ticket { display: inline-block; background: #ffb86b; color: #201000; padding: 14px 24px; border-radius: 999px; text-decoration: none; font-weight: 850; font-size: 16px; text-align: center; }
    .btn-share { display: inline-block; background: #1a1526; color: #fff; border: 1px solid #362e49; padding: 14px 20px; border-radius: 999px; font-weight: 700; font-size: 15px; cursor: pointer; }
    .btn-ticket:hover { background: #ffa84d; }
    .hero-img { width: 100%; height: 260px; object-fit: cover; border-radius: 18px; margin: 16px 0; border: 1px solid #2a2437; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav"><a href="/">← Explore what’s happening nearby</a></div>
    ${e.canonical_image_url ? `<img class="hero-img" src="${esc(e.canonical_image_url)}" alt="${esc(e.title)}">` : ''}
    <div>
      ${(e.category_tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('')}
      ${(e.vibe_labels || []).map(v => `<span class="badge" style="color:#ff809d">${esc(v)}</span>`).join('')}
    </div>
    <h1>${esc(e.title)}</h1>
    <div class="meta-box">
      <div class="meta-row"><b>When:</b> ${esc(when)}</div>
      <div class="meta-row"><b>Where:</b> ${esc(e.venue_name)}${e.city ? `, ${esc(e.city)}` : ''}${e.neighborhood ? ` (${esc(e.neighborhood)})` : ''}</div>
      <div class="meta-row"><b>Admission:</b> ${esc(price)}</div>
    </div>
    ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
    <div class="actions">
      <a class="btn-ticket" href="${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">Get Tickets & Event Details →</a>
      <button class="btn-share" id="shareBtn">Share Event</button>
    </div>
  </div>
  <script>
    document.getElementById('shareBtn').onclick = async () => {
      const shareData = { title: ${JSON.stringify(e.title)}, text: ${JSON.stringify(e.title + ' — ' + when + ' at ' + e.venue_name)}, url: location.href };
      if (navigator.share) {
        try { await navigator.share(shareData); return; } catch {}
      }
      await navigator.clipboard.writeText(location.href);
      alert('Event link copied to clipboard!');
    };
  </script>
</body>
</html>`);
  } catch (e) {
    console.error('Event page error:', e);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(500).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Event page temporarily unavailable</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
  }
};
