/**
 * Stand-Up Comedy Registry & In-Memory Store
 *
 * Manages verified comedy rooms, verified independent shows, and community
 * submissions. Feeds verified indie listings directly into Brinkberry's
 * hybrid feed engine.
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

const crypto = require('crypto');
const { createSubmission, transitionState, isPubliclyVisible } = require('./verification');
const { normalizeComedyMetadata } = require('./schema');

// In-memory store of submissions and verified indie shows
const submissionsStore = new Map();

// Known curated venues for deep entity pages
const KNOWN_VENUES = [
  {
    slug: 'comedy-works-downtown',
    name: 'Comedy Works Downtown',
    address: '1226 15th St, Denver, CO 80202',
    city: 'Denver',
    state: 'CO',
    lat: 39.7490,
    lon: -104.9989,
    tagline: 'Legendary underground comedy club in Larimer Square.',
    description: 'Renowned worldwide by stand-up comics as one of the best listening rooms in America. Low ceilings, tight seating, and an intimate stage.',
    website: 'https://www.comedyworks.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'comedy-works-south',
    name: 'Comedy Works South at the Landmark',
    address: '5345 Landmark Pl, Greenwood Village, CO 80111',
    city: 'Denver',
    state: 'CO',
    lat: 39.6178,
    lon: -104.8988,
    tagline: 'Premier comedy theater in the Denver Tech Center.',
    description: 'The spacious sister club to Downtown Comedy Works, hosting major national comedy headliners, stadium seating, and full dinner service.',
    website: 'https://www.comedyworks.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'denver-comedy-underground',
    name: 'Denver Comedy Underground',
    address: '1400 N Williams St, Denver, CO 80218',
    city: 'Denver',
    state: 'CO',
    lat: 39.7390,
    lon: -104.9650,
    tagline: 'Independent, intimate basement comedy showcase in Cap Hill.',
    description: 'A subterranean independent comedy haven featuring national touring headliners, free pizza, and top local Denver stand-up talent.',
    website: 'https://denvercomedyunderground.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'rise-comedy',
    name: 'Rise Comedy',
    address: '1260 22nd St, Denver, CO 80205',
    city: 'Denver',
    state: 'CO',
    lat: 39.7548,
    lon: -104.9890,
    tagline: 'Denver’s home for improv, sketch, and stand-up comedy in Ballpark.',
    description: 'An artist-driven comedy theater and training center hosting live comedy shows, improv troupes, open mics, and diverse local showcases 5 nights a week.',
    website: 'https://risecomedy.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'the-bug-theatre',
    name: 'The Bug Theatre',
    address: '3654 Navajo St, Denver, CO 80211',
    city: 'Denver',
    state: 'CO',
    lat: 39.7675,
    lon: -105.0040,
    tagline: 'Historic independent community theater and alternative comedy space in North Denver.',
    description: 'An iconic, volunteer-supported performing arts space hosting Denver’s longest-running alternative comedy showcases, sketch revues, and open stages.',
    website: 'https://bugtheatre.org',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'wide-right-denver',
    name: 'Wide Right',
    address: '2100 Curtis St, Denver, CO 80205',
    city: 'Denver',
    state: 'CO',
    lat: 39.7523,
    lon: -104.9902,
    tagline: 'Curtis Park sports bar, craft wings, and weekly comedy open mic.',
    description: 'A neighborhood staple featuring one of Denver’s most popular Tuesday open mics, local showcases, and live stand-up.',
    website: 'https://widerightdenver.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'lions-lair-denver',
    name: 'Lion’s Lair',
    address: '2022 E Colfax Ave, Denver, CO 80206',
    city: 'Denver',
    state: 'CO',
    lat: 39.7402,
    lon: -104.9632,
    tagline: 'Legendary Colfax dive bar and historic Monday night open mic hub.',
    description: 'Raw, authentic Denver counterculture hub on East Colfax hosting underground rock and legendary late-night open mic comedy.',
    website: 'https://thelionslair.com',
    officialBoxOfficeConfirmed: false
  },
  {
    slug: 'the-second-city',
    name: 'The Second City',
    address: '1616 N Wells St, Chicago, IL 60614',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9118,
    lon: -87.6353,
    tagline: 'The world’s premier comedy theater and school of improvisation.',
    description: 'Historic comedy venue that launched Bill Murray, Tina Fey, Steve Carell, and Keegan-Michael Key. World-class improv and sketch revues nightly.',
    website: 'https://www.secondcity.com'
  },
  {
    slug: 'zanies-chicago',
    name: 'Zanies Comedy Club',
    address: '1548 N Wells St, Chicago, IL 60614',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9105,
    lon: -87.6352,
    tagline: 'Chicago’s original home for stand-up comedy since 1978.',
    description: 'Classic Old Town brick-wall comedy club hosting America’s top touring comedians and hilarious Chicago showcases.',
    website: 'https://chicago.zanies.com'
  },
  {
    slug: 'the-plus-eau-claire',
    name: 'The Plus',
    address: '208 S Barstow St, Eau Claire, WI 54701',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.8118,
    lon: -91.4988,
    tagline: 'Independent pizza, craft beer, and Tuesday open mic comedy.',
    description: 'Home of the Chippewa Valley’s vibrant indie stand-up comedy scene, weekly open mics, and regional touring showcases.',
    website: 'https://theplus.ec'
  },
  {
    slug: 'paname-art-cafe-paris',
    name: 'Paname Art Café',
    address: '14 Rue de la Fontaine au Roi, 75011 Paris, France',
    city: 'Paris',
    state: 'France',
    lat: 48.8680,
    lon: 2.3700,
    tagline: 'Parisian stand-up comedy club and cafe in the 11th arrondissement.',
    description: 'The heartbeat of French and international stand-up in Paris with intimate showcases and bilingual comedy nights.',
    website: 'https://www.panameartcafe.com'
  },
  {
    slug: 'comedy-cellar',
    name: 'The Comedy Cellar',
    address: '117 MacDougal St, New York, NY 10012',
    city: 'New York',
    state: 'NY',
    lat: 40.7300,
    lon: -74.0006,
    tagline: 'Greenwich Village’s iconic comedy institution under the stained glass banner.',
    description: 'Arguably the most famous stand-up comedy club in the world. Legendary unannounced drop-ins, authentic NYC cellar intimacy, and top touring talent.',
    website: 'https://www.comedycellar.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'gotham-comedy-club',
    name: 'Gotham Comedy Club',
    address: '208 W 23rd St, New York, NY 10011',
    city: 'New York',
    state: 'NY',
    lat: 40.7441,
    lon: -73.9967,
    tagline: 'Upscale Manhattan comedy theater in Chelsea.',
    description: 'Premier New York City comedy showroom hosting top national headliners, television comedy tapings, and rising stand-up stars.',
    website: 'https://gothamcomedyclub.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'new-york-comedy-club',
    name: 'New York Comedy Club',
    address: '241 E 24th St, New York, NY 10010',
    city: 'New York',
    state: 'NY',
    lat: 40.7388,
    lon: -73.9806,
    tagline: 'Classic brick-wall stand-up comedy in Gramercy and the East Village.',
    description: 'A beloved NYC comedy cornerstone with classic brick backdrop, diverse lineups, and spontaneous drop-ins from top working comics.',
    website: 'https://newyorkcomedyclub.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'the-comedy-store',
    name: 'The Comedy Store',
    address: '8433 Sunset Blvd, West Hollywood, CA 90069',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0953,
    lon: -118.3744,
    tagline: 'The world’s most legendary stand-up comedy club on the Sunset Strip.',
    description: 'Mitzi Shore’s historic comedic temple. Three stages — Main Room, Original Room, and Belly Room — delivering thunderous comedy history and nightly all-star showcases.',
    website: 'https://thecomedystore.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'laugh-factory-hollywood',
    name: 'Laugh Factory',
    address: '8001 Sunset Blvd, Los Angeles, CA 90046',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0978,
    lon: -118.3637,
    tagline: 'Hollywood’s premier Sunset Boulevard comedy marquee.',
    description: 'Iconic comedy theater that has nurtured comedy royalty since 1979, hosting weekly all-star showcases and breakout stand-ups.',
    website: 'https://www.laughfactory.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'hollywood-improv',
    name: 'Hollywood Improv',
    address: '8162 Melrose Ave, Los Angeles, CA 90046',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.0838,
    lon: -118.3675,
    tagline: 'Melrose Avenue’s classic comedy showroom and podcast hub.',
    description: 'Historic comedy stage where superstars test material, featuring the Main Room and the intimate Lab for cutting-edge alternative sets.',
    website: 'https://improv.com/hollywood',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'comedy-mothership',
    name: 'Comedy Mothership',
    address: '320 E 6th St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    lat: 30.2676,
    lon: -97.7397,
    tagline: 'Austin’s high-profile comedy club founded by Joe Rogan on 6th Street.',
    description: 'State-of-the-art comedy club in the historic Ritz Theater featuring Mitzi’s Bar, Fatman, and national headliners nightly in downtown Austin.',
    website: 'https://comedymothership.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'cap-city-comedy-club',
    name: 'Cap City Comedy Club',
    address: '11506 Century Oaks Terrace, Austin, TX 78758',
    city: 'Austin',
    state: 'TX',
    lat: 30.4024,
    lon: -97.7246,
    tagline: 'Austin’s cornerstone comedy room since 1986, now at The Domain.',
    description: 'Home of the Funniest Person in Austin contest and world-class stand-up comedy in a pristine, modern showroom.',
    website: 'https://www.capcitycomedy.com',
    officialBoxOfficeConfirmed: true
  },
  {
    slug: 'zanies-nashville',
    name: 'Zanies Comedy Club Nashville',
    address: '2025 8th Ave S, Nashville, TN 37204',
    city: 'Nashville',
    state: 'TN',
    lat: 36.1332,
    lon: -86.7792,
    tagline: 'Music City’s premier stand-up comedy destination since 1983.',
    description: 'Intimate listening room where comedy superstars love to perform, renowned for electric crowds and legendary surprise guests.',
    website: 'https://nashville.zanies.com',
    officialBoxOfficeConfirmed: true
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
    tagline: 'Premier Manhattan comedy club and restaurant in Union Square.',
    description: 'Two floors of world-class stand-up comedy and elevated dining featuring NYC comedy icons, national headliners, and unannounced celebrity guests.',
    website: 'https://thestandnyc.com',
    scheduleUrl: 'https://thestandnyc.com/shows',
    parser: 'html_cards',
    fetchCadenceMinutes: 60,
    sourceStatus: 'active',
    officialBoxOfficeConfirmed: true
  }
];

// Helper to generate dynamic seed shows clamped around the current time
function getDynamicSeedShows() {
  const now = Date.now();
  const shows = [
    {
      id: 'comedy_seed_denver_01',
      title: 'Denver Comedy Underground Showcase',
      venue_name: 'Denver Comedy Underground',
      venue_address: '1400 N Williams St',
      city: 'Denver, CO',
      lat: 39.7390,
      lon: -104.9650,
      offsetHours: 3,
      durationHours: 1.5,
      comedians: ['Sam Tallent', 'Derrick Stroup', 'Christie Buchele', 'Ericka Dickinson'],
      showType: 'showcase',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Every Friday & Saturday at 8:00 PM',
      price_status: 'paid',
      price_min: 15,
      price_max: 20,
      price_display: '$15–$20',
      description: 'Underground indie stand-up comedy showcase featuring free pizza and touring national headliners.',
      canonical_url: 'https://denvercomedyunderground.com/events',
      official_source_url: 'https://denvercomedyunderground.com/events',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca',
      venueSlug: 'denver-comedy-underground'
    },
    {
      id: 'comedy_seed_denver_02',
      title: 'Downtown Tuesday Open Mic',
      venue_name: 'Comedy Works Downtown',
      venue_address: '1226 15th St',
      city: 'Denver, CO',
      lat: 39.7490,
      lon: -104.9989,
      offsetHours: 8,
      durationHours: 2,
      comedians: ['Local Comics', 'Featured Host'],
      showType: 'open_mic',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Every Tuesday at 8:00 PM',
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      price_display: 'Free ($5 item min)',
      description: 'Denver’s longest running comedy open mic where pros test new bits and newcomers step up to the legendary mic in Larimer Square.',
      canonical_url: 'https://www.comedyworks.com/open-mic',
      official_source_url: 'https://www.comedyworks.com/open-mic',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'comedy-works-downtown'
    },
    {
      id: 'comedy_pilot_denver_03',
      title: 'Adam Cayton-Holland Live at Comedy Works Downtown',
      venue_name: 'Comedy Works Downtown',
      venue_address: '1226 15th St',
      city: 'Denver, CO',
      lat: 39.7490,
      lon: -104.9989,
      offsetHours: 5,
      durationHours: 1.75,
      comedians: ['Adam Cayton-Holland', 'Denver Features'],
      showType: 'headliner',
      ageLimit: '21+',
      recurring: false,
      recurrenceText: 'Special Presentation',
      price_status: 'paid',
      price_min: 25,
      price_max: 30,
      price_display: '$25',
      description: 'Denver native and international touring headliner Adam Cayton-Holland performs live in Larimer Square.',
      canonical_url: 'https://www.comedyworks.com/comedians/adam-cayton-holland',
      official_source_url: 'https://www.comedyworks.com/comedians/adam-cayton-holland',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
      venueSlug: 'comedy-works-downtown'
    },
    {
      id: 'comedy_pilot_denver_04',
      title: 'Landmark Comedy Showcase at Comedy Works South',
      venue_name: 'Comedy Works South at the Landmark',
      venue_address: '5345 Landmark Pl',
      city: 'Denver, CO',
      lat: 39.6178,
      lon: -104.8988,
      offsetHours: 6,
      durationHours: 1.75,
      comedians: ['Chris Voth', 'Janae Burris'],
      showType: 'showcase',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Thursday–Saturday',
      price_status: 'paid',
      price_min: 22,
      price_max: 28,
      price_display: '$22–$28',
      description: 'Full evening of top-tier stand-up comedy in the DTC with stadium seating, premier acoustics, and craft food/cocktails.',
      canonical_url: 'https://www.comedyworks.com/shows',
      official_source_url: 'https://www.comedyworks.com/shows',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'comedy-works-south'
    },
    {
      id: 'comedy_pilot_denver_05',
      title: 'Rise Comedy Mainstage Improv & Stand-Up Fusion',
      venue_name: 'Rise Comedy',
      venue_address: '1260 22nd St',
      city: 'Denver, CO',
      lat: 39.7548,
      lon: -104.9890,
      offsetHours: 4,
      durationHours: 1.5,
      comedians: ['Rise Ensemble', 'Local Guest Stand-Ups'],
      showType: 'improv',
      ageLimit: '18+',
      recurring: true,
      recurrenceText: 'Every Friday at 7:30 PM',
      price_status: 'paid',
      price_min: 14,
      price_max: 18,
      price_display: '$14–$18',
      description: 'High-energy unscripted comedy featuring Ballpark’s finest improvisers paired with featured local stand-ups.',
      canonical_url: 'https://risecomedy.com/calendar',
      official_source_url: 'https://risecomedy.com/calendar',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf',
      venueSlug: 'rise-comedy'
    },
    {
      id: 'comedy_pilot_denver_06',
      title: 'The Grapes of Rad Alternative Comedy Showcase',
      venue_name: 'The Bug Theatre',
      venue_address: '3654 Navajo St',
      city: 'Denver, CO',
      lat: 39.7675,
      lon: -105.0040,
      offsetHours: 7,
      durationHours: 2,
      comedians: ['Ben Roy', 'Denver Indie Stand-Ups'],
      showType: 'showcase',
      ageLimit: 'all_ages',
      recurring: true,
      recurrenceText: 'Monthly on Second Saturdays',
      price_status: 'paid',
      price_min: 12,
      price_max: 15,
      price_display: '$12',
      description: 'Denver’s premier underground alternative comedy night at the historic Bug Theatre in Sunnyside.',
      canonical_url: 'https://bugtheatre.org/events',
      official_source_url: 'https://bugtheatre.org/events',
      sourceType: 'producer_submission',
      canonical_image_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca',
      venueSlug: 'the-bug-theatre'
    },
    {
      id: 'comedy_pilot_denver_07',
      title: 'Wide Right Tuesday Night Open Mic',
      venue_name: 'Wide Right',
      venue_address: '2100 Curtis St',
      city: 'Denver, CO',
      lat: 39.7523,
      lon: -104.9902,
      offsetHours: 9,
      durationHours: 2.5,
      comedians: ['Local Comics', 'Curtis Park Stand-Ups'],
      showType: 'open_mic',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Every Tuesday at 9:00 PM',
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      price_display: 'Free',
      description: 'Curtis Park’s staple Tuesday open mic with craft wings, local beers, and 30+ comics hitting the stage.',
      canonical_url: 'https://widerightdenver.com/events',
      official_source_url: 'https://widerightdenver.com/events',
      sourceType: 'open_mic_host',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'wide-right-denver'
    },
    {
      id: 'comedy_pilot_denver_08',
      title: 'Lion’s Lair Colfax Comedy Open Mic',
      venue_name: 'Lion’s Lair',
      venue_address: '2022 E Colfax Ave',
      city: 'Denver, CO',
      lat: 39.7402,
      lon: -104.9632,
      offsetHours: 10,
      durationHours: 2,
      comedians: ['Colfax Stand-Ups', 'Newcomers'],
      showType: 'open_mic',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Every Monday at 10:00 PM',
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      price_display: 'Free',
      description: 'Late night raw comedy open mic at Denver’s legendary Colfax dive bar.',
      canonical_url: 'https://thelionslair.com',
      official_source_url: 'https://thelionslair.com',
      sourceType: 'open_mic_host',
      canonical_image_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
      venueSlug: 'lions-lair-denver'
    },
    {
      id: 'comedy_seed_chicago_01',
      title: 'The Second City Mainstage Revue',
      venue_name: 'The Second City',
      venue_address: '1616 N Wells St',
      city: 'Chicago, IL',
      lat: 41.9118,
      lon: -87.6353,
      offsetHours: 5,
      durationHours: 2,
      comedians: ['Second City Touring Company'],
      showType: 'improv',
      ageLimit: 'all_ages',
      recurring: true,
      recurrenceText: 'Nightly',
      price_status: 'paid',
      price_min: 39,
      price_max: 65,
      price_display: 'From $39',
      description: 'World-famous improv and sketch comedy revue from Chicago’s legendary ensemble.',
      canonical_url: 'https://www.secondcity.com',
      official_source_url: 'https://www.secondcity.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf',
      venueSlug: 'the-second-city'
    },
    {
      id: 'comedy_seed_eauclaire_01',
      title: 'Clear Water Comedy Open Mic & Showcase',
      venue_name: 'The Plus',
      venue_address: '208 S Barstow St',
      city: 'Eau Claire, WI',
      lat: 44.8118,
      lon: -91.4988,
      offsetHours: 6,
      durationHours: 2,
      comedians: ['Cullen Ryan', 'Chippewa Valley Stand-Ups'],
      showType: 'open_mic',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Every Thursday at 7:30 PM',
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      price_display: 'Free',
      description: 'The Chippewa Valley’s premier local comedy showcase and open mic.',
      canonical_url: 'https://theplusec.com',
      official_source_url: 'https://theplusec.com',
      sourceType: 'open_mic_host',
      canonical_image_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
      venueSlug: 'the-plus-eau-claire'
    },
    {
      id: 'comedy_seed_paris_01',
      title: 'Paname Comedy Club French & English Stand-Up',
      venue_name: 'Paname Art Café',
      venue_address: '14 Rue de la Fontaine au Roi',
      city: 'Paris',
      lat: 48.8680,
      lon: 2.3700,
      offsetHours: 4,
      durationHours: 1.5,
      comedians: ['Paul Taylor', 'Sebastian Marx'],
      showType: 'standup',
      ageLimit: '18+',
      recurring: true,
      recurrenceText: 'Every evening',
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      price_display: 'Free (hat at the door)',
      description: 'Intimate Paris stand-up session in the 11th arrondissement featuring 5 comedians doing fast-paced 10-minute sets.',
      canonical_url: 'https://www.panameartcafe.com',
      official_source_url: 'https://www.panameartcafe.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'paname-art-cafe-paris'
    },
    {
      id: 'comedy_seed_nyc_01',
      title: 'The Comedy Cellar Village Showcase',
      venue_name: 'The Comedy Cellar',
      venue_address: '117 MacDougal St',
      city: 'New York, NY',
      lat: 40.7300,
      lon: -74.0006,
      offsetHours: 3,
      durationHours: 1.75,
      comedians: ['NYC All-Stars', 'Surprise Drop-Ins'],
      showType: 'showcase',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Nightly in Greenwich Village',
      price_status: 'paid',
      price_min: 20,
      price_max: 25,
      price_display: '$20–$25',
      description: 'The world-famous Comedy Cellar showcase featuring NYC’s finest working comics and unannounced celebrity guests under the banner.',
      canonical_url: 'https://www.comedycellar.com',
      official_source_url: 'https://www.comedycellar.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'comedy-cellar'
    },
    {
      id: 'comedy_seed_nyc_02',
      title: 'Gotham All-Stars Stand-Up',
      venue_name: 'Gotham Comedy Club',
      venue_address: '208 W 23rd St',
      city: 'New York, NY',
      lat: 40.7441,
      lon: -73.9967,
      offsetHours: 6,
      durationHours: 1.75,
      comedians: ['Gotham Touring Headliners'],
      showType: 'headliner',
      ageLimit: '18+',
      recurring: true,
      recurrenceText: 'Nightly in Chelsea',
      price_status: 'paid',
      price_min: 25,
      price_max: 35,
      price_display: '$25–$35',
      description: 'Manhattan’s premier comedy showroom hosting elite national stand-up headliners in Chelsea.',
      canonical_url: 'https://gothamcomedyclub.com',
      official_source_url: 'https://gothamcomedyclub.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca',
      venueSlug: 'gotham-comedy-club'
    },
    {
      id: 'comedy_seed_la_01',
      title: 'Best of The Comedy Store Main Room',
      venue_name: 'The Comedy Store',
      venue_address: '8433 Sunset Blvd',
      city: 'Los Angeles, CA',
      lat: 34.0953,
      lon: -118.3744,
      offsetHours: 4,
      durationHours: 2,
      comedians: ['Paid Regulars', 'Special Guests'],
      showType: 'showcase',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Every night on Sunset',
      price_status: 'paid',
      price_min: 25,
      price_max: 35,
      price_display: '$25–$35',
      description: 'Mitzi Shore’s legendary Main Room showcasing top paid regulars and surprise drop-ins on the Sunset Strip.',
      canonical_url: 'https://thecomedystore.com',
      official_source_url: 'https://thecomedystore.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf',
      venueSlug: 'the-comedy-store'
    },
    {
      id: 'comedy_seed_la_02',
      title: 'All-Star Comedy Night at Laugh Factory',
      venue_name: 'Laugh Factory',
      venue_address: '8001 Sunset Blvd',
      city: 'Los Angeles, CA',
      lat: 34.0978,
      lon: -118.3637,
      offsetHours: 7,
      durationHours: 1.75,
      comedians: ['Laugh Factory Headliners'],
      showType: 'headliner',
      ageLimit: '18+',
      recurring: true,
      recurrenceText: 'Nightly on Sunset Blvd',
      price_status: 'paid',
      price_min: 20,
      price_max: 30,
      price_display: '$20–$30',
      description: 'Sunset Boulevard’s historic comedy theater featuring the best working stand-up comedians in Southern California.',
      canonical_url: 'https://www.laughfactory.com',
      official_source_url: 'https://www.laughfactory.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'laugh-factory-hollywood'
    },
    {
      id: 'comedy_seed_chi_02',
      title: 'Zanies Stand-Up Comedy Showcase',
      venue_name: 'Zanies Comedy Club',
      venue_address: '1548 N Wells St',
      city: 'Chicago, IL',
      lat: 41.9105,
      lon: -87.6352,
      offsetHours: 5,
      durationHours: 1.5,
      comedians: ['Chicago Headliners', 'Touring Pros'],
      showType: 'standup',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Nightly in Old Town',
      price_status: 'paid',
      price_min: 30,
      price_max: 35,
      price_display: '$30',
      description: 'Old Town’s classic brick-wall stand-up comedy club featuring premier national headliners since 1978.',
      canonical_url: 'https://chicago.zanies.com',
      official_source_url: 'https://chicago.zanies.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca',
      venueSlug: 'zanies-chicago'
    },
    {
      id: 'comedy_seed_atx_01',
      title: 'Comedy Mothership Stand-Up Showcase',
      venue_name: 'Comedy Mothership',
      venue_address: '320 E 6th St',
      city: 'Austin, TX',
      lat: 30.2676,
      lon: -97.7397,
      offsetHours: 4,
      durationHours: 2,
      comedians: ['Mothership Regulars', 'Surprise Guests'],
      showType: 'showcase',
      ageLimit: '21+',
      recurring: true,
      recurrenceText: 'Nightly on 6th Street',
      price_status: 'paid',
      price_min: 35,
      price_max: 50,
      price_display: '$35–$50',
      description: 'Austin’s epicenter of stand-up comedy at the historic Ritz Theater featuring national headliners and unannounced sets.',
      canonical_url: 'https://comedymothership.com',
      official_source_url: 'https://comedymothership.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf',
      venueSlug: 'comedy-mothership'
    },
    {
      id: 'comedy_seed_bna_01',
      title: 'Zanies Nashville Live Stand-Up',
      venue_name: 'Zanies Comedy Club Nashville',
      venue_address: '2025 8th Ave S',
      city: 'Nashville, TN',
      lat: 36.1332,
      lon: -86.7792,
      offsetHours: 5,
      durationHours: 1.75,
      comedians: ['Nashville Headliners', 'Touring Pros'],
      showType: 'headliner',
      ageLimit: '18+',
      recurring: true,
      recurrenceText: 'Nightly on 8th Ave South',
      price_status: 'paid',
      price_min: 25,
      price_max: 35,
      price_display: '$25–$35',
      description: 'Music City’s legendary comedy room hosting America’s top stand-up comedians in an intimate listening room.',
      canonical_url: 'https://nashville.zanies.com',
      official_source_url: 'https://nashville.zanies.com',
      sourceType: 'official_box_office',
      canonical_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
      venueSlug: 'zanies-nashville'
    }
  ];

  return shows.map(s => {
    return {
      id: s.id,
      title: s.title,
      start_time: null,
      end_time: null,
      venue_name: s.venue_name,
      venue_address: s.venue_address,
      city: s.city,
      venue_latitude: s.lat,
      venue_longitude: s.lon,
      category_tags: ['comedy'],
      vibe_labels: ['comedy', s.showType],
      price_status: s.price_status,
      price_min: s.price_min,
      price_max: s.price_max,
      price_display: s.price_display,
      description: s.description,
      canonical_url: s.canonical_url,
      ticket_url: s.canonical_url,
      official_source_url: s.official_source_url || s.canonical_url,
      sourceType: 'venue_presence',
      lastVerifiedAt: s.lastVerifiedAt || '2026-09-18T12:00:00.000Z',
      confirmationStatus: 'venue_presence_only',
      isDisplayable: false,
      isConfirmed: false,
      isCancelled: Boolean(s.isCancelled),
      isStale: false,
      canonical_image_url: s.canonical_image_url,
      source: 'venue_presence',
      indoor_outdoor: 'indoor',
      venueSlug: s.venueSlug,
      comedy: normalizeComedyMetadata({
        title: s.title,
        comedians: s.comedians,
        showType: s.showType,
        ageLimit: s.ageLimit,
        recurring: s.recurring,
        recurrenceText: s.recurrenceText,
        sourceType: 'venue_presence'
      }),
      verification: {
        status: 'venue_presence_only',
        venueToken: 'seed_verified_venue',
        sourceType: 'venue_presence',
        officialSourceUrl: s.official_source_url || s.canonical_url,
        lastVerifiedAt: s.lastVerifiedAt || '2026-09-18T12:00:00.000Z',
        confirmationStatus: 'venue_presence_only',
        isCancelled: Boolean(s.isCancelled),
        isStale: false,
        submittedAt: '2026-09-15T12:00:00.000Z',
        reviewedAt: null,
        reviewedBy: 'editorial_board'
      }
    };
  });
}

const { trackSubmission } = require('../telemetry');

/**
 * Checks for existing duplicate submissions or seed shows at the same venue and time window
 */
function findDuplicateSubmission(payload) {
  const venue = payload?.venue_name || payload?.venue;
  const start = payload?.start_time || payload?.start;
  if (!venue || !start) return null;
  const newVenue = String(venue).trim().toLowerCase();
  const newTime = new Date(start).getTime();
  if (isNaN(newTime)) return null;

  const all = [
    ...getDynamicSeedShows(),
    ...Array.from(submissionsStore.values())
  ];

  for (const s of all) {
    if (s.verification?.status === 'cancelled') continue;
    const existingVenue = String(s.venue_name || '').trim().toLowerCase();
    if (existingVenue === newVenue || existingVenue.includes(newVenue) || newVenue.includes(existingVenue)) {
      const existingTime = new Date(s.start_time).getTime();
      // Overlap within 2 hours
      if (Math.abs(existingTime - newTime) <= 2 * 3600 * 1000) {
        return s;
      }
    }
  }
  return null;
}

/**
 * Submits a new comedy show with duplicate protection
 */
function addSubmission(payload, options = {}) {
  if (!options.allowDuplicate) {
    const dup = findDuplicateSubmission(payload);
    if (dup) {
      trackSubmission('duplicates', dup.id, 'duplicate_rejected');
      throw new Error(`Duplicate detected: A show at "${dup.venue_name}" is already listed around this time ("${dup.title}"). Use an edit key or contact review.`);
    }
  }

  const record = createSubmission(payload);
  submissionsStore.set(record.id, record);
  trackSubmission('completed', record.id, record.verification.status);
  return record;
}

/**
 * Updates an existing comedy show via submitter edit key or moderator
 */
function updateSubmission(id, editKey, updates = {}) {
  const record = submissionsStore.get(id);
  if (!record) throw new Error(`Submission not found: ${id}`);

  // Transition state with editKey verification
  transitionState(record, 'updated_by_venue', { editKey });

  if (updates.title) record.title = updates.title.trim();
  if (updates.description) record.description = updates.description.trim();
  if (updates.start_time) record.start_time = new Date(updates.start_time).toISOString();
  if (updates.end_time) record.end_time = new Date(updates.end_time).toISOString();
  if (updates.price) {
    record.price_display = updates.price;
    record.price_status = updates.price === 'Free' || updates.price === '0' ? 'free' : 'paid';
  }
  if (updates.comedians || updates.showType || updates.ageLimit) {
    record.comedy = normalizeComedyMetadata({
      ...record.comedy,
      ...updates
    });
  }

  trackSubmission('edited', record.id, record.verification.status);
  return record;
}

function getSubmissionById(id) {
  return submissionsStore.get(id) || null;
}

function getAllSubmissions() {
  return Array.from(submissionsStore.values());
}

function getPendingSubmissions() {
  return Array.from(submissionsStore.values()).filter(s => s.verification.status === 'submitted' || s.verification.status === 'pending_review');
}

function verifySubmission(id, auth = {}) {
  const record = submissionsStore.get(id);
  if (!record) throw new Error(`Submission not found: ${id}`);
  return transitionState(record, 'verified', auth);
}

function rejectOrCancelSubmission(id, auth = {}) {
  const record = submissionsStore.get(id);
  if (!record) throw new Error(`Submission not found: ${id}`);
  return transitionState(record, 'cancelled', auth);
}

/**
 * Returns verified comedy shows within the specified geographic radius and time window
 */
function getNearbyVerifiedComedyShows(lat, lon, radiusMiles = 25, windowStart, windowEnd) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const startMs = windowStart ? new Date(windowStart).getTime() : Date.now();
  const endMs = windowEnd ? new Date(windowEnd).getTime() : Date.now() + 48 * 3600e3;

  // Gather verified items from dynamic seeds and submissions store
  const allVerified = [
    ...getDynamicSeedShows(),
    ...Array.from(submissionsStore.values()).filter(s => isPubliclyVisible(s.verification?.status))
  ];

  const matched = [];
  for (const show of allVerified) {
    if (!show.start_time) continue;
    if (show.confirmationStatus === 'venue_presence_only' || show.confirmationStatus === 'unconfirmed_seed') continue;
    const showLat = show.venue_latitude;
    const showLon = show.venue_longitude;
    if (!Number.isFinite(showLat) || !Number.isFinite(showLon)) continue;

    const dist = distMiles(lat, lon, showLat, showLon);
    if (dist == null || dist > radiusMiles) continue;

    const t = new Date(show.start_time).getTime();
    if (isNaN(t) || t < startMs || t > endMs) continue;

    matched.push({
      ...show,
      distance_miles: Math.round(dist * 10) / 10
    });
  }

  return matched;
}

const { checkDurableRateLimit, resetDurableRateLimit } = require('./rate-limiter');

function hashClientIp(ip) {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || 'brinkberry_ip_privacy_salt_2026';
  return crypto.createHash('sha256').update(String(ip).trim() + salt).digest('hex').substring(0, 16);
}

function checkRateLimit(ipHash) {
  if (!ipHash) return true;
  return checkDurableRateLimit(ipHash);
}

// Fan demand signals store for comedians: comicSlug -> Map(city -> { count, signals: [] })
const demandSignalsStore = new Map();

function recordDemandSignal({ comicSlug, comicName, city, email, postalCode, ip, consent = false, isTest = false, isAuthorized = false }) {
  if (!comicSlug || !city) throw new Error('comicSlug and city are required');
  const cleanSlug = String(comicSlug).toLowerCase().trim();
  const cleanCity = String(city).trim();

  // 1. IP Privacy: Hash immediately with salt, enforce durable rate limit, never store raw IP
  const ipHash = hashClientIp(ip);
  checkRateLimit(ipHash);

  // 2. Email Consent Guardrail: Only retain email if explicit user consent is given
  const hasConsent = Boolean(consent === true || consent === 'true' || consent === 1);
  const cleanEmail = (email && hasConsent) ? String(email).toLowerCase().trim() : null;

  // 3. Test Isolation: Flag synthetic verification data so it never leaks into production totals
  // ONLY authorized test callers (or explicit synthetic test fixtures) can set isTestSignal = true
  const isTestSignal = Boolean(
    (isAuthorized && isTest) ||
    (email && String(email).endsWith('@example.com')) ||
    cleanCity.startsWith('TEST_') ||
    cleanSlug.startsWith('test-')
  );

  if (!demandSignalsStore.has(cleanSlug)) {
    demandSignalsStore.set(cleanSlug, new Map());
  }
  const cityMap = demandSignalsStore.get(cleanSlug);
  const cityKey = cleanCity.toLowerCase();

  if (!cityMap.has(cityKey)) {
    cityMap.set(cityKey, {
      city: cleanCity,
      count: 0,
      signals: []
    });
  }

  const record = cityMap.get(cityKey);

  // Deduplicate within 30 days based on cleanEmail or ipHash
  const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
  const isDuplicate = record.signals.some(s => {
    const isRecent = new Date(s.createdAt).getTime() > thirtyDaysAgo;
    if (!isRecent) return false;
    if (cleanEmail && s.email && s.email === cleanEmail) return true;
    if (ipHash && s.ipHash && s.ipHash === ipHash) return true;
    return false;
  });

  if (!isDuplicate) {
    if (!isTestSignal) {
      record.count += 1;
    }
    record.signals.push({
      comicSlug: cleanSlug,
      comicName: comicName || cleanSlug,
      city: cleanCity,
      email: cleanEmail, // Only stored if explicit consent was granted
      postalCode: postalCode ? String(postalCode).trim() : null,
      ipHash: ipHash || null, // NEVER raw IP
      consentGiven: hasConsent,
      isTest: isTestSignal,
      createdAt: new Date().toISOString()
    });
  }

  const summary = getDemandSummaryForComic(cleanSlug);
  return {
    success: true,
    isDuplicate,
    city: cleanCity,
    cityCount: summary.topCities.find(c => c.city.toLowerCase() === cityKey)?.count || (isTestSignal ? 0 : record.count),
    totalComicDemand: summary.totalDemand,
    emailRetained: Boolean(cleanEmail),
    isTest: isTestSignal
  };
}

function getDemandSummaryForComic(comicSlug) {
  const cleanSlug = String(comicSlug || '').toLowerCase().trim();
  const cityMap = demandSignalsStore.get(cleanSlug);
  if (!cityMap) {
    return { comicSlug: cleanSlug, totalDemand: 0, topCities: [] };
  }

  const topCities = Array.from(cityMap.values())
    .map(c => {
      // Production filter: Exclude test signals
      const count = c.signals.filter(s => !s.isTest).length;
      return { city: c.city, count };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const totalDemand = topCities.reduce((acc, c) => acc + c.count, 0);

  return {
    comicSlug: cleanSlug,
    totalDemand,
    topCities
  };
}

function purgeTestDemandSignals(comicSlug) {
  if (comicSlug) {
    const cleanSlug = String(comicSlug).toLowerCase().trim();
    const cityMap = demandSignalsStore.get(cleanSlug);
    if (cityMap) {
      for (const [k, r] of cityMap.entries()) {
        r.signals = r.signals.filter(s => !s.isTest);
        r.count = r.signals.length;
        if (r.count === 0) cityMap.delete(k);
      }
    }
  } else {
    for (const cityMap of demandSignalsStore.values()) {
      for (const [k, r] of cityMap.entries()) {
        r.signals = r.signals.filter(s => !s.isTest);
        r.count = r.signals.length;
        if (r.count === 0) cityMap.delete(k);
      }
    }
  }
}

// Venue Claim store: claimId -> claimRecord
const venueClaimsStore = new Map();
const claimedVenuesStore = new Map(); // venueSlug -> { claimId, verifiedAt, status: 'verified', workEmail, isVenueVerified, isBoxOfficeConfirmed }

function createVenueClaim(payload = {}) {
  const { venueSlug, requesterName, role, workEmail, verificationMethod, website, instagram, notes, isTest, isAuthorized } = payload;
  if (!venueSlug || !requesterName || !workEmail) {
    throw new Error('venueSlug, requesterName, and workEmail are required to submit a venue claim');
  }

  const venue = KNOWN_VENUES.find(v => v.slug === String(venueSlug).toLowerCase().trim());
  if (!venue) {
    throw new Error(`Venue not found: ${venueSlug}`);
  }

  // Domain verification check: workEmail should match venue website domain
  let domainMatched = false;
  if (venue.website) {
    try {
      const vHost = new URL(venue.website).hostname.replace(/^www\./, '').toLowerCase();
      const emailDomain = String(workEmail).split('@')[1]?.toLowerCase();
      if (emailDomain && (emailDomain === vHost || emailDomain.endsWith('.' + vHost))) {
        domainMatched = true;
      }
    } catch (_) {}
  }

  // Guardrail: Generic free webmail cannot auto-verify via domain
  const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
  const emailDomain = String(workEmail).split('@')[1]?.toLowerCase();
  const isFreeWebmail = freeEmailDomains.includes(emailDomain);

  const claimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const siteVerificationToken = `vtok_${Math.random().toString(36).substring(2, 14)}`;
  const emailVerificationToken = `emtok_${Math.random().toString(36).substring(2, 14)}`;

  const claimRecord = {
    id: claimId,
    venueSlug: venue.slug,
    venueName: venue.name,
    requesterName: requesterName.trim(),
    role: role ? role.trim() : 'Manager',
    workEmail: workEmail.trim().toLowerCase(),
    verificationMethod: verificationMethod || (domainMatched && !isFreeWebmail ? 'domain_email' : 'manual_review'),
    websiteToken: siteVerificationToken,
    emailVerificationToken: (domainMatched && !isFreeWebmail) ? emailVerificationToken : null,
    domainMatched,
    isFreeWebmail,
    instagram: instagram ? instagram.trim() : null,
    notes: notes ? notes.trim() : null,
    // Guardrail: Domain emails trigger a verification email link, NOT instant verification!
    status: (domainMatched && !isFreeWebmail) ? 'pending_email_verification' : 'pending_verification',
    isTest: Boolean((isAuthorized && isTest) || String(workEmail).endsWith('@example.com') || String(venueSlug).startsWith('test-')),
    createdAt: new Date().toISOString()
  };

  venueClaimsStore.set(claimId, claimRecord);
  return claimRecord;
}

function verifyEmailClaim(claimId, token) {
  const claim = venueClaimsStore.get(claimId);
  if (!claim) throw new Error(`Claim not found: ${claimId}`);
  if (!claim.emailVerificationToken || claim.emailVerificationToken !== token) {
    throw new Error('Invalid or expired email verification token');
  }

  claim.status = 'verified';
  claim.verifiedAt = new Date().toISOString();

  const venue = KNOWN_VENUES.find(v => v.slug === claim.venueSlug);
  const isBoxOfficeConfirmed = Boolean(venue?.officialBoxOfficeConfirmed);

  claimedVenuesStore.set(claim.venueSlug, {
    claimId: claim.id,
    verifiedAt: claim.verifiedAt,
    status: 'verified',
    workEmail: claim.workEmail,
    verificationMethod: 'domain_email',
    isVenueVerified: true,
    isBoxOfficeConfirmed
  });

  return claim;
}

function verifyVenueClaim(claimId, token) {
  const claim = venueClaimsStore.get(claimId);
  if (!claim) throw new Error(`Claim not found: ${claimId}`);
  if (claim.websiteToken !== token) {
    throw new Error('Invalid verification token');
  }

  claim.status = 'verified';
  claim.verifiedAt = new Date().toISOString();

  const venue = KNOWN_VENUES.find(v => v.slug === claim.venueSlug);
  const isBoxOfficeConfirmed = Boolean(venue?.officialBoxOfficeConfirmed);

  claimedVenuesStore.set(claim.venueSlug, {
    claimId: claim.id,
    verifiedAt: claim.verifiedAt,
    status: 'verified',
    workEmail: claim.workEmail,
    verificationMethod: claim.verificationMethod,
    isVenueVerified: true,
    isBoxOfficeConfirmed
  });

  return claim;
}

function purgeTestVenueClaim(venueSlug) {
  if (!venueSlug) return;
  const cleanSlug = String(venueSlug).toLowerCase().trim();
  claimedVenuesStore.delete(cleanSlug);
  for (const [id, claim] of venueClaimsStore.entries()) {
    if (claim.venueSlug === cleanSlug) {
      venueClaimsStore.delete(id);
    }
  }
}

function getVenueClaimStatus(venueSlug) {
  // DEPRECATED: Venue claims are deprecated in favor of autonomous public schedule indexing.
  const cleanSlug = String(venueSlug || '').toLowerCase().trim();
  const claimed = claimedVenuesStore.get(cleanSlug);
  if (claimed && claimed.status === 'verified') {
    const isVenueVerified = true;
    const isBoxOfficeConfirmed = Boolean(claimed.isBoxOfficeConfirmed);
    return {
      isClaimed: true,
      isVerified: true,
      isVenueVerified,
      isBoxOfficeConfirmed,
      status: 'verified',
      deprecated: true,
      claimSystemActive: false,
      deprecationNotice: 'Venue claim system is deprecated. Public discovery index operates independently.',
      // Guardrail wording: "Verified Venue" unless box office link is specifically confirmed
      badge: isBoxOfficeConfirmed ? '✓ Verified Venue · Official Box Office Confirmed' : '✓ Verified Venue'
    };
  }
  return {
    isClaimed: false,
    isVerified: false,
    isVenueVerified: false,
    isBoxOfficeConfirmed: false,
    status: 'unclaimed',
    deprecated: true,
    claimSystemActive: false,
    badge: null
  };
}

function getVenueBySlug(slug) {
  const cleanSlug = String(slug || '').toLowerCase().trim();
  const venue = KNOWN_VENUES.find(v => v.slug === cleanSlug);
  if (!venue) return null;

  const upcomingShows = getDynamicSeedShows().filter(s => s.venueSlug === cleanSlug);
  return {
    ...venue,
    claim: getVenueClaimStatus(cleanSlug),
    upcomingShows
  };
}

function getComedianBySlug(slug) {
  const cleanSlug = String(slug || '').toLowerCase().trim();
  const allShows = getDynamicSeedShows();

  const matchedShows = allShows.filter(s => {
    return (s.comedy?.comedians || []).some(c => {
      const cSlug = c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return cSlug === cleanSlug;
    });
  });

  if (matchedShows.length === 0) return null;

  const comicName = matchedShows[0].comedy.comedians.find(c => {
    const cSlug = c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return cSlug === cleanSlug;
  }) || cleanSlug;

  const demandSummary = getDemandSummaryForComic(cleanSlug);

  return {
    slug: cleanSlug,
    name: comicName,
    tagline: `Touring & local stand-up comedian.`,
    demand: demandSummary,
    upcomingShows: matchedShows
  };
}

function getComedyShowById(id) {
  if (!id) return null;
  const sub = submissionsStore.get(id);
  if (sub) return sub;
  const seed = getDynamicSeedShows().find(s => s.id === id);
  return seed || null;
}

function getAllVerifiedVenues() {
  return KNOWN_VENUES;
}

function getVenuesByCity(city) {
  if (!city) return [];
  const clean = String(city).toLowerCase().trim();
  return KNOWN_VENUES.filter(v => (v.city && v.city.toLowerCase() === clean) || (v.state && v.state.toLowerCase() === clean));
}

module.exports = {
  addSubmission,
  updateSubmission,
  findDuplicateSubmission,
  getSubmissionById,
  getComedyShowById,
  getAllSubmissions,
  getPendingSubmissions,
  verifySubmission,
  rejectOrCancelSubmission,
  getNearbyVerifiedComedyShows,
  getVenueBySlug,
  getVenuesByCity,
  getComedianBySlug,
  getAllVerifiedVenues,
  getDynamicSeedShows,
  recordDemandSignal,
  getDemandSummaryForComic,
  createVenueClaim,
  verifyVenueClaim,
  verifyEmailClaim,
  getVenueClaimStatus,
  purgeTestDemandSignals,
  purgeTestVenueClaim,
  KNOWN_VENUES
};
