import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import homeHandler from '../api/home.js';

describe('Homepage Hero Redesign & Streamlined Discovery', () => {
  test('renders the streamlined "What’s happening near you?" headline and subtitle', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Primary streamlined headline and regression subtitle
    assert.match(output, /<h1 class="hero-title">What’s happening near you\?<\/h1>/);
    assert.match(output, /Wondering what should I do tonight\?/);
    assert.match(output, /Find what’s happening near you right now/);
  });

  test('simplifies top navigation to Brinkberry, Post an Event, and Menu', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Header has brand, post button, and menu button
    assert.match(output, /class="brand"/);
    assert.match(output, /id="postEventBtn"/);
    assert.match(output, /\+ Post an Event/);
    assert.match(output, /id="navMenuBtn"/);
    assert.match(output, /id="navMenuDropdown"/);

    // "Submit Show" and "Hyperlocal Radar" are inside menu dropdown
    assert.match(output, /class="nav-menu-dropdown"[^>]*>[\s\S]*\/submit-comedy/);
    assert.match(output, /class="nav-menu-dropdown"[^>]*>[\s\S]*Hyperlocal Radar/);
  });

  test('simplifies hero: one compact category row with primary categories and More button', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Verify 3 large entry path cards are absent
    assert.doesNotMatch(output, /class="hero-vertical-entry-paths"/);
    assert.doesNotMatch(output, /id="entryPathAll"/);
    assert.doesNotMatch(output, /id="entryPathComedy"/);
    assert.doesNotMatch(output, /id="entryPathRacing"/);

    // Verify category row and primary pills
    assert.match(output, /id="categoryRow"/);
    assert.match(output, /All Events/);
    assert.match(output, /Comedy Radar/);
    assert.match(output, /Motorsports/);
    assert.match(output, /Community/);
    assert.match(output, /Music/);
    assert.match(output, /id="moreCategoriesBtn"/);
    assert.match(output, /id="moreCategoriesRow"/);
  });

  test('renders simple Tonight / Next 48 Hours choice and compact Filters button', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    assert.match(output, /id="quickTimeToggle"/);
    assert.match(output, /data-time="tonight"/);
    assert.match(output, /data-time="48h"/);
    assert.match(output, /id="filtersToggleBtn"/);
    assert.match(output, /id="filterCountBadge"/);
  });

  test('renders location indicator and expandable location drawer', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    assert.match(output, /id="locIndicatorBtn"/);
    assert.match(output, /id="locationDrawer"/);
    assert.match(output, /id="citySearchInput"/);
    assert.match(output, /id="citySearchGo"/);
    assert.match(output, /id="presetDenver"/);
    assert.match(output, /id="presetParis"/);
    assert.match(output, /id="presetLondon"/);
    assert.match(output, /id="presetTokyo"/);
    assert.match(output, /id="presetNewYork"/);
    assert.match(output, /id="presetBoulder"/);
    assert.match(output, /id="presetGolden"/);
    assert.match(output, /id="presetAurora"/);
  });

  test('houses advanced filters and sub-consoles within the filters drawer', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    assert.match(output, /id="advancedFiltersDrawer"/);
    assert.match(output, /id="generalFilterBar"/);
    assert.match(output, /id="timeWindows"/);
    assert.match(output, /id="radiusFilters"/);
    assert.match(output, /id="modeFilters"/);
    assert.match(output, /id="sourceFilters"/);
    assert.match(output, /id="comedySubFilterConsole"/);
    assert.match(output, /id="racingSubFilterConsole"/);
  });

  test('renders rich content discovery sections: venues showcase, curated guides, and neighborhoods', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Venues & Tracks showcase
    assert.match(output, /Local Stages, Clubs &amp; Speedways/);
    assert.match(output, /Comedy Works Downtown/);
    assert.match(output, /Colorado National Speedway/);
    assert.match(output, /RISE Comedy/);
    assert.match(output, /I-76 Speedway/);

    // Curated discovery guides
    assert.match(output, /Curated Discovery Guides/);
    assert.match(output, /Stand-Up Comedy Radar/);
    assert.match(output, /Grassroots Motorsports/);
    assert.match(output, /Live Music &amp; Concerts/);
    assert.match(output, /Free Things to Do/);

    // Neighborhoods explorer
    assert.match(output, /Explore by Neighborhood/);
    assert.match(output, /LoDo/);
    assert.match(output, /RiNo Arts District/);
    assert.match(output, /Capitol Hill/);
    assert.match(output, /Highlands/);
  });

  test('guarantees every place and event card has an image with fallback onerror', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Client defines CATEGORY_FALLBACK_IMAGES dictionary and getCategoryFallback
    assert.match(output, /CATEGORY_FALLBACK_IMAGES/);
    assert.match(output, /getCategoryFallback/);

    // Client card rendering ALWAYS uses card-img with onerror fallback
    assert.match(output, /class="card-img"/);
    assert.match(output, /onerror="this\.onerror=null; this\.src=getCategoryFallback/);
    assert.doesNotMatch(output, /class="card-no-img"/);
  });

  test('dynamically adapts discovery sections for other curated cities (e.g. London)', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/?city=london', headers: {} }, res);

    // Active city label reflects London
    assert.match(output, /<span id="activeCityLabel">London, UK<\/span>/);

    // Stages showcase reflects London stages in venuesGrid
    const venuesMarkup = output.split('id="venuesGrid">')[1].split('</section>')[0];
    assert.match(venuesMarkup, /Soho Theatre/);
    assert.match(venuesMarkup, /Top Secret Comedy Club/);
    assert.doesNotMatch(venuesMarkup, /Comedy Works Downtown/);

    // Curated discovery guides link to London
    assert.match(output, /href="\/london\/comedy"/);
    assert.match(output, /href="\/london\/racing"/);

    // Neighborhoods explorer reflects London neighborhoods in neighborhoodChips
    const neighborhoodMarkup = output.split('id="neighborhoodChips">')[1].split('</section>')[0];
    assert.match(neighborhoodMarkup, /Soho/);
    assert.match(neighborhoodMarkup, /Covent Garden/);
    assert.match(neighborhoodMarkup, /Camden/);
    assert.doesNotMatch(neighborhoodMarkup, /LoDo/);
    assert.doesNotMatch(neighborhoodMarkup, /RiNo Arts District/);
  });

  test('adapts to non-curated cities (e.g. Phoenix) without displaying Denver neighborhoods or Denver-only stages', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({
      url: '/',
      headers: {
        'x-vercel-ip-city': 'Phoenix',
        'x-vercel-ip-country-region': 'AZ',
        'x-vercel-ip-latitude': '33.4484',
        'x-vercel-ip-longitude': '-112.0740'
      }
    }, res);

    // Active city label reflects visitor's detected IP city
    assert.match(output, /<span id="activeCityLabel">Phoenix, AZ<\/span>/);

    // Shows Featured Stages & Iconic Venues with explicit city tagging
    assert.match(output, /Featured Stages &amp; Iconic Venues/);
    const venuesMarkup = output.split('id="venuesGrid">')[1].split('</section>')[0];
    assert.match(venuesMarkup, /Comedy Works Downtown/);
    assert.match(venuesMarkup, /Larimer Square · Denver, CO/);
    assert.match(venuesMarkup, /Comedy Cellar/);
    assert.match(venuesMarkup, /Greenwich Village · New York, NY/);

    // Discovery guides link to the detected city
    assert.match(output, /href="\/phoenix\/comedy"/);
    assert.match(output, /href="\/phoenix\/racing"/);

    // Neighborhood section is hidden by default for non-curated cities (never shows LoDo to Phoenix users)
    assert.match(output, /id="neighborhoodSection" style="display:none;"/);
    const neighborhoodMarkup = output.split('id="neighborhoodChips">')[1].split('</section>')[0];
    assert.doesNotMatch(neighborhoodMarkup, /LoDo/);
    assert.doesNotMatch(neighborhoodMarkup, /RiNo Arts District/);
  });

  test('client script defines updateLocationDiscovery and binds dynamic location updates', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    assert.match(output, /function updateLocationDiscovery/);
    assert.match(output, /function renderVenuesGrid/);
    assert.match(output, /function selectDiscoveryCategory/);
    assert.match(output, /updateLocationDiscovery\(initLoc\)/);
    assert.match(output, /updateLocationDiscovery\(loc\)/);
  });
});


