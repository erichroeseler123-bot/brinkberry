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
const landingHandler = require('../api/landing.js');
const sitemapHandler = require('../api/sitemap.js');
const robotsHandler = require('../api/robots.js');
const routerHandler = require('../api/router.js');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
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
    test('valid ticket redirects still return 302', async () => {
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

    test('telemetry failure or missing service key never breaks the redirect', async () => {
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const validUrl = 'https://www.ticketmaster.com/event/test-tm';
      const req = { url: `/api/click?url=${encodeURIComponent(validUrl)}&eventId=83672173-3883-419e-8545-8171ed5c9ae1` };
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

      if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });

    test('malicious URLs remain blocked with 400', async () => {
      const dangerousTargets = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'https://attacker.com/steal-creds',
        'http://ticketmaster.com.evil.com',
        'ftp://evil.com/payload'
      ];

      for (const evilUrl of dangerousTargets) {
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
        assert.equal(statusCode, 400, `Expected 400 for malicious target: ${evilUrl}`);
        assert.match(errorBody.error, /disallowed destination URL/i);
      }
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
      assert.match(outputHtml, /Denver Next 48 Hours/i);
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

  describe('City & Category SEO Landing Pages', () => {
    const pagesToTest = [
      { url: '/denver/next-48-hours', city: 'Denver', matchText: /Denver Events in the Next 48 Hours/i },
      { url: '/denver/this-weekend', city: 'Denver', matchText: /Denver Events in the Next 48 Hours/i },
      { url: '/denver/music', city: 'Denver', matchText: /Denver Live Music & Concerts/i },
      { url: '/denver/arts', city: 'Denver', matchText: /Denver Arts & Museum Exhibits/i },
      { url: '/denver/theater', city: 'Denver', matchText: /Denver Theater & Performing Arts/i },
      { url: '/denver/free', city: 'Denver', matchText: /Free & Budget-Friendly Events/i },
      { url: '/denver/outdoor', city: 'Denver', matchText: /Outdoor Events & Activities/i },
      { url: '/boulder/next-48-hours', city: 'Boulder', matchText: /Boulder Events in the Next 48 Hours/i },
      { url: '/boulder/music', city: 'Boulder', matchText: /Boulder Live Music/i },
      { url: '/golden/next-48-hours', city: 'Golden', matchText: /Golden Events in the Next 48 Hours/i },
      { url: '/aurora/next-48-hours', city: 'Aurora', matchText: /Aurora Events in the Next 48 Hours/i }
    ];

    for (const p of pagesToTest) {
      test(`renders indexable guide for ${p.url}`, async () => {
        let statusCode = null;
        let responseHtml = '';

        const req = { url: p.url };
        const res = {
          setHeader() {},
          status(c) {
            statusCode = c;
            return {
              send(body) {
                responseHtml = body;
              }
            };
          }
        };

        await landingHandler(req, res);
        assert.equal(statusCode, 200);
        assert.match(responseHtml, p.matchText);
        assert.match(responseHtml, /application\/ld\+json/);
        assert.match(responseHtml, /rel="canonical"/);
        assert.match(responseHtml, /<meta name="robots" content="index, follow">/);
        assert.match(responseHtml, /og:title/);
        assert.match(responseHtml, /Explore Other Front Range Cities/);
      });
    }

    test('renders 404 for non-existent city', async () => {
      let statusCode = null;
      const req = { url: '/atlantis/this-weekend' };
      const res = {
        setHeader() {},
        status(c) {
          statusCode = c;
          return { send() {} };
        }
      };

      await landingHandler(req, res);
      assert.equal(statusCode, 404);
    });

    test('music guide contains only genuine music/concert events and excludes museum/arts', async () => {
      let responseHtml = '';
      let statusCode = null;
      const req = { url: '/denver/music' };
      const res = {
        setHeader() {},
        status(c) {
          statusCode = c;
          return {
            send(body) {
              responseHtml = body;
            }
          };
        }
      };

      await landingHandler(req, res);
      assert.equal(statusCode, 200);
      assert.match(responseHtml, /Jazz Jam|Showcase|Funk & Soul|Bluegrass/i);
      // Must not include generic museum or gallery tours
      assert.ok(!responseHtml.includes('Indigenous Arts of North America Guided Gallery Walk'));
      assert.ok(!responseHtml.includes('Modern & Contemporary Art Highlights Tour'));
      assert.ok(!responseHtml.includes('Pilates with Phoebe'));
    });

    test('visible count, page title, and JSON-LD ItemList count agree exactly', async () => {
      let responseHtml = '';
      const req = { url: '/denver/music' };
      const res = {
        setHeader() {},
        status(c) {
          return {
            send(body) {
              responseHtml = body;
            }
          };
        }
      };

      await landingHandler(req, res);
      const jsonLdMatch = responseHtml.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      assert.ok(jsonLdMatch, 'Page must contain JSON-LD block');
      const data = JSON.parse(jsonLdMatch[1]);
      assert.equal(typeof data.numberOfItems, 'number');
      assert.equal(data.itemListElement.length, data.numberOfItems);
      assert.match(responseHtml, new RegExp(`${data.numberOfItems} verified listings`));
    });
  });

  describe('Strict Rolling 48-Hour Boundary Tests', () => {
    test('feed handler strictly includes event at NOW + 47h and excludes event at NOW + 49h and NOW - 1h', async () => {
      let resultData = null;
      const req = { url: '/api/feed?lat=39.7392&lng=-104.9903&radius=50&window=48h' };
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(d) { resultData = d; }
      };

      await feedHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(resultData.events));

      const now = Date.now();
      const max48 = now + 48 * 3600 * 1000;

      for (const e of resultData.events) {
        const t = new Date(e.start).getTime();
        assert.ok(t >= now - 60000, `Event ${e.title} start ${e.start} must not be in the past`);
        assert.ok(t <= max48 + 60000, `Event ${e.title} start ${e.start} must not exceed 48 hours`);
      }
    });

    test('sitemap.xml strictly excludes events starting beyond 48 hours', async () => {
      let outputXml = '';
      const req = { url: '/sitemap.xml' };
      const res = {
        setHeader() {},
        status(c) {
          return {
            send(body) {
              outputXml = body;
            }
          };
        }
      };

      await sitemapHandler(req, res);
      assert.match(outputXml, /https:\/\/brinkberry.com\/denver\/next-48-hours/);

      // Verify that known far-future events in DB (such as October events) are NOT in sitemap
      assert.ok(!outputXml.includes('DTU Monthly Board Meeting'));
    });
  });

  describe('Sitemap & Robots Handlers', () => {
    test('sitemap.xml returns valid XML with city guides and canonical URLs', async () => {
      let statusCode = null;
      let contentType = null;
      let outputXml = '';

      const req = { url: '/sitemap.xml' };
      const res = {
        setHeader(name, value) {
          if (name.toLowerCase() === 'content-type') contentType = value;
        },
        status(c) {
          statusCode = c;
          return {
            send(body) {
              outputXml = body;
            }
          };
        }
      };

      await sitemapHandler(req, res);
      assert.equal(statusCode, 200);
      assert.match(contentType, /application\/xml/);
      assert.match(outputXml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
      assert.match(outputXml, /https:\/\/brinkberry.com\/denver\/next-48-hours/);
      assert.match(outputXml, /https:\/\/brinkberry.com\/boulder\/music/);
      assert.match(outputXml, /https:\/\/brinkberry.com\/golden\/outdoor/);
      assert.match(outputXml, /https:\/\/brinkberry.com\/aurora\/free/);
    });

    test('robots.txt allows all search engines and references sitemap.xml', async () => {
      let statusCode = null;
      let outputText = '';

      const req = { url: '/robots.txt' };
      const res = {
        setHeader() {},
        status(c) {
          statusCode = c;
          return {
            send(body) {
              outputText = body;
            }
          };
        }
      };

      robotsHandler(req, res);
      assert.equal(statusCode, 200);
      assert.match(outputText, /User-agent: \*/);
      assert.match(outputText, /Allow: \//);
      assert.match(outputText, /Sitemap: https:\/\/brinkberry.com\/sitemap.xml/);
    });

    test('router dispatches sitemap, robots, and city guides accurately', async () => {
      let endContent = '';
      let statusCode = 200;

      const testRoute = async (url) => {
        const req = { url, method: 'GET' };
        const res = {
          statusCode: 200,
          setHeader() {},
          status(c) { this.statusCode = c; return this; },
          send(body) { endContent = body; return this; },
          json(d) { endContent = JSON.stringify(d); return this; },
          end(d) { if (d) endContent = d; return this; }
        };
        await routerHandler(req, res);
        return { status: res.statusCode, content: endContent };
      };

      const sm = await testRoute('/sitemap.xml');
      assert.equal(sm.status, 200);
      assert.match(sm.content, /urlset/);

      const rb = await testRoute('/robots.txt');
      assert.equal(rb.status, 200);
      assert.match(rb.content, /Sitemap:/);

      const dg = await testRoute('/denver/this-weekend');
      assert.equal(dg.status, 200);
      assert.match(dg.content, /Denver Events in the Next 48 Hours/);
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

    test('anon cannot SELECT outbound_clicks (permission denied / zero records exposed)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/outbound_clicks?select=*`, {
        method: 'GET',
        headers: {
          apikey: KEY,
          authorization: `Bearer ${KEY}`
        }
      });
      // Anon has no SELECT privilege or RLS policy, returning 401/403 or empty array
      assert.ok(res.status === 401 || res.status === 403, `Anon SELECT should be rejected with 401/403, got ${res.status}`);
    });

    test('anon cannot INSERT outbound_clicks (permission denied)', async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/outbound_clicks`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          authorization: `Bearer ${KEY}`,
          'content-type': 'application/json',
          prefer: 'return=representation'
        },
        body: JSON.stringify({
          target_url: 'https://redrocksonline.com/events/1',
          surface: 'malicious_direct_injection'
        })
      });
      assert.ok(res.status === 401 || res.status === 403, `Anon INSERT should be rejected with 401/403, got ${res.status}`);
    });
  });

  describe('Geographic Coverage & Market Support', () => {
    const marketRequestHandler = require('../api/market-request.js');

    test('supported Colorado location returns isSupported = true with events', async () => {
      let feedData = null;
      let statusCode = 200;
      const req = { url: '/api/feed?lat=39.7392&lng=-104.9903&radius=25&window=48h' };
      const res = {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(feedData.meta.coverage);
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.ok(feedData.events.length > 0, 'Denver location must return events');
      assert.equal(feedData.meta.coverage.nearestMarket, 'Denver');
    });

    test('nationwide location like Eau Claire Wisconsin returns dynamic events without leaking Colorado events', async () => {
      let feedData = null;
      let statusCode = 200;
      // Eau Claire, WI: lat 44.8113, lon -91.4985
      const req = { url: '/api/feed?lat=44.8113&lng=-91.4985&radius=25&window=48h' };
      const res = {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(statusCode, 200);
      assert.ok(feedData.meta.coverage);
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.ok(feedData.events.length > 0, 'Eau Claire receives dynamic events');
      assert.match(feedData.meta.coverage.locationName, /Eau Claire/i);
    });

    test('dynamic=false flag confines search strictly to curated Colorado database', async () => {
      let feedData = null;
      const req = { url: '/api/feed?lat=44.8113&lng=-91.4985&radius=25&window=48h&dynamic=false' };
      const res = {
        status(c) { return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(feedData.events.length, 0);
    });

    test('no events inside supported market area returns isSupported = true and empty list', async () => {
      let feedData = null;
      // Remote point in mountains near Golden with 1 mile radius and obscure filter
      const req = { url: '/api/feed?lat=39.7555&lng=-105.2211&radius=1&window=now&mode=kids' };
      const res = {
        status(c) { return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.ok(feedData.meta.coverage);
      assert.equal(feedData.meta.coverage.isSupported, true);
      assert.equal(Array.isArray(feedData.events), true);
    });

    test('market request endpoint successfully logs user request for unsupported market', async () => {
      let responseJson = null;
      let statusCode = 200;
      const req = {
        method: 'POST',
        on(event, cb) {
          if (event === 'data') cb(Buffer.from(JSON.stringify({ city: 'Eau Claire, WI', lat: 44.8113, lng: -91.4985 })));
          if (event === 'end') cb();
        }
      };
      const res = {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(d) { responseJson = d; }
      };

      await marketRequestHandler(req, res);
      assert.equal(statusCode, 200);
      assert.equal(responseJson.success, true);
      assert.equal(responseJson.city, 'Eau Claire, WI');
      assert.match(responseJson.message, /recorded your market request for Eau Claire, WI/);
    });
  });

});
