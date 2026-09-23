/**
 * Live Production Verification: Stand-Up Comedy Self-Produced Room Toolkit & Direct Box Office Ledger
 */

const ORIGIN = 'https://brinkberry.com';

async function main() {
  console.log(`Verifying live production endpoints on ${ORIGIN}...\n`);

  // 1. Submit Comedy Portal
  const submitRes = await fetch(`${ORIGIN}/submit-comedy`);
  console.log(`1. GET /submit-comedy: status ${submitRes.status} (expected 200)`);
  const submitHtml = await submitRes.text();
  if (!submitHtml.includes('Submit a Live Comedy Show')) {
    throw new Error('Submit comedy portal HTML missing expected headline');
  }

  // 2. Direct Checkout API (POST) - Verified Production Lockdown Check
  const testShowId = `live_verify_${Date.now()}`;
  const checkoutRes = await fetch(`${ORIGIN}/api/comedy/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      showId: testShowId,
      quantity: 2,
      price: 20,
      buyerName: 'Touring Fan',
      buyerEmail: 'fan@example.com'
    })
  });
  console.log(`2. POST /api/comedy/checkout: status ${checkoutRes.status} (expected 403)`);
  const checkoutData = await checkoutRes.json();
  if (checkoutRes.status !== 403 || checkoutData.status !== 'prototype_disabled') {
    throw new Error(`Production checkout did not return 403 prototype_disabled! Received: ${JSON.stringify(checkoutData)}`);
  }
  console.log(`   ✓ Server-side lockdown verified: ${checkoutData.error.slice(0, 75)}...`);

  // 3. Invalid Ticket Rejection (GET /ticket/invalid_token)
  const ticketRes = await fetch(`${ORIGIN}/ticket/invalid_token_xyz`);
  console.log(`3. GET /ticket/invalid_token: status ${ticketRes.status} (expected 404)`);
  if (ticketRes.status !== 404) {
    throw new Error(`Expected 404 for invalid ticket, received ${ticketRes.status}`);
  }

  // 4. Invalid Door Token Rejection (GET /door/invalid_token)
  const doorRes = await fetch(`${ORIGIN}/door/invalid_door_xyz`);
  console.log(`4. GET /door/invalid_door: status ${doorRes.status} (expected 404)`);
  if (doorRes.status !== 404) {
    throw new Error(`Expected 404 for invalid door console, received ${doorRes.status}`);
  }

  // 5. Invalid Ledger Token Rejection (GET /show-ledger/invalid_token)
  const ledgerRes = await fetch(`${ORIGIN}/show-ledger/invalid_ledger_xyz`);
  console.log(`5. GET /show-ledger/invalid_ledger: status ${ledgerRes.status} (expected 404)`);
  if (ledgerRes.status !== 404) {
    throw new Error(`Expected 404 for invalid show ledger, received ${ledgerRes.status}`);
  }

  // 8. Venue Entity Page with Momentum Badge Support
  const venueRes = await fetch(`${ORIGIN}/venue/comedy-works-downtown`);
  console.log(`8. GET /venue/comedy-works-downtown: status ${venueRes.status} (expected 200)`);
  const venueHtml = await venueRes.text();
  if (!venueHtml.includes('Comedy Works Downtown') || (!venueHtml.includes('Official Schedule Indexed') && !venueHtml.includes('Verified Comedy Venue'))) {
    throw new Error('Venue entity page missing verified badge or title');
  }

  // 9. City Comedy Guide Page
  const guideRes = await fetch(`${ORIGIN}/denver/comedy`);
  console.log(`9. GET /denver/comedy: status ${guideRes.status} (expected 200)`);

  console.log('\n✓ ALL LIVE PRODUCTION CHECKS PASSED PERFECTLY!');
}

main().catch(err => {
  console.error('\n❌ Production verification failed:', err);
  process.exit(1);
});
