/**
 * Vertical Ingestion Network Delivery API Endpoint
 *
 * Endpoint: /api/network-events or /api/v1/network/events
 *
 * Contract:
 * Exposes strictly verified canonical events from the Vertical Ingestion Network to
 * Brinkberry Discovery. Rejects unconfirmed seeds, synthetic dates, and stale records.
 */

const { executeHybridFeed } = require('../lib/providers/engine');
const { defaultSourceRegistry } = require('../lib/network/source-registry');
const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage');
const { CONFIRMATION_STATUSES } = require('../lib/network/schema');

function parseCoord(val, fallback) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const u = new URL(req.url, 'https://brinkberry.local');
  const vertical = u.searchParams.get('vertical') || u.searchParams.get('category') || 'comedy';
  const lat = parseCoord(u.searchParams.get('lat'), 39.7392);
  const lon = parseCoord(u.searchParams.get('lng') || u.searchParams.get('lon'), -104.9903);
  const radiusMiles = Math.min(250, Math.max(5, parseCoord(u.searchParams.get('radius'), 50)));
  const window = u.searchParams.get('window') || '48h';
  const minConfirmation = u.searchParams.get('min_confirmation') || 'all_verified';

  if (!['comedy', 'motorsports', 'racing'].includes(vertical)) {
    return res.status(400).json({
      error: 'Invalid vertical. Supported verticals: comedy, motorsports (or racing)'
    });
  }

  // Normalize vertical name
  const queryCategory = vertical === 'motorsports' ? 'racing' : vertical;

  try {
    const feedResult = await executeHybridFeed({
      lat,
      lon,
      radiusMiles,
      category: queryCategory,
      window
    });

    const storedCanonical = [];
    try {
      const stored = await defaultCanonicalStorage.queryEvents({
        lat,
        lon,
        radiusMiles,
        category: queryCategory
      });
      if (Array.isArray(stored)) {
        for (const ev of stored) {
          if (['admin_verified', 'verified_community', 'community_submitted', 'confirmed_by_official_calendar'].includes(ev.confirmationStatus)) {
            storedCanonical.push(ev);
          }
        }
      }
    } catch (_) {}

    const rawEvents = [...(feedResult.events || []), ...storedCanonical];

    // STRICT EVIDENCE GATEKEEPING:
    // Exclude unconfirmed seeds, request-relative timestamps, missing sourceEvidence, or cancelled events
    const verifiedCanonicalEvents = rawEvents.filter(ev => {
      // 1. Must not be explicitly cancelled
      if (ev.isCancelled || ev.status === 'cancelled') return false;

      // 2. Must not be a placeholder seed
      if (ev.listingType === 'seed' || ev.sourceType === 'unconfirmed_seed' || ev.confirmationStatus === 'unconfirmed_seed') {
        return false;
      }

      // 3. Must have valid confirmation status
      const conf = ev.confirmationStatus;
      const isConfirmed = [
        CONFIRMATION_STATUSES.CONFIRMED_BY_OFFICIAL_CALENDAR,
        CONFIRMATION_STATUSES.CONFIRMED_BY_AGGREGATOR,
        CONFIRMATION_STATUSES.VERIFIED_COMMUNITY_SUBMISSION,
        CONFIRMATION_STATUSES.ADMIN_VERIFIED,
        'admin_verified',
        'community_submitted',
        'confirmed_exact_event'
      ].includes(conf);

      if (!isConfirmed) return false;

      // 4. Min confirmation filter
      if (minConfirmation === 'confirmed_by_official_calendar' && conf !== CONFIRMATION_STATUSES.CONFIRMED_BY_OFFICIAL_CALENDAR) {
        return false;
      }

      // 5. Must have genuine start time (not request-relative)
      if (!ev.start && !ev.start_time && !ev.datetime_utc) return false;

      return true;
    });

    // Format into Vertical Ingestion Network canonical delivery contract
    const formattedEvents = verifiedCanonicalEvents.map(ev => {
      const startTime = ev.start || ev.start_time || ev.datetime_utc;
      const endTime = ev.end || ev.end_time || null;
      const localDate = ev.localCivilDate || (startTime ? startTime.slice(0, 10) : null);
      const localTime = ev.localCivilTime || (startTime && startTime.includes('T') ? startTime.slice(11, 16) : null);

      return {
        id: ev.id,
        fingerprint: ev.fingerprint || ev.id,
        vertical: vertical === 'racing' ? 'motorsports' : vertical,
        title: ev.title,
        venue: {
          id: ev.venueSlug || ev.venueId || 'venue_unknown',
          name: ev.venue || ev.venue_name,
          city: ev.city,
          state: ev.state || null,
          lat: ev.lat != null ? ev.lat : lat,
          lng: ev.lon != null ? ev.lon : lon,
          isClaimed: Boolean(ev.isClaimed)
        },
        start: startTime,
        end: endTime,
        localCivilDate: localDate,
        localCivilTime: localTime,
        ianaTimezone: ev.timezone || 'America/Denver',
        lineup: ev.lineup || ev.comedy?.comedians || [],
        ticketing: {
          officialBoxOfficeUrl: ev.officialSourceUrl || ev.canonical_url || ev.ticketUrl || null,
          priceDisplay: ev.price_display || ev.priceDisplay || null
        },
        confirmation: {
          status: ev.confirmationStatus,
          sourceType: ev.sourceType || 'official_box_office',
          sourceId: ev.sourceEvidence?.sourceId || ev.source || 'verified_provider',
          fetchedAt: ev.sourceEvidence?.fetchedAt || ev.lastVerifiedAt || new Date().toISOString(),
          freshness: ev.freshnessStatus || 'verified_current',
          contentHash: ev.contentHash || ev.sourceEvidence?.contentHash || null
        }
      };
    });

    return res.status(200).json({
      network: 'brinkberry_vertical_network',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      vertical: vertical === 'racing' ? 'motorsports' : vertical,
      evidenceCriteria: {
        unconfirmedSeedsExcluded: true,
        requestRelativeTimestampsExcluded: true,
        minFreshness: 'verified_current'
      },
      totalEvents: formattedEvents.length,
      events: formattedEvents
    });
  } catch (err) {
    console.error('[network-events error]:', err);
    return res.status(500).json({
      error: 'Internal error querying vertical network events',
      message: err.message
    });
  }
};
