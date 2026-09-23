/**
 * Deterministic CSV Schedule Parser for Comedy and Motorsports
 *
 * Supports standard CSV schedules with common column variations:
 * - Date: date, event_date, show_date, race_date
 * - Start Time: start_time, time, start, showtime, gates_open
 * - End Time: end_time, end
 * - Title: title, event_title, show_name, event_name, race_name
 * - Lineup/Division: lineup, comedians, performers, classes, divisions, series
 * - Ticket URL: ticket_url, tickets, url, link, buy_tickets
 * - Price: price, ticket_price, admission
 */

const crypto = require('crypto');

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvSchedule(csvContent, options = {}) {
  const { venueOrTrack = {}, defaultTimezone = 'America/Denver' } = options;

  if (!csvContent || typeof csvContent !== 'string') {
    return { events: [], errors: ['Empty or invalid CSV content'] };
  }

  const lines = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) {
    return { events: [], errors: ['CSV must contain at least a header and one row'] };
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  // Field mapping
  const findIdx = (candidates) => headers.findIndex(h => candidates.includes(h));

  const dateIdx = findIdx(['date', 'event_date', 'show_date', 'race_date', 'day']);
  const startIdx = findIdx(['start_time', 'time', 'start', 'showtime', 'gates_open', 'show_time']);
  const endIdx = findIdx(['end_time', 'end']);
  const titleIdx = findIdx(['title', 'event_title', 'show_name', 'event_name', 'race_name', 'event']);
  const lineupIdx = findIdx(['lineup', 'comedians', 'performers', 'classes', 'divisions', 'series', 'feature']);
  const ticketIdx = findIdx(['ticket_url', 'tickets', 'url', 'link', 'buy_tickets', 'ticket_link']);
  const priceIdx = findIdx(['price', 'ticket_price', 'admission', 'cost']);

  if (dateIdx === -1 || titleIdx === -1) {
    return {
      events: [],
      errors: ['CSV must contain at least "Date" and "Title" / "Event Name" columns']
    };
  }

  const events = [];
  const errors = [];
  const contentHash = crypto.createHash('sha256').update(csvContent).digest('hex').slice(0, 16);

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const cols = parseCsvLine(lines[rowIdx]);
    if (cols.length === 0 || cols.every(c => !c)) continue;

    const rawDate = cols[dateIdx] || '';
    const rawTitle = cols[titleIdx] || '';
    const rawStart = startIdx !== -1 ? cols[startIdx] : '19:00';
    const rawEnd = endIdx !== -1 ? cols[endIdx] : '';
    const rawLineup = lineupIdx !== -1 ? cols[lineupIdx] : '';
    const rawTicket = ticketIdx !== -1 ? cols[ticketIdx] : '';
    const rawPrice = priceIdx !== -1 ? cols[priceIdx] : '';

    if (!rawTitle || !rawDate) {
      errors.push(`Row ${rowIdx + 1}: Missing required title or date`);
      continue;
    }

    // Normalize date YYYY-MM-DD
    let normalizedDate = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      normalizedDate = rawDate;
    } else {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        normalizedDate = d.toISOString().slice(0, 10);
      }
    }

    if (!normalizedDate) {
      errors.push(`Row ${rowIdx + 1}: Invalid date format "${rawDate}"`);
      continue;
    }

    // Normalize start time HH:MM
    let normalizedStartTime = '19:00';
    const timeMatch = rawStart.match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2];
      const meridiem = timeMatch[3]?.toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      normalizedStartTime = `${String(h).padStart(2, '0')}:${m}`;
    }

    const isoStart = `${normalizedDate}T${normalizedStartTime}:00`;
    const lineup = rawLineup ? rawLineup.split(/[,;/|]+/).map(s => s.trim()).filter(Boolean) : [];

    const eventCandidate = {
      id: `sub_csv_${crypto.createHash('md5').update(rawTitle + isoStart).digest('hex').slice(0, 12)}`,
      title: rawTitle,
      start: isoStart,
      localCivilDate: normalizedDate,
      localCivilTime: normalizedStartTime,
      lineup,
      ticketUrl: rawTicket || null,
      priceDisplay: rawPrice ? (rawPrice.startsWith('$') ? rawPrice : `$${rawPrice}`) : null,
      venueOrTrack: {
        name: venueOrTrack.name || 'Submitted Venue/Track',
        city: venueOrTrack.city || '',
        state: venueOrTrack.state || ''
      },
      contentHash
    };

    events.push(eventCandidate);
  }

  return {
    events,
    errors,
    contentHash
  };
}

module.exports = {
  parseCsvSchedule,
  parseCsvLine,
  normalizeHeader
};
