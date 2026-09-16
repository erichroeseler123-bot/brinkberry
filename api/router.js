process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co';
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
    if (p === '/api/click') {
      return clickHandler(req, res);
    }
    if (p === '/api/feed') {
      return feedHandler(req, res);
    }
    if (p === '/api/weather') {
      return weatherHandler(req, res);
    }
    if (p === '/api/route') {
      return routeHandler(req, res);
    }
    if (p === '/admin') {
      return adminHandler(req, res);
    }
    if (p.startsWith('/event/')) {
      const match = p.match(/^\/event\/([0-9a-f-]+)/i);
      req.query = req.query || {};
      if (match) req.query.id = match[1];
      return eventHandler(req, res);
    }
    if (p.startsWith('/og/event/')) {
      const match = p.match(/^\/og\/event\/([0-9a-f-]+)/i);
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
    return app(req, res);
  } catch (e) {
    console.error('Router error:', e);
    return app(req, res);
  }
};
