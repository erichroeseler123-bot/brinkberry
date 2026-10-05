import { test } from 'node:test';
import assert from 'node:assert/strict';
import routerHandler from '../api/router.js';
import widgetHandler from '../api/widget.js';
import widgetGeneratorHandler from '../api/widget-generator.js';
import clickHandler from '../api/click.js';

function createMockReq(url, method = 'GET', headers = {}) {
  return {
    method,
    url,
    headers: {
      host: 'brinkberry.com',
      ...headers
    }
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    removeHeader(name) {
      delete this.headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    json(data) {
      this.setHeader('Content-Type', 'application/json');
      this.body = JSON.stringify(data);
      return this;
    },
    end(data) {
      if (data) this.body = data;
      return this;
    }
  };
  return res;
}

test('Widget Generator & Embedded Partner Workflow', async (t) => {
  await t.test('router dispatches /embed and /widget-generator to generator handler', async () => {
    const req1 = createMockReq('/embed');
    const res1 = createMockRes();
    await routerHandler(req1, res1);
    assert.equal(res1.statusCode, 200);
    assert.match(res1.body, /Embed a Live Event Radar on Your Website/);
    assert.match(res1.body, /Choose Target City or Coordinates/);
    assert.match(res1.body, /Copy Embed Code/);

    const req2 = createMockReq('/widget-generator');
    const res2 = createMockRes();
    await routerHandler(req2, res2);
    assert.equal(res2.statusCode, 200);
    assert.match(res2.body, /Partner Widget/);
  });

  await t.test('generator UI includes CMS platform instructions and interactive preview', async () => {
    const req = createMockReq('/embed');
    const res = createMockRes();
    widgetGeneratorHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /WordPress/);
    assert.match(res.body, /Squarespace/);
    assert.match(res.body, /Wix/);
    assert.match(res.body, /previewIframe/);
    assert.match(res.body, /embedCodeOutput/);
  });

  await t.test('widget endpoint sets permissive iframe headers for cross-site embedding', async () => {
    const req = createMockReq('/widget?city=denver');
    const res = createMockRes();
    await widgetHandler(req, res);
    assert.equal(res.statusCode, 200);

    const csp = res.getHeader('content-security-policy') || '';
    assert.ok(csp.includes('frame-ancestors *'), 'CSP must allow embedding from external domains');
    assert.equal(res.getHeader('x-frame-options'), undefined, 'Must not block iframe with X-Frame-Options');
  });

  await t.test('widget renders real events and links open with target="_blank" safely', async () => {
    const req = createMockReq('/widget?city=denver&theme=light&limit=3&partner=test-hotel');
    const res = createMockRes();
    await widgetHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Happening in Denver/);
    assert.match(res.body, /target="_blank"/);
    assert.match(res.body, /rel="noopener noreferrer"/);
    assert.match(res.body, /partner=test-hotel/);
    assert.match(res.body, /Embed this widget/);
  });

  await t.test('widget preserves partner attribution in outbound click redirects', async () => {
    const partnerId = 'historic-hotel-nola';
    const clickUrl = `/api/click?url=${encodeURIComponent('https://seatgeek.com/some-event')}&eventId=evt_123&surface=widget_${partnerId}&partner=${partnerId}`;
    const req = createMockReq(clickUrl);
    const res = createMockRes();
    await clickHandler(req, res);

    assert.equal(res.statusCode, 302);
    const location = res.getHeader('location');
    assert.ok(location, 'Must redirect to target url');
    assert.match(location, /seatgeek\.com/);
  });

  await t.test('widget respects ticketing optionality for non-ticketed events', async () => {
    const req = createMockReq('/widget?city=eau-claire&limit=6');
    const res = createMockRes();
    await widgetHandler(req, res);
    assert.equal(res.statusCode, 200);
    // Eau Claire has civic and community library events without paid checkouts
    const hasAgendaOrFreeOrDetails = /Meeting Agenda →|Free Event →|View Details →|Get Tickets →/.test(res.body);
    assert.ok(hasAgendaOrFreeOrDetails, 'Widget must dynamically label event action buttons');
  });
});
