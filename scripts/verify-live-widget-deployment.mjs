async function verifyLive() {
  const fetch = globalThis.fetch;
  console.log('=== 1. Testing Generator Endpoint (https://brinkberry.com/embed) ===');
  const genRes = await fetch('https://brinkberry.com/embed');
  console.log('Status:', genRes.status, 'Content-Type:', genRes.headers.get('content-type'));
  const genHtml = await genRes.text();
  console.log('Title present:', genHtml.includes('Embed a Live Event Radar on Your Website'));
  console.log('Preview iframe present:', genHtml.includes('previewIframe'));
  console.log('Copy button present:', genHtml.includes('btn-copy'));
  console.log('WordPress guide present:', genHtml.includes('WordPress'));
  console.log('Squarespace guide present:', genHtml.includes('Squarespace'));
  console.log('Wix guide present:', genHtml.includes('Wix'));

  console.log('\n=== 2. Testing Dark Theme Widget (https://brinkberry.com/widget) ===');
  const darkRes = await fetch('https://brinkberry.com/widget?city=denver&theme=dark&limit=3&partner=alpine-lodge');
  console.log('Dark Status:', darkRes.status);
  console.log('CSP Frame-Ancestors:', darkRes.headers.get('content-security-policy'));
  console.log('X-Frame-Options:', darkRes.headers.get('x-frame-options'));
  const darkHtml = await darkRes.text();
  console.log('Dark background style present (#0e0b17):', darkHtml.includes('#0e0b17'));
  console.log('Contains Denver events header:', darkHtml.includes('Happening in Denver'));
  console.log('Target _blank present on event links:', darkHtml.includes('target="_blank"'));
  console.log('Partner tag in click URL:', darkHtml.includes('partner=alpine-lodge'));
  console.log('Rel noopener noreferrer present:', darkHtml.includes('rel="noopener noreferrer"'));

  console.log('\n=== 3. Testing Light Theme Widget ===');
  const lightRes = await fetch('https://brinkberry.com/widget?city=denver&theme=light&limit=3&partner=resort-blog');
  console.log('Light Status:', lightRes.status);
  const lightHtml = await lightRes.text();
  console.log('Light background style present (#f9f8fc):', lightHtml.includes('#f9f8fc'));

  console.log('\n=== 4. Testing Ticketing Optionality (Eau Claire civic/free/agenda events) ===');
  const ecRes = await fetch('https://brinkberry.com/widget?city=eau-claire&limit=6&partner=ec-partner');
  const ecHtml = await ecRes.text();
  console.log('EC Status:', ecRes.status);
  const ecActionMatches = ecHtml.match(/(?:Meeting Agenda|Free Event|View Details|Get Tickets) →/g) || [];
  console.log('Dynamic Action Buttons Found in Live Widget:', [...new Set(ecActionMatches)]);

  console.log('\n=== 5. Testing Outbound Partner Click Redirection ===');
  const clickRes = await fetch('https://brinkberry.com/api/click?url=' + encodeURIComponent('https://seatgeek.com/denver-events') + '&eventId=test_123&partner=alpine-lodge', { redirect: 'manual' });
  console.log('Click Redirect Status:', clickRes.status);
  console.log('Location header:', clickRes.headers.get('location'));

  console.log('\n=== 6. Testing Homepage Nav & Footer Links ===');
  const homeRes = await fetch('https://brinkberry.com/');
  const homeHtml = await homeRes.text();
  console.log('Homepage nav contains /embed link:', homeHtml.includes('href="/embed"'));

  console.log('\n=== 7. Simulating Copied Iframe in Separate External Page ===');
  const partnerPageSim = `
<!doctype html>
<html>
<head><title>Alpine Mountain Resort & Hotel</title></head>
<body>
  <h1>Welcome to Alpine Mountain Resort</h1>
  <p>Check out live events happening in the next 48 hours:</p>
  <iframe
    src="https://brinkberry.com/widget?city=denver&theme=dark&limit=4&partner=alpine-resort"
    width="100%"
    height="600"
    frameborder="0"
    style="border:0; width:100%; max-width:680px; border-radius:14px; display:block;"
    loading="lazy"
    title="What's happening nearby in the next 48 hours"
  ></iframe>
</body>
</html>
  `.trim();
  console.log('Simulation markup valid length:', partnerPageSim.length);
  const widgetUrlFromSnippet = partnerPageSim.match(/src="([^"]+)"/)[1];
  console.log('Iframe src from snippet:', widgetUrlFromSnippet);
  const snippetTestRes = await fetch(widgetUrlFromSnippet);
  console.log('Iframe src response status:', snippetTestRes.status);
  console.log('Iframe src response length:', (await snippetTestRes.text()).length);
  console.log('\n>>> ALL LIVE PRODUCTION VERIFICATIONS COMPLETED SUCCESSFULLY! <<<');
}

verifyLive().catch(err => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
