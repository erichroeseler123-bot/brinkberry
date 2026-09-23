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

function extractImageUrl(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    return null;
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const img = extractImageUrl(item);
      if (img) return img;
    }
    return null;
  }
  if (typeof val === 'object') {
    return extractImageUrl(val.huge) ||
           extractImageUrl(val.large) ||
           extractImageUrl(val.banner) ||
           extractImageUrl(val.original) ||
           extractImageUrl(val.medium) ||
           extractImageUrl(val.small) ||
           extractImageUrl(val.url) ||
           extractImageUrl(val.contentUrl) ||
           extractImageUrl(val.thumbnailUrl) ||
           extractImageUrl(val.image);
  }
  return null;
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
      image: bestImg?.url || null,
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

    // 1. Event-specific source image
    const eventImg = extractImageUrl(raw.image)
      || extractImageUrl(raw.event_promotion?.promotion_image_url)
      || extractImageUrl(raw.promotion?.promotion_image_url);

    // 2. Provider performer image (scan primary performer first, then every performer in the list)
    const performersList = Array.isArray(raw.performers) ? raw.performers : [];
    const primaryPerformer = performersList.find(p => p.primary) || performersList[0] || null;

    function getPerformerImage(p) {
      if (!p) return null;
      return extractImageUrl(p.images?.huge)
        || extractImageUrl(p.images?.large)
        || extractImageUrl(p.images?.banner)
        || extractImageUrl(p.images?.medium)
        || extractImageUrl(p.images?.small)
        || extractImageUrl(p.images)
        || extractImageUrl(p.image)
        || extractImageUrl(p.banner)
        || extractImageUrl(p.all_images);
    }

    let performerImg = getPerformerImage(primaryPerformer);
    if (!performerImg) {
      for (const p of performersList) {
        performerImg = getPerformerImage(p);
        if (performerImg) break;
      }
    }

    // 3. Venue image
    const venueImg = extractImageUrl(venueObj.images?.huge)
      || extractImageUrl(venueObj.images?.large)
      || extractImageUrl(venueObj.images?.medium)
      || extractImageUrl(venueObj.images?.small)
      || extractImageUrl(venueObj.images)
      || extractImageUrl(venueObj.image);

    // Strict priority: Event image -> Performer image -> Venue image
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
      image: image,
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

const CATEGORY_FALLBACK_IMAGES = {
  comedy: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
  racing: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
  music: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
  theater: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
  arts: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop',
  sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop',
  civic: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop',
  community: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&auto=format&fit=crop',
  festival: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&auto=format&fit=crop',
  outdoor: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&auto=format&fit=crop',
  food: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop',
  family: 'https://images.unsplash.com/photo-1472653431158-6364773b2a56?w=800&auto=format&fit=crop',
  other: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop'
};

const CATEGORY_FALLBACK_POOLS = {
  civic: [
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop'
  ],
  music: [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop'
  ],
  comedy: [
    'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop'
  ],
  racing: [
    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800&auto=format&fit=crop'
  ],
  community: [
    'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&auto=format&fit=crop'
  ],
  theater: [
    'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=800&auto=format&fit=crop'
  ],
  arts: [
    'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop'
  ],
  sports: [
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop'
  ],
  festival: [
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop'
  ],
  outdoor: [
    'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop'
  ],
  food: [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop'
  ],
  family: [
    'https://images.unsplash.com/photo-1472653431158-6364773b2a56?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop'
  ],
  other: [
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop'
  ]
};

function getCategoryFallbackImage(category, seed) {
  const norm = String(category || '').toLowerCase().trim();
  const pool = CATEGORY_FALLBACK_POOLS[norm] || CATEGORY_FALLBACK_POOLS.other;
  if (seed && typeof seed === 'string') {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    }
    const idx = Math.abs(hash) % pool.length;
    return pool[idx];
  }
  return pool[0] || CATEGORY_FALLBACK_IMAGES[norm] || CATEGORY_FALLBACK_IMAGES.other;
}

module.exports = {
  normalizeEvent,
  normalizeCategory,
  normalizePrice,
  resolveSourceQualityLabel,
  extractImageUrl,
  CATEGORY_FALLBACK_IMAGES,
  CATEGORY_FALLBACK_POOLS,
  getCategoryFallbackImage
};
