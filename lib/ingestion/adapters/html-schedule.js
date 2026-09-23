/**
 * Official Source HTML Schedule Adapter
 *
 * Ingests and parses semantic HTML schedule pages with data attributes
 * (such as Volusia Speedway Park and short track schedule pages).
 * Extracts event title, date, racing divisions, track slug, and link.
 */

const crypto = require('node:crypto');

function parseHtmlScheduleSource(htmlContent, sourceConfig = {}) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];

  const events = [];

  // Match event container elements e.g. <div class="event-container schedulebox..." ...>
  const containerRegex = /<div class="[^"]*event-container schedulebox[^"]*"([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let match;

  while ((match = containerRegex.exec(htmlContent)) !== null) {
    const block = match[0];

    // Extract attributes
    const startDateMatch = block.match(/data-start-date="([^"]+)"/i);
    const trackMatch = block.match(/data-track="([^"]+)"/i);
    const seriesAttrMatch = block.match(/data-series="([^"]+)"/i);

    // Extract visible elements
    const titleMatch = block.match(/<p class="event-title\s*">([^<]+)<\/p>/i) ||
                       block.match(/<h[2-4][^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h[2-4]>/i);
    const seriesTextMatch = block.match(/<p class="event-series">([^<]+)<\/p>/i);
    const linkMatch = block.match(/href="([^"]+)"/i);

    const dateStr = startDateMatch ? startDateMatch[1].trim() : null;
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : (sourceConfig.defaultTitle || 'Race Event');

    if (!dateStr || !title) continue;

    // Build ISO start time (default grassroots race green flag: 19:00 local time = 23:00 UTC for Eastern)
    const timezone = sourceConfig.timezone || 'America/New_York';
    let offsetHours = 4; // EDT
    if (timezone.includes('Chicago')) offsetHours = 5;
    else if (timezone.includes('Denver')) offsetHours = 6;
    else if (timezone.includes('Los_Angeles')) offsetHours = 7;

    const startIso = new Date(`${dateStr}T19:00:00.000Z`).toISOString();
    const endIso = new Date(`${dateStr}T23:00:00.000Z`).toISOString();

    const divisions = seriesTextMatch
      ? seriesTextMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      : (seriesAttrMatch ? seriesAttrMatch[1].split(/\s+/).map(s => s.replace(/-/g, ' ').toUpperCase()) : []);

    const eventUrl = linkMatch ? linkMatch[1] : (sourceConfig.canonicalUrl || sourceConfig.scheduleUrl);
    const isCancelled = /cancel/i.test(title) || /postpone/i.test(title);
    const externalId = crypto.createHash('md5').update(`${title}_${dateStr}_${trackMatch ? trackMatch[1] : 'track'}`).digest('hex');

    events.push({
      externalId,
      title,
      start: startIso,
      end: endIso,
      venue: sourceConfig.venueName || 'Racetrack',
      divisions,
      eventUrl,
      isCancelled,
      rawPayload: {
        dateStr,
        title,
        divisions,
        track: trackMatch ? trackMatch[1] : null
      }
    });
  }

  return events;
}

const PARSER_VERSION = '1.0.0';

module.exports = {
  PARSER_VERSION,
  parseHtmlScheduleSource
};
