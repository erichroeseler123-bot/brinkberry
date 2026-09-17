/**
 * Community Calendar Registry
 *
 * Maintains a registry of verified, official, publicly accessible iCalendar (.ics)
 * and RSS syndication feeds for universities, arts councils, and civic centers.
 * All sources must be official and machine-readable without HTML scraping.
 */

const COMMUNITY_FEEDS = [
  {
    id: 'uwec_events',
    name: 'UW–Eau Claire Campus & Arts Events',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.7986,
    lon: -91.4989,
    maxRadiusMiles: 40,
    feedUrl: 'https://calendar.uwec.edu/EventList.aspx?view=RSS',
    format: 'rss',
    timezone: 'America/Chicago',
    defaultCategory: 'arts',
    provenance: {
      source: 'University of Wisconsin–Eau Claire',
      url: 'https://calendar.uwec.edu/'
    }
  },
  {
    id: 'eauclaire_civic',
    name: 'City of Eau Claire Public Calendar',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.8113,
    lon: -91.4985,
    maxRadiusMiles: 30,
    feedUrl: 'https://www.eauclairewi.gov/government/calendar/-curm-9/-cury-2026',
    format: 'ics',
    timezone: 'America/Chicago',
    defaultCategory: 'other',
    provenance: {
      source: 'City of Eau Claire Government',
      url: 'https://www.eauclairewi.gov/'
    }
  }
];

function getNearbyCommunityFeeds(lat, lon, radiusMiles, distFn) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  return COMMUNITY_FEEDS.filter(feed => {
    const d = distFn(lat, lon, feed.lat, feed.lon);
    if (d == null) return false;
    const searchRadius = Math.max(radiusMiles, feed.maxRadiusMiles);
    return d <= searchRadius;
  });
}

module.exports = {
  COMMUNITY_FEEDS,
  getNearbyCommunityFeeds
};
