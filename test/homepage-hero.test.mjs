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
});

