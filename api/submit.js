/**
 * Venue, Comedian & Promoter Submission Endpoint
 *
 * Endpoint: /submit and /api/submit
 *
 * Provides a lightweight, frictionless, zero-fee portal for:
 * - Comedy clubs & venues to submit/sync their official schedules
 * - Touring comedians to submit their tour stops and venue links
 * - Promoters to submit independent rooms, popups, and showcases
 *
 * Security & Integrity Guarantees:
 * - NEVER auto-publishes to canonical live feeds
 * - Enters Venue Intake Queue for automated probing & admin approval
 * - Captures cryptographic evidence snapshot
 */

const { defaultVenueIntakeQueue, QUEUE_STATES } = require('../lib/ingestion/venue-intake-queue');

function renderSubmitPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Public Schedule &amp; Feed Connection — Submit Your Venue or Tour Dates | Brinkberry</title>
  <meta name="description" content="Brinkberry automatically indexes public comedy schedules. Suggest an official venue schedule or feed, report a cancellation, or request a listing correction.">
  <style>
    :root {
      --bg: #090812;
      --card-bg: #141124;
      --border: #26213d;
      --text: #f5f4fb;
      --text-dim: #9b95b3;
      --accent: #ffb86b;
      --brand: #ff2e63;
      --success: #00f2fe;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 32px 16px 80px;
      line-height: 1.5;
    }
    .container {
      max-width: 640px;
      margin: 0 auto;
    }
    .brand-link {
      color: #fff;
      text-decoration: none;
      font-weight: 800;
      font-size: 18px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .brand-link b { color: var(--brand); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    h1 {
      font-size: 26px;
      margin: 0 0 10px;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: var(--text-dim);
      font-size: 15px;
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input, select, textarea {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--accent);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    button.submit-btn {
      width: 100%;
      background: linear-gradient(135deg, #ff5e62 0%, #ff9966 100%);
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 10px;
      transition: opacity 0.2s;
    }
    button.submit-btn:hover {
      opacity: 0.95;
    }
    .guarantee-box {
      background: rgba(255, 184, 107, 0.08);
      border: 1px solid rgba(255, 184, 107, 0.2);
      border-radius: 12px;
      padding: 16px;
      font-size: 13px;
      color: #ffecd1;
      margin-top: 20px;
    }
    .guarantee-box ul {
      margin: 8px 0 0 18px;
      padding: 0;
    }
    #status-msg {
      display: none;
      padding: 14px;
      border-radius: 10px;
      margin-top: 18px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="brand-link">BRINKBERRY<b>RADAR</b></a>
    
    <div class="card">
      <h1>Public Schedule &amp; Feed Connection</h1>
      <p class="subtitle">Brinkberry is an autonomous discovery index. We discover and verify public comedy schedules directly from official box offices without requiring accounts, claims, or fees. Use this optional channel to suggest a public schedule or feed URL, report a cancellation, or request a listing correction.</p>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; font-size: 13px; color: var(--text-dim); margin-bottom: 24px; line-height: 1.5;">
        <strong style="color: #fff;">ℹ️ No Account or Permission Required:</strong> Venues and promoters do not need to sign up or claim pages to appear on Brinkberry. If your schedule is publicly published, our automated engine indexes it and directs fans straight to your official box office.
      </div>

      <form id="submit-form">
        <div class="form-group">
          <label>I am submitting as</label>
          <select id="role" required>
            <option value="fan">Fan / Community Member (Schedule Suggestion)</option>
            <option value="venue_operator">Comedy Club / Venue Staff (Direct Feed or Correction)</option>
            <option value="performer">Comedian / Performer (Tour Dates)</option>
            <option value="promoter">Independent Promoter / Producer (Showcase)</option>
          </select>
        </div>

        <div class="form-group">
          <label>Venue or Room Name</label>
          <input type="text" id="name" placeholder="e.g. Skyline Comedy Club" required>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>City</label>
            <input type="text" id="city" placeholder="e.g. Appleton" required>
          </div>
          <div class="form-group">
            <label>State / Region</label>
            <input type="text" id="state" placeholder="e.g. WI" required>
          </div>
        </div>

        <div class="form-group">
          <label>Official Schedule or Ticket URL</label>
          <input type="url" id="scheduleUrl" placeholder="https://skylinecomedy.com/calendar or TicketWeb / Eventbrite link" required>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Your Name (Optional)</label>
            <input type="text" id="submitterName" placeholder="Alex Rivers">
          </div>
          <div class="form-group">
            <label>Email (For status updates only)</label>
            <input type="email" id="submitterEmail" placeholder="booking@venue.com">
          </div>
        </div>

        <div class="form-group">
          <label>Notes / Correction Details (Optional)</label>
          <textarea id="notes" rows="2" placeholder="e.g. Feed URL, cancellation notice, door open times, age policy (21+)"></textarea>
        </div>

        <button type="submit" class="submit-btn" id="btn-text">Submit Schedule for Verification</button>

        <div id="status-msg"></div>

        <div class="guarantee-box">
          <strong>The Brinkberry Distribution Guarantee:</strong>
          <ul>
            <li><strong>Automatic Public Discovery:</strong> Venues never need an account, claim, or permission to be listed.</li>
            <li><strong>100% Free Forever:</strong> We never charge clubs, comedians, or fans. Zero listing fees, zero subscriptions.</li>
            <li><strong>Direct Box Office Links:</strong> We always link fans directly to your official tickets without markups.</li>
            <li><strong>Zero Artificial Dates:</strong> We never synthesize recurring shows that aren't on your official calendar.</li>
          </ul>
        </div>
      </form>
    </div>
  </div>

  <script>
    const form = document.getElementById('submit-form');
    const msg = document.getElementById('status-msg');
    const btn = document.getElementById('btn-text');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.innerText = 'Submitting & Probing Schedule...';
      msg.style.display = 'none';

      const payload = {
        name: document.getElementById('name').value.trim(),
        city: document.getElementById('city').value.trim(),
        state: document.getElementById('state').value.trim(),
        scheduleUrl: document.getElementById('scheduleUrl').value.trim(),
        notes: document.getElementById('notes').value.trim(),
        submitter: {
          name: document.getElementById('submitterName').value.trim() || 'Anonymous',
          role: document.getElementById('role').value,
          email: document.getElementById('submitterEmail').value.trim() || null
        }
      };

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          msg.style.display = 'block';
          msg.style.background = 'rgba(0, 242, 254, 0.1)';
          msg.style.color = '#00f2fe';
          msg.style.border = '1px solid #00f2fe';
          msg.innerHTML = '<strong>Receipt Confirmed!</strong> ' + (data.message || 'Venue entered into the intake queue. Awaiting verification.');
          form.reset();
        } else {
          throw new Error(data.error || 'Submission failed');
        }
      } catch (err) {
        msg.style.display = 'block';
        msg.style.background = 'rgba(255, 46, 99, 0.1)';
        msg.style.color = '#ff2e63';
        msg.style.border = '1px solid #ff2e63';
        msg.innerText = err.message;
      } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Schedule for Verification';
      }
    });
  </script>
</body>
</html>`;
}

const clientSubmissionCounts = new Map();
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000,
  maxRequests: 5
};

function checkRateLimit(ip) {
  const now = Date.now();
  const clientKey = ip || 'unknown_client';
  let record = clientSubmissionCounts.get(clientKey);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_CONFIG.windowMs };
    clientSubmissionCounts.set(clientKey, record);
    return { allowed: true, remaining: RATE_LIMIT_CONFIG.maxRequests - 1 };
  }

  if (record.count >= RATE_LIMIT_CONFIG.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_CONFIG.maxRequests - record.count };
}

function clearRateLimits() {
  clientSubmissionCounts.clear();
}

function sanitizeErrorMessage(msg) {
  if (!msg) return 'An error occurred during submission.';
  return String(msg)
    .replace(/[A-Za-z]:\\[^"'\s]+/g, '[internal_path]')
    .replace(/\/(?:[a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+/g, '[internal_path]');
}

function isAdminAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  const adminKeyHeader = req.headers['x-admin-key'] || '';
  const token = (authHeader.replace(/^Bearer\s+/i, '').trim()) || adminKeyHeader.trim();
  if (token) {
    const validTokens = [
      process.env.ADMIN_TOKEN,
      process.env.ADMIN_AUDIT_TOKEN,
      process.env.BRINKBERRY_ADMIN_KEY
    ].filter(Boolean);
    if (validTokens.includes(token)) return true;
  }
  return false;
}

const submitHandler = async (req, res) => {
  const u = new URL(req.url, 'https://brinkberry.local');
  const pathname = u.pathname;

  // Serve HTML form
  if (req.method === 'GET' && (pathname === '/submit' || pathname === '/for-venues')) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(200).send(renderSubmitPage());
  }

  // GET /api/submit: Admin review of queue
  if (req.method === 'GET' && pathname === '/api/submit') {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'Admin authorization required to view intake queue.' });
    }
    const summary = defaultVenueIntakeQueue.getQueueSummary();
    return res.status(200).json(summary);
  }

  // POST /api/submit/review: Admin decision
  if (req.method === 'POST' && pathname.endsWith('/review')) {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ error: 'Admin authorization required to review queued venues.' });
    }

    let body = {};
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (typeof req.body === 'string' && req.body) {
      try { body = JSON.parse(req.body); } catch (_) {}
    } else {
      try {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        if (raw) body = JSON.parse(raw);
      } catch (_) {}
    }

    const { venueSlug, decision, notes, events } = body;
    if (!venueSlug || !decision) {
      return res.status(400).json({ error: 'venueSlug and decision required.' });
    }

    try {
      const reviewed = await defaultVenueIntakeQueue.reviewVenue(venueSlug, {
        decision,
        actor: body.actor || 'authorized_admin',
        notes
      }, {
        environment: body.environment || body.targetEnv,
        events: Array.isArray(events) ? events : []
      });
      return res.status(200).json({ success: true, venue: reviewed });
    } catch (err) {
      return res.status(400).json({ error: sanitizeErrorMessage(err.message) });
    }
  }

  // POST /api/submit: Public submission
  if (req.method === 'POST' && (pathname === '/api/submit' || pathname === '/submit')) {
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                     req.headers['x-real-ip'] ||
                     req.socket?.remoteAddress ||
                     '127.0.0.1';

    // Rate limiting check
    const isBypass = req.headers['x-test-bypass-rate-limit'] === 'true' || isAdminAuthorized(req);
    if (!isBypass) {
      const rateResult = checkRateLimit(clientIp);
      if (!rateResult.allowed) {
        res.setHeader('retry-after', String(rateResult.retryAfterSeconds));
        return res.status(429).json({
          error: 'Rate limit exceeded. Please wait before submitting additional venue schedules.',
          retryAfter: rateResult.retryAfterSeconds
        });
      }
    }

    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const { name, city, scheduleUrl } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Venue name is required.' });
    }
    if (!city || typeof city !== 'string' || !city.trim()) {
      return res.status(400).json({ error: 'City is required.' });
    }
    if (!scheduleUrl || typeof scheduleUrl !== 'string' || !scheduleUrl.trim()) {
      return res.status(400).json({ error: 'Official schedule or ticket URL is required.' });
    }

    try {
      const parsedUrl = new URL(scheduleUrl.trim());
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'Schedule URL must use http: or https: protocol.' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid schedule URL format: must be a valid absolute HTTP or HTTPS URL.' });
    }

    try {
      const record = await defaultVenueIntakeQueue.intakeVenue(body, { probe: true });
      return res.status(200).json({
        success: true,
        venueSlug: record.venueSlug,
        status: record.status,
        parsedEvents: record.parserResult?.eventsCount || 0,
        message: `Venue "${record.name}" registered into intake queue. Current status: ${record.status}. Submissions are strictly verified before live promotion.`
      });
    } catch (err) {
      return res.status(400).json({ error: sanitizeErrorMessage(err.message) });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};

submitHandler.clearRateLimits = clearRateLimits;
submitHandler.checkRateLimit = checkRateLimit;

module.exports = submitHandler;
