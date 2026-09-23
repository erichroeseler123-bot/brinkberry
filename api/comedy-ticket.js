/**
 * Digital Mobile Ticket Pass View & API
 *
 * Renders a clean, high-contrast mobile admission pass for fans presenting
 * tickets at the comedy room door.
 */

const { getTicketByToken } = require('../lib/comedy/ledger');
const { getComedyShowById } = require('../lib/comedy/registry');

function esc(s = '') {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function renderTicketPage(ticket, show) {
  const showTitle = show?.title || 'Stand-Up Comedy Showcase';
  const venueName = show?.venue_name || 'Independent Comedy Room';
  const showTime = show?.start_time
    ? new Date(show.start_time).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'Tonight';

  const isValid = ticket.status === 'valid';
  const isCheckedIn = ticket.status === 'checked_in';
  const isCancelled = ticket.status === 'cancelled';

  let statusBg = 'rgba(0, 210, 106, 0.15)';
  let statusBorder = 'rgba(0, 210, 106, 0.4)';
  let statusColor = '#00d26a';
  let statusText = '✓ VALID ENTRY';

  if (isCheckedIn) {
    statusBg = 'rgba(100, 160, 255, 0.15)';
    statusBorder = 'rgba(100, 160, 255, 0.4)';
    statusColor = '#64a0ff';
    statusText = `✓ CHECKED IN (${new Date(ticket.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
  } else if (isCancelled) {
    statusBg = 'rgba(255, 46, 99, 0.15)';
    statusBorder = 'rgba(255, 46, 99, 0.4)';
    statusColor = '#ff2e63';
    statusText = '✕ CANCELLED';
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mobile Ticket Pass | Brinkberry Comedy</title>
  <style>
    :root {
      --bg: #07050d;
      --card-bg: #120d1c;
      --card-border: #231c33;
      --text: #f6f2fb;
      --text-dim: #9b90ad;
      --primary: #ffb86b;
      --primary-dark: #201000;
      --accent: #ff2e63;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px 16px 40px;
      line-height: 1.5;
    }
    .wrap {
      max-width: 440px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .brand { font-size: 15px; font-weight: 800; color: #fff; text-decoration: none; }
    .brand b { color: var(--accent); }
    .ticket-card {
      background: linear-gradient(180deg, #181224 0%, #110d1c 100%);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 12px 36px rgba(0,0,0,0.5);
    }
    .ticket-header {
      background: linear-gradient(135deg, rgba(46, 25, 68, 0.8), rgba(20, 13, 33, 0.9));
      padding: 24px 20px;
      border-bottom: 2px dashed #2e2440;
      position: relative;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: ${statusBg};
      border: 1px solid ${statusBorder};
      color: ${statusColor};
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 850;
      line-height: 1.25;
      color: #fff;
    }
    .venue-line {
      color: var(--primary);
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .time-line {
      color: var(--text-dim);
      font-size: 14px;
    }
    .ticket-body {
      padding: 24px 20px;
    }
    .attendee-box {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 12px 14px;
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .attendee-name {
      font-size: 16px;
      font-weight: 800;
      color: #fff;
    }
    .seat-index {
      font-size: 13px;
      color: var(--primary);
      font-weight: 750;
    }
    .token-display {
      background: #080610;
      border: 1px solid #2e2440;
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
    }
    .token-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      margin-bottom: 8px;
    }
    .token-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 17px;
      font-weight: 750;
      color: #fff;
      word-break: break-all;
      letter-spacing: 0.05em;
      background: #140e21;
      padding: 8px 12px;
      border-radius: 8px;
      display: inline-block;
    }
    .instructions {
      font-size: 13px;
      color: var(--text-dim);
      text-align: center;
      line-height: 1.4;
    }
    .footer-link {
      text-align: center;
      margin-top: 24px;
    }
    .footer-link a {
      color: var(--primary);
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <a class="brand" href="/">BRINKBERRY <b>COMEDY</b></a>
      <span style="font-size:12.5px; color:var(--text-dim);">Live Mobile Pass</span>
    </div>

    <div class="ticket-card">
      <div class="ticket-header">
        <div class="status-pill">${esc(statusText)}</div>
        <h1>${esc(showTitle)}</h1>
        <div class="venue-line">📍 ${esc(venueName)}</div>
        <div class="time-line">🕒 ${esc(showTime)}</div>
      </div>

      <div class="ticket-body">
        <div class="attendee-box">
          <div class="attendee-name">${esc(ticket.buyerName || 'Admit One')}</div>
          <div class="seat-index">Ticket ${esc(String(ticket.ticketIndex))} of ${esc(String(ticket.totalInOrder))}</div>
        </div>

        <div class="token-display">
          <div class="token-label">Admission QR Code / Token</div>
          <div class="token-value">${esc(ticket.token)}</div>
        </div>

        <div class="instructions">
          ${isValid
            ? 'Present this screen at the door. Staff will verify your admission code.'
            : isCheckedIn
              ? 'This ticket has been checked in. Enjoy the show!'
              : 'This admission pass has been marked cancelled.'}
        </div>
      </div>
    </div>

    <div class="footer-link">
      <a href="/">← Return to Brinkberry Live Radar</a>
    </div>
  </div>
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

    const match = path.match(/^\/ticket\/([a-zA-Z0-9_-]+)/);
    const token = match ? match[1] : (u.searchParams.get('token') || '');

    if (!token) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(400).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Ticket Token Required</h1><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    const ticket = getTicketByToken(token);
    if (!ticket) {
      if (req.headers?.accept?.includes('application/json') || u.searchParams.get('format') === 'json') {
        res.setHeader('content-type', 'application/json');
        return res.status(404).json({ error: 'Ticket not found' });
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(404).send('<!doctype html><html><body style="background:#080610;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>Ticket Not Found</h1><p>The requested mobile pass token is invalid or does not exist.</p><p><a href="/" style="color:#ffb86b">← Return to Brinkberry</a></p></body></html>');
    }

    if (req.headers?.accept?.includes('application/json') || u.searchParams.get('format') === 'json') {
      res.setHeader('content-type', 'application/json');
      return res.status(200).json({ ticket });
    }

    const show = getComedyShowById(ticket.showId);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(200).send(renderTicketPage(ticket, show));
  } catch (err) {
    console.error('Ticket pass error:', err);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(500).send('Server error');
  }
};
