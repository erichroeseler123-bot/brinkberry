process.env.SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
process.env.BRINKBERRY_ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const app = require('./index');
const clickHandler = require('./click');
const feedHandler = require('./feed');
const homeHandler = require('./home');
const eventHandler = require('./event');
const weatherHandler = require('./weather');
const routeHandler = require('./route');
const adminApiHandler = require('./admin-api');
const adminHandler = require('./admin');
const ogHandler = require('./og');
const sitemapHandler = require('./sitemap');
const robotsHandler = require('./robots');
const landingHandler = require('./landing');
const widgetHandler = require('./widget');
const termsHandler = require('./terms');
const privacyHandler = require('./privacy');

const marketRequestHandler = require('./market-request');
const entityHandler = require('./entity');
const comedySubmitHandler = require('./comedy-submit');
const comedyReviewHandler = require('./comedy-review');
const comedyCheckoutHandler = require('./comedy-checkout');
const comedyDoorHandler = require('./comedy-door');
const comedyLedgerViewHandler = require('./comedy-ledger-view');
const comedyTicketHandler = require('./comedy-ticket');
const comedyDemandHandler = require('./comedy-demand');
const venueClaimHandler = require('./venue-claim');
const cardHandler = require('./card');
const pilotDashboardHandler = require('./pilot-dashboard');
const racingCardHandler = require('./racing-card');
const racingEntityHandler = require('./racing-entity');
const racingClaimHandler = require('./racing-claim');
const racingDemandHandler = require('./racing-demand');
const racingPilotDashboardHandler = require('./racing-pilot-dashboard');
const coverageAuditHandler = require('./coverage-audit');
const cronIngestHandler = require('./cron-ingest');
const networkEventsHandler = require('./network-events');
const eventSubmissionsHandler = require('./event-submissions');
const inboundEmailHandler = require('./inbound-email');
const operationsDashboardHandler = require('./operations-dashboard');
const submitHandler = require('./submit');
const postHandler = require('./post');

function wrapRes(res) {
  if (!res.status) {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(data));
      return this;
    };
  }
  if (!res.send) {
    res.send = function(data) {
      if (typeof data === 'object') {
        return this.json(data);
      }
      this.end(data);
      return this;
    };
  }
  return res;
}

module.exports = async (req, res) => {
  wrapRes(res);
  try {
    const u = new URL(req.url, 'https://brinkberry.local');
    const p = u.pathname;

    if (p === '/' && u.searchParams.get('mine')) {
      res.statusCode = 302;
      res.setHeader('location', '/admin?mine=' + encodeURIComponent(u.searchParams.get('mine')));
      return res.end('Redirecting…');
    }
    if (p === '/' || p === '/index.html') {
      return homeHandler(req, res);
    }
    if (p === '/terms') {
      return termsHandler(req, res);
    }
    if (p === '/privacy') {
      return privacyHandler(req, res);
    }
    if (p === '/sitemap.xml' || p === '/sitemap') {
      return sitemapHandler(req, res);
    }
    if (p === '/robots.txt') {
      return robotsHandler(req, res);
    }
    if (p === '/widget') {
      return widgetHandler(req, res);
    }
    if (p === '/api/click') {
      return clickHandler(req, res);
    }
    if (p === '/api/feed') {
      return feedHandler(req, res);
    }
    if (p === '/api/market-request') {
      return marketRequestHandler(req, res);
    }
    if (p === '/api/weather') {
      return weatherHandler(req, res);
    }
    if (p === '/api/route') {
      return routeHandler(req, res);
    }
    if (p === '/admin/pilot-racing' || p === '/racing/pilot' || p === '/api/racing/pilot-metrics') {
      return racingPilotDashboardHandler(req, res);
    }
    if (p === '/admin/pilot' || p === '/pilot' || p === '/api/comedy/pilot-metrics') {
      return pilotDashboardHandler(req, res);
    }
    if (p === '/admin/coverage-audit' || p === '/api/coverage-audit') {
      return coverageAuditHandler(req, res);
    }
    if (p === '/api/cron-ingest' || p === '/api/cron/ingest' || p === '/api/cron') {
      return cronIngestHandler(req, res);
    }
    if (p === '/api/network-events' || p === '/api/v1/network/events') {
      return networkEventsHandler(req, res);
    }
    if (p.startsWith('/api/event-submissions') || p === '/submit-schedule' || p === '/admin/submissions') {
      return eventSubmissionsHandler(req, res);
    }
    if (p === '/api/operations-dashboard' || p === '/admin/operations' || p === '/operations') {
      return operationsDashboardHandler(req, res);
    }
    if (p.startsWith('/api/inbound-email')) {
      return inboundEmailHandler(req, res);
    }
    if (p === '/admin') {
      return adminHandler(req, res);
    }
    if (p.startsWith('/event/') || p.startsWith('/shows/') || p.startsWith('/show/')) {
      const match = p.match(/^\/(?:event|shows?)\/([0-9a-zA-Z_-]+)/i);
      req.query = req.query || {};
      if (match) req.query.id = match[1];
      return eventHandler(req, res);
    }
    if (p.startsWith('/og/event/')) {
      const match = p.match(/^\/og\/event\/([0-9a-zA-Z_-]+)/i);
      req.query = req.query || {};
      if (match) req.query.id = match[1];
      return ogHandler(req, res);
    }
    if (p.startsWith('/api/events/')) {
      const match = p.match(/^\/api\/events\/([0-9a-f-]+)/i);
      req.query = req.query || {};
      if (match) req.query.id = match[1];
      return adminApiHandler(req, res);
    }
    if (p === '/post' || p === '/submit' || p === '/manage' || p.startsWith('/post/') || p === '/api/post' || p.startsWith('/api/post/') || p === '/admin/community' || p === '/admin/review-queue' || p === '/admin/community-review') {
      return postHandler(req, res);
    }
    if (p === '/for-venues' || p.startsWith('/api/submit')) {
      return submitHandler(req, res);
    }
    if (p === '/submit-comedy' || p === '/api/comedy/submit') {
      return comedySubmitHandler(req, res);
    }
    if (p === '/api/comedy/checkout') {
      return comedyCheckoutHandler(req, res);
    }
    if (p === '/api/comedy/door/scan') {
      return comedyDoorHandler(req, res);
    }
    if (p.startsWith('/door/')) {
      return comedyDoorHandler(req, res);
    }
    if (p.startsWith('/ticket/')) {
      return comedyTicketHandler(req, res);
    }
    if (p.startsWith('/show-ledger/')) {
      return comedyLedgerViewHandler(req, res);
    }
    if (p === '/api/comedy/demand') {
      return comedyDemandHandler(req, res);
    }
    if ((p.startsWith('/venue/') && p.endsWith('/claim')) || p === '/api/venue/claim') {
      return venueClaimHandler(req, res);
    }
    if (p.startsWith('/card/race/') || p.startsWith('/api/card/race/')) {
      return racingCardHandler(req, res);
    }
    if (p.startsWith('/card/') || p.startsWith('/api/card/')) {
      return cardHandler(req, res);
    }
    if (p.startsWith('/api/comedy/')) {
      return comedyReviewHandler(req, res);
    }
    if (p.startsWith('/venue/') || p.startsWith('/comedian/')) {
      return entityHandler(req, res);
    }
    if (p === '/api/racing/demand') {
      return racingDemandHandler(req, res);
    }
    if ((p.startsWith('/track/') && p.endsWith('/claim')) || p === '/api/racing/claim') {
      return racingClaimHandler(req, res);
    }
    if (p.startsWith('/track/') || p.startsWith('/series/')) {
      return racingEntityHandler(req, res);
    }

    // City & category landing pages: /denver/this-weekend, /london/music, /paris/arts, /denver/comedy, /denver/racing, etc.
    const segments = p.split('/').filter(Boolean);
    const systemPrefixes = ['api', 'event', 'shows', 'show', 'admin', 'widget', 'terms', 'privacy', 'sitemap.xml', 'sitemap', 'robots.txt', 'og', 'venue', 'comedian', 'track', 'series', 'racing', 'submit-comedy', 'door', 'ticket', 'show-ledger', 'card', 'post', 'submit', 'manage'];
    if (segments.length >= 1 && segments.length <= 2 && !systemPrefixes.includes(segments[0].toLowerCase())) {
      return landingHandler(req, res);
    }

    return app(req, res);
  } catch (e) {
    console.error('Router error:', e);
    return app(req, res);
  }
};
