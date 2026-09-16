import fs from 'fs';

function getEnv() {
  const env = {};
  if (fs.existsSync('.vercel/.env.production.local')) {
    const text = fs.readFileSync('.vercel/.env.production.local', 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx);
        let val = trimmed.slice(idx + 1);
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        env[key] = val;
      }
    }
  }
  return env;
}
const env = getEnv();
const url = 'https://onsnxawujlzfrzhwndyu.supabase.co';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function checkSchema() {
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
  
  // Sample from tables
  const r1 = await fetch(`${url}/rest/v1/canonical_events?select=*&limit=1`, { headers });
  const eSample = await r1.json();
  console.log('canonical_events sample:', eSample[0]);

  const r2 = await fetch(`${url}/rest/v1/venues?select=*&limit=1`, { headers });
  const vSample = await r2.json();
  console.log('venues sample:', vSample[0]);

  const r3 = await fetch(`${url}/rest/v1/sources?select=*&limit=10`, { headers });
  const sSample = await r3.json();
  console.log('sources sample:', sSample);

  const r4 = await fetch(`${url}/rest/v1/source_events?select=*&limit=1`, { headers });
  const seSample = await r4.json();
  console.log('source_events sample:', seSample[0]);

  const r5 = await fetch(`${url}/rest/v1/source_health_logs?select=*&limit=1`, { headers });
  const shSample = await r5.json();
  console.log('source_health_logs sample:', shSample[0]);
}
checkSchema();
