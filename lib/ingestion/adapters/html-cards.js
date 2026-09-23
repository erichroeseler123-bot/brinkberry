/**
 * Official Source HTML Event Cards Adapter
 *
 * Ingests and parses structured HTML event cards with date-time URL slugs
 * (such as The Stand NYC show list).
 * Extracts title, exact date & start time from URL slug, room/stage,
 * comedians/performers, image, and ticket link.
 */

const crypto = require('node:crypto');

function parseHtmlCardsSource(htmlContent, sourceConfig = {}) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];

  const events = [];

  // Match show rows e.g. <div class="row show_row ...">
  const rowRegex = /<div class="row show_row\s*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let match;

  while ((match = rowRegex.exec(htmlContent)) !== null) {
    const row = match[0];

    const titleMatch = row.match(/<h2 class="showtitle[^"]*"><a href="([^"]+)">([^<]+)<\/a><\/h2>/i);
    if (!titleMatch) continue;

    const eventUrl = titleMatch[1].trim();
    const title = titleMatch[2].replace(/&amp;/g, '&').trim();

    // Extract exact ISO timestamp encoded in slug: e.g. /2026-09-20-190000-the-stand-presents
    const dateMatch = eventUrl.match(/\/(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})-/);
    if (!dateMatch) continue;

    const [_, ymd, hh, mm, ss] = dateMatch;

    // Local civil start time converted to ISO
    const timezone = sourceConfig.timezone || 'America/New_York';
    let offsetHours = 4; // EDT
    if (timezone.includes('Chicago')) offsetHours = 5;
    else if (timezone.includes('Denver')) offsetHours = 6;
    else if (timezone.includes('Los_Angeles')) offsetHours = 7;

    const startIso = new Date(Date.UTC(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(5, 7)) - 1,
      Number(ymd.slice(8, 10)),
      Number(hh) + offsetHours,
      Number(mm),
      Number(ss)
    )).toISOString();

    const endIso = new Date(new Date(startIso).getTime() + 1.75 * 3600e3).toISOString();

    const roomMatch = row.match(/list-show-room[^>]*>([^<]+)</i);
    const imgMatch = row.match(/<img [^>]*src="([^"]+)"/i);
    const idMatch = eventUrl.match(/\/show\/(\d+)\//);

    const room = roomMatch ? roomMatch[1].trim() : 'Main Room';
    const image = imgMatch ? imgMatch[1].trim() : null;
    const externalId = idMatch ? `stand_${idMatch[1]}` : crypto.createHash('md5').update(eventUrl).digest('hex');
    const isCancelled = /cancel/i.test(title);

    // Extract comedians list from title if structured (e.g. "The Stand Presents: Comic A, Comic B, & More!")
    let comedians = [];
    if (title.includes(':')) {
      const namesPart = title.split(':')[1].replace(/& More!/i, '').replace(/and more!/i, '');
      comedians = namesPart.split(/,|&/).map(n => n.trim()).filter(n => n.length > 2);
    }

    events.push({
      externalId,
      title,
      start: startIso,
      end: endIso,
      venue: sourceConfig.venueName || 'The Stand NYC',
      room,
      comedians,
      image,
      eventUrl,
      isCancelled,
      rawPayload: {
        eventUrl,
        title,
        room,
        ymd,
        hh
      }
    });
  }

  return events;
}

const PARSER_VERSION = '1.0.0';

module.exports = {
  PARSER_VERSION,
  parseHtmlCardsSource
};
