const { buildSafeAffiliateUrl, isValidTicketUrl } = require('../lib/affiliate');
const { getComedyShowById } = require('../lib/comedy/registry');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

async function getEvent(id) {
  if (!id) return null;
  if (typeof id === 'string' && id.startsWith('comedy_')) {
    return getComedyShowById(id);
  }
  if (typeof id === 'string' && id.startsWith('race_')) {
    const { getAllScheduledRaces } = require('../lib/racing/registry');
    return getAllScheduledRaces().find(r => r.id === id) || null;
  }
  if (typeof id === 'string' && id.startsWith('comm_post_')) {
    try {
      const { fetchCommunityPostById } = require('../lib/community-posts/community-posts');
      const post = await fetchCommunityPostById(id);
      return post || null;
    } catch (err) {
      console.error('[Event] getCommunityPostById error:', err);
      return null;
    }
  }
  if (typeof id === 'string' && id.startsWith('comm_')) {
    try {
      const { COMMUNITY_FEEDS } = require('../lib/providers/community-registry');
      const { fetchCommunityFeedEvents } = require('../lib/providers/community-ics');
      const feed = COMMUNITY_FEEDS.find(f => id.startsWith(`comm_${f.id}_`));
      if (feed) {
        const res = await fetchCommunityFeedEvents(feed, {
          useFallback: true,
          windowStart: new Date(Date.now() - 7 * 86400e3).toISOString(),
          windowEnd: new Date(Date.now() + 7 * 86400e3).toISOString()
        });
        const ev = (res.events || []).find(e => e.id === id);
        if (ev) return ev;
      }
    } catch (_) {}
  }
  if (typeof id === 'string' && id.startsWith('ingest_')) {
    const { OFFICIAL_SOURCES, ingestSource } = require('../lib/ingestion/engine');
    const matchedSource = OFFICIAL_SOURCES.find(s => id.startsWith(`ingest_${s.id}_`));
    if (matchedSource) {
      const rep = await ingestSource(matchedSource);
      const ev = rep.events.find(e => e.id === id);
      if (ev) return ev;
    }
  }
  if (typeof id === 'string' && (id.startsWith('atl_') || id.includes('punchline') || id.includes('laughing-skull'))) {
    try {
      const { getAtlantaCanonicalShows } = require('../lib/comedy/atlanta-ingestion');
      const shows = await getAtlantaCanonicalShows({ includePast: true });
      const found = shows.find(s => s.id === id || s.slug === id || s.fingerprint === id);
      if (found) return found;
    } catch (_) {}
  }
  if (typeof id === 'string' && (id.startsWith('bhm_') || id.startsWith('clt_') || id.includes('stardome') || id.includes('comedy-zone'))) {
    try {
      const { ingestStardome, ingestComedyZone } = require('../lib/comedy/expansion-ingestion');
      if (id.startsWith('bhm_') || id.includes('stardome')) {
        const rep = await ingestStardome();
        const found = rep.events.find(s => s.id === id || s.slug === id || s.fingerprint === id);
        if (found) return found;
      }
      if (id.startsWith('clt_') || id.includes('comedy-zone')) {
        const rep = await ingestComedyZone();
        const found = rep.events.find(s => s.id === id || s.slug === id || s.fingerprint === id);
        if (found) return found;
      }
    } catch (_) {}
  }
  try {
    const { defaultCanonicalStorage } = require('../lib/storage/canonical-event-storage');
    if (defaultCanonicalStorage) {
      const byId = await defaultCanonicalStorage.getEventById(id);
      if (byId) return byId;
      const all = await defaultCanonicalStorage.queryEvents({ windowStart: '1970-01-01', windowEnd: '2099-01-01' });
      const found = all.find(e => e.id === id || e.slug === id || e.fingerprint === id);
      if (found) return found;
    }
  } catch (_) {}
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bb_get_public_event`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ p_id: id })
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

module.exports = async (req, res) => {
  try {
    const id = req.query?.id;
    if (!id) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(400).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Event ID required</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    const e = await getEvent(id);
    const nowMs = Date.now();
    const startTime = e?.start_time ? new Date(e.start_time).getTime() : null;
    // Brinkberry strictly presents events in the active rolling planning window or verified master schedule
    if (!e || (startTime != null && (startTime < (nowMs - 24 * 3600e3) || startTime > (nowMs + 180 * 86400e3)))) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Event Not Found</h1><p style="color:#90869e">This event is not in the active planning window or is no longer listed.</p><p><a href="/" style="color:#ffb86b;font-weight:bold;text-decoration:none">← Find what’s happening right now</a></p></body></html>');
    }

    const price = e.price_status === 'free' ? 'Free' : (e.price_display || 'Check tickets');
    const startObj = e.start_time ? new Date(e.start_time) : null;
    const timeZone = e.timezone || 'America/Denver';
    const when = startObj ? startObj.toLocaleString('en-US', {
      timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }) : (e.gateTime ? `Gates ${e.gateTime} · Green Flag ${e.greenFlagTime || 'TBA'}` : 'Official Schedule');
    const desc = [e.venue_name, e.city, price, when].filter(Boolean).join(' · ');
    const og = `${ORIGIN}/card/${e.id}/svg`;
    const safeTarget = e.ticket_url || e.ticketUrl || e.detailsUrl || buildSafeAffiliateUrl(e.source || 'custom', e.canonical_url, e.id);
    const clickUrl = `/api/click?url=${encodeURIComponent(safeTarget)}&eventId=${encodeURIComponent(e.id)}&surface=event_page`;
    const isOfficial = e.confirmationStatus === 'confirmed_by_official_calendar';
    const isCommunityPost = e.source === 'community_post' || e.isCommunityPost === true;
    let btnLabel = isOfficial ? `Official Box Office (${price}) →` : 'Get Tickets & Event Details →';
    if (isCommunityPost) {
      btnLabel = safeTarget ? 'Visit Event Link →' : 'Free / Community Gathering';
    }

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: e.title,
      description: e.description || desc,
      startDate: e.start_time,
      endDate: e.end_time || undefined,
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: e.venue_name,
        address: {
          '@type': 'PostalAddress',
          addressLocality: e.city || 'Denver',
          addressRegion: e.state || 'CO',
          addressCountry: 'US'
        }
      },
      offers: {
        '@type': 'Offer',
        price: e.price_min ?? (e.price_status === 'free' ? '0' : undefined),
        priceCurrency: 'USD',
        url: safeTarget,
        availability: 'https://schema.org/InStock'
      },
      image: e.canonical_image_url ? [e.canonical_image_url] : undefined
    });

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(e.title)} — Brinkberry</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${ORIGIN}/event/${e.id}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(e.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${ORIGIN}/event/${e.id}">
  ${e.canonical_image_url ? `<meta property="og:image" content="${esc(e.canonical_image_url)}">` : `<meta property="og:image" content="${og}">`}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(e.title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  ${isCommunityPost ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <script type="application/ld+json">${jsonLd}</script>
  
  <!-- Impact.com / Trackonomics Publisher Tag -->
  <script type="text/javascript">(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7811847-56b2-4d75-8496-a98b675d87f81.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');</script>

  <style>
    body { margin: 0; background: #080610; color: #f4eff8; font: 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
    .container { max-width: 760px; margin: auto; padding: 24px 20px 60px; }
    .nav { margin-bottom: 24px; }
    .nav a { color: #ffb86b; text-decoration: none; font-weight: 700; font-size: 15px; }
    h1 { font-size: clamp(28px, 5vw, 42px); line-height: 1.1; margin: 12px 0; font-weight: 850; }
    .meta-box { background: #171321; border: 1px solid #2a2437; border-radius: 16px; padding: 18px; margin: 20px 0; }
    .meta-row { margin: 8px 0; color: #e2daf0; font-size: 15px; }
    .meta-row b { color: #fff; margin-right: 6px; }
    .badge { display: inline-block; background: #261f36; color: #ffb86b; padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-right: 6px; margin-bottom: 6px; }
    .desc { color: #d0c5df; margin: 24px 0; line-height: 1.6; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
    .btn-ticket { display: inline-block; background: #ffb86b; color: #201000; padding: 14px 24px; border-radius: 999px; text-decoration: none; font-weight: 850; font-size: 16px; text-align: center; }
    .btn-share { display: inline-block; background: #1a1526; color: #fff; border: 1px solid #362e49; padding: 14px 20px; border-radius: 999px; font-weight: 700; font-size: 15px; cursor: pointer; }
    .btn-report { display: inline-block; background: transparent; color: #8f85a3; border: 1px solid #2a2437; padding: 14px 20px; border-radius: 999px; font-size: 14px; cursor: pointer; }
    .btn-report:hover { color: #ff2e63; border-color: #ff2e63; }
    .btn-ticket:hover { background: #ffa84d; }
    .hero-img { width: 100%; height: 260px; object-fit: cover; border-radius: 18px; margin: 16px 0; border: 1px solid #2a2437; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav"><a href="/">← Explore what’s happening nearby</a></div>
    ${e.canonical_image_url ? `<img class="hero-img" src="${esc(e.canonical_image_url)}" alt="${esc(e.title)}">` : ''}
    <div>
      ${(e.category_tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('')}
      ${(e.vibe_labels || []).map(v => `<span class="badge" style="color:#ff809d">${esc(v)}</span>`).join('')}
      ${isCommunityPost ? '<span class="badge" title="*This event was submitted by a Brinkberry user and has not been independently verified. Details may change." style="color:#ffb86b; background:rgba(255,184,107,0.15)">Community-submitted*</span>' : ''}
    </div>
    <h1>${esc(e.title)}</h1>

    ${isCommunityPost ? `
      <div style="background: rgba(255,184,107,0.08); border: 1px solid rgba(255,184,107,0.3); border-radius: 12px; padding: 14px 18px; margin: 16px 0;">
        <p style="margin: 0; color: #ffb86b; font-size: 0.95rem; font-weight: 750;">
          📢 Community submitted — not independently verified
        </p>
        <p style="margin: 6px 0 0; color: #d0c5df; font-size: 0.85rem; line-height: 1.45;">
          *This event was submitted by a Brinkberry user and has not been independently verified. Details may change. Attend public or private gatherings at your own discretion.
        </p>
      </div>
      ${e.isApproximateLocation ? `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 16px; margin: 12px 0; font-size: 13px; color: #ffdfba;">
          🔒 <b>Private / Approximate Location:</b> Exact street address hidden to protect host privacy.
        </div>
      ` : ''}
    ` : e.confirmationStatus === 'confirmed_by_dual_official_sources' ? `
      <div style="background: rgba(100,223,223,0.1); border: 1px solid rgba(100,223,223,0.4); border-radius: 12px; padding: 12px 16px; margin: 16px 0;">
        <p style="margin: 0; color: #64dfdf; font-size: 0.95rem; font-weight: 700;">
          ✨ Confirmed by official venue and artist sources
        </p>
      </div>
    ` : isOfficial ? `
      <div style="background: rgba(255,184,107,0.08); border: 1px solid rgba(255,184,107,0.3); border-radius: 12px; padding: 12px 16px; margin: 16px 0;">
        <p style="margin: 0; color: #ffb86b; font-size: 0.9rem; font-weight: 600;">
          🔒 Brinkberry found this public schedule. We link directly to the venue’s official ticket page with zero markups or fees.
        </p>
      </div>
    ` : ''}

    <div class="meta-box">
      <div class="meta-row"><b>When:</b> ${esc(when)}</div>
      <div class="meta-row"><b>Where:</b> ${esc(e.venue_name || e.venue)}${e.city ? `, ${esc(e.city)}` : ''}${e.neighborhood ? ` (${esc(e.neighborhood)})` : ''}</div>
      ${(e.venue_address && !e.isApproximateLocation) ? `<div class="meta-row"><b>Address:</b> ${esc(e.venue_address)}</div>` : ''}
      <div class="meta-row"><b>Admission:</b> ${esc(price)}</div>
      ${e.contact ? `<div class="meta-row"><b>Contact / Host:</b> ${esc(e.contact)}</div>` : ''}
    </div>
    ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
    <div class="actions">
      ${safeTarget ? `<a class="btn-ticket" href="${isOfficial ? esc(safeTarget) : esc(clickUrl)}" target="_blank" rel="noopener noreferrer">${btnLabel}</a>` : ''}
      <button class="btn-share" id="shareBtn">Share Event</button>
      ${isCommunityPost ? `
        <span id="ownerControls" style="display:none;"><a id="managePostBtn" class="btn-share" href="#" style="text-decoration:none; background:rgba(255,184,107,0.15); border-color:var(--primary); color:#ffb86b;">⚙️ Manage / Delete Post</a></span>
        <button class="btn-report" id="reportBtn">⚑ Report Post</button>
      ` : `<a class="btn-share" href="/card/${esc(e.id)}" target="_blank" style="text-decoration:none;">Social Card ↗</a>`}
    </div>

    ${isCommunityPost ? `
      <!-- Report Modal Dialog -->
      <dialog id="reportDialog" style="background:#140f22; color:#fff; border:1px solid #281f38; border-radius:16px; padding:24px; max-width:480px; width:90%; box-shadow:0 12px 36px rgba(0,0,0,0.6);">
        <h3 style="margin:0 0 8px; font-size:18px;">Report Community Post</h3>
        <p style="color:#9b90aa; font-size:13px; margin:0 0 14px; line-height:1.4;">
          Brinkberry removes posts that are abusive, deceptive, dangerous, unlawful, or harmful. Posts are not removed for differences in lawful opinion, politics, or viewpoint.
        </p>
        <form id="reportForm" method="dialog">
          <label style="display:block; font-size:12px; font-weight:750; color:#9b90aa; margin-bottom:6px; text-transform:uppercase;">Reason for report *</label>
          <select id="reportReasonSelect" required style="width:100%; background:rgba(255,255,255,0.06); border:1px solid #281f38; border-radius:8px; padding:10px; color:#fff; font-size:14px; margin-bottom:16px;">
            <option value="spam">Commercial spam or repetitive promotion</option>
            <option value="scam">Scam or deceptive financial solicitation</option>
            <option value="violence">Threat of violence or physical harm</option>
            <option value="harassment">Harassment or hate speech</option>
            <option value="doxxing">Doxxing or unauthorized personal private info</option>
            <option value="impersonation">Impersonation of another person or venue</option>
            <option value="illegal">Unlawful or prohibited activity</option>
            <option value="false_logistics">False logistics, fake address, or nonexistent event</option>
            <option value="broken_details">Outdated, cancelled, or broken details</option>
          </select>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" id="closeReportBtn" style="background:transparent; border:1px solid #281f38; color:#9b90aa; padding:8px 14px; border-radius:8px; cursor:pointer;">Cancel</button>
            <button type="submit" style="background:#ff2e63; border:none; color:#fff; padding:8px 16px; border-radius:8px; font-weight:700; cursor:pointer;">Submit Report</button>
          </div>
        </form>
      </dialog>

      <script>
        // Check if current visitor is the creator
        try {
          const u = new URL(location.href);
          const urlKey = u.searchParams.get('key');
          const storedKeys = JSON.parse(localStorage.getItem('bb_post_keys') || '{}');
          const myKey = urlKey || storedKeys[${JSON.stringify(e.id)}];
          if (myKey) {
            const ownerEl = document.getElementById('ownerControls');
            const manageBtn = document.getElementById('managePostBtn');
            if (ownerEl && manageBtn) {
              ownerEl.style.display = 'inline-block';
              manageBtn.href = '/post/manage?id=' + encodeURIComponent(${JSON.stringify(e.id)}) + '&key=' + encodeURIComponent(myKey);
            }
          }
        } catch (_) {}

        // Reporting flow
        const reportDialog = document.getElementById('reportDialog');
        document.getElementById('reportBtn')?.addEventListener('click', () => {
          if (reportDialog?.showModal) reportDialog.showModal();
        });
        document.getElementById('closeReportBtn')?.addEventListener('click', () => {
          reportDialog?.close();
        });
        document.getElementById('reportForm')?.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const reason = document.getElementById('reportReasonSelect').value;
          reportDialog?.close();
          try {
            const res = await fetch('/api/post/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ eventId: ${JSON.stringify(e.id)}, reason })
            });
            const data = await res.json();
            if (data.success) {
              alert('Thank you. Your report has been submitted for review.');
              if (data.action === 'hidden') {
                location.reload();
              }
            } else {
              alert(data.error || 'Unable to submit report.');
            }
          } catch (_) {
            alert('Unable to submit report right now.');
          }
        });
      </script>
    ` : ''}

    ${(e.sourceEvidence || (Array.isArray(e.sources) && e.sources.length > 0)) ? `
      <details style="margin-top: 36px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 18px;">
        <summary style="cursor: pointer; color: #a99ec0; font-size: 0.9rem; font-weight: 700; user-select: none;">
          🔍 Official Source Provenance Audit
        </summary>
        <div style="margin-top: 14px; font-size: 0.85rem; color: #c4bdd0; font-family: monospace; line-height: 1.7; word-break: break-all;">
          <div><strong>Confirmation Status:</strong> <span style="color:#64dfdf">${esc(e.confirmationStatus || 'confirmed_by_official_calendar')}</span></div>
          ${e.correlatedTicketingProvider ? `<div><strong>Ticketing Provider Correlation:</strong> <span style="color:#ffb86b">Shared ${esc(e.correlatedTicketingProvider)} (ID: ${esc(e.correlatedTicketingId || 'matched')})</span></div>` : ''}
          ${Array.isArray(e.sources) && e.sources.length > 1 ? `
            <div style="margin-top: 8px;"><strong>Dual Corroborating Sources:</strong></div>
            ${e.sources.map((s, idx) => `
              <div style="padding-left: 12px; margin: 4px 0; border-left: 2px solid #64dfdf;">
                <div>Source #${idx + 1}: <b>${esc(s.feedType || s.type || 'official_source')}</b></div>
                <div>URL: <a href="${esc(s.sourceUrl || s.feedUrl || '')}" target="_blank" rel="noopener noreferrer" style="color:#ffb86b">${esc(s.sourceUrl || s.feedUrl || 'n/a')}</a></div>
                ${s.contentHash || s.rawHash ? `<div>SHA-256: <code>${esc((s.contentHash || s.rawHash).slice(0, 32))}...</code></div>` : ''}
              </div>
            `).join('')}
          ` : `
            <div><strong>Source Feed URL:</strong> <a href="${esc(e.sourceEvidence?.sourceUrl || e.canonical_url)}" target="_blank" rel="noopener noreferrer" style="color:#ffb86b; text-decoration:underline;">${esc(e.sourceEvidence?.sourceUrl || e.canonical_url)}</a></div>
            ${e.sourceEvidence?.feedTechnology ? `<div><strong>Feed Technology:</strong> ${esc(e.sourceEvidence.feedTechnology)}</div>` : ''}
            ${(e.sourceEvidence?.contentHash || e.sourceEvidence?.rawHash) ? `<div><strong>Evidence SHA-256:</strong> ${esc(e.sourceEvidence.contentHash || e.sourceEvidence.rawHash)}</div>` : ''}
            ${e.sourceEvidence?.fetchedAt ? `<div><strong>Last Verified:</strong> ${esc(e.sourceEvidence.fetchedAt)}</div>` : ''}
          `}
          ${e.provenanceConflict ? `
            <div style="margin-top: 10px; padding: 10px 14px; background: rgba(255, 184, 107, 0.08); border-left: 3px solid #ffb86b; border-radius: 4px;">
              <div style="color: #ffb86b; font-weight: 700;">⚠️ Provenance Conflict Notice:</div>
              <div><strong>Type:</strong> ${esc(e.provenanceConflict.conflictType)}</div>
              ${e.provenanceConflict.artistExpectedDate ? `<div><strong>Artist Expected:</strong> ${esc(e.provenanceConflict.artistExpectedDate)} ${esc(e.provenanceConflict.artistExpectedTime || '')}</div>` : ''}
              ${e.provenanceConflict.venuePublishedDate ? `<div><strong>Venue Published:</strong> ${esc(e.provenanceConflict.venuePublishedDate)} ${esc(e.provenanceConflict.venuePublishedTime || '')}</div>` : ''}
              ${e.provenanceConflict.note ? `<div><strong>Note:</strong> ${esc(e.provenanceConflict.note)}</div>` : ''}
            </div>
          ` : ''}

          ${(e.venue_latitude && e.venue_longitude) ? `<div><strong>Venue Location:</strong> ${esc(e.venue_address || e.venue_name)} (${e.venue_latitude}, ${e.venue_longitude}) · ${esc(timeZone)}</div>` : ''}
        </div>
      </details>
    ` : ''}

  </div>
  <script>
    document.getElementById('shareBtn').onclick = async () => {
      const shareData = { title: ${JSON.stringify(e.title)}, text: ${JSON.stringify(e.title + ' — ' + when + ' at ' + e.venue_name)}, url: location.href };
      if (navigator.share) {
        try { await navigator.share(shareData); return; } catch {}
      }
      await navigator.clipboard.writeText(location.href);
      alert('Event link copied to clipboard!');
    };
  </script>
</body>
</html>`);
  } catch (e) {
    console.error('Event page error:', e);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(500).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Event page temporarily unavailable</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
  }
};
