/**
 * Race Track Pilot Claim & Outreach Packets
 *
 * IMPORTANT GUARDRAIL:
 * These packets are reviewable drafts ONLY.
 * DO NOT AUTO-SEND outreach emails.
 *
 * Brinkberry's promise to race track owners, promoters, and sanctioning bodies:
 * 1. 100% Free: No listing fees, no subscription fees, no claim fees.
 * 2. Zero Ticket Markups: Outbound clicks link directly to your official box office or disclose cash-at-the-gate policies.
 * 3. Live Weather Radar Integration: Race fans get real-time Open-Meteo precipitation cues and Plan B status directly on your race listings.
 * 4. Transparent Fan Demand: Touring series demand data belongs to you and the series, not an intermediary.
 */

const ORIGIN = process.env.BRINKBERRY_ORIGIN || 'https://brinkberry.com';

const RACING_PILOT_PACKETS = [
  {
    trackSlug: 'colorado-national-speedway',
    trackName: 'Colorado National Speedway',
    location: 'Dacono, CO (North Denver Metro)',
    targetContactRole: 'General Manager / Track Promoter',
    contactEmailSuggestion: 'info@coloradospeedway.com',
    claimUrl: `${ORIGIN}/track/colorado-national-speedway/claim`,
    liveListingUrl: `${ORIGIN}/track/colorado-national-speedway`,
    officialBoxOfficeUrl: 'https://coloradospeedway.com/tickets',
    keyFeaturesHighlighted: [
      'Official box office direct linking (zero fees, zero buyer markups)',
      'NASCAR Weekly Racing Series 48-hour live race weekend radar',
      'Integrated live track weather radar with 3-hour precipitation probability',
      'Shareable Instagram Story (1080x1920) and Open Graph race flyers'
    ],
    emailSubject: 'Official Box Office Link & Verified Radar Profile for Colorado National Speedway',
    emailBody: `Hi CNS Team,

We’ve published a dedicated live radar profile for Colorado National Speedway on Brinkberry (a fast, free live event and sports radar):
${ORIGIN}/track/colorado-national-speedway

Our core commitments to short tracks:
- 100% Free: We never charge listing fees, claim fees, or ticketing commissions.
- Direct-to-Box-Office: Fans clicking for tickets land directly on coloradospeedway.com with zero middleman markups.
- Real-Time Weather Radar: Live Open-Meteo precipitation forecasts help Front Range families plan their Saturday night without wondering about weather delays.

You can claim your official track badge and update your weekly divisions here in under 60 seconds:
${ORIGIN}/track/colorado-national-speedway/claim

Thank you for being the heartbeat of paved short-track racing in the Rocky Mountain region.

Best regards,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  },
  {
    trackSlug: 'i-76-speedway',
    trackName: 'I-76 Speedway',
    location: 'Fort Morgan, CO',
    targetContactRole: 'Track Operator / Race Director',
    contactEmailSuggestion: 'promoter@i-76speedway.com',
    claimUrl: `${ORIGIN}/track/i-76-speedway/claim`,
    liveListingUrl: `${ORIGIN}/track/i-76-speedway`,
    officialBoxOfficeUrl: 'https://i-76speedway.com/events',
    keyFeaturesHighlighted: [
      'Dedicated dirt clay oval calendar for High Plains racing',
      'Instant rainout and weather alert flags on the public radar',
      'Zero fees for drivers, promoters, or fans'
    ],
    emailSubject: 'Verified Listing for I-76 Speedway on Brinkberry (Free Grassroots Radar)',
    emailBody: `Hey I-76 Speedway Team,

We’ve added I-76 Speedway to Brinkberry’s live motorsports radar:
${ORIGIN}/track/i-76-speedway

How Brinkberry helps grassroots dirt tracks:
- 100% Free: Zero listing fees, zero subscriptions, zero ticketing cuts.
- Direct Links: Fans land straight on i-76speedway.com for schedules and admission details.
- Live Weather Alerts: Fans across northeast Colorado can check live track conditions before making the drive.

Claim your track page here:
${ORIGIN}/track/i-76-speedway/claim

Keep dirt racing strong in Eastern Colorado!

Best,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  },
  {
    trackSlug: 'pueblo-motorsports-park',
    trackName: 'Pueblo Motorsports Park',
    location: 'Pueblo, CO',
    targetContactRole: 'Track Manager / Drag Strip Coordinator',
    contactEmailSuggestion: 'manager@pueblomotorsportspark.org',
    claimUrl: `${ORIGIN}/track/pueblo-motorsports-park/claim`,
    liveListingUrl: `${ORIGIN}/track/pueblo-motorsports-park`,
    officialBoxOfficeUrl: 'https://pueblomotorsportspark.org/calendar',
    keyFeaturesHighlighted: [
      'Dual-discipline radar: NHRA drag strip test & tunes + road course track days',
      'Disclosing cash-at-the-gate and racer tech card pricing transparently',
      'Southern Colorado speedway discovery'
    ],
    emailSubject: 'Verified Radar Profile for Pueblo Motorsports Park on Brinkberry',
    emailBody: `Hi Pueblo Motorsports Park Team,

We’ve set up a verified venue profile for Pueblo Motorsports Park on Brinkberry:
${ORIGIN}/track/pueblo-motorsports-park

Key highlights:
- We track Friday night drag test & tunes, NHRA brackets, and road course open lapping.
- 100% Free: No fees or percentages taken from racer entries or spectator admission.
- Direct box office and cash gate transparency.

Claim your track profile anytime:
${ORIGIN}/track/pueblo-motorsports-park/claim

Cheers,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  },
  {
    trackSlug: 'pikes-peak-international-raceway',
    trackName: 'Pikes Peak International Raceway',
    location: 'Fountain, CO (Colorado Springs)',
    targetContactRole: 'Director of Motorsports Operations',
    contactEmailSuggestion: 'info@ppir.com',
    claimUrl: `${ORIGIN}/track/pikes-peak-international-raceway/claim`,
    liveListingUrl: `${ORIGIN}/track/pikes-peak-international-raceway`,
    officialBoxOfficeUrl: 'https://ppir.com/tickets',
    keyFeaturesHighlighted: [
      'Time Attack, Drift Colorado, and open track day promotion',
      'Spectator gate and driver registration direct linking',
      'Pikes Peak region live event radar'
    ],
    emailSubject: 'Verified Listing for Pikes Peak International Raceway on Brinkberry',
    emailBody: `Hi PPIR Team,

We’ve published a verified profile for Pikes Peak International Raceway on Brinkberry’s live motorsports radar:
${ORIGIN}/track/pikes-peak-international-raceway

Brinkberry brings fast, mobile-friendly discovery to Colorado motorsports fans:
- 100% Free: No listing fees, no booking cuts, no ticket markups.
- Direct Ticket Linking: Spectator passes and driver registration link straight to ppir.com.
- Live Weather Integration: Ground-level Pikes Peak foothill forecasts synced live.

You can claim PPIR’s page and manage your listings here:
${ORIGIN}/track/pikes-peak-international-raceway/claim

Warmly,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  },
  {
    trackSlug: 'el-paso-county-raceway',
    trackName: 'El Paso County Raceway',
    location: 'Calhan, CO',
    targetContactRole: 'Fairgrounds Promoter / Track Operator',
    contactEmailSuggestion: 'racing@elpasocountyraceway.com',
    claimUrl: `${ORIGIN}/track/el-paso-county-raceway/claim`,
    liveListingUrl: `${ORIGIN}/track/el-paso-county-raceway`,
    officialBoxOfficeUrl: 'https://elpasocountyraceway.com',
    keyFeaturesHighlighted: [
      'High Plains Saturday night dirt racing highlight',
      'Transparent cash-at-the-gate admission guidelines',
      'Free community radar visibility'
    ],
    emailSubject: 'Verified Dirt Track Listing for El Paso County Raceway on Brinkberry',
    emailBody: `Hey El Paso County Raceway Team,

We’ve added the Saturday night dirt races in Calhan to Brinkberry’s live Colorado radar:
${ORIGIN}/track/el-paso-county-raceway

Brinkberry connects local fans and racers with genuine grassroots tracks:
- 100% Free: Free community discovery with zero middleman fees.
- Cash gate policies and grandstand rules clearly highlighted for families.
- Live weather watch for High Plains storms.

Claim your track page here:
${ORIGIN}/track/el-paso-county-raceway/claim

Best,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  },
  {
    trackSlug: 'red-cedar-speedway',
    trackName: 'Red Cedar Speedway',
    location: 'Menomonie / Eau Claire, WI',
    targetContactRole: 'Track Promoter / Fair Board Director',
    contactEmailSuggestion: 'promoter@redcedarspeedway.com',
    claimUrl: `${ORIGIN}/track/red-cedar-speedway/claim`,
    liveListingUrl: `${ORIGIN}/track/red-cedar-speedway`,
    officialBoxOfficeUrl: 'https://redcedarspeedway.com/schedule',
    keyFeaturesHighlighted: [
      'WISSOTA weekly dirt racing live radar',
      'Western Wisconsin / Eau Claire grassroots speedway discovery',
      'Transparent cash-at-gate admission guidelines',
      'Zero listing fees and zero ticket markups'
    ],
    emailSubject: 'Verified Listing for Red Cedar Speedway on Brinkberry (Free Short Track Radar)',
    emailBody: `Hey Red Cedar Speedway Team,

We’ve published a verified live profile for Red Cedar Speedway on Brinkberry:
${ORIGIN}/track/red-cedar-speedway

Our core promise to grassroots dirt tracks:
- 100% Free: No fees or percentages taken from spectator admission or racer entries.
- Direct-to-Track: We point fans straight to redcedarspeedway.com for schedules and fairgrounds admission.
- Live Weather Watch: Open-Meteo precipitation alerts help Chippewa Valley families plan their Friday night at the races.

Claim your track profile anytime in under 60 seconds:
${ORIGIN}/track/red-cedar-speedway/claim

Thank you for keeping WISSOTA dirt racing strong in Western Wisconsin!

Best regards,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  },
  {
    trackSlug: 'rock-falls-raceway',
    trackName: 'Rock Falls Raceway',
    location: 'Rock Falls / Eau Claire, WI',
    targetContactRole: 'Track Manager / NHRA Drag Director',
    contactEmailSuggestion: 'info@rockfallsraceway.com',
    claimUrl: `${ORIGIN}/track/rock-falls-raceway/claim`,
    liveListingUrl: `${ORIGIN}/track/rock-falls-raceway`,
    officialBoxOfficeUrl: 'https://rockfallsraceway.com/schedule',
    keyFeaturesHighlighted: [
      'NHRA drag racing bracket points radar',
      'High School Drags & Friday night test & tune discovery',
      'Direct gate and tech card pricing transparency',
      'Free community visibility across the Eau Claire region'
    ],
    emailSubject: 'Verified Radar Profile for Rock Falls Raceway on Brinkberry',
    emailBody: `Hi Rock Falls Raceway Team,

We’ve set up a verified venue profile for Rock Falls Raceway on Brinkberry’s live motorsports radar:
${ORIGIN}/track/rock-falls-raceway

How Brinkberry helps drag strips:
- 100% Free: Zero listing fees, zero subscriptions, zero ticketing cuts.
- Direct Links: Fans and racers get official schedules and tech card rules straight from rockfallsraceway.com.
- Eau Claire Regional Discovery: Connect with Chippewa River valley motorsports fans without paywalls.

Claim your track page here:
${ORIGIN}/track/rock-falls-raceway/claim

Keep drag racing fast and safe in Wisconsin!

Cheers,
The Brinkberry Racing Radar Team
racing@brinkberry.com`
  }
];

function getRacingPilotPackets() {
  return RACING_PILOT_PACKETS;
}

function getRacingPilotPacketBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).toLowerCase().trim();
  return RACING_PILOT_PACKETS.find(p => p.trackSlug === clean) || null;
}

module.exports = {
  RACING_PILOT_PACKETS,
  getRacingPilotPackets,
  getRacingPilotPacketBySlug
};
