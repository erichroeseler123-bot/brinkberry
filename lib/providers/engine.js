/**
 * Hybrid Dynamic Event Engine
 *
 * Coordinates curated Supabase database records, live nationwide provider adapters
 * (SeatGeek, Ticketmaster), and official community iCalendar/RSS feeds into a single,
 * deduplicated, ranked feed strictly clamped to the rolling 48-hour window.
 */

const { buildSafeAffiliateUrl } = require('../affiliate');
const { deduplicateEvents } = require('./deduplicator');
const { mergeEvents, computeEventFingerprint } = require('../identity');
const { evaluateEventFreshness } = require('../freshness');
const { resolveSourceQualityLabel } = require('./normalizer');
const { defaultGeoCache } = require('./geo-cache');
const { defaultQuotaTracker } = require('./quota-tracker');
const { fetchTicketmasterEvents } = require('./ticketmaster');
const { fetchSeatGeekEvents } = require('./seatgeek');
const { fetchParisOpenDataEvents } = require('./paris-opendata');
const { getNearbyCommunityFeeds } = require('./community-registry');
const { fetchCommunityFeedEvents } = require('./community-ics');
const { formatLocalTimeCue } = require('../timezone');
const { getNearbyVerifiedComedyShows } = require('../comedy/registry');
const { getNearbyVerifiedRaces } = require('../racing/registry');
const { getIngestedOfficialEvents } = require('../ingestion/engine');
const { defaultCanonicalStorage } = require('../storage/canonical-event-storage');

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

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

function scoreEvent(e, mode) {
  const mins = Math.max(0, (new Date(e.start_time) - Date.now()) / 60000);
  const d = Number(e.distance_miles);
  let s = 0;

  // 1. Proximity in time
  s += mins <= 60 ? 30 : mins <= 180 ? 24 : mins <= 360 ? 16 : 8;

  // 2. Spatial distance
  s += Number.isFinite(d) ? Math.max(0, 25 - (d * 2)) : 0;

  // 3. Price & community accessibility
  if (e.price_status === 'free') s += 15;
  else if (e.price_status === 'cheap') s += 12;
  else if (e.price_min != null && e.price_min <= 30) s += 8;
  else s += 3;

  // 4. Verification freshness
  if (e.freshness?.status === 'verified_current') s += 10;
  else if (e.freshness?.status === 'aging') s += 5;

  // 5. Source quality bonus
  if (e.confirmationStatus === 'official_government_calendar' || e.confirmationStatus === 'confirmed_by_official_calendar' || e.confirmationStatus === 'confirmed_by_dual_official_sources') {
    s += 12;
  } else if (e.confirmationStatus === 'public_community_listing' || e.confirmationStatus === 'verified_community') {
    s += 8;
  }

  // 6. Rarity, Limited Duration, & Easy-to-Miss (The "McRib" / Local Memory Pattern)
  const isOneTimeOrRare = Boolean(!e.comedy?.recurring && !e.recurring && (e.isLimitedRun || /special|tour|one-night|annual|championship|tournament|forum|hearing|walkthrough/i.test(e.title || '')));
  if (isOneTimeOrRare) s += 14;

  // Seasonal & Limited (festivals, fairs, holiday markets, renaissance fairs)
  const isSeasonal = Boolean(e.isSeasonal || e.category === 'festival' || /festival|fair|renaissance|holiday market|celebration|expo/i.test(e.title || ''));
  if (isSeasonal) s += 12;

  // Ending Soon
  if (e.end_time) {
    const endMs = new Date(e.end_time).getTime();
    const remainingMs = endMs - Date.now();
    if (remainingMs > 0 && remainingMs <= 24 * 3600e3) s += 10;
  }

  // 7. Category & Mode relevance
  if (mode === 'cheap' && ['free', 'cheap'].includes(e.price_status)) s += 15;
  if (mode === 'outside' && ['outdoor', 'mixed'].includes(e.indoor_outdoor)) s += 15;
  if (mode === 'kids' && (e.category_tags || []).some(x => ['kids', 'family'].includes(x))) s += 15;
  if (mode === 'date' && (e.category_tags || []).some(x => ['music', 'arts', 'food', 'comedy'].includes(x))) s += 12;
  if (mode === 'comedy' && (e.category_tags || []).includes('comedy')) s += 35;
  if (mode === 'civic' && (e.category_tags || []).includes('civic')) s += 35;
  if (mode === 'community' && (e.category_tags || []).includes('community')) s += 25;
  if (mode === 'easy-to-miss' && (isOneTimeOrRare || e.category === 'civic')) s += 30;
  if (mode === 'seasonal' && isSeasonal) s += 30;
  return s;
}

function diversifyFeed(rows) {
  const out = [];
  const counts = {};
  for (const e of rows) {
    const c = e.category_tags?.[0] || 'other';
    const pen = (counts[c] || 0) * 8;
    e._rank = e._score - pen;
    let i = out.findIndex(x => x._rank < e._rank);
    if (i < 0) out.push(e);
    else out.splice(i, 0, e);
    counts[c] = (counts[c] || 0) + 1;
  }
  return out;
}

function timeCue(start, window, mins, timeZone) {
  if (mins >= 0 && mins <= 240) {
    return mins < 60 ? `Starts in ${mins} min` : `Starts in ${Math.round(mins / 60)} hr`;
  }
  const opts = { hour: 'numeric', minute: '2-digit' };
  if (timeZone) opts.timeZone = timeZone;
  const t = new Date(start).toLocaleTimeString('en-US', opts);
  if (window === 'tonight') return `Tonight at ${t}`;
  if (window === 'tomorrow') return `Tomorrow at ${t}`;
  if (window === 'weekend' || window === '48h' || window === 'next-48h') {
    const dayOpts = { weekday: 'short' };
    if (timeZone) dayOpts.timeZone = timeZone;
    return `Next 48h · ${new Date(start).toLocaleDateString('en-US', dayOpts)} ${t}`;
  }
  return t;
}

async function executeHybridFeed(options = {}) {
  const {
    lat,
    lon,
    radiusMiles = 25,
    window = 'tonight',
    windowStart,
    windowEnd,
    timeZone = 'UTC',
    mode = '',
    category = '',
    showType = '',
    ageLimit = '',
    priceFilter = '',
    startingSoon = false,
    recurring = false,
    clean = false,
    curatedEvents = [],
    enableDynamic = true,
    cache = defaultGeoCache,
    quotaTracker = defaultQuotaTracker,
    fetchFn = fetch,
    useTestMock = false
  } = options;

  const startTime = Date.now();
  let dynamicMs = 0;
  let dynamicRawCount = 0;
  let communityCount = 0;
  let commercialCount = 0;
  let internationalCount = 0;
  const providerResults = [];
  const providersStatus = {};

  if (enableDynamic && Number.isFinite(lat) && Number.isFinite(lon)) {
    const dynamicStart = Date.now();

    // 1. Identify any registered community feeds in the query radius
    const nearbyCommunityFeeds = getNearbyCommunityFeeds(lat, lon, radiusMiles, distMiles);

    const providerPromises = [
      fetchTicketmasterEvents({
        lat,
        lon,
        radiusMiles: (category === 'racing' || mode === 'racing') ? Math.max(radiusMiles, 75) : radiusMiles,
        windowStart,
        windowEnd,
        mode,
        cache,
        quotaTracker,
        fetchFn,
        useTestMock
      }),
      fetchSeatGeekEvents({
        lat,
        lon,
        radiusMiles: (category === 'racing' || mode === 'racing') ? Math.max(radiusMiles, 75) : radiusMiles,
        windowStart,
        windowEnd,
        mode,
        category,
        cache,
        quotaTracker,
        fetchFn,
        useTestMock
      }),
      fetchParisOpenDataEvents({
        lat,
        lon,
        radiusMiles,
        windowStart,
        windowEnd,
        mode,
        cache,
        quotaTracker,
        fetchFn
      }),
      ...nearbyCommunityFeeds.map(f => fetchCommunityFeedEvents(f, { windowStart, windowEnd, cache, fetchFn }))
    ];

    const settled = await Promise.allSettled(providerPromises);
    dynamicMs = Date.now() - dynamicStart;

    const tmResult = settled[0]?.status === 'fulfilled' ? settled[0].value : { status: 'error', configured: false, count: 0, reason: 'Failed to execute' };
    const sgResult = settled[1]?.status === 'fulfilled' ? settled[1].value : { status: 'error', configured: false, count: 0, reason: 'Failed to execute' };
    const podResult = settled[2]?.status === 'fulfilled' ? settled[2].value : { status: 'none_in_radius', configured: true, count: 0, reason: 'Failed to execute' };

    providersStatus.ticketmaster = {
      status: tmResult.status,
      configured: tmResult.configured,
      count: tmResult.count,
      latencyMs: tmResult.latencyMs,
      reason: tmResult.reason
    };

    providersStatus.seatgeek = {
      status: sgResult.status,
      configured: sgResult.configured,
      count: sgResult.count,
      latencyMs: sgResult.latencyMs,
      reason: sgResult.reason
    };

    providersStatus.paris_opendata = {
      status: podResult.status,
      configured: podResult.configured,
      count: podResult.count,
      latencyMs: podResult.latencyMs,
      reason: podResult.reason
    };

    if (Array.isArray(tmResult.events)) {
      providerResults.push(...tmResult.events);
      commercialCount += tmResult.events.length;
    }
    if (Array.isArray(sgResult.events)) {
      providerResults.push(...sgResult.events);
      commercialCount += sgResult.events.length;
    }
    if (Array.isArray(podResult.events) && podResult.events.length > 0) {
      providerResults.push(...podResult.events);
      internationalCount += podResult.events.length;
    }

    // Process community feed results
    const communityFeedResults = [];
    for (let i = 3; i < settled.length; i++) {
      if (settled[i].status === 'fulfilled') {
        const commRes = settled[i].value;
        communityFeedResults.push({
          id: commRes.feedId,
          name: commRes.name,
          status: commRes.status,
          count: commRes.count,
          latencyMs: commRes.latencyMs
        });
        if (Array.isArray(commRes.events)) {
          providerResults.push(...commRes.events);
          communityCount += commRes.events.length;
        }
      }
    }

    providersStatus.community = {
      status: nearbyCommunityFeeds.length > 0 ? 'active' : 'none_in_radius',
      active: nearbyCommunityFeeds.length > 0,
      feedsConfigured: nearbyCommunityFeeds.length,
      count: communityCount,
      feeds: communityFeedResults
    };

    // 4. Ingest registered official venue calendars (Rise Comedy, Volusia Speedway, The Stand NYC)
    try {
      const ingestRadius = (category === 'racing' || mode === 'racing') ? Math.max(radiusMiles, 75) : radiusMiles;
      const ingestCat = (category === 'racing' || mode === 'racing') ? 'racing' : ((category === 'comedy' || mode === 'comedy') ? 'comedy' : null);
      const ingested = await getIngestedOfficialEvents(lat, lon, ingestRadius, ingestCat, { fetchFn, bypassCache: false });
      if (Array.isArray(ingested.events) && ingested.events.length > 0) {
        providerResults.push(...ingested.events);
      }
      const hasSources = (ingested.sourceReports?.length || 0) > 0;
      providersStatus.official_ingestion = {
        status: hasSources ? 'active' : 'none_in_radius',
        active: hasSources,
        count: ingested.events?.length || 0,
        sourcesReported: ingested.sourceReports?.length || 0
      };
    } catch (err) {
      providersStatus.official_ingestion = {
        status: 'error',
        count: 0,
        reason: err.message
      };
    }

    dynamicRawCount = commercialCount + internationalCount + communityCount + (providersStatus.official_ingestion?.count || 0);
  }

  // Verified local registries (in-memory verified clubs and tracks, queried when location is valid)
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const shouldIncludeComedy = category === 'comedy' || mode === 'comedy' || (enableDynamic && (!category || category === 'all') && fetchFn === fetch);
    if (shouldIncludeComedy) {
      const comedyShows = getNearbyVerifiedComedyShows(lat, lon, radiusMiles, windowStart, windowEnd);
      if (comedyShows.length > 0) {
        providerResults.push(...comedyShows);
        communityCount += comedyShows.length;
      }
    }

    const shouldIncludeRacing = category === 'racing' || mode === 'racing' || category === 'sports' || mode === 'sports' || (enableDynamic && (!category || category === 'all') && fetchFn === fetch);
    if (shouldIncludeRacing) {
      const races = getNearbyVerifiedRaces(lat, lon, Math.max(radiusMiles, 75), windowStart, windowEnd);
      if (races.length > 0) {
        providerResults.push(...races);
        communityCount += races.length;
      }
    }
  }

  // 1. Deterministically merge and deduplicate events across curated and dynamic providers
  const combined = mergeEvents([...curatedEvents, ...providerResults]);

  // 2. Strict 48-hour rolling boundary filter for radar windows, or windowEnd for multi-day planning windows
  const nowMs = Date.now();
  const isMultiDay = ['this_weekend', 'this-weekend', 'next_weekend', 'next-weekend', '30d', 'season', 'all', '365d', 'any'].includes(window);
  const maxAllowedMs = isMultiDay && windowEnd ? new Date(windowEnd).getTime() : (nowMs + 48 * 3600e3);

  const filtered = combined.filter(e => {
    // 1. Seeds without dates or venue presence records are never dated events
    if (!e.start_time && !e.start) return false;
    if (e.confirmationStatus === 'venue_presence_only' || e.confirmationStatus === 'unconfirmed_seed' || e.sourceType === 'venue_presence') {
      return false;
    }

    // 2. Strict freshness and confirmation tier evaluation
    const freshness = evaluateEventFreshness(e);
    e.freshness = freshness;
    if (freshness.status === 'cancelled' || e.isCancelled) return false;
    if (!freshness.isDisplayable) return false;
    if (freshness.status === 'stale') {
      e.isStale = true;
    }

    const t = new Date(e.start_time || e.start).getTime();
    if (isNaN(t) || t < nowMs - 60000 || t > maxAllowedMs) return false;

    // Filter by category
    if (category && category !== 'all' && e.category !== category && !(e.category_tags || []).includes(category)) {
      return false;
    }

    // Filter by mode if applicable
    if (mode === 'comedy' && e.category !== 'comedy' && !(e.category_tags || []).includes('comedy')) {
      return false;
    }
    if (mode === 'civic' && e.category !== 'civic' && !(e.category_tags || []).includes('civic')) {
      return false;
    }
    if (mode === 'community' && e.category !== 'community' && !(e.category_tags || []).includes('community')) {
      return false;
    }
    if (mode === 'free' && e.price_status !== 'free' && e.price_min !== 0) {
      return false;
    }
    if (mode === 'cheap' && !['free', 'cheap'].includes(e.price_status) && (e.price_min == null || e.price_min > 20)) {
      return false;
    }
    if (mode === 'outside' && !['outdoor', 'mixed'].includes(e.indoor_outdoor)) {
      return false;
    }
    if (mode === 'kids' && !(e.category_tags || []).some(x => ['kids', 'family'].includes(x))) {
      return false;
    }
    if (mode === 'date' && !(e.category_tags || []).some(x => ['music', 'arts', 'food', 'comedy'].includes(x))) {
      return false;
    }

    // Comedy specific sub-filters
    if (showType && showType !== 'all') {
      if (e.comedy?.showType !== showType) return false;
    }

    if (ageLimit && ageLimit !== 'all') {
      if (ageLimit === '21+' && e.comedy?.ageLimit !== '21+') return false;
      if (ageLimit === '18+' && !['18+', '21+'].includes(e.comedy?.ageLimit)) return false;
      if (ageLimit === 'all_ages' && e.comedy?.ageLimit !== 'all_ages') return false;
    }

    if (priceFilter && priceFilter !== 'all') {
      if (priceFilter === 'free' && e.price_status !== 'free') return false;
      if (priceFilter === 'under_15' && (e.price_min == null || e.price_min > 15) && e.price_status !== 'free') return false;
      if (priceFilter === 'under_25' && (e.price_min == null || e.price_min > 25) && e.price_status !== 'free') return false;
    }

    if (startingSoon) {
      const diffMins = (t - nowMs) / 60000;
      if (diffMins < 0 || diffMins > 240) return false; // within next 4 hours
    }

    if (recurring) {
      if (!e.comedy?.recurring) return false;
    }

    if (clean) {
      if (e.comedy?.ageLimit !== 'all_ages' && !(e.category_tags || []).some(x => ['kids', 'family', 'clean'].includes(x))) {
        return false;
      }
    }

    return true;
  });

  // 3. Compute distance for all events
  const withDistance = filtered.map(e => {
    let d = e.distance_miles != null ? Number(e.distance_miles) : null;
    if (d == null && Number.isFinite(lat) && Number.isFinite(lon)) {
      const eLat = Number(e.venue_latitude || e.lat);
      const eLon = Number(e.venue_longitude || e.lon);
      d = distMiles(lat, lon, eLat, eLon);
    }
    return {
      ...e,
      distance_miles: d != null ? Number(d.toFixed(1)) : null,
      distanceMiles: d != null ? Number(d.toFixed(1)) : null
    };
  });

  // 4. Distance filter (expanded for racing because tracks are located in exurbs)
  const effectiveMaxRadius = (category === 'racing' || mode === 'racing') ? Math.max(radiusMiles, 75) : radiusMiles;
  const withinRadius = withDistance.filter(e => {
    if (e.distance_miles != null && e.distance_miles > effectiveMaxRadius) return false;
    return true;
  });

  // 5. Score and rank
  const scored = withinRadius
    .map(e => ({ ...e, _score: scoreEvent(e, mode) }))
    .sort((a, b) => b._score - a._score || new Date(a.start_time) - new Date(b.start_time));

  const ranked = diversifyFeed(scored);

  // 6. Shape output into canonical feed objects
  const finalEvents = ranked.map(e => {
    const d = e.distance_miles != null ? Number(e.distance_miles) : null;
    const mins = Math.round((new Date(e.start_time) - Date.now()) / 60000);
    const why = [formatLocalTimeCue(e.start_time, window, timeZone, mins)];

    if (e.price_status === 'free') why.push('Free');
    else if (e.price_status === 'cheap' || (e.price_min != null && e.price_min <= 20)) {
      why.push(e.price_min != null ? `From $${e.price_min}` : 'Cheap');
    }
    if (d != null) why.push(`${d.toFixed(1)} mi`);
    if (why.length < 3 && e.indoor_outdoor === 'outdoor') why.push('Outside');

    const candidateUrl = e.canonical_url || e.ticket_url || e.ticketUrl;
    const safeTicketUrl = buildSafeAffiliateUrl(e.source || 'custom', candidateUrl, e.id);

    // Objective Source-Quality Label & Ticket requirement resolution
    const sourceQualityLabel = e.sourceQualityLabel || resolveSourceQualityLabel(e);
    const isFreeOrCivic = e.price_status === 'free' || e.priceDisplay === 'Free' || e.category === 'civic' || (e.category_tags || []).includes('civic');
    const isTicketPlatform = ['seatgeek', 'ticketmaster', 'etix', 'eventbrite', 'ticketweb', 'seatengine'].includes(e.source) ||
      Boolean(e.ticketUrl && !e.ticketUrl.includes('/event/') && !isFreeOrCivic);
    const hasTicket = Boolean(isTicketPlatform && !isFreeOrCivic);
    const detailsUrl = e.official_source_url || e.officialSourceUrl || e.canonical_url || candidateUrl || `${ORIGIN}/event/${e.id}`;

    // Rarity, Limited-Run, and Scarcity Metrics (The McRib / Local Memory Engine)
    const isLimitedRun = Boolean(e.isLimitedRun || (!e.comedy?.recurring && !e.recurring && (e.category === 'civic' || /special|tour|one-night|annual|championship|tournament|forum|hearing|walkthrough/i.test(e.title || ''))));
    const isSeasonal = Boolean(e.isSeasonal || e.category === 'festival' || /festival|fair|renaissance|holiday market|celebration|expo/i.test(e.title || ''));
    const isRareReturn = Boolean(e.isRareReturn || /annual|championship|renaissance|festival|fair|tour/i.test(e.title || ''));
    const isEasyToMiss = Boolean(isLimitedRun || e.category === 'civic' || /rare|walkthrough|one-off|forum|hearing|tournament|special/i.test(e.title || ''));
    const isEndingSoon = Boolean(e.end_time && (new Date(e.end_time).getTime() - Date.now()) <= 24 * 3600e3 && (new Date(e.end_time).getTime() - Date.now()) > 0);

    return {
      id: e.id,
      title: e.title,
      start: e.start_time,
      end: e.end_time,
      start_time: e.start_time,
      end_time: e.end_time,
      venue: e.venue_name || e.venue,
      venue_name: e.venue_name || e.venue,
      city: e.city,
      neighborhood: e.neighborhood || null,
      category: e.category_tags?.[0] || 'other',
      categories: e.category_tags || [],
      vibeLabels: e.vibe_labels || [],
      ageRestriction: e.age_restriction || null,
      indoorOutdoor: e.indoor_outdoor || 'unknown',
      priceStatus: e.price_status,
      priceLow: e.price_min,
      priceHigh: e.price_max,
      priceDisplay: e.price_status === 'free' ? 'Free' : (e.price_display || 'Details →'),
      desc: e.description || '',
      hasTicket,
      sourceQualityLabel,
      detailsUrl,
      ticketUrl: safeTicketUrl || candidateUrl || `${ORIGIN}/event/${e.id}`,
      image: e.canonical_image_url || e.image || null,
      distance_miles: d,
      distanceMiles: d,
      lat: e.venue_latitude || e.lat,
      lon: e.venue_longitude || e.lon,
      shareUrl: `${ORIGIN}/event/${e.id}`,
      whyThis: why.slice(0, 3),
      onTheBrink: mins >= 0 && mins <= 60,
      routeEligible: mins >= 0 && mins <= 120,
      source: e.source || 'curated',
      sourceCount: Number(e.source_count || e.sourceCount || (e.sources ? e.sources.length : 1)),
      provenance: e.provenance || { source: 'curated' },
      fingerprint: e.fingerprint || null,
      confirmationStatus: e.confirmationStatus || (e.source === 'seatgeek' || e.source === 'ticketmaster' ? 'confirmed_by_aggregator' : (e.sourceType === 'official_box_office' ? 'confirmed_by_official_calendar' : 'unconfirmed_seed')),
      sources: e.sources || [],
      conflicts: e.conflicts || [],
      freshness: e.freshness || null,
      comedy: e.comedy || null,
      racing: e.racing || null,
      isLimitedRun,
      isSeasonal,
      isRareReturn,
      isEasyToMiss,
      isEndingSoon,
      lastVerifiedAt: e.lastVerifiedAt || e.last_verified_at || e.verification?.lastVerifiedAt || (e.comedy?.lastVerifiedAt) || null,
      official_source_url: e.official_source_url || e.officialSourceUrl || e.canonical_url || null,
      officialSourceUrl: e.official_source_url || e.officialSourceUrl || e.canonical_url || null,
      sourceEvidence: e.sourceEvidence || null,
      verification: e.verification || null
    };
  });

  const totalMs = Date.now() - startTime;
  const anyDynamicConfigured = Object.values(providersStatus).some(p => p.configured || p.feedsConfigured > 0);
  const anyDynamicActive = Object.values(providersStatus).some(p => p.status === 'ok' || p.status === 'cached' || p.status === 'active' || p.status === 'mock');

  return {
    events: finalEvents,
    providers: providersStatus,
    hybrid: {
      curatedCount: finalEvents.filter(e => e.source === 'curated').length,
      commercialCount: finalEvents.filter(e => e.source === 'seatgeek' || e.source === 'ticketmaster').length,
      internationalCount: finalEvents.filter(e => e.source === 'paris_opendata').length,
      communityCount: finalEvents.filter(e => e.source?.startsWith('community') || e.category === 'community' || (e.categories || []).includes('community')).length,
      civicCount: finalEvents.filter(e => e.category === 'civic' || (e.categories || []).includes('civic')).length,
      officialCount: finalEvents.filter(e => e.source === 'official_ingestion' || e.source === 'official_box_office' || e.source?.startsWith('community') || e.confirmationStatus?.includes('official')).length,
      comedyCount: finalEvents.filter(e => (e.categories || []).includes('comedy')).length,
      racingCount: finalEvents.filter(e => (e.categories || []).includes('racing') || Boolean(e.racing)).length,
      dynamicCount: finalEvents.filter(e => e.source !== 'curated').length,
      deduplicatedCount: finalEvents.length,
      dynamicConfigured: anyDynamicConfigured,
      dynamicActive: anyDynamicActive
    },
    latency: {
      totalMs,
      dynamicMs
    }
  };
}

module.exports = {
  executeHybridFeed,
  distMiles,
  scoreEvent,
  diversifyFeed
};
