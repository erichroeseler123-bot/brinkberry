const { buildSafeAffiliateUrl } = require('../lib/affiliate');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const CITIES = {
  denver: {
    name: 'Denver',
    state: 'CO',
    slug: 'denver',
    lat: 39.7392,
    lon: -104.9903,
    radius: 25,
    tagline: 'The Mile High City’s definitive live event radar.',
    desc: 'From Red Rocks Amphitheatre and the RiNo Art District to downtown LoDo and Capitol Hill, discover concerts, outdoor adventures, free gatherings, and local things to do in Denver.',
    neighborhoods: ['LoDo', 'RiNo Arts District', 'Capitol Hill', 'Highlands', 'Auraria', 'Cherry Creek', 'Baker / South Broadway']
  },
  boulder: {
    name: 'Boulder',
    state: 'CO',
    slug: 'boulder',
    lat: 40.0150,
    lon: -105.2705,
    radius: 25,
    tagline: 'Live events beneath the Flatirons.',
    desc: 'Explore live music at Fox Theatre and Boulder Theater, outdoor trail outings along the Flatirons, Pearl Street Mall street performers, and cultural happenings in Boulder.',
    neighborhoods: ['Downtown / Pearl Street', 'The Hill', 'Chautauqua', 'University Hill', 'North Boulder']
  },
  golden: {
    name: 'Golden',
    state: 'CO',
    slug: 'golden',
    lat: 39.7555,
    lon: -105.2211,
    radius: 25,
    tagline: 'Where the foothills meet live music & outdoor life.',
    desc: 'Nestled between North and South Table Mountain along Clear Creek, find live roots music, creek excursions, brewery gatherings, and historic foothill events in Golden.',
    neighborhoods: ['Historic Downtown Golden', 'Clear Creek Corridor', 'Table Mountain Foothills', 'Lookout Mountain']
  },
  aurora: {
    name: 'Aurora',
    state: 'CO',
    slug: 'aurora',
    lat: 39.7294,
    lon: -104.8319,
    radius: 25,
    tagline: 'Diverse culture, arts & open-air events in the eastern metro.',
    desc: 'Discover food festivals, theater at Aurora Fox Arts Center, water recreation at Aurora Reservoir, and vibrant community arts across Aurora.',
    neighborhoods: ['Aurora Cultural Arts District', 'Stanley Marketplace', 'Aurora Reservoir', 'Nine Mile / Cherry Creek State Park']
  }
};

const TOPICS = {
  'next-48-hours': {
    slug: 'next-48-hours',
    aliases: ['this-weekend', 'weekend', 'events-this-weekend', '48h', 'next-48h'],
    title: 'Events in the Next 48 Hours',
    headingSuffix: 'Events in the Next 48 Hours',
    metaDescTemplate: (city) => `Discover what's happening in the next 48 hours in ${city.name}, CO. Live concerts, gatherings, outdoor activities, and things to do right now.`,
    intro: (city) => `Looking for immediate plans over the next 48 hours? Here is your curated radar of verified upcoming events, shows, and local gatherings happening across ${city.name} and the surrounding area.`,
    window: '48h',
    filter: (e) => true
  },
  'this-weekend': {
    slug: 'this-weekend',
    aliases: ['weekend', 'events-this-weekend'],
    title: 'Events in the Next 48 Hours',
    headingSuffix: 'Events in the Next 48 Hours',
    metaDescTemplate: (city) => `Discover what's happening in the next 48 hours in ${city.name}, CO. Live concerts, gatherings, outdoor activities, and things to do right now.`,
    intro: (city) => `Looking for immediate plans over the next 48 hours? Here is your curated radar of verified upcoming events, shows, and local gatherings happening across ${city.name} and the surrounding area.`,
    window: '48h',
    filter: (e) => true
  },
  'music': {
    slug: 'music',
    aliases: ['live-music', 'concerts', 'jazz'],
    title: 'Live Music & Concerts (Next 48 Hours)',
    headingSuffix: 'Live Music & Concerts (Next 48 Hours)',
    metaDescTemplate: (city) => `Find live music, concerts, and jazz sessions in the next 48 hours in ${city.name}, CO. From indie rock stages to jazz clubs and acoustic showcases.`,
    intro: (city) => `From jazz clubs and indie rock stages to underground electronic sets and acoustic open stages, explore genuine live music across ${city.name} tonight and over the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const tags = e.category_tags || [];
      const musicTags = ['music', 'jazz', 'rock', 'indie', 'bluegrass', 'roots', 'electronic', 'acoustic', 'concert'];
      return tags.some(t => musicTags.includes(t)) && !tags.includes('museum') && !tags.includes('gallery');
    }
  },
  'arts': {
    slug: 'arts',
    aliases: ['art', 'museums', 'exhibits', 'galleries'],
    title: 'Arts & Museum Exhibits (Next 48 Hours)',
    headingSuffix: 'Arts & Museum Exhibits (Next 48 Hours)',
    metaDescTemplate: (city) => `Explore art exhibitions, museum gallery tours, and cultural happenings in the next 48 hours in ${city.name}, CO.`,
    intro: (city) => `Immerse yourself in world-class art collections, contemporary gallery walks, botanical demonstrations, and cultural exhibits across ${city.name} happening over the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const tags = e.category_tags || [];
      return tags.some(t => ['arts', 'museum', 'gallery', 'exhibit'].includes(t));
    }
  },
  'theater': {
    slug: 'theater',
    aliases: ['theatre', 'stage', 'plays', 'broadway', 'performing-arts'],
    title: 'Theater & Performing Arts (Next 48 Hours)',
    headingSuffix: 'Theater & Performing Arts (Next 48 Hours)',
    metaDescTemplate: (city) => `Find live theater, stage plays, and performing arts in the next 48 hours in ${city.name}, CO.`,
    intro: (city) => `Experience live stage productions, Broadway vocal showcases, and local playwright previews in ${city.name} happening within the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const tags = e.category_tags || [];
      return tags.some(t => ['theater', 'theatre', 'stage', 'broadway', 'play'].includes(t));
    }
  },
  'free': {
    slug: 'free',
    aliases: ['free-events', 'cheap'],
    title: 'Free & Budget-Friendly Events (Next 48 Hours)',
    headingSuffix: 'Free & Budget-Friendly Events (Next 48 Hours)',
    metaDescTemplate: (city) => `Free things to do in the next 48 hours in ${city.name}, CO. Free admission concerts, open galleries, community markets, and outdoor gatherings.`,
    intro: (city) => `You don't need a huge budget to experience Colorado. Discover free admission events, community workouts, gallery walks, and open public gatherings across ${city.name} happening over the next 48 hours.`,
    window: '48h',
    filter: (e) => e.price_status === 'free' || (e.price_min != null && e.price_min === 0)
  },
  'outdoor': {
    slug: 'outdoor',
    aliases: ['outside', 'outdoor-events'],
    title: 'Outdoor Events & Activities (Next 48 Hours)',
    headingSuffix: 'Outdoor Events & Activities (Next 48 Hours)',
    metaDescTemplate: (city) => `Outdoor events and open-air activities in the next 48 hours in ${city.name}, CO. Guided hikes, open-air yoga, outdoor amphitheater concerts, and park festivals.`,
    intro: (city) => `Take advantage of 300+ days of Colorado sunshine. Find guided hikes, rooftop fitness sessions, open-air amphitheater shows, and park activities across ${city.name} occurring within the next 48 hours.`,
    window: '48h',
    filter: (e) => e.indoor_outdoor === 'outdoor' || (e.indoor_outdoor === 'mixed' && (e.category_tags || []).includes('outdoor'))
  },
  'comedy': {
    slug: 'comedy',
    aliases: ['standup', 'improv', 'comedy-shows'],
    title: 'Live Comedy Shows (Next 48 Hours)',
    headingSuffix: 'Live Comedy Shows (Next 48 Hours)',
    metaDescTemplate: (city) => `Find live standup comedy and improv shows in the next 48 hours in ${city.name}, CO.`,
    intro: (city) => `Catch top touring headliners, local showcase nights, and uncensored standup comedy sets across ${city.name} over the next 48 hours.`,
    window: '48h',
    filter: (e) => (e.category_tags || []).includes('comedy')
  }
};

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function getDateBounds(windowType) {
  const now = new Date();
  const max48 = new Date(now.getTime() + 48 * 3600e3);
  return [now, max48];
}

async function fetchEvents(city, topic) {
  const [start, end] = getDateBounds(topic.window);
  
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_feed_events_v2`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      p_user_lat: city.lat,
      p_user_lng: city.lon,
      p_radius_miles: city.radius || 25,
      p_window_start: start.toISOString(),
      p_window_end: end.toISOString(),
      p_mode: null
    })
  });

  if (!r.ok) {
    console.error('Supabase query failed in city guide:', r.status);
    return [];
  }

  let events = await r.json();
  if (!Array.isArray(events)) return [];

  // Enforce strict 48-hour boundary in-memory
  const nowMs = Date.now();
  const max48Ms = nowMs + 48 * 3600e3;
  events = events.filter(e => {
    const t = new Date(e.start_time).getTime();
    return t >= nowMs && t <= max48Ms;
  });

  // Apply topic filter
  if (typeof topic.filter === 'function') {
    events = events.filter(topic.filter);
  }

  return events;
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, ORIGIN);
    const parts = u.pathname.split('/').filter(Boolean);
    const citySlug = parts[0]?.toLowerCase();
    const topicSlug = parts[1]?.toLowerCase() || 'this-weekend';

    const city = CITIES[citySlug];
    if (!city) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>City Not Found</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    // Resolve topic or alias
    let topicKey = Object.keys(TOPICS).find(k => k === topicSlug || TOPICS[k].aliases.includes(topicSlug));
    if (!topicKey) topicKey = 'this-weekend';
    const topic = TOPICS[topicKey];

    const events = await fetchEvents(city, topic);
    const pageUrl = `${ORIGIN}/${city.slug}/${topic.slug}`;
    const pageTitle = `${city.name} ${topic.headingSuffix} — Brinkberry`;
    const metaDesc = topic.metaDescTemplate(city);

    // Build ItemList JSON-LD Schema
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: pageTitle,
      description: metaDesc,
      url: pageUrl,
      numberOfItems: events.length,
      itemListElement: events.map((e, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': 'Event',
          name: e.title,
          description: e.description || `${e.title} at ${e.venue_name}`,
          startDate: e.start_time,
          endDate: e.end_time || undefined,
          eventStatus: 'https://schema.org/EventScheduled',
          url: `${ORIGIN}/event/${e.id}`,
          location: {
            '@type': 'Place',
            name: e.venue_name,
            address: {
              '@type': 'PostalAddress',
              addressLocality: e.city || city.name,
              addressRegion: 'CO',
              addressCountry: 'US'
            }
          },
          offers: {
            '@type': 'Offer',
            price: e.price_min ?? (e.price_status === 'free' ? '0' : undefined),
            priceCurrency: 'USD',
            url: buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url, e.id),
            availability: 'https://schema.org/InStock'
          },
          image: e.canonical_image_url ? [e.canonical_image_url] : undefined
        }
      }))
    });

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${esc(pageUrl)}">
  <meta name="robots" content="${events.length === 0 ? 'noindex, follow' : 'index, follow'}">
  
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${esc(pageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root {
      --bg: #080610;
      --card-bg: #151120;
      --card-border: #282038;
      --text: #f4eff8;
      --text-dim: #9b90aa;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --tag-bg: #221a30;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
    .container { max-width: 1080px; margin: auto; padding: 20px 20px 60px; }
    
    header.top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 1px solid #1c1628; }
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; }
    .brand b { color: var(--accent); }
    
    .hero { padding: 28px 0 20px; }
    .breadcrumbs { font-size: 13px; color: var(--text-dim); margin-bottom: 10px; }
    .breadcrumbs a { color: var(--primary); text-decoration: none; font-weight: 600; }
    h1 { font-size: clamp(32px, 5.5vw, 48px); line-height: 1.1; margin: 0 0 12px; font-weight: 850; letter-spacing: -0.02em; }
    .intro { font-size: 17px; color: #d8ceed; max-width: 820px; line-height: 1.55; margin: 0 0 16px; }
    
    .subnav { display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0 28px; }
    .subnav a {
      background: #191424;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: 999px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.15s;
    }
    .subnav a:hover { background: #261f36; border-color: #403458; }
    .subnav a.active { background: var(--primary); border-color: var(--primary); color: var(--primary-dark); font-weight: 800; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; margin-top: 16px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, border-color 0.15s; text-decoration: none; color: inherit; }
    .card:hover { transform: translateY(-3px); border-color: #4a3a66; }
    .card-img { height: 155px; background: linear-gradient(135deg, #24142d, #4a1832); background-size: cover; background-position: center; position: relative; }
    .card-body { padding: 18px; flex: 1; display: flex; flex-direction: column; }
    .card-title { font-size: 18px; font-weight: 800; line-height: 1.25; margin: 6px 0 8px; color: #fff; }
    .card-meta { color: var(--text-dim); font-size: 13px; margin-bottom: 4px; }
    .why-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
    .why-tag { font-size: 11px; font-weight: 700; background: var(--tag-bg); border: 1px solid #362a4d; color: #d6cced; padding: 3px 8px; border-radius: 999px; }
    
    .card-footer { margin-top: auto; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #201930; }
    .card-price { font-weight: 800; color: #fff; font-size: 14px; }
    .btn-ticket-sm { background: var(--primary); color: var(--primary-dark); font-size: 13px; font-weight: 800; padding: 7px 14px; border-radius: 999px; text-decoration: none; border: 0; display: inline-block; }
    .btn-ticket-sm:hover { background: #ffa84d; }
    
    .neighborhood-bar { background: #130f1c; border: 1px solid var(--card-border); border-radius: 14px; padding: 14px 18px; margin: 28px 0; font-size: 14px; color: var(--text-dim); }
    .neighborhood-bar b { color: #fff; }
    
    .seo-section { margin-top: 48px; padding-top: 32px; border-top: 1px solid #1c1628; }
    .seo-section h2 { font-size: 22px; font-weight: 800; margin-bottom: 12px; }
    .seo-section p { color: #c4bbd5; font-size: 15px; line-height: 1.6; max-width: 860px; }
    
    .cities-nav { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .cities-nav a { color: var(--primary); text-decoration: none; font-weight: 700; font-size: 14px; margin-right: 12px; }
    .cities-nav a:hover { text-decoration: underline; }
    
    .cta-banner { background: linear-gradient(135deg, #2a1120, #161026); border: 1px solid #4a2038; border-radius: 18px; padding: 24px; margin-top: 36px; text-align: center; }
    .cta-banner h3 { margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #fff; }
    .cta-banner p { color: var(--text-dim); margin: 0 0 16px; font-size: 15px; }
    .cta-banner a.btn-cta { background: var(--accent); color: #fff; padding: 10px 22px; border-radius: 999px; text-decoration: none; font-weight: 800; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <header class="top">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <a class="btn-ticket-sm" href="/">Live Radar Feed →</a>
    </header>

    <div class="hero">
      <div class="breadcrumbs">
        <a href="/">Brinkberry</a> / <a href="/${city.slug}">${city.name}</a> / <span>${topic.title}</span>
      </div>
      <h1>${esc(city.name)} ${esc(topic.headingSuffix)}</h1>
      <p class="intro">${esc(topic.intro(city))}</p>
      
      <!-- Sub-navigation for segments -->
      <nav class="subnav">
        <a class="${(topicKey === 'next-48-hours' || topicKey === 'this-weekend') ? 'active' : ''}" href="/${city.slug}/next-48-hours">⚡ Next 48 Hours</a>
        <a class="${topicKey === 'music' ? 'active' : ''}" href="/${city.slug}/music">🎵 Live Music</a>
        <a class="${topicKey === 'arts' ? 'active' : ''}" href="/${city.slug}/arts">🎨 Arts & Culture</a>
        <a class="${topicKey === 'theater' ? 'active' : ''}" href="/${city.slug}/theater">🎭 Theater</a>
        <a class="${topicKey === 'free' ? 'active' : ''}" href="/${city.slug}/free">🎟️ Free / Cheap</a>
        <a class="${topicKey === 'outdoor' ? 'active' : ''}" href="/${city.slug}/outdoor">🌲 Outdoor</a>
        <a class="${topicKey === 'comedy' ? 'active' : ''}" href="/${city.slug}/comedy">🎤 Comedy</a>
      </nav>
    </div>

    <!-- Live Event Grid -->
    <main>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <span style="font-weight:750; font-size:16px; color:#fff">${events.length} verified listings in ${esc(city.name)} area</span>
        <span style="font-size:13px; color:var(--text-dim)">Updated hourly</span>
      </div>
      
      ${events.length === 0 ? `
        <div style="background:#151120; border:1px solid var(--card-border); border-radius:18px; padding:48px 20px; text-align:center;">
          <h3 style="margin-top:0">No ${esc(topic.headingSuffix.toLowerCase())} found right now in ${esc(city.name)}</h3>
          <p style="color:var(--text-dim)">We only list verified events happening within the next 48 hours. Check back soon or explore our live interactive radar for nearby events.</p>
          <a class="btn-ticket-sm" href="/" style="margin-top:12px">View Full Live Radar →</a>
        </div>
      ` : `
        <div class="grid">
          ${events.map(e => {
            const startObj = new Date(e.start_time);
            const timeStr = startObj.toLocaleString('en-US', {
              timeZone: 'America/Denver',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            const safeTarget = buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url, e.id);
            const clickUrl = `/api/click?url=${encodeURIComponent(safeTarget)}&eventId=${encodeURIComponent(e.id)}&surface=city_guide_${topic.slug}`;
            const price = e.price_status === 'free' ? 'Free' : (e.price_display || 'Details');
            const dist = e.distance_miles != null ? Number(e.distance_miles).toFixed(1) + ' mi' : null;

            return `
              <article class="card">
                <a href="/event/${encodeURIComponent(e.id)}" style="text-decoration:none; color:inherit">
                  <div class="card-img" style="${e.canonical_image_url ? `background-image:url(${JSON.stringify(e.canonical_image_url)})` : ''}"></div>
                  <div class="card-body">
                    <div class="card-meta">${esc(e.category_tags?.[0] || e.category || 'event')}${e.neighborhood ? ` · ${esc(e.neighborhood)}` : ''}</div>
                    <div class="card-title">${esc(e.title)}</div>
                    <div class="card-meta">📍 ${esc(e.venue_name)}${e.city ? `, ${esc(e.city)}` : ''}</div>
                    <div class="card-meta">⏰ ${esc(timeStr)}${dist ? ` · <b>${dist}</b>` : ''}</div>
                    <div class="why-tags">
                      ${(e.category_tags || []).slice(0, 2).map(t => `<span class="why-tag">${esc(t)}</span>`).join('')}
                      ${e.indoor_outdoor === 'outdoor' ? '<span class="why-tag">Outdoor</span>' : ''}
                      ${e.price_status === 'free' ? '<span class="why-tag" style="color:var(--primary)">Free</span>' : ''}
                    </div>
                  </div>
                </a>
                <div class="card-footer" style="padding:0 18px 18px">
                  <div class="card-price">${esc(price)}</div>
                  <a class="btn-ticket-sm" href="${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">
                    Get Tickets →
                  </a>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `}
    </main>

    <!-- Neighborhoods Context -->
    <div class="neighborhood-bar">
      <b>Popular ${esc(city.name)} Hubs:</b> ${city.neighborhoods.map(esc).join(' · ')}
    </div>

    <!-- CTA to Live Radar -->
    <div class="cta-banner">
      <h3>Want to see what’s happening in ${esc(city.name)} right now?</h3>
      <p>Filter by real-time distance, time of day, and weather alerts on our live interactive feed.</p>
      <a class="btn-cta" href="/?city=${city.slug}">Launch Live Interactive Radar →</a>
    </div>

    <!-- Editorial & Cross-City SEO Footer -->
    <section class="seo-section">
      <h2>About Live Events in ${esc(city.name)}</h2>
      <p>${esc(city.desc)} Brinkberry actively tracks official cultural calendars, amphitheaters, live concert halls, and indie venues across the Colorado Front Range to help you make instant plans without endless scrolling.</p>
      
      <div style="margin-top:20px;">
        <h3 style="font-size:16px; margin-bottom:8px; color:#fff">Explore Other Front Range Cities:</h3>
        <div class="cities-nav">
          ${Object.values(CITIES).filter(c => c.slug !== city.slug).map(c => `
            <a href="/${c.slug}/next-48-hours">${c.name} 48h</a>
            <a href="/${c.slug}/music">${c.name} Music</a>
            <a href="/${c.slug}/arts">${c.name} Arts</a>
            <a href="/${c.slug}/theater">${c.name} Theater</a>
            <a href="/${c.slug}/free">${c.name} Free</a>
            <a href="/${c.slug}/outdoor">${c.name} Outdoor</a>
            <a href="/${c.slug}/comedy">${c.name} Comedy</a>
          `).join('')}
        </div>
      </div>
    </section>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Landing page error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(500).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Page temporarily unavailable</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
  }
};
