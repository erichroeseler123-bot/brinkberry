/**
 * Vertical Ingestion Network Source Registry
 *
 * Manages registered official sources, feed adapters, and lifecycle states.
 * Enforces zero-unconfirmed-seed policy: sources only emit live events if active
 * and backed by verified adapters or authorizations.
 */

const { SOURCE_LIFECYCLE_STATES, COMEDY_ROOM_TYPES, TRACK_SURFACES } = require('./schema');

// Initial pioneer cohort of verified official sources
const PIONEER_SOURCES = [
  // --- MOTORSPORTS VERTICAL ---
  {
    id: 'src_volusia_speedway',
    vertical: 'motorsports',
    facilityId: 'track_volusia_speedway',
    facilityName: 'Volusia Speedway Park',
    city: 'Barberville',
    state: 'FL',
    lat: 29.1868,
    lon: -81.5218,
    timezone: 'America/New_York',
    surface: TRACK_SURFACES.DIRT_OVAL,
    adapter: 'html_schedule',
    scheduleUrl: 'https://volusiaspeedwaypark.com/schedule/',
    canonicalUrl: 'https://volusiaspeedwaypark.com',
    status: SOURCE_LIFECYCLE_STATES.ACTIVE,
    fetchCadenceMinutes: 120,
    credentialsRequired: false
  },
  {
    id: 'src_eldora_speedway',
    vertical: 'motorsports',
    facilityId: 'track_eldora_speedway',
    facilityName: 'Eldora Speedway',
    city: 'Rossburg',
    state: 'OH',
    lat: 40.3175,
    lon: -84.6342,
    timezone: 'America/New_York',
    surface: TRACK_SURFACES.DIRT_OVAL,
    adapter: 'ics',
    scheduleUrl: 'https://eldoraspeedway.com/events.ics',
    canonicalUrl: 'https://eldoraspeedway.com',
    status: SOURCE_LIFECYCLE_STATES.PENDING_VERIFICATION,
    fetchCadenceMinutes: 120,
    credentialsRequired: false
  },
  {
    id: 'src_five_flags_speedway',
    vertical: 'motorsports',
    facilityId: 'track_five_flags_speedway',
    facilityName: 'Five Flags Speedway',
    city: 'Pensacola',
    state: 'FL',
    lat: 30.4797,
    lon: -87.2798,
    timezone: 'America/Chicago',
    surface: TRACK_SURFACES.ASPHALT_OVAL,
    adapter: 'html_schedule',
    scheduleUrl: 'https://5flagsspeedway.com/schedule/',
    canonicalUrl: 'https://5flagsspeedway.com',
    status: SOURCE_LIFECYCLE_STATES.PENDING_VERIFICATION,
    fetchCadenceMinutes: 120,
    credentialsRequired: false
  },
  {
    id: 'src_stafford_speedway',
    vertical: 'motorsports',
    facilityId: 'track_stafford_speedway',
    facilityName: 'Stafford Motor Speedway',
    city: 'Stafford Springs',
    state: 'CT',
    lat: 41.9723,
    lon: -72.3168,
    timezone: 'America/New_York',
    surface: TRACK_SURFACES.ASPHALT_OVAL,
    adapter: 'jsonld',
    scheduleUrl: 'https://staffordmotorspeedway.com/events/',
    canonicalUrl: 'https://staffordmotorspeedway.com',
    status: SOURCE_LIFECYCLE_STATES.PENDING_VERIFICATION,
    fetchCadenceMinutes: 120,
    credentialsRequired: false
  },

  // --- COMEDY VERTICAL ---
  {
    id: 'src_rise_comedy_denver',
    vertical: 'comedy',
    venueId: 'venue_rise_comedy',
    venueName: 'RISE Comedy',
    city: 'Denver',
    state: 'CO',
    lat: 39.7538,
    lon: -104.9942,
    timezone: 'America/Denver',
    roomType: COMEDY_ROOM_TYPES.IMPROV_THEATER,
    adapter: 'eventbrite',
    organizerId: '17188177583',
    canonicalUrl: 'https://risecomedy.com',
    ticketingUrl: 'https://risecomedy.com',
    status: SOURCE_LIFECYCLE_STATES.PENDING_VENUE_AUTHORIZATION,
    fetchCadenceMinutes: 60,
    credentialsRequired: true
  },
  {
    id: 'src_comedy_works_downtown',
    vertical: 'comedy',
    venueId: 'venue_comedy_works_downtown',
    venueName: 'Comedy Works Downtown',
    city: 'Denver',
    state: 'CO',
    lat: 39.7483,
    lon: -104.9972,
    timezone: 'America/Denver',
    roomType: COMEDY_ROOM_TYPES.DEDICATED_CLUB,
    adapter: 'html_schedule',
    scheduleUrl: 'https://comedyworks.com/shows',
    canonicalUrl: 'https://comedyworks.com',
    status: SOURCE_LIFECYCLE_STATES.PENDING_VENUE_AUTHORIZATION,
    fetchCadenceMinutes: 60,
    credentialsRequired: false
  },
  {
    id: 'src_the_stand_nyc',
    vertical: 'comedy',
    venueId: 'venue_the_stand_nyc',
    venueName: 'The Stand NYC',
    city: 'New York',
    state: 'NY',
    lat: 40.7368,
    lon: -73.9882,
    timezone: 'America/New_York',
    roomType: COMEDY_ROOM_TYPES.DEDICATED_CLUB,
    adapter: 'html_schedule',
    scheduleUrl: 'https://thestandnyc.com/shows',
    canonicalUrl: 'https://thestandnyc.com',
    status: SOURCE_LIFECYCLE_STATES.PENDING_VENUE_AUTHORIZATION,
    fetchCadenceMinutes: 60,
    credentialsRequired: false
  }
];

class VerticalSourceRegistry {
  constructor(initialSources = PIONEER_SOURCES) {
    this.sources = new Map(initialSources.map(s => [s.id, { ...s }]));
  }

  getSourceById(sourceId) {
    return this.sources.get(sourceId) || null;
  }

  listSources(options = {}) {
    let list = Array.from(this.sources.values());
    if (options.vertical) {
      list = list.filter(s => s.vertical === options.vertical);
    }
    if (options.status) {
      list = list.filter(s => s.status === options.status);
    }
    return list;
  }

  getActiveSources(vertical = null) {
    return this.listSources({ vertical, status: SOURCE_LIFECYCLE_STATES.ACTIVE });
  }

  registerSource(sourceConfig) {
    if (!sourceConfig.id || !sourceConfig.vertical || !sourceConfig.adapter) {
      throw new Error('Invalid source configuration: id, vertical, and adapter are required');
    }
    const record = {
      ...sourceConfig,
      status: sourceConfig.status || SOURCE_LIFECYCLE_STATES.PENDING_VERIFICATION,
      registeredAt: new Date().toISOString()
    };
    this.sources.set(sourceConfig.id, record);
    return record;
  }

  updateSourceStatus(sourceId, newStatus, reason = '') {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }
    source.status = newStatus;
    source.statusReason = reason;
    source.updatedAt = new Date().toISOString();
    return source;
  }
}

const defaultSourceRegistry = new VerticalSourceRegistry();

module.exports = {
  PIONEER_SOURCES,
  VerticalSourceRegistry,
  defaultSourceRegistry
};
