import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const widgetHandler = require('../api/widget.js');
const clickHandler = require('../api/click.js');
const routerHandler = require('../api/router.js');

describe('Brinkberry Embeddable B2B Partner Widget Suite', () => {

  test('serves responsive widget for New Orleans with partner attribution', async () => {
    let statusCode = null;
    let headers = {};
    let responseHtml = '';

    const req = {
      url: '/widget?city=new-orleans&partner=nola_tours&theme=dark',
      headers: { 'x-forwarded-for': '127.0.0.1' }
    };
    const res = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) {
        statusCode = c;
        return {
          send(body) { responseHtml = body; }
        };
      }
    };

    await widgetHandler(req, res);
    assert.equal(statusCode, 200);
    assert.match(headers['content-type'], /text\/html/);
    assert.match(headers['content-security-policy'], /frame-ancestors \*/);
    assert.equal(headers['x-frame-options'], undefined, 'Must not block iframe embedding');
    assert.match(responseHtml, /Happening in New Orleans/);
    assert.match(responseHtml, /Next 48 Hours/);
    assert.match(responseHtml, /Explore Full Live Radar/);
    assert.match(responseHtml, /utm_source=nola_tours/);
  });

  test('router dispatches /widget directly to widgetHandler', async () => {
    let statusCode = null;
    let headers = {};
    let responseHtml = '';

    const req = {
      url: '/widget?city=new-orleans&partner=nola_tours',
      headers: {}
    };
    const res = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) {
        statusCode = c;
        return {
          send(body) { responseHtml = body; },
          end(body) { responseHtml = body; }
        };
      }
    };

    await routerHandler(req, res);
    assert.equal(statusCode, 200);
    assert.match(responseHtml, /Happening in New Orleans/);
  });

  test('sanitizes malicious or malformed partner IDs', async () => {
    let responseHtml = '';
    const req = {
      url: '/widget?city=new-orleans&partner=<script>alert(1)</script>&theme=dark',
      headers: {}
    };
    const res = {
      setHeader() {},
      status() {
        return {
          send(body) { responseHtml = body; }
        };
      }
    };

    await widgetHandler(req, res);
    assert.doesNotMatch(responseHtml, /<script>alert\(1\)<\/script>/);
    assert.match(responseHtml, /utm_source=partner/);
  });

  test('falls back gracefully to New Orleans when unknown city has no coords', async () => {
    let responseHtml = '';
    const req = {
      url: '/widget?city=atlantis',
      headers: {}
    };
    const res = {
      setHeader() {},
      status() {
        return {
          send(body) { responseHtml = body; }
        };
      }
    };

    await widgetHandler(req, res);
    assert.match(responseHtml, /Happening in New Orleans/);
  });

  test('supports custom coordinates for unlisted tour destinations', async () => {
    let responseHtml = '';
    const req = {
      url: '/widget?lat=25.7617&lon=-80.1918&cityName=Miami&partner=miami_cruises',
      headers: {}
    };
    const res = {
      setHeader() {},
      status() {
        return {
          send(body) { responseHtml = body; }
        };
      }
    };

    await widgetHandler(req, res);
    assert.match(responseHtml, /Happening in Miami/);
    assert.match(responseHtml, /utm_source=miami_cruises/);
  });

  test('outbound click redirect preserves widget partner attribution', async () => {
    let redirectStatus = null;
    let redirectHeaders = null;

    const req = {
      url: '/api/click?url=https%3A%2F%2Fseatgeek.com%2Fnew-orleans-events&eventId=sg_test_123&partner=nola_tours'
    };
    const res = {
      writeHead(status, headers) {
        redirectStatus = status;
        redirectHeaders = headers;
      },
      end() {}
    };

    await clickHandler(req, res);
    assert.equal(redirectStatus, 302);
    assert.equal(redirectHeaders.Location, 'https://seatgeek.com/new-orleans-events');
  });

  test('router dispatches /terms and /privacy pages with required disclaimers', async () => {
    let termsHtml = '';
    const reqTerms = { url: '/terms' };
    const resTerms = {
      setHeader() {},
      status() { return { send(b) { termsHtml = b; } }; }
    };
    await routerHandler(reqTerms, resTerms);
    assert.match(termsHtml, /Terms of Service/);
    assert.match(termsHtml, /Independent Discovery &amp; No Endorsement|Independent Discovery & No Endorsement/);
    assert.match(termsHtml, /SeatGeek/);

    let privacyHtml = '';
    const reqPrivacy = { url: '/privacy' };
    const resPrivacy = {
      setHeader() {},
      status() { return { send(b) { privacyHtml = b; } }; }
    };
    await routerHandler(reqPrivacy, resPrivacy);
    assert.match(privacyHtml, /Privacy Policy/);
    assert.match(privacyHtml, /Approximate Geolocation/);
  });

});
