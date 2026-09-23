import { executeHybridFeed } from '../lib/providers/engine.js';
import { createCommunityPost, _resetForTesting } from '../lib/community-posts/community-posts.js';

async function main() {
  console.log('======================================================');
  console.log('VERIFYING COMMUNITY POST INTEGRATION IN EAU CLAIRE & DENVER');
  console.log('======================================================\n');

  _resetForTesting();

  const now = Date.now();

  // 1. Post a neighborhood house party in Eau Claire (44.8113, -91.4985)
  console.log('1. Posting Neighborhood Acoustic Gathering in Eau Claire...');
  const ecPost = createCommunityPost({
    title: 'Water Street Acoustic Porch Jam',
    description: 'Come hang out and play acoustic folk or just chill on the porch.',
    category: 'party',
    startTime: new Date(now + 3 * 3600 * 1000).toISOString(),
    city: 'Eau Claire',
    venue: 'Water Street Porch',
    lat: 44.8050,
    lon: -91.5020,
    isApproximateLocation: true,
    broadcastRadius: 'neighborhood' // 2 miles
  }, { ip: '10.0.0.1' });
  console.log('   -> Post created:', ecPost.event.id, '| Label:', ecPost.event.sourceQualityLabel);

  // 2. Post a pop-up food market in Denver (39.7392, -104.9903)
  console.log('\n2. Posting Pop-up Food Market in Denver...');
  const denverPost = createCommunityPost({
    title: 'Larimer Street Friday Night Taco & Tamale Pop-up',
    description: 'Authentic handmade tamales and street tacos. First come first served!',
    category: 'food',
    startTime: new Date(now + 4 * 3600 * 1000).toISOString(),
    city: 'Denver',
    venue: 'Larimer Pop-up Space',
    lat: 39.7540,
    lon: -104.9880,
    broadcastRadius: 'nearby' // 10 miles
  }, { ip: '10.0.0.2' });
  console.log('   -> Post created:', denverPost.event.id, '| Label:', denverPost.event.sourceQualityLabel);

  // 3. Query Eau Claire Feed
  console.log('\n3. Querying Eau Claire Feed (within 25 miles)...');
  const ecFeed = await executeHybridFeed({
    lat: 44.8113,
    lon: -91.4985,
    radiusMiles: 25,
    window: '48h',
    windowStart: new Date(now).toISOString(),
    windowEnd: new Date(now + 48 * 3600 * 1000).toISOString()
  });

  const foundEc = ecFeed.events.find(e => e.id === ecPost.event.id);
  console.log('   -> Total events in Eau Claire:', ecFeed.events.length);
  console.log('   -> Community post found in EC feed:', Boolean(foundEc));
  if (foundEc) {
    console.log('      Title:', foundEc.title);
    console.log('      Label:', foundEc.sourceQualityLabel);
    console.log('      Category:', foundEc.category);
    console.log('      HasTicket:', foundEc.hasTicket);
    console.log('      Distance:', foundEc.distanceMiles, 'mi');
  }

  // 4. Query Denver Feed
  console.log('\n4. Querying Denver Feed (within 25 miles)...');
  const denverFeed = await executeHybridFeed({
    lat: 39.7392,
    lon: -104.9903,
    radiusMiles: 25,
    window: '48h',
    windowStart: new Date(now).toISOString(),
    windowEnd: new Date(now + 48 * 3600 * 1000).toISOString()
  });

  const foundDenver = denverFeed.events.find(e => e.id === denverPost.event.id);
  console.log('   -> Total events in Denver:', denverFeed.events.length);
  console.log('   -> Community post found in Denver feed:', Boolean(foundDenver));
  if (foundDenver) {
    console.log('      Title:', foundDenver.title);
    console.log('      Label:', foundDenver.sourceQualityLabel);
    console.log('      Category:', foundDenver.category);
    console.log('      HasTicket:', foundDenver.hasTicket);
    console.log('      Distance:', foundDenver.distanceMiles, 'mi');
  }

  // 5. Confirm official events and comedy clubs are unchanged
  const officialClubs = denverFeed.events.filter(e => e.sourceQualityLabel === 'Official venue schedule');
  console.log('\n5. Preserved Official Venue Schedules in Denver:', officialClubs.length);
  console.log('   Sample:', officialClubs.slice(0, 3).map(e => e.title));

  if (!foundEc || !foundDenver) {
    throw new Error('Community posts failed to appear in feeds!');
  }
  console.log('\n✓ ALL LOCAL VERIFICATION CHECKS PASSED!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
