/**
 * Lightweight Privacy-First Telemetry & Analytics Engine
 *
 * Tracks city search intent, comedy filtering usage, ticket conversion clicks,
 * provider reliability, and empty search gaps with zero PII retention.
 */

// Ring buffer of recent operational telemetry events
const MAX_EVENTS = 200;
const eventLog = [];

const aggregates = {
  citySearches: {},
  filterUsage: {},
  ticketClicks: 0,
  emptySearches: {},
  eventViews: 0,
  submissions: { started: 0, completed: 0, edited: 0, duplicates: 0 },
  providerHealth: {}
};

function recordEvent(type, data = {}) {
  const item = {
    type,
    data,
    timestamp: new Date().toISOString()
  };

  eventLog.push(item);
  if (eventLog.length > MAX_EVENTS) {
    eventLog.shift();
  }
}

function trackCitySearch(city, lat, lon, resultsCount = 0) {
  const cleanCity = String(city || 'unknown').trim().toLowerCase();
  aggregates.citySearches[cleanCity] = (aggregates.citySearches[cleanCity] || 0) + 1;

  if (resultsCount === 0) {
    aggregates.emptySearches[cleanCity] = (aggregates.emptySearches[cleanCity] || 0) + 1;
    pilotMetrics.emptySearches.total += 1;
    pilotMetrics.emptySearches.queries.push({
      query: city,
      cleanCity,
      lat,
      lon,
      at: new Date().toISOString()
    });
    if (pilotMetrics.emptySearches.queries.length > 50) {
      pilotMetrics.emptySearches.queries.shift();
    }
    recordEvent('empty_search', { city: cleanCity, lat, lon });
  } else {
    recordEvent('city_search', { city: cleanCity, lat, lon, resultsCount });
  }
}

function trackFilterChange(filterType, filterValue) {
  const key = `${filterType}:${filterValue}`;
  aggregates.filterUsage[key] = (aggregates.filterUsage[key] || 0) + 1;
  recordEvent('filter_change', { filterType, filterValue });
}

function trackEventView(eventId, surface = 'event_page') {
  aggregates.eventViews += 1;
  recordEvent('event_view', { eventId, surface });
}

function trackTicketClick(url, eventId, surface = 'feed') {
  aggregates.ticketClicks += 1;
  recordEvent('ticket_click', { url, eventId, surface });
}

function trackSubmission(action, id, status) {
  if (aggregates.submissions[action] !== undefined) {
    aggregates.submissions[action] += 1;
  }
  recordEvent('submission', { action, id, status });
}

function trackProviderHealth(providerName, success, latencyMs = 0) {
  const p = aggregates.providerHealth[providerName] || { calls: 0, successes: 0, failures: 0, avgLatencyMs: 0 };
  p.calls += 1;
  if (success) {
    p.successes += 1;
  } else {
    p.failures += 1;
  }
  p.avgLatencyMs = Math.round((p.avgLatencyMs * (p.calls - 1) + latencyMs) / p.calls);
  aggregates.providerHealth[providerName] = p;
  recordEvent('provider_health', { providerName, success, latencyMs });
}

function getTelemetrySummary() {
  return {
    aggregates,
    recentEvents: eventLog.slice(-20)
  };
}

const pilotMetrics = {
  guideViews: { denverComedy: 0, denverOpenMics: 0, total: 0 },
  venueViews: {},
  ticketClicks: { total: 0, byVenue: {} },
  demandSignals: { total: 0, byComic: {}, byCity: {} },
  socialCardVisits: { total: 0, html: 0, story: 0, svg: 0, byCard: {} },
  claimRequests: { total: 0, byVenue: {} },
  submissionsAndCorrections: { submissions: 0, corrections: 0, total: 0 },
  emptySearches: { total: 0, queries: [] }
};

function trackGuideView(market = 'denver', category = 'comedy') {
  pilotMetrics.guideViews.total += 1;
  if (category === 'open-mics') {
    pilotMetrics.guideViews.denverOpenMics += 1;
  } else {
    pilotMetrics.guideViews.denverComedy += 1;
  }
  recordEvent('guide_view', { market, category });
}

function trackVenueView(venueSlug) {
  if (!venueSlug) return;
  const slug = String(venueSlug).toLowerCase().trim();
  pilotMetrics.venueViews[slug] = (pilotMetrics.venueViews[slug] || 0) + 1;
  recordEvent('venue_view', { venueSlug: slug });
}

function trackPilotTicketClick(venueSlug, eventId) {
  pilotMetrics.ticketClicks.total += 1;
  if (venueSlug) {
    const slug = String(venueSlug).toLowerCase().trim();
    pilotMetrics.ticketClicks.byVenue[slug] = (pilotMetrics.ticketClicks.byVenue[slug] || 0) + 1;
  }
  recordEvent('pilot_ticket_click', { venueSlug, eventId });
}

function trackPilotDemand(comicSlug, city) {
  pilotMetrics.demandSignals.total += 1;
  if (comicSlug) {
    pilotMetrics.demandSignals.byComic[comicSlug] = (pilotMetrics.demandSignals.byComic[comicSlug] || 0) + 1;
  }
  if (city) {
    pilotMetrics.demandSignals.byCity[city] = (pilotMetrics.demandSignals.byCity[city] || 0) + 1;
  }
  recordEvent('pilot_demand_signal', { comicSlug, city });
}

function trackSocialCardVisit(cardId, format = 'html') {
  pilotMetrics.socialCardVisits.total += 1;
  if (format === 'story') {
    pilotMetrics.socialCardVisits.story += 1;
  } else if (format === 'svg') {
    pilotMetrics.socialCardVisits.svg += 1;
  } else {
    pilotMetrics.socialCardVisits.html += 1;
  }
  if (cardId) {
    pilotMetrics.socialCardVisits.byCard[cardId] = (pilotMetrics.socialCardVisits.byCard[cardId] || 0) + 1;
  }
  recordEvent('social_card_visit', { cardId, format });
}

function trackClaimRequest(venueSlug) {
  pilotMetrics.claimRequests.total += 1;
  if (venueSlug) {
    const slug = String(venueSlug).toLowerCase().trim();
    pilotMetrics.claimRequests.byVenue[slug] = (pilotMetrics.claimRequests.byVenue[slug] || 0) + 1;
  }
  recordEvent('claim_request', { venueSlug });
}

function trackCommunityCorrection(type = 'submission', id = null) {
  pilotMetrics.submissionsAndCorrections.total += 1;
  if (type === 'correction') {
    pilotMetrics.submissionsAndCorrections.corrections += 1;
  } else {
    pilotMetrics.submissionsAndCorrections.submissions += 1;
  }
  recordEvent('community_correction', { type, id });
}

function getPilotMetricsSummary(market = 'denver') {
  return {
    market,
    generatedAt: new Date().toISOString(),
    metrics: {
      guideViews: pilotMetrics.guideViews,
      venueViews: pilotMetrics.venueViews,
      officialTicketClicks: pilotMetrics.ticketClicks,
      fanDemandSignals: pilotMetrics.demandSignals,
      socialCardVisits: pilotMetrics.socialCardVisits,
      claimRequests: pilotMetrics.claimRequests,
      submissionsAndCorrections: pilotMetrics.submissionsAndCorrections,
      emptySearches: {
        total: pilotMetrics.emptySearches.total,
        denverCount: aggregates.emptySearches['denver'] || 0
      }
    }
  };
}

const racingPilotMetrics = {
  guideViews: { coloradoRacing: 0, dirtOvals: 0, asphaltOvals: 0, dragStrips: 0, total: 0 },
  trackViews: {},
  ticketClicks: { total: 0, byTrack: {} },
  demandSignals: { total: 0, byEntity: {}, byTrack: {} },
  socialCardVisits: { total: 0, html: 0, story: 0, svg: 0, byRace: {} },
  claimRequests: { total: 0, byTrack: {} },
  submissionsAndCorrections: { total: 0, rainouts: 0, scheduleUpdates: 0 },
  emptySearches: { total: 0, queries: [] }
};

function trackRacingGuideView(market = 'colorado', discipline = 'all') {
  racingPilotMetrics.guideViews.total += 1;
  if (discipline === 'dirt') {
    racingPilotMetrics.guideViews.dirtOvals += 1;
  } else if (discipline === 'asphalt') {
    racingPilotMetrics.guideViews.asphaltOvals += 1;
  } else if (discipline === 'drag') {
    racingPilotMetrics.guideViews.dragStrips += 1;
  } else {
    racingPilotMetrics.guideViews.coloradoRacing += 1;
  }
  recordEvent('racing_guide_view', { market, discipline });
}

function trackTrackView(trackSlug) {
  if (!trackSlug) return;
  const slug = String(trackSlug).toLowerCase().trim();
  racingPilotMetrics.trackViews[slug] = (racingPilotMetrics.trackViews[slug] || 0) + 1;
  recordEvent('track_view', { trackSlug: slug });
}

function trackRacingTicketClick(trackSlug, raceId) {
  racingPilotMetrics.ticketClicks.total += 1;
  if (trackSlug) {
    const slug = String(trackSlug).toLowerCase().trim();
    racingPilotMetrics.ticketClicks.byTrack[slug] = (racingPilotMetrics.ticketClicks.byTrack[slug] || 0) + 1;
  }
  recordEvent('racing_ticket_click', { trackSlug, raceId });
}

function trackRacingDemand(entitySlug, entityType = 'series', trackSlug = null) {
  racingPilotMetrics.demandSignals.total += 1;
  if (entitySlug) {
    racingPilotMetrics.demandSignals.byEntity[entitySlug] = (racingPilotMetrics.demandSignals.byEntity[entitySlug] || 0) + 1;
  }
  if (trackSlug) {
    racingPilotMetrics.demandSignals.byTrack[trackSlug] = (racingPilotMetrics.demandSignals.byTrack[trackSlug] || 0) + 1;
  }
  recordEvent('racing_demand_signal', { entitySlug, entityType, trackSlug });
}

function trackRacingCardVisit(raceId, format = 'html') {
  racingPilotMetrics.socialCardVisits.total += 1;
  if (format === 'story') {
    racingPilotMetrics.socialCardVisits.story += 1;
  } else if (format === 'svg') {
    racingPilotMetrics.socialCardVisits.svg += 1;
  } else {
    racingPilotMetrics.socialCardVisits.html += 1;
  }
  if (raceId) {
    racingPilotMetrics.socialCardVisits.byRace[raceId] = (racingPilotMetrics.socialCardVisits.byRace[raceId] || 0) + 1;
  }
  recordEvent('racing_card_visit', { raceId, format });
}

function trackTrackClaimRequest(trackSlug) {
  racingPilotMetrics.claimRequests.total += 1;
  if (trackSlug) {
    const slug = String(trackSlug).toLowerCase().trim();
    racingPilotMetrics.claimRequests.byTrack[slug] = (racingPilotMetrics.claimRequests.byTrack[slug] || 0) + 1;
  }
  recordEvent('track_claim_request', { trackSlug });
}

function getRacingPilotMetricsSummary(market = 'colorado') {
  return {
    market,
    generatedAt: new Date().toISOString(),
    metrics: {
      guideViews: racingPilotMetrics.guideViews,
      trackViews: racingPilotMetrics.trackViews,
      officialTicketClicks: racingPilotMetrics.ticketClicks,
      fanDemandSignals: racingPilotMetrics.demandSignals,
      socialCardVisits: racingPilotMetrics.socialCardVisits,
      claimRequests: racingPilotMetrics.claimRequests,
      submissionsAndCorrections: racingPilotMetrics.submissionsAndCorrections,
      emptySearches: racingPilotMetrics.emptySearches
    }
  };
}

function resetTelemetry() {
  eventLog.length = 0;
  aggregates.citySearches = {};
  aggregates.filterUsage = {};
  aggregates.ticketClicks = 0;
  aggregates.emptySearches = {};
  aggregates.eventViews = 0;
  aggregates.submissions = { started: 0, completed: 0, edited: 0, duplicates: 0 };
  aggregates.providerHealth = {};
  pilotMetrics.guideViews = { denverComedy: 0, denverOpenMics: 0, total: 0 };
  pilotMetrics.venueViews = {};
  pilotMetrics.ticketClicks = { total: 0, byVenue: {} };
  pilotMetrics.demandSignals = { total: 0, byComic: {}, byCity: {} };
  pilotMetrics.socialCardVisits = { total: 0, html: 0, story: 0, svg: 0, byCard: {} };
  pilotMetrics.claimRequests = { total: 0, byVenue: {} };
  pilotMetrics.submissionsAndCorrections = { submissions: 0, corrections: 0, total: 0 };
  pilotMetrics.emptySearches = { total: 0, queries: [] };

  racingPilotMetrics.guideViews = { coloradoRacing: 0, dirtOvals: 0, asphaltOvals: 0, dragStrips: 0, total: 0 };
  racingPilotMetrics.trackViews = {};
  racingPilotMetrics.ticketClicks = { total: 0, byTrack: {} };
  racingPilotMetrics.demandSignals = { total: 0, byEntity: {}, byTrack: {} };
  racingPilotMetrics.socialCardVisits = { total: 0, html: 0, story: 0, svg: 0, byRace: {} };
  racingPilotMetrics.claimRequests = { total: 0, byTrack: {} };
  racingPilotMetrics.submissionsAndCorrections = { total: 0, rainouts: 0, scheduleUpdates: 0 };
  racingPilotMetrics.emptySearches = { total: 0, queries: [] };
}

module.exports = {
  trackCitySearch,
  trackFilterChange,
  trackEventView,
  trackTicketClick,
  trackSubmission,
  trackProviderHealth,
  trackGuideView,
  trackVenueView,
  trackPilotTicketClick,
  trackPilotDemand,
  trackSocialCardVisit,
  trackClaimRequest,
  trackCommunityCorrection,
  getPilotMetricsSummary,
  trackRacingGuideView,
  trackTrackView,
  trackRacingTicketClick,
  trackRacingDemand,
  trackRacingCardVisit,
  trackTrackClaimRequest,
  getRacingPilotMetricsSummary,
  getTelemetrySummary,
  resetTelemetry
};
