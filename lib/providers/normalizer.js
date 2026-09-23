/**
 * Canonical Event Normalizer for Dynamic Providers
 *
 * Normalizes disparate API schemas (Ticketmaster, SeatGeek, etc.) into
 * the unified Brinkberry event data model.
 */

const { normalizeComedyMetadata } = require('../comedy/schema');

function normalizeCategory(rawCategory, tags = []) {
  const text = `${rawCategory || ''} ${(tags || []).join(' ')}`.toLowerCase();
  // 1. Civic & Politics: First-class neutral public information category (including peaceful protests and rallies)
  if (/city council|county board|school board|planning (and|&)? zoning|zoning|public hearing|state legislature|legislative|town hall|candidate forum|election|voter registration|budget meeting|advisory board|referendum|caucus|civic|politics|government|municipal|ordinance|commission|protest|rally|march|demonstration|picket/i.test(text)) return 'civic';
  // 2. Library, Maker & Community Gatherings (including parties, social gatherings, meetups)
  if (/library|book club|storytime|workshop|makerspace|community center|neighborhood|volunteer|trivia|arcade|bowling|meetup|party|house party|backyard|hangout|mixer|social gathering|bbq|block party/i.test(text)) return 'community';
  // 3. Core verticals & discovery domains
  if (/comedy|standup|improv/i.test(text)) return 'comedy';
  if (/auto_racing|racing|nascar|indycar|motocross|supercross|drag racing|sprint car|dirt track|speedway|motorsport/i.test(text)) return 'racing';
  if (/music|concert|jazz|rock|band|orchestra|\bdj\b|\brap\b|hip hop|folk|indie|acoustic/i.test(text)) return 'music';
  if (/theater|theatre|broadway|musical|opera|play|stage/i.test(text)) return 'theater';
  if (/festival|fair|county fair|renaissance|carnival|parade|celebration|expo|flea market|craft fair|holiday market|car show/i.test(text)) return 'festival';
  if (/\b(art|arts|exhibit|gallery|museum|sculpture|painting)\b/i.test(text)) return 'arts';
  if (/sport|game|nba|nfl|mlb|nhl|soccer|match|tournament|pickup|pickup game|softball|basketball|volleyball|kickball/i.test(text)) return 'sports';
  if (/kid|family|children|youth|parent/i.test(text)) return 'family';
  if (/food|drink|beer|wine|dining|tasting|brewery|cocktail|farmers market|pop-up food|food truck|bake sale|taco stand/i.test(text)) return 'food';
  if (/outdoor|nature|hike|park|run|5k|walk/i.test(text)) return 'outdoor';
  return 'other';
}

function resolveSourceQualityLabel(event = {}) {
  // 0. Community Submitted (autonomous user submission - not independently verified)
  if (
    event.source === 'community_post' ||
    event.sourceType === 'community_submission' ||
    event.isCommunityPost === true ||
    event.isAutonomousCommunityPost === true ||
    (event.confirmationStatus === 'community_submitted' && !event.reviewRecord)
  ) {
    return 'Community-submitted*';
  }

  // 1. Source Needs Review (unverified or flags)
  if (
    event.confirmationStatus === 'needs_review' ||
    event.confirmationStatus === 'unconfirmed_seed' ||
    event.confirmationStatus === 'unverified' ||
    event.needsReview === true
  ) {
    return 'Source needs review';
  }

  // 2. Official Government Calendar (civic meetings, hearings, boards)
  if (
    event.category === 'civic' ||
    (event.category_tags || []).includes('civic') ||
    event.sourceType === 'government' ||
    event.confirmationStatus === 'official_government_calendar' ||
    /city council|county board|school board|public hearing|town hall|legislature|government/i.test(event.venue_name || event.venue || event.title || '')
  ) {
    return 'Official government calendar';
  }

  // 3. Official Venue Schedule (direct box office / venue calendar)
  if (
    event.confirmationStatus === 'confirmed_by_official_calendar' ||
    event.confirmationStatus === 'confirmed_by_dual_official_sources' ||
    event.sourceType === 'official_box_office' ||
    (typeof event.source === 'string' && event.source.startsWith('comedy_')) ||
    event.source === 'official_ingestion'
  ) {
    return 'Official venue schedule';
  }

  // 4. Verified Ticket Link (primary commercial or verified ticketing platforms)
  const isTicketPlatform = ['seatgeek', 'ticketmaster', 'etix', 'eventbrite', 'ticketweb', 'seatengine'].includes(event.source) ||
    Boolean(event.ticketUrl && !event.ticketUrl.includes('/event/') && !event.ticketUrl.includes('brinkberry'));
  if (isTicketPlatform && event.price_status !== 'free' && event.priceDisplay !== 'Free') {
    return 'Verified ticket link';
  }

  // 5. Public Community Listing (libraries, universities, civic community feeds)
  if (
    event.source?.startsWith('community') ||
    event.provenance?.provider === 'community_ics' ||
    event.confirmationStatus === 'public_community_listing' ||
    event.confirmationStatus === 'verified_community' ||
    event.category === 'community' ||
    /library|campus|community/i.test(event.venue_name || event.venue || '')
  ) {
    return 'Public community listing';
  }

  // 6. Free Event
  if (event.price_status === 'free' || event.price_min === 0 || event.priceDisplay === 'Free') {
    return 'Free event';
  }

  return 'Details available';
}

function normalizePrice(priceMin, priceMax, isFreeFlag) {
  if (isFreeFlag || priceMin === 0 || (priceMin == null && priceMax === 0)) {
    return { status: 'free', min: 0, max: 0, display: 'Free' };
  }
  const min = priceMin != null ? Number(priceMin) : null;
  const max = priceMax != null ? Number(priceMax) : null;

  if (min != null && min > 0) {
    const status = min <= 20 ? 'cheap' : 'paid';
    const display = max != null && max > min ? `$${Math.round(min)}–$${Math.round(max)}` : `From $${Math.round(min)}`;
    return { status, min, max, display };
  }
  return { status: 'unknown', min: null, max: null, display: 'Get Tickets' };
}

function normalizeEvent(raw, provider) {
  if (!raw || typeof raw !== 'object') return null;

  if (provider === 'ticketmaster') {
    const id = raw.id ? `tm_${raw.id}` : null;
    const title = raw.name?.trim();
    const start = raw.dates?.start?.dateTime || (raw.dates?.start?.localDate ? `${raw.dates.start.localDate}T${raw.dates.start.localTime || '19:00:00'}Z` : null);
    if (!id || !title || !start) return null;

    const end = raw.dates?.end?.dateTime || null;
    const venueObj = raw._embedded?.venues?.[0] || {};
    const venue = venueObj.name || 'Venue TBA';
    const city = venueObj.city?.name || 'Local Area';
    const state = venueObj.state?.stateCode || venueObj.state?.name || '';
    const lat = Number(venueObj.location?.latitude);
    const lon = Number(venueObj.location?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const genre = raw.classifications?.[0]?.genre?.name || '';
    const segment = raw.classifications?.[0]?.segment?.name || '';
    const subGenre = raw.classifications?.[0]?.subGenre?.name || '';
    const category = normalizeCategory(segment, [genre, subGenre]);

    const priceRange = raw.priceRanges?.[0] || {};
    const price = normalizePrice(priceRange.min, priceRange.max, priceRange.min === 0);

    // Pick best image (prefer 16:9 ratio with highest width)
    const images = raw.images || [];
    const bestImg = images.filter(img => img.ratio === '16_9').sort((a, b) => (b.width || 0) - (a.width || 0))[0] || images[0];

    const attractions = (raw._embedded?.attractions || []).map(a => a.name).filter(Boolean);
    const comedyMeta = category === 'comedy' ? normalizeComedyMetadata({
      title,
      description: raw.info || raw.pleaseNote,
      comedians: attractions.length > 0 ? attractions : undefined,
      sourceType: 'commercial'
    }) : null;

    const racingMeta = category === 'racing' ? {
      discipline: /dirt/i.test(title + ' ' + venue) ? 'dirt_oval' : (/drag/i.test(title + ' ' + venue) ? 'drag_strip' : 'paved_short_track'),
      surface: /dirt/i.test(title + ' ' + venue) ? 'clay_dirt' : 'asphalt',
      trackType: /dirt/i.test(title + ' ' + venue) ? 'dirt_oval' : (/drag/i.test(title + ' ' + venue) ? 'drag_strip' : 'short_track_oval'),
      trackName: venue,
      sourceType: 'commercial'
    } : null;

    return {
      id,
      title,
      start_time: new Date(start).toISOString(),
      end_time: end ? new Date(end).toISOString() : null,
      venue_name: venue,
      city: state ? `${city}, ${state}` : city,
      neighborhood: null,
      venue_latitude: lat,
      venue_longitude: lon,
      category_tags: category === 'racing' ? ['racing', 'sports'] : [category],
      vibe_labels: [category, segment.toLowerCase()].filter(Boolean),
      price_status: price.status,
      price_min: price.min,
      price_max: price.max,
      price_display: price.display,
      description: raw.info || raw.pleaseNote || `${title} at ${venue}`,
      canonical_url: raw.url || '',
      canonical_image_url: bestImg?.url || null,
      source: 'ticketmaster',
      indoor_outdoor: category === 'racing' ? 'outdoor' : 'unknown',
      comedy: comedyMeta,
      racing: racingMeta,
      provenance: {
        provider: 'ticketmaster',
        externalId: raw.id,
        fetchedAt: new Date().toISOString()
      }
    };
  }

function extractImageUrl(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.trim();
    return s.startsWith('http') ? s : null;
  }
  if (typeof val === 'object') {
    if (typeof val.url === 'string' && val.url.startsWith('http')) return val.url;
    if (typeof val.huge === 'string' && val.huge.startsWith('http')) return val.huge;
    if (typeof val.large === 'string' && val.large.startsWith('http')) return val.large;
    if (typeof val.medium === 'string' && val.medium.startsWith('http')) return val.medium;
    if (typeof val.small === 'string' && val.small.startsWith('http')) return val.small;
  }
  return null;
}

  if (provider === 'seatgeek') {
    const id = raw.id ? `sg_${raw.id}` : null;
    const title = (raw.title || raw.short_title)?.trim();
    const start = raw.datetime_utc || raw.datetime_local;
    if (!id || !title || !start) return null;

    // Support SeatGeek OAS3 end time fields: expected_experience_end and visible_until
    const end = raw.expected_experience_end || raw.visible_until || raw.enddatetime_utc || null;
    const venueObj = raw.venue || {};
    const venue = venueObj.name || 'Venue TBA';
    const city = venueObj.city || 'Local Area';
    const state = venueObj.state || '';
    const lat = Number(venueObj.location?.lat);
    const lon = Number(venueObj.location?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const taxType = raw.type || '';
    const taxonomies = (raw.taxonomies || []).map(t => t.name);
    const category = normalizeCategory(taxType, taxonomies);

    const lowestPrice = raw.stats?.lowest_price;
    const highestPrice = raw.stats?.highest_price;
    const price = normalizePrice(lowestPrice, highestPrice, lowestPrice === 0);

    // Support SeatGeek OAS3 ImageWithMetadata and performer hierarchy
    const primaryPerformer = (raw.performers || []).find(p => p.primary) || raw.performers?.[0] || {};
    const eventImg = extractImageUrl(raw.image)
      || extractImageUrl(raw.event_promotion?.promotion_image_url)
      || extractImageUrl(raw.promotion?.promotion_image_url);

    const performerImg = extractImageUrl(primaryPerformer.images?.huge)
      || extractImageUrl(primaryPerformer.images?.large)
      || extractImageUrl(primaryPerformer.images?.medium)
      || extractImageUrl(primaryPerformer.image)
      || extractImageUrl(primaryPerformer.all_images?.[0]);

    const venueImg = extractImageUrl(venueObj.images?.huge)
      || extractImageUrl(venueObj.images?.large)
      || extractImageUrl(venueObj.image);

    const image = eventImg || performerImg || venueImg || null;

    const performers = (raw.performers || []).map(p => p.name).filter(Boolean);
    const comedyMeta = category === 'comedy' ? normalizeComedyMetadata({
      title,
      description: raw.description,
      comedians: performers.length > 0 ? performers : undefined,
      lineup: (raw.performers || []).map(p => ({
        name: p.name,
        role: p.primary ? 'headliner' : 'comic'
      })),
      sourceType: 'commercial'
    }) : null;

    const racingMeta = category === 'racing' ? {
      discipline: /dirt/i.test(title + ' ' + venue) ? 'dirt_oval' : (/drag/i.test(title + ' ' + venue) ? 'drag_strip' : 'paved_short_track'),
      surface: /dirt/i.test(title + ' ' + venue) ? 'clay_dirt' : 'asphalt',
      trackType: /dirt/i.test(title + ' ' + venue) ? 'dirt_oval' : (/drag/i.test(title + ' ' + venue) ? 'drag_strip' : 'short_track_oval'),
      trackName: venue,
      sourceType: 'commercial'
    } : null;

    return {
      id,
      title,
      start_time: new Date(start).toISOString(),
      end_time: end ? new Date(end).toISOString() : null,
      venue_name: venue,
      city: state ? `${city}, ${state}` : city,
      neighborhood: null,
      venue_latitude: lat,
      venue_longitude: lon,
      category_tags: category === 'racing' ? ['racing', 'sports'] : [category],
      vibe_labels: [category, taxType.toLowerCase()].filter(Boolean),
      price_status: price.status,
      price_min: price.min,
      price_max: price.max,
      price_display: price.display,
      description: raw.description || `${title} at ${venue}`,
      canonical_url: raw.url || '',
      canonical_image_url: image,
      source: 'seatgeek',
      indoor_outdoor: category === 'racing' ? 'outdoor' : 'unknown',
      comedy: comedyMeta,
      racing: racingMeta,
      provenance: {
        provider: 'seatgeek',
        externalId: String(raw.id),
        fetchedAt: new Date().toISOString()
      }
    };
  }

  return null;
}

module.exports = {
  normalizeEvent,
  normalizeCategory,
  normalizePrice,
  resolveSourceQualityLabel
};
