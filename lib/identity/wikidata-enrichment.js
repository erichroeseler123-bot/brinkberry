/**
 * Wikipedia & Wikidata Entity Enrichment Layer
 *
 * PURPOSE:
 * Provides background entity resolution, disambiguation, and biographical/geographic
 * enrichment for comedians and venues.
 *
 * STRICT BOUNDARIES (MANDATORY INVARIANTS):
 * 1. Wikipedia/Wikidata identifies who an artist is or what a venue is.
 * 2. Wikipedia/Wikidata NEVER confirms an event, date, showtime, lineup, ticket availability,
 *    cancellation, or live venue operation.
 * 3. Exact performances MUST STILL BE CONFIRMED by the official venue calendar, artist tour page,
 *    or direct ticketing portal.
 * 4. Enrichment records are stamped with source: 'entity_enrichment_wikidata'.
 *    They NEVER receive 'confirmed_by_official_calendar'.
 *
 * ARCHITECTURAL MODEL:
 *   Wikipedia / Wikidata
 *     → identifies the artist or venue (disambiguation, aliases, bios, geo-anchors)
 *   Official venue calendar / artist tour page
 *     → confirms the exact dated performance
 *   Ticket page
 *     → confirms the current purchase destination
 */

// In-memory LRU-style caches
const comedianCache = new Map();
const venueCache = new Map();

const COMEDIAN_OCCUPATION_PATTERNS = [
  /comedian/i,
  /stand-up/i,
  /humorist/i,
  /comic/i,
  /satirist/i,
  /actor/i,
  /improvis/i,
  /podcaster/i
];

const VENUE_PATTERNS = [
  /comedy\s*club/i,
  /theatre|theater/i,
  /performing\s*arts/i,
  /music\s*hall/i,
  /entertainment\s*venue/i,
  /auditorium/i
];

/**
 * Searches Wikidata entities by text query
 */
async function searchWikidataEntities(query, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const limit = options.limit || 5;
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=${limit}`;

  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'BrinkberryBot/1.0 (https://brinkberry.com; contact@brinkberry.com)' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.search) ? data.search : [];
  } catch (err) {
    if (options.verbose) console.warn('[Wikidata] Search error:', err.message);
    return [];
  }
}

/**
 * Fetches Wikidata detailed claims, aliases, and sitelinks for an entity ID
 */
async function getWikidataEntityDetails(wikidataId, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(wikidataId)}&format=json&props=info|aliases|claims|sitelinks`;

  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'BrinkberryBot/1.0 (https://brinkberry.com; contact@brinkberry.com)' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.entities?.[wikidataId] || null;
  } catch (err) {
    if (options.verbose) console.warn('[Wikidata] Entity details error:', err.message);
    return null;
  }
}

/**
 * Fetches brief Wikipedia extract/summary if available
 */
async function getWikipediaSummary(wikipediaArticleTitle, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const cleanTitle = encodeURIComponent(wikipediaArticleTitle.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${cleanTitle}`;

  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'BrinkberryBot/1.0 (https://brinkberry.com; contact@brinkberry.com)' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title,
      description: data.description,
      extract: data.extract,
      pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${cleanTitle}`
    };
  } catch (err) {
    return null;
  }
}

/**
 * Enriches a comedian entity using Wikidata and Wikipedia.
 *
 * Improves:
 * - Canonical spelling & aliases
 * - Disambiguation against non-performer entities (e.g. politicians, athletes)
 * - Biography extract and Wikipedia article
 * - Social handles / official website
 */
async function enrichComedianEntity(performerName, options = {}) {
  if (!performerName || typeof performerName !== 'string') return null;
  const cleanName = performerName.trim();
  const cacheKey = cleanName.toLowerCase();

  if (!options.bypassCache && comedianCache.has(cacheKey)) {
    return comedianCache.get(cacheKey);
  }

  const searchResults = await searchWikidataEntities(cleanName, options);
  if (!searchResults.length) {
    const nullResult = {
      enriched: false,
      queryName: cleanName,
      source: 'entity_enrichment_wikidata',
      reason: 'No Wikidata entities matched'
    };
    comedianCache.set(cacheKey, nullResult);
    return nullResult;
  }

  // Disambiguation: Find the best match that is an active performer/comedian
  let bestCandidate = null;
  for (const c of searchResults) {
    const desc = c.description || '';
    const isPerformer = COMEDIAN_OCCUPATION_PATTERNS.some(p => p.test(desc));
    if (isPerformer) {
      bestCandidate = c;
      break;
    }
  }

  // Enforce performer disambiguation to prevent false matches (e.g. botanists or politicians with the same name)
  if (!bestCandidate) {
    const unverified = {
      enriched: false,
      queryName: cleanName,
      source: 'entity_enrichment_wikidata',
      reason: 'Entity found but failed performer disambiguation'
    };
    comedianCache.set(cacheKey, unverified);
    return unverified;
  }

  // Fetch full entity details
  const details = await getWikidataEntityDetails(bestCandidate.id, options);
  const aliases = details?.aliases?.en?.map(a => a.value) || [];

  // Wikipedia article
  const wikiTitle = details?.sitelinks?.enwiki?.title;
  let wikiSummary = null;
  if (wikiTitle) {
    wikiSummary = await getWikipediaSummary(wikiTitle, options);
  }

  // Extract official website (P856) or social IDs (Twitter P2002, Instagram P2003)
  const officialSite = details?.claims?.P856?.[0]?.mainsnak?.datavalue?.value || null;
  const twitterHandle = details?.claims?.P2002?.[0]?.mainsnak?.datavalue?.value || null;
  const instagramHandle = details?.claims?.P2003?.[0]?.mainsnak?.datavalue?.value || null;

  const enrichedRecord = {
    enriched: true,
    source: 'entity_enrichment_wikidata',
    isEventEvidence: false,
    cannotConfirmPerformance: true,
    wikidataId: bestCandidate.id,
    canonicalName: bestCandidate.label || cleanName,
    disambiguationDescription: bestCandidate.description || wikiSummary?.description || null,
    aliases,
    wikipediaUrl: wikiSummary?.pageUrl || (wikiTitle ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}` : null),
    biographySummary: wikiSummary?.extract || null,
    officialWebsite: officialSite,
    socialProfiles: {
      twitter: twitterHandle ? `https://twitter.com/${twitterHandle}` : null,
      instagram: instagramHandle ? `https://instagram.com/${instagramHandle}` : null
    },
    licensing: {
      attributionRequired: true,
      textLicense: wikiSummary ? 'CC BY-SA 4.0' : null,
      dataLicense: 'CC0 1.0 Universal',
      sourceUrl: wikiSummary?.pageUrl || `https://www.wikidata.org/wiki/${bestCandidate.id}`,
      attributionText: wikiSummary
        ? `Biographical extract from Wikipedia ("${wikiSummary.title}"), licensed under CC BY-SA 4.0.`
        : `Entity metadata from Wikidata (${bestCandidate.id}), licensed under CC0 1.0 Universal.`
    },
    usageNotice: 'Strictly for entity disambiguation, alias resolution, and cross-source reconciliation. Sourced content displayed publicly requires CC BY-SA 4.0 attribution.',
    enrichedAt: new Date().toISOString()
  };

  comedianCache.set(cacheKey, enrichedRecord);
  return enrichedRecord;
}

/**
 * Enriches a venue entity using Wikidata and Wikipedia.
 *
 * Improves:
 * - Canonical venue name & historical names
 * - Geographical coordinates & city disambiguation
 * - Official website URL for domain match verification
 */
async function enrichVenueEntity(venueName, city = '', options = {}) {
  if (!venueName || typeof venueName !== 'string') return null;
  const cleanVenue = venueName.trim();
  const cleanCity = (city || '').trim();
  const query = cleanCity ? `${cleanVenue} ${cleanCity}` : cleanVenue;
  const cacheKey = `${cleanVenue.toLowerCase()}_${cleanCity.toLowerCase()}`;

  if (!options.bypassCache && venueCache.has(cacheKey)) {
    return venueCache.get(cacheKey);
  }

  const searchResults = await searchWikidataEntities(query, options);
  let bestCandidate = null;

  for (const c of searchResults) {
    const desc = c.description || '';
    const isVenue = VENUE_PATTERNS.some(p => p.test(desc));
    const matchesCity = cleanCity ? desc.toLowerCase().includes(cleanCity.toLowerCase()) : true;
    if (isVenue && matchesCity) {
      bestCandidate = c;
      break;
    }
  }

  if (!bestCandidate && searchResults.length > 0) {
    // Check if the top result description matches venue patterns
    const top = searchResults[0];
    if (VENUE_PATTERNS.some(p => p.test(top.description || ''))) {
      bestCandidate = top;
    }
  }

  if (!bestCandidate) {
    const nullVenue = {
      enriched: false,
      queryVenue: cleanVenue,
      queryCity: cleanCity,
      source: 'entity_enrichment_wikidata',
      reason: 'No matching venue entity found'
    };
    venueCache.set(cacheKey, nullVenue);
    return nullVenue;
  }

  const details = await getWikidataEntityDetails(bestCandidate.id, options);
  const aliases = details?.aliases?.en?.map(a => a.value) || [];

  const wikiTitle = details?.sitelinks?.enwiki?.title;
  let wikiSummary = null;
  if (wikiTitle) {
    wikiSummary = await getWikipediaSummary(wikiTitle, options);
  }

  const coords = details?.claims?.P625?.[0]?.mainsnak?.datavalue?.value || null;
  const officialSite = details?.claims?.P856?.[0]?.mainsnak?.datavalue?.value || null;

  const enrichedRecord = {
    enriched: true,
    source: 'entity_enrichment_wikidata',
    isEventEvidence: false,
    cannotConfirmPerformance: true,
    wikidataId: bestCandidate.id,
    canonicalName: bestCandidate.label || cleanVenue,
    historicalNames: aliases,
    disambiguationDescription: bestCandidate.description || wikiSummary?.description || null,
    wikipediaUrl: wikiSummary?.pageUrl || null,
    historyExtract: wikiSummary?.extract || null,
    officialWebsite: officialSite,
    coordinates: coords ? { lat: coords.latitude, lon: coords.longitude } : null,
    licensing: {
      attributionRequired: true,
      textLicense: wikiSummary ? 'CC BY-SA 4.0' : null,
      dataLicense: 'CC0 1.0 Universal',
      sourceUrl: wikiSummary?.pageUrl || `https://www.wikidata.org/wiki/${bestCandidate.id}`,
      attributionText: wikiSummary
        ? `Venue extract from Wikipedia ("${wikiSummary.title}"), licensed under CC BY-SA 4.0.`
        : `Entity metadata from Wikidata (${bestCandidate.id}), licensed under CC0 1.0 Universal.`
    },
    usageNotice: 'Strictly for entity disambiguation, alias resolution, and cross-source reconciliation. Sourced content displayed publicly requires CC BY-SA 4.0 attribution.',
    enrichedAt: new Date().toISOString()
  };

  venueCache.set(cacheKey, enrichedRecord);
  return enrichedRecord;
}

/**
 * Attaches Wikidata entity enrichment to a canonical or feed event.
 *
 * ENFORCES STRICT INVARIANTS:
 * - Stamps provenance as 'entity_enrichment_wikidata'
 * - NEVER upgrades or changes confirmationStatus to 'confirmed_by_official_calendar'
 * - Throws error if caller attempts to use this layer as event evidence.
 */
function attachEntityEnrichment(eventRecord, enrichment = {}) {
  if (!eventRecord || typeof eventRecord !== 'object') {
    throw new Error('Invalid event record passed to attachEntityEnrichment');
  }

  // Invariant Guard: Prevent entity enrichment from masquerading as event evidence
  if (enrichment.confirmationStatus === 'confirmed_by_official_calendar') {
    throw new Error(
      'SECURITY INVARIANT VIOLATION: Wikipedia/Wikidata entity enrichment cannot confirm event dates or set confirmed_by_official_calendar.'
    );
  }

  const enrichedCopy = { ...eventRecord };

  enrichedCopy.entityEnrichment = {
    source: 'entity_enrichment_wikidata',
    isEventEvidence: false,
    cannotConfirmPerformance: true,
    comedian: enrichment.comedian || null,
    venue: enrichment.venue || null,
    enrichedAt: new Date().toISOString()
  };

  return enrichedCopy;
}

module.exports = {
  enrichComedianEntity,
  enrichVenueEntity,
  attachEntityEnrichment,
  searchWikidataEntities,
  getWikidataEntityDetails,
  getWikipediaSummary,
  comedianCache,
  venueCache
};
