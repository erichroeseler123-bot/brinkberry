// scripts/inspect-dcl-exact.mjs
async function inspectExact() {
  const res = await fetch('https://denvercomedylounge.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const idx = html.indexOf('bingo-after-dark');
  if (idx !== -1) {
    console.log('Context around bingo-after-dark:\n', html.slice(idx - 200, idx + 400));
  }
}

inspectExact().catch(console.error);
