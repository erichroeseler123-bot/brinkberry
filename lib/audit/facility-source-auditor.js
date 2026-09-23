/**
 * Read-Only Facility Source Auditor
 *
 * Probes registered comedy venue and race track identities to determine
 * which facility anchors actually have usable, source-backed live schedules.
 *
 * Strict Rules:
 * - Read-only: Zero writes to canonical event storage.
 * - Zero publication: Does not promote or publish candidates.
 * - Probes domain, physical location, HTTP status, source type, and exact event counts.
 */

const { getNationalComedyVenues } = require('../comedy/national-registry');
const { getNationalRaceTracks } = require('../racing/national-registry');
const { detectFeedFromHtml } = require('../ingestion/feed-detector');
const { parseIcsSource } = require('../ingestion/adapters/ics');
const { extractJsonLdEvents } = require('../ingestion/adapters/jsonld');
const { parseHtmlScheduleSource } = require('../ingestion/adapters/html-schedule');

/**
 * Validates domain and physical location for a facility
 */
function validateFacilityIdentity(facility) {
  const hasName = Boolean(facility.name && typeof facility.name === 'string');
  const hasValidLat = Number.isFinite(facility.lat) && facility.lat >= 24 && facility.lat <= 50;
  const hasValidLon = Number.isFinite(facility.lon) && facility.lon >= -125 && facility.lon <= -65;
  const hasTimezone = Boolean(facility.timezone && facility.timezone.startsWith('America/'));
  let hasValidDomain = false;
  let domain = null;

  try {
    const url = new URL(facility.website);
    hasValidDomain = Boolean(url.hostname && url.hostname.includes('.'));
    domain = url.hostname;
  } catch (_) {}

  return {
    isIdentityConfirmed: hasName && hasValidLat && hasValidLon && hasTimezone && hasValidDomain,
    domain,
    lat: facility.lat,
    lon: facility.lon,
    city: facility.city,
    state: facility.state,
    timezone: facility.timezone
  };
}

/**
 * Audits a single facility source
 */
async function auditFacilitySource(facility, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const identity = validateFacilityIdentity(facility);
  const targetUrl = facility.calendarFeedUrl || facility.website;

  const report = {
    slug: facility.slug,
    name: facility.name,
    vertical: facility.trackType ? 'racing' : 'comedy',
    identityStatus: facility.identityStatus || (facility.trackType ? 'verified_track_identity' : 'verified_venue_identity'),
    domainConfirmed: identity.isIdentityConfirmed,
    domain: identity.domain,
    location: `${identity.city}, ${identity.state}`,
    coordinates: `${identity.lat}, ${identity.lon}`,
    targetUrl,
    httpStatus: null,
    sourceType: 'unknown',
    parserResult: 'untested',
    exactEventCount: 0,
    linkHealth: 'untested',
    usableSchedule: false,
    notes: ''
  };

  if (!identity.isIdentityConfirmed) {
    report.notes = 'Facility failed identity verification (invalid coordinates or domain)';
    report.sourceType = 'identity_invalid';
    return report;
  }

  // Probe endpoint
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 4000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(targetUrl, {
      headers: {
        'User-Agent': 'Brinkberry-Source-Auditor/1.0 (+https://brinkberry.com/radar)'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    report.httpStatus = res.status;
    report.lastFetchTimestamp = new Date().toISOString();

    if (res.status === 403) {
      report.sourceType = 'blocked_waf';
      report.parserResult = 'access_denied';
      report.notes = 'Protected by Cloudflare/WAF challenge page';
      return report;
    }

    if (!res.ok) {
      report.sourceType = 'unreachable';
      report.parserResult = 'http_error';
      report.notes = `HTTP ${res.status}`;
      return report;
    }

    const contentType = res.headers?.get?.('content-type') || '';
    const bodyText = await res.text();

    // 1. Check if direct ICS
    if (bodyText.includes('BEGIN:VCALENDAR')) {
      report.sourceType = 'ics';
      const parsed = parseIcsSource(bodyText, {
        venueName: facility.name,
        canonicalUrl: facility.website
      });
      report.exactEventCount = Array.isArray(parsed) ? parsed.length : (parsed?.events?.length || 0);
      report.parserResult = report.exactEventCount > 0 ? 'success' : 'empty_payload';
      report.usableSchedule = report.exactEventCount > 0;
      report.linkHealth = 'healthy';
      return report;
    }

    // 2. Check HTML with feed-detector
    const detected = detectFeedFromHtml(targetUrl, bodyText);
    report.detectedPlatform = detected.ticketingEngine || null;

    if (detected.feedType === 'jsonld') {
      report.sourceType = 'jsonld';
      const parsedEvents = extractJsonLdEvents(bodyText, {
        venueName: facility.name,
        canonicalUrl: facility.website
      });
      report.exactEventCount = parsedEvents.length;
      report.parserResult = parsedEvents.length > 0 ? 'success' : 'empty_payload';
      report.usableSchedule = parsedEvents.length > 0;
      report.linkHealth = 'healthy';
      return report;
    }

    if (detected.feedType === 'ticketing_platform') {
      report.sourceType = `platform_${detected.ticketingEngine}`;
      report.parserResult = 'platform_adapter_required';
      report.notes = `Requires ${detected.ticketingEngine} platform connector (identifier: ${detected.identifier || 'unknown'})`;
      return report;
    }

    // 3. Check HTML schedule table/cards
    const htmlEvents = parseHtmlScheduleSource(bodyText, {
      venueName: facility.name,
      canonicalUrl: facility.website
    });
    if (htmlEvents.length > 0) {
      report.sourceType = 'html_schedule';
      report.exactEventCount = htmlEvents.length;
      report.parserResult = 'success';
      report.usableSchedule = true;
      report.linkHealth = 'healthy';
      return report;
    }

    // Fallback: Reached domain but no automated feed format recognized
    report.sourceType = 'unparsed_html';
    report.parserResult = 'no_feed_detected';
    report.notes = 'Site reachable; lacks automated public feed structure';
    return report;

  } catch (err) {
    clearTimeout(timeoutId);
    report.httpStatus = 0;
    report.sourceType = 'network_error';
    report.parserResult = 'connection_failed';
    report.notes = err.name === 'AbortError' ? 'Probe timed out' : err.message;
    return report;
  }
}

/**
 * Runs a complete read-only source audit across registered comedy venues and race tracks
 */
async function runFacilitySourceAudit(options = {}) {
  const comedyVenues = getNationalComedyVenues();
  const raceTracks = getNationalRaceTracks();

  const facilities = [
    ...comedyVenues.map(v => ({ ...v, vertical: 'comedy' })),
    ...raceTracks.map(t => ({ ...t, vertical: 'racing' }))
  ];

  const results = [];
  for (const facility of facilities) {
    const res = await auditFacilitySource(facility, options);
    results.push(res);
  }

  const summary = {
    totalProbed: results.length,
    comedyCount: comedyVenues.length,
    racingCount: raceTracks.length,
    domainConfirmedCount: results.filter(r => r.domainConfirmed).length,
    usableScheduleCount: results.filter(r => r.usableSchedule).length,
    usableComedyCount: results.filter(r => r.vertical === 'comedy' && r.usableSchedule).length,
    usableRacingCount: results.filter(r => r.vertical === 'racing' && r.usableSchedule).length,
    bySourceType: {},
    byParserResult: {},
    usableFacilities: results.filter(r => r.usableSchedule).map(r => ({
      slug: r.slug,
      name: r.name,
      vertical: r.vertical,
      sourceType: r.sourceType,
      exactEventCount: r.exactEventCount
    }))
  };

  for (const r of results) {
    summary.bySourceType[r.sourceType] = (summary.bySourceType[r.sourceType] || 0) + 1;
    summary.byParserResult[r.parserResult] = (summary.byParserResult[r.parserResult] || 0) + 1;
  }

  return {
    summary,
    results
  };
}

module.exports = {
  validateFacilityIdentity,
  auditFacilitySource,
  runFacilitySourceAudit
};
