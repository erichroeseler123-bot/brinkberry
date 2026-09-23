/**
 * Official Source Schema.org JSON-LD Event Adapter
 *
 * Extracts and parses Schema.org `Event`, `ComedyEvent`, `SportsEvent` objects
 * from <script type="application/ld+json"> blocks in official venue pages.
 * Supports @graph containers, single Event objects, and nested subEvents.
 */

const crypto = require('node:crypto');

function extractJsonLdEvents(htmlContent, sourceConfig = {}) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];

  const events = [];
  const scriptRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      const items = [];

      if (Array.isArray(parsed)) {
        items.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed['@graph'])) {
          items.push(...parsed['@graph']);
        } else {
          items.push(parsed);
        }

        // Unpack nested events arrays commonly emitted by ticketing platforms (e.g. SeatEngine Place.Events)
        const parentPlaceName = (parsed['@type'] === 'Place' || parsed['@type'] === 'ComedyClub') ? parsed.name : null;
        const candidateNestedArrays = [parsed.Events, parsed.events, parsed.subEvent, parsed.subEvents];
        for (const nested of candidateNestedArrays) {
          if (Array.isArray(nested)) {
            for (const child of nested) {
              if (child && typeof child === 'object') {
                if (parentPlaceName && !child.location) {
                  child.location = { name: parentPlaceName };
                }
                items.push(child);
              }
            }
          } else if (nested && typeof nested === 'object') {
            if (parentPlaceName && !nested.location) {
              nested.location = { name: parentPlaceName };
            }
            items.push(nested);
          }
        }
      }


      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        const isEventType = type === 'Event' || type === 'ComedyEvent' || type === 'SportsEvent' ||
                            (Array.isArray(type) && type.some(t => ['Event', 'ComedyEvent', 'SportsEvent'].includes(t)));

        if (!isEventType) continue;

        const title = item.name || item.headline || sourceConfig.defaultTitle;
        const startDate = item.startDate;
        if (!title || !startDate) continue;

        const startIso = new Date(startDate).toISOString();
        let endIso = item.endDate ? new Date(item.endDate).toISOString() : null;
        if (!endIso) {
          endIso = new Date(new Date(startIso).getTime() + 2 * 3600e3).toISOString();
        }

        const venue = item.location?.name || sourceConfig.venueName || 'Venue';
        const offer = item.offers ? (Array.isArray(item.offers) ? item.offers[0] : item.offers) : null;
        const offerUrl = (typeof offer?.url === 'string' && offer.url.startsWith('http')) ? offer.url : null;
        const eventUrl = item.url || offerUrl || sourceConfig.canonicalUrl || null;
        const isCancelled = item.eventStatus === 'https://schema.org/EventCancelled' ||
                            item.eventStatus === 'EventCancelled';

        const externalId = item['@id'] ||
                           (item.identifier ? String(item.identifier) : null) ||
                           crypto.createHash('md5').update(`${title}_${startIso}`).digest('hex');

        let priceDisplay = null;
        if (offer && offer.price != null) {
          priceDisplay = `$${offer.price}`;
        }

        events.push({
          externalId,
          title,
          start: startIso,
          end: endIso,
          venue,
          eventUrl,
          priceDisplay,
          isCancelled,
          rawPayload: item
        });
      }
    } catch (err) {
      // Ignore malformed JSON-LD script blocks
    }
  }

  return events;
}

const PARSER_VERSION = '1.0.0';

module.exports = {
  PARSER_VERSION,
  extractJsonLdEvents
};
