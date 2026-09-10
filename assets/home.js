/* Dez2fly homepage. Native HTML works before JS; no runtime dependencies. */
(function () {
  'use strict';
  var p = new URLSearchParams(location.search);
  var src = (p.get('s') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  if (!src) {
    var r = (document.referrer || '').toLowerCase();
    src = /tiktok/.test(r) ? 'tt' : /instagram/.test(r) ? 'ig' :
      /facebook|fb\./.test(r) ? 'fb' : /youtube|youtu\.be/.test(r) ? 'yt' :
      /discord/.test(r) ? 'dc' : r ? 'other' : 'direct';
  }
  window.__src = src;
  function gc(event, retry) {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
      // Telemetry is optional. A tracker failure must never fail a signup or navigation.
      try { window.goatcounter.count(event); } catch (e) {}
    } else if ((retry || 0) < 25) {
      setTimeout(function () { gc(event, (retry || 0) + 1); }, 400);
    }
  }
  gc({path: '/visit-' + src, title: 'Visit from ' + src});
  function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storeCrew() { try { localStorage.setItem('crew', '1'); } catch (e) {} }

  var form = document.getElementById('grabform');
  var gemail = document.getElementById('gemail'), gsug = document.getElementById('gsug');
  var msg = document.getElementById('gmsg'), btn = document.getElementById('gbtn');
  var grab = document.getElementById('grab');
  if (src === 'vaultback') {
    document.querySelector('main').prepend(grab);
    var banner = document.getElementById('banner');
    banner.hidden = false;
    document.querySelector('main').before(banner);
    document.getElementById('grabbody').textContent = "not ready for the Vault? start with the free Uncle clip. the door's not going anywhere.";
  }

  document.querySelectorAll('a[href]').forEach(function (a) {
    try {
      var url = new URL(a.href, location.href);
      if (url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'biolink_' + src);
      if (url.origin === location.origin && (/\.html$/.test(url.pathname) || (url.pathname === '/' && !url.hash))) {
        url.searchParams.set('s', src);
      }
      a.href = url.href;
    } catch (e) {}
    a.addEventListener('click', function () {
      var name = (a.dataset.track || a.id || a.getAttribute('aria-label') || a.textContent)
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      gc({path: 'click-' + name + '--' + src, event: true, title: name + ' (' + src + ')'});
    });
  });

  if ('IntersectionObserver' in window) {
    var seen = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var key = entry.target.dataset.seen;
        var wasSeen = false;
        try { wasSeen = sessionStorage.getItem('seen-' + key) === '1'; } catch (e) {}
        if (entry.isIntersecting && !seen[key] && !wasSeen) {
          seen[key] = true;
          try { sessionStorage.setItem('seen-' + key, '1'); } catch (e) {}
          gc({path: 'seen-' + key + '--' + src, event: true});
          observer.unobserve(entry.target);
        }
      });
    }, {threshold: 0.2});
    [['#latest','latest'],['#shop','shop'],['#grab','grab'],['#vaultcard','vault'],
      ['#crew','crew'],['#ytmemcard','membership'],['#discordcard','discord'],['footer','bottom']].forEach(function (pair) {
      var element = document.querySelector(pair[0]);
      if (element) { element.dataset.seen = pair[1]; observer.observe(element); }
    });
  }

  // A usable current-video fallback is rendered in HTML, even offline or without JS.
  var latest = document.getElementById('latest'), thumb = document.getElementById('lthumb');
  var videoId = 'XaYQyAQKSdo';
  function plainClick(e) { return !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0; }
  function play(e) {
    if (!plainClick(e)) return;
    e.preventDefault();
    if (latest.querySelector('iframe')) return;
    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&rel=0';
    frame.title = document.getElementById('ltitle').textContent;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    latest.replaceChildren(frame);
    latest.classList.add('is-playing');
    latest.removeAttribute('href');
    latest.removeAttribute('aria-label');
    frame.focus();
    gc({path: 'latest-play--' + src, event: true});
  }
  latest.addEventListener('click', play);
  document.querySelector('.hero-actions a[href$="#latest"]').addEventListener('click', function (e) {
    if (!plainClick(e)) return;
    e.preventDefault();
    latest.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center'});
    play(e);
  });
  thumb.addEventListener('error', function () {
    var fallback = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
    if (thumb.src !== fallback) thumb.src = fallback;
  });
  fetch('latest.json', {cache: 'no-store'}).then(function (r) { if (!r.ok) throw Error(); return r.json(); }).then(function (v) {
    if (!v || typeof v.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(v.id) || typeof v.title !== 'string' || !v.title.trim()) return;
    if (latest.querySelector('iframe')) return;
    videoId = v.id;
    latest.href = 'https://www.youtube.com/watch?v=' + videoId;
    document.getElementById('video-open').href = latest.href;
    document.getElementById('ltitle').textContent = v.title;
    thumb.alt = v.title;
    thumb.src = 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg';
  }).catch(function () {});

  fetch('stats.json', {cache: 'no-store'}).then(function (r) { if (!r.ok) throw Error(); return r.json(); }).then(function (s) {
    if (!s) return;
    var updated = Date.parse(s.updated || ''), age = Date.now() - updated;
    if (!Number.isFinite(updated) || age < 0 || age > 8 * 864e5) return;
    function count(v) { v = Math.floor(Number(v)); return Number.isFinite(v) && v > 0 ? v : 0; }
    function put(id, text) { var el = document.getElementById(id); if (el && text) { el.textContent = text; el.style.display = 'block'; } }
    if (typeof s.yt_subs === 'string' && /^[\d.]+[KM]?$/.test(s.yt_subs)) put('st-yt', s.yt_subs + ' subscribers on YouTube');
    if (count(s.vault_members)) put('st-vault', count(s.vault_members) + ' members inside');
    if (count(s.discord_members)) put('st-dc', count(s.discord_members) + ' in the server');
    if (count(s.list_count)) put('st-list', count(s.list_count).toLocaleString('en-US') + '+ on the list');
    var memberAge = Date.now() - Date.parse(s.yt_members_updated || '');
    if (count(s.yt_members) && memberAge >= 0 && memberAge <= 21 * 864e5) put('st-ytm', count(s.yt_members) + ' YouTube members');
    else if (count(s.yt_members) && memberAge >= 0 && memberAge <= 45 * 864e5) put('st-ytm', Math.floor(count(s.yt_members) / 10) * 10 + '+ YouTube members');
  }).catch(function () {});

  var RX=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var SUG_TARGETS=['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','gmx.com','protonmail.com','proton.me'];
  var GOOD_DOMAINS=['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','gmx.com','gmx.net','gmx.de',
    'protonmail.com','proton.me','pm.me','mail.com','me.com','mac.com','live.com','msn.com','ymail.com','rocketmail.com',
    'googlemail.com','hey.com','fastmail.com','zoho.com','aim.com','yahoo.ca','yahoo.co.uk','hotmail.ca','hotmail.co.uk',
    'outlook.co.uk','comcast.net','verizon.net','att.net','sbcglobal.net','cox.net','web.de','t-online.de','mail.ru',
    'yandex.com','qq.com','naver.com','163.com'];
  var DISPO=['mailinator','guerrillamail','guerillamail','10minutemail','tempmail','temp-mail','tmpmail','yopmail',
    'sharklasers','grr.la','trashmail','getnada','nada.email','dispostable','maildrop','fakeinbox','mohmal','mintemail',
    'throwawaymail','burnermail','mailnesia','emailondeck','spamgourmet','tempinbox','discard.email','33mail','moakt','tempr.','disposable'];
  var ROLES=['noreply','no-reply','donotreply','do-not-reply','postmaster','mailer-daemon','abuse','spamtrap','webmaster','hostmaster','root','unsubscribe'];
  var editDist=function(a,b){
    var i,j,m=a.length,n=b.length,d=[];
    if(Math.abs(m-n)>2) return 3; // we only care about misses of 2 or less
    for(i=0;i<=m;i++)d[i]=[i];
    for(j=1;j<=n;j++)d[0][j]=j;
    for(i=1;i<=m;i++)for(j=1;j<=n;j++)
      d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return d[m][n];
  };
  var emailCheck=function(email){ // expects lowercased, RX-passing input
    var at=email.indexOf('@'), user=email.slice(0,at), dom=email.slice(at+1);
    if(ROLES.indexOf(user)>-1 || /^no[-_.]?reply/.test(user)) return {ok:false};
    for(var i=0;i<DISPO.length;i++){ if(dom.indexOf(DISPO[i])>-1) return {ok:false}; }
    if(GOOD_DOMAINS.indexOf(dom)>-1) return {ok:true};
    var best=null,bd=3;
    for(var j=0;j<SUG_TARGETS.length;j++){
      var dd=editDist(dom,SUG_TARGETS[j]);
      if(dd>0&&dd<bd){bd=dd;best=SUG_TARGETS[j];}
    }
    return (best&&bd<=2)?{ok:true,suggest:user+'@'+best}:{ok:true};
  };
  var showSug=function(el,sugg,input){
    el.textContent='did you mean ';
    var b=document.createElement('b'); b.textContent=sugg;
    el.appendChild(b); el.appendChild(document.createTextNode('?'));
    el.classList.add('on');
    el.onclick=function(){ input.value=sugg; el.classList.remove('on'); input.focus(); gc({path:'typo-fix--'+src,event:true}); };
  };
  var wireLiveCheck=function(input,sugEl){ // real-time: suggest while they type, never block mid-keystroke
    var t;
    var run=function(){
      var em=input.value.trim().toLowerCase();
      if(!RX.test(em)){sugEl.classList.remove('on');return;}
      var v=emailCheck(em);
      if(v.suggest){
        if(sugEl._last!==v.suggest){sugEl._last=v.suggest;gc({path:'typo-seen--'+src,event:true});}
        showSug(sugEl,v.suggest,input);
      } else sugEl.classList.remove('on');
    };
    input.addEventListener('input',function(){clearTimeout(t);t=setTimeout(run,500);});
    input.addEventListener('blur',run);
  };


  var gateEmail=function(email,warnedHolder,sugEl,input,msgEl){ // shared submit gate; returns true = clear to send
    if(!RX.test(email)){
      msgEl.className='msg err'; msgEl.textContent='that email looks off — check it?';
      input.focus(); gc({path:'signup-invalid--'+src,event:true}); return false;
    }
    var v=emailCheck(email.toLowerCase());
    if(!v.ok){
      msgEl.className='msg err'; msgEl.textContent='use a real inbox so the clip actually reaches you 🪳';
      input.focus(); gc({path:'signup-blocked--'+src,event:true}); return false;
    }
    if(v.suggest && warnedHolder._warned!==email){ // warn once; same value resubmitted = they mean it
      warnedHolder._warned=email;
      showSug(sugEl,v.suggest,input);
      msgEl.className='msg err'; msgEl.textContent="double-check that address — tap the fix below, or send again if it's really yours";
      gc({path:'typo-warn--'+src,event:true}); return false;
    }
    sugEl.classList.remove('on');
    return true;
  };

  wireLiveCheck(gemail, gsug);
  gemail.addEventListener('focus', function () {
    if (!this._tracked) { this._tracked = true; gc({path: 'form-focus--' + src, event: true}); }
  });
  function success(returning) {
    form.style.display = 'none';
    gsug.classList.remove('on');
    msg.className = 'msg ok';
    msg.textContent = returning ? "you're already on the list. the next drop will find you." : "clip's on the way — check your inbox 🪳";
    var link = document.createElement('a');
    link.href = '/vault.html?s=' + src;
    link.textContent = 'take a look inside the Vault';
    link.addEventListener('click', function () {
      gc({path: (returning ? 'crewswap-click' : 'signup-vault-click') + '--' + src, event: true});
    });
    msg.append(document.createElement('br'), link);
    var reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'reset-email'; reset.textContent = 'use a different email';
    reset.addEventListener('click', function () {
      try { localStorage.removeItem('crew'); } catch (e) {}
      window.__signed = 0;
      msg.replaceChildren(); msg.className = 'msg';
      form.style.display = ''; form._warned = null;
      btn.disabled = false; btn.textContent = 'send me the clip ↗';
      gemail.value = ''; gemail.focus();
      gc({path: 'crewswap-reset--' + src, event: true});
    });
    msg.appendChild(reset);
  }
  if (stored('crew') === '1' && src !== 'vaultback') {
    success(true);
    gc({path: 'crewswap-seen--' + src, event: true});
  }
  var pending = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (pending || window.__signed || form.querySelector('.hp').value) return;
    var email = gemail.value.trim().toLowerCase();
    if (!gateEmail(email, form, gsug, gemail, msg)) return;
    pending = true; btn.disabled = true; btn.textContent = 'sending…';
    msg.textContent = ''; msg.className = 'msg';
    var ctrl = new AbortController();
    var timeout = setTimeout(function () { ctrl.abort(); }, 15000);
    fetch('https://a.klaviyo.com/client/subscriptions/?company_id=YcE5u6', {
      method: 'POST', signal: ctrl.signal,
      headers: {'Content-Type': 'application/json', revision: '2024-10-15'},
      body: JSON.stringify({data: {type: 'subscription', attributes: {
        custom_source: 'dez2fly.com (' + src + ')',
        profile: {data: {type: 'profile', attributes: {email: email, properties: {
          'Signup Source': 'biolink_' + src, 'Signup Page': 'dez2fly.com', 'Signup Surface': 'inline'
        }}}}
      }, relationships: {list: {data: {type: 'list', id: 'XA6qcE'}}}}})
    }).then(function (r) {
      if (!r.ok && r.status !== 202) throw Error();
      storeCrew(); window.__signed = 1; success(false);
      gc({path: 'signup--' + src, event: true, title: 'email signup (' + src + ')'});
    }).catch(function () {
      msg.className = 'msg err';
      msg.textContent = "that didn't go through. check your connection and try again.";
      btn.disabled = false; btn.textContent = 'send me the clip ↗';
      gc({path: 'signup-err--' + src, event: true});
    }).finally(function () { clearTimeout(timeout); pending = false; });
  });
})();
