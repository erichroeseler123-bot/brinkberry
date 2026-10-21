import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const homeHandler = require('../api/home.js');

function renderHomeHtml(reqOverrides = {}) {
  let html = '';
  const req = {
    url: '/',
    headers: {},
    ...reqOverrides
  };
  const res = {
    setHeader() {},
    end(body) {
      html = body;
    }
  };
  homeHandler(req, res);
  return html;
}

/**
 * Lightweight DOM harness to execute api/home.js inline script and verify
 * synchronous class + aria-pressed state updates across every discovery control group.
 */
function createHomeDomHarness(html, urlSearch = '') {
  const elementsById = new Map();
  const allElements = [];

  class MockElement {
    constructor(tagName = 'div', attrs = {}, innerHTML = '') {
      this.tagName = tagName.toUpperCase();
      this.attributes = new Map();
      this.dataset = {};
      this.style = { display: '' };
      this._className = '';
      this._innerHTML = '';
      this.textContent = '';
      this.value = '';
      this.disabled = false;
      this.onclick = null;
      this.onkeydown = null;
      this.children = [];

      for (const [k, v] of Object.entries(attrs)) {
        this.setAttribute(k, v);
      }
      if (innerHTML) {
        this.innerHTML = innerHTML;
      }

      const classListSelf = this;
      this.classList = {
        add(...tokens) {
          const set = new Set(classListSelf._className.split(/\s+/).filter(Boolean));
          tokens.forEach(t => set.add(t));
          classListSelf._className = Array.from(set).join(' ');
        },
        remove(...tokens) {
          const set = new Set(classListSelf._className.split(/\s+/).filter(Boolean));
          tokens.forEach(t => set.delete(t));
          classListSelf._className = Array.from(set).join(' ');
        },
        toggle(token, force) {
          const set = new Set(classListSelf._className.split(/\s+/).filter(Boolean));
          const shouldHave = force !== undefined ? Boolean(force) : !set.has(token);
          if (shouldHave) set.add(token);
          else set.delete(token);
          classListSelf._className = Array.from(set).join(' ');
          return shouldHave;
        },
        contains(token) {
          return classListSelf._className.split(/\s+/).filter(Boolean).includes(token);
        }
      };
    }

    get id() {
      return this.attributes.get('id') || '';
    }

    set id(val) {
      this.setAttribute('id', val);
    }

    get className() {
      return this._className;
    }

    set className(val) {
      this._className = String(val || '');
      this.attributes.set('class', this._className);
    }

    setAttribute(name, val) {
      const strVal = String(val);
      this.attributes.set(name, strVal);
      if (name === 'id') {
        elementsById.set(strVal, this);
      } else if (name === 'class') {
        this._className = strVal;
      } else if (name === 'style') {
        const m = strVal.match(/display\s*:\s*([^;]+)/i);
        if (m) this.style.display = m[1].trim();
      } else if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = strVal;
      }
    }

    getAttribute(name) {
      if (name === 'class') return this._className;
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      this._innerHTML = String(val || '');
      // Remove previous dynamic children from allElements/elementsById
      for (const child of this.children) {
        const idx = allElements.indexOf(child);
        if (idx !== -1) allElements.splice(idx, 1);
        if (child.id && elementsById.get(child.id) === child) {
          elementsById.delete(child.id);
        }
      }
      this.children = parseButtonsFromHtml(this._innerHTML);
    }

    querySelectorAll(selector) {
      return matchSelector(this.children, selector);
    }

    contains(target) {
      return target === this || this.children.includes(target);
    }

    focus() {}
    showModal() {}
    close() {}
  }

  function parseAttrs(attrString) {
    const attrs = {};
    const attrRe = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = attrRe.exec(attrString)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  }

  function parseButtonsFromHtml(fragment) {
    const parsed = [];
    const btnRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let m;
    while ((m = btnRe.exec(fragment)) !== null) {
      const attrs = parseAttrs(m[1]);
      const el = new MockElement('button', attrs);
      el.textContent = m[2].replace(/<[^>]+>/g, '').trim();
      allElements.push(el);
      parsed.push(el);
    }
    return parsed;
  }

  function registerInitialElement(id, tagName = 'div', attrs = {}) {
    const el = new MockElement(tagName, { id, ...attrs });
    allElements.push(el);
    return el;
  }

  // Extract initial elements with IDs from rendered HTML
  const tagWithIdRe = /<([a-zA-Z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi;
  let match;
  while ((match = tagWithIdRe.exec(html)) !== null) {
    const tag = match[1];
    const attrs = parseAttrs(match[2]);
    if (!elementsById.has(attrs.id)) {
      const el = new MockElement(tag, attrs);
      allElements.push(el);
    }
  }

  // Populate initial quickTimeToggle buttons from HTML
  const qtMatch = html.match(/<div[^>]*id="quickTimeToggle"[^>]*>([\s\S]*?)<\/div>/i);
  if (qtMatch && elementsById.has('quickTimeToggle')) {
    elementsById.get('quickTimeToggle').innerHTML = qtMatch[1];
  }

  // Populate initial categoryRow buttons from HTML
  const catRowEl = elementsById.get('categoryRow');
  if (catRowEl) {
    const primMatch = html.match(/<div class="primary-categories-row">([\s\S]*?)<\/div>/i);
    const secMatch = html.match(/<div id="moreCategoriesRow"[^>]*>([\s\S]*?)<\/div>/i);
    catRowEl.innerHTML = (primMatch ? primMatch[1] : '') + (secMatch ? secMatch[1] : '');
  }

  function matchSelector(pool, selector) {
    const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/);
    if (attrMatch) {
      const [, attrName, attrVal] = attrMatch;
      return pool.filter(el => {
        const has = el.attributes.has(attrName);
        if (!has) return false;
        return attrVal === undefined ? true : el.getAttribute(attrName) === attrVal;
      });
    }
    if (selector === '.card') return [];
    return [];
  }

  const document = {
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelectorAll(selector) {
      return matchSelector(allElements, selector);
    },
    querySelector() {
      return null;
    },
    addEventListener() {}
  };

  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  const mainScript = scriptMatches[scriptMatches.length - 1][1];

  const sandbox = {
    window: {
      location: {
        search: urlSearch,
        pathname: '/',
        origin: 'https://brinkberry.com',
        href: 'https://brinkberry.com/' + urlSearch
      },
      history: { replaceState() {} },
      L: null
    },
    location: {
      search: urlSearch,
      pathname: '/',
      origin: 'https://brinkberry.com'
    },
    document,
    localStorage: {
      _store: new Map(),
      getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
      setItem(k, v) { this._store.set(k, String(v)); },
      removeItem(k) { this._store.delete(k); }
    },
    navigator: {},
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [], meta: { coverage: { isSupported: true } } })
    }),
    URL,
    URLSearchParams,
    setTimeout() {},
    clearTimeout() {},
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(`${mainScript}\n;globalThis.__S = S; globalThis.__applyLocation = applyLocation; globalThis.__initControls = initControls; globalThis.__renderFeed = renderFeed; globalThis.__openDetail = openDetail;`, sandbox);

  return {
    document,
    elementsById,
    allElements,
    sandbox,
    getButtonsByAttr(attr) {
      return document.querySelectorAll(`[${attr}]`);
    },
    assertGroupSync(buttons, expectedActivePredicate, groupLabel) {
      assert.ok(buttons.length > 0, `Expected buttons in group: ${groupLabel}`);
      let activeCount = 0;
      for (const btn of buttons) {
        const isVisuallyActive = btn.classList.contains('active');
        const ariaPressed = btn.getAttribute('aria-pressed');
        const shouldBeActive = expectedActivePredicate(btn);

        assert.equal(
          isVisuallyActive,
          shouldBeActive,
          `[${groupLabel}] Button "${btn.textContent || btn.id}" visual active class (${isVisuallyActive}) did not match expected (${shouldBeActive})`
        );
        assert.equal(
          ariaPressed,
          shouldBeActive ? 'true' : 'false',
          `[${groupLabel}] Button "${btn.textContent || btn.id}" aria-pressed (${ariaPressed}) diverged from visual active state (${isVisuallyActive})`
        );
        if (isVisuallyActive) activeCount++;
      }
      assert.equal(activeCount, 1, `[${groupLabel}] Expected exactly 1 active button in mutually exclusive group, found ${activeCount}`);
    }
  };
}

describe('Home Discovery Controls Programmatic State (WCAG 4.1.2)', () => {
  test('server-rendered HTML exposes initial aria-pressed matching active classes for default Denver and custom IP city (Milwaukee)', () => {
    const denverHtml = renderHomeHtml();

    // Default Denver preset is active and aria-pressed="true", peers are "false"
    assert.match(denverHtml, /<button id="presetDenver" class="preset-btn active" aria-pressed="true">Denver, CO<\/button>/);
    assert.match(denverHtml, /<button id="presetParis" class="preset-btn" aria-pressed="false">Paris<\/button>/);
    assert.match(denverHtml, /<button id="presetLondon" class="preset-btn" aria-pressed="false">London<\/button>/);
    assert.match(denverHtml, /<button id="presetTokyo" class="preset-btn" aria-pressed="false">Tokyo<\/button>/);
    assert.match(denverHtml, /<button id="presetNewYork" class="preset-btn" aria-pressed="false">New York<\/button>/);

    // Category buttons: All Events is active + aria-pressed="true", Comedy and others are aria-pressed="false"
    assert.match(denverHtml, /<button class="cat-btn active" data-cat="" aria-pressed="true">All Events<\/button>/);
    assert.match(denverHtml, /<button class="cat-btn comedy-btn" data-cat="comedy" data-label="Comedy Radar" aria-pressed="false">🎤 Comedy<\/button>/);
    assert.match(denverHtml, /<button class="cat-btn racing-btn" data-cat="racing" aria-pressed="false">🏁 Motorsports<\/button>/);

    // Quick-time choices: Next 48 Hours is active + aria-pressed="true", Tonight and This Weekend are aria-pressed="false"
    assert.match(denverHtml, /<button type="button" class="quick-time-btn" data-time="tonight" aria-pressed="false">Tonight<\/button>/);
    assert.match(denverHtml, /<button type="button" class="quick-time-btn active" data-time="48h" aria-pressed="true">Next 48 Hours<\/button>/);
    assert.match(denverHtml, /<button type="button" class="quick-time-btn" data-time="this_weekend" aria-pressed="false">This Weekend<\/button>/);

    // Accessible labels on city search input and filter groups
    assert.match(denverHtml, /<input[^>]*id="citySearchInput"[^>]*aria-label="City or neighborhood"/);
    assert.match(denverHtml, /<div id="timeWindows" class="pills-wrap" role="group" aria-label="Time window">/);
    assert.match(denverHtml, /<div id="radiusFilters" class="pills-wrap" role="group" aria-label="Search radius">/);

    // Live status region exposes role="status" and aria-live="polite"
    assert.match(denverHtml, /<div id="status" class="status" role="status" aria-live="polite">/);

    // View toggles: Feed View is active + aria-pressed="true", Radar Map is aria-pressed="false"
    assert.match(denverHtml, /<button id="viewFeed" class="active" aria-pressed="true">Feed View<\/button>/);
    assert.match(denverHtml, /<button id="viewRadar" aria-pressed="false">Radar Map<\/button>/);

    // Custom geo city (e.g. Milwaukee, WI) renders customLocChip with active + aria-pressed="true" and standard presets aria-pressed="false"
    const milwaukeeHtml = renderHomeHtml({
      headers: {
        'x-vercel-ip-city': 'Milwaukee',
        'x-vercel-ip-country-region': 'WI',
        'x-vercel-ip-latitude': '43.0389',
        'x-vercel-ip-longitude': '-87.9065'
      }
    });
    assert.match(milwaukeeHtml, /<button id="customLocChip" class="active" aria-pressed="true">📍 Milwaukee, WI<\/button>/);
    assert.match(milwaukeeHtml, /<button id="presetDenver" class="preset-btn" aria-pressed="false">Denver, CO<\/button>/);

    // Colorado preset cities (?city=boulder, ?city=golden, ?city=aurora) render visible .preset-btn controls with aria-pressed="true"
    const boulderHtml = renderHomeHtml({ url: '/?city=boulder' });
    assert.match(boulderHtml, /<button id="presetBoulder" class="preset-btn active" aria-pressed="true">Boulder<\/button>/);
    assert.match(boulderHtml, /<button id="presetDenver" class="preset-btn" aria-pressed="false">Denver, CO<\/button>/);
  });

  test('hydrated defaults and state updates keep aria-pressed synchronized across all mutually exclusive groups and sub-filters', () => {
    const html = renderHomeHtml({
      headers: {
        'x-vercel-ip-city': 'Milwaukee',
        'x-vercel-ip-country-region': 'WI',
        'x-vercel-ip-latitude': '43.0389',
        'x-vercel-ip-longitude': '-87.9065'
      }
    });
    const h = createHomeDomHarness(html);

    const presetIds = ['presetDenver', 'presetParis', 'presetLondon', 'presetTokyo', 'presetNewYork', 'presetBoulder', 'presetGolden', 'presetAurora'];
    const getPresetGroup = () => {
      const list = presetIds.map(id => h.document.getElementById(id)).filter(Boolean);
      const customChip = h.document.getElementById('customLocChip');
      if (customChip && h.document.getElementById('customLocWrap')?.innerHTML) {
        list.unshift(customChip);
      }
      return list;
    };

    // 1. Verify hydrated defaults for Milwaukee preset, categories, quick-time, expanded time-window, radius, mode, source, and view controls
    h.assertGroupSync(getPresetGroup(), b => b.id === 'customLocChip', 'Initial Location Presets (Milwaukee)');
    h.assertGroupSync(h.getButtonsByAttr('data-cat'), b => b.dataset.cat === '', 'Initial Categories');
    h.assertGroupSync(h.getButtonsByAttr('data-time'), b => b.dataset.time === '48h', 'Initial Quick Time');
    h.assertGroupSync(h.getButtonsByAttr('data-w'), b => b.dataset.w === '48h', 'Initial Expanded Time Windows');
    h.assertGroupSync(h.getButtonsByAttr('data-r'), b => b.dataset.r === '25', 'Initial Radius');
    h.assertGroupSync(h.getButtonsByAttr('data-m'), b => b.dataset.m === '', 'Initial Mode Tags');
    h.assertGroupSync(h.getButtonsByAttr('data-src'), b => b.dataset.src === 'all', 'Initial Source Controls');
    h.assertGroupSync(
      [h.document.getElementById('viewFeed'), h.document.getElementById('viewRadar')],
      b => b.id === 'viewFeed',
      'Initial View Switcher'
    );

    // 2. Activate Denver preset -> Denver becomes aria-pressed="true", custom chip removed, peers aria-pressed="false"
    h.document.getElementById('presetDenver').onclick();
    h.assertGroupSync(getPresetGroup(), b => b.id === 'presetDenver', 'Location Presets after activating Denver');

    // 3. Activate London and Boulder presets -> active preset becomes aria-pressed="true", peers aria-pressed="false"
    h.document.getElementById('presetLondon').onclick();
    h.assertGroupSync(getPresetGroup(), b => b.id === 'presetLondon', 'Location Presets after activating London');
    h.document.getElementById('presetBoulder').onclick();
    h.assertGroupSync(getPresetGroup(), b => b.id === 'presetBoulder', 'Location Presets after activating Boulder');

    // 4. Activate Comedy category -> Comedy becomes active + aria-pressed="true", All Events becomes aria-pressed="false"
    const comedyBtn = h.getButtonsByAttr('data-cat').find(b => b.dataset.cat === 'comedy');
    comedyBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-cat'), b => b.dataset.cat === 'comedy', 'Categories after activating Comedy');

    // Verify Comedy sub-console mutually exclusive groups (Format, Age, Price) and independent toggles (Urgency)
    h.assertGroupSync(h.getButtonsByAttr('data-st'), b => b.dataset.st === '', 'Comedy Format Defaults');
    h.assertGroupSync(h.getButtonsByAttr('data-al'), b => b.dataset.al === '', 'Comedy Age Defaults');
    h.assertGroupSync(h.getButtonsByAttr('data-pf'), b => b.dataset.pf === '', 'Comedy Price Defaults');

    const openMicBtn = h.getButtonsByAttr('data-st').find(b => b.dataset.st === 'open_mic');
    openMicBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-st'), b => b.dataset.st === 'open_mic', 'Comedy Format after activating Open Mics');

    const age21Btn = h.getButtonsByAttr('data-al').find(b => b.dataset.al === '21+');
    age21Btn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-al'), b => b.dataset.al === '21+', 'Comedy Age after activating 21+');

    const freePriceBtn = h.getButtonsByAttr('data-pf').find(b => b.dataset.pf === 'free');
    freePriceBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-pf'), b => b.dataset.pf === 'free', 'Comedy Price after activating Free');

    // Comedy urgency toggles are independent boolean toggles (Starting Soon & Recurring Shows can both be active)
    const btnSoon = h.document.getElementById('btnStartingSoon');
    const btnRec = h.document.getElementById('btnRecurring');
    assert.equal(btnSoon.getAttribute('aria-pressed'), 'false');
    assert.equal(btnRec.getAttribute('aria-pressed'), 'false');
    btnSoon.onclick();
    assert.equal( h.document.getElementById('btnStartingSoon').classList.contains('active'), true);
    assert.equal(h.document.getElementById('btnStartingSoon').getAttribute('aria-pressed'), 'true');
    assert.equal(h.document.getElementById('btnRecurring').getAttribute('aria-pressed'), 'false');
    h.document.getElementById('btnRecurring').onclick();
    assert.equal(h.document.getElementById('btnStartingSoon').getAttribute('aria-pressed'), 'true');
    assert.equal(h.document.getElementById('btnRecurring').getAttribute('aria-pressed'), 'true');

    // 5. Activate Quick-Time choice ("Tonight") -> synchronizes both Quick-Time and Expanded Time Windows
    const tonightQuickBtn = h.getButtonsByAttr('data-time').find(b => b.dataset.time === 'tonight');
    tonightQuickBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-time'), b => b.dataset.time === 'tonight', 'Quick Time after activating Tonight');
    h.assertGroupSync(h.getButtonsByAttr('data-w'), b => b.dataset.w === 'tonight', 'Expanded Time Windows after activating Tonight');

    // 5b. Activate Quick-Time choice ("This Weekend") -> synchronizes both Quick-Time and Expanded Time Windows
    const weekendQuickBtn = h.getButtonsByAttr('data-time').find(b => b.dataset.time === 'this_weekend');
    weekendQuickBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-time'), b => b.dataset.time === 'this_weekend', 'Quick Time after activating This Weekend');
    h.assertGroupSync(h.getButtonsByAttr('data-w'), b => b.dataset.w === 'this_weekend', 'Expanded Time Windows after activating This Weekend');

    // 6. Activate Expanded Time Window ("Tomorrow") -> Tomorrow is active + aria-pressed="true", Quick-Time buttons all false
    const tomorrowWinBtn = h.getButtonsByAttr('data-w').find(b => b.dataset.w === 'tomorrow');
    tomorrowWinBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-w'), b => b.dataset.w === 'tomorrow', 'Expanded Time Windows after activating Tomorrow');
    for (const qtBtn of h.getButtonsByAttr('data-time')) {
      assert.equal(qtBtn.classList.contains('active'), false);
      assert.equal(qtBtn.getAttribute('aria-pressed'), 'false');
    }

    // 7. Activate Radius ("10 mi")
    const r10Btn = h.getButtonsByAttr('data-r').find(b => b.dataset.r === '10');
    r10Btn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-r'), b => b.dataset.r === '10', 'Radius after activating 10 mi');

    // 8. Activate Mode tag ("date")
    const dateModeBtn = h.getButtonsByAttr('data-m').find(b => b.dataset.m === 'date');
    dateModeBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-m'), b => b.dataset.m === 'date', 'Mode Tags after activating Date Night');

    // 9. Activate Source control ("official")
    const officialSrcBtn = h.getButtonsByAttr('data-src').find(b => b.dataset.src === 'official');
    officialSrcBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-src'), b => b.dataset.src === 'official', 'Source Controls after activating Official Only');

    // 10. Activate Motorsports category and verify racing sub-filters
    const racingBtn = h.getButtonsByAttr('data-cat').find(b => b.dataset.cat === 'racing');
    racingBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-cat'), b => b.dataset.cat === 'racing', 'Categories after activating Motorsports');
    h.assertGroupSync(h.getButtonsByAttr('data-rd'), b => b.dataset.rd === '', 'Racing Discipline Defaults');
    const dirtOvalBtn = h.getButtonsByAttr('data-rd').find(b => b.dataset.rd === 'dirt_oval');
    dirtOvalBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-rd'), b => b.dataset.rd === 'dirt_oval', 'Racing Discipline after activating Dirt Ovals');
    const thisWeekendRaceBtn = h.getButtonsByAttr('data-rw').find(b => b.dataset.rw === 'this_weekend');
    thisWeekendRaceBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-rw'), b => b.dataset.rw === 'this_weekend', 'Racing Planning Window after activating This Weekend');

    // 11. Activate secondary category ("civic") and verify More Categories button uses aria-expanded while category buttons use aria-pressed
    const civicBtn = h.getButtonsByAttr('data-cat').find(b => b.dataset.cat === 'civic');
    civicBtn.onclick();
    h.assertGroupSync(h.getButtonsByAttr('data-cat'), b => b.dataset.cat === 'civic', 'Categories after activating Civic & Politics');
    assert.equal(h.document.getElementById('moreCategoriesBtn').getAttribute('aria-expanded'), 'true');

    // 12. Activate Radar Map view toggle, then switch back to Feed View
    const viewFeedBtn = h.document.getElementById('viewFeed');
    const viewRadarBtn = h.document.getElementById('viewRadar');
    viewRadarBtn.onclick();
    h.assertGroupSync([viewFeedBtn, viewRadarBtn], b => b.id === 'viewRadar', 'View Switcher after activating Radar Map');

    viewFeedBtn.onclick();
    h.assertGroupSync([viewFeedBtn, viewRadarBtn], b => b.id === 'viewFeed', 'View Switcher after returning to Feed View');
  });

  test('empty state renders one-tap "Show All Categories & Reset Filters" button when category, mode, sourceFilter, or sub-filters are active', () => {
    const html = renderHomeHtml();
    const h = createHomeDomHarness(html);
    const S = h.sandbox.__S;
    const renderFeed = h.sandbox.__renderFeed;

    // 1. Default unfiltered empty state: does not render resetAllFiltersBtn
    S.events = [];
    S.category = '';
    S.mode = '';
    S.sourceFilter = 'all';
    renderFeed();
    assert.doesNotMatch(h.document.getElementById('feed').innerHTML, /Show All Categories &amp; Reset Filters/);

    // 2. Narrow category filter active: renders Show All Categories & Reset Filters button with type="button"
    S.category = 'comedy';
    renderFeed();
    assert.match(
      h.document.getElementById('feed').innerHTML,
      /<button type="button"[^>]*>Show All Categories &amp; Reset Filters<\/button>/
    );

    // 3. Source filter active: renders Show All Categories & Reset Filters button
    S.category = '';
    S.sourceFilter = 'community';
    renderFeed();
    assert.match(
      h.document.getElementById('feed').innerHTML,
      /<button type="button"[^>]*>Show All Categories &amp; Reset Filters<\/button>/
    );
  });

  test('openDetail renders sourceQualityTooltip as visible helper text next to Source Verification', () => {
    const html = renderHomeHtml();
    const h = createHomeDomHarness(html);
    const S = h.sandbox.__S;
    const openDetail = h.sandbox.__openDetail;

    S.events = [
      {
        id: 'evt_verified_1',
        title: 'Saturday Headliner Showcase',
        venue: 'Comedy Works Downtown',
        city: 'Denver',
        start: '2026-10-17T20:00:00.000Z',
        category: 'comedy',
        priceDisplay: '$25',
        sourceQualityLabel: 'Confirmed by official venue calendar',
        sourceQualityTooltip: 'Verified directly against the official venue box office schedule.'
      }
    ];

    openDetail('evt_verified_1');
    const detailHtml = h.document.getElementById('detailBody').innerHTML;
    assert.match(detailHtml, /Source Verification:/);
    assert.match(detailHtml, /Confirmed by official venue calendar/);
    assert.match(detailHtml, /Verified directly against the official venue box office schedule\./);
  });
});

