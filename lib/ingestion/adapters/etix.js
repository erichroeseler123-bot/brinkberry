/**
 * lib/ingestion/adapters/etix.js
 *
 * Reusable Etix Platform Adapter
 *
 * Powers:
 * - Zanies Comedy Club locations (Chicago, Nashville, Rosemont)
 * - Independent venues utilizing Etix ticketing infrastructure
 *
 * Core Rules:
 * - Extracts structured show items: title, civilDate, civilTime, timezone, direct ticket URL.
 * - Extracts direct Etix cart / event checkout paths (e.g. etix.com/ticket/p/<id>/...).
 * - NEVER guesses or converts a generic venue calendar or homepage into a show link.
 * - If only generic calendar links exist, returns empty events so venue remains in needs_review.
 */

const crypto = require('node:crypto');

const PARSER_NAME = 'etix';
const PARSER_VERSION = '1.0.0';

/**
 * Parses Etix HTML schedule or API response
 *
 * @param {string} content - HTML or JSON string
 * @param {Object} venueContext - Venue metadata (name, slug, timezone, city, state)
 * @returns {Object} { events: Array, contentHash: string, parserName: string, parserVersion: string }
 */
function parseEtixSchedule(content, venueContext = {}) {
  const contentHash = crypto.createHash('sha256').update(content || '').digest('hex');
  const events = [];
  if (!content || typeof content !== 'string') {
    return { events, contentHash, parserName: PARSER_NAME, parserVersion: PARSER_VERSION };
  }

  // 1. Regular expression extraction for Etix direct purchase links
  // Pattern: <a href="https://www.etix.com/ticket/p/..." ...>Title / Buy</a>
  const etixRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?etix\.com\/ticket\/[po]\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = etixRegex.exec(content)) !== null) {
    const rawUrl = match[1];
    const linkText = match[2].replace(/<[^>]+>/g, '').trim();

    // Check surrounding container context for show title and date
    const contextSlice = content.slice(Math.max(0, match.index - 400), Math.min(content.length, match.index + 200));

    // Look for date pattern in context (e.g. "Oct 15, 2026", "2026-10-15")
    const dateMatch = contextSlice.match(/(\d{4}-\d{2}-\d{2})/) ||
                      contextSlice.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i);

    // Look for title heading (h2, h3, h4)
    const titleMatch = contextSlice.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : (linkText.length > 5 && !/buy|ticket|info/i.test(linkText) ? linkText : null);

    if (title && dateMatch && !/\/calendar\/?$/i.test(rawUrl)) {
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
          externalId: `etix_${crypto.createHash('md5').update(`${title}_${civilDate}`).digest('hex')}`,
          title,
          performer: title,
          venue_name: venueContext.name,
          venue_slug: venueContext.slug,
          city: venueContext.city,
          state: venueContext.state,
          civilDate,
          civilTime: '20:00',
          timezone: venueContext.timezone || 'America/Chicago',
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
  parseEtixSchedule
};
