// scripts/test-url-fixes.mjs
async function testUrls() {
  const tests = [
    { name: 'Comedy Cellar', urls: ['https://www.comedycellar.com/line-up/', 'https://www.comedycellar.com/new-york-line-up/', 'https://www.comedycellar.com'] },
    { name: 'Laugh Factory Chicago', urls: ['https://www.laughfactory.com/clubs/chicago', 'https://www.laughfactory.com/chicago'] },
    { name: 'Laugh Factory Hollywood', urls: ['https://www.laughfactory.com/clubs/hollywood', 'https://www.laughfactory.com/hollywood'] },
    { name: 'Comic Strip Live', urls: ['https://comicstriplive.com', 'https://comicstriplive.com/events', 'https://comicstriplive.com/shows'] },
    { name: 'Laffs Tucson', urls: ['https://www.laffstucson.com', 'https://www.laffstucson.com/events/'] },
    { name: 'The Lincoln Lodge', urls: ['https://www.thelincolnlodge.com/calendar', 'https://www.thelincolnlodge.com/shows/'] }
  ];

  for (const t of tests) {
    console.log(`\nTesting ${t.name}...`);
    for (const u of t.urls) {
      try {
        const res = await fetch(u, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Brinkberry/1.0' },
          redirect: 'follow',
          signal: AbortSignal.timeout(5000)
        });
        console.log(`  ${u} -> HTTP ${res.status}`);
        if (res.ok) {
          const text = await res.text();
          console.log(`    HTML length: ${text.length}`);
          break;
        }
      } catch (err) {
        console.log(`  ${u} -> ${err.name}: ${err.message}`);
      }
    }
  }
}

testUrls().catch(console.error);
