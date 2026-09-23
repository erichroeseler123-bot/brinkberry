/**
 * Brinkberry National Coverage & Verification Auditor
 *
 * Implements granular, honest verification-quality audit across national markets:
 * - Differentiates: 'verified_inventory' | 'partial_verification' | 'stale_or_unlinked' | 'seeded_presence_only' | 'honest_empty_state'
 * - Individual event-level audit: date/time, source URL, last source check, link status, confirmation status, and listing type
 * - Multi-horizon analysis for motorsports & comedy: tonight, this_weekend, next_weekend, 30d, season
 * - Sanitization protection: strips internal diagnostics for unauthenticated public viewers
 */

const { executeHybridFeed, distMiles } = require('../providers/engine');
const { GeoCache } = require('../providers/geo-cache');
const { KNOWN_VENUES } = require('../comedy/registry');
const { KNOWN_TRACKS } = require('../racing/registry');

const AUDIT_MILESTONE = 'Dynamic official-source ingestion pilot deployed; verified inventory expansion in progress.';

const HORIZONS = ['tonight', 'this_weekend', 'next_weekend', '30d', 'season'];

const NATIONAL_AUDIT_GRID = [
  // --- COMEDY MARKETS ---
  {
    city: 'New York City',
    state: 'NY',
    vertical: 'comedy',
    lat: 40.7128,
    lon: -74.0060,
    radiusMiles: 25,
    type: 'tier1_metro'
  },
  {
    city: 'Los Angeles',
    state: 'CA',
    vertical: 'comedy',
    lat: 34.0522,
    lon: -118.2437,
    radiusMiles: 25,
    type: 'tier1_metro'
  },
  {
    city: 'Chicago',
    state: 'IL',
    vertical: 'comedy',
    lat: 41.8781,
    lon: -87.6298,
    radiusMiles: 25,
    type: 'tier1_metro'
  },
  {
    city: 'Austin',
    state: 'TX',
    vertical: 'comedy',
    lat: 30.2672,
    lon: -97.7431,
    radiusMiles: 25,
    type: 'comedy_hub'
  },
  {
    city: 'Denver',
    state: 'CO',
    vertical: 'comedy',
    lat: 39.7392,
    lon: -104.9903,
    radiusMiles: 25,
    type: 'pilot_market'
  },
  {
    city: 'Nashville',
    state: 'TN',
    vertical: 'comedy',
    lat: 36.1627,
    lon: -86.7816,
    radiusMiles: 25,
    type: 'regional_anchor'
  },
  {
    city: 'Minneapolis',
    state: 'MN',
    vertical: 'comedy',
    lat: 44.9778,
    lon: -93.2650,
    radiusMiles: 25,
    type: 'mid_sized_market'
  },
  {
    city: 'Eau Claire',
    state: 'WI',
    vertical: 'comedy',
    lat: 44.8113,
    lon: -91.4985,
    radiusMiles: 25,
    type: 'small_market'
  },
  {
    city: 'Scottsbluff',
    state: 'NE',
    vertical: 'comedy',
    lat: 41.8666,
    lon: -103.6672,
    radiusMiles: 25,
    type: 'rural_gap'
  },

  // --- MOTORSPORTS MARKETS ---
  {
    city: 'Charlotte / Piedmont',
    state: 'NC',
    vertical: 'racing',
    lat: 35.2271,
    lon: -80.8431,
    radiusMiles: 75,
    type: 'short_track_capital'
  },
  {
    city: 'Indianapolis',
    state: 'IN',
    vertical: 'racing',
    lat: 39.7684,
    lon: -86.1581,
    radiusMiles: 75,
    type: 'racing_capital'
  },
  {
    city: 'Knoxville',
    state: 'IA',
    vertical: 'racing',
    lat: 41.3197,
    lon: -93.0998,
    radiusMiles: 50,
    type: 'grassroots_sprint_hub'
  },
  {
    city: 'Central PA (Mechanicsburg)',
    state: 'PA',
    vertical: 'racing',
    lat: 40.2140,
    lon: -77.0090,
    radiusMiles: 60,
    type: 'dirt_oval_hotbed'
  },
  {
    city: 'Oswego',
    state: 'NY',
    vertical: 'racing',
    lat: 43.4553,
    lon: -76.5105,
    radiusMiles: 60,
    type: 'pavement_oval_hub'
  },
  {
    city: 'Dallas-Fort Worth',
    state: 'TX',
    vertical: 'racing',
    lat: 32.7767,
    lon: -96.7970,
    radiusMiles: 75,
    type: 'sunbelt_dirt_drag'
  },
  {
    city: 'Volusia / Daytona',
    state: 'FL',
    vertical: 'racing',
    lat: 29.1764,
    lon: -81.3653,
    radiusMiles: 60,
    type: 'speedweeks_belt'
  },
  {
    city: 'Eau Claire / Menomonie',
    state: 'WI',
    vertical: 'racing',
    lat: 44.8113,
    lon: -91.4985,
    radiusMiles: 60,
    type: 'upper_midwest_dirt'
  },
  {
    city: 'Manhattan Core (NYC)',
    state: 'NY',
    vertical: 'racing',
    lat: 40.7128,
    lon: -74.0060,
    radiusMiles: 25,
    type: 'urban_racing_gap'
  }
];

/**
 * Checks HTTP status of an official URL safely with browser headers and timeout
 */
async function checkOfficialUrl(url, fetchFn = fetch) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { valid: false, status: 0, reason: 'invalid_url' };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    // Perform HEAD request with realistic User-Agent
    const res = await fetchFn(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    // 200-399: completely valid clean link
    if (res.status >= 200 && res.status < 400) {
      return { valid: true, status: res.status, reason: 'ok' };
    }

    // 403 or 429: Cloudflare / bot-challenge - domain exists but link probe was blocked
    // MUST NOT be treated as event content evidence or a clean verified ticket link
    if (res.status === 403 || res.status === 429) {
      return { valid: false, status: res.status, reason: 'link_probe_blocked' };
    }

    // 404 / 500 / 502 / etc.
    return { valid: false, status: res.status, reason: `http_${res.status}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { valid: false, status: 0, reason: 'timeout' };
    }
    return { valid: false, status: 0, reason: 'network_error' };
  }
}

/**
 * Probes a single market for vertical coverage, freshness, link integrity, and horizons
 */
async function auditMarket(probe, options = {}) {
  const {
    baseUrl = null,
    fetchFn = fetch,
    checkLinks = true,
    window = '48h'
  } = options;

  const { city, state, vertical, lat, lon, radiusMiles = 25, type } = probe;
  const auditStart = Date.now();

  let rawEvents = [];
  let providerTelemetry = {};

  if (baseUrl) {
    // Remote live probe against a running server / production URL
    const url = `${baseUrl}/api/feed?lat=${lat}&lng=${lon}&category=${vertical}&radius=${radiusMiles}&window=${window}`;
    try {
      const res = await fetchFn(url);
      if (res.ok) {
        const json = await res.json();
        rawEvents = json.events || [];
        providerTelemetry = json.providers || {};
      }
    } catch (err) {
      console.warn(`[Coverage Auditor] Live probe failed for ${city}:`, err.message);
    }
  } else {
    // In-process hybrid feed execution
    try {
      const now = Date.now();
      let windowDurationMs = 48 * 3600e3;
      if (window === 'tonight') windowDurationMs = 12 * 3600e3;
      else if (window === 'this_weekend' || window === 'this-weekend') windowDurationMs = 72 * 3600e3;
      else if (window === 'next_weekend' || window === 'next-weekend') windowDurationMs = 14 * 86400e3;
      else if (window === '30d') windowDurationMs = 30 * 86400e3;
      else if (window === 'season') windowDurationMs = 180 * 86400e3;

      const res = await executeHybridFeed({
        lat,
        lon,
        radiusMiles,
        category: vertical,
        window,
        windowStart: new Date(now).toISOString(),
        windowEnd: new Date(now + windowDurationMs).toISOString(),
        fetchFn,
        cache: options.cache || (options.fetchFn ? new GeoCache() : undefined)
      });
      rawEvents = res.events || [];
      providerTelemetry = res.providers || {};
    } catch (err) {
      console.warn(`[Coverage Auditor] Local probe failed for ${city}:`, err.message);
    }
  }

  // Count breakdown
  let commercialCount = 0;
  let curatedCount = 0;
  let communityCount = 0;
  const verifiedTimestamps = [];
  const eventUrlMap = new Map();

  // Seeded physical venue / track check in geographic radius
  let nearbyVenues = [];
  if (vertical === 'comedy') {
    nearbyVenues = KNOWN_VENUES.filter(v => {
      const d = distMiles(lat, lon, v.lat, v.lon);
      return d <= radiusMiles;
    });
  } else if (vertical === 'racing') {
    nearbyVenues = KNOWN_TRACKS.filter(t => {
      const d = distMiles(lat, lon, t.lat, t.lon);
      return d <= Math.max(radiusMiles, 75);
    });
  }

  const seededVenueCount = nearbyVenues.length;

  // Process individual events
  const detailedEvents = [];
  for (const e of rawEvents) {
    const src = e.source || '';
    let listingType = 'curated';
    if (src === 'seatgeek' || src === 'ticketmaster') {
      commercialCount++;
      listingType = 'commercial';
    } else if (src === 'verified_community' || e.sourceType === 'open_mic_host' || e.sourceType === 'producer_submission') {
      communityCount++;
      listingType = 'community';
    } else {
      curatedCount++;
      listingType = 'curated';
    }

    const verifiedAt = e.lastVerifiedAt || e.last_verified_at || e.verification?.lastVerifiedAt || e.provenance?.fetchedAt || (e.comedy?.lastVerifiedAt) || (e.racing?.lastVerifiedAt) || null;
    if (verifiedAt) {
      verifiedTimestamps.push(new Date(verifiedAt).getTime());
    }

    const sourceUrl = e.officialSourceUrl || e.official_source_url || e.canonical_url || e.ticketUrl || e.ticket_url || null;

    let confirmStatus = 'unconfirmed_seed';
    if (e.confirmationStatus) {
      confirmStatus = e.confirmationStatus;
    } else if (listingType === 'commercial') {
      confirmStatus = 'confirmed_by_aggregator';
    } else if (e.sourceType === 'official_box_office' || e.verification?.sourceType === 'official_box_office') {
      confirmStatus = 'confirmed_by_official_calendar';
    } else if (listingType === 'community') {
      confirmStatus = 'community_submitted';
    } else {
      confirmStatus = 'unconfirmed_seed';
    }

    const ageDays = verifiedAt ? Number(((Date.now() - new Date(verifiedAt).getTime()) / 86400e3).toFixed(1)) : null;
    const providerEvidence = {
      provider: e.source || (listingType === 'commercial' ? 'seatgeek' : 'curated'),
      confirmationStatus: confirmStatus,
      responseStatus: e.sourceEvidence?.httpStatus || (['seatgeek', 'ticketmaster'].includes(e.source) ? 200 : (confirmStatus === 'confirmed_by_official_calendar' ? 200 : null)),
      contentHash: e.contentHash || e.sourceEvidence?.contentHash || e.provenance?.contentHash || null,
      fetchedAt: verifiedAt ? new Date(verifiedAt).toISOString() : null,
      ageDays
    };

    const initialLinkHealth = {
      url: sourceUrl,
      status: 0,
      probeStatus: sourceUrl ? 'untested' : 'missing_url',
      isClean: false,
      isBlockedByChallenge: false
    };

    detailedEvents.push({
      id: e.id,
      title: e.title,
      venue: e.venue || e.venue_name,
      city: e.city,
      eventDateTime: {
        start: e.start || e.start_time,
        end: e.end || e.end_time
      },
      sourceUrl,
      lastSourceCheck: providerEvidence.fetchedAt,
      lastSourceCheckAgeDays: providerEvidence.ageDays,
      providerEvidence,
      ticketLinkHealth: initialLinkHealth,
      linkStatus: initialLinkHealth, // backwards-compatible alias
      confirmationStatus: confirmStatus,
      listingType
    });

    if (sourceUrl) {
      eventUrlMap.set(sourceUrl, null);
    }
  }

  // Probe URLs if link checking enabled
  let cleanLinkCount = 0;
  let blockedLinkCount = 0;
  let brokenLinkCount = 0;
  let checkedLinkCount = 0;
  const linkDetails = [];

  if (checkLinks) {
    // Check discovered events' source links
    const urlsToTest = Array.from(eventUrlMap.keys()).slice(0, 5);
    for (const url of urlsToTest) {
      const res = await checkOfficialUrl(url, fetchFn);
      checkedLinkCount++;
      if (res.valid && res.status >= 200 && res.status < 400) {
        cleanLinkCount++;
      } else if (res.status === 403 || res.status === 429) {
        blockedLinkCount++;
      } else {
        brokenLinkCount++;
      }
      eventUrlMap.set(url, res);
      linkDetails.push({ url, valid: res.valid, status: res.status, reason: res.reason });
    }

    // Attach ticketLinkHealth & linkStatus back to each individual event
    for (const dev of detailedEvents) {
      if (dev.sourceUrl && eventUrlMap.has(dev.sourceUrl)) {
        const probe = eventUrlMap.get(dev.sourceUrl);
        dev.ticketLinkHealth = {
          url: dev.sourceUrl,
          status: probe ? probe.status : 0,
          probeStatus: probe ? probe.reason : 'missing_url',
          isClean: Boolean(probe && probe.valid && probe.status >= 200 && probe.status < 400),
          isBlockedByChallenge: Boolean(probe && (probe.status === 403 || probe.status === 429))
        };
        dev.linkStatus = dev.ticketLinkHealth;
      } else {
        dev.ticketLinkHealth = {
          url: dev.sourceUrl,
          status: 0,
          probeStatus: dev.sourceUrl ? 'untested' : 'missing_url',
          isClean: false,
          isBlockedByChallenge: false
        };
        dev.linkStatus = dev.ticketLinkHealth;
      }
    }

    // If 0 events were found, check seeded venues' official websites
    if (rawEvents.length === 0 && nearbyVenues.length > 0) {
      for (const v of nearbyVenues.slice(0, 2)) {
        if (v.website) {
          const res = await checkOfficialUrl(v.website, fetchFn);
          checkedLinkCount++;
          if (res.valid && res.status >= 200 && res.status < 400) {
            cleanLinkCount++;
          } else if (res.status === 403 || res.status === 429) {
            blockedLinkCount++;
          } else {
            brokenLinkCount++;
          }
          linkDetails.push({ url: v.website, valid: res.valid, status: res.status, reason: res.reason, venue: v.name });
        }
      }
    }
  }

  // Calculate source freshness
  let freshnessStatus = 'no_verified_data';
  let avgFreshnessDays = null;
  if (verifiedTimestamps.length > 0) {
    const now = Date.now();
    const agesInDays = verifiedTimestamps.map(t => Math.max(0, (now - t) / (86400 * 1000)));
    avgFreshnessDays = Number((agesInDays.reduce((a, b) => a + b, 0) / agesInDays.length).toFixed(1));
    if (avgFreshnessDays <= 3) freshnessStatus = 'very_fresh';
    else if (avgFreshnessDays <= 14) freshnessStatus = 'fresh';
    else if (avgFreshnessDays <= 30) freshnessStatus = 'active';
    else freshnessStatus = 'stale';
  } else if (seededVenueCount > 0) {
    freshnessStatus = 'venue_verified_pending_schedule';
  }

  // Calculate upcoming horizon
  let upcomingHorizon = 'none_scheduled';
  let earliestHoursOut = null;
  if (rawEvents.length > 0) {
    const now = Date.now();
    const futureTimes = rawEvents
      .map(e => new Date(e.start || e.start_time || e.datetime_utc).getTime())
      .filter(t => t >= now - 60000);

    if (futureTimes.length > 0) {
      const earliest = Math.min(...futureTimes);
      earliestHoursOut = Number(((earliest - now) / 3600e3).toFixed(1));
      if (earliestHoursOut <= 12) upcomingHorizon = 'tonight';
      else if (earliestHoursOut <= 24) upcomingHorizon = 'tomorrow';
      else if (earliestHoursOut <= 48) upcomingHorizon = 'within_48h';
      else if (earliestHoursOut <= 168) upcomingHorizon = 'this_weekend';
      else upcomingHorizon = 'planning_window';
    }
  }

  // TIGHTENED VERIFICATION CLASSIFICATION:
  // 1. verified_inventory:
  //    - rawEvents.length > 0
  //    - When links checked: checkedLinkCount > 0 && cleanLinkCount === checkedLinkCount (100% clean HTTP 200-399)
  //    - Freshness: <= 14 days
  // 2. partial_verification:
  //    - rawEvents.length > 0
  //    - Confirmed provider events exist, BUT ticket links are probe-blocked (403/429) or partial
  // 3. stale_or_unlinked:
  //    - rawEvents.length > 0
  //    - But brokenLinkCount === checkedLinkCount (broken/unresponsive links) or average age > 30 days
  // 4. seeded_presence_only:
  //    - rawEvents.length === 0, but seededVenueCount > 0
  // 5. honest_empty_state:
  //    - rawEvents.length === 0 AND seededVenueCount === 0
  const verifiedEvents = detailedEvents.filter(e =>
    ['confirmed_exact_event', 'confirmed_by_official_calendar', 'confirmed_by_aggregator'].includes(e.confirmationStatus)
  );

  let classification = 'honest_empty_state';

  if (verifiedEvents.length > 0) {
    if (checkLinks) {
      if (checkedLinkCount > 0 && cleanLinkCount === checkedLinkCount && (avgFreshnessDays == null || avgFreshnessDays <= 14)) {
        classification = 'verified_inventory';
      } else if (cleanLinkCount > 0 || blockedLinkCount > 0) {
        classification = 'partial_verification';
      } else if (checkedLinkCount > 0 && brokenLinkCount === checkedLinkCount) {
        classification = 'stale_or_unlinked';
      } else if (avgFreshnessDays != null && avgFreshnessDays > 30) {
        classification = 'stale_or_unlinked';
      } else {
        classification = 'partial_verification';
      }
    } else {
      classification = 'partial_verification';
    }
  } else if (rawEvents.length > 0) {
    // Events exist but are unconfirmed seeds without active calendar proof
    if (seededVenueCount > 0) {
      classification = 'seeded_presence_only';
    } else {
      classification = 'partial_verification';
    }
  } else if (seededVenueCount > 0) {
    classification = 'seeded_presence_only';
  } else {
    classification = 'honest_empty_state';
  }

  return {
    market: `${city}, ${state}`,
    city,
    state,
    vertical,
    type,
    radiusMiles,
    window,
    classification,
    inventory: {
      totalEvents: rawEvents.length,
      commercialEvents: commercialCount,
      curatedEvents: curatedCount,
      communityEvents: communityCount,
      seededVenuesInRadius: seededVenueCount,
      venueNames: nearbyVenues.map(v => v.name)
    },
    freshness: {
      status: freshnessStatus,
      avgAgeDays: avgFreshnessDays
    },
    eventHorizon: {
      horizon: upcomingHorizon,
      earliestHoursOut
    },
    linkIntegrity: {
      totalChecked: checkedLinkCount,
      validCount: cleanLinkCount,
      cleanCount: cleanLinkCount,
      blockedCount: blockedLinkCount,
      brokenCount: brokenLinkCount,
      details: linkDetails
    },
    events: detailedEvents,
    auditDurationMs: Date.now() - auditStart
  };
}

/**
 * Multi-Horizon probe for a single market across planning windows
 */
async function auditMultiHorizonMarket(probe, options = {}) {
  const horizonsToTest = options.horizons || HORIZONS;
  const horizonResults = {};

  for (const win of horizonsToTest) {
    const report = await auditMarket(probe, { ...options, window: win });
    horizonResults[win] = {
      window: win,
      classification: report.classification,
      totalEvents: report.inventory.totalEvents,
      commercialEvents: report.inventory.commercialEvents,
      curatedEvents: report.inventory.curatedEvents,
      horizon: report.eventHorizon.horizon,
      earliestHoursOut: report.eventHorizon.earliestHoursOut
    };
  }

  return {
    market: `${probe.city}, ${probe.state}`,
    vertical: probe.vertical,
    type: probe.type,
    horizons: horizonResults
  };
}

/**
 * Runs the complete national audit across the standardized grid
 */
async function runNationalAudit(options = {}) {
  const auditStart = Date.now();
  const results = [];
  const multiHorizonSummaries = [];

  for (const probe of NATIONAL_AUDIT_GRID) {
    const report = await auditMarket(probe, options);
    results.push(report);

    // If testing motorsports or multi-horizon requested, sample multi-horizon data
    if (options.includeMultiHorizon || probe.vertical === 'racing') {
      const mh = await auditMultiHorizonMarket(probe, { ...options, checkLinks: false });
      multiHorizonSummaries.push(mh);
    }
  }

  const totals = {
    probedMarkets: results.length,
    verifiedInventoryMarkets: results.filter(r => r.classification === 'verified_inventory').length,
    partialVerificationMarkets: results.filter(r => r.classification === 'partial_verification').length,
    staleOrUnlinkedMarkets: results.filter(r => r.classification === 'stale_or_unlinked').length,
    seededPresenceOnlyMarkets: results.filter(r => r.classification === 'seeded_presence_only').length,
    honestEmptyStateMarkets: results.filter(r => r.classification === 'honest_empty_state').length,
    totalEventsDiscovered: results.reduce((sum, r) => sum + r.inventory.totalEvents, 0),
    totalCommercialEvents: results.reduce((sum, r) => sum + r.inventory.commercialEvents, 0),
    totalCuratedEvents: results.reduce((sum, r) => sum + r.inventory.curatedEvents, 0),
    totalCommunityEvents: results.reduce((sum, r) => sum + r.inventory.communityEvents, 0),
    totalSeededVenuesChecked: results.reduce((sum, r) => sum + r.inventory.seededVenuesInRadius, 0),
    totalLinksChecked: results.reduce((sum, r) => sum + (r.linkIntegrity?.totalChecked || 0), 0),
    totalValidLinks: results.reduce((sum, r) => sum + (r.linkIntegrity?.validCount || 0), 0),
    totalBrokenLinks: results.reduce((sum, r) => sum + (r.linkIntegrity?.brokenCount || 0), 0),
    horizonTotals: multiHorizonSummaries.length > 0 ? {
      tonight: multiHorizonSummaries.reduce((sum, mh) => sum + (mh.horizons.tonight?.totalEvents || 0), 0),
      thisWeekend: multiHorizonSummaries.reduce((sum, mh) => sum + (mh.horizons.this_weekend?.totalEvents || 0), 0),
      nextWeekend: multiHorizonSummaries.reduce((sum, mh) => sum + (mh.horizons.next_weekend?.totalEvents || 0), 0),
      next30Days: multiHorizonSummaries.reduce((sum, mh) => sum + (mh.horizons['30d']?.totalEvents || 0), 0),
      fullSeason: multiHorizonSummaries.reduce((sum, mh) => sum + (mh.horizons.season?.totalEvents || 0), 0)
    } : null,
    auditDurationMs: Date.now() - auditStart
  };

  return {
    milestone: AUDIT_MILESTONE,
    timestamp: new Date().toISOString(),
    totals,
    results,
    multiHorizonSummaries: multiHorizonSummaries.length > 0 ? multiHorizonSummaries : undefined
  };
}

/**
 * Sanitizes audit report for public consumption (hides internal diagnostics and sensitive URLs)
 */
function sanitizeAuditReport(audit) {
  if (!audit) return null;
  return {
    milestone: audit.milestone,
    timestamp: audit.timestamp,
    totals: audit.totals,
    results: (audit.results || []).map(r => ({
      market: r.market,
      city: r.city,
      state: r.state,
      vertical: r.vertical,
      type: r.type,
      classification: r.classification,
      inventory: {
        totalEvents: r.inventory.totalEvents,
        commercialEvents: r.inventory.commercialEvents,
        curatedEvents: r.inventory.curatedEvents,
        communityEvents: r.inventory.communityEvents,
        seededVenuesInRadius: r.inventory.seededVenuesInRadius
      },
      freshness: {
        status: r.freshness.status,
        avgAgeDays: r.freshness.avgAgeDays
      },
      eventHorizon: r.eventHorizon,
      events: (r.events || []).map(e => ({
        title: e.title,
        venue: e.venue,
        city: e.city,
        eventDateTime: e.eventDateTime,
        confirmationStatus: e.confirmationStatus,
        listingType: e.listingType
      }))
    })),
    multiHorizonSummaries: audit.multiHorizonSummaries
  };
}

module.exports = {
  AUDIT_MILESTONE,
  HORIZONS,
  NATIONAL_AUDIT_GRID,
  auditMarket,
  auditMultiHorizonMarket,
  runNationalAudit,
  checkOfficialUrl,
  sanitizeAuditReport
};
