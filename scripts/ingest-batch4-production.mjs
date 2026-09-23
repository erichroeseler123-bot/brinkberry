// scripts/ingest-batch4-production.mjs
// Execute remote production ingestion passes for Batch 4 on https://brinkberry.com

import fs from 'node:fs';

const PROD_HOST = 'https://brinkberry.com';
let cronSecret = process.env.CRON_SECRET || '';

if (!cronSecret && fs.existsSync('.env.production.tmp')) {
  const content = fs.readFileSync('.env.production.tmp', 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('CRON_SECRET=')) {
      cronSecret = trimmed.slice('CRON_SECRET='.length).trim().replace(/^["']|["']$/g, '').trim();
      break;
    }
  }
}

const VENUES = [
  'stress-factory-new-brunswick',
  'stress-factory-bridgeport',
  'helium-comedy-club-buffalo',
  'goodnights-comedy-club-raleigh',
  'laugh-boston'
].join(',');

async function runPass(passNumber) {
  console.log(`\nExecuting Batch 4 Production Ingestion Pass ${passNumber} on ${PROD_HOST}...`);
  const url = `${PROD_HOST}/api/cron-ingest?batch=true&venues=${VENUES}&forceRecheck=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`
    }
  });

  console.log(`Pass ${passNumber} HTTP Status: ${res.status}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Pass ${passNumber} failed with HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  console.log(`Pass ${passNumber} Success: ${data.success}`);
  console.log(`Succeeded Venues: ${data.succeeded}`);
  console.log(`Auto-Published Records: ${data.autoPublished}`);
  console.log(`Environment: ${data.environment}, Namespace: ${data.namespace}`);
  return data;
}

async function main() {
  console.log('======================================================================');
  console.log('       BATCH 4 PRODUCTION INGESTION (2 PASSES)                         ');
  console.log('======================================================================');

  const p1 = await runPass(1);
  const p2 = await runPass(2);

  console.log('\n----------------------------------------------------------------------');
  console.log('PRODUCTION INGESTION PASSES COMPLETE');
  console.log(`Pass 1 Auto-Published: ${p1.autoPublished}`);
  console.log(`Pass 2 Auto-Published: ${p2.autoPublished}`);
  console.log('----------------------------------------------------------------------\n');
}

main().catch(err => {
  console.error('Production ingestion failed:', err);
  process.exit(1);
});
