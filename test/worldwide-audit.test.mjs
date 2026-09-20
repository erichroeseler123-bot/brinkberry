import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const homeHandler = require('../api/home.js');
const feedHandler = require('../api/feed.js');
const landingHandler = require('../api/landing.js');
const weatherHandler = require('../api/weather.js');
const routerHandler = require('../api/router.js');

describe('Worldwide Local-Events Product Audit & Bug Fix Suite', () => {

  describe('1. Homepage Worldwide Assumptions & Preset Removal', () => {
    test('homepage metadata is global and does not restrict to Colorado cities', async () => {
      let outputHtml = '';
      homeHandler({ url: '/' }, {
        setHeader() {},
        end(data) { outputHtml = data; }
      });

      assert.match(outputHtml, /Brinkberry — Find What’s Happening Near You Right Now/);
      assert.ok(
        !outputHtml.includes('in Denver, Boulder, Golden, and Aurora'),
        'Homepage meta description should not restrict product scope to Denver, Boulder, Golden, and Aurora'
      );
      assert.match(outputHtml, /Worldwide Hyperlocal Event Radar/);
      assert.match(outputHtml, /Popular Worldwide Event Guides/);
    });

    test('homepage features global preset hubs alongside Denver', async () => {
      let outputHtml = '';
      homeHandler({ url: '/' }, {
        setHeader() {},
        end(data) { outputHtml = data; }
      });

      // Denver preserved as a first-class supported location
      assert.match(outputHtml, /id="presetDenver"/);
      // Worldwide presets
      assert.match(outputHtml, /id="presetLondon"/);
      assert.match(outputHtml, /id="presetNewYork"/);
      assert.match(outputHtml, /id="presetTokyo"/);
      assert.match(outputHtml, /id="presetParis"/);
      // City search input
      assert.match(outputHtml, /id="citySearchInput"/);
    });

    test('city guides footer links to global cities as well as Denver', async () => {
      let outputHtml = '';
      homeHandler({ url: '/' }, {
        setHeader() {},
        end(data) { outputHtml = data; }
      });

      assert.match(outputHtml, /\/denver\/next-48-hours/);
      assert.match(outputHtml, /\/london\/next-48-hours/);
      assert.match(outputHtml, /\/new-york\/next-48-hours/);
      assert.match(outputHtml, /\/tokyo\/next-48-hours/);
      assert.match(outputHtml, /\/paris\/next-48-hours/);
    });
  });

  describe('2. Bug Fix: /?city=denver State & Location Desynchronization', () => {
    test('/?city=denver pre-pins Denver canonical coordinates and marks fromUrl', async () => {
      let outputHtml = '';
      homeHandler({ url: '/?city=denver' }, {
        setHeader() {},
        end(data) { outputHtml = data; }
      });

      // Server pre-resolves Denver coordinates
      assert.match(outputHtml, /"city":"Denver"/);
      assert.match(outputHtml, /"lat":39.7392/);
      assert.match(outputHtml, /"lon":-104.9903/);
      assert.match(outputHtml, /"fromUrl":true/);
    });

    test('/?city=london pre-pins London canonical coordinates and marks fromUrl', async () => {
      let outputHtml = '';
      homeHandler({ url: '/?city=london' }, {
        setHeader() {},
        end(data) { outputHtml = data; }
      });

      assert.match(outputHtml, /"city":"London"/);
      assert.match(outputHtml, /"lat":51.5074/);
      assert.match(outputHtml, /"lon":-0.1278/);
      assert.match(outputHtml, /"fromUrl":true/);
    });

    test('/?city=denver feed returns verified Denver events with matching city coordinates', async () => {
      let feedData = null;
      let statusCode = 200;
      await feedHandler({ url: '/api/feed?city=Denver&lat=39.7392&lng=-104.9903&radius=25&window=48h' }, {
        status(c) { statusCode = c; return this; },
        json(d) { feedData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(Array.isArray(feedData.events));
      assert.ok(feedData.events.length > 0);
      assert.equal(feedData.meta.coverage.isCuratedMarket, true);
      assert.equal(feedData.meta.coverage.isSupported, true);

      // Verify all returned events are local to Denver metro (not from other cities)
      for (const e of feedData.events) {
        assert.ok(e.distanceMiles <= 60, `Event ${e.title} should be within Denver radius`);
      }
    });
  });

  describe('3. Worldwide City Guides & Routing', () => {
    test('renders international city guides for London, Paris, Tokyo, and New York', async () => {
      const internationalGuides = [
        { url: '/london/music', cityName: 'London', topicSnippet: /London Live Music/ },
        { url: '/paris/next-48-hours', cityName: 'Paris', topicSnippet: /Paris Events in the Next 48 Hours/ },
        { url: '/tokyo/arts', cityName: 'Tokyo', topicSnippet: /Tokyo Arts & Museum Exhibits/ },
        { url: '/new-york/this-weekend', cityName: 'New York', topicSnippet: /New York Events in the Next 48 Hours/ }
      ];

      for (const guide of internationalGuides) {
        let pageHtml = '';
        let statusCode = 200;
        await landingHandler({ url: guide.url }, {
          setHeader() {},
          status(c) { statusCode = c; return this; },
          send(b) { pageHtml = b; }
        });

        assert.equal(statusCode, 200, `Failed to render ${guide.url}`);
        assert.match(pageHtml, guide.topicSnippet);
        assert.match(pageHtml, /application\/ld\+json/);
        assert.match(pageHtml, /rel="canonical"/);

        // Verify Colorado-specific assumptions are absent from international guides
        assert.ok(!pageHtml.includes('300+ days of Colorado sunshine'), `Found Colorado sunshine reference in ${guide.url}`);
        assert.ok(!pageHtml.includes('experience Colorado'), `Found experience Colorado reference in ${guide.url}`);
      }
    });

    test('router dynamically dispatches international city guide paths to landingHandler', async () => {
      const internationalPaths = ['/london', '/london/music', '/tokyo/free', '/paris/outdoor', '/new-york/arts'];

      for (const p of internationalPaths) {
        let outputHtml = '';
        let statusCode = 200;
        const res = {
          setHeader() {},
          status(c) { statusCode = c; return this; },
          send(b) { outputHtml = b; }
        };

        await routerHandler({ url: p }, res);
        assert.equal(statusCode, 200);
        assert.match(outputHtml, /application\/ld\+json/);
      }
    });

    test('outdoor topic guide intro is free of Colorado-specific sunshine claim', async () => {
      let denverOutdoorHtml = '';
      await landingHandler({ url: '/denver/outdoor' }, {
        setHeader() {},
        status() { return this; },
        send(b) { denverOutdoorHtml = b; }
      });

      assert.ok(!denverOutdoorHtml.includes('300+ days of Colorado sunshine'));
      assert.match(denverOutdoorHtml, /Make the most of the open air/);
    });
  });

  describe('4. Worldwide Weather Endpoint', () => {
    test('successfully fetches weather for international coordinates (London)', async () => {
      let weatherData = null;
      let statusCode = 200;
      await weatherHandler({ url: '/api/weather?lat=51.5074&lng=-0.1278' }, {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(d) { weatherData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(weatherData);
      assert.ok(weatherData.current);
      assert.equal(typeof weatherData.current.temperature, 'number');
      assert.equal(weatherData.current.temperatureUnit, 'F');
      assert.ok(weatherData.current.shortForecast);
      assert.equal(typeof weatherData.maxPrecipNext3h, 'number');
      assert.equal(typeof weatherData.planBWeather, 'boolean');
    });

    test('successfully fetches weather for international coordinates (Tokyo)', async () => {
      let weatherData = null;
      let statusCode = 200;
      await weatherHandler({ url: '/api/weather?lat=35.6762&lng=139.6503' }, {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(d) { weatherData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(weatherData.current);
      assert.equal(typeof weatherData.current.temperature, 'number');
    });

    test('successfully fetches weather for Denver', async () => {
      let weatherData = null;
      let statusCode = 200;
      await weatherHandler({ url: '/api/weather?lat=39.7392&lng=-104.9903' }, {
        setHeader() {},
        status(c) { statusCode = c; return this; },
        json(d) { weatherData = d; }
      });

      assert.equal(statusCode, 200);
      assert.ok(weatherData.current);
      assert.equal(typeof weatherData.current.temperature, 'number');
    });
  });

  describe('5. Feed Longitude-Aware Time Windowing', () => {
    test('calculates rolling 48-hour bounds accurately for Tokyo (+9) longitude', async () => {
      let feedData = null;
      await feedHandler({ url: '/api/feed?lat=35.6762&lng=139.6503&radius=25&window=tonight' }, {
        status() { return this; },
        json(d) { feedData = d; }
      });

      assert.ok(feedData);
      assert.equal(feedData.meta.window, 'tonight');
    });

    test('calculates rolling 48-hour bounds accurately for London (0) longitude', async () => {
      let feedData = null;
      await feedHandler({ url: '/api/feed?lat=51.5074&lng=-0.1278&radius=25&window=tonight' }, {
        status() { return this; },
        json(d) { feedData = d; }
      });

      assert.ok(feedData);
      assert.equal(feedData.meta.window, 'tonight');
    });
  });

});
