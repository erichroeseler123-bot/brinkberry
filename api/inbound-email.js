/**
 * Inbound Email Webhook API Endpoint
 *
 * Endpoint: /api/inbound-email or /api/inbound-email/webhook
 *
 * Methods:
 * - POST: Ingest inbound email webhook payload (MIME / parsed JSON from Postmark/SES/SendGrid)
 *
 * Strict Guardrails:
 * - Sender authentication (SPF/DKIM) validated
 * - Venue authorization allowlist checked against explicit club consent
 * - Raw MIME evidence archived privately
 * - Recurring-date synthesis prohibited
 * - Zero publication to public feeds (remains in event_submissions queue pending admin review)
 */

const { defaultEmailIngestionEngine } = require('../lib/submissions/email-ingestion');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Optional webhook secret verification
  const webhookSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const authHeader = req.headers['x-inbound-webhook-token'] || req.headers['authorization'];
    if (!authHeader || !authHeader.includes(webhookSecret)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid inbound webhook token' });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch (_) {
    return res.status(400).json({ error: 'Malformed JSON webhook payload' });
  }

  try {
    const result = await defaultEmailIngestionEngine.processInboundEmail(body);

    if (!result.success) {
      return res.status(403).json({
        success: false,
        message: 'Inbound email rejected by trust boundary',
        ...result
      });
    }

    return res.status(202).json({
      success: true,
      message: 'Inbound email received and candidate schedule queued for review. Raw MIME evidence preserved privately.',
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
