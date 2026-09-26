const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../join/index.html'), 'utf8');
// Copied from the actual YouTube Membership tab, not transcribed from an image.
// The second character is capital I; lowercase l opens an unavailable video.
const video = 'https://www.youtube.com/watch?v=9I-gcClYl5c';

function runRoute(search, trackerAvailable) {
  const dom = new JSDOM(html, { url: 'https://dez2fly.com/join/' + search });
  const redirects = [], counts = [], timers = [];
  const location = { search, replace: url => redirects.push(url) };
  const sandbox = {
    location, document: dom.window.document, URLSearchParams,
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const script of dom.window.document.querySelectorAll('script')) {
    if (script.hasAttribute('src')) {
      if (trackerAvailable) sandbox.goatcounter.count = event => counts.push(event);
    } else vm.runInContext(script.textContent, context);
  }
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  let elapsed = 0, iterations = 0;
  while (timers.length) {
    assert.ok(iterations++ < 30, 'the redirect must not wait indefinitely for tracking');
    const timer = timers.shift();
    elapsed += timer.delay;
    timer.callback();
  }
  const fallback = dom.window.document.getElementById('go').href;
  dom.window.close();
  return { redirects, counts, elapsed, fallback };
}

test('compilation QR reaches the verified member video and preserves source tracking', () => {
  const result = runRoute('?s=comp_sep26_qr', true);
  assert.deepEqual(result.redirects, [video]);
  assert.equal(result.fallback, video);
  assert.equal(result.counts.length, 1);
  assert.equal(result.counts[0].path, '/visit-join-comp_sep26_qr');
  assert.equal(result.elapsed, 250);
});

test('a missing tracker cannot prevent handoff to the verified member video', () => {
  const result = runRoute('?s=comp_sep26_qr', false);
  assert.deepEqual(result.redirects, [video]);
  assert.equal(result.counts.length, 0);
  assert.equal(result.elapsed, 2400);
});

test('no-JavaScript fallback opens the same case-sensitive video URL', () => {
  const dom = new JSDOM(html, { url: 'https://dez2fly.com/join/' });
  try {
    const fallback = dom.window.document.getElementById('go');
    assert.equal(fallback.href, video);
    assert.ok(fallback.textContent.trim());
  } finally { dom.window.close(); }
});
