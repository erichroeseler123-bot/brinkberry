/**
 * Stand-Up Comedy Box Office Ledger & Settlement Engine
 *
 * Provides real-time capacity tracking, ticket ordering, QR check-in verification,
 * live velocity metrics, and transparent financial split settlements.
 */

const crypto = require('crypto');

// In-memory store for show ledgers, orders, and tickets
const ledgersStore = new Map();
const ticketsStore = new Map();

/**
 * Creates or initializes a box office ledger for a show
 */
function createShowLedger(showId, options = {}) {
  if (!showId) throw new Error('Show ID required');

  const capacity = Number(options.capacity) || 75;
  const price = Number(options.price) || 0;
  const splitModel = options.splitModel || 'door_split'; // 'door_split', 'guarantee_backend', 'room_deductible'
  const talentSplitPct = options.talentSplitPct != null ? Number(options.talentSplitPct) : 80;
  const venueSplitPct = 100 - talentSplitPct;
  const guaranteeBase = Number(options.guaranteeBase) || 0;
  const roomDeductible = Number(options.roomDeductible) || 0;
  const ledgerToken = `lt_${crypto.randomBytes(12).toString('hex')}`;
  const doorToken = `dt_${crypto.randomBytes(12).toString('hex')}`;

  const ledger = {
    showId,
    capacity,
    price,
    splitModel,
    talentSplitPct,
    venueSplitPct,
    guaranteeBase,
    roomDeductible,
    ledgerToken,
    doorToken,
    ticketsSold: 0,
    ticketsCheckedIn: 0,
    grossRevenue: 0,
    orders: [],
    createdAt: new Date().toISOString()
  };

  ledgersStore.set(showId, ledger);
  // Also index by tokens for secure access
  ledgersStore.set(`token_${ledgerToken}`, ledger);
  ledgersStore.set(`door_${doorToken}`, ledger);

  return ledger;
}

function getLedgerByShowId(showId) {
  return ledgersStore.get(showId) || null;
}

function getLedgerByToken(token) {
  return ledgersStore.get(`token_${token}`) || null;
}

function getLedgerByDoorToken(token) {
  return ledgersStore.get(`door_${token}`) || null;
}

/**
 * Calculates momentum badge based on sell-through rate and remaining capacity
 */
function calculateMomentumBadge(capacity, ticketsSold) {
  if (capacity <= 0) return { badge: 'Available', level: 'normal' };
  const pct = Math.round((ticketsSold / capacity) * 100);

  if (ticketsSold >= capacity) {
    return { badge: 'Sold Out', level: 'sold_out', pct: 100 };
  }
  if (pct >= 85 || (capacity - ticketsSold) <= 10) {
    return { badge: `Nearly Sold Out (${capacity - ticketsSold} seats left)`, level: 'critical', pct };
  }
  if (pct >= 60) {
    return { badge: `Selling Fast (${pct}% reserved)`, level: 'fast', pct };
  }
  return { badge: 'Tickets Available', level: 'normal', pct };
}

/**
 * Purchases or reserves tickets for a show
 */
function purchaseTickets(showId, orderData = {}) {
  let ledger = getLedgerByShowId(showId);
  if (!ledger) {
    // Automatically initialize default ledger if not yet created
    ledger = createShowLedger(showId, {
      capacity: orderData.capacity || 80,
      price: orderData.price || 15
    });
  }

  const quantity = Math.max(1, Math.min(10, Number(orderData.quantity) || 1));
  const remaining = ledger.capacity - ledger.ticketsSold;

  if (remaining < quantity) {
    throw new Error(`Sold out: Only ${remaining} ticket(s) remaining for this show`);
  }

  const orderId = `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const unitPrice = orderData.price != null ? Number(orderData.price) : ledger.price;
  const totalAmount = unitPrice * quantity;
  const buyerName = String(orderData.buyerName || 'Comedy Fan').trim();
  const buyerEmail = String(orderData.buyerEmail || '').trim().toLowerCase();

  const orderTickets = [];
  for (let i = 0; i < quantity; i++) {
    const ticketToken = `tkt_${crypto.randomBytes(16).toString('hex')}`;
    const ticket = {
      token: ticketToken,
      orderId,
      showId,
      ticketIndex: i + 1,
      totalInOrder: quantity,
      buyerName,
      buyerEmail,
      unitPrice,
      status: 'valid', // 'valid', 'checked_in', 'cancelled'
      checkedInAt: null,
      createdAt: new Date().toISOString()
    };
    ticketsStore.set(ticketToken, ticket);
    orderTickets.push(ticket);
  }

  ledger.ticketsSold += quantity;
  ledger.grossRevenue += totalAmount;

  const order = {
    orderId,
    quantity,
    totalAmount,
    buyerName,
    buyerEmail,
    ticketTokens: orderTickets.map(t => t.token),
    createdAt: new Date().toISOString()
  };

  ledger.orders.push(order);

  return {
    order,
    tickets: orderTickets,
    ledgerSummary: getLedgerSummary(showId)
  };
}

/**
 * Checks in a ticket at the door via QR token
 */
function checkInTicket(token) {
  if (!token) throw new Error('Ticket token required');
  const ticket = ticketsStore.get(token);
  if (!ticket) {
    return {
      success: false,
      status: 'invalid',
      message: 'Invalid ticket: QR code not recognized'
    };
  }

  if (ticket.status === 'checked_in') {
    return {
      success: false,
      status: 'duplicate',
      message: `Already checked in at ${new Date(ticket.checkedInAt).toLocaleTimeString()}`,
      ticket
    };
  }

  if (ticket.status === 'cancelled') {
    return {
      success: false,
      status: 'cancelled',
      message: 'This ticket was cancelled or refunded',
      ticket
    };
  }

  ticket.status = 'checked_in';
  ticket.checkedInAt = new Date().toISOString();

  const ledger = getLedgerByShowId(ticket.showId);
  if (ledger) {
    ledger.ticketsCheckedIn += 1;
  }

  return {
    success: true,
    status: 'checked_in',
    message: `Welcome, ${ticket.buyerName}! (${ticket.ticketIndex} of ${ticket.totalInOrder})`,
    ticket,
    doorCount: ledger ? {
      checkedIn: ledger.ticketsCheckedIn,
      sold: ledger.ticketsSold,
      capacity: ledger.capacity
    } : null
  };
}

/**
 * Computes split reconciliation
 */
function calculateSplitSettlement(ledger) {
  const gross = ledger.grossRevenue;
  let talentPayout = 0;
  let venuePayout = 0;
  let notes = '';

  if (ledger.splitModel === 'door_split') {
    talentPayout = Math.round((gross * (ledger.talentSplitPct / 100)) * 100) / 100;
    venuePayout = Math.round((gross - talentPayout) * 100) / 100;
    notes = `${ledger.talentSplitPct}% Talent / ${ledger.venueSplitPct}% Venue door split.`;
  } else if (ledger.splitModel === 'guarantee_backend') {
    const backendPool = Math.max(0, gross - ledger.guaranteeBase);
    const backendTalent = backendPool * (ledger.talentSplitPct / 100);
    talentPayout = Math.round((ledger.guaranteeBase + backendTalent) * 100) / 100;
    venuePayout = Math.round((gross - talentPayout) * 100) / 100;
    notes = `$${ledger.guaranteeBase} guarantee plus ${ledger.talentSplitPct}% backend above base.`;
  } else if (ledger.splitModel === 'room_deductible') {
    const afterDeductible = Math.max(0, gross - ledger.roomDeductible);
    talentPayout = Math.round((afterDeductible * (ledger.talentSplitPct / 100)) * 100) / 100;
    venuePayout = Math.round((gross - talentPayout) * 100) / 100;
    notes = `$${ledger.roomDeductible} room fee deducted, remainder split ${ledger.talentSplitPct}/${ledger.venueSplitPct}.`;
  }

  return {
    splitModel: ledger.splitModel,
    grossRevenue: gross,
    talentPayout,
    venuePayout,
    notes
  };
}

/**
 * Returns comprehensive summary for public display or comic dashboard
 */
function getLedgerSummary(showId) {
  const ledger = getLedgerByShowId(showId);
  if (!ledger) {
    return {
      capacity: 80,
      ticketsSold: 0,
      ticketsCheckedIn: 0,
      remainingCapacity: 80,
      sellThroughPercent: 0,
      momentum: calculateMomentumBadge(80, 0),
      grossRevenue: 0
    };
  }

  const momentum = calculateMomentumBadge(ledger.capacity, ledger.ticketsSold);
  const settlement = calculateSplitSettlement(ledger);

  return {
    showId: ledger.showId,
    capacity: ledger.capacity,
    ticketsSold: ledger.ticketsSold,
    ticketsCheckedIn: ledger.ticketsCheckedIn,
    remainingCapacity: Math.max(0, ledger.capacity - ledger.ticketsSold),
    sellThroughPercent: momentum.pct,
    momentum,
    grossRevenue: ledger.grossRevenue,
    settlement,
    tokens: {
      ledgerToken: ledger.ledgerToken,
      doorToken: ledger.doorToken
    }
  };
}

function getTicketByToken(token) {
  return ticketsStore.get(token) || null;
}

module.exports = {
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
};
