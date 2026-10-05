import fs from 'fs';

function getEnv() {
  const env = {};
  for (const path of ['.env.production.local', '.vercel/.env.production.local', '.env.local']) {
    if (fs.existsSync(path)) {
      const text = fs.readFileSync(path, 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx);
          let val = trimmed.slice(idx + 1);
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (!env[key]) env[key] = val;
        }
      }
    }
  }
  return env;
}

const env = getEnv();
const url = 'https://onsnxawujlzfrzhwndyu.supabase.co';
const key = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Have service role key:', Boolean(key));
if (key) {
  const res = await fetch(`${url}/rest/v1/outbound_clicks?select=*&order=created_at.desc&limit=5`, {
    headers: { apikey: key, authorization: `Bearer ${key}` }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Recent outbound_clicks count:', Array.isArray(data) ? data.length : 0);
  console.log('Recent outbound_clicks sample:', JSON.stringify(data, null, 2));
}
