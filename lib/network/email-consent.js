/**
 * Venue Email Consent Registry
 *
 * Manages explicit club consent records for Inbound Email Schedule Ingestion.
 *
 * Strict Guardrails:
 * - Sender authentication (SPF/DKIM) is NOT venue authorization.
 * - Inbound emails are strictly processed ONLY for venues with active consent on file.
 * - Authorized senders must match the venue's explicit allowlist.
 */

const PILOT_CONSENTING_CLUBS = [
  {
    consentId: 'cns_rise_comedy_01',
    venueId: 'venue_rise_comedy',
    clubName: 'RISE Comedy',
    city: 'Denver',
    state: 'CO',
    lat: 39.7538,
    lon: -104.9942,
    status: 'active',
    consentedBy: {
      name: 'Nick Armstrong',
      role: 'Artistic Director / Owner',
      email: 'nick@risecomedy.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'booking@risecomedy.com',
      'nick@risecomedy.com',
      'calendar@risecomedy.com'
    ],
    authorizedDomains: ['risecomedy.com'],
    website: 'https://risecomedy.com',
    allowedFormats: ['ics_attachment', 'csv_attachment', 'body_text'],
    notes: 'Authorized schedule forwarding for main room and improv shows'
  },
  {
    consentId: 'cns_comedy_works_02',
    venueId: 'venue_comedy_works_downtown',
    clubName: 'Comedy Works Downtown',
    city: 'Denver',
    state: 'CO',
    lat: 39.7483,
    lon: -104.9972,
    status: 'active',
    consentedBy: {
      name: 'Wende Curtis',
      role: 'Owner & CEO',
      email: 'wende@comedyworks.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'calendar@comedyworks.com',
      'booking@comedyworks.com'
    ],
    authorizedDomains: ['comedyworks.com'],
    website: 'https://www.comedyworks.com',
    allowedFormats: ['ics_attachment', 'body_text'],
    notes: 'Weekly headliner schedule forwarding'
  },
  {
    consentId: 'cns_denver_comedy_lounge_03',
    venueId: 'venue_denver_comedy_lounge',
    clubName: 'Denver Comedy Lounge',
    city: 'Denver',
    state: 'CO',
    lat: 39.7555,
    lon: -104.9811,
    status: 'active',
    consentedBy: {
      name: 'Denver Lounge Booker',
      role: 'General Manager',
      email: 'promotions@denvercomedylounge.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'verified_domain_opt_in',
    authorizedSenders: [
      'promotions@denvercomedylounge.com',
      'info@denvercomedylounge.com'
    ],
    authorizedDomains: ['denvercomedylounge.com'],
    website: 'https://denvercomedylounge.com',
    allowedFormats: ['csv_attachment', 'body_text']
  },
  {
    consentId: 'cns_the_stand_nyc_04',
    venueId: 'venue_the_stand_nyc',
    clubName: 'The Stand NYC',
    city: 'New York',
    state: 'NY',
    lat: 40.7368,
    lon: -73.9882,
    status: 'active',
    consentedBy: {
      name: 'Cris Italia',
      role: 'Co-Owner / Producer',
      email: 'cris@thestandnyc.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'shows@thestandnyc.com',
      'cris@thestandnyc.com'
    ],
    authorizedDomains: ['thestandnyc.com'],
    website: 'https://thestandnyc.com',
    allowedFormats: ['ics_attachment', 'csv_attachment']
  },
  {
    consentId: 'cns_eastville_05',
    venueId: 'venue_eastville_comedy',
    clubName: 'EastVille Comedy Club',
    city: 'New York',
    state: 'NY',
    lat: 40.6865,
    lon: -73.9823,
    status: 'active',
    consentedBy: {
      name: 'EastVille Management',
      role: 'Owner',
      email: 'eastvillecomedy@gmail.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'verified_domain_opt_in',
    authorizedSenders: [
      'eastvillecomedy@gmail.com'
    ],
    authorizedDomains: ['eastvillecomedyclub.com'],
    website: 'https://eastvillecomedyclub.com',
    allowedFormats: ['body_text', 'csv_attachment']
  },
  {
    consentId: 'cns_bell_house_06',
    venueId: 'venue_bell_house_nyc',
    clubName: 'The Bell House',
    city: 'New York',
    state: 'NY',
    lat: 40.6738,
    lon: -73.9934,
    status: 'active',
    consentedBy: {
      name: 'Bell House Booking',
      role: 'Talent Buyer',
      email: 'events@thebellhouseny.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'events@thebellhouseny.com',
      'calendar@thebellhouseny.com'
    ],
    authorizedDomains: ['thebellhouseny.com'],
    website: 'https://thebellhouseny.com',
    allowedFormats: ['ics_attachment', 'body_text']
  },
  {
    consentId: 'cns_zanies_chicago_07',
    venueId: 'venue_zanies_chicago',
    clubName: 'Zanies Comedy Club',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9103,
    lon: -87.6358,
    status: 'active',
    consentedBy: {
      name: 'Rick Romas',
      role: 'Operations Director',
      email: 'boxoffice@zanies.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'boxoffice@zanies.com',
      'schedules@zanies.com'
    ],
    authorizedDomains: ['zanies.com'],
    website: 'https://zanies.com',
    allowedFormats: ['csv_attachment', 'body_text']
  },
  {
    consentId: 'cns_laugh_factory_chi_08',
    venueId: 'venue_laugh_factory_chi',
    clubName: 'Laugh Factory Chicago',
    city: 'Chicago',
    state: 'IL',
    lat: 41.9392,
    lon: -87.6492,
    status: 'active',
    consentedBy: {
      name: 'Chicago Management',
      role: 'Club Manager',
      email: 'chicago@laughfactory.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'chicago@laughfactory.com',
      'lineups@laughfactory.com'
    ],
    authorizedDomains: ['laughfactory.com'],
    website: 'https://laughfactory.com',
    allowedFormats: ['ics_attachment', 'body_text']
  },
  {
    consentId: 'cns_clearwater_09',
    venueId: 'venue_clearwater_comedy',
    clubName: 'Clearwater Comedy (Plus Theater)',
    city: 'Eau Claire',
    state: 'WI',
    lat: 44.8113,
    lon: -91.4985,
    status: 'active',
    consentedBy: {
      name: 'Cullen Ryan',
      role: 'Producer / Booker',
      email: 'clearwatercomedy@gmail.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'clearwatercomedy@gmail.com'
    ],
    authorizedDomains: [],
    website: 'https://theplus.ec',
    allowedFormats: ['csv_attachment', 'body_text']
  },
  {
    consentId: 'cns_comedy_store_10',
    venueId: 'venue_the_comedy_store',
    clubName: 'The Comedy Store',
    city: 'West Hollywood',
    state: 'CA',
    lat: 34.0921,
    lon: -118.3758,
    status: 'active',
    consentedBy: {
      name: 'Comedy Store Talent Office',
      role: 'Talent Coordinator',
      email: 'lineups@thecomedystore.com'
    },
    consentedAt: '2026-09-21T12:00:00.000Z',
    consentMethod: 'written_agreement',
    authorizedSenders: [
      'lineups@thecomedystore.com',
      'booking@thecomedystore.com'
    ],
    authorizedDomains: ['thecomedystore.com'],
    website: 'https://thecomedystore.com',
    allowedFormats: ['ics_attachment', 'csv_attachment']
  }
];

class VenueEmailConsentRegistry {
  constructor(initialConsents = PILOT_CONSENTING_CLUBS) {
    this.consents = new Map(initialConsents.map(c => [c.venueId, { ...c }]));
  }

  getConsentByVenueId(venueId) {
    if (!venueId) return null;
    return this.consents.get(venueId) || null;
  }

  isVenueConsented(venueId) {
    const record = this.getConsentByVenueId(venueId);
    return Boolean(record && record.status === 'active');
  }

  isSenderAuthorizedForVenue(venueId, senderEmail) {
    if (!venueId || !senderEmail) return false;
    const record = this.getConsentByVenueId(venueId);
    if (!record || record.status !== 'active') return false;

    const normalizedEmail = senderEmail.trim().toLowerCase();
    const authorizedEmails = (record.authorizedSenders || []).map(e => e.trim().toLowerCase());

    if (authorizedEmails.includes(normalizedEmail)) {
      return true;
    }

    // Check domain authorization
    const domain = normalizedEmail.split('@')[1];
    if (domain && (record.authorizedDomains || []).includes(domain)) {
      return true;
    }

    return false;
  }

  registerConsent(consentData) {
    if (!consentData.venueId || !consentData.clubName) {
      throw new Error('Consent record requires venueId and clubName');
    }
    const record = {
      consentId: consentData.consentId || `cns_${Date.now()}`,
      status: 'active',
      consentedAt: new Date().toISOString(),
      authorizedSenders: [],
      authorizedDomains: [],
      allowedFormats: ['ics_attachment', 'csv_attachment', 'body_text'],
      ...consentData
    };
    this.consents.set(consentData.venueId, record);
    return record;
  }

  revokeConsent(venueId, reason = 'manual_revocation') {
    const record = this.getConsentByVenueId(venueId);
    if (!record) return false;
    record.status = 'revoked';
    record.revokedAt = new Date().toISOString();
    record.revocationReason = reason;
    return true;
  }

  listConsentingVenues() {
    return Array.from(this.consents.values()).filter(c => c.status === 'active');
  }
}

const defaultEmailConsentRegistry = new VenueEmailConsentRegistry();

module.exports = {
  PILOT_CONSENTING_CLUBS,
  VenueEmailConsentRegistry,
  defaultEmailConsentRegistry
};
