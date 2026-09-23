/**
 * Touring Series & Driver Fan Demand API
 *
 * Captures grassroots fan demand signals for series and drivers per race track
 * with 30-day deduplication and zero-spam privacy protections.
 */

const { recordRacingDemandSignal, getRacingDemandSummary, purgeTestRacingDemand } = require('../lib/racing/registry');
const { trackRacingDemand } = require('../lib/telemetry');
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
      const entitySlug = u.searchParams.get('entity') || u.searchParams.get('entitySlug') || u.searchParams.get('series');
      if (!entitySlug) {
        return res.status(400).json({ error: 'entitySlug parameter is required' });
      }
      const summary = getRacingDemandSummary(entitySlug);
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
          return res.status(403).json({ error: 'Forbidden: Server-only test token required' });
        }
        purgeTestRacingDemand(payload.entitySlug);
        return res.status(200).json({ success: true, message: 'Test racing demand purged' });
      }

      const isAuthorized = isAuthorizedTestRequest(req);
      const entitySlug = payload.entitySlug || u.searchParams.get('entitySlug');
      const trackSlug = payload.trackSlug || u.searchParams.get('trackSlug');
      const email = payload.email;
      const consent = Boolean(payload.consent);
      const isTest = Boolean(isAuthorized && (payload.isTest || req.headers?.['x-brinkberry-test'] === 'true'));

      if (!entitySlug || !trackSlug) {
        return res.status(400).json({ error: 'entitySlug and trackSlug are required' });
      }

      const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;

      const result = recordRacingDemandSignal({
        entitySlug,
        entityType: payload.entityType || 'series',
        entityName: payload.entityName,
        trackSlug,
        email,
        ip,
        consent,
        isTest,
        isAuthorized
      });

      trackRacingDemand(entitySlug, payload.entityType || 'series', trackSlug);

      return res.status(200).json({
        success: true,
        deduplicated: result.deduplicated,
        isDuplicate: result.isDuplicate,
        entitySlug: result.entitySlug,
        trackSlug: result.trackSlug,
        trackDemand: result.trackDemand,
        totalDemand: result.totalDemand,
        emailRetained: result.emailRetained,
        isTest: result.isTest,
        message: result.isDuplicate
          ? `Demand already recorded recently for this track from your location.`
          : `Demand recorded! ${result.trackDemand} fans want ${entitySlug} at ${trackSlug}.`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
      return res.status(429).json({ error: err.message, status: 429 });
    }
    console.error('Racing demand error:', err);
    return res.status(400).json({ error: err.message || 'Demand processing error' });
  }
};
