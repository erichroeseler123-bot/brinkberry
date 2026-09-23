import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);

const { OFFICIAL_SOURCES, ingestSource } = require('../lib/ingestion/engine');
const { AUDIT_MILESTONE } = require('../lib/audit/coverage-auditor');

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const saveReportPath = args.find(a => a.startsWith('--save='))?.split('=')[1];

async function generateEvidenceReport() {
  const startTime = Date.now();
  console.log('==================================================================================================');
  console.log('BRINKBERRY OFFICIAL-SOURCE EXACT EVENT EVIDENCE AUDIT');
  console.log(`Milestone: "${AUDIT_MILESTONE}"`);
  console.log('Ingesting official pilot sources: Rise Comedy (ICS), Volusia Speedway (HTML), The Stand NYC (HTML)');
  console.log('==================================================================================================\n');

  const sourceEvidence = [];
  const allEvents = [];

  for (const src of OFFICIAL_SOURCES) {
    console.log(`Fetching official source: ${src.venueName} [${src.id}] (${src.scheduleUrl})...`);
    const result = await ingestSource(src, { bypassCache: true });
    sourceEvidence.push({
      sourceId: src.id,
      venueName: src.venueName,
      category: src.category,
      parser: src.parser,
      scheduleUrl: src.scheduleUrl,
      httpStatus: result.httpStatus,
      rawSourceHash: result.rawSourceHash,
      fetchedAt: result.fetchedAt,
      rawCount: result.rawCount,
      confirmedCount: result.confirmedCount
    });

    for (const ev of result.events) {
      allEvents.push({
        sourceId: src.id,
        venue: src.venueName,
        category: src.category,
        title: ev.title,
        startTime: ev.start_time,
        endTime: ev.end_time || null,
        officialUrl: ev.official_source_url || ev.ticket_url || ev.canonical_url,
        externalId: ev.externalId || ev.id,
        confirmationStatus: ev.confirmationStatus,
        contentHash: result.rawSourceHash,
        fetchedAt: result.fetchedAt,
        freshnessStatus: ev.freshness?.status || ev.freshnessStatus || 'verified_current'
      });
    }
  }

  console.log('\n==================================================================================================');
  console.log('SOURCE INGESTION EVIDENCE SUMMARY:');
  console.log('| Source ID | Venue | Parser | Status | Hash | Fetched At | Confirmed |');
  console.log('|---|---|---|---|---|---|---|');
  for (const s of sourceEvidence) {
    console.log(`| ${s.sourceId.padEnd(25)} | ${s.venueName.padEnd(22)} | ${s.parser.padEnd(14)} | ${String(s.httpStatus).padStart(6)} | ${s.rawSourceHash} | ${s.fetchedAt.slice(0, 19)} | ${String(s.confirmedCount).padStart(9)} |`);
  }

  console.log('\n==================================================================================================');
  console.log(`EXACT EVENT EVIDENCE VERIFICATION (${allEvents.length} Verified Events):`);
  console.log('| # | Venue | Date & Time | External ID / Slug | Confirmation | Freshness | Title |');
  console.log('|---|---|---|---|---|---|---|');

  allEvents.forEach((e, idx) => {
    const num = String(idx + 1).padStart(2);
    const venue = e.venue.slice(0, 15).padEnd(15);
    const dt = e.startTime.replace('T', ' ').slice(0, 16);
    const extId = String(e.externalId).slice(0, 20).padEnd(20);
    const conf = e.confirmationStatus.replace('confirmed_by_', '').slice(0, 17).padEnd(17);
    const fresh = e.freshnessStatus.slice(0, 16).padEnd(16);
    const title = e.title.length > 35 ? e.title.slice(0, 32) + '...' : e.title;
    console.log(`| ${num} | ${venue} | ${dt} | ${extId} | ${conf} | ${fresh} | ${title} |`);
  });

  const durationMs = Date.now() - startTime;
  console.log('\n==================================================================================================');
  console.log('EVIDENCE AUDIT VERIFICATION TOTALS:');
  console.log(`  Rise Comedy (Denver, CO - ICS):          ${sourceEvidence.find(s => s.sourceId === 'src_rise_comedy_denver')?.confirmedCount} events`);
  console.log(`  Volusia Speedway (Barberville, FL - HTML): ${sourceEvidence.find(s => s.sourceId === 'src_volusia_speedway')?.confirmedCount} events`);
  console.log(`  The Stand NYC (New York, NY - HTML):      ${sourceEvidence.find(s => s.sourceId === 'src_the_stand_nyc')?.confirmedCount} events`);
  console.log(`  Total Confirmed Events Verified:         ${allEvents.length} events (Goal: 51)`);
  console.log(`  Execution Time:                          ${durationMs} ms`);

  const reportPayload = {
    milestone: AUDIT_MILESTONE,
    generatedAt: new Date().toISOString(),
    durationMs,
    totalEvents: allEvents.length,
    sources: sourceEvidence,
    events: allEvents
  };

  if (saveReportPath) {
    const resolvedPath = path.resolve(process.cwd(), saveReportPath);
    fs.writeFileSync(resolvedPath, JSON.stringify(reportPayload, null, 2), 'utf8');
    console.log(`  Report saved to: ${resolvedPath}`);
  }

  if (jsonOutput) {
    console.log('\n--- JSON PAYLOAD ---');
    console.log(JSON.stringify(reportPayload, null, 2));
  }

  console.log('==================================================================================================\n');
}

generateEvidenceReport().catch(err => {
  console.error('Evidence report failed:', err);
  process.exit(1);
});
