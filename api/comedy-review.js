/**
 * Stand-Up Comedy Moderation & Review Handler
 *
 * Provides API endpoints for platform operators to review pending submissions,
 * verify listings, or reject/cancel invalid shows.
 */

const {
  getPendingSubmissions,
  getAllSubmissions,
  getSubmissionById,
  verifySubmission,
  rejectOrCancelSubmission
} = require('../lib/comedy/registry');
const { REVIEWER_SECRET } = require('../lib/comedy/verification');

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const token = req.headers['authorization']?.replace('Bearer ', '') || u.searchParams.get('token');

    if (token !== REVIEWER_SECRET) {
      res.setHeader('content-type', 'application/json');
      return res.status(401).json({ error: 'Unauthorized: Valid moderator token required' });
    }

    const action = u.searchParams.get('action') || 'list_pending';

    if (req.method === 'GET' && action === 'list_pending') {
      const pending = getPendingSubmissions();
      res.setHeader('content-type', 'application/json');
      return res.status(200).json({
        count: pending.length,
        submissions: pending
      });
    }

    if (req.method === 'GET' && action === 'list_all') {
      const all = getAllSubmissions();
      res.setHeader('content-type', 'application/json');
      return res.status(200).json({
        count: all.length,
        submissions: all
      });
    }

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}

      const id = payload.id || u.searchParams.get('id');
      if (!id) {
        res.setHeader('content-type', 'application/json');
        return res.status(400).json({ error: 'Submission ID required' });
      }

      if (action === 'verify') {
        const updated = verifySubmission(id, { moderatorToken: token, notes: payload.notes });
        res.setHeader('content-type', 'application/json');
        return res.status(200).json({
          success: true,
          id: updated.id,
          status: updated.verification.status,
          message: `Show "${updated.title}" successfully verified and active on live radar.`
        });
      }

      if (action === 'reject' || action === 'cancel') {
        const updated = rejectOrCancelSubmission(id, { moderatorToken: token, notes: payload.notes });
        res.setHeader('content-type', 'application/json');
        return res.status(200).json({
          success: true,
          id: updated.id,
          status: updated.verification.status,
          message: `Show "${updated.title}" marked cancelled.`
        });
      }
    }

    res.setHeader('content-type', 'application/json');
    return res.status(400).json({ error: 'Invalid action or method' });
  } catch (err) {
    console.error('Comedy review error:', err);
    res.setHeader('content-type', 'application/json');
    return res.status(500).json({ error: err.message || 'Review error' });
  }
};
