/**
 * Brinkberry Privacy Policy
 * Public privacy notice designed to comply with third-party API platform requirements
 * (including SeatGeek Section 4.4 Application Privacy Policy requirements).
 */

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Privacy Policy · Brinkberry</title>
  <meta name="description" content="Brinkberry Privacy Policy and Data Collection Practices.">
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
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Back to Brinkberry Live Radar</a>
    <h1>Privacy Policy</h1>
    <div class="updated">Last updated: September 20, 2026</div>

    <p>This Privacy Policy explains how <b>Brinkberry</b> (<a href="${ORIGIN}">${ORIGIN}</a>) handles information when you visit our website, use our local discovery features, or interact with our embeddable widgets.</p>

    <h2>1. Information We Collect</h2>
    <p>Brinkberry is designed with a privacy-first approach. We do not require user accounts, passwords, or personal identity profiles to search for events.</p>
    <ul>
      <li><b>Approximate Geolocation:</b> When you permit browser location access or search for a city, your approximate coordinates (latitude and longitude) are used strictly to calculate distance to nearby events within your requested search radius. We do not store or track your real-time GPS history.</li>
      <li><b>Local Preferences:</b> Selected preset cities or filter preferences (e.g. vibe filters, search radius) may be stored locally in your browser’s <code>localStorage</code> for your convenience.</li>
      <li><b>Server Logs:</b> Like standard web services, our servers (hosted on Vercel) log basic diagnostic details such as IP address, request timestamp, browser user-agent, and referral URL for security, rate limiting, and abuse prevention.</li>
    </ul>

    <h2>2. Outbound Links to Third-Party Ticketing Services</h2>
    <p>When you click “Get Tickets” or event links, you leave Brinkberry and are redirected to third-party services such as SeatGeek, Ticketmaster, or venue ticketing pages. Those third parties operate under their own independent privacy notices and terms. We encourage you to review their policies when purchasing tickets or submitting payment details.</p>

    <h2>3. Data Sharing & Third-Party APIs</h2>
    <p>We do not sell, rent, or monetize your personal information to third parties or data brokers. We query third-party event APIs (such as SeatGeek) server-side using geographic coordinates to fetch public event listings without transmitting personal user identifiers.</p>

    <h2>4. Cookies & Tracking</h2>
    <p>Brinkberry does not use invasive third-party tracking cookies or cross-site tracking pixels. Local browser storage is used solely to remember your preferred city and radar settings.</p>

    <h2>5. Updates to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated revision date.</p>

    <h2>6. Contact Us</h2>
    <p>If you have any questions or concerns regarding our privacy practices, please contact us at <a href="mailto:privacy@brinkberry.com">privacy@brinkberry.com</a>.</p>
  </div>
</body>
</html>`);
};
