async function main() {
  console.log('Testing live production at https://brinkberry.com...');
  const res = await fetch('https://brinkberry.com/?v=' + Date.now());
  const html = await res.text();

  const checks = [
    ['HTTP 200 OK', res.status === 200],
    ['Streamlined Hero Title', html.includes('What’s happening near you?')],
    ['Top Nav Menu Button', html.includes('id="navMenuBtn"')],
    ['Post an Event Button', html.includes('id="postEventBtn"')],
    ['Radar Lock Bar Indicator', html.includes('id="locIndicatorBtn"')],
    ['Location Drawer Expandable', html.includes('id="locationDrawer"')],
    ['Compact Category Row', html.includes('id="categoryRow"')],
    ['Quick Time Selection Toggle', html.includes('id="quickTimeToggle"')],
    ['Filters Toggle Button', html.includes('id="filtersToggleBtn"')],
    ['Advanced Filters Drawer', html.includes('id="advancedFiltersDrawer"')],
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
