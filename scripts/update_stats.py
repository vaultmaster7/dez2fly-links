#!/usr/bin/env python3
"""Refresh stats.json — real social-proof numbers for 2flycrew.co.

Sources: YouTube watch page (subs), Patreon public campaign API (paid members),
Discord invite API (member count), Klaviyo private API (list size + 7-day
joins). The Klaviyo key is read from a file OUTSIDE the repo and only rounded
aggregate counts are written — no key or profile data ever touches stats.json.

Failure policy:
- Slow-moving counts (subs, vault, discord members) keep their old value if a
  source fails — a day-old member count is still true.
- Time-sensitive fields (joined_7d) are DROPPED on failure — the page must
  never claim "joined this week" from stale data.
- `updated` is stamped only when at least one source succeeded, and the file
  is rewritten at most once per ~24h when nothing changed, so the public git
  history doesn't become a 6-hourly metrics feed.
- Public values are rounded (list to 100s, joins to 10s, capped) so the page
  converts the same without publishing exact private numbers, and so junk
  signups from the open subscribe endpoint can't inflate the display much.
"""
import json, re, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
STATS = REPO / "stats.json"
KLAVIYO_ENV = Path.home() / ".claude/secrets/klaviyo.env"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36", "Accept-Language": "en-US"}
JOIN_CAP = 500  # display cap for weekly joins — bounds junk-signup inflation

def get(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")

def fmt(n):
    if n >= 999_500: return f"{n/1_000_000:.1f}".rstrip("0").rstrip(".") + "M"
    if n >= 1_000: return f"{n/1_000:.0f}K"
    return str(n)

stats = {}
if STATS.exists():
    try: stats = json.loads(STATS.read_text())
    except Exception: stats = {}
old = dict(stats)
ok = 0

# --- YouTube subs (scrape watch page of the latest video) ---
try:
    vid = json.loads((REPO / "latest.json").read_text())["id"]
    page = get(f"https://www.youtube.com/watch?v={vid}")
    m = re.search(r'"label":"([\d.,]+)\s*(thousand|million)?\s*subscribers"', page)
    if m:
        n = float(m.group(1).replace(",", ""))
        n = int(n * {"thousand": 1_000, "million": 1_000_000}.get(m.group(2), 1))
        stats["yt_subs_n"] = n
        stats["yt_subs"] = fmt(n)
        ok += 1
    else:
        print("yt_subs: page fetched but regex found no match — markup changed?", file=sys.stderr)
except Exception as e:
    print(f"yt_subs failed, keeping old: {e}", file=sys.stderr)

# --- Patreon paid members (public campaign endpoint) ---
try:
    d = json.loads(get("https://www.patreon.com/api/campaigns/2952390?fields%5Bcampaign%5D=paid_member_count"))
    stats["vault_members"] = int(d["data"]["attributes"]["paid_member_count"])
    ok += 1
except Exception as e:
    print(f"vault_members failed, keeping old: {e}", file=sys.stderr)

# --- Discord member count (permanent invite) ---
try:
    d = json.loads(get("https://discord.com/api/v10/invites/htTStDYfBN?with_counts=true"))
    stats["discord_members"] = int(d["approximate_member_count"])
    ok += 1
except Exception as e:
    print(f"discord failed, keeping old: {e}", file=sys.stderr)

# --- Klaviyo: list size + joins in last 7 days ---
try:
    key = next(l.split("=", 1)[1].strip() for l in KLAVIYO_ENV.read_text().splitlines()
               if l.startswith("KLAVIYO_API_KEY"))
    kh = {"Authorization": f"Klaviyo-API-Key {key}", "revision": "2024-10-15"}
    d = json.loads(get("https://a.klaviyo.com/api/lists/XA6qcE/?additional-fields[list]=profile_count", kh))
    stats["list_count"] = int(d["data"]["attributes"]["profile_count"]) // 100 * 100

    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"https://a.klaviyo.com/api/lists/XA6qcE/profiles/"
           f"?filter=greater-than(joined_group_at,{since})&fields[profile]=joined_group_at&page[size]=100")
    joined, pages = 0, 0
    while url and pages < 25:
        d = json.loads(get(url, kh))
        joined += len(d["data"])
        url = d.get("links", {}).get("next")
        pages += 1
    prev = old.get("joined_7d") or 0
    if prev and joined > max(prev * 3, prev + 100):
        print(f"joined_7d spike guard: {joined} vs prev {prev} — keeping prev (junk signups?)", file=sys.stderr)
        joined = prev
    stats["joined_7d"] = min(joined, JOIN_CAP) // 10 * 10
    ok += 1
except Exception as e:
    stats.pop("joined_7d", None)  # time-sensitive: never serve stale
    print(f"klaviyo failed, dropping joined_7d: {e}", file=sys.stderr)

stats.pop("discord_online", None)  # no longer published: 6h-stale presence reads as fake

if ok == 0:
    print("all sources failed — leaving stats.json untouched", file=sys.stderr)
    sys.exit(1)

data_changed = {k: v for k, v in stats.items() if k != "updated"} != {k: v for k, v in old.items() if k != "updated"}
try:
    last = datetime.strptime(old.get("updated", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    heartbeat_due = datetime.now(timezone.utc) - last > timedelta(hours=24)
except Exception:
    heartbeat_due = True

if data_changed or heartbeat_due:
    stats["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    STATS.write_text(json.dumps(stats, indent=1) + "\n")
    print("stats.json:", json.dumps(stats))
else:
    print("no data change, heartbeat not due — not rewriting")
