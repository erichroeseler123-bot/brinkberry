import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const homeHandler = require('../api/home.js');
const feedHandler = require('../api/feed.js');
const eventHandler = require('../api/event.js');
const clickHandler = require('../api/click.js');
const landingHandler = require('../api/landing.js');
const sitemapHandler = require('../api/sitemap.js');

describe('Full Interactive Visitor Journey & Browser Flow', () => {

  test('Step 1: Visitor loads homepage and receives complete interactive discovery UI', async () => {
    let outputHtml = '';
    const req = { url: '/' };
    const res = {
      setHeader() {},
      end(data) { outputHtml = data; }
    };
    homeHandler(req, res);

    assert.match(outputHtml, /Find what’s happening near you/);
    assert.match(outputHtml, /presetDenver/);
    assert.match(outputHtml, /presetBoulder/);
    assert.match(outputHtml, /presetGolden/);
    assert.match(outputHtml, /presetAurora/);
    assert.match(outputHtml, /radiusFilters/);
    assert.match(outputHtml, /timeWindows/);
    assert.match(outputHtml, /modeFilters/);
    assert.match(outputHtml, /detailDlg/);
    assert.match(outputHtml, /radar/);
  });

  test('Step 2: User selects location preset and filters to query live feed', async () => {
    const locations = [
      { city: 'Denver', lat: 39.7392, lon: -104.9903 },
      { city: 'Boulder', lat: 40.0150, lon: -105.2705 },
      { city: 'Golden', lat: 39.7555, lon: -105.2211 },
      { city: 'Aurora', lat: 39.7294, lon: -104.8319 }
    ];

    for (const loc of locations) {
      let feedData = null;
      const req = { url: `/api/feed?lat=${loc.lat}&lng=${loc.lon}&radius=25&window=weekend` };
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(d) { feedData = d; }
      };

      await feedHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(feedData.events));
      assert.ok(feedData.events.length > 0, `Expected events for ${loc.city}`);
      assert.ok(feedData.events[0].id, 'Event must have ID');
      assert.ok(feedData.events[0].title, 'Event must have title');
      assert.ok(feedData.events[0].ticketUrl, 'Event must have ticket URL');
      assert.equal(typeof feedData.events[0].distanceMiles, 'number');
    }
  });

  test('Step 3: User opens standalone event page for a selected event', async () => {
    // 1. Get an event from feed
    let feedData = null;
    await feedHandler({ url: '/api/feed?lat=39.7392&lng=-104.9903&radius=25&window=weekend' }, {
      status() { return this; },
      json(d) { feedData = d; }
    });

    const event = feedData.events[0];
    assert.ok(event, 'Feed should return at least one event');

    // 2. Load standalone event page
    let eventHtml = '';
    let statusCode = 200;
    const req = { query: { id: event.id } };
    const res = {
      setHeader() {},
      status(c) { statusCode = c; return this; },
      send(b) { eventHtml = b; }
    };

    await eventHandler(req, res);
    assert.equal(statusCode, 200);
    assert.match(eventHtml, new RegExp(event.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(eventHtml, /rel="canonical"/);
    assert.match(eventHtml, /application\/ld\+json/);
    assert.match(eventHtml, /Get Tickets & Event Details/);
    assert.match(eventHtml, /Share Event/);
  });

  test('Step 4: User clicks Get Tickets resulting in safe 302 redirect', async () => {
    // 1. Get an event
    let feedData = null;
    await feedHandler({ url: '/api/feed?lat=39.7392&lng=-104.9903&radius=25&window=weekend' }, {
      status() { return this; },
      json(d) { feedData = d; }
    });
    const event = feedData.events[0];

    // 2. Click redirect
    let redirectedStatus = null;
    let redirectHeaders = null;
    const clickReq = {
      url: `/api/click?url=${encodeURIComponent(event.ticketUrl)}&eventId=${encodeURIComponent(event.id)}&surface=event_page`
    };
    const clickRes = {
      writeHead(status, headers) {
        redirectedStatus = status;
        redirectHeaders = headers;
      },
      end() {}
    };

    await clickHandler(clickReq, clickRes);
    assert.equal(redirectedStatus, 302);
    assert.equal(redirectHeaders.Location, event.ticketUrl);
  });

  test('Step 5: City & Topic landing pages serve pre-rendered event listings', async () => {
    const landingPages = ['/denver/this-weekend', '/boulder/music', '/golden/outdoor', '/aurora/free'];
    for (const url of landingPages) {
      let pageHtml = '';
      let statusCode = 200;
      await landingHandler({ url }, {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        send(b) { pageHtml = b; }
      });

      assert.equal(statusCode, 200);
      assert.match(pageHtml, /application\/ld\+json/);
      assert.match(pageHtml, /rel="canonical"/);
      assert.match(pageHtml, /Get Tickets/);
    }
  });

});
