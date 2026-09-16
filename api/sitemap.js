const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const CITIES = ['denver', 'boulder', 'golden', 'aurora'];
const TOPICS = ['this-weekend', 'music', 'free', 'outdoor'];

module.exports = async (req, res) => {
  try {
    let eventUrls = [];
    const nowIso = new Date().toISOString();
    
    try {
      // Exclude past, deleted, and rejected events
      const r = await fetch(`${SUPABASE_URL}/rest/v1/canonical_events?select=id,updated_at,start_time&deleted_at=is.null&event_status=neq.rejected&start_time=gte.${encodeURIComponent(nowIso)}&order=start_time.asc&limit=500`, {
        headers: { apikey: KEY, authorization: `Bearer ${KEY}` }
      });
      if (r.ok) {
        const events = await r.json();
        if (Array.isArray(events)) {
          eventUrls = events.map(e => ({
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

    for (const city of CITIES) {
      staticUrls.push({ loc: `${ORIGIN}/${city}`, priority: '0.9', changefreq: 'daily' });
      for (const topic of TOPICS) {
        staticUrls.push({ loc: `${ORIGIN}/${city}/${topic}`, priority: '0.8', changefreq: 'daily' });
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
