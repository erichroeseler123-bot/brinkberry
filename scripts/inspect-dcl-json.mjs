// scripts/inspect-dcl-json.mjs
async function inspectDCL() {
  const res = await fetch('https://denvercomedylounge.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const s of scriptMatches) {
    if (s.includes('tickets-') && s.includes('soldOut')) {
      console.log('Found script with event data, length:', s.length);
      // check if it is JSON
      const jsonStart = s.indexOf('{');
      const jsonEnd = s.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        console.log('Snippet:', s.slice(jsonStart, jsonStart + 500));
      }
    }
  }
}

inspectDCL().catch(console.error);
