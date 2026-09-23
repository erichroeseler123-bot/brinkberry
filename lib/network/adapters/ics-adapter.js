/**
 * RFC 5545 iCalendar (ICS) Official Source Adapter
 *
 * Parses official calendar feeds from clubs, tracks, and sanctioning bodies.
 * Extracts:
 * - Exact start and end times
 * - Cancellation detection (STATUS:CANCELLED)
 * - Multi-day events (e.g. 3-day dirt track Nationals)
 * - Provenance metadata
 */

const crypto = require('crypto');

function parseIcsDate(rawStr) {
  if (!rawStr) return null;
  const clean = rawStr.trim();

  // Format: YYYYMMDDTHHMMSSZ (UTC)
  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const h = clean.slice(9, 11);
    const min = clean.slice(11, 13);
    const s = clean.slice(13, 15);
    return new Date(`${y}-${m}-${d}T${h}:${min}:${s}.000Z`).toISOString();
  }

  // Format: YYYYMMDDTHHMMSS (local)
  if (/^\d{8}T\d{6}$/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const h = clean.slice(9, 11);
    const min = clean.slice(11, 13);
    const s = clean.slice(13, 15);
    // Treat as UTC baseline unless localized
    return new Date(`${y}-${m}-${d}T${h}:${min}:${s}.000Z`).toISOString();
  }

  // Format: YYYYMMDD (all day)
  if (/^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return new Date(`${y}-${m}-${d}T19:00:00.000Z`).toISOString();
  }

  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Parses an RFC 5545 iCalendar payload into normalized canonical event candidates
 */
function parseIcsFeed(icsText, options = {}) {
  const { sourceConfig = {}, fetchedAt = new Date().toISOString() } = options;
  if (!icsText || typeof icsText !== 'string') {
    return { events: [], cancelledUids: [], hash: null };
  }

  const hash = crypto.createHash('sha256').update(icsText).digest('hex').slice(0, 16);
  const lines = icsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Unfold multi-line entries (leading space or tab)
  const unfoldedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfoldedLines.length > 0) {
      unfoldedLines[unfoldedLines.length - 1] += line.slice(1);
    } else {
      unfoldedLines.push(line);
    }
  }

  const events = [];
  const cancelledUids = [];
  let currentEvent = null;

  for (const line of unfoldedLines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      currentEvent = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (currentEvent && currentEvent.summary && currentEvent.dtstart) {
        const uid = currentEvent.uid || `ics_${crypto.createHash('md5').update(currentEvent.summary + currentEvent.dtstart).digest('hex').slice(0, 12)}`;
        const isCancelled = (currentEvent.status || '').toUpperCase() === 'CANCELLED';

        if (isCancelled) {
          cancelledUids.push(uid);
        } else {
          events.push({
            id: uid,
            title: currentEvent.summary,
            start: currentEvent.dtstart,
            end: currentEvent.dtend || null,
            description: currentEvent.description || null,
            location: currentEvent.location || sourceConfig.facilityName || sourceConfig.venueName || null,
            officialUrl: currentEvent.url || sourceConfig.canonicalUrl || null,
            isCancelled: false,
            sourceEvidence: {
              sourceId: sourceConfig.id || 'ics_feed',
              sourceType: 'official_box_office',
              confirmationStatus: 'confirmed_by_official_calendar',
              contentHash: hash,
              fetchedAt,
              exactConfirmationFields: {
                title: Boolean(currentEvent.summary),
                date: Boolean(currentEvent.dtstart)
              }
            }
          });
        }
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const fullKey = trimmed.slice(0, colonIdx);
    const val = trimmed.slice(colonIdx + 1);
    const mainKey = fullKey.split(';')[0].toUpperCase();

    switch (mainKey) {
      case 'UID':
        currentEvent.uid = val;
        break;
      case 'SUMMARY':
        currentEvent.summary = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
        break;
      case 'DTSTART':
        currentEvent.dtstart = parseIcsDate(val);
        break;
      case 'DTEND':
        currentEvent.dtend = parseIcsDate(val);
        break;
      case 'DESCRIPTION':
        currentEvent.description = val.replace(/\\n/g, '\n').replace(/\\,/g, ',');
        break;
      case 'LOCATION':
        currentEvent.location = val.replace(/\\,/g, ',');
        break;
      case 'URL':
        currentEvent.url = val;
        break;
      case 'STATUS':
        currentEvent.status = val;
        break;
    }
  }

  return {
    events,
    cancelledUids,
    contentHash: hash
  };
}

module.exports = {
  parseIcsFeed,
  parseIcsDate
};
