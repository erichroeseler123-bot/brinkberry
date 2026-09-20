/**
 * Canonical Event Normalizer for Dynamic Providers
 *
 * Normalizes disparate API schemas (Ticketmaster, SeatGeek, etc.) into
 * the unified Brinkberry event data model.
 */

function normalizeCategory(rawCategory, tags = []) {
  const text = `${rawCategory || ''} ${(tags || []).join(' ')}`.toLowerCase();
  if (/music|concert|jazz|rock|band|orchestra|dj|rap|hip hop|folk|indie|acoustic/i.test(text)) return 'music';
  if (/comedy|standup|improv/i.test(text)) return 'comedy';
  if (/theater|theatre|broadway|musical|opera|play|stage/i.test(text)) return 'theater';
  if (/art|exhibit|gallery|museum|sculpture|painting/i.test(text)) return 'arts';
  if (/sport|game|nba|nfl|mlb|nhl|soccer|racing|match|tournament/i.test(text)) return 'sports';
  if (/kid|family|children|youth|parent/i.test(text)) return 'family';
  if (/food|drink|beer|wine|dining|tasting|brewery|cocktail/i.test(text)) return 'food';
  if (/outdoor|nature|hike|park|run|5k|walk/i.test(text)) return 'outdoor';
  return 'other';
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
      category_tags: [category],
      vibe_labels: [category, segment.toLowerCase()].filter(Boolean),
      price_status: price.status,
      price_min: price.min,
      price_max: price.max,
      price_display: price.display,
      description: raw.info || raw.pleaseNote || `${title} at ${venue}`,
      canonical_url: raw.url || '',
      canonical_image_url: bestImg?.url || null,
      source: 'ticketmaster',
      indoor_outdoor: 'unknown',
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
      category_tags: [category],
      vibe_labels: [category, taxType.toLowerCase()].filter(Boolean),
      price_status: price.status,
      price_min: price.min,
      price_max: price.max,
      price_display: price.display,
      description: raw.description || `${title} at ${venue}`,
      canonical_url: raw.url || '',
      canonical_image_url: image,
      source: 'seatgeek',
      indoor_outdoor: 'unknown',
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
  normalizePrice
};
