#!/usr/bin/env python3
"""Poll Stripe for new orders across all three tiers: ping Dez's Telegram,
log to a private CSV, and keep the LIVE video-slots counter truthful.
Runs every 15 min via launchd. slots_left = CAP - paid VIDEO orders since Monday 00:00 ET."""
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

seen = set()
if STATE.exists():
    try: seen = set(json.loads(STATE.read_text()))
    except Exception: pass

now_et = datetime.now(ZoneInfo("America/New_York"))
monday_et = (now_et - timedelta(days=now_et.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
monday_utc_ts = monday_et.astimezone(timezone.utc).timestamp()

LOG.parent.mkdir(parents=True, exist_ok=True)
new_log = not LOG.exists()
new, booked_week, fail = 0, 0, False

with LOG.open("a", newline="") as f:
    w = csv.writer(f)
    if new_log:
        w.writerow(["ordered_utc", "tier", "for", "character", "details", "buyer_email", "amount", "status", "session_id"])
    for plink, tier in PLINKS.items():
        out = subprocess.run(["curl", "-s", f"https://api.stripe.com/v1/checkout/sessions?payment_link={plink}&limit=100",
                              "-u", f"{SKEY}:"], capture_output=True, text=True).stdout
        d = json.loads(out)
        if "data" not in d:
            print(f"stripe error ({tier}):", d.get("error", {}).get("message"), file=sys.stderr)
            fail = True
            continue
        paid = [s for s in d["data"] if s.get("payment_status") == "paid"]
        if plink == VIDEO_PLINK:
            booked_week = sum(1 for s in paid if s.get("created", 0) >= monday_utc_ts)
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
                        f"(reply to their Stripe receipt with the video — 7 day promise)")
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

STATE.write_text(json.dumps(sorted(seen)))
if fail:
    raise SystemExit(1)

slots_left = max(0, CAP - booked_week)
stats_path = REPO / "stats.json"
try:
    stats = json.loads(stats_path.read_text())
except Exception:
    stats = {}
if stats.get("slots_left") != slots_left or stats.get("booked_week") != booked_week or stats.get("slots_cap") != CAP:
    stats["slots_left"] = slots_left
    stats["booked_week"] = booked_week
    stats["slots_cap"] = CAP
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
