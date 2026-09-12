const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const sourcePath = path.resolve(__dirname, '../assets/analytics.js');
const key = 'dez2fly.analytics-consent.v1';
const windows = [];
afterEach(() => windows.splice(0).forEach(window => window.close()));

function page(options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(`<!doctype html><html><head><title>Dez2fly</title></head><body>
    <main><section id="shop"><a id="merchcard" href="https://dez2fly-shop.fourthwall.com/products/what-i-do-tee?email=private@example.com">Shop</a></section>
    <section id="grab"><form><input value="private@example.com"></form></section>
    <a id="unknown" data-track="private-username" href="https://elsewhere.test/?email=private@example.com">Private name</a></main>
    <footer></footer></body></html>`, {
    url: options.url || 'https://dez2fly.com/?s=yt',
    referrer: options.referrer === '' ? undefined : options.referrer || 'https://referrer.test/',
    runScripts: 'outside-only', virtualConsole,
  });
  const { window } = dom;
  windows.push(window);
  if (options.consent) window.localStorage.setItem(key, JSON.stringify(options.consent));
  if (options.cookie) window.document.cookie = options.cookie;
  if (options.storageUnavailable) {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  }
  if (options.footerSettings) window.document.querySelector('footer').innerHTML = '<button type="button" data-analytics-settings>analytics settings</button>';
  let observe;
  if (options.sections) {
    window.IntersectionObserver = class {
      constructor(callback) { observe = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (fs.existsSync(sourcePath)) window.eval(fs.readFileSync(sourcePath, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, document: window.document, errors, intersect(entries) { observe(entries); } };
}

function scripts(document) {
  return [...document.querySelectorAll('script[src]')].map(script => script.src);
}
function allow(document) { document.querySelector('[data-analytics-allow]').click(); }
function reject(document) { document.querySelector('[data-analytics-reject]').click(); }
function commands(window) { return Array.from(window.dataLayer || [], item => Array.from(item)); }

// These cases catch consent bypass, missing choice controls, and mistaken persisted grants.
test('a new visitor sees accessible equal-choice controls without vendor scripts', () => {
  const { window, document } = page();
  assert.ok(window.dezAnalytics, 'consent API is available');
  assert.equal(window.dezAnalytics.getConsent(), 'unset');
  assert.deepEqual(scripts(document), []);
  const panel = document.querySelector('[data-analytics-panel]');
  assert.equal(panel.hidden, false);
  assert.ok(panel.getAttribute('aria-labelledby'));
  assert.match(document.querySelector('[data-analytics-allow]').textContent, /^allow analytics$/i);
  assert.match(document.querySelector('[data-analytics-reject]').textContent, /^reject$/i);
  assert.equal(document.querySelector('[data-analytics-allow]').className,
    document.querySelector('[data-analytics-reject]').className);
});

test('reject persists a time-limited denial and settings can reopen it', () => {
  const { window, document } = page();
  assert.ok(window.dezAnalytics, 'consent API is available');
  reject(document);
  assert.equal(window.dezAnalytics.getConsent(), 'denied');
  const choice = JSON.parse(window.localStorage.getItem(key));
  assert.equal(choice.choice, 'denied');
  assert.ok(choice.expiresAt > Date.now());
  assert.ok(choice.expiresAt <= Date.now() + 181 * 864e5);
  assert.deepEqual(scripts(document), []);
  const settings = document.querySelector('[data-analytics-settings]');
  assert.equal(settings.hidden, false);
  settings.click();
  assert.equal(document.querySelector('[data-analytics-panel]').hidden, false);
  assert.equal(document.activeElement, document.querySelector('[data-analytics-allow]'));
});

test('only current valid persisted grants load vendors', () => {
  for (const consent of [
    { choice: 'granted', expiresAt: Date.now() - 1 },
    { choice: 'granted', expiresAt: 'never' },
    { choice: 'unknown', expiresAt: Date.now() + 10000 },
    { choice: 'denied', expiresAt: Date.now() + 10000 },
  ]) {
    const { window, document } = page({ consent });
    assert.ok(window.dezAnalytics, 'consent API is available');
    assert.deepEqual(scripts(document), []);
  }
  const { document } = page({ consent: { choice: 'granted', expiresAt: Date.now() + 10000 } });
  assert.equal(scripts(document).length, 2);
});

// The command queue is the actual contract delivered to the two external SDKs.
test('opt-in loads each vendor once with sanitized GA context and denied advertising', () => {
  const { window, document } = page();
  assert.ok(window.dezAnalytics, 'consent API is available');
  allow(document);
  window.dezAnalytics.openSettings();
  allow(document);
  assert.deepEqual(scripts(document).sort(), [
    'https://www.clarity.ms/tag/xmwqq5ne67',
    'https://www.googletagmanager.com/gtag/js?id=G-034DJN5ZKD',
  ]);
  const config = commands(window).filter(command => command[0] === 'config');
  assert.equal(config.length, 1, 'one automatic page view per page');
  assert.equal(config[0][1], 'G-034DJN5ZKD');
  assert.equal(config[0][2].page_location, 'https://dez2fly.com/');
  assert.equal(config[0][2].page_referrer, 'https://referrer.test');
  assert.equal(config[0][2].allow_google_signals, false);
  assert.equal(config[0][2].allow_ad_personalization_signals, false);
  const consent = commands(window).find(command => command[0] === 'consent' && command[1] === 'update')[2];
  assert.equal(consent.analytics_storage, 'granted');
  for (const kind of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(consent[kind], 'denied');
  const linker = commands(window).find(command => command[0] === 'set' && command[1] === 'linker');
  assert.deepEqual(Array.from(linker[2].domains), ['dez2fly.com', 'dez2fly-shop.fourthwall.com']);
  assert.equal(linker[2].decorate_forms, false);
  assert.ok(!JSON.stringify(commands(window)).includes('private@example.com'));
  const clarityConsent = Array.from(window.clarity.q).map(args => Array.from(args)).find(args => args[0] === 'consentv2');
  assert.equal(clarityConsent[1].analytics_Storage, 'granted');
  assert.equal(clarityConsent[1].ad_Storage, 'denied');
});

test('the existing footer control reopens settings without adding another button', () => {
  const { document } = page({ footerSettings: true });
  reject(document);
  assert.equal(document.querySelectorAll('[data-analytics-settings]').length, 1);
  document.querySelector('footer [data-analytics-settings]').click();
  assert.equal(document.querySelector('[data-analytics-panel]').hidden, false);
});

// Catch accidental passthrough of arbitrary event names, user input, or URL values.
test('tracking accepts only approved event values after consent without retaining form contents', () => {
  const { window, document } = page();
  assert.equal(typeof window.dezAnalytics.track, 'function');
  assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
  allow(document);
  assert.equal(window.dezAnalytics.track('signup_accepted', {
    form_id: 'grabform', email: 'private@example.com', username: 'private-username',
    page_location: 'https://elsewhere.test/private',
  }), true);
  assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'private-username' }), false);
  assert.equal(window.dezAnalytics.track('purchase', { value: 99 }), false);
  assert.equal(window.dezAnalytics.track('add_to_cart', {}), false);
  const events = commands(window).filter(command => command[0] === 'event');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'signup_accepted');
  assert.equal(events[0][2].form_id, 'grabform');
  assert.ok(!JSON.stringify(events).includes('private'));
});

test('link telemetry uses stable IDs and never copies raw links or text', () => {
  const { window, document } = page();
  allow(document);
  for (const id of ['merchcard', 'unknown']) {
    document.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }
  const events = commands(window).filter(command => command[0] === 'event');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'navigation_click');
  assert.equal(events[0][2].link_id, 'merchcard');
  assert.ok(!JSON.stringify(events).includes('private'));
});

test('QA traffic is explicitly marked while ordinary visits are unmarked', () => {
  for (const url of ['http://localhost:8000/', 'http://127.0.0.1:8000/', 'https://dez2fly.com/?s=codex_qa']) {
    const { window, document } = page({ url });
    allow(document);
    const config = commands(window).find(command => command[0] === 'config')[2];
    assert.equal(config.debug_mode, true);
    assert.equal(config.qa_traffic, true);
  }
  const { window, document } = page();
  allow(document);
  const config = commands(window).find(command => command[0] === 'config')[2];
  assert.equal(config.debug_mode, undefined);
  assert.equal(config.qa_traffic, undefined);
});

test('sensitive URL or referrer values withhold Clarity and are absent from GA commands', () => {
  for (const options of [
    { url: 'https://dez2fly.com/?email=private@example.com#private-fragment' },
    { url: 'https://dez2fly.com/?utm_content=private@example.com' },
    { url: 'https://dez2fly.com/?s=unrecognized-user' },
    { referrer: 'https://referrer.test/?email=private@example.com' },
  ]) {
    const { window, document } = page(options);
    allow(document);
    assert.deepEqual(scripts(document), ['https://www.googletagmanager.com/gtag/js?id=G-034DJN5ZKD']);
    assert.ok(!JSON.stringify(commands(window)).includes('private'));
    assert.ok(!JSON.stringify(commands(window)).includes('unrecognized-user'));
    assert.equal(window.clarity, undefined);
  }
});

// Without a reload, Clarity's scheduled recorder can continue after a local API flag changes.
test('withdrawal persists denial, clears vendor cookies, disables GA and reloads the page', () => {
  const { window, document, errors } = page();
  allow(document);
  document.cookie = '_ga=old-client; Path=/';
  document.cookie = '_ga_034DJN5ZKD=old-session; Path=/; Domain=dez2fly.com';
  document.cookie = '_clck=old-session; Path=/';
  document.cookie = '_clsk=old-session; Path=/';
  document.cookie = 'crew=1; Path=/';
  window.dezAnalytics.openSettings();
  reject(document);
  assert.equal(JSON.parse(window.localStorage.getItem(key)).choice, 'denied');
  assert.equal(window['ga-disable-G-034DJN5ZKD'], true);
  assert.ok(!document.cookie.includes('_ga'));
  assert.ok(!document.cookie.includes('_cl'));
  assert.ok(document.cookie.includes('crew=1'));
  assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
  assert.ok(errors.some(error => /navigation/.test(error)), 'withdrawal requested a real page reload');
  const updates = commands(window).filter(command => command[0] === 'consent' && command[1] === 'update');
  assert.equal(updates.at(-1)[2].analytics_storage, 'denied');
});

test('unavailable storage starts with no permission and allows only an ephemeral choice', () => {
  const { window, document } = page({ storageUnavailable: true });
  assert.equal(window.dezAnalytics.getConsent(), 'unset');
  assert.deepEqual(scripts(document), []);
  allow(document);
  assert.equal(window.dezAnalytics.getConsent(), 'granted');
  assert.equal(scripts(document).length, 2);
  const next = page({ storageUnavailable: true });
  assert.equal(next.window.dezAnalytics.getConsent(), 'unset');
  assert.deepEqual(scripts(next.document), []);
});

test('a denial cookie prevents a stale stored grant returning after storage write failure', () => {
  const { window, document } = page();
  allow(document);
  const savedGrant = window.localStorage.getItem(key);
  const storage = window.localStorage;
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  window.dezAnalytics.openSettings();
  reject(document);
  assert.equal(storage.getItem(key), savedGrant);
  assert.ok(document.cookie.includes('dez_analytics_denied=1'));
  const next = page({ consent: JSON.parse(savedGrant), cookie: document.cookie });
  assert.equal(next.window.dezAnalytics.getConsent(), 'denied');
  assert.deepEqual(scripts(next.document), []);
});

test('consent expiry stops events and requests a reload while a tab stays open', () => {
  const { window, document, errors } = page();
  allow(document);
  window.Date.now = () => Date.now() + 181 * 864e5;
  assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
  assert.equal(window.dezAnalytics.getConsent(), 'unset');
  assert.equal(window['ga-disable-G-034DJN5ZKD'], true);
  assert.ok(errors.some(error => /navigation/.test(error)));
});

test('withdrawal in another tab disables the already running SDKs here', () => {
  const { window, document, errors } = page();
  allow(document);
  window.localStorage.setItem(key, JSON.stringify({ choice: 'denied', expiresAt: Date.now() + 10000 }));
  window.dispatchEvent(new window.StorageEvent('storage', { key }));
  assert.equal(window.dezAnalytics.getConsent(), 'denied');
  assert.equal(window['ga-disable-G-034DJN5ZKD'], true);
  assert.ok(errors.some(error => /navigation/.test(error)));
});

test('section visibility produces one stable event after consent and never a hidden view', () => {
  const harness = page({ sections: true });
  const { window, document } = harness;
  allow(document);
  assert.doesNotThrow(() => harness.intersect([
    { target: document.getElementById('shop'), isIntersecting: false },
  ]));
  assert.equal(commands(window).filter(command => command[0] === 'event').length, 0);
  harness.intersect([{ target: document.getElementById('shop'), isIntersecting: true }]);
  harness.intersect([{ target: document.getElementById('shop'), isIntersecting: true }]);
  const events = commands(window).filter(command => command[0] === 'event');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'section_view');
  assert.equal(events[0][2].section_id, 'shop');
});

test('a broken vendor consent handler cannot prevent withdrawal from reloading', () => {
  const { window, document, errors } = page();
  allow(document);
  window.clarity = () => { throw new Error('Vendor unavailable'); };
  window.dezAnalytics.openSettings();
  reject(document);
  assert.equal(window.dezAnalytics.getConsent(), 'denied');
  assert.equal(window['ga-disable-G-034DJN5ZKD'], true);
  assert.ok(errors.some(error => /navigation/.test(error)));
});

test('entry source survives query removal with only the approved source values', () => {
  const examples = [
    ['qr', 'qr'], ['chat', 'chat'], ['live', 'live'], ['ig', 'ig'], ['tt', 'tt'], ['yt', 'yt'],
    ['fb', 'fb'], ['dc', 'dc'], ['email', 'email'], ['direct', 'direct'], ['other', 'other'],
    ['vaultback', 'vaultback'], ['codex_qa', 'codex_qa'], ['private-user', 'other'],
    ['private@example.com', 'other'],
  ];
  for (const [source, expected] of examples) {
    const { window, document } = page({ url: 'https://dez2fly.com/?s=' + encodeURIComponent(source) });
    allow(document);
    window.dezAnalytics.track('signup_accepted', { form_id: 'grabform', entry_source: 'private-override' });
    const config = commands(window).find(command => command[0] === 'config')[2];
    const event = commands(window).find(command => command[0] === 'event')[2];
    assert.equal(config.entry_source, expected, source);
    assert.equal(event.entry_source, expected, source);
    assert.equal(config.page_location, 'https://dez2fly.com/');
    assert.ok(!JSON.stringify(commands(window)).includes('private'));
  }
});

test('missing source uses recognized referrer domains without confusing similarly named sites', () => {
  for (const [referrer, expected] of [
    ['', 'direct'], ['https://www.youtube.com/watch?v=XaYQyAQKSdo', 'yt'],
    ['https://youtu.be/XaYQyAQKSdo', 'yt'], ['https://l.instagram.com/', 'ig'],
    ['https://www.tiktok.com/@private-user', 'tt'], ['https://m.facebook.com/', 'fb'],
    ['https://discord.gg/htTStDYfBN', 'dc'], ['https://notyoutube.com/', 'other'],
    ['https://youtube.com.untrusted.test/', 'other'], ['https://unrecognized.test/', 'other'],
  ]) {
    const { window, document } = page({ url: 'https://dez2fly.com/', referrer });
    allow(document);
    const config = commands(window).find(command => command[0] === 'config')[2];
    assert.equal(config.entry_source, expected, referrer);
    assert.ok(!JSON.stringify(commands(window)).includes('private-user'));
  }
});

test('important navigation controls use GA-specific IDs without changing legacy tracker attributes', () => {
  const { window, document } = page();
  allow(document);
  const linkIds = ['nav-home', 'nav-watch', 'nav-shop', 'nav-crew', 'hero-watch', 'hero-shop',
    'free-youtube', 'tiktok', 'instagram', 'instagram-skits', 'footer-home', 'business-contact',
    'privacy', 'back-top'];
  for (const id of linkIds) {
    const link = document.createElement('a');
    link.id = 'legacy-id-' + id;
    link.dataset.gaTrack = id;
    link.dataset.track = 'legacy-event-' + id;
    link.href = 'https://destination.test/?email=private@example.com';
    link.textContent = 'private username';
    document.body.append(link);
    link.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(link.dataset.track, 'legacy-event-' + id);
    assert.equal(link.id, 'legacy-id-' + id);
  }
  const events = commands(window).filter(command => command[0] === 'event');
  assert.deepEqual(events.map(command => command[2].link_id), linkIds);
  assert.ok(events.every(command => command[1] === 'navigation_click'));
  assert.ok(!JSON.stringify(events).includes('private'));
  window.dezAnalytics.openSettings();
  document.querySelector('[data-analytics-panel] a').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(commands(window).filter(command => command[0] === 'event').length, linkIds.length);
});

test('restoring a cached page rechecks consent before accepting another analytics event', () => {
  for (const replacement of ['denied', 'expired', 'removed']) {
    const { window, document, errors } = page();
    allow(document);
    if (replacement === 'removed') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({
      choice: replacement === 'expired' ? 'granted' : 'denied',
      expiresAt: Date.now() + (replacement === 'expired' ? -1 : 10000),
    }));
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
    assert.equal(window['ga-disable-G-034DJN5ZKD'], true);
    assert.ok(errors.some(error => /navigation/.test(error)), replacement);
  }
});

test('restoring a cached page with valid consent preserves a single SDK load and page view', () => {
  const { window, document, errors } = page();
  allow(document);
  window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(window.dezAnalytics.getConsent(), 'granted');
  assert.equal(scripts(document).length, 2);
  assert.equal(commands(window).filter(command => command[0] === 'config').length, 1);
  assert.deepEqual(errors, []);
});

test('cookie-only withdrawal is enforced by tracking, consent reads, focus, and visible-tab return', () => {
  for (const trigger of ['track', 'getConsent', 'focus', 'visibility']) {
    const { window, document, errors } = page();
    allow(document);
    document.cookie = 'dez_analytics_denied=1; Path=/; SameSite=Lax';
    if (trigger === 'track') assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
    else if (trigger === 'getConsent') assert.equal(window.dezAnalytics.getConsent(), 'denied');
    else if (trigger === 'focus') window.dispatchEvent(new window.Event('focus'));
    else {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new window.Event('visibilitychange'));
    }
    assert.equal(window['ga-disable-G-034DJN5ZKD'], true, trigger);
    assert.equal(window.dezAnalytics.getConsent(), 'denied');
    assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
    assert.ok(errors.some(error => /navigation/.test(error)), trigger);
  }
});

test('an ephemeral grant works in its active context and fails closed when focus returns', () => {
  for (const trigger of ['focus', 'visibility']) {
    const { window, document, errors } = page({ storageUnavailable: true });
    allow(document);
    assert.equal(window.dezAnalytics.getConsent(), 'granted');
    assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), true);
    if (trigger === 'focus') window.dispatchEvent(new window.Event('focus'));
    else {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new window.Event('visibilitychange'));
    }
    assert.equal(window.dezAnalytics.getConsent(), 'denied', trigger);
    assert.equal(window.dezAnalytics.track('signup_accepted', { form_id: 'grabform' }), false);
    assert.ok(errors.some(error => /navigation/.test(error)), trigger);
  }
});

test('bio and TV entry tags remain distinct in safe GA context after consent', () => {
  // Catches approved profile placements collapsing into the generic other bucket.
  for (const source of ['ig_bio', 'igskits_bio', 'tt_bio', 'yt_bio', 'tv']) {
    const { window, document } = page({ url: 'https://dez2fly.com/?s=' + source });
    assert.deepEqual(scripts(document), [], 'new sources must not bypass consent');
    allow(document);
    window.dezAnalytics.track('navigation_click', { link_id: 'merchcard' });
    const config = commands(window).find(command => command[0] === 'config')[2];
    const event = commands(window).find(command => command[0] === 'event')[2];
    assert.equal(config.entry_source, source);
    assert.equal(event.entry_source, source);
    assert.equal(event.page_location, 'https://dez2fly.com/');
    assert.equal(event.link_id, 'merchcard');
    assert.ok(scripts(document).some(url => url.startsWith('https://www.clarity.ms/tag/')),
      'approved placements remain eligible for consented Clarity');
  }
});

test('unapproved bio-like tags still lose their raw value and withhold recordings', () => {
  const { window, document } = page({ url: 'https://dez2fly.com/?s=ig_bio_private-user' });
  allow(document);
  assert.equal(commands(window).find(command => command[0] === 'config')[2].entry_source, 'other');
  assert.ok(!JSON.stringify(commands(window)).includes('private-user'));
  assert.ok(!scripts(document).some(url => url.startsWith('https://www.clarity.ms/tag/')));
});

test('the TV alias permits consented recordings without admitting arbitrary referring queries', () => {
  // Catches the new intermediate route excluding every ordinary TV visitor from Clarity.
  for (const [referrer, permitted] of [
    ['https://dez2fly.com/tv', true],
    ['https://dez2fly.com/tv/', true],
    ['https://dez2fly.com/tv/index.html', true],
    ['https://dez2fly.com/tv/?email=private@example.com', false],
  ]) {
    const { window, document } = page({ url: 'https://dez2fly.com/?s=tv', referrer });
    assert.deepEqual(scripts(document), []);
    allow(document);
    assert.equal(scripts(document).some(url => url.startsWith('https://www.clarity.ms/tag/')), permitted);
    assert.ok(!JSON.stringify(commands(window)).includes('private@example.com'));
  }
});
