const fs = require('fs');
const path = require('path');
const { isValidTicketUrl, ALLOWED_TICKET_HOSTS } = require('../lib/affiliate');

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';

const MONITORING_DIR = path.join(__dirname, '..', 'monitoring');
const SNAPSHOT_FILE = path.join(MONITORING_DIR, 'snapshot.json');
const TELEMETRY_FILE = path.join(MONITORING_DIR, 'telemetry.jsonl');
const HEALTH_LOG_FILE = path.join(MONITORING_DIR, 'health_log.md');

if (!fs.existsSync(MONITORING_DIR)) {
  fs.mkdirSync(MONITORING_DIR, { recursive: true });
}

async function fetchWithTiming(url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const durationMs = Date.now() - start;
    return { ok: res.ok, status: res.status, durationMs, res };
  } catch (err) {
    const durationMs = Date.now() - start;
    return { ok: false, status: 0, durationMs, error: err.message };
  }
}

async function runHealthCheck() {
  const now = new Date();
  const nowMs = now.getTime();
  const max48Ms = nowMs + 48 * 3600 * 1000;
  const timestamp = now.toISOString();

  const defects = [];
  const results = {
    timestamp,
    feed: {},
    landingPages: {},
    sitemap: {},
    events: {
      total: 0,
      expiringSoon: 0,
      newlyAppeared: [],
      expiredSinceLast: []
    },
    sources: {
      total: 0,
      active: 0,
      staleOrFailed: []
    },
    ticketSafety: {
      checked: 0,
      valid: 0,
      invalid: []
    },
    boundaryViolations: []
  };

  // 1. Check Feed Endpoint & Latency
  const feedUrl = `${ORIGIN}/api/feed?lat=39.7392&lng=-104.9903&radius=50&window=48h`;
  const feedFetch = await fetchWithTiming(feedUrl);
  results.feed = {
    status: feedFetch.status,
    latencyMs: feedFetch.durationMs
  };

  let feedEvents = [];
  if (feedFetch.ok) {
    try {
      const feedData = await feedFetch.res.json();
      feedEvents = feedData.events || [];
    } catch (e) {
      defects.push(`Feed JSON parse failure: ${e.message}`);
    }
  } else {
    defects.push(`Feed returned non-200 status: ${feedFetch.status} (${feedFetch.error || 'unknown error'})`);
  }

  results.events.total = feedEvents.length;

  // 2. Validate Rolling 48-Hour Boundary & Ticket Links on Feed Events
  const currentEventIds = new Set();

  for (const e of feedEvents) {
    currentEventIds.add(e.id);
    const startMs = new Date(e.start).getTime();

    // Boundary check with 2-minute clock skew tolerance
    if (startMs < nowMs - 120000) {
      const msg = `Feed contains past event: "${e.title}" (id: ${e.id}, start: ${e.start})`;
      defects.push(msg);
      results.boundaryViolations.push(msg);
    } else if (startMs > max48Ms + 120000) {
      const msg = `Feed contains event beyond 48h: "${e.title}" (id: ${e.id}, start: ${e.start})`;
      defects.push(msg);
      results.boundaryViolations.push(msg);
    }

    // Expiring within the next 2 hours
    if (startMs >= nowMs && startMs <= nowMs + 2 * 3600 * 1000) {
      results.events.expiringSoon++;
    }

    // Ticket Link & Allowlist validation
    results.ticketSafety.checked++;
    if (isValidTicketUrl(e.ticketUrl)) {
      results.ticketSafety.valid++;
    } else {
      const msg = `Invalid or unapproved ticket URL: "${e.ticketUrl}" on event "${e.title}" (id: ${e.id})`;
      defects.push(msg);
      results.ticketSafety.invalid.push({ id: e.id, title: e.title, url: e.ticketUrl });
    }
  }

  // 3. Snapshot Diffing (Newly Appeared vs Expired Events)
  let previousSnapshot = { eventIds: [], timestamp: null };
  if (fs.existsSync(SNAPSHOT_FILE)) {
    try {
      previousSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    } catch (_) {}
  }

  const prevSet = new Set(previousSnapshot.eventIds || []);
  for (const id of currentEventIds) {
    if (!prevSet.has(id)) {
      const ev = feedEvents.find(e => e.id === id);
      results.events.newlyAppeared.push({ id, title: ev?.title, start: ev?.start });
    }
  }

  for (const prevId of prevSet) {
    if (!currentEventIds.has(prevId)) {
      results.events.expiredSinceLast.push(prevId);
    }
  }

  // Save updated snapshot
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({
    timestamp,
    eventIds: Array.from(currentEventIds)
  }, null, 2), 'utf8');

  // 4. Check Sitemap.xml
  const sitemapFetch = await fetchWithTiming(`${ORIGIN}/sitemap.xml`);
  results.sitemap = {
    status: sitemapFetch.status,
    latencyMs: sitemapFetch.durationMs,
    urlCount: 0
  };

  if (sitemapFetch.ok) {
    try {
      const sitemapXml = await sitemapFetch.res.text();
      const locMatches = sitemapXml.match(/<loc>(.*?)<\/loc>/g) || [];
      results.sitemap.urlCount = locMatches.length;

      // Ensure sitemap strictly references sitemap.org schema
      if (!sitemapXml.includes('<urlset')) {
        defects.push('sitemap.xml is missing <urlset> root tag');
      }
    } catch (err) {
      defects.push(`sitemap.xml parse error: ${err.message}`);
    }
  } else {
    defects.push(`sitemap.xml returned HTTP ${sitemapFetch.status}`);
  }

  // 5. Check Representative City/Topic Landing Pages
  const landingPagesToCheck = [
    '/denver/next-48-hours',
    '/denver/music',
    '/denver/arts',
    '/denver/theater',
    '/denver/free',
    '/denver/outdoor',
    '/boulder/music',
    '/golden/outdoor',
    '/aurora/theater'
  ];

  for (const pagePath of landingPagesToCheck) {
    const pageFetch = await fetchWithTiming(`${ORIGIN}${pagePath}`);
    results.landingPages[pagePath] = {
      status: pageFetch.status,
      latencyMs: pageFetch.durationMs
    };
    if (!pageFetch.ok) {
      defects.push(`Landing page ${pagePath} returned HTTP ${pageFetch.status}`);
    }
  }

  // 6. Check Ingestion Sources & Sync Health in Database
  try {
    const sourcesRes = await fetch(`${SUPABASE_URL}/rest/v1/ingestion_sources?select=id,name,source_type,is_active,last_successful_fetch_at,last_error_message&order=name.asc`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` }
    });
    if (sourcesRes.ok) {
      const sources = await sourcesRes.json();
      results.sources.total = sources.length;
      results.sources.active = sources.filter(s => s.is_active).length;
      for (const s of sources) {
        if (!s.is_active || s.last_error_message) {
          results.sources.staleOrFailed.push({
            name: s.name,
            isActive: s.is_active,
            lastSuccess: s.last_successful_fetch_at,
            lastError: s.last_error_message
          });
        }
      }
    }
  } catch (err) {
    console.error('Error checking ingestion sources:', err.message);
  }

  // 7. Write Telemetry & Health Log
  const telemetryLine = JSON.stringify({
    timestamp,
    status: defects.length === 0 ? 'HEALTHY' : 'DEFECT',
    defectsCount: defects.length,
    feedStatus: results.feed.status,
    feedLatencyMs: results.feed.latencyMs,
    qualifyingEvents: results.events.total,
    expiringSoon: results.events.expiringSoon,
    newlyAppearedCount: results.events.newlyAppeared.length,
    expiredCount: results.events.expiredSinceLast.length,
    validTickets: `${results.ticketSafety.valid}/${results.ticketSafety.checked}`,
    sitemapUrls: results.sitemap.urlCount
  }) + '\n';

  fs.appendFileSync(TELEMETRY_FILE, telemetryLine, 'utf8');

  // Format Markdown Health Summary
  const mdSummary = `
## ⏱️ Health Check Snapshot: ${timestamp}
- **Status**: ${defects.length === 0 ? '✅ **HEALTHY**' : '❌ **DEFECTS DETECTED**'}
- **Feed Latency**: ${results.feed.latencyMs}ms (HTTP ${results.feed.status})
- **Active 48h Qualifying Events**: **${results.events.total} events**
- **Expiring Within 2h**: ${results.events.expiringSoon}
- **Newly Appeared Events**: ${results.events.newlyAppeared.length}
- **Expired Since Last Check**: ${results.events.expiredSinceLast.length}
- **Ticket Links Allowlisted**: ${results.ticketSafety.valid} / ${results.ticketSafety.checked} (${results.ticketSafety.invalid.length === 0 ? '100% compliant' : 'VIOLATION'})
- **Sitemap URLs**: ${results.sitemap.urlCount} active URLs
- **Sources**: ${results.sources.active}/${results.sources.total} active
${defects.length > 0 ? `\n### ⚠️ Defects Found:\n${defects.map(d => `- ${d}`).join('\n')}` : ''}
---
`;

  fs.appendFileSync(HEALTH_LOG_FILE, mdSummary, 'utf8');

  // Output to console
  console.log(`[${timestamp}] Health Check: ${defects.length === 0 ? 'HEALTHY' : 'DEFECT'} | ${results.events.total} events | Feed: ${results.feed.latencyMs}ms | Tickets: ${results.ticketSafety.valid}/${results.ticketSafety.checked}`);
  if (defects.length > 0) {
    console.error('Defects detected:', defects);
    process.exit(1);
  }
}

if (require.main === module) {
  runHealthCheck().catch(err => {
    console.error('Fatal health check error:', err);
    process.exit(1);
  });
}

module.exports = { runHealthCheck };
