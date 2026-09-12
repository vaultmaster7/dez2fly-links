const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { afterEach, test } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const windows = [];
afterEach(() => windows.splice(0).forEach(window => window.close()));

function loadLocalPage(file, source) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), {
    url: 'https://dez2fly.com/' + (file === 'index.html' ? '' : file) + '?s=' + source,
    runScripts: 'outside-only', virtualConsole,
  });
  const { window } = dom;
  windows.push(window);
  const counts = [], requests = [];
  window.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return { ok: true, status: 202, json: async () => ({}) };
  };
  window.requestAnimationFrame = callback => callback();
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  // Execute local production scripts; replace only the external counting boundary.
  const scripts = [...window.document.querySelectorAll('script')];
  const orderedScripts = scripts.filter(script => !script.defer).concat(scripts.filter(script => script.defer));
  for (const script of orderedScripts) {
    if (script.type && script.type !== 'text/javascript' && script.type !== 'application/javascript') continue;
    if (script.hasAttribute('src')) {
      const url = new URL(script.src);
      if (url.pathname === '/count.js') window.goatcounter.count = event => counts.push(event);
      else {
        assert.equal(url.origin, 'https://dez2fly.com');
        window.eval(fs.readFileSync(path.join(root, url.pathname), 'utf8'));
      }
    } else window.eval(script.textContent);
  }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.document.addEventListener('click', event => event.preventDefault());
  assert.deepEqual(errors, []);
  return { window, document: window.document, counts, requests, errors };
}

const commands = window => Array.from(window.dataLayer || [], args => Array.from(args));
const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

test('each bio source reaches merch, Vault and accepted-signup boundaries unchanged', async () => {
  // Catches a newly named source being lost by existing routing or signup instrumentation.
  for (const source of ['ig_bio', 'igskits_bio', 'tt_bio', 'yt_bio', 'tv']) {
    const { window, document, counts, requests } = loadLocalPage('index.html', source);
    assert.ok(counts.some(event => event.path === '/visit-' + source && !event.event));
    const merch = document.getElementById('merchcard');
    const merchURL = new URL(merch.href);
    assert.equal(merchURL.hostname, 'dez2fly-shop.fourthwall.com');
    assert.equal(merchURL.pathname, '/products/what-i-do-tee');
    assert.equal(merchURL.searchParams.get('utm_source'), 'biolink_' + source);
    assert.equal(new URL(document.getElementById('vaultcard').href).searchParams.get('s'), source);
    click(window, merch);
    assert.ok(counts.some(event => event.path === 'click-merchcard--' + source && event.event));
    document.querySelector('[data-analytics-allow]').click();
    document.getElementById('gemail').value = 'crew@example.com';
    document.getElementById('grabform').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const signup = requests.find(request => request.input.includes('a.klaviyo.com'));
    assert.ok(signup, 'the form should use the existing subscription service');
    const attributes = JSON.parse(signup.init.body).data.attributes;
    assert.equal(attributes.profile.data.attributes.properties['Signup Source'], 'biolink_' + source);
    const outcome = commands(window).find(command => command[0] === 'event' && command[1] === 'signup_accepted');
    assert.ok(outcome, 'accepted form request should emit the existing outcome');
    assert.equal(outcome[2].entry_source, source);
  }
});

test('Vault exits emit consented stable GA IDs while preserving legacy counts and attribution', () => {
  // Catches markup/allowlist mismatch silently dropping final funnel exits from GA.
  const exits = [
    ['teaser', 'vault-teaser', 'vault-teaser-click'],
    ['btn-free', 'vault-free', 'btn-free'],
    ['btn-paid', 'vault-paid', 'btn-paid'],
    ['ytmem', 'vault-membership', 'vault-ytmember-click'],
  ];
  for (const source of ['ig_bio', 'igskits_bio', 'tt_bio', 'yt_bio', 'tv', 'qr']) {
    const { window, document, counts } = loadLocalPage('vault.html', source);
    const originalIds = exits.map(([id]) => document.getElementById(id).id);
    for (const [id] of exits) click(window, document.getElementById(id));
    assert.equal(commands(window).length, 0, 'exits before consent must not load GA');
    document.querySelector('[data-analytics-allow]').click();
    counts.length = 0;
    for (const [id] of exits) click(window, document.getElementById(id));
    const navigation = commands(window).filter(command => command[0] === 'event' && command[1] === 'navigation_click');
    assert.deepEqual(navigation.map(command => command[2].link_id), exits.map(([, id]) => id));
    assert.ok(navigation.every(command => command[2].entry_source === source));
    assert.deepEqual(exits.map(([id]) => document.getElementById(id).id), originalIds);
    for (const [id, , legacy] of exits) {
      assert.ok(counts.some(event => event.path === legacy + '--' + source && event.event));
      const url = new URL(document.getElementById(id).href);
      if (id === 'btn-free' || id === 'btn-paid') assert.equal(url.searchParams.get('utm_source'), 'biolink_' + source);
    }
    assert.equal(document.getElementById('teaser').href, 'https://privatedrop7.carrd.co/');
    assert.equal(document.getElementById('ytmem').href, 'https://www.youtube.com/@Dez2fly/join');
  }
});

for (const [routeName, source] of [['tv', 'tv'], ['ig', 'ig_bio'], ['tiktok', 'tt_bio']]) {
test('the /' + routeName + ' route immediately hands off to one attributed homepage without tracking twice', () => {
  // Catches a slow tracker dependency, an open redirect, or missing no-JS fallback.
  const route = path.join(root, routeName, 'index.html');
  assert.ok(fs.existsSync(route), 'a real /' + routeName + '/ route must exist before it is advertised');
  const dom = new JSDOM(fs.readFileSync(route, 'utf8'), { url: 'https://dez2fly.com/' + routeName + '/?next=https://untrusted.test/&s=qr' });
  windows.push(dom.window);
  const redirects = [];
  const location = {
    href: dom.window.location.href,
    search: dom.window.location.search,
    replace: destination => redirects.push(destination),
  };
  const context = vm.createContext({
    location, window: { location }, document: dom.window.document, URL, URLSearchParams,
    setTimeout() { assert.fail('handoff must not wait for analytics or a timer'); },
    fetch() { assert.fail('the alias must not emit duplicate visit counts'); },
  });
  assert.equal(dom.window.document.querySelectorAll('script[src]').length, 0);
  for (const script of dom.window.document.querySelectorAll('script')) vm.runInContext(script.textContent, context);
  assert.deepEqual(redirects, ['/?s=' + source]);
  const fallback = dom.window.document.querySelector('a[href]');
  assert.ok(fallback && fallback.textContent.trim(), 'a readable fallback is available without JavaScript');
  assert.equal(fallback.href, 'https://dez2fly.com/?s=' + source);
});
}
