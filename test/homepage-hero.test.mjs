import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import homeHandler from '../api/home.js';

describe('Homepage Hero Redesign & 3-Vertical Selection', () => {
  test('renders the central "What are you looking for tonight?" headline', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Primary headline and regression subtitle
    assert.match(output, /<h1 class="hero-title">What are you looking for tonight\?<\/h1>/);
    assert.match(output, /Wondering what should I do tonight\?/);
    assert.match(output, /Find what’s happening near you right now/);
  });

  test('renders 3 prominent vertical entry cards with tablist semantics', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    // Check entry path container & cards
    assert.match(output, /class="hero-vertical-entry-paths"/);
    assert.match(output, /id="entryPathAll"[^>]*class="entry-path-card active"/);
    assert.match(output, /id="entryPathComedy"[^>]*class="entry-path-card"/);
    assert.match(output, /id="entryPathRacing"[^>]*class="entry-path-card"/);

    // Card text and cues
    assert.match(output, /Everything near me/);
    assert.match(output, /Comedy near me/);
    assert.match(output, /Motorsports near me/);
  });

  test('renders radar-lock indicator and expandable location drawer', () => {
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

  test('renders progressive disclosure containers for All, Comedy, and Racing sub-filters', () => {
    let output = '';
    const res = {
      setHeader: () => {},
      end: (content) => { output = content; }
    };
    homeHandler({ url: '/', headers: {} }, res);

    assert.match(output, /id="contextualControls"/);
    assert.match(output, /id="everythingSubRow"/);
    assert.match(output, /id="categoryRow"/);
    assert.match(output, /id="comedySubFilterConsole"/);
    assert.match(output, /id="racingSubFilterConsole"/);
    assert.match(output, /id="generalFilterBar"/);
    assert.match(output, /id="timeWindows"/);
    assert.match(output, /id="radiusFilters"/);
    assert.match(output, /id="modeFilters"/);
  });
});
