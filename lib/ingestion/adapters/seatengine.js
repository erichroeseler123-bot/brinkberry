/**
 * Reusable SeatEngine / Schema.org Platform Adapter
 *
 * Automates ingestion of comedy club calendars powered by SeatEngine / JSON-LD.
 * Any venue using SeatEngine is defined purely via configuration:
 * {
 *   slug: 'venue-slug',
 *   name: 'Venue Name',
 *   address: '123 Main St, City, ST 12345',
 *   city: 'City',
 *   state: 'ST',
 *   timezone: 'America/...',
 *   lat: 12.34,
 *   lon: -56.78,
 *   website: 'https://...',
 *   feedUrl: 'https://...',
 *   priceDisplay: '$25'
 * }
 */

const crypto = require('node:crypto');
const { extractJsonLdEvents } = require('./jsonld');
const { defaultCanonicalStorage } = require('../../storage/canonical-event-storage');
const { defaultRawStorage } = require('../../storage/raw-source-storage');

function cleanHtmlText(str = '') {
  return String(str)
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCivilDateTime(isoString, timezone = 'America/New_York') {
  try {
    const d = new Date(isoString);
    if (!Number.isFinite(d.getTime())) return { date: null, time: null };

    const formatterDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const formatterTime = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit' });

    return {
      date: formatterDate.format(d),
      time: formatterTime.format(d)
    };
  } catch (_) {
    return { date: null, time: null };
  }
}

/**
 * Ingests a SeatEngine-powered venue via configuration
 *
 * @param {Object} venue - Venue metadata configuration
 * @param {Object} [options] - Ingestion options
 * @returns {Promise<Object>} Ingestion report
 */
async function ingestSeatEngineVenue(venue, options = {}) {
  const feedUrl = venue?.feedUrl || venue?.calendarFeedUrl || (venue?.website ? `${venue.website.replace(/\/+$/, '')}/events` : null);
  if (!venue || !venue.slug || !feedUrl) {
    throw new Error('Invalid venue configuration: slug and feedUrl (or calendarFeedUrl/website) are required.');
  }

  const fetchFn = options.fetchFn || fetch;
  const isProd = process.env.VERCEL_ENV === 'production';
  const environment = options.environment || (isProd ? 'production' : 'preview');
  const namespace = options.namespace || (isProd ? 'production' : 'preview_expansion');

  const res = await fetchFn(feedUrl, {
    headers: {
      'User-Agent': 'Brinkberry-Expansion-Ingest/1.0 (+https://brinkberry.com/radar)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${venue.name} calendar (${feedUrl}): HTTP ${res.status}`);
  }

  const rawHtml = await res.text();
  const rawHash = crypto.createHash('sha256').update(rawHtml).digest('hex');
  const fetchedAt = new Date().toISOString();

  // Save raw evidence snapshot
  if (defaultRawStorage && typeof defaultRawStorage.saveRawEvidence === 'function') {
    try {
      await defaultRawStorage.saveRawEvidence({
        sourceId: venue.slug,
        contentHash: rawHash,
        rawResponse: rawHtml,
        fetchedAt,
        httpStatus: res.status,
        parserName: 'seatengine_jsonld',
        parserVersion: '1.0.0'
      });
    } catch (_) {}
  }

  const parsed = extractJsonLdEvents(rawHtml, {
    venueName: venue.name,
    canonicalUrl: venue.website
  });

  const events = [];
  const prefix = venue.idPrefix || venue.slug.slice(0, 8).replace(/-/g, '_');

  // Detect if feed contains events across multiple distinct physical showroom locations
  const distinctStreetNumbers = new Set();
  for (const ev of parsed) {
    const st = ev.rawPayload?.location?.address?.streetAddress;
    const num = st ? st.match(/\d+/)?.[0] : null;
    if (num) distinctStreetNumbers.add(num);
  }
  const isMultiLocationFeed = distinctStreetNumbers.size > 1;

  for (const ev of parsed) {
    if (ev.isCancelled) continue;

    // Multi-location brand check: if feed contains multiple showrooms and venue has an address, filter by street number
    if (isMultiLocationFeed) {
      const eventStreet = ev.rawPayload?.location?.address?.streetAddress?.toLowerCase();
      if (eventStreet && venue.address) {
        const venueStreet = venue.address.toLowerCase();
        const venueNumber = venueStreet.match(/\d+/)?.[0];
        const eventNumber = eventStreet.match(/\d+/)?.[0];
        if (venueNumber && eventNumber && venueNumber !== eventNumber) {
          continue;
        }
      }
    }

    const title = cleanHtmlText(ev.title || 'Live Comedy Show');
    const startIso = ev.start;
    if (!startIso) continue;

    const { date: civilDate, time: civilTime } = getCivilDateTime(startIso, venue.timezone);
    if (!civilDate) continue;

    const titleSlug = slugify(title);
    const timeFormatted = civilTime.replace(':', '');
    const slug = slugify(`${venue.slug}-${title}-${civilDate}-${timeFormatted}`);
    const directTicketUrl = ev.eventUrl || ev.canonical_url || `${venue.website || feedUrl}/shows`;
    let ticketUrlType = 'event_specific_checkout';
    try {
      const parsedU = new URL(directTicketUrl);
      if (parsedU.pathname.includes('/promoters/') || parsedU.pathname.includes('/promoter/')) {
        ticketUrlType = 'promoter_page';
      } else if (parsedU.pathname === '/' || parsedU.pathname === '') {
        ticketUrlType = 'venue_link_only';
      } else if (
        parsedU.pathname.includes('/events/') ||
        parsedU.pathname.includes('/event/') ||
        parsedU.pathname.includes('/shows/') ||
        parsedU.pathname.includes('/show/') ||
        parsedU.pathname.includes('/tickets/')
      ) {
        ticketUrlType = 'event_specific_checkout';
      } else {
        ticketUrlType = 'venue_link_only';
      }
    } catch (_) {
      ticketUrlType = 'unknown';
    }

    events.push({
      id: `${prefix}_${crypto.createHash('md5').update(`${title}_${startIso}`).digest('hex').slice(0, 12)}`,
      slug,
      fingerprint: `comedy_${venue.slug}_${civilDate}_${timeFormatted}_${titleSlug}`,
      title,
      performer: title,
      start: startIso,
      start_time: startIso,
      end_time: ev.end || null,
      civilDate,
      civilTime,
      venue_slug: venue.slug,
      venue_name: venue.name,
      venue_address: venue.address,
      venue_latitude: venue.lat,
      venue_longitude: venue.lon,
      city: venue.city,
      state: venue.state,
      timezone: venue.timezone,
      ticket_url: directTicketUrl,
      ticketUrl: directTicketUrl,
      ticketUrlType,
      price_display: ev.priceDisplay || venue.priceDisplay || '$20',
      category: 'comedy',
      category_tags: ['comedy', 'standup'],
      confirmationStatus: 'confirmed_by_official_calendar',
      isCancelled: false,
      lastVerifiedAt: fetchedAt,
      lastConfirmedAt: fetchedAt,
      environment,
      namespace,
      sourceEvidence: {
        sourceId: venue.slug,
        sourceUrl: feedUrl,
        feedUrl: feedUrl,
        feedType: 'jsonld',
        feedTechnology: 'Schema.org JSON-LD (SeatEngine)',
        fetchedAt,
        rawHash,
        contentHash: rawHash,
        confirmationStatus: 'confirmed_by_official_calendar',
        exactConfirmationFields: {
          title: true,
          date: true,
          venue: true
        }
      }
    });
  }

  if (options.persist !== false && defaultCanonicalStorage && events.length > 0) {
    try {
      await defaultCanonicalStorage.upsertEvents(events);
    } catch (_) {}
  }

  return {
    venue,
    events,
    count: events.length,
    rawHash
  };
}

module.exports = {
  ingestSeatEngineVenue,
  getCivilDateTime,
  cleanHtmlText,
  slugify
};
