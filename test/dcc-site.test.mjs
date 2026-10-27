import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BRINKBERRY_SITE_MANIFEST,
  handleDccContextIntercept,
  isRedRocksOrDenverConcertRelevant,
  buildPartyAtRedRocksHandoffUrl,
  buildFeastlySpreadHandoffUrl,
} = require('../lib/dcc-site.js');
const router = require('../api/router.js');

describe('Brinkberry DCC Site Manifest, Context Redemption & Outbound Handoffs', () => {
  it('serves versioned /.well-known/dcc-site manifest without secrets or commission terms', async () => {
    const headers = {};
    let body = null;
    const req = { url: '/.well-known/dcc-site', headers: {} };
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      end(str) {
        body = JSON.parse(str);
      },
    };
    await router(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(headers['x-dcc-manifest-schema'], 'dcc.site-manifest.v1');
    assert.equal(body.schema, 'dcc.site-manifest.v1');
    assert.equal(body.site_id, 'brinkberry');
    assert.equal(
      body.booking_authority.decision_authorization_mode,
      'shadow_only_no_side_effects'
    );
    assert.equal(body.booking_authority.autonomous_booking_enabled, false);
    assert.equal(body.privacy_and_security.exposes_secrets, false);
    assert.equal(body.privacy_and_security.exposes_commission_terms, false);
  });

  it('redeems opaque dcc_ctx_... into Secure HttpOnly brinkberry_trip_ctx cookie and 302 strips token + personal data', () => {
    const headers = {};
    let ended = false;
    const req = {
      url: '/denver/music?ctx=dcc_ctx_0123456789abcdef&cabin=8110&weight=195&name=Jane+Doe',
      headers: {},
    };
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      end() {
        ended = true;
      },
    };
    const intercepted = handleDccContextIntercept(req, res);
    assert.equal(intercepted, true);
    assert.equal(ended, true);
    assert.equal(res.statusCode, 302);
    assert.equal(headers.location, '/denver/music');
    assert.equal(headers['set-cookie'].includes('brinkberry_trip_ctx=dcc_ctx_0123456789abcdef'), true);
    assert.equal(headers['set-cookie'].includes('HttpOnly'), true);
    assert.equal(headers['set-cookie'].includes('Secure'), true);
  });

  it('builds Party at Red Rocks and FeastlySpread handoff URLs preserving active vs coverage-request distinction', () => {
    assert.equal(
      isRedRocksOrDenverConcertRelevant({
        venue_name: 'Red Rocks Amphitheatre',
        city: 'Morrison',
      }),
      true
    );
    const parrUrl = buildPartyAtRedRocksHandoffUrl({
      contextId: 'dcc_ctx_parr_test_001',
    });
    assert.equal(parrUrl, 'https://partyatredrocks.com/book?ctx=dcc_ctx_parr_test_001');

    const activeFeastly = buildFeastlySpreadHandoffUrl({
      marketSlug: 'wisconsin-dells',
      contextId: 'dcc_ctx_feastly_001',
    });
    assert.equal(
      activeFeastly,
      'https://feastlyspread.com/book?market=wisconsin-dells&ctx=dcc_ctx_feastly_001'
    );

    const coverageFeastly = buildFeastlySpreadHandoffUrl({
      marketSlug: 'gatlinburg',
      contextId: 'dcc_ctx_feastly_002',
    });
    assert.equal(
      coverageFeastly,
      'https://feastlyspread.com/locations?request_market=gatlinburg&ctx=dcc_ctx_feastly_002#coverage-request'
    );
  });
});
