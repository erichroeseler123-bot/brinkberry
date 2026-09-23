async function run() {
  const base = 'https://brinkberry.com';
  console.log('--- 1. Checking Homepage ---');
  const homeRes = await fetch(base + '/');
  const homeHtml = await homeRes.text();
  console.log('Home status:', homeRes.status);
  console.log('Contains "What should I do tonight?":', homeHtml.includes('What should I do tonight?'));
  console.log('Contains categoryRow:', homeHtml.includes('id="categoryRow"'));
  console.log('Contains comedySubFilterConsole:', homeHtml.includes('id="comedySubFilterConsole"'));
  console.log('Contains Independent Live Discovery notice:', homeHtml.includes('Independent Live Discovery'));

  console.log('\n--- 2. Checking SEO Landing Routes ---');
  for (const path of ['/denver/open-mics', '/denver/comedy-clubs', '/denver/cheap-comedy']) {
    const res = await fetch(base + path);
    console.log(path, 'Status:', res.status);
  }

  console.log('\n--- 3. Checking Venue Page ---');
  const venueRes = await fetch(base + '/venue/comedy-works-downtown');
  console.log('Venue status:', venueRes.status);
  const venueHtml = await venueRes.text();
  console.log('Venue has box office disclaimer:', venueHtml.includes('independent discovery platform'));

  console.log('\n--- 4. Checking Submit Comedy Page ---');
  const submitRes = await fetch(base + '/submit-comedy');
  console.log('Submit show status:', submitRes.status);

  console.log('\n--- 5. Checking Checkout Lockdown ---');
  const checkoutRes = await fetch(base + '/api/comedy-checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'test' })
  });
  console.log('Checkout status:', checkoutRes.status);
  const checkoutJson = await checkoutRes.json();
  console.log('Checkout code:', checkoutJson.status, '| error:', checkoutJson.error?.slice(0, 60));

  console.log('\n--- 6. Checking Feed Comedy Sub-filtering ---');
  const feedRes = await fetch(base + '/api/feed?lat=39.7392&lng=-104.9903&radius=25&window=48h&category=comedy');
  console.log('Feed status:', feedRes.status);
  const feedJson = await feedRes.json();
  console.log('Events count:', feedJson.events?.length);
  console.log('All events comedy:', feedJson.events?.every(e => e.category === 'comedy'));
}

run().catch(console.error);
