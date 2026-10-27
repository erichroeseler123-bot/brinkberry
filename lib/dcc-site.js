const FORBIDDEN_URL_PII_FIELDS = [
  'name',
  'fullname',
  'first_name',
  'last_name',
  'passengername',
  'email',
  'phone',
  'weight',
  'weights',
  'passengerweight',
  'passengerweightlbs',
  'maxpassengerweightlbs',
  'accessibility',
  'mobilitynotes',
  'medicalnotes',
  'bookingref',
  'bookingreference',
  'confirmationnumber',
  'cabin',
  'cabinnumber',
  'stateroom',
  'stateroomnumber',
  'privatenotes',
  'internalnotes',
];

const BRINKBERRY_SITE_MANIFEST = {
  schema: 'dcc.site-manifest.v1',
  schemaVersion: 'dcc.site-manifest.v1',
  version: '1.0.0',
  site_id: 'brinkberry',
  siteId: 'brinkberry',
  site_name: 'Brinkberry',
  displayName: 'Brinkberry',
  canonicalDomain: 'brinkberry.com',
  canonical_domains: ['brinkberry.com', 'www.brinkberry.com'],
  aliases: ['dcc:site:brinkberry'],
  consumer_role:
    'Live event, comedy, motorsports, and destination discovery radar with outbound venue/shuttle/catering context handoffs',
  dcc_universe_ids: [
    'univ:red-rocks-concert-shuttle:0.3.0',
    'univ:vacation-rental-catering-spreads:0.3.0',
  ],
  accepted_context_fields: [
    'contextId',
    'destination',
    'date',
    'partySize',
    'shipOrVenue',
  ],
  emitted_context_fields: [
    'contextId',
    'destination',
    'date',
    'partySize',
    'shipOrVenue',
    'targetIntent',
  ],
  booking_authority: {
    primary: 'direct_provider',
    supported_authorities: ['direct_provider', 'inquiry_only', 'request_only'],
    takes_direct_payment: true,
    autonomous_booking_enabled: false,
    decision_authorization_mode: 'shadow_only_no_side_effects',
    universal_multi_provider_checkout: false,
    finality_statement:
      'Brinkberry links directly to official venue box offices, handles comedy pilot door tickets where authorized, and hands off Red Rocks concert transport inquiries to Party at Red Rocks and group catering context to FeastlySpread.',
  },
  natural_relationships: {
    inbound: [
      {
        site_id: 'destinationcommandcenter',
        canonical_domain: 'destinationcommandcenter.com',
        journey_id: 'dcc-to-brinkberry',
        relationship_type: 'destination_event_discovery',
        context_exchange: 'opaque_dcc_ctx',
      },
    ],
    outbound: [
      {
        site_id: 'partyatredrocks',
        canonical_domain: 'partyatredrocks.com',
        journey_id: 'brinkberry-to-party-at-red-rocks',
        relationship_type: 'concert_venue_shuttle_handoff',
        context_exchange: 'opaque_dcc_ctx',
      },
      {
        site_id: 'feastlyspread',
        canonical_domain: 'feastlyspread.com',
        journey_id: 'brinkberry-to-feastly-spread',
        relationship_type: 'destination_group_catering_handoff',
        context_exchange: 'opaque_dcc_ctx',
      },
    ],
  },
  commercial_channels: [
    {
      channel_id: 'brinkberry-to-parr-handoff',
      provider: 'inquiry_only',
      attribution_parameter: 'dcc_handoff_id,utm_campaign',
      outcome_reporting: 'request_or_inquiry_only',
      notes:
        'Hands off Red Rocks and Denver/Morrison concert event context to Party at Red Rocks without claiming live inventory hold or payment authority.',
    },
    {
      channel_id: 'brinkberry-to-feastly-handoff',
      provider: 'request_only',
      attribution_parameter: 'dcc_handoff_id,utm_campaign',
      outcome_reporting: 'request_or_inquiry_only',
      notes:
        'Routes vacation-rental/destination context to FeastlySpread active or coverage-request markets.',
    },
  ],
  context_support: {
    mode: 'private_trip_context',
    supports_private_trip_context: true,
    supports_public_shared_plans: false,
    cookie_name: 'brinkberry_trip_ctx',
    cookie_flags: 'Secure; HttpOnly; SameSite=Lax',
    strips_token_from_url: true,
    url_pii_forbidden: true,
    forbidden_url_fields: FORBIDDEN_URL_PII_FIELDS,
  },
  privacy_and_security: {
    exposes_secrets: false,
    exposes_customer_information: false,
    exposes_private_evidence: false,
    exposes_commission_terms: false,
  },
};

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function getActiveBrinkberryContextId(req) {
  try {
    const u = new URL(req.url || '/', 'https://brinkberry.com');
    const urlCtx = u.searchParams.get('ctx')?.trim() || u.searchParams.get('dcc_ctx')?.trim();
    if (urlCtx && /^dcc_ctx_[a-zA-Z0-9_-]{8,128}$/.test(urlCtx)) {
      return urlCtx;
    }
  } catch (_) {}
  const cookies = parseCookies(req?.headers?.cookie);
  const cookieCtx = cookies.brinkberry_trip_ctx;
  if (cookieCtx && /^dcc_ctx_[a-zA-Z0-9_-]{8,128}$/.test(cookieCtx)) {
    return cookieCtx;
  }
  return null;
}

function handleDccContextIntercept(req, res) {
  try {
    const u = new URL(req.url || '/', 'https://brinkberry.com');
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/.well-known/')) {
      return false;
    }

    const rawCtx = (u.searchParams.get('ctx') || u.searchParams.get('dcc_ctx') || '').trim();
    const hasValidOpaqueToken = /^dcc_ctx_[a-zA-Z0-9_-]{8,128}$/.test(rawCtx);

    let strippedForbiddenParam = false;
    for (const key of Array.from(u.searchParams.keys())) {
      const normalized = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (FORBIDDEN_URL_PII_FIELDS.includes(normalized)) {
        u.searchParams.delete(key);
        strippedForbiddenParam = true;
      }
    }

    if (hasValidOpaqueToken || strippedForbiddenParam) {
      u.searchParams.delete('ctx');
      u.searchParams.delete('dcc_ctx');
      const cleanLocation = u.pathname + (u.search || '');
      if (hasValidOpaqueToken) {
        res.setHeader(
          'Set-Cookie',
          `brinkberry_trip_ctx=${encodeURIComponent(rawCtx)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
        );
      }
      res.statusCode = 302;
      res.setHeader('Location', cleanLocation);
      res.end('Redirecting…');
      return true;
    }
  } catch (_) {}
  return false;
}

function isRedRocksOrDenverConcertRelevant(event) {
  if (!event || typeof event !== 'object') return false;
  const venue = String(event.venue_name || event.venue || '').toLowerCase();
  const city = String(event.city || '').toLowerCase();
  const title = String(event.title || '').toLowerCase();
  if (venue.includes('red rocks') || title.includes('red rocks') || city === 'morrison') {
    return true;
  }
  if ((city === 'denver' || city === 'golden' || city === 'boulder') && !String(event.id || '').startsWith('race_')) {
    return true;
  }
  return false;
}

function buildPartyAtRedRocksHandoffUrl({ event, contextId } = {}) {
  const qs = new URLSearchParams();
  if (contextId && /^dcc_ctx_[a-zA-Z0-9_-]{8,128}$/.test(contextId)) {
    qs.set('ctx', contextId);
  } else {
    if (event?.start_time) {
      const isoDate = String(event.start_time).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        qs.set('date', isoDate);
      }
    }
    qs.set('utm_source', 'brinkberry');
    qs.set('utm_medium', 'portfolio_handoff');
    qs.set('utm_campaign', 'brinkberry-to-parr');
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return `https://partyatredrocks.com/book${suffix}`;
}

function buildFeastlySpreadHandoffUrl({ marketSlug = 'wisconsin-dells', contextId } = {}) {
  const normalized = String(marketSlug || 'wisconsin-dells').trim().toLowerCase();
  const isActive = normalized === 'wisconsin-dells' || normalized === 'door-county';
  const basePath = isActive
    ? `/book?market=${encodeURIComponent(normalized)}`
    : `/locations?request_market=${encodeURIComponent(normalized)}`;
  const url = new URL(basePath, 'https://feastlyspread.com');
  if (contextId && /^dcc_ctx_[a-zA-Z0-9_-]{8,128}$/.test(contextId)) {
    url.searchParams.set('ctx', contextId);
  }
  if (!isActive) {
    url.hash = 'coverage-request';
  }
  return url.toString();
}

module.exports = {
  FORBIDDEN_URL_PII_FIELDS,
  BRINKBERRY_SITE_MANIFEST,
  getActiveBrinkberryContextId,
  handleDccContextIntercept,
  isRedRocksOrDenverConcertRelevant,
  buildPartyAtRedRocksHandoffUrl,
  buildFeastlySpreadHandoffUrl,
};
