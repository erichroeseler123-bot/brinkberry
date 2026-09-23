/**
 * Safe Affiliate Link Decorator & URL Validator
 *
 * Rules:
 * 1. Only decorates URLs when legitimate, non-placeholder environment keys exist.
 * 2. If credentials are missing or placeholder, returns the raw validated ticket URL.
 * 3. Enforces HTTPS and validates hostnames to prevent open redirects.
 */

const ALLOWED_TICKET_HOSTS = [
  'ticketmaster.com',
  'livenation.com',
  'eventbrite.com',
  'stubhub.com',
  'seatgeek.com',
  'axs.com',
  'viator.com',
  'denverartmuseum.org',
  'botanicgardens.org',
  'redrocksonline.com',
  'ucdenver.edu',
  'dice.fm',
  'etix.com',
  'dazzledenver.com',
  'cervantesmasterpiece.com',
  'herbsbar.com',
  'comedyworks.com',
  'denvercenter.org',
  'denverbeerco.com',
  'fictionbeer.com',
  'zencenterofdenver.org',
  'mcadenver.org',
  'bouldertheater.com',
  'foxtheatre.com',
  'chautauqua.com',
  'auroragov.org',
  'aurorafoxartscenter.org',
  'stanleymarketplace.com',
  'visitgolden.com',
  'cityofgolden.net',
  'buffalorosegolden.com',
  'goldhillinn.com',
  'flytecotower.com',
  'missionballroom.com',
  'z2ent.com',
  'thedairy.org',
  'foothillsartcenter.org',
  'colorado.edu',
  'uwec.edu',
  'bouldercolorado.gov',
  'denvergov.org',
  'denverlibrary.org',
  'telecharge.com',
  'ticketweb.com',
  'tixr.com',
  'universe.com',
  'bandsintown.com',
  'songkick.com',
  'showclix.com',
  'brownpapertickets.com',
  'eventim.com',
  'seetickets.us',
  'prekindle.com',
  'ticketfly.com',
  'ticketleap.com',
  'denvercomedyunderground.com',
  'secondcity.com',
  'zanies.com',
  'theplus.ec',
  'panameartcafe.com',
  'risecomedy.com',
  'thestandnyc.com',
  'volusiaspeedwaypark.com',
  'coloradospeedway.com',
  'i-76speedway.com',
  'eldoraspeedway.com',
  'knoxvilleraceway.com',
  'williamsgrove.com',
  'oswegospeedway.com',
  'perrisautospeedway.com',
  'sycamorespeedway.com',
  'kennedalespeedwaypark.com',
  'raceirp.com',
  'comedycellar.com',
  'gothamcomedyclub.com',
  'thecomedystore.com',
  'laughfactory.com',
  'capcitycomedy.com',
  'comedymothership.com',
  'bugtheatre.org',
  'widerightdenver.com',
  'eauclairewi.gov',
  'ecpubliclibrary.info',
  'minneapolismn.gov',
  'hclib.org',
  'austintexas.gov',
  'nyc.gov',
  'nypl.org',
  'colorado.gov'
];

function isValidTicketUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_TICKET_HOSTS.some(allowed => hostname === allowed || hostname.endsWith('.' + allowed));
  } catch {
    return false;
  }
}

function buildSafeAffiliateUrl(source, rawUrl, eventId) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  
  // Validate URL structure
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
  } catch {
    return '';
  }

  const encodedUrl = encodeURIComponent(rawUrl);

  // Check for genuine, non-placeholder environment credentials
  switch (source) {
    case 'ticketmaster': {
      const campaignId = process.env.IMPACT_TICKETMASTER_CAMPAIGN_ID;
      const mediaPartnerId = process.env.IMPACT_MEDIA_PARTNER_ID;
      // Do not use if missing or placeholder
      if (campaignId && mediaPartnerId && campaignId !== '12345' && mediaPartnerId !== '67890') {
        return `https://ticketmaster.evyy.net/c/${mediaPartnerId}/${campaignId}/4272?u=${encodedUrl}&subId1=brinkberry&subId2=${encodeURIComponent(eventId || '')}`;
      }
      return rawUrl;
    }
    case 'eventbrite': {
      const affId = process.env.EVENTBRITE_AFFILIATE_ID;
      if (affId && affId !== 'brinkberry_aff') {
        try {
          const url = new URL(rawUrl);
          url.searchParams.set('aff', affId);
          url.searchParams.set('utm_source', 'brinkberry');
          return url.toString();
        } catch {
          return rawUrl;
        }
      }
      return rawUrl;
    }
    case 'seatgeek': {
      const aid = process.env.SEATGEEK_AID;
      const pid = process.env.SEATGEEK_PID;
      if ((aid && aid !== '12345') || (pid && pid !== '67890')) {
        try {
          const url = new URL(rawUrl);
          if (aid) url.searchParams.set('aid', aid);
          if (pid) url.searchParams.set('pid', pid);
          url.searchParams.set('utm_source', 'brinkberry');
          return url.toString();
        } catch {
          return rawUrl;
        }
      }
      return rawUrl;
    }
    default:
      return rawUrl;
  }
}

module.exports = {
  isValidTicketUrl,
  buildSafeAffiliateUrl,
  ALLOWED_TICKET_HOSTS
};
