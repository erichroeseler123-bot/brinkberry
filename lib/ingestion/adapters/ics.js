/**
 * Official Source ICS / iCalendar Adapter
 *
 * Ingests and parses standard RFC 5545 iCalendar feeds (.ics).
 * Extracts exact event title, start time, end time, location, description,
 * external UID, URL, and cancellation/status fields.
 */

const crypto = require('node:crypto');

function parseIcsDateTime(rawStr, timezone = 'America/Denver') {
  if (!rawStr || typeof rawStr !== 'string') return null;
  const cleaned = rawStr.trim().replace(/^VALUE=DATE(-TIME)?:/i, '');

  // 1. Format: YYYYMMDDTHHMMSSZ (UTC)
  const utcMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const [_, y, m, d, hh, mm, ss] = utcMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))).toISOString();
  }

  // 2. Format: YYYYMMDDTHHMMSS (Local timezone)
  const localMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const [_, y, m, d, hh, mm, ss] = localMatch;
    // Simple civil time offset calculation based on timezone
    let offsetHours = 6; // default MST/MDT approximation
    if (timezone.includes('Denver')) offsetHours = 6;
    else if (timezone.includes('Chicago')) offsetHours = 5;
    else if (timezone.includes('New_York')) offsetHours = 4;
    else if (timezone.includes('Los_Angeles')) offsetHours = 7;

    const dateObj = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) + offsetHours, Number(mm), Number(ss)));
    return dateObj.toISOString();
  }

  // 3. Format: YYYYMMDD (All day)
  const allDayMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (allDayMatch) {
    const [_, y, m, d] = allDayMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 18, 0, 0)).toISOString();
  }

  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseIcsSource(icsContent, sourceConfig = {}) {
  if (!icsContent || typeof icsContent !== 'string') return [];

  const lines = icsContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const events = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Unfold lines starting with space or tab
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].slice(1);
    }

    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (current && current.summary && current.dtstart) {
        const isCancelled = Boolean(
          (current.status && /cancel/i.test(current.status)) ||
          /\[cancelled\]/i.test(current.summary)
        );

        const startIso = parseIcsDateTime(current.dtstart, sourceConfig.timezone);
        if (!startIso) {
          current = null;
          continue;
        }

        let endIso = current.dtend ? parseIcsDateTime(current.dtend, sourceConfig.timezone) : null;
        if (!endIso) {
          endIso = new Date(new Date(startIso).getTime() + 2 * 3600e3).toISOString();
        }

        const title = current.summary.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
        const venue = current.location ? current.location.replace(/\\,/g, ',').trim() : (sourceConfig.venueName || 'Venue');
        const desc = current.description ? current.description.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim() : title;
        const uid = current.uid ? current.uid.trim() : crypto.createHash('md5').update(`${title}_${startIso}`).digest('hex');
        const eventUrl = current.url ? current.url.trim() : (sourceConfig.canonicalUrl || null);

        events.push({
          externalId: uid,
          title,
          start: startIso,
          end: endIso,
          venue,
          description: desc,
          eventUrl,
          isCancelled,
          parser: 'ics',
          rawPayload: current
        });
      }
      current = null;
      continue;
    }

    if (!current) continue;

    if (trimmed.startsWith('SUMMARY:')) current.summary = trimmed.slice(8);
    else if (trimmed.startsWith('DTSTART')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) current.dtstart = trimmed.slice(idx + 1);
    }
    else if (trimmed.startsWith('DTEND')) {
      const idx = trimmed.indexOf(':');
      if (idx !== -1) current.dtend = trimmed.slice(idx + 1);
    }
    else if (trimmed.startsWith('LOCATION:')) current.location = trimmed.slice(9);
    else if (trimmed.startsWith('DESCRIPTION:')) current.description = trimmed.slice(12);
    else if (trimmed.startsWith('UID:')) current.uid = trimmed.slice(4);
    else if (trimmed.startsWith('URL:')) current.url = trimmed.slice(4);
    else if (trimmed.startsWith('STATUS:')) current.status = trimmed.slice(7);
  }

  return events;
}

const PARSER_VERSION = '1.0.0';

module.exports = {
  PARSER_VERSION,
  parseIcsDateTime,
  parseIcsSource
};
