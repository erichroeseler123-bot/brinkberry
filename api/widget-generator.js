/**
 * Brinkberry Embeddable Partner Widget Generator
 *
 * Route: /embed, /widget-generator, /for-partners
 *
 * Provides hotels, campgrounds, tourism boards, city blogs, and community portals
 * with a self-serve interactive configurator to generate and copy a responsive,
 * auto-updating 48-hour event radar widget.
 */

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Embed Live Event Radar · Partner Widget Generator | Brinkberry</title>
  <meta name="description" content="Add a live, auto-updating 48-hour event radar to your hotel, tourism, campground, or community website. 100% free, responsive, and privacy-first.">
  <link rel="canonical" href="${ORIGIN}/embed">
  <style>
    :root {
      --bg: #090714;
      --card-bg: #140f22;
      --card-border: #281f38;
      --card-border-focus: #ffb86b;
      --text: #f4eff8;
      --text-dim: #9b90aa;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --accent-glow: rgba(255, 46, 99, 0.4);
      --green: #00e699;
      --code-bg: #0b0816;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image:
        radial-gradient(ellipse 90% 45% at 50% -10%, rgba(255, 46, 99, 0.1), transparent 70%),
        radial-gradient(circle at 85% 15%, rgba(255, 184, 107, 0.05), transparent 50%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 0 16px 80px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 0;
      border-bottom: 1px solid #1c152a;
      margin-bottom: 32px;
    }
    .brand {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #fff;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand b { color: var(--accent); }
    .badge-tag {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(255, 184, 107, 0.15);
      color: var(--primary);
      border: 1px solid rgba(255, 184, 107, 0.3);
    }
    .back-link {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
      transition: color 0.15s;
    }
    .back-link:hover { color: #fff; }

    .hero-section {
      text-align: center;
      max-width: 760px;
      margin: 0 auto 40px;
    }
    .hero-title {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin-bottom: 12px;
    }
    .hero-desc {
      color: var(--text-dim);
      font-size: 15.5px;
      line-height: 1.6;
    }

    .layout-grid {
      display: grid;
      grid-template-columns: 460px 1fr;
      gap: 32px;
      align-items: start;
    }
    @media (max-width: 960px) {
      .layout-grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title span.step {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-dark);
      font-size: 12px;
      font-weight: 900;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .form-group {
      margin-bottom: 18px;
    }
    .form-group:last-child { margin-bottom: 0; }
    label {
      display: block;
      font-size: 12.5px;
      font-weight: 700;
      color: #dfd7ee;
      margin-bottom: 6px;
    }
    .helper-text {
      font-size: 11.5px;
      color: var(--text-dim);
      margin-top: 4px;
      line-height: 1.4;
    }
    input[type="text"], input[type="number"], select {
      width: 100%;
      background: #181226;
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13.5px;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    input[type="text"]:focus, input[type="number"]:focus, select:focus {
      outline: none;
      border-color: var(--card-border-focus);
    }

    .pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .pill-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #dfd7ee;
      font-size: 12.5px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .pill-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--primary);
    }
    .pill-btn.active {
      background: var(--primary);
      color: var(--primary-dark);
      border-color: var(--primary);
      font-weight: 800;
    }

    .coords-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }

    .theme-toggle-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .theme-card-btn {
      border: 2px solid var(--card-border);
      border-radius: 12px;
      padding: 12px;
      cursor: pointer;
      text-align: center;
      background: #181226;
      transition: all 0.15s;
    }
    .theme-card-btn.active {
      border-color: var(--primary);
      background: rgba(255, 184, 107, 0.08);
    }
    .theme-card-btn strong {
      display: block;
      font-size: 13.5px;
      margin-bottom: 2px;
    }
    .theme-card-btn span {
      font-size: 11.5px;
      color: var(--text-dim);
    }

    /* Code Box */
    .code-box-wrap {
      position: relative;
      margin-top: 14px;
    }
    .code-snippet {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #98c379;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 220px;
      overflow-y: auto;
    }
    .btn-copy {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: var(--green);
      color: #03291d;
      border: none;
      font-size: 13.5px;
      font-weight: 850;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      margin-top: 12px;
      transition: background 0.15s, transform 0.05s;
    }
    .btn-copy:hover {
      background: #33ffb5;
    }
    .btn-copy:active {
      transform: scale(0.99);
    }

    /* Preview Column */
    .preview-column {
      position: sticky;
      top: 24px;
    }
    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
    }
    .preview-title {
      font-size: 15px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
    }
    .device-switcher {
      display: inline-flex;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 2px;
      gap: 2px;
    }
    .device-btn {
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 11.5px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .device-btn.active {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    .preview-frame-container {
      background: #000;
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 12px;
      display: flex;
      justify-content: center;
      transition: all 0.2s ease;
      min-height: 520px;
    }
    .preview-frame-container.light-bg {
      background: #e9e5f0;
      border-color: #d1c8e0;
    }
    .widget-iframe {
      width: 100%;
      height: 600px;
      border: none;
      border-radius: 12px;
      background: transparent;
      transition: width 0.2s ease;
    }

    /* Integration Tabs */
    .integration-guide {
      margin-top: 24px;
    }
    .integration-item {
      border-top: 1px solid var(--card-border);
      padding: 14px 0;
    }
    .integration-item summary {
      cursor: pointer;
      font-size: 13.5px;
      font-weight: 750;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      outline: none;
    }
    .integration-item summary:hover { color: var(--primary); }
    .integration-item p {
      margin-top: 8px;
      font-size: 12.5px;
      color: var(--text-dim);
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <a class="brand" href="/"><b>●</b> Brinkberry <span class="badge-tag">Partner Widget</span></a>
      <a class="back-link" href="/">← Back to Live Radar</a>
    </header>

    <section class="hero-section">
      <h1 class="hero-title">Embed a Live Event Radar on Your Website</h1>
      <p class="hero-desc">
        Equip hotel guests, campground visitors, and locals with real-time live events happening within a rolling 48-hour window. Completely free, privacy-safe, zero maintenance, and updates autonomously.
      </p>
    </section>

    <div class="layout-grid">
      <!-- Left Config Column -->
      <div class="config-column">
        <!-- Step 1: Location -->
        <div class="card">
          <h2 class="section-title"><span class="step">1</span> Choose Target City or Coordinates</h2>
          
          <label>Popular Hubs</label>
          <div class="pill-group" id="cityPills">
            <button type="button" class="pill-btn active" data-city="denver">Denver, CO</button>
            <button type="button" class="pill-btn" data-city="new-orleans">New Orleans, LA</button>
            <button type="button" class="pill-btn" data-city="austin">Austin, TX</button>
            <button type="button" class="pill-btn" data-city="eau-claire">Eau Claire, WI</button>
            <button type="button" class="pill-btn" data-city="chicago">Chicago, IL</button>
            <button type="button" class="pill-btn" data-city="new-york">New York, NY</button>
            <button type="button" class="pill-btn" data-city="london">London, UK</button>
            <button type="button" class="pill-btn" data-city="custom">📍 Custom Pin</button>
          </div>

          <div id="customCoordsBox" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed var(--card-border);">
            <div class="form-group">
              <label for="customCityName">Location / Destination Name</label>
              <input type="text" id="customCityName" placeholder="e.g. Estes Park Cabin">
            </div>
            <div class="coords-row">
              <div>
                <label for="customLat">Latitude</label>
                <input type="number" step="any" id="customLat" placeholder="e.g. 40.3772">
              </div>
              <div>
                <label for="customLon">Longitude</label>
                <input type="number" step="any" id="customLon" placeholder="e.g. -105.5217">
              </div>
            </div>
            <p class="helper-text">Enter exact resort, lodge, or venue coordinates to display nearby events within 25 miles.</p>
          </div>
        </div>

        <!-- Step 2: Styling & Options -->
        <div class="card">
          <h2 class="section-title"><span class="step">2</span> Styling &amp; Controls</h2>

          <div class="form-group">
            <label>Color Theme</label>
            <div class="theme-toggle-row">
              <div class="theme-card-btn active" id="themeDarkBtn" onclick="setTheme('dark')">
                <strong>🌙 Dark Radar</strong>
                <span>Midnight aesthetic</span>
              </div>
              <div class="theme-card-btn" id="themeLightBtn" onclick="setTheme('light')">
                <strong>☀️ Clean Light</strong>
                <span>Matches bright blogs &amp; sites</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Card Presentation</label>
            <div class="theme-toggle-row">
              <div class="theme-card-btn active" id="layoutGridBtn" onclick="setLayout('grid')">
                <strong>🖼️ Visual Cards</strong>
                <span>Best for main content &amp; wide sections</span>
              </div>
              <div class="theme-card-btn" id="layoutCompactBtn" onclick="setLayout('compact')">
                <strong>📋 Compact List</strong>
                <span>Best for mobile &amp; "Things to do" sidebars</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="eventLimit">Events to Show</label>
            <select id="eventLimit" onchange="updateWidget()">
              <option value="2">2 Events (Ultra-compact)</option>
              <option value="4" selected>4 Events (Standard)</option>
              <option value="6">6 Events (Extended)</option>
              <option value="8">8 Events (Full Grid)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="partnerId">Partner / Website Tag</label>
            <input type="text" id="partnerId" placeholder="e.g. royal-sonesta-hotel" value="partner" oninput="updateWidget()">
            <p class="helper-text">Alphanumeric identifier. Outbound ticket clicks will carry this attribution tag for analytics.</p>
          </div>

          <div class="form-group" style="display:flex; align-items:flex-start; gap:10px; background:#181226; padding:12px; border-radius:10px; border:1px solid var(--card-border); margin-top:14px;">
            <input type="checkbox" id="autoResizeToggle" checked onchange="updateWidget()" style="width:18px; height:18px; margin-top:2px; accent-color:var(--primary); cursor:pointer;">
            <div>
              <label for="autoResizeToggle" style="margin-bottom:2px; cursor:pointer;"><b>Include Responsive Auto-Resize Script</b> (Recommended)</label>
              <p class="helper-text" style="margin-top:0;">Automatically adapts iframe height on mobile and desktop so all events fit seamlessly with zero cutoffs and zero double scrollbars.</p>
            </div>
          </div>
        </div>

        <!-- Step 3: Embed Code -->
        <div class="card">
          <h2 class="section-title"><span class="step">3</span> Copy Embed Code</h2>
          <p class="helper-text" style="margin-bottom:8px;">Paste this iframe code directly into your CMS or HTML page:</p>

          <div class="code-box-wrap">
            <pre class="code-snippet" id="embedCodeOutput"></pre>
            <button type="button" class="btn-copy" id="copyBtn" onclick="copySnippet()">
              <span id="copyIcon">📋</span>
              <span id="copyText">Copy Embed Code</span>
            </button>
          </div>

          <div class="integration-guide">
            <details class="integration-item">
              <summary>WordPress (Gutenberg / Classic) <span>▾</span></summary>
              <p>Add a <b>Custom HTML</b> block anywhere on your page or sidebar, paste the snippet, and click Update.</p>
            </details>
            <details class="integration-item">
              <summary>Squarespace <span>▾</span></summary>
              <p>Add an <b>Embed</b> or <b>Code</b> block, select "HTML", paste the snippet, and turn off "Display Source".</p>
            </details>
            <details class="integration-item">
              <summary>Wix <span>▾</span></summary>
              <p>Click Add (+) → <b>Embed Code</b> → <b>Embed HTML</b>. Paste the snippet and resize the container box.</p>
            </details>
            <details class="integration-item">
              <summary>Webflow, Shopify, or Custom HTML <span>▾</span></summary>
              <p>Insert an <b>Embed</b> component and paste the snippet directly into the template or container.</p>
            </details>
          </div>
        </div>
      </div>

      <!-- Right Live Preview Column -->
      <div class="preview-column">
        <div class="preview-header">
          <div class="preview-title">
            <span class="pulse-dot"></span>
            <span>Live Interactive Preview</span>
          </div>
          <div class="device-switcher">
            <button type="button" class="device-btn active" onclick="setDeviceWidth('100%', this)">Desktop</button>
            <button type="button" class="device-btn" onclick="setDeviceWidth('520px', this)">Tablet</button>
            <button type="button" class="device-btn" onclick="setDeviceWidth('360px', this)">Mobile</button>
          </div>
        </div>

        <div class="preview-frame-container" id="frameContainer">
          <iframe id="previewIframe" class="widget-iframe" src="${ORIGIN}/widget?city=denver&theme=dark&limit=4&partner=partner" loading="lazy" title="Live Event Radar Preview"></iframe>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentCity = 'denver';
    let currentTheme = 'dark';
    let currentLayout = 'grid';

    // Preset Pill Click Handlers
    document.querySelectorAll('#cityPills .pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#cityPills .pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const c = btn.dataset.city;
        const customBox = document.getElementById('customCoordsBox');

        if (c === 'custom') {
          customBox.style.display = 'block';
          currentCity = 'custom';
        } else {
          customBox.style.display = 'none';
          currentCity = c;
        }
        updateWidget();
      });
    });

    ['customCityName', 'customLat', 'customLon'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        if (currentCity === 'custom') updateWidget();
      });
    });

    function setTheme(th) {
      currentTheme = th;
      document.getElementById('themeDarkBtn').classList.toggle('active', th === 'dark');
      document.getElementById('themeLightBtn').classList.toggle('active', th === 'light');
      document.getElementById('frameContainer').classList.toggle('light-bg', th === 'light');
      updateWidget();
    }

    function setLayout(ly) {
      currentLayout = ly;
      document.getElementById('layoutGridBtn').classList.toggle('active', ly === 'grid');
      document.getElementById('layoutCompactBtn').classList.toggle('active', ly === 'compact');
      updateWidget();
    }

    function setDeviceWidth(w, btn) {
      document.querySelectorAll('.device-switcher .device-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('previewIframe').style.maxWidth = w;
    }

    function calculateRecommendedHeight(layout, limit) {
      const lim = parseInt(limit, 10) || 4;
      if (layout === 'compact') {
        return Math.max(260, 110 + (lim * 85));
      }
      // Grid layout: 2 columns on desktop
      const rows = Math.ceil(lim / 2);
      return Math.max(380, 110 + (rows * 270));
    }

    function getWidgetUrl() {
      const limit = document.getElementById('eventLimit').value || '4';
      const rawPartner = (document.getElementById('partnerId').value || 'partner').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const partner = rawPartner || 'partner';

      let query = \`theme=\${encodeURIComponent(currentTheme)}&limit=\${encodeURIComponent(limit)}&partner=\${encodeURIComponent(partner)}\`;
      if (currentLayout === 'compact') {
        query += '&layout=compact';
      }

      if (currentCity === 'custom') {
        const name = (document.getElementById('customCityName').value || 'Nearby').trim();
        const lat = parseFloat(document.getElementById('customLat').value);
        const lon = parseFloat(document.getElementById('customLon').value);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          query += \`&lat=\${lat}&lon=\${lon}&cityName=\${encodeURIComponent(name)}\`;
        } else {
          query += '&city=denver';
        }
      } else {
        query += \`&city=\${encodeURIComponent(currentCity)}\`;
      }

      return \`${ORIGIN}/widget?\${query}\`;
    }

    // Listen to auto-resize messages from widget preview
    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'brinkberry-widget-resize' && Number.isFinite(e.data.height)) {
        const previewIframe = document.getElementById('previewIframe');
        if (previewIframe) {
          previewIframe.style.height = e.data.height + 'px';
        }
      }
    });

    let updateTimeout;
    function updateWidget() {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        const url = getWidgetUrl();
        const limit = document.getElementById('eventLimit').value || '4';
        const iframe = document.getElementById('previewIframe');
        if (iframe.src !== url) {
          iframe.src = url;
        }

        const isAutoResize = document.getElementById('autoResizeToggle')?.checked ?? true;
        const defaultHeight = calculateRecommendedHeight(currentLayout, limit);

        let snippet = \`<!-- Brinkberry Hyperlocal Event Radar Widget -->
<iframe
  id="brinkberry-radar-widget"
  src="\${url}"
  width="100%"
  height="\${defaultHeight}"
  frameborder="0"
  style="border:0; width:100%; max-width:680px; border-radius:14px; display:block;"
  loading="lazy"
  title="What's happening nearby in the next 48 hours"
></iframe>\`;

        if (isAutoResize) {
          snippet += \`
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'brinkberry-widget-resize') {
      var el = document.getElementById('brinkberry-radar-widget');
      if (el) el.style.height = e.data.height + 'px';
    }
  });
<\\/script>\`;
        }

        document.getElementById('embedCodeOutput').textContent = snippet;
      }, 150);
    }

    async function copySnippet() {
      const snippet = document.getElementById('embedCodeOutput').textContent;
      try {
        await navigator.clipboard.writeText(snippet);
        const textSpan = document.getElementById('copyText');
        const iconSpan = document.getElementById('copyIcon');
        textSpan.textContent = 'Copied to Clipboard!';
        iconSpan.textContent = '✓';
        setTimeout(() => {
          textSpan.textContent = 'Copy Embed Code';
          iconSpan.textContent = '📋';
        }, 2200);
      } catch (err) {
        alert('Could not auto-copy. Please select and copy the code box manually.');
      }
    }

    // Initial render
    updateWidget();
  </script>
</body>
</html>`);
};
