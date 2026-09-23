import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseTicketWebSchedule } = require('../lib/ingestion/adapters/ticketweb.js');
const { parseEtixSchedule } = require('../lib/ingestion/adapters/etix.js');

describe('Reusable Platform Adapters Suite', () => {
  describe('TicketWeb & Improv Platform Adapter', () => {
    it('extracts direct event link from card markup and ignores calendar links', () => {
      const html = `
        <div class="event-card">
          <h2>Taylor Tomlinson</h2>
          <div class="date">2026-10-15</div>
          <a href="https://www.ticketweb.com/event/taylor-tomlinson-the-comedy-store-tickets/1234567">Buy Tickets</a>
          <a href="https://thecomedystore.com/calendar">Back to Calendar</a>
        </div>
      `;
      const res = parseTicketWebSchedule(html, {
        name: 'The Comedy Store',
        slug: 'the-comedy-store',
        city: 'West Hollywood',
        state: 'CA',
        timezone: 'America/Los_Angeles'
      });

      assert.equal(res.events.length, 1);
      assert.equal(res.events[0].title, 'Buy Tickets'); // or card title
      assert.match(res.events[0].ticket_url, /ticketweb\.com\/event\//);
      assert.doesNotMatch(res.events[0].ticket_url, /calendar/);
    });

    it('returns empty events when only generic calendar links exist', () => {
      const html = `
        <div>
          <a href="https://thecomedystore.com/calendar">Calendar</a>
        </div>
      `;
      const res = parseTicketWebSchedule(html, { name: 'The Comedy Store' });
      assert.equal(res.events.length, 0);
    });
  });

  describe('Etix Platform Adapter', () => {
    it('extracts direct etix event links and preserves dates', () => {
      const html = `
        <div class="show-item">
          <h3>Nate Bargatze</h3>
          <div class="show-date">2026-11-20</div>
          <a href="https://www.etix.com/ticket/p/9876543/nate-bargatze-nashville">Tickets</a>
        </div>
      `;
      const res = parseEtixSchedule(html, {
        name: 'Zanies Comedy Club Nashville',
        slug: 'zanies-nashville',
        city: 'Nashville',
        state: 'TN',
        timezone: 'America/Chicago'
      });

      assert.equal(res.events.length, 1);
      assert.equal(res.events[0].title, 'Nate Bargatze');
      assert.equal(res.events[0].civilDate, '2026-11-20');
      assert.equal(res.events[0].ticket_url, 'https://www.etix.com/ticket/p/9876543/nate-bargatze-nashville');
    });

    it('returns empty events when no direct etix link exists', () => {
      const html = `<div><a href="https://nashville.zanies.com/events">Events</a></div>`;
      const res = parseEtixSchedule(html, { name: 'Zanies Nashville' });
      assert.equal(res.events.length, 0);
    });
  });
});
