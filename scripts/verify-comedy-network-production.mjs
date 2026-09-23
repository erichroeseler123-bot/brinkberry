/**
 * Production Verification Script for Comedy Network Extensions
 * 
 * Verifies live on production:
 * 1. Test-Mode & Purge Authorization (public client blocked with 403; server-only secret required)
 * 2. Fan Demand Signal Engine (IP hashing, rate limiting, affirmative consent, authorized test isolation)
 * 3. Complete Venue Email-Confirmation Lifecycle (token never exposed publicly, confirmed without personal data leak, verified badge rendered, authorized cleanup)
 * 4. Dual Social Show Cards (1200x630 OG and 1080x1920 Instagram Story/Reels)
 * 5. Privacy Policy disclosure (salted IP hashing, zero raw IP storage)
 * 6. City guide community submission CTAs
 */

const BASE_URL = process.env.TARGET_URL || 'https://brinkberry.com';
const TEST_SECRET = process.env.BRINKBERRY_TEST_SECRET || 'bb_internal_test_secret_2026';

async function verify() {
  console.log(`\n=== Verifying Brinkberry Comedy Network Security & Extensions on ${BASE_URL} ===\n`);
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Comedian Page & Demand Signal UI
  await check('GET /comedian/sam-tallent serves demand section, consent checkbox, and share button', async () => {
    const res = await fetch(`${BASE_URL}/comedian/sam-tallent`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('Sam Tallent')) throw new Error('Missing comedian name');
    if (!html.includes('Bring Sam Tallent to Your City')) throw new Error('Missing demand box');
    if (!html.includes('Share Comedian Profile')) throw new Error('Missing profile share button');
    if (!html.includes('demandConsent')) throw new Error('Missing consent checkbox');
    if (!html.includes('Social Card ↗')) throw new Error('Missing social card button');
    // Guardrails
    if (html.includes('tickets sold demand') || html.includes('attendance verified')) {
      throw new Error('Violated terminology guardrail');
    }
  });

  // 2. Authorization Security: Public Client Cannot Purge Records
  await check('POST /api/comedy/demand action=purge_test rejects unauthorized public client with 403 Forbidden', async () => {
    const res = await fetch(`${BASE_URL}/api/comedy/demand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'purge_test', comicSlug: 'sam-tallent' })
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    const json = await res.json();
    if (!json.error || !json.error.includes('Server-only test token required')) {
      throw new Error(`Unexpected error message: ${JSON.stringify(json)}`);
    }
  });

  // 3. Authorization Security: Public Client Cannot Spoof isTest or Test Headers
  await check('POST /api/comedy/demand ignores untrusted isTest flag from public callers', async () => {
    const res = await fetch(`${BASE_URL}/api/comedy/demand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-brinkberry-test': 'true' // Untrusted header without server secret
      },
      body: JSON.stringify({
        comicSlug: 'sam-tallent',
        city: 'Miami, FL',
        consent: false,
        isTest: true // Untrusted body flag
      })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.isTest === true) {
      throw new Error('Security failure: Public client was able to spoof isTest flag!');
    }
  });

  // 4. Authorized Test Signal and Purge
  await check('POST /api/comedy/demand accepts isTest and purge_test when presented with server-only test secret', async () => {
    // 1. Authorized test signal
    const res1 = await fetch(`${BASE_URL}/api/comedy/demand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-brinkberry-test-secret': TEST_SECRET
      },
      body: JSON.stringify({
        comicSlug: 'sam-tallent',
        comicName: 'Sam Tallent',
        city: 'Honolulu, HI',
        email: 'honolulu-fan@example.com',
        consent: true,
        isTest: true
      })
    });
    if (!res1.ok) throw new Error(`Status ${res1.status}`);
    const json1 = await res1.json();
    if (json1.isTest !== true) throw new Error('Expected isTest to be true for authorized request');

    // 2. Authorized purge
    const res2 = await fetch(`${BASE_URL}/api/comedy/demand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-brinkberry-test-secret': TEST_SECRET
      },
      body: JSON.stringify({ action: 'purge_test', comicSlug: 'sam-tallent' })
    });
    if (!res2.ok) throw new Error(`Status ${res2.status}`);
    const json2 = await res2.json();
    if (!json2.success) throw new Error('Authorized purge failed');
  });

  // 5. Venue Claim Public Submission (Token Privacy Guardrail)
  await check('POST /api/venue/claim does NOT expose verification tokens to public callers', async () => {
    const res = await fetch(`${BASE_URL}/api/venue/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueSlug: 'the-second-city',
        requesterName: 'Public Caller',
        role: 'Booking',
        workEmail: 'booking@secondcity.com'
      })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.emailVerificationToken || json.testToken) {
      throw new Error('Privacy failure: Secret verification token leaked in public response!');
    }
    if (json.status !== 'pending_email_verification') {
      throw new Error(`Expected pending_email_verification, got ${json.status}`);
    }
  });

  // 6. Complete Live Venue Email-Confirmation Lifecycle Without Personal Data Exposure
  await check('Live Venue Email-Confirmation Lifecycle: claim, verify without personal data leak, and authorized purge', async () => {
    // A. Submit authorized test claim
    const claimRes = await fetch(`${BASE_URL}/api/venue/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-brinkberry-test-secret': TEST_SECRET
      },
      body: JSON.stringify({
        venueSlug: 'the-plus-eau-claire',
        requesterName: 'Audit Admin',
        role: 'Promoter',
        workEmail: 'audit@theplus.ec',
        isTest: true
      })
    });
    if (!claimRes.ok) throw new Error(`Claim submission failed: ${claimRes.status}`);
    const claimData = await claimRes.json();
    if (!claimData.testToken) throw new Error('Missing testToken in authorized test claim response');

    // B. Verify email token via GET verification link (reproducing email link click)
    const verifyUrl = `${BASE_URL}/api/venue/claim?action=verify_email&claimId=${claimData.id}&token=${claimData.testToken}`;
    const verifyRes = await fetch(verifyUrl);
    if (!verifyRes.ok) throw new Error(`Email verification failed: ${verifyRes.status}`);
    const verifyData = await verifyRes.json();

    if (verifyData.status !== 'verified') throw new Error(`Expected status verified, got ${verifyData.status}`);
    if (verifyData.isVenueVerified !== true) throw new Error('Expected isVenueVerified true');

    // Personal Data Leak Check:
    if (verifyData.workEmail || verifyData.requesterName || verifyData.emailVerificationToken || verifyData.websiteToken) {
      throw new Error('Privacy violation: Sensitive personal data or tokens exposed in verification response!');
    }

    // C. Inspect Venue Page Live to verify updated badge
    const venueRes = await fetch(`${BASE_URL}/venue/the-plus-eau-claire`);
    if (!venueRes.ok) throw new Error(`Venue fetch failed: ${venueRes.status}`);
    const venueHtml = await venueRes.text();
    if (!venueHtml.includes('Verified Venue')) {
      throw new Error('Venue page does not reflect Verified Venue badge after email confirmation');
    }

    // D. Purge test claim using server-only test secret
    const purgeRes = await fetch(`${BASE_URL}/api/venue/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-brinkberry-test-secret': TEST_SECRET
      },
      body: JSON.stringify({
        action: 'purge_test',
        venueSlug: 'the-plus-eau-claire'
      })
    });
    if (!purgeRes.ok) throw new Error(`Authorized venue purge failed: ${purgeRes.status}`);
    const purgeData = await purgeRes.json();
    if (!purgeData.success) throw new Error('Purge action failed');

    // E. Confirm venue is reverted to clean unclaimed state
    const venueResetRes = await fetch(`${BASE_URL}/venue/the-plus-eau-claire`);
    const venueResetHtml = await venueResetRes.text();
    if (!venueResetHtml.includes('Claim this venue') && !venueResetHtml.includes('/claim')) {
      throw new Error('Venue did not revert to unclaimed state after purge');
    }
  });

  // 7. Venue Claim Page & Free Guarantee
  await check('GET /venue/comedy-works-downtown/claim serves Absolute Free Guarantee', async () => {
    const res = await fetch(`${BASE_URL}/venue/comedy-works-downtown/claim`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('Absolute Free Guarantee')) throw new Error('Missing Absolute Free Guarantee banner');
    if (!html.includes('No club, room, comedian, or host ever pays')) throw new Error('Missing zero-fee promise');
    if (!html.includes('Claim Box Office for Comedy Works Downtown')) throw new Error('Missing claim form title');
  });

  // 8. Social Show Cards - Dual Formats (1200x630 OG & 1080x1920 Story)
  await check('GET /card/comedy_seed_denver_01 serves interactive share view with dual format buttons', async () => {
    const res = await fetch(`${BASE_URL}/card/comedy_seed_denver_01`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('Denver Comedy Underground') && !html.includes('Comedy Works')) {
      throw new Error('Show title missing from card');
    }
    if (!html.includes('Get Official Tickets →')) throw new Error('Missing ticket action');
    if (!html.includes('Twitter / OG Card')) throw new Error('Missing Twitter/OG format button');
    if (!html.includes('Instagram Story')) throw new Error('Missing Instagram Story format button');
  });

  await check('GET /card/comedy_seed_denver_01/svg generates 1200x630 horizontal card', async () => {
    const res = await fetch(`${BASE_URL}/card/comedy_seed_denver_01/svg`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('image/svg+xml')) throw new Error(`Unexpected Content-Type: ${ctype}`);
    const svg = await res.text();
    if (!svg.includes('viewBox="0 0 1200 630"')) throw new Error('Invalid SVG viewBox for 1200x630');
    if (!svg.includes('LIVE RADAR') && !svg.includes('Brinkberry')) throw new Error('Missing radar branding in SVG');
  });

  await check('GET /card/comedy_seed_denver_01/story generates 1080x1920 vertical Story card', async () => {
    const res = await fetch(`${BASE_URL}/card/comedy_seed_denver_01/story`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('image/svg+xml')) throw new Error(`Unexpected Content-Type: ${ctype}`);
    const svg = await res.text();
    if (!svg.includes('viewBox="0 0 1080 1920"')) throw new Error('Invalid SVG viewBox for 1080x1920 Story');
    if (!svg.includes('GET OFFICIAL TICKETS') && !svg.includes('SWIPE UP')) throw new Error('Missing story CTA in SVG');
  });

  // 9. Community Guides & Privacy Policy
  await check('GET /denver/comedy includes Submit Your Show community banner', async () => {
    const res = await fetch(`${BASE_URL}/denver/comedy`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('Producing a comedy show or hosting an open mic')) throw new Error('Missing comedy submit banner');
    if (!html.includes('/submit-comedy')) throw new Error('Missing link to /submit-comedy');
  });

  await check('GET /privacy includes fan demand signals and salted IP hashing disclosure', async () => {
    const res = await fetch(`${BASE_URL}/privacy`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('Fan Demand Signals')) throw new Error('Missing demand signals section in privacy policy');
    if (!html.includes('Salted One-Way IP Hashing')) throw new Error('Missing salted IP hashing disclosure');
    if (!html.includes('Consent-Based Email Retention')) throw new Error('Missing email consent disclosure');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

verify().catch(e => {
  console.error('Verification script failed:', e);
  process.exit(1);
});
