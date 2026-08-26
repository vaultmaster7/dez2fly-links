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
`ORDERS.qr = ORDERS.live` (QR visitors get the stream-viewer card order).
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
