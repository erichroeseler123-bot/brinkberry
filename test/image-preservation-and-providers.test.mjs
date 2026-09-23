import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { extractJsonLdEvents, extractJsonLdImage } = require('../lib/ingestion/adapters/jsonld.js');
const { ingestSeatEngineVenue } = require('../lib/ingestion/adapters/seatengine.js');
const { parseEventbriteSource } = require('../lib/ingestion/adapters/eventbrite.js');
const { normalizeEvent, extractImageUrl, CATEGORY_FALLBACK_IMAGES, CATEGORY_FALLBACK_POOLS, getCategoryFallbackImage } = require('../lib/providers/normalizer.js');
const { mergeEvents } = require('../lib/identity.js');

test('Event Image Preservation and Provider Integrity Test Suite', async (t) => {

  // 1. JSON-LD adapter image preservation
  await t.test('1. JSON-LD adapter extracts images from strings, arrays, and objects', () => {
    // String image
    assert.equal(
      extractJsonLdImage('https://example.com/poster.jpg'),
      'https://example.com/poster.jpg'
    );

    // Array of string URLs
    assert.equal(
      extractJsonLdImage(['https://example.com/first.jpg', 'https://example.com/second.jpg']),
      'https://example.com/first.jpg'
    );

    // ImageObject with url
    assert.equal(
      extractJsonLdImage({ '@type': 'ImageObject', url: 'https://example.com/imageobj.jpg' }),
      'https://example.com/imageobj.jpg'
    );

    // ImageObject with contentUrl
    assert.equal(
      extractJsonLdImage({ '@type': 'ImageObject', contentUrl: 'https://example.com/content.jpg' }),
      'https://example.com/content.jpg'
    );

    // Array of ImageObjects
    assert.equal(
      extractJsonLdImage([{ url: 'https://example.com/nested.png' }]),
      'https://example.com/nested.png'
    );

    // End-to-end JSON-LD parsing
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Live Comedy Showcase",
        "startDate": "2026-09-25T20:00:00Z",
        "image": "https://venue.com/images/showcase.jpg",
        "location": {
          "@type": "Place",
          "name": "Comedy Central Club",
          "address": "123 Main St, Austin, TX"
        }
      }
      </script>
    `;
    const events = extractJsonLdEvents(html, { sourceUrl: 'https://venue.com/shows' });
    assert.equal(events.length, 1);
    assert.equal(events[0].image, 'https://venue.com/images/showcase.jpg');
    assert.equal(events[0].canonical_image_url, 'https://venue.com/images/showcase.jpg');
  });

  // 2. SeatEngine adapter preserves canonical_image_url and headshots
  await t.test('2. SeatEngine adapter preserves canonical_image_url and talent headshots', async () => {
    const mockHtml = `
      <script type="application/ld+json">
      [
        {
          "@context": "https://schema.org",
          "@type": "ComedyEvent",
          "name": "Special Event: Hollywood Crime Scene",
          "startDate": "2026-11-20T20:00:00-06:00",
          "url": "https://seatengine.com/shows/54400",
          "image": "https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg",
          "offers": { "@type": "Offer", "price": "25.00", "url": "https://seatengine.com/shows/54400" }
        }
      ]
      </script>
    `;

    const venue = {
      slug: 'cap-city-comedy-club-austin',
      name: 'Cap City Comedy Club',
      address: '11506 Century Oaks Terrace Bldg B Unit 100, Austin, TX 78758',
      city: 'Austin',
      state: 'TX',
      timezone: 'America/Chicago',
      lat: 30.4024,
      lon: -97.7246,
      website: 'https://www.capcitycomedy.com',
      feedUrl: 'https://www.capcitycomedy.com/shows'
    };

    const res = await ingestSeatEngineVenue(venue, {
      fetchFn: async () => ({
        ok: true,
        status: 200,
        text: async () => mockHtml
      }),
      persist: false
    });

    assert.equal(res.count, 1);
    assert.equal(res.events[0].image, 'https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg');
    assert.equal(res.events[0].canonical_image_url, 'https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg');
  });

  // 3. Eventbrite adapter extracts image
  await t.test('3. Eventbrite adapter extracts image from logo structure', () => {
    const rawEvents = [
      {
        id: 'eb-101',
        name: { text: 'Community Tech Meetup' },
        start: { utc: '2026-09-24T18:00:00Z' },
        url: 'https://eventbrite.com/e/101',
        logo: {
          original: { url: 'https://img.evbuc.com/original-poster.jpg' }
        }
      }
    ];

    const parsed = parseEventbriteSource(rawEvents, {
      city: 'Denver',
      state: 'CO',
      venueName: 'RISE Comedy',
      timezone: 'America/Denver'
    });

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].image, 'https://img.evbuc.com/original-poster.jpg');
    assert.equal(parsed[0].canonical_image_url, 'https://img.evbuc.com/original-poster.jpg');
  });

  // 4. SeatGeek normalizer scans every performer and every image field
  await t.test('4. SeatGeek normalizer scans non-primary performers and handles protocol-relative URLs', () => {
    // Helper extractImageUrl test
    assert.equal(extractImageUrl('//images.seatgeek.com/performer.jpg'), 'https://images.seatgeek.com/performer.jpg');
    assert.equal(extractImageUrl({ huge: '//images.seatgeek.com/huge.jpg' }), 'https://images.seatgeek.com/huge.jpg');
    assert.equal(extractImageUrl({ banner: 'https://images.seatgeek.com/banner.jpg' }), 'https://images.seatgeek.com/banner.jpg');

    // SeatGeek event where primary performer has NO image, but second performer DOES
    const sgEventWithSecondaryPerformerImage = {
      id: 7771,
      title: 'Co-headlined Comedy Night',
      datetime_utc: '2026-09-25T01:00:00Z',
      type: 'comedy',
      performers: [
        {
          name: 'Opener comic',
          primary: true,
          image: null,
          images: {}
        },
        {
          name: 'Famous Headliner',
          primary: false,
          images: {
            huge: '//images.seatgeek.com/performers/huge/famous.jpg'
          }
        }
      ],
      venue: {
        name: 'The Creek and The Cave',
        city: 'Austin',
        state: 'TX',
        location: { lat: 30.2672, lon: -97.7431 }
      }
    };

    const normalized = normalizeEvent(sgEventWithSecondaryPerformerImage, 'seatgeek');
    assert.ok(normalized, 'SeatGeek event must normalize successfully');
    assert.equal(normalized.image, 'https://images.seatgeek.com/performers/huge/famous.jpg');
    assert.equal(normalized.canonical_image_url, 'https://images.seatgeek.com/performers/huge/famous.jpg');
  });

  // 5. Image priority hierarchy
  await t.test('5. Image priority hierarchy: event-specific > performer > venue', () => {
    const sgWithAll = {
      id: 8881,
      title: 'Music Festival',
      datetime_utc: '2026-09-25T01:00:00Z',
      type: 'concert',
      image: 'https://images.seatgeek.com/events/specific-event.jpg',
      performers: [
        {
          name: 'Band',
          primary: true,
          images: { large: 'https://images.seatgeek.com/performers/band.jpg' }
        }
      ],
      venue: {
        name: 'Red Rocks',
        images: { huge: 'https://images.seatgeek.com/venues/redrocks.jpg' },
        location: { lat: 39.6654, lon: -105.2057 }
      }
    };

    const norm1 = normalizeEvent(sgWithAll, 'seatgeek');
    assert.equal(norm1.image, 'https://images.seatgeek.com/events/specific-event.jpg');

    // Without event image, performer image should be chosen
    const sgNoEventImg = { ...sgWithAll, image: null };
    const norm2 = normalizeEvent(sgNoEventImg, 'seatgeek');
    assert.equal(norm2.image, 'https://images.seatgeek.com/performers/band.jpg');

    // Without performer image, venue image should be chosen
    const sgVenueOnly = {
      ...sgWithAll,
      image: null,
      performers: [{ name: 'Band', primary: true, image: null, images: {} }]
    };
    const norm3 = normalizeEvent(sgVenueOnly, 'seatgeek');
    assert.equal(norm3.image, 'https://images.seatgeek.com/venues/redrocks.jpg');
  });

  // 6. Elimination of Barack Obama stock photo from civic fallback
  await t.test('6. Civic fallbacks are neutral municipal architecture and do not contain Barack Obama', () => {
    const obamaUnsplashId = 'photo-1541872703-74c5e44368f9';
    assert.ok(
      !CATEGORY_FALLBACK_IMAGES.civic.includes(obamaUnsplashId),
      'CATEGORY_FALLBACK_IMAGES.civic must not contain the Barack Obama image'
    );

    for (const img of CATEGORY_FALLBACK_POOLS.civic) {
      assert.ok(!img.includes(obamaUnsplashId), 'Civic pool must not contain the Obama photo');
    }

    const fallbackCivic = getCategoryFallbackImage('civic', 'austin-city-council-hearing');
    assert.ok(!fallbackCivic.includes(obamaUnsplashId));
    assert.ok(fallbackCivic.includes('images.unsplash.com'));
  });

  // 7. Identity merging upgrades category fallback with real source image
  await t.test('7. Identity merging upgrades category fallback placeholder with real source image', () => {
    const existingEvent = {
      id: 'event-1',
      title: 'Austin Standup Night',
      venue: 'Cap City Comedy Club',
      venue_name: 'Cap City Comedy Club',
      category: 'comedy',
      start_time: '2026-09-25T20:00:00Z',
      image: CATEGORY_FALLBACK_IMAGES.comedy,
      canonical_image_url: null,
      source: 'crawler'
    };

    const incomingEvent = {
      id: 'event-2',
      title: 'Austin Standup Night',
      venue: 'Cap City Comedy Club',
      venue_name: 'Cap City Comedy Club',
      category: 'comedy',
      start_time: '2026-09-25T20:00:00Z',
      image: 'https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg',
      canonical_image_url: 'https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg',
      source: 'seatengine'
    };

    const merged = mergeEvents([existingEvent, incomingEvent]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].image, 'https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg');
    assert.equal(merged[0].canonical_image_url, 'https://files.seatengine.com/talent/headshots/photos/54400/full/data.jpg');
  });

  // 8. Ticketmaster normalizer selects best 16:9 image and populates canonical_image_url and image
  await t.test('8. Ticketmaster normalizer selects best 16:9 high-res image', () => {
    const tmRawEvent = {
      id: 'vvG1YZ94zG2gKp',
      name: 'Monster Jam Freestyle Mania',
      dates: {
        start: {
          dateTime: '2026-10-15T19:00:00Z'
        }
      },
      classifications: [
        {
          segment: { name: 'Sports' },
          genre: { name: 'Motorsports' }
        }
      ],
      images: [
        {
          ratio: '3_2',
          url: 'https://s1.ticketm.net/dam/a/small_3_2.jpg',
          width: 305,
          height: 225
        },
        {
          ratio: '16_9',
          url: 'https://s1.ticketm.net/dam/a/huge_16_9.jpg',
          width: 2048,
          height: 1152
        },
        {
          ratio: '16_9',
          url: 'https://s1.ticketm.net/dam/a/medium_16_9.jpg',
          width: 1024,
          height: 576
        }
      ],
      _embedded: {
        venues: [
          {
            name: 'Ball Arena',
            city: { name: 'Denver' },
            state: { stateCode: 'CO' },
            location: { latitude: '39.7486', longitude: '-105.0075' }
          }
        ]
      }
    };

    const normalized = normalizeEvent(tmRawEvent, 'ticketmaster');
    assert.ok(normalized, 'Event must normalize successfully');
    assert.equal(normalized.image, 'https://s1.ticketm.net/dam/a/huge_16_9.jpg');
    assert.equal(normalized.canonical_image_url, 'https://s1.ticketm.net/dam/a/huge_16_9.jpg');
  });
});

