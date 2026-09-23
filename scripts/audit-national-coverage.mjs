import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  runNationalAudit,
  auditMultiHorizonMarket,
  AUDIT_MILESTONE,
  HORIZONS,
  NATIONAL_AUDIT_GRID
} = require('../lib/audit/coverage-auditor.js');

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const skipLinks = args.includes('--no-links');
const verbose = args.includes('--verbose');
const testHorizons = args.includes('--horizons');
const windowArg = args.find(a => a.startsWith('--window='))?.split('=')[1] || '48h';
const token = args.find(a => a.startsWith('--token='))?.split('=')[1] || process.env.ADMIN_TOKEN || null;
const baseUrl = isLive ? 'https://brinkberry.com' : null;

async function main() {
  console.log('==================================================================================================');
  console.log('BRINKBERRY NATIONAL COVERAGE, FRESHNESS & INVENTORY AUDIT');
  console.log(`Milestone: "${AUDIT_MILESTONE}"`);
  console.log(`Target: ${isLive ? 'LIVE PRODUCTION (https://brinkberry.com)' : 'LOCAL IN-PROCESS ENGINE'}`);
  console.log(`Planning Window: ${windowArg.toUpperCase()} | Link Verification: ${skipLinks ? 'SKIPPED' : 'ENABLED'}`);
  console.log('==================================================================================================\n');

  const audit = await runNationalAudit({
    baseUrl,
    checkLinks: !skipLinks,
    window: windowArg,
    includeMultiHorizon: testHorizons
  });

  console.log('| Market | Vert | Type | Verification Status | Tot | Comm | Cur | Freshness | Horizon | Links |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');

  for (const r of audit.results) {
    const market = r.market.padEnd(25);
    const vert = r.vertical.slice(0, 4).padEnd(4);
    const type = r.type.slice(0, 14).padEnd(14);
    const status = r.classification.padEnd(21);
    const tot = String(r.inventory.totalEvents).padStart(3);
    const comm = String(r.inventory.commercialEvents).padStart(4);
    const cur = String(r.inventory.curatedEvents).padStart(3);
    const fresh = r.freshness.status.slice(0, 11).padEnd(11);
    const horiz = r.eventHorizon.horizon.slice(0, 9).padEnd(9);
    const links = r.linkIntegrity ? `${r.linkIntegrity.validCount}/${r.linkIntegrity.totalChecked}`.padStart(5) : ' N/A ';

    console.log(`| ${market} | ${vert} | ${type} | ${status} | ${tot} | ${comm} | ${cur} | ${fresh} | ${horiz} | ${links} |`);

    if (verbose && r.events?.length > 0) {
      for (const e of r.events) {
        const linkReason = e.linkStatus ? ` [link: ${e.linkStatus.reason} ${e.linkStatus.status}]` : '';
        const dateStr = e.eventDateTime?.start ? new Date(e.eventDateTime.start).toLocaleDateString() : 'TBA';
        console.log(`    ↳ [${e.listingType}] "${e.title}" at ${e.venue} (${dateStr}) - ${e.confirmationStatus}${linkReason}`);
      }
    }
  }

  console.log('\n==================================================================================================');
  console.log('AUDIT SUMMARY & VERIFICATION TIERS:');
  console.log(`  Probed Markets:              ${audit.totals.probedMarkets}`);
  console.log(`  Verified Inventory:          ${audit.totals.verifiedInventoryMarkets} (${Math.round(audit.totals.verifiedInventoryMarkets / audit.totals.probedMarkets * 100)}%)`);
  console.log(`  Partial Verification:        ${audit.totals.partialVerificationMarkets}`);
  console.log(`  Stale or Unlinked:           ${audit.totals.staleOrUnlinkedMarkets}`);
  console.log(`  Seeded Presence Only:        ${audit.totals.seededPresenceOnlyMarkets}`);
  console.log(`  Honest Empty States:         ${audit.totals.honestEmptyStateMarkets}`);
  console.log(`  Total Discovered Events:     ${audit.totals.totalEventsDiscovered}`);
  console.log(`    - Commercial (SeatGeek/TM): ${audit.totals.totalCommercialEvents}`);
  console.log(`    - Curated / Verified:      ${audit.totals.totalCuratedEvents}`);
  console.log(`    - Community Submitted:     ${audit.totals.totalCommunityEvents}`);
  console.log(`  Source Links Tested:         ${audit.totals.totalLinksChecked || 0} (${audit.totals.totalValidLinks || 0} valid, ${audit.totals.totalBrokenLinks || 0} failed/blocked)`);
  const isReconciled =
    audit.totals.probedMarkets === (audit.totals.verifiedInventoryMarkets + audit.totals.partialVerificationMarkets + audit.totals.staleOrUnlinkedMarkets + audit.totals.seededPresenceOnlyMarkets + audit.totals.honestEmptyStateMarkets) &&
    audit.totals.totalEventsDiscovered === (audit.totals.totalCommercialEvents + audit.totals.totalCuratedEvents + audit.totals.totalCommunityEvents);
  console.log(`  Mathematical Reconciliation: ${isReconciled ? 'PASSED (exact equality verified)' : 'FAILED'}`);
  console.log(`  Audit Execution Time:        ${audit.totals.auditDurationMs} ms`);

  if (audit.multiHorizonSummaries && audit.multiHorizonSummaries.length > 0) {
    console.log('\n==================================================================================================');
    console.log('MULTI-HORIZON PLANNING ANALYSIS:');
    console.log('| Market | Vert | Tonight | This Weekend | Next Weekend | Next 30 Days | Full Season |');
    console.log('|---|---|---|---|---|---|---|');
    const items = testHorizons ? audit.multiHorizonSummaries : audit.multiHorizonSummaries.filter(m => m.vertical === 'racing');
    for (const mh of items) {
      const h = mh.horizons;
      const mkt = mh.market.padEnd(25);
      const vert = mh.vertical.slice(0, 4).padEnd(4);
      const ton = String(h.tonight?.totalEvents || 0).padStart(7);
      const tw = String(h.this_weekend?.totalEvents || 0).padStart(12);
      const nw = String(h.next_weekend?.totalEvents || 0).padStart(12);
      const d30 = String(h['30d']?.totalEvents || 0).padStart(12);
      const sea = String(h.season?.totalEvents || 0).padStart(11);
      console.log(`| ${mkt} | ${vert} | ${ton} | ${tw} | ${nw} | ${d30} | ${sea} |`);
    }

    if (audit.totals.horizonTotals) {
      const ht = audit.totals.horizonTotals;
      console.log('|---|---|---|---|---|---|---|');
      console.log(`| ${'AGGREGATE TOTALS'.padEnd(25)} | ALL  | ${String(ht.tonight).padStart(7)} | ${String(ht.thisWeekend).padStart(12)} | ${String(ht.nextWeekend).padStart(12)} | ${String(ht.next30Days).padStart(12)} | ${String(ht.fullSeason).padStart(11)} |`);
    }
  }

  console.log('==================================================================================================\n');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
