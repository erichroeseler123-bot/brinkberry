/**
 * Schema.org JSON-LD Official Source Adapter
 *
 * Extracts structured Event, ComedyEvent, and SportsEvent data embedded in official
 * venue and track websites.
 */

const crypto = require('crypto');

function parseJsonLdFeed(htmlContent, options = {}) {
  const { sourceConfig = {}, fetchedAt = new Date().toISOString() } = options;
  if (!htmlContent || typeof htmlContent !== 'string') {
    return { events: [], cancelledIds: [], contentHash: null };
  }

  const hash = crypto.createHash('sha256').update(htmlContent).digest('hex').slice(0, 16);
  const events = [];
  const cancelledIds = [];

  // Match all <script type="application/ld+json"> blocks
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      const items = Array.isArray(parsed)
        ? parsed
        : (parsed['@graph'] ? parsed['@graph'] : [parsed]);

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const type = item['@type'];
        const isEvent = type === 'Event' || type === 'ComedyEvent' || type === 'SportsEvent' ||
          (Array.isArray(type) && type.some(t => ['Event', 'ComedyEvent', 'SportsEvent'].includes(t)));

        if (!isEvent) continue;

        const title = item.name || item.headline;
        const startDate = item.startDate;
        if (!title || !startDate) continue;

        const id = item['@id'] || item.identifier || item.url ||
          `jsonld_${crypto.createHash('md5').update(title + startDate).digest('hex').slice(0, 12)}`;

        const eventStatus = item.eventStatus || '';
        const isCancelled = typeof eventStatus === 'string' && (
          eventStatus.includes('EventCancelled') ||
          eventStatus.toLowerCase().includes('cancelled')
        );

        if (isCancelled) {
          cancelledIds.push(id);
          continue;
        }

        const performer = item.performer
          ? (Array.isArray(item.performer) ? item.performer.map(p => p.name || p).filter(Boolean) : [item.performer.name || item.performer])
          : [];

        const ticketUrl = item.offers?.url || item.url || sourceConfig.canonicalUrl || null;
        const price = item.offers?.price != null ? `$${item.offers.price}` : null;

        events.push({
          id,
          title: String(title).trim(),
          start: new Date(startDate).toISOString(),
          end: item.endDate ? new Date(item.endDate).toISOString() : null,
          description: item.description || null,
          location: item.location?.name || sourceConfig.facilityName || sourceConfig.venueName || null,
          officialUrl: ticketUrl,
          priceDisplay: price,
          lineup: performer,
          isCancelled: false,
          sourceEvidence: {
            sourceId: sourceConfig.id || 'jsonld_feed',
            sourceType: 'official_box_office',
            confirmationStatus: 'confirmed_by_official_calendar',
            contentHash: hash,
            fetchedAt,
            exactConfirmationFields: {
              title: Boolean(title),
              date: Boolean(startDate)
            }
          }
        });
      }
    } catch (_) {
      // Ignore malformed JSON in unneeded blocks
    }
  }

  return {
    events,
    cancelledIds,
    contentHash: hash
  };
}

module.exports = {
  parseJsonLdFeed
};
