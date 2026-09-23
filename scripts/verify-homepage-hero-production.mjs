async function main() {
  console.log('Testing live production at https://brinkberry.com...');
  const res = await fetch('https://brinkberry.com/?v=' + Date.now());
  const html = await res.text();

  const checks = [
    ['HTTP 200 OK', res.status === 200],
    ['New Hero Title', html.includes('What are you looking for tonight?')],
    ['Card: Everything near me', html.includes('id="entryPathAll"')],
    ['Card: Comedy near me', html.includes('id="entryPathComedy"')],
    ['Card: Motorsports near me', html.includes('id="entryPathRacing"')],
    ['Radar Lock Bar Indicator', html.includes('id="locIndicatorBtn"')],
    ['Location Drawer Expandable', html.includes('id="locationDrawer"')],
    ['Category Sub-row Container', html.includes('id="everythingSubRow"')],
    ['Comedy Sub-console Container', html.includes('id="comedySubFilterConsole"')],
    ['Racing Sub-console Container', html.includes('id="racingSubFilterConsole"')],
    ['Preserved Denver preset', html.includes('id="presetDenver"')],
    ['Preserved Search Input', html.includes('id="citySearchInput"')]
  ];

  console.table(checks);

  const allPassed = checks.every(c => c[1]);
  if (!allPassed) {
    console.error('Some checks failed!');
    process.exit(1);
  }
  console.log('All live production homepage hero checks passed!');
}

main().catch(err => {
  console.error('Fatal error during production verification:', err);
  process.exit(1);
});
