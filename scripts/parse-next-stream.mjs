// scripts/parse-next-stream.mjs
async function parseNextStream() {
  const res = await fetch('https://denvercomedylounge.com/events', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  // Find all JSON objects with eventbrite ticket URLs
  // Pattern: "url":"https://www.eventbrite.com/e/..."
  const regex = /\{[^{}]*?"url"\s*:\s*"(https?:\\?\/\\?\/[^\"]*?eventbrite\.com[^\"]*?)"[^{}]*?\}/g;
  const matches = [...html.matchAll(regex)];
  console.log('Regex event objects matched:', matches.length);
  for (const m of matches.slice(0, 3)) {
    try {
      const cleaned = m[0].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const obj = JSON.parse(cleaned);
      console.log('Parsed object:', obj);
    } catch (_) {
      console.log('Raw match:', m[0].slice(0, 200));
    }
  }
}

parseNextStream().catch(console.error);
