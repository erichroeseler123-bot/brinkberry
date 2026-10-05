import { test } from 'node:test';
import assert from 'node:assert/strict';
import routeHandler from '../api/route.js';
import homeHandler from '../api/home.js';

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
    status(code) {
      this.statusCode = code;
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

test('Driving Route & Estimated Travel Time API Suite', async (t) => {
  await t.test('calculates standard driving duration between valid coordinates', async () => {
    // Denver to Boulder
    const req = {
      method: 'GET',
      url: '/api/route?fromLat=39.7392&fromLon=-104.9903&toLat=40.0150&toLon=-105.2705'
    };
    const res = createMockRes();
    await routeHandler(req, res);

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.ok(Number.isFinite(data.durationMinutes), 'Must return finite durationMinutes');
    assert.ok(data.durationMinutes >= 20 && data.durationMinutes <= 90, 'Denver to Boulder is realistically 30-60 mins');
    assert.ok(Number.isFinite(data.distanceMiles), 'Must return distanceMiles');
    assert.equal(data.provider, 'OSRM');
    assert.equal(res.getHeader('cache-control'), 'public, s-maxage=300');
  });

  await t.test('rejects missing or invalid coordinates with 400', async () => {
    const req = {
      method: 'GET',
      url: '/api/route?fromLat=invalid&fromLon=-104.9903&toLat=40.0150&toLon=-105.2705'
    };
    const res = createMockRes();
    await routeHandler(req, res);

    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.body);
    assert.equal(data.error, 'Coordinates required');
  });

  await t.test('returns 503 error without inventing numbers when route is impossible', async () => {
    // Coords in middle of Pacific Ocean
    const req = {
      method: 'GET',
      url: '/api/route?fromLat=0.0&fromLon=0.0&toLat=0.0&toLon=170.0'
    };
    const res = createMockRes();
    await routeHandler(req, res);

    assert.equal(res.statusCode, 503);
    const data = JSON.parse(res.body);
    assert.equal(data.error, 'Travel estimate unavailable');
  });

  await t.test('homepage includes estimated drive time wiring and fallback markup', async () => {
    const req = { method: 'GET', url: '/' };
    const res = createMockRes();
    homeHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /detailDriveTime/);
    assert.match(res.body, /Estimated drive time/);
    assert.match(res.body, /Drive time unavailable/);
  });
});
