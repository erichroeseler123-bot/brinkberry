/**
 * Browser-Based Phone Door Scanner & Check-In Portal
 *
 * Provides comedians and independent room runners with a zero-hardware,
 * mobile-friendly check-in console to scan tickets, reject duplicates,
 * and track room capacity in real time.
 */

const { getLedgerByDoorToken, checkInTicket, getLedgerSummary } = require('../lib/comedy/ledger');

function renderDoorScannerPage(ledger) {
  const summary = getLedgerSummary(ledger.showId);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Door Check-In Scanner | Brinkberry Comedy</title>
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
      --red: #ff2e63;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
      line-height: 1.5;
    }
    .wrap {
      max-width: 500px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .brand { font-size: 15px; font-weight: 800; color: #fff; text-decoration: none; }
    .brand b { color: var(--red); }
    .status-card {
      background: linear-gradient(135deg, rgba(35, 20, 52, 0.8), rgba(18, 13, 28, 0.9));
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 24px;
      text-align: center;
      margin-bottom: 20px;
    }
    .count-large {
      font-size: 48px;
      font-weight: 900;
      color: var(--primary);
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .subhead {
      color: var(--text-dim);
      font-size: 14px;
    }
    .scan-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 20px;
      margin-bottom: 20px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      background: #181224;
      border: 1px solid #2e2440;
      color: #fff;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 16px;
      margin-bottom: 12px;
      font-family: monospace;
    }
    input:focus { outline: none; border-color: var(--primary); }
    button {
      width: 100%;
      background: var(--primary);
      color: var(--primary-dark);
      border: none;
      border-radius: 999px;
      padding: 12px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }
    #scanResult {
      display: none;
      padding: 16px;
      border-radius: 14px;
      margin-top: 14px;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
    }
    .history-title {
      font-size: 14px;
      font-weight: 750;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 20px 0 10px;
    }
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .history-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <a class="brand" href="/"><b>●</b> Brinkberry</a>
      <span style="font-size:12.5px; color:var(--primary); font-weight:700;">🚪 Door Console</span>
    </div>

    <div class="status-card">
      <div id="doorTally" class="count-large">${summary.ticketsCheckedIn} / ${summary.ticketsSold}</div>
      <div class="subhead">Checked In · Room Capacity: <b>${summary.capacity}</b></div>
    </div>

    <div class="scan-box">
      <label style="display:block; font-size:13px; color:#ded6ec; font-weight:600; margin-bottom:8px;">Scan or Enter Ticket QR Token</label>
      <input type="text" id="tokenInput" placeholder="tkt_..." autofocus autocomplete="off">
      <button id="scanBtn">Validate & Check In</button>
      <div id="scanResult"></div>
    </div>

    <div class="history-title">Recent Check-Ins</div>
    <div id="checkinHistory" class="history-list"></div>
  </div>

  <script>
    const tokenInput = document.getElementById('tokenInput');
    const scanBtn = document.getElementById('scanBtn');
    const scanResult = document.getElementById('scanResult');
    const doorTally = document.getElementById('doorTally');
    const historyList = document.getElementById('checkinHistory');

    async function submitScan() {
      const token = tokenInput.value.trim();
      if (!token) return;

      scanBtn.disabled = true;
      scanBtn.textContent = 'Checking…';

      try {
        const res = await fetch('/api/comedy/door/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        scanResult.style.display = 'block';

        if (data.success) {
          scanResult.style.background = 'rgba(0, 210, 106, 0.15)';
          scanResult.style.border = '1px solid rgba(0, 210, 106, 0.4)';
          scanResult.style.color = '#00d26a';
          scanResult.innerHTML = '✓ ' + data.message;
          if (data.doorCount) {
            doorTally.textContent = data.doorCount.checkedIn + ' / ' + data.doorCount.sold;
          }
          const item = document.createElement('div');
          item.className = 'history-item';
          item.innerHTML = '<b>' + (data.ticket?.buyerName || 'Attendee') + '</b><span style="color:#00d26a">Checked In</span>';
          historyList.prepend(item);
          tokenInput.value = '';
        } else if (data.status === 'duplicate') {
          scanResult.style.background = 'rgba(255, 184, 107, 0.15)';
          scanResult.style.border = '1px solid rgba(255, 184, 107, 0.4)';
          scanResult.style.color = '#ffb86b';
          scanResult.innerHTML = '⚠️ Duplicate: ' + data.message;
        } else {
          scanResult.style.background = 'rgba(255, 46, 99, 0.15)';
          scanResult.style.border = '1px solid rgba(255, 46, 99, 0.4)';
          scanResult.style.color = '#ff2e63';
          scanResult.innerHTML = '✕ ' + (data.message || 'Invalid ticket');
        }
      } catch (err) {
        scanResult.style.display = 'block';
        scanResult.style.color = '#ff2e63';
        scanResult.innerHTML = 'Error scanning ticket';
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = 'Validate & Check In';
        tokenInput.focus();
      }
    }

    scanBtn.onclick = submitScan;
    tokenInput.onkeydown = (e) => { if (e.key === 'Enter') submitScan(); };
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.json) res.json = function(d) {
    if (this.setHeader) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(d));
    return this;
  };
  if (!res.send) res.send = function(d) {
    this.end(d);
    return this;
  };

  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const path = u.pathname;

    // Direct door scan API
    if (path === '/api/comedy/door/scan' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}

      const token = payload.token || u.searchParams.get('token');
      const result = checkInTicket(token);
      res.setHeader('content-type', 'application/json');
      return res.status(result.success ? 200 : (result.status === 'duplicate' ? 409 : 400)).json(result);
    }

    // Door check-in portal page: /door/:doorToken
    const match = path.match(/^\/door\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const doorToken = match[1];
      const ledger = getLedgerByDoorToken(doorToken);
      if (!ledger) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Door Console Not Found</h1><p>Invalid or expired door management token.</p></body></html>');
      }

      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderDoorScannerPage(ledger));
    }

    res.setHeader('content-type', 'application/json');
    return res.status(404).json({ error: 'Endpoint not found' });
  } catch (err) {
    console.error('Comedy door error:', err);
    res.setHeader('content-type', 'application/json');
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
