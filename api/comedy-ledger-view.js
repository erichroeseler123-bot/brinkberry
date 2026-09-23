/**
 * Comedian & Venue Live Box Office Ledger Dashboard
 *
 * Provides real-time ticket velocity, capacity tracking, and transparent
 * settlement reconciliation for comedians and independent room runners.
 */

const { getLedgerByToken, getLedgerSummary } = require('../lib/comedy/ledger');

function renderLedgerDashboard(ledger) {
  const summary = getLedgerSummary(ledger.showId);
  const settlement = summary.settlement || {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Live Box Office Ledger | Brinkberry Comedy</title>
  <style>
    :root {
      --bg: #07050d;
      --card-bg: #120d1c;
      --card-border: #231c33;
      --text: #f6f2fb;
      --text-dim: #9b90ad;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --green: #00d26a;
      --accent: #ff2e63;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px 16px 60px;
      line-height: 1.5;
    }
    .wrap {
      max-width: 680px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .brand { font-size: 16px; font-weight: 800; color: #fff; text-decoration: none; }
    .brand b { color: var(--accent); }
    .hero-stat {
      background: linear-gradient(135deg, rgba(38, 22, 54, 0.8), rgba(18, 13, 28, 0.95));
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 20px;
      text-align: center;
    }
    .badge-momentum {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 12px;
      background: rgba(255, 184, 107, 0.15);
      border: 1px solid rgba(255, 184, 107, 0.35);
      color: var(--primary);
    }
    .hero-num {
      font-size: clamp(38px, 6vw, 56px);
      font-weight: 900;
      color: #fff;
      margin-bottom: 4px;
    }
    .hero-label {
      color: var(--text-dim);
      font-size: 14px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px;
      text-align: center;
    }
    .stat-val {
      font-size: 24px;
      font-weight: 850;
      color: var(--primary);
      margin-bottom: 4px;
    }
    .stat-title {
      font-size: 12px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .settlement-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .settlement-title {
      font-size: 17px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .split-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 14.5px;
    }
    .split-row.total {
      border-bottom: none;
      font-weight: 800;
      font-size: 16px;
      color: #fff;
      padding-top: 14px;
    }
    .door-link-card {
      background: rgba(0, 210, 106, 0.08);
      border: 1px solid rgba(0, 210, 106, 0.25);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 750;
      text-decoration: none;
      cursor: pointer;
    }
    .btn-green { background: var(--green); color: #022010; }
    .btn-primary { background: var(--primary); color: var(--primary-dark); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <span style="font-size:12.5px; color:var(--primary); font-weight:700;">📊 Live Box Office Ledger</span>
    </div>

    <div class="hero-stat">
      <div class="badge-momentum">${summary.momentum.badge}</div>
      <div class="hero-num">$${summary.grossRevenue.toFixed(2)}</div>
      <div class="hero-label">Total Gross Box Office Receipts</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">${summary.ticketsSold} / ${summary.capacity}</div>
        <div class="stat-title">Tickets Sold</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${summary.sellThroughPercent}%</div>
        <div class="stat-title">Capacity Filled</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--green)">${summary.ticketsCheckedIn}</div>
        <div class="stat-title">Door Check-Ins</div>
      </div>
    </div>

    <div class="settlement-card">
      <div class="settlement-title">
        <span>Transparent Settlement Reconciliation</span>
        <span style="font-size:12px; font-weight:600; color:var(--text-dim);">Auto-Calculated</span>
      </div>
      <div class="split-row">
        <span>Split Model</span>
        <b>${settlement.splitModel || 'Door Split'}</b>
      </div>
      <div class="split-row">
        <span>Talent Payout (${ledger.talentSplitPct}%)</span>
        <b style="color:var(--green)">$${(settlement.talentPayout || 0).toFixed(2)}</b>
      </div>
      <div class="split-row">
        <span>Room / Venue Share (${ledger.venueSplitPct}%)</span>
        <b>$${(settlement.venuePayout || 0).toFixed(2)}</b>
      </div>
      <div class="split-row total">
        <span>Total Reconciled</span>
        <span>$${(settlement.grossRevenue || 0).toFixed(2)}</span>
      </div>
      <p style="font-size:12.5px; color:var(--text-dim); margin:12px 0 0;">${settlement.notes || ''}</p>
    </div>

    <div class="door-link-card">
      <div>
        <b style="color:#fff; display:block; margin-bottom:2px;">Phone Door Scanner Link</b>
        <span style="font-size:13px; color:var(--text-dim)">Share with your door person or open mic host.</span>
      </div>
      <a class="btn btn-green" href="/door/${ledger.doorToken}" target="_blank">Open Door Scanner →</a>
    </div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.send) res.send = function(d) { this.end(d); return this; };
  if (!res.json) res.json = function(d) {
    if (this.setHeader) this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(d));
    return this;
  };

  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const path = u.pathname;

    const match = path.match(/^\/show-ledger\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Ledger Not Found</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    const token = match[1];
    const ledger = getLedgerByToken(token);
    if (!ledger) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Ledger Not Found</h1><p>Invalid or expired private ledger management token.</p><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(200).send(renderLedgerDashboard(ledger));
  } catch (err) {
    console.error('Show ledger error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send('Server error');
  }
};
