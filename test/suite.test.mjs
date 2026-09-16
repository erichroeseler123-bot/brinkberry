import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchProviderWithRetry, ProviderFetchError } = require('../lib/fetchWithRetry.js');
const { buildSafeAffiliateUrl, isValidTicketUrl, ALLOWED_TICKET_HOSTS } = require('../lib/affiliate.js');
const clickHandler = require('../api/click.js');
const feedHandler = require('../api/feed.js');
const homeHandler = require('../api/home.js');
const eventHandler = require('../api/event.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';

describe('Brinkberry Production Verification Suite', () => {

  describe('Provider Retry & Error Handling', () => {
    test('succeeds on first attempt without retrying', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return { ok: true, status: 200, json: async () => ({ events: [1, 2, 3] }) };
      };

      const result = await fetchProviderWithRetry('test-provider', 'https://api.example.com', {}, {
        fetchFn: mockFetch
      });

      assert.equal(callCount, 1);
      assert.deepEqual(result, { events: [1, 2, 3] });
    });

    test('retries on 429 rate limit and eventually succeeds', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        if (callCount < 3) {
          return { ok: false, status: 429, text: async () => 'Rate limit exceeded' };
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      };

      const result = await fetchProviderWithRetry('test-provider', 'https://api.example.com', {}, {
        fetchFn: mockFetch,
        initialDelayMs: 10,
        maxDelayMs: 50,
        maxRetries: 3
      });

      assert.equal(callCount, 3);
      assert.deepEqual(result, { success: true });
    });

    test('retries on 500/503 server error and fails after max retries', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return { ok: false, status: 503, text: async () => 'Service Unavailable' };
      };

      await assert.rejects(
        async () => {
          await fetchProviderWithRetry('test-provider', 'https://api.example.com', {}, {
            fetchFn: mockFetch,
            initialDelayMs: 10,
            maxDelayMs: 50,
            maxRetries: 2
          });
        },
        (err) => {
          assert.equal(err.status, 503);
          assert.equal(callCount, 3);
          return true;
        }
      );
    });

    test('fast-fails on ordinary 4xx errors without retrying', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return { ok: false, status: 404, text: async () => 'Not Found' };
      };

      await assert.rejects(
        async () => {
          await fetchProviderWithRetry('test-provider', 'https://api.example.com', {}, {
            fetchFn: mockFetch,
            initialDelayMs: 10,
            maxRetries: 3
          });
        },
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(callCount, 1);
          return true;
        }
      );
    });

    test('handles timeout cleanly and cleans up timers', async () => {
      const mockFetch = async (url, opts) => {
        return new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new Error('Aborted'));
          });
        });
      };

      await assert.rejects(
        async () => {
          await fetchProviderWithRetry('test-provider', 'https://api.example.com', {}, {
            fetchFn: mockFetch,
            timeoutMs: 50,
            initialDelayMs: 10,
            maxRetries: 1
          });
        },
        /Request timed out/
      );
    });
  });

  describe('Affiliate Decorator & URL Safety', () => {
    test('returns raw ticket URL when credentials are absent or placeholder', () => {
      delete process.env.IMPACT_TICKETMASTER_CAMPAIGN_ID;
      delete process.env.IMPACT_MEDIA_PARTNER_ID;

      const raw = 'https://www.ticketmaster.com/event/123456';
      const result = buildSafeAffiliateUrl('ticketmaster', raw, 'tm_123');
      assert.equal(result, raw);
    });

    test('ignores fake placeholder IDs and preserves raw URL', () => {
      process.env.IMPACT_TICKETMASTER_CAMPAIGN_ID = '12345';
      process.env.IMPACT_MEDIA_PARTNER_ID = '67890';

      const raw = 'https://www.ticketmaster.com/event/123456';
      const result = buildSafeAffiliateUrl('ticketmaster', raw, 'tm_123');
      assert.equal(result, raw);
    });

    test('decorates URL only when legitimate affiliate keys are provided', () => {
      process.env.IMPACT_TICKETMASTER_CAMPAIGN_ID = 'real_campaign_999';
      process.env.IMPACT_MEDIA_PARTNER_ID = 'real_partner_888';

      const raw = 'https://www.ticketmaster.com/event/123456';
      const result = buildSafeAffiliateUrl('ticketmaster', raw, 'tm_123');
      assert.match(result, /ticketmaster\.evyy\.net/);
      assert.match(result, /real_partner_888/);
      assert.match(result, /real_campaign_999/);
    });

    test('validates legitimate event ticket URLs', () => {
      assert.equal(isValidTicketUrl('https://www.ticketmaster.com/event/1'), true);
      assert.equal(isValidTicketUrl('https://www.eventbrite.com/e/123'), true);
      assert.equal(isValidTicketUrl('https://redrocksonline.com/events/1'), true);
      assert.equal(isValidTicketUrl('https://denverartmuseum.org/calendar'), true);
    });

    test('rejects unsafe protocols and malicious open redirect URLs', () => {
      assert.equal(isValidTicketUrl('javascript:alert(1)'), false);
      assert.equal(isValidTicketUrl('data:text/html,<script>'), false);
      assert.equal(isValidTicketUrl('https://malicious-phishing-site.com/login'), false);
      assert.equal(isValidTicketUrl('http://ticketmaster.com.evil.com'), false);
      assert.equal(isValidTicketUrl(null), false);
      assert.equal(isValidTicketUrl(''), false);
    });
  });

  describe('Outbound Click Redirect Handler (/api/click)', () => {
    test('successfully performs 302 redirect for valid allowed ticket URL', async () => {
      const validUrl = 'https://redrocksonline.com/events/concert-123';
      const req = { url: `/api/click?url=${encodeURIComponent(validUrl)}&eventId=83672173-3883-419e-8545-8171ed5c9ae1&surface=feed_card` };
      let redirectedStatus = null;
      let redirectHeaders = null;
      let ended = false;

      const res = {
        writeHead(status, headers) {
          redirectedStatus = status;
          redirectHeaders = headers;
        },
        end() {
          ended = true;
        }
      };

      await clickHandler(req, res);
      assert.equal(redirectedStatus, 302);
      assert.equal(redirectHeaders.Location, validUrl);
      assert.equal(ended, true);
    });

    test('rejects missing target URL with 400', async () => {
      const req = { url: '/api/click' };
      let statusCode = null;
      let errorBody = null;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          errorBody = data;
          return this;
        }
      };

      await clickHandler(req, res);
      assert.equal(statusCode, 400);
      assert.match(errorBody.error, /Missing target url/i);
    });

    test('rejects invalid or unallowed redirect targets with 400', async () => {
      const evilUrl = 'https://attacker.com/steal-creds';
      const req = { url: `/api/click?url=${encodeURIComponent(evilUrl)}` };
      let statusCode = null;
      let errorBody = null;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          errorBody = data;
          return this;
        }
      };

      await clickHandler(req, res);
      assert.equal(statusCode, 400);
      assert.match(errorBody.error, /disallowed destination URL/i);
    });
  });

  describe('Homepage & Event Detail Handlers', () => {
    test('homepage serves complete HTML with clear discovery message', async () => {
      let outputHtml = '';
      const req = { url: '/' };
      const res = {
        setHeader() {},
        end(data) {
          outputHtml = data;
        }
      };

      homeHandler(req, res);
      assert.match(outputHtml, /Find what’s happening near you/i);
      assert.match(outputHtml, /presetDenver/i);
      assert.match(outputHtml, /radiusFilters/i);
      assert.match(outputHtml, /timeWindows/i);
    });

    test('event detail page renders 400 for missing ID', async () => {
      let statusCode = null;
      const req = { query: {} };
      const res = {
        setHeader() {},
        status(code) {
          statusCode = code;
          return {
            send() {}
          };
        }
      };

      await eventHandler(req, res);
      assert.equal(statusCode, 400);
    });

    test('event detail page renders 404 for non-existent UUID', async () => {
      let statusCode = null;
      const req = { query: { id: '00000000-0000-0000-0000-000000000000' } };
      const res = {
        setHeader() {},
        status(code) {
          statusCode = code;
          return {
            send() {}
          };
        }
      };

      await eventHandler(req, res);
      assert.equal(statusCode, 404);
    });
  });

  describe('Live Supabase Feed & Security Queries', () => {
    const denverLat = 39.7392;
    const denverLng = -104.9903;
    const windowStart = '2026-08-01T00:00:00Z';
    const windowEnd = '2026-10-31T23:59:59Z';

    test('live nearby search returns events within radius', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_feed_events_v2`, {
        method: 'POST',
        headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          p_user_lat: denverLat,
          p_user_lng: denverLng,
          p_radius_miles: 25,
          p_window_start: windowStart,
          p_window_end: windowEnd,
          p_mode: null
        })
      });

      assert.equal(res.status, 200);
      const events = await res.json();
      assert.equal(Array.isArray(events), true);
      assert.ok(events.length > 0, 'Should return Denver canonical events');
      assert.ok(events[0].title, 'Event must have a title');
      assert.ok(events[0].venue_name, 'Event must have venue name');
      assert.ok(events[0].canonical_url, 'Event must have canonical URL');
      assert.equal(typeof events[0].distance_miles, 'number');
    });

    test('live radius filter changes result count accurately', async () => {
      const queryRadius = async (r) => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_feed_events_v2`, {
          method: 'POST',
          headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            p_user_lat: denverLat,
            p_user_lng: denverLng,
            p_radius_miles: r,
            p_window_start: windowStart,
            p_window_end: windowEnd,
            p_mode: null
          })
        });
        return await res.json();
      };

      const r5 = await queryRadius(5);
      const r50 = await queryRadius(50);
      assert.ok(r5.length <= r50.length, '5-mile radius count should be <= 50-mile radius count');
    });

    test('remote ocean coordinates return zero events', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_feed_events_v2`, {
        method: 'POST',
        headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          p_user_lat: 0.0,
          p_user_lng: -160.0,
          p_radius_miles: 25,
          p_window_start: windowStart,
          p_window_end: windowEnd,
          p_mode: null
        })
      });
      assert.equal(res.status, 200);
      const events = await res.json();
      assert.equal(events.length, 0);
    });

    test('anonymous public client cannot mutate canonical_events table (RLS check)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/canonical_events`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          authorization: `Bearer ${KEY}`,
          'content-type': 'application/json',
          prefer: 'return=representation'
        },
        body: JSON.stringify({
          title: 'Unauthorized Insert Attempt',
          normalized_title: 'unauthorized',
          venue_id: '00000000-0000-0000-0000-000000000000',
          start_time: new Date().toISOString(),
          canonical_url: 'https://evil.com'
        })
      });
      assert.ok(res.status === 401 || res.status === 403, `Direct write should be blocked with 401/403, got ${res.status}`);
    });
  });

});
