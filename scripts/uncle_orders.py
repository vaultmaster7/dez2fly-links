#!/usr/bin/env python3
"""Poll Stripe for new orders across all three tiers: ping Dez's Telegram,
log to a private CSV, and keep the LIVE video-slots counter truthful.
Runs every 15 min via launchd. slots_left = CAP - paid VIDEO orders since Monday 00:00 ET.
Also writes total_bookings (cumulative all-time paid VIDEO orders) so the site's
"$49 locks at $75 after the first 100 bookings" counter stays real."""
import csv, json, pathlib, subprocess, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PLINKS = {
    "plink_1TtS8SCD0StTUwgOSICDEJSs": "VIDEO $49",
    "plink_1TtUNxCD0StTUwgOjVudnEnw": "QUESTION $19",
    "plink_1TtUNyCD0StTUwgOVRnqdPgN": "CALL $299",
}
VIDEO_PLINK = "plink_1TtS8SCD0StTUwgOSICDEJSs"
CHAT = "5352941556"
CAP = 5
REPO = pathlib.Path.home() / "claude-projects/2flycrew-site"
STATE = pathlib.Path.home() / ".claude/secrets/uncle_orders_seen.json"
LOG = pathlib.Path.home() / "claude-projects/_orders/video_orders.csv"

def secret(path, key):
    for l in (pathlib.Path.home() / ".claude" / path).read_text().splitlines():
        if l.startswith(key):
            return l.split("=", 1)[1].strip()
    raise SystemExit(f"missing {key}")

SKEY = secret("secrets/stripe.env", "STRIPE_RESTRICTED_KEY")
TG = secret("channels/telegram/.env", "TELEGRAM_BOT_TOKEN")
try:
    KLAVIYO = secret("secrets/klaviyo.env", "KLAVIYO_API_KEY")
except SystemExit:
    KLAVIYO = None

def klaviyo_event(email, metric, props):
    """Push a server event to Klaviyo so buyers trigger post-purchase flows + become segmentable."""
    if not KLAVIYO or not email or email == "?":
        return
    body = {"data": {"type": "event", "attributes": {
        "properties": props,
        "metric": {"data": {"type": "metric", "attributes": {"name": metric}}},
        "profile": {"data": {"type": "profile", "attributes": {"email": email}}},
    }}}
    import json as _j
    subprocess.run(["curl", "-s", "-o", "/dev/null", "-X", "POST", "https://a.klaviyo.com/api/events/",
        "-H", f"Authorization: Klaviyo-API-Key {KLAVIYO}", "-H", "revision: 2024-10-15",
        "-H", "Content-Type: application/json", "-d", _j.dumps(body)], capture_output=True)

def fetch_sessions(plink):
    """Every checkout session for a payment link (paginated — Stripe caps a page at 100)."""
    sessions, after = [], None
    while True:
        url = f"https://api.stripe.com/v1/checkout/sessions?payment_link={plink}&limit=100"
        if after:
            url += f"&starting_after={after}"
        d = json.loads(subprocess.run(["curl", "-s", url, "-u", f"{SKEY}:"],
                                      capture_output=True, text=True).stdout)
        if "data" not in d:
            return None, d.get("error", {}).get("message")
        sessions.extend(d["data"])
        if not d.get("has_more") or not d["data"]:
            return sessions, None
        after = d["data"][-1]["id"]

seen = set()
if STATE.exists():
    try: seen = set(json.loads(STATE.read_text()))
    except Exception: pass

now_et = datetime.now(ZoneInfo("America/New_York"))
monday_et = (now_et - timedelta(days=now_et.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
monday_utc_ts = monday_et.astimezone(timezone.utc).timestamp()

LOG.parent.mkdir(parents=True, exist_ok=True)
new_log = not LOG.exists()
new, booked_week, video_total, fail = 0, 0, 0, False
all_paid = []

with LOG.open("a", newline="") as f:
    w = csv.writer(f)
    if new_log:
        w.writerow(["ordered_utc", "tier", "for", "character", "details", "buyer_email", "amount", "status", "session_id"])
    for plink, tier in PLINKS.items():
        sessions, err = fetch_sessions(plink)
        if sessions is None:
            print(f"stripe error ({tier}):", err, file=sys.stderr)
            fail = True
            continue
        paid = [s for s in sessions if s.get("payment_status") == "paid"]
        if plink == VIDEO_PLINK:
            booked_week = sum(1 for s in paid if s.get("created", 0) >= monday_utc_ts)
            video_total = len(paid)  # all-time — drives the $75 lock at 100 bookings
        for s in paid:
            addr = (s.get("customer_details") or {}).get("address") or {}
            all_paid.append((s.get("created", 0), tier, addr.get("state") or ""))
        for s in paid:
            if s["id"] in seen:
                continue
            fields = {fl["key"]: (fl.get("text") or fl.get("dropdown") or {}).get("value", "?") for fl in s.get("custom_fields", [])}
            email = (s.get("customer_details") or {}).get("email", "?")
            amount = (s.get("amount_total") or 0) / 100
            when = datetime.fromtimestamp(s.get("created", 0), timezone.utc).strftime("%Y-%m-%d %H:%M")
            if tier.startswith("VIDEO"):
                body = (f"From: {fields.get('character', '?').upper()}\nFor: {fields.get('who', '?')}\n"
                        f"Notes: {fields.get('details', '?')}\n\nDeliver to: {email}\n"
                        f"(reply to their Stripe receipt with the video — 14 business day promise)")
            elif tier.startswith("QUESTION"):
                body = (f"Answered by: {fields.get('who', '?').upper()}\nQuestion: {fields.get('question', '?')}\n\n"
                        f"Reply to: {email}\n(voice note + text, 3 day promise)")
            else:
                body = (f"Topic: {fields.get('topic', '?')}\nTimezone: {fields.get('timezone', '?')}\n\n"
                        f"Email {email} within 48h to schedule the 30-min call")
            msg = f"💰 NEW ORDER — {tier} (${amount:.0f})\n\n{body}"
            r = subprocess.run(["curl", "-s", f"https://api.telegram.org/bot{TG}/sendMessage",
                                "-d", f"chat_id={CHAT}", "--data-urlencode", f"text={msg}"],
                               capture_output=True, text=True)
            if json.loads(r.stdout).get("ok"):
                w.writerow([when, tier, fields.get("who", fields.get("topic", "?")), fields.get("character", fields.get("who", "?")),
                            fields.get("details", fields.get("question", "?")), email, amount, "PENDING", s["id"]])
                seen.add(s["id"])
                new += 1
                metric = {"VIDEO $49": "Ordered Personal Video", "QUESTION $19": "Ordered a Question",
                          "CALL $299": "Booked a Call"}.get(tier, "Ordered Something")
                klaviyo_event(email, metric, {"tier": tier, "amount": amount,
                    "character": fields.get("character", ""), "for": fields.get("who", ""), "$value": amount})

STATE.write_text(json.dumps(sorted(seen)))
if fail:
    raise SystemExit(1)

slots_left = max(0, CAP - booked_week)

TIER_NAMES = {"VIDEO $49": "a personal video", "QUESTION $19": "a question for dez", "CALL $299": "a private call"}
all_paid.sort(key=lambda x: -x[0])
recent = [{"t": TIER_NAMES.get(tr, "an order"), "st": st, "ts": ts} for ts, tr, st in all_paid[:5]]

views_today = video_views_today = None
try:
    gtok = secret("secrets/goatcounter.env", "GOATCOUNTER_TOKEN")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    gv = json.loads(subprocess.run(["curl", "-s",
        f"https://dez2fly.goatcounter.com/api/v0/stats/hits?start={today}&end={today}&limit=60",
        "-H", f"Authorization: Bearer {gtok}"], capture_output=True, text=True).stdout)
    hits = gv.get("hits", [])
    views_today = sum(h.get("count", 0) for h in hits)
    video_views_today = sum(h.get("count", 0) for h in hits if "/video-page" in h.get("path", ""))
except Exception as e:
    print("goatcounter views failed:", e, file=sys.stderr)

stats_path = REPO / "stats.json"
try:
    stats = json.loads(stats_path.read_text())
except Exception:
    stats = {}
new_fields = {"slots_left": slots_left, "booked_week": booked_week, "slots_cap": CAP, "recent": recent,
              "total_bookings": video_total}
if views_today is not None:
    new_fields["views_today"] = views_today
    new_fields["video_views_today"] = video_views_today
if any(stats.get(k) != v for k, v in new_fields.items()):
    stats.update(new_fields)
    stats_path.write_text(json.dumps(stats, indent=1) + "\n")
    subprocess.run(["git", "-C", str(REPO), "pull", "-q", "--rebase", "--autostash", "origin", "main"])
    subprocess.run(["git", "-C", str(REPO), "add", "stats.json"], capture_output=True)
    subprocess.run(["git", "-C", str(REPO), "-c", "user.name=latest-video-bot",
                    "-c", "user.email=vaultmaster7@users.noreply.github.com",
                    "commit", "-q", "-m", "slots: live availability update"], capture_output=True)
    push = subprocess.run(["git", "-C", str(REPO), "push", "-q", "origin", "main"], capture_output=True, text=True)
    print(f"slots updated: {slots_left}/{CAP} left, booked {booked_week}, push {'ok' if push.returncode == 0 else 'FAILED'}")

if slots_left == 0:
    subprocess.run(["curl", "-s", f"https://api.telegram.org/bot{TG}/sendMessage",
                    "-d", f"chat_id={CHAT}", "--data-urlencode",
                    "text=🚨 VIDEO WEEK SOLD OUT — all slots gone. Say the word and I deactivate the buy link until Monday."],
                   capture_output=True)

print(f"announced {new} new orders" if new else "no new orders")
