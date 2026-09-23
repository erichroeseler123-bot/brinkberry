import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import homeHandler from '../api/home.js';
import vm from 'node:vm';

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

  test('removes destination showcases and generic venue cards from homepage', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Static venue showcase, curated destination guides, and neighborhoods explorer must not exist
    assert.doesNotMatch(output, /id="venuesSection"/);
    assert.doesNotMatch(output, /id="guidesSection"/);
    assert.doesNotMatch(output, /id="neighborhoodSection"/);
    assert.doesNotMatch(output, /Featured Stages &amp; Iconic Venues/);
    assert.doesNotMatch(output, /Local Stages, Clubs &amp; Speedways/);
    assert.doesNotMatch(output, /Curated Discovery Guides/);
    assert.doesNotMatch(output, /Explore by Neighborhood/);

    // Famous venues must not be hardcoded as cards
    assert.doesNotMatch(output, /Comedy Works Downtown/);
    assert.doesNotMatch(output, /Colorado National Speedway/);
    assert.doesNotMatch(output, /Comedy Cellar/);
    assert.doesNotMatch(output, /Circuit of the Americas/);
    assert.doesNotMatch(output, /Soho Theatre/);
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

  test('prioritizes live local event feed and selected location for any city (e.g. Phoenix, London, Denver)', () => {
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

    // Live feed exists and is front and center
    assert.match(output, /id="feed"/);

    // Zero static venue promotion or destination cards
    assert.doesNotMatch(output, /Comedy Works Downtown/);
    assert.doesNotMatch(output, /Comedy Cellar/);
    assert.doesNotMatch(output, /id="venuesSection"/);
  });

  test('client script defines updateLocationDisplay and updates city display cleanly', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    assert.match(output, /function updateLocationDisplay/);
    assert.doesNotMatch(output, /function updateLocationDiscovery/);
    assert.doesNotMatch(output, /function renderVenuesGrid/);
    assert.match(output, /updateLocationDisplay\(initLoc\)/);
    assert.match(output, /updateLocationDisplay\(loc\)/);
  });

  test('inline client script contains no syntax errors and defaults to All Events plus Next 48 Hours', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // 1. Script extraction and syntax verification
    const scriptMatch = output.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    assert.ok(scriptMatch, 'Homepage must render main client script');
    const code = scriptMatch[1];
    
    // Will throw if there is any syntax error (such as unexpected string or broken escaping)
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: 'inline-test.js' });
    }, 'Inline script must parse cleanly without syntax errors');

    // 2. Default filter is All Events (category: '') + Next 48 Hours (window: '48h')
    assert.match(output, /window:\s*'48h'/);
    assert.match(output, /category:\s*''/);
    assert.match(output, /class="quick-time-btn active"\s+data-time="48h"/);
    assert.match(output, /class="cat-btn active"\s+data-cat=""/);

    // 3. Request uses correct latitude and longitude parameter names
    assert.match(output, /lat:\s*S\.lat/);
    assert.match(output, /lng:\s*S\.lon/);
    assert.match(output, /lon:\s*S\.lon/);
  });
});


