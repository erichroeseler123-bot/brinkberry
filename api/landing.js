const { buildSafeAffiliateUrl } = require('../lib/affiliate');
const { executeHybridFeed } = require('../lib/providers/engine');
const { trackGuideView, trackRacingGuideView } = require('../lib/telemetry');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const CITIES = {
  denver: {
    name: 'Denver',
    state: 'CO',
    country: 'US',
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
    country: 'US',
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
    country: 'US',
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
    country: 'US',
    slug: 'aurora',
    lat: 39.7294,
    lon: -104.8319,
    radius: 25,
    tagline: 'Diverse culture, arts & open-air events across the eastern metro.',
    desc: 'Discover food festivals, theater at Aurora Fox Arts Center, water recreation at Aurora Reservoir, and vibrant community arts across Aurora.',
    neighborhoods: ['Aurora Cultural Arts District', 'Stanley Marketplace', 'Aurora Reservoir', 'Nine Mile / Cherry Creek State Park']
  },
  'new-york': {
    name: 'New York',
    state: 'NY',
    country: 'US',
    slug: 'new-york',
    lat: 40.7128,
    lon: -74.0060,
    radius: 25,
    tagline: 'Live music, Broadway stages, and borough happenings.',
    desc: 'From iconic Broadway theatres and indie Brooklyn clubs to Manhattan gallery walks and open-air park festivals, find what is happening right now in NYC.',
    neighborhoods: ['Manhattan', 'Brooklyn', 'Williamsburg', 'Lower East Side', 'Greenwich Village', 'Midtown', 'DUMBO']
  },
  london: {
    name: 'London',
    state: '',
    country: 'UK',
    slug: 'london',
    lat: 51.5074,
    lon: -0.1278,
    radius: 25,
    tagline: 'West End theatre, historic venues, and live London culture.',
    desc: 'Explore live concerts across Soho and Camden, West End theatre premieres, world-class exhibitions, and community happenings across London.',
    neighborhoods: ['Soho', 'Camden', 'Shoreditch', 'West End', 'Southbank', 'Covent Garden', 'Brixton']
  },
  paris: {
    name: 'Paris',
    state: '',
    country: 'FR',
    slug: 'paris',
    lat: 48.8566,
    lon: 2.3522,
    radius: 25,
    tagline: 'Live arts, acoustic showcases, and Parisian nightlife.',
    desc: 'Find jazz sessions in Saint-Germain, open-air culture along the Seine, gallery vernissages, and vibrant live stages across Paris.',
    neighborhoods: ['Le Marais', 'Montmartre', 'Saint-Germain', 'Bastille', 'Canal Saint-Martin', 'Belleville']
  },
  tokyo: {
    name: 'Tokyo',
    state: '',
    country: 'JP',
    slug: 'tokyo',
    lat: 35.6762,
    lon: 139.6503,
    radius: 25,
    tagline: 'Live music, cutting-edge art, and dynamic Tokyo events.',
    desc: 'Discover Shibuya and Shinjuku live houses, Roppongi art exhibitions, outdoor park gatherings, and cultural nightlife across Tokyo.',
    neighborhoods: ['Shibuya', 'Shinjuku', 'Roppongi', 'Shimokitazawa', 'Ginza', 'Akihabara', 'Asakusa']
  },
  chicago: {
    name: 'Chicago',
    state: 'IL',
    country: 'US',
    slug: 'chicago',
    lat: 41.8781,
    lon: -87.6298,
    radius: 25,
    tagline: 'Legendary blues, comedy clubs, and lakefront gatherings.',
    desc: 'From legendary North Side comedy clubs and historic blues joints to Loop theater and open-air lakefront events in Chicago.',
    neighborhoods: ['The Loop', 'River North', 'Wicker Park', 'Lincoln Park', 'Logan Square', 'Hyde Park']
  },
  atlanta: {
    name: 'Atlanta',
    state: 'GA',
    country: 'US',
    slug: 'atlanta',
    lat: 33.7490,
    lon: -84.3880,
    radius: 30,
    timezone: 'America/New_York',
    tagline: 'The South’s premier live comedy & stand-up radar.',
    desc: 'From landmark rooms like The Punchline and Laughing Skull Lounge to Midtown indie showcases, discover tonight’s verified stand-up lineup in Atlanta.',
    neighborhoods: ['Midtown', 'Buckhead', 'Old Fourth Ward', 'Inman Park', 'Virginia-Highland', 'Little Five Points', 'East Atlanta Village']
  },
  birmingham: {
    name: 'Birmingham',
    state: 'AL',
    country: 'US',
    slug: 'birmingham',
    lat: 33.5186,
    lon: -86.8104,
    radius: 35,
    timezone: 'America/Chicago',
    tagline: 'Alabama’s premiere live stand-up comedy and showcase radar.',
    desc: 'From landmark rooms like the Stardome Comedy Club to Birmingham indie showcases, discover tonight’s verified stand-up lineup in Birmingham.',
    neighborhoods: ['Hoover', 'Downtown', 'Five Points South', 'Avondale', 'Lakeview']
  },
  charlotte: {
    name: 'Charlotte',
    state: 'NC',
    country: 'US',
    slug: 'charlotte',
    lat: 35.2271,
    lon: -80.8431,
    radius: 35,
    timezone: 'America/New_York',
    tagline: 'The Queen City’s definitive live stand-up comedy radar.',
    desc: 'From landmark stages like The Comedy Zone at the NC Music Factory to Queen City showcases, discover tonight’s verified stand-up lineup in Charlotte.',
    neighborhoods: ['Uptown', 'NC Music Factory', 'NoDa Arts District', 'South End', 'Dilworth', 'Plaza Midwood']
  },
  austin: {

    name: 'Austin',
    state: 'TX',
    country: 'US',
    slug: 'austin',
    lat: 30.2672,
    lon: -97.7431,
    radius: 25,
    tagline: 'Live Music Capital of the World.',
    desc: 'Catch nightly roots and indie gigs along Red River, open-air sessions at Zilker, and comedy showcases across Austin.',
    neighborhoods: ['Downtown / 6th St', 'Red River Cultural District', 'South Congress', 'East Austin', 'Zilker']
  },
  reykjavik: {
    name: 'Reykjavik',
    state: '',
    country: 'IS',
    slug: 'reykjavik',
    lat: 64.1466,
    lon: -21.9426,
    radius: 25,
    tagline: 'Live music, harbour culture, and Icelandic arts.',
    desc: 'Discover live indie shows in downtown Reykjavik, Harpa concert hall performances, art museum exhibits, and coastal open-air gatherings.',
    neighborhoods: ['Miðborg / Downtown', 'Grandagarður / Old Harbour', 'Vesturbær', 'Hlíðar']
  },
  edinburgh: {
    name: 'Edinburgh',
    state: '',
    country: 'UK',
    slug: 'edinburgh',
    lat: 55.9533,
    lon: -3.1883,
    radius: 25,
    tagline: 'Historic venues, live comedy, and Scottish arts.',
    desc: 'Explore live music along the Royal Mile, comedy clubs, theatre showcases, and open-air walks around Holyrood Park and Arthur’s Seat.',
    neighborhoods: ['Old Town', 'New Town', 'Leith', 'Stockbridge', 'Southside']
  },
  'eau-claire': {
    name: 'Eau Claire',
    state: 'WI',
    country: 'US',
    slug: 'eau-claire',
    lat: 44.8113,
    lon: -91.4985,
    radius: 25,
    tagline: 'Chippewa Valley indie comedy, live music, and arts.',
    desc: 'From The Plus comedy open mics and Pablo Center concerts to downtown riverfront gatherings.',
    neighborhoods: ['Downtown / Barstow St', 'Water Street', 'Confluence', 'Third Ward']
  }
};

function resolveCity(slug) {
  const norm = String(slug || '').toLowerCase().trim();
  if (CITIES[norm]) return CITIES[norm];
  
  // Format slug to proper city name (e.g. 'san-francisco' -> 'San Francisco')
  const formattedName = norm
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') || 'Local City';

  return {
    name: formattedName,
    state: '',
    country: '',
    slug: norm,
    lat: 39.7392,
    lon: -104.9903,
    radius: 25,
    tagline: `Verified live event radar for ${formattedName}.`,
    desc: `Discover live music, theater, arts exhibitions, free gatherings, and things to do right now across ${formattedName}.`,
    neighborhoods: ['Downtown', 'Arts District', 'City Center', 'Cultural Hub']
  };
}

const TOPICS = {
  'next-48-hours': {
    slug: 'next-48-hours',
    aliases: ['this-weekend', 'weekend', 'events-this-weekend', '48h', 'next-48h'],
    title: 'Events in the Next 48 Hours',
    headingSuffix: 'Events in the Next 48 Hours',
    metaDescTemplate: (city) => `Discover what's happening in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}. Live concerts, gatherings, outdoor activities, and things to do right now.`,
    intro: (city) => `Looking for immediate plans over the next 48 hours? Here is your radar of verified upcoming events, shows, and local gatherings happening across ${city.name} and the surrounding area.`,
    window: '48h',
    filter: (e) => true
  },
  'this-weekend': {
    slug: 'this-weekend',
    aliases: ['weekend', 'events-this-weekend'],
    title: 'Events in the Next 48 Hours',
    headingSuffix: 'Events in the Next 48 Hours',
    metaDescTemplate: (city) => `Discover what's happening in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}. Live concerts, gatherings, outdoor activities, and things to do right now.`,
    intro: (city) => `Looking for immediate plans over the next 48 hours? Here is your radar of verified upcoming events, shows, and local gatherings happening across ${city.name} and the surrounding area.`,
    window: '48h',
    filter: (e) => true
  },
  'music': {
    slug: 'music',
    aliases: ['live-music', 'concerts', 'jazz'],
    title: 'Live Music & Concerts (Next 48 Hours)',
    headingSuffix: 'Live Music & Concerts (Next 48 Hours)',
    metaDescTemplate: (city) => `Find live music, concerts, and jazz sessions in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}. From indie rock stages to jazz clubs and acoustic showcases.`,
    intro: (city) => `From intimate jazz clubs and indie rock stages to electronic sets and acoustic open stages, explore genuine live music across ${city.name} tonight and over the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const tags = e.category_tags || e.categories || [];
      const musicTags = ['music', 'jazz', 'rock', 'indie', 'bluegrass', 'roots', 'electronic', 'acoustic', 'concert'];
      return tags.some(t => musicTags.includes(t)) && !tags.includes('museum') && !tags.includes('gallery');
    }
  },
  'arts': {
    slug: 'arts',
    aliases: ['art', 'museums', 'exhibits', 'galleries'],
    title: 'Arts & Museum Exhibits (Next 48 Hours)',
    headingSuffix: 'Arts & Museum Exhibits (Next 48 Hours)',
    metaDescTemplate: (city) => `Explore art exhibitions, museum gallery tours, and cultural happenings in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}.`,
    intro: (city) => `Immerse yourself in world-class art collections, contemporary gallery walks, demonstrations, and cultural exhibits across ${city.name} happening over the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const tags = e.category_tags || e.categories || [];
      return tags.some(t => ['arts', 'museum', 'gallery', 'exhibit'].includes(t));
    }
  },
  'theater': {
    slug: 'theater',
    aliases: ['theatre', 'stage', 'plays', 'broadway', 'performing-arts'],
    title: 'Theater & Performing Arts (Next 48 Hours)',
    headingSuffix: 'Theater & Performing Arts (Next 48 Hours)',
    metaDescTemplate: (city) => `Find live theater, stage plays, and performing arts in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}.`,
    intro: (city) => `Experience live stage productions, vocal showcases, and local playwright previews in ${city.name} happening within the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const tags = e.category_tags || e.categories || [];
      return tags.some(t => ['theater', 'theatre', 'stage', 'broadway', 'play'].includes(t));
    }
  },
  'free': {
    slug: 'free',
    aliases: ['free-events', 'cheap'],
    title: 'Free & Budget-Friendly Events (Next 48 Hours)',
    headingSuffix: 'Free & Budget-Friendly Events (Next 48 Hours)',
    metaDescTemplate: (city) => `Free things to do in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}. Free admission concerts, open galleries, community markets, and outdoor gatherings.`,
    intro: (city) => `You don't need a huge budget to find memorable events and gatherings. Discover free admission events, community workouts, gallery walks, and open public gatherings across ${city.name} happening over the next 48 hours.`,
    window: '48h',
    filter: (e) => e.price_status === 'free' || e.priceStatus === 'free' || (e.price_min != null && e.price_min === 0)
  },
  'outdoor': {
    slug: 'outdoor',
    aliases: ['outside', 'outdoor-events'],
    title: 'Outdoor Events & Activities (Next 48 Hours)',
    headingSuffix: 'Outdoor Events & Activities (Next 48 Hours)',
    metaDescTemplate: (city) => `Outdoor events and open-air activities in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}. Guided walks, open-air yoga, outdoor amphitheater concerts, and park festivals.`,
    intro: (city) => `Make the most of the open air. Find guided walks, rooftop fitness sessions, open-air amphitheater shows, and park activities across ${city.name} occurring within the next 48 hours.`,
    window: '48h',
    filter: (e) => e.indoor_outdoor === 'outdoor' || e.indoorOutdoor === 'outdoor' || ((e.indoor_outdoor === 'mixed' || e.indoorOutdoor === 'mixed') && (e.category_tags || e.categories || []).includes('outdoor'))
  },
  'comedy': {
    slug: 'comedy',
    aliases: ['standup', 'improv', 'comedy-shows'],
    title: 'Live Stand-Up Comedy & Shows (Next 48 Hours)',
    headingSuffix: 'Live Stand-Up Comedy & Shows (Next 48 Hours)',
    metaDescTemplate: (city) => `Find live stand-up comedy, open mics, showcases, and improv shows in the next 48 hours in ${city.name}${city.state ? ', ' + city.state : ''}.`,
    intro: (city) => `Catch touring headliners, underground club showcases, bar open mics, and uncensored stand-up comedy sets across ${city.name} tonight and over the next 48 hours.`,
    window: '48h',
    filter: (e) => (e.category_tags || e.categories || []).includes('comedy')
  },
  'open-mics': {
    slug: 'open-mics',
    aliases: ['open-mic', 'comedy-open-mics', 'comedy-open-mic'],
    title: 'Live Comedy Open Mics Tonight & This Week',
    headingSuffix: 'Comedy Open Mics (Next 48 Hours)',
    metaDescTemplate: (city) => `Discover live comedy open mics and sign-up rooms in ${city.name}${city.state ? ', ' + city.state : ''} over the next 48 hours. Free and cheap stage time for comics and fans.`,
    intro: (city) => `Looking to get on stage or catch raw, unscripted local talent? Here are verified comedy open mics happening across ${city.name} tonight and over the next 48 hours.`,
    window: '48h',
    filter: (e) => {
      const isComedy = (e.category_tags || e.categories || []).includes('comedy');
      const text = `${e.title || ''} ${e.desc || e.description || ''}`.toLowerCase();
      return isComedy && (e.comedy?.showType === 'open_mic' || /open mic|open-mic|sign-up|signup/i.test(text));
    }
  },
  'comedy-clubs': {
    slug: 'comedy-clubs',
    aliases: ['comedy-rooms', 'standup-clubs'],
    title: 'Comedy Clubs & Headliners (Next 48 Hours)',
    headingSuffix: 'Comedy Clubs & Headliners (Next 48 Hours)',
    metaDescTemplate: (city) => `Explore comedy clubs, basement listening rooms, and headliner shows across ${city.name}${city.state ? ', ' + city.state : ''} over the next 48 hours.`,
    intro: (city) => `From historic brick-wall listening rooms to independent underground showcases, find the best comedy clubs and headliner performances in ${city.name}.`,
    window: '48h',
    filter: (e) => {
      const isComedy = (e.category_tags || e.categories || []).includes('comedy');
      const isClubShow = ['headliner', 'showcase', 'standup'].includes(e.comedy?.showType) || e.venueSlug != null || /club|underground|center|theater|theatre|comedy works/i.test(e.venue || e.venue_name || '');
      return isComedy && isClubShow;
    }
  },
  'cheap-comedy': {
    slug: 'cheap-comedy',
    aliases: ['free-comedy', 'cheap-standup', 'free-standup'],
    title: 'Free & Cheap Comedy Shows (Under $15)',
    headingSuffix: 'Free & Cheap Comedy Shows (Next 48 Hours)',
    metaDescTemplate: (city) => `Find free and low-cost comedy shows in ${city.name}${city.state ? ', ' + city.state : ''} tonight and this weekend. Affordable laughs for under $15.`,
    intro: (city) => `Great comedy doesn't have to cost a fortune. Discover free open mics, brewery showcases, and cheap admission comedy shows under $15 across ${city.name}.`,
    window: '48h',
    filter: (e) => {
      const isComedy = (e.category_tags || e.categories || []).includes('comedy');
      const isCheap = e.price_status === 'free' || e.priceStatus === 'free' || (e.price_min != null && e.price_min <= 15) || (e.priceLow != null && e.priceLow <= 15);
      return isComedy && isCheap;
    }
  },
  'racing': {
    slug: 'racing',
    aliases: ['races', 'motorsports', 'race-tracks', 'short-tracks'],
    title: 'Grassroots Motorsports & Short Track Racing (Next 48 Hours)',
    headingSuffix: 'Live Grassroots Motorsports (Next 48 Hours)',
    metaDescTemplate: (city) => `Discover grassroots short-track racing, dirt ovals, drag strips, and motorsports in ${city.name}${city.state ? ', ' + city.state : ''} over the next 48 hours.`,
    intro: (city) => `From high-banked paved short tracks and High Plains dirt ovals to Friday night drag strips, explore live grassroots racing across ${city.name} tonight and over the next 48 hours.`,
    window: '48h',
    filter: (e) => (e.category_tags || e.categories || []).includes('racing') || (e.category_tags || e.categories || []).includes('sports') || Boolean(e.racing)
  },
  'dirt-tracks': {
    slug: 'dirt-tracks',
    aliases: ['dirt-ovals', 'dirt-racing'],
    title: 'High Plains & Dirt Oval Racing (Next 48 Hours)',
    headingSuffix: 'Dirt Oval Racing (Next 48 Hours)',
    metaDescTemplate: (city) => `Catch live dirt oval racing, IMCA Modifieds, and sprint cars in ${city.name}${city.state ? ', ' + city.state : ''} over the next 48 hours.`,
    intro: (city) => `Hear the clay roar. Discover dirt track racing, sprint cars, stock cars, and late models across ${city.name} and surrounding fairgrounds.`,
    window: '48h',
    filter: (e) => Boolean(e.racing?.surface?.toLowerCase().includes('dirt') || e.trackType === 'dirt_oval')
  },
  'asphalt-tracks': {
    slug: 'asphalt-tracks',
    aliases: ['short-tracks', 'paved-ovals'],
    title: 'Paved Short Track Racing (Next 48 Hours)',
    headingSuffix: 'Paved Short Tracks (Next 48 Hours)',
    metaDescTemplate: (city) => `Find paved short track racing and NASCAR Weekly Series events in ${city.name}${city.state ? ', ' + city.state : ''} over the next 48 hours.`,
    intro: (city) => `High-banked asphalt battles, Super Late Models, Pro Trucks, and thrilling Figure-8 shootouts within driving distance of ${city.name}.`,
    window: '48h',
    filter: (e) => Boolean(e.racing?.surface?.toLowerCase().includes('asphalt') || e.racing?.surface?.toLowerCase().includes('paved') || e.trackType === 'asphalt_oval')
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
  let rawCurated = [];
  
  try {
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

    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) rawCurated = data;
    }
  } catch (err) {
    console.warn('[Landing] Curated query error:', err.message);
  }

  // Pioneer & Expansion Comedy Markets: load verified canonical comedy shows directly
  if (['atlanta', 'birmingham', 'charlotte'].includes(city.slug)) {
    try {
      const { getCityCanonicalShows } = require('../lib/comedy/expansion-ingestion');
      const canonicalShows = await getCityCanonicalShows(city.slug, { includePast: false });
      if (canonicalShows && canonicalShows.length > 0) {
        let events = canonicalShows;
        if (typeof topic.filter === 'function') {
          events = events.filter(topic.filter);
        }
        if (events.length > 0) return events;
      }
    } catch (err) {
      console.warn(`[Landing] ${city.name} canonical fetch error:`, err.message);
    }
  }


  // Execute hybrid dynamic engine so cities without database rows (London, NYC, Paris, etc.)
  // seamlessly render verified live events
  try {
    const hybridResult = await executeHybridFeed({
      lat: city.lat,
      lon: city.lon,
      radiusMiles: city.radius || 25,
      window: '48h',
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      mode: ['comedy', 'open-mics', 'comedy-clubs', 'cheap-comedy'].includes(topic.slug) ? 'comedy' :
            ['racing', 'dirt-tracks', 'asphalt-tracks'].includes(topic.slug) ? 'racing' : '',
      category: ['comedy', 'open-mics', 'comedy-clubs', 'cheap-comedy'].includes(topic.slug) ? 'comedy' :
                ['racing', 'dirt-tracks', 'asphalt-tracks'].includes(topic.slug) ? 'racing' : '',
      curatedEvents: (rawCurated || []).map(e => ({
        ...e,
        source: e.source || 'curated',
        confirmationStatus: e.confirmationStatus || 'confirmed_by_official_calendar',
        sourceEvidence: e.sourceEvidence || {
          sourceId: 'curated_supabase',
          sourceUrl: e.canonical_url,
          fetchedAt: e.last_verified_at || new Date().toISOString(),
          exactConfirmationFields: {
            title: true,
            date: true,
            venue: true
          }
        },
        lastVerifiedAt: e.last_verified_at || new Date().toISOString()
      })),
      enableDynamic: true
    });

    let events = hybridResult.events || [];
    if (typeof topic.filter === 'function') {
      events = events.filter(topic.filter);
    }
    return events;
  } catch (hybridErr) {
    console.warn('[Landing] Hybrid feed fallback to curated:', hybridErr.message);
    let events = rawCurated;
    const nowMs = Date.now();
    const max48Ms = nowMs + 48 * 3600e3;
    events = events.filter(e => {
      const t = new Date(e.start_time).getTime();
      return t >= nowMs && t <= max48Ms;
    });
    if (typeof topic.filter === 'function') {
      events = events.filter(topic.filter);
    }
    return events;
  }
}

module.exports = async (req, res) => {
  const sendHtml = (status, html) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (res.status && typeof res.status === 'function') {
      const ret = res.status(status);
      if (ret && typeof ret.send === 'function') return ret.send(html);
    }
    if (typeof res.send === 'function') return res.send(html);
    return res.end(html);
  };

  try {
    const u = new URL(req.url, ORIGIN);
    const parts = u.pathname.split('/').filter(Boolean);
    const citySlug = parts[0]?.toLowerCase();
    const topicSlug = parts[1]?.toLowerCase() || 'this-weekend';
    const city = CITIES[citySlug];
    if (!city) {
      return sendHtml(404, '<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>City Not Found</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    // Resolve topic or alias
    let topicKey = Object.keys(TOPICS).find(k => k === topicSlug || TOPICS[k].aliases.includes(topicSlug));
    if (!topicKey) topicKey = 'this-weekend';
    const topic = TOPICS[topicKey];

    trackGuideView(city.slug, topicKey);
    if (['racing', 'dirt-tracks', 'asphalt-tracks'].includes(topicKey)) {
      const discipline = topicKey === 'dirt-tracks' ? 'dirt' : topicKey === 'asphalt-tracks' ? 'asphalt' : 'all';
      trackRacingGuideView(city.slug, discipline);
    }

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
          description: e.description || e.desc || `${e.title} at ${e.venue_name || e.venue}`,
          startDate: e.start_time || e.start,
          endDate: e.end_time || e.end || undefined,
          eventStatus: 'https://schema.org/EventScheduled',
          url: `${ORIGIN}/event/${e.id}`,
          location: {
            '@type': 'Place',
            name: e.venue_name || e.venue,
            address: {
              '@type': 'PostalAddress',
              addressLocality: e.city || city.name,
              addressRegion: e.state || city.state || '',
              addressCountry: city.country || 'US'
            }
          },
          offers: {
            '@type': 'Offer',
            price: e.price_min ?? e.priceLow ?? (e.price_status === 'free' || e.priceStatus === 'free' ? '0' : undefined),
            priceCurrency: 'USD',
            url: buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url || e.ticketUrl, e.id),
            availability: 'https://schema.org/InStock'
          },
          image: (e.canonical_image_url || e.image) ? [e.canonical_image_url || e.image] : undefined
        }
      }))
    });

    return sendHtml(200, `<!doctype html>
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
  
  <!-- Impact.com / Trackonomics Publisher Tag -->
  <script type="text/javascript">(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7811847-56b2-4d75-8496-a98b675d87f81.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');</script>

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

    ${(topicKey === 'comedy' || topicKey === 'open-mics' || topicKey === 'comedy-clubs' || topicKey === 'cheap-comedy') ? `
      <div style="background:linear-gradient(135deg, rgba(255,184,107,0.12) 0%, rgba(26,20,38,0.85) 100%); border:1px solid rgba(255,184,107,0.3); border-radius:16px; padding:18px 22px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="color:var(--primary); font-weight:800; font-size:15px; margin-bottom:3px;">🎤 Producing a comedy show or hosting an open mic in ${esc(city.name)}?</div>
          <div style="color:var(--text-dim); font-size:13.5px;">List your show on Brinkberry for free. Direct box office links, zero fees, and instant radar discovery.</div>
        </div>
        <a href="/submit-comedy" class="btn-ticket-sm" style="background:var(--primary); color:var(--primary-dark); padding:9px 18px; font-size:13.5px; font-weight:800; text-decoration:none; border-radius:999px;">Submit Your Show for Free →</a>
      </div>
    ` : ''}

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
            const startObj = new Date(e.start_time || e.start);
            const timeStr = startObj.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });
            const safeTarget = buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url || e.ticketUrl, e.id);
            const clickUrl = `/api/click?url=${encodeURIComponent(safeTarget)}&eventId=${encodeURIComponent(e.id)}&surface=city_guide_${topic.slug}`;
            const price = (e.price_status === 'free' || e.priceStatus === 'free') ? 'Free' : (e.price_display || e.priceDisplay || 'Details');
            const distVal = e.distance_miles != null ? e.distance_miles : e.distanceMiles;
            const dist = distVal != null ? Number(distVal).toFixed(1) + ' mi' : null;
            const img = e.canonical_image_url || e.image;

            const eventLink = e.slug ? `/shows/${encodeURIComponent(e.slug)}` : `/event/${encodeURIComponent(e.id)}`;
            const isOfficialCal = (e.confirmationStatus || e.confirmation_status) === 'confirmed_by_official_calendar';
            const ticketDestination = isOfficialCal ? (e.ticket_url || e.ticketUrl || safeTarget) : clickUrl;

            return `
              <article class="card">
                <a href="${esc(eventLink)}" style="text-decoration:none; color:inherit">
                  <div class="card-img" style="${img ? `background-image:url('${encodeURI(img).replace(/'/g, '%27')}')` : ''}">
                    ${img ? `<img src="${esc(img)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" loading="lazy" onerror="this.style.display='none'">` : ''}
                  </div>
                  <div class="card-body">
                    <div class="card-meta">${esc((e.category_tags || e.categories)?.[0] || e.category || 'event')}${e.neighborhood ? ` · ${esc(e.neighborhood)}` : ''}</div>
                    <div class="card-title">${esc(e.title)}</div>
                    <div class="card-meta">📍 ${esc(e.venue_name || e.venue)}${e.city ? `, ${esc(e.city)}` : ''}</div>
                    <div class="card-meta">⏰ ${esc(timeStr)}${dist ? ` · <b>${dist}</b>` : ''}</div>
                    <div class="why-tags">
                      ${isOfficialCal ? '<span class="why-tag" style="color:#64dfdf">Official Calendar</span>' : ''}
                      ${(e.category_tags || e.categories || []).slice(0, 2).map(t => `<span class="why-tag">${esc(t)}</span>`).join('')}
                      ${e.comedy?.showType ? `<span class="why-tag" style="color:var(--primary)">${esc(e.comedy.showType)}</span>` : ''}
                      ${e.comedy?.ageLimit && e.comedy.ageLimit !== 'unknown' ? `<span class="why-tag" style="color:var(--accent)">${esc(e.comedy.ageLimit)}</span>` : ''}
                      ${(e.indoor_outdoor === 'outdoor' || e.indoorOutdoor === 'outdoor') ? '<span class="why-tag">Outdoor</span>' : ''}
                      ${(e.price_status === 'free' || e.priceStatus === 'free') ? '<span class="why-tag" style="color:var(--primary)">Free</span>' : ''}
                    </div>
                  </div>
                </a>
                <div class="card-footer" style="padding:0 18px 18px">
                  <div class="card-price">${esc(price)}</div>
                  <a class="btn-ticket-sm" href="${esc(ticketDestination)}" target="_blank" rel="noopener noreferrer">
                    Get Tickets →
                  </a>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `}
    </main>

    ${topicKey === 'comedy' ? `
      <div style="background:linear-gradient(135deg, rgba(38,20,55,0.7), rgba(18,13,28,0.9)); border:1px solid #3d2757; border-radius:18px; padding:22px; margin-top:28px; text-align:center;">
        <h3 style="margin:0 0 6px; font-size:18px; color:#fff">🎤 Running an Open Mic or Stand-Up Showcase in ${esc(city.name)}?</h3>
        <p style="color:var(--text-dim); margin:0 0 14px; font-size:14px">Get your independent room, brewery showcase, or open mic on Brinkberry's live radar for free.</p>
        <a href="/submit-comedy" class="btn-ticket-sm" style="background:var(--primary); color:var(--primary-dark); font-weight:800;">+ Submit a Comedy Show</a>
      </div>
    ` : ''}

    <!-- Neighborhoods Context -->
    <div class="neighborhood-bar">
      <b>Popular ${esc(city.name)} Hubs:</b> ${city.neighborhoods.map(esc).join(' · ')}
    </div>

    <!-- CTA to Live Radar -->
    <div class="cta-banner">
      <h3>Want to see what’s happening in ${esc(city.name)} right now?</h3>
      <p>Filter by real-time distance, time of day, and weather alerts on our live interactive feed.</p>
      <a class="btn-cta" href="/?city=${encodeURIComponent(city.slug)}">Launch Live Interactive Radar →</a>
    </div>

    <!-- Editorial & Cross-City SEO Footer -->
    <section class="seo-section">
      <h2>About Live Events in ${esc(city.name)}</h2>
      <p>${esc(city.desc)} Brinkberry actively tracks official cultural calendars, amphitheaters, live concert halls, and indie venues to help you make instant plans without endless scrolling.</p>
      
      <div style="margin-top:20px;">
        <h3 style="font-size:16px; margin-bottom:8px; color:#fff">${['denver', 'boulder', 'golden', 'aurora'].includes(city.slug) ? 'Explore Other Front Range Cities & World Hubs:' : 'Explore Other Popular Cities:'}</h3>
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
    return sendHtml(500, '<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Page temporarily unavailable</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
  }
};
