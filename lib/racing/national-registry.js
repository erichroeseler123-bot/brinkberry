/**
 * National Race Track & Motorsports Facility Identity Registry
 *
 * Ground truth registry of verified track facility identities (short tracks, dirt ovals, paved ovals, dragstrips).
 * IMPORTANT: A verified track identity confirms the facility's domain, location, and surface;
 * it does NOT imply verified live events until exact source-backed schedules are ingested.
 */

function distMiles(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NATIONAL_RACE_TRACKS = [
  // --- Rocky Mountain / Plains ---
  {
    slug: 'colorado-national-speedway',
    name: 'Colorado National Speedway',
    address: '4281 Weld County Rd 10, Dacono, CO 80514',
    city: 'Dacono',
    state: 'CO',
    lat: 40.0768,
    lon: -104.9818,
    timezone: 'America/Denver',
    trackType: 'asphalt_oval',
    length: '3/8-mile',
    surface: 'asphalt',
    website: 'https://coloradospeedway.com',
    platform: 'custom',
    calendarFeedUrl: 'https://coloradospeedway.com/tickets',
    sanctions: ['NASCAR Advance Auto Parts Weekly', 'INEX'],
    coolersAllowed: true
  },
  {
    slug: 'i-76-speedway',
    name: 'I-76 Speedway',
    address: '16359 County Rd S, Fort Morgan, CO 80701',
    city: 'Fort Morgan',
    state: 'CO',
    lat: 40.2520,
    lon: -103.7980,
    timezone: 'America/Denver',
    trackType: 'dirt_oval',
    length: '1/4-mile',
    surface: 'dirt_clay',
    website: 'https://i-76speedway.com',
    platform: 'myracepass',
    calendarFeedUrl: 'https://i-76speedway.com/events',
    sanctions: ['IMCA Racing', 'BST Sprint Cars'],
    coolersAllowed: true
  },
  {
    slug: 'pueblo-motorsports-park',
    name: 'Pueblo Motorsports Park',
    address: '3733 N Pueblo Blvd, Pueblo, CO 81008',
    city: 'Pueblo',
    state: 'CO',
    lat: 38.3308,
    lon: -104.6648,
    timezone: 'America/Denver',
    trackType: 'drag_strip',
    length: '1/4-mile',
    surface: 'asphalt_concrete',
    website: 'https://pueblomotorsportspark.org',
    platform: 'custom',
    calendarFeedUrl: 'https://pueblomotorsportspark.org/events',
    sanctions: ['NHRA Member Track', 'SCCA'],
    coolersAllowed: true
  },

  // --- Midwest Dirt Capital (Iowa, Ohio, Indiana, Illinois, Missouri) ---
  {
    slug: 'knoxville-raceway',
    name: 'Knoxville Raceway',
    address: '1000 N Lincoln St, Knoxville, IA 50138',
    city: 'Knoxville',
    state: 'IA',
    lat: 41.3255,
    lon: -93.1018,
    timezone: 'America/Chicago',
    trackType: 'dirt_oval',
    length: '1/2-mile',
    surface: 'dirt_clay',
    tagline: 'The Sprint Car Capital of the World.',
    website: 'https://www.knoxvilleraceway.com',
    platform: 'myracepass',
    calendarFeedUrl: 'https://www.knoxvilleraceway.com/Schedule.aspx',
    sanctions: ['World of Outlaws', 'High Limit Racing', 'Knoxville Championship Series'],
    coolersAllowed: false
  },
  {
    slug: 'eldora-speedway',
    name: 'Eldora Speedway',
    address: '13929 OH-118, New Weston, OH 45348',
    city: 'Rossburg',
    state: 'OH',
    lat: 40.3164,
    lon: -84.6341,
    timezone: 'America/New_York',
    trackType: 'dirt_oval',
    length: '1/2-mile',
    surface: 'dirt_clay',
    tagline: 'The World’s Greatest Dirt Track.',
    website: 'https://www.eldoraspeedway.com',
    platform: 'custom',
    calendarFeedUrl: 'https://www.eldoraspeedway.com/schedule',
    sanctions: ['World of Outlaws', 'High Limit Racing', 'USAC National', 'Super DIRTcar'],
    coolersAllowed: true
  },
  {
    slug: 'kokomo-speedway',
    name: 'Kokomo Speedway',
    address: '2455 Davis Rd, Kokomo, IN 46901',
    city: 'Kokomo',
    state: 'IN',
    lat: 40.5097,
    lon: -86.1558,
    timezone: 'America/Indiana/Indianapolis',
    trackType: 'dirt_oval',
    length: '1/4-mile',
    surface: 'dirt_clay',
    tagline: 'Indiana’s Baddest Bullring.',
    website: 'https://www.kokomospeedway.net',
    platform: 'myracepass',
    calendarFeedUrl: 'https://www.kokomospeedway.net/schedule',
    sanctions: ['USAC National Sprint Cars', 'High Limit Racing', 'Smackdown'],
    coolersAllowed: true
  },
  {
    slug: 'fairbury-speedway',
    name: 'Fairbury Speedway (FALS)',
    address: '600 S 3rd St, Fairbury, IL 61739',
    city: 'Fairbury',
    state: 'IL',
    lat: 40.7422,
    lon: -88.5147,
    timezone: 'America/Chicago',
    trackType: 'dirt_oval',
    length: '1/4-mile',
    surface: 'dirt_clay',
    tagline: 'America’s Dirt Track — Home of the Prairie Dirt Classic.',
    website: 'https://www.fairburyspeedway.com',
    platform: 'myracepass',
    calendarFeedUrl: 'https://www.fairburyspeedway.com/schedule',
    sanctions: ['World of Outlaws Late Models', 'DIRTcar', 'MARS Late Models'],
    coolersAllowed: true
  },
  {
    slug: 'lucas-oil-speedway-wheatland',
    name: 'Lucas Oil Speedway',
    address: '700 E Hwy 54, Wheatland, MO 65779',
    city: 'Wheatland',
    state: 'MO',
    lat: 37.9405,
    lon: -93.3888,
    timezone: 'America/Chicago',
    trackType: 'dirt_oval',
    length: '3/8-mile',
    surface: 'dirt_clay',
    tagline: 'The Diamond of Dirt Tracks.',
    website: 'https://www.lucasoilspeedway.com',
    platform: 'myracepass',
    calendarFeedUrl: 'https://www.lucasoilspeedway.com/schedule',
    sanctions: ['Lucas Oil Late Model Dirt Series', 'MLRA', 'USRA'],
    coolersAllowed: false
  },

  // --- Northeast Dirt & Asphalt (Pennsylvania & New York) ---
  {
    slug: 'williams-grove-speedway',
    name: 'Williams Grove Speedway',
    address: '1 Speedway Dr, Mechanicsburg, PA 17055',
    city: 'Mechanicsburg',
    state: 'PA',
    lat: 40.1601,
    lon: -77.0305,
    timezone: 'America/New_York',
    trackType: 'dirt_oval',
    length: '1/2-mile',
    surface: 'dirt_clay',
    tagline: 'Historic home of the PA Posse 410 Sprint Cars.',
    website: 'https://www.williamsgrove.com',
    platform: 'custom',
    calendarFeedUrl: 'https://www.williamsgrove.com/schedule.htm',
    sanctions: ['World of Outlaws Sprint Cars', 'PA Posse', 'USAC Silver Crown'],
    coolersAllowed: true
  },
  {
    slug: 'port-royal-speedway',
    name: 'Port Royal Speedway',
    address: '307 W 8th St, Port Royal, PA 17082',
    city: 'Port Royal',
    state: 'PA',
    lat: 40.5312,
    lon: -77.3878,
    timezone: 'America/New_York',
    trackType: 'dirt_oval',
    length: '1/2-mile',
    surface: 'dirt_clay',
    tagline: 'The Speed Palace.',
    website: 'https://portroyalspeedway.com',
    platform: 'myracepass',
    calendarFeedUrl: 'https://portroyalspeedway.com/schedule',
    sanctions: ['High Limit Racing', 'World of Outlaws', 'Lucas Oil Late Models', 'Tuscarora 50'],
    coolersAllowed: true
  },
  {
    slug: 'oswego-speedway',
    name: 'Oswego Speedway',
    address: '300 E Albany St, Oswego, NY 13126',
    city: 'Oswego',
    state: 'NY',
    lat: 43.4542,
    lon: -76.4952,
    timezone: 'America/New_York',
    trackType: 'asphalt_oval',
    length: '5/8-mile',
    surface: 'asphalt',
    tagline: 'The Steel Palace — Home of the Supermodifieds.',
    website: 'https://www.oswegospeedway.com',
    platform: 'custom',
    calendarFeedUrl: 'https://www.oswegospeedway.com/schedule',
    sanctions: ['Supermodifieds', 'ISMA', 'Super DIRT Week'],
    coolersAllowed: true
  },

  // --- Southeast Short Tracks (Florida & Carolinas) ---
  {
    slug: 'volusia-speedway-park',
    name: 'Volusia Speedway Park',
    address: '1500 E State Rd 40, DeLeon Springs, FL 32130',
    city: 'Barberville',
    state: 'FL',
    lat: 29.1868,
    lon: -81.5218,
    timezone: 'America/New_York',
    trackType: 'dirt_oval',
    length: '1/2-mile',
    surface: 'dirt_clay',
    tagline: 'The World’s Fastest Half-Mile — Home of DIRTcar Nationals.',
    website: 'https://volusiaspeedwaypark.com',
    platform: 'custom',
    calendarFeedUrl: 'https://volusiaspeedwaypark.com/schedule/',
    sanctions: ['World of Outlaws', 'DIRTcar Nationals', 'Super DIRTcar Series'],
    coolersAllowed: true
  },
  {
    slug: 'hickory-motor-speedway',
    name: 'Hickory Motor Speedway',
    address: '313 18th St Dr SE, Newton, NC 28658',
    city: 'Newton',
    state: 'NC',
    lat: 35.6984,
    lon: -81.2829,
    timezone: 'America/New_York',
    trackType: 'asphalt_oval',
    length: '3/8-mile',
    surface: 'asphalt',
    tagline: 'Birthplace of the NASCAR Stars.',
    website: 'https://www.hickorymotorspeedway.com',
    platform: 'custom',
    calendarFeedUrl: 'https://www.hickorymotorspeedway.com/schedule',
    sanctions: ['NASCAR Advance Auto Parts Weekly', 'CARS Tour', 'Late Model Stock'],
    coolersAllowed: true
  },
  {
    slug: 'bowman-gray-stadium',
    name: 'Bowman Gray Stadium',
    address: '1250 S Martin Luther King Jr Dr, Winston-Salem, NC 27107',
    city: 'Winston-Salem',
    state: 'NC',
    lat: 36.0792,
    lon: -80.2312,
    timezone: 'America/New_York',
    trackType: 'asphalt_oval',
    length: '1/4-mile',
    surface: 'asphalt',
    tagline: 'The Madhouse — NASCAR’s Longest-Running Weekly Track.',
    website: 'https://www.bowmangrayracing.com',
    platform: 'custom',
    calendarFeedUrl: 'https://www.bowmangrayracing.com/schedule',
    sanctions: ['NASCAR Advance Auto Parts Weekly', 'Modifieds'],
    coolersAllowed: true
  },

  // --- West Coast / California ---
  {
    slug: 'perris-auto-speedway',
    name: 'Perris Auto Speedway',
    address: '18700 Lake Perris Dr, Perris, CA 92571',
    city: 'Perris',
    state: 'CA',
    lat: 33.8447,
    lon: -117.1895,
    timezone: 'America/Los_Angeles',
    trackType: 'dirt_oval',
    length: '1/2-mile',
    surface: 'dirt_clay',
    tagline: 'Southern California’s premier clay oval racing facility.',
    website: 'https://perrisautospeedway.com',
    platform: 'custom',
    calendarFeedUrl: 'https://perrisautospeedway.com/schedule',
    sanctions: ['USAC/CRA Sprint Cars', 'PASSCAR', 'Oval Nationals'],
    coolersAllowed: true
  }
];

function getNationalRaceTracks() {
  return NATIONAL_RACE_TRACKS.map(t => ({
    ...t,
    identityStatus: 'verified_track_identity'
  }));
}

function getRaceTrackBySlug(slug) {
  if (!slug) return null;
  const t = NATIONAL_RACE_TRACKS.find(item => item.slug === slug);
  return t ? { ...t, identityStatus: 'verified_track_identity' } : null;
}

function getNearbyRaceTracks(lat, lon, radiusMiles = 75) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return NATIONAL_RACE_TRACKS
    .map(t => {
      const d = distMiles(lat, lon, t.lat, t.lon);
      return {
        ...t,
        identityStatus: 'verified_track_identity',
        distanceMiles: d != null ? Number(d.toFixed(1)) : null
      };
    })
    .filter(t => t.distanceMiles != null && t.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

module.exports = {
  NATIONAL_RACE_TRACKS,
  getNationalRaceTracks,
  getRaceTrackBySlug,
  getNearbyRaceTracks,
  distMiles
};
