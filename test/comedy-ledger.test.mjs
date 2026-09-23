import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createShowLedger,
  getLedgerByShowId,
  getLedgerByToken,
  getLedgerByDoorToken,
  getTicketByToken,
  calculateMomentumBadge,
  purchaseTickets,
  checkInTicket,
  calculateSplitSettlement,
  getLedgerSummary
} from '../lib/comedy/ledger.js';

import comedyCheckoutHandler from '../api/comedy-checkout.js';
import comedyDoorHandler from '../api/comedy-door.js';
import comedyTicketHandler from '../api/comedy-ticket.js';
import comedyLedgerViewHandler from '../api/comedy-ledger-view.js';
import routerHandler from '../api/router.js';

function createMockReqRes(options = {}) {
  let statusCode = 200;
  let headers = {};
  let body = '';
  let jsonData = null;

  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    async *[Symbol.asyncIterator]() {
      if (options.body) {
        yield typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
    }
  };

  const res = {
    status(c) { statusCode = c; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    send(data) {
      if (typeof data === 'object') {
        jsonData = data;
        body = JSON.stringify(data);
      } else {
        body = String(data);
      }
      return this;
    },
    json(data) {
      jsonData = data;
      body = JSON.stringify(data);
      headers['content-type'] = 'application/json; charset=utf-8';
      return this;
    },
    end(data) {
      if (data) body = String(data);
      return this;
    }
  };

  return {
    req,
    res,
    getStatus: () => res.statusCode || statusCode,
    getBody: () => body,
    getJson: () => jsonData || (body ? JSON.parse(body) : null),
    getHeaders: () => headers
  };
}

test('Stand-Up Comedy Box Office Ledger & Door Toolkit Suite', async (t) => {

  await t.test('1. Box Office Ledger Creation & Settlement Models', () => {
    // A. Default door split (80% talent / 20% venue)
    const ledgerA = createShowLedger('show_brewery_001', {
      capacity: 50,
      price: 20,
      splitModel: 'door_split',
      talentSplitPct: 80
    });

    assert.equal(ledgerA.showId, 'show_brewery_001');
    assert.equal(ledgerA.capacity, 50);
    assert.equal(ledgerA.price, 20);
    assert.equal(ledgerA.talentSplitPct, 80);
    assert.equal(ledgerA.venueSplitPct, 20);
    assert.match(ledgerA.ledgerToken, /^lt_[a-f0-9]{24}$/);
    assert.match(ledgerA.doorToken, /^dt_[a-f0-9]{24}$/);

    // Retrieve via tokens
    assert.equal(getLedgerByShowId('show_brewery_001'), ledgerA);
    assert.equal(getLedgerByToken(ledgerA.ledgerToken), ledgerA);
    assert.equal(getLedgerByDoorToken(ledgerA.doorToken), ledgerA);

    // Test door split settlement on $1000 gross
    ledgerA.grossRevenue = 1000;
    const splitA = calculateSplitSettlement(ledgerA);
    assert.equal(splitA.grossRevenue, 1000);
    assert.equal(splitA.talentPayout, 800);
    assert.equal(splitA.venuePayout, 200);
    assert.match(splitA.notes, /80% Talent \/ 20% Venue/);

    // B. Guarantee + Backend split model ($400 guarantee, 80% above base)
    const ledgerB = createShowLedger('show_indie_theatre_002', {
      capacity: 100,
      price: 25,
      splitModel: 'guarantee_backend',
      guaranteeBase: 400,
      talentSplitPct: 80
    });
    ledgerB.grossRevenue = 1000;
    const splitB = calculateSplitSettlement(ledgerB);
    // Base 400 + 80% of (1000 - 400) = 400 + 480 = 880
    assert.equal(splitB.talentPayout, 880);
    assert.equal(splitB.venuePayout, 120);
    assert.match(splitB.notes, /\$400 guarantee plus 80% backend/);

    // C. Room Deductible model ($150 room deductible, remainder split 80/20)
    const ledgerC = createShowLedger('show_art_space_003', {
      capacity: 60,
      price: 15,
      splitModel: 'room_deductible',
      roomDeductible: 150,
      talentSplitPct: 80
    });
    ledgerC.grossRevenue = 1000;
    const splitC = calculateSplitSettlement(ledgerC);
    // 1000 - 150 = 850; 850 * 0.8 = 680 talent; venue gets 150 + 170 = 320
    assert.equal(splitC.talentPayout, 680);
    assert.equal(splitC.venuePayout, 320);
    assert.match(splitC.notes, /\$150 room fee deducted/);
  });

  await t.test('2. Ticket Velocity & Momentum Badges', () => {
    // 0 tickets sold
    const badge0 = calculateMomentumBadge(100, 0);
    assert.equal(badge0.level, 'normal');
    assert.equal(badge0.badge, 'Tickets Available');

    // 60% sold -> Selling Fast
    const badge60 = calculateMomentumBadge(100, 60);
    assert.equal(badge60.level, 'fast');
    assert.match(badge60.badge, /Selling Fast \(60% reserved\)/);

    // 88% sold -> Nearly Sold Out
    const badge88 = calculateMomentumBadge(100, 88);
    assert.equal(badge88.level, 'critical');
    assert.match(badge88.badge, /Nearly Sold Out \(12 seats left\)/);

    // 100% capacity -> Sold Out
    const badge100 = calculateMomentumBadge(100, 100);
    assert.equal(badge100.level, 'sold_out');
    assert.equal(badge100.badge, 'Sold Out');
  });

  await t.test('3. Direct Ticketing Purchases & Capacity Constraints', () => {
    const showId = 'show_cap_test_001';
    const ledger = createShowLedger(showId, { capacity: 10, price: 15 });

    // Purchase 3 tickets
    const order1 = purchaseTickets(showId, {
      quantity: 3,
      buyerName: 'Alice Standup',
      buyerEmail: 'alice@example.com'
    });

    assert.equal(order1.order.quantity, 3);
    assert.equal(order1.order.totalAmount, 45);
    assert.equal(order1.tickets.length, 3);
    assert.equal(ledger.ticketsSold, 3);
    assert.equal(ledger.grossRevenue, 45);

    const firstTicket = order1.tickets[0];
    assert.match(firstTicket.token, /^tkt_[a-f0-9]{32}$/);
    assert.equal(firstTicket.status, 'valid');
    assert.equal(firstTicket.buyerName, 'Alice Standup');
    assert.equal(firstTicket.ticketIndex, 1);
    assert.equal(firstTicket.totalInOrder, 3);

    // Retrieve ticket from store
    const storedTicket = getTicketByToken(firstTicket.token);
    assert.equal(storedTicket, firstTicket);

    // Purchase 7 more tickets (reaching 10/10 capacity)
    const order2 = purchaseTickets(showId, {
      quantity: 7,
      buyerName: 'Bob Comedy',
      buyerEmail: 'bob@example.com'
    });
    assert.equal(order2.order.quantity, 7);
    assert.equal(ledger.ticketsSold, 10);

    // Next purchase attempt should fail due to sold out
    assert.throws(() => {
      purchaseTickets(showId, { quantity: 1, buyerName: 'Late Fan' });
    }, /Sold out: Only 0 ticket\(s\) remaining/);
  });

  await t.test('4. QR Door Scanner Check-In & Duplicate Detection', () => {
    const showId = 'show_door_checkin_001';
    const ledger = createShowLedger(showId, { capacity: 20, price: 10 });

    const purchase = purchaseTickets(showId, {
      quantity: 2,
      buyerName: 'Charlie Crowd'
    });

    const ticketA = purchase.tickets[0];
    const ticketB = purchase.tickets[1];

    // First scan for ticketA -> Success
    const scan1 = checkInTicket(ticketA.token);
    assert.equal(scan1.success, true);
    assert.equal(scan1.status, 'checked_in');
    assert.equal(scan1.ticket.status, 'checked_in');
    assert.ok(scan1.ticket.checkedInAt);
    assert.equal(ledger.ticketsCheckedIn, 1);
    assert.match(scan1.message, /Welcome, Charlie Crowd! \(1 of 2\)/);

    // Second scan for ticketA -> Duplicate Rejection
    const scanDuplicate = checkInTicket(ticketA.token);
    assert.equal(scanDuplicate.success, false);
    assert.equal(scanDuplicate.status, 'duplicate');
    assert.match(scanDuplicate.message, /Already checked in at/);
    assert.equal(ledger.ticketsCheckedIn, 1); // Not double counted!

    // Invalid token -> Rejected
    const scanInvalid = checkInTicket('tkt_bogus_token_12345');
    assert.equal(scanInvalid.success, false);
    assert.equal(scanInvalid.status, 'invalid');
    assert.match(scanInvalid.message, /Invalid ticket: QR code not recognized/);

    // Scan ticketB -> Success
    const scan2 = checkInTicket(ticketB.token);
    assert.equal(scan2.success, true);
    assert.equal(scan2.status, 'checked_in');
    assert.equal(ledger.ticketsCheckedIn, 2);
  });

  await t.test('5. API Handlers & Views', async () => {
    const showId = 'show_api_test_001';
    const ledger = createShowLedger(showId, { capacity: 25, price: 18 });

    // A0. Public production lockdown check (when not in test/prototype mode)
    const prevProto = process.env.COMEDY_PROTOTYPE_MODE;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.COMEDY_PROTOTYPE_MODE = 'disabled';
    process.env.NODE_ENV = 'production';

    const lockedMock = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/checkout',
      body: { showId, quantity: 1 }
    });
    await comedyCheckoutHandler(lockedMock.req, lockedMock.res);
    assert.equal(lockedMock.getStatus(), 403);
    assert.equal(lockedMock.getJson().status, 'prototype_disabled');

    // Restore test/prototype environment
    process.env.COMEDY_PROTOTYPE_MODE = 'enabled';
    process.env.NODE_ENV = 'test';

    // A. POST /api/comedy/checkout in prototype mode
    const checkoutMock = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/checkout',
      body: {
        showId,
        quantity: 2,
        buyerName: 'Dana Listener',
        buyerEmail: 'dana@example.com'
      }
    });
    await comedyCheckoutHandler(checkoutMock.req, checkoutMock.res);
    assert.equal(checkoutMock.getStatus(), 200);
    const checkoutData = checkoutMock.getJson();
    assert.equal(checkoutData.success, true);
    assert.equal(checkoutData.quantity, 2);
    assert.equal(checkoutData.tickets.length, 2);
    const createdTicket = checkoutData.tickets[0];

    // B. GET /api/comedy/checkout?showId=...
    const summaryMock = createMockReqRes({
      method: 'GET',
      url: `/api/comedy/checkout?showId=${showId}`
    });
    await comedyCheckoutHandler(summaryMock.req, summaryMock.res);
    assert.equal(summaryMock.getStatus(), 200);
    const summaryData = summaryMock.getJson();
    assert.equal(summaryData.summary.ticketsSold, 2);
    assert.equal(summaryData.summary.capacity, 25);

    // C. GET /ticket/:token (HTML Mobile Pass)
    const ticketMock = createMockReqRes({
      method: 'GET',
      url: `/ticket/${createdTicket.token}`
    });
    await comedyTicketHandler(ticketMock.req, ticketMock.res);
    assert.equal(ticketMock.getStatus(), 200);
    assert.match(ticketMock.getBody(), /Live Mobile Pass/);
    assert.match(ticketMock.getBody(), /VALID ENTRY/);
    assert.match(ticketMock.getBody(), /Dana Listener/);

    // D. GET /ticket/:token?format=json
    const ticketJsonMock = createMockReqRes({
      method: 'GET',
      url: `/ticket/${createdTicket.token}?format=json`
    });
    await comedyTicketHandler(ticketJsonMock.req, ticketJsonMock.res);
    assert.equal(ticketJsonMock.getStatus(), 200);
    assert.equal(ticketJsonMock.getJson().ticket.token, createdTicket.token);

    // E. GET /door/:doorToken (Door Scanner Portal)
    const doorPageMock = createMockReqRes({
      method: 'GET',
      url: `/door/${ledger.doorToken}`
    });
    await comedyDoorHandler(doorPageMock.req, doorPageMock.res);
    assert.equal(doorPageMock.getStatus(), 200);
    assert.match(doorPageMock.getBody(), /Door Check-In Scanner/);
    assert.match(doorPageMock.getBody(), /Validate & Check In/);

    // F. POST /api/comedy/door/scan
    const doorScanMock = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/door/scan',
      body: { token: createdTicket.token }
    });
    await comedyDoorHandler(doorScanMock.req, doorScanMock.res);
    assert.equal(doorScanMock.getStatus(), 200);
    assert.equal(doorScanMock.getJson().success, true);
    assert.equal(doorScanMock.getJson().status, 'checked_in');

    // G. POST /api/comedy/door/scan duplicate
    const duplicateDoorMock = createMockReqRes({
      method: 'POST',
      url: '/api/comedy/door/scan',
      body: { token: createdTicket.token }
    });
    await comedyDoorHandler(duplicateDoorMock.req, duplicateDoorMock.res);
    assert.equal(duplicateDoorMock.getStatus(), 409);
    assert.equal(duplicateDoorMock.getJson().success, false);
    assert.equal(duplicateDoorMock.getJson().status, 'duplicate');

    // H. GET /show-ledger/:ledgerToken (Dashboard)
    const ledgerDashboardMock = createMockReqRes({
      method: 'GET',
      url: `/show-ledger/${ledger.ledgerToken}`
    });
    await comedyLedgerViewHandler(ledgerDashboardMock.req, ledgerDashboardMock.res);
    assert.equal(ledgerDashboardMock.getStatus(), 200);
    assert.match(ledgerDashboardMock.getBody(), /Live Box Office Ledger/);
    assert.match(ledgerDashboardMock.getBody(), /Talent Payout/);
    assert.match(ledgerDashboardMock.getBody(), /Phone Door Scanner Link/);
  });

  await t.test('6. Router Integration & System Prefixes Protection', async () => {
    const showId = 'show_router_test_001';
    const ledger = createShowLedger(showId, { capacity: 30, price: 12 });
    const purchase = purchaseTickets(showId, { quantity: 1, buyerName: 'Evan Visitor' });
    const ticket = purchase.tickets[0];

    // Verify /door/:doorToken dispatches to door handler through router
    const rDoorMock = createMockReqRes({ method: 'GET', url: `/door/${ledger.doorToken}` });
    await routerHandler(rDoorMock.req, rDoorMock.res);
    assert.equal(rDoorMock.getStatus(), 200);
    assert.match(rDoorMock.getBody(), /Door Check-In Scanner/);

    // Verify /ticket/:token dispatches to ticket pass handler
    const rTicketMock = createMockReqRes({ method: 'GET', url: `/ticket/${ticket.token}` });
    await routerHandler(rTicketMock.req, rTicketMock.res);
    assert.equal(rTicketMock.getStatus(), 200);
    assert.match(rTicketMock.getBody(), /Evan Visitor/);

    // Verify /show-ledger/:ledgerToken dispatches to ledger view handler
    const rLedgerMock = createMockReqRes({ method: 'GET', url: `/show-ledger/${ledger.ledgerToken}` });
    await routerHandler(rLedgerMock.req, rLedgerMock.res);
    assert.equal(rLedgerMock.getStatus(), 200);
    assert.match(rLedgerMock.getBody(), /Live Box Office Ledger/);

    // Verify /api/comedy/checkout dispatches to checkout API
    const rCheckoutMock = createMockReqRes({ method: 'GET', url: `/api/comedy/checkout?showId=${showId}` });
    await routerHandler(rCheckoutMock.req, rCheckoutMock.res);
    assert.equal(rCheckoutMock.getStatus(), 200);
    assert.equal(rCheckoutMock.getJson().summary.ticketsSold, 1);
  });
});
