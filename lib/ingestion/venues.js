/**
 * Standard Verified Venues with exact coordinates and neighborhoods
 */
const VERIFIED_VENUES = [
  // Denver
  {
    name: 'Red Rocks Amphitheatre',
    city: 'Morrison',
    state: 'CO',
    neighborhood: 'Red Rocks Park',
    latitude: 39.6654,
    longitude: -105.2057,
    venue_type: 'amphitheatre',
    address: '18300 W Alameda Pkwy, Morrison, CO 80465',
    website_url: 'https://www.redrocksonline.com'
  },
  {
    name: 'Mission Ballroom',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'RiNo',
    latitude: 39.7758,
    longitude: -104.9785,
    venue_type: 'concert_hall',
    address: '4242 Wynkoop St, Denver, CO 80216',
    website_url: 'https://www.missionballroom.com'
  },
  {
    name: 'Gothic Theatre',
    city: 'Englewood',
    state: 'CO',
    neighborhood: 'South Broadway',
    latitude: 39.6587,
    longitude: -104.9877,
    venue_type: 'theater',
    address: '3263 S Broadway, Englewood, CO 80113',
    website_url: 'https://www.gothictheatre.com'
  },
  {
    name: 'Denver Botanic Gardens — York Street',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Cheesman Park',
    latitude: 39.7323,
    longitude: -104.9602,
    venue_type: 'garden',
    address: '1007 York St, Denver, CO 80206',
    website_url: 'https://www.botanicgardens.org'
  },
  {
    name: 'Denver Art Museum',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Golden Triangle',
    latitude: 39.7371,
    longitude: -104.9893,
    venue_type: 'museum',
    address: '100 W 14th Ave Pkwy, Denver, CO 80204',
    website_url: 'https://www.denverartmuseum.org'
  },
  {
    name: 'Lola & Rob Salazar Student Wellness Center',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Auraria',
    latitude: 39.7471,
    longitude: -105.0029,
    venue_type: 'fitness_center',
    address: '1355 12th St, Denver, CO 80204',
    website_url: 'https://calendar.ucdenver.edu'
  },
  {
    name: 'Tivoli Student Union',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Auraria',
    latitude: 39.7456,
    longitude: -105.0041,
    venue_type: 'community_center',
    address: '900 Auraria Pkwy, Denver, CO 80204',
    website_url: 'https://www.ahec.edu/tivoli'
  },
  {
    name: 'Comedy Works Downtown',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Larimer Square',
    latitude: 39.7497,
    longitude: -104.9984,
    venue_type: 'comedy_club',
    address: '1226 15th St, Denver, CO 80202',
    website_url: 'https://www.comedyworks.com'
  },
  {
    name: 'MCA Denver at the Holiday Theater',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Highlands',
    latitude: 39.7613,
    longitude: -105.0195,
    venue_type: 'arts_center',
    address: '2644 W 32nd Ave, Denver, CO 80211',
    website_url: 'https://mcadenver.org'
  },
  {
    name: 'Dazzle',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Downtown / DPAC',
    latitude: 39.7438,
    longitude: -104.9967,
    venue_type: 'jazz_club',
    address: '1080 14th St, Denver, CO 80202',
    website_url: 'https://dazzledenver.com'
  },
  {
    name: 'Lady Justice Brewing',
    city: 'Englewood',
    state: 'CO',
    neighborhood: 'Downtown Englewood',
    latitude: 39.6542,
    longitude: -104.9878,
    venue_type: 'brewery',
    address: '3242 S Acoma St, Englewood, CO 80110',
    website_url: 'https://www.ladyjusticebrewing.com'
  },
  {
    name: 'FlyteCo Tower',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Central Park',
    latitude: 39.7602,
    longitude: -104.8972,
    venue_type: 'brewery',
    address: '3120 Uinta St, Denver, CO 80238',
    website_url: 'https://flytecotower.com'
  },
  {
    name: "Cervantes' Masterpiece Ballroom",
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Five Points',
    latitude: 39.7545,
    longitude: -104.9782,
    venue_type: 'concert_hall',
    address: '2637 Welton St, Denver, CO 80205',
    website_url: 'https://cervantesmasterpiece.com'
  },
  {
    name: "Herb's Bar",
    city: 'Denver',
    state: 'CO',
    neighborhood: 'LoDo / Ballpark',
    latitude: 39.7533,
    longitude: -104.9942,
    venue_type: 'music_venue',
    address: '2057 Larimer St, Denver, CO 80205',
    website_url: 'https://herbsbar.com'
  },
  {
    name: 'Denver Performing Arts Complex',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'Downtown / Theater District',
    latitude: 39.7445,
    longitude: -104.9984,
    venue_type: 'performing_arts_center',
    address: '1400 Curtis St, Denver, CO 80204',
    website_url: 'https://www.denvercenter.org'
  },
  {
    name: 'Denver Beer Co — Platte St',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'LoHi',
    latitude: 39.7578,
    longitude: -105.0068,
    venue_type: 'brewery',
    address: '1695 Platte St, Denver, CO 80202',
    website_url: 'https://denverbeerco.com'
  },
  {
    name: 'Fiction Beer Company',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'East Colfax',
    latitude: 39.7403,
    longitude: -104.9012,
    venue_type: 'brewery',
    address: '7101 E Colfax Ave, Denver, CO 80220',
    website_url: 'https://fictionbeer.com'
  },
  {
    name: 'Zen Center of Denver',
    city: 'Denver',
    state: 'CO',
    neighborhood: 'University Park',
    latitude: 39.6826,
    longitude: -104.9559,
    venue_type: 'community_center',
    address: '1856 S Columbine St, Denver, CO 80210',
    website_url: 'https://zencenterofdenver.org'
  },

  // Boulder
  {
    name: 'Fox Theatre',
    city: 'Boulder',
    state: 'CO',
    neighborhood: 'The Hill',
    latitude: 40.0076,
    longitude: -105.2764,
    venue_type: 'concert_hall',
    address: '1135 13th St, Boulder, CO 80302',
    website_url: 'https://www.z2ent.com/fox-theatre'
  },
  {
    name: 'Boulder Theater',
    city: 'Boulder',
    state: 'CO',
    neighborhood: 'Downtown Boulder',
    latitude: 40.0183,
    longitude: -105.2785,
    venue_type: 'theater',
    address: '2032 14th St, Boulder, CO 80302',
    website_url: 'https://www.bouldertheater.com'
  },
  {
    name: 'Chautauqua Auditorium',
    city: 'Boulder',
    state: 'CO',
    neighborhood: 'Chautauqua',
    latitude: 39.9989,
    longitude: -105.2818,
    venue_type: 'amphitheatre',
    address: '900 Baseline Rd, Boulder, CO 80302',
    website_url: 'https://www.chautauqua.com'
  },
  {
    name: 'Macky Auditorium Concert Hall',
    city: 'Boulder',
    state: 'CO',
    neighborhood: 'CU Boulder Campus',
    latitude: 40.0101,
    longitude: -105.2731,
    venue_type: 'concert_hall',
    address: '1595 Pleasant St, Boulder, CO 80309',
    website_url: 'https://www.colorado.edu/macky'
  },
  {
    name: 'Dairy Arts Center',
    city: 'Boulder',
    state: 'CO',
    neighborhood: 'East Boulder',
    latitude: 40.0215,
    longitude: -105.2635,
    venue_type: 'arts_center',
    address: '2590 Walnut St, Boulder, CO 80302',
    website_url: 'https://thedairy.org'
  },

  // Golden
  {
    name: 'The Buffalo Rose',
    city: 'Golden',
    state: 'CO',
    neighborhood: 'Historic Downtown Golden',
    latitude: 39.7554,
    longitude: -105.2212,
    venue_type: 'music_venue',
    address: '1119 Washington Ave, Golden, CO 80401',
    website_url: 'https://buffalorosegolden.com'
  },
  {
    name: 'Foothills Art Center',
    city: 'Golden',
    state: 'CO',
    neighborhood: 'Downtown Golden',
    latitude: 39.7538,
    longitude: -105.2241,
    venue_type: 'arts_center',
    address: '809 15th St, Golden, CO 80401',
    website_url: 'https://foothillsartcenter.org'
  },
  {
    name: 'Colorado Railroad Museum',
    city: 'Golden',
    state: 'CO',
    neighborhood: 'North Table Mountain Foothills',
    latitude: 39.7744,
    longitude: -105.1942,
    venue_type: 'museum',
    address: '17155 W 44th Ave, Golden, CO 80403',
    website_url: 'https://coloradorailroadmuseum.org'
  },
  {
    name: 'Clear Creek Whitewater Park',
    city: 'Golden',
    state: 'CO',
    neighborhood: 'Clear Creek Corridor',
    latitude: 39.7562,
    longitude: -105.2255,
    venue_type: 'outdoor_park',
    address: '1201 10th St, Golden, CO 80401',
    website_url: 'https://www.cityofgolden.net'
  },

  // Aurora
  {
    name: 'The Aurora Fox Arts Center',
    city: 'Aurora',
    state: 'CO',
    neighborhood: 'Aurora Cultural Arts District',
    latitude: 39.7402,
    longitude: -104.8722,
    venue_type: 'theater',
    address: '9900 E Colfax Ave, Aurora, CO 80010',
    website_url: 'https://www.aurorafoxartscenter.org'
  },
  {
    name: 'Stanley Marketplace',
    city: 'Aurora',
    state: 'CO',
    neighborhood: 'Westerly Creek / Stanley',
    latitude: 39.7529,
    longitude: -104.8770,
    venue_type: 'community_hub',
    address: '2501 Dallas St, Aurora, CO 80010',
    website_url: 'https://stanleymarketplace.com'
  },
  {
    name: 'Aurora Reservoir Recreation Area',
    city: 'Aurora',
    state: 'CO',
    neighborhood: 'Southeast Aurora',
    latitude: 39.5935,
    longitude: -104.6981,
    venue_type: 'outdoor_park',
    address: '5800 S Powhaton Rd, Aurora, CO 80016',
    website_url: 'https://www.auroragov.org'
  },
  {
    name: 'Vintage Theatre',
    city: 'Aurora',
    state: 'CO',
    neighborhood: 'Cultural Arts District',
    latitude: 39.7397,
    longitude: -104.8705,
    venue_type: 'theater',
    address: '1468 Dayton St, Aurora, CO 80010',
    website_url: 'https://www.vintagetheatre.org'
  }
];

module.exports = { VERIFIED_VENUES };
