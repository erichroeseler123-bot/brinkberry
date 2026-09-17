module.exports = (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Brinkberry — Find What’s Happening Near You Right Now</title>
  <meta name="description" content="Discover real-world events, live music, sports, outdoor activities, and things to do near you right now in Denver, Boulder, Golden, and Aurora.">
  <link rel="canonical" href="https://brinkberry.com/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Brinkberry — Find What’s Happening Near You Right Now">
  <meta property="og:description" content="Discover real-world events, live music, sports, outdoor activities, and things to do near you right now. Pick a location, set a time, and go.">
  <meta property="og:url" content="https://brinkberry.com/">
  <meta name="twitter:card" content="summary_large_image">
  
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIINfQ3ynHBWqOU7MZVnKfXKjMZKnS4W9TQ=" crossorigin="">
  <style>
    :root {
      --bg: #080610;
      --card-bg: #151120;
      --card-border: #282038;
      --text: #f4eff8;
      --text-dim: #9b90aa;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
      --tag-bg: #221a30;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.45; }
    .app { max-width: 1080px; margin: auto; padding: 18px 20px 60px; }
    .top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #1c1628; }
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; }
    .brand b { color: var(--accent); }
    .hero { padding: 24px 0 16px; }
    .hero h1 { font-size: clamp(30px, 6vw, 50px); line-height: 1.05; margin: 0 0 8px; font-weight: 850; letter-spacing: -0.03em; }
    .hero p { color: var(--text-dim); margin: 0; font-size: 16px; }
    
    .panel { background: #120e1c; border: 1px solid var(--card-border); border-radius: 16px; padding: 14px 16px; margin: 16px 0; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .section-label { font-size: 12px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; min-width: 65px; }
    
    button, a.btn {
      border: 1px solid var(--card-border);
      background: #191424;
      color: var(--text);
      padding: 8px 14px;
      border-radius: 999px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    button:hover, a.btn:hover { background: #261f36; border-color: #403458; }
    button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .mode-btn.active { background: var(--primary); border-color: var(--primary); color: var(--primary-dark); font-weight: 750; }
    
    .status { margin: 12px 0; padding: 10px 14px; border-radius: 12px; background: #151022; border: 1px solid var(--card-border); color: #ded6ec; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
    .weather { display: none; margin: 10px 0; padding: 10px 14px; border-radius: 12px; background: #101926; border: 1px solid #1d334e; color: #a9d4ff; font-size: 14px; }
    .planb { display: none; margin: 12px 0; padding: 12px 16px; border-radius: 14px; background: #24141d; border: 1px solid #632644; color: #ffb8d2; }
    .brink-alert { margin: 12px 0; padding: 12px 16px; border-radius: 14px; background: #2a101d; border: 1px solid #822247; color: #ff809d; font-weight: 700; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; margin-top: 16px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, border-color 0.15s; cursor: pointer; }
    .card:hover { transform: translateY(-2px); border-color: #4a3a66; }
    .card.brink { border-color: var(--accent); }
    .card-img { height: 145px; background: linear-gradient(135deg, #24142d, #4a1832); background-size: cover; background-position: center; position: relative; display: flex; align-items: flex-end; padding: 10px; }
    .card-badge { background: rgba(8, 6, 16, 0.85); backdrop-filter: blur(4px); border: 1px solid #362a4d; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; color: #fff; }
    .card-body { padding: 16px; flex: 1; display: flex; flex-direction: column; }
    .card-title { font-size: 18px; font-weight: 800; line-height: 1.25; margin: 4px 0 8px; color: #fff; }
    .card-meta { color: var(--text-dim); font-size: 13px; margin-bottom: 4px; }
    .why-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
    .why-tag { font-size: 11px; font-weight: 700; background: var(--tag-bg); border: 1px solid #362a4d; color: #d6cced; padding: 3px 8px; border-radius: 999px; }
    .brinktag { font-size: 11px; font-weight: 900; letter-spacing: 0.08em; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; }
    .card-footer { margin-top: auto; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #201930; }
    .card-price { font-weight: 800; color: #fff; font-size: 14px; }
    .btn-ticket-sm { background: var(--primary); color: var(--primary-dark); font-size: 13px; font-weight: 800; padding: 7px 14px; border-radius: 999px; text-decoration: none; border: 0; }
    .btn-ticket-sm:hover { background: #ffa84d; }
    
    #radar { display: none; height: 540px; border-radius: 18px; overflow: hidden; margin-top: 16px; border: 1px solid var(--card-border); }
    .empty { padding: 60px 20px; text-align: center; color: var(--text-dim); }
    .empty h3 { color: #fff; margin-bottom: 8px; }
    
    dialog { border: 1px solid var(--card-border); background: #120e1a; color: #fff; border-radius: 20px; width: min(600px, 94vw); padding: 22px; }
    dialog::backdrop { background: rgba(5, 3, 10, 0.85); }
    .actions-bar { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    
    /* City Guides Footer */
    .city-guides-footer { margin-top: 50px; padding-top: 30px; border-top: 1px solid #1c1628; }
    .city-guides-footer h3 { font-size: 18px; font-weight: 800; margin-bottom: 14px; color: #fff; }
    .city-links-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .city-links-col h4 { margin: 0 0 8px; font-size: 14px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; }
    .city-links-col a { display: block; color: var(--text-dim); text-decoration: none; font-size: 13.5px; margin-bottom: 6px; }
    .city-links-col a:hover { color: #fff; text-decoration: underline; }
    
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      #radar { height: 400px; }
      .app { padding: 14px 14px 50px; }
      .hero h1 { font-size: 32px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="top">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <button id="locBtn">📍 Use my location</button>
    </header>

    <section class="hero">
      <h1>Find what’s happening near you.</h1>
      <p>Real things. Nearby. Pick a location, set a time, and go.</p>
    </section>

    <!-- Filters Panel -->
    <div class="panel">
      <!-- Location row -->
      <div class="row" style="margin-bottom: 12px;">
        <span class="section-label">Location</span>
        <button id="presetDenver" class="active">Denver, CO</button>
        <button id="presetBoulder">Boulder</button>
        <button id="presetGolden">Golden</button>
        <button id="presetAurora">Aurora</button>
      </div>

      <!-- Radius row -->
      <div class="row" style="margin-bottom: 12px;">
        <span class="section-label">Radius</span>
        <div id="radiusFilters" class="row"></div>
      </div>

      <!-- Time window row -->
      <div class="row" style="margin-bottom: 12px;">
        <span class="section-label">When</span>
        <div id="timeWindows" class="row"></div>
      </div>

      <!-- Vibe / Mode row -->
      <div class="row">
        <span class="section-label">Vibe</span>
        <div id="modeFilters" class="row"></div>
      </div>
    </div>

    <!-- Live Status & Weather Alerts -->
    <div id="status" class="status">Loading nearby events…</div>
    <div id="weather" class="weather"></div>
    <div id="planb" class="planb"></div>
    <div id="brinkAlert"></div>

    <!-- View Switcher -->
    <div class="row" style="justify-content: flex-end; margin-top: 14px;">
      <button id="viewFeed" class="active">Feed View</button>
      <button id="viewRadar">Radar Map</button>
    </div>

    <!-- Main Feed & Map -->
    <main id="feed"><div class="empty">Finding events…</div></main>
    <div id="radar"></div>

    <!-- Front Range City Guides Indexable Footer -->
    <section class="city-guides-footer">
      <h3>Popular Front Range Event Guides</h3>
      <div class="city-links-grid">
        <div class="city-links-col">
          <h4>Denver</h4>
          <a href="/denver/next-48-hours">Denver Next 48 Hours</a>
          <a href="/denver/music">Denver Live Music</a>
          <a href="/denver/arts">Denver Arts & Exhibits</a>
          <a href="/denver/theater">Denver Theater</a>
          <a href="/denver/free">Denver Free Events</a>
          <a href="/denver/outdoor">Denver Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>Boulder</h4>
          <a href="/boulder/next-48-hours">Boulder Next 48 Hours</a>
          <a href="/boulder/music">Boulder Live Music</a>
          <a href="/boulder/arts">Boulder Arts & Exhibits</a>
          <a href="/boulder/theater">Boulder Theater</a>
          <a href="/boulder/free">Boulder Free Events</a>
          <a href="/boulder/outdoor">Boulder Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>Golden</h4>
          <a href="/golden/next-48-hours">Golden Next 48 Hours</a>
          <a href="/golden/music">Golden Live Music</a>
          <a href="/golden/arts">Golden Arts & Exhibits</a>
          <a href="/golden/theater">Golden Theater</a>
          <a href="/golden/free">Golden Free Events</a>
          <a href="/golden/outdoor">Golden Outdoor Activities</a>
        </div>
        <div class="city-links-col">
          <h4>Aurora</h4>
          <a href="/aurora/next-48-hours">Aurora Next 48 Hours</a>
          <a href="/aurora/music">Aurora Live Music</a>
          <a href="/aurora/arts">Aurora Arts & Exhibits</a>
          <a href="/aurora/theater">Aurora Theater</a>
          <a href="/aurora/free">Aurora Free Events</a>
          <a href="/aurora/outdoor">Aurora Outdoor Activities</a>
        </div>
      </div>
    </section>
  </div>

  <!-- Event Detail Dialog -->
  <dialog id="detailDlg">
    <div id="detailBody"></div>
    <div class="actions-bar">
      <button id="shareModalBtn" class="btn" style="background:#191424; color:#fff">🔗 Share Event</button>
      <button id="closeDetail" class="btn" style="margin-left:auto">Close</button>
    </div>
  </dialog>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    const S = {
      lat: 39.7392,
      lon: -104.9903,
      city: 'Denver',
      locationName: 'Denver, CO',
      radius: 25,
      window: 'tonight',
      mode: '',
      events: [],
      coverage: { isSupported: true, nearestMarket: 'Denver', supportedMarkets: [] },
      weather: null,
      map: null,
      markers: [],
      currentDetailEvent: null
    };

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    const fmtTime = iso => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    function initControls() {
      const radii = [5, 10, 25, 50];
      $('radiusFilters').innerHTML = radii.map(r => \`<button class="\${S.radius === r ? 'active' : ''}" data-r="\${r}">\${r} mi</button>\`).join('');
      document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.radius = Number(b.dataset.r); initControls(); loadFeed(); });

      const windows = [['now', 'Now'], ['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['48h', 'Next 48 Hours']];
      $('timeWindows').innerHTML = windows.map(([k, l]) => \`<button class="\${(S.window === k || (k === '48h' && S.window === 'weekend')) ? 'active' : ''}" data-w="\${k}">\${l}</button>\`).join('');
      document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { S.window = b.dataset.w; initControls(); loadFeed(); });

      const modes = [['', 'All'], ['cheap', 'Cheap / Free'], ['date', 'Date Night'], ['outside', 'Outside'], ['kids', 'Kids']];
      $('modeFilters').innerHTML = modes.map(([k, l]) => \`<button class="mode-btn \${S.mode === k ? 'active' : ''}" data-m="\${k}">\${l}</button>\`).join('');
      document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; initControls(); loadFeed(); });
    }

    function renderFeed() {
      const brinkCount = S.events.filter(e => e.onTheBrink).length;
      $('brinkAlert').innerHTML = brinkCount ? \`<div class="brink-alert">⚡ <b>On the Brink</b> · \${brinkCount} nearby \${brinkCount === 1 ? 'event starts' : 'events start'} within the hour.</div>\` : '';

      // Out of coverage market state
      if (S.coverage && S.coverage.isSupported === false) {
        const locTitle = S.locationName || S.city || 'Your Location';
        $('feed').innerHTML = \`
          <div class="empty out-of-coverage">
            <div style="font-size:38px; margin-bottom:12px">📍</div>
            <h3 style="font-size:22px; margin:0 0 8px; color:#fff">Brinkberry is not covering \${esc(locTitle)} yet</h3>
            <p style="max-width:540px; margin:0 auto 18px; color:var(--text-dim); line-height:1.55">
              We strictly show verified, real-world events happening in the next 48 hours. We currently have active event coverage across the <b>Colorado Front Range</b>.
            </p>

            <div style="margin:22px 0">
              <div style="font-size:12px; font-weight:700; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px">
                Explore a Supported Market:
              </div>
              <div class="row" style="justify-content:center; gap:8px;">
                <button onclick="setPreset('Denver', 39.7392, -104.9903); $('presetDenver').classList.add('active');" style="background:var(--primary); color:var(--primary-dark); font-weight:800">Explore Denver →</button>
                <button onclick="setPreset('Boulder', 40.0150, -105.2705); $('presetBoulder').classList.add('active');">Boulder</button>
                <button onclick="setPreset('Golden', 39.7555, -105.2211); $('presetGolden').classList.add('active');">Golden</button>
                <button onclick="setPreset('Aurora', 39.7294, -104.8319); $('presetAurora').classList.add('active');">Aurora</button>
              </div>
            </div>

            <div class="market-request-box" style="background:#130f1c; border:1px solid var(--card-border); border-radius:16px; padding:18px 22px; max-width:480px; margin:24px auto 0; text-align:left">
              <h4 style="margin:0 0 6px; font-size:15px; color:#fff">Want Brinkberry in \${esc(locTitle)}?</h4>
              <p style="margin:0 0 12px; font-size:13px; color:var(--text-dim)">Submit this city as a requested market so our local curators know where to launch next.</p>
              <div id="requestMarketForm" style="display:flex; gap:8px">
                <input type="text" id="marketInput" value="\${esc(locTitle)}" style="flex:1; background:#191424; border:1px solid var(--card-border); color:#fff; padding:8px 14px; border-radius:999px; font-size:13.5px">
                <button id="submitMarketBtn" onclick="submitMarketRequest()" style="background:var(--accent); color:#fff; font-weight:700">Request City</button>
              </div>
              <div id="requestMarketSuccess" style="display:none; color:#a9ffcb; font-size:13px; font-weight:600; margin-top:8px">
                ✓ Thanks! We’ve recorded your request for <span id="requestedCityLabel"></span>.
              </div>
            </div>
          </div>\`;
        renderRadar();
        return;
      }

      // Empty in supported market
      if (!S.events.length) {
        const modeLabels = { cheap: 'Cheap / Free', date: 'Date Night', outside: 'Outside', kids: 'Kids' };
        const modeText = S.mode && modeLabels[S.mode] ? ' for "' + modeLabels[S.mode] + '"' : '';
        $('feed').innerHTML = \`
          <div class="empty">
            <h3>No events matched this exact window\${modeText}</h3>
            <p>We strictly show verified events happening in the next 48 hours. Try expanding your radius or checking a different vibe filter.</p>
            <div class="row" style="justify-content:center; margin-top:14px; gap:8px;">
              \${S.mode ? '<button onclick="S.mode=\\'\\'; initControls(); loadFeed();" style="background:#191424; color:#fff">Clear Vibe Filter</button>' : ''}
              <button onclick="S.radius=50; S.window='48h'; S.mode=''; initControls(); loadFeed();" style="background:var(--primary); color:var(--primary-dark); font-weight:800">
                Search 50 Miles / Next 48 Hours →
              </button>
            </div>
          </div>\`;
        return;
      }

      $('feed').innerHTML = '<div class="grid">' + S.events.map(e => \`
        <article class="card \${e.onTheBrink ? 'brink' : ''}" data-id="\${e.id}">
          <div class="card-img" style="\${e.image ? 'background-image:url(' + JSON.stringify(e.image) + ')' : ''}">
            <span class="card-badge">\${esc(e.category)}</span>
          </div>
          <div class="card-body">
            \${e.onTheBrink ? '<div class="brinktag">Starts Soon</div>' : ''}
            <div class="card-meta">\${e.neighborhood ? esc(e.neighborhood) : esc(e.city || 'Nearby')}</div>
            <div class="card-title">\${esc(e.title)}</div>
            <div class="card-meta">📍 \${esc(e.venue)}\${e.city ? ', ' + esc(e.city) : ''}</div>
            <div class="card-meta">⏰ \${esc(fmtTime(e.start))}\${e.distanceMiles != null ? ' · <b>' + e.distanceMiles.toFixed(1) + ' mi</b>' : ''}</div>
            <div class="why-tags">
              \${(e.whyThis || []).map(t => \`<span class="why-tag">\${esc(t)}</span>\`).join('')}
            </div>
            <div class="card-footer">
              <div class="card-price">\${esc(e.priceDisplay || 'Details')}</div>
              <a class="btn-ticket-sm" href="/api/click?url=\${encodeURIComponent(e.ticketUrl)}&eventId=\${encodeURIComponent(e.id)}&surface=feed_card" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                Get Tickets →
              </a>
            </div>
          </div>
        </article>
      \`).join('') + '</div>';

      document.querySelectorAll('.card').forEach(c => c.onclick = () => openDetail(c.dataset.id));
      renderRadar();
      renderPlanB();
    }

    async function submitMarketRequest() {
      const input = $('marketInput');
      const city = input ? input.value.trim() : (S.locationName || S.city);
      if (!city) return;
      const btn = $('submitMarketBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        await fetch('/api/market-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ city, lat: S.lat, lng: S.lon })
        });
      } catch (_) {}
      if ($('requestMarketForm')) $('requestMarketForm').style.display = 'none';
      if ($('requestMarketSuccess')) {
        $('requestMarketSuccess').style.display = 'block';
        $('requestedCityLabel').textContent = city;
      }
    }

    async function loadFeed() {
      $('status').textContent = \`Finding events near \${S.city} (\${S.radius} mi) · \${S.window}…\`;
      try {
        const r = await fetch(\`/api/feed?lat=\${S.lat}&lng=\${S.lon}&radius=\${S.radius}&window=\${S.window}&mode=\${encodeURIComponent(S.mode)}&city=\${encodeURIComponent(S.city)}\`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.status);
        S.events = data.events || [];
        S.coverage = data.meta?.coverage || { isSupported: true };
        if (data.meta?.coverage?.locationName) {
          S.locationName = data.meta.coverage.locationName;
        }

        if (S.coverage && S.coverage.isSupported === false) {
          $('status').innerHTML = \`📍 <b>\${esc(S.locationName || S.city)}</b> is outside our active coverage area.\`;
        } else {
          $('status').textContent = \`\${S.events.length} events found near \${S.city} (\${S.radius} mi radius)\`;
        }
        renderFeed();
        loadWeather();
      } catch (err) {
        $('status').textContent = 'Could not load events: ' + err.message;
      }
    }

    async function loadWeather() {
      try {
        const r = await fetch(\`/api/weather?lat=\${S.lat}&lng=\${S.lon}\`);
        if (!r.ok) throw 0;
        const j = await r.json();
        S.weather = j;
        const c = j.current || {};
        $('weather').style.display = 'block';
        $('weather').innerHTML = \`🌤️ <b>\${esc(c.shortForecast || 'Weather')}</b> · \${esc(c.temperature)}°\${esc(c.temperatureUnit || 'F')}\${j.maxPrecipNext3h != null ? ' · ' + j.maxPrecipNext3h + '% precip chance next 3h' : ''}\`;
        renderPlanB();
      } catch {
        $('weather').style.display = 'none';
        S.weather = null;
      }
    }

    function renderPlanB() {
      if (!S.weather?.planBWeather) return $('planb').style.display = 'none';
      const outdoor = S.events.find(e => ['outdoor', 'mixed'].includes(e.indoorOutdoor));
      const indoor = S.events.find(e => e.indoorOutdoor === 'indoor');
      if (outdoor && indoor) {
        $('planb').style.display = 'block';
        $('planb').innerHTML = \`🌧️ <b>Rain may affect outdoor plans.</b> Indoor Plan B recommendation: <b>\${esc(indoor.title)}</b> (\${esc(indoor.venue)} · \${indoor.distanceMiles != null ? indoor.distanceMiles.toFixed(1) + ' mi' : 'nearby'}).\`;
      } else {
        $('planb').style.display = 'none';
      }
    }

    function openDetail(id) {
      const e = S.events.find(x => x.id === id);
      if (!e) return;
      S.currentDetailEvent = e;
      const clickUrl = \`/api/click?url=\${encodeURIComponent(e.ticketUrl)}&eventId=\${encodeURIComponent(e.id)}&surface=detail_modal\`;
      $('detailBody').innerHTML = \`
        <h2 style="margin-top:0">\${esc(e.title)}</h2>
        <p style="color:var(--text-dim)">📍 \${esc(e.venue)}\${e.city ? ', ' + esc(e.city) : ''} \${e.distanceMiles != null ? ' · ' + e.distanceMiles.toFixed(1) + ' mi' : ''}</p>
        <p style="color:var(--text-dim)">⏰ \${esc(fmtTime(e.start))}</p>
        <p><b>Admission:</b> \${esc(e.priceDisplay || 'Details on ticket page')}</p>
        \${e.desc ? \`<p style="line-height:1.5">\${esc(e.desc)}</p>\` : ''}
        <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap">
          <a class="btn" style="background:var(--primary); color:var(--primary-dark); font-weight:800" href="\${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">Get Tickets & Details →</a>
          <a class="btn" href="/event/\${encodeURIComponent(e.id)}" target="_blank">Standalone Event Page</a>
        </div>
      \`;
      $('detailDlg').showModal();
    }

    function renderRadar() {
      if (!$('radar') || $('radar').style.display === 'none' || !window.L) return;
      if (!S.map) {
        S.map = L.map('radar').setView([S.lat, S.lon], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
      }
      S.markers.forEach(m => m.remove());
      S.markers = [];
      const latLngs = [];
      S.events.forEach(e => {
        if (e.lat == null || e.lon == null) return;
        const ll = [e.lat, e.lon];
        latLngs.push(ll);
        const m = L.marker(ll).addTo(S.map)
          .bindPopup(\`<b>\${esc(e.title)}</b><br>\${esc(e.venue)}<br>\${e.distanceMiles != null ? e.distanceMiles.toFixed(1) + ' mi' : ''}<br><a href="/event/\${encodeURIComponent(e.id)}" target="_blank">View Event →</a>\`);
        S.markers.push(m);
      });
      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        S.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      } else {
        S.map.setView([S.lat, S.lon], 11);
      }
      setTimeout(() => S.map.invalidateSize(), 50);
    }

    // View toggles
    $('viewFeed').onclick = () => { $('viewFeed').classList.add('active'); $('viewRadar').classList.remove('active'); $('feed').style.display = 'block'; $('radar').style.display = 'none'; };
    $('viewRadar').onclick = () => { $('viewRadar').classList.add('active'); $('viewFeed').classList.remove('active'); $('feed').style.display = 'none'; $('radar').style.display = 'block'; renderRadar(); };

    // Preset handlers
    const setPreset = (name, lat, lon) => {
      ['presetDenver', 'presetBoulder', 'presetGolden', 'presetAurora'].forEach(id => $(id)?.classList.remove('active'));
      S.city = name; S.locationName = name; S.lat = lat; S.lon = lon; loadFeed();
    };
    $('presetDenver').onclick = e => { setPreset('Denver', 39.7392, -104.9903); e.target.classList.add('active'); };
    $('presetBoulder').onclick = e => { setPreset('Boulder', 40.0150, -105.2705); e.target.classList.add('active'); };
    $('presetGolden').onclick = e => { setPreset('Golden', 39.7555, -105.2211); e.target.classList.add('active'); };
    $('presetAurora').onclick = e => { setPreset('Aurora', 39.7294, -104.8319); e.target.classList.add('active'); };

    $('locBtn').onclick = () => {
      $('status').textContent = 'Detecting your location…';
      ['presetDenver', 'presetBoulder', 'presetGolden', 'presetAurora'].forEach(id => $(id)?.classList.remove('active'));
      if (!navigator.geolocation) {
        $('status').innerHTML = '⚠️ Geolocation is not supported by your browser. Please choose a supported market below:';
        return;
      }
      navigator.geolocation.getCurrentPosition(p => {
        setPreset('Your Location', p.coords.latitude, p.coords.longitude);
      }, () => {
        $('status').innerHTML = '⚠️ Location access was not granted. Please select one of our supported Colorado markets below:';
      }, { timeout: 8000 });
    };

    $('shareModalBtn').onclick = async () => {
      const e = S.currentDetailEvent;
      if (!e) return;
      const url = location.origin + '/event/' + e.id;
      const shareData = { title: e.title, text: e.title + ' — ' + fmtTime(e.start) + ' at ' + e.venue, url };
      if (navigator.share) {
        try { await navigator.share(shareData); return; } catch {}
      }
      await navigator.clipboard.writeText(url);
      alert('Event link copied to clipboard: ' + url);
    };

    $('closeDetail').onclick = () => $('detailDlg').close();

    initControls();
    loadFeed();
  </script>
</body>
</html>`);
};
