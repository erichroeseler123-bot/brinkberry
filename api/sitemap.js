const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const CITIES = {
  denver: { name: 'Denver', lat: 39.7392, lon: -104.9903, radius: 25 },
  boulder: { name: 'Boulder', lat: 40.0150, lon: -105.2705, radius: 25 },
  golden: { name: 'Golden', lat: 39.7555, lon: -105.2211, radius: 25 },
  aurora: { name: 'Aurora', lat: 39.7294, lon: -104.8319, radius: 25 }
};

const TOPICS = {
  'next-48-hours': { window: '48h', mode: null },
  'this-weekend': { window: '48h', mode: null },
  'music': { window: '48h', mode: 'date', categoryFilter: ['music', 'arts', 'entertainment'] },
  'free': { window: '48h', mode: 'cheap', priceFilter: 'free' },
  'outdoor': { window: '48h', mode: 'outside', indoorOutdoorFilter: ['outdoor', 'mixed'] }
};

function distMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = async (req, res) => {
  try {
    let eventUrls = [];
    const now = new Date();
    const nowIso = now.toISOString();
    const max48hIso = new Date(now.getTime() + 48 * 3600e3).toISOString();
    const nowMs = now.getTime();
    const max48Ms = now.getTime() + 48 * 3600e3;
    let allEvents = [];
    
    try {
      // Exclude past, deleted, rejected, and future events (> 48h)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_feed_events_v2`, {
        method: 'POST',
        headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          p_user_lat: 39.7392,
          p_user_lng: -104.9903,
          p_radius_miles: 60,
          p_window_start: nowIso,
          p_window_end: max48hIso,
          p_mode: null
        })
      });
      if (r.ok) {
        const events = await r.json();
        if (Array.isArray(events)) {
          allEvents = events.filter(e => {
            const t = new Date(e.start_time).getTime();
            return t >= nowMs && t <= max48Ms;
          });
          eventUrls = allEvents.map(e => ({
            loc: `${ORIGIN}/event/${e.id}`,
            lastmod: (e.updated_at || e.start_time || nowIso).slice(0, 10),
            priority: '0.7',
            changefreq: 'daily'
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching sitemap events:', err);
    }

    const staticUrls = [
      { loc: `${ORIGIN}/`, priority: '1.0', changefreq: 'hourly' }
    ];

    // Only include city and topic pages if they have at least 1 verified active event
    for (const [cSlug, city] of Object.entries(CITIES)) {
      const cityEvents = allEvents.filter(e => {
        if (e.venue_latitude == null || e.venue_longitude == null) return false;
        return distMiles(city.lat, city.lon, e.venue_latitude, e.venue_longitude) <= (city.radius || 25);
      });

      if (cityEvents.length > 0) {
        staticUrls.push({ loc: `${ORIGIN}/${cSlug}`, priority: '0.9', changefreq: 'daily' });
        for (const [tSlug, topic] of Object.entries(TOPICS)) {
          let matching = cityEvents;
          if (topic.priceFilter === 'free') {
            matching = matching.filter(e => e.price_status === 'free' || (e.price_min != null && e.price_min === 0));
          }
          if (topic.indoorOutdoorFilter) {
            matching = matching.filter(e => topic.indoorOutdoorFilter.includes(e.indoor_outdoor));
          }
          if (topic.categoryFilter) {
            matching = matching.filter(e => (e.category_tags || []).some(t => topic.categoryFilter.includes(t)) || topic.categoryFilter.includes(e.category));
          }
          if (matching.length > 0) {
            staticUrls.push({ loc: `${ORIGIN}/${cSlug}/${tSlug}`, priority: '0.8', changefreq: 'daily' });
          }
        }
      }
    }


    const allUrls = [...staticUrls, ...eventUrls];
    const today = nowIso.slice(0, 10);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq || 'daily'}</changefreq>
    <priority>${u.priority || '0.5'}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('content-type', 'application/xml; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=3600, s-maxage=86400');
    res.status(200).send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Error generating sitemap');
  }
};
