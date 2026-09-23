/**
 * Brinkberry Autonomous Community Post Endpoint
 *
 * Routes:
 * - GET /post or GET /submit: Fast, 60-second public event posting interface.
 * - POST /api/post: Immediate publishing without accounts or admin approval.
 * - POST /api/post/report: Autonomous community safety & reporting mechanism.
 */

const { createCommunityPost, reportCommunityPost } = require('../lib/community-posts/community-posts');

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function renderPostPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Post an Event — Brinkberry</title>
  <meta name="description" content="Publish an event to Brinkberry in under 60 seconds. House parties, pop-ups, rallies, library events, pickup games, and community gatherings. No account needed.">
  <style>
    :root {
      --bg: #090714;
      --card-bg: #140f22;
      --card-border: #281f38;
      --text: #f4eff8;
      --text-dim: #9b90aa;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --accent-glow: rgba(255, 46, 99, 0.4);
      --radar-cyan: #00e699;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      background-image:
        radial-gradient(ellipse 90% 45% at 50% -10%, rgba(255, 46, 99, 0.12), transparent 70%),
        radial-gradient(circle at 85% 15%, rgba(255, 184, 107, 0.05), transparent 50%);
      color: var(--text);
      font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.45;
      padding: 24px 16px 80px;
    }
    .container {
      max-width: 620px;
      margin: 0 auto;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .brand {
      color: #fff;
      font-size: 22px;
      font-weight: 900;
      text-decoration: none;
      letter-spacing: -0.02em;
    }
    .brand b { color: var(--accent); }
    .btn-back {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 6px 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--card-border);
      border-radius: 8px;
    }
    .btn-back:hover { color: #fff; border-color: rgba(255,255,255,0.2); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 26px;
      font-weight: 850;
      margin: 0 0 6px;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .subtitle {
      color: var(--text-dim);
      font-size: 14px;
      margin-bottom: 24px;
      line-height: 1.4;
    }
    .field-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      margin-bottom: 6px;
    }
    .field-hint {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 4px;
    }
    input[type="text"], input[type="datetime-local"], input[type="url"], select, textarea {
      width: 100%;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 14px;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.07);
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .col { flex: 1; }
    .radius-selector {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 6px;
    }
    .radius-option {
      border: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.03);
      padding: 10px 8px;
      border-radius: 10px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }
    .radius-option.selected {
      border-color: var(--radar-cyan);
      background: rgba(0, 230, 153, 0.08);
      color: #fff;
    }
    .radius-title {
      font-size: 13px;
      font-weight: 750;
      display: block;
      margin-bottom: 2px;
    }
    .radius-desc {
      font-size: 10px;
      color: var(--text-dim);
      line-height: 1.2;
    }
    .privacy-toggle {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: rgba(255, 184, 107, 0.05);
      border: 1px solid rgba(255, 184, 107, 0.2);
      padding: 12px 14px;
      border-radius: 12px;
      margin-top: 10px;
      cursor: pointer;
    }
    .privacy-toggle input {
      margin-top: 3px;
      accent-color: var(--primary);
    }
    .privacy-text {
      font-size: 12px;
      color: #fcebd0;
      line-height: 1.35;
    }
    .btn-submit {
      width: 100%;
      background: var(--primary);
      color: var(--primary-dark);
      font-size: 16px;
      font-weight: 850;
      padding: 14px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(255, 184, 107, 0.3);
      transition: opacity 0.15s, transform 0.1s;
      margin-top: 10px;
    }
    .btn-submit:hover { opacity: 0.95; }
    .btn-submit:active { transform: scale(0.98); }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .disclaimer {
      font-size: 11px;
      color: var(--text-dim);
      text-align: center;
      margin-top: 18px;
      line-height: 1.4;
    }
    .status-msg {
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 18px;
      display: none;
      font-size: 14px;
    }
    .status-error {
      background: rgba(255, 46, 99, 0.15);
      border: 1px solid var(--accent);
      color: #ff99b0;
    }
    .status-success {
      background: rgba(0, 230, 153, 0.15);
      border: 1px solid var(--radar-cyan);
      color: #99ffe0;
    }
    .success-actions {
      display: flex;
      gap: 10px;
      margin-top: 14px;
    }
    .btn-action {
      flex: 1;
      padding: 10px;
      text-align: center;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 700;
      font-size: 13px;
    }
    .btn-action-primary {
      background: var(--radar-cyan);
      color: #002b1c;
    }
    .btn-action-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <a class="brand" href="/">brink<b>berry</b></a>
      <a class="btn-back" href="/">← Live Feed</a>
    </div>

    <div class="card">
      <div id="statusBox" class="status-msg"></div>

      <div id="postFormWrapper">
        <h1>Post an Event</h1>
        <div class="subtitle">
          Publishes immediately to the local discovery radar. Ephemeral &amp; temporary (visible for up to 48 hours). Zero accounts or approval needed.
        </div>

        <form id="postForm">
          <div class="field-group">
            <label for="title">Event Title *</label>
            <input id="title" type="text" required placeholder="e.g. Backyard Summer Jam, Neighborhood Yard Sale, Pickup Soccer" maxlength="100">
          </div>

          <div class="field-group">
            <label for="category">Category *</label>
            <select id="category" required>
              <option value="party">🎈 Party &amp; Social Gathering</option>
              <option value="food">🌮 Food Pop-up &amp; Market</option>
              <option value="protest">📢 Protest &amp; Rally</option>
              <option value="community" selected>📚 Library &amp; Community Program</option>
              <option value="sports">⚽ Pickup Sports &amp; Games</option>
              <option value="comedy">🎭 Comedy &amp; Open Mic</option>
              <option value="racing">🏎️ Motorsports &amp; Racing</option>
              <option value="festival">🎨 Arts, Crafts &amp; Renaissance Fair</option>
              <option value="civic">🏛️ Civic &amp; Public Meeting</option>
              <option value="music">🎵 Live Music &amp; Concert</option>
              <option value="other">👥 General Community</option>
            </select>
          </div>

          <div class="row">
            <div class="col field-group">
              <label for="startTime">Date &amp; Start Time *</label>
              <input id="startTime" type="datetime-local" required>
              <div class="field-hint">Must be within the next 48 hours.</div>
            </div>
            <div class="col field-group">
              <label for="endTime">End Time (Optional)</label>
              <input id="endTime" type="datetime-local">
            </div>
          </div>

          <div class="row">
            <div class="col field-group">
              <label for="city">City / Metro *</label>
              <input id="city" type="text" required placeholder="e.g. Denver or Eau Claire">
            </div>
            <div class="col field-group">
              <label for="venue">Venue or Place Name</label>
              <input id="venue" type="text" placeholder="e.g. Cheesman Park or Private Residence">
            </div>
          </div>

          <div class="field-group">
            <label for="location">Address or Cross Streets</label>
            <input id="location" type="text" placeholder="e.g. 1200 Franklin St or 12th &amp; Colfax">
            
            <label class="privacy-toggle">
              <input type="checkbox" id="isApproximateLocation" checked>
              <div class="privacy-text">
                <b>Approximate Location / Private Gathering</b><br>
                Hides exact street numbers. Only displays the neighborhood/city and general area to preserve private home privacy.
              </div>
            </label>
          </div>

          <div class="field-group">
            <label>Broadcast Radius *</label>
            <div class="radius-selector">
              <div class="radius-option" data-radius="neighborhood">
                <span class="radius-title">🏠 1–2 mi</span>
                <span class="radius-desc">Neighborhood / House Parties</span>
              </div>
              <div class="radius-option selected" data-radius="nearby">
                <span class="radius-title">📍 5–10 mi</span>
                <span class="radius-desc">Nearby / Pop-ups &amp; Programs</span>
              </div>
              <div class="radius-option" data-radius="broad">
                <span class="radius-title">🌐 25–50 mi</span>
                <span class="radius-desc">Broad Local / Fairs &amp; Rallies</span>
              </div>
            </div>
            <input type="hidden" id="broadcastRadius" value="nearby">
          </div>

          <div class="field-group">
            <label for="description">Short Description</label>
            <textarea id="description" rows="3" placeholder="What's happening? What should people bring? Any RSVP notes?" maxlength="500"></textarea>
          </div>

          <div class="row">
            <div class="col field-group">
              <label for="detailsUrl">Website or Link (Optional)</label>
              <input id="detailsUrl" type="url" placeholder="https://instagram.com/mygathering">
            </div>
            <div class="col field-group">
              <label for="contact">Contact / Host Handle (Optional)</label>
              <input id="contact" type="text" placeholder="e.g. @denver_taco_popup or host email">
            </div>
          </div>

          <input type="hidden" id="lat">
          <input type="hidden" id="lon">

          <button id="submitBtn" type="submit" class="btn-submit">Publish Event Immediately →</button>

          <div class="disclaimer">
            All posts are marked <b>“Community submitted — not independently verified.”</b> Brinkberry does not endorse or certify submissions. Attend public or private gatherings at your own discretion.
          </div>
        </form>
      </div>

      <div id="postSuccessWrapper" style="display:none; text-align:center;">
        <div style="font-size:48px; margin-bottom:12px;">🎉</div>
        <h2 style="color:#fff; margin:0 0 8px;">Event Published Live!</h2>
        <p style="color:var(--text-dim); margin-bottom:20px;" id="successSummaryText"></p>
        <div class="success-actions">
          <a id="viewEventBtn" class="btn-action btn-action-primary" href="#">View Event →</a>
          <a class="btn-action btn-action-secondary" href="/">Open Live Feed</a>
        </div>
      </div>
    </div>
  </div>

  <script>
    const $ = id => document.getElementById(id);

    // Default start time to now + 2 hours
    const defaultStart = new Date(Date.now() + 2 * 3600 * 1000);
    defaultStart.setMinutes(0, 0, 0);
    const toIsoLocal = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('startTime').value = toIsoLocal(defaultStart);

    // Try autofilling city and location from local storage or geolocation
    try {
      const storedCity = localStorage.getItem('bb_last_city');
      if (storedCity) $('city').value = storedCity;
    } catch (_) {}

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        $('lat').value = pos.coords.latitude;
        $('lon').value = pos.coords.longitude;
      }, () => {});
    }

    // Radius button selection
    document.querySelectorAll('.radius-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.radius-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        $('broadcastRadius').value = opt.dataset.radius;
      });
    });

    $('postForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Publishing to radar…';

      const statusBox = $('statusBox');
      statusBox.style.display = 'none';

      const payload = {
        title: $('title').value.trim(),
        category: $('category').value,
        startTime: new Date($('startTime').value).toISOString(),
        endTime: $('endTime').value ? new Date($('endTime').value).toISOString() : null,
        city: $('city').value.trim(),
        venue: $('venue').value.trim(),
        location: $('location').value.trim(),
        isApproximateLocation: $('isApproximateLocation').checked,
        broadcastRadius: $('broadcastRadius').value,
        description: $('description').value.trim(),
        detailsUrl: $('detailsUrl').value.trim() || null,
        contact: $('contact').value.trim() || null,
        lat: $('lat').value ? parseFloat($('lat').value) : null,
        lon: $('lon').value ? parseFloat($('lon').value) : null
      };

      try {
        const res = await fetch('/api/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to publish event');
        }

        try {
          localStorage.setItem('bb_last_city', payload.city);
          const myPosts = JSON.parse(localStorage.getItem('bb_community_posts') || '[]');
          myPosts.unshift(data.event);
          localStorage.setItem('bb_community_posts', JSON.stringify(myPosts.slice(0, 20)));
        } catch (_) {}

        $('postFormWrapper').style.display = 'none';
        $('postSuccessWrapper').style.display = 'block';
        $('successSummaryText').textContent = \`"\${data.event.title}" is now broadcasting within your chosen radius. It will remain visible for up to 48 hours.\`;
        $('viewEventBtn').href = data.event.url || \`/event/\${data.event.id}\`;
      } catch (err) {
        statusBox.className = 'status-msg status-error';
        statusBox.textContent = err.message;
        statusBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Publish Event Immediately →';
      }
    });
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://brinkberry.local');
  const pathname = u.pathname;

  // 1. GET /post or GET /submit
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderPostPage());
  }

  // 2. POST /api/post/report
  if (req.method === 'POST' && pathname.endsWith('/report')) {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    const { eventId, reason } = body;
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
    const repRes = reportCommunityPost(eventId, reason, ip);
    return res.status(repRes.success ? 200 : 400).json(repRes);
  }

  // 3. POST /api/post
  if (req.method === 'POST') {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
    const result = createCommunityPost(body, { ip });
    return res.status(result.status || (result.success ? 200 : 400)).json(result);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
