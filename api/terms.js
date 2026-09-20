/**
 * Brinkberry Terms of Service
 * Public terms designed to comply with third-party API platform requirements
 * (including SeatGeek Section 4.3 EULA requirements).
 */

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Terms of Service · Brinkberry</title>
  <meta name="description" content="Brinkberry Terms of Service and End User Agreement.">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b0813;
      color: #ede6f5;
      line-height: 1.6;
      padding: 32px 20px;
      font-size: 15px;
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
      background: #130f1c;
      border: 1px solid #281f38;
      border-radius: 20px;
      padding: 36px 32px;
    }
    h1 { font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 750; color: #ffb86b; margin-top: 28px; margin-bottom: 12px; }
    p { margin-bottom: 14px; color: #cfc5df; }
    ul { margin: 10px 0 16px 24px; color: #cfc5df; }
    li { margin-bottom: 6px; }
    a { color: #ffb86b; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .updated { font-size: 13px; color: #9a8cae; margin-bottom: 24px; }
    .back-link { display: inline-block; margin-bottom: 20px; font-size: 14px; }
    .callout {
      background: #1c152a;
      border-left: 4px solid #ffb86b;
      padding: 14px 18px;
      border-radius: 8px;
      margin: 18px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Back to Brinkberry Live Radar</a>
    <h1>Terms of Service</h1>
    <div class="updated">Last updated: September 20, 2026</div>

    <p>Welcome to <b>Brinkberry</b> (<a href="${ORIGIN}">${ORIGIN}</a>). By accessing or using the Brinkberry website, APIs, or embeddable widgets, you agree to be bound by these Terms of Service.</p>

    <h2>1. The Brinkberry Service</h2>
    <p>Brinkberry provides a real-time, hyperlocal discovery radar that surfaces public entertainment, music, sports, theater, and community events occurring within a rolling 48-hour window. Brinkberry aggregates event data from official community calendars, regional partners, and commercial ticketing providers.</p>

    <h2>2. Independent Discovery & No Endorsement</h2>
    <div class="callout">
      Brinkberry is an independent discovery tool. Third-party event providers, ticketing platforms (including SeatGeek and Ticketmaster), venues, and performers do not sponsor, endorse, or guarantee Brinkberry, and Brinkberry is not an affiliate or agent of these entities unless expressly agreed in writing.
    </div>

    <h2>3. Outbound Ticketing & Third-Party Platforms</h2>
    <p>Brinkberry does not process ticket purchases, broker transactions, or collect credit card information. When you click “Get Tickets” or an event link, you are redirected directly to the third-party event organizer, venue box office, or ticketing platform (e.g., SeatGeek, Ticketmaster, Eventbrite). Any ticket purchase is made solely between you and the respective third-party platform under their terms and policies.</p>

    <h2>4. Acceptable Use</h2>
    <p>You agree not to misuse Brinkberry or its embeddable widgets. Specifically, you may not:</p>
    <ul>
      <li>Scrape, harvest, or systematically download event data or materials.</li>
      <li>Use the service in any way that violates applicable federal, state, or local laws.</li>
      <li>Circumvent rate limits, IP restrictions, or security controls.</li>
      <li>Feed or expose aggregated third-party data into machine learning models or artificial intelligence datasets.</li>
    </ul>

    <h2>5. Disclaimer of Warranties</h2>
    <p>Brinkberry and all event information are provided on an “as-is” and “as-available” basis without warranties of any kind. Event schedules, line-ups, pricing, and availability are subject to change by venues and promoters at any time.</p>

    <h2>6. Limitation of Liability & Third-Party Beneficiaries</h2>
    <p>To the maximum extent permitted by applicable law, Brinkberry and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the service. Third-party data providers whose materials are displayed on Brinkberry are intended third-party beneficiaries of these protective provisions.</p>

    <h2>7. Contact</h2>
    <p>For questions regarding these Terms of Service, please contact <a href="mailto:hello@brinkberry.com">hello@brinkberry.com</a>.</p>
  </div>
</body>
</html>`);
};
