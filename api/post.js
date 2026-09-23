/**
 * Brinkberry Autonomous Community Post Endpoint & Management Layer
 *
 * Routes:
 * - GET /post or GET /submit: Fast public event posting interface with accountability acknowledgment,
 *   location privacy controls, and sequential broadcast ladder selection.
 * - GET /post/manage or GET /manage: Self-service management dashboard with visual ladder and instant deletion.
 * - POST /api/post: Immediate publishing without accounts or admin approval.
 * - POST /api/post/delete: Self-service deletion via deletion key.
 * - POST /api/post/verify-level: Step-up verification for higher broadcast levels.
 * - POST /api/post/report: Autonomous community safety & reporting mechanism.
 */

const {
  createCommunityPost,
  getCommunityPostById,
  deleteCommunityPost,
  verifyPostLevel,
  reportCommunityPost,
  BROADCAST_LEVELS
} = require('../lib/community-posts/community-posts');

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
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
      --radar-cyan-dim: rgba(0, 230, 153, 0.15);
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
      max-width: 660px;
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
    input[type="text"], input[type="datetime-local"], input[type="url"], input[type="email"], select, textarea {
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

    /* Location Privacy Selector */
    .privacy-mode-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 8px;
    }
    .privacy-mode-opt {
      border: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.03);
      padding: 10px 8px;
      border-radius: 10px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s;
    }
    .privacy-mode-opt.selected {
      border-color: var(--primary);
      background: rgba(255, 184, 107, 0.12);
    }
    .privacy-mode-title {
      font-size: 12px;
      font-weight: 750;
      color: #fff;
      display: block;
      margin-bottom: 3px;
    }
    .privacy-mode-desc {
      font-size: 10px;
      color: var(--text-dim);
      line-height: 1.25;
    }

    /* Ladder Selector */
    .ladder-select-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .ladder-opt {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.03);
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ladder-opt.selected {
      border-color: var(--radar-cyan);
      background: rgba(0, 230, 153, 0.08);
    }
    .ladder-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ladder-badge {
      font-size: 11px;
      font-weight: 850;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #fff;
    }
    .ladder-opt.selected .ladder-badge {
      background: var(--radar-cyan);
      color: #032418;
    }
    .ladder-req {
      font-size: 11px;
      color: var(--text-dim);
    }

    /* Checkbox & Legal styles */
    .agreement-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 16px;
      margin-top: 24px;
      margin-bottom: 20px;
    }
    .check-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      color: #e2daf0;
      line-height: 1.4;
      cursor: pointer;
      margin-bottom: 12px;
      user-select: none;
    }
    .check-label:last-child { margin-bottom: 0; }
    .check-label input {
      margin-top: 3px;
      accent-color: var(--radar-cyan);
      width: 17px;
      height: 17px;
      cursor: pointer;
    }
    .public-notice {
      background: rgba(255, 184, 107, 0.08);
      border: 1px solid rgba(255, 184, 107, 0.25);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 12px;
      color: #ffdfba;
      line-height: 1.4;
      margin-bottom: 20px;
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
    }
    .btn-submit:hover { opacity: 0.95; }
    .btn-submit:active { transform: scale(0.98); }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

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

    /* Post Success Card */
    .success-card {
      text-align: center;
      display: none;
    }
    .key-box {
      background: #0d0a17;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px;
      font-family: monospace;
      font-size: 14px;
      color: var(--primary);
      margin: 14px 0;
      word-break: break-all;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-copy {
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--card-border);
      color: #fff;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-copy:hover { background: rgba(255,255,255,0.15); }
    .ladder-progress {
      display: flex;
      gap: 4px;
      margin: 16px 0 20px;
    }
    .ladder-step {
      flex: 1;
      height: 8px;
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
    }
    .ladder-step.active {
      background: var(--radar-cyan);
      box-shadow: 0 0 6px var(--radar-cyan);
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
          Publishes immediately to the local discovery radar. Zero accounts or venue claims needed. Ephemeral &amp; temporary (visible for up to 48 hours).
        </div>

        <form id="postForm">
          <div class="field-group">
            <label for="title">Event Title *</label>
            <input id="title" type="text" required placeholder="e.g. Backyard Jam, Taco Pop-up, Neighborhood Yard Sale, Pickup Soccer" maxlength="100">
          </div>

          <div class="field-group">
            <label for="category">Category *</label>
            <select id="category" required>
              <option value="party">🎈 House Party &amp; Social Gathering</option>
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
            <label for="location">Event Location (Address, Cross-Streets, or Park) *</label>
            <input id="location" type="text" required placeholder="e.g. 1200 Franklin St or 12th &amp; Colfax">
            <div class="field-hint">The event location—not your current GPS—determines the broadcast radius. You can post about your house while away.</div>

            <!-- Location Privacy Selection -->
            <label style="margin-top:12px;">Location Privacy Mode</label>
            <div class="privacy-mode-grid">
              <div class="privacy-mode-opt" data-mode="exact">
                <span class="privacy-mode-title">📍 Exact Address</span>
                <span class="privacy-mode-desc">Full street address shown publicly</span>
              </div>
              <div class="privacy-mode-opt selected" data-mode="approximate">
                <span class="privacy-mode-title">🔒 Approximate Location / Private Gathering</span>
                <span class="privacy-mode-desc">Street number hidden for privacy</span>
              </div>
              <div class="privacy-mode-opt" data-mode="neighborhood">
                <span class="privacy-mode-title">🏘️ General Neighborhood</span>
                <span class="privacy-mode-desc">Area and city only, no street name</span>
              </div>
            </div>
            <input type="hidden" id="locationMode" value="approximate">
          </div>

          <div class="field-group">
            <label>Broadcast Radius &amp; Desired Reach (Sequential Ladder)</label>
            <div class="ladder-select-grid">
              <div class="ladder-opt selected" data-level="block">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 1</span>
                  <span><b>Block / Neighborhood</b> (~2 mi)</span>
                </div>
                <span class="ladder-req" style="color:var(--radar-cyan);">✓ Live immediately</span>
              </div>
              <div class="ladder-opt" data-level="hood">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 2</span>
                  <span><b>Hood / Part of Town</b> (~6 mi)</span>
                </div>
                <span class="ladder-req">Email confirmation</span>
              </div>
              <div class="ladder-opt" data-level="quadrant">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 3</span>
                  <span><b>Quadrant</b> (~15 mi)</span>
                </div>
                <span class="ladder-req">Email + verified phone</span>
              </div>
              <div class="ladder-opt" data-level="city">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 4</span>
                  <span><b>City / Metro</b> (~30 mi)</span>
                </div>
                <span class="ladder-req">Public link or review</span>
              </div>
              <div class="ladder-opt" data-level="county">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 5</span>
                  <span><b>County</b> (~60 mi)</span>
                </div>
                <span class="ladder-req">Public source or review</span>
              </div>
              <div class="ladder-opt" data-level="state">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 6</span>
                  <span><b>State / Region</b> (~150 mi)</span>
                </div>
                <span class="ladder-req">Official source or review</span>
              </div>
              <div class="ladder-opt" data-level="country">
                <div class="ladder-info">
                  <span class="ladder-badge">Level 7</span>
                  <span><b>Country (National)</b></span>
                </div>
                <span class="ladder-req">National relevance &amp; review</span>
              </div>
            </div>
            <input type="hidden" id="desiredBroadcastLevel" value="block">
            <div class="field-hint" style="margin-top:6px;">
              Level 1 is approved immediately. Higher levels unlock as details are confirmed. If a higher level is unverified, your post remains live at Level 1.
            </div>
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
              <label for="contact">Contact / Email (Optional)</label>
              <input id="contact" type="text" placeholder="e.g. host@example.com or @handle">
            </div>
          </div>

          <!-- Accountability & Terms Agreements (Required) -->
          <div class="agreement-box">
            <label class="check-label">
              <input type="checkbox" id="accountabilityAcknowledged" required>
              <span><b>Accountability Acknowledgment *</b><br>
              I understand that I am responsible for what I post and for knowingly false, harmful, or unauthorized information.</span>
            </label>
            <label class="check-label">
              <input type="checkbox" id="termsAccepted" required>
              <span><b>Terms &amp; Community Guidelines Agreement *</b><br>
              I agree that the information I submit is reasonably accurate, that I have the right to share it, and that Brinkberry may remove content that is abusive, deceptive, dangerous, unlawful, or harmful.</span>
            </label>
          </div>

          <div class="public-notice">
            🛡️ <b>Notice:</b> All posts display <b>“Community submitted — not independently verified.”</b> Brinkberry does not endorse or certify submissions. Attend public or private gatherings at your own discretion.
          </div>

          <button id="submitBtn" type="submit" class="btn-submit">Publish Event Immediately →</button>
        </form>
      </div>

      <!-- Success Screen -->
      <div id="postSuccessWrapper" class="success-card">
        <div style="font-size:48px; margin-bottom:12px;">🎉</div>
        <h2 style="color:#fff; margin:0 0 8px;">Event Published Live!</h2>
        <p style="color:var(--text-dim); margin-bottom:14px;" id="successSummaryText"></p>

        <div style="text-align:left; background:rgba(255,255,255,0.03); border:1px solid var(--card-border); border-radius:14px; padding:16px; margin:20px 0;">
          <div style="font-size:12px; font-weight:750; color:var(--text-dim); text-transform:uppercase;">Broadcast Ladder Status</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span id="ladderLevelLabel" style="font-weight:750; color:#fff; font-size:15px;">Level 1: Block (2 mi)</span>
            <span style="color:var(--radar-cyan); font-weight:700; font-size:13px;">● Live Now</span>
          </div>
          <div class="ladder-progress">
            <div class="ladder-step active"></div>
            <div class="ladder-step" id="step2"></div>
            <div class="ladder-step" id="step3"></div>
            <div class="ladder-step" id="step4"></div>
            <div class="ladder-step" id="step5"></div>
            <div class="ladder-step" id="step6"></div>
            <div class="ladder-step" id="step7"></div>
          </div>
          <div style="font-size:12px; color:var(--text-dim);">
            Higher broadcast tiers can be unlocked from your private post management link below.
          </div>
        </div>

        <div style="text-align:left; margin-bottom:20px;">
          <label>Your Private Management &amp; Deletion Key</label>
          <div class="key-box">
            <span id="keyDisplay"></span>
            <button class="btn-copy" id="copyKeyBtn">Copy Key</button>
          </div>
          <div class="field-hint">
            Saved automatically in this browser. Keep this key or link if you want to step up broadcast radius or delete your post later.
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <a id="manageLinkBtn" href="#" class="btn-submit" style="flex:1; background:rgba(255,255,255,0.08); color:#fff; text-decoration:none; text-align:center; font-size:14px; padding:12px;">Manage / Step Up Ladder</a>
          <a id="viewEventBtn" href="#" class="btn-submit" style="flex:1; text-decoration:none; text-align:center; font-size:14px; padding:12px;">View Live Event →</a>
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

    // Autofill city if previously stored
    try {
      const storedCity = localStorage.getItem('bb_last_city');
      if (storedCity) $('city').value = storedCity;
    } catch (_) {}

    // Location mode selection
    document.querySelectorAll('.privacy-mode-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.privacy-mode-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        $('locationMode').value = opt.dataset.mode;
      });
    });

    // Ladder level selection
    document.querySelectorAll('.ladder-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.ladder-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        $('desiredBroadcastLevel').value = opt.dataset.level;
      });
    });

    // Form submission
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
        locationMode: $('locationMode').value,
        isApproximateLocation: $('locationMode').value !== 'exact',
        desiredBroadcastLevel: $('desiredBroadcastLevel').value,
        description: $('description').value.trim(),
        detailsUrl: $('detailsUrl').value.trim() || null,
        contact: $('contact').value.trim() || null,
        accountabilityAcknowledged: $('accountabilityAcknowledged').checked,
        termsAccepted: $('termsAccepted').checked
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

        // Store deletion key and post ID in localStorage
        try {
          localStorage.setItem('bb_last_city', payload.city);
          const postKeys = JSON.parse(localStorage.getItem('bb_post_keys') || '{}');
          postKeys[data.event.id] = data.deletionKey;
          localStorage.setItem('bb_post_keys', JSON.stringify(postKeys));

          const myPosts = JSON.parse(localStorage.getItem('bb_community_posts') || '[]');
          myPosts.unshift(data.event);
          localStorage.setItem('bb_community_posts', JSON.stringify(myPosts.slice(0, 20)));
        } catch (_) {}

        $('postFormWrapper').style.display = 'none';
        $('postSuccessWrapper').style.display = 'block';
        $('successSummaryText').textContent = \`"\${data.event.title}" is now broadcasting live on the discovery radar within \${data.event.approvedRadiusMiles} miles.\`;
        $('ladderLevelLabel').textContent = \`Level \${data.event.currentLevel}: \${data.event.currentLevelName} (\${data.event.approvedRadiusMiles} mi)\`;
        $('keyDisplay').textContent = data.deletionKey;
        $('manageLinkBtn').href = data.manageUrl || \`/post/manage?id=\${data.event.id}&key=\${data.deletionKey}\`;
        $('viewEventBtn').href = data.event.url || \`/event/\${data.event.id}\`;

        // Update ladder bar highlights
        for (let i = 2; i <= 7; i++) {
          const stepEl = $('step' + i);
          if (stepEl && i <= data.event.currentLevel) {
            stepEl.classList.add('active');
          }
        }

        $('copyKeyBtn').onclick = () => {
          navigator.clipboard.writeText(data.deletionKey);
          $('copyKeyBtn').textContent = 'Copied!';
          setTimeout(() => $('copyKeyBtn').textContent = 'Copy Key', 2000);
        };
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

function renderManagePage(post, deletionKey) {
  const currentLvl = post.currentLadderLevel || 1;
  const desiredLvl = post.desiredBroadcastLevel || 'block';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Manage Event: ${esc(post.title)} — Brinkberry</title>
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
      --radar-cyan: #00e699;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.45;
      padding: 24px 16px 80px;
    }
    .container { max-width: 660px; margin: 0 auto; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .brand { color: #fff; font-size: 22px; font-weight: 900; text-decoration: none; }
    .brand b { color: var(--accent); }
    .btn-back { color: var(--text-dim); text-decoration: none; font-size: 14px; font-weight: 600; padding: 6px 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 8px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 20px; padding: 28px; box-shadow: 0 12px 36px rgba(0,0,0,0.5); }
    h1 { font-size: 24px; font-weight: 850; margin: 0 0 6px; color: #fff; }
    .meta-box { background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; margin: 16px 0; }
    .meta-line { margin: 4px 0; font-size: 14px; color: #d0c5df; }
    .meta-line b { color: #fff; }

    /* Visual Ladder */
    .ladder-list { display: flex; flex-direction: column; gap: 8px; margin: 20px 0; }
    .ladder-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.02);
      transition: all 0.2s;
    }
    .ladder-row.approved {
      border-color: rgba(0, 230, 153, 0.4);
      background: rgba(0, 230, 153, 0.06);
    }
    .ladder-row.pending {
      border-color: rgba(255, 184, 107, 0.3);
      background: rgba(255, 184, 107, 0.04);
    }
    .ladder-left { display: flex; align-items: center; gap: 10px; }
    .badge-level {
      font-size: 11px;
      font-weight: 850;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #fff;
    }
    .ladder-row.approved .badge-level {
      background: var(--radar-cyan);
      color: #032418;
    }
    .status-badge {
      font-size: 12px;
      font-weight: 750;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .status-badge.approved { background: rgba(0, 230, 153, 0.15); color: var(--radar-cyan); }
    .status-badge.pending { background: rgba(255, 184, 107, 0.15); color: var(--primary); }
    .status-badge.locked { background: rgba(255,255,255,0.06); color: var(--text-dim); }

    .step-up-form {
      background: rgba(255, 184, 107, 0.06);
      border: 1px solid rgba(255, 184, 107, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin: 20px 0;
    }
    .danger-zone {
      margin-top: 32px;
      border-top: 1px solid var(--card-border);
      padding-top: 24px;
    }
    .btn-danger {
      background: rgba(255, 46, 99, 0.15);
      border: 1px solid var(--accent);
      color: #ff809d;
      font-size: 14px;
      font-weight: 750;
      padding: 12px 18px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-danger:hover {
      background: var(--accent);
      color: #fff;
    }
    .btn-action {
      background: var(--radar-cyan);
      color: #002b1c;
      font-size: 14px;
      font-weight: 750;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
    }
    input[type="text"], input[type="email"] {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 14px;
      outline: none;
      margin-top: 6px;
      margin-bottom: 12px;
    }
    input:focus { border-color: var(--primary); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <a class="brand" href="/">brink<b>berry</b></a>
      <a class="btn-back" href="/event/${esc(post.id)}">← View Event Page</a>
    </div>

    <div class="card">
      <div id="statusBox" style="display:none; padding:12px; border-radius:10px; margin-bottom:16px;"></div>

      <h1>Manage Your Post</h1>
      <p style="color:var(--text-dim); margin-top:2px; font-size:14px;">
        Private creator controls for <b>${esc(post.title)}</b>.
      </p>

      <div class="meta-box">
        <div class="meta-line"><b>Title:</b> ${esc(post.title)}</div>
        <div class="meta-line"><b>Venue / City:</b> ${esc(post.venue)} · ${esc(post.city)}</div>
        <div class="meta-line"><b>Current Live Radius:</b> <span style="color:var(--radar-cyan); font-weight:750;">Level ${currentLvl}: ${esc(post.currentLevelName || 'Block')} (~${post.approvedRadiusMiles} miles)</span></div>
        <div class="meta-line"><b>Privacy Mode:</b> ${esc(post.locationMode || 'approximate')} (${post.isApproximateLocation ? 'Exact street number hidden' : 'Full street shown'})</div>
      </div>

      <h2 style="font-size:18px; margin:24px 0 8px; color:#fff;">Visual Broadcast Ladder</h2>
      <p style="color:var(--text-dim); font-size:13px; margin:0 0 14px;">
        Level 1 is approved immediately. Higher levels unlock sequentially as verification criteria are provided. If an unverified higher level is requested, your post safely remains live at the highest approved level.
      </p>

      <div class="ladder-list">
        ${BROADCAST_LEVELS.map(lvl => {
          const isApproved = lvl.level <= currentLvl;
          const isPending = lvl.level > currentLvl && lvl.id === desiredLvl;
          return `
            <div class="ladder-row ${isApproved ? 'approved' : (isPending ? 'pending' : '')}">
              <div class="ladder-left">
                <span class="badge-level">Level ${lvl.level}</span>
                <div>
                  <b style="color:#fff;">${esc(lvl.name)}</b>
                  <span style="color:var(--text-dim); font-size:12px;"> · ~${lvl.radiusMiles} mi (${esc(lvl.requirement)})</span>
                </div>
              </div>
              <div>
                ${isApproved ? `<span class="status-badge approved">✓ Approved &amp; Live</span>` :
                  (isPending ? `<span class="status-badge pending">⏳ Pending Step-up</span>` :
                    `<span class="status-badge locked">Locked</span>`)}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Step Up Form (If desired level > current approved level) -->
      <div id="stepUpContainer" class="step-up-form">
        <h3 style="margin:0 0 8px; font-size:16px; color:#fff;">Step-Up Verification</h3>
        <p style="color:var(--text-dim); font-size:13px; margin:0 0 12px;">
          Unlock broader reach by providing contact or source details.
        </p>
        <form id="stepUpForm">
          <label style="font-size:11px; text-transform:uppercase; font-weight:750; color:var(--text-dim);">Confirm Email Address (Unlocks Level 2 Hood Reach)</label>
          <input type="email" id="stepEmail" placeholder="host@example.com" value="${esc(post.contact?.includes('@') ? post.contact : '')}">

          <label style="font-size:11px; text-transform:uppercase; font-weight:750; color:var(--text-dim);">Add Mobile Phone (Unlocks Level 3 Quadrant Reach)</label>
          <input type="text" id="stepPhone" placeholder="555-0199">

          <label style="font-size:11px; text-transform:uppercase; font-weight:750; color:var(--text-dim);">Public Event or Social Link (Unlocks Level 4 City Reach)</label>
          <input type="text" id="stepUrl" placeholder="https://instagram.com/p/..." value="${esc(post.detailsUrl || '')}">

          <button type="submit" class="btn-action">Verify &amp; Update Reach →</button>
        </form>
      </div>

      <!-- Danger Zone: Immediate Deletion -->
      <div class="danger-zone">
        <h3 style="margin:0 0 8px; font-size:16px; color:#ff809d;">Delete Post</h3>
        <p style="color:var(--text-dim); font-size:13px; margin:0 0 14px;">
          Immediately removes this event from the live discovery radar across all cities and feeds. This action cannot be undone.
        </p>
        <button id="deleteBtn" class="btn-danger">🗑️ Delete My Post Immediately</button>
      </div>
    </div>
  </div>

  <script>
    const postId = ${JSON.stringify(post.id)};
    const deletionKey = ${JSON.stringify(deletionKey)};

    const statusBox = document.getElementById('statusBox');
    function showMsg(msg, isError) {
      statusBox.style.display = 'block';
      statusBox.style.background = isError ? 'rgba(255,46,99,0.15)' : 'rgba(0,230,153,0.15)';
      statusBox.style.border = isError ? '1px solid #ff2e63' : '1px solid #00e699';
      statusBox.style.color = isError ? '#ff99b0' : '#99ffe0';
      statusBox.textContent = msg;
    }

    // Step-up verification submission
    document.getElementById('stepUpForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const res = await fetch('/api/post/verify-level', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: postId,
            deletionKey,
            email: document.getElementById('stepEmail').value.trim() || null,
            phone: document.getElementById('stepPhone').value.trim() || null,
            detailsUrl: document.getElementById('stepUrl').value.trim() || null
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update level');
        showMsg('Verification updated! Reloading status…', false);
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        showMsg(err.message, true);
      }
    });

    // Self-service deletion
    document.getElementById('deleteBtn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this event? It will disappear immediately from all live discovery feeds.')) {
        return;
      }

      try {
        const res = await fetch('/api/post/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: postId, deletionKey })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete post');

        try {
          const keys = JSON.parse(localStorage.getItem('bb_post_keys') || '{}');
          delete keys[postId];
          localStorage.setItem('bb_post_keys', JSON.stringify(keys));
        } catch (_) {}

        alert('Your post has been successfully removed from Brinkberry.');
        location.href = '/';
      } catch (err) {
        showMsg(err.message, true);
      }
    });
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://brinkberry.local');
  const pathname = u.pathname;

  // 1. GET /post/manage or GET /manage
  if (req.method === 'GET' && (pathname === '/post/manage' || pathname === '/manage')) {
    const id = u.searchParams.get('id');
    const key = u.searchParams.get('key');

    if (!id) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(`<!doctype html><html><body style="background:#090714;color:#fff;font-family:sans-serif;padding:40px;text-align:center"><h2>Event ID required to manage post.</h2><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>`);
    }

    const post = getCommunityPostById(id);
    if (!post) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(`<!doctype html><html><body style="background:#090714;color:#fff;font-family:sans-serif;padding:40px;text-align:center"><h2>Post not found or already deleted.</h2><p><a href="/" style="color:#ffb86b">← Explore live events</a></p></body></html>`);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderManagePage(post, key));
  }

  // 2. GET /post or GET /submit
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderPostPage());
  }

  // 3. POST /api/post/delete
  if (req.method === 'POST' && pathname.endsWith('/delete')) {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    const { id, deletionKey, reason } = body;
    const result = deleteCommunityPost(id, deletionKey, reason || 'user_deleted');
    return res.status(result.status || (result.success ? 200 : 400)).json(result);
  }

  // 4. POST /api/post/verify-level
  if (req.method === 'POST' && pathname.endsWith('/verify-level')) {
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch (_) {}

    const { id, deletionKey, email, phone, detailsUrl } = body;
    const stepData = {
      email,
      phone,
      detailsUrl,
      emailConfirmed: Boolean(email),
      phoneVerified: Boolean(phone)
    };
    const result = verifyPostLevel(id, deletionKey, stepData);
    return res.status(result.status || (result.success ? 200 : 400)).json(result);
  }

  // 5. POST /api/post/report
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

  // 6. POST /api/post
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
