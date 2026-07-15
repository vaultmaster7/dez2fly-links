#!/usr/bin/env python3
"""Poll Stripe for new personal-video orders: ping Dez's Telegram + log to a
private CSV (outside this public repo). Runs from cron every 15 min."""
import csv, json, pathlib, subprocess, sys
from datetime import datetime, timezone

PLINK = "plink_1TtS8SCD0StTUwgOSICDEJSs"
CHAT = "5352941556"
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

out = subprocess.run(["curl", "-s", f"https://api.stripe.com/v1/checkout/sessions?payment_link={PLINK}&limit=20",
                      "-u", f"{SKEY}:"], capture_output=True, text=True).stdout
d = json.loads(out)
if "data" not in d:
    print("stripe error:", d.get("error", {}).get("message"), file=sys.stderr)
    raise SystemExit(1)

LOG.parent.mkdir(parents=True, exist_ok=True)
new_log = not LOG.exists()
new = 0
with LOG.open("a", newline="") as f:
    w = csv.writer(f)
    if new_log:
        w.writerow(["ordered_utc", "for", "character", "details", "buyer_email", "amount", "status", "session_id"])
    for s in d["data"]:
        if s.get("payment_status") != "paid" or s["id"] in seen:
            continue
        fields = {fl["key"]: (fl.get("text") or fl.get("dropdown") or {}).get("value", "?") for fl in s.get("custom_fields", [])}
        email = (s.get("customer_details") or {}).get("email", "?")
        amount = (s.get("amount_total") or 0) / 100
        when = datetime.fromtimestamp(s.get("created", 0), timezone.utc).strftime("%Y-%m-%d %H:%M")
        msg = (f"🎥 NEW VIDEO ORDER — ${amount:.0f}\n\n"
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
print(f"announced {new} new orders" if new else "no new orders")
