/**
 * Direct Comedy Ticketing Checkout API
 *
 * Allows spontaneous fans to buy or reserve tickets with zero platform bloat,
 * generating verifiable mobile QR tokens and updating the live box-office ledger.
 */

const { purchaseTickets, getLedgerSummary } = require('../lib/comedy/ledger');

module.exports = async (req, res) => {
  if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
  if (!res.json) res.json = function(d) {
    if (this.setHeader) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(d));
    return this;
  };

  try {
    const u = new URL(req.url || '/', 'https://brinkberry.local');

    if (req.method === 'GET') {
      const showId = u.searchParams.get('showId') || u.searchParams.get('eventId');
      if (!showId) {
        return res.status(400).json({ error: 'showId required' });
      }
      const summary = getLedgerSummary(showId);
      return res.status(200).json({ summary });
    }

    if (req.method === 'POST') {
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.COMEDY_PROTOTYPE_MODE === 'enabled';
      if (!isTestEnv) {
        return res.status(403).json({
          error: 'Direct ticketing checkout is an internal prototype and disabled for public transactions. Real-money ticketing requires authenticated comedian onboarding, verified payment processing, and production settlement rails.',
          status: 'prototype_disabled'
        });
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}

      const showId = payload.showId || payload.eventId || u.searchParams.get('showId');
      if (!showId) {
        return res.status(400).json({ error: 'showId required' });
      }

      const result = purchaseTickets(showId, {
        quantity: payload.quantity || 1,
        buyerName: payload.buyerName || 'Comedy Fan',
        buyerEmail: payload.buyerEmail || '',
        price: payload.price
      });

      return res.status(200).json({
        success: true,
        orderId: result.order.orderId,
        quantity: result.order.quantity,
        totalAmount: result.order.totalAmount,
        tickets: result.tickets.map(t => ({
          token: t.token,
          buyerName: t.buyerName,
          ticketIndex: t.ticketIndex,
          totalInOrder: t.totalInOrder,
          qrScanUrl: `https://brinkberry.com/ticket/${t.token}`
        })),
        ledgerSummary: result.ledgerSummary,
        message: `Successfully reserved ${result.order.quantity} ticket(s)!`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Comedy checkout error:', err);
    return res.status(400).json({ error: err.message || 'Checkout failed' });
  }
};
