/* Optional analytics. No Google or Microsoft code is fetched before permission. */
(function () {
  'use strict';
  if (window.dezAnalytics) return;

  var GA_ID = 'G-034DJN5ZKD';
  var CLARITY_ID = 'xmwqq5ne67';
  var STORAGE_KEY = 'dez2fly.analytics-consent.v1';
  var CONSENT_AGE = 180 * 864e5;
  var current = readConsent();
  var loaded = false;
  var stopped = false;
  var ephemeralGrant = false;
  var expiryTimer, observer;
  var panel, settings;
  var entrySources = ['qr', 'chat', 'live', 'ig', 'tt', 'yt', 'fb', 'dc', 'email',
    'direct', 'other', 'vaultback', 'codex_qa', 'ig_bio', 'igskits_bio', 'tt_bio', 'yt_bio', 'tv'];
  var qa = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ||
    new URLSearchParams(location.search).get('s') === 'codex_qa';
  var linkIds = ['latest', 'video-open', 'merchcard', 'weirdturncard', 'fathergodcard',
    'stopplayingcard', 'heysportcard', 'vaultcard', 'ytmemcard', 'discordcard', 'banner',
    'youtube-main-channel', 'live-network', 'dez2fly-animated', 'shop-all', 'shop-bottom',
    'nav-home', 'nav-watch', 'nav-shop', 'nav-crew', 'hero-watch', 'hero-shop', 'free-youtube',
    'tiktok', 'instagram', 'instagram-skits', 'footer-home', 'business-contact', 'privacy', 'back-top',
    'vault-teaser', 'vault-free', 'vault-paid', 'vault-membership'];
  var sectionIds = ['watch', 'latest', 'shop', 'grab', 'vault', 'crew', 'membership', 'discord', 'bottom'];

  function denialCookiePresent() {
    try { return /(^|;\s*)dez_analytics_denied=1(;|$)/.test(document.cookie); }
    catch (error) { return false; }
  }

  function readConsent() {
    try {
      if (denialCookiePresent()) {
        return { choice: 'denied', expiresAt: Date.now() + CONSENT_AGE };
      }
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (saved && (saved.choice === 'granted' || saved.choice === 'denied') &&
          typeof saved.expiresAt === 'number' && saved.expiresAt > Date.now() &&
          saved.expiresAt <= Date.now() + CONSENT_AGE) return saved;
    } catch (error) {}
    return { choice: 'unset', expiresAt: 0 };
  }

  function google() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function consentValues(choice) {
    return {
      analytics_storage: choice,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    };
  }

  function loadScript(src) {
    var script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  function entrySource() {
    var source = new URLSearchParams(location.search).get('s');
    if (source) return entrySources.indexOf(source) >= 0 ? source : 'other';
    if (!document.referrer) return 'direct';
    try {
      var hostname = new URL(document.referrer).hostname;
      if (/(^|\.)(youtube\.com|youtu\.be)$/.test(hostname)) return 'yt';
      if (/(^|\.)instagram\.com$/.test(hostname)) return 'ig';
      if (/(^|\.)tiktok\.com$/.test(hostname)) return 'tt';
      if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(hostname)) return 'fb';
      if (/(^|\.)(discord\.com|discord\.gg)$/.test(hostname)) return 'dc';
    } catch (error) {}
    return 'other';
  }

  function context() {
    var values = { page_location: location.origin + location.pathname, page_title: 'Dez2fly',
      page_referrer: '', entry_source: entrySource() };
    try { values.page_referrer = new URL(document.referrer).origin; } catch (error) {}
    if (qa) { values.debug_mode = true; values.qa_traffic = true; }
    return values;
  }

  // Clarity reads the browser URL itself. Skip it where that URL could carry user data.
  // An unfamiliar campaign loses a recording; it never widens the accepted data set.
  function safeRecordingURL(raw) {
    if (!raw) return true;
    try {
      var url = new URL(raw);
      if (['/', '/index.html', '/privacy.html', '/vault.html', '/video.html', '/ask.html', '/tv', '/tv/', '/tv/index.html'].indexOf(url.pathname) < 0) return false;
      if (url.hash && !/^#(main|watch|latest|shop|crew|grab|top)$/.test(url.hash)) return false;
      var safe = true;
      url.searchParams.forEach(function (value, key) {
        if (key === 's') safe = safe && entrySources.indexOf(value) >= 0;
        else if (key === 'utm_source') safe = safe && (value === 'biolink' ||
          entrySources.indexOf(value.replace(/^biolink_/, '')) >= 0);
        else if (key === 'utm_medium') safe = safe && ['link', 'social', 'email', 'bio'].indexOf(value) >= 0;
        else if (key === 'utm_campaign') safe = safe && ['collection', 'stream', 'whatido_drop',
          'weirdturn_drop', 'fathergod_drop', 'stopplaying_drop', 'heysport_drop'].indexOf(value) >= 0;
        else if (key === 'utm_content') safe = safe && linkIds.indexOf(value) >= 0;
        else if (key === 'v') safe = safe && /^[A-Za-z0-9_-]{11}$/.test(value);
        else if (key === '_gl') safe = safe && /^\d\*[A-Za-z0-9*_.-]{1,510}$/.test(value);
        else safe = false;
      });
      return safe;
    } catch (error) { return false; }
  }

  function track(name, values) {
    checkConsent();
    if (current.choice !== 'granted' || !loaded || stopped) return false;
    values = values || {};
    var params = context();
    if (name === 'signup_accepted' && values.form_id === 'grabform') params.form_id = 'grabform';
    else if (name === 'navigation_click' && linkIds.indexOf(values.link_id) >= 0) params.link_id = values.link_id;
    else if (name === 'section_view' && sectionIds.indexOf(values.section_id) >= 0) params.section_id = values.section_id;
    else return false;
    google('event', name, params);
    return true;
  }

  function clearVendorCookies() {
    try {
      var domains = ['', location.hostname, '.' + location.hostname];
      if (/(^|\.)dez2fly\.com$/.test(location.hostname)) domains.push('dez2fly.com', '.dez2fly.com');
      var paths = ['/'];
      var pieces = location.pathname.split('/');
      for (var index = 1; index < pieces.length; index++) paths.push(pieces.slice(0, index + 1).join('/'));
      document.cookie.split(';').forEach(function (cookie) {
        var name = cookie.split('=')[0].trim();
        if (!/^(_ga(?:_|$)|_clck$|_clsk$)/.test(name)) return;
        paths.forEach(function (path) {
          domains.forEach(function (domain) {
            document.cookie = name + '=; Max-Age=0; Path=' + path +
              (domain ? '; Domain=' + domain : '') + '; SameSite=Lax';
          });
        });
      });
    } catch (error) {}
  }

  function stop() {
    window['ga-disable-' + GA_ID] = true;
    clearTimeout(expiryTimer);
    if (observer) observer.disconnect();
    clearVendorCookies();
    if (!loaded || stopped) return;
    stopped = true;
    try { google('consent', 'update', consentValues('denied')); } catch (error) {}
    try {
      if (window.clarity) window.clarity('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
    } catch (error) {}
    // SDKs can retain timers after consent updates. Reload into the denied state.
    location.reload();
  }

  function checkConsent() {
    if (current.choice === 'granted' && !ephemeralGrant && denialCookiePresent()) {
      current = { choice: 'denied', expiresAt: Date.now() + CONSENT_AGE };
      stop();
    } else if (current.choice === 'granted' && current.expiresAt <= Date.now()) {
      current = { choice: 'unset', expiresAt: 0 };
      stop();
      if (panel) panel.hidden = false;
    }
  }

  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (current.choice !== 'granted') return;
    expiryTimer = setTimeout(function () {
      checkConsent();
      if (!stopped) scheduleExpiry();
    }, Math.min(Math.max(0, current.expiresAt - Date.now()), 864e5));
  }

  function observeSections() {
    if (!('IntersectionObserver' in window)) return;
    var seen = {};
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.getAttribute('data-analytics-section');
        if (entry.isIntersecting && !seen[id] && track('section_view', { section_id: id })) {
          seen[id] = true;
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    [['#watch', 'watch'], ['#latest', 'latest'], ['#shop', 'shop'], ['#grab', 'grab'],
      ['#vaultcard', 'vault'], ['#crew', 'crew'], ['#ytmemcard', 'membership'],
      ['#discordcard', 'discord'], ['footer', 'bottom']].forEach(function (pair) {
      var element = document.querySelector(pair[0]);
      if (element) { element.setAttribute('data-analytics-section', pair[1]); observer.observe(element); }
    });
  }

  function start() {
    if (loaded || current.choice !== 'granted') return;
    loaded = true;
    window['ga-disable-' + GA_ID] = false;
    window.gtag = window.gtag || google;
    google('consent', 'default', consentValues('denied'));
    google('consent', 'update', consentValues('granted'));
    google('set', 'linker', {
      domains: ['dez2fly.com', 'dez2fly-shop.fourthwall.com'],
      decorate_forms: false
    });
    google('js', new Date());
    var config = context();
    config.allow_google_signals = false;
    config.allow_ad_personalization_signals = false;
    google('config', GA_ID, config);

    loadScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
    if (safeRecordingURL(location.href) && safeRecordingURL(document.referrer)) {
      window.clarity = window.clarity || function () {
        (window.clarity.q = window.clarity.q || []).push(arguments);
      };
      window.clarity('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' });
      if (qa) window.clarity('set', 'qa_traffic', 'true');
      loadScript('https://www.clarity.ms/tag/' + CLARITY_ID);
    }
    observeSections();
    scheduleExpiry();
  }

  function choose(choice) {
    current = { choice: choice, expiresAt: Date.now() + CONSENT_AGE };
    var saved = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      saved = true;
    } catch (error) {}
    ephemeralGrant = choice === 'granted' && !saved;
    // Essential denial fallback prevents an old grant resurfacing if storage fails.
    try {
      document.cookie = 'dez_analytics_denied=' + (choice === 'denied' || !saved ? '1' : '') +
        '; Path=/; SameSite=Lax; Max-Age=' + (choice === 'denied' || !saved ? CONSENT_AGE / 1000 : 0) +
        (location.protocol === 'https:' ? '; Secure' : '');
    } catch (error) {}
    panel.hidden = true;
    settings.hidden = false;
    settings.setAttribute('aria-expanded', 'false');
    settings.focus({ preventScroll: true });
    if (choice === 'granted') {
      if (stopped) location.reload();
      else { start(); scheduleExpiry(); }
    } else stop();
  }

  function openSettings() {
    if (!panel) return;
    panel.hidden = false;
    settings.setAttribute('aria-expanded', 'true');
    panel.querySelector('[data-analytics-allow]').focus({ preventScroll: true });
  }

  function refreshConsent() {
    // A temporary grant cannot prove continued consent after leaving this context.
    ephemeralGrant = false;
    current = readConsent();
    if (current.choice !== 'granted') stop();
    else if (!loaded) start();
    scheduleExpiry();
    panel.hidden = current.choice !== 'unset';
    settings.setAttribute('aria-expanded', String(!panel.hidden));
  }

  function mount() {
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'analytics-consent';
    panel.className = 'analytics-consent';
    panel.setAttribute('data-analytics-panel', '');
    panel.setAttribute('aria-labelledby', 'analytics-consent-title');
    panel.innerHTML = '<div class="analytics-consent-copy"><h2 id="analytics-consent-title">your analytics choice</h2>' +
      '<p>Google Analytics shows me how this site gets used. Microsoft Clarity adds heatmaps and session recordings. ' +
      'both stay off unless you allow them. advertising consent stays off. change your choice anytime. ' +
      '<a href="/privacy.html">privacy details</a></p></div>' +
      '<div class="analytics-consent-actions"><button type="button" class="analytics-choice" data-analytics-allow>allow analytics</button>' +
      '<button type="button" class="analytics-choice" data-analytics-reject>reject</button></div>';
    panel.hidden = current.choice !== 'unset';
    panel.querySelector('[data-analytics-allow]').addEventListener('click', function () { choose('granted'); });
    panel.querySelector('[data-analytics-reject]').addEventListener('click', function () { choose('denied'); });
    settings = document.querySelector('[data-analytics-settings]');
    if (!settings) {
      settings = document.createElement('button');
      settings.type = 'button';
      settings.className = 'analytics-settings analytics-settings-fallback';
      settings.textContent = 'analytics settings';
      settings.setAttribute('data-analytics-settings', '');
      document.body.appendChild(settings);
    }
    settings.setAttribute('aria-controls', panel.id);
    settings.classList.add('analytics-settings');
    settings.setAttribute('aria-expanded', String(!panel.hidden));
    settings.addEventListener('click', openSettings);
    document.body.appendChild(panel);
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest && event.target.closest('a');
      if (target) track('navigation_click', { link_id: target.dataset.gaTrack || target.dataset.track || target.id });
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      refreshConsent();
    });
    window.addEventListener('pageshow', function (event) {
      // A frozen history entry can miss another tab's withdrawal or an expiry timer.
      if (event.persisted) refreshConsent();
    });
    window.addEventListener('focus', refreshConsent);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshConsent();
      else checkConsent();
    });
    start();
  }

  window.dezAnalytics = {
    track: track,
    openSettings: openSettings,
    getConsent: function () { checkConsent(); return current.choice; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}());
