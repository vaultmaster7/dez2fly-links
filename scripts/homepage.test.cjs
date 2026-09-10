const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const SITE_ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(SITE_ROOT, 'index.html');
const SITE_ORIGIN = 'https://dez2fly.com';

const PRODUCT_DESTINATIONS = {
  merchcard: '/products/what-i-do-tee',
  stopplayingcard: '/products/stop-playing-with-me-back-print-tee',
  weirdturncard: '/products/weird-turn-back-print-tee',
  fathergodcard: '/products/father-god-in-the-name-of-jesus-tee',
  heysportcard: '/products/hey-sport-back-print-tee',
};

const REQUIRED_DEEP_LINK_IDS = [
  'grab',
  'grabform',
  'gemail',
  'gbtn',
  'gmsg',
  'gsug',
  'latest',
  'lthumb',
  'ltitle',
  ...Object.keys(PRODUCT_DESTINATIONS),
];

const openWindows = new Set();

afterEach(() => {
  for (const window of openWindows) window.close();
  openWindows.clear();
});

class LocalScriptLoader extends ResourceLoader {
  fetch(resourceUrl) {
    const url = new URL(resourceUrl);
    if (url.origin !== SITE_ORIGIN) return null;

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(SITE_ROOT, relativePath);
    if (filePath !== SITE_ROOT && !filePath.startsWith(`${SITE_ROOT}${path.sep}`)) {
      return null;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return Promise.resolve(fs.readFileSync(filePath));
  }
}

function makeClock(window) {
  let elapsed = 0;
  let nextId = 1;
  const timers = new Map();

  window.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextId++;
    timers.set(id, {
      at: elapsed + Math.max(0, Number(delay) || 0),
      callback: () => callback(...args),
    });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.setInterval = () => nextId++;
  window.clearInterval = () => {};

  return {
    advance(milliseconds) {
      const target = elapsed + milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        elapsed = timer.at;
        timer.callback();
      }
      elapsed = target;
    },
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

async function loadHomepage({
  query = '',
  latest = {
    id: 'XaYQyAQKSdo',
    title: 'A usable latest-video fixture',
    thumb: 'https://i.ytimg.com/vi/XaYQyAQKSdo/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=XaYQyAQKSdo',
  },
  stats = { updated: new Date().toISOString() },
  signupStatus = 202,
  signupDeferred = false,
  denyLocalStorage = false,
  initialCrew = false,
} = {}) {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const requests = [];
  const runtimeErrors = [];
  const signupResolvers = [];
  let clock;

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (error.type !== 'resource-loading') runtimeErrors.push(error);
  });

  const dom = new JSDOM(html, {
    url: `${SITE_ORIGIN}/${query}`,
    runScripts: 'dangerously',
    resources: new LocalScriptLoader(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      clock = makeClock(window);
      if (denyLocalStorage) {
        const storage = window.localStorage;
        const denied = () => {
          throw new window.DOMException('localStorage denied', 'SecurityError');
        };
        Object.defineProperties(storage, {
          getItem: {
            configurable: true,
            value(key) {
              // Keep the vendored tracker isolated; homepage crew persistence is denied.
              return key === 'skipgc' ? null : denied();
            },
          },
          setItem: { configurable: true, value: denied },
          removeItem: { configurable: true, value: denied },
        });
      } else if (initialCrew) {
        window.localStorage.setItem('crew', '1');
      }
      window.matchMedia = () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      });
      window.requestAnimationFrame = (callback) => window.setTimeout(callback, 16);
      window.cancelAnimationFrame = (id) => window.clearTimeout(id);
      window.navigator.sendBeacon = () => true;
      window.fetch = async (input, init = {}) => {
        const url = new URL(String(input), window.location.href);
        const request = { url, init };
        requests.push(request);

        if (url.origin === SITE_ORIGIN && url.pathname.endsWith('/latest.json')) {
          if (latest instanceof Error) throw latest;
          return jsonResponse(latest);
        }
        if (url.origin === SITE_ORIGIN && url.pathname.endsWith('/stats.json')) {
          if (stats instanceof Error) throw stats;
          return jsonResponse(stats);
        }
        if (url.hostname === 'a.klaviyo.com') {
          if (!signupDeferred) return jsonResponse({}, signupStatus);
          return new Promise((resolve) => signupResolvers.push(() => resolve(jsonResponse({}, signupStatus))));
        }

        throw new Error(`Unexpected network request in homepage test: ${url.href}`);
      };
    },
  });

  openWindows.add(dom.window);
  await new Promise((resolve, reject) => {
    if (dom.window.document.readyState === 'complete') return resolve();
    const timeout = setTimeout(() => reject(new Error('homepage load timed out')), 3000);
    dom.window.addEventListener('load', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  await settle();

  assert.deepEqual(runtimeErrors, [], 'homepage scripts should execute without runtime errors');
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    requests,
    clock,
    resolveSignups() {
      for (const resolve of signupResolvers.splice(0)) resolve();
    },
  };
}

function submit(window, form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

function signupRequests(requests) {
  return requests.filter(({ url }) => url.hostname === 'a.klaviyo.com');
}

function assertStatsHidden(document) {
  const stats = [...document.querySelectorAll('[id^="st-"]')];
  assert.ok(stats.length > 0, 'fixture should contain stat surfaces');
  for (const stat of stats) {
    assert.notEqual(stat.style.display, 'block', `#${stat.id} should stay hidden`);
    assert.equal(stat.textContent.trim(), '', `#${stat.id} should not expose stale data`);
  }
}

test('a first-time visitor sees analytics choices without loading optional trackers', async () => {
  const { document, window } = await loadHomepage();
  assert.equal(typeof window.dezAnalytics?.getConsent, 'function');
  assert.equal(window.dezAnalytics.getConsent(), 'unset');
  assert.ok(document.querySelector('footer [data-analytics-settings]'));
  assert.equal(document.querySelectorAll('script[src*="clarity.ms"],script[src*="googletagmanager.com"]').length, 0);
});

test('only an accepted signup emits the safe analytics outcome', async () => {
  const { document, window } = await loadHomepage();
  const outcomes = [];
  window.dezAnalytics = { track: (...args) => outcomes.push(args) };
  document.querySelector('#gemail').value = 'fan@example.com';
  submit(window, document.querySelector('#grabform'));
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(outcomes)), [['signup_accepted', {form_id: 'grabform'}]]);
  assert.ok(document.querySelector('.signup-box[data-clarity-mask]'));
});

test('a failed signup never emits a successful analytics outcome', async () => {
  const { document, window } = await loadHomepage({signupStatus: 500});
  const outcomes = [];
  window.dezAnalytics = { track: (...args) => outcomes.push(args) };
  document.querySelector('#gemail').value = 'fan@example.com';
  submit(window, document.querySelector('#grabform'));
  await settle();
  assert.deepEqual(outcomes, []);
});

test('the WHAT I DO image description identifies its saved front-print placement', async () => {
  // Catches assistive text describing this front-print product as a back-print tee.
  const { document } = await loadHomepage();
  const description = document.querySelector('#merchcard img').alt;
  assert.match(description, /ivory/i);
  assert.match(description, /front print/i);
  assert.doesNotMatch(description, /back print/i);
});

test('the collection description does not promise every tee has a blank front', async () => {
  // Catches a collection-wide claim contradicted by the WHAT I DO front-print product.
  const { document } = await loadHomepage();
  const description = document.querySelector('.collection-note').textContent;
  assert.match(description, /one bold front/i);
  assert.match(description, /four loud backs/i);
  assert.doesNotMatch(description, /blank fronts[.!]?\s*loud backs/i);
});

test('all five product cards show a real image and retain their Fourthwall product destination', async () => {
  // Catches a product card losing its visual or being redirected to a generic/wrong store page.
  const { document } = await loadHomepage();

  for (const [id, expectedPath] of Object.entries(PRODUCT_DESTINATIONS)) {
    const card = document.getElementById(id);
    assert.ok(card, `missing #${id}`);

    const destination = new URL(card.href);
    assert.equal(destination.protocol, 'https:', `#${id} should use HTTPS`);
    assert.equal(destination.hostname, 'dez2fly-shop.fourthwall.com', `#${id} should remain on Fourthwall`);
    assert.equal(destination.pathname, expectedPath, `#${id} should retain its original product URL`);

    const image = card.querySelector('img');
    assert.ok(image, `#${id} should contain its product image`);
    const source = image.getAttribute('src')?.trim();
    assert.ok(source, `#${id} image should have a nonempty source`);

    const imageUrl = new URL(source, SITE_ORIGIN);
    assert.ok(['http:', 'https:'].includes(imageUrl.protocol), `#${id} image should use a browser-loadable URL`);
    if (imageUrl.origin === SITE_ORIGIN) {
      assert.ok(fs.existsSync(path.join(SITE_ROOT, imageUrl.pathname)), `#${id} local image should exist on disk`);
    }
  }
});

test('the homepage does not open an email popup merely because 13 seconds elapsed', async () => {
  // Catches reintroducing the dwell timer that interrupts an otherwise idle visitor.
  const { clock, document } = await loadHomepage();
  const sheet = document.getElementById('sheet');

  assert.ok(!sheet || sheet.getAttribute('aria-hidden') !== 'false');
  clock.advance(13_000);

  assert.ok(!sheet || sheet.getAttribute('aria-hidden') !== 'false');
  assert.ok(!sheet || !sheet.classList.contains('on'));
});

test('the latest-video link remains usable when latest.json cannot be fetched', async () => {
  // Catches a transient JSON failure turning the latest-video surface into a hidden or dead link.
  const { document } = await loadHomepage({ latest: new Error('offline') });
  const latest = document.getElementById('latest');
  const destination = new URL(latest.href, SITE_ORIGIN);

  assert.notEqual(latest.style.display, 'none');
  assert.match(destination.hostname, /(^|\.)youtu(?:be\.com|\.be)$/);
  assert.notEqual(destination.hash, '#');
  assert.ok(document.getElementById('lthumb').getAttribute('src')?.trim());
  assert.ok(document.getElementById('ltitle').textContent.trim());
});

test('malformed latest-video data is ignored without injecting it into the fallback', async () => {
  // Catches untrusted JSON replacing the safe fallback with an executable thumbnail or invalid video ID.
  const marker = 'latest-payload-marker';
  const { document } = await loadHomepage({
    latest: {
      id: `bad\"><img id=${marker}>`,
      title: `<img id="${marker}">`,
      thumb: `javascript:document.body.id='${marker}'`,
      url: `javascript:document.body.id='${marker}'`,
    },
  });
  const latest = document.getElementById('latest');
  const destination = new URL(latest.href, SITE_ORIGIN);
  const thumbnail = new URL(document.getElementById('lthumb').src, SITE_ORIGIN);

  assert.match(destination.hostname, /(^|\.)youtu(?:be\.com|\.be)$/);
  if (destination.hostname.endsWith('youtube.com')) {
    assert.match(destination.searchParams.get('v') || '', /^[A-Za-z0-9_-]{11}$/);
  }
  assert.notEqual(thumbnail.protocol, 'javascript:');
  assert.equal(document.getElementById(marker), null);
  assert.doesNotMatch(document.documentElement.outerHTML, new RegExp(marker));
});

test('modified clicks on the latest video retain native link behavior', async (t) => {
  // Catches the inline-player handler hijacking Ctrl-click or Command-click navigation.
  for (const modifier of ['ctrlKey', 'metaKey']) {
    await t.test(modifier, async () => {
      const { document, window } = await loadHomepage();
      const latest = document.getElementById('latest');
      const click = new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        [modifier]: true,
      });

      const wasNotCanceled = latest.dispatchEvent(click);

      assert.equal(wasNotCanceled, true, `${modifier} click should not be canceled`);
      assert.equal(click.defaultPrevented, false, `${modifier} click should retain native navigation`);
      assert.equal(latest.querySelector('iframe'), null, `${modifier} click should not create an inline player`);
    });
  }
});

test('an invalid email is rejected without attempting a subscription', async () => {
  // Catches validation falling through to the external signup request.
  const { document, requests, window } = await loadHomepage();
  document.getElementById('gemail').value = 'not-an-email';

  submit(window, document.getElementById('grabform'));
  await settle();

  assert.equal(signupRequests(requests).length, 0);
  assert.ok(document.getElementById('gmsg').classList.contains('err'));
});

test('a likely provider typo is suggested before any subscription is attempted', async () => {
  // Catches common-domain typo protection being bypassed or losing its actionable correction.
  const { document, requests, window } = await loadHomepage();
  document.getElementById('gemail').value = 'crew@gmai.com';

  submit(window, document.getElementById('grabform'));
  await settle();

  assert.equal(signupRequests(requests).length, 0);
  assert.match(document.getElementById('gsug').textContent, /crew@gmail\.com/i);
  assert.ok(document.getElementById('gsug').classList.contains('on'));
});

test('a successful signup stores crew status and replaces the form with confirmation', async () => {
  // Catches success being shown without persisting crew state or retiring the completed form.
  const { document, requests, window } = await loadHomepage();
  const form = document.getElementById('grabform');
  document.getElementById('gemail').value = 'crew@example.com';

  submit(window, form);
  await settle();

  assert.equal(signupRequests(requests).length, 1);
  assert.equal(window.localStorage.getItem('crew'), '1');
  assert.equal(form.style.display, 'none');
  assert.ok(document.getElementById('gmsg').classList.contains('ok'));
});

test('a failed signup re-enables the submit button for another attempt', async () => {
  // Catches a rejected external request leaving the signup form permanently disabled.
  const { document, requests, window } = await loadHomepage({ signupStatus: 503 });
  const button = document.getElementById('gbtn');
  document.getElementById('gemail').value = 'crew@example.com';

  submit(window, document.getElementById('grabform'));
  await settle();

  assert.equal(signupRequests(requests).length, 1);
  assert.equal(button.disabled, false);
  assert.ok(button.textContent.trim(), 'retry button should retain an accessible label');
  assert.ok(document.getElementById('gmsg').classList.contains('err'));
});

test('denied localStorage access does not disable email signup', async () => {
  // Catches an optional persistence failure being treated as a failed subscription.
  const { document, requests, window } = await loadHomepage({ denyLocalStorage: true });
  const form = document.getElementById('grabform');
  document.getElementById('gemail').value = 'crew@example.com';

  submit(window, form);
  await settle();

  assert.equal(signupRequests(requests).length, 1);
  assert.equal(window.__signed, 1);
  assert.equal(form.style.display, 'none');
  assert.ok(document.getElementById('gmsg').classList.contains('ok'));
});

test('an analytics exception cannot turn an accepted signup into an error', async () => {
  // Catches optional tracking running inside the subscription promise chain and corrupting success UI.
  const { document, requests, window } = await loadHomepage();
  let trackerCalls = 0;
  window.goatcounter.count = () => {
    trackerCalls += 1;
    if (trackerCalls === 1) throw new Error('tracker unavailable');
  };
  const form = document.getElementById('grabform');
  document.getElementById('gemail').value = 'crew@example.com';

  submit(window, form);
  await settle();

  assert.equal(signupRequests(requests).length, 1);
  assert.equal(window.__signed, 1);
  assert.equal(form.style.display, 'none');
  assert.ok(document.getElementById('gmsg').classList.contains('ok'));
});

test('a returning crew member vault click remains visible to analytics', async () => {
  // Catches dynamically rendered post-signup links missing the page's outbound tracking listener.
  const { document, window } = await loadHomepage({ query: '?s=qr', initialCrew: true });
  const tracked = [];
  window.goatcounter.count = (event) => tracked.push(event);
  const vaultLink = [...document.getElementById('gmsg').querySelectorAll('a')]
    .find((anchor) => new URL(anchor.href).pathname === '/vault.html');

  vaultLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.ok(
    tracked.some((event) => event.event === true && event.path === 'crewswap-click--qr'),
    'returning-member vault click should emit a source-attributed event',
  );
});

test('duplicate submissions while a signup is pending send only one request', async () => {
  // Catches repeated submit events racing duplicate subscriptions while the first request is unresolved.
  const { document, requests, resolveSignups, window } = await loadHomepage({ signupDeferred: true });
  const form = document.getElementById('grabform');
  document.getElementById('gemail').value = 'crew@example.com';

  submit(window, form);
  submit(window, form);

  assert.equal(signupRequests(requests).length, 1);
  resolveSignups();
  await settle();
});

test('source tags are sanitized before they reach signup data or outbound routing', async () => {
  // Catches query-string markup or analytics garbage being reflected into payloads and links.
  const { document, requests, window } = await loadHomepage({
    query: '?s=live%22%3E%3Cimg%20src=x%20onerror=alert(1)%3E',
  });
  const source = window.__src;

  assert.match(source, /^[A-Za-z0-9_-]{1,24}$/);
  document.getElementById('gemail').value = 'crew@example.com';
  submit(window, document.getElementById('grabform'));
  await settle();

  const [signup] = signupRequests(requests);
  const body = JSON.parse(signup.init.body);
  const attributes = body.data.attributes;
  assert.ok(attributes.custom_source.includes(source));
  assert.equal(attributes.profile.data.attributes.properties['Signup Source'], `biolink_${source}`);

  const vault = new URL(document.getElementById('vaultcard').href);
  assert.equal(vault.searchParams.get('s'), source);
});

test('vault-return visitors are routed to the inline signup before other offers', async () => {
  // Catches the vaultback deep link losing its direct route to the free signup surface.
  const { document, window } = await loadHomepage({ query: '?s=vaultback' });
  const grab = document.getElementById('grab');
  const membership = document.getElementById('ytmemcard');
  const bannerDestination = new URL(document.getElementById('banner').href);

  assert.equal(window.__src, 'vaultback');
  assert.equal(bannerDestination.origin, SITE_ORIGIN);
  assert.equal(bannerDestination.hash, '#grab');
  assert.ok(
    grab.compareDocumentPosition(membership) & window.Node.DOCUMENT_POSITION_FOLLOWING,
    'vaultback should put the inline signup before the membership offer',
  );
});

test('vault-return routing keeps the inline signup available to a stored crew member', async () => {
  // Catches returning-crew state overriding the vaultback variant's deliberate free-clip route.
  const { document } = await loadHomepage({ query: '?s=vaultback', initialCrew: true });

  assert.notEqual(document.getElementById('grabform').style.display, 'none');
  assert.equal(document.getElementById('banner').hidden, false);
  assert.equal(new URL(document.getElementById('banner').href).hash, '#grab');
});

test('same-origin homepage links retain the active source tag', async () => {
  // Catches a tagged visitor being reclassified after using the redesign's new home/brand links.
  const { document } = await loadHomepage({ query: '?s=qr' });
  const homepageLinks = [...document.querySelectorAll('a[href]')]
    .map((anchor) => new URL(anchor.href))
    .filter((url) => url.origin === SITE_ORIGIN && url.pathname === '/' && !url.hash);

  assert.ok(homepageLinks.length >= 2, 'fixture should contain both redesigned brand links');
  for (const link of homepageLinks) assert.equal(link.searchParams.get('s'), 'qr');
});

test('the main-channel click retains its historical source-attributed analytics path', async () => {
  // Catches a redesign-only label change splitting the conversion series used by existing reports.
  const { document, window } = await loadHomepage({ query: '?s=qr' });
  const tracked = [];
  window.goatcounter.count = (event) => tracked.push(event);
  const mainChannel = document.querySelector('a[href*="youtube.com/@Dez2fly?"][href*="sub_confirmation=1"]');

  mainChannel.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.ok(
    tracked.some((event) => event.event === true && event.path === 'click-youtube-main-channel--qr'),
    'main-channel click should stay in the existing GoatCounter conversion series',
  );
});

test('normal signup confirmation keeps a source-aware route into the vault', async () => {
  // Catches signup success becoming a dead end or dropping attribution on the next step.
  const { document, window } = await loadHomepage({ query: '?s=qr' });
  document.getElementById('gemail').value = 'crew@example.com';

  submit(window, document.getElementById('grabform'));
  await settle();

  const vaultLink = [...document.getElementById('gmsg').querySelectorAll('a')]
    .map((anchor) => new URL(anchor.href))
    .find((url) => url.pathname === '/vault.html');
  assert.ok(vaultLink, 'success confirmation should offer a next step into the vault');
  assert.equal(vaultLink.searchParams.get('s'), 'qr');
});

test('stats older than eight days stay hidden', async () => {
  // Catches stale audience numbers being presented as current social proof.
  const updated = new Date(Date.now() - (8 * 86_400_000) - 60_000).toISOString();
  const { document } = await loadHomepage({
    stats: {
      updated,
      yt_subs: '999K',
      vault_members: 999,
      discord_members: 999,
      list_count: 999,
      slots_left: 1,
      slots_cap: 5,
      joined_7d: 99,
    },
  });

  assertStatsHidden(document);
});

test('stats with a malformed update timestamp stay hidden', async () => {
  // Catches malformed freshness metadata accidentally bypassing the staleness gate.
  const { document } = await loadHomepage({
    stats: {
      updated: 'definitely-not-a-date',
      yt_subs: '999K',
      vault_members: 999,
      discord_members: 999,
      list_count: 999,
      slots_left: 1,
      slots_cap: 5,
      joined_7d: 99,
    },
  });

  assertStatsHidden(document);
});

test('supported deep-link and integration IDs remain available after redesign', async () => {
  // Catches visual restructuring that silently breaks existing links and script integrations.
  const { document } = await loadHomepage();

  for (const id of REQUIRED_DEEP_LINK_IDS) {
    assert.ok(document.getElementById(id), `missing supported #${id}`);
  }
  assert.equal(document.getElementById('latest').tagName, 'A');
});
