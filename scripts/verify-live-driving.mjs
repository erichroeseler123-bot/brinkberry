async function verifyLiveDriving() {
  const fetch = globalThis.fetch;
  console.log('=== 1. Live Driving Route API (https://brinkberry.com/api/route) ===');
  const validRes = await fetch('https://brinkberry.com/api/route?fromLat=39.7392&fromLon=-104.9903&toLat=40.0150&toLon=-105.2705');
  console.log('Valid route status:', validRes.status);
  const validData = await validRes.json();
  console.log('Route result:', validData);

  const invalidRes = await fetch('https://brinkberry.com/api/route?fromLat=bad&fromLon=bad&toLat=bad&toLon=bad');
  console.log('Invalid route status:', invalidRes.status);
  const invalidData = await invalidRes.json();
  console.log('Invalid route error:', invalidData);

  const oceanRes = await fetch('https://brinkberry.com/api/route?fromLat=0&fromLon=0&toLat=0&toLon=160');
  console.log('Ocean route status:', oceanRes.status);
  const oceanData = await oceanRes.json();
  console.log('Ocean route error:', oceanData);

  console.log('\n=== 2. Live Homepage Event Modal Script ===');
  const homeRes = await fetch('https://brinkberry.com/');
  const homeHtml = await homeRes.text();
  console.log('Contains detailDriveTime container:', homeHtml.includes('id="detailDriveTime"'));
  console.log('Contains /api/route fetch call:', homeHtml.includes('/api/route?fromLat='));
  console.log('Contains "Estimated drive time" label:', homeHtml.includes('Estimated drive time'));
  console.log('Contains fallback "Drive time unavailable":', homeHtml.includes('Drive time unavailable'));
}

verifyLiveDriving().catch(err => {
  console.error('Driving route verification failed:', err);
  process.exit(1);
});
