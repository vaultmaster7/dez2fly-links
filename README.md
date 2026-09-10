# The site — dez2fly.com

**Live domain: `dez2fly.com`** (cut over Aug 26, 2026 — this folder is still named `2flycrew-site` on purpose so every cron/launchd path stays valid).

## Where it lives
| Thing | Where |
|---|---|
| This repo | `vaultmaster7/dez2fly-links` on GitHub → GitHub Pages |
| Domain | `dez2fly.com` at GoDaddy (ns65/66.domaincontrol.com), expires 2029-09-13 |
| DNS | 4x A `@` → 185.199.108/109/110/111.153, `www` CNAME → `vaultmaster7.github.io` |
| HTTPS | GitHub-issued cert, `https_enforced` ON |
| Old domain | `2flycrew.co` → separate repo `vaultmaster7/2flycrew-redirect` (see below) |

## The redirect (do not delete)
`~/claude-projects/2flycrew-redirect/` → repo `vaultmaster7/2flycrew-redirect`, serving `2flycrew.co`.
Both `index.html` and `404.html` run:
```js
location.replace('https://dez2fly.com' + location.pathname + location.search + location.hash)
```
That preserves **paths and `?s=` analytics tags**, so every QR code, pinned comment, and bio link printed with the old domain still lands correctly and still tracks. Deep paths return HTTP 404 status while still redirecting — that's the 404.html trick working as intended, not a bug.
**Kill this only when nothing in the wild points at 2flycrew.co anymore.**

## Pages
`index.html` (hub) · `vault.html` (Patreon funnel) · `video.html` ($49 personal video / $19 ask / $299 call) · `privacy.html`

## Source tags (`?s=`)
Sanitized at the source to `[a-zA-Z0-9_-]`, 24-char cap, on all three pages.
Tag map: **`qr`** = stream overlay QR · **`chat`** = pinned comment · **`live`** = video description · **`ig`/`tt`** = bio links.
The September 10 homepage uses one creator-first section order for regular visitors.
`vaultback` moves the free inline signup to the top and shows a return link.
All source tags still reach product UTMs, internal funnel URLs, signup properties,
and analytics. The old per-card `ORDERS` layout was retired with the approved redesign.
Analytics: GoatCounter `dez2fly.goatcounter.com`. Latest read: `_STRATEGY/DOORS_READ_2026-08-26.md`.

## Data files
- `stats.json` — social proof numbers. `yt_members` is **hand-pulled from YouTube Studio** and staleness-gated (hidden if too old). Refresh ritual in memory: `project-2flycrew-yt-members-ritual`.
- `latest.json` — newest video, auto-refreshed.
- `scripts/cron_update.sh` — refreshes latest + stats every 6h.

## Deploying
`git push origin main` — GitHub Pages rebuilds automatically.
**Note: the `gh` CLI is a dead Intel binary on this Mac.** Git itself works (credential helper `store --file=~/.claude/secrets/git-credentials`). For GitHub API calls, pull the token with:
```bash
printf "protocol=https\nhost=github.com\n\n" | git credential fill
```
run from inside this folder. New repos need that helper configured locally or an askpass shim.

## Style
`DESIGN.md` and `VOICE.md` govern every word and pixel. **Standing rule: no 🔞 / 18+ / NSFW / "uncut" in any YouTube-facing copy** — tease implicitly only.

## Homepage redesign — September 10, 2026
User-approved direction: oversized Dez2fly masthead, latest-video feature, five-shirt
collection, crew destinations, and inline email capture. Native HTML with local
`assets/home.css` and `assets/home.js`; no framework, webfont, bundler, or new
third-party runtime. The old automatic email sheet, sales toasts, coupon promotion,
and unverified first-run deadline were removed. Product URLs/prices, Clarity,
GoatCounter, Klaviyo company/list, and the automated data refresh remain intact.
The personal-video offer remains paused. The Vault/privacy/video/tee routes have
not been redesigned or changed by this release.

The latest-video HTML fallback and social-preview image are a September 10
snapshot. The live player/title continue updating from `latest.json`. When
changing the fallback manually, keep its HTML link/image/title and the initial
`videoId` in `assets/home.js` in sync. Use the current Fourthwall listing image
when updating a product image; do not use an old local design-round mockup.

### Regression checks
Tests run the real HTML and local JavaScript under jsdom, with external tracking
and signup networking intercepted. No test subscribes a real address.

```sh
npm install --prefix /tmp/dez2fly-homepage-test-deps --no-audit --no-fund jsdom@27.0.0
NODE_PATH=/tmp/dez2fly-homepage-test-deps/node_modules node --test scripts/homepage.test.cjs
node --check assets/home.js
git diff --check
```

For a visual preview: `/usr/bin/python3 -m http.server 8765 --bind 127.0.0.1`.
Check 320px, 390px, 768px, and 1440px widths, product images/links, keyboard focus,
video play, and source-aware links. Browser artifacts in `.playwright-cli/` and
`output/playwright/` are intentionally ignored.
