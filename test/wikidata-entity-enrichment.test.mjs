import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichComedianEntity,
  enrichVenueEntity,
  attachEntityEnrichment,
  comedianCache,
  venueCache
} from '../lib/identity/wikidata-enrichment.js';

test('Wikidata Entity Enrichment Suite', async (t) => {

  await t.test('1. Comedian Entity Enrichment & Disambiguation', async () => {
    comedianCache.clear();

    // Mock fetch for deterministic testing
    const mockFetch = async (url) => {
      if (url.includes('wbsearchentities')) {
        return {
          ok: true,
          json: async () => ({
            search: [
              {
                id: 'Q124364778',
                label: 'Sam Tallent',
                description: 'American comedian and author (born 1987)',
                match: { text: 'Sam Tallent' }
              },
              {
                id: 'Q999999999',
                label: 'Sam Tallent',
                description: '19th century politician and agriculturist',
                match: { text: 'Sam Tallent' }
              }
            ]
          })
        };
      }
      if (url.includes('wbgetentities')) {
        return {
          ok: true,
          json: async () => ({
            entities: {
              Q124364778: {
                aliases: { en: [{ value: 'Samuel Tallent' }] },
                sitelinks: { enwiki: { title: 'Sam_Tallent' } },
                claims: {
                  P856: [{ mainsnak: { datavalue: { value: 'https://samtallent.com' } } }],
                  P2003: [{ mainsnak: { datavalue: { value: 'samtallent' } } }]
                }
              }
            }
          })
        };
      }
      if (url.includes('/api/rest_v1/page/summary/')) {
        return {
          ok: true,
          json: async () => ({
            title: 'Sam Tallent',
            description: 'American comedian and author (born 1987)',
            extract: 'Sam Bayard Tallent is an American stand-up comedian and author.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Sam_Tallent' } }
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const enriched = await enrichComedianEntity('Sam Tallent', { fetchFn: mockFetch });

    assert.equal(enriched.enriched, true);
    assert.equal(enriched.wikidataId, 'Q124364778');
    assert.equal(enriched.canonicalName, 'Sam Tallent');
    assert.equal(enriched.disambiguationDescription, 'American comedian and author (born 1987)');
    assert.deepEqual(enriched.aliases, ['Samuel Tallent']);
    assert.equal(enriched.wikipediaUrl, 'https://en.wikipedia.org/wiki/Sam_Tallent');
    assert.equal(enriched.officialWebsite, 'https://samtallent.com');
    assert.equal(enriched.socialProfiles.instagram, 'https://instagram.com/samtallent');
    assert.equal(enriched.source, 'entity_enrichment_wikidata');
    assert.equal(enriched.isEventEvidence, false);
    assert.equal(enriched.cannotConfirmPerformance, true);
    assert.equal(enriched.licensing.attributionRequired, true);
    assert.equal(enriched.licensing.textLicense, 'CC BY-SA 4.0');
    assert.equal(enriched.licensing.dataLicense, 'CC0 1.0 Universal');
    assert.ok(enriched.licensing.attributionText.includes('CC BY-SA 4.0'));
    assert.ok(enriched.usageNotice.includes('CC BY-SA 4.0 attribution'));
  });

  await t.test('2. Disambiguates and Rejects Non-Performer Entities', async () => {
    comedianCache.clear();

    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        search: [
          {
            id: 'Q55555',
            label: 'John Doe',
            description: '18th century British botanist and explorer',
            match: { text: 'John Doe' }
          }
        ]
      })
    });

    const enriched = await enrichComedianEntity('John Doe', { fetchFn: mockFetch });
    assert.equal(enriched.enriched, false);
    assert.equal(enriched.reason, 'Entity found but failed performer disambiguation');
  });

  await t.test('3. Venue Entity Enrichment with Coordinates & Historical Names', async () => {
    venueCache.clear();

    const mockFetch = async (url) => {
      if (url.includes('wbsearchentities')) {
        return {
          ok: true,
          json: async () => ({
            search: [
              {
                id: 'Q7260006',
                label: 'Punchline Comedy Club',
                description: 'comedy club in Atlanta, Georgia, USA',
                match: { text: 'Punchline Comedy Club' }
              }
            ]
          })
        };
      }
      if (url.includes('wbgetentities')) {
        return {
          ok: true,
          json: async () => ({
            entities: {
              Q7260006: {
                aliases: { en: [{ value: 'The Punchline' }] },
                sitelinks: { enwiki: { title: 'Punchline_Comedy_Club' } },
                claims: {
                  P625: [{ mainsnak: { datavalue: { value: { latitude: 33.9232, longitude: -84.3781 } } } }],
                  P856: [{ mainsnak: { datavalue: { value: 'https://punchline.com' } } }]
                }
              }
            }
          })
        };
      }
      if (url.includes('/api/rest_v1/page/summary/')) {
        return {
          ok: true,
          json: async () => ({
            title: 'The Punchline',
            description: 'comedy club in Atlanta, Georgia',
            extract: 'The Punchline is a comedy club first opened in 1982.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Punchline_Comedy_Club' } }
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const enriched = await enrichVenueEntity('Punchline Comedy Club', 'Atlanta', { fetchFn: mockFetch });

    assert.equal(enriched.enriched, true);
    assert.equal(enriched.wikidataId, 'Q7260006');
    assert.equal(enriched.canonicalName, 'Punchline Comedy Club');
    assert.deepEqual(enriched.historicalNames, ['The Punchline']);
    assert.deepEqual(enriched.coordinates, { lat: 33.9232, lon: -84.3781 });
    assert.equal(enriched.officialWebsite, 'https://punchline.com');
    assert.equal(enriched.wikipediaUrl, 'https://en.wikipedia.org/wiki/Punchline_Comedy_Club');
    assert.equal(enriched.source, 'entity_enrichment_wikidata');
    assert.equal(enriched.isEventEvidence, false);
    assert.equal(enriched.cannotConfirmPerformance, true);
  });

  await t.test('4. Strict Boundary: Wikidata CANNOT Confirm Performance or Alter Status', () => {
    const rawEvent = {
      id: 'bhm_star_123',
      title: 'AJ Wilkerson',
      start_time: '2026-09-24T00:30:00.000Z',
      venue: 'Stardome Comedy Club',
      confirmationStatus: 'confirmed_by_official_calendar'
    };

    const validEnrichment = {
      comedian: { wikidataId: 'Q999', canonicalName: 'AJ Wilkerson' },
      venue: { wikidataId: 'Q888', canonicalName: 'Stardome Comedy Club' }
    };

    const enrichedEvent = attachEntityEnrichment(rawEvent, validEnrichment);

    // Event retains original official calendar confirmation
    assert.equal(enrichedEvent.confirmationStatus, 'confirmed_by_official_calendar');
    // Entity enrichment is stamped with non-evidence provenance
    assert.equal(enrichedEvent.entityEnrichment.source, 'entity_enrichment_wikidata');
    assert.equal(enrichedEvent.entityEnrichment.isEventEvidence, false);
    assert.equal(enrichedEvent.entityEnrichment.cannotConfirmPerformance, true);
    assert.equal(enrichedEvent.entityEnrichment.comedian.canonicalName, 'AJ Wilkerson');

    // Invariant Guard: Throws error if someone attempts to use Wikidata as event evidence
    assert.throws(
      () => {
        attachEntityEnrichment(
          { id: 'fake_123' },
          { confirmationStatus: 'confirmed_by_official_calendar' }
        );
      },
      /SECURITY INVARIANT VIOLATION: Wikipedia\/Wikidata entity enrichment cannot confirm event dates/
    );
  });

});
