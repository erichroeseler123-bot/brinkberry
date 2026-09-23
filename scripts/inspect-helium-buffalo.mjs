// scripts/inspect-helium-buffalo.mjs
const res = await fetch('https://buffalo.heliumcomedy.com/events');
const text = await res.text();
const match = text.match(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
if (match) {
  const d = JSON.parse(match[1]);
  console.log('Type:', d['@type']);
  console.log('Keys:', Object.keys(d));
  for (const k of Object.keys(d)) {
    if (Array.isArray(d[k])) console.log(`Array key: ${k}, length: ${d[k].length}`);
  }
} else {
  console.log('No JSON-LD found');
}
