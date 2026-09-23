/**
 * Independent Comedy Outreach & Community Directory
 *
 * Curated list of independent comedy clubs, listening rooms, open-mic hosts,
 * and touring comedians for grassroots platform onboarding.
 *
 * Core Promise: 100% free discovery, zero fees, direct box office links.
 */

const OUTREACH_DIRECTORY = {
  venues: [
    {
      name: 'Comedy Works Downtown',
      slug: 'comedy-works-downtown',
      city: 'Denver, CO',
      website: 'https://www.comedyworks.com',
      claimUrl: 'https://brinkberry.com/venue/comedy-works-downtown/claim',
      type: 'Independent Headliner Club',
      notes: 'Premier basement listening room in Larimer Square. Direct box office confirmed.'
    },
    {
      name: 'Denver Comedy Underground',
      slug: 'denver-comedy-underground',
      city: 'Denver, CO',
      website: 'https://denvercomedyunderground.com',
      claimUrl: 'https://brinkberry.com/venue/denver-comedy-underground/claim',
      type: 'Independent Showcase Room',
      notes: 'Subterranean showcase with free pizza & national touring headliners.'
    },
    {
      name: 'The Second City',
      slug: 'the-second-city',
      city: 'Chicago, IL',
      website: 'https://www.secondcity.com',
      claimUrl: 'https://brinkberry.com/venue/the-second-city/claim',
      type: 'Improv & Sketch Theater',
      notes: 'Historic institution for improv revues and sketch comedy.'
    },
    {
      name: 'Zanies Comedy Club',
      slug: 'zanies-chicago',
      city: 'Chicago, IL',
      website: 'https://chicago.zanies.com',
      claimUrl: 'https://brinkberry.com/venue/zanies-chicago/claim',
      type: 'Classic Brick-Wall Club',
      notes: 'Original Old Town stand-up club since 1978.'
    },
    {
      name: 'The Plus',
      slug: 'the-plus-eau-claire',
      city: 'Eau Claire, WI',
      website: 'https://theplus.ec',
      claimUrl: 'https://brinkberry.com/venue/the-plus-eau-claire/claim',
      type: 'Indie Venue & Open Mic',
      notes: 'Hub for Chippewa Valley independent stand-up and weekly open mics.'
    },
    {
      name: 'Paname Art Café',
      slug: 'paname-art-cafe-paris',
      city: 'Paris, France',
      website: 'https://www.panameartcafe.com',
      claimUrl: 'https://brinkberry.com/venue/paname-art-cafe-paris/claim',
      type: 'International Comedy Club',
      notes: '11th arrondissement French & English stand-up hub.'
    }
  ],
  comedians: [
    {
      name: 'Sam Tallent',
      slug: 'sam-tallent',
      profileUrl: 'https://brinkberry.com/comedian/sam-tallent',
      tagline: 'Touring headliner & author of Running the Light.',
      notes: 'Independent touring comic with heavy national following.'
    },
    {
      name: 'Ericka Dickinson',
      slug: 'ericka-dickinson',
      profileUrl: 'https://brinkberry.com/comedian/ericka-dickinson',
      tagline: 'Denver-based stand-up comic and producer.',
      notes: 'Showcase headliner and host.'
    }
  ],
  outreachTemplates: {
    venueOnboarding: (venueName, claimUrl) => `
Hi ${venueName} team,

We found your public schedule and added your shows to Brinkberry (https://brinkberry.com). We link directly to your official ticket page with zero fees and zero markups.

If you’d like to correct anything or claim the free venue page, here’s the link:
${claimUrl}

Brinkberry is 100% Free: we never charge listing fees, claim fees, or booking commissions, and we never ask you to switch ticketing software. Claiming your page gives you control to manage verified showtimes, highlight headliners, and see local audience demand data.

Best,
The Brinkberry Community Team
    `.trim(),
    comedianOnboarding: (comicName, profileUrl) => `
Hi ${comicName},

Fans have been requesting you on Brinkberry's live comedy radar:
${profileUrl}

Brinkberry is an independent, 100% free discovery network that shows audiences real events within 48 hours and captures direct fan demand signals for your touring routing.

No platform cut, no ticket markups—just direct routing data that belongs to you.

Check out your live profile and shareable social show cards here:
${profileUrl}
    `.trim()
  }
};

module.exports = {
  OUTREACH_DIRECTORY
};
