// scripts/build-expanded-candidate-seed.mjs
// Compiles the recovered 150+ U.S. comedy-club directory into a simple seed file
// and deduplicates against the 25 live baseline clubs and current candidate registry.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { NATIONAL_COMEDY_VENUES } = require('../lib/comedy/national-registry.js');
const { BASELINE_25_LIVE_SLUGS } = require('../lib/crawling/venue-classification.js');

const DATA_DIR = path.resolve('data');
const SEED_FILE_PATH = path.join(DATA_DIR, 'comedy-club-directory-seed.json');

// Probed results from our net-new scan
let probedNetNew = [];
if (fs.existsSync('scratch_probed_net_new.json')) {
  probedNetNew = JSON.parse(fs.readFileSync('scratch_probed_net_new.json', 'utf8'));
}

function norm(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Read raw 150 directory text
const rawLines = fs.readFileSync('scratch_150_raw.txt', 'utf8').split('\n');
let currentState = '';
const rawClubs = [];

for (const rawLine of rawLines) {
  const line = rawLine.trim();
  if (line.startsWith('## ')) {
    currentState = line.replace('## ', '').trim();
  } else if (line.startsWith('* ')) {
    const clubText = line.replace('* ', '').trim();
    const match = clubText.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      rawClubs.push({ name: match[1].trim(), city: match[2].trim(), state: currentState });
    } else {
      rawClubs.push({ name: clubText, city: '', state: currentState });
    }
  }
}

const stateMap = {
  'Alabama': 'AL', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Washington, D.C.': 'DC', 'Florida': 'FL',
  'Georgia': 'GA', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kentucky': 'KY',
  'Louisiana': 'LA', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI',
  'Minnesota': 'MN', 'Missouri': 'MO', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Jersey': 'NJ', 'New York': 'NY', 'North Carolina': 'NC', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Virginia': 'VA', 'Washington': 'WA', 'Wisconsin': 'WI'
};

// Build seed items
const seedEntries = [];

for (const rc of rawClubs) {
  const stateCode = stateMap[rc.state] || rc.state;

  // Find in probedNetNew
  const probed = probedNetNew.find(p => {
    return (norm(p.name) === norm(rc.name) || norm(p.name).includes(norm(rc.name)) || norm(rc.name).includes(norm(p.name))) &&
      (p.state === stateCode || p.state === rc.state);
  });

  // Check matching in existing registry
  const matchedExisting = NATIONAL_COMEDY_VENUES.find(e => {
    if (e.state !== stateCode) return false;
    const n1 = norm(e.name);
    const n2 = norm(rc.name);
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
    const w1 = e.name.toLowerCase().split(/\s+/).filter(w => !['the', 'comedy', 'club', 'theatre', 'theater'].includes(w));
    const w2 = rc.name.toLowerCase().split(/\s+/).filter(w => !['the', 'comedy', 'club', 'theatre', 'theater'].includes(w));
    const overlap = w1.filter(w => w2.includes(w));
    if (overlap.length >= 2) return true;
    if (norm(e.city) === norm(rc.city) && overlap.length >= 1) return true;
    if (rc.name.includes('Dallas Improv') && e.slug === 'addison-improv') return true;
    return false;
  });

  let website = probed?.website || '';
  let scheduleUrl = probed?.scheduleUrl || '';
  let platform = probed?.platform || 'custom';

  if (matchedExisting) {
    website = matchedExisting.website;
    scheduleUrl = matchedExisting.calendarFeedUrl || matchedExisting.website;
    platform = matchedExisting.ticketingEngine;
  }

  const isLive = matchedExisting ? BASELINE_25_LIVE_SLUGS.has(matchedExisting.slug) : false;
  const isExistingCandidate = matchedExisting && !isLive;

  seedEntries.push({
    name: rc.name,
    city: rc.city || (matchedExisting ? matchedExisting.city : (probed ? probed.city : '')),
    state: stateCode,
    stateFullName: rc.state,
    website: website || `https://${norm(rc.name)}.com`,
    scheduleUrl: scheduleUrl || website || '',
    ticketingPlatform: platform,
    isLiveBaseline: isLive,
    isExistingCandidate: isExistingCandidate,
    isNetNew: !matchedExisting,
    matchedSlug: matchedExisting ? matchedExisting.slug : null
  });
}

// Ensure DATA_DIR exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

fs.writeFileSync(SEED_FILE_PATH, JSON.stringify(seedEntries, null, 2), 'utf8');

console.log('======================================================================');
console.log('EXPANDED COMEDY CLUB DIRECTORY SEED COMPILED');
console.log('======================================================================');
console.log(`Total Directory Seed Entries: ${seedEntries.length}`);
console.log(`Live 25 Baseline Matches:    ${seedEntries.filter(s => s.isLiveBaseline).length}`);
console.log(`Existing Candidate Matches:   ${seedEntries.filter(s => s.isExistingCandidate).length}`);
console.log(`Net-New Candidates:          ${seedEntries.filter(s => s.isNetNew).length}`);
console.log(`Output Seed File:             ${SEED_FILE_PATH}`);
console.log('======================================================================\n');
