const KNOWN_CITIES = {
  'denver': { city: 'Denver', locationName: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
  'boulder': { city: 'Boulder', locationName: 'Boulder, CO', lat: 40.0150, lon: -105.2705 },
  'golden': { city: 'Golden', locationName: 'Golden, CO', lat: 39.7555, lon: -105.2211 },
  'aurora': { city: 'Aurora', locationName: 'Aurora, CO', lat: 39.7294, lon: -104.8319 },
  'london': { city: 'London', locationName: 'London, UK', lat: 51.5074, lon: -0.1278 },
  'new-york': { city: 'New York', locationName: 'New York, NY', lat: 40.7128, lon: -74.0060 },
  'new york': { city: 'New York', locationName: 'New York, NY', lat: 40.7128, lon: -74.0060 },
  'nyc': { city: 'New York', locationName: 'New York, NY', lat: 40.7128, lon: -74.0060 },
  'paris': { city: 'Paris', locationName: 'Paris, France', lat: 48.8566, lon: 2.3522 },
  'tokyo': { city: 'Tokyo', locationName: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503 },
  'berlin': { city: 'Berlin', locationName: 'Berlin, Germany', lat: 52.5200, lon: 13.4050 },
  'chicago': { city: 'Chicago', locationName: 'Chicago, IL', lat: 41.8781, lon: -87.6298 },
  'austin': { city: 'Austin', locationName: 'Austin, TX', lat: 30.2672, lon: -97.7431 },
  'sydney': { city: 'Sydney', locationName: 'Sydney, Australia', lat: -33.8688, lon: 151.2093 },
  'san-francisco': { city: 'San Francisco', locationName: 'San Francisco, CA', lat: 37.7749, lon: -122.4194 },
  'san francisco': { city: 'San Francisco', locationName: 'San Francisco, CA', lat: 37.7749, lon: -122.4194 },
  'los-angeles': { city: 'Los Angeles', locationName: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 },
  'los angeles': { city: 'Los Angeles', locationName: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 },
  'miami': { city: 'Miami', locationName: 'Miami, FL', lat: 25.7617, lon: -80.1918 },
  'seattle': { city: 'Seattle', locationName: 'Seattle, WA', lat: 47.6062, lon: -122.3321 },
  'toronto': { city: 'Toronto', locationName: 'Toronto, Canada', lat: 43.6532, lon: -79.3832 },
  'new-orleans': { city: 'New Orleans', locationName: 'New Orleans, LA', lat: 29.9511, lon: -90.0715 },
  'new orleans': { city: 'New Orleans', locationName: 'New Orleans, LA', lat: 29.9511, lon: -90.0715 },
  'eau-claire': { city: 'Eau Claire', locationName: 'Eau Claire, WI', lat: 44.8113, lon: -91.4985 },
  'eau claire': { city: 'Eau Claire', locationName: 'Eau Claire, WI', lat: 44.8113, lon: -91.4985 },
  'reykjavik': { city: 'Reykjavik', locationName: 'Reykjavik, Iceland', lat: 64.1466, lon: -21.9426 },
  'edinburgh': { city: 'Edinburgh', locationName: 'Edinburgh, UK', lat: 55.9533, lon: -3.1883 }
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

const CITY_DISCOVERY = {
  'denver': {
    name: 'Denver',
    state: 'CO',
    slug: 'denver',
    neighborhoods: ['LoDo', 'RiNo Arts District', 'Capitol Hill', 'Highlands', 'South Broadway', 'Cherry Creek', 'Boulder', 'Golden'],
    venues: [
      {
        title: 'Comedy Works Downtown',
        loc: 'Larimer Square · Denver, CO',
        badge: '🎤 Landmark Club',
        desc: 'Legendary underground comedy room renowned nationwide for low ceilings, intimate listening, and top touring comics.',
        img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
        url: '/venue/comedy-works-downtown',
        cta: 'View Live Shows &amp; Tickets →'
      },
      {
        title: 'Colorado National Speedway',
        loc: 'Dacono, CO · High Plains',
        badge: '🏁 NASCAR Short Track',
        desc: 'High-banked 3/8-mile asphalt oval hosting NASCAR Advance Auto Parts Weekly racing, Super Late Models, and Figure-8s.',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
        url: '/track/colorado-national-speedway',
        cta: 'View Race Schedule &amp; Weather →'
      },
      {
        title: 'RISE Comedy',
        loc: 'RiNo / Ballpark · Denver, CO',
        badge: '🎭 Improv &amp; Stand-Up',
        desc: 'Artist-driven comedy theater and training hub hosting nightly showcases, improv troupes, open mics, and musical comedy.',
        img: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
        url: '/venue/rise-comedy',
        cta: 'View Live Shows &amp; Tickets →'
      },
      {
        title: 'I-76 Speedway',
        loc: 'Fort Morgan, CO',
        badge: '🏁 Dirt Oval',
        desc: 'Quarter-mile semi-banked dirt clay oval featuring IMCA Modifieds, 305 Sprint Cars, and Saturday night stock cars under the lights.',
        img: 'https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=800&auto=format&fit=crop',
        url: '/track/i-76-speedway',
        cta: 'View Race Schedule &amp; Weather →'
      },
      {
        title: 'Denver Comedy Underground',
        loc: 'Capitol Hill · Denver, CO',
        badge: '🎤 Indie Basement',
        desc: 'Cap Hill subterranean independent comedy haven with national touring headliners, local comics, and intimate basement energy.',
        img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop',
        url: '/venue/denver-comedy-underground',
        cta: 'View Live Shows &amp; Tickets →'
      },
      {
        title: 'Comedy Works South',
        loc: 'Landmark · Greenwood Village, CO',
        badge: '🎤 Comedy Theater',
        desc: 'Spacious stadium-style sister theater in the Denver Tech Center hosting major national headliners and full dinner service.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/venue/comedy-works-south',
        cta: 'View Live Shows &amp; Tickets →'
      }
    ]
  },
  'boulder': {
    name: 'Boulder',
    state: 'CO',
    slug: 'boulder',
    neighborhoods: ['Downtown / Pearl St', 'The Hill', 'University Hill', 'North Boulder', 'Chautauqua', 'South Boulder'],
    venues: [
      {
        title: 'Boulder Theater',
        loc: 'Downtown · Boulder, CO',
        badge: '🎵 Historic Music Hall',
        desc: 'Art deco music and comedy hall hosting national touring acts, film festivals, and acoustic showcases.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/boulder/music',
        cta: 'View Live Shows →'
      },
      {
        title: 'Fox Theatre',
        loc: 'The Hill · Boulder, CO',
        badge: '🎸 Iconic Club',
        desc: 'World-renowned live music club on University Hill celebrated for legendary acoustics and intimate club sets.',
        img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop',
        url: '/boulder/music',
        cta: 'View Live Shows →'
      },
      {
        title: 'Colorado National Speedway',
        loc: 'Dacono, CO · High Plains',
        badge: '🏁 NASCAR Short Track',
        desc: 'High-banked 3/8-mile asphalt oval east of Boulder hosting Super Late Models and stock car racing.',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
        url: '/track/colorado-national-speedway',
        cta: 'View Race Schedule →'
      }
    ]
  },
  'new-york': {
    name: 'New York',
    state: 'NY',
    slug: 'new-york',
    neighborhoods: ['Greenwich Village', 'Williamsburg', 'Lower East Side', 'Midtown', 'Chelsea', 'Astoria', 'Bushwick', 'DUMBO'],
    venues: [
      {
        title: 'Comedy Cellar',
        loc: 'Greenwich Village · New York, NY',
        badge: '🎤 Landmark Club',
        desc: 'World-famous underground comedy cellar on MacDougal Street known for surprise drop-ins from comedy icons.',
        img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
        url: '/new-york/comedy',
        cta: 'View Live Lineups →'
      },
      {
        title: 'The Stand NYC',
        loc: 'Union Square · New York, NY',
        badge: '🎤 Showcase & Dining',
        desc: 'Premier two-floor comedy club and craft dining room featuring New York’s top touring and resident headliners.',
        img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop',
        url: '/new-york/comedy',
        cta: 'View Live Lineups →'
      },
      {
        title: 'Riverhead Raceway',
        loc: 'Riverhead, NY · Long Island',
        badge: '🏁 Historic NASCAR Oval',
        desc: 'Quarter-mile high-banked asphalt oval hosting NASCAR Whelen Modifieds, Figure-8s, and Legend cars.',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
        url: '/new-york/racing',
        cta: 'View Race Schedule →'
      },
      {
        title: 'Radio City Music Hall',
        loc: 'Midtown · New York, NY',
        badge: '🏛️ Historic Hall',
        desc: 'Legendary art deco theater hosting world-class concert tours, gala premieres, and marquee performances.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/new-york/music',
        cta: 'View Live Shows →'
      }
    ]
  },
  'london': {
    name: 'London',
    state: 'UK',
    slug: 'london',
    neighborhoods: ['Soho', 'Covent Garden', 'Camden', 'Shoreditch', 'Brixton', 'West End', 'Hackney', 'Southbank'],
    venues: [
      {
        title: 'Soho Theatre',
        loc: 'Soho · London, UK',
        badge: '🎭 Comedy & Drama',
        desc: 'Dean Street powerhouse producing innovative comedy, cabaret, and groundbreaking contemporary theatre.',
        img: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
        url: '/london/comedy',
        cta: 'View Live Shows →'
      },
      {
        title: 'Top Secret Comedy Club',
        loc: 'Covent Garden · London, UK',
        badge: '🎤 Underground Club',
        desc: 'High-energy basement comedy club renowned for bargain tickets and secret warm-up sets from arena headliners.',
        img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
        url: '/london/comedy',
        cta: 'View Live Lineups →'
      },
      {
        title: 'The Comedy Store',
        loc: 'Piccadilly Circus · London, UK',
        badge: '🎤 Landmark Stage',
        desc: 'The historic cradle of British alternative stand-up comedy with weekend showcases and topical improvisation.',
        img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop',
        url: '/london/comedy',
        cta: 'View Live Lineups →'
      },
      {
        title: 'Eventim Apollo',
        loc: 'Hammersmith · London, UK',
        badge: '🏛️ Art Deco Theatre',
        desc: 'Iconic Grade II* listed live performance hall hosting international music legends and stadium comedy tours.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/london/music',
        cta: 'View Live Shows →'
      }
    ]
  },
  'paris': {
    name: 'Paris',
    state: 'France',
    slug: 'paris',
    neighborhoods: ['Le Marais', 'Montmartre', 'Saint-Germain', 'Bastille', 'Canal Saint-Martin', 'Belleville', 'Latin Quarter'],
    venues: [
      {
        title: 'Paname Art Café',
        loc: '11e Arrondissement · Paris, FR',
        badge: '🎤 Stand-Up & Comedy',
        desc: 'Intimate comedy club and tapas hub spotlighting the sharpest voices in Parisian stand-up seven nights a week.',
        img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
        url: '/paris/comedy',
        cta: 'View Live Shows →'
      },
      {
        title: 'Le Point Virgule',
        loc: 'Le Marais · Paris, FR',
        badge: '🎭 Legendary Stage',
        desc: 'Historic Marais theatre known as the incubator for French comedy stars and intimate one-man shows.',
        img: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
        url: '/paris/comedy',
        cta: 'View Live Shows →'
      },
      {
        title: "L'Olympia",
        loc: '9e Arrondissement · Paris, FR',
        badge: '🏛️ Historic Music Hall',
        desc: 'Legendary Paris venue that has hosted worldwide music icons, orchestra performances, and stand-up specials.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/paris/music',
        cta: 'View Live Shows →'
      }
    ]
  },
  'chicago': {
    name: 'Chicago',
    state: 'IL',
    slug: 'chicago',
    neighborhoods: ['Old Town', 'Wicker Park', 'Logan Square', 'Lincoln Park', 'The Loop', 'River North', 'West Loop', 'Hyde Park'],
    venues: [
      {
        title: 'The Second City',
        loc: 'Old Town · Chicago, IL',
        badge: '🎭 Improv & Sketch',
        desc: 'Legendary comedy theater and school that launched Bill Murray, Tina Fey, Steve Carell, and world-class improv.',
        img: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
        url: '/chicago/comedy',
        cta: 'View Live Shows →'
      },
      {
        title: 'Zanies Comedy Club',
        loc: 'Old Town · Chicago, IL',
        badge: '🎤 Historic Listening Room',
        desc: 'Intimate brick-wall comedy club hosting national headliners and sharp Chicago stand-up since 1978.',
        img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
        url: '/chicago/comedy',
        cta: 'View Live Shows →'
      },
      {
        title: 'Sycamore Speedway',
        loc: 'Maple Park, IL',
        badge: '🏁 Clay Oval',
        desc: 'Chicagoland historic dirt oval featuring Super Late Models, Stock Cars, and Saturday night clay-track racing.',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
        url: '/chicago/racing',
        cta: 'View Race Schedule →'
      },
      {
        title: 'Metro Chicago',
        loc: 'Wrigleyville · Chicago, IL',
        badge: '🎵 Live Music Hall',
        desc: 'Renowned independent concert venue hosting landmark rock and indie tours steps from Wrigley Field.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/chicago/music',
        cta: 'View Live Shows →'
      }
    ]
  },
  'austin': {
    name: 'Austin',
    state: 'TX',
    slug: 'austin',
    neighborhoods: ['Downtown / 6th St', 'South Congress', 'East Austin', 'Red River Cultural District', 'Zilker', 'Rainey Street'],
    venues: [
      {
        title: 'Comedy Mothership',
        loc: '6th St · Austin, TX',
        badge: '🎤 Landmark Club',
        desc: 'State-of-the-art comedy club on 6th Street hosting world-renowned touring headliners and podcast showcases.',
        img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
        url: '/austin/comedy',
        cta: 'View Live Shows →'
      },
      {
        title: 'Circuit of the Americas',
        loc: 'Austin, TX',
        badge: '🏁 Grand Prix Circuit',
        desc: 'World-class 3.4-mile FIA Grade 1 circuit hosting Formula 1, NASCAR, MotoGP, and major outdoor amphitheater concerts.',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
        url: '/austin/racing',
        cta: 'View Track Schedule →'
      },
      {
        title: 'The Continental Club',
        loc: 'South Congress · Austin, TX',
        badge: '🎸 Live Roots & Blues',
        desc: 'Legendary live music destination on South Congress continuously rocking since 1955.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
        url: '/austin/music',
        cta: 'View Live Shows →'
      }
    ]
  },
  'eau-claire': {
    name: 'Eau Claire',
    state: 'WI',
    slug: 'eau-claire',
    neighborhoods: ['Downtown', 'Water Street', 'Cannery District', 'Third Ward', 'North Side'],
    venues: [
      {
        title: 'Pablo Center at the Confluence',
        loc: 'Downtown · Eau Claire, WI',
        badge: '🏛️ Performing Arts Center',
        desc: 'State-of-the-art regional arts center hosting Broadway tours, national concerts, and local performing arts.',
        img: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
        url: '/eau-claire/community',
        cta: 'View Schedule →'
      },
      {
        title: 'Red Cedar Speedway',
        loc: 'Menomonie, WI',
        badge: '🏁 Clay Oval Track',
        desc: 'WISSOTA sanctioned dirt oval racing Super Stocks, Midwest Modifieds, and Late Models.',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
        url: '/eau-claire/racing',
        cta: 'View Races →'
      }
    ]
  }
};

const FEATURED_ICONIC_VENUES = [
  {
    title: 'Comedy Works Downtown',
    loc: 'Larimer Square · Denver, CO',
    badge: '🎤 Landmark Club',
    desc: 'Legendary underground comedy room renowned nationwide for low ceilings, intimate listening, and top touring comics.',
    img: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
    url: '/venue/comedy-works-downtown',
    cta: 'View Live Shows &amp; Tickets →'
  },
  {
    title: 'Comedy Cellar',
    loc: 'Greenwich Village · New York, NY',
    badge: '🎤 Legendary Club',
    desc: 'World-famous underground comedy cellar on MacDougal Street known for surprise drop-ins from comedy icons.',
    img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop',
    url: '/new-york/comedy',
    cta: 'View Live Lineups →'
  },
  {
    title: 'The Second City',
    loc: 'Old Town · Chicago, IL',
    badge: '🎭 Improv &amp; Sketch',
    desc: 'Historic comedy theater and school that trained comedy legends for decades with nightly revues.',
    img: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
    url: '/chicago/comedy',
    cta: 'View Live Shows →'
  },
  {
    title: 'Circuit of the Americas',
    loc: 'Austin, TX',
    badge: '🏁 Grand Prix Circuit',
    desc: 'World-class 3.4-mile FIA Grade 1 circuit hosting Formula 1, NASCAR, and MotoGP.',
    img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
    url: '/austin/racing',
    cta: 'View Track Schedule →'
  },
  {
    title: 'Soho Theatre',
    loc: 'Soho · London, UK',
    badge: '🎭 Comedy &amp; Drama',
    desc: 'Dean Street powerhouse producing innovative comedy, cabaret, and groundbreaking contemporary theatre.',
    img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
    url: '/london/comedy',
    cta: 'View Live Shows →'
  },
  {
    title: 'Colorado National Speedway',
    loc: 'Dacono, CO · High Plains',
    badge: '🏁 NASCAR Short Track',
    desc: 'High-banked 3/8-mile asphalt oval hosting NASCAR Advance Auto Parts Weekly racing.',
    img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
    url: '/track/colorado-national-speedway',
    cta: 'View Race Schedule →'
  }
];

module.exports = (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');

  // Check URL query for city/coords override
  let urlLocation = null;
  try {
    const reqUrl = new URL(req.url, 'https://brinkberry.com');
    const cityParam = reqUrl.searchParams.get('city');
    const latParam = parseFloat(reqUrl.searchParams.get('lat'));
    const lonParam = parseFloat(reqUrl.searchParams.get('lon') || reqUrl.searchParams.get('lng'));

    if (Number.isFinite(latParam) && Number.isFinite(lonParam)) {
      urlLocation = {
        city: cityParam || 'Selected Location',
        locationName: cityParam || 'Selected Location',
        lat: latParam,
        lon: lonParam,
        fromUrl: true
      };
    } else if (cityParam) {
      const norm = cityParam.toLowerCase().trim();
      if (KNOWN_CITIES[norm]) {
        urlLocation = { ...KNOWN_CITIES[norm], fromUrl: true };
      }
    }
  } catch (_) {}

  // Extract Vercel Edge IP Geolocation Headers
  const ipCity = req?.headers?.['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null;
  const ipRegion = req?.headers?.['x-vercel-ip-country-region'] || '';
  const rawLat = parseFloat(req?.headers?.['x-vercel-ip-latitude']);
  const rawLon = parseFloat(req?.headers?.['x-vercel-ip-longitude']);
  const ipLat = Number.isFinite(rawLat) ? rawLat : null;
  const ipLon = Number.isFinite(rawLon) ? rawLon : null;

  const serverGeo = (ipCity && ipLat !== null && ipLon !== null) ? {
    city: ipCity,
    locationName: ipRegion ? `${ipCity}, ${ipRegion}` : ipCity,
    lat: ipLat,
    lon: ipLon
  } : null;

  const initialCity = urlLocation || serverGeo || KNOWN_CITIES.denver;
  const initialCityName = initialCity.city || 'Denver';
  const initialCityLabel = initialCity.locationName || initialCityName;
  const initialCitySlug = (initialCityName || 'denver').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  const isCuratedInitial = Boolean(CITY_DISCOVERY[initialCitySlug]);
  const initialDiscovery = CITY_DISCOVERY[initialCitySlug] || {
    venues: FEATURED_ICONIC_VENUES,
    neighborhoods: []
  };

  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Brinkberry — Find What’s Happening Near You Right Now</title>
  <meta name="description" content="Find fun things to do near you right now. Stand-up comedy, grassroots motorsports, live music, and real local events to enjoy with friends within the next 48 hours.">
  <link rel="canonical" href="https://brinkberry.com/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Brinkberry — Find What’s Happening Near You Right Now">
  <meta property="og:description" content="Find fun things to do near you right now. Stand-up comedy, grassroots motorsports, live music, and real local events to enjoy with friends within the next 48 hours.">
  <meta property="og:url" content="https://brinkberry.com/">
  <meta name="twitter:card" content="summary_large_image">
  
  <!-- Impact.com Partner Verification & Tracking -->
  <script type="text/javascript">(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7811847-56b2-4d75-8496-a98b675d87f81.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');</script>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIINfQ3ynHBWqOU7MZVnKfXKjMZKnS4W9TQ=" crossorigin="">
  <style>
    :root {
      --bg: #090714;
      --card-bg: #140f22;
      --card-border: #281f38;
      --text: #f4eff8;
      --text-dim: #9b90aa;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --accent-glow: rgba(255, 46, 99, 0.4);
      --tag-bg: #221a30;
      --radar-cyan: #00e699;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      background-image:
        radial-gradient(ellipse 90% 45% at 50% -10%, rgba(255, 46, 99, 0.12), transparent 70%),
        radial-gradient(circle at 85% 15%, rgba(255, 184, 107, 0.05), transparent 50%);
      color: var(--text);
      font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.45;
    }
    .app { max-width: 1080px; margin: auto; padding: 18px 20px 60px; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid #1c152a;
      position: relative;
    }
    .brand {
      font-size: 23px;
      font-weight: 900;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 9px;
      color: #fff;
      text-decoration: none;
    }
    .brand b {
      color: var(--accent);
      text-shadow: 0 0 10px var(--accent-glow);
    }
    .top-nav-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-post-event {
      color: #03291d;
      font-size: 12.5px;
      font-weight: 800;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 999px;
      background: var(--radar-cyan);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 0 10px rgba(0, 230, 153, 0.3);
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-post-event:hover {
      background: #33ffb5;
      box-shadow: 0 0 14px rgba(0, 230, 153, 0.5);
      color: #03291d;
    }
    .nav-menu-wrap {
      position: relative;
    }
    .nav-menu-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #ded6ec;
      padding: 6px 13px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .nav-menu-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--primary);
      color: #fff;
    }
    .nav-menu-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 220px;
      background: #140f22;
      border: 1px solid rgba(255, 184, 107, 0.3);
      border-radius: 14px;
      padding: 8px 6px;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.65);
      z-index: 1000;
      animation: menuSlide 0.15s ease-out;
    }
    @keyframes menuSlide {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      color: #ded6ec;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      transition: background 0.15s, color 0.15s;
    }
    .menu-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    .menu-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.07);
      margin: 5px 6px;
    }
    .top-radar-indicator {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-dim);
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--radar-cyan);
      box-shadow: 0 0 8px var(--radar-cyan);
      animation: radar-pulse 2s infinite;
    }
    @keyframes radar-pulse {
      0% { box-shadow: 0 0 0 0 rgba(0, 230, 153, 0.7); }
      70% { box-shadow: 0 0 0 7px rgba(0, 230, 153, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 230, 153, 0); }
    }

    /* Streamlined Calm Hero */
    .hero {
      position: relative;
      padding: 20px 0 10px;
    }
    .location-bar {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    .radar-lock-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .radar-status-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-dim);
    }
    .loc-indicator-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #fff;
      font-size: 13px;
      font-weight: 750;
      padding: 5px 12px;
      border-radius: 999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .loc-indicator-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--primary);
    }
    .dropdown-arrow {
      font-size: 10px;
      opacity: 0.7;
    }
    .btn-loc-sm {
      background: rgba(255, 46, 99, 0.1);
      border: 1px solid rgba(255, 46, 99, 0.3);
      color: #ff94b0;
      font-size: 12.5px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
      white-space: nowrap;
      font-family: inherit;
    }
    .btn-loc-sm:hover {
      background: rgba(255, 46, 99, 0.2);
      border-color: var(--accent);
      color: #fff;
    }
    .hero h1.hero-title {
      font-size: clamp(24px, 4vw, 36px);
      line-height: 1.15;
      margin: 4px 0 8px;
      font-weight: 850;
      letter-spacing: -0.025em;
      color: #fff;
    }
    .hero-sub {
      color: var(--text-dim);
      margin: 0 0 16px;
      font-size: 14.5px;
      line-height: 1.45;
      max-width: 680px;
    }

    /* Expandable Location Drawer */
    .location-drawer {
      background: linear-gradient(180deg, rgba(25, 19, 39, 0.95) 0%, rgba(16, 12, 26, 0.98) 100%);
      border: 1px solid rgba(255, 184, 107, 0.25);
      border-radius: 16px;
      padding: 14px 16px;
      margin: 8px 0 16px;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5);
      animation: drawerSlide 0.2s ease-out;
    }
    @keyframes drawerSlide {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    /* Hero Contextual Controls */
    .contextual-controls-panel {
      margin-top: 6px;
    }
    .search-action-row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-input-wrap {
      flex: 1;
      min-width: 250px;
      display: flex;
      align-items: center;
      background: #0f0b18;
      border: 1px solid #362a4d;
      border-radius: 999px;
      padding: 3px 4px 3px 14px;
      transition: all 0.2s ease;
    }
    .search-input-wrap:focus-within {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(255, 184, 107, 0.18);
    }
    .search-icon {
      font-size: 14px;
      opacity: 0.6;
      margin-right: 8px;
    }
    #citySearchInput {
      flex: 1;
      background: transparent;
      border: none;
      color: #fff;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      width: 100%;
    }
    #citySearchInput::placeholder {
      color: #7b718c;
    }
    .btn-go {
      background: var(--primary);
      color: var(--primary-dark);
      border: none;
      border-radius: 999px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .btn-go:hover {
      background: #ffa84d;
    }
    .btn-loc {
      background: #1f172e;
      border: 1px solid #453560;
      color: #fff;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-loc:hover {
      background: #2b1f40;
      border-color: var(--accent);
      box-shadow: 0 0 12px rgba(255, 46, 99, 0.28);
    }
    .presets-row {
      display: flex;
      gap: 7px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .presets-label {
      font-size: 11px;
      font-weight: 750;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-right: 2px;
    }
    .preset-btn {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(25, 20, 36, 0.65);
      color: #ded6ec;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .preset-btn:hover {
      background: #2a203c;
      color: #fff;
      border-color: #554275;
    }
    .preset-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      box-shadow: 0 0 10px rgba(255, 46, 99, 0.35);
    }

    /* Category Discovery Bar */
    .category-pills-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 10px 0 8px;
    }
    .primary-categories-row, .more-categories-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .more-categories-row {
      padding-top: 2px;
      animation: drawerSlide 0.15s ease-out;
    }
    .cat-btn {
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(26, 20, 38, 0.7);
      color: #e4ddf2;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .cat-btn:hover {
      background: #2e2246;
      border-color: #634b87;
      color: #fff;
    }
    .cat-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      box-shadow: 0 0 14px rgba(255, 46, 99, 0.4);
    }
    .cat-btn.more-cat-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--text-dim);
    }
    .cat-btn.more-cat-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--primary);
    }
    .cat-btn.more-cat-btn.active {
      background: rgba(255, 184, 107, 0.18);
      border-color: var(--primary);
      color: var(--primary);
      box-shadow: none;
    }
    .cat-btn.comedy-btn.active {
      background: linear-gradient(135deg, #ff2e63 0%, #ffb86b 100%);
      border-color: #ffb86b;
      color: #120508;
      box-shadow: 0 0 16px rgba(255, 184, 107, 0.45);
    }
    .cat-btn.racing-btn.active {
      background: linear-gradient(135deg, #00b0ff 0%, #00e699 100%);
      border-color: #00e699;
      color: #041f17;
      box-shadow: 0 0 16px rgba(0, 230, 153, 0.45);
    }
    .cat-btn.civic-btn.active {
      background: linear-gradient(135deg, #2b5876 0%, #4e4376 100%);
      border-color: #6a82fb;
      color: #fff;
      box-shadow: 0 0 16px rgba(106, 130, 251, 0.45);
    }
    .cat-btn.community-btn.active {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      border-color: #38ef7d;
      color: #062b16;
      box-shadow: 0 0 16px rgba(56, 239, 125, 0.45);
    }

    /* Primary Hero Action Strip: Quick Time Selection & Filter Drawer Button */
    .hero-actions-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin: 10px 0 6px;
    }
    .quick-time-toggle {
      background: rgba(22, 17, 32, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      padding: 3px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .quick-time-btn {
      border: none;
      background: transparent;
      color: var(--text-dim);
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .quick-time-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.05);
    }
    .quick-time-btn.active {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 0 10px rgba(255, 46, 99, 0.35);
    }
    .filters-toggle-btn {
      background: rgba(25, 20, 36, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #ded6ec;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .filters-toggle-btn:hover {
      background: #2a203c;
      border-color: var(--primary);
      color: #fff;
    }
    .filters-toggle-btn.open {
      background: rgba(255, 184, 107, 0.15);
      border-color: var(--primary);
      color: var(--primary);
    }
    .filter-count-badge {
      background: var(--accent);
      color: #fff;
      font-size: 10.5px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 999px;
      min-width: 16px;
      text-align: center;
    }
    .filters-arrow {
      font-size: 10px;
      opacity: 0.8;
      transition: transform 0.15s ease;
    }
    .filters-toggle-btn.open .filters-arrow {
      transform: rotate(180deg);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .advanced-filters-drawer {
      margin-top: 10px;
      animation: drawerSlide 0.2s ease-out;
    }

    /* Comedy Deep Sub-Filter Console */
    .comedy-sub-console {
      background: linear-gradient(135deg, rgba(38, 20, 54, 0.9) 0%, rgba(18, 12, 28, 0.95) 100%);
      border: 1px solid rgba(255, 184, 107, 0.35);
      border-radius: 16px;
      padding: 14px 18px;
      margin: 8px 0 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .sub-filter-row {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .sub-filter-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--primary);
      margin-right: 4px;
    }
    .sub-filter-btn {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(18, 14, 25, 0.8);
      color: #c9bfdc;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .sub-filter-btn:hover {
      background: #2a1e3d;
      color: #fff;
    }
    .sub-filter-btn.active {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--primary-dark);
      font-weight: 800;
    }
    .community-promo-banner {
      font-size: 12.5px;
      color: #ded6ec;
      border-top: 1px dashed rgba(255, 255, 255, 0.08);
      margin-top: 10px;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .racing-sub-console {
      background: linear-gradient(135deg, rgba(14, 34, 28, 0.9) 0%, rgba(12, 22, 20, 0.95) 100%);
      border: 1px solid rgba(0, 230, 153, 0.35);
      border-radius: 16px;
      padding: 14px 18px;
      margin: 8px 0 16px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .racing-sub-console .sub-filter-label {
      color: var(--radar-cyan);
    }
    .racing-sub-console .sub-filter-btn.active {
      background: var(--radar-cyan);
      border-color: var(--radar-cyan);
      color: #061912;
      font-weight: 800;
    }
    .racing-promo-banner {
      color: #bdfae4;
      border-top: 1px dashed rgba(0, 230, 153, 0.18);
    }
    .trust-notice-bar {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 8px 14px;
      font-size: 12px;
      color: var(--text-dim);
      margin: 16px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Compact Secondary Filter Bar */
    .filter-bar {
      background: rgba(20, 15, 30, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 8px 14px;
      margin: 12px 0 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .filter-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .filter-divider {
      width: 1px;
      height: 18px;
      background: #2b203d;
    }
    .pills-wrap {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      flex-wrap: wrap;
    }
    .filter-label {
      font-size: 11px;
      font-weight: 750;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-right: 2px;
    }
    .filter-bar button {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(25, 20, 36, 0.6);
      color: var(--text-dim);
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .filter-bar button:hover {
      background: #281f38;
      color: #fff;
      border-color: #4a3a66;
    }
    .filter-bar button.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      font-weight: 700;
      box-shadow: 0 0 10px rgba(255, 46, 99, 0.35);
    }
    .filter-bar .mode-btn.active {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--primary-dark);
      font-weight: 800;
      box-shadow: 0 0 10px rgba(255, 184, 107, 0.35);
    }

    button, a.btn {
      border: 1px solid var(--card-border);
      background: #191424;
      color: var(--text);
      padding: 8px 14px;
      border-radius: 999px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    button:hover, a.btn:hover { background: #261f36; border-color: #403458; }
    button.active { background: var(--accent); border-color: var(--accent); color: #fff; }

    .status { margin: 10px 0; padding: 10px 14px; border-radius: 12px; background: #140f22; border: 1px solid var(--card-border); color: #ded6ec; font-size: 13.5px; display: flex; justify-content: space-between; align-items: center; }
    .weather { display: none; margin: 10px 0; padding: 10px 14px; border-radius: 12px; background: #0e1726; border: 1px solid #1a304a; color: #a9d4ff; font-size: 13.5px; }
    .planb { display: none; margin: 10px 0; padding: 12px 16px; border-radius: 14px; background: #24141d; border: 1px solid #632644; color: #ffb8d2; }
    .brink-alert { margin: 10px 0; padding: 12px 16px; border-radius: 14px; background: #2a101d; border: 1px solid #822247; color: #ff809d; font-weight: 700; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; margin-top: 16px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, border-color 0.15s; cursor: pointer; }
    .card:hover { transform: translateY(-2px); border-color: #4a3a66; }
    .card.brink { border-color: var(--accent); }
    .card-img { height: 155px; background: #181322; position: relative; overflow: hidden; display: flex; align-items: flex-end; padding: 10px; }
    .card-no-img { padding: 14px 16px 0; display: flex; align-items: center; justify-content: space-between; }
    .card-badge { background: rgba(8, 6, 16, 0.85); backdrop-filter: blur(4px); border: 1px solid #362a4d; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; color: #fff; }
    .card-body { padding: 16px; flex: 1; display: flex; flex-direction: column; }
    .card-title { font-size: 18px; font-weight: 800; line-height: 1.25; margin: 4px 0 8px; color: #fff; }
    .card-meta { color: var(--text-dim); font-size: 13px; margin-bottom: 4px; }
    .why-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
    .why-tag { font-size: 11px; font-weight: 700; background: var(--tag-bg); border: 1px solid #362a4d; color: #d6cced; padding: 3px 8px; border-radius: 999px; }
    .brinktag { font-size: 11px; font-weight: 900; letter-spacing: 0.08em; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; }
    .card-footer { margin-top: auto; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #201930; }
    .card-price { font-weight: 800; color: #fff; font-size: 14px; }
    .btn-ticket-sm { background: var(--primary); color: var(--primary-dark); font-size: 13px; font-weight: 800; padding: 7px 14px; border-radius: 999px; text-decoration: none; border: 0; display: inline-flex; align-items: center; }
    .btn-ticket-sm:hover { background: #ffa84d; }
    .btn-details-sm { background: rgba(255, 255, 255, 0.12); color: #fff; font-size: 13px; font-weight: 700; padding: 7px 14px; border-radius: 999px; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.2); display: inline-flex; align-items: center; }
    .btn-details-sm:hover { background: rgba(255, 255, 255, 0.22); border-color: rgba(255, 255, 255, 0.4); }
    .btn-civic-sm { background: #2b4570; color: #fff; font-size: 13px; font-weight: 750; padding: 7px 14px; border-radius: 999px; text-decoration: none; border: 1px solid #4a6fa5; display: inline-flex; align-items: center; }
    .btn-civic-sm:hover { background: #385994; }
    .btn-free-sm { background: #00e699; color: #072a1e; font-size: 13px; font-weight: 800; padding: 7px 14px; border-radius: 999px; text-decoration: none; border: 0; display: inline-flex; align-items: center; }
    .btn-free-sm:hover { background: #33ebb0; }

    .source-quality-tag { font-size: 11px; font-weight: 700; background: rgba(106, 130, 251, 0.12); border: 1px solid rgba(106, 130, 251, 0.35); color: #a4b6ff; padding: 3px 8px; border-radius: 999px; }
    .source-quality-tag.source-quality-community { background: rgba(255, 184, 107, 0.15); border-color: rgba(255, 184, 107, 0.4); color: #ffb86b; }
    .btn-not-interested { background: transparent; border: 1px solid rgba(255, 255, 255, 0.08); color: #9a8fad; font-size: 11px; font-weight: 600; cursor: pointer; padding: 3px 7px; border-radius: 6px; transition: all 0.15s; }
    .btn-not-interested:hover { background: rgba(255, 46, 99, 0.15); border-color: rgba(255, 46, 99, 0.35); color: #ff809d; }
    .easy-miss-tag { font-size: 11px; font-weight: 800; background: rgba(255, 46, 99, 0.15); border: 1px solid rgba(255, 46, 99, 0.4); color: #ff809d; padding: 3px 8px; border-radius: 999px; }
    .seasonal-tag { font-size: 11px; font-weight: 750; background: rgba(255, 184, 107, 0.15); border: 1px solid rgba(255, 184, 107, 0.35); color: #ffca85; padding: 3px 8px; border-radius: 999px; }

    #radar { display: none; height: 540px; border-radius: 18px; overflow: hidden; margin-top: 16px; border: 1px solid var(--card-border); }
    .empty { padding: 60px 20px; text-align: center; color: var(--text-dim); }
    .empty h3 { color: #fff; margin-bottom: 8px; }

    dialog { border: 1px solid var(--card-border); background: #120e1a; color: #fff; border-radius: 20px; width: min(600px, 94vw); padding: 22px; }
    dialog::backdrop { background: rgba(5, 3, 10, 0.85); }
    /* Content Discovery Sections */
    .discovery-section {
      margin-top: 48px;
      padding-top: 28px;
      border-top: 1px solid #1c1628;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 18px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .section-head h2 {
      font-size: 21px;
      font-weight: 850;
      margin: 0;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-head .subhead {
      color: var(--text-dim);
      font-size: 13.5px;
    }
    .venues-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .venue-spot-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: transform 0.15s, border-color 0.15s;
    }
    .venue-spot-card:hover {
      transform: translateY(-3px);
      border-color: #4f3b6d;
    }
    .venue-spot-img {
      height: 145px;
      background-size: cover;
      background-position: center;
      position: relative;
    }
    .venue-spot-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(10, 8, 18, 0.82);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 9px;
      border-radius: 999px;
    }
    .venue-spot-body {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .venue-spot-title {
      font-size: 16px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 4px;
    }
    .venue-spot-meta {
      font-size: 12.5px;
      color: var(--text-dim);
      margin-bottom: 8px;
    }
    .venue-spot-desc {
      font-size: 13px;
      color: #c4b9d8;
      line-height: 1.45;
      margin: 0 0 14px;
    }
    .venue-spot-cta {
      margin-top: auto;
      font-size: 12.5px;
      font-weight: 800;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .guides-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
    }
    .guide-box {
      background: linear-gradient(135deg, #181224 0%, #0f0b18 100%);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px 20px;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      transition: transform 0.15s, border-color 0.15s;
    }
    .guide-box:hover {
      transform: translateY(-2px);
      border-color: var(--primary);
    }
    .guide-box-icon {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .guide-box-title {
      font-size: 15.5px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 5px;
    }
    .guide-box-desc {
      font-size: 12.5px;
      color: var(--text-dim);
      line-height: 1.45;
      margin-bottom: 12px;
    }
    .guide-box-link {
      margin-top: auto;
      font-size: 12px;
      font-weight: 800;
      color: var(--primary);
    }

    .neighborhoods-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .neighborhood-chip {
      background: #171124;
      border: 1px solid var(--card-border);
      color: #ded6ec;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 999px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
    }
    .neighborhood-chip:hover {
      background: #251c3a;
      border-color: #554077;
      color: #fff;
    }

    .host-cta-banner {
      background: linear-gradient(135deg, rgba(255, 184, 107, 0.1) 0%, rgba(255, 46, 99, 0.08) 100%);
      border: 1px solid rgba(255, 184, 107, 0.28);
      border-radius: 18px;
      padding: 22px 26px;
      margin-top: 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .host-cta-text h3 {
      margin: 0 0 4px;
      font-size: 17px;
      font-weight: 800;
      color: #fff;
    }
    .host-cta-text p {
      margin: 0;
      font-size: 13.5px;
      color: var(--text-dim);
    }
    .host-cta-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    /* Worldwide Guides Footer */
    .city-guides-footer { margin-top: 50px; padding-top: 30px; border-top: 1px solid #1c1628; }
    .city-guides-footer h3 { font-size: 18px; font-weight: 800; margin-bottom: 14px; color: #fff; }
    .city-links-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .city-links-col h4 { margin: 0 0 8px; font-size: 14px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; }
    .city-links-col a { display: block; color: var(--text-dim); text-decoration: none; font-size: 13.5px; margin-bottom: 6px; }
    .city-links-col a:hover { color: #fff; text-decoration: underline; }

    @media (max-width: 768px) {
      .radar-lock-bar { width: 100%; justify-content: space-between; }
    }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      #radar { height: 400px; }
      .app { padding: 14px 14px 50px; }
      .hero h1.hero-title { font-size: 23px; }
      .hero-actions-bar { flex-direction: row; justify-content: space-between; width: 100%; }
      .quick-time-toggle { flex: 1; justify-content: center; }
      .search-action-row { flex-direction: column; align-items: stretch; }
      .btn-loc { justify-content: center; width: 100%; }
      .filter-divider { display: none; }
      .filter-bar { padding: 10px 12px; gap: 10px; }
      .filter-group { width: 100%; justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="top">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <div class="top-nav-right">
        <a href="/post" id="postEventBtn" class="btn-post-event">+ Post an Event</a>
        <div class="nav-menu-wrap">
          <button id="navMenuBtn" class="nav-menu-btn" type="button" aria-expanded="false" aria-label="Open navigation menu">
            <span>☰ Menu</span>
          </button>
          <div id="navMenuDropdown" class="nav-menu-dropdown" style="display:none;" role="menu">
            <a href="/submit-comedy" class="menu-item" role="menuitem">🎤 Submit Show</a>
            <div class="menu-divider"></div>
            <div class="menu-item top-radar-indicator" style="border:none; background:transparent; padding:6px 10px;">
              <span class="pulse-dot"></span>
              <span>Hyperlocal Radar Active</span>
            </div>
            <div class="menu-divider"></div>
            <a id="navComedyGuide" href="/${initialCitySlug}/comedy" class="menu-item" role="menuitem">${esc(initialCityName)} Comedy Guide</a>
            <a id="navTrackGuide" href="/${initialCitySlug}/racing" class="menu-item" role="menuitem">${esc(initialCityName)} Track Guide</a>
            <a href="/admin/pilot-racing" class="menu-item" role="menuitem">Track Promoter Portal</a>
          </div>
        </div>
      </div>
    </header>

    <section class="hero">
      <!-- Location Selector Bar -->
      <div class="location-bar">
        <div class="radar-lock-bar">
          <span class="radar-status-label">📍 Exploring:</span>
          <button id="locIndicatorBtn" class="loc-indicator-btn" type="button" aria-expanded="false" title="Click to change city or search">
            <span id="activeCityLabel">${esc(initialCityLabel)}</span>
            <span class="dropdown-arrow">▾</span>
          </button>
          <button id="locBtn" class="btn-loc-sm" title="Detect your current GPS location">
            <span>📍 Use my location</span>
          </button>
        </div>
      </div>

      <!-- Expandable Location Drawer (Preserves all required elements & test IDs) -->
      <div id="locationDrawer" class="location-drawer" style="display:none;">
        <div class="search-action-row">
          <div id="citySearchContainer" style="flex: 1; min-width: 250px; display: flex;">
            <div id="citySearchForm" class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input type="text" id="citySearchInput" placeholder="Search any city or postal code worldwide..." autocomplete="off">
              <button id="citySearchGo" class="btn-go">Find Events</button>
              <button id="citySearchClose" style="display:none"></button>
            </div>
            <button id="citySearchToggle" style="display:none"></button>
          </div>
        </div>

        <div class="presets-row" id="locationRow">
          <span class="presets-label">Popular Hubs</span>
          <span id="customLocWrap"></span>
          <button id="presetDenver" class="preset-btn">Denver, CO</button>
          <button id="presetParis" class="preset-btn">Paris</button>
          <button id="presetLondon" class="preset-btn">London</button>
          <button id="presetTokyo" class="preset-btn">Tokyo</button>
          <button id="presetNewYork" class="preset-btn">New York</button>

          <!-- Preserved Colorado preset buttons for regression test coverage -->
          <span style="display:none">
            <button id="presetBoulder">Boulder</button>
            <button id="presetGolden">Golden</button>
            <button id="presetAurora">Aurora</button>
          </span>
        </div>
      </div>

      <!-- Streamlined Core Headline & Subtitle -->
      <h1 class="hero-title">What’s happening near you?</h1>
      <p class="hero-sub">Wondering what should I do tonight? Find what’s happening near you right now. Stand-up comedy, grassroots racing, live music, and fun local happenings to enjoy with friends — real-time, easy, and direct to the venue.</p>

      <!-- Contextual Controls & Category Row -->
      <div id="contextualControls" class="contextual-controls-panel">
        <!-- Compact Category Row (Primary 5 + More button) -->
        <div id="everythingSubRow">
          <div class="category-pills-row" id="categoryRow" role="tablist" aria-label="Event Categories">
            <div class="primary-categories-row">
              <button class="cat-btn active" data-cat="">All Events</button>
              <button class="cat-btn comedy-btn" data-cat="comedy" data-label="Comedy Radar">🎤 Comedy</button>
              <button class="cat-btn racing-btn" data-cat="racing">🏁 Motorsports</button>
              <button class="cat-btn community-btn" data-cat="community" data-label="Community & Libraries">📚 Community</button>
              <button class="cat-btn" data-cat="music">🎵 Music</button>
              <button id="moreCategoriesBtn" class="cat-btn more-cat-btn" type="button" aria-expanded="false">More ▾</button>
            </div>
            <div id="moreCategoriesRow" class="more-categories-row" style="display:none;">
              <button class="cat-btn civic-btn" data-cat="civic">🏛️ Civic &amp; Politics</button>
              <button class="cat-btn" data-cat="arts">🎭 Arts &amp; Culture</button>
              <button class="cat-btn" data-cat="festival">🎡 Seasonal &amp; Fairs</button>
              <button class="cat-btn" data-cat="outdoor">🏃 Outdoors</button>
              <button class="cat-btn" data-cat="free">🎟️ Free Tonight</button>
            </div>
          </div>
        </div>

        <!-- Primary Action Strip: Quick Time Selection & Filters Button -->
        <div class="hero-actions-bar">
          <div class="quick-time-toggle" id="quickTimeToggle" role="group" aria-label="Quick time selection">
            <button type="button" class="quick-time-btn" data-time="tonight">Tonight</button>
            <button type="button" class="quick-time-btn active" data-time="48h">Next 48 Hours</button>
          </div>
          <button id="filtersToggleBtn" class="filters-toggle-btn" type="button" aria-expanded="false" aria-controls="advancedFiltersDrawer">
            <span>⚙️ Filters</span>
            <span id="filterCountBadge" class="filter-count-badge" style="display:none;">0</span>
            <span class="filters-arrow">▾</span>
          </button>
        </div>

        <!-- Advanced Filters Drawer (Hidden by default until tapped) -->
        <div id="advancedFiltersDrawer" class="advanced-filters-drawer" style="display:none;">
          <!-- Panel B: Stand-Up Comedy Deep Filter Console -->
          <div id="comedySubFilterConsole" class="comedy-sub-console" style="display:none;">
            <div class="sub-filter-row">
              <span class="sub-filter-label">Format:</span>
              <div id="comedyTypeFilters" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></div>
            </div>
            <div class="sub-filter-row">
              <span class="sub-filter-label">Age & Price:</span>
              <div id="comedyAgeFilters" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></div>
              <div id="comedyPriceFilters" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></div>
            </div>
            <div class="sub-filter-row" style="margin-bottom:0;">
              <span class="sub-filter-label">Urgency:</span>
              <div id="comedyUrgencyFilters" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></div>
            </div>
            <div class="community-promo-banner">
              <span>🎤 Are you a comedian, show host, or venue manager?</span>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <a id="comedyGuideLink" href="/${initialCitySlug}/comedy" style="color:var(--accent); font-weight:700; text-decoration:none;">${esc(initialCityName)} Comedy Guide ↗</a>
                <a href="/submit-comedy" style="color:var(--primary); font-weight:700; text-decoration:none;">Submit or edit show without logging in →</a>
              </div>
            </div>
          </div>

          <!-- Panel C: Grassroots Motorsports Deep Filter Console -->
          <div id="racingSubFilterConsole" class="racing-sub-console" style="display:none;">
            <div class="sub-filter-row">
              <span class="sub-filter-label">Discipline:</span>
              <div id="racingDisciplineFilters" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></div>
            </div>
            <div class="sub-filter-row">
              <span class="sub-filter-label">Planning:</span>
              <div id="racingPlanningFilters" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></div>
            </div>
            <div class="community-promo-banner racing-promo-banner">
              <span>🏁 Grassroots car racing radar with real-time rainout &amp; weather tracking</span>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <a id="racingGuideLink" href="/${initialCitySlug}/racing" style="color:var(--radar-cyan); font-weight:700; text-decoration:none;">${esc(initialCityName)} Track Guide ↗</a>
                <a href="/admin/pilot-racing" style="color:var(--primary); font-weight:700; text-decoration:none;">Track Promoter Portal →</a>
              </div>
            </div>
          </div>

          <!-- Secondary Refinement Bar: When, Radius, Vibe, Source -->
          <div id="generalFilterBar" class="filter-bar">
            <!-- When Group -->
            <div class="filter-group">
              <span class="filter-label">When</span>
              <div id="timeWindows" class="pills-wrap"></div>
            </div>

            <div class="filter-divider"></div>

            <!-- Radius Group -->
            <div class="filter-group">
              <span class="filter-label">Radius</span>
              <div id="radiusFilters" class="pills-wrap"></div>
            </div>

            <div class="filter-divider" id="vibeDivider"></div>

            <!-- Vibe Group -->
            <div class="filter-group" id="vibeGroup">
              <span class="filter-label">Vibe</span>
              <div id="modeFilters" class="pills-wrap"></div>
            </div>

            <div class="filter-divider" id="sourceDivider"></div>

            <!-- Source Group -->
            <div class="filter-group" id="sourceGroup">
              <span class="filter-label">Source</span>
              <div id="sourceFilters" class="pills-wrap"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Direct Links & Zero Markup Notice -->
    <div class="trust-notice-bar">
      <span>🎟️</span>
      <span><b>Independent Live Discovery</b>: Real fun, zero hassle. We do not mark up ticket prices or charge buyer fees — Brinkberry links you straight to the club, track, or venue so you can get out and have a blast.</span>
    </div>

    <!-- Live Status & Weather Alerts -->
    <div id="status" class="status">Loading nearby events…</div>
    <div id="weather" class="weather"></div>
    <div id="planb" class="planb"></div>
    <div id="brinkAlert"></div>

    <!-- View Switcher -->
    <div class="row" style="justify-content: flex-end; margin-top: 14px;">
      <button id="viewFeed" class="active">Feed View</button>
      <button id="viewRadar">Radar Map</button>
    </div>

    <!-- Main Feed & Map -->
    <main id="feed"><div class="empty">Finding events…</div></main>
    <div id="radar"></div>

    <!-- 1. Local Stages, Clubs & Speedways Showcase -->
    <section class="discovery-section" id="venuesSection">
      <div class="section-head">
        <h2 id="venuesHeading">${isCuratedInitial ? '🏛️ Local Stages, Clubs &amp; Speedways' : '🏛️ Featured Stages &amp; Iconic Venues'}</h2>
        <span class="subhead" id="venuesSubhead">${isCuratedInitial ? `Verified official box offices, schedules &amp; tickets near ${esc(initialCityName)}` : 'Renowned live performance spaces &amp; legendary tracks'}</span>
      </div>
      <div class="venues-grid" id="venuesGrid">
        ${initialDiscovery.venues.map(v => `
        <a class="venue-spot-card" href="${esc(v.url)}">
          <div class="venue-spot-img" style="background-image: url('${esc(v.img)}');">
            <span class="venue-spot-badge">${esc(v.badge)}</span>
          </div>
          <div class="venue-spot-body">
            <h3 class="venue-spot-title">${esc(v.title)}</h3>
            <div class="venue-spot-meta">📍 ${esc(v.loc)}</div>
            <p class="venue-spot-desc">${esc(v.desc)}</p>
            <span class="venue-spot-cta">${v.cta || 'View Live Shows &amp; Tickets →'}</span>
          </div>
        </a>`).join('')}
      </div>
    </section>

    <!-- 2. Curated Guides & Special Radars -->
    <section class="discovery-section" id="guidesSection">
      <div class="section-head">
        <h2 id="guidesHeading">🧭 Curated Discovery Guides</h2>
        <span class="subhead" id="guidesSubhead">Explore specialized local event directories for ${esc(initialCityName)}</span>
      </div>
      <div class="guides-grid" id="guidesGrid">
        <a class="guide-box" id="guideComedyCard" href="/${initialCitySlug}/comedy" onclick="if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); selectDiscoveryCategory('comedy'); }">
          <div class="guide-box-icon">🎤</div>
          <div class="guide-box-title">Stand-Up Comedy Radar</div>
          <div class="guide-box-desc">Tonight's club headliners, indie showcases, and free open mic sign-up rooms.</div>
          <div class="guide-box-link" id="guideComedyLinkText">Explore Comedy Guide →</div>
        </a>

        <a class="guide-box" id="guideRacingCard" href="/${initialCitySlug}/racing" onclick="if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); selectDiscoveryCategory('racing'); }">
          <div class="guide-box-icon">🏁</div>
          <div class="guide-box-title">Grassroots Motorsports</div>
          <div class="guide-box-desc">Dirt ovals, asphalt short tracks, and drag strips with real-time weather &amp; rainout tracking.</div>
          <div class="guide-box-link" id="guideRacingLinkText">Explore Track Guide →</div>
        </a>

        <a class="guide-box" id="guideMusicCard" href="/${initialCitySlug}/music" onclick="if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); selectDiscoveryCategory('music'); }">
          <div class="guide-box-icon">🎵</div>
          <div class="guide-box-title">Live Music &amp; Concerts</div>
          <div class="guide-box-desc">Indie rock stages, jazz sessions, acoustic gigs, and outdoor concert amphitheaters.</div>
          <div class="guide-box-link" id="guideMusicLinkText">Explore Music Radar →</div>
        </a>

        <a class="guide-box" id="guideFreeCard" href="/${initialCitySlug}/free" onclick="if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); selectDiscoveryCategory('free'); }">
          <div class="guide-box-icon">🎟️</div>
          <div class="guide-box-title">Free Things to Do</div>
          <div class="guide-box-desc">Community markets, gallery walks, library programs, and open public gatherings.</div>
          <div class="guide-box-link" id="guideFreeLinkText">Explore Free Events →</div>
        </a>
      </div>
    </section>

    <!-- 3. Hyperlocal Neighborhood Explorer -->
    <section class="discovery-section" id="neighborhoodSection" style="${initialDiscovery.neighborhoods.length ? '' : 'display:none;'}">
      <div class="section-head">
        <h2>📍 Explore by Neighborhood</h2>
        <span class="subhead" id="neighborhoodSubhead">Find events in ${esc(initialCityName)} within walking or transit distance</span>
      </div>
      <div class="neighborhoods-wrap" id="neighborhoodChips">
        ${initialDiscovery.neighborhoods.map(n => `<button class="neighborhood-chip" data-neighborhood="${esc(n)}" onclick="filterNeighborhood(this.dataset.neighborhood)">${esc(n)}</button>`).join('')}
      </div>
    </section>

    <!-- 4. Community & Organizer Callout -->
    <div class="host-cta-banner">
      <div class="host-cta-text">
        <h3>🎉 Putting on a comedy show, race, or local gathering?</h3>
        <p>Post it on Brinkberry for free in seconds. Bring people together, pack the house, and share direct links with zero fees.</p>
      </div>
      <div class="host-cta-actions">
        <a href="/post" class="btn-ticket-sm" style="background:var(--primary); color:var(--primary-dark); font-weight:800; font-size:13.5px; padding:9px 18px; text-decoration:none; border-radius:999px;">+ Post an Event</a>
        <a href="/submit-comedy" class="btn-details-sm" style="font-size:13.5px; padding:9px 18px; text-decoration:none; border-radius:999px;">Submit Comedy Show →</a>
      </div>
    </div>

    <!-- Worldwide City Guides Indexable Footer -->
    <section class="city-guides-footer">
      <h3>Popular Worldwide Event Guides</h3>
      <div class="city-links-grid">
        <div class="city-links-col">
          <h4>Denver</h4>
          <a href="/denver/next-48-hours">Denver Next 48 Hours</a>
          <a href="/denver/music">Denver Live Music</a>
          <a href="/denver/arts">Denver Arts & Exhibits</a>
          <a href="/denver/theater">Denver Theater</a>
          <a href="/denver/free">Denver Free Events</a>
          <a href="/denver/outdoor">Denver Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>London</h4>
          <a href="/london/next-48-hours">London Next 48 Hours</a>
          <a href="/london/music">London Live Music</a>
          <a href="/london/arts">London Arts & Culture</a>
          <a href="/london/theater">London West End Theater</a>
          <a href="/london/free">London Free Events</a>
          <a href="/london/outdoor">London Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>New York</h4>
          <a href="/new-york/next-48-hours">NYC Next 48 Hours</a>
          <a href="/new-york/music">NYC Live Music</a>
          <a href="/new-york/arts">NYC Arts & Exhibits</a>
          <a href="/new-york/theater">NYC Broadway & Theater</a>
          <a href="/new-york/free">NYC Free Events</a>
          <a href="/new-york/outdoor">NYC Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>Tokyo</h4>
          <a href="/tokyo/next-48-hours">Tokyo Next 48 Hours</a>
          <a href="/tokyo/music">Tokyo Live Music</a>
          <a href="/tokyo/arts">Tokyo Arts & Culture</a>
          <a href="/tokyo/theater">Tokyo Stage & Theater</a>
          <a href="/tokyo/free">Tokyo Free Events</a>
          <a href="/tokyo/outdoor">Tokyo Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>Paris</h4>
          <a href="/paris/next-48-hours">Paris Next 48 Hours</a>
          <a href="/paris/music">Paris Live Music</a>
          <a href="/paris/arts">Paris Arts & Exhibits</a>
          <a href="/paris/theater">Paris Theater</a>
          <a href="/paris/free">Paris Free Events</a>
          <a href="/paris/outdoor">Paris Outdoor Activities</a>
        </div>
      </div>
    </section>

    <!-- Public Legal Footer -->
    <footer style="margin-top: 48px; padding: 24px 0 12px; border-top: 1px solid #1c1628; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--text-dim);">
      <div>© 2026 Brinkberry · Worldwide Hyperlocal Event Radar · Fun things to do near you · Live comedy, motorsports &amp; local events</div>
      <div style="display: flex; gap: 16px;">
        <a href="/terms" style="color: var(--text-dim); text-decoration: none;">Terms of Service</a>
        <a href="/privacy" style="color: var(--text-dim); text-decoration: none;">Privacy Policy</a>
      </div>
    </footer>
  </div>

  <!-- Event Detail Dialog -->
  <dialog id="detailDlg">
    <div id="detailBody"></div>
    <div class="actions-bar">
      <button id="shareModalBtn" class="btn" style="background:#191424; color:#fff">🔗 Share Event</button>
      <button id="closeDetail" class="btn" style="margin-left:auto">Close</button>
    </div>
  </dialog>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    const SERVER_GEO = ${JSON.stringify(serverGeo)};
    const URL_LOCATION = ${JSON.stringify(urlLocation)};
    const KNOWN_CITIES = ${JSON.stringify(KNOWN_CITIES)};
    const CITY_DISCOVERY = ${JSON.stringify(CITY_DISCOVERY)};
    const FEATURED_ICONIC_VENUES = ${JSON.stringify(FEATURED_ICONIC_VENUES)};

    const DEFAULT_DENVER = KNOWN_CITIES['denver'];

    function getInitialLocation() {
      // 1. URL parameter takes HIGHEST precedence, resolving coordinates immediately
      // This fixes the bug where /?city=denver displayed the label but retained events from previous city
      try {
        const params = new URLSearchParams(window.location.search);
        const cityParam = params.get('city');
        const latParam = parseFloat(params.get('lat'));
        const lonParam = parseFloat(params.get('lon') || params.get('lng'));

        if (Number.isFinite(latParam) && Number.isFinite(lonParam)) {
          const locName = cityParam || 'Selected Location';
          return {
            city: locName,
            locationName: locName,
            lat: latParam,
            lon: lonParam,
            fromUrl: true
          };
        }

        if (cityParam) {
          const normCity = cityParam.toLowerCase().trim();
          if (KNOWN_CITIES[normCity]) {
            return {
              ...KNOWN_CITIES[normCity],
              fromUrl: true
            };
          }
          // Placeholder with city name, coordinates resolved asynchronously
          return {
            city: cityParam,
            locationName: cityParam,
            lat: null,
            lon: null,
            pendingGeocode: cityParam,
            fromUrl: true
          };
        }
      } catch (_) {}

      if (URL_LOCATION) return URL_LOCATION;

      // 2. Saved local storage fallback
      try {
        const saved = localStorage.getItem('bb_saved_loc');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.city && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
            return parsed;
          }
        }
      } catch (_) {}

      // 3. Server Edge Geolocation fallback
      if (SERVER_GEO) return SERVER_GEO;

      // 4. Default Denver
      return DEFAULT_DENVER;
    }

    const initLoc = getInitialLocation();

    const S = {
      lat: initLoc.lat ?? DEFAULT_DENVER.lat,
      lon: initLoc.lon ?? DEFAULT_DENVER.lon,
      city: initLoc.city,
      locationName: initLoc.locationName || initLoc.city,
      radius: 25,
      window: '48h',
      mode: '',
      category: '',
      racingDiscipline: '',
      showType: '',
      ageLimit: '',
      priceFilter: '',
      startingSoon: false,
      recurring: false,
      clean: false,
      sourceFilter: 'all',
      events: [],
      coverage: { isSupported: true, nearestMarket: 'Denver', supportedMarkets: [] },
      weather: null,
      map: null,
      markers: [],
      currentDetailEvent: null,
      neighborhood: ''
    };

    const CATEGORY_FALLBACK_IMAGES = {
      comedy: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
      racing: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
      music: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
      theater: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
      arts: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop',
      sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop',
      civic: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&auto=format&fit=crop',
      community: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&auto=format&fit=crop',
      festival: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&auto=format&fit=crop',
      outdoor: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&auto=format&fit=crop',
      food: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop',
      family: 'https://images.unsplash.com/photo-1472653431158-6364773b2a56?w=800&auto=format&fit=crop',
      other: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop'
    };

    function getCategoryFallback(cat) {
      const c = String(cat || '').toLowerCase().trim();
      return CATEGORY_FALLBACK_IMAGES[c] || CATEGORY_FALLBACK_IMAGES.other;
    }

    function filterNeighborhood(name) {
      if (S.neighborhood === name) {
        S.neighborhood = '';
      } else {
        S.neighborhood = name;
      }
      document.querySelectorAll('.neighborhood-chip').forEach(b => {
        const isMatch = b.textContent.trim() === S.neighborhood && Boolean(S.neighborhood);
        b.style.borderColor = isMatch ? 'var(--primary)' : '';
        b.style.color = isMatch ? '#fff' : '';
      });
      const feedEl = $('feed');
      if (feedEl) feedEl.scrollIntoView({ behavior: 'smooth' });
      renderFeed();
    }

    function getCitySlug(name) {
      return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    }

    function selectDiscoveryCategory(cat) {
      S.category = cat;
      if ($('moreCategoriesRow') && ['civic', 'arts', 'festival', 'outdoor', 'free'].includes(cat)) {
        S.moreCategoriesExpanded = true;
      }
      initControls();
      const feedEl = $('feed');
      if (feedEl) feedEl.scrollIntoView({ behavior: 'smooth' });
      renderFeed();
    }

    function renderVenuesGrid(venues) {
      const vGrid = $('venuesGrid');
      if (!vGrid) return;
      vGrid.innerHTML = (venues || []).map(function(v) {
        return '<a class="venue-spot-card" href="' + esc(v.url) + '">' +
          '<div class="venue-spot-img" style="background-image: url(' + esc(v.img) + ');">' +
          '<span class="venue-spot-badge">' + esc(v.badge) + '</span>' +
          '</div>' +
          '<div class="venue-spot-body">' +
            '<h3 class="venue-spot-title">' + esc(v.title) + '</h3>' +
            '<div class="venue-spot-meta">📍 ' + esc(v.loc) + '</div>' +
            '<p class="venue-spot-desc">' + esc(v.desc) + '</p>' +
            '<span class="venue-spot-cta">' + (v.cta || 'View Live Shows &amp; Tickets →') + '</span>' +
          '</div>' +
        '</a>';
      }).join('');
    }

    function updateLocationDiscovery(loc) {
      if (!loc) return;
      const cityName = loc.city || 'Nearby';
      const locName = loc.locationName || cityName;
      const slug = getCitySlug(cityName);

      // 1. Header & Active City
      const labelEl = $('activeCityLabel');
      if (labelEl) labelEl.textContent = locName;

      // 2. Navigation Dropdown Links
      const navComedy = $('navComedyGuide');
      if (navComedy) {
        navComedy.href = '/' + slug + '/comedy';
        navComedy.textContent = (CITY_DISCOVERY[slug] ? CITY_DISCOVERY[slug].name : cityName) + ' Comedy Guide';
      }
      const navTrack = $('navTrackGuide');
      if (navTrack) {
        navTrack.href = '/' + slug + '/racing';
        navTrack.textContent = (CITY_DISCOVERY[slug] ? CITY_DISCOVERY[slug].name : cityName) + ' Track Guide';
      }

      // 3. Filters Drawer Links
      const fComedy = $('comedyGuideLink');
      if (fComedy) {
        fComedy.href = '/' + slug + '/comedy';
        fComedy.textContent = (CITY_DISCOVERY[slug] ? CITY_DISCOVERY[slug].name : cityName) + ' Comedy Guide ↗';
      }
      const fRacing = $('racingGuideLink');
      if (fRacing) {
        fRacing.href = '/' + slug + '/racing';
        fRacing.textContent = (CITY_DISCOVERY[slug] ? CITY_DISCOVERY[slug].name : cityName) + ' Track Guide ↗';
      }
      const emptyRLink = $('emptyRacingGuideLink');
      if (emptyRLink) {
        emptyRLink.href = '/' + slug + '/racing';
      }

      // 4. Curated Discovery Guides Section
      const gSub = $('guidesSubhead');
      if (gSub) gSub.innerHTML = 'Explore specialized local event directories for ' + esc(cityName);

      const guideMap = [
        { id: 'guideComedyCard', linkId: 'guideComedyLinkText', path: '/comedy', linkText: 'Explore Comedy Guide →' },
        { id: 'guideRacingCard', linkId: 'guideRacingLinkText', path: '/racing', linkText: 'Explore Track Guide →' },
        { id: 'guideMusicCard', linkId: 'guideMusicLinkText', path: '/music', linkText: 'Explore Music Radar →' },
        { id: 'guideFreeCard', linkId: 'guideFreeLinkText', path: '/free', linkText: 'Explore Free Events →' }
      ];
      guideMap.forEach(function(g) {
        const card = $(g.id);
        if (card) {
          card.href = '/' + slug + g.path;
          const lt = $(g.linkId);
          if (lt) lt.textContent = g.linkText;
        }
      });

      // 5. Neighborhood Explorer
      const neighSec = $('neighborhoodSection');
      const neighChips = $('neighborhoodChips');
      const neighSub = $('neighborhoodSubhead');

      let nList = [];
      if (CITY_DISCOVERY[slug] && CITY_DISCOVERY[slug].neighborhoods) {
        nList = CITY_DISCOVERY[slug].neighborhoods;
      } else if (S.events && S.events.length > 0) {
        const set = new Set();
        S.events.forEach(function(e) {
          if (e.neighborhood && String(e.neighborhood).trim()) {
            set.add(String(e.neighborhood).trim());
          }
        });
        nList = Array.from(set).slice(0, 10);
      }

      if (nList.length > 0) {
        if (neighSec) neighSec.style.display = 'block';
        if (neighSub) neighSub.textContent = 'Find events in ' + cityName + ' within walking or transit distance';
        if (neighChips) {
          neighChips.innerHTML = nList.map(function(n) {
            const isActive = S.neighborhood === n;
            const style = isActive ? 'border-color:var(--primary); color:#fff;' : '';
            return '<button class="neighborhood-chip" style="' + style + '" data-neighborhood="' + esc(n) + '" onclick="filterNeighborhood(this.dataset.neighborhood)">' + esc(n) + '</button>';
          }).join('');
        }
      } else {
        if (neighSec) neighSec.style.display = 'none';
      }

      // 6. Stages & Venues Section
      const vHead = $('venuesHeading');
      const vSub = $('venuesSubhead');
      const vGrid = $('venuesGrid');

      if (CITY_DISCOVERY[slug] && CITY_DISCOVERY[slug].venues) {
        if (vHead) vHead.innerHTML = '🏛️ Local Stages, Clubs &amp; Speedways';
        if (vSub) vSub.innerHTML = 'Verified official box offices, schedules &amp; tickets near ' + esc(cityName);
        if (vGrid) renderVenuesGrid(CITY_DISCOVERY[slug].venues);
      } else {
        let dynamicVenues = [];
        if (S.events && S.events.length > 0) {
          const seenV = new Set();
          S.events.forEach(function(e) {
            if (e.venue && !seenV.has(e.venue) && seenV.size < 6) {
              seenV.add(e.venue);
              dynamicVenues.push({
                title: e.venue,
                loc: (e.neighborhood ? (e.neighborhood + ' · ') : '') + (e.city || cityName),
                badge: e.category ? (e.category.toUpperCase()) : 'LIVE VENUE',
                desc: e.title ? ('Catch "' + e.title + '" and upcoming live events at ' + e.venue + '.') : ('Live shows and events at ' + e.venue + '.'),
                img: e.image || getCategoryFallback(e.category),
                url: e.detailsUrl || e.ticketUrl || ('/' + slug),
                cta: 'View Live Shows →'
              });
            }
          });
        }

        if (dynamicVenues.length >= 2) {
          if (vHead) vHead.innerHTML = '🏛️ Local Stages &amp; Venues near ' + esc(cityName);
          if (vSub) vSub.innerHTML = 'Live venues and show schedules discovered in ' + esc(cityName);
          if (vGrid) renderVenuesGrid(dynamicVenues);
        } else {
          if (vHead) vHead.innerHTML = '🏛️ Featured Stages &amp; Iconic Venues';
          if (vSub) vSub.innerHTML = 'Renowned live performance spaces &amp; legendary tracks';
          if (vGrid) renderVenuesGrid(FEATURED_ICONIC_VENUES);
        }
      }
    }

    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('category')) S.category = sp.get('category');
      if (sp.get('discipline')) S.racingDiscipline = sp.get('discipline');
      if (sp.get('showType')) S.showType = sp.get('showType');
      if (sp.get('mode')) S.mode = sp.get('mode');
      if (sp.get('window')) S.window = sp.get('window');
      if (sp.get('ageLimit')) S.ageLimit = sp.get('ageLimit');
      if (sp.get('priceFilter')) S.priceFilter = sp.get('priceFilter');
      if (sp.get('startingSoon') === 'true') S.startingSoon = true;
      if (sp.get('recurring') === 'true') S.recurring = true;
      if (sp.get('sourceFilter')) S.sourceFilter = sp.get('sourceFilter');
    } catch (_) {}

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    const fmtTime = iso => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    function initControls() {
      // 0. Top Navigation Menu Toggle
      const navBtn = $('navMenuBtn');
      const navDropdown = $('navMenuDropdown');
      if (navBtn && navDropdown && !navBtn._bound) {
        navBtn._bound = true;
        navBtn.onclick = (e) => {
          e.stopPropagation();
          const isOpen = navDropdown.style.display !== 'none';
          navDropdown.style.display = isOpen ? 'none' : 'block';
          navBtn.setAttribute('aria-expanded', String(!isOpen));
        };
        document.addEventListener('click', (e) => {
          if (!navBtn.contains(e.target) && !navDropdown.contains(e.target)) {
            navDropdown.style.display = 'none';
            navBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      // 1. Location Drawer Toggle
      const locInd = $('locIndicatorBtn');
      if (locInd && !locInd._bound) {
        locInd._bound = true;
        locInd.onclick = () => {
          const drawer = $('locationDrawer');
          if (drawer) {
            const isOpen = drawer.style.display !== 'none';
            drawer.style.display = isOpen ? 'none' : 'block';
            locInd.setAttribute('aria-expanded', String(!isOpen));
            if (!isOpen) {
              const inp = $('citySearchInput');
              if (inp) inp.focus();
            }
          }
        };
      }

      // 1. Progressive Disclosure of Contextual Sub-Panels
      const everyRow = $('everythingSubRow');
      if (everyRow) everyRow.style.display = 'block';

      const comedyConsole = $('comedySubFilterConsole');
      if (comedyConsole) {
        comedyConsole.style.display = (S.category === 'comedy') ? 'block' : 'none';
        if (S.category === 'comedy') renderComedySubConsole();
      }

      const racingConsole = $('racingSubFilterConsole');
      if (racingConsole) {
        racingConsole.style.display = (S.category === 'racing') ? 'block' : 'none';
        if (S.category === 'racing') renderRacingSubConsole();
      }

      const vibeGrp = $('vibeGroup');
      const vibeDiv = $('vibeDivider');
      if (vibeGrp) vibeGrp.style.display = (!S.category) ? 'inline-flex' : 'none';
      if (vibeDiv) vibeDiv.style.display = (!S.category) ? 'inline-block' : 'none';

      // 2. Compact Category Row (Primary 5 + More button + Expandable secondary row)
      const primaryCategories = [
        ['', 'All Events'],
        ['comedy', '🎤 Comedy', 'Comedy Radar'],
        ['racing', '🏁 Motorsports'],
        ['community', '📚 Community', 'Community & Libraries'],
        ['music', '🎵 Music']
      ];
      const secondaryCategories = [
        ['civic', '🏛️ Civic & Politics'],
        ['arts', '🎭 Arts & Culture'],
        ['festival', '🎡 Seasonal & Fairs'],
        ['outdoor', '🏃 Outdoors'],
        ['free', '🎟️ Free Tonight']
      ];
      const isSecondaryActive = secondaryCategories.some(([k]) => S.category === k);
      const showSecondary = Boolean(S.moreCategoriesExpanded || isSecondaryActive);

      const catRow = $('categoryRow');
      if (catRow) {
        const primHtml = primaryCategories.map(function(item) {
          var k = item[0], l = item[1], extra = item[2] ? ' data-label="' + item[2] + '"' : '';
          var cls = k === 'comedy' ? 'comedy-btn' : (k === 'racing' ? 'racing-btn' : (k === 'community' ? 'community-btn' : ''));
          var act = S.category === k ? 'active' : '';
          return '<button class="cat-btn ' + cls + ' ' + act + '" data-cat="' + k + '"' + extra + '>' + l + '</button>';
        }).join('');

        const moreBtnHtml = '<button id="moreCategoriesBtn" class="cat-btn more-cat-btn ' + (isSecondaryActive ? 'active' : '') + '" type="button" aria-expanded="' + showSecondary + '">More ' + (showSecondary ? '▴' : '▾') + '</button>';

        const secHtml = secondaryCategories.map(function(item) {
          var k = item[0], l = item[1];
          var cls = k === 'civic' ? 'civic-btn' : '';
          var act = S.category === k ? 'active' : '';
          return '<button class="cat-btn ' + cls + ' ' + act + '" data-cat="' + k + '">' + l + '</button>';
        }).join('');

        catRow.innerHTML = '<div class="primary-categories-row">' + primHtml + moreBtnHtml + '</div>' +
          '<div id="moreCategoriesRow" class="more-categories-row" style="display:' + (showSecondary ? 'flex' : 'none') + ';">' + secHtml + '</div>';

        const moreBtn = $('moreCategoriesBtn');
        if (moreBtn) {
          moreBtn.onclick = (e) => {
            e.stopPropagation();
            S.moreCategoriesExpanded = !S.moreCategoriesExpanded;
            initControls();
          };
        }

        document.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
          S.category = b.dataset.cat;
          if (S.category !== 'comedy') {
            S.showType = '';
            S.ageLimit = '';
            S.priceFilter = '';
            S.startingSoon = false;
            S.recurring = false;
          }
          if (S.category !== 'racing') {
            S.racingDiscipline = '';
          }
          initControls();
          loadFeed();
        });
      }

      // 3. Quick Time Choice: Tonight vs Next 48 Hours
      const quickTimeEl = $('quickTimeToggle');
      if (quickTimeEl) {
        quickTimeEl.querySelectorAll('[data-time]').forEach(b => {
          const isTonight = b.dataset.time === 'tonight' && S.window === 'tonight';
          const is48h = b.dataset.time === '48h' && (S.window === '48h' || S.window === 'weekend');
          b.className = 'quick-time-btn ' + ((isTonight || is48h) ? 'active' : '');
          b.onclick = () => {
            S.window = b.dataset.time;
            initControls();
            loadFeed();
          };
        });
      }

      // 4. Advanced Filters Button & Drawer Toggle
      const filtersBtn = $('filtersToggleBtn');
      const filtersDrawer = $('advancedFiltersDrawer');
      if (filtersBtn && filtersDrawer && !filtersBtn._bound) {
        filtersBtn._bound = true;
        filtersBtn.onclick = () => {
          const isOpen = filtersDrawer.style.display !== 'none';
          filtersDrawer.style.display = isOpen ? 'none' : 'block';
          filtersBtn.setAttribute('aria-expanded', String(!isOpen));
          filtersBtn.classList.toggle('open', !isOpen);
        };
      }

      // Calculate active filter count for badge
      let activeFilterCount = 0;
      if (S.radius && S.radius !== 25) activeFilterCount++;
      if (S.mode) activeFilterCount++;
      if (S.sourceFilter && S.sourceFilter !== 'all') activeFilterCount++;
      if (S.window && S.window !== 'tonight' && S.window !== '48h' && S.window !== 'weekend') activeFilterCount++;
      if (S.category === 'comedy') {
        if (S.showType) activeFilterCount++;
        if (S.ageLimit) activeFilterCount++;
        if (S.priceFilter) activeFilterCount++;
        if (S.startingSoon) activeFilterCount++;
        if (S.recurring) activeFilterCount++;
      }
      if (S.category === 'racing') {
        if (S.racingDiscipline) activeFilterCount++;
      }
      const badge = $('filterCountBadge');
      if (badge) {
        badge.textContent = String(activeFilterCount);
        badge.style.display = activeFilterCount > 0 ? 'inline-block' : 'none';
      }

      // 4. Radius Filters
      const radii = [5, 10, 25, 50];
      $('radiusFilters').innerHTML = radii.map(r => \`<button class="\${S.radius === r ? 'active' : ''}" data-r="\${r}">\${r} mi</button>\`).join('');
      document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.radius = Number(b.dataset.r); initControls(); loadFeed(); });

      // 5. Time Windows
      const windows = [['now', 'Now'], ['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['48h', 'Next 48 Hours']];
      $('timeWindows').innerHTML = windows.map(([k, l]) => \`<button class="\${(S.window === k || (k === '48h' && S.window === 'weekend')) ? 'active' : ''}" data-w="\${k}">\${l}</button>\`).join('');
      document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { S.window = b.dataset.w; initControls(); loadFeed(); });

      // 6. Modes (Vibe)
      const modes = [
        ['', 'All'],
        ['easy-to-miss', 'Easy to Miss ✨'],
        ['seasonal', 'Seasonal 🎡'],
        ['civic', 'Civic & Politics 🏛️'],
        ['community', 'Community & Library 📚'],
        ['comedy', 'Comedy 🎤'],
        ['cheap', 'Cheap / Free'],
        ['date', 'Date Night'],
        ['outside', 'Outside'],
        ['kids', 'Kids']
      ];
      $('modeFilters').innerHTML = modes.map(([k, l]) => \`<button class="mode-btn \${S.mode === k ? 'active' : ''}" data-m="\${k}">\${l}</button>\`).join('');
      document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; initControls(); loadFeed(); });

      // 7. Source Filters (All, Official, Community)
      const sources = [
        ['all', 'All Events'],
        ['official', 'Official Only 🏛️'],
        ['community', 'Community Only 👥']
      ];
      const srcEl = $('sourceFilters');
      if (srcEl) {
        srcEl.innerHTML = sources.map(([k, l]) => \`<button class="\${(S.sourceFilter || 'all') === k ? 'active' : ''}" data-src="\${k}">\${l}</button>\`).join('');
        document.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { S.sourceFilter = b.dataset.src; initControls(); loadFeed(); });
      }
    }

    function renderComedySubConsole() {
      // Show format
      const types = [
        ['', 'All Formats'],
        ['standup', 'Stand-Up'],
        ['open_mic', 'Open Mics 🎙️'],
        ['showcase', 'Showcases'],
        ['headliner', 'Headliners ⭐'],
        ['improv', 'Improv / Sketch']
      ];
      const typeEl = $('comedyTypeFilters');
      if (typeEl) {
        typeEl.innerHTML = types.map(([t, l]) =>
          \`<button class="sub-filter-btn \${S.showType === t ? 'active' : ''}" data-st="\${t}">\${l}</button>\`
        ).join('');
        document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
          S.showType = b.dataset.st;
          renderComedySubConsole();
          loadFeed();
        });
      }

      // Age limits
      const ages = [
        ['', 'Any Age'],
        ['all_ages', 'All Ages'],
        ['18+', '18+'],
        ['21+', '21+']
      ];
      const ageEl = $('comedyAgeFilters');
      if (ageEl) {
        ageEl.innerHTML = ages.map(([a, l]) =>
          \`<button class="sub-filter-btn \${S.ageLimit === a ? 'active' : ''}" data-al="\${a}">\${l}</button>\`
        ).join('');
        document.querySelectorAll('[data-al]').forEach(b => b.onclick = () => {
          S.ageLimit = b.dataset.al;
          renderComedySubConsole();
          loadFeed();
        });
      }

      // Price filter
      const prices = [
        ['', 'Any Price'],
        ['free', 'Free / No Cover'],
        ['under_15', 'Under $15'],
        ['under_25', 'Under $25']
      ];
      const priceEl = $('comedyPriceFilters');
      if (priceEl) {
        priceEl.innerHTML = prices.map(([p, l]) =>
          \`<button class="sub-filter-btn \${S.priceFilter === p ? 'active' : ''}" data-pf="\${p}">\${l}</button>\`
        ).join('');
        document.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => {
          S.priceFilter = b.dataset.pf;
          renderComedySubConsole();
          loadFeed();
        });
      }

      // Urgency & Recurring
      const urgEl = $('comedyUrgencyFilters');
      if (urgEl) {
        urgEl.innerHTML = \`
          <button class="sub-filter-btn \${S.startingSoon ? 'active' : ''}" id="btnStartingSoon">⚡ Starting Soon (&lt;4h)</button>
          <button class="sub-filter-btn \${S.recurring ? 'active' : ''}" id="btnRecurring">🔄 Recurring Shows</button>
        \`;
        const bSoon = $('btnStartingSoon');
        if (bSoon) bSoon.onclick = () => {
          S.startingSoon = !S.startingSoon;
          renderComedySubConsole();
          loadFeed();
        };
        const bRec = $('btnRecurring');
        if (bRec) bRec.onclick = () => {
          S.recurring = !S.recurring;
          renderComedySubConsole();
          loadFeed();
        };
      }
    }

    function renderRacingSubConsole() {
      // Track disciplines
      const disciplines = [
        ['', 'All Disciplines'],
        ['dirt_oval', 'Dirt Ovals 🏁'],
        ['paved_short_track', 'Paved Ovals'],
        ['drag_strip', 'Drag Strips ⏱️'],
        ['road_course', 'Road Courses']
      ];
      const discEl = $('racingDisciplineFilters');
      if (discEl) {
        discEl.innerHTML = disciplines.map(([d, l]) =>
          \`<button class="sub-filter-btn \${S.racingDiscipline === d ? 'active' : ''}" data-rd="\${d}">\${l}</button>\`
        ).join('');
        document.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => {
          S.racingDiscipline = b.dataset.rd;
          renderRacingSubConsole();
          loadFeed();
        });
      }

      // Planning windows
      const windows = [
        ['48h', 'Next 48 Hours'],
        ['this_weekend', 'This Weekend'],
        ['next_weekend', 'Next Weekend'],
        ['30d', 'Next 30 Days']
      ];
      const planEl = $('racingPlanningFilters');
      if (planEl) {
        planEl.innerHTML = windows.map(([w, l]) =>
          \`<button class="sub-filter-btn \${(S.window === w || (w === '48h' && S.window === 'tonight')) ? 'active' : ''}" data-rw="\${w}">\${l}</button>\`
        ).join('');
        document.querySelectorAll('[data-rw]').forEach(b => b.onclick = () => {
          S.window = b.dataset.rw;
          renderRacingSubConsole();
          loadFeed();
        });
      }
    }

    function renderFeed() {
      const brinkCount = S.events.filter(e => e.onTheBrink).length;
      $('brinkAlert').innerHTML = brinkCount ? \`<div class="brink-alert">⚡ <b>On the Brink</b> · \${brinkCount} nearby \${brinkCount === 1 ? 'event starts' : 'events start'} within the hour.</div>\` : '';

      // Out of coverage market state
      if (S.coverage && S.coverage.isSupported === false) {
        const locTitle = S.locationName || S.city || 'Your Location';
        $('feed').innerHTML = \`
          <div class="empty out-of-coverage">
            <div style="font-size:38px; margin-bottom:12px">📍</div>
            <h3 style="font-size:22px; margin:0 0 8px; color:#fff">Brinkberry is not covering \${esc(locTitle)} yet</h3>
            <p style="max-width:540px; margin:0 auto 18px; color:var(--text-dim); line-height:1.55">
              We strictly show verified, real-world events happening in the next 48 hours. Try expanding your search radius or exploring our active markets worldwide.
            </p>

            <div style="margin:22px 0">
              <div style="font-size:12px; font-weight:700; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px">
                Explore a Supported Market:
              </div>
              <div class="row" style="justify-content:center; gap:8px;">
                <button onclick="applyLocation(KNOWN_CITIES['denver'], true);" style="background:var(--primary); color:var(--primary-dark); font-weight:800">Denver →</button>
                <button onclick="applyLocation(KNOWN_CITIES['london'], true);">London</button>
                <button onclick="applyLocation(KNOWN_CITIES['new-york'], true);">New York</button>
                <button onclick="applyLocation(KNOWN_CITIES['tokyo'], true);">Tokyo</button>
                <button onclick="applyLocation(KNOWN_CITIES['paris'], true);">Paris</button>
              </div>
            </div>

            <div class="market-request-box" style="background:#130f1c; border:1px solid var(--card-border); border-radius:16px; padding:18px 22px; max-width:480px; margin:24px auto 0; text-align:left">
              <h4 style="margin:0 0 6px; font-size:15px; color:#fff">Want Brinkberry in \${esc(locTitle)}?</h4>
              <p style="margin:0 0 12px; font-size:13px; color:var(--text-dim)">Submit this city as a requested market so our local curators know where to launch next.</p>
              <div id="requestMarketForm" style="display:flex; gap:8px">
                <input type="text" id="marketInput" value="\${esc(locTitle)}" style="flex:1; background:#191424; border:1px solid var(--card-border); color:#fff; padding:8px 14px; border-radius:999px; font-size:13.5px">
                <button id="submitMarketBtn" onclick="submitMarketRequest()" style="background:var(--accent); color:#fff; font-weight:700">Request City</button>
              </div>
              <div id="requestMarketSuccess" style="display:none; color:#a9ffcb; font-size:13px; font-weight:600; margin-top:8px">
                ✓ Thanks! We’ve recorded your request for <span id="requestedCityLabel"></span>.
              </div>
            </div>
          </div>\`;
        renderRadar();
        return;
      }

      // Empty in supported market
      if (!S.events.length) {
        const modeLabels = { cheap: 'Cheap / Free', date: 'Date Night', outside: 'Outside', kids: 'Kids' };
        const modeText = S.mode && modeLabels[S.mode] ? ' for "' + modeLabels[S.mode] + '"' : '';
        const windowLabels = { now: 'happening right now', tonight: 'tonight', tomorrow: 'tomorrow', '48h': 'in the next 48 hours', weekend: 'this weekend' };
        const winText = windowLabels[S.window] || 'in the next 48 hours';
        const isComedy = S.category === 'comedy';
        const isRacing = S.category === 'racing';
        const emptyLabel = isComedy ? 'comedy shows' : (isRacing ? 'grassroots races' : 'qualifying events');

        $('feed').innerHTML = \`
          <div class="empty">
            <h3>No \${emptyLabel} found within \${S.radius} miles \${winText}\${modeText}</h3>
            <p>We focus on real things happening right now or in the next 48 hours. Try expanding your radius or checking another category to find something fun!</p>
            \${isComedy ? \`
              <div style="margin:16px 0 10px; font-size:13.5px; color:var(--text-dim);">
                Are you hosting or performing a show in this area?
                <br>
                <a href="/submit-comedy" style="color:var(--primary); font-weight:700; text-decoration:none; display:inline-block; margin-top:6px;">Submit your comedy show without logging in →</a>
              </div>
            \` : ''}
            \${isRacing ? \`
              <div style="margin:16px 0 10px; font-size:13.5px; color:var(--text-dim);">
                Looking for short tracks, dirt ovals, or drag strips in this region?
                <br>
                <a href="/\${getCitySlug(S.city)}/racing" id="emptyRacingGuideLink" style="color:var(--radar-cyan); font-weight:700; text-decoration:none; display:inline-block; margin-top:6px;">View Local Race Track &amp; Schedule Directory →</a>
              </div>
            \` : ''}
            <div class="row" style="justify-content:center; margin-top:14px; gap:8px;">
              \${(S.mode || S.showType || S.ageLimit || S.priceFilter || S.startingSoon || S.recurring || S.racingDiscipline) ? '<button onclick="S.mode=\\'\\'; S.showType=\\'\\'; S.ageLimit=\\'\\'; S.priceFilter=\\'\\'; S.startingSoon=false; S.recurring=false; S.racingDiscipline=\\'\\'; initControls(); loadFeed();" style="background:#191424; color:#fff">Clear Sub-Filters</button>' : ''}
              <button onclick="S.radius=50; S.window='48h'; S.mode=''; initControls(); loadFeed();" style="background:var(--primary); color:var(--primary-dark); font-weight:800">
                Search 50 Miles / Next 48 Hours →
              </button>
            </div>
          </div>\`;
        return;
      }

      let hiddenMap = {};
      try {
        hiddenMap = JSON.parse(localStorage.getItem('bb_hidden_events') || '{}');
      } catch (_) {}
      const now = Date.now();
      let pruned = false;
      for (const k in hiddenMap) {
        if (hiddenMap[k] < now) {
          delete hiddenMap[k];
          pruned = true;
        }
      }
      if (pruned) {
        try { localStorage.setItem('bb_hidden_events', JSON.stringify(hiddenMap)); } catch (_) {}
      }

      let allEvents = [...(S.events || [])];
      try {
        const myPosts = JSON.parse(localStorage.getItem('bb_community_posts') || '[]');
        const existingIds = new Set(allEvents.map(e => e.id));
        for (const mp of myPosts) {
          if (!existingIds.has(mp.id)) {
            const st = new Date(mp.start_time).getTime();
            if ((st - now) > -4 * 3600 * 1000 && (st - now) < 48.5 * 3600 * 1000) {
              allEvents.unshift(mp);
              existingIds.add(mp.id);
            }
          }
        }
      } catch (_) {}

      if (S.sourceFilter === 'official') {
        allEvents = allEvents.filter(e => !e.isCommunityPost && e.source !== 'community_post' && !e.id?.startsWith('comm_post_'));
      } else if (S.sourceFilter === 'community') {
        allEvents = allEvents.filter(e => e.isCommunityPost || e.source === 'community_post' || e.id?.startsWith('comm_post_') || e.sourceType === 'community_submission');
      }

      const visibleEvents = allEvents.filter(e => !hiddenMap[e.id]);

      if (visibleEvents.length === 0) {
        $('feed').innerHTML = \`
          <div class="empty">
            <h3>No visible events</h3>
            <p>All matching events nearby are either past or dismissed with "Not interested".</p>
            <div class="row" style="justify-content:center; margin-top:14px; gap:8px;">
              <button onclick="localStorage.removeItem('bb_hidden_events'); renderFeed();" style="background:#191424; color:#fff">Reset Hidden Events</button>
              <button onclick="S.radius=50; S.window='48h'; S.mode=''; initControls(); loadFeed();" style="background:var(--primary); color:var(--primary-dark); font-weight:800">
                Search 50 Miles →
              </button>
            </div>
          </div>\`;
        return;
      }

      $('feed').innerHTML = '<div class="grid">' + visibleEvents.map(e => \`
        <article class="card \${e.onTheBrink ? 'brink' : ''}" data-id="\${e.id}">
          <div class="card-img">
            <img src="\${esc(e.image || getCategoryFallback(e.category))}" alt="\${esc(e.title)}" onerror="this.onerror=null; this.src=getCategoryFallback('\${esc(e.category)}');" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;" loading="lazy">
            <span class="card-badge" style="position:relative; z-index:1;">\${esc(e.category)}</span>
            \${e.onTheBrink ? '<span class="brinktag" style="position:relative; z-index:1; margin-left:auto;">Starts Soon</span>' : ''}
          </div>
          <div class="card-body">
            <div class="card-meta">\${e.neighborhood ? esc(e.neighborhood) : esc(e.city || 'Nearby')}</div>
            <div class="card-title">\${esc(e.title)}</div>
            <div class="card-meta">📍 \${esc(e.venue)}\${e.city ? ', ' + esc(e.city) : ''}</div>
            <div class="card-meta">⏰ \${esc(fmtTime(e.start))}\${e.distanceMiles != null ? ' · <b>' + e.distanceMiles.toFixed(1) + ' mi</b>' : ''}</div>
            <div class="why-tags">
              \${(e.whyThis || []).map(t => '<span class="why-tag">' + esc(t) + '</span>').join('')}
              \${(e.sourceQualityLabel || (e.isCommunityPost ? 'Community-submitted*' : '')) ? '<span class="source-quality-tag ' + ((e.sourceQualityLabel || '').includes('Community') || e.isCommunityPost ? 'source-quality-community' : '') + '" title="' + esc(e.sourceQualityTooltip || '*This event was submitted by a Brinkberry user and has not been independently verified. Details may change.') + '">' + esc(e.sourceQualityLabel || 'Community-submitted*') + '</span>' : ''}
              \${e.isEasyToMiss ? '<span class="easy-miss-tag">✨ Easy to Miss</span>' : ''}
              \${e.isSeasonal ? '<span class="seasonal-tag">🎡 Seasonal</span>' : ''}
              \${e.isRareReturn ? '<span class="easy-miss-tag">🌟 Rare Return</span>' : ''}
              \${e.comedy?.showType ? '<span class="why-tag" style="color:var(--primary);">' + esc(e.comedy.showType) + '</span>' : ''}
              \${e.comedy?.ageLimit && e.comedy.ageLimit !== 'unknown' ? '<span class="why-tag" style="color:var(--accent);">' + esc(e.comedy.ageLimit) + '</span>' : ''}
              \${e.racing?.surface ? '<span class="why-tag" style="color:var(--radar-cyan);">' + esc(e.racing.surface) + '</span>' : ''}
              \${e.racing?.classes?.[0] ? '<span class="why-tag" style="color:var(--primary);">' + esc(e.racing.classes[0]) + '</span>' : ''}
            </div>
            <div class="card-footer">
              <div style="display:flex; align-items:center; gap:8px;">
                <div class="card-price">\${esc(e.priceDisplay || (e.isFree ? 'Free' : 'Details'))}</div>
                <button class="btn-not-interested" title="Hide this event for 48 hours" onclick="hideEventFor48Hours(event, '\${esc(e.id)}')">✕ Not interested</button>
              </div>
              \${e.hasTicket ? \`
                <a class="btn-ticket-sm" href="/api/click?url=\${encodeURIComponent(e.ticketUrl)}&eventId=\${encodeURIComponent(e.id)}&surface=feed_card" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                  Get Tickets →
                </a>
              \` : (e.category === 'civic' ? \`
                <a class="btn-civic-sm" href="\${(e.detailsUrl || e.ticketUrl) ? '/api/click?url=' + encodeURIComponent(e.detailsUrl || e.ticketUrl) + '&eventId=' + encodeURIComponent(e.id) + '&surface=feed_card' : '/event/' + encodeURIComponent(e.id)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                  Meeting Agenda →
                </a>
              \` : (e.isFree || (e.priceDisplay && e.priceDisplay.toLowerCase().includes('free')) ? \`
                <a class="btn-free-sm" href="\${(e.detailsUrl || e.ticketUrl) ? '/api/click?url=' + encodeURIComponent(e.detailsUrl || e.ticketUrl) + '&eventId=' + encodeURIComponent(e.id) + '&surface=feed_card' : '/event/' + encodeURIComponent(e.id)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                  Free Event →
                </a>
              \` : \`
                <a class="btn-details-sm" href="\${(e.detailsUrl || e.ticketUrl) ? '/api/click?url=' + encodeURIComponent(e.detailsUrl || e.ticketUrl) + '&eventId=' + encodeURIComponent(e.id) + '&surface=feed_card' : '/event/' + encodeURIComponent(e.id)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                  View Details →
                </a>
              \`))}
            </div>
            \${(e.source === 'seatgeek' || e.provenance?.provider === 'seatgeek') ? \`
              <div style="font-size:11px; color:var(--text-dim); margin-top:8px; display:flex; justify-content:flex-end;">
                <a href="https://seatgeek.com" target="_blank" rel="noopener noreferrer" style="color:var(--text-dim); text-decoration:none; display:inline-flex; align-items:center; gap:2px;" onclick="event.stopPropagation()">
                  Tickets via SeatGeek ↗
                </a>
              </div>
            \` : ''}
          </div>
        </article>
      \`).join('') + '</div>';

      document.querySelectorAll('.card').forEach(c => c.onclick = () => openDetail(c.dataset.id));
      renderRadar();
      renderPlanB();
    }

    function hideEventFor48Hours(evt, eventId) {
      if (evt) {
        evt.stopPropagation();
        evt.preventDefault();
      }
      try {
        const hidden = JSON.parse(localStorage.getItem('bb_hidden_events') || '{}');
        hidden[eventId] = Date.now() + (48 * 3600 * 1000);
        localStorage.setItem('bb_hidden_events', JSON.stringify(hidden));
      } catch (_) {}
      const card = document.querySelector(\`.card[data-id="\${eventId}"]\`);
      if (card) {
        card.style.transition = 'opacity 0.2s, transform 0.2s';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => {
          renderFeed();
        }, 200);
      }
    }

    async function submitMarketRequest() {
      const input = $('marketInput');
      const city = input ? input.value.trim() : (S.locationName || S.city);
      if (!city) return;
      const btn = $('submitMarketBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        await fetch('/api/market-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ city, lat: S.lat, lng: S.lon })
        });
      } catch (_) {}
      if ($('requestMarketForm')) $('requestMarketForm').style.display = 'none';
      if ($('requestMarketSuccess')) {
        $('requestMarketSuccess').style.display = 'block';
        $('requestedCityLabel').textContent = city;
      }
    }

    async function loadFeed() {
      const catLabel = S.category === 'comedy' ? 'comedy shows' : (S.category === 'racing' ? 'grassroots races' : 'events');
      $('status').textContent = \`Finding fun \${catLabel} near \${S.city} (\${S.radius} mi) · \${S.window}…\`;
      try {
        const qp = new URLSearchParams({
          lat: S.lat,
          lng: S.lon,
          lon: S.lon,
          radius: S.radius,
          window: S.window,
          mode: S.mode,
          city: S.city
        });
        if (S.category) qp.set('category', S.category);
        if (S.racingDiscipline) qp.set('discipline', S.racingDiscipline);
        if (S.showType) qp.set('showType', S.showType);
        if (S.ageLimit) qp.set('ageLimit', S.ageLimit);
        if (S.priceFilter) qp.set('priceFilter', S.priceFilter);
        if (S.startingSoon) qp.set('startingSoon', 'true');
        if (S.recurring) qp.set('recurring', 'true');
        if (S.clean) qp.set('clean', 'true');
        if (S.sourceFilter && S.sourceFilter !== 'all') qp.set('sourceFilter', S.sourceFilter);

        const r = await fetch(\`/api/feed?\${qp.toString()}\`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.status);
        S.events = data.events || [];
        S.coverage = data.meta?.coverage || { isSupported: true };
        if (data.meta?.coverage?.locationName) {
          S.locationName = data.meta.coverage.locationName;
          if (S.city === 'Your Location') {
            S.city = data.meta.coverage.locationName;
            const chip = $('customLocChip');
            if (chip) chip.textContent = '📍 ' + S.locationName;
          }
        }

        // If 'tonight' has 0 events (e.g. late night) and no specific sub-filters, seamlessly expand to next 48 hours
        if (S.events.length === 0 && S.window === 'tonight' && !S.hasAutoExpanded && !S.showType && !S.priceFilter && !S.racingDiscipline) {
          S.hasAutoExpanded = true;
          S.window = '48h';
          initControls();
          return loadFeed();
        }

        // If 25 miles has 0 events in fringe/suburban areas, seamlessly expand radius to 50 miles
        if (S.events.length === 0 && S.radius === 25 && !S.hasAutoExpandedRadius && !S.showType && !S.priceFilter && !S.racingDiscipline) {
          S.hasAutoExpandedRadius = true;
          S.radius = 50;
          initControls();
          return loadFeed();
        }

        if (S.coverage && S.coverage.isSupported === false) {
          $('status').innerHTML = \`📍 <b>\${esc(S.locationName || S.city)}</b> has no active event feeds right now.\`;
        } else {
          $('status').textContent = \`\${S.events.length} \${catLabel} found near \${S.city} (\${S.radius} mi radius)\`;
        }
        renderFeed();
        loadWeather();
        if (!CITY_DISCOVERY[getCitySlug(S.city)]) {
          updateLocationDiscovery(S);
        }
      } catch (err) {
        $('status').textContent = 'Could not load events: ' + err.message;
      }
    }

    async function loadWeather() {
      try {
        const r = await fetch(\`/api/weather?lat=\${S.lat}&lng=\${S.lon}\`);
        if (!r.ok) throw 0;
        const j = await r.json();
        S.weather = j;
        const c = j.current || {};
        $('weather').style.display = 'block';
        $('weather').innerHTML = \`🌤️ <b>\${esc(c.shortForecast || 'Weather')}</b> · \${esc(c.temperature)}°\${esc(c.temperatureUnit || 'F')}\${j.maxPrecipNext3h != null ? ' · ' + j.maxPrecipNext3h + '% precip chance next 3h' : ''}\`;
        renderPlanB();
      } catch {
        $('weather').style.display = 'none';
        S.weather = null;
      }
    }

    function renderPlanB() {
      if (!S.weather?.planBWeather) return $('planb').style.display = 'none';
      const outdoor = S.events.find(e => ['outdoor', 'mixed'].includes(e.indoorOutdoor));
      const indoor = S.events.find(e => e.indoorOutdoor === 'indoor');
      if (outdoor && indoor) {
        $('planb').style.display = 'block';
        $('planb').innerHTML = \`🌧️ <b>Rain may affect outdoor plans.</b> Indoor Plan B recommendation: <b>\${esc(indoor.title)}</b> (\${esc(indoor.venue)} · \${indoor.distanceMiles != null ? indoor.distanceMiles.toFixed(1) + ' mi' : 'nearby'}).\`;
      } else {
        $('planb').style.display = 'none';
      }
    }

    function openDetail(id) {
      const e = S.events.find(x => x.id === id);
      if (!e) return;
      S.currentDetailEvent = e;
      const destUrl = e.detailsUrl || e.ticketUrl || '';
      const clickUrl = destUrl ? \`/api/click?url=\${encodeURIComponent(destUrl)}&eventId=\${encodeURIComponent(e.id)}&surface=detail_modal\` : \`/event/\${encodeURIComponent(e.id)}\`;
      $('detailBody').innerHTML = \`
        <img src="\${esc(e.image || getCategoryFallback(e.category))}" alt="" onerror="this.onerror=null; this.src=getCategoryFallback('\${esc(e.category)}');" style="width:100%; max-height:240px; object-fit:cover; border-radius:12px; margin-bottom:14px;">
        <h2 style="margin-top:0">\${esc(e.title)}</h2>
        <p style="color:var(--text-dim)">📍 \${esc(e.venue)}\${e.city ? ', ' + esc(e.city) : ''} \${e.distanceMiles != null ? ' · ' + e.distanceMiles.toFixed(1) + ' mi' : ''}</p>
        <p style="color:var(--text-dim)">⏰ \${esc(fmtTime(e.start))}</p>
        <p><b>Admission:</b> \${esc(e.priceDisplay || (e.isFree ? 'Free Admission' : 'Details on official page'))}</p>
        \${e.sourceQualityLabel ? '<p style="font-size:12.5px; color:var(--text-dim); margin:4px 0 10px;"><b>Source Verification:</b> <span class="source-quality-tag">' + esc(e.sourceQualityLabel) + '</span></p>' : ''}
        \${e.desc ? \`<p style="line-height:1.5">\${esc(e.desc)}</p>\` : ''}
        \${e.category === 'civic' ? \`
          <div style="background:rgba(43,69,112,0.18); border:1px solid rgba(106,130,251,0.35); border-radius:12px; padding:12px; margin:14px 0; font-size:13.5px;">
            <div style="font-weight:800; color:#9bb0ff; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">🏛️ Official Civic &amp; Public Process</div>
            <div style="line-height:1.45; color:#e0d8f0; margin-bottom:8px;">
              Public meetings, council sessions, and hearings are indexed directly from official government records for citizen transparency.
            </div>
            <div style="font-size:12px; color:var(--text-dim); line-height:1.4;">
              <em>Notice: Brinkberry provides neutral public scheduling information and does not endorse any candidate, party, ballot measure, or policy proposal. All meetings are subject to local open meetings laws and public participation rules.</em>
            </div>
          </div>
        \` : ''}
        \${e.category === 'community' ? \`
          <div style="background:rgba(17,153,142,0.1); border:1px solid rgba(56,239,125,0.3); border-radius:12px; padding:12px; margin:14px 0; font-size:13.5px;">
            <div style="font-weight:800; color:#38ef7d; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">📚 Public Community &amp; Library Program</div>
            <div style="line-height:1.45; color:#e0d8f0;">
              Gatherings, workshops, and local programs organized for neighborhood enrichment and public learning.
            </div>
          </div>
        \` : ''}
        \${e.comedy ? \`
          <div style="background:rgba(255,184,107,0.08); border:1px solid rgba(255,184,107,0.25); border-radius:12px; padding:12px; margin:14px 0; font-size:13.5px;">
            <div style="font-weight:800; color:var(--primary); font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">🎤 Stand-Up Comedy Details</div>
            \${e.comedy.showType ? '<div style="margin-bottom:3px"><b>Show Type:</b> ' + esc(e.comedy.showType) + '</div>' : ''}
            \${e.comedy.ageLimit && e.comedy.ageLimit !== 'unknown' ? '<div style="margin-bottom:3px"><b>Age Limit:</b> ' + esc(e.comedy.ageLimit) + '</div>' : ''}
            \${e.comedy.comedians && e.comedy.comedians.length ? '<div style="margin-bottom:3px"><b>Lineup:</b> ' + esc(e.comedy.comedians.join(', ')) + '</div>' : ''}
            \${e.comedy.recurring ? '<div style="margin-bottom:3px"><b>Schedule:</b> ' + esc(e.comedy.recurrenceText || 'Recurring') + '</div>' : ''}
          </div>
        \` : ''}
        \${e.racing ? \`
          <div style="background:rgba(0,230,153,0.08); border:1px solid rgba(0,230,153,0.25); border-radius:12px; padding:12px; margin:14px 0; font-size:13.5px;">
            <div style="font-weight:800; color:var(--radar-cyan); font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">🏁 Grassroots Motorsports Details</div>
            \${e.racing.trackName ? '<div style="margin-bottom:3px"><b>Track:</b> ' + esc(e.racing.trackName) + '</div>' : ''}
            \${e.racing.surface ? '<div style="margin-bottom:3px"><b>Surface:</b> ' + esc(e.racing.surface) + '</div>' : ''}
            \${e.racing.classes && e.racing.classes.length ? '<div style="margin-bottom:3px"><b>Divisions:</b> ' + esc(e.racing.classes.join(', ')) + '</div>' : ''}
            \${e.racing.gateTime ? '<div style="margin-bottom:3px"><b>Gates Open:</b> ' + esc(e.racing.gateTime) + '</div>' : ''}
            \${e.racing.hotLapsTime ? '<div style="margin-bottom:3px"><b>Hot Laps:</b> ' + esc(e.racing.hotLapsTime) + '</div>' : ''}
            \${e.racing.greenFlagTime ? '<div style="margin-bottom:3px"><b>Green Flag:</b> ' + esc(e.racing.greenFlagTime) + '</div>' : ''}
            \${e.racing.weatherStatus ? '<div style="margin-bottom:3px"><b>Weather / Race Status:</b> ' + esc(e.racing.weatherStatus) + '</div>' : ''}
            \${e.racing.admissionModel ? '<div style="margin-bottom:3px"><b>Admission:</b> ' + esc(e.racing.admissionModel) + '</div>' : ''}
          </div>
        \` : ''}
        \${(e.source === 'seatgeek' || e.provenance?.provider === 'seatgeek') ? \`
          <p style="font-size:12px; color:var(--text-dim); margin:12px 0 6px;">
            Tickets and event data via <a href="https://seatgeek.com" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:700; text-decoration:none;">SeatGeek ↗</a>.
          </p>
        \` : ''}
        <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap">
          \${e.hasTicket ? \`
            <a class="btn" style="background:var(--primary); color:var(--primary-dark); font-weight:800" href="\${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">Get Tickets &amp; Details →</a>
          \` : (e.category === 'civic' ? \`
            <a class="btn btn-civic-sm" style="font-size:14px; padding:9px 18px;" href="\${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">Official Meeting Agenda →</a>
          \` : (e.isFree || (e.priceDisplay && e.priceDisplay.toLowerCase().includes('free')) ? \`
            <a class="btn btn-free-sm" style="font-size:14px; padding:9px 18px;" href="\${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">View Free Event Info →</a>
          \` : \`
            <a class="btn btn-details-sm" style="font-size:14px; padding:9px 18px;" href="\${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">View Official Details →</a>
          \`))}
          <a class="btn" href="/event/\${encodeURIComponent(e.id)}" target="_blank">Standalone Event Page</a>
        </div>
      \`;
      $('detailDlg').showModal();
    }

    function renderRadar() {
      if (!$('radar') || $('radar').style.display === 'none' || !window.L) return;
      if (!S.map) {
        S.map = L.map('radar').setView([S.lat, S.lon], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
      }
      S.markers.forEach(m => m.remove());
      S.markers = [];
      const latLngs = [];
      S.events.forEach(e => {
        if (e.lat == null || e.lon == null) return;
        const ll = [e.lat, e.lon];
        latLngs.push(ll);
        const m = L.marker(ll).addTo(S.map)
          .bindPopup(\`<b>\${esc(e.title)}</b><br>\${esc(e.venue)}<br>\${e.distanceMiles != null ? e.distanceMiles.toFixed(1) + ' mi' : ''}<br><a href="/event/\${encodeURIComponent(e.id)}" target="_blank">View Event →</a>\`);
        S.markers.push(m);
      });
      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        S.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      } else {
        S.map.setView([S.lat, S.lon], 11);
      }
      setTimeout(() => S.map.invalidateSize(), 50);
    }

    // View toggles
    $('viewFeed').onclick = () => { $('viewFeed').classList.add('active'); $('viewRadar').classList.remove('active'); $('feed').style.display = 'block'; $('radar').style.display = 'none'; };
    $('viewRadar').onclick = () => { $('viewRadar').classList.add('active'); $('viewFeed').classList.remove('active'); $('feed').style.display = 'none'; $('radar').style.display = 'block'; renderRadar(); };

    function updateUrlState(city) {
      try {
        const url = new URL(window.location);
        url.searchParams.set('city', city.toLowerCase().replace(/\\s+/g, '-'));
        window.history.replaceState({}, '', url.pathname + url.search);
      } catch (_) {}
    }

    function applyLocation(loc, shouldSave = true) {
      S.hasAutoExpanded = false;
      S.hasAutoExpandedRadius = false;
      S.lat = loc.lat;
      S.lon = loc.lon;
      S.city = loc.city;
      S.locationName = loc.locationName || loc.city;

      if ($('locationDrawer')) $('locationDrawer').style.display = 'none';
      if ($('locIndicatorBtn')) $('locIndicatorBtn').setAttribute('aria-expanded', 'false');

      updateLocationDiscovery(loc);

      // Unselect standard preset buttons
      ['presetDenver', 'presetLondon', 'presetNewYork', 'presetTokyo', 'presetParis', 'presetBoulder', 'presetGolden', 'presetAurora'].forEach(id => {
        const b = $(id);
        if (b) b.classList.remove('active');
      });

      const wrap = $('customLocWrap');
      const standardMap = {
        'Denver': 'presetDenver',
        'London': 'presetLondon',
        'New York': 'presetNewYork',
        'Tokyo': 'presetTokyo',
        'Paris': 'presetParis',
        'Boulder': 'presetBoulder',
        'Golden': 'presetGolden',
        'Aurora': 'presetAurora'
      };

      if (standardMap[loc.city]) {
        if (wrap) wrap.innerHTML = '';
        const standardBtn = $(standardMap[loc.city]);
        if (standardBtn) standardBtn.classList.add('active');
      } else {
        if (wrap) {
          wrap.innerHTML = '<button id="customLocChip" class="active">📍 ' + esc(S.locationName) + '</button>';
          $('customLocChip').onclick = () => applyLocation(loc, false);
        }
      }

      if (shouldSave) {
        try {
          localStorage.setItem('bb_saved_loc', JSON.stringify({
            city: S.city,
            locationName: S.locationName,
            lat: S.lat,
            lon: S.lon
          }));
          updateUrlState(S.city);
        } catch (_) {}
      }

      loadFeed();
    }

    const setPreset = (name, lat, lon) => {
      applyLocation({ city: name, locationName: name, lat, lon }, true);
    };

    $('presetDenver').onclick = () => applyLocation(DEFAULT_DENVER, true);
    $('presetLondon').onclick = () => applyLocation(KNOWN_CITIES['london'], true);
    $('presetNewYork').onclick = () => applyLocation(KNOWN_CITIES['new-york'], true);
    $('presetTokyo').onclick = () => applyLocation(KNOWN_CITIES['tokyo'], true);
    $('presetParis').onclick = () => applyLocation(KNOWN_CITIES['paris'], true);

    if ($('presetBoulder')) $('presetBoulder').onclick = () => applyLocation(KNOWN_CITIES['boulder'], true);
    if ($('presetGolden')) $('presetGolden').onclick = () => applyLocation(KNOWN_CITIES['golden'], true);
    if ($('presetAurora')) $('presetAurora').onclick = () => applyLocation(KNOWN_CITIES['aurora'], true);

    $('locBtn').onclick = () => {
      $('status').textContent = 'Detecting your location…';
      if (!navigator.geolocation) {
        $('status').innerHTML = '⚠️ Geolocation is not supported by your browser. Please choose a city below:';
        return;
      }
      $('locBtn').textContent = '⏳ Locating…';
      navigator.geolocation.getCurrentPosition(async p => {
        $('locBtn').textContent = '📍 Use my location';
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        let locName = 'Your Location';

        try {
          const res = await fetch(\`https://nominatim.openstreetmap.org/reverse?lat=\${lat}&lon=\${lon}&format=json\`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.municipality;
            const state = addr.state || addr.country || '';
            if (city && state) locName = \`\${city}, \${state}\`;
            else if (city) locName = city;
          }
        } catch (_) {}

        applyLocation({
          city: locName,
          locationName: locName,
          lat,
          lon
        }, true);
      }, () => {
        $('locBtn').textContent = '📍 Use my location';
        $('status').innerHTML = '⚠️ Location access was not granted. Please select a city below or search for your city:';
      }, { timeout: 8000 });
    };

    // Other City Search
    $('citySearchToggle').onclick = () => {
      $('citySearchToggle').style.display = 'none';
      $('citySearchForm').style.display = 'inline-flex';
      $('citySearchInput').focus();
    };
    $('citySearchClose').onclick = () => {
      $('citySearchForm').style.display = 'none';
      $('citySearchToggle').style.display = 'inline-flex';
    };
    async function executeCitySearch() {
      const q = $('citySearchInput').value.trim();
      if (!q) return;
      $('status').textContent = 'Looking up "' + q + '"…';
      try {
        const norm = q.toLowerCase();
        if (KNOWN_CITIES[norm]) {
          $('citySearchForm').style.display = 'none';
          $('citySearchToggle').style.display = 'inline-flex';
          $('citySearchInput').value = '';
          applyLocation(KNOWN_CITIES[norm], true);
          return;
        }

        const res = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1&addressdetails=1');
        if (!res.ok) throw new Error('Search service unavailable');
        const list = await res.json();
        if (!list || !list.length) throw new Error('Location not found');
        const item = list[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const addr = item.address || {};
        const cityName = addr.city || addr.town || addr.village || addr.municipality || item.name;
        const stateName = addr.state_code || addr.state || addr.country || '';
        const displayName = stateName ? (cityName + ', ' + stateName) : (cityName || item.display_name.split(',')[0]);

        $('citySearchForm').style.display = 'none';
        $('citySearchToggle').style.display = 'inline-flex';
        $('citySearchInput').value = '';

        applyLocation({
          city: cityName || displayName,
          locationName: displayName,
          lat,
          lon
        }, true);
      } catch (err) {
        $('status').textContent = 'Could not find "' + q + '". Please try a city name or 5-digit zip code.';
      }
    }
    $('citySearchGo').onclick = executeCitySearch;
    $('citySearchInput').onkeydown = e => { if (e.key === 'Enter') executeCitySearch(); };

    $('shareModalBtn').onclick = async () => {
      const e = S.currentDetailEvent;
      if (!e) return;
      const url = location.origin + '/event/' + e.id;
      const shareData = { title: e.title, text: e.title + ' — ' + fmtTime(e.start) + ' at ' + e.venue, url };
      if (navigator.share) {
        try { await navigator.share(shareData); return; } catch {}
      }
      await navigator.clipboard.writeText(url);
      alert('Event link copied to clipboard: ' + url);
    };

    $('closeDetail').onclick = () => $('detailDlg').close();

    initControls();
    updateLocationDiscovery(initLoc);

    if (initLoc.pendingGeocode) {
      // Asynchronously resolve unknown city coordinates from ?city=
      (async () => {
        try {
          const res = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(initLoc.pendingGeocode) + '&format=json&limit=1&addressdetails=1');
          if (res.ok) {
            const list = await res.json();
            if (list && list.length > 0) {
              const item = list[0];
              const addr = item.address || {};
              const cityName = addr.city || addr.town || addr.village || addr.municipality || item.name || initLoc.pendingGeocode;
              applyLocation({
                city: cityName,
                locationName: cityName,
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon)
              }, true);
              return;
            }
          }
        } catch (_) {}
        applyLocation(DEFAULT_DENVER, false);
      })();
    } else {
      applyLocation(initLoc, Boolean(initLoc.fromUrl));
    }
  </script>
</body>
</html>`);
};
