// scripts/test-dcl-extract.mjs
async function extractShows() {
  const res = await fetch('https://denvercomedylounge.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  // Find where shows are listed
  // Pattern: "id":"show-...","name":"...","rawDateLocal":"..."
  const showRegex = /\{"id":"(show-[^"]+)","slug":"([^"]+)","name":"([^"]+)"[\s\S]*?"externalTicketUrl":"([^"]+)"[\s\S]*?"rawDateLocal":"([^"]+)"[\s\S]*?\}/g;
  const matches = [...html.matchAll(showRegex)];
  console.log('Matches with full pattern:', matches.length);
  
  // Or match any object with externalTicketUrl and rawDateLocal
  const tokenRegex = /\{[^{}]*?"name":"([^"]+)"[^{}]*?"externalTicketUrl":"([^"]+)"[^{}]*?"rawDateLocal":"([^"]+)"[^{}]*?\}/g;
  const tMatches = [...html.matchAll(tokenRegex)];
  console.log('Matches with token pattern:', tMatches.length);
  if (tMatches.length > 0) {
    console.log('Sample show 0:', tMatches[0].slice(1));
  }
}

extractShows().catch(console.error);
