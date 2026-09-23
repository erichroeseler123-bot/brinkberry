// scripts/test-dcl-escaped.mjs
async function extractEscaped() {
  const res = await fetch('https://denvercomedylounge.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  // Regex accounting for escaped quotes
  const tokenRegex = /\\?"name\\?"\s*:\s*\\?"([^\\"]+)\\"[\s\S]*?\\?"externalTicketUrl\\?"\s*:\s*\\?"([^\\"]+)\\"[\s\S]*?\\?"rawDateLocal\\?"\s*:\s*\\?"([^\\"]+)\\"/g;
  const matches = [...html.matchAll(tokenRegex)];
  console.log('Escaped matches:', matches.length);
  for (const m of matches.slice(0, 5)) {
    console.log({ name: m[1], ticketUrl: m[2], rawDateLocal: m[3] });
  }
}

extractEscaped().catch(console.error);
