/**
 * Race Track & Motorsports Registry Engine
 *
 * Provides in-memory registry, living seed race schedules, track verification,
 * touring series discovery, and fan demand signaling for race tracks.
 */

const crypto = require('crypto');
const { checkDurableRateLimit } = require('../comedy/rate-limiter');
const { normalizeTrackMetadata, normalizeRaceEvent, formatSurfaceName } = require('./schema');

const KNOWN_TRACKS = [
  {
    slug: 'colorado-national-speedway',
    name: 'Colorado National Speedway',
    address: '4281 Weld County Rd 10, Dacono, CO 80514',
    city: 'Denver',
    state: 'CO',
    lat: 40.0768,
    lon: -104.9818,
    trackType: 'asphalt_oval',
    length: '3/8-mile',
    banking: 'Progressive 8-12 degree banking',
    tagline: 'Colorado’s premier NASCAR short track since 1965.',
    description: 'High-banked 3/8-mile paved oval hosting NASCAR Advance Auto Parts Weekly racing, Super Late Models, Pro Trucks, and thrilling Figure-8 shootouts.',
    website: 'https://coloradospeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['NASCAR Advance Auto Parts Weekly Series', 'INEX'],
    coolersAllowed: true,
    campingAllowed: false
  },
  {
    slug: 'i-76-speedway',
    name: 'I-76 Speedway',
    address: '16359 County Rd S, Fort Morgan, CO 80701',
    city: 'Fort Morgan',
    state: 'CO',
    lat: 40.2520,
    lon: -103.7980,
    trackType: 'dirt_oval',
    length: '1/4-mile',
    banking: 'Semi-banked clay oval',
    tagline: 'High Plains high-speed dirt oval racing along the South Platte.',
    description: 'Premier Eastern Colorado quarter-mile dirt clay oval featuring IMCA Modifieds, 305 Sprint Cars, Stock Cars, and Hobby Stocks under the lights.',
    website: 'https://i-76speedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['IMCA Racing', 'Blood, Sweat & Tears Sprint Cars'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'pueblo-motorsports-park',
    name: 'Pueblo Motorsports Park',
    address: '3733 N Pueblo Blvd, Pueblo, CO 81008',
    city: 'Pueblo',
    state: 'CO',
    lat: 38.3308,
    lon: -104.6648,
    trackType: 'drag_strip',
    length: '1/4-mile NHRA Drag Strip & 2.2-mile Road Course',
    banking: 'Flat drag surface with technical asphalt road course',
    tagline: 'Colorado’s quarter-mile NHRA drag strip and multi-configuration road course.',
    description: 'Historic southern Colorado racing complex offering NHRA Lucas Oil bracket racing, Friday night street draggers, and technical road course track days.',
    website: 'https://pueblomotorsportspark.org',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['NHRA Member Track', 'SCCA Continental Divide Region'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'pikes-peak-international-raceway',
    name: 'Pikes Peak International Raceway',
    address: '16612 Midway Ranch Rd, Fountain, CO 80817',
    city: 'Colorado Springs',
    state: 'CO',
    lat: 38.5910,
    lon: -104.6738,
    trackType: 'road_course',
    length: '1-mile D-Oval & 1.3-mile Infield Road Course',
    banking: '10-degree oval banking with flat technical infield',
    tagline: 'Front Range motorsports venue beneath Pikes Peak.',
    description: 'Former IndyCar and NASCAR Busch Series speedway now hosting grassroots drift events, Time Attack, track days, and automotive festivals.',
    website: 'https://ppir.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['Drift Colorado', 'SCCA Time Trials'],
    coolersAllowed: false,
    campingAllowed: true
  },
  {
    slug: 'el-paso-county-raceway',
    name: 'El Paso County Raceway',
    address: '366 10th St, Calhan, CO 80808',
    city: 'Calhan',
    state: 'CO',
    lat: 39.0336,
    lon: -104.2982,
    trackType: 'dirt_oval',
    length: '1/4-mile',
    banking: 'High-banked dirt oval',
    tagline: 'High-altitude Saturday night dirt track racing at the county fairgrounds.',
    description: 'High-banked quarter-mile dirt oval at 6,500 feet elevation hosting thunderous Sprint Cars, Dwarf Cars, Modifieds, and mini stocks.',
    website: 'https://elpasocountyraceway.com',
    officialBoxOfficeConfirmed: false,
    sanctioningBodies: ['High Plains Racing Series'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'eldora-speedway',
    name: 'Eldora Speedway',
    address: '13929 OH-118, New Weston, OH 45348',
    city: 'New Weston',
    state: 'OH',
    lat: 40.3204,
    lon: -84.6364,
    trackType: 'dirt_oval',
    length: '1/2-mile',
    banking: 'High-banked 24-degree clay oval',
    tagline: 'The World’s Greatest Dirt Track.',
    description: 'Legendary half-mile clay cathedral founded by Earl Baltes and owned by Tony Stewart. Home of the Kings Royal, World 100, and premier sprint car battles.',
    website: 'https://eldoraspeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['World of Outlaws', 'USAC', 'High Limit Racing'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'lucas-oil-irp',
    name: 'Lucas Oil Indianapolis Raceway Park',
    address: '10267 US-136, Brownsburg, IN 46112',
    city: 'Indianapolis',
    state: 'IN',
    lat: 39.8138,
    lon: -86.3402,
    trackType: 'asphalt_oval',
    length: '0.686-mile Oval & 1/4-mile NHRA Drag Strip',
    banking: 'Progressive 12-degree oval banking',
    tagline: 'The historic home of the NHRA U.S. Nationals and classic short track oval shootouts.',
    description: 'World-renowned drag strip and paved oval complex hosting the biggest drag race in the world plus NASCAR Craftsman Trucks and USAC carb night classics.',
    website: 'https://raceirp.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['NHRA', 'USAC', 'NASCAR'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'red-cedar-speedway',
    name: 'Red Cedar Speedway',
    address: 'Dunn County Recreation Park, 620 17th St SE, Menomonie, WI 54751',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.8690,
    lon: -91.9160,
    trackType: 'dirt_oval',
    length: '3/8-mile',
    banking: 'Semi-banked red clay oval',
    tagline: 'Western Wisconsin’s premier WISSOTA Friday night clay racing.',
    description: 'High-speed 3/8-mile dirt clay speedway located at the Dunn County fairgrounds outside Eau Claire, hosting WISSOTA Late Models, Modifieds, Super Stocks, and Street Stocks.',
    website: 'https://redcedarspeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['WISSOTA Auto Racing'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'rock-falls-raceway',
    name: 'Rock Falls Raceway',
    address: 'N1790 Highway 85, Rock Falls, WI 54764',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.6853,
    lon: -91.6888,
    trackType: 'drag_strip',
    length: '1/4-mile NHRA Drag Strip',
    banking: 'Flat straightaway',
    tagline: 'Wisconsin’s fastest quarter-mile drag strip along the Chippewa River.',
    description: 'NHRA sanctioned drag racing facility hosting weekend bracket points races, High School Drags, Friday night test & tunes, and muscle car shootouts in the Eau Claire region.',
    website: 'https://rockfallsraceway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['NHRA'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'bowman-gray-stadium',
    name: 'Bowman Gray Stadium',
    address: '1250 S Martin Luther King Jr Dr, Winston-Salem, NC 27107',
    city: 'Winston-Salem',
    state: 'NC',
    lat: 36.0772,
    lon: -80.2330,
    trackType: 'asphalt_oval',
    length: '1/4-mile',
    banking: 'Flat asphalt oval inside football stadium',
    tagline: 'The Madhouse — NASCAR’s longest-running weekly track since 1949.',
    description: 'The legendary birthplace of grassroots stock car passion. Tight, thunderous, full-contact Modified battles inside a 17,000-seat stadium.',
    website: 'https://bowmangrayracing.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['NASCAR Advance Auto Parts Weekly Series'],
    coolersAllowed: true,
    campingAllowed: false
  },
  {
    slug: 'millbridge-speedway',
    name: 'Millbridge Speedway',
    address: '6670 Mooresville Rd, Salisbury, NC 28147',
    city: 'Salisbury',
    state: 'NC',
    lat: 35.6022,
    lon: -80.6015,
    trackType: 'dirt_oval',
    length: '1/6-mile',
    banking: 'High-banked red clay oval',
    tagline: 'The premier grassroots dirt battleground where NASCAR stars race mid-week.',
    description: 'High-banked North Carolina clay bullring hosting Outlaw Karts, Micro Sprints, and weekly showdowns between top Cup Series stars and rising dirt prodigies.',
    website: 'https://millbridgespeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['Millbridge Series'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'knoxville-raceway',
    name: 'Knoxville Raceway',
    address: '1000 N Lincoln St, Knoxville, IA 50138',
    city: 'Knoxville',
    state: 'IA',
    lat: 41.3197,
    lon: -93.0998,
    trackType: 'dirt_oval',
    length: '1/2-mile',
    banking: 'Progressive semi-banked dirt oval',
    tagline: 'The Sprint Car Capital of the World.',
    description: 'The global mecca of dirt winged sprint car racing at the Marion County Fairgrounds. Home of the Knoxville Nationals and weekly 410 sprint battles.',
    website: 'https://knoxvilleraceway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['World of Outlaws', 'Knoxville Championship Series'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'williams-grove-speedway',
    name: 'Williams Grove Speedway',
    address: '1 Speedway Dr, Mechanicsburg, PA 17055',
    city: 'Mechanicsburg',
    state: 'PA',
    lat: 40.1558,
    lon: -77.0375,
    trackType: 'dirt_oval',
    length: '1/2-mile',
    banking: 'Semi-banked clay oval',
    tagline: 'Home of the Pennsylvania Posse since 1939.',
    description: 'Historic half-mile clay oval in central Pennsylvania hosting the legendary National Open and weekly Friday night 410 Sprint Car wars.',
    website: 'https://williamsgrove.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['World of Outlaws', 'PA Posse'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'oswego-speedway',
    name: 'Oswego Speedway',
    address: '300 E Albany St, Oswego, NY 13126',
    city: 'Oswego',
    state: 'NY',
    lat: 43.4612,
    lon: -76.4883,
    trackType: 'asphalt_oval',
    length: '5/8-mile',
    banking: 'Progressive paved oval',
    tagline: 'The Steel Palace — Home of the Supermodifieds.',
    description: 'Historic upstate New York speed cathedral on Lake Ontario, home of 800-horsepower big-block pavement Supermodifieds and the International Classic.',
    website: 'https://oswegospeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['ISMA / MSS', 'NASCAR Whelen Modified Tour'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'irwindale-speedway',
    name: 'Irwindale Speedway',
    address: '500 Speedway Dr, Irwindale, CA 91706',
    city: 'Los Angeles',
    state: 'CA',
    lat: 34.1130,
    lon: -117.9890,
    trackType: 'asphalt_oval',
    length: '1/2-mile and 1/3-mile paved ovals & 1/8-mile Drag Strip',
    banking: 'Banked progressive asphalt oval',
    tagline: 'The House of Drift and premier Southern California short track.',
    description: 'Historic San Gabriel Valley motorsports showplace hosting NASCAR Advance Auto Parts weekly late models, Night of Destruction, and Formula DRIFT.',
    website: 'https://irwindalespeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['NASCAR', 'Formula DRIFT', 'NHRA'],
    coolersAllowed: false,
    campingAllowed: false
  },
  {
    slug: 'perris-auto-speedway',
    name: 'Perris Auto Speedway',
    address: '18700 Lake Perris Dr, Perris, CA 92571',
    city: 'Perris',
    state: 'CA',
    lat: 33.7844,
    lon: -117.2086,
    trackType: 'dirt_oval',
    length: '1/2-mile',
    banking: 'Semi-banked clay oval',
    tagline: 'Southern California’s premier Saturday night dirt oval.',
    description: 'State-of-the-art clay half-mile oval at the Lake Perris Fairgrounds hosting USAC/CRA Sprint Cars, PASSCAR Stock Cars, and thrilling demolition derbies.',
    website: 'https://perrisautospeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['USAC CRA Sprint Cars', 'PASSCAR'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'sycamore-speedway',
    name: 'Sycamore Speedway',
    address: '50W086 Old State Rd, Maple Park, IL 60151',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9286,
    lon: -88.5447,
    trackType: 'dirt_oval',
    length: '1/3-mile',
    banking: 'Semi-banked clay oval',
    tagline: 'Chicagoland’s Saturday night dirt oval and demolition derby battleground.',
    description: 'Family-owned clay short track 50 miles west of Chicago hosting Super Late Models, Street Stocks, spectator races, and thunderous derbies since 1963.',
    website: 'https://sycamorespeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['Sycamore Racing Series'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'five-flags-speedway',
    name: 'Five Flags Speedway',
    address: '7451 Pine Forest Rd, Pensacola, FL 32526',
    city: 'Pensacola',
    state: 'FL',
    lat: 30.5283,
    lon: -87.3188,
    trackType: 'asphalt_oval',
    length: '1/2-mile',
    banking: 'High-banked asphalt oval',
    tagline: 'Home of the Snowball Derby — Short track racing’s biggest prize.',
    description: 'High-banked half-mile asphalt cathedral where short track legends are crowned every December at the Snowball Derby, alongside summer Blizzard Series battles.',
    website: 'https://5flagsspeedway.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['Southern Super Series', 'NASCAR'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'volusia-speedway-park',
    name: 'Volusia Speedway Park',
    address: '1500 E State Rd 40, De Leon Springs, FL 32130',
    city: 'Barberville',
    state: 'FL',
    lat: 29.1764,
    lon: -81.4258,
    trackType: 'dirt_oval',
    length: '1/2-mile',
    banking: 'High-banked clay oval',
    tagline: 'The World’s Fastest Half-Mile Dirt Track.',
    description: 'High-speed gumbo clay half-mile oval near Daytona Beach hosting the prestigious DIRTcar Nationals every February and weekly Florida dirt shootouts.',
    website: 'https://volusiaspeedwaypark.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['World of Outlaws', 'Super DIRTcar Series'],
    coolersAllowed: true,
    campingAllowed: true
  },
  {
    slug: 'kennedale-speedway-park',
    name: 'Kennedale Speedway Park',
    address: '6727 Hill Cir, Kennedale, TX 76060',
    city: 'Kennedale',
    state: 'TX',
    lat: 32.6186,
    lon: -97.2023,
    trackType: 'dirt_oval',
    length: '1/4-mile',
    banking: 'Semi-banked red clay oval',
    tagline: 'North Texas home of Saturday night grassroots dirt tracking.',
    description: 'Premier Dallas-Fort Worth grassroots dirt facility hosting weekly IMCA Modifieds, Stock Cars, Factory Stocks, and SportMods.',
    website: 'https://kennedalespeedwaypark.com',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['IMCA'],
    coolersAllowed: true,
    campingAllowed: false
  },
  {
    slug: 'volusia-speedway-park',
    name: 'Volusia Speedway Park',
    address: '1500 E State Rd 40, De Leon Springs, FL 32130',
    city: 'Barberville',
    state: 'FL',
    lat: 29.1868,
    lon: -81.5218,
    trackType: 'dirt_oval',
    length: '1/2-mile',
    banking: 'High-banked D-shaped clay oval',
    tagline: 'The World’s Fastest Half-Mile Dirt Track in Central Florida.',
    description: 'Premier Florida half-mile dirt oval hosting the DIRTcar Nationals, World of Outlaws, Super Late Models, and weekly grassroots racing.',
    website: 'https://volusiaspeedwaypark.com',
    scheduleUrl: 'https://volusiaspeedwaypark.com/schedule/',
    parser: 'html_schedule',
    fetchCadenceMinutes: 120,
    sourceStatus: 'active',
    officialBoxOfficeConfirmed: true,
    sanctioningBodies: ['DIRTcar', 'World of Outlaws'],
    coolersAllowed: true,
    campingAllowed: true
  }
];

const TOURING_SERIES = [
  {
    slug: 'world-of-outlaws',
    name: 'World of Outlaws NOS Energy Drink Sprint Cars',
    disciplines: ['Sprint Cars', 'Dirt Oval'],
    sanction: 'World Racing Group',
    website: 'https://worldofoutlaws.com',
    description: 'The premier national touring series for 900+ horsepower winged 410 sprint cars on dirt.'
  },
  {
    slug: 'high-limit-racing',
    name: 'High Limit Racing',
    disciplines: ['Sprint Cars', 'Dirt Oval'],
    sanction: 'Kubota High Limit',
    website: 'https://highlimitracing.com',
    description: 'National touring mid-week and weekend sprint car championship owned by Kyle Larson and Brad Sweet.'
  },
  {
    slug: 'cars-tour',
    name: 'zMAX CARS Tour',
    disciplines: ['Late Models', 'Paved Short Track'],
    sanction: 'CARS Tour',
    website: 'https://carsracingtour.com',
    description: 'The definitive asphalt Late Model Stock Car and Pro Late Model touring championship in the United States.'
  },
  {
    slug: 'usac-sprint-cars',
    name: 'USAC AMSOIL National Sprint Cars',
    disciplines: ['Non-Wing Sprint Cars', 'Dirt & Paved'],
    sanction: 'USAC',
    website: 'https://usacracing.com',
    description: 'Traditional non-wing sprint car racing across American dirt and asphalt short tracks.'
  },
  {
    slug: 'formula-drift',
    name: 'Formula DRIFT',
    disciplines: ['Drifting', 'Road Course & Oval'],
    sanction: 'Formula Drift Holdings',
    website: 'https://formulad.com',
    description: 'The premier international professional drifting competition in North America.'
  }
];

// Helper to calculate planning window bounds
function calculatePlanningWindowBounds(windowName = '48h', baseDate = new Date()) {
  const now = baseDate.getTime();
  const d = new Date(baseDate);
  const norm = String(windowName || '48h').toLowerCase().replace(/-/g, '_').trim();

  let startMs = now;
  let endMs = now + 48 * 3600e3;

  if (norm === 'this_weekend') {
    const currentDay = d.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    let diffToFri;
    if (currentDay === 0) {
      diffToFri = -2; // Friday was 2 days ago (Sunday is part of this weekend)
    } else {
      diffToFri = 5 - currentDay;
    }
    const fri = new Date(d);
    fri.setDate(d.getDate() + diffToFri);
    fri.setHours(12, 0, 0, 0);

    const sun = new Date(fri);
    sun.setDate(fri.getDate() + 2);
    sun.setHours(23, 59, 59, 999);

    startMs = fri.getTime();
    endMs = sun.getTime();
  } else if (norm === 'next_weekend') {
    const currentDay = d.getDay();
    let diffToFri;
    if (currentDay === 0) {
      diffToFri = 5;
    } else {
      diffToFri = (5 - currentDay) + 7;
    }
    const fri = new Date(d);
    fri.setDate(d.getDate() + diffToFri);
    fri.setHours(12, 0, 0, 0);

    const sun = new Date(fri);
    sun.setDate(fri.getDate() + 2);
    sun.setHours(23, 59, 59, 999);

    startMs = fri.getTime();
    endMs = sun.getTime();
  } else if (norm === '30d') {
    startMs = now;
    endMs = now + 30 * 86400e3;
  } else if (norm === 'season') {
    startMs = now;
    endMs = now + 180 * 86400e3;
  } else {
    // 48h
    startMs = now;
    endMs = now + 48 * 3600e3;
  }

  return { norm, startMs, endMs, startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

// Master Living Schedule Definition across planning windows
const MASTER_SCHEDULE_DEFINITIONS = [
  // --- Colorado National Speedway (Dacono, CO) ---
  {
    id: 'race_seed_cns_01',
    title: 'Saturday Night Thunder: Super Late Models & Pro Trucks',
    trackSlug: 'colorado-national-speedway',
    trackName: 'Colorado National Speedway',
    trackType: 'asphalt_oval',
    city: 'Denver, CO',
    lat: 40.0768,
    lon: -104.9818,
    offsetHours: 5,
    durationHours: 4,
    classes: ['Super Late Models', 'Pro Trucks', 'Legends', 'Bandoleros'],
    sanction: 'NASCAR Advance Auto Parts Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:15 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free with paid adult',
    description: 'Full program of NASCAR weekly short-track racing under the lights in Dacono featuring high-banked 75-lap Super Late Models and Figure-8s.',
    official_source_url: 'https://coloradospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://coloradospeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_cns_02',
    title: 'Friday Night Practice & Pure Stock Shootout',
    trackSlug: 'colorado-national-speedway',
    trackName: 'Colorado National Speedway',
    trackType: 'asphalt_oval',
    city: 'Denver, CO',
    lat: 40.0768,
    lon: -104.9818,
    offsetHours: 24,
    durationHours: 3.5,
    classes: ['Pure Stocks', 'Super Stocks', 'Late Model Practice'],
    sanction: 'Local Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '5:00 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$30',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Fast-paced Friday evening grassroots fender-banging with open test sessions and feature races.',
    official_source_url: 'https://coloradospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://coloradospeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_cns_03',
    title: 'Father’s Day & Summer Shootout: Super Late Models 100 & Legends',
    trackSlug: 'colorado-national-speedway',
    trackName: 'Colorado National Speedway',
    trackType: 'asphalt_oval',
    city: 'Denver, CO',
    lat: 40.0768,
    lon: -104.9818,
    timing: 'next_weekend',
    durationHours: 4,
    classes: ['Super Late Models (100 Laps)', 'Legends', 'Super Stocks', 'Trains'],
    sanction: 'NASCAR Advance Auto Parts Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:00 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$22',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free with adult',
    description: 'Century shootout on Dacono’s high banks featuring 100 laps of Super Late Model intensity, crazy Train races, and fireworks.',
    official_source_url: 'https://coloradospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://coloradospeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_cns_04',
    title: 'Colorado 250 Mid-Season Championship',
    trackSlug: 'colorado-national-speedway',
    trackName: 'Colorado National Speedway',
    trackType: 'asphalt_oval',
    city: 'Denver, CO',
    lat: 40.0768,
    lon: -104.9818,
    offsetDays: 18,
    durationHours: 4.5,
    classes: ['Pro Trucks Mid-Season 50', 'Late Models', 'Grand American Modifieds'],
    sanction: 'NASCAR Advance Auto Parts Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:15 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Points championship double-points race for Pro Trucks and Grand American Modifieds.',
    official_source_url: 'https://coloradospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://coloradospeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_cns_05',
    title: 'Challenge Cup XL: NASCAR Pro Trucks & Figure 8 Nationals',
    trackSlug: 'colorado-national-speedway',
    trackName: 'Colorado National Speedway',
    trackType: 'asphalt_oval',
    city: 'Denver, CO',
    lat: 40.0768,
    lon: -104.9818,
    offsetDays: 45,
    durationHours: 4,
    classes: ['Figure-8 Nationals', 'Pro Trucks', 'Super Stocks'],
    sanction: 'NASCAR Advance Auto Parts Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$22',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'World-famous intersection criss-cross Figure-8 racing plus championship truck shootouts.',
    official_source_url: 'https://coloradospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://coloradospeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },

  // --- I-76 Speedway (Fort Morgan, CO) ---
  {
    id: 'race_seed_i76_01',
    title: 'High Plains Dirt Clash: 305 Sprints & IMCA Modifieds',
    trackSlug: 'i-76-speedway',
    trackName: 'I-76 Speedway',
    trackType: 'dirt_oval',
    city: 'Fort Morgan, CO',
    lat: 40.2520,
    lon: -103.7980,
    offsetHours: 7,
    durationHours: 4,
    classes: ['305 Winged Sprint Cars', 'IMCA Modifieds', 'Stock Cars', 'Sport Compacts'],
    sanction: 'IMCA Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$18',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'Cushion-banging dirt action on Fort Morgan’s quarter-mile clay track. Wings, modifieds, and side-by-side slide jobs.',
    official_source_url: 'https://i-76speedway.com/events',
    sourceType: 'official_box_office',
    ticket_url: 'https://i-76speedway.com/events',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_i76_02',
    title: 'Summer Dirt Stampede: BST Modifieds & Hobby Stocks',
    trackSlug: 'i-76-speedway',
    trackName: 'I-76 Speedway',
    trackType: 'dirt_oval',
    city: 'Fort Morgan, CO',
    lat: 40.2520,
    lon: -103.7980,
    timing: 'next_weekend',
    durationHours: 3.5,
    classes: ['IMCA Modifieds', 'Hobby Stocks', 'Dwarf Cars'],
    sanction: 'IMCA Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'Grassroots dirt oval racing featuring full-throttle feature races under the eastern Colorado prairie stars.',
    official_source_url: 'https://i-76speedway.com/events',
    sourceType: 'official_box_office',
    ticket_url: 'https://i-76speedway.com/events',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_i76_03',
    title: 'Eastern Plains Sprint Car Crown: BST Sprints & Northern SportMods',
    trackSlug: 'i-76-speedway',
    trackName: 'I-76 Speedway',
    trackType: 'dirt_oval',
    city: 'Fort Morgan, CO',
    lat: 40.2520,
    lon: -103.7980,
    offsetDays: 22,
    durationHours: 4,
    classes: ['Blood, Sweat & Tears 305 Sprints', 'Northern SportMods', 'Stock Cars'],
    sanction: 'Blood, Sweat & Tears Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'Regional winged 305 sprint championship battle with the best dirt drivers from Colorado, Wyoming, and Nebraska.',
    official_source_url: 'https://i-76speedway.com/events',
    sourceType: 'official_box_office',
    ticket_url: 'https://i-76speedway.com/events',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_i76_04',
    title: 'High Plains Harvest Fall Dirt Nationals',
    trackSlug: 'i-76-speedway',
    trackName: 'I-76 Speedway',
    trackType: 'dirt_oval',
    city: 'Fort Morgan, CO',
    lat: 40.2520,
    lon: -103.7980,
    offsetDays: 52,
    durationHours: 4.5,
    classes: ['IMCA Modifieds ($2,000 to win)', 'Stock Cars', 'Sport Compacts'],
    sanction: 'IMCA Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'End-of-season dirt nationals with racers hauling in across the High Plains for big purse payouts.',
    official_source_url: 'https://i-76speedway.com/events',
    sourceType: 'official_box_office',
    ticket_url: 'https://i-76speedway.com/events',
    isCancelled: false,
    isStale: false
  },

  // --- Pueblo Motorsports Park (Pueblo, CO) ---
  {
    id: 'race_seed_pueblo_01',
    title: 'Friday Night Grudge & Midnight Street Drags',
    trackSlug: 'pueblo-motorsports-park',
    trackName: 'Pueblo Motorsports Park',
    trackType: 'drag_strip',
    city: 'Pueblo, CO',
    lat: 38.3308,
    lon: -104.6648,
    offsetHours: 9,
    durationHours: 5,
    classes: ['Test & Tune', 'Street Eliminator', 'Outlaw Grudge', 'Imports vs Domestics'],
    sanction: 'NHRA Member Track',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '5:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$25 (Tech Card: $40)',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Quarter-mile drag strip open test and tune, grudge matches, and street legal drag racing under the high-output lights.',
    official_source_url: 'https://pueblomotorsportspark.org/calendar',
    sourceType: 'official_box_office',
    ticket_url: 'https://pueblomotorsportspark.org/calendar',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_pueblo_02',
    title: 'NHRA Lucas Oil Drag Racing Series Bracket Points Race',
    trackSlug: 'pueblo-motorsports-park',
    trackName: 'Pueblo Motorsports Park',
    trackType: 'drag_strip',
    city: 'Pueblo, CO',
    lat: 38.3308,
    lon: -104.6648,
    timing: 'next_weekend',
    durationHours: 6,
    classes: ['Super Pro', 'Pro ET', 'Sportsman', 'Junior Dragsters'],
    sanction: 'NHRA Member Track',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '8:00 AM',
    hotLapsTime: '9:00 AM',
    greenFlagTime: '10:00 AM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$25',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Full-day NHRA bracket racing points battle on southern Colorado’s quarter-mile drag strip.',
    official_source_url: 'https://pueblomotorsportspark.org/calendar',
    sourceType: 'official_box_office',
    ticket_url: 'https://pueblomotorsportspark.org/calendar',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_pueblo_03',
    title: 'Rocky Mountain Open Track Day & SCCA Time Trials',
    trackSlug: 'pueblo-motorsports-park',
    trackName: 'Pueblo Motorsports Park',
    trackType: 'road_course',
    city: 'Pueblo, CO',
    lat: 38.3308,
    lon: -104.6648,
    offsetDays: 20,
    durationHours: 5,
    classes: ['Novice HPDE', 'Advanced Open Lapping', 'SCCA Time Trials'],
    sanction: 'SCCA Continental Divide Region',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '7:30 AM',
    hotLapsTime: '8:30 AM',
    greenFlagTime: '9:00 AM',
    generalAdmissionPrice: '$10 Spectator',
    pitPassPrice: '$20',
    kidsPolicy: 'Kids Free',
    description: 'Technical 2.2-mile road course lapping sessions and time trials for sports cars, track specials, and daily drivers.',
    official_source_url: 'https://pueblomotorsportspark.org/calendar',
    sourceType: 'official_box_office',
    ticket_url: 'https://pueblomotorsportspark.org/calendar',
    isCancelled: false,
    isStale: false
  },

  // --- Pikes Peak International Raceway (Fountain, CO) ---
  {
    id: 'race_seed_ppir_01',
    title: 'Front Range Drift Session & Time Attack Open Lapping',
    trackSlug: 'pikes-peak-international-raceway',
    trackName: 'Pikes Peak International Raceway',
    trackType: 'road_course',
    city: 'Colorado Springs, CO',
    lat: 38.5910,
    lon: -104.6738,
    offsetHours: 14,
    durationHours: 6,
    classes: ['Grassroots Drift Open Tandem', 'Time Attack Lapping', 'Autocross'],
    sanction: 'Drift Colorado',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '8:00 AM',
    hotLapsTime: '9:00 AM',
    greenFlagTime: '9:30 AM',
    generalAdmissionPrice: '$15 Spectator',
    pitPassPrice: '$20',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Multi-course grassroots drifting and precision road racing inside the historic PPIR speedway oval infield.',
    official_source_url: 'https://ppir.com/calendar',
    sourceType: 'official_box_office',
    ticket_url: 'https://ppir.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_ppir_02',
    title: 'Colorado Summer Drift Matinee & Tandem Battles',
    trackSlug: 'pikes-peak-international-raceway',
    trackName: 'Pikes Peak International Raceway',
    trackType: 'road_course',
    city: 'Colorado Springs, CO',
    lat: 38.5910,
    lon: -104.6738,
    timing: 'next_weekend',
    durationHours: 5,
    classes: ['Drift Colorado Pro-Am', 'Grassroots Tandem'],
    sanction: 'Drift Colorado',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '10:00 AM',
    hotLapsTime: '11:00 AM',
    greenFlagTime: '12:00 PM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$25',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Tire smoke and high-angle tandem drifting on PPIR’s technical road course course layout.',
    official_source_url: 'https://ppir.com/calendar',
    sourceType: 'official_box_office',
    ticket_url: 'https://ppir.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_ppir_03',
    title: 'SCCA Track Night in America & HPDE Open Lapping',
    trackSlug: 'pikes-peak-international-raceway',
    trackName: 'Pikes Peak International Raceway',
    trackType: 'road_course',
    city: 'Colorado Springs, CO',
    lat: 38.5910,
    lon: -104.6738,
    offsetDays: 25,
    durationHours: 5,
    classes: ['SCCA Track Night', 'HPDE 1-4', 'Time Trials'],
    sanction: 'SCCA',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '2:00 PM',
    hotLapsTime: '3:30 PM',
    greenFlagTime: '4:00 PM',
    generalAdmissionPrice: '$10 Spectator',
    pitPassPrice: '$20',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Afternoon and evening open track driving experience on the PPIR infield road circuit.',
    official_source_url: 'https://ppir.com/calendar',
    sourceType: 'official_box_office',
    ticket_url: 'https://ppir.com/tickets',
    isCancelled: false,
    isStale: false
  },

  // --- El Paso County Raceway (Calhan, CO) ---
  {
    id: 'race_seed_elpaso_01',
    title: 'High Plains Saturday Dirt Showdown',
    trackSlug: 'el-paso-county-raceway',
    trackName: 'El Paso County Raceway',
    trackType: 'dirt_oval',
    city: 'Calhan, CO',
    lat: 39.0336,
    lon: -104.2982,
    offsetHours: 11,
    durationHours: 3.5,
    classes: ['Sprint Cars', 'Dwarf Cars', 'Modifieds', 'Mini Stocks'],
    sanction: 'High Plains Racing Series',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$15 Cash',
    pitPassPrice: '$30',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'Classic grassroots fairgrounds clay racing on the eastern plains with high-banked sprints and open grandstands.',
    official_source_url: 'https://elpasocountyraceway.com',
    sourceType: 'official_box_office',
    ticket_url: 'https://elpasocountyraceway.com',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_elpaso_02',
    title: 'Pikes Peak Fairgrounds Dwarf Car & IMCA Clash',
    trackSlug: 'el-paso-county-raceway',
    trackName: 'El Paso County Raceway',
    trackType: 'dirt_oval',
    city: 'Calhan, CO',
    lat: 39.0336,
    lon: -104.2982,
    timing: 'next_weekend',
    durationHours: 3.5,
    classes: ['Dwarf Cars', 'IMCA Modifieds', 'Sport Compacts'],
    sanction: 'High Plains Racing Series',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$15 Cash',
    pitPassPrice: '$30',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'High-altitude quarter-mile dirt racing under the lights at the Calhan fairgrounds.',
    official_source_url: 'https://elpasocountyraceway.com',
    sourceType: 'official_box_office',
    ticket_url: 'https://elpasocountyraceway.com',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_elpaso_03',
    title: 'Sprint Car Spectacular Under the Lights',
    trackSlug: 'el-paso-county-raceway',
    trackName: 'El Paso County Raceway',
    trackType: 'dirt_oval',
    city: 'Calhan, CO',
    lat: 39.0336,
    lon: -104.2982,
    offsetDays: 24,
    durationHours: 4,
    classes: ['Winged Sprints', 'Non-Wing Sprints', 'Stock Cars'],
    sanction: 'High Plains Racing Series',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$18 Cash',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 10 & Under Free',
    description: 'Thunderous open-wheel sprint cars flying sideways on the Calhan quarter-mile clay oval.',
    official_source_url: 'https://elpasocountyraceway.com',
    sourceType: 'official_box_office',
    ticket_url: 'https://elpasocountyraceway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Red Cedar Speedway (Eau Claire / Menomonie, WI) ---
  {
    id: 'race_seed_rcs_01',
    title: 'Friday Night Thunder: WISSOTA Late Models & Super Stocks',
    trackSlug: 'red-cedar-speedway',
    trackName: 'Red Cedar Speedway',
    trackType: 'dirt_oval',
    city: 'Eau Claire, WI',
    lat: 44.8690,
    lon: -91.9160,
    offsetHours: 6,
    durationHours: 4,
    classes: ['WISSOTA Late Models', 'WISSOTA Modifieds', 'Super Stocks', 'Midwest Mods', 'Street Stocks'],
    sanction: 'WISSOTA Auto Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '5:00 PM',
    hotLapsTime: '6:15 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$17',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free with paid adult',
    description: 'Western Wisconsin’s premier Friday night red clay dirt track racing at the Dunn County fairgrounds outside Eau Claire.',
    official_source_url: 'https://redcedarspeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://redcedarspeedway.com',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_rcs_02',
    title: 'Chippewa Valley Clash: WISSOTA Sprints & Modified Special',
    trackSlug: 'red-cedar-speedway',
    trackName: 'Red Cedar Speedway',
    trackType: 'dirt_oval',
    city: 'Eau Claire, WI',
    lat: 44.8690,
    lon: -91.9160,
    timing: 'next_weekend',
    durationHours: 4,
    classes: ['WISSOTA Modifieds ($1,500 to win)', 'WISSOTA Late Models', 'Midwest Mods'],
    sanction: 'WISSOTA Auto Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '5:00 PM',
    hotLapsTime: '6:15 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$18',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Big money WISSOTA modified special drawing top dirt track racers from across Wisconsin and Minnesota.',
    official_source_url: 'https://redcedarspeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://redcedarspeedway.com',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_rcs_03',
    title: 'Dunn County Fair Race & Firecracker Shootout',
    trackSlug: 'red-cedar-speedway',
    trackName: 'Red Cedar Speedway',
    trackType: 'dirt_oval',
    city: 'Eau Claire, WI',
    lat: 44.8690,
    lon: -91.9160,
    offsetDays: 26,
    durationHours: 4.5,
    classes: ['WISSOTA Late Models (40 Laps)', 'WISSOTA Modifieds', 'Street Stocks'],
    sanction: 'WISSOTA Auto Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '4:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '6:45 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Championship fair race under the lights with fireworks, carnival atmosphere, and packed grandstands.',
    official_source_url: 'https://redcedarspeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://redcedarspeedway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Rock Falls Raceway (Eau Claire / Rock Falls, WI) ---
  {
    id: 'race_seed_rfr_01',
    title: 'Saturday Bracket Points Series & High School Drags',
    trackSlug: 'rock-falls-raceway',
    trackName: 'Rock Falls Raceway',
    trackType: 'drag_strip',
    city: 'Eau Claire, WI',
    lat: 44.6853,
    lon: -91.6888,
    offsetHours: 10,
    durationHours: 5,
    classes: ['Super Pro', 'Pro ET', 'Sportsman', 'High School Drags', 'Trophy'],
    sanction: 'NHRA Member Track',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '8:00 AM',
    hotLapsTime: '9:00 AM',
    greenFlagTime: '10:00 AM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$25 (Tech Card $45)',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'NHRA sanctioned quarter-mile drag racing along the Chippewa River outside Eau Claire with bracket eliminators and open test runs.',
    official_source_url: 'https://rockfallsraceway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://rockfallsraceway.com',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_rfr_02',
    title: 'Muscle Car Drag Races & Friday Night Test & Tune',
    trackSlug: 'rock-falls-raceway',
    trackName: 'Rock Falls Raceway',
    trackType: 'drag_strip',
    city: 'Eau Claire, WI',
    lat: 44.6853,
    lon: -91.6888,
    timing: 'next_weekend',
    durationHours: 5,
    classes: ['Open Test & Tune', 'Street Legal Drags', 'Muscle Car Shootout'],
    sanction: 'NHRA Member Track',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '4:00 PM',
    hotLapsTime: '5:00 PM',
    greenFlagTime: '5:30 PM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$25',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Friday night straight-line drag action under the lights for street legal vehicles, imports, and American muscle.',
    official_source_url: 'https://rockfallsraceway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://rockfallsraceway.com',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_rfr_03',
    title: 'NHRA Wally Trophy Shootout & Midwest Drags',
    trackSlug: 'rock-falls-raceway',
    trackName: 'Rock Falls Raceway',
    trackType: 'drag_strip',
    city: 'Eau Claire, WI',
    lat: 44.6853,
    lon: -91.6888,
    offsetDays: 23,
    durationHours: 6,
    classes: ['NHRA Wally Trophy Eliminator', 'Super Pro', 'Pro ET', 'Quick 16'],
    sanction: 'NHRA Member Track',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '8:00 AM',
    hotLapsTime: '9:00 AM',
    greenFlagTime: '10:30 AM',
    generalAdmissionPrice: '$18',
    pitPassPrice: '$25',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Premier drag racing event of the month where drivers battle for the coveted NHRA Wally trophy.',
    official_source_url: 'https://rockfallsraceway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://rockfallsraceway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Eldora Speedway (New Weston, OH Benchmark) ---
  {
    id: 'race_seed_eldora_01',
    title: 'Castrol FloRacing Night in America Late Model Classic',
    trackSlug: 'eldora-speedway',
    trackName: 'Eldora Speedway',
    trackType: 'dirt_oval',
    city: 'New Weston, OH',
    lat: 40.3204,
    lon: -84.6364,
    offsetHours: 8,
    durationHours: 4.5,
    classes: ['Super Late Models ($20,000 to win)', 'Modifieds'],
    sanction: 'FloRacing Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '3:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:30 PM',
    generalAdmissionPrice: '$25',
    pitPassPrice: '$40',
    kidsPolicy: 'Kids 12 & Under Free in General Admission',
    description: 'National dirt late model showdown at Tony Stewart’s historic half-mile high banks in western Ohio.',
    official_source_url: 'https://eldoraspeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://eldoraspeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_eldora_02',
    title: 'Kings Royal: World of Outlaws Sprint Cars 40-Lap Crown',
    trackSlug: 'eldora-speedway',
    trackName: 'Eldora Speedway',
    trackType: 'dirt_oval',
    city: 'New Weston, OH',
    lat: 40.3204,
    lon: -84.6364,
    offsetDays: 28,
    durationHours: 5,
    classes: ['World of Outlaws 410 Sprints ($175,000 to win)'],
    sanction: 'World of Outlaws',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '2:00 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:30 PM',
    generalAdmissionPrice: '$40',
    pitPassPrice: '$55',
    kidsPolicy: 'Kids 12 & Under Free in GA',
    description: 'One of the most prestigious sprint car races in the world with the winner crowned King of Eldora.',
    official_source_url: 'https://eldoraspeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://eldoraspeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },

  // --- Lucas Oil Indianapolis Raceway Park (Indianapolis, IN Benchmark) ---
  {
    id: 'race_seed_irp_01',
    title: 'USAC Carb Night Classic & Sprint Car Showcase',
    trackSlug: 'lucas-oil-irp',
    trackName: 'Lucas Oil Indianapolis Raceway Park',
    trackType: 'asphalt_oval',
    city: 'Indianapolis, IN',
    lat: 39.8138,
    lon: -86.3402,
    offsetHours: 10,
    durationHours: 4,
    classes: ['USAC Silver Crown', 'National Pavement Midgets', 'Pavement Sprints'],
    sanction: 'USAC Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '3:00 PM',
    hotLapsTime: '5:00 PM',
    greenFlagTime: '6:45 PM',
    generalAdmissionPrice: '$30',
    pitPassPrice: '$45',
    kidsPolicy: 'Kids 11 & Under Free',
    description: 'Pavement open-wheel crown jewel under the lights at Indianapolis Raceway Park’s progressive-banked oval.',
    official_source_url: 'https://raceirp.com/tickets',
    sourceType: 'official_box_office',
    ticket_url: 'https://raceirp.com/tickets',
    isCancelled: false,
    isStale: false
  },
  {
    id: 'race_seed_irp_02',
    title: 'NHRA U.S. Nationals Test & Tune Prelude',
    trackSlug: 'lucas-oil-irp',
    trackName: 'Lucas Oil Indianapolis Raceway Park',
    trackType: 'drag_strip',
    city: 'Indianapolis, IN',
    lat: 39.8138,
    lon: -86.3402,
    offsetDays: 35,
    durationHours: 6,
    classes: ['Top Fuel', 'Funny Car', 'Pro Stock', 'Factory Stock Showdown'],
    sanction: 'NHRA',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '9:00 AM',
    hotLapsTime: '10:00 AM',
    greenFlagTime: '11:00 AM',
    generalAdmissionPrice: '$25',
    pitPassPrice: '$40',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Official test session on drag racing’s most historic quarter-mile strip leading up to the Big Go.',
    official_source_url: 'https://raceirp.com/tickets',
    sourceType: 'official_box_office',
    ticket_url: 'https://raceirp.com/tickets',
    isCancelled: false,
    isStale: false
  },

  // --- Bowman Gray Stadium (Winston-Salem / Charlotte, NC) ---
  {
    id: 'race_seed_bgs_01',
    title: 'Saturday Night Modified Madness at The Madhouse',
    trackSlug: 'bowman-gray-stadium',
    trackName: 'Bowman Gray Stadium',
    trackType: 'asphalt_oval',
    city: 'Winston-Salem, NC',
    lat: 36.0772,
    lon: -80.2330,
    offsetHours: 6,
    durationHours: 4,
    classes: ['Modifieds (100 Laps)', 'Sportsman', 'Street Stock', 'Stadium Stock'],
    sanction: 'NASCAR Advance Auto Parts Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '5:00 PM',
    hotLapsTime: '6:15 PM',
    greenFlagTime: '7:30 PM',
    generalAdmissionPrice: '$12',
    pitPassPrice: '$25',
    kidsPolicy: 'Kids 11 & Under Free',
    description: 'NASCAR’s longest-running weekly short track showdown inside the historic football stadium. 100 laps of full-contact Modified action.',
    official_source_url: 'https://bowmangrayracing.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://bowmangrayracing.com',
    isCancelled: false,
    isStale: false
  },

  // --- Millbridge Speedway (Salisbury / Charlotte, NC) ---
  {
    id: 'race_seed_mb_01',
    title: 'Mid-Week Shootout: Outlaw Karts & Micro Sprints',
    trackSlug: 'millbridge-speedway',
    trackName: 'Millbridge Speedway',
    trackType: 'dirt_oval',
    city: 'Salisbury, NC',
    lat: 35.6022,
    lon: -80.6015,
    offsetHours: 7,
    durationHours: 3.5,
    classes: ['Open Outlaw Karts', 'Intermediate Karts', 'Box Stock', 'Micro Sprints'],
    sanction: 'Millbridge Series',
    weatherStatus: 'green_flag',
    admissionModel: 'cash_at_gate',
    gateTime: '4:30 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$10',
    pitPassPrice: '$20',
    kidsPolicy: 'Kids 6 & Under Free',
    description: 'High-banked red clay action outside Charlotte where NASCAR Cup stars battle grassroots dirt wheelmen under the lights.',
    official_source_url: 'https://millbridgespeedway.com',
    sourceType: 'official_box_office',
    ticket_url: 'https://millbridgespeedway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Knoxville Raceway (Knoxville, IA - Sprint Car Capital) ---
  {
    id: 'race_seed_knox_01',
    title: 'Saturday Night 410 Sprint Car Championship Showdown',
    trackSlug: 'knoxville-raceway',
    trackName: 'Knoxville Raceway',
    trackType: 'dirt_oval',
    city: 'Knoxville, IA',
    lat: 41.3197,
    lon: -93.0998,
    offsetHours: 6,
    durationHours: 4,
    classes: ['410 Winged Sprints', '360 Sprints', 'Pro Sprints'],
    sanction: 'Knoxville Championship Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '5:00 PM',
    hotLapsTime: '6:30 PM',
    greenFlagTime: '7:30 PM',
    generalAdmissionPrice: '$18',
    pitPassPrice: '$35',
    kidsPolicy: 'Teens $10 · Kids 12 & Under Free',
    description: 'Thunder on the half-mile clay at the Sprint Car Capital of the World. America’s fastest winged dirt sprints battle on the black dirt.',
    official_source_url: 'https://knoxvilleraceway.com/Schedule.aspx',
    sourceType: 'official_box_office',
    ticket_url: 'https://knoxvilleraceway.com/Tickets.aspx',
    isCancelled: false,
    isStale: false
  },

  // --- Williams Grove Speedway (Mechanicsburg, PA - PA Posse) ---
  {
    id: 'race_seed_wg_01',
    title: 'Friday Night 410 Sprints & Super Late Model Classic',
    trackSlug: 'williams-grove-speedway',
    trackName: 'Williams Grove Speedway',
    trackType: 'dirt_oval',
    city: 'Mechanicsburg, PA',
    lat: 40.1558,
    lon: -77.0375,
    offsetHours: 5,
    durationHours: 4,
    classes: ['Lawrence Chevrolet 410 Sprints ($5,500 to win)', 'Super Late Models'],
    sanction: 'PA Posse Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '5:30 PM',
    hotLapsTime: '7:00 PM',
    greenFlagTime: '7:30 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free',
    description: 'Central Pennsylvania’s premier dirt sprint cathedral since 1939. High-speed 410 sprints roar around the legendary half-mile paperclip.',
    official_source_url: 'https://williamsgrove.com/schedule.htm',
    sourceType: 'official_box_office',
    ticket_url: 'https://williamsgrove.com',
    isCancelled: false,
    isStale: false
  },

  // --- Oswego Speedway (Oswego, NY - Steel Palace) ---
  {
    id: 'race_seed_oswego_01',
    title: 'Supermodified Saturday Night Championship',
    trackSlug: 'oswego-speedway',
    trackName: 'Oswego Speedway',
    trackType: 'asphalt_oval',
    city: 'Oswego, NY',
    lat: 43.4612,
    lon: -76.4883,
    offsetHours: 6,
    durationHours: 4,
    classes: ['Noveliss Supermodifieds (50 Laps)', 'Pathfinder Bank SBS', 'J&S Paving 350 Supers'],
    sanction: 'Oswego Speedway Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '3:30 PM',
    hotLapsTime: '5:00 PM',
    greenFlagTime: '6:30 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$40',
    kidsPolicy: 'Kids 16 & Under Free with paid adult',
    description: '800-horsepower big-block pavement supermodifieds screaming around the 5/8-mile Steel Palace on the shores of Lake Ontario.',
    official_source_url: 'https://oswegospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://oswegospeedway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Irwindale Speedway (Los Angeles, CA) ---
  {
    id: 'race_seed_irw_01',
    title: 'Saturday Night NASCAR Short Track Thunder',
    trackSlug: 'irwindale-speedway',
    trackName: 'Irwindale Speedway',
    trackType: 'asphalt_oval',
    city: 'Los Angeles, CA',
    lat: 34.1130,
    lon: -117.9890,
    offsetHours: 6,
    durationHours: 4,
    classes: ['NASCAR Late Models (Twin 35s)', 'Pro Trucks', 'Spec Late Models', 'Enduro'],
    sanction: 'NASCAR Advance Auto Parts Weekly Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$40',
    kidsPolicy: 'Kids 5 & Under Free',
    description: 'Premier Southern California short track racing under the lights at the historic San Gabriel Valley speedway.',
    official_source_url: 'https://irwindalespeedway.com/events',
    sourceType: 'official_box_office',
    ticket_url: 'https://irwindalespeedway.com/tickets',
    isCancelled: false,
    isStale: false
  },

  // --- Perris Auto Speedway (Perris / Riverside, CA) ---
  {
    id: 'race_seed_pas_01',
    title: 'Saturday Night USAC/CRA 410 Sprint Car Classic',
    trackSlug: 'perris-auto-speedway',
    trackName: 'Perris Auto Speedway',
    trackType: 'dirt_oval',
    city: 'Perris, CA',
    lat: 33.7844,
    lon: -117.2086,
    offsetHours: 7,
    durationHours: 4,
    classes: ['USAC/CRA 410 Sprint Cars (30 Laps)', 'PAS Senior Sprints', 'Young Guns'],
    sanction: 'USAC CRA',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '5:00 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$30',
    pitPassPrice: '$45',
    kidsPolicy: 'Kids 6–12 $5 · 5 & Under Free',
    description: 'Thunderous non-wing 410 sprint car slide jobs on the high-speed clay half-mile in the Inland Empire.',
    official_source_url: 'https://perrisautospeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://perrisautospeedway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Sycamore Speedway (Chicago / Maple Park, IL) ---
  {
    id: 'race_seed_syc_01',
    title: 'Saturday Night Dirt Late Models & Demolition Derby',
    trackSlug: 'sycamore-speedway',
    trackName: 'Sycamore Speedway',
    trackType: 'dirt_oval',
    city: 'Chicago, IL',
    lat: 41.9286,
    lon: -88.5447,
    offsetHours: 6,
    durationHours: 4.5,
    classes: ['Super Late Models', 'Street Stocks', 'Pure Stocks', 'Full-Contact Demolition Derby'],
    sanction: 'Sycamore Racing Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '5:00 PM',
    hotLapsTime: '6:15 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$15',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 5 & Under Free',
    description: 'Chicagoland’s Saturday night dirt racing tradition since 1963. Fast clay late model feature followed by destruction derby.',
    official_source_url: 'https://sycamorespeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://sycamorespeedway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Five Flags Speedway (Pensacola, FL) ---
  {
    id: 'race_seed_ffs_01',
    title: 'Friday Night Blizzard Series: Super Late Model 100',
    trackSlug: 'five-flags-speedway',
    trackName: 'Five Flags Speedway',
    trackType: 'asphalt_oval',
    city: 'Pensacola, FL',
    lat: 30.5283,
    lon: -87.3188,
    offsetHours: 5,
    durationHours: 4,
    classes: ['Blizzard Series Super Late Models (100 Laps)', 'Pro Late Models', 'Outlaws'],
    sanction: 'Southern Super Series',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '5:30 PM',
    greenFlagTime: '7:30 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 11 & Under Free',
    description: 'The road to the Snowball Derby. The nation’s top asphalt late model drivers battle on the high-banked Pensacola half-mile.',
    official_source_url: 'https://5flagsspeedway.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://5flagsspeedway.com',
    isCancelled: false,
    isStale: false
  },

  // --- Volusia Speedway Park (Barberville / Daytona, FL) ---
  {
    id: 'race_seed_vol_01',
    title: 'Saturday Night DIRTcar Modifieds & Sprint Shootout',
    trackSlug: 'volusia-speedway-park',
    trackName: 'Volusia Speedway Park',
    trackType: 'dirt_oval',
    city: 'Barberville, FL',
    lat: 29.1764,
    lon: -81.4258,
    offsetHours: 6,
    durationHours: 4,
    classes: ['DIRTcar UMP Modifieds', 'Top Gun Sprints', 'Street Stocks'],
    sanction: 'DIRTcar Racing',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '4:00 PM',
    hotLapsTime: '6:00 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$20',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 12 & Under Free in GA',
    description: 'High-speed clay racing at The World’s Fastest Half-Mile Dirt Track outside Daytona Beach.',
    official_source_url: 'https://volusiaspeedwaypark.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://volusiaspeedwaypark.com',
    isCancelled: false,
    isStale: false
  },

  // --- Kennedale Speedway Park (Kennedale / DFW, TX) ---
  {
    id: 'race_seed_kennedale_01',
    title: 'Saturday Night Dirt Track Showdown: IMCA Modifieds & Factory Stocks',
    trackSlug: 'kennedale-speedway-park',
    trackName: 'Kennedale Speedway Park',
    trackType: 'dirt_oval',
    city: 'Kennedale, TX',
    lat: 32.6186,
    lon: -97.2023,
    offsetHours: 6,
    durationHours: 4,
    classes: ['IMCA Modifieds', 'IMCA Stock Cars', 'Factory Stocks', 'SportMods'],
    sanction: 'IMCA',
    weatherStatus: 'green_flag',
    admissionModel: 'paid_ticket',
    gateTime: '5:00 PM',
    hotLapsTime: '6:30 PM',
    greenFlagTime: '7:00 PM',
    generalAdmissionPrice: '$16',
    pitPassPrice: '$35',
    kidsPolicy: 'Kids 5 & Under Free',
    description: 'Premier Saturday night grassroots dirt tracking in the Metroplex featuring roaring IMCA Modifieds, Stock Cars, and wheel-to-wheel battles.',
    official_source_url: 'https://kennedalespeedwaypark.com/schedule',
    sourceType: 'official_box_office',
    ticket_url: 'https://kennedalespeedwaypark.com',
    isCancelled: false,
    isStale: false
  }
];

// Helper to resolve scheduled races without dynamic date synthesis
function getAllScheduledRaces() {
  return MASTER_SCHEDULE_DEFINITIONS.map(r => {
    const normalized = normalizeRaceEvent(r);
    return {
      ...r,
      ...normalized,
      venue_name: r.trackName,
      venue_latitude: r.lat,
      venue_longitude: r.lon,
      category_tags: ['sports', 'racing'],
      categories: ['sports', 'racing'],
      racing: {
        ...normalized,
        surface: formatSurfaceName(r.trackType),
        trackType: r.trackType,
        divisions: r.classes
      },
      start_time: null,
      end_time: null,
      surfaceDisplay: formatSurfaceName(r.trackType),
      sourceType: 'venue_presence',
      lastVerifiedAt: r.lastVerifiedAt || '2026-09-18T12:00:00.000Z',
      confirmationStatus: 'venue_presence_only',
      isDisplayable: false,
      isConfirmed: false,
      isCancelled: Boolean(r.isCancelled),
      isStale: false,
      canonical_url: r.official_source_url
    };
  });
}

// Dynamic seed races are eliminated: seeds are venue presence only, never dated events
function getDynamicSeedRaces() {
  return [];
}

// Multi-week and season schedule retrieval by track and planning window
function getTrackSchedule(trackSlug, planningWindow = '48h') {
  if (!trackSlug) return [];
  const cleanSlug = String(trackSlug).toLowerCase().trim();
  const bounds = calculatePlanningWindowBounds(planningWindow);
  const all = getAllScheduledRaces().filter(r => r.trackSlug === cleanSlug);

  return all.filter(r => {
    if (!r.start_time) {
      // Seed records appear as venue presence schedule metadata
      return true;
    }
    const t = new Date(r.start_time).getTime();
    return t >= bounds.startMs && t <= bounds.endMs;
  });
}

// Freshness and provenance verification helper
function verifyScheduleFreshness(raceId) {
  if (!raceId) return { found: false, isFresh: false };
  const all = getAllScheduledRaces();
  const race = all.find(r => r.id === raceId);
  if (!race) return { found: false, isFresh: false };

  const lastVerified = race.lastVerifiedAt || '2026-09-18T14:00:00.000Z';
  const verifiedAgeMs = Date.now() - new Date(lastVerified).getTime();
  const maxFreshAgeMs = 7 * 24 * 3600e3; // Fresh if verified within 7 days
  return {
    found: true,
    raceId: race.id,
    trackSlug: race.trackSlug,
    officialSourceUrl: race.official_source_url,
    lastVerifiedAt: lastVerified,
    isFresh: verifiedAgeMs < maxFreshAgeMs,
    isStale: Boolean(race.isStale || verifiedAgeMs >= maxFreshAgeMs),
    isCancelled: Boolean(race.isCancelled)
  };
}

function getTrackBySlug(slug, planningWindow = '48h') {
  if (!slug) return null;
  const clean = String(slug).toLowerCase().trim();
  const track = KNOWN_TRACKS.find(t => t.slug === clean);
  if (!track) return null;

  const shows = getTrackSchedule(clean, planningWindow);
  const metadata = normalizeTrackMetadata(track);
  return {
    ...track,
    ...metadata,
    planningWindow,
    upcomingRaces: shows
  };
}

function getAllTracks() {
  return KNOWN_TRACKS.map(t => ({
    ...t,
    ...normalizeTrackMetadata(t)
  }));
}

function getTracksByState(state) {
  if (!state) return [];
  const clean = String(state).toUpperCase().trim();
  return getAllTracks().filter(t => t.state?.toUpperCase() === clean);
}

function getTracksByCity(city) {
  if (!city) return [];
  const clean = String(city).toLowerCase().trim();
  return getAllTracks().filter(t => t.city?.toLowerCase().includes(clean) || (t.state && t.state.toLowerCase() === clean));
}

function getTouringSeriesBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).toLowerCase().trim();
  return TOURING_SERIES.find(s => s.slug === clean) || null;
}

function getAllTouringSeries() {
  return TOURING_SERIES;
}

// Track Verification & Claim Store
const trackClaimsStore = new Map();

function hashClientIp(ip) {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || 'brinkberry_ip_privacy_salt_2026';
  return crypto.createHash('sha256').update(String(ip).trim() + salt).digest('hex').substring(0, 16);
}

function createTrackClaim({ trackSlug, requesterName, requesterRole, workEmail, phone, officialWebsite, notes, isAuthorized = false }) {
  const cleanSlug = String(trackSlug || '').toLowerCase().trim();
  const track = KNOWN_TRACKS.find(t => t.slug === cleanSlug);
  if (!track) {
    throw new Error(`Track "${trackSlug}" is not recognized in the Brinkberry registry.`);
  }

  const cleanEmail = String(workEmail || '').toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('A valid business email address is required.');
  }

  const emailDomain = cleanEmail.split('@')[1];
  let trackDomain = '';
  try {
    const u = new URL(track.website);
    trackDomain = u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {}

  const hasDomainMatch = trackDomain && emailDomain === trackDomain;
  const claimId = `claim_track_${cleanSlug}_${Date.now()}`;
  const emailVerificationToken = `evt_${crypto.randomBytes(16).toString('hex')}`;
  const siteVerificationToken = `bb-verify-track-${crypto.randomBytes(8).toString('hex')}`;

  const claim = {
    id: claimId,
    trackSlug: cleanSlug,
    trackName: track.name,
    requesterName: String(requesterName || '').trim(),
    requesterRole: String(requesterRole || 'Promoter / General Manager').trim(),
    workEmail: cleanEmail,
    phone: String(phone || '').trim(),
    officialWebsite: officialWebsite || track.website,
    notes: String(notes || '').trim(),
    emailDomain,
    trackDomain,
    hasDomainMatch,
    verificationMethod: hasDomainMatch ? 'domain_email' : 'manual_review',
    emailVerificationToken,
    siteVerificationToken,
    status: hasDomainMatch ? 'pending_email_verification' : 'pending_review',
    isVenueVerified: false,
    submittedAt: new Date().toISOString(),
    isAuthorizedTest: Boolean(isAuthorized)
  };

  trackClaimsStore.set(claimId, claim);
  return claim;
}

function verifyTrackEmailClaim(claimId, token) {
  if (!claimId || !token) throw new Error('claimId and verification token are required.');
  const claim = trackClaimsStore.get(claimId);
  if (!claim) throw new Error('Claim record not found or expired.');

  if (claim.emailVerificationToken !== token) {
    throw new Error('Invalid or expired email verification token.');
  }

  claim.status = 'verified';
  claim.isVenueVerified = true;
  claim.verifiedAt = new Date().toISOString();
  trackClaimsStore.set(claimId, claim);

  const track = KNOWN_TRACKS.find(t => t.slug === claim.trackSlug);
  if (track) {
    track.isClaimed = true;
    track.claimedAt = claim.verifiedAt;
  }

  return {
    success: true,
    trackSlug: claim.trackSlug,
    trackName: claim.trackName,
    isVenueVerified: true
  };
}

function purgeTestTrackClaim(trackSlug) {
  if (!trackSlug) return;
  const clean = String(trackSlug).toLowerCase().trim();
  for (const [id, c] of trackClaimsStore.entries()) {
    if (c.trackSlug === clean && c.isAuthorizedTest) {
      trackClaimsStore.delete(id);
    }
  }
}

// Racing Fan Demand Signals: "Bring This Series / Driver to My Home Track"
const racingDemandStore = new Map(); // entitySlug -> Map(trackSlug -> { count, signals: [] })

function recordRacingDemandSignal({ entitySlug, entityType = 'series', entityName, trackSlug, email, ip, consent = false, isTest = false, isAuthorized = false }) {
  if (!entitySlug || !trackSlug) throw new Error('entitySlug and trackSlug are required');
  const cleanEntity = String(entitySlug).toLowerCase().trim();
  const cleanTrack = String(trackSlug).toLowerCase().trim();

  const ipHash = hashClientIp(ip);
  if (ipHash && (!isTest || !isAuthorized)) {
    checkDurableRateLimit(ipHash);
  }

  if (!racingDemandStore.has(cleanEntity)) {
    racingDemandStore.set(cleanEntity, new Map());
  }
  const trackMap = racingDemandStore.get(cleanEntity);
  const trackData = trackMap.get(cleanTrack) || { count: 0, signals: [] };

  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600e3;
  const isDuplicate = Boolean(ipHash && trackData.signals.some(s => s.ipHash === ipHash && s.time > thirtyDaysAgo));

  if (!isDuplicate) {
    if (!isTest || isAuthorized) {
      trackData.count += 1;
    }
    trackData.signals.push({
      ipHash,
      email: (consent && email) ? String(email).trim().toLowerCase() : null,
      time: Date.now(),
      isTest
    });
    trackMap.set(cleanTrack, trackData);
  }

  let totalDemand = 0;
  for (const item of trackMap.values()) {
    const c = typeof item === 'number' ? item : (item.count || 0);
    totalDemand += c;
  }

  return {
    success: true,
    isDuplicate,
    deduplicated: isDuplicate,
    entitySlug: cleanEntity,
    trackSlug: cleanTrack,
    trackDemand: trackData.count,
    totalDemand,
    emailRetained: Boolean(consent && email),
    isTest
  };
}

function getRacingDemandSummary(entitySlug) {
  const clean = String(entitySlug || '').toLowerCase().trim();
  const trackMap = racingDemandStore.get(clean) || new Map();
  const topTracks = [];
  let totalDemand = 0;

  for (const [trackSlug, item] of trackMap.entries()) {
    const count = typeof item === 'number' ? item : (item.count || 0);
    topTracks.push({ trackSlug, count });
    totalDemand += count;
  }
  topTracks.sort((a, b) => b.count - a.count);

  return {
    entitySlug: clean,
    totalDemand,
    topTracks
  };
}

function distMiles(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = d => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getNearbyVerifiedRaces(lat, lon, radiusMiles = 100, windowStart, windowEnd) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const startMs = windowStart ? new Date(windowStart).getTime() : Date.now();
  const endMs = windowEnd ? new Date(windowEnd).getTime() : Date.now() + 48 * 3600e3;

  const allRaces = getAllScheduledRaces();
  const matched = [];

  for (const race of allRaces) {
    if (!race.start_time) continue;
    if (race.confirmationStatus === 'venue_presence_only' || race.confirmationStatus === 'unconfirmed_seed') continue;
    const rLat = race.venue_latitude;
    const rLon = race.venue_longitude;
    if (!Number.isFinite(rLat) || !Number.isFinite(rLon)) continue;

    const dist = distMiles(lat, lon, rLat, rLon);
    if (dist == null || dist > radiusMiles) continue;

    const t = new Date(race.start_time).getTime();
    if (isNaN(t) || t < startMs || t > endMs) continue;

    matched.push({
      ...race,
      distance_miles: Math.round(dist * 10) / 10
    });
  }

  return matched;
}

function purgeTestRacingDemand(entitySlug) {
  if (!entitySlug) return;
  racingDemandStore.delete(String(entitySlug).toLowerCase().trim());
}

module.exports = {
  KNOWN_TRACKS,
  TOURING_SERIES,
  getTrackBySlug,
  getAllTracks,
  getTracksByState,
  getTracksByCity,
  getTouringSeriesBySlug,
  getAllTouringSeries,
  getDynamicSeedRaces,
  getAllScheduledRaces,
  getTrackSchedule,
  calculatePlanningWindowBounds,
  verifyScheduleFreshness,
  getNearbyVerifiedRaces,
  distMiles,
  createTrackClaim,
  verifyTrackEmailClaim,
  purgeTestTrackClaim,
  recordRacingDemandSignal,
  getRacingDemandSummary,
  purgeTestRacingDemand
};

