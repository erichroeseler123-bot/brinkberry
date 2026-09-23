// scripts/probe-specific-venues.mjs
async function checkDCL() {
  console.log('--- Denver Comedy Lounge ---');
  try {
    const res = await fetch('https://denvercomedylounge.com/events', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('Status:', res.status, 'HTML len:', html.length);
    const ebUrls = html.match(/https?:\/\/[^"'\s]*eventbrite\.com[^"'\s]*/gi) || [];
    console.log('Eventbrite URLs:', ebUrls.slice(0, 5));
    const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    console.log('JSON-LD blocks:', jsonLd.length);
    if (jsonLd.length > 0) console.log('JSON-LD sample:', jsonLd[0].slice(0, 300));
  } catch (e) {
    console.error('DCL err:', e.message);
  }
}

async function checkBellHouse() {
  console.log('\n--- The Bell House ---');
  try {
    const res = await fetch('https://thebellhouseny.com/events', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('Status:', res.status, 'HTML len:', html.length);
    const ebUrls = html.match(/https?:\/\/[^"'\s]*(?:eventbrite\.com|ticketweb|eventlink)[^"'\s]*/gi) || [];
    console.log('Ticket URLs:', ebUrls.slice(0, 5));
    const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    console.log('JSON-LD blocks:', jsonLd.length);
    if (jsonLd.length > 0) console.log('JSON-LD sample:', jsonLd[0].slice(0, 300));
  } catch (e) {
    console.error('Bell House err:', e.message);
  }
}

async function checkTheStand() {
  console.log('\n--- The Stand NYC ---');
  try {
    const res = await fetch('https://thestandnyc.com/shows', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('Status:', res.status, 'HTML len:', html.length);
    const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    console.log('JSON-LD blocks:', jsonLd.length);
    if (jsonLd.length > 0) console.log('JSON-LD sample:', jsonLd[0].slice(0, 300));
    // check for api/shows or next data
    const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    console.log('Next.js data:', Boolean(nextData));
    if (nextData) console.log('Next data preview:', nextData[1].slice(0, 200));
  } catch (e) {
    console.error('The Stand err:', e.message);
  }
}

async function checkDynasty() {
  console.log('\n--- Dynasty Typewriter ---');
  try {
    const res = await fetch('https://www.dynastytypewriter.com/calendar', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    console.log('Status:', res.status, 'HTML len:', html.length);
    const links = [...html.matchAll(/href=["'](https?:\/\/[^"']*(?:eventbrite\.com|ticketweb\.com|dice\.fm)[^"']*)["']/gi)].map(m => m[1]);
    console.log('Ticket links on page:', links.slice(0, 5));
    const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    console.log('JSON-LD blocks:', jsonLd.length);
  } catch (e) {
    console.error('Dynasty err:', e.message);
  }
}

async function checkLincolnLodge() {
  console.log('\n--- The Lincoln Lodge ---');
  try {
    const res = await fetch('https://www.thelincolnlodge.com/calendar', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log('Status with /calendar:', res.status);
    const html = await res.text();
    console.log('HTML len:', html.length);
  } catch (e) {
    console.error('Lincoln Lodge err:', e.message);
  }
}

async function main() {
  await checkDCL();
  await checkBellHouse();
  await checkTheStand();
  await checkDynasty();
  await checkLincolnLodge();
}

main().catch(console.error);
