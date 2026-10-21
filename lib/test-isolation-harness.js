/**
 * Isolated Test Fixture & Network Harness for Brinkberry
 *
 * Ensures `npm test` executes deterministically against local fixtures and
 * in-memory service simulators without making external network requests or
 * touching hosted Supabase tables (`canonical_events`, `outbound_clicks`, etc.).
 */

const BASE_FETCH = globalThis.fetch;

function distMiles(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return 9999;
  }
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildColoradoCuratedFixtures(windowStartIso, windowEndIso) {
  const nowMs = Date.now();
  const startMs = windowStartIso ? new Date(windowStartIso).getTime() : nowMs;
  const endMs = windowEndIso ? new Date(windowEndIso).getTime() : (nowMs + 48 * 3600e3);

  const baseMs = (endMs > nowMs + 4 * 3600e3)
    ? (Math.max(startMs, nowMs) + 2 * 3600e3)
    : (startMs + 4 * 3600e3);

  const mkTime = (offsetHours) => {
    const t = Math.min(baseMs + offsetHours * 3600e3, endMs - 1800e3);
    return new Date(t).toISOString();
  };

  return [
    {
      id: 'bb111111-1111-4111-8111-111111111101',
      title: 'Five Points Midnight Jazz Jam and Funk Showcase',
      description: 'Live late-night jazz jam and funk showcase in downtown Denver.',
      venue_name: 'Dazzle Denver',
      venue_address: '1080 14th St, Denver, CO 80202',
      city: 'Denver',
      state: 'CO',
      venue_latitude: 39.7445,
      venue_longitude: -104.9892,
      start_time: mkTime(2),
      end_time: mkTime(5),
      category_tags: ['music', 'jazz', 'concert'],
      indoor_outdoor: 'indoor',
      price_status: 'paid',
      price_min: 20,
      price_display: '$20',
      canonical_url: 'https://www.ticketmaster.com/denver-jazz-jam-101',
      ticketUrl: 'https://www.ticketmaster.com/denver-jazz-jam-101',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111102',
      title: 'Contemporary Colorado Arts & Sculpture Exhibition',
      description: 'Curated contemporary arts and sculpture exhibition at the Denver Art Museum.',
      venue_name: 'Denver Art Museum',
      venue_address: '100 W 14th Ave Pkwy, Denver, CO 80204',
      city: 'Denver',
      state: 'CO',
      venue_latitude: 39.7372,
      venue_longitude: -104.9893,
      start_time: mkTime(3),
      end_time: mkTime(6),
      category_tags: ['arts', 'museum', 'exhibit'],
      indoor_outdoor: 'indoor',
      price_status: 'paid',
      price_min: 18,
      price_display: '$18',
      canonical_url: 'https://denverartmuseum.org/calendar/contemporary-colorado',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111103',
      title: 'Denver Center Stage: Front Range Playwrights Preview',
      description: 'Evening stage performance and theater showcase at DCPA.',
      venue_name: 'Denver Center for the Performing Arts',
      venue_address: '1101 13th St, Denver, CO 80204',
      city: 'Denver',
      state: 'CO',
      venue_latitude: 39.7449,
      venue_longitude: -104.9985,
      start_time: mkTime(4),
      end_time: mkTime(6.5),
      category_tags: ['theater', 'stage', 'play'],
      indoor_outdoor: 'indoor',
      price_status: 'paid',
      price_min: 35,
      price_display: '$35',
      canonical_url: 'https://www.ticketmaster.com/event/dcpa-stage-103',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111104',
      title: 'Civic Center Open-Air Market & Free Community Gathering',
      description: 'Free outdoor community market and live acoustic gathering in Civic Center Park.',
      venue_name: 'Civic Center Park',
      venue_address: '101 14th Ave, Denver, CO 80204',
      city: 'Denver',
      state: 'CO',
      venue_latitude: 39.7392,
      venue_longitude: -104.9888,
      start_time: mkTime(5),
      end_time: mkTime(8),
      category_tags: ['outdoor', 'free'],
      indoor_outdoor: 'outdoor',
      price_status: 'free',
      price_min: 0,
      price_display: 'Free',
      canonical_url: 'https://www.eventbrite.com/e/civic-center-open-air-104',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111105',
      title: 'Flatirons Bluegrass & Indie Roots Showcase',
      description: 'Live bluegrass and acoustic roots concert at Boulder Theater.',
      venue_name: 'Boulder Theater',
      venue_address: '2032 14th St, Boulder, CO 80302',
      city: 'Boulder',
      state: 'CO',
      venue_latitude: 40.0190,
      venue_longitude: -105.2785,
      start_time: mkTime(6),
      end_time: mkTime(9),
      category_tags: ['music', 'bluegrass', 'roots', 'concert'],
      indoor_outdoor: 'indoor',
      price_status: 'paid',
      price_min: 25,
      price_display: '$25',
      canonical_url: 'https://www.ticketmaster.com/event/boulder-bluegrass-105',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111106',
      title: 'Chautauqua Foothills Guided Trail & Open-Air Walk',
      description: 'Outdoor guided nature walk beneath the Boulder Flatirons.',
      venue_name: 'Chautauqua Park',
      venue_address: 'Baseline Rd & 9th St, Boulder, CO 80302',
      city: 'Boulder',
      state: 'CO',
      venue_latitude: 40.0005,
      venue_longitude: -105.2805,
      start_time: mkTime(7),
      end_time: mkTime(9.5),
      category_tags: ['outdoor', 'free'],
      indoor_outdoor: 'outdoor',
      price_status: 'free',
      price_min: 0,
      price_display: 'Free',
      canonical_url: 'https://www.eventbrite.com/e/chautauqua-trail-106',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111107',
      title: 'Red Rocks Sunset Acoustic & Foothills Outdoor Session',
      description: 'Open-air amphitheatre concert and foothills music session.',
      venue_name: 'Red Rocks Amphitheatre',
      venue_address: '18300 W Alameda Pkwy, Morrison, CO 80465',
      city: 'Golden',
      state: 'CO',
      venue_latitude: 39.6654,
      venue_longitude: -105.2057,
      start_time: mkTime(8),
      end_time: mkTime(11),
      category_tags: ['music', 'acoustic', 'outdoor', 'concert'],
      indoor_outdoor: 'outdoor',
      price_status: 'paid',
      price_min: 45,
      price_display: '$45',
      canonical_url: 'https://redrocksonline.com/events/sunset-acoustic-107',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    },
    {
      id: 'bb111111-1111-4111-8111-111111111108',
      title: 'Stanley Marketplace Free Open-Air Cultural Festival & Music',
      description: 'Free community festival, live music, and local artisans in Aurora.',
      venue_name: 'Stanley Marketplace',
      venue_address: '2501 Dallas St, Aurora, CO 80010',
      city: 'Aurora',
      state: 'CO',
      venue_latitude: 39.7525,
      venue_longitude: -104.8765,
      start_time: mkTime(9),
      end_time: mkTime(12),
      category_tags: ['music', 'arts', 'outdoor', 'free'],
      indoor_outdoor: 'outdoor',
      price_status: 'free',
      price_min: 0,
      price_display: 'Free',
      canonical_url: 'https://www.eventbrite.com/e/stanley-marketplace-108',
      source: 'curated',
      confirmation_status: 'confirmed_by_official_calendar'
    }
  ];
}

function getTodayUtcStartMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function buildSeatEngineVenueHtml({ venueName, baseUrl, count, lat, lon, city, state, specialFirst }) {
  const todayUtcMs = getTodayUtcStartMs();
  const events = [];
  for (let i = 0; i < count; i++) {
    const showId = 600000 + i;
    const dayOffset = 1 + Math.floor(i / 2);
    const hourUtc = i % 2 === 0 ? 1 : 3;
    const minUtc = i % 2 === 0 ? 0 : 30;
    let startDate = new Date(todayUtcMs + dayOffset * 86400e3 + hourUtc * 3600e3 + minUtc * 60e3).toISOString();
    let name = `${venueName} Showcase #${i + 1}`;
    if (i === 0 && specialFirst) {
      name = specialFirst.name;
      startDate = specialFirst.startDate;
    }
    events.push({
      '@context': 'https://schema.org',
      '@type': 'ComedyEvent',
      '@id': `${baseUrl}/shows/${showId}`,
      name,
      startDate,
      url: `${baseUrl}/shows/${showId}`,
      location: {
        '@type': 'ComedyClub',
        name: venueName,
        address: { addressLocality: city, addressRegion: state },
        geo: { latitude: lat, longitude: lon }
      },
      offers: {
        '@type': 'Offer',
        price: '25',
        url: `${baseUrl}/shows/${showId}`
      }
    });
  }
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(events)}</script></head><body>${venueName}</body></html>`;
}

const STARDOME_FIXTURE_HTML = () => buildSeatEngineVenueHtml({
  venueName: 'Stardome Comedy Club',
  baseUrl: 'https://www.stardome.com',
  count: 136,
  lat: 33.3752,
  lon: -86.8122,
  city: 'Birmingham',
  state: 'AL',
  specialFirst: {
    name: 'Tee Sanders',
    startDate: '2026-12-14T02:00:00.000Z' // 2026-12-13 20:00 America/Chicago
  }
});

const COMEDY_ZONE_FIXTURE_HTML = () => buildSeatEngineVenueHtml({
  venueName: 'The Comedy Zone Charlotte',
  baseUrl: 'https://www.cltcomedyzone.com',
  count: 161,
  lat: 35.2407,
  lon: -80.8491,
  city: 'Charlotte',
  state: 'NC'
});

const ACME_FIXTURE_HTML = () => buildSeatEngineVenueHtml({
  venueName: 'Acme Comedy Company',
  baseUrl: 'https://acmecomedy.seatengine.com',
  count: 107,
  lat: 44.9877,
  lon: -93.2721,
  city: 'Minneapolis',
  state: 'MN',
  specialFirst: {
    name: 'Mary Mack',
    startDate: '2026-09-24T01:00:00Z' // 2026-09-23 20:00 America/Chicago
  }
});

function buildPunchlineIcsFixture() {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Punchline Comedy Club//NONSGML v1.0//EN'
  ];
  const baseDayMs = getTodayUtcStartMs() + 2 * 86400e3;
  const toIcsUtc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  // Include a multi-showtime same-day headliner (2 shows on the same evening in America/New_York)
  const sameDayEarly = baseDayMs + 23 * 3600e3 + 30 * 60e3; // 18:30 EST
  const sameDayLate = baseDayMs + 26 * 3600e3; // 21:00 EST
  lines.push(
    'BEGIN:VEVENT',
    'UID:punchline-headliner-multi-1',
    `DTSTART:${toIcsUtc(sameDayEarly)}`,
    `DTEND:${toIcsUtc(sameDayEarly + 5400e3)}`,
    'SUMMARY:Mark Normand Weekend Special',
    'LOCATION:The Punchline Comedy Club',
    'URL:https://www.punchline.com/shows/mark-normand-early',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:punchline-headliner-multi-2',
    `DTSTART:${toIcsUtc(sameDayLate)}`,
    `DTEND:${toIcsUtc(sameDayLate + 5400e3)}`,
    'SUMMARY:Mark Normand Weekend Special',
    'LOCATION:The Punchline Comedy Club',
    'URL:https://www.punchline.com/shows/mark-normand-late',
    'END:VEVENT'
  );

  for (let i = 0; i < 10; i++) {
    const startMs = baseDayMs + (i + 1) * 86400e3 + 24 * 3600e3; // 19:00 EST
    lines.push(
      'BEGIN:VEVENT',
      `UID:punchline-fixture-${i + 1}`,
      `DTSTART:${toIcsUtc(startMs)}`,
      `DTEND:${toIcsUtc(startMs + 5400e3)}`,
      `SUMMARY:Atlanta Headliner Night #${i + 1}`,
      'LOCATION:The Punchline Comedy Club',
      `URL:https://www.punchline.com/shows/atlanta-headliner-${i + 1}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function buildLaughingSkullHtmlFixture() {
  const events = [];
  const baseDayMs = getTodayUtcStartMs() + 2 * 86400e3;
  for (let i = 0; i < 24; i++) {
    const startMs = baseDayMs + i * 43200e3 + 24 * 3600e3;
    const startDate = new Date(startMs).toISOString();
    events.push({
      '@context': 'https://schema.org',
      '@type': 'ComedyEvent',
      '@id': `https://laughingskulllounge.com/shows/skull-${i + 1}`,
      name: `Best of Atlanta Comedy Showcase #${i + 1}`,
      startDate,
      url: `https://laughingskulllounge.com/shows/skull-${i + 1}`,
      location: {
        '@type': 'ComedyClub',
        name: 'Laughing Skull Lounge',
        address: { addressLocality: 'Atlanta', addressRegion: 'GA' },
        geo: { latitude: 33.7788, longitude: -84.3853 }
      },
      offers: {
        '@type': 'Offer',
        price: '20',
        url: `https://laughingskulllounge.com/shows/skull-${i + 1}`
      }
    });
  }
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(events)}</script></head><body>Laughing Skull Lounge</body></html>`;
}

function createResponse(status, bodyData, headers = {}) {
  const isString = typeof bodyData === 'string';
  const textBody = isString ? bodyData : JSON.stringify(bodyData);
  const headerMap = new Map(
    Object.entries({
      'content-type': isString ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
      ...headers
    }).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) || null;
      }
    },
    text: async () => textBody,
    json: async () => (isString ? JSON.parse(textBody) : bodyData)
  };
}

function extractHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name.toLowerCase()) return String(v);
  }
  return '';
}

async function isolatedTestFetch(input, init = {}) {
  const urlStr = typeof input === 'string' ? input : (input?.url || String(input));
  const method = String(init.method || input?.method || 'GET').toUpperCase();

  if (urlStr.startsWith('http://127.0.0.1') || urlStr.startsWith('http://localhost')) {
    return BASE_FETCH(input, init);
  }

  // 1. Hosted Supabase REST & RPC isolation
  if (urlStr.includes('.supabase.co/rest/v1/')) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const apiKey = extractHeader(init.headers, 'apikey');
    const authHeader = extractHeader(init.headers, 'authorization').replace(/^Bearer\s+/i, '').trim();
    const isServiceRole = Boolean(serviceRoleKey && (apiKey === serviceRoleKey || authHeader === serviceRoleKey));

    if (urlStr.includes('/rest/v1/rpc/bb_get_feed_events_v2')) {
      let payload = {};
      try { payload = init.body ? JSON.parse(init.body) : {}; } catch (_) {}
      const userLat = Number(payload.p_user_lat);
      const userLng = Number(payload.p_user_lng);
      const radiusMiles = Number(payload.p_radius_miles) || 25;
      const mode = payload.p_mode || null;

      if (mode === 'kids') {
        return createResponse(200, []);
      }

      const fixtures = buildColoradoCuratedFixtures(payload.p_window_start, payload.p_window_end);
      const startBoundMs = payload.p_window_start ? new Date(payload.p_window_start).getTime() : -Infinity;
      const endBoundMs = payload.p_window_end ? new Date(payload.p_window_end).getTime() : Infinity;
      const matched = [];
      for (const ev of fixtures) {
        const evStartMs = new Date(ev.start_time).getTime();
        if (evStartMs < startBoundMs || evStartMs > endBoundMs) continue;
        const d = distMiles(userLat, userLng, ev.venue_latitude, ev.venue_longitude);
        if (d <= radiusMiles) {
          matched.push({
            ...ev,
            distance_miles: Math.round(d * 100) / 100
          });
        }
      }
      return createResponse(200, matched);
    }

    if (urlStr.includes('/rest/v1/rpc/bb_get_public_event')) {
      let payload = {};
      try { payload = init.body ? JSON.parse(init.body) : {}; } catch (_) {}
      const fixtures = buildColoradoCuratedFixtures();
      const found = fixtures.find(e => e.id === payload.p_id);
      return createResponse(200, found ? [found] : []);
    }

    if (urlStr.includes('/rest/v1/canonical_events')) {
      if (method !== 'GET' && !isServiceRole) {
        return createResponse(401, {
          code: '42501',
          message: 'new row violates row-level security policy for table "canonical_events"'
        });
      }
      return createResponse(200, []);
    }

    if (urlStr.includes('/rest/v1/outbound_clicks')) {
      if (!isServiceRole) {
        return createResponse(401, {
          code: '42501',
          message: 'permission denied for table outbound_clicks'
        });
      }
      return createResponse(method === 'POST' ? 201 : 200, []);
    }

    if (urlStr.includes('/rest/v1/community_events')) {
      if (!apiKey && !authHeader) {
        return createResponse(401, {
          code: '42501',
          message: 'missing authentication credentials for table community_events'
        });
      }
      const communityEventsRows =
        globalThis.__BB_TEST_COMMUNITY_EVENTS__ instanceof Map
          ? globalThis.__BB_TEST_COMMUNITY_EVENTS__
          : (globalThis.__BB_TEST_COMMUNITY_EVENTS__ = new Map());

      if (method === 'POST') {
        let parsed = null;
        try {
          parsed = init.body ? JSON.parse(init.body) : null;
        } catch (_) {
          return createResponse(400, { message: 'invalid JSON body' });
        }
        const items = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        if (items.length === 0) {
          return createResponse(400, { message: 'empty community_events payload' });
        }
        for (const item of items) {
          if (!item || !item.id || !item.title || !item.start_time || !item.category) {
            return createResponse(400, { message: 'missing required community_events columns' });
          }
          const idKey = String(item.id);
          const prev = communityEventsRows.get(idKey) || {};
          communityEventsRows.set(idKey, { ...prev, ...item });
        }
        return createResponse(201, items);
      }

      if (method === 'GET') {
        const parsedUrl = new URL(urlStr);
        const sp = parsedUrl.searchParams;
        let rows = Array.from(communityEventsRows.values());

        const idFilter = sp.get('id');
        if (idFilter && idFilter.startsWith('eq.')) {
          const targetId = idFilter.slice(3);
          rows = rows.filter(r => String(r.id) === targetId);
        }

        const catFilter = sp.get('category');
        if (catFilter === 'eq.tombstone') {
          rows = rows.filter(r => r.category === 'tombstone');
        } else if (catFilter === 'neq.tombstone') {
          rows = rows.filter(r => r.category !== 'tombstone');
        }

        const activeFilter = sp.get('active');
        if (activeFilter === 'eq.true') {
          rows = rows.filter(r => r.active === true);
        } else if (activeFilter === 'eq.false') {
          rows = rows.filter(r => r.active === false);
        }

        if (sp.get('order') === 'start_time.asc') {
          rows.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        }

        if (sp.get('select') === 'id') {
          rows = rows.map(r => ({ id: r.id }));
        }

        return createResponse(200, rows);
      }

      throw new Error(`[test-isolation-harness] Unsupported method for community_events: ${method} ${urlStr}`);
    }

    throw new Error(`[test-isolation-harness] Unhandled Supabase request in isolated test mode: ${method} ${urlStr}`);
  }

  // 2. Ticket URL resolution & SeatEngine / Atlanta / Comedy Works venue feeds
  if (urlStr.includes('comedyworks.com/shows/calendar')) {
    const parsedUrl = new URL(urlStr);
    const m = Number(parsedUrl.searchParams.get('month')) || 10;
    const y = Number(parsedUrl.searchParams.get('year')) || 2026;
    const cells = [];
    for (let day = 1; day <= 15; day++) {
      cells.push(
        `<td>` +
        `<div class="calendar-daynum">${day}</div>` +
        `<div class="calendar-event-content">` +
        `<h4 class="calendar-event-title"><a href="/comedians/downtown-headliner-${m}-${day}">Downtown Headliner ${m}-${day}</a></h4>` +
        `<p class="calendar-event-location">Downtown in Larimer Square</p>` +
        `</div>` +
        `<div class="calendar-event-content">` +
        `<h4 class="calendar-event-title"><a href="/comedians/south-headliner-${m}-${day}">South Headliner ${m}-${day}</a></h4>` +
        `<p class="calendar-event-location">South at the Landmark</p>` +
        `</div>` +
        `</td>`
      );
    }
    return createResponse(200, `<!doctype html><html><body><table><tr>${cells.join('')}</tr></table></body></html>`);
  }

  if (urlStr.includes('router.project-osrm.org/route/v1/driving/')) {
    const coordMatch = urlStr.match(/\/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    if (!coordMatch) {
      return createResponse(400, { code: 'InvalidQuery' });
    }
    const [, fromLon, fromLat, toLon, toLat] = coordMatch.map(Number);
    const dMiles = distMiles(fromLat, fromLon, toLat, toLon);
    if (!Number.isFinite(dMiles) || dMiles > 1000) {
      return createResponse(200, { code: 'NoRoute', routes: [] });
    }
    const distanceMeters = Math.round(dMiles * 1609.344 * 1.18);
    const durationSeconds = Math.round(dMiles * 1.18 * 80);
    return createResponse(200, {
      code: 'Ok',
      routes: [{ distance: distanceMeters, duration: durationSeconds }]
    });
  }

  if (urlStr.includes('stardome.com/shows/') || urlStr.includes('cltcomedyzone.com/shows/') || urlStr.includes('acmecomedy.seatengine.com/shows/')) {
    const filler = 'Official SeatEngine Box Office Checkout · Select Seats & Admission Tickets · '.repeat(25);
    const html = `<!doctype html><html><head><title>Official Ticket Checkout</title></head><body><main class="seatengine-checkout"><h1>Select Tickets &amp; Seats</h1><p>${filler}</p><button>Continue to Checkout Cart</button></main></body></html>`;
    return createResponse(200, html);
  }

  if (urlStr.includes('stardome.com')) {
    return createResponse(200, STARDOME_FIXTURE_HTML());
  }

  if (urlStr.includes('cltcomedyzone.com')) {
    return createResponse(200, COMEDY_ZONE_FIXTURE_HTML());
  }

  if (urlStr.includes('acmecomedy.seatengine.com') || urlStr.includes('acmecomedycompany.com')) {
    return createResponse(200, ACME_FIXTURE_HTML());
  }

  if (urlStr.includes('punchline.com')) {
    return createResponse(200, buildPunchlineIcsFixture(), { 'content-type': 'text/calendar; charset=utf-8' });
  }

  if (urlStr.includes('laughingskulllounge.com')) {
    return createResponse(200, buildLaughingSkullHtmlFixture());
  }

  // 3. Weather APIs (NWS & Open-Meteo)
  if (urlStr.includes('api.weather.gov/points/')) {
    const match = urlStr.match(/\/points\/([-\d.]+),([-\d.]+)/);
    const lat = match ? Number(match[1]) : 39.7392;
    const lng = match ? Number(match[2]) : -104.9903;
    let city = 'Denver';
    let state = 'CO';
    if (Math.abs(lat - 41.2565) < 1 && Math.abs(lng - (-95.9345)) < 1) {
      city = 'Omaha';
      state = 'NE';
    } else if (Math.abs(lat - 44.8113) < 1 && Math.abs(lng - (-91.4985)) < 1) {
      city = 'Eau Claire';
      state = 'WI';
    }
    return createResponse(200, {
      properties: {
        forecastHourly: 'https://api.weather.gov/gridpoints/BOU/62,61/forecast/hourly',
        relativeLocation: {
          properties: { city, state }
        }
      }
    });
  }

  if (urlStr.includes('api.weather.gov/gridpoints/')) {
    return createResponse(200, {
      properties: {
        periods: [
          { temperature: 68, temperatureUnit: 'F', shortForecast: 'Mostly Clear', probabilityOfPrecipitation: { value: 5 } },
          { temperature: 65, temperatureUnit: 'F', shortForecast: 'Clear', probabilityOfPrecipitation: { value: 10 } },
          { temperature: 63, temperatureUnit: 'F', shortForecast: 'Clear', probabilityOfPrecipitation: { value: 5 } }
        ]
      }
    });
  }

  if (urlStr.includes('api.open-meteo.com/v1/forecast')) {
    return createResponse(200, {
      current: {
        temperature_2m: 62,
        weather_code: 1
      },
      hourly: {
        precipitation_probability: [10, 15, 10, 5]
      }
    });
  }

  // 4. Paris Open Data catalog
  if (urlStr.includes('opendata.paris.fr/')) {
    const now = Date.now();
    return createResponse(200, {
      total_count: 2,
      results: [
        {
          id: 'pod_iso_1001',
          title: 'Concert Jazz au Duc des Lombards',
          lead_text: 'Soirée jazz live au cœur de Paris.',
          date_start: new Date(now + 4 * 3600e3).toISOString(),
          date_end: new Date(now + 7 * 3600e3).toISOString(),
          address_name: 'Duc des Lombards',
          address_street: '42 Rue des Lombards',
          address_city: 'Paris',
          address_zipcode: '75001',
          price_type: 'payant',
          price_detail: '28€',
          tags: ['musique', 'jazz', 'concert'],
          lat_lon: { lat: 48.8598, lon: 2.3482 },
          url: 'https://www.paris.fr/evenements/concert-jazz-1001'
        },
        {
          id: 'pod_iso_1002',
          title: 'Exposition Nocturne au Marais',
          lead_text: 'Vernissage et parcours artistique contemporain.',
          date_start: new Date(now + 6 * 3600e3).toISOString(),
          date_end: new Date(now + 9 * 3600e3).toISOString(),
          address_name: 'Carreau du Temple',
          address_street: '4 Rue Eugène Spuller',
          address_city: 'Paris',
          address_zipcode: '75003',
          price_type: 'gratuit',
          price_detail: 'Gratuit',
          tags: ['art', 'exposition', 'culture'],
          lat_lon: { lat: 48.8643, lon: 2.3624 },
          url: 'https://www.paris.fr/evenements/exposition-marais-1002'
        }
      ]
    });
  }

  // 5. Eventbrite organizer API & pioneer schedule probes
  if (urlStr.includes('eventbriteapi.com/v3/organizers/')) {
    return createResponse(200, { events: [], pagination: { has_more_items: false } });
  }

  if (urlStr.includes('volusiaspeedwaypark.com/schedule') || urlStr.includes('thestandnyc.com/shows')) {
    return createResponse(200, '<!doctype html><html><body></body></html>');
  }

  // 6. Synthetic venue-intake test domains (mkecomedy.com, secretbasementcomedy.com, privacycomedy.com, club1..5.com)
  if (/^https?:\/\/(www\.)?(mkecomedy|secretbasementcomedy|privacycomedy|club[1-5])\.com(\/|$)/i.test(urlStr)) {
    if (urlStr.endsWith('/robots.txt')) {
      return createResponse(200, 'User-agent: *\nAllow: /\n', { 'content-type': 'text/plain; charset=utf-8' });
    }
    return createResponse(200, '<!doctype html><html><body><h1>Official Venue Calendar</h1></body></html>');
  }

  // 7. Community calendar feeds (serve deterministic fallbackIcs from community-registry)
  try {
    const { COMMUNITY_FEEDS } = require('./providers/community-registry');
    const matchedFeed = COMMUNITY_FEEDS.find(f => f.feedUrl === urlStr);
    if (matchedFeed) {
      if (matchedFeed.fallbackIcs) {
        return createResponse(200, matchedFeed.fallbackIcs, { 'content-type': 'text/calendar; charset=utf-8' });
      }
      return createResponse(503, 'Community feed offline in isolated test harness');
    }
  } catch (_) {}

  throw new Error(`Unrecognized external request in isolated test harness: ${method} ${urlStr}`);
}

function installIsolatedTestHarness() {
  if (process.env.BRINKBERRY_LIVE_NETWORK === 'true') {
    return;
  }
  if (!globalThis.__brinkberryIsolatedFetchInstalled) {
    globalThis.fetch = isolatedTestFetch;
    globalThis.__brinkberryIsolatedFetchInstalled = true;
  }
}

if (process.env.NODE_TEST_CONTEXT && process.env.BRINKBERRY_LIVE_NETWORK !== 'true') {
  installIsolatedTestHarness();
}

module.exports = {
  installIsolatedTestHarness,
  isolatedTestFetch
};
