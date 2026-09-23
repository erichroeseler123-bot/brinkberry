/**
 * "Bring This Comic to My City" Demand Signal API
 *
 * Captures fan demand signals per comedian and city with zero platform bloat,
 * 30-day deduplication, and zero-spam privacy protections.
 */

const { recordDemandSignal, getDemandSummaryForComic, purgeTestDemandSignals } = require('../lib/comedy/registry');
const { trackFilterChange, trackPilotDemand } = require('../lib/telemetry');
const { isAuthorizedTestRequest } = require('../lib/comedy/auth');

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.json) res.json = function(d) {
    if (this.setHeader) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(d));
    return this;
  };

  try {
    const u = new URL(req.url || '/', 'https://brinkberry.local');

    if (req.method === 'GET') {
      const comicSlug = u.searchParams.get('comic') || u.searchParams.get('comicSlug');
      if (!comicSlug) {
        return res.status(400).json({ error: 'comicSlug parameter is required' });
      }
      const summary = getDemandSummaryForComic(comicSlug);
      return res.status(200).json(summary);
    }

    if (req.method === 'POST') {
      let payload = req.body || null;
      if (!payload || typeof payload !== 'object') {
        let body = '';
        if (req[Symbol.asyncIterator]) {
          for await (const chunk of req) body += chunk;
        }
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          return res.status(400).json({ error: 'Invalid JSON payload' });
        }
      }

      if (payload.action === 'purge_test') {
        if (!isAuthorizedTestRequest(req)) {
          return res.status(403).json({ error: 'Forbidden: Server-only test token required to purge test records' });
        }
        purgeTestDemandSignals(payload.comicSlug);
        return res.status(200).json({ success: true, message: 'Test demand signals purged' });
      }

      const isAuthorized = isAuthorizedTestRequest(req);
      const comicSlug = payload.comicSlug || u.searchParams.get('comicSlug');
      const comicName = payload.comicName || payload.name;
      const city = payload.city || u.searchParams.get('city');
      const email = payload.email;
      const postalCode = payload.postalCode || payload.zip;
      const consent = payload.consent;
      // Guardrail: A public client cannot set isTest or send trusted test headers without server authorization!
      const isTest = Boolean(isAuthorized && (payload.isTest || req.headers?.['x-brinkberry-test'] === 'true'));

      if (!comicSlug || !city) {
        return res.status(400).json({ error: 'comicSlug and city are required' });
      }

      const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;

      const result = recordDemandSignal({
        comicSlug,
        comicName,
        city,
        email,
        postalCode,
        ip,
        consent,
        isTest,
        isAuthorized
      });

      trackFilterChange('demand_city', `${comicSlug}:${city}`);
      trackPilotDemand(comicSlug, city);

      return res.status(200).json({
        success: true,
        isDuplicate: result.isDuplicate,
        city: result.city,
        cityCount: result.cityCount,
        totalDemand: result.totalComicDemand,
        emailRetained: result.emailRetained,
        isTest: result.isTest,
        message: result.isDuplicate
          ? `You already requested ${comicName || comicSlug} in ${result.city} recently!`
          : `Thanks! You and ${result.cityCount - 1} other fans in ${result.city} have requested a show.`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Demand signal error:', err);
    const statusCode = err.status || (err.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 400);
    return res.status(statusCode).json({ error: err.message || 'Demand signal error' });
  }
};
