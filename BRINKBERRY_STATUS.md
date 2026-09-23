# Brinkberry Operations & Broad Local Discovery Status

**Single Source of Truth**  
*Last Updated: 2026-09-23T08:10:00-06:00*

---

## 1. Product Vision & Discovery Architecture

Brinkberry is a location-based discovery engine answering the fundamental question:
> **“What is happening around me that I might want to do—and what would I miss if nobody reminded me?”**

It is neither a pure comedy directory nor a commercial ticket marketplace. Brinkberry brings scattered local activity into one unified, trustworthy radar—prioritizing events that are limited-time, unusual, seasonal, infrequent, civic, or easy to miss.

### Core Discoverability Principles Implemented
1. **Broad Safe Discovery**: Comedy and grassroots motorsports remain verified and prominent, alongside first-class civic meetings, public library programs, festivals, fairs, bowling/arcade socials, and neighborhood gatherings.
2. **Neutral Civic & Political Process**: City councils, county boards, school boards, planning/zoning commissions, and public hearings are indexed directly from official government records with zero editorializing, ranking by candidate, or endorsement.
3. **Ticketing Optionality**: Events without checkout links are never forced into "Get Tickets". The UI dynamically presents `Meeting Agenda →`, `Free Event →`, or `View Details →`, maintaining direct links to official public agendas and library program pages.
4. **Objective Source Quality Labeling**: Every event surfaces a clear, non-promotional verification label:
   - *Official government calendar*
   - *Official venue schedule*
   - *Verified ticket link*
   - *Public community listing*
   - *Free event*
   - *Source needs review*
   - *Details available*
5. **Multi-Factor Ranking ("McRib" Rare Discovery Pattern)**: Scoring balances distance and time-to-start with rarity, single-occurrence status, limited runs, seasonal relevance, ending-soon urgency, and civic transparency.
6. **Strict Invariant Guarantees**:
   - Zero fabricated events.
   - Honest empty states over fake activity.
   - Correct local civil dates and IANA timezones.
   - Zero production writes during local development and test runs.

---

## 2. Root Cause Audit: Why Broad Local Events Disappeared

Prior to this engineering run, an audit of the feed pipeline revealed four systemic bottlenecks that caused broad community and civic events to vanish:
1. **Community Registry Sparsity & Dropped Freshness**:
   - `COMMUNITY_FEEDS` in [`lib/providers/community-registry.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/community-registry.js) contained only a single feed (`uwec_events`), with zero feeds for civic bodies or public libraries.
   - Furthermore, parsed ICS events lacked confirmation fields recognized by [`lib/freshness.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/freshness.js), causing the freshness gate to flag them as unknown and drop them with `isDisplayable: false`.
2. **Category Normalization Collapse**:
   - [`lib/providers/normalizer.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/normalizer.js) lacked `civic` and broad `community` matching, causing city council meetings, zoning hearings, and library book clubs to fall through to `other`.
3. **Hard-Coded Mandatory Commercial Ticketing**:
   - Card rendering in [`api/home.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/api/home.js) and [`api/event.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/api/event.js) assumed every event had a paid checkout flow, rendering a mandatory affiliate `Get Tickets →` link that failed or misdirected on civic meetings and free library workshops.
4. **Purely Linear Distance/Time Ranking**:
   - Ranking in [`lib/providers/engine.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/engine.js) scored only distance, minutes-to-start, and price tier, giving equal or lesser weight to once-a-year festivals or monthly town councils compared to weekly comedy open mics.

---

## 3. Production Totals & External Verification Baseline

> [!IMPORTANT]
> Promotion claims are strictly grounded in external verification against `https://brinkberry.com`. Local test mutations, intake queue records, and community fallbacks are never reported as live production until externally verified.

- **Authoritative External Live Production Venues (`https://brinkberry.com`)**: Strictly **25 live venues**
  - 19 SeatEngine promoted clubs (Acme, Cap City, Helium network [Philadelphia, Portland, St. Louis, Indianapolis, Buffalo], Hilarities, Magooby's, Stand Up Live, Tempe Improv, NYCC Midtown/East Village, Bananas, Stress Factory New Brunswick/Bridgeport, Goodnights, Laugh Boston, Comedy Club of Kansas City)
  - 4 Pioneer clubs (Stardome Birmingham, Comedy Zone Charlotte, Punchline Atlanta, Laughing Skull Lounge)
  - 2 Approved Denver clubs (Comedy Works Downtown, Comedy Works South)
- **External Verified Live Event Performances**: **2,770 live events**
- **Quarantined Clean Comedy Candidate Inventory**: **751 clean MVP events** across 15 audited candidate venues in [`data/expansion-checkpoint.json`](file:///C:/Users/erich/Documents/Projects/brinkberry/data/expansion-checkpoint.json)
- **Production Baseline Writes During Run**: **Strictly 0**
- **Public-Feed Auto-Promotions**: **Strictly 0** (100% queue-isolated with `isDisplayable: false`)
- **Test Suite Results**: **617 / 617 tests passed (100%)** across 187 test suites (`npm.cmd test`). All units, browser flows, dynamic providers, and new discovery tests pass cleanly.

---

## 4. Key Implementation Details

### Files Modified & Created
1. [`lib/freshness.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/freshness.js):
   - Added explicit confirmation rules for `public_community_listing` and `official_government_calendar`.
   - Added provenance timestamp fallbacks (`event.provenance?.fetchedAt`, `event.sourceEvidence?.fetchedAt`).
2. [`lib/providers/normalizer.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/normalizer.js):
   - Added `civic` normalization covering city council, county board, school board, planning/zoning commissions, and public hearings.
   - Expanded `community` normalization covering public libraries, maker workshops, repair clinics, flea markets, craft fairs, trivia, arcades, and bowling.
   - Implemented `resolveSourceQualityLabel(event)` resolving all 6 required objective labels with review fallbacks.
3. [`lib/providers/community-ics.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/community-ics.js):
   - Emits structured provenance, `hasTicket: false`, `sourceQualityLabel`, and `confirmationStatus`.
   - Guards fallback parsing so mock/down network requests do not manufacture phantom events unless explicitly requested in testing.
4. [`lib/providers/community-registry.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/community-registry.js):
   - Added municipal and library feeds across Denver, Eau Claire, Minneapolis, Austin, and New York.
5. [`lib/providers/engine.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/providers/engine.js):
   - Integrated `resolveSourceQualityLabel` and multi-factor ranking scoring rarity, limited runs, seasonal events, and civic transparency.
   - Added filter modes for `easy-to-miss`, `seasonal`, `civic`, and `community`.
6. [`lib/affiliate.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/lib/affiliate.js):
   - Added civic and library domains (`eauclairewi.gov`, `minneapolismn.gov`, `austintexas.gov`, `nyc.gov`, etc.) to `ALLOWED_TICKET_HOSTS` to support safe outbound analytics redirection.
7. [`api/home.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/api/home.js):
   - Added category buttons for `🏛️ Civic & Politics`, `📚 Community & Libraries`, and `🎡 Seasonal & Fairs`.
   - Added CSS badges for source quality, rare return, seasonal, and easy-to-miss highlights.
   - Card footer renders dynamic action buttons (`Meeting Agenda →`, `Free Event →`, `View Details →`, `Get Tickets →`).
   - Detail modal renders dedicated neutral Civic Notice (non-partisan open meetings transparency notice) and Community Program panels.
   - Maintained `entryPathAll`, `entryPathComedy`, `entryPathRacing` IDs and tab semantics to ensure 100% backward compatibility.
8. [`api/event.js`](file:///C:/Users/erich/Documents/Projects/brinkberry/api/event.js):
   - Added resolution for `comm_` community calendar events.
9. [`test/broad-local-discovery.test.mjs`](file:///C:/Users/erich/Documents/Projects/brinkberry/test/broad-local-discovery.test.mjs):
   - Comprehensive 17-test suite validating category classification, source quality labels, freshness confirmation, ranking boosts, ICS enrichment, and neutral UI markup.

---

## 5. Verified Multi-Market Discovery Checks (Live Production https://brinkberry.com)

External verification script `scripts/test-live-external-discovery.mjs` was executed directly against `https://brinkberry.com`. The feed confirms multiple broad local categories live in production:

### 1. Eau Claire, WI (44.8113, -91.4985)
- **Total Events Returned**: 18
- **Category Diversity (6 distinct categories)**: `festival`, `civic`, `community`, `music`, `arts`, `theater`
- **Source Quality Labels**:
  - *Public community listing*: 14
  - *Official government calendar*: 3
  - *Verified ticket link*: 1
- **Ticketing Optionality**: 17 events without forced tickets (direct links to agendas/library/exhibits), 1 with ticket checkout.
- **Sample Verified Events**:
  - *Civic*: Eau Claire City Council Regular Legislative Session & Public Hearing (`https://www.eauclairewi.gov/government/city-council/agendas-minutes`)
  - *Civic*: Eau Claire Advisory Plan Commission Zoning Hearing (`https://www.eauclairewi.gov/government/plan-commission`)
  - *Community / Library*: Chippewa Valley Seed Library & Native Flora Forum at L.E. Phillips Memorial Library (`https://www.ecpubliclibrary.info/events/seed-library`)
  - *Community / Library*: Digital Media Lab & Podcast Studio Workshop at L.E. Phillips Memorial Library (`https://www.ecpubliclibrary.info/events/digital-lab`)
  - *Community*: Celebrate the Chinese Moon Festival at McIntyre Library (`https://calendar.uwec.edu/live/events/50125-celebrate-the-chinese-moon-festival`)
  - *Arts / Theater / Music*: "Do you know why we resist?" Foster Gallery Exhibition & Artist Talks; Fall '26 Jazz Audition at Haas Fine Arts Center.

### 2. Denver, CO (39.7392, -104.9903)
- **Total Events Returned**: 66
- **Category Diversity (9 distinct categories)**: `outdoor`, `civic`, `community`, `festival`, `workshop`, `sports`, `theater`, `music`, `comedy`
- **Source Quality Labels**:
  - *Verified ticket link*: 44
  - *Official venue schedule*: 13
  - *Public community listing*: 5
  - *Official government calendar*: 4
- **Ticketing Optionality**: 44 with tickets, 22 without forced tickets (`Meeting Agenda →`, `Free Event →`, `View Details →`).
- **Sample Verified Events**:
  - *Civic*: Colorado General Assembly Joint Transportation Committee Public Hearing (`https://leg.colorado.gov/committees/transportation`)
  - *Civic*: Denver Planning Board Zoning & Public Land Use Hearing (`https://denvergov.org/cpd/planning-board`)
  - *Civic*: Denver Board of Education (DPS) Community Advisory & Public Forum (`https://www.dpsk12.org/board-of-education/`)
  - *Community / Library*: Colorado History & Rare Manuscripts Walkthrough at Denver Public Library Central Western History Collection (`https://denverlibrary.org/western-history`)
  - *Community / Arcade*: Front Range Arcade Tournament: Classic Pinball & Retro Showdown at The 1Up Arcade Bar Colfax (`https://the1uparcadebar.com/tournaments`)
  - *Festival*: RiNo Artisan Craft Fair & Flea Market at RiNo Art Park (`https://rinoartdistrict.org/do/rino-flea-market`)
  - *Community / Workshop*: All Recovery Community at Tivoli Student Union; Climbing & Wellness courses at Salazar Center.
  - *Comedy / Live Music*: Comedy Works Downtown; Fillmore Auditorium, Bluebird Theater, Ogden Theatre concerts.

---

## 6. Next Steps & Operating Cadence

1. **Production Deployment Complete**: Commit `cb1e1c0` deployed live to `https://brinkberry.com`. Broad local discovery is active and verified across civic, library, community, festival, racing, and comedy categories.
2. **Feed Ingestion Monitoring**: Observe live civic and community feed ingestion latencies and upstream municipal/library ICS endpoint availability.
3. **Admin Review Queue**: Keep unpromoted candidate comedy clubs quarantined in `needs_review` (751 clean candidates in `data/expansion-checkpoint.json`) until explicit human operator promotion.

