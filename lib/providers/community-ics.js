/**
 * Pluggable Community Calendar & ICS Parser
 *
 * Ingests, parses, and normalizes official public iCalendar (.ics) and RSS syndication feeds.
 * Handles timezone conversion, missing end times, status cancellations, and rolling 48-hour clamping.
 */

const { fetchProviderWithRetry } = require('../fetchWithRetry');
const { normalizeCategory } = require('./normalizer');
const { defaultGeoCache } = require('./geo-cache');

function parseIcsDate(rawDateStr, fallbackTimezone = 'America/Chicago') {
  if (!rawDateStr || typeof rawDateStr !== 'string') return null;

  const cleaned = rawDateStr.trim().replace(/^VALUE=DATE(-TIME)?:/i, '');

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
    // Estimate UTC offset for US Central/America/Chicago (-5h CDT or -6h CST)
    const offsetHours = fallbackTimezone.includes('Chicago') ? 5 : 6;
    const dateObj = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) + offsetHours, Number(mm), Number(ss)));
    return dateObj.toISOString();
  }

  // 3. Format: YYYYMMDD (All day date)
  const allDayMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (allDayMatch) {
    const [_, y, m, d] = allDayMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 17, 0, 0)).toISOString(); // Default to 5pm UTC (noon local)
  }

  // 4. Fallback ISO parser
  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseIcsFeed(icsText, feedMeta = {}) {
  if (!icsText || typeof icsText !== 'string') return [];

  const events = [];
  const lines = icsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let currentEvent = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Unfold multi-line iCal properties (lines starting with space or tab)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].slice(1);
    }

    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      currentEvent = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (currentEvent && currentEvent.summary && currentEvent.dtstart) {
        // Skip cancelled events
        if (currentEvent.status && /cancel/i.test(currentEvent.status)) {
          currentEvent = null;
          continue;
        }

        const startIso = parseIcsDate(currentEvent.dtstart, feedMeta.timezone);
        if (!startIso) {
          currentEvent = null;
          continue;
        }

        let endIso = currentEvent.dtend ? parseIcsDate(currentEvent.dtend, feedMeta.timezone) : null;
        if (!endIso) {
          // Default to start + 2 hours if end time missing
          endIso = new Date(new Date(startIso).getTime() + 2 * 3600e3).toISOString();
        }

        const title = currentEvent.summary.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
        const venue = currentEvent.location ? currentEvent.location.replace(/\\,/g, ',') : (feedMeta.name || 'Community Center');
        const desc = currentEvent.description ? currentEvent.description.replace(/\\,/g, ',').replace(/\\n/g, ' ') : `${title} at ${venue}`;
        const cat = normalizeCategory(feedMeta.defaultCategory || 'other', [title, desc]);
        const id = `comm_${feedMeta.id}_${(currentEvent.uid || title).replace(/[^a-z0-9]/gi, '_').slice(0, 40)}`;

        events.push({
          id,
          title,
          start_time: startIso,
          end_time: endIso,
          venue_name: venue,
          city: `${feedMeta.city || 'Eau Claire'}, ${feedMeta.state || 'WI'}`,
          neighborhood: null,
          venue_latitude: feedMeta.lat,
          venue_longitude: feedMeta.lon,
          category_tags: [cat],
          vibe_labels: [cat, 'community'],
          price_status: 'free',
          price_min: 0,
          price_max: 0,
          price_display: 'Free',
          description: desc,
          canonical_url: currentEvent.url || feedMeta.provenance?.url || '',
          canonical_image_url: null,
          source: `community_${feedMeta.id}`,
          indoor_outdoor: 'unknown',
          provenance: {
            provider: 'community_ics',
            sourceId: feedMeta.id,
            sourceName: feedMeta.name,
            sourceUrl: feedMeta.provenance?.url,
            feedUrl: feedMeta.feedUrl,
            timezone: feedMeta.timezone || 'America/Chicago',
            fetchedAt: new Date().toISOString()
          }
        });
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const propHeader = trimmed.slice(0, colonIdx);
    const propValue = trimmed.slice(colonIdx + 1);
    const propName = propHeader.split(';')[0].toUpperCase();

    switch (propName) {
      case 'UID': currentEvent.uid = propValue; break;
      case 'SUMMARY': currentEvent.summary = propValue; break;
      case 'DTSTART': currentEvent.dtstart = propValue; break;
      case 'DTEND': currentEvent.dtend = propValue; break;
      case 'LOCATION': currentEvent.location = propValue; break;
      case 'DESCRIPTION': currentEvent.description = propValue; break;
      case 'URL': currentEvent.url = propValue; break;
      case 'STATUS': currentEvent.status = propValue; break;
    }
  }

  return events;
}

async function fetchCommunityFeedEvents(feedConfig, options = {}) {
  const {
    windowStart,
    windowEnd,
    cache = defaultGeoCache,
    fetchFn = fetch
  } = options;

  const startTime = Date.now();
  const cacheKey = `comm_${feedConfig.id}`;
  const cached = cache.get(cacheKey, feedConfig.lat, feedConfig.lon, 25, `${windowStart}_${windowEnd}`, '');
  if (cached) {
    return {
      feedId: feedConfig.id,
      name: feedConfig.name,
      status: 'cached',
      count: cached.length,
      events: cached,
      latencyMs: Date.now() - startTime
    };
  }

  try {
    const rawText = await fetchProviderWithRetry(
      `community-${feedConfig.id}`,
      feedConfig.feedUrl,
      {
        responseType: 'text',
        headers: { Accept: 'text/calendar, application/rss+xml, text/xml, */*' }
      },
      {
        timeoutMs: 2000,
        maxRetries: 1,
        initialDelayMs: 100,
        fetchFn
      }
    );

    const icsContent = typeof rawText === 'string' ? rawText : JSON.stringify(rawText);
    const parsed = parseIcsFeed(icsContent, feedConfig);

    // Strict 48-hour rolling boundary clamp
    const nowMs = Date.now();
    const max48Ms = nowMs + 48 * 3600e3;
    const filtered = parsed.filter(e => {
      const t = new Date(e.start_time).getTime();
      return t >= nowMs && t <= max48Ms;
    });

    cache.set(cacheKey, feedConfig.lat, feedConfig.lon, 25, `${windowStart}_${windowEnd}`, '', filtered);

    return {
      feedId: feedConfig.id,
      name: feedConfig.name,
      status: 'ok',
      count: filtered.length,
      events: filtered,
      latencyMs: Date.now() - startTime
    };
  } catch (err) {
    return {
      feedId: feedConfig.id,
      name: feedConfig.name,
      status: 'error',
      count: 0,
      events: [],
      latencyMs: Date.now() - startTime,
      reason: err.message
    };
  }
}

module.exports = {
  parseIcsDate,
  parseIcsFeed,
  fetchCommunityFeedEvents
};
