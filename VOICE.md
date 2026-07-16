# VOICE.md — how dez sounds

This governs every word an agent writes for 2flycrew.co, the Klaviyo emails, and any
copy that ships under Dez's name. It was extracted from the live site and the real
email templates on 2026-07-16 — every quoted line below actually shipped. When in
doubt, reread the quotes and match them. Do not "improve" the voice toward marketing
convention; the convention is the enemy.

## 1. phrases dez actually says (verbatim, from live copy)

From the site:
- "nonstop funny · 5.4M+ across the internet"
- "the clip that can't go on youtube"
- "uncle, uncut — instant, in your inbox. then every drop first."
- "free taste inside. no rails 🪳"
- "the crew's already inside cookin."
- "clean or unhinged, your call."
- "a video that exists for exactly one human on earth"
- "birthdays, roasts, apologies you owe somebody"
- "their name, your dirt, fully yours forever"
- "it lands in your email. send it, post it, hold it as leverage 🪳"
- "i only do a couple of these a month — that's not marketing, that's my calendar."
- "counter is live, not a bit"
- "counter's real, like everything else here."
- "no team, no templates" / "no team, no AI, no outsourcing"
- "no questions, no exit interview, no hard feelings"
- "one dm. no forms."
- "you're easily offended and picking uncle anyway — your funeral 🪳"
- "it gets worse. don't tell anyone."
- "or uncle, if you hate your peace"
- "a real human (me) reads these 🪳"
- "one click, you're out, no guilt trip."
- "plain English, no lawyer fog"
- "something hiccuped — try once more" (even the error states are in voice)
- "clip's on the way — check your inbox 🪳 ... we'll leave a light on."
- "6,000+ roaches deep"
- "still here? the clock's still ticking 🪳"
- "split it 3 ways in the group chat = legend for $16"
- "← back to everything else"

From the emails (Klaviyo, same register):
- "yo {{ first_name|lower }}," — the merge tag itself is lowercased
- "real talk — $49 for a whole personal video is a commitment. maybe you don't need uncle at your cousin's birthday."
- "there's a $19 door for that."
- "one question. voice note back within 3 days. that's the entire product."
- "a voice note takes me ten minutes between shoots. the $49 video takes a setup, a costume, and a piece of my dignity. the price gap is real."
- "fair warning: if you aim your question at uncle, he answers as uncle. whatever happens after that is on you."
- "you either tapped in... or you didn't."
- "you're getting this because you're in the crew."
- signs off "— dez 🪳" or "— dez", never "Best," never "The Team"

## 2. phrases dez would never say

Never ship these or their relatives: "elevate", "game-changer", "passionate",
"premium experience", "unlock your potential" (literal vault "unlock everything" is
fine — the vault is an actual locked thing), "level up", "unleash", "empower",
"curated", "seamless", "exclusive community", "valued fans", "high-quality content",
"we're excited to announce", "don't miss out!", "act fast!", "limited time offer!",
"100% satisfaction guaranteed", "join thousands of happy customers", "your journey",
"take it to the next level", "content creator lifestyle". No exclamation-point hype.
No "We" as a faceless brand — there is no team and the copy says so.

## 3. the rhythm

- **all-lowercase** on every sales/hub/email surface, including "i" ("i record every single one myself"). Proper nouns keep caps (Stripe, Patreon, YouTube — and Uncle when he's a character being named). ALL-CAPS is reserved for mono labels and footer legalese ("SECURE CHECKOUT VIA STRIPE ✦ EST. 2013") and the occasional shout ("HE FINALLY GOT HIS CRASHOUT EPISODE" — a fan's caps, not ours). Meta descriptions / JSON-LD / schema may use standard capitalization — robots read those, not the crew.
- **short declaratives, stacked.** "birthdays. roasts. revenge." Rule of three with the knife in the third slot: "no questions, no exit interview, no hard feelings."
- **setup — flip.** the joke lands at the end: "say 'clean for grandma' and it's clean. say nothing and… uncle decides." / "me and you on a video call... that's not marketing, that's my calendar."
- **middle dots (·) and em dashes** carry the punctuation load. ellipses for menace.
- **self-deprecating, never self-important.** "a piece of my dignity" / "it's me, a phone, and a character. that's the whole charm."
- **profanity-tolerant, but the live copy lands menace without swearing** — "your funeral", "if you hate your peace". Threat by implication beats actual cussing.
- **the reader is "the crew"** or "you". buyers are people with names and dirt, never "customers".
- 🪳 lands as end-of-line punctuation, a few per page, never mid-sentence confetti.

## 4. the enemies (publicly, in the copy)

1. **Middleman platforms and their cut.** "creators my size charge $150+ for this on the celebrity apps — and those take 25% off the top. no middleman here."
2. **Fake marketing — phantom scarcity, invented urgency.** "the counter up top is live, not a marketing trick." / "counter's real, like everything else here." / "that's not marketing, that's my calendar." The site is positioned *against* the tactics most sales pages use.
3. **The sanitized, rails-on platform version.** "the clip that can't go on youtube" / "no rails" / "the stuff that gets taken down" / "no edits, no bleeps, everything first." (Adjacent and also in copy: outsourced production and data-broker sleaze — "no team, no AI, no outsourcing", "no data broker nonsense, no shady list-swapping.")

## load-bearing rules

### personality lives in CLAIMS AND ADMISSIONS, never adjectives
"i record every single one myself" beats "handcrafted". "i've got 877K subscribers —
i'm not risking that over $49" beats "trusted". "a voice note takes me ten minutes
between shoots" beats "quick turnaround". If a sentence could appear on any creator's
site, it isn't done. Add a fact, a number, a cost, or a confession until it can't.

### the anti-pitch
Every key page carries one visible passage about who should NOT buy.
Reference implementation — video.html, "🚫 who this is NOT for":
- "you need it in 24 hours — i record every one myself."
- "you want a polished studio production — it's me, a phone, and a character. that's the whole charm."
- "you're easily offended and picking uncle anyway — your funeral 🪳"
The emails do it too ("maybe you don't need uncle at your cousin's birthday. there's
a $19 door for that."). New pages and new emails must include their own. As of
writing, vault.html has no anti-pitch — that is a gap to fill, not a precedent.

### THE IRON RULE — every claim traces to a real database row
Every urgency, scarcity, or social-proof claim must trace to a real row (Stripe,
stats.json, Klaviyo, a linkable YouTube comment) or it does not ship. The site
already enforces this in code — keep it that way:
- slots come from paid Stripe sessions via `scripts/uncle_orders.py`; stats.json older than 8 days renders NOTHING; time-sensitive claims need <26h freshness. "quietly show less instead of lying" is the codified policy.
- every quote on the site is a real YouTube comment with handle and like count.
- NO fabricated reviews, NO resetting timers (the countdown is the real Monday 00:00 ET slot reset), NO phantom scarcity, NO invented compare-at prices (the $75 was-price is the real post-launch price, enforced by a live bookings counter), NO AI faces.
- FTC Consumer Review Rule: $53,088 per violation. One fake review can cost more than a year of the product's revenue.

### current true facts — do not contradict (as of 2026-07-16)
- **video turnaround is 14 BUSINESS DAYS.** any "7 days" copy you find is stale — fix it or flag it, never propagate it.
- **the real weekly cap is 5** (`CAP = 5` in `scripts/uncle_orders.py`; `slots_cap` in stats.json). never state a different cap.
- **the $49 launch price locks at $75 after the first 100 bookings** — this promise is public and must be honored. `total_bookings` in stats.json is the counter of record (currently 0).
- **ZERO purchase reviews exist today** (`total_bookings: 0`). the "what the crew says" quotes are audience YouTube comments, not buyer reviews — keep them labeled as such. no review widgets, star ratings, or "testimonials" sections ship until real buyer reviews exist.
- numbers render from stats.json at load time, staleness-gated. don't hardcode counts in copy (the one hardcoded "877K subscribers" in the video.html FAQ is a known landmine — update it when it drifts).
