/**
 * Driving Route & Travel Time Estimate API
 *
 * Endpoint: /api/route?fromLat=...&fromLon=...&toLat=...&toLon=...
 *
 * Queries Open Source Routing Machine (OSRM) to calculate realistic
 * driving distance and standard driving duration between coordinates.
 *
 * Guardrails:
 * - Strict coordinate validation
 * - 4-second fetch timeout
 * - 5-minute HTTP caching
 * - Never invents estimates on error
 */

module.exports = async (req, res) => {
  if (!res.status) {
    res.status = function(c) { this.statusCode = c; return this; };
  }
  if (!res.json) {
    res.json = function(d) {
      if (this.setHeader) this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(d));
      return this;
    };
  }

  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const fromLat = Number(u.searchParams.get('fromLat'));
    const fromLon = Number(u.searchParams.get('fromLon'));
    const toLat = Number(u.searchParams.get('toLat'));
    const toLon = Number(u.searchParams.get('toLon'));

    if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
      return res.status(400).json({ error: 'Coordinates required' });
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false&steps=false`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Brinkberry/1.0 (https://brinkberry.com)' },
      signal: AbortSignal.timeout(4000)
    });

    if (!r.ok) {
      throw new Error(`OSRM HTTP ${r.status}`);
    }

    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes?.[0]) {
      throw new Error(j.code || 'No route found');
    }

    const route = j.routes[0];
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({
      durationMinutes: Math.ceil(route.duration / 60),
      distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
      provider: 'OSRM'
    });
  } catch (e) {
    return res.status(503).json({ error: 'Travel estimate unavailable' });
  }
};
