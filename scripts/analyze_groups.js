const fs = require('fs');

let buf = fs.readFileSync('candidate_groups.json');
let text = buf.toString('utf16le');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
if (!text.trim().startsWith('{')) text = buf.toString('utf8');

const data = JSON.parse(text);

console.log('=== GROUP 1: PARSED VENUES (' + data.parsedList.length + ') ===');
let vSum = 0, invSum = 0, exactSum = 0, dispSum = 0, futSum = 0;
data.parsedList.forEach((v, i) => {
  vSum += v.structurallyValid;
  invSum += v.structurallyInvalid;
  exactSum += v.exactEvents;
  dispSum += v.displayEligible;
  futSum += v.retainedFuture;
  console.log(`${i + 1}. ${v.name} (${v.cityState})
   Parser: ${v.parserUsed} | Status: ${v.crawlStatus} | Review: ${v.reviewStatus}
   Exact: ${v.exactEvents} | Valid: ${v.structurallyValid} | Invalid: ${v.structurallyInvalid} | Display: ${v.displayEligible} | Future: ${v.retainedFuture}
   Fidelity: ${v.directLinkFidelity} | Evidence Hash: ${v.evidenceHash}`);
});
console.log(`Totals -> Exact: ${exactSum}, Valid: ${vSum}, Invalid: ${invSum}, Display: ${dispSum}, Future: ${futSum}\n`);

console.log('=== GROUP 2: CUSTOM-PARSER VENUES (' + data.customParserList.length + ') ===');
// Group by platform family
const families = {};
data.customParserList.forEach(v => {
  const eng = v.ticketingEngine || 'custom';
  if (!families[eng]) families[eng] = [];
  families[eng].push(v);
});

for (const [platform, venues] of Object.entries(families)) {
  console.log(`\nPlatform Family: ${platform} (${venues.length} venues):`);
  venues.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.cityState}) - URL: ${v.url}`);
  });
}

console.log('\n=== GROUP 3: BLOCKED / UNSUPPORTED VENUES (' + data.blockedList.length + ') ===');
const blockedReasons = {};
data.blockedList.forEach(v => {
  const r = v.blockedReason || 'unknown';
  if (!blockedReasons[r]) blockedReasons[r] = [];
  blockedReasons[r].push(v);
});

for (const [reason, venues] of Object.entries(blockedReasons)) {
  console.log(`\nPerimeter / Failure Category: ${reason} (${venues.length} venues):`);
  venues.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.cityState}) [${v.crawlStatus}] - URL: ${v.url}`);
  });
}
