#!/usr/bin/env python3
"""Poll Stripe for new personal-video orders: ping Dez's Telegram, log to a
private CSV, and keep the LIVE slots counter on the site truthful.
Runs from cron every 15 min. slots_left = CAP - paid orders since Monday 00:00 ET.
When slots change, stats.json is updated and pushed so the page shows real scarcity."""
import csv, json, pathlib, subprocess, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PLINK = "plink_1TtS8SCD0StTUwgOSICDEJSs"
CHAT = "5352941556"
CAP = 10
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

out = subprocess.run(["curl", "-s", f"https://api.stripe.com/v1/checkout/sessions?payment_link={PLINK}&limit=100",
                      "-u", f"{SKEY}:"], capture_output=True, text=True).stdout
d = json.loads(out)
if "data" not in d:
    print("stripe error:", d.get("error", {}).get("message"), file=sys.stderr)
    raise SystemExit(1)

now_et = datetime.now(ZoneInfo("America/New_York"))
monday_et = (now_et - timedelta(days=now_et.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
monday_utc_ts = monday_et.astimezone(timezone.utc).timestamp()

paid = [s for s in d["data"] if s.get("payment_status") == "paid"]
booked_week = sum(1 for s in paid if s.get("created", 0) >= monday_utc_ts)
slots_left = max(0, CAP - booked_week)

LOG.parent.mkdir(parents=True, exist_ok=True)
new_log = not LOG.exists()
new = 0
with LOG.open("a", newline="") as f:
    w = csv.writer(f)
    if new_log:
        w.writerow(["ordered_utc", "for", "character", "details", "buyer_email", "amount", "status", "session_id"])
    for s in paid:
        if s["id"] in seen:
            continue
        fields = {fl["key"]: (fl.get("text") or fl.get("dropdown") or {}).get("value", "?") for fl in s.get("custom_fields", [])}
        email = (s.get("customer_details") or {}).get("email", "?")
        amount = (s.get("amount_total") or 0) / 100
        when = datetime.fromtimestamp(s.get("created", 0), timezone.utc).strftime("%Y-%m-%d %H:%M")
        msg = (f"🎥 NEW VIDEO ORDER — ${amount:.0f}  ({slots_left} of {CAP} slots left this week)\n\n"
               f"From: {fields.get('character', '?').upper()}\n"
               f"For: {fields.get('who', '?')}\n"
               f"Notes: {fields.get('details', '?')}\n\n"
               f"Deliver to: {email}\n"
               f"(reply to their Stripe receipt email with the video — 7 day promise)")
        r = subprocess.run(["curl", "-s", f"https://api.telegram.org/bot{TG}/sendMessage",
                            "-d", f"chat_id={CHAT}", "--data-urlencode", f"text={msg}"],
                           capture_output=True, text=True)
        if json.loads(r.stdout).get("ok"):
            w.writerow([when, fields.get("who", "?"), fields.get("character", "?"),
                        fields.get("details", "?"), email, amount, "PENDING", s["id"]])
            seen.add(s["id"])
            new += 1

STATE.write_text(json.dumps(sorted(seen)))

# --- keep the live slots counter on the site truthful ---
stats_path = REPO / "stats.json"
try:
    stats = json.loads(stats_path.read_text())
except Exception:
    stats = {}
if stats.get("slots_left") != slots_left or stats.get("booked_week") != booked_week:
    stats["slots_left"] = slots_left
    stats["booked_week"] = booked_week
    stats.setdefault("slots_cap", CAP)
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
                    "text=🚨 WEEK SOLD OUT — all slots gone. Say the word and I deactivate the buy link until Monday."],
                   capture_output=True)

print(f"announced {new} new orders" if new else "no new orders")
