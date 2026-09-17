/**
 * Multi-source Event Deduplicator
 *
 * Deduplicates events across curated database rows and dynamic API providers
 * using fuzzy title matching, venue normalization, and time-window proximity.
 * Curated events always take precedence over dynamic provider events.
 */

function cleanString(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getFingerprint(title, venue, startTimeIso) {
  const normTitle = cleanString(title);
  const normVenue = cleanString(venue);
  const d = new Date(startTimeIso);
  const timeKey = Number.isFinite(d.getTime()) ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}` : 'unknown';
  return `${normTitle}:::${normVenue}:::${timeKey}`;
}

function isSameEvent(e1, e2) {
  const t1 = cleanString(e1.title);
  const t2 = cleanString(e2.title);

  // Title similarity (exact or one contains the other if > 8 chars)
  const titleMatch = t1 === t2 || (t1.length > 8 && t2.length > 8 && (t1.includes(t2) || t2.includes(t1)));
  if (!titleMatch) return false;

  // Venue similarity
  const v1 = cleanString(e1.venue_name || e1.venue);
  const v2 = cleanString(e2.venue_name || e2.venue);
  const venueMatch = !v1 || !v2 || v1 === v2 || v1.includes(v2) || v2.includes(v1);
  if (!venueMatch) return false;

  // Time proximity: within 2 hours
  const d1 = new Date(e1.start_time || e1.start).getTime();
  const d2 = new Date(e2.start_time || e2.start).getTime();
  if (Number.isFinite(d1) && Number.isFinite(d2)) {
    const diffHours = Math.abs(d1 - d2) / (3600 * 1000);
    return diffHours <= 2.5;
  }

  return true;
}

function deduplicateEvents(curatedEvents = [], dynamicEvents = []) {
  const uniqueCurated = [];
  const seenCurated = new Set();

  for (const event of curatedEvents) {
    const fp = getFingerprint(event.title, event.venue_name || event.venue, event.start_time || event.start);
    if (!seenCurated.has(fp)) {
      seenCurated.add(fp);
      uniqueCurated.push(event);
    }
  }

  const uniqueDynamic = [];

  for (const dynamicEvent of dynamicEvents) {
    // Check if dynamic event duplicates any curated event (curated always wins)
    const isCuratedDuplicate = uniqueCurated.some(c => isSameEvent(c, dynamicEvent));
    if (isCuratedDuplicate) {
      continue;
    }

    // Check if duplicate of already accepted dynamic event
    const isDynamicDuplicate = uniqueDynamic.some(d => isSameEvent(d, dynamicEvent));
    if (isDynamicDuplicate) {
      continue;
    }

    uniqueDynamic.push(dynamicEvent);
  }

  return [...uniqueCurated, ...uniqueDynamic];
}

module.exports = {
  cleanString,
  getFingerprint,
  isSameEvent,
  deduplicateEvents
};
