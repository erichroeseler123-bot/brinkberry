/**
 * Venue Claiming & Rigorous Verification API & UI
 *
 * Implements strict, multi-layer verification for comedy clubs and rooms:
 * 1. Official-domain work email (e.g. booking@comedyworks.com)
 * 2. On-site verification token (meta tag or .well-known)
 * 3. Human box office review (social handles accepted strictly as secondary supporting evidence)
 *
 * Guaranteed 100% free: No venue ever pays to be listed, claimed, or linked.
 */

const { getVenueBySlug, createVenueClaim, verifyVenueClaim, verifyEmailClaim, purgeTestVenueClaim } = require('../lib/comedy/registry');
const { isAuthorizedTestRequest } = require('../lib/comedy/auth');
const { trackClaimRequest } = require('../lib/telemetry');

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function renderClaimPage(venue) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Box Office Verification &amp; Schedule Updates — ${esc(venue.name)} | Brinkberry</title>
  <meta name="description" content="Connect official box office feeds, report cancellations, or verify domain contacts for ${esc(venue.name)} on Brinkberry.">
  <style>
    :root {
      --bg: #07050e;
      --card-bg: #120d20;
      --card-border: #261c38;
      --text: #f5effc;
      --text-dim: #9c90af;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --verified-green: #00d26a;
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
    .container {
      max-width: 680px;
      margin: 0 auto;
    }
    .top-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
    }
    .top-nav a {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
    }
    .top-nav a:hover { color: #fff; }
    .free-guarantee-banner {
      background: linear-gradient(135deg, rgba(0, 210, 106, 0.12) 0%, rgba(18, 13, 32, 0.8) 100%);
      border: 1px solid rgba(0, 210, 106, 0.35);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .free-guarantee-title {
      color: var(--verified-green);
      font-weight: 850;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .free-guarantee-text {
      font-size: 13.5px;
      color: #dfd7ee;
      margin: 0;
      line-height: 1.5;
    }
    .claim-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 28px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 26px;
      font-weight: 850;
      letter-spacing: -0.02em;
    }
    .subhead {
      color: var(--text-dim);
      font-size: 14px;
      margin: 0 0 24px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #d6caec;
      margin-bottom: 6px;
    }
    input, select, textarea {
      width: 100%;
      background: #181226;
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 14px;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--primary);
    }
    .hint {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 5px;
      line-height: 1.4;
    }
    .btn-submit {
      background: var(--primary);
      color: var(--primary-dark);
      border: none;
      font-size: 14px;
      font-weight: 800;
      padding: 12px 24px;
      border-radius: 999px;
      cursor: pointer;
      width: 100%;
      margin-top: 10px;
      transition: background 0.15s;
    }
    .btn-submit:hover { background: #ffa84d; }
    .status-msg {
      margin-top: 16px;
      padding: 14px;
      border-radius: 12px;
      font-size: 13.5px;
      display: none;
    }
    .status-success {
      background: rgba(0, 210, 106, 0.12);
      border: 1px solid rgba(0, 210, 106, 0.4);
      color: #a7ffcb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-nav">
      <a href="/">← Return to Radar</a>
      <a href="/venue/${esc(venue.slug)}">View Venue Page</a>
    </div>

    <!-- Public Discovery Index Notice Banner -->
    <div class="free-guarantee-banner" style="background: linear-gradient(135deg, rgba(255, 184, 107, 0.12) 0%, rgba(18, 13, 32, 0.8) 100%); border-color: rgba(255, 184, 107, 0.35);">
      <div class="free-guarantee-title" style="color: var(--primary);">ℹ️ Public Discovery Index Notice</div>
      <p class="free-guarantee-text">
        <strong>Brinkberry indexes public comedy schedules automatically.</strong> No venue is required to sign up, create an account, or submit a claim to appear on our live radar. We link fans directly to your official box office with zero markups or fees.
      </p>
    </div>

    <div class="claim-card">
      <div style="background: rgba(0, 210, 106, 0.08); border: 1px solid rgba(0, 210, 106, 0.25); border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <strong style="color: #fff; font-size: 14px;">Have schedule updates, cancellations, or a direct feed URL?</strong>
          <div style="color: var(--text-dim); font-size: 13px; margin-top: 4px;">Use our streamlined schedule submission and correction channel.</div>
        </div>
        <a href="/submit" class="btn-submit" style="display: inline-block; text-decoration: none; width: auto; padding: 8px 18px; margin: 0; font-size: 13px; text-align: center;">Go to /submit →</a>
      </div>
      <div style="background: rgba(255, 46, 99, 0.08); border: 1px solid rgba(255, 46, 99, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h2 style="color: var(--accent); font-size: 15px; margin-top: 0; margin-bottom: 6px;">⚠️ Venue Claim Workflow Deprecated</h2>
        <p style="color: #dfd7ee; font-size: 13px; margin: 0; line-height: 1.5;">
          Brinkberry operates as an <b>autonomous public discovery index</b>. We index public comedy schedules directly from official box offices without requiring venue claims, ownership verification, accounts, or fees. To suggest a public schedule or feed, report a cancellation, or request a listing correction, please use <a href="/submit?venue=${esc(venue.slug)}" style="color: var(--primary); font-weight: bold;">/submit</a>.
        </p>
      </div>

      <h1 style="font-size: 18px;">Legacy Domain Verification (Deprecated)</h1>
      <p class="subhead">This endpoint is retained strictly for API compatibility. Public indexing and live publishing operate independently of venue claims.</p>

      <form id="claimForm">
        <input type="hidden" name="venueSlug" value="${esc(venue.slug)}">

        <div class="form-group">
          <label for="requesterName">Your Full Name</label>
          <input type="text" id="requesterName" name="requesterName" placeholder="e.g. Sarah Jenkins" required>
        </div>

        <div class="form-group">
          <label for="role">Your Role at Venue</label>
          <select id="role" name="role" required>
            <option value="Club Owner / General Manager">Club Owner / General Manager</option>
            <option value="Talent Buyer / Bookkeeper">Talent Buyer / Booker</option>
            <option value="Box Office / Marketing Director">Box Office / Marketing Director</option>
            <option value="Independent Room Producer">Independent Room Producer</option>
          </select>
        </div>

        <div class="form-group">
          <label for="workEmail">Official Work Email</label>
          <input type="email" id="workEmail" name="workEmail" placeholder="e.g. booking@${esc(venue.website ? new URL(venue.website).hostname.replace(/^www\./, '') : 'venue.com')}" required>
          <div class="hint">
            <strong>Rigor Guardrail</strong>: Work emails matching the official venue website domain auto-verify immediately. Generic webmail (Gmail, Yahoo) requires secondary manual box office review.
          </div>
        </div>

        <div class="form-group">
          <label for="verificationMethod">Verification Method</label>
          <select id="verificationMethod" name="verificationMethod">
            <option value="domain_email">Official Domain Email (${esc(venue.website ? new URL(venue.website).hostname.replace(/^www\./, '') : 'venue website')})</option>
            <option value="website_token">Place token on venue website (.well-known or meta tag)</option>
            <option value="manual_review">Direct Box Office Verification Call</option>
          </select>
        </div>

        <div class="form-group">
          <label for="instagram">Venue Instagram / Social (Optional)</label>
          <input type="text" id="instagram" name="instagram" placeholder="e.g. @${esc(venue.slug)}">
          <div class="hint">Social handles are accepted strictly as secondary supporting evidence.</div>
        </div>

        <div class="form-group">
          <label for="notes">Additional Verification Notes (Optional)</label>
          <textarea id="notes" name="notes" rows="2" placeholder="e.g. Direct box office extension or official ticketing partner ID..."></textarea>
        </div>

        <button type="submit" id="submitBtn" class="btn-submit">Submit Box Office Verification →</button>
      </form>

      <div id="statusMsg" class="status-msg"></div>
    </div>
  </div>

  <script>
    const form = document.getElementById('claimForm');
    const msg = document.getElementById('statusMsg');
    const btn = document.getElementById('submitBtn');

    form.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Verifying…';
      msg.style.display = 'none';

      const data = {
        venueSlug: form.venueSlug.value,
        requesterName: form.requesterName.value,
        role: form.role.value,
        workEmail: form.workEmail.value,
        verificationMethod: form.verificationMethod.value,
        instagram: form.instagram.value,
        notes: form.notes.value
      };

      try {
        const res = await fetch('/api/venue/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Claim failed');

        msg.style.display = 'block';
        msg.className = 'status-msg status-success';
        if (resData.status === 'verified') {
          msg.innerHTML = '✓ <b>Venue Claim Verified!</b> Your official domain email matched the venue website. The <b>✓ Verified Club Box Office</b> badge is now live on your venue page.';
        } else {
          msg.innerHTML = '✓ <b>Claim Request Received!</b> We have logged your request under ID <code>' + resData.id + '</code>. Our curator team will verify your box office credentials within 24 hours.';
        }
        form.style.display = 'none';
      } catch (err) {
        msg.style.display = 'block';
        msg.className = 'status-msg';
        msg.style.background = 'rgba(255, 46, 99, 0.15)';
        msg.style.border = '1px solid rgba(255, 46, 99, 0.4)';
        msg.style.color = '#ff99b0';
        msg.textContent = 'Error: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'Submit Box Office Verification →';
      }
    };
  </script>
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
    if (res.setHeader) {
      res.setHeader('X-Deprecated', 'true');
      res.setHeader('Deprecation', '@deprecated: Venue claim system is deprecated. Public discovery index operates independently.');
    }
    const u = new URL(req.url || '/', 'https://brinkberry.local');
    const p = u.pathname;

    // GET /api/venue/claim?action=verify_email&claimId=...&token=...
    if (req.method === 'GET' && u.searchParams.get('action') === 'verify_email') {
      const claimId = u.searchParams.get('claimId');
      const token = u.searchParams.get('token');
      const verified = verifyEmailClaim(claimId, token);
      if (req.headers?.accept?.includes('text/html')) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(200).send(`<!doctype html>
<html>
<head><title>Venue Verified — Brinkberry</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#07050e;color:#f5effc;font-family:system-ui;padding:40px 20px;text-align:center;">
  <h1 style="color:#00d26a;">✓ Venue Claim Verified (Deprecated)</h1>
  <p>Your official domain email has been confirmed. Brinkberry indexes public comedy schedules automatically without requiring claims.</p>
  <p><a href="/venue/${esc(verified.venueSlug)}" style="color:#ffb86b;font-weight:bold;">View Venue Page →</a></p>
</body>
</html>`);
      }
      return res.status(200).json({
        success: true,
        deprecated: true,
        status: 'verified',
        venueSlug: verified.venueSlug,
        venueName: verified.venueName,
        isVenueVerified: true,
        message: 'Email confirmed! Venue verified successfully.'
      });
    }

    // GET /venue/:slug/claim
    if (req.method === 'GET' && p.startsWith('/venue/') && p.endsWith('/claim')) {
      const parts = p.split('/').filter(Boolean);
      const slug = parts[1];
      const venue = getVenueBySlug(slug);
      if (!venue) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body><h1>Venue not found</h1></body></html>');
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderClaimPage(venue));
    }

    // POST /api/venue/claim
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

      // Purge test claim (requires server-only test authorization)
      if (payload.action === 'purge_test') {
        if (!isAuthorizedTestRequest(req)) {
          return res.status(403).json({ error: 'Forbidden: Server-only test token required to purge venue claims' });
        }
        purgeTestVenueClaim(payload.venueSlug);
        return res.status(200).json({ success: true, message: 'Test venue claim purged' });
      }

      // Check if action is email verify or site token verify
      if (payload.action === 'verify_email') {
        const { claimId, token } = payload;
        const verified = verifyEmailClaim(claimId, token);
        // Privacy Guardrail: Never return personal data (workEmail, requesterName, internal tokens)
        return res.status(200).json({
          success: true,
          deprecated: true,
          status: 'verified',
          venueSlug: verified.venueSlug,
          venueName: verified.venueName,
          isVenueVerified: true,
          message: 'Email confirmed! Venue verified successfully.'
        });
      }

      if (payload.action === 'verify_token') {
        const { claimId, token } = payload;
        const verified = verifyVenueClaim(claimId, token);
        return res.status(200).json({
          success: true,
          deprecated: true,
          status: 'verified',
          venueSlug: verified.venueSlug,
          venueName: verified.venueName,
          isVenueVerified: true,
          message: 'Site token confirmed! Venue verified successfully.'
        });
      }

      const isAuthorized = isAuthorizedTestRequest(req);
      const claim = createVenueClaim({ ...payload, isAuthorized });
      trackClaimRequest(claim.venueSlug);

      const responseData = {
        success: true,
        deprecated: true,
        deprecationNotice: 'Venue claiming is deprecated in favor of autonomous public schedule indexing.',
        id: claim.id,
        status: claim.status,
        venueSlug: claim.venueSlug,
        venueName: claim.venueName,
        verificationMethod: claim.verificationMethod,
        message: claim.status === 'pending_email_verification'
          ? `Claim received! A verification email has been dispatched to the official domain for ${claim.venueName}. Please confirm via the link in that email.`
          : 'Claim submitted and pending verification review.'
      };

      // Security Guardrail: Public callers NEVER receive the secret verification token in the response!
      // Only authorized test runners presenting the server-only secret may access test tokens.
      if (isAuthorized) {
        responseData.testToken = claim.emailVerificationToken;
        responseData.isAuthorizedTest = true;
      }

      return res.status(200).json(responseData);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Venue claim error:', err);
    return res.status(400).json({ error: err.message || 'Venue claim error' });
  }
};
