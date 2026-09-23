/**
 * Event Submissions API Endpoint
 *
 * Endpoint: /api/event-submissions
 *
 * Methods:
 * - POST /api/event-submissions: Intake schedule (CSV, ICS, JSON-LD, URL) - returns receipt ONLY
 * - POST /api/event-submissions/token-exchange: Exchange one-time capability token for session
 * - POST /api/event-submissions/organizer-confirm: Out-of-band organizer confirmation (NEVER publishes events)
 * - GET /api/event-submissions: List submissions (requires admin token or valid session)
 * - POST /api/event-submissions/review: Strictly requires Admin authentication to approve/reject
 */

const { defaultSubmissionManager } = require('../lib/submissions/submission-manager');

function isAdminAuthorized(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const validTokens = [
      process.env.ADMIN_TOKEN,
      process.env.ADMIN_AUDIT_TOKEN,
      process.env.BRINKBERRY_ADMIN_KEY
    ].filter(Boolean);
    if (validTokens.includes(token)) return true;
  }

  const adminKey = req.headers['x-brinkberry-admin-key'];
  if (adminKey) {
    const validTokens = [
      process.env.ADMIN_TOKEN,
      process.env.ADMIN_AUDIT_TOKEN,
      process.env.BRINKBERRY_ADMIN_KEY
    ].filter(Boolean);
    if (validTokens.includes(adminKey)) return true;
  }

  return false;
}

function isSubmitterSessionAuthorized(req) {
  const sessionId = req.headers['x-submission-session'] || req.headers['x-session-id'];
  if (sessionId && defaultSubmissionManager.validateSession(sessionId)) {
    return true;
  }
  return false;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://brinkberry.local');
  const pathname = u.pathname;

  // 1. Token Exchange Endpoint
  if (pathname.endsWith('/token-exchange') && req.method === 'POST') {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    const { token } = body;
    const exchangeResult = await defaultSubmissionManager.exchangeCapabilityToken(token);
    if (!exchangeResult.success) {
      return res.status(401).json({ error: exchangeResult.error });
    }

    res.setHeader('Set-Cookie', `bb_submission_session=${exchangeResult.sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200`);
    return res.status(200).json({
      success: true,
      sessionId: exchangeResult.sessionId,
      submissionId: exchangeResult.submissionId
    });
  }

  // 2. Organizer Confirmation Endpoint (Out-of-band confirmation; NEVER publishes)
  if (pathname.endsWith('/organizer-confirm') && req.method === 'POST') {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    const { submissionId, token, organizerInfo } = body;
    let targetSubmissionId = submissionId;

    if (token) {
      const exchangeResult = await defaultSubmissionManager.exchangeCapabilityToken(token);
      if (!exchangeResult.success) {
        return res.status(401).json({ error: exchangeResult.error });
      }
      targetSubmissionId = exchangeResult.submissionId;
    } else if (!isSubmitterSessionAuthorized(req) && !isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized: Capability token, submitter session, or admin auth required' });
    }

    if (!targetSubmissionId) {
      return res.status(400).json({ error: 'submissionId or valid token is required' });
    }

    try {
      const result = await defaultSubmissionManager.confirmOrganizer(targetSubmissionId, organizerInfo);
      return res.status(200).json({
        success: true,
        message: 'Organizer confirmation recorded. Events remain pending admin review and are NOT published to the public canonical feed.',
        ...result
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // 3. Review Endpoint (STRICTLY requires Admin authorization; submitter sessions rejected)
  if (pathname.endsWith('/review') && req.method === 'POST') {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized: Valid admin token required for submission review. Submitter sessions cannot review.' });
    }

    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    const { submissionId, action, notes, selectedCandidateIds } = body;
    if (!submissionId || !action) {
      return res.status(400).json({ error: 'submissionId and action (approve/reject) are required' });
    }

    try {
      const result = await defaultSubmissionManager.reviewSubmission(submissionId, {
        action,
        reviewer: 'admin_reviewer',
        notes,
        selectedCandidateIds
      });
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // 4. Intake Endpoint (POST /api/event-submissions) - Returns receipt ONLY, no capability tokens
  if (req.method === 'POST' && (pathname === '/api/event-submissions' || pathname === '/api/event-submissions/')) {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    try {
      const result = await defaultSubmissionManager.submitSchedule(body);
      return res.status(201).json({
        success: true,
        message: 'Schedule submitted for review. Accountable submitter and private evidence recorded. Capability tokens are issued strictly out-of-band.',
        ...result
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // 5. List Submissions Endpoint (GET /api/event-submissions)
  if (req.method === 'GET') {
    if (!isAdminAuthorized(req) && !isSubmitterSessionAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized: Valid admin token or review session required' });
    }

    const vertical = u.searchParams.get('vertical') || null;
    const status = u.searchParams.get('status') || null;

    const list = defaultSubmissionManager.listSubmissions({ vertical, status });
    return res.status(200).json({
      success: true,
      count: list.length,
      submissions: list
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
