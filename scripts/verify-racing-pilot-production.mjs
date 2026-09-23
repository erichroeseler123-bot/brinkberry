/**
 * Live Production Verification Script for Grassroots Motorsports Pilot
 *
 * Verifies live endpoints on https://brinkberry.com:
 * - Operations dashboard & telemetry API (/admin/pilot-racing, /racing/pilot, /api/racing/pilot-metrics)
 * - Canonical track profiles (/track/:slug)
 * - Touring series profile & fan demand console (/series/:slug)
 * - Track claim form (/track/:slug/claim)
 * - Shareable social race cards (HTML, 1200x630 OG SVG, 1080x1920 Story SVG)
 * - City racing landing guide (/denver/racing)
 * - Direct checkout lockdown (403 prototype_disabled)
 * - Unauthorized purge protection (403 Forbidden)
 */

const TARGET_HOST = process.env.VERIFY_HOST || 'https://brinkberry.com';

async function testEndpoint(name, path, options = {}, validator) {
  const url = `${TARGET_HOST}${path}`;
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const bodyText = await res.text();
    let jsonData = null;
    if (contentType.includes('json')) {
      try { jsonData = JSON.parse(bodyText); } catch {}
    }

    const check = validator({ res, contentType, bodyText, jsonData });
    if (check === true) {
      console.log(`  ✓ [PASS] ${name} (${res.status})`);
      return true;
    } else {
      console.error(`  ✗ [FAIL] ${name} (${res.status}): ${check}`);
      return false;
    }
  } catch (err) {
    console.error(`  ✗ [ERROR] ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`\n===============================================================`);
  console.log(`🚀 Verifying Motorsports & Race Track Pilot on ${TARGET_HOST}`);
  console.log(`===============================================================\n`);

  let allPassed = true;

  // 1. Operations Dashboard HTML
  allPassed = await testEndpoint(
    'Operations Dashboard HTML (/admin/pilot-racing)',
    '/admin/pilot-racing',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Motorsports &amp; Short Track Pilot Operations')) return 'Missing dashboard title';
      if (!bodyText.includes('Verified Living Race Calendar')) return 'Missing race calendar';
      if (!bodyText.includes('Track Promoter Claim Packets')) return 'Missing claim packets';
      if (!bodyText.includes('Ticketing Lockdown Active')) return 'Missing guardrails notice';
      return true;
    }
  ) && allPassed;

  // 2. Dashboard Alternate Route (/racing/pilot)
  allPassed = await testEndpoint(
    'Dashboard Alternate Route (/racing/pilot)',
    '/racing/pilot',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Motorsports &amp; Short Track Pilot Operations')) return 'Missing dashboard title';
      return true;
    }
  ) && allPassed;

  // 3. Telemetry JSON API (/api/racing/pilot-metrics)
  allPassed = await testEndpoint(
    'Telemetry JSON API (/api/racing/pilot-metrics)',
    '/api/racing/pilot-metrics',
    { method: 'GET' },
    ({ res, jsonData }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!jsonData?.success) return 'Missing success: true';
      if ((jsonData.inventory?.tracksCount || 0) < 7) return `Expected >= 7 tracks, got ${jsonData.inventory?.tracksCount}`;
      if ((jsonData.inventory?.racesCount || 0) < 8) return `Expected >= 8 races, got ${jsonData.inventory?.racesCount}`;
      if ((jsonData.inventory?.outreachPacketsCount || 0) !== 7) return `Expected 7 outreach packets, got ${jsonData.inventory?.outreachPacketsCount}`;
      if (!jsonData.summary?.metrics?.guideViews) return 'Missing guideViews metric';
      return true;
    }
  ) && allPassed;

  // 4. Canonical Track Profile: Colorado National Speedway (with 30d planning window)
  allPassed = await testEndpoint(
    'Track Profile & Planning Windows: CNS (/track/colorado-national-speedway?window=30d)',
    '/track/colorado-national-speedway?window=30d',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Colorado National Speedway')) return 'Missing track name';
      if (!bodyText.includes('Paved Short Track')) return 'Missing surface display';
      if (!bodyText.includes('Next 30 Days Racing Outlook')) return 'Missing 30d window title';
      if (!bodyText.includes('48h Radar') || !bodyText.includes('Full Season')) return 'Missing planning window tabs';
      if (!bodyText.includes('Claim Track Page')) return 'Missing claim button';
      return true;
    }
  ) && allPassed;

  // 5. Canonical Track Profile: Red Cedar Speedway (Eau Claire Pilot Comparison)
  allPassed = await testEndpoint(
    'Eau Claire Track Profile: Red Cedar Speedway (/track/red-cedar-speedway)',
    '/track/red-cedar-speedway',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Red Cedar Speedway')) return 'Missing track name';
      if (!bodyText.includes('Dirt Oval')) return 'Missing surface display';
      if (!bodyText.includes('WISSOTA')) return 'Missing WISSOTA sanctioning';
      return true;
    }
  ) && allPassed;

  // 6. Canonical Track Profile: I-76 Speedway (Dirt Oval)
  allPassed = await testEndpoint(
    'Track Profile: I-76 Speedway (/track/i-76-speedway)',
    '/track/i-76-speedway',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('I-76 Speedway')) return 'Missing track name';
      if (!bodyText.includes('Dirt Oval')) return 'Missing surface display';
      return true;
    }
  ) && allPassed;

  // 6. Canonical Touring Series Profile: World of Outlaws
  allPassed = await testEndpoint(
    'Series Profile & Fan Demand: World of Outlaws (/series/world-of-outlaws)',
    '/series/world-of-outlaws',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('World of Outlaws')) return 'Missing series name';
      if (!bodyText.includes('Bring World of Outlaws') && !bodyText.includes('to Your Home Track')) return 'Missing fan demand console';
      if (!bodyText.includes('Select Target Race Track')) return 'Missing track selector';
      return true;
    }
  ) && allPassed;

  // 7. Track Claim Form UI
  allPassed = await testEndpoint(
    'Track Claim Form UI (/track/colorado-national-speedway/claim)',
    '/track/colorado-national-speedway/claim',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Claim &amp; Verify Colorado National Speedway')) return 'Missing claim header';
      if (!bodyText.includes('Official Work Email')) return 'Missing email field';
      if (!bodyText.includes('Free Guarantee for Track Promoters')) return 'Missing free guarantee';
      return true;
    }
  ) && allPassed;

  // 8. Social Race Card HTML Preview
  allPassed = await testEndpoint(
    'Social Race Card Preview (/card/race/race_seed_cns_01)',
    '/card/race/race_seed_cns_01',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Colorado National Speedway')) return 'Missing track name';
      if (!bodyText.includes('Story Card')) return 'Missing story card action';
      return true;
    }
  ) && allPassed;

  // 9. Open Graph 1200x630 SVG Card
  allPassed = await testEndpoint(
    'Open Graph 1200x630 SVG Card (/card/race/race_seed_cns_01/svg)',
    '/card/race/race_seed_cns_01/svg',
    { method: 'GET' },
    ({ res, contentType, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!contentType.includes('image/svg+xml')) return `Expected image/svg+xml, got ${contentType}`;
      if (!bodyText.includes('viewBox="0 0 1200 630"')) return 'Missing 1200x630 viewBox';
      if (!bodyText.includes('Colorado National Speedway')) return 'Missing track name in SVG';
      return true;
    }
  ) && allPassed;

  // 10. Instagram Story 1080x1920 Vertical SVG Card
  allPassed = await testEndpoint(
    'Instagram Story 1080x1920 SVG Card (/card/race/race_seed_cns_01/story)',
    '/card/race/race_seed_cns_01/story',
    { method: 'GET' },
    ({ res, contentType, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!contentType.includes('image/svg+xml')) return `Expected image/svg+xml, got ${contentType}`;
      if (!bodyText.includes('viewBox="0 0 1080 1920"')) return 'Missing 1080x1920 viewBox';
      if (!bodyText.includes('RACE DAY RADAR')) return 'Missing race day badge';
      return true;
    }
  ) && allPassed;

  // 11. City Racing Guide (/denver/racing)
  allPassed = await testEndpoint(
    'City Racing Guide (/denver/racing)',
    '/denver/racing',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('Live Grassroots Motorsports') && !bodyText.includes('Short Track Racing')) return 'Missing racing guide title';
      if (!bodyText.includes('Colorado National Speedway') && !bodyText.includes('Speedway')) return 'Missing seed tracks in guide';
      return true;
    }
  ) && allPassed;

  // 12. Security Guardrail: Direct Ticketing Checkout Lockdown
  allPassed = await testEndpoint(
    'Guardrail: Direct Ticketing Checkout Disabled (/api/comedy/checkout)',
    '/api/comedy/checkout',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId: 'race_seed_cns_01', quantity: 2 })
    },
    ({ res, jsonData }) => {
      if (res.status !== 403) return `Expected 403 Forbidden, got ${res.status}`;
      if (jsonData?.status !== 'prototype_disabled') return `Expected status: prototype_disabled, got ${jsonData?.status}`;
      return true;
    }
  ) && allPassed;

  // 13. Security Guardrail: Unauthorized Purge Blocked
  allPassed = await testEndpoint(
    'Guardrail: Unauthorized Claim Purge Blocked (/api/racing/claim)',
    '/api/racing/claim',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'purge_test', claimId: 'fake_claim' })
    },
    ({ res }) => {
      if (res.status !== 403) return `Expected 403 Forbidden, got ${res.status}`;
      return true;
    }
  ) && allPassed;

  // 14. Unauthorized Demand Purge Blocked
  allPassed = await testEndpoint(
    'Guardrail: Unauthorized Demand Purge Blocked (/api/racing/demand)',
    '/api/racing/demand',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'purge_test', entitySlug: 'world-of-outlaws' })
    },
    ({ res }) => {
      if (res.status !== 403) return `Expected 403 Forbidden, got ${res.status}`;
      return true;
    }
  ) && allPassed;

  // 15. Homepage Clear Vertical Entry Paths
  allPassed = await testEndpoint(
    'Homepage Entry Paths: Everything, Comedy & Motorsports (/)',
    '/',
    { method: 'GET' },
    ({ res, bodyText }) => {
      if (res.status !== 200) return `Expected 200, got ${res.status}`;
      if (!bodyText.includes('hero-vertical-entry-paths')) return 'Missing hero-vertical-entry-paths';
      if (!bodyText.includes('id="entryPathAll"')) return 'Missing entryPathAll button';
      if (!bodyText.includes('id="entryPathComedy"')) return 'Missing entryPathComedy button';
      if (!bodyText.includes('id="entryPathRacing"')) return 'Missing entryPathRacing button';
      if (!bodyText.includes('Motorsports near me')) return 'Missing Motorsports near me text';
      return true;
    }
  ) && allPassed;

  console.log(`\n===============================================================`);
  if (allPassed) {
    console.log(`🏁 All 15 production checks PASSED successfully!`);
    console.log(`===============================================================\n`);
    process.exit(0);
  } else {
    console.error(`❌ One or more verification checks failed.`);
    console.log(`===============================================================\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
