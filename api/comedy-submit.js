/**
 * Comedy Submission Portal & API
 *
 * Provides a frictionless, mobile-optimized submission portal for independent
 * stand-up comics, open mic hosts, and comedy room promoters.
 */

const { addSubmission, updateSubmission, rejectOrCancelSubmission } = require('../lib/comedy/registry');
const { trackSubmission, trackCommunityCorrection } = require('../lib/telemetry');

function renderSubmissionPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Submit a Live Comedy Show | Brinkberry Radar</title>
  <meta name="description" content="List your independent stand-up comedy show, open mic, showcase, or improv night on Brinkberry. Completely free.">
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
      line-height: 1.5;
      padding: 20px 16px 60px;
    }
    .wrap {
      max-width: 620px;
      margin: 0 auto;
    }
    .brand {
      color: #fff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 800;
      display: inline-block;
      margin-bottom: 24px;
    }
    .brand b { color: var(--accent); }
    .hero-card {
      background: linear-gradient(135deg, rgba(34, 21, 51, 0.7) 0%, rgba(18, 13, 28, 0.9) 100%);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 26px;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 184, 107, 0.15);
      border: 1px solid rgba(255, 184, 107, 0.35);
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 26px;
      font-weight: 850;
    }
    p.lead {
      color: var(--text-dim);
      font-size: 14.5px;
      margin: 0 0 14px;
    }
    form {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
    }
    .field {
      margin-bottom: 18px;
    }
    label {
      display: block;
      color: #ded6ec;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    input, select, textarea {
      width: 100%;
      box-sizing: border-box;
      background: #181224;
      border: 1px solid #2e2440;
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 14px;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 10px rgba(255, 184, 107, 0.25);
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row > .field {
      flex: 1;
    }
    .btn-submit {
      width: 100%;
      background: var(--primary);
      color: var(--primary-dark);
      border: none;
      border-radius: 999px;
      padding: 12px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      margin-top: 10px;
      transition: background 0.15s;
    }
    .btn-submit:hover {
      background: #ffa84d;
    }
    #result {
      display: none;
      margin-top: 20px;
      padding: 16px;
      border-radius: 12px;
      background: #0f1c16;
      border: 1px solid #1c4530;
      color: #8ce3b4;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="brand" href="/"><b>●</b> Brinkberry</a>

    <div class="hero-card">
      <div class="badge">🎤 Independent Comedy Radar</div>
      <h1>List Your Comedy Show or Open Mic</h1>
      <p class="lead">Bar showcases, underground clubs, and Tuesday open mics. Free submission, rapid verification, and zero clutter.</p>
    </div>

    <form id="comedyForm">
      <div class="field">
        <label>Show or Open Mic Title *</label>
        <input type="text" id="title" required placeholder="e.g. Cap Hill Tuesday Comedy Open Mic">
      </div>

      <div class="row">
        <div class="field">
          <label>Venue Name *</label>
          <input type="text" id="venue_name" required placeholder="e.g. Comedy Works Downtown">
        </div>
        <div class="field">
          <label>City *</label>
          <input type="text" id="city" required placeholder="e.g. Denver, CO">
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Start Date & Time *</label>
          <input type="datetime-local" id="start_time" required>
        </div>
        <div class="field">
          <label>Show Type</label>
          <select id="showType">
            <option value="standup">Stand-Up Comedy</option>
            <option value="open_mic">Open Mic</option>
            <option value="showcase">Curated Showcase</option>
            <option value="improv">Improv / Sketch</option>
            <option value="headliner">Touring Headliner</option>
          </select>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Comedians / Host (comma separated)</label>
          <input type="text" id="comedians" placeholder="e.g. Sam Tallent, Ericka Dickinson">
        </div>
        <div class="field">
          <label>Age Limit</label>
          <select id="ageLimit">
            <option value="21+">21+</option>
            <option value="18+">18+</option>
            <option value="all_ages">All Ages</option>
          </select>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Price / Cover</label>
          <input type="text" id="price" placeholder="Free / $10 / 2-drink min">
        </div>
        <div class="field">
          <label>Ticket or Venue Link</label>
          <input type="url" id="ticket_url" placeholder="https://...">
        </div>
      </div>

      <div class="field">
        <label>Description & Lineup Details</label>
        <textarea id="description" rows="3" placeholder="Tell spontaneous comedy fans what to expect..."></textarea>
      </div>

      <button type="submit" class="btn-submit">Submit Show for Verification</button>
    </form>

    <div id="result"></div>
  </div>

  <script>
    // Pre-populate datetime to tonight at 8:00 PM
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('start_time').value = localIso;

    document.getElementById('comedyForm').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('title').value.trim(),
        venue_name: document.getElementById('venue_name').value.trim(),
        city: document.getElementById('city').value.trim(),
        start_time: new Date(document.getElementById('start_time').value).toISOString(),
        showType: document.getElementById('showType').value,
        comedians: document.getElementById('comedians').value.split(',').map(s => s.trim()).filter(Boolean),
        ageLimit: document.getElementById('ageLimit').value,
        price: document.getElementById('price').value.trim() || 'Check event',
        ticket_url: document.getElementById('ticket_url').value.trim(),
        description: document.getElementById('description').value.trim()
      };

      try {
        const res = await fetch('/api/comedy/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const rDiv = document.getElementById('result');
        if (res.ok) {
          rDiv.style.display = 'block';
          rDiv.style.background = '#0f1c16';
          rDiv.style.borderColor = '#1c4530';
          rDiv.style.color = '#8ce3b4';
          rDiv.innerHTML = '<strong>✓ Show Submitted!</strong><br>' + (data.message || 'Your show was recorded and entered verification review.') + '<br><small>Submission ID: ' + data.id + '</small>';
          document.getElementById('comedyForm').reset();
        } else {
          rDiv.style.display = 'block';
          rDiv.style.background = '#2a1118';
          rDiv.style.borderColor = '#521d2b';
          rDiv.style.color = '#ff8ca3';
          rDiv.innerHTML = '<strong>Error:</strong> ' + (data.error || 'Submission failed');
        }
      } catch (err) {
        alert('Failed to submit: ' + err.message);
      }
    };
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.status(200).send(renderSubmissionPage());
    }

    if (req.method === 'POST') {
      const u = new URL(req.url || '/', 'https://brinkberry.local');

      let payload = req.body || null;
      if (!payload || typeof payload !== 'object') {
        let body = '';
        if (req[Symbol.asyncIterator]) {
          for await (const chunk of req) body += chunk;
        }
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          res.setHeader('content-type', 'application/json');
          return res.status(400).json({ error: 'Invalid JSON payload' });
        }
      }

      const action = u.searchParams.get('action') || payload.action;

      // Handle Edit / Correction Request
      if (action === 'edit') {
        const id = payload.id || u.searchParams.get('id');
        const editKey = payload.editKey || u.searchParams.get('editKey');
        if (!id || !editKey) {
          res.setHeader('content-type', 'application/json');
          return res.status(400).json({ error: 'Submission ID and editKey required' });
        }
        const updated = updateSubmission(id, editKey, payload.updates || payload);
        trackCommunityCorrection('correction', updated.id);
        res.setHeader('content-type', 'application/json');
        return res.status(200).json({
          success: true,
          id: updated.id,
          show: updated,
          status: updated.verification.status,
          message: `Show "${updated.title}" successfully updated.`
        });
      }

      // Handle Cancel Show
      if (action === 'cancel') {
        const id = payload.id || u.searchParams.get('id');
        const editKey = payload.editKey || u.searchParams.get('editKey');
        if (!id || !editKey) {
          res.setHeader('content-type', 'application/json');
          return res.status(400).json({ error: 'Submission ID and editKey required' });
        }
        const cancelled = rejectOrCancelSubmission(id, { editKey, actor: 'organizer', notes: payload.notes });
        trackCommunityCorrection('correction', cancelled.id);
        res.setHeader('content-type', 'application/json');
        return res.status(200).json({
          success: true,
          id: cancelled.id,
          status: cancelled.verification.status,
          message: `Show "${cancelled.title}" marked cancelled.`
        });
      }

      // Standard New Submission
      const submission = addSubmission(payload);
      trackCommunityCorrection('submission', submission.id);
      res.setHeader('content-type', 'application/json');
      return res.status(200).json({
        success: true,
        id: submission.id,
        editKey: submission.verification.editKey,
        status: submission.verification.status,
        lastVerifiedAt: submission.lastVerifiedAt,
        sourceAttribution: submission.sourceAttribution,
        message: `Show "${submission.title}" received and entered pending review. Save your edit key (${submission.verification.editKey}) to make updates anytime.`
      });
    }

    res.setHeader('content-type', 'application/json');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Comedy submission error:', err);
    res.setHeader('content-type', 'application/json');
    return res.status(400).json({ error: err.message || 'Submission error' });
  }
};
