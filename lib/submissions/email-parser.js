/**
 * Inbound Email MIME & Schedule Parser
 *
 * Implements:
 * 1. Cryptographic sender authentication validation (SPF / DKIM / DMARC)
 * 2. Attachment extraction (.ics, .csv)
 * 3. Body text schedule parsing with STRICT PROHIBITION of recurring-date synthesis
 */

const crypto = require('crypto');
const { parseIcsFeed } = require('../network/adapters/ics-adapter');
const { parseCsvSchedule } = require('./csv-parser');

const RECURRING_PATTERNS = [
  /\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bweekly\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i,
  /\b(?:first|second|third|fourth|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+of\s+(?:the\s+)?month\b/i,
  /\bbi-?weekly\b/i,
  /\bweekly\s+(?:showcase|open\s+mic|jam)\b/i
];

/**
 * Validates cryptographic sender authentication headers (SPF & DKIM)
 * Decoupled from venue authorization.
 */
function validateSenderAuthentication(headers = {}) {
  const authResults = headers['authentication-results'] || headers['Authentication-Results'] || '';
  const receivedSpf = headers['received-spf'] || headers['Received-SPF'] || '';
  const dkimSig = headers['dkim-signature'] || headers['DKIM-Signature'] || '';

  let spfStatus = 'none';
  let dkimStatus = 'none';

  // 1. Evaluate SPF
  if (/spf=pass/i.test(authResults) || /^pass\b/i.test(receivedSpf)) {
    spfStatus = 'pass';
  } else if (/spf=(?:fail|softfail)/i.test(authResults) || /^(?:fail|softfail)\b/i.test(receivedSpf)) {
    spfStatus = 'fail';
  }

  // 2. Evaluate DKIM
  if (/dkim=pass/i.test(authResults) || (dkimSig && !/dkim=fail/i.test(authResults))) {
    dkimStatus = 'pass';
  } else if (/dkim=fail/i.test(authResults)) {
    dkimStatus = 'fail';
  }

  const authenticated = spfStatus === 'pass' && dkimStatus === 'pass';
  let error = null;

  if (spfStatus === 'fail') {
    error = 'SPF verification failed (sender address failed domain check)';
  } else if (dkimStatus === 'fail') {
    error = 'DKIM verification failed (cryptographic signature mismatch)';
  } else if (!authenticated) {
    error = 'Incomplete sender authentication: Both SPF and DKIM must pass';
  }

  return {
    authenticated,
    spfStatus,
    dkimStatus,
    error
  };
}

/**
 * Normalizes civil date string to YYYY-MM-DD
 */
function normalizeDate(rawDate) {
  if (!rawDate) return null;
  // ISO format YYYY-MM-DD
  const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return rawDate;

  // Month Day, Year (e.g. October 15, 2026 or Oct 15 2026)
  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  const textMatch = rawDate.match(/([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (textMatch) {
    const m = monthMap[textMatch[1].slice(0, 3).toLowerCase()];
    if (m) {
      const d = textMatch[2].padStart(2, '0');
      const y = textMatch[3];
      return `${y}-${m}-${d}`;
    }
  }

  const parsed = new Date(rawDate);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Parses raw MIME or parsed email structure into event candidates
 * Strictly rejects recurring-date synthesis.
 */
function parseEmailPayload(emailData = {}, options = {}) {
  const {
    headers = {},
    from = '',
    to = '',
    subject = '',
    textBody = '',
    htmlBody = '',
    attachments = []
  } = emailData;

  const { venueOrTrack = {} } = options;
  const auth = validateSenderAuthentication(headers);
  const parsedEvents = [];
  const errors = [];
  const unparsedPatterns = [];

  // Check for attachments first (ICS or CSV provide deterministic schedules)
  const icsAttachment = attachments.find(a => a.filename?.endsWith('.ics') || a.contentType?.includes('calendar'));
  const csvAttachment = attachments.find(a => a.filename?.endsWith('.csv') || a.contentType?.includes('csv'));

  if (icsAttachment && icsAttachment.content) {
    const rawIcs = Buffer.isBuffer(icsAttachment.content)
      ? icsAttachment.content.toString('utf8')
      : String(icsAttachment.content);
    const icsResult = parseIcsFeed(rawIcs, {
      sourceConfig: { id: `eml_${Date.now()}`, venueName: venueOrTrack.name }
    });
    parsedEvents.push(...icsResult.events);
  } else if (csvAttachment && csvAttachment.content) {
    const rawCsv = Buffer.isBuffer(csvAttachment.content)
      ? csvAttachment.content.toString('utf8')
      : String(csvAttachment.content);
    const csvResult = parseCsvSchedule(rawCsv, { venueOrTrack });
    parsedEvents.push(...csvResult.events);
    errors.push(...csvResult.errors);
  } else if (textBody || htmlBody) {
    // Parse body text lines with strict recurring-date synthesis prohibition
    const lines = (textBody || htmlBody.replace(/<[^>]+>/g, '\n')).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // 1. Detect and reject recurring phrases without specific dates
      const hasRecurring = RECURRING_PATTERNS.some(p => p.test(line));
      const hasExplicitDate = /\b\d{4}-\d{2}-\d{2}\b/.test(line) || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i.test(line);

      if (hasRecurring && !hasExplicitDate) {
        unparsedPatterns.push({
          line,
          reason: 'RECURRING_SYNTHESIS_PROHIBITED',
          detail: 'Recurring pattern without explicit civil date ignored'
        });
        continue;
      }

      // 2. Parse explicit dated lines (e.g. "2026-10-15 19:30 - Sam Tallent Showcase")
      const dateMatch = line.match(/\b(\d{4}-\d{2}-\d{2})\b/) || line.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i);
      if (dateMatch) {
        const civilDate = normalizeDate(dateMatch[1]);
        if (!civilDate) continue;

        // Look for start time
        const timeMatch = line.match(/\b(\d{1,2}):(\d{2})(?:\s*([ap]m))?\b/i) || line.match(/\b(\d{1,2})\s*([ap]m)\b/i);
        let civilTime = '19:00';
        if (timeMatch) {
          if (timeMatch[2] === 'am' || timeMatch[2] === 'pm') {
            let h = parseInt(timeMatch[1], 10);
            if (timeMatch[2].toLowerCase() === 'pm' && h < 12) h += 12;
            if (timeMatch[2].toLowerCase() === 'am' && h === 12) h = 0;
            civilTime = `${String(h).padStart(2, '0')}:00`;
          } else {
            let h = parseInt(timeMatch[1], 10);
            const m = timeMatch[2];
            const meridiem = timeMatch[3]?.toLowerCase();
            if (meridiem === 'pm' && h < 12) h += 12;
            if (meridiem === 'am' && h === 12) h = 0;
            civilTime = `${String(h).padStart(2, '0')}:${m}`;
          }
        }

        // Clean title
        let cleanTitle = line
          .replace(dateMatch[0], '')
          .replace(/\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b/i, '')
          .replace(/\b\d{1,2}\s*[ap]m\b/i, '')
          .replace(/^[-–—:\s|,]+|[-–—:\s|,]+$/g, '')
          .trim();

        if (cleanTitle.length > 2) {
          const isoStart = `${civilDate}T${civilTime}:00`;
          parsedEvents.push({
            id: `eml_evt_${crypto.createHash('md5').update(cleanTitle + isoStart).digest('hex').slice(0, 12)}`,
            title: cleanTitle,
            start: isoStart,
            localCivilDate: civilDate,
            localCivilTime: civilTime,
            venueOrTrack,
            lineup: [],
            priceDisplay: null,
            ticketUrl: null
          });
        }
      }
    }
  }

  return {
    auth,
    parsedEvents,
    errors,
    unparsedPatterns
  };
}

module.exports = {
  validateSenderAuthentication,
  parseEmailPayload,
  RECURRING_PATTERNS
};
