// scripts/test-adapters.mjs
import { parseEtixSchedule } from '../lib/ingestion/adapters/etix.js';
import { parseTicketWebSchedule } from '../lib/ingestion/adapters/ticketweb.js';

async function testZanies() {
  console.log('Testing Zanies Chicago with Etix adapter...');
  try {
    const res = await fetch('https://chicago.zanies.com/events/', {
      headers: { 'User-Agent': 'Brinkberry-Expansion-Runner/1.0 (+https://brinkberry.com/bot)' }
    });
    const html = await res.text();
    console.log('HTML Length:', html.length);
    const parsed = parseEtixSchedule(html, {
      slug: 'zanies-chicago',
      name: 'Zanies Comedy Club Chicago',
      timezone: 'America/Chicago'
    });
    console.log('Parsed Events Count:', parsed.events.length);
    if (parsed.events.length > 0) {
      console.log('Sample:', parsed.events[0]);
    } else {
      const etixUrls = html.match(/https?:\/\/[^"'\s]*etix\.com[^"'\s]*/gi) || [];
      console.log('Raw Etix URLs matched in HTML:', etixUrls.slice(0, 5));
    }
  } catch (err) {
    console.error('Zanies error:', err.message);
  }
}

async function testDenverImprov() {
  console.log('\nTesting Denver Improv with TicketWeb adapter...');
  try {
    const res = await fetch('https://denver.improv.com/calendar', {
      headers: { 'User-Agent': 'Brinkberry-Expansion-Runner/1.0 (+https://brinkberry.com/bot)' }
    });
    const html = await res.text();
    console.log('HTML Length:', html.length);
    const parsed = parseTicketWebSchedule(html, {
      slug: 'denver-improv',
      name: 'Denver Improv',
      timezone: 'America/Denver'
    });
    console.log('Parsed Events Count:', parsed.events.length);
    if (parsed.events.length > 0) {
      console.log('Sample:', parsed.events[0]);
    } else {
      const twUrls = html.match(/https?:\/\/[^"'\s]*(?:ticketweb\.com|improv\.com\/event)[^"'\s]*/gi) || [];
      console.log('Raw TicketWeb/Improv URLs matched in HTML:', twUrls.slice(0, 5));
    }
  } catch (err) {
    console.error('Denver Improv error:', err.message);
  }
}

async function main() {
  await testZanies();
  await testDenverImprov();
}

main().catch(console.error);
