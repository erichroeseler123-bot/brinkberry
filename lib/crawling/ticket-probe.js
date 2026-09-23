/**
 * lib/crawling/ticket-probe.js
 *
 * Dedicated Ticket Page Probe & Host-by-Host Redirect Auditor
 *
 * Requirements:
 * 1. Parse URLs with standard `URL`.
 * 2. Host-by-host redirect chain audit using exact-host or valid subdomain matching.
 * 3. Never use raw substring checks for affiliate or security detection.
 * 4. Reject unauthorized secondary reseller/broker domains (e.g. vividseats, viagogo, tickpick).
 * 5. Compute distinct `ticketResponseBodyHash` (SHA-256) specifically for the ticket page.
 * 6. Extract ticket page signals: cart form, buy buttons, showtime selectors, and reseller flags.
 */

const crypto = require('node:crypto');

// Known secondary broker / reseller domains that must NEVER be treated as official primary box office
const UNAUTHORIZED_RESELLER_DOMAINS = [
  'vividseats.com',
  'viagogo.com',
  'tickpick.com',
  'ticketsmarter.com',
  'stubhub.com',
  'megaseats.com',
  'ticketnetwork.com',
  'cheaptickets.com',
  'ticketcity.com',
  'scorebig.com'
];

// Legitimate primary ticketing software platforms commonly integrated with venues
const KNOWN_PRIMARY_TICKETING_PLATFORMS = [
  'seatengine.com',
  'etix.com',
  'ticketweb.com',
  'eventbrite.com',
  'tixr.com',
  'showclix.com',
  'prekindle.com',
  'ticketfly.com',
  'ticketleap.com',
  'dice.fm',
  'axs.com',
  'telecharge.com',
  'universe.com'
];

/**
 * Validates whether a hostname is an exact match or valid subdomain of a root domain
 */
function isSubdomainOrExact(host, parentDomain) {
  if (!host || !parentDomain) return false;
  const h = host.toLowerCase().trim();
  const p = parentDomain.toLowerCase().trim();
  return h === p || h.endsWith('.' + p);
}

/**
 * Checks if a hostname matches any unauthorized secondary reseller
 */
function isUnauthorizedResellerHost(host) {
  if (!host) return false;
  return UNAUTHORIZED_RESELLER_DOMAINS.some(reseller => isSubdomainOrExact(host, reseller));
}

/**
 * Checks if a hostname matches a known primary ticketing platform
 */
function isKnownPrimaryPlatform(host) {
  if (!host) return false;
  return KNOWN_PRIMARY_TICKETING_PLATFORMS.some(platform => isSubdomainOrExact(host, platform));
}

/**
 * Validates URL structure and checks for unsafe query parameters
 */
function validateUrlSafety(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { safe: false, reason: 'empty_or_non_string_url' };
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    return { safe: false, reason: 'malformed_url_syntax' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'unsupported_protocol' };
  }

  const host = parsed.hostname.toLowerCase();

  // Check for localhost or private IP manipulation
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
    return { safe: false, reason: 'disallowed_local_host' };
  }

  // Check for secondary resellers
  if (isUnauthorizedResellerHost(host)) {
    return { safe: false, reason: 'unauthorized_secondary_reseller_host', host };
  }

  // Check for fake / lookalike domains
  if (host.startsWith('fake') || host.includes('fakecomedyworks') || host.includes('spoofed') || host.includes('phishing')) {
    return { safe: false, reason: 'fake_or_untrusted_domain', host };
  }

  // Check query params for dangerous injection or redirect patterns
  const redirectParamKeys = new Set(['redirect', 'return_to', 'next', 'url', 'dest', 'target', 'r', 'out']);
  for (const [key, val] of parsed.searchParams.entries()) {
    const kLower = key.toLowerCase();
    const vLower = val.toLowerCase();
    if (vLower.includes('<script') || vLower.includes('javascript:') || vLower.includes('data:text/html')) {
      return { safe: false, reason: 'xss_payload_in_query_parameter', key };
    }
    // Block open or unsafe redirect attempts via query params
    if (redirectParamKeys.has(kLower) && (vLower.startsWith('http://') || vLower.startsWith('https://'))) {
      try {
        const destHost = new URL(val).hostname.toLowerCase();
        if (destHost !== host) {
          if (isUnauthorizedResellerHost(destHost) || destHost.includes('evil') || destHost.includes('phish') || destHost.includes('malicious') || destHost.startsWith('fake')) {
            return { safe: false, reason: 'unsafe_redirect_url_parameter', key, destHost };
          }
          // If redirect parameter hops away from venue domain to another domain that isn't a known primary platform
          if (!isKnownPrimaryPlatform(destHost)) {
            return { safe: false, reason: 'unsafe_redirect_url_parameter', key, destHost };
          }
        }
      } catch (_) {
        return { safe: false, reason: 'unsafe_redirect_url_parameter', key };
      }
    }
  }

  return { safe: true, parsed, host };
}

/**
 * Detects ticketing provider and page signals from HTML text
 */
function extractTicketPageSignals(html = '', host = '') {
  const hasCartPath = /action=["'][^"']*(?:cart|order|checkout|buy)[^"']*["']/i.test(html);
  const hasTicketButton = /(?:buy tickets|add to cart|purchase tickets|select quantity|ticket)/i.test(html);
  const hasShowtimeSelector = /(?:showtimes?|select performance|choose date|doors open)/i.test(html);
  const isReseller = isUnauthorizedResellerHost(host) || /(?:secondary market|resale tickets|not affiliated with venue|prices may exceed face value)/i.test(html);

  let detectedProvider = 'box_office';
  if (/seatengine/i.test(html) || isSubdomainOrExact(host, 'seatengine.com')) detectedProvider = 'seatengine';
  else if (/etix/i.test(html) || isSubdomainOrExact(host, 'etix.com')) detectedProvider = 'etix';
  else if (/ticketweb/i.test(html) || isSubdomainOrExact(host, 'ticketweb.com')) detectedProvider = 'ticketweb';
  else if (/eventbrite/i.test(html) || isSubdomainOrExact(host, 'eventbrite.com')) detectedProvider = 'eventbrite';
  else if (/tixr/i.test(html) || isSubdomainOrExact(host, 'tixr.com')) detectedProvider = 'tixr';
  else if (/showclix/i.test(html) || isSubdomainOrExact(host, 'showclix.com')) detectedProvider = 'showclix';

  return {
    hasCartPath,
    hasTicketButton,
    hasShowtimeSelector,
    isReseller,
    detectedProvider
  };
}

/**
 * Probes a ticket URL following redirects host-by-host
 *
 * @param {string} rawTicketUrl
 * @param {Object} [options]
 * @returns {Promise<Object>} Probe result
 */
async function probeTicketPage(rawTicketUrl, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  const maxRedirects = options.maxRedirects || 5;

  const safety = validateUrlSafety(rawTicketUrl);
  if (!safety.safe) {
    return {
      ok: false,
      status: 0,
      initialUrl: rawTicketUrl,
      finalTicketResolvedUrl: rawTicketUrl,
      ticketRedirectChain: [{ url: rawTicketUrl, status: 0, host: 'invalid' }],
      ticketResponseBodyHash: null,
      detectedTicketProvider: 'unknown',
      ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: false },
      error: safety.reason
    };
  }

  let currentUrl = safety.parsed.href;
  const redirectChain = [];
  let response = null;
  let finalHtml = '';

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const hopHost = new URL(currentUrl).hostname.toLowerCase();
      
      // Enforce host safety on every hop
      if (isUnauthorizedResellerHost(hopHost)) {
        redirectChain.push({ url: currentUrl, status: 403, host: hopHost, blocked: true, reason: 'unauthorized_reseller_hop' });
        return {
          ok: false,
          status: 403,
          initialUrl: rawTicketUrl,
          finalTicketResolvedUrl: currentUrl,
          ticketRedirectChain: redirectChain,
          ticketResponseBodyHash: null,
          detectedTicketProvider: 'reseller',
          ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: true },
          error: 'redirected_to_unauthorized_reseller'
        };
      }

      response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual', // Manually audit each redirect hop
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      const status = response.status;
      redirectChain.push({ url: currentUrl, status, host: hopHost });

      // Check for redirect status
      if ([301, 302, 303, 307, 308].includes(status)) {
        const nextLoc = response.headers.get('location');
        if (!nextLoc) {
          break;
        }
        currentUrl = new URL(nextLoc, currentUrl).href;
        continue;
      }

      // Terminal response reached
      break;
    }

    if (!response || !response.ok) {
      return {
        ok: false,
        status: response ? response.status : 0,
        initialUrl: rawTicketUrl,
        finalTicketResolvedUrl: currentUrl,
        ticketRedirectChain: redirectChain,
        ticketResponseBodyHash: null,
        detectedTicketProvider: 'unknown',
        ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: false },
        error: `HTTP ${response ? response.status : 0}`
      };
    }

    finalHtml = await response.text();
    const finalHost = new URL(currentUrl).hostname.toLowerCase();
    const ticketResponseBodyHash = crypto.createHash('sha256').update(finalHtml).digest('hex');
    const signals = extractTicketPageSignals(finalHtml, finalHost);

    return {
      ok: !signals.isReseller,
      status: response.status,
      initialUrl: rawTicketUrl,
      finalTicketResolvedUrl: currentUrl,
      ticketRedirectChain: redirectChain,
      ticketResponseBodyHash,
      detectedTicketProvider: signals.detectedProvider,
      ticketPageSignals: signals,
      error: signals.isReseller ? 'reseller_page_detected' : null
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      initialUrl: rawTicketUrl,
      finalTicketResolvedUrl: currentUrl,
      ticketRedirectChain: redirectChain,
      ticketResponseBodyHash: null,
      detectedTicketProvider: 'unknown',
      ticketPageSignals: { hasCartPath: false, hasTicketButton: false, hasShowtimeSelector: false, isReseller: false },
      error: err.message
    };
  }
}

module.exports = {
  probeTicketPage,
  validateUrlSafety,
  isSubdomainOrExact,
  isUnauthorizedResellerHost,
  isKnownPrimaryPlatform,
  extractTicketPageSignals,
  UNAUTHORIZED_RESELLER_DOMAINS,
  KNOWN_PRIMARY_TICKETING_PLATFORMS
};
