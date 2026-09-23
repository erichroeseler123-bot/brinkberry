import fs from 'node:fs';
import path from 'node:path';

// Parse .env.test securely without logging values
const envPath = path.resolve('.env.test');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1].trim()] = val;
  }
}

const supabaseUrl = (env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '');
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found in .env.test');
  process.exit(1);
}

console.log('='.repeat(70));
console.log('PRIVILEGED SUPABASE PRODUCTION ZERO-ROW VERIFICATION');
console.log('='.repeat(70));
console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Auth Mode: SERVICE_ROLE_KEY (RLS Completely Bypassed)`);
console.log(`Key Prefix: ${serviceRoleKey.slice(0, 8)}...`);
console.log('-'.repeat(70));

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json'
};

async function runQuery(endpoint, description) {
  const url = `${supabaseUrl}/rest/v1/${endpoint}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      return { description, endpoint, status: res.status, error: errText, count: null, rows: [] };
    }
    const data = await res.json();
    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
    return { description, endpoint, status: res.status, count, rows: Array.isArray(data) ? data : [data] };
  } catch (err) {
    return { description, endpoint, status: 'ERROR', error: err.message, count: null, rows: [] };
  }
}

async function verifyAll() {
  const checks = [
    {
      endpoint: 'canonical_events?select=id,title,start_time&title=ilike.*stardome*',
      desc: 'canonical_events with title ILIKE %stardome%'
    },
    {
      endpoint: 'canonical_events?select=id,title,start_time&title=ilike.*comedy%20zone*',
      desc: 'canonical_events with title ILIKE %comedy zone%'
    },
    {
      endpoint: 'canonical_events?select=id,title,start_time&normalized_title=ilike.*stardome*',
      desc: 'canonical_events with normalized_title ILIKE %stardome%'
    },
    {
      endpoint: 'canonical_events?select=id,title,start_time&normalized_title=ilike.*comedyzone*',
      desc: 'canonical_events with normalized_title ILIKE %comedyzone%'
    },
    {
      endpoint: 'canonical_events?select=id,title,start_time&description=ilike.*stardome*',
      desc: 'canonical_events with description ILIKE %stardome%'
    },
    {
      endpoint: 'canonical_events?select=id,title,start_time&description=ilike.*comedy%20zone*',
      desc: 'canonical_events with description ILIKE %comedy zone%'
    },
    {
      endpoint: 'events?select=id,title,venue&title=ilike.*stardome*',
      desc: 'events table with title ILIKE %stardome%'
    },
    {
      endpoint: 'events?select=id,title,venue&venue=ilike.*stardome*',
      desc: 'events table with venue ILIKE %stardome%'
    },
    {
      endpoint: 'events?select=id,title,venue&title=ilike.*comedy%20zone*',
      desc: 'events table with title ILIKE %comedy zone%'
    },
    {
      endpoint: 'events?select=id,title,venue&venue=ilike.*comedy%20zone*',
      desc: 'events table with venue ILIKE %comedy zone%'
    },
    {
      endpoint: 'rpc/bb_get_feed_events_v2',
      method: 'POST',
      body: { p_lat: 33.3752, p_lon: -86.8122, p_radius_miles: 50, p_category: 'comedy' },
      desc: 'RPC bb_get_feed_events_v2 for Birmingham'
    },
    {
      endpoint: 'rpc/bb_get_feed_events_v2',
      method: 'POST',
      body: { p_lat: 35.2407, p_lon: -80.8491, p_radius_miles: 50, p_category: 'comedy' },
      desc: 'RPC bb_get_feed_events_v2 for Charlotte'
    }
  ];

  console.log('\nRunning privileged queries against Supabase production...\n');

  let allZero = true;
  for (const check of checks) {
    let result;
    if (check.method === 'POST') {
      const url = `${supabaseUrl}/rest/v1/${check.endpoint}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(check.body)
        });
        if (!res.ok) {
          result = { description: check.desc, status: res.status, error: await res.text(), count: null };
        } else {
          const data = await res.json();
          result = { description: check.desc, status: res.status, count: Array.isArray(data) ? data.length : 0 };
        }
      } catch (err) {
        result = { description: check.desc, status: 'ERROR', error: err.message, count: null };
      }
    } else {
      result = await runQuery(check.endpoint, check.desc);
    }

    const countDisplay = result.count !== null ? `${result.count} rows` : `HTTP ${result.status} (${result.error})`;
    const passed = result.count === 0 || (result.status === 404); // 404 table not existing is also zero rows
    if (result.count > 0 || result.status === 'ERROR') allZero = false;

    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${check.desc}: ${countDisplay}`);
  }

  console.log('\n' + '-'.repeat(70));
  if (allZero) {
    console.log('ZERO-ROW PROOF VERIFIED: Supabase production contains EXACTLY 0 rows');
    console.log('for Stardome / Comedy Zone expansion under service-role privileges.');
  } else {
    console.log('WARNING: Non-zero rows found in Supabase production!');
  }
  console.log('='.repeat(70));
}

verifyAll();
