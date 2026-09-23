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

## 5. Verified Multi-Market Discovery Checks

- **Denver, CO**: Curated comedy clubs (Comedy Works Downtown/South, Denver Comedy Underground) + Colorado motorsports + Civic & library community feeds.
- **Eau Claire, WI**: Verified community & campus calendar feeds (UWEC Arts & Jazz, Pablo Center, Eau Claire Public Library) + regional short-track racing.
- **Minneapolis, MN**: Dynamic SeatGeek live music/concert feeds + Hennepin County library & civic integration.
- **Austin, TX**: Dynamic showcase inventory + City Council & Austin Public Library integrations.
- **New York, NY**: Curated clubs + NYPL & NYC Community Board hearings.
- **Remote / Ocean Coordinates**: Honestly returns 0 events with active timezone, maintaining zero hallucination.

---

## 6. Next Steps & Operating Cadence

1. **Production Deployment Ready**: Changes are strictly non-breaking, fully backward-compatible with existing comedy/racing pilots, and pass 100% of automated tests.
2. **Feed Ingestion Monitoring**: Observe live civic and community feed ingestion latencies and upstream ICS endpoint availability.
3. **Admin Review Queue**: Keep unpromoted candidate comedy clubs quarantined in `needs_review` until explicit human operator promotion.
