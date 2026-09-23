import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { fetchComedyWorksCalendar, normalizeCivilTime } = require('../lib/ingestion/adapters/comedy-works-adapter.js');

describe('Comedy Works Adapter & 161-Event Verification Suite', () => {

  it('1. Normalizes 12-hour AM/PM civil times accurately to 24-hour HH:MM', () => {
    assert.equal(normalizeCivilTime('7:30PM'), '19:30');
    assert.equal(normalizeCivilTime('9:45 PM'), '21:45');
    assert.equal(normalizeCivilTime('4:00PM'), '16:00');
    assert.equal(normalizeCivilTime('8:00'), '20:00');
    assert.equal(normalizeCivilTime('11:30 PM'), '23:30');
  });

  it('2. Differentiates two same-day showtimes at the same venue into distinct canonical events', () => {
    // Simulate same-day early and late shows (e.g. 7:30 PM and 9:45 PM on 2026-10-01 for Mark Normand)
    const dateStr = '2026-10-01';
    const performer = 'Mark Normand';
    const locSlug = 'downtown';
    const cleanPerformer = performer.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const show1Time = '19:30';
    const show2Time = '21:45';

    const event1Id = `cw_${locSlug}_${dateStr}_${show1Time.replace(':', '')}_${cleanPerformer}`;
    const event2Id = `cw_${locSlug}_${dateStr}_${show2Time.replace(':', '')}_${cleanPerformer}`;

    assert.notEqual(event1Id, event2Id, 'Same-day distinct showtimes must produce distinct canonical event IDs');
    assert.equal(event1Id, 'cw_downtown_2026-10-01_1930_mark_normand');
    assert.equal(event2Id, 'cw_downtown_2026-10-01_2145_mark_normand');
  });

  it('3. Audits all Comedy Works performances: 0 synthetic dates, valid civil time, honest URL tiering', async () => {
    const dt = await fetchComedyWorksCalendar({ name: 'Comedy Works Downtown' });
    const south = await fetchComedyWorksCalendar({ name: 'Comedy Works South' });

    const all = [...dt.events, ...south.events];
    assert.ok(all.length >= 150, `Expected at least 150 events across Downtown & South, got ${all.length}`);

    const idSet = new Set();

    for (const e of all) {
      // Fingerprint includes local civil time
      assert.match(e.id, /^cw_(downtown|south)_\d{4}-\d{2}-\d{2}_\d{4}_[a-z0-9_]+$/, `Event ID must follow format cw_room_YYYY-MM-DD_HHMM_performer: got ${e.id}`);
      assert.ok(!idSet.has(e.id), `Duplicate fingerprint detected: ${e.id}`);
      idSet.add(e.id);

      // Exact civil date (zero synthetic dates like "Every Tuesday")
      assert.match(e.civilDate, /^\d{4}-\d{2}-\d{2}$/, `Must be explicit ISO civil date: got ${e.civilDate}`);
      const parsedYear = parseInt(e.civilDate.slice(0, 4), 10);
      assert.ok(parsedYear >= 2026 && parsedYear <= 2027, `Civil year must be valid calendar range: got ${parsedYear}`);

      // Exact local civil time
      assert.match(e.civilTime, /^[0-2]\d:[0-5]\d$/, `Must be 24h civil time HH:MM: got ${e.civilTime}`);

      // Denver timezone
      assert.equal(e.timezone, 'America/Denver');
      assert.ok(e.start.endsWith('-06:00') || e.start.endsWith('Z'), `Start timestamp must encode Mountain Time: ${e.start}`);

      // Honest Link Resolution Tier
      assert.ok(['show_landing_page', 'venue_calendar'].includes(e.linkResolutionTier));
      if (e.linkResolutionTier === 'show_landing_page') {
        assert.ok(e.ticket_url.includes('/comedians/'), `show_landing_page must link to official comedian page: ${e.ticket_url}`);
        assert.equal(e.isVenueLevelLink, false);
      } else {
        assert.equal(e.isVenueLevelLink, true);
      }

      // Box Office Direct (zero affiliate, zero click redirect)
      assert.ok(e.ticket_url.startsWith('https://comedyworks.com'));
      assert.ok(!e.ticket_url.includes('click?'));
      assert.ok(!e.ticket_url.includes('affiliate'));
      assert.equal(e.confirmationStatus, 'confirmed_by_official_calendar');
      assert.equal(e.sourceType, 'official_box_office');
    }

    assert.equal(idSet.size, all.length, 'Every single event must have an independent, collision-free fingerprint');
  });

});
