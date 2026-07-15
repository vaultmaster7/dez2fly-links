#!/usr/bin/env python3
"""Poll Stripe for new Uncle-video orders and ping them to Dez's Telegram.

Runs from cron every 15 min. Keys live outside the repo; only order metadata
moves through here. State file remembers which orders were already announced.
"""
import json, pathlib, subprocess, sys

PLINK = "plink_1TtS8SCD0StTUwgOSICDEJSs"
CHAT = "5352941556"
STATE = pathlib.Path.home() / ".claude/secrets/uncle_orders_seen.json"

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

new = 0
for s in d["data"]:
    if s.get("payment_status") != "paid" or s["id"] in seen:
        continue
    fields = {f["key"]: (f.get("text") or f.get("dropdown") or {}).get("value", "?") for f in s.get("custom_fields", [])}
    email = (s.get("customer_details") or {}).get("email", "?")
    amount = (s.get("amount_total") or 0) / 100
    msg = (f"🎥 NEW UNCLE ORDER — ${amount:.0f}\n\n"
           f"For: {fields.get('who', '?')}\n"
           f"Occasion: {fields.get('occasion', '?')}\n"
           f"Uncle should know: {fields.get('details', '?')}\n\n"
           f"Deliver to: {email}\n"
           f"(reply to their receipt email with the video within 7 days)")
    r = subprocess.run(["curl", "-s", f"https://api.telegram.org/bot{TG}/sendMessage",
                        "-d", f"chat_id={CHAT}", "--data-urlencode", f"text={msg}"],
                       capture_output=True, text=True)
    if json.loads(r.stdout).get("ok"):
        seen.add(s["id"])
        new += 1

STATE.write_text(json.dumps(sorted(seen)))
print(f"announced {new} new orders" if new else "no new orders")
