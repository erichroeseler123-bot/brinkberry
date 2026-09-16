module.exports = (req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Brinkberry — Find What’s Happening Near You Right Now</title>
  <meta name="description" content="Discover real-world events, live music, sports, outdoor activities, and things to do near you right now. Pick a time, find a reason, go.">
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
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
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
    }
    button:hover, a.btn:hover { background: #261f36; border-color: #403458; }
    button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .mode-btn.active { background: var(--primary); border-color: var(--primary); color: var(--primary-dark); font-weight: 750; }
    
    .status { margin: 12px 0; padding: 10px 14px; border-radius: 12px; background: #151022; border: 1px solid var(--card-border); color: #ded6ec; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
    .weather { display: none; margin: 10px 0; padding: 10px 14px; border-radius: 12px; background: #101926; border: 1px solid #1d334e; color: #a9d4ff; font-size: 14px; }
    .planb { display: none; margin: 12px 0; padding: 12px 16px; border-radius: 14px; background: #24141d; border: 1px solid #632644; color: #ffb8d2; }
    .brink-alert { margin: 12px 0; padding: 12px 16px; border-radius: 14px; background: #2a101d; border: 1px solid #822247; color: #ff809d; font-weight: 700; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, border-color 0.15s; }
    .card:hover { transform: translateY(-2px); border-color: #4a3a66; }
    .card.brink { border-color: var(--accent); }
    .card-img { height: 145px; background: linear-gradient(135deg, #24142d, #4a1832); background-size: cover; background-position: center; position: relative; }
    .card-body { padding: 16px; flex: 1; display: flex; flex-direction: column; }
    .card-title { font-size: 18px; font-weight: 800; line-height: 1.2; margin: 4px 0 8px; color: #fff; }
    .card-meta { color: var(--text-dim); font-size: 13px; margin-bottom: 4px; }
    .why-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
    .why-tag { font-size: 11px; font-weight: 700; background: var(--tag-bg); border: 1px solid #362a4d; color: #d6cced; padding: 3px 8px; border-radius: 999px; }
    .brinktag { font-size: 11px; font-weight: 900; letter-spacing: 0.08em; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; }
    .card-footer { margin-top: auto; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #201930; }
    .card-price { font-weight: 800; color: #fff; font-size: 14px; }
    .btn-ticket-sm { background: var(--primary); color: var(--primary-dark); font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 999px; text-decoration: none; border: 0; }
    
    #radar { display: none; height: 540px; border-radius: 18px; overflow: hidden; margin-top: 16px; border: 1px solid var(--card-border); }
    .empty { padding: 60px 20px; text-align: center; color: var(--text-dim); }
    .empty h3 { color: #fff; margin-bottom: 8px; }
    
    dialog { border: 1px solid var(--card-border); background: #120e1a; color: #fff; border-radius: 20px; width: min(600px, 94vw); padding: 22px; }
    dialog::backdrop { background: rgba(5, 3, 10, 0.85); }
    .actions-bar { display: flex; gap: 10px; margin-top: 18px; }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      #radar { height: 400px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="top">
      <div class="brand"><b>●</b> Brinkberry</div>
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
  </div>

  <!-- Event Detail Dialog -->
  <dialog id="detailDlg">
    <div id="detailBody"></div>
    <div class="actions-bar">
      <button id="closeDetail" style="margin-left:auto">Close</button>
    </div>
  </dialog>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    const S = {
      lat: 39.7392,
      lon: -104.9903,
      city: 'Denver',
      radius: 25,
      window: 'tonight',
      mode: '',
      events: [],
      weather: null,
      map: null,
      markers: []
    };

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    const fmtTime = iso => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    function initControls() {
      const radii = [5, 10, 25, 50];
      $('radiusFilters').innerHTML = radii.map(r => \`<button class="\${S.radius === r ? 'active' : ''}" data-r="\${r}">\${r} mi</button>\`).join('');
      document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.radius = Number(b.dataset.r); initControls(); loadFeed(); });

      const windows = [['now', 'Now'], ['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['weekend', 'This Weekend']];
      $('timeWindows').innerHTML = windows.map(([k, l]) => \`<button class="\${S.window === k ? 'active' : ''}" data-w="\${k}">\${l}</button>\`).join('');
      document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { S.window = b.dataset.w; initControls(); loadFeed(); });

      const modes = [['', 'All'], ['cheap', 'Cheap / Free'], ['date', 'Date Night'], ['outside', 'Outside'], ['kids', 'Kids']];
      $('modeFilters').innerHTML = modes.map(([k, l]) => \`<button class="mode-btn \${S.mode === k ? 'active' : ''}" data-m="\${k}">\${l}</button>\`).join('');
      document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; initControls(); loadFeed(); });
    }

    function renderFeed() {
      const brinkCount = S.events.filter(e => e.onTheBrink).length;
      $('brinkAlert').innerHTML = brinkCount ? \`<div class="brink-alert">⚡ <b>On the Brink</b> · \${brinkCount} nearby \${brinkCount === 1 ? 'event starts' : 'events start'} within the hour.</div>\` : '';

      if (!S.events.length) {
        $('feed').innerHTML = \`
          <div class="empty">
            <h3>No events matched this window</h3>
            <p>Try expanding your radius or checking a different time filter.</p>
            <div class="row" style="justify-content:center; margin-top:14px;">
              <button onclick="S.radius=50; S.window='weekend'; initControls(); loadFeed();" style="background:var(--primary); color:var(--primary-dark); font-weight:800">
                Search 50 Miles / Weekend →
              </button>
            </div>
          </div>\`;
        return;
      }

      $('feed').innerHTML = '<div class="grid">' + S.events.map(e => \`
        <article class="card \${e.onTheBrink ? 'brink' : ''}" data-id="\${e.id}">
          <div class="card-img" style="\${e.image ? 'background-image:url(' + JSON.stringify(e.image) + ')' : ''}"></div>
          <div class="card-body">
            \${e.onTheBrink ? '<div class="brinktag">Starts Soon</div>' : ''}
            <div class="card-meta">\${esc(e.category)}\${e.neighborhood ? ' · ' + esc(e.neighborhood) : ''}</div>
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

    async function loadFeed() {
      $('status').textContent = \`Finding events near \${S.city} (\${S.radius} mi) · \${S.window}…\`;
      try {
        const r = await fetch(\`/api/feed?lat=\${S.lat}&lng=\${S.lon}&radius=\${S.radius}&window=\${S.window}&mode=\${encodeURIComponent(S.mode)}\`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.status);
        S.events = data.events || [];
        $('status').textContent = \`\${S.events.length} events found near \${S.city} (\${S.radius} mi radius)\`;
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
      const clickUrl = \`/api/click?url=\${encodeURIComponent(e.ticketUrl)}&eventId=\${encodeURIComponent(e.id)}&surface=detail_modal\`;
      $('detailBody').innerHTML = \`
        <h2 style="margin-top:0">\${esc(e.title)}</h2>
        <p style="color:var(--text-dim)">📍 \${esc(e.venue)}\${e.city ? ', ' + esc(e.city) : ''} \${e.distanceMiles != null ? ' · ' + e.distanceMiles.toFixed(1) + ' mi' : ''}</p>
        <p style="color:var(--text-dim)">⏰ \${esc(fmtTime(e.start))}</p>
        <p><b>Admission:</b> \${esc(e.priceDisplay || 'Details on ticket page')}</p>
        \${e.desc ? \`<p style="line-height:1.5">\${esc(e.desc)}</p>\` : ''}
        <div style="display:flex; gap:10px; margin-top:20px;">
          <a class="btn" style="background:var(--primary); color:var(--primary-dark); font-weight:800" href="\${esc(clickUrl)}" target="_blank" rel="noopener noreferrer">Get Tickets & Details →</a>
          <a class="btn" href="/event/\${encodeURIComponent(e.id)}" target="_blank">Event Page</a>
        </div>
      \`;
      $('detailDlg').showModal();
    }

    function renderRadar() {
      if (!$('radar') || $('radar').style.display === 'none' || !window.L) return;
      if (!S.map) {
        S.map = L.map('radar').setView([S.lat, S.lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
      }
      S.markers.forEach(m => m.remove());
      S.markers = [];
      S.events.forEach(e => {
        if (e.lat == null || e.lon == null) return;
        const m = L.marker([e.lat, e.lon]).addTo(S.map)
          .bindPopup(\`<b>\${esc(e.title)}</b><br>\${esc(e.venue)}<br>\${e.distanceMiles != null ? e.distanceMiles.toFixed(1) + ' mi' : ''}\`);
        S.markers.push(m);
      });
      S.map.setView([S.lat, S.lon], 12);
      setTimeout(() => S.map.invalidateSize(), 50);
    }

    // View toggles
    $('viewFeed').onclick = () => { $('viewFeed').classList.add('active'); $('viewRadar').classList.remove('active'); $('feed').style.display = 'block'; $('radar').style.display = 'none'; };
    $('viewRadar').onclick = () => { $('viewRadar').classList.add('active'); $('viewFeed').classList.remove('active'); $('feed').style.display = 'none'; $('radar').style.display = 'block'; renderRadar(); };

    // Preset handlers
    const setPreset = (name, lat, lon) => {
      ['presetDenver', 'presetBoulder', 'presetGolden', 'presetAurora'].forEach(id => $(id)?.classList.remove('active'));
      S.city = name; S.lat = lat; S.lon = lon; loadFeed();
    };
    $('presetDenver').onclick = e => { setPreset('Denver', 39.7392, -104.9903); e.target.classList.add('active'); };
    $('presetBoulder').onclick = e => { setPreset('Boulder', 40.0150, -105.2705); e.target.classList.add('active'); };
    $('presetGolden').onclick = e => { setPreset('Golden', 39.7555, -105.2211); e.target.classList.add('active'); };
    $('presetAurora').onclick = e => { setPreset('Aurora', 39.7294, -104.8319); e.target.classList.add('active'); };

    $('locBtn').onclick = () => {
      navigator.geolocation.getCurrentPosition(p => {
        setPreset('Your Location', p.coords.latitude, p.coords.longitude);
      }, () => {
        alert('Location access denied. Using Denver as default.');
      }, { timeout: 8000 });
    };

    $('closeDetail').onclick = () => $('detailDlg').close();

    initControls();
    loadFeed();
  </script>
</body>
</html>`);
};
