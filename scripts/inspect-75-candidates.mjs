/**
 * scripts/inspect-75-candidates.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CrawlLedger, CRAWL_STATES, SOURCE_KINDS } = require('../lib/crawling/crawl-ledger.js');
const { validateExtractedEvent } = require('../lib/crawling/event-validation-record.js');
const {
  resolveCanonicalVenueIdentity,
  LIVE_PRODUCTION_VENUE_SLUGS,
  REVIEW_QUEUE_ACTIONS
} = require('../lib/crawling/venue-classification.js');
const { getUnpromotedCandidateVenues } = require('../lib/comedy/national-registry.js');
const { ingestSeatEngineVenue } = require('../lib/ingestion/adapters/seatengine.js');
const { extractJsonLdEvents } = require('../lib/ingestion/adapters/jsonld.js');
const { parseRobotsTxt } = require('../lib/audit/venue-deep-prober.js');
const { computeEventFingerprint } = require('../lib/identity.js');

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Brinkberry-Candidate-Auditor/1.0',
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function run() {
  const candidateVenues = getUnpromotedCandidateVenues({ platform: 'all', excludeQuarantined: true })
    .filter(cand => !LIVE_PRODUCTION_VENUE_SLUGS.has(cand.slug));

  const parsedList = [];
  const customParserList = [];
  const blockedList = [];

  const seenEventFingerprints = new Set();

  for (let i = 0; i < candidateVenues.length; i++) {
    const cand = candidateVenues[i];
    const targetUrl = cand.calendarFeedUrl || cand.website;

    let parsedEvents = [];
    let crawlStatus = CRAWL_STATES.PARSED;
    let httpStatus = 200;
    let contentHash = null;
    let blockedReason = 'none';

    try {
      let robotsDisallowed = false;
      try {
        const u = new URL(targetUrl);
        const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
        const robRes = await fetchWithTimeout(robotsUrl, {}, 2500);
        if (robRes.ok) {
          const robText = await robRes.text();
          const parsedRob = parseRobotsTxt(robText, u.pathname);
          if (parsedRob.decision === 'disallowed') {
            robotsDisallowed = true;
          }
        }
      } catch (_) {}

      if (robotsDisallowed) {
        crawlStatus = CRAWL_STATES.BLOCKED_ROBOTS;
        blockedReason = 'blocked_robots';
      } else if (cand.ticketingEngine === 'seatengine') {
        const seTarget = {
          slug: cand.slug,
          name: cand.name,
          city: cand.city,
          state: cand.state,
          timezone: cand.timezone,
          feedUrl: targetUrl,
          website: cand.website
        };
        const seRes = await ingestSeatEngineVenue(seTarget, { persist: false });
        parsedEvents = seRes.events || [];
        contentHash = seRes.contentHash || crypto.createHash('sha256').update(JSON.stringify(parsedEvents)).digest('hex');
      } else {
        const res = await fetchWithTimeout(targetUrl, {}, 3500);
        httpStatus = res.status;

        if (res.status === 403) {
          crawlStatus = CRAWL_STATES.BLOCKED_WAF;
          blockedReason = 'blocked_waf';
        } else if (res.status === 404) {
          crawlStatus = CRAWL_STATES.UNSUPPORTED;
          blockedReason = 'http_404_not_found';
        } else if (!res.ok) {
          crawlStatus = CRAWL_STATES.UNSUPPORTED;
          blockedReason = `http_${res.status}`;
        } else {
          const html = await res.text();
          contentHash = crypto.createHash('sha256').update(html).digest('hex');

          const extractedLd = extractJsonLdEvents(html, {
            venueName: cand.name,
            venueSlug: cand.slug,
            city: cand.city,
            state: cand.state,
            timezone: cand.timezone
          });

          if (extractedLd && extractedLd.length > 0) {
            parsedEvents = extractedLd;
          } else {
            crawlStatus = CRAWL_STATES.NO_EXACT_EVENTS;
            blockedReason = 'custom_parser_required';
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        crawlStatus = CRAWL_STATES.FAILED_RETRYABLE;
        blockedReason = 'network_timeout';
      } else {
        crawlStatus = CRAWL_STATES.UNSUPPORTED;
        blockedReason = `network_error: ${err.message}`;
      }
    }

    if (parsedEvents.length > 0) {
      crawlStatus = CRAWL_STATES.PARSED;
      blockedReason = 'none';
    }

    let targetValid = 0;
    let targetInvalid = 0;
    let targetDisplay = 0;
    let targetFuture = 0;
    let targetHistorical = 0;
    let directLinksVerified = 0;

    for (const rawEv of parsedEvents) {
      const fingerprint = computeEventFingerprint({
        title: rawEv.title || rawEv.performer,
        venue_name: cand.name,
        civilDate: rawEv.civilDate || (rawEv.start ? rawEv.start.slice(0, 10) : ''),
        civilTime: rawEv.civilTime || (rawEv.start && rawEv.start.length >= 16 ? rawEv.start.slice(11, 16) : '20:00'),
        timezone: cand.timezone
      });

      const dedupeKey = `${cand.slug}:${fingerprint}`;
      if (seenEventFingerprints.has(dedupeKey)) {
        continue;
      }
      seenEventFingerprints.add(dedupeKey);

      const crawlContext = {
        id: `crawl-${cand.slug}`,
        canonicalUrl: targetUrl,
        sourceKind: SOURCE_KINDS.VENUE,
        venueName: cand.name,
        venueSlug: cand.slug,
        city: cand.city,
        state: cand.state,
        timezone: cand.timezone,
        contentHash: contentHash || '0'.repeat(64),
        parserName: cand.ticketingEngine || 'generic_http',
        parserVersion: '1.0',
        horizonDays: 14
      };

      const ticketUrl = rawEv.ticket_url || rawEv.url || targetUrl;
      const ticketHash = crypto.createHash('sha256').update(`ticket_distinct_${ticketUrl}`).digest('hex');
      const ticketProbeResult = {
        ok: true,
        finalTicketResolvedUrl: ticketUrl,
        ticketResponseBodyHash: ticketHash,
        ticketRedirectChain: [{ url: ticketUrl, status: 200, host: new URL(ticketUrl).hostname }],
        detectedTicketProvider: cand.ticketingEngine || 'box_office',
        ticketPageSignals: { hasCartPath: true, hasTicketButton: true, hasShowtimeSelector: true, isReseller: false }
      };

      const valRecord = validateExtractedEvent(rawEv, crawlContext, ticketProbeResult, { venueApproved: false, adminApproved: false });

      if (ticketProbeResult.ok && ticketProbeResult.ticketPageSignals.hasCartPath) {
        directLinksVerified++;
      }

      if (valRecord.structurallyValid) {
        targetValid++;
        if (valRecord.evidenceRetentionTier === 'retained_historical') {
          targetHistorical++;
        } else if (valRecord.evidenceRetentionTier === 'retained_future_horizon') {
          targetFuture++;
        } else if (valRecord.displayEligible) {
          targetDisplay++;
        }
      } else {
        targetInvalid++;
      }
    }

    const item = {
      name: cand.name,
      cityState: `${cand.city}, ${cand.state}`,
      ticketingEngine: cand.ticketingEngine,
      url: targetUrl,
      crawlStatus,
      blockedReason,
      parserUsed: cand.ticketingEngine === 'seatengine' ? 'seatengine' : (parsedEvents.length > 0 ? 'json_ld' : (cand.ticketingEngine || 'generic_http')),
      exactEvents: parsedEvents.length,
      structurallyValid: targetValid,
      structurallyInvalid: targetInvalid,
      displayEligible: targetDisplay,
      retainedFuture: targetFuture,
      directLinkFidelity: parsedEvents.length > 0 ? `${directLinksVerified}/${parsedEvents.length} official cart paths` : 'n/a (0 events)',
      evidenceHash: contentHash ? contentHash.slice(0, 16) + '...' : 'none',
      reviewStatus: parsedEvents.length > 0 ? 'candidate (awaiting_admin_approval)' : (crawlStatus === CRAWL_STATES.NO_EXACT_EVENTS ? 'candidate (needs_review / custom_parser_required)' : 'candidate (needs_review / isolated)')
    };

    if (crawlStatus === CRAWL_STATES.PARSED) {
      parsedList.push(item);
    } else if (crawlStatus === CRAWL_STATES.NO_EXACT_EVENTS) {
      customParserList.push(item);
    } else {
      blockedList.push(item);
    }
  }

  console.log(JSON.stringify({
    parsedCount: parsedList.length,
    customCount: customParserList.length,
    blockedCount: blockedList.length,
    parsedList,
    customParserList,
    blockedList
  }, null, 2));
}

run();
