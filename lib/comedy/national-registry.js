/**
 * National Stand-Up Comedy Venue Identity Registry
 *
 * Ground truth registry of verified venue identities (dedicated clubs, theaters, alt-rooms).
 * IMPORTANT: A verified venue identity confirms the facility's domain and physical location;
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

const NATIONAL_COMEDY_VENUES = [
  // --- Denver / Front Range, CO ---
  {
    slug: 'comedy-works-downtown',
    name: 'Comedy Works Downtown',
    address: '1226 15th St, Denver, CO 80202',
    city: 'Denver',
    state: 'CO',
    lat: 39.7490,
    lon: -104.9989,
    timezone: 'America/Denver',
    website: 'https://www.comedyworks.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.comedyworks.com/comedians?venue=downtown',
    roomType: 'landmark_club',
    metro: 'Denver'
  },
  {
    slug: 'comedy-works-south',
    name: 'Comedy Works South at the Landmark',
    address: '5345 Landmark Pl, Greenwood Village, CO 80111',
    city: 'Greenwood Village',
    state: 'CO',
    lat: 39.6178,
    lon: -104.8988,
    timezone: 'America/Denver',
    website: 'https://www.comedyworks.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.comedyworks.com/comedians?venue=landmark',
    roomType: 'landmark_club',
    metro: 'Denver'
  },
  {
    slug: 'rise-comedy',
    name: 'RISE Comedy',
    address: '1260 22nd St, Denver, CO 80205',
    city: 'Denver',
    state: 'CO',
    lat: 39.7538,
    lon: -104.9942,
    timezone: 'America/Denver',
    website: 'https://risecomedy.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://risecomedy.com/calendar',
    roomType: 'independent_theater',
    metro: 'Denver'
  },
  {
    slug: 'denver-comedy-underground',
    name: 'Denver Comedy Underground',
    address: '1400 N Williams St, Denver, CO 80218',
    city: 'Denver',
    state: 'CO',
    lat: 39.7389,
    lon: -104.9654,
    timezone: 'America/Denver',
    website: 'https://denvercomedyunderground.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://denvercomedyunderground.com/events',
    roomType: 'independent_club',
    metro: 'Denver'
  },
  {
    slug: 'denver-comedy-lounge',
    name: 'Denver Comedy Lounge',
    address: '3559 Larimer St, Denver, CO 80205',
    city: 'Denver',
    state: 'CO',
    lat: 39.7661,
    lon: -104.9774,
    timezone: 'America/Denver',
    website: 'https://denvercomedylounge.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://denvercomedylounge.com/events',
    roomType: 'independent_club',
    metro: 'Denver'
  },
  {
    slug: 'the-bug-theatre',
    name: 'The Bug Theatre',
    address: '3654 Navajo St, Denver, CO 80211',
    city: 'Denver',
    state: 'CO',
    lat: 39.7675,
    lon: -105.0041,
    timezone: 'America/Denver',
    website: 'https://bugtheatre.org',
    ticketingEngine: 'ticketleap',
    calendarFeedUrl: 'https://bugtheatre.org/events',
    roomType: 'independent_theater',
    metro: 'Denver'
  },
  {
    slug: 'wide-right-denver',
    name: 'Wide Right',
    address: '2110 Curtis St, Denver, CO 80205',
    city: 'Denver',
    state: 'CO',
    lat: 39.7531,
    lon: -104.9897,
    timezone: 'America/Denver',
    website: 'https://widerightdenver.com',
    ticketingEngine: 'free_admission',
    calendarFeedUrl: 'https://widerightdenver.com',
    roomType: 'brewery_alt_room',
    metro: 'Denver'
  },
  {
    slug: 'denver-improv',
    name: 'Denver Improv',
    address: '8246 E 49th Ave Ste 1400, Denver, CO 80238',
    city: 'Denver',
    state: 'CO',
    lat: 39.7890,
    lon: -104.8875,
    timezone: 'America/Denver',
    website: 'https://denver.improv.com',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://denver.improv.com/calendar',
    roomType: 'landmark_club',
    metro: 'Denver'
  },

  // --- New York City, NY ---
  {
    slug: 'comedy-cellar-nyc',
    name: 'Comedy Cellar',
    address: '117 MacDougal St, New York, NY 10012',
    city: 'New York',
    state: 'NY',
    lat: 40.7300,
    lon: -74.0006,
    timezone: 'America/New_York',
    website: 'https://www.comedycellar.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.comedycellar.com/new-york-line-up/',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'the-stand-nyc',
    name: 'The Stand NYC',
    address: '116 E 16th St, New York, NY 10003',
    city: 'New York',
    state: 'NY',
    lat: 40.7368,
    lon: -73.9882,
    timezone: 'America/New_York',
    website: 'https://thestandnyc.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://thestandnyc.com/shows',
    roomType: 'independent_club',
    metro: 'New York'
  },
  {
    slug: 'gotham-comedy-club',
    name: 'Gotham Comedy Club',
    address: '208 W 23rd St, New York, NY 10011',
    city: 'New York',
    state: 'NY',
    lat: 40.7445,
    lon: -73.9965,
    timezone: 'America/New_York',
    website: 'https://gothamcomedyclub.com',
    ticketingEngine: 'tixr',
    calendarFeedUrl: 'https://gothamcomedyclub.com/calendar',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'eastville-comedy-club',
    name: 'EastVille Comedy Club',
    address: '487 Atlantic Ave, Brooklyn, NY 11217',
    city: 'New York',
    state: 'NY',
    lat: 40.6865,
    lon: -73.9823,
    timezone: 'America/New_York',
    website: 'https://www.eastvillecomedy.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.eastvillecomedy.com/calendar',
    roomType: 'independent_club',
    metro: 'New York'
  },
  {
    slug: 'the-bell-house-nyc',
    name: 'The Bell House',
    address: '149 7th St, Brooklyn, NY 11215',
    city: 'New York',
    state: 'NY',
    lat: 40.6738,
    lon: -73.9934,
    timezone: 'America/New_York',
    website: 'https://thebellhouseny.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://thebellhouseny.com/shows',
    roomType: 'independent_theater',
    metro: 'New York'
  },
  {
    slug: 'comic-strip-live-nyc',
    name: 'Comic Strip Live',
    address: '1568 2nd Ave, New York, NY 10028',
    city: 'New York',
    state: 'NY',
    lat: 40.7745,
    lon: -73.9535,
    timezone: 'America/New_York',
    website: 'https://comicstriplive.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://comicstriplive.com',
    roomType: 'landmark_club',
    metro: 'New York'
  },

  // --- Chicago, IL ---
  {
    slug: 'second-city-chicago',
    name: 'The Second City',
    address: '1616 N Wells St, Chicago, IL 60614',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9116,
    lon: -87.6350,
    timezone: 'America/Chicago',
    website: 'https://www.secondcity.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.secondcity.com/shows/chicago',
    roomType: 'landmark_theater',
    metro: 'Chicago'
  },
  {
    slug: 'zanies-comedy-club-chicago',
    name: 'Zanies Comedy Club',
    address: '1548 N Wells St, Chicago, IL 60614',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9103,
    lon: -87.6358,
    timezone: 'America/Chicago',
    website: 'https://zanies.com',
    ticketingEngine: 'etix',
    calendarFeedUrl: 'https://chicago.zanies.com/events',
    roomType: 'landmark_club',
    metro: 'Chicago'
  },
  {
    slug: 'laugh-factory-chicago',
    name: 'Laugh Factory Chicago',
    address: '3175 N Broadway, Chicago, IL 60657',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9392,
    lon: -87.6492,
    timezone: 'America/Chicago',
    website: 'https://www.laughfactory.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.laughfactory.com/chicago',
    roomType: 'landmark_club',
    metro: 'Chicago'
  },
  {
    slug: 'the-lincoln-lodge',
    name: 'The Lincoln Lodge',
    address: '2040 N Milwaukee Ave, Chicago, IL 60647',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9189,
    lon: -87.6881,
    timezone: 'America/Chicago',
    website: 'https://www.thelincolnlodge.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.thelincolnlodge.com/calendar',
    roomType: 'independent_theater',
    metro: 'Chicago'
  },

  // --- Los Angeles, CA ---
  {
    slug: 'the-comedy-store-hollywood',
    name: 'The Comedy Store',
    address: '8433 Sunset Blvd, West Hollywood, CA 90069',
    city: 'West Hollywood',
    state: 'CA',
    lat: 34.0921,
    lon: -118.3758,
    timezone: 'America/Los_Angeles',
    website: 'https://thecomedystore.com',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://thecomedystore.com/calendar',
    roomType: 'landmark_club',
    metro: 'Los Angeles'
  },
  {
    slug: 'laugh-factory-hollywood',
    name: 'Laugh Factory Hollywood',
    address: '8001 Sunset Blvd, Los Angeles, CA 90046',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0982,
    lon: -118.3644,
    timezone: 'America/Los_Angeles',
    website: 'https://www.laughfactory.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.laughfactory.com/hollywood',
    roomType: 'landmark_club',
    metro: 'Los Angeles'
  },
  {
    slug: 'dynasty-typewriter',
    name: 'Dynasty Typewriter',
    address: '2511 Wilshire Blvd, Los Angeles, CA 90057',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0617,
    lon: -118.2818,
    timezone: 'America/Los_Angeles',
    website: 'https://www.dynastytypewriter.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.dynastytypewriter.com/calendar',
    roomType: 'independent_theater',
    metro: 'Los Angeles'
  },
  {
    slug: 'the-elysian-theater',
    name: 'The Elysian Theater',
    address: '1944 Riverside Dr, Los Angeles, CA 90039',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0934,
    lon: -118.2503,
    timezone: 'America/Los_Angeles',
    website: 'https://www.elysiantheater.com',
    ticketingEngine: 'dice',
    calendarFeedUrl: 'https://www.elysiantheater.com',
    roomType: 'independent_theater',
    metro: 'Los Angeles'
  },

  // --- San Francisco / Bay Area, CA ---
  {
    slug: 'cobbs-comedy-club',
    name: "Cobb's Comedy Club",
    address: '915 Columbus Ave, San Francisco, CA 94133',
    city: 'San Francisco',
    state: 'CA',
    lat: 37.8028,
    lon: -122.4172,
    timezone: 'America/Los_Angeles',
    website: 'https://www.cobbscomedy.com',
    ticketingEngine: 'livenation_ticketmaster',
    calendarFeedUrl: 'https://www.cobbscomedy.com/calendar',
    roomType: 'landmark_club',
    metro: 'San Francisco'
  },

  // --- Austin, TX ---
  {
    slug: 'comedy-mothership',
    name: 'Comedy Mothership',
    address: '320 E 6th St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2678,
    lon: -97.7402,
    timezone: 'America/Chicago',
    website: 'https://comedymothership.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://comedymothership.com/shows',
    roomType: 'landmark_club',
    metro: 'Austin'
  },
  {
    slug: 'laffs-comedy-caffe-tucson',
    name: "Laff's Comedy Caffe",
    address: '2900 E Broadway Blvd, Tucson, AZ 85716',
    city: 'Tucson',
    state: 'AZ',
    lat: 32.2217,
    lon: -110.9298,
    timezone: 'America/Phoenix',
    website: 'https://www.laffstucson.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.laffstucson.com',
    roomType: 'independent_club',
    metro: 'Tucson'
  },
  {
    slug: 'the-creek-and-the-cave-austin',
    name: 'The Creek and the Cave',
    address: '611 E 7th St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2689,
    lon: -97.7348,
    timezone: 'America/Chicago',
    website: 'https://creekandcave.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://creekandcave.com/events',
    roomType: 'independent_club',
    metro: 'Austin'
  },

  // --- Birmingham, AL ---
  {
    slug: 'stardome-comedy-club-birmingham',
    name: 'Stardome Comedy Club',
    address: '1818 Data Drive, Birmingham, AL 35244',
    city: 'Birmingham',
    state: 'AL',
    lat: 33.3752,
    lon: -86.8122,
    timezone: 'America/Chicago',
    website: 'https://www.stardome.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.stardome.com',
    roomType: 'landmark_club',
    metro: 'Birmingham'
  },

  // --- Charlotte, NC ---
  {
    slug: 'the-comedy-zone-charlotte',
    name: 'The Comedy Zone Charlotte',
    address: '900 North Carolina Music Factory Blvd, Charlotte, NC 28206',
    city: 'Charlotte',
    state: 'NC',
    lat: 35.2407,
    lon: -80.8491,
    timezone: 'America/New_York',
    website: 'https://www.cltcomedyzone.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.cltcomedyzone.com',
    roomType: 'landmark_club',
    metro: 'Charlotte'
  },

  // --- Minneapolis / St. Paul, MN ---
  {
    slug: 'acme-comedy-company-minneapolis',
    name: 'Acme Comedy Company',
    address: '708 North First Street, Minneapolis, MN 55401',
    city: 'Minneapolis',
    state: 'MN',
    lat: 44.9877,
    lon: -93.2721,
    timezone: 'America/Chicago',
    website: 'https://acmecomedycompany.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://acmecomedy.seatengine.com/events/',
    roomType: 'landmark_club',
    metro: 'Minneapolis'
  },
  {
    slug: 'sisyphus-brewing',
    name: 'Sisyphus Brewing Comedy Room',
    address: '712 Ontario Ave W #100, Minneapolis, MN 55403',
    city: 'Minneapolis',
    state: 'MN',
    lat: 44.9754,
    lon: -93.2906,
    timezone: 'America/Chicago',
    website: 'https://www.sisyphusbrewing.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.sisyphusbrewing.com',
    roomType: 'brewery_alt_room',
    metro: 'Minneapolis'
  },

  // --- Nashville, TN ---
  {
    slug: 'zanies-comedy-club-nashville',
    name: 'Zanies Comedy Club Nashville',
    address: '2025 8th Ave S, Nashville, TN 37204',
    city: 'Nashville',
    state: 'TN',
    lat: 36.1342,
    lon: -86.7794,
    timezone: 'America/Chicago',
    website: 'https://nashville.zanies.com',
    ticketingEngine: 'etix',
    calendarFeedUrl: 'https://nashville.zanies.com/events',
    roomType: 'landmark_club',
    metro: 'Nashville'
  },

  // --- Atlanta, GA ---
  {
    slug: 'the-punchline-comedy-club-atlanta',
    name: 'The Punchline Comedy Club',
    address: '3652 Roswell Rd NE, Atlanta, GA 30342',
    city: 'Atlanta',
    state: 'GA',
    lat: 33.8552,
    lon: -84.3813,
    timezone: 'America/New_York',
    website: 'https://punchline.com',
    ticketingEngine: 'wordpress_the_events_calendar',
    calendarFeedUrl: 'https://www.punchline.com/events/?ical=1',
    roomType: 'landmark_club',
    metro: 'Atlanta'
  },
  {
    slug: 'laughing-skull-lounge',
    name: 'Laughing Skull Lounge',
    address: '878 Peachtree St NE, Atlanta, GA 30309',
    city: 'Atlanta',
    state: 'GA',
    lat: 33.7788,
    lon: -84.3853,
    timezone: 'America/New_York',
    website: 'https://laughingskulllounge.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://laughingskulllounge.com',
    roomType: 'landmark_club',
    metro: 'Atlanta'
  },

  // --- Seattle, WA ---
  {
    slug: 'here-after-seattle',
    name: 'Here-After at the Crocodile',
    address: '2505 1st Ave, Seattle, WA 98121',
    city: 'Seattle',
    state: 'WA',
    lat: 47.6160,
    lon: -122.3508,
    timezone: 'America/Los_Angeles',
    website: 'https://www.hereafterseattle.com',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://www.hereafterseattle.com/events',
    roomType: 'independent_theater',
    metro: 'Seattle'
  },

  // --- Upper Midwest / Community ---
  {
    slug: 'clearwater-comedy-eau-claire',
    name: 'Clearwater Comedy (The Plus)',
    address: '208 S Barstow St, Eau Claire, WI 54701',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.8113,
    lon: -91.4985,
    timezone: 'America/Chicago',
    website: 'https://theplus.ec',
    ticketingEngine: 'free_admission',
    calendarFeedUrl: 'https://theplus.ec/events',
    roomType: 'brewery_alt_room',
    metro: 'Eau Claire'
  },

  // --- Chicago, IL ---
  {
    slug: 'zanies-chicago',
    name: 'Zanies Comedy Club Chicago',
    address: '1548 N Wells St, Chicago, IL 60610',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9108,
    lon: -87.6353,
    timezone: 'America/Chicago',
    website: 'https://chicago.zanies.com',
    ticketingEngine: 'etix',
    calendarFeedUrl: 'https://chicago.zanies.com/events/',
    roomType: 'landmark_club',
    metro: 'Chicago'
  },
  {
    slug: 'zanies-rosemont',
    name: 'Zanies Comedy Club Rosemont',
    address: '5437 Park Pl, Rosemont, IL 60018',
    city: 'Rosemont',
    state: 'IL',
    lat: 41.9774,
    lon: -87.8651,
    timezone: 'America/Chicago',
    website: 'https://rosemont.zanies.com',
    ticketingEngine: 'etix',
    calendarFeedUrl: 'https://rosemont.zanies.com/events/',
    roomType: 'landmark_club',
    metro: 'Chicago'
  },
  {
    slug: 'lincoln-lodge-chicago',
    name: 'The Lincoln Lodge',
    address: '2040 N Milwaukee Ave, Chicago, IL 60647',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9189,
    lon: -87.6874,
    timezone: 'America/Chicago',
    website: 'https://thelincolnlodge.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.thelincolnlodge.com/calendar',
    roomType: 'independent_theater',
    metro: 'Chicago'
  },
  {
    slug: 'annoyance-theatre-chicago',
    name: 'The Annoyance Theatre & Bar',
    address: '851 W Belmont Ave, Chicago, IL 60657',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9397,
    lon: -87.6514,
    timezone: 'America/Chicago',
    website: 'https://theannoyance.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://theannoyance.com/shows',
    roomType: 'independent_theater',
    metro: 'Chicago'
  },

  // --- Austin, TX ---
  {
    slug: 'cap-city-comedy-club-austin',
    name: 'Cap City Comedy Club',
    address: '11506 Century Oaks Terrace, Austin, TX 78758',
    city: 'Austin',
    state: 'TX',
    lat: 30.4021,
    lon: -97.7247,
    timezone: 'America/Chicago',
    website: 'https://www.capcitycomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.capcitycomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Austin'
  },
  {
    slug: 'creek-and-cave-austin',
    name: 'The Creek and the Cave Austin',
    address: '611 E 7th St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2680,
    lon: -97.7347,
    timezone: 'America/Chicago',
    website: 'https://creekandcave.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://creekandcave.com/events',
    roomType: 'landmark_club',
    metro: 'Austin'
  },
  {
    slug: 'vulcan-gas-company-austin',
    name: 'Vulcan Gas Company',
    address: '418 E 6th St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2673,
    lon: -97.7397,
    timezone: 'America/Chicago',
    website: 'https://www.vulcantx.com',
    ticketingEngine: 'tixr',
    calendarFeedUrl: 'https://www.vulcantx.com/shows',
    roomType: 'independent_theater',
    metro: 'Austin'
  },
  {
    slug: 'comedy-mothership-austin',
    name: 'Comedy Mothership',
    address: '320 E 6th St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2675,
    lon: -97.7408,
    timezone: 'America/Chicago',
    website: 'https://comedymothership.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://comedymothership.com/shows',
    roomType: 'landmark_club',
    metro: 'Austin'
  },
  {
    slug: 'fallout-theater-austin',
    name: 'Fallout Theater',
    address: '616 Lavaca St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2701,
    lon: -97.7451,
    timezone: 'America/Chicago',
    website: 'https://fallouttheater.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://fallouttheater.com',
    roomType: 'independent_theater',
    metro: 'Austin'
  },

  // --- New York / Tri-State ---
  {
    slug: 'gotham-comedy-club-nyc',
    name: 'Gotham Comedy Club',
    address: '208 W 23rd St, New York, NY 10011',
    city: 'New York',
    state: 'NY',
    lat: 40.7441,
    lon: -73.9961,
    timezone: 'America/New_York',
    website: 'https://gothamcomedyclub.com',
    ticketingEngine: 'tixr',
    calendarFeedUrl: 'https://gothamcomedyclub.com/calendar',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'new-york-comedy-club-midtown',
    name: 'New York Comedy Club Midtown',
    address: '241 E 24th St, New York, NY 10010',
    city: 'New York',
    state: 'NY',
    lat: 40.7389,
    lon: -73.9806,
    timezone: 'America/New_York',
    website: 'https://newyorkcomedyclub.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://newyorkcomedyclub.com/events',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'new-york-comedy-club-east-village',
    name: 'New York Comedy Club East Village',
    address: '85 E 4th St, New York, NY 10003',
    city: 'New York',
    state: 'NY',
    lat: 40.7258,
    lon: -73.9898,
    timezone: 'America/New_York',
    website: 'https://newyorkcomedyclub.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://newyorkcomedyclub.com/events',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'stand-up-ny',
    name: 'Stand Up NY',
    address: '236 W 78th St, New York, NY 10024',
    city: 'New York',
    state: 'NY',
    lat: 40.7834,
    lon: -73.9809,
    timezone: 'America/New_York',
    website: 'https://standupny.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://standupny.com',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'greenwich-village-comedy-club',
    name: 'Greenwich Village Comedy Club',
    address: '99 MacDougal St, New York, NY 10012',
    city: 'New York',
    state: 'NY',
    lat: 40.7297,
    lon: -74.0003,
    timezone: 'America/New_York',
    website: 'https://greenwichvillagecomedyclub.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://greenwichvillagecomedyclub.com/calendar',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'bananas-comedy-club-nj',
    name: 'Bananas Comedy Club',
    address: '801 Rutherford Ave, Rutherford, NJ 07070',
    city: 'Rutherford',
    state: 'NJ',
    lat: 40.8286,
    lon: -74.0842,
    timezone: 'America/New_York',
    website: 'https://bananascomedyclub.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://bananascomedyclub.com/events',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'stress-factory-new-brunswick',
    name: 'Stress Factory Comedy Club New Brunswick',
    address: '90 Church St, New Brunswick, NJ 08901',
    city: 'New Brunswick',
    state: 'NJ',
    lat: 40.4955,
    lon: -74.4442,
    timezone: 'America/New_York',
    website: 'https://newbrunswick.stressfactory.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://newbrunswick.stressfactory.com/events',
    roomType: 'landmark_club',
    metro: 'New York'
  },
  {
    slug: 'stress-factory-bridgeport',
    name: 'Stress Factory Comedy Club Bridgeport',
    address: '167 State St, Bridgeport, CT 06604',
    city: 'Bridgeport',
    state: 'CT',
    lat: 41.1770,
    lon: -73.1895,
    timezone: 'America/New_York',
    website: 'https://bridgeport.stressfactory.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://bridgeport.stressfactory.com/events',
    roomType: 'landmark_club',
    metro: 'Bridgeport'
  },
  {
    slug: 'helium-comedy-club-buffalo',
    name: 'Helium Comedy Club Buffalo',
    address: '30 Mississippi St, Buffalo, NY 14203',
    city: 'Buffalo',
    state: 'NY',
    lat: 42.8770,
    lon: -78.8715,
    timezone: 'America/New_York',
    website: 'https://buffalo.heliumcomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://buffalo.heliumcomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Buffalo'
  },
  {
    slug: 'goodnights-comedy-club-raleigh',
    name: 'Goodnights Comedy Club',
    address: '4003 Arrow Dr, Raleigh, NC 27612',
    city: 'Raleigh',
    state: 'NC',
    lat: 35.8363,
    lon: -78.6836,
    timezone: 'America/New_York',
    website: 'https://www.goodnightscomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.goodnightscomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Raleigh'
  },

  // --- Boston / New England ---
  {
    slug: 'laugh-boston',
    name: 'Laugh Boston',
    address: '425 Summer St, Boston, MA 02210',
    city: 'Boston',
    state: 'MA',
    lat: 42.3484,
    lon: -71.0441,
    timezone: 'America/New_York',
    website: 'https://laughboston.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://laughboston.com',
    roomType: 'landmark_club',
    metro: 'Boston'
  },
  {
    slug: 'nicks-comedy-stop-boston',
    name: "Nick's Comedy Stop",
    address: '100 Warrenton St, Boston, MA 02116',
    city: 'Boston',
    state: 'MA',
    lat: 42.3512,
    lon: -71.0664,
    timezone: 'America/New_York',
    website: 'https://nickscomedystop.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://nickscomedystop.com',
    roomType: 'landmark_club',
    metro: 'Boston'
  },
  {
    slug: 'comedy-studio-somerville',
    name: 'The Comedy Studio',
    address: '5 Bow St, Somerville, MA 02143',
    city: 'Somerville',
    state: 'MA',
    lat: 42.3804,
    lon: -71.0967,
    timezone: 'America/New_York',
    website: 'https://thecomedystudio.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://thecomedystudio.com/calendar',
    roomType: 'independent_theater',
    metro: 'Boston'
  },

  // --- San Francisco / Bay Area ---
  {
    slug: 'cobbs-comedy-club-sf',
    name: "Cobb's Comedy Club",
    address: '915 Columbus Ave, San Francisco, CA 94133',
    city: 'San Francisco',
    state: 'CA',
    lat: 37.8028,
    lon: -122.4168,
    timezone: 'America/Los_Angeles',
    website: 'https://www.cobbscomedy.com',
    ticketingEngine: 'ticketmaster',
    calendarFeedUrl: 'https://www.cobbscomedy.com/shows',
    roomType: 'landmark_club',
    metro: 'San Francisco'
  },
  {
    slug: 'punch-line-san-francisco',
    name: 'Punch Line San Francisco',
    address: '444 Battery St, San Francisco, CA 94111',
    city: 'San Francisco',
    state: 'CA',
    lat: 37.7944,
    lon: -122.4005,
    timezone: 'America/Los_Angeles',
    website: 'https://www.punchlinecomedyclub.com',
    ticketingEngine: 'ticketmaster',
    calendarFeedUrl: 'https://www.punchlinecomedyclub.com/shows',
    roomType: 'landmark_club',
    metro: 'San Francisco'
  },
  {
    slug: 'san-jose-improv',
    name: 'San Jose Improv',
    address: '62 S 2nd St, San Jose, CA 95113',
    city: 'San Jose',
    state: 'CA',
    lat: 37.3361,
    lon: -121.8887,
    timezone: 'America/Los_Angeles',
    website: 'https://improv.com/sanjose/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/sanjose/calendar/',
    roomType: 'landmark_club',
    metro: 'San Jose'
  },
  {
    slug: 'rooster-t-feathers-sunnyvale',
    name: 'Rooster T. Feathers Comedy Club',
    address: '157 W El Camino Real, Sunnyvale, CA 94087',
    city: 'Sunnyvale',
    state: 'CA',
    lat: 37.3688,
    lon: -122.0353,
    timezone: 'America/Los_Angeles',
    website: 'https://roostertfeathers.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://roostertfeathers.com/events',
    roomType: 'landmark_club',
    metro: 'San Jose'
  },

  // --- Los Angeles / Southern California ---
  {
    slug: 'hollywood-improv',
    name: 'Hollywood Improv',
    address: '8162 Melrose Ave, Los Angeles, CA 90046',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0837,
    lon: -118.3676,
    timezone: 'America/Los_Angeles',
    website: 'https://improv.com/hollywood/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/hollywood/calendar/',
    roomType: 'landmark_club',
    metro: 'Los Angeles'
  },
  {
    slug: 'the-ice-house-pasadena',
    name: 'The Ice House',
    address: '24 N Mentor Ave, Pasadena, CA 91106',
    city: 'Pasadena',
    state: 'CA',
    lat: 34.1460,
    lon: -118.1332,
    timezone: 'America/Los_Angeles',
    website: 'https://icehousecomedy.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://icehousecomedy.com',
    roomType: 'landmark_club',
    metro: 'Los Angeles'
  },
  {
    slug: 'brea-improv',
    name: 'Brea Improv',
    address: '120 S Brea Blvd, Brea, CA 92821',
    city: 'Brea',
    state: 'CA',
    lat: 33.9169,
    lon: -117.9009,
    timezone: 'America/Los_Angeles',
    website: 'https://improv.com/brea/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/brea/calendar/',
    roomType: 'landmark_club',
    metro: 'Orange County'
  },
  {
    slug: 'irvine-improv',
    name: 'Irvine Improv',
    address: '527 Spectrum Center Dr, Irvine, CA 92618',
    city: 'Irvine',
    state: 'CA',
    lat: 33.6508,
    lon: -117.7439,
    timezone: 'America/Los_Angeles',
    website: 'https://improv.com/irvine/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/irvine/calendar/',
    roomType: 'landmark_club',
    metro: 'Orange County'
  },
  {
    slug: 'dynasty-typewriter-la',
    name: 'Dynasty Typewriter',
    address: '2511 Wilshire Blvd, Los Angeles, CA 90057',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0609,
    lon: -118.2818,
    timezone: 'America/Los_Angeles',
    website: 'https://www.dynastytypewriter.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.dynastytypewriter.com/calendar',
    roomType: 'independent_theater',
    metro: 'Los Angeles'
  },

  // --- Washington DC / Maryland / Virginia ---
  {
    slug: 'dc-improv',
    name: 'DC Improv',
    address: '1140 Connecticut Ave NW, Washington, DC 20036',
    city: 'Washington',
    state: 'DC',
    lat: 38.9051,
    lon: -77.0402,
    timezone: 'America/New_York',
    website: 'https://www.dcimprov.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.dcimprov.com',
    roomType: 'landmark_club',
    metro: 'Washington DC'
  },
  {
    slug: 'magoobys-joke-house-timonium',
    name: "Magooby's Joke House",
    address: '9603 Deereco Rd, Timonium, MD 21093',
    city: 'Timonium',
    state: 'MD',
    lat: 39.4394,
    lon: -76.6268,
    timezone: 'America/New_York',
    website: 'https://magoobysjokehouse.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://magoobysjokehouse.com/events',
    roomType: 'landmark_club',
    metro: 'Baltimore'
  },
  {
    slug: 'arlington-drafthouse',
    name: "Arlington Cinema 'N' Drafthouse",
    address: '2903 Columbia Pike, Arlington, VA 22204',
    city: 'Arlington',
    state: 'VA',
    lat: 38.8624,
    lon: -77.0864,
    timezone: 'America/New_York',
    website: 'https://www.arlingtondrafthouse.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.arlingtondrafthouse.com/events',
    roomType: 'independent_theater',
    metro: 'Washington DC'
  },

  // --- Philadelphia, PA ---
  {
    slug: 'helium-comedy-club-philadelphia',
    name: 'Helium Comedy Club Philadelphia',
    address: '2031 Sansom St, Philadelphia, PA 19103',
    city: 'Philadelphia',
    state: 'PA',
    lat: 39.9510,
    lon: -75.1746,
    timezone: 'America/New_York',
    website: 'https://philadelphia.heliumcomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://philadelphia.heliumcomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Philadelphia'
  },
  {
    slug: 'punch-line-philly',
    name: 'Punch Line Philly',
    address: '33 E Laurel St, Philadelphia, PA 19123',
    city: 'Philadelphia',
    state: 'PA',
    lat: 39.9652,
    lon: -75.1354,
    timezone: 'America/New_York',
    website: 'https://www.punchlinephilly.com',
    ticketingEngine: 'ticketmaster',
    calendarFeedUrl: 'https://www.punchlinephilly.com/shows',
    roomType: 'landmark_club',
    metro: 'Philadelphia'
  },

  // --- Portland, OR ---
  {
    slug: 'helium-comedy-club-portland',
    name: 'Helium Comedy Club Portland',
    address: '1510 SE 9th Ave, Portland, OR 97214',
    city: 'Portland',
    state: 'OR',
    lat: 45.5122,
    lon: -122.6568,
    timezone: 'America/Los_Angeles',
    website: 'https://portland.heliumcomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://portland.heliumcomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Portland'
  },
  {
    slug: 'curious-comedy-theater-portland',
    name: 'Curious Comedy Theater',
    address: '5225 NE Martin Luther King Jr Blvd, Portland, OR 97211',
    city: 'Portland',
    state: 'OR',
    lat: 45.5611,
    lon: -122.6617,
    timezone: 'America/Los_Angeles',
    website: 'https://www.curiouscomedy.org',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.curiouscomedy.org/shows',
    roomType: 'independent_theater',
    metro: 'Portland'
  },

  // --- Indianapolis, IN ---
  {
    slug: 'helium-comedy-club-indianapolis',
    name: 'Helium Comedy Club Indianapolis',
    address: '10 W Georgia St, Indianapolis, IN 46225',
    city: 'Indianapolis',
    state: 'IN',
    lat: 39.7644,
    lon: -86.1593,
    timezone: 'America/Indiana/Indianapolis',
    website: 'https://indianapolis.heliumcomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://indianapolis.heliumcomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Indianapolis'
  },
  {
    slug: 'crackers-comedy-club-indianapolis',
    name: 'Crackers Comedy Club',
    address: '207 N Delaware St, Indianapolis, IN 46204',
    city: 'Indianapolis',
    state: 'IN',
    lat: 39.7706,
    lon: -86.1539,
    timezone: 'America/Indiana/Indianapolis',
    website: 'https://www.crackerscomedy.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.crackerscomedy.com/schedule',
    roomType: 'landmark_club',
    metro: 'Indianapolis'
  },

  // --- St. Louis, MO ---
  {
    slug: 'helium-comedy-club-st-louis',
    name: 'Helium Comedy Club St. Louis',
    address: '1151 St Louis Galleria St, St. Louis, MO 63117',
    city: 'St. Louis',
    state: 'MO',
    lat: 38.6367,
    lon: -90.3473,
    timezone: 'America/Chicago',
    website: 'https://st-louis.heliumcomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://st-louis.heliumcomedy.com/events',
    roomType: 'landmark_club',
    metro: 'St. Louis'
  },
  {
    slug: 'st-louis-funny-bone',
    name: 'St. Louis Funny Bone',
    address: '614 Westport Plaza, St. Louis, MO 63146',
    city: 'St. Louis',
    state: 'MO',
    lat: 38.7061,
    lon: -90.4507,
    timezone: 'America/Chicago',
    website: 'https://www.stlouisfunnybone.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://www.stlouisfunnybone.com/events',
    roomType: 'landmark_club',
    metro: 'St. Louis'
  },

  // --- Cleveland / Columbus, OH ---
  {
    slug: 'hilarities-4th-street-theatre-cleveland',
    name: 'Hilarities 4th Street Theatre',
    address: '2035 E 4th St, Cleveland, OH 44115',
    city: 'Cleveland',
    state: 'OH',
    lat: 41.4988,
    lon: -81.6904,
    timezone: 'America/New_York',
    website: 'https://hilarities.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://hilarities.com/events',
    roomType: 'landmark_club',
    metro: 'Cleveland'
  },
  {
    slug: 'funny-bone-columbus',
    name: 'Columbus Funny Bone',
    address: '145 Easton Town Ctr, Columbus, OH 43219',
    city: 'Columbus',
    state: 'OH',
    lat: 40.0504,
    lon: -82.9174,
    timezone: 'America/New_York',
    website: 'https://columbus.funnybone.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://columbus.funnybone.com/events',
    roomType: 'landmark_club',
    metro: 'Columbus'
  },

  // --- Pittsburgh, PA ---
  {
    slug: 'pittsburgh-improv',
    name: 'Pittsburgh Improv',
    address: '166 E Bridge St, Homestead, PA 15120',
    city: 'Homestead',
    state: 'PA',
    lat: 40.4109,
    lon: -79.9145,
    timezone: 'America/New_York',
    website: 'https://improv.com/pittsburgh/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/pittsburgh/calendar/',
    roomType: 'landmark_club',
    metro: 'Pittsburgh'
  },
  {
    slug: 'arcade-comedy-theater-pittsburgh',
    name: 'Arcade Comedy Theater',
    address: '943 Liberty Ave, Pittsburgh, PA 15222',
    city: 'Pittsburgh',
    state: 'PA',
    lat: 40.4433,
    lon: -79.9969,
    timezone: 'America/New_York',
    website: 'https://www.arcadecomedytheater.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://www.arcadecomedytheater.com/events',
    roomType: 'independent_theater',
    metro: 'Pittsburgh'
  },

  // --- Phoenix / Tempe, AZ ---
  {
    slug: 'stand-up-live-phoenix',
    name: 'Stand Up Live Phoenix',
    address: '50 W Jefferson St, Phoenix, AZ 85003',
    city: 'Phoenix',
    state: 'AZ',
    lat: 33.4475,
    lon: -112.0739,
    timezone: 'America/Phoenix',
    website: 'https://phoenix.standuplive.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://phoenix.standuplive.com/events',
    roomType: 'landmark_club',
    metro: 'Phoenix'
  },
  {
    slug: 'tempe-improv',
    name: 'Tempe Improv',
    address: '930 E University Dr, Tempe, AZ 85281',
    city: 'Tempe',
    state: 'AZ',
    lat: 33.4221,
    lon: -111.9242,
    timezone: 'America/Phoenix',
    website: 'https://tempeimprov.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://tempeimprov.com/events',
    roomType: 'landmark_club',
    metro: 'Phoenix'
  },

  // --- Dallas / Fort Worth, TX ---
  {
    slug: 'dallas-comedy-club',
    name: 'Dallas Comedy Club',
    address: '3036 Elm St, Dallas, TX 75226',
    city: 'Dallas',
    state: 'TX',
    lat: 32.7844,
    lon: -96.7841,
    timezone: 'America/Chicago',
    website: 'https://dallas-comedyclub.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://dallas-comedyclub.com',
    roomType: 'landmark_club',
    metro: 'Dallas'
  },
  {
    slug: 'addison-improv',
    name: 'Addison Improv',
    address: '4980 Belt Line Rd, Dallas, TX 75254',
    city: 'Dallas',
    state: 'TX',
    lat: 32.9537,
    lon: -96.8229,
    timezone: 'America/Chicago',
    website: 'https://improv.com/addison/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/addison/calendar/',
    roomType: 'landmark_club',
    metro: 'Dallas'
  },

  // --- Houston, TX ---
  {
    slug: 'houston-improv',
    name: 'Houston Improv',
    address: '7620 Katy Fwy, Houston, TX 77024',
    city: 'Houston',
    state: 'TX',
    lat: 29.7847,
    lon: -95.4746,
    timezone: 'America/Chicago',
    website: 'https://improv.com/houston/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/houston/calendar/',
    roomType: 'landmark_club',
    metro: 'Houston'
  },
  {
    slug: 'the-riot-comedy-club-houston',
    name: 'The Riot Comedy Club',
    address: '2018 Buffalo Terrace, Houston, TX 77019',
    city: 'Houston',
    state: 'TX',
    lat: 29.7562,
    lon: -95.3949,
    timezone: 'America/Chicago',
    website: 'https://theriothtx.com',
    ticketingEngine: 'eventbrite',
    calendarFeedUrl: 'https://theriothtx.com',
    roomType: 'landmark_club',
    metro: 'Houston'
  },

  // --- Miami / South Florida ---
  {
    slug: 'miami-improv',
    name: 'Miami Improv',
    address: '3450 NW 83rd Ave, Doral, FL 33122',
    city: 'Doral',
    state: 'FL',
    lat: 25.8066,
    lon: -80.3323,
    timezone: 'America/New_York',
    website: 'https://miamiimprov.com',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://miamiimprov.com/calendar/',
    roomType: 'landmark_club',
    metro: 'Miami'
  },
  {
    slug: 'dania-beach-improv',
    name: 'Dania Beach Improv',
    address: '177 N Pointe Dr, Dania Beach, FL 33004',
    city: 'Dania Beach',
    state: 'FL',
    lat: 26.0526,
    lon: -80.1504,
    timezone: 'America/New_York',
    website: 'https://improvftl.com',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improvftl.com/calendar/',
    roomType: 'landmark_club',
    metro: 'Miami'
  },

  // --- Atlanta / Minneapolis Regional ---
  {
    slug: 'uptown-comedy-corner-atlanta',
    name: 'Uptown Comedy Corner',
    address: '1155 Virginia Ave, Hapeville, GA 30354',
    city: 'Hapeville',
    state: 'GA',
    lat: 33.6586,
    lon: -84.4172,
    timezone: 'America/New_York',
    website: 'https://uptowncomedy.net',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://uptowncomedy.net',
    roomType: 'landmark_club',
    metro: 'Atlanta'
  },
  {
    slug: 'house-of-comedy-minnesota',
    name: "Rick Bronson's House of Comedy",
    address: '408 E Broadway, Bloomington, MN 55425',
    city: 'Bloomington',
    state: 'MN',
    lat: 44.8549,
    lon: -93.2422,
    timezone: 'America/Chicago',
    website: 'https://moa.houseofcomedy.net',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://moa.houseofcomedy.net/events',
    roomType: 'landmark_club',
    metro: 'Minneapolis'
  },

  // --- Kansas City / Milwaukee / Salt Lake City ---
  {
    slug: 'comedy-club-of-kansas-city',
    name: 'The Comedy Club of Kansas City',
    address: '1130 W 103rd St, Kansas City, MO 64114',
    city: 'Kansas City',
    state: 'MO',
    lat: 38.9416,
    lon: -94.6044,
    timezone: 'America/Chicago',
    website: 'https://www.thecomedyclubkc.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.thecomedyclubkc.com/events',
    roomType: 'landmark_club',
    metro: 'Kansas City'
  },
  {
    slug: 'milwaukee-improv',
    name: 'Milwaukee Improv',
    address: '8600 S Commercial Dr, Brookfield, WI 53045',
    city: 'Brookfield',
    state: 'WI',
    lat: 43.0336,
    lon: -88.1639,
    timezone: 'America/Chicago',
    website: 'https://improv.com/milwaukee/',
    ticketingEngine: 'ticketweb',
    calendarFeedUrl: 'https://improv.com/milwaukee/calendar/',
    roomType: 'landmark_club',
    metro: 'Milwaukee'
  },
  {
    slug: 'wiseguys-comedy-club-downtown-slc',
    name: 'Wiseguys Comedy Club Downtown SLC',
    address: '194 S 400 W, Salt Lake City, UT 84101',
    city: 'Salt Lake City',
    state: 'UT',
    lat: 40.7651,
    lon: -111.9038,
    timezone: 'America/Denver',
    website: 'https://wiseguyscomedy.com',
    ticketingEngine: 'custom',
    calendarFeedUrl: 'https://wiseguyscomedy.com',
    roomType: 'landmark_club',
    metro: 'Salt Lake City'
  },

  // --- Kentucky / Pacific Northwest / Oklahoma (SeatEngine Candidates) ---
  {
    slug: 'louisville-comedy-club',
    name: 'Louisville Comedy Club',
    address: '110 W Main St, Louisville, KY 40202',
    city: 'Louisville',
    state: 'KY',
    lat: 38.2568,
    lon: -85.7538,
    timezone: 'America/Kentucky/Louisville',
    website: 'https://www.louisvillecomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.louisvillecomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Louisville'
  },
  {
    slug: 'bricktown-comedy-club-okc',
    name: 'Bricktown Comedy Club',
    address: '258 E Sheridan Ave, Oklahoma City, OK 73104',
    city: 'Oklahoma City',
    state: 'OK',
    lat: 35.4667,
    lon: -97.5097,
    timezone: 'America/Chicago',
    website: 'https://www.bricktowncomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.bricktowncomedy.com/events',
    roomType: 'landmark_club',
    metro: 'Oklahoma City'
  },
  {
    slug: 'tacoma-comedy-club',
    name: 'Tacoma Comedy Club',
    address: '933 Market St, Tacoma, WA 98402',
    city: 'Tacoma',
    state: 'WA',
    lat: 47.2541,
    lon: -122.4411,
    timezone: 'America/Los_Angeles',
    website: 'https://www.tacomacomedyclub.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.tacomacomedyclub.com/events',
    roomType: 'landmark_club',
    metro: 'Seattle'
  },
  {
    slug: 'spokane-comedy-club',
    name: 'Spokane Comedy Club',
    address: '315 W Sprague Ave, Spokane, WA 99201',
    city: 'Spokane',
    state: 'WA',
    lat: 47.6575,
    lon: -122.4208,
    timezone: 'America/Los_Angeles',
    website: 'https://www.spokanecomedyclub.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.spokanecomedyclub.com/events',
    roomType: 'landmark_club',
    metro: 'Spokane'
  },
  {
    slug: 'skyline-comedy-club-appleton',
    name: 'Skyline Comedy Club',
    address: '1004 S Olde Oneida St, Appleton, WI 54915',
    city: 'Appleton',
    state: 'WI',
    lat: 44.2619,
    lon: -88.4154,
    timezone: 'America/Chicago',
    website: 'https://www.skylinecomedy.com',
    ticketingEngine: 'seatengine',
    calendarFeedUrl: 'https://www.skylinecomedy.com/events',
    roomType: 'independent_club',
    metro: 'Appleton'
  },
  // --- Phoenix, AZ ---
  {
    slug: "rick-bronson-s-house-of-comedy-phoenix-az",
    name: "Rick Bronson's House of Comedy",
    address: "Phoenix, AZ",
    city: "Phoenix",
    state: "AZ",
    lat: 33.4484,
    lon: -112.074,
    timezone: "America/Phoenix",
    website: "https://houseofcomedy.net/az/",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://houseofcomedy.net/az/",
    roomType: "comedy_club",
    metro: "Phoenix"
  },
  // --- Little Rock, AR ---
  {
    slug: "the-loony-bin-comedy-club-little-rock-ar",
    name: "The Loony Bin Comedy Club",
    address: "Little Rock, AR",
    city: "Little Rock",
    state: "AR",
    lat: 34.7465,
    lon: -92.2896,
    timezone: "America/Chicago",
    website: "https://littlerock.loonybincomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://littlerock.loonybincomedy.com",
    roomType: "comedy_club",
    metro: "Little Rock"
  },
  // --- Hermosa Beach, CA ---
  {
    slug: "comedy-magic-club-hermosa-beach-ca",
    name: "Comedy & Magic Club",
    address: "Hermosa Beach, CA",
    city: "Hermosa Beach",
    state: "CA",
    lat: 33.8622,
    lon: -118.3995,
    timezone: "America/Los_Angeles",
    website: "https://comedyandmagicclub.com",
    ticketingEngine: "etix",
    calendarFeedUrl: "https://comedyandmagicclub.com",
    roomType: "comedy_club",
    metro: "Los Angeles"
  },
  // --- Sacramento, CA ---
  {
    slug: "sacramento-comedy-spot-sacramento-ca",
    name: "Sacramento Comedy Spot",
    address: "Sacramento, CA",
    city: "Sacramento",
    state: "CA",
    lat: 38.5816,
    lon: -121.4944,
    timezone: "America/Los_Angeles",
    website: "https://saccomedyspot.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://saccomedyspot.com",
    roomType: "comedy_club",
    metro: "Sacramento"
  },
  // --- Hartford, CT ---
  {
    slug: "hartford-funny-bone-hartford-ct",
    name: "Hartford Funny Bone",
    address: "Hartford, CT",
    city: "Hartford",
    state: "CT",
    lat: 41.7658,
    lon: -72.6734,
    timezone: "America/New_York",
    website: "https://hartford.funnybone.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://hartford.funnybone.com",
    roomType: "comedy_club",
    metro: "Hartford"
  },
  // --- New Haven, CT ---
  {
    slug: "the-joker-s-wild-new-haven-ct",
    name: "The Joker's Wild",
    address: "New Haven, CT",
    city: "New Haven",
    state: "CT",
    lat: 41.3083,
    lon: -72.9279,
    timezone: "America/New_York",
    website: "https://jokerswildclub.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://jokerswildclub.com",
    roomType: "comedy_club",
    metro: "New Haven"
  },
  // --- Washington, DC ---
  {
    slug: "the-comedy-loft-washington-dc",
    name: "The Comedy Loft",
    address: "Washington, DC",
    city: "Washington",
    state: "DC",
    lat: 38.9072,
    lon: -77.0369,
    timezone: "America/New_York",
    website: "https://www.dccomedyloft.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://www.dccomedyloft.com/events",
    roomType: "comedy_club",
    metro: "Washington"
  },
  // --- Orlando, FL ---
  {
    slug: "orlando-improv-orlando-fl",
    name: "Orlando Improv",
    address: "Orlando, FL",
    city: "Orlando",
    state: "FL",
    lat: 28.5383,
    lon: -81.3792,
    timezone: "America/New_York",
    website: "https://theimprovorlando.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://theimprovorlando.com",
    roomType: "comedy_club",
    metro: "Orlando"
  },
  // --- Tampa, FL ---
  {
    slug: "tampa-funny-bone-tampa-fl",
    name: "Tampa Funny Bone",
    address: "Tampa, FL",
    city: "Tampa",
    state: "FL",
    lat: 27.9506,
    lon: -82.4572,
    timezone: "America/New_York",
    website: "https://tampa.funnybone.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://tampa.funnybone.com",
    roomType: "comedy_club",
    metro: "Tampa"
  },
  // --- Tampa, FL ---
  {
    slug: "side-splitters-comedy-club-tampa-fl",
    name: "Side Splitters Comedy Club",
    address: "Tampa, FL",
    city: "Tampa",
    state: "FL",
    lat: 27.9506,
    lon: -82.4572,
    timezone: "America/New_York",
    website: "https://sidesplitterscomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://sidesplitterscomedy.com",
    roomType: "comedy_club",
    metro: "Tampa"
  },
  // --- Sarasota, FL ---
  {
    slug: "mccurdy-s-comedy-theatre-sarasota-fl",
    name: "McCurdy's Comedy Theatre",
    address: "Sarasota, FL",
    city: "Sarasota",
    state: "FL",
    lat: 27.3364,
    lon: -82.5307,
    timezone: "America/New_York",
    website: "https://www.mccurdyscomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://www.mccurdyscomedy.com/shows",
    roomType: "comedy_club",
    metro: "Sarasota"
  },
  // --- Norcross, GA ---
  {
    slug: "atlanta-comedy-theater-norcross-ga",
    name: "Atlanta Comedy Theater",
    address: "Norcross, GA",
    city: "Norcross",
    state: "GA",
    lat: 33.9412,
    lon: -84.2135,
    timezone: "America/New_York",
    website: "https://atlcomedytheater.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://atlcomedytheater.com",
    roomType: "comedy_club",
    metro: "Atlanta"
  },
  // --- Schaumburg, IL ---
  {
    slug: "chicago-improv-schaumburg-il",
    name: "Chicago Improv",
    address: "Schaumburg, IL",
    city: "Schaumburg",
    state: "IL",
    lat: 42.0334,
    lon: -88.0834,
    timezone: "America/Chicago",
    website: "https://improv.com/chicago/",
    ticketingEngine: "ticketweb",
    calendarFeedUrl: "https://improv.com/chicago/calendar",
    roomType: "comedy_club",
    metro: "Chicago"
  },
  // --- Bloomington, IN ---
  {
    slug: "the-comedy-attic-bloomington-in",
    name: "The Comedy Attic",
    address: "Bloomington, IN",
    city: "Bloomington",
    state: "IN",
    lat: 39.1653,
    lon: -86.5264,
    timezone: "America/Indiana/Indianapolis",
    website: "https://www.comedyattic.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://www.comedyattic.com/events",
    roomType: "comedy_club",
    metro: "Bloomington"
  },
  // --- West Des Moines, IA ---
  {
    slug: "des-moines-funny-bone-west-des-moines-ia",
    name: "Des Moines Funny Bone",
    address: "West Des Moines, IA",
    city: "West Des Moines",
    state: "IA",
    lat: 41.5772,
    lon: -93.7438,
    timezone: "America/Chicago",
    website: "https://desmoines.funnybone.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://desmoines.funnybone.com",
    roomType: "comedy_club",
    metro: "Des Moines"
  },
  // --- Lexington, KY ---
  {
    slug: "comedy-off-broadway-lexington-ky",
    name: "Comedy Off Broadway",
    address: "Lexington, KY",
    city: "Lexington",
    state: "KY",
    lat: 37.9904,
    lon: -84.5375,
    timezone: "America/New_York",
    website: "https://www.comedyoffbroadway.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://www.comedyoffbroadway.com/events",
    roomType: "comedy_club",
    metro: "Lexington"
  },
  // --- Louisville, KY ---
  {
    slug: "the-caravan-comedy-club-louisville-ky",
    name: "The Caravan Comedy Club",
    address: "Louisville, KY",
    city: "Louisville",
    state: "KY",
    lat: 38.2527,
    lon: -85.7585,
    timezone: "America/Kentucky/Louisville",
    website: "https://thecaravancomedyclub.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://thecaravancomedyclub.com",
    roomType: "comedy_club",
    metro: "Louisville"
  },
  // --- New Orleans, LA ---
  {
    slug: "the-comedy-house-new-orleans-la",
    name: "The Comedy House",
    address: "New Orleans, LA",
    city: "New Orleans",
    state: "LA",
    lat: 29.9511,
    lon: -90.0715,
    timezone: "America/Chicago",
    website: "https://thecomedyhousenola.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://thecomedyhousenola.com",
    roomType: "comedy_club",
    metro: "New Orleans"
  },
  // --- Baltimore, MD ---
  {
    slug: "baltimore-comedy-factory-baltimore-md",
    name: "Baltimore Comedy Factory",
    address: "Baltimore, MD",
    city: "Baltimore",
    state: "MD",
    lat: 39.2904,
    lon: -76.6122,
    timezone: "America/New_York",
    website: "https://baltimorecomedyfactory.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://baltimorecomedyfactory.com/events",
    roomType: "comedy_club",
    metro: "Baltimore"
  },
  // --- Royal Oak, MI ---
  {
    slug: "mark-ridley-s-comedy-castle-royal-oak-mi",
    name: "Mark Ridley's Comedy Castle",
    address: "Royal Oak, MI",
    city: "Royal Oak",
    state: "MI",
    lat: 42.4895,
    lon: -83.1446,
    timezone: "America/Detroit",
    website: "https://www.comedycastle.com",
    ticketingEngine: "etix",
    calendarFeedUrl: "https://www.comedycastle.com/events",
    roomType: "comedy_club",
    metro: "Detroit"
  },
  // --- Ann Arbor, MI ---
  {
    slug: "ann-arbor-comedy-showcase-ann-arbor-mi",
    name: "Ann Arbor Comedy Showcase",
    address: "Ann Arbor, MI",
    city: "Ann Arbor",
    state: "MI",
    lat: 42.2808,
    lon: -83.743,
    timezone: "America/Detroit",
    website: "https://www.aacomedy.com",
    ticketingEngine: "etix",
    calendarFeedUrl: "https://www.aacomedy.com",
    roomType: "comedy_club",
    metro: "Ann Arbor"
  },
  // --- Grand Rapids, MI ---
  {
    slug: "the-comedy-project-grand-rapids-mi",
    name: "The Comedy Project",
    address: "Grand Rapids, MI",
    city: "Grand Rapids",
    state: "MI",
    lat: 42.9634,
    lon: -85.6681,
    timezone: "America/Detroit",
    website: "https://thecomedyproject.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://thecomedyproject.com/shows",
    roomType: "comedy_club",
    metro: "Grand Rapids"
  },
  // --- St. Louis, MO ---
  {
    slug: "the-improv-shop-st-louis-mo",
    name: "The Improv Shop",
    address: "St. Louis, MO",
    city: "St. Louis",
    state: "MO",
    lat: 38.627,
    lon: -90.1994,
    timezone: "America/Chicago",
    website: "https://theimprovshop.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://theimprovshop.com",
    roomType: "comedy_club",
    metro: "St. Louis"
  },
  // --- Omaha, NE ---
  {
    slug: "omaha-funny-bone-omaha-ne",
    name: "Omaha Funny Bone",
    address: "Omaha, NE",
    city: "Omaha",
    state: "NE",
    lat: 41.2565,
    lon: -95.9345,
    timezone: "America/Chicago",
    website: "https://omaha.funnybone.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://omaha.funnybone.com",
    roomType: "comedy_club",
    metro: "Omaha"
  },
  // --- Las Vegas, NV ---
  {
    slug: "brad-garrett-s-comedy-club-las-vegas-nv",
    name: "Brad Garrett's Comedy Club",
    address: "Las Vegas, NV",
    city: "Las Vegas",
    state: "NV",
    lat: 36.1699,
    lon: -115.1398,
    timezone: "America/Los_Angeles",
    website: "https://bradgarrettcomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://bradgarrettcomedy.com",
    roomType: "comedy_club",
    metro: "Las Vegas"
  },
  // --- Las Vegas, NV ---
  {
    slug: "comedy-cellar-at-rio-las-vegas-nv",
    name: "Comedy Cellar at Rio",
    address: "Las Vegas, NV",
    city: "Las Vegas",
    state: "NV",
    lat: 36.1699,
    lon: -115.1398,
    timezone: "America/Los_Angeles",
    website: "https://www.comedycellar.com/las-vegas/",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://www.comedycellar.com/las-vegas/",
    roomType: "comedy_club",
    metro: "Las Vegas"
  },
  // --- Las Vegas, NV ---
  {
    slug: "the-comedy-store-at-pop-s-las-vegas-nv",
    name: "The Comedy Store at Pop's",
    address: "Las Vegas, NV",
    city: "Las Vegas",
    state: "NV",
    lat: 36.1699,
    lon: -115.1398,
    timezone: "America/Los_Angeles",
    website: "https://thecomedystore.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://thecomedystore.com",
    roomType: "comedy_club",
    metro: "Las Vegas"
  },
  // --- Princeton, NJ ---
  {
    slug: "catch-a-rising-star-princeton-nj",
    name: "Catch a Rising Star",
    address: "Princeton, NJ",
    city: "Princeton",
    state: "NJ",
    lat: 40.3573,
    lon: -74.6672,
    timezone: "America/New_York",
    website: "https://catcharisingstar.com",
    ticketingEngine: "ticketweb",
    calendarFeedUrl: "https://catcharisingstar.com",
    roomType: "comedy_club",
    metro: "Central Jersey"
  },
  // --- Levittown, NY ---
  {
    slug: "governor-s-comedy-club-levittown-ny",
    name: "Governor's Comedy Club",
    address: "Levittown, NY",
    city: "Levittown",
    state: "NY",
    lat: 40.7259,
    lon: -73.5143,
    timezone: "America/New_York",
    website: "https://govs.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://govs.com",
    roomType: "comedy_club",
    metro: "Long Island"
  },
  // --- Bellmore, NY ---
  {
    slug: "the-brokerage-bellmore-ny",
    name: "The Brokerage",
    address: "Bellmore, NY",
    city: "Bellmore",
    state: "NY",
    lat: 40.6687,
    lon: -73.5276,
    timezone: "America/New_York",
    website: "https://brokerage.govs.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://brokerage.govs.com/events",
    roomType: "comedy_club",
    metro: "Long Island"
  },
  // --- Greensboro, NC ---
  {
    slug: "charlie-goodnights-greensboro-nc",
    name: "Charlie Goodnights",
    address: "Greensboro, NC",
    city: "Greensboro",
    state: "NC",
    lat: 36.0726,
    lon: -79.792,
    timezone: "America/New_York",
    website: "https://www.goodnightscomedy.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://www.goodnightscomedy.com/events",
    roomType: "comedy_club",
    metro: "Greensboro"
  },
  // --- Cincinnati, OH ---
  {
    slug: "go-bananas-comedy-club-cincinnati-oh",
    name: "Go Bananas Comedy Club",
    address: "Cincinnati, OH",
    city: "Cincinnati",
    state: "OH",
    lat: 39.1031,
    lon: -84.512,
    timezone: "America/New_York",
    website: "https://gobananascomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://gobananascomedy.com",
    roomType: "comedy_club",
    metro: "Cincinnati"
  },
  // --- Oklahoma City, OK ---
  {
    slug: "the-loony-bin-oklahoma-city-ok",
    name: "The Loony Bin",
    address: "Oklahoma City, OK",
    city: "Oklahoma City",
    state: "OK",
    lat: 35.4676,
    lon: -97.5164,
    timezone: "America/Chicago",
    website: "https://okc.loonybincomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://okc.loonybincomedy.com",
    roomType: "comedy_club",
    metro: "Oklahoma City"
  },
  // --- Tulsa, OK ---
  {
    slug: "tulsa-comedy-club-tulsa-ok",
    name: "Tulsa Comedy Club",
    address: "Tulsa, OK",
    city: "Tulsa",
    state: "OK",
    lat: 36.154,
    lon: -95.9928,
    timezone: "America/Chicago",
    website: "https://tulsacomedyclub.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://tulsacomedyclub.com",
    roomType: "comedy_club",
    metro: "Tulsa"
  },
  // --- Portland, OR ---
  {
    slug: "harvey-s-comedy-club-portland-or",
    name: "Harvey's Comedy Club",
    address: "Portland, OR",
    city: "Portland",
    state: "OR",
    lat: 45.5152,
    lon: -122.6784,
    timezone: "America/Los_Angeles",
    website: "https://harveyscomedyclub.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://harveyscomedyclub.com",
    roomType: "comedy_club",
    metro: "Portland"
  },
  // --- East Providence, RI ---
  {
    slug: "comedy-connection-east-providence-ri",
    name: "Comedy Connection",
    address: "East Providence, RI",
    city: "East Providence",
    state: "RI",
    lat: 41.8137,
    lon: -71.3701,
    timezone: "America/New_York",
    website: "https://ricomedyconnection.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://ricomedyconnection.com/events",
    roomType: "comedy_club",
    metro: "Providence"
  },
  // --- Greenville, SC ---
  {
    slug: "the-comedy-zone-greenville-sc",
    name: "The Comedy Zone",
    address: "Greenville, SC",
    city: "Greenville",
    state: "SC",
    lat: 34.8526,
    lon: -82.394,
    timezone: "America/New_York",
    website: "https://greenvillecomedyzone.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://greenvillecomedyzone.com/events",
    roomType: "comedy_club",
    metro: "Greenville"
  },
  // --- Chattanooga, TN ---
  {
    slug: "the-comedy-catch-chattanooga-tn",
    name: "The Comedy Catch",
    address: "Chattanooga, TN",
    city: "Chattanooga",
    state: "TN",
    lat: 35.0456,
    lon: -85.3097,
    timezone: "America/New_York",
    website: "https://thecomedycatch.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://thecomedycatch.com/events",
    roomType: "comedy_club",
    metro: "Chattanooga"
  },
  // --- Austin, TX ---
  {
    slug: "the-velv-comedy-lounge-austin-tx",
    name: "The Velv Comedy Lounge",
    address: "Austin, TX",
    city: "Austin",
    state: "TX",
    lat: 30.2672,
    lon: -97.7431,
    timezone: "America/Chicago",
    website: "https://thevelveeta-room.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://thevelveeta-room.com",
    roomType: "comedy_club",
    metro: "Austin"
  },
  // --- Houston, TX ---
  {
    slug: "the-secret-group-houston-tx",
    name: "The Secret Group",
    address: "Houston, TX",
    city: "Houston",
    state: "TX",
    lat: 29.7604,
    lon: -95.3698,
    timezone: "America/Chicago",
    website: "https://thesecretgrouphtx.com",
    ticketingEngine: "eventbrite",
    calendarFeedUrl: "https://thesecretgrouphtx.com",
    roomType: "comedy_club",
    metro: "Houston"
  },
  // --- Fort Worth, TX ---
  {
    slug: "hyena-s-comedy-nightclub-fort-worth-tx",
    name: "Hyena's Comedy Nightclub",
    address: "Fort Worth, TX",
    city: "Fort Worth",
    state: "TX",
    lat: 32.7555,
    lon: -97.3308,
    timezone: "America/Chicago",
    website: "https://hyenascomedynightclub.com",
    ticketingEngine: "tixr",
    calendarFeedUrl: "https://hyenascomedynightclub.com",
    roomType: "comedy_club",
    metro: "Dallas-Fort Worth"
  },
  // --- San Antonio, TX ---
  {
    slug: "laugh-out-loud-comedy-club-san-antonio-tx",
    name: "Laugh Out Loud Comedy Club",
    address: "San Antonio, TX",
    city: "San Antonio",
    state: "TX",
    lat: 29.4241,
    lon: -98.4936,
    timezone: "America/Chicago",
    website: "https://lolsanantonio.com",
    ticketingEngine: "ticketweb",
    calendarFeedUrl: "https://lolsanantonio.com/calendar",
    roomType: "comedy_club",
    metro: "San Antonio"
  },
  // --- Richmond, VA ---
  {
    slug: "richmond-funny-bone-richmond-va",
    name: "Richmond Funny Bone",
    address: "Richmond, VA",
    city: "Richmond",
    state: "VA",
    lat: 37.5407,
    lon: -77.436,
    timezone: "America/New_York",
    website: "https://richmond.funnybone.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://richmond.funnybone.com",
    roomType: "comedy_club",
    metro: "Richmond"
  },
  // --- Virginia Beach, VA ---
  {
    slug: "virginia-beach-funny-bone-virginia-beach-va",
    name: "Virginia Beach Funny Bone",
    address: "Virginia Beach, VA",
    city: "Virginia Beach",
    state: "VA",
    lat: 36.8529,
    lon: -75.978,
    timezone: "America/New_York",
    website: "https://vb.funnybone.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://vb.funnybone.com",
    roomType: "comedy_club",
    metro: "Virginia Beach"
  },
  // --- Seattle, WA ---
  {
    slug: "seattle-comedy-underground-seattle-wa",
    name: "Seattle Comedy Underground",
    address: "Seattle, WA",
    city: "Seattle",
    state: "WA",
    lat: 47.6062,
    lon: -122.3321,
    timezone: "America/Los_Angeles",
    website: "https://comedyunderground.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://comedyunderground.com",
    roomType: "comedy_club",
    metro: "Seattle"
  },
  // --- Madison, WI ---
  {
    slug: "comedy-club-on-state-madison-wi",
    name: "Comedy Club on State",
    address: "Madison, WI",
    city: "Madison",
    state: "WI",
    lat: 43.0731,
    lon: -89.4012,
    timezone: "America/Chicago",
    website: "https://madisoncomedy.com",
    ticketingEngine: "etix",
    calendarFeedUrl: "https://madisoncomedy.com/events",
    roomType: "comedy_club",
    metro: "Madison"
  },
  // --- Milwaukee, WI ---
  {
    slug: "milwaukee-comedy-milwaukee-wi",
    name: "Milwaukee Comedy",
    address: "Milwaukee, WI",
    city: "Milwaukee",
    state: "WI",
    lat: 43.0389,
    lon: -87.9065,
    timezone: "America/Chicago",
    website: "https://milwaukeecomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://milwaukeecomedy.com",
    roomType: "comedy_club",
    metro: "Milwaukee"
  },
  // --- Burlington, VT ---
  {
    slug: "vermont-comedy-club-burlington-vt",
    name: "Vermont Comedy Club",
    address: "101 Main St, Burlington, VT 05401",
    city: "Burlington",
    state: "VT",
    lat: 44.4759,
    lon: -73.2121,
    timezone: "America/New_York",
    website: "https://www.vermontcomedyclub.com",
    ticketingEngine: "seatengine",
    calendarFeedUrl: "https://www.vermontcomedyclub.com",
    roomType: "comedy_club",
    metro: "Burlington"
  },
  // --- Boston, MA ---
  {
    slug: "improv-asylum-boston-ma",
    name: "Improv Asylum",
    address: "216 Hanover St, Boston, MA 02113",
    city: "Boston",
    state: "MA",
    lat: 42.3643,
    lon: -71.0543,
    timezone: "America/New_York",
    website: "https://www.improvasylum.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://www.improvasylum.com",
    roomType: "comedy_club",
    metro: "Boston"
  },
  // --- Chicago, IL ---
  {
    slug: "comedy-bar-chicago-il",
    name: "The Comedy Bar",
    address: "162 N Franklin St, Chicago, IL 60606",
    city: "Chicago",
    state: "IL",
    lat: 41.8925,
    lon: -87.6324,
    timezone: "America/Chicago",
    website: "https://comedybarchicago.com",
    ticketingEngine: "eventbrite",
    calendarFeedUrl: "https://comedybarchicago.com",
    roomType: "comedy_club",
    metro: "Chicago"
  },
  // --- Reno, NV ---
  {
    slug: "reno-tahoe-comedy-reno-nv",
    name: "Reno Tahoe Comedy",
    address: "Reno, NV",
    city: "Reno",
    state: "NV",
    lat: 39.5296,
    lon: -119.8138,
    timezone: "America/Los_Angeles",
    website: "https://renotahoecomedy.com",
    ticketingEngine: "custom",
    calendarFeedUrl: "https://renotahoecomedy.com/shows",
    roomType: "comedy_club",
    metro: "Reno"
  }
];

function getNationalComedyVenues() {
  return NATIONAL_COMEDY_VENUES.map(v => ({
    ...v,
    identityStatus: 'verified_venue_identity'
  }));
}

const BATCH1_SLUGS = [
  'cap-city-comedy-club-austin',
  'helium-comedy-club-philadelphia',
  'hilarities-4th-street-theatre-cleveland',
  'helium-comedy-club-portland',
  'helium-comedy-club-st-louis'
];

const BATCH1_SEATENGINE_VENUES = NATIONAL_COMEDY_VENUES.filter(v => BATCH1_SLUGS.includes(v.slug));

const BATCH2_SLUGS = [
  'helium-comedy-club-indianapolis',
  'magoobys-joke-house-timonium',
  'comedy-club-of-kansas-city',
  'stand-up-live-phoenix',
  'tempe-improv'
];

const BATCH2_SEATENGINE_VENUES = NATIONAL_COMEDY_VENUES.filter(v => BATCH2_SLUGS.includes(v.slug));

const BATCH3_SLUGS = [
  'new-york-comedy-club-midtown',
  'new-york-comedy-club-east-village',
  'bananas-comedy-club-nj'
];

const BATCH3_SEATENGINE_VENUES = NATIONAL_COMEDY_VENUES.filter(v => BATCH3_SLUGS.includes(v.slug));

const BATCH4_SLUGS = [
  'stress-factory-new-brunswick',
  'stress-factory-bridgeport',
  'helium-comedy-club-buffalo',
  'goodnights-comedy-club-raleigh',
  'laugh-boston'
];

const BATCH4_SEATENGINE_VENUES = NATIONAL_COMEDY_VENUES.filter(v => BATCH4_SLUGS.includes(v.slug));

const PROMOTED_SEATENGINE_SLUGS = [
  'acme-comedy-company-minneapolis',
  ...BATCH1_SLUGS,
  ...BATCH2_SLUGS,
  ...BATCH3_SLUGS,
  ...BATCH4_SLUGS
];

const PROMOTED_SEATENGINE_VENUES = NATIONAL_COMEDY_VENUES.filter(v => PROMOTED_SEATENGINE_SLUGS.includes(v.slug));

const PROMOTED_VENUE_SLUGS = [
  ...PROMOTED_SEATENGINE_SLUGS,
  'stardome-comedy-club-birmingham',
  'the-comedy-zone-charlotte',
  'the-punchline-comedy-club-atlanta',
  'laughing-skull-lounge'
];

function getPromotedComedyVenues() {
  return NATIONAL_COMEDY_VENUES.filter(v => PROMOTED_VENUE_SLUGS.includes(v.slug)).map(v => ({
    ...v,
    identityStatus: 'verified_venue_identity',
    isPromoted: true
  }));
}

function isVenuePromoted(slug) {
  return Boolean(slug && PROMOTED_VENUE_SLUGS.includes(slug));
}

function getUnpromotedCandidateVenues(options = {}) {
  const { platform = 'seatengine', excludeQuarantined = true } = options;
  const quarantined = new Set(['comedy-works-downtown', 'comedy-works-south']);
  return NATIONAL_COMEDY_VENUES.filter(v => {
    if (PROMOTED_VENUE_SLUGS.includes(v.slug)) return false;
    if (excludeQuarantined && quarantined.has(v.slug)) return false;
    if (platform && platform !== 'all' && v.ticketingEngine !== platform) return false;
    return true;
  }).map(v => ({
    ...v,
    identityStatus: 'verified_venue_identity'
  }));
}

function getComedyVenueBySlug(slug) {
  if (!slug) return null;
  const v = NATIONAL_COMEDY_VENUES.find(item => item.slug === slug);
  return v ? { ...v, identityStatus: 'verified_venue_identity' } : null;
}

function getNearbyComedyVenues(lat, lon, radiusMiles = 35) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return NATIONAL_COMEDY_VENUES
    .map(v => {
      const d = distMiles(lat, lon, v.lat, v.lon);
      return {
        ...v,
        identityStatus: 'verified_venue_identity',
        distanceMiles: d != null ? Number(d.toFixed(1)) : null
      };
    })
    .filter(v => v.distanceMiles != null && v.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

module.exports = {
  NATIONAL_COMEDY_VENUES,
  BATCH1_SLUGS,
  BATCH1_SEATENGINE_VENUES,
  BATCH2_SLUGS,
  BATCH2_SEATENGINE_VENUES,
  BATCH3_SLUGS,
  BATCH3_SEATENGINE_VENUES,
  BATCH4_SLUGS,
  BATCH4_SEATENGINE_VENUES,
  PROMOTED_SEATENGINE_SLUGS,
  PROMOTED_SEATENGINE_VENUES,
  PROMOTED_VENUE_SLUGS,
  getPromotedComedyVenues,
  isVenuePromoted,
  getUnpromotedCandidateVenues,
  getNationalComedyVenues,
  getComedyVenueBySlug,
  getNearbyComedyVenues,
  distMiles
};


