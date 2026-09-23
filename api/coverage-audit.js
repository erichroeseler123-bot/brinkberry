/**
 * National Coverage & Verification Audit Handler
 *
 * Endpoint: /api/coverage-audit (JSON)
 * Dashboard: /admin/coverage-audit (HTML UI)
 *
 * Security: Requires admin authorization for internal link diagnostics and provider telemetry.
 * Public unauthenticated access returns sanitized public results.
 */

const {
  runNationalAudit,
  sanitizeAuditReport,
  AUDIT_MILESTONE,
  HORIZONS
} = require('../lib/audit/coverage-auditor');

function isAuthorizedAdmin(req) {
  const token = (
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.headers['x-brinkberry-admin-key']
  )?.trim();

  if (!token) return false;

  const validTokens = [
    process.env.ADMIN_TOKEN,
    process.env.ADMIN_AUDIT_TOKEN,
    process.env.BRINKBERRY_ADMIN_KEY,
    process.env.COMEDY_MODERATOR_TOKEN
  ].filter(Boolean);

  if (validTokens.length === 0) return false;
  return validTokens.includes(token);
}

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function renderCoverageAuditHtml(audit, isAuthorized, activeWindow) {
  const t = audit.totals;
  const verifiedPercent = Math.round((t.verifiedInventoryMarkets / t.probedMarkets) * 100);

  const horizonTabsHtml = HORIZONS.map(h => {
    const isActive = (h === activeWindow) || (!activeWindow && h === '48h' && h === 'tonight');
    return `<a href="?window=${h}" class="tab-btn ${isActive ? 'active' : ''}">${esc(h.replace(/_/g, ' ').toUpperCase())}</a>`;
  }).join('');

  const rowsHtml = audit.results.map((r, idx) => {
    let badgeClass = 'badge-green';
    let label = 'Verified Inventory';
    if (r.classification === 'partial_verification') {
      badgeClass = 'badge-amber';
      label = 'Partial Verification';
    } else if (r.classification === 'stale_or_unlinked') {
      badgeClass = 'badge-red';
      label = 'Stale / Unlinked';
    } else if (r.classification === 'seeded_presence_only') {
      badgeClass = 'badge-yellow';
      label = 'Seeded Presence Only';
    } else if (r.classification === 'honest_empty_state') {
      badgeClass = 'badge-gray';
      label = 'Honest Empty State';
    }

    let freshBadge = 'fresh-green';
    if (r.freshness.status === 'stale') freshBadge = 'fresh-red';
    else if (r.freshness.status === 'venue_verified_pending_schedule') freshBadge = 'fresh-yellow';
    else if (r.freshness.status === 'no_verified_data') freshBadge = 'fresh-gray';

    const eventsList = (r.events || []).map(e => {
      const linkInfo = isAuthorized && e.linkStatus
        ? `<span class="badge ${e.linkStatus.valid ? 'badge-green' : 'badge-red'}">${esc(e.linkStatus.reason)} (${e.linkStatus.status})</span>`
        : '';

      const sourceLink = isAuthorized && e.sourceUrl
        ? `<a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener" class="sublink">${esc(e.sourceUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30))}…</a>`
        : '';

      return `
        <div class="event-item">
          <div class="event-header">
            <strong>${esc(e.title)}</strong>
            <span class="badge badge-tag">${esc(e.listingType)}</span>
            <span class="badge ${e.confirmationStatus === 'confirmed_by_box_office' ? 'badge-blue' : 'badge-tag'}">${esc(e.confirmationStatus.replace(/_/g, ' '))}</span>
            ${linkInfo}
          </div>
          <div class="event-meta">
            <span>🏛️ ${esc(e.venue || 'TBA')}</span> · 
            <span>📅 ${e.eventDateTime?.start ? new Date(e.eventDateTime.start).toLocaleString() : 'TBA'}</span>
            ${e.lastSourceCheck ? ` · <span>🕒 Last verified: ${new Date(e.lastSourceCheck).toLocaleDateString()} (${e.lastSourceCheckAgeDays}d ago)</span>` : ''}
            ${sourceLink ? ` · <span>🔗 ${sourceLink}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const eventDetailsSection = r.events?.length > 0
      ? `<details class="event-details">
           <summary>${r.events.length} event record${r.events.length > 1 ? 's' : ''} (inspect dates & verification)</summary>
           <div class="event-details-content">${eventsList}</div>
         </details>`
      : '';

    return `
      <tr>
        <td><strong>${esc(r.market)}</strong><br><span class="badge badge-tag">${esc(r.type)}</span></td>
        <td><span class="badge ${r.vertical === 'comedy' ? 'badge-purple' : 'badge-orange'}">${esc(r.vertical.toUpperCase())}</span></td>
        <td><span class="status-badge ${badgeClass}">${esc(label)}</span></td>
        <td class="text-right"><strong>${r.inventory.totalEvents}</strong></td>
        <td class="text-right">${r.inventory.commercialEvents}</td>
        <td class="text-right">${r.inventory.curatedEvents}</td>
        <td>
          <span class="freshness-indicator ${freshBadge}">●</span> ${esc(r.freshness.status.replace(/_/g, ' '))}
          ${r.freshness.avgAgeDays != null ? `<span class="subtext">(${r.freshness.avgAgeDays}d age)</span>` : ''}
          ${eventDetailsSection}
        </td>
        <td><code>${esc(r.eventHorizon.horizon)}</code> ${r.eventHorizon.earliestHoursOut != null ? `<span class="subtext">(+${r.eventHorizon.earliestHoursOut}h)</span>` : ''}</td>
        <td>
          ${isAuthorized && r.linkIntegrity?.totalChecked > 0
            ? `<code>${r.linkIntegrity.validCount}/${r.linkIntegrity.totalChecked}</code>`
            : (!isAuthorized ? '<span class="subtext">admin locked</span>' : '<span class="subtext">none</span>')
          }
        </td>
      </tr>
    `;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>National Coverage & Verification Quality Audit — Brinkberry</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    :root {
      --bg: #07060e;
      --card: #120e1e;
      --card-border: #231c34;
      --text: #f5f0fb;
      --dim: #968ba6;
      --cyan: #38bdf8;
      --orange: #fb923c;
      --purple: #c084fc;
      --green: #4ade80;
      --yellow: #facc15;
      --amber: #fbbf24;
      --red: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem 1.5rem;
      line-height: 1.5;
    }
    .container { max-width: 1280px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--card-border); padding-bottom: 1.5rem; }
    h1 { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.75rem; }
    .subtitle { color: var(--dim); font-size: 0.95rem; margin-top: 0.5rem; }
    .milestone-banner {
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-top: 1rem;
      font-size: 0.95rem;
      color: #bae6fd;
    }
    .auth-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.75rem 1.25rem;
      margin-top: 1rem;
      font-size: 0.85rem;
    }
    .auth-form { display: flex; gap: 0.5rem; }
    .auth-input {
      background: #1a1626;
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .auth-btn {
      background: #ffb86b;
      color: #201000;
      border: 0;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }

    .tabs-bar {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }
    .tab-btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 700;
      text-decoration: none;
      color: var(--dim);
      background: #130f20;
      border: 1px solid var(--card-border);
    }
    .tab-btn.active {
      color: #fff;
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--cyan);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .metric-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
    }
    .metric-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); }
    .metric-val { font-size: 1.8rem; font-weight: 800; margin-top: 0.25rem; color: #fff; }
    .metric-sub { font-size: 0.8rem; color: var(--dim); margin-top: 0.25rem; }

    .table-card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 2rem;
    }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
    th {
      background: #171226;
      color: var(--dim);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    td { padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .text-right { text-align: right; }
    .subtext { font-size: 0.78rem; color: var(--dim); display: block; margin-top: 2px; }

    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-purple { background: rgba(192, 132, 252, 0.15); color: var(--purple); }
    .badge-orange { background: rgba(251, 146, 60, 0.15); color: var(--orange); }
    .badge-blue { background: rgba(56, 189, 248, 0.15); color: var(--cyan); }
    .badge-tag { background: rgba(255,255,255,0.06); color: var(--dim); font-size: 0.68rem; }

    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-green { background: rgba(74, 222, 128, 0.15); color: var(--green); border: 1px solid rgba(74, 222, 128, 0.3); }
    .badge-amber { background: rgba(251, 191, 36, 0.15); color: var(--amber); border: 1px solid rgba(251, 191, 36, 0.3); }
    .badge-red { background: rgba(248, 113, 113, 0.15); color: var(--red); border: 1px solid rgba(248, 113, 113, 0.3); }
    .badge-yellow { background: rgba(250, 204, 21, 0.15); color: var(--yellow); border: 1px solid rgba(250, 204, 21, 0.3); }
    .badge-gray { background: rgba(255, 255, 255, 0.05); color: var(--dim); border: 1px solid rgba(255,255,255,0.1); }

    .freshness-indicator { font-size: 0.75rem; margin-right: 4px; }
    .fresh-green { color: var(--green); }
    .fresh-yellow { color: var(--yellow); }
    .fresh-red { color: var(--red); }
    .fresh-gray { color: var(--dim); }

    .event-details { margin-top: 0.5rem; }
    .event-details summary { cursor: pointer; color: var(--cyan); font-size: 0.8rem; }
    .event-details-content { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .event-item { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.8rem; }
    .event-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2px; }
    .event-meta { color: var(--dim); font-size: 0.75rem; }
    .sublink { color: var(--cyan); text-decoration: none; }
    .sublink:hover { text-decoration: underline; }

    code { font-family: monospace; background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px; font-size: 0.8rem; }
    footer { text-align: center; color: var(--dim); font-size: 0.85rem; padding-top: 1rem; border-top: 1px solid var(--card-border); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>National Coverage & Verification Quality Audit</h1>
      <p class="subtitle">Real-time inventory inspection, granular date confirmation, link integrity health, and multi-horizon horizon checks across national comedy and motorsports belts.</p>
      
      <div class="milestone-banner">
        <strong>Milestone:</strong> ${esc(audit.milestone)}<br>
        <span style="font-size: 0.85rem; opacity: 0.85;">Audited at ${esc(audit.timestamp)} in ${audit.totals.auditDurationMs}ms · Target: ${isAuthorized ? 'Authorized Administrative Diagnostics' : 'Sanitized Public Scorecard'}</span>
      </div>

      <div class="auth-banner">
        <div>
          <strong>Status:</strong> ${isAuthorized ? '<span style="color: var(--green);">Unlocked (Full Internal Diagnostics)</span>' : '<span style="color: var(--amber);">Public View (Internal Telemetry Masked)</span>'}
        </div>
        ${!isAuthorized ? `
          <div style="font-size: 0.8rem; color: var(--dim);">
            Administrative diagnostics are header-only (<code>Authorization: Bearer &lt;ADMIN_TOKEN&gt;</code>).
          </div>
        ` : `
          <div style="font-size: 0.8rem; color: var(--green);">
            Authenticated via secure request headers
          </div>
        `}
      </div>
    </header>

    <div class="tabs-bar">
      ${horizonTabsHtml}
    </div>

    <section class="metrics-grid">
      <div class="metric-card">
        <div class="metric-title">Probed Markets</div>
        <div class="metric-val">${t.probedMarkets}</div>
        <div class="metric-sub">9 Comedy · 9 Racing</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Verified Inventory</div>
        <div class="metric-val" style="color: var(--green);">${t.verifiedInventoryMarkets} <span style="font-size: 0.9rem; font-weight: normal; color: var(--dim);">(${verifiedPercent}%)</span></div>
        <div class="metric-sub">100% link & date confirmed</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Partial Verification</div>
        <div class="metric-val" style="color: var(--amber);">${t.partialVerificationMarkets}</div>
        <div class="metric-sub">Commercial or partial links</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Stale or Unlinked</div>
        <div class="metric-val" style="color: var(--red);">${t.staleOrUnlinkedMarkets}</div>
        <div class="metric-sub">Links broken / age > 30d</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Honest Empty States</div>
        <div class="metric-val" style="color: var(--dim);">${t.honestEmptyStateMarkets}</div>
        <div class="metric-sub">Zero leakage / zero hallucination</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Total Discovered</div>
        <div class="metric-val" style="color: var(--cyan);">${t.totalEventsDiscovered}</div>
        <div class="metric-sub">${t.totalCommercialEvents} Comm · ${t.totalCuratedEvents} Curated</div>
      </div>
    </section>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Market & Type</th>
            <th>Vertical</th>
            <th>Verification Status</th>
            <th class="text-right">Total</th>
            <th class="text-right">Comm</th>
            <th class="text-right">Curated</th>
            <th>Source Freshness & Records</th>
            <th>Horizon</th>
            <th>Link Validity</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <footer>
      Brinkberry Live Radar Discovery · Strict zero-hallucination policy · Ticketing checkout disabled for public transactions.
    </footer>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'https://brinkberry.local');
  const isAuthorized = isAuthorizedAdmin(req);
  const checkLinks = u.searchParams.get('checkLinks') !== 'false';
  const format = u.searchParams.get('format') || (u.pathname.startsWith('/api/') ? 'json' : 'html');
  const window = u.searchParams.get('window') || '48h';
  const includeMultiHorizon = u.searchParams.get('horizons') === 'true';

  try {
    const rawAudit = await runNationalAudit({
      checkLinks,
      window,
      includeMultiHorizon
    });

function sendResponse(res, statusCode, body, isJson = false) {
  if (typeof res.status === 'function') {
    const chain = res.status(statusCode);
    if (isJson) {
      if (typeof chain?.json === 'function') return chain.json(body);
      if (typeof res.json === 'function') return res.json(body);
    }
    if (typeof chain?.send === 'function') return chain.send(body);
    if (typeof res.send === 'function') return res.send(body);
  }
  if (typeof res.writeHead === 'function') {
    res.writeHead(statusCode);
  } else {
    res.statusCode = statusCode;
  }
  res.end(isJson ? (typeof body === 'string' ? body : JSON.stringify(body)) : body);
}

    // If unauthorized, sanitize internal health metrics and URLs
    const finalAudit = isAuthorized ? rawAudit : sanitizeAuditReport(rawAudit);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return sendResponse(res, 200, {
        authenticated: isAuthorized,
        ...finalAudit
      }, true);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return sendResponse(res, 200, renderCoverageAuditHtml(finalAudit, isAuthorized, window), false);
  } catch (err) {
    console.error('[Coverage Audit Handler Error]:', err);
    if (format === 'json') {
      return sendResponse(res, 500, { error: 'Audit execution failed', message: err.message }, true);
    }
    return sendResponse(res, 500, `<h1>Audit execution error</h1><p>${esc(err.message)}</p>`, false);
  }
};
