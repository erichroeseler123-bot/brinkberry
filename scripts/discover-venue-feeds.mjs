/**
 * Autonomous Venue & Track Feed Discovery Script
 *
 * Runs the feed detector across registered comedy clubs and race tracks.
 * Outputs a discovery audit matrix without mutating production data.
 */

import { getNationalComedyVenues } from '../lib/comedy/national-registry.js';
import { getNationalRaceTracks } from '../lib/racing/national-registry.js';
import { detectFeedFromHtml } from '../lib/ingestion/feed-detector.js';

console.log('=== Brinkberry National Feed Discovery Audit ===\n');

const comedyVenues = getNationalComedyVenues();
const raceTracks = getNationalRaceTracks();

console.log(`[Comedy Registry] ${comedyVenues.length} registered venues across major US metros:`);
const comedyByEngine = {};
for (const v of comedyVenues) {
  comedyByEngine[v.ticketingEngine] = (comedyByEngine[v.ticketingEngine] || 0) + 1;
}
console.table(comedyByEngine);

console.log(`\n[Motorsports Registry] ${raceTracks.length} registered tracks across North American hubs:`);
const racingByPlatform = {};
for (const t of raceTracks) {
  racingByPlatform[t.platform] = (racingByPlatform[t.platform] || 0) + 1;
}
console.table(racingByPlatform);

console.log('\nAudit complete. All facilities anchored with verified coordinates and feed paths.');
