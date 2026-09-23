/**
 * lib/ingestion/adapters/ticketweb.js
 *
 * Reusable TicketWeb & Improv Platform Adapter
 *
 * Powers:
 * - The Comedy Store (West Hollywood, CA)
 * - Improv chain clubs: San Jose, Hollywood, Brea, Irvine, Pittsburgh, Addison, Milwaukee, etc.
 *
 * Core Rules:
 * - Extracts structured show items: title, civilDate, civilTime, timezone, direct ticket URL.
 * - Extracts direct TicketWeb cart / event checkout paths (e.g. ticketweb.com/event/<id> or improv.com/<club>/event/<id>).
 * - NEVER guesses or converts a generic venue calendar or homepage into a show link.
 * - If only generic calendar links exist, returns empty events so venue remains in needs_review.
 */

const crypto = require('node:crypto');

const PARSER_NAME = 'ticketweb';
const PARSER_VERSION = '1.0.0';

/**
 * Parses TicketWeb HTML or JSON response
 *
 * @param {string} content - HTML or JSON string
 * @param {Object} venueContext - Venue metadata (name, slug, timezone, city, state)
 * @returns {Object} { events: Array, contentHash: string, parserName: string, parserVersion: string }
 */
function parseTicketWebSchedule(content, venueContext = {}) {
  const contentHash = crypto.createHash('sha256').update(content || '').digest('hex');
  const events = [];
  if (!content || typeof content !== 'string') {
    return { events, contentHash, parserName: PARSER_NAME, parserVersion: PARSER_VERSION };
  }

  // 1. Check for embedded JSON payload (e.g. state payload or initialData)
  const jsonMatch = content.match(/<script[^>]*id=["'](?:__NEXT_DATA__|__TICKETWEB_DATA__)["'][^>]*>([\s\S]*?)<\/script>/i) ||
                    content.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);

  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const rawList = data.events || (data.props && data.props.pageProps && data.props.pageProps.events) || [];
      for (const item of rawList) {
        if (!item.name || !item.startDate) continue;
        const ticketUrl = item.url || item.ticketUrl;
        // Gate: Must have direct event/checkout URL
        if (!ticketUrl || !/\/event\/|\/tickets\//i.test(ticketUrl)) continue;

        const d = new Date(item.startDate);
        const civilDate = item.startDate.slice(0, 10);
        const civilTime = item.startDate.length >= 16 ? item.startDate.slice(11, 16) : '20:00';

        events.push({
          externalId: item.id || `tw_${crypto.createHash('md5').update(`${item.name}_${civilDate}`).digest('hex')}`,
          title: item.name,
          performer: item.performer || item.name,
          venue_name: venueContext.name || item.venueName,
          venue_slug: venueContext.slug,
          city: venueContext.city,
          state: venueContext.state,
          civilDate,
          civilTime,
          timezone: venueContext.timezone || 'America/Los_Angeles',
          ticket_url: ticketUrl,
          url: ticketUrl,
          priceDisplay: item.price ? `$${item.price}` : null
        });
      }
    } catch (_) {}
  }

  // 2. Regular expression extraction for TicketWeb event card patterns
  // Pattern: <a href="https://www.ticketweb.com/event/..." class="...event-title...">Title</a> ... date/time
  const cardRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:ticketweb\.com\/event\/|improv\.com\/[^\/]+\/event\/)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardRegex.exec(content)) !== null) {
    const rawUrl = match[1];
    const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();

    // Check surrounding context for date (YYYY-MM-DD or Month DD, YYYY)
    const contextSlice = content.slice(Math.max(0, match.index - 200), Math.min(content.length, match.index + 500));
    const dateMatch = contextSlice.match(/(\d{4}-\d{2}-\d{2})/) ||
                      contextSlice.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i);

    if (rawTitle && dateMatch && !/\/calendar\/?$/i.test(rawUrl)) {
      let civilDate = '';
      if (dateMatch[1] && dateMatch[1].includes('-')) {
        civilDate = dateMatch[1];
      } else {
        try {
          const parsed = new Date(dateMatch[0]);
          civilDate = parsed.toISOString().slice(0, 10);
        } catch (_) {}
      }

      if (civilDate) {
        events.push({
          externalId: `tw_${crypto.createHash('md5').update(`${rawTitle}_${civilDate}`).digest('hex')}`,
          title: rawTitle,
          performer: rawTitle,
          venue_name: venueContext.name,
          venue_slug: venueContext.slug,
          city: venueContext.city,
          state: venueContext.state,
          civilDate,
          civilTime: '20:00', // default evening showtime if not explicitly in card
          timezone: venueContext.timezone || 'America/Los_Angeles',
          ticket_url: rawUrl,
          url: rawUrl
        });
      }
    }
  }

  return {
    events,
    contentHash,
    parserName: PARSER_NAME,
    parserVersion: PARSER_VERSION
  };
}

module.exports = {
  PARSER_NAME,
  PARSER_VERSION,
  parseTicketWebSchedule
};
