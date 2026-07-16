# DESIGN.md — 2flycrew.co

Extracted from the live site (index / video / vault / privacy), 2026-07-16. These are
decisions already made. Comply with them — do not redesign, do not add fonts, colors,
or ideas. If a rule here conflicts with your instinct, the rule wins.

## direction
**late-night · hustler-direct · receipt-honest — never corporate-polished.**
Aesthetic family: bootleg late-night TV meets terminal readout. Deep violet-black
night ground, amber signage glow, monospace ticker labels, flat panels with hairline
edges. The site itself disclaims polish ("it's me, a phone, and a character. that's
the whole charm") — the design must keep that promise.

## type — exactly two families, never a third
- `--sans: "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif` — all reading text and headings
- `--mono: "SF Mono",ui-monospace,Menlo,monospace` — labels, stats, fine print, footers; always small (9–11.5px), letterspaced (.08–.3em), usually UPPERCASE
- scale in use: h1 25–30px/700 · card title 15.5px/600 · body 13–13.5px · secondary 12.5px · buttons 14–16px/700 · mono micro 9–11.5px. No webfonts, no fluid-type tricks.

## palette — exact and complete, do not add colors
- field: `--ground #0d0a1a` · `--panel #171226` · `--panel2 #1d1730` · `--edge #2a2140`
- ink: `--ink #ede8ff` · `--mute #8d81b8` · `--dim #564a80`
- accent: `--amber #ffb648` · `--amber-deep #e08d1d` · `--hot #ff5d76` (urgency/latest) · `--violet #8f7bdc` (index header glow only)
- amber occupies roughly 5% of any screen — CTA fills, statlines, pills, focus borders, quote handles. Never a background field. The dark ground is ~90% of every page.

## space & structure
Single centered column, `max-width: 460px`. Page gutter 18px. Stack gap 12–14px.
Card padding 15–18px. Sections separate with tiny mono labels, not whitespace oceans.
Design at 390px first — most traffic is mobile; everything must survive there.

## corners / borders / shadows — decided once
- radii: outer card **14px** · nested control **10–11px** · pill **999px** · bottom-sheet top **18px** · tiny thumb 8px. Pick from these; never invent a radius.
- separation is `1px solid var(--edge)`. Panels are FLAT — no card shadows. Shadows exist only on floating layers (toasts, bottom sheet) plus soft glow drop-shadows on the header emoji.

## motion budget (already spent)
Hover: `translateY(-2px)` + border-color shift. Active: `scale(.96–.985)`. Ambient:
tv flicker, live-dot pulse, vault sheen, the roach — each behind a
`prefers-reduced-motion` off-switch. That is the entire budget. Nothing else moves.

## the signature: the roach 🪳
One signature element exists and it is the roach. It skitters across the bottom once
per session (click = discord), and 🪳 lands as end-of-line punctuation in copy.
**A SECOND SIGNATURE ELEMENT IS FORBIDDEN.** No mascots, no friends for the roach,
nothing else crawling, floating, or following the cursor.
Note: emoji ARE this site's icon system (📺 💀 🎥 ▶️ 🔓) — deliberate and grandfathered.
Never import an icon library (FontAwesome, Lucide, SVG icon sets). Never add new
emoji-icon sprawl beyond the established set. The roach is a signature, not an icon system.

## kill list — project red lines, no exceptions
no purple-blue gradients · no Inter/Poppins as display type · no centered-everything
(headers center; cards and body stay left) · no three-icon-card feature grids · no pure
#000 on #FFF · no radii outside the set above · no >2 font families · no new
emoji-as-icons · no carousels · no stock photos · no AI-generated faces-as-customers ·
no scroll-triggered fade-up on every block · no custom cursors · no scroll hijacking ·
no sound · no preloader screens.

## hard rules
1. **Weirdness goes in voice, color, and imagery — NEVER in layout.** Conventional skeleton, distinctive surface.
2. The direction must survive 390px.
3. Performance: the LCP element is always plain HTML (today: the header; the latest-drop thumb carries `fetchpriority=high`). LCP < 2.5s / CLS < 0.1 / INP < 200ms are THRESHOLDS — hit them and STOP; do not chase numbers past them.
4. Pages are single-file HTML (9–44KB each), all CSS/JS inline, one local analytics helper (`count.js`) and one external script (Microsoft Clarity). That leanness is an asset — defend it. Adding a framework, bundler, webfont, or second external script requires Dez's explicit yes.
