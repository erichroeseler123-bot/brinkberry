/**
 * Denver Pilot Venue Claim & Outreach Packets
 *
 * IMPORTANT GUARDRAIL:
 * These packets are reviewable drafts ONLY.
 * DO NOT AUTO-SEND outreach emails.
 *
 * Brinkberry's promise to venues and producers:
 * 1. 100% Free: No listing fees, no subscription fees, no claim fees.
 * 2. Zero Ticket Markups: Outbound clicks link directly to your official box office.
 * 3. Transparent Data: Fan demand and attendance intent belong to you, not an intermediary.
 */

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const DENVER_PILOT_PACKETS = [
  {
    venueSlug: 'comedy-works-downtown',
    venueName: 'Comedy Works Downtown',
    neighborhood: 'Larimer Square / Downtown Denver',
    targetContactRole: 'General Manager / Talent Buyer',
    contactEmailSuggestion: 'booking@comedyworks.com',
    claimUrl: `${ORIGIN}/venue/comedy-works-downtown/claim`,
    liveListingUrl: `${ORIGIN}/venue/comedy-works-downtown`,
    officialBoxOfficeUrl: 'https://comedyworks.com/comedians?venue=downtown',
    keyFeaturesHighlighted: [
      'Official box office direct linking (zero commission, zero fees)',
      'Verified Tuesday New Talent Night and weekend headliner radar',
      'Fan demand signals from Front Range comedy attendees',
      'Shareable Instagram Story (1080x1920) and social show cards'
    ],
    emailSubject: 'Official Box Office Link & Verified Listing for Comedy Works Downtown on Brinkberry',
    emailBody: `Hi Comedy Works Team,

We’ve set up a verified radar listing for Comedy Works Downtown on Brinkberry (a fast, free live event and comedy discovery radar):
${ORIGIN}/venue/comedy-works-downtown

A few points on how we operate:
1. 100% Free: We never charge listing fees, claim fees, or commissions.
2. Direct Box Office Linking: Every ticket button routes fans directly to comedyworks.com with zero markups or intermediary fees.
3. Live Accuracy: We sync directly with your published schedule and verified source timestamps.

You can claim your official venue badge and set up direct roster management in under 60 seconds here:
${ORIGIN}/venue/comedy-works-downtown/claim

Verification only requires confirming an official @comedyworks.com address or adding a simple meta tag to your site.

Thank you for being Denver's landmark stand-up institution.

Best regards,
The Brinkberry Radar Team
team@brinkberry.com`
  },
  {
    venueSlug: 'comedy-works-south',
    venueName: 'Comedy Works South at The Landmark',
    neighborhood: 'Greenwood Village / Denver Tech Center',
    targetContactRole: 'General Manager / Box Office Director',
    contactEmailSuggestion: 'south@comedyworks.com',
    claimUrl: `${ORIGIN}/venue/comedy-works-south/claim`,
    liveListingUrl: `${ORIGIN}/venue/comedy-works-south`,
    officialBoxOfficeUrl: 'https://comedyworks.com/comedians?venue=landmark',
    keyFeaturesHighlighted: [
      'Dedicated South Landmark DTC live radar page',
      'Direct-to-official box office ticket linking with zero buyer markups',
      'Headliner weekend promotion and local opener attribution'
    ],
    emailSubject: 'Official Box Office Link for Comedy Works South on Brinkberry',
    emailBody: `Hi Comedy Works South Team,

We’ve launched a dedicated verified listing for Comedy Works South at The Landmark on Brinkberry's live comedy radar:
${ORIGIN}/venue/comedy-works-south

Our core policy for comedy clubs:
- 100% Free: We never charge listing fees, claim fees, or booking commissions.
- Every ticket click links directly to your official box office at comedyworks.com with zero buyer markups.
- Fans can discover shows within our 48-hour immediate radar window across the Denver Tech Center and metro area.

Claim your official room and review your schedule anytime:
${ORIGIN}/venue/comedy-works-south/claim

Best regards,
The Brinkberry Radar Team
team@brinkberry.com`
  },
  {
    venueSlug: 'denver-comedy-underground',
    venueName: 'Denver Comedy Underground',
    neighborhood: 'Cap Hill / Cheesman Park',
    targetContactRole: 'Producer / Venue Director',
    contactEmailSuggestion: 'info@denvercomedyunderground.com',
    claimUrl: `${ORIGIN}/venue/denver-comedy-underground/claim`,
    liveListingUrl: `${ORIGIN}/venue/denver-comedy-underground`,
    officialBoxOfficeUrl: 'https://denvercomedyunderground.com',
    keyFeaturesHighlighted: [
      'Independent room championing Denver underground stand-up',
      'Direct ticket links to denvercomedyunderground.com (free pizza/drinks noted)',
      'High-contrast shareable show cards for Denver locals'
    ],
    emailSubject: 'Verified Listing for Denver Comedy Underground on Brinkberry (Free Box Office Radar)',
    emailBody: `Hey DCU Team,

We love what you’ve built beneath the church in Cap Hill. We’ve added Denver Comedy Underground as a featured verified venue on Brinkberry:
${ORIGIN}/venue/denver-comedy-underground

How Brinkberry works with independent rooms:
- Zero fees forever: No booking cut, no listing fees, no paywalls.
- 100% Direct: Fans clicking for tickets land straight on denvercomedyunderground.com.
- Local Discovery: We emphasize Cap Hill locals, headliner weekends, and community shows.

Claim your venue profile and confirm your official box office link here:
${ORIGIN}/venue/denver-comedy-underground/claim

Keep bringing great comedy to Denver!

Best,
The Brinkberry Radar Team
team@brinkberry.com`
  },
  {
    venueSlug: 'rise-comedy',
    venueName: 'Rise Comedy',
    neighborhood: 'Ballpark / LoDo',
    targetContactRole: 'Artistic Director / Venue Manager',
    contactEmailSuggestion: 'info@risecomedy.com',
    claimUrl: `${ORIGIN}/venue/rise-comedy/claim`,
    liveListingUrl: `${ORIGIN}/venue/rise-comedy`,
    officialBoxOfficeUrl: 'https://risecomedy.com',
    keyFeaturesHighlighted: [
      'Improv, sketch, and stand-up showcase visibility in the Ballpark district',
      'Direct box office linking without ticketing middleman cuts',
      'Weekly recurring show radar'
    ],
    emailSubject: 'Verified Radar Listing for Rise Comedy on Brinkberry',
    emailBody: `Hi Rise Comedy Team,

We’ve published a verified venue profile for Rise Comedy on Brinkberry, Denver’s live event and comedy radar:
${ORIGIN}/venue/rise-comedy

Key points:
- 100% Free: We never charge listing fees, booking commissions, or ticket markups.
- We track stand-up, improv, and sketch revues.
- Ticket links point straight to risecomedy.com.
- Shows are organized by genre, start time, and neighborhood.

You can claim Rise Comedy's page and manage your listings here:
${ORIGIN}/venue/rise-comedy/claim

Cheers,
The Brinkberry Radar Team
team@brinkberry.com`
  },
  {
    venueSlug: 'the-bug-theatre',
    venueName: 'The Bug Theatre',
    neighborhood: 'Sunnyside / North Denver',
    targetContactRole: 'Venue Manager / Event Producer',
    contactEmailSuggestion: 'info@bugtheatre.org',
    claimUrl: `${ORIGIN}/venue/the-bug-theatre/claim`,
    liveListingUrl: `${ORIGIN}/venue/the-bug-theatre`,
    officialBoxOfficeUrl: 'https://bugtheatre.org',
    keyFeaturesHighlighted: [
      'Historic community theater and live comedy showcase highlight',
      'Direct ticket links to bugtheatre.org',
      'Neighborhood cultural event visibility'
    ],
    emailSubject: 'Verified Listing for The Bug Theatre on Brinkberry',
    emailBody: `Hi Bug Theatre Team,

We’ve created a verified venue page for The Bug Theatre on Brinkberry’s live radar:
${ORIGIN}/venue/the-bug-theatre

Brinkberry exists to connect Denver locals with great live theater and comedy without ads or ticket gouging:
- 100% Free: Completely free listing, claiming, and discovery.
- Outbound ticket buttons go directly to your box office at bugtheatre.org.
- Zero commissions or ticket markups.

You can claim your page here:
${ORIGIN}/venue/the-bug-theatre/claim

Warmly,
The Brinkberry Radar Team
team@brinkberry.com`
  },
  {
    venueSlug: 'wide-right-denver',
    venueName: 'Wide Right',
    neighborhood: 'Curtis Park / RiNo',
    targetContactRole: 'Host / Talent Coordinator',
    contactEmailSuggestion: 'booking@widerightdenver.com',
    claimUrl: `${ORIGIN}/venue/wide-right-denver/claim`,
    liveListingUrl: `${ORIGIN}/venue/wide-right-denver`,
    officialBoxOfficeUrl: 'https://widerightdenver.com',
    keyFeaturesHighlighted: [
      'Tuesday open mic and local stand-up showcase focus',
      'Free admission event promotion for Denver comedians and fans',
      'Neighborhood craft wings and comedy synergy'
    ],
    emailSubject: 'Verified Open Mic & Comedy Listing for Wide Right on Brinkberry',
    emailBody: `Hey Wide Right Team,

We’ve added Wide Right’s Tuesday open mic and comedy nights to Brinkberry’s live Denver comedy radar:
${ORIGIN}/venue/wide-right-denver

Brinkberry connects local comics and fans with real, verified rooms:
- 100% Free: Free events remain free — zero fees or sneaky charges.
- Direct links back to widerightdenver.com and sign-up instructions for comics.
- Listed in both Denver Comedy and Denver Open Mics guides.

Claim your venue profile here:
${ORIGIN}/venue/wide-right-denver/claim

Best,
The Brinkberry Radar Team
team@brinkberry.com`
  },
  {
    venueSlug: 'lions-lair-denver',
    venueName: 'Lion’s Lair',
    neighborhood: 'Colfax / City Park West',
    targetContactRole: 'Bar Manager / Monday Open Mic Host',
    contactEmailSuggestion: 'booking@thelionslair.com',
    claimUrl: `${ORIGIN}/venue/lions-lair-denver/claim`,
    liveListingUrl: `${ORIGIN}/venue/lions-lair-denver`,
    officialBoxOfficeUrl: 'https://thelionslair.com',
    keyFeaturesHighlighted: [
      'Historic Colfax dive bar Monday open mic tradition',
      'Underground stand-up and music community support',
      'Zero-fee community calendar'
    ],
    emailSubject: 'Verified Open Mic Listing for Lion’s Lair on Brinkberry',
    emailBody: `Hey Lion’s Lair Team,

We’ve highlighted the legendary Monday night comedy open mic at the Lair on Brinkberry’s live Denver radar:
${ORIGIN}/venue/lions-lair-denver

Brinkberry is 100% Free and community-first. We want Denver comics and live comedy fans to find authentic rooms without dealing with bloated ticket sites or ads.

Claim your room and update your schedule details anytime:
${ORIGIN}/venue/lions-lair-denver/claim

Cheers,
The Brinkberry Radar Team
team@brinkberry.com`
  }
];

function getDenverPilotPackets() {
  return DENVER_PILOT_PACKETS;
}

function getDenverPilotPacketBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).toLowerCase().trim();
  return DENVER_PILOT_PACKETS.find(p => p.venueSlug === clean) || null;
}

module.exports = {
  DENVER_PILOT_PACKETS,
  getDenverPilotPackets,
  getDenverPilotPacketBySlug
};
