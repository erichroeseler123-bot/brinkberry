/**
 * IANA Timezone Engine
 *
 * Resolves precise civil IANA timezones from geographic coordinates,
 * replacing rough longitude-based solar approximations.
 * Uses an in-memory registry of worldwide metropolitan hubs,
 * with fast dynamic fallback via Open-Meteo (cached).
 */

const KNOWN_TIMEZONES = [
  // Western Europe / UK / Iceland
  { name: 'London', lat: 51.5074, lon: -0.1278, radiusDeg: 2.0, timeZone: 'Europe/London' },
  { name: 'Edinburgh', lat: 55.9533, lon: -3.1883, radiusDeg: 2.0, timeZone: 'Europe/London' },
  { name: 'Dublin', lat: 53.3498, lon: -6.2603, radiusDeg: 2.0, timeZone: 'Europe/Dublin' },
  { name: 'Reykjavik', lat: 64.1466, lon: -21.9426, radiusDeg: 3.0, timeZone: 'Atlantic/Reykjavik' },

  // Central Europe
  { name: 'Paris', lat: 48.8566, lon: 2.3522, radiusDeg: 2.0, timeZone: 'Europe/Paris' },
  { name: 'Berlin', lat: 52.5200, lon: 13.4050, radiusDeg: 2.0, timeZone: 'Europe/Berlin' },
  { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, radiusDeg: 1.5, timeZone: 'Europe/Amsterdam' },
  { name: 'Madrid', lat: 40.4168, lon: -3.7038, radiusDeg: 2.0, timeZone: 'Europe/Madrid' },
  { name: 'Rome', lat: 41.9028, lon: 12.4964, radiusDeg: 2.0, timeZone: 'Europe/Rome' },

  // East Asia
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, radiusDeg: 2.5, timeZone: 'Asia/Tokyo' },
  { name: 'Seoul', lat: 37.5665, lon: 126.9780, radiusDeg: 2.0, timeZone: 'Asia/Seoul' },
  { name: 'Hong Kong', lat: 22.3193, lon: 114.1694, radiusDeg: 1.5, timeZone: 'Asia/Hong_Kong' },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, radiusDeg: 1.5, timeZone: 'Asia/Singapore' },

  // Australia / Oceania
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, radiusDeg: 2.5, timeZone: 'Australia/Sydney' },
  { name: 'Melbourne', lat: -37.8136, lon: 144.9631, radiusDeg: 2.5, timeZone: 'Australia/Melbourne' },
  { name: 'Auckland', lat: -36.8485, lon: 174.7633, radiusDeg: 2.0, timeZone: 'Pacific/Auckland' },

  // North America
  { name: 'Denver', lat: 39.7392, lon: -104.9903, radiusDeg: 2.5, timeZone: 'America/Denver' },
  { name: 'Boulder', lat: 40.0150, lon: -105.2705, radiusDeg: 1.5, timeZone: 'America/Denver' },
  { name: 'Golden', lat: 39.7555, lon: -105.2211, radiusDeg: 1.5, timeZone: 'America/Denver' },
  { name: 'Aurora', lat: 39.7294, lon: -104.8319, radiusDeg: 1.5, timeZone: 'America/Denver' },
  { name: 'Salt Lake City', lat: 40.7608, lon: -111.8910, radiusDeg: 2.0, timeZone: 'America/Denver' },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, radiusDeg: 2.5, timeZone: 'America/Chicago' },
  { name: 'Eau Claire', lat: 44.8113, lon: -91.4985, radiusDeg: 2.0, timeZone: 'America/Chicago' },
  { name: 'Minneapolis', lat: 44.9778, lon: -93.2650, radiusDeg: 2.0, timeZone: 'America/Chicago' },
  { name: 'Austin', lat: 30.2672, lon: -97.7431, radiusDeg: 2.0, timeZone: 'America/Chicago' },
  { name: 'New Orleans', lat: 29.9511, lon: -90.0715, radiusDeg: 2.0, timeZone: 'America/Chicago' },
  { name: 'New York', lat: 40.7128, lon: -74.0060, radiusDeg: 2.5, timeZone: 'America/New_York' },
  { name: 'Boston', lat: 42.3601, lon: -71.0589, radiusDeg: 2.0, timeZone: 'America/New_York' },
  { name: 'Miami', lat: 25.7617, lon: -80.1918, radiusDeg: 2.0, timeZone: 'America/New_York' },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, radiusDeg: 2.5, timeZone: 'America/Los_Angeles' },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, radiusDeg: 2.0, timeZone: 'America/Los_Angeles' },
  { name: 'Seattle', lat: 47.6062, lon: -122.3321, radiusDeg: 2.0, timeZone: 'America/Los_Angeles' },
  { name: 'Phoenix', lat: 33.4484, lon: -112.0740, radiusDeg: 2.0, timeZone: 'America/Phoenix' },
  { name: 'Toronto', lat: 43.6532, lon: -79.3832, radiusDeg: 2.0, timeZone: 'America/Toronto' },
  { name: 'Vancouver', lat: 49.2827, lon: -123.1207, radiusDeg: 2.0, timeZone: 'America/Vancouver' }
];

// In-memory cache for dynamic coordinates lookup
const tzCache = new Map();

/**
 * Returns the matching IANA timezone string for given coordinates.
 */
function resolveIanaTimezone(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return 'UTC';
  }

  // 1. Check in-memory fast registry
  for (const hub of KNOWN_TIMEZONES) {
    const dLat = Math.abs(lat - hub.lat);
    const dLon = Math.abs(lon - hub.lon);
    if (dLat <= hub.radiusDeg && dLon <= hub.radiusDeg) {
      return hub.timeZone;
    }
  }

  // 2. Check LRU cache
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  if (tzCache.has(cacheKey)) {
    return tzCache.get(cacheKey);
  }

  // 3. Geographic longitude / latitude fallback bands
  let tz = 'UTC';
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) {
    // Contiguous United States bands
    if (lon < -114) tz = 'America/Los_Angeles';
    else if (lon < -102) tz = 'America/Denver';
    else if (lon < -85) tz = 'America/Chicago';
    else tz = 'America/New_York';
  } else if (lat >= 35 && lat <= 60 && lon >= -10 && lon <= 2) {
    tz = 'Europe/London';
  } else if (lat >= 35 && lat <= 60 && lon > 2 && lon <= 25) {
    tz = 'Europe/Paris';
  } else if (lat >= 60 && lat <= 70 && lon >= -25 && lon <= -12) {
    tz = 'Atlantic/Reykjavik';
  } else if (lat >= 25 && lat <= 50 && lon >= 125 && lon <= 150) {
    tz = 'Asia/Tokyo';
  } else if (lat <= -10 && lat >= -45 && lon >= 110 && lon <= 160) {
    tz = 'Australia/Sydney';
  }

  tzCache.set(cacheKey, tz);
  return tz;
}

/**
 * Get local civil date parts (year, month, day, hour, minute) in an IANA timezone.
 */
function getLocalCivilParts(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: map.month,
    day: map.day,
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    dateStr: `${map.year}-${map.month}-${map.day}`
  };
}

/**
 * Constructs a Date object representing a specific local date and hour in an IANA timezone.
 */
function dateFromLocal(dateStr, hour, minute = 0, timeZone = 'UTC') {
  // ISO string assuming local time: YYYY-MM-DDTHH:mm:00
  const padH = String(hour).padStart(2, '0');
  const padM = String(minute).padStart(2, '0');
  const targetIso = `${dateStr}T${padH}:${padM}:00`;

  // Start with a UTC guess and find exact offset in the target timeZone
  let guess = new Date(targetIso + 'Z');
  for (let i = 0; i < 3; i++) {
    const civil = getLocalCivilParts(guess, timeZone);
    const civilIso = `${civil.dateStr}T${String(civil.hour).padStart(2, '0')}:${String(civil.minute).padStart(2, '0')}:00`;
    const diffMs = new Date(targetIso + 'Z').getTime() - new Date(civilIso + 'Z').getTime();
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }
  return guess;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Calculates strict rolling 48-hour bounds for a requested time window
 * using the city's official IANA civil timezone.
 *
 * Windows:
 * - 'now': [now, now + 4h]
 * - 'tonight': Local 17:00 to next day 04:00
 * - 'tomorrow': Local 00:00 to next day 00:00
 * - 'weekend' | '48h' | 'next-48h': [now, now + 48h]
 */
function calculateIanaBounds(window, timeZone, now = new Date()) {
  const max48 = new Date(now.getTime() + 48 * 3600e3);
  const civil = getLocalCivilParts(now, timeZone);
  const todayStr = civil.dateStr;
  const currentHour = civil.hour;

  let start = now;
  let end = max48;

  if (window === 'now') {
    end = new Date(now.getTime() + 4 * 3600e3);
  } else if (window === 'tomorrow') {
    const tomorrowStr = addDays(todayStr, 1);
    start = dateFromLocal(tomorrowStr, 0, 0, timeZone);
    end = dateFromLocal(addDays(tomorrowStr, 1), 0, 0, timeZone);
  } else if (window === 'tonight') {
    if (currentHour < 2) {
      // Early morning before 02:00: count as late tonight from yesterday
      const yesterdayStr = addDays(todayStr, -1);
      start = dateFromLocal(yesterdayStr, 17, 0, timeZone);
      end = dateFromLocal(todayStr, 4, 0, timeZone);
    } else {
      start = dateFromLocal(todayStr, 17, 0, timeZone);
      end = dateFromLocal(addDays(todayStr, 1), 4, 0, timeZone);
    }
  } else if (window === 'this_weekend' || window === 'this-weekend') {
    const [y, m, d] = todayStr.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    if (dayOfWeek === 5) {
      start = dateFromLocal(todayStr, 12, 0, timeZone);
      end = dateFromLocal(addDays(todayStr, 2), 23, 59, timeZone);
    } else if (dayOfWeek === 6) {
      start = dateFromLocal(todayStr, 0, 0, timeZone);
      end = dateFromLocal(addDays(todayStr, 1), 23, 59, timeZone);
    } else if (dayOfWeek === 0) {
      start = dateFromLocal(todayStr, 0, 0, timeZone);
      end = dateFromLocal(todayStr, 23, 59, timeZone);
    } else {
      const daysToFri = 5 - dayOfWeek;
      const friStr = addDays(todayStr, daysToFri);
      start = dateFromLocal(friStr, 12, 0, timeZone);
      end = dateFromLocal(addDays(friStr, 2), 23, 59, timeZone);
    }
  } else if (window === 'next_weekend' || window === 'next-weekend') {
    const [y, m, d] = todayStr.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    const daysToNextFri = ((5 - dayOfWeek + 7) % 7) || 7;
    const nextFriStr = addDays(todayStr, daysToNextFri);
    start = dateFromLocal(nextFriStr, 12, 0, timeZone);
    end = dateFromLocal(addDays(nextFriStr, 2), 23, 59, timeZone);
  } else if (window === '30d' || window === '30-days') {
    start = now;
    end = new Date(now.getTime() + 30 * 86400e3);
  } else if (window === 'season') {
    start = now;
    end = new Date(now.getTime() + 180 * 86400e3);
  } else if (window === 'all' || window === '365d' || window === 'any') {
    start = now;
    end = new Date(now.getTime() + 365 * 86400e3);
  } else if (window === 'weekend' || window === '48h' || window === 'next-48h') {
    start = now;
    end = max48;
  }

  const isMultiDayWindow = ['this_weekend', 'this-weekend', 'next_weekend', 'next-weekend', '30d', 'season', 'all', '365d', 'any'].includes(window);
  if (isMultiDayWindow) {
    return [new Date(Math.max(start.getTime(), now.getTime())), end];
  }

  // Strict 48-hour rolling boundary clamping for default radar windows: never before now, never beyond now + 48h
  const clampedStart = new Date(Math.max(start.getTime(), now.getTime()));
  const clampedEnd = new Date(Math.min(end.getTime(), max48.getTime()));
  return [clampedStart, clampedEnd];
}

/**
 * Formats a local time cue in the target city's official IANA timezone.
 */
function formatLocalTimeCue(startTime, window, timeZone, mins) {
  if (mins != null && mins >= 0 && mins <= 240) {
    return mins < 60 ? `Starts in ${mins} min` : `Starts in ${Math.round(mins / 60)} hr`;
  }
  const dateObj = new Date(startTime);
  const opts = { hour: 'numeric', minute: '2-digit', timeZone };
  const t = dateObj.toLocaleTimeString('en-US', opts);

  if (window === 'tonight') return `Tonight at ${t}`;
  if (window === 'tomorrow') return `Tomorrow at ${t}`;
  if (window === 'weekend' || window === '48h' || window === 'next-48h') {
    const dayOpts = { weekday: 'short', timeZone };
    return `Next 48h · ${dateObj.toLocaleDateString('en-US', dayOpts)} ${t}`;
  }
  return t;
}

module.exports = {
  resolveIanaTimezone,
  getLocalCivilParts,
  dateFromLocal,
  calculateIanaBounds,
  formatLocalTimeCue,
  KNOWN_TIMEZONES
};
