/**
 * Race Track Claiming & Verification API & UI
 *
 * Implements strict, multi-layer verification for race track operators & promoters:
 * 1. Official-domain work email (e.g. promoter@coloradospeedway.com)
 * 2. On-site verification token (meta tag or .well-known)
 * 3. Guaranteed 100% free: No track pays to be listed, claimed, or linked.
 */

const { getTrackBySlug, createTrackClaim, verifyTrackEmailClaim, purgeTestTrackClaim } = require('../lib/racing/registry');
const { isAuthorizedTestRequest } = require('../lib/comedy/auth');
const { trackTrackClaimRequest } = require('../lib/telemetry');

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function renderClaimPage(track) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claim &amp; Verify ${esc(track.name)} — Brinkberry Racing</title>
  <meta name="description" content="Claim the official box office and schedule page for ${esc(track.name)} on Brinkberry. 100% free discovery.">
  <style>
    :root {
      --bg: #07040d;
      --card-bg: #120b1e;
      --card-border: #26193b;
      --text: #f5effc;
      --text-dim: #9c90af;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --green: #00d26a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 24px 16px 60px;
    }
    .container { max-width: 680px; margin: 0 auto; }
    .top-nav { margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--card-border); }
    .top-nav a { color: var(--text-dim); text-decoration: none; font-size: 13.5px; font-weight: 600; }
    .guarantee-box {
      background: linear-gradient(135deg, rgba(0, 210, 106, 0.12), rgba(18, 11, 28, 0.9));
      border: 1px solid rgba(0, 210, 106, 0.35);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .guarantee-title {
      color: var(--green);
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .guarantee-text {
      color: #ded6ec;
      font-size: 13.5px;
      margin: 0;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
    }
    .field { margin-bottom: 18px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #ded6ec; margin-bottom: 6px; }
    input, select, textarea {
      width: 100%;
      background: #180e28;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 14px;
    }
    .btn-submit {
      background: var(--primary);
      color: var(--primary-dark);
      font-weight: 800;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14.5px;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="top-nav">
      <a href="/track/${esc(track.slug)}">← Back to ${esc(track.name)}</a>
    </nav>

    <div class="guarantee-box">
      <div class="guarantee-title">🛡️ Absolute Free Guarantee for Track Promoters</div>
      <p class="guarantee-text">
        Listing, claiming, and traffic routing on Brinkberry are 100% free forever. We never charge ticket fees, buyer commissions, or paywall your schedules. Every ticket link routes directly to your official box office or notes your cash-at-the-gate admission.
      </p>
    </div>

    <div class="card">
      <h1 style="margin:0 0 10px; font-size:24px;">Claim Official Track Profile</h1>
      <p style="color:var(--text-dim); font-size:13.5px; margin-bottom:20px;">
        Verify management of <strong>${esc(track.name)}</strong> (${esc(track.city)}, ${esc(track.state)}) to publish official weather alerts, rain dates, and direct box office links.
      </p>

      <form id="claimForm">
        <div class="field">
          <label>Your Full Name</label>
          <input type="text" id="requesterName" required placeholder="e.g. John Promoter">
        </div>

        <div class="field">
          <label>Your Role at the Track</label>
          <input type="text" id="requesterRole" required placeholder="e.g. General Manager, Race Director, Promoter">
        </div>

        <div class="field">
          <label>Official Work Email (Official domain preferred)</label>
          <input type="email" id="workEmail" required placeholder="promoter@coloradospeedway.com">
          <small style="color:var(--text-dim); font-size:11.5px; display:block; margin-top:4px;">
            Emails matching the track website domain receive automated instant verification links.
          </small>
        </div>

        <button type="submit" class="btn-submit">Submit Track Claim</button>
        <div id="claimMsg" style="margin-top:14px; font-size:14px; font-weight:700;"></div>
      </form>
    </div>

    <script>
      document.getElementById('claimForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('claimMsg');
        msg.textContent = 'Submitting claim...';

        try {
          const res = await fetch('/api/racing/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trackSlug: '${track.slug}',
              requesterName: document.getElementById('requesterName').value,
              requesterRole: document.getElementById('requesterRole').value,
              workEmail: document.getElementById('workEmail').value
            })
          });
          const data = await res.json();
          if (res.ok) {
            msg.style.color = '#00d26a';
            msg.textContent = data.message || 'Claim received! Please check your email for confirmation.';
          } else {
            msg.style.color = '#ff2e63';
            msg.textContent = data.error || 'Failed to submit claim.';
          }
        } catch (_) {
          msg.style.color = '#ff2e63';
          msg.textContent = 'Network error. Please try again.';
        }
      });
    </script>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.json) res.json = function(d) {
    if (this.setHeader) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(d));
    return this;
  };
  if (!res.send) res.send = function(html) {
    if (this.setHeader) this.setHeader('Content-Type', 'text/html; charset=utf-8');
    this.end(html);
    return this;
  };

  try {
    const u = new URL(req.url || '/', 'https://brinkberry.local');
    const p = u.pathname;

    // GET /track/:slug/claim
    if (req.method === 'GET' && p.startsWith('/track/') && p.endsWith('/claim')) {
      const parts = p.split('/').filter(Boolean);
      const slug = parts[1];
      const track = getTrackBySlug(slug);
      if (!track) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body><h1>Track not found</h1></body></html>');
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderClaimPage(track));
    }

    // POST /api/racing/claim
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

      // Purge test claims (requires server-only test authorization)
      if (payload.action === 'purge_test') {
        if (!isAuthorizedTestRequest(req)) {
          return res.status(403).json({ error: 'Forbidden: Server-only test token required to purge track claims' });
        }
        purgeTestTrackClaim(payload.trackSlug);
        return res.status(200).json({ success: true, message: 'Test track claim purged' });
      }

      // Email verification confirmation
      if (payload.action === 'verify_email') {
        const { claimId, token } = payload;
        const verified = verifyTrackEmailClaim(claimId, token);
        return res.status(200).json({
          success: true,
          status: 'verified',
          trackSlug: verified.trackSlug,
          trackName: verified.trackName,
          isVenueVerified: true,
          message: 'Official track email confirmed! Track verified successfully.'
        });
      }

      const isAuthorized = isAuthorizedTestRequest(req);
      const claim = createTrackClaim({ ...payload, isAuthorized });
      trackTrackClaimRequest(claim.trackSlug);

      const responseData = {
        success: true,
        id: claim.id,
        status: claim.status,
        trackSlug: claim.trackSlug,
        trackName: claim.trackName,
        verificationMethod: claim.verificationMethod,
        message: claim.status === 'pending_email_verification'
          ? `Claim received! A confirmation email has been dispatched to the official domain for ${claim.trackName}.`
          : 'Claim submitted and pending verification review.'
      };

      if (isAuthorized) {
        responseData.testToken = claim.emailVerificationToken;
        responseData.isAuthorizedTest = true;
      }

      return res.status(200).json(responseData);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Track claim error:', err);
    return res.status(400).json({ error: err.message || 'Track claim error' });
  }
};
