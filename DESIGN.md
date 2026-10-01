# Design System: Sports Pool OS

## 0. Preset & Direction (read this first)

**Chosen aesthetic preset:** `high-end-visual-design` — Vibe Archetype **Ethereal Glass** (deepest cool-black base, frosted glass panels, restrained single accent) adapted from its default mesh-gradient background to a **real football video background**, combined with Layout Archetype **Editorial Split / Asymmetric** for Landing and Standings.

**Explicit override:** the Pick List screen breaks the bento/split archetype on purpose. Per the product brief, density beats decoration there — it is a tight single-column list with border-hairline dividers, not cards. This is the one place `high-end-visual-design`'s "macro-whitespace" mandate is intentionally dialed back.

**Taste dials** (stitch-design-taste calibration):
- Density: 7/10 on Pick List and Standings (data-dense, phone-first), 3/10 on Landing and Payout (gallery-airy, cinematic)
- Variance: 6/10 — asymmetric hero/standings layout, but the pick list stays predictable and grid-locked because it's a repeated-use utility, not a marketing surface
- Motion: 7/10 — spring-physics micro-interactions everywhere, but no decorative looping motion outside the two places the brief calls for it (live pulse, winner beat)

**Fixed constraints from the brief (non-negotiable):** dark stadium-night OKLCH base with a cool cast; one hot accent for live+wins; a separate warm amber reserved only for money, never shared with "live"; broadcast-grade condensed type for scores/abbreviations/records against a humanist sans body; tabular numerals everywhere a number updates; frosted glass over real (non-NFL, no-logo) football video; phone-first; teams referenced by plain text city/name + abbreviation only, never logos or wordmarks.

---

## 1. Visual Theme & Atmosphere

Sports Pool OS reads like a broadcast truck's control room at night, seen through frosted glass. The base is a near-black cool blue, lit from below by a blurred stadium video that's always present but never competing with the data sitting on top of it. Everything that is *live* pulses in one hot broadcast red-orange; everything that is *money* sits apart in warm amber and never touches the red. Numbers never jitter — they roll like an odometer and lock to a monospaced grid the instant they update. The whole system is calm and confident until something needs your attention (a live game, a win, a payout), and then it says so clearly and stops.

---

## 2. Color Palette & Roles (OKLCH)

All colors are defined in OKLCH: `oklch(L C H / A)`. Lightness 0–1, Chroma roughly 0–0.37, Hue in degrees, optional alpha.

### Surfaces (cool-cast near-black, never pure black)

| Token | Value | Role |
|---|---|---|
| `--bg-void` | `oklch(0.14 0.018 255)` | Page canvas behind the video layer; the deepest surface in the system |
| `--bg-surface` | `oklch(0.19 0.02 255)` | Glass panel base fill (outer shell of the Double-Bezel), ~62% opacity over video |
| `--bg-elevated` | `oklch(0.23 0.022 255)` | Inner-core fill: modals, nested rows, the picked-team pill background |
| `--bg-scrim` | `oklch(0.10 0.02 255)` | Base color for all video scrims (see §5) |

### Text (cool-cast neutrals)

| Token | Value | Role |
|---|---|---|
| `--text-primary` | `oklch(0.97 0.005 255)` | Headlines, scores, primary labels |
| `--text-secondary` | `oklch(0.74 0.02 255)` | City names, metadata, helper text |
| `--text-tertiary` | `oklch(0.54 0.02 255)` | Timestamps, disabled-adjacent labels |
| `--text-disabled` | `oklch(0.40 0.015 255)` | Text inside disabled controls |

### Borders & glass edges

| Token | Value | Role |
|---|---|---|
| `--border-hairline` | `oklch(1 0 0 / 0.08)` | Default 1px structural lines, dividers |
| `--border-hairline-strong` | `oklch(1 0 0 / 0.14)` | Glass panel top edge (the light catching the top bezel), active-row rules |
| `--glass-inner-highlight` | `oklch(1 0 0 / 0.06)` | Inset top highlight inside the Double-Bezel inner core |

### Hot accent — LIVE and WINS only (one accent, three lightness steps)

Broadcast red-orange. This is the *only* saturated hue used for interactive/state emphasis outside of money.

| Token | Value | Role |
|---|---|---|
| `--accent-hot-500` | `oklch(0.63 0.22 27)` | Glows, rings, live pulse, focus rings, links |
| `--accent-hot-600` | `oklch(0.50 0.20 27)` | Solid fills behind white text (buttons, picked-team pill) — AA-safe |
| `--accent-hot-700` | `oklch(0.42 0.18 27)` | Active/pressed state of solid fills |
| `--accent-hot-dim` | `oklch(0.63 0.22 27 / 0.16)` | Background wash for the score-tick glow flash |
| `--on-accent-hot` | `oklch(0.99 0 0)` | Text/icons on top of `--accent-hot-600` / `700` |

### Money amber — payouts and the ledger only, never live

Warm gold. Never appears on a game row, a live badge, or anywhere adjacent to `--accent-hot-*` in the same visual cluster.

| Token | Value | Role |
|---|---|---|
| `--money-amber-500` | `oklch(0.80 0.15 85)` | Pot totals, unpaid-chip outline/text, payout icon |
| `--money-amber-600` | `oklch(0.74 0.16 85)` | Solid fills behind dark text (Paid chip, Confirm Payout button) — AA-safe |
| `--money-amber-700` | `oklch(0.68 0.16 85)` | Active/pressed state of solid amber fills |
| `--money-amber-dim` | `oklch(0.80 0.15 85 / 0.14)` | Payout screen ambient wash |
| `--on-money` | `oklch(0.20 0.03 85)` | Text/icons on top of `--money-amber-600` / `700` |

### Neutral state

| Token | Value | Role |
|---|---|---|
| `--state-locked` | `oklch(0.40 0.01 255 / 0.12)` | Wash over a locked pick row |
| `--state-locked-fg` | `oklch(0.55 0.015 255)` | Team text once locked/greyed |

**Rule:** the system has exactly one hot hue and one money hue. That separation is load-bearing for the product's mental model (live vs. settled-up), and nothing may dilute it.

**Destructive actions do not get a color.** Do NOT reuse `--accent-hot-*` for "Remove Player," "Delete Week," or a score override — the hot accent means *live* and *won*, and dressing a delete button in the same colour as winning the pot is how a commissioner removes the wrong person on a phone. Destructive actions render as a low-emphasis ghost button: `--text-tertiary` label, `--border-hairline` hairline, transparent fill, and no glow. They earn emphasis from a confirmation step, not from colour. On confirm, the confirming button uses the neutral solid, never a saturated fill. This keeps the palette at two saturated hues and makes the dangerous action visually quieter than the safe one, which is the correct hierarchy for an action nobody should take by accident.

---

## 3. Typography

**Superfamily pairing:** **Barlow Condensed** (scores, team abbreviations, records, tabular data, labels) + **Barlow** (body copy, names, primary UI text). Same type family at two widths — cohesive, unmistakably "broadcast," never `Inter`.

```
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&display=swap');
```

```css
font-family: { display: ['Barlow Condensed', 'sans-serif'], body: ['Barlow', 'sans-serif'] }
```

**Tabular numerals — mandatory, everywhere a score/record/dollar figure renders:**
```css
.tabular { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'lnum' 1; }
```
Apply to: live scores, standings correct-count and rank, "still alive" count, tiebreak numbers, the Monday combined-score input, pot and payout dollar figures, paid/unpaid timestamps. Nothing with a live-updating digit is exempt.

### Type scale

| Token | Size / Line | Weight / Family | Used for |
|---|---|---|---|
| `display-2xl` | 3.5rem / 1.0 | Barlow Condensed 700, tracking -0.01em | Landing hero, pot headline |
| `display-xl` | 2.25rem / 1.05 | Barlow Condensed 700 | Live score in an expanded row, payout total |
| `display-l` | 1.5rem / 1.1 | Barlow Condensed 600 | Team abbreviation on pick buttons, standings rank |
| `heading` | 1.25rem / 1.3 | Barlow 600 | Section titles ("Week 3", "Commissioner Console") |
| `body-l` | 1rem / 1.5 | Barlow 500 | Team city/name, primary UI text, buttons |
| `body-m` | 0.875rem / 1.4 | Barlow Condensed 600, tabular | Records ("8-4"), secondary numeric data |
| `caption` | 0.75rem / 1.3 | Barlow 500, uppercase, tracking +0.04em | Field labels, helper text |
| `micro` | 0.6875rem / 1.2 | Barlow 600, uppercase, tracking +0.06em | Chips, "LIVE" badge, kickoff-time labels |

**Banned:** Inter, system-ui fallback stacks as the primary voice, any generic serif. No filler copy clichés ("Elevate your pool," "Seamless picks") — copy stays literal and scoreboard-plain.

---

## 4. Spacing, Radii, Layout

**Spacing scale (4px base):** `space-1` 4px · `space-2` 8px · `space-3` 12px · `space-4` 16px · `space-5` 24px · `space-6` 32px · `space-7` 48px · `space-8` 64px · `space-9` 96px.

- Pick List rows: `space-2` (8px) vertical rhythm between rows, `space-4` (16px) internal padding.
- Landing / Standings / Payout sections: `space-7`–`space-9` (48–96px) between major blocks — this is where the "macro-whitespace" mandate applies.

**Radii scale:** `radius-sm` 12px (chips, badges) · `radius-md` 20px (pick-row team buttons, standings panel rows) · `radius-lg` 28px (cards, the pick-list container's outer shell) · `radius-xl` 36px (hero panels, payout modal). Inner-core radius in a Double-Bezel = outer radius − inset padding (see §5).

**Layout:**
- Landing / Standings: Editorial Split — large `display-2xl`/`display-xl` typography block on one side, live standings or hero video content asymmetrically placed on the other. Collapses to a single-column stack below 768px, typography first.
- Pick List: single-column, full-width, phone-first by default (this screen is designed mobile-first even on desktop — it doesn't get wider, it gets a max-width rail of ~480px centered, because it's a form, not a canvas).
- Payout screen: centered composition is allowed here specifically — it's a single-moment "receipt," not a marketing hero, so the variance-forces-asymmetry rule is waived.
- Full-height sections use `min-h-[100dvh]`, never `h-screen`.
- No 3-equal-card feature rows anywhere in the system.

---

## 5. Elevation, Glass & the Video Scrim

### Double-Bezel glass recipe (every panel, card, modal, and the pick-list container)

**Outer shell:**
```css
background: var(--bg-surface); /* ~62% opacity composited over the blurred video */
backdrop-filter: blur(20px) saturate(140%);
border: 1px solid var(--border-hairline);
border-top: 1px solid var(--border-hairline-strong); /* the light top edge */
border-radius: var(--radius-lg); /* 28px, or --radius-xl for hero panels */
box-shadow:
  0 1px 0 0 var(--border-hairline-strong) inset,   /* top edge catch-light */
  0 2px 8px 0 oklch(0 0 0 / 0.35),                  /* contact shadow */
  0 20px 40px -12px oklch(0 0 0 / 0.55);            /* soft diffused drop */
padding: 6px; /* the bezel itself */
```

**Inner core:**
```css
background: var(--bg-elevated); /* ~80% opacity */
border-radius: calc(var(--radius-lg) - 6px);
box-shadow: 0 1px 0 0 var(--glass-inner-highlight) inset;
```

Individual pick rows do **not** each get a full Double-Bezel — that would recreate the banned "3 equal cards" density problem at 16-rows scale. Instead the entire Pick List is one Double-Bezel container, and rows inside it are separated by `--border-hairline` top-dividers only.

### Video scrim recipe (three states — this is part of the system, not an afterthought)

**1. Full motion — Landing & Standings.** Video plays at normal speed.
```css
video { filter: brightness(0.55) saturate(85%); }
.scrim {
  background: linear-gradient(
    180deg,
    oklch(0.10 0.02 255 / 0.15) 0%,
    oklch(0.10 0.02 255 / 0.55) 55%,
    oklch(0.10 0.02 255 / 0.85) 100%
  );
}
```
Large display type (`display-l` and above) may sit directly on this scrim. Anything smaller sits inside a glass panel — never raw video behind body text.

**2. Blurred wash — Pick List background.**
```css
video { filter: blur(6px) brightness(0.65) saturate(75%); }
.scrim { background: oklch(0.12 0.02 255 / 0.55); } /* flat, high-coverage — this is the reading screen */
```
The first values here (`blur(40px) brightness(0.35)` under a `0.75` scrim) compounded to a wash *darker than `--bg-void`* — the footage read as nothing at all on the busiest screen in the app. A first correction to `blur(20px)` was still too soft to read as football. At 6px the players are recognisable and the motion is legible, which is the point of having footage rather than a gradient.

The brightest region of the footage (field under floodlights) composites to roughly `L 0.30` here, which still clears 4.5:1 against `--text-secondary`. That headroom is the budget: blur may come down further only if the scrim rises to match.

The cost is contrast headroom, and it is paid explicitly: the only text sitting directly on this wash is the Pick List's remaining-count line, which moves from `--text-tertiary` to `--text-secondary`. On tertiary it measured ~3.8:1 against the lightened wash — under the 4.5:1 floor for body text. Everything else on this screen is inside a glass panel and unaffected. **Any new text placed directly on the wash uses `--text-secondary` or lighter.**

**3. Bright — Payout screen.**
```css
video { filter: brightness(0.85) saturate(120%); }
.scrim {
  /* vignette only — keep the center bright for the winner beat */
  background: radial-gradient(ellipse at center, transparent 40%, oklch(0.10 0.02 255 / 0.35) 100%);
}
```
Panels here increase their own base opacity by ~10% to stay legible against the brighter plate.

**Contrast rule:** every text layer either lives inside a glass panel (guaranteed contrast via the panel's own fill) or is `display-l`/`2xl`/`xl` sitting directly on a scrimmed video with a checked AA pass at that scrim's darkest practical frame. Body/caption/micro text is never placed on raw video.

---

## 6. Motion

### Tokens

| Token | Value | Use |
|---|---|---|
| `ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | Pick confirmation, panel entrances, button press |
| `ease-out-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` | Digit-roll, general enter transitions |
| `ease-in-standard` | `cubic-bezier(0.7, 0, 0.84, 0)` | Exits |
| `duration-instant` | 100ms | Press feedback |
| `duration-fast` | 180ms | Chip flips, color transitions |
| `duration-base` | 280ms | Standings reorder, standard transitions |
| `duration-slow` | 480ms | Pick-row collapse |
| `duration-cinematic` | 800ms | Video/scrim state changes, winner beat |

Animate only `transform` and `opacity`. No `top`/`left`/`width`/`height`/`box-shadow` animation — glow effects are opacity-animated pseudo-elements sized in their resting state.

### The six motion moments

1. **Pick confirmation (signature interaction, most polish).** Tap → the tapped team button's fill transitions to `--accent-hot-600` over `duration-fast` with a scale pulse (1.0 → 1.03 → 1.0, `duration-instant` each leg, `ease-spring`). Simultaneously the row collapses from its full 72px state to the 44px confirmed state over `duration-slow` on `ease-spring`: the non-picked button fades opacity 1→0 over 150ms while the picked team's label repositions into the compact row. One continuous spring, not a sequence of separate snaps.
2. **Score ticks.** Only the changed digit(s) animate — a vertical odometer roll (`translateY`, `duration-base`, `ease-out-standard`). The row background flashes `--accent-hot-dim` and fades opacity 0.35→0 over 900ms. Never a full-row or full-list re-render flash.
3. **Standings reorder.** `document.startViewTransition()` wraps the DOM reorder. `::view-transition-old/new` use `transform`/`opacity` only, `duration-base`, `ease-spring`. Rank number cross-fades via the same digit-roll as score ticks.
4. **Live pulse.** A pseudo-element glow ring on live rows/badges breathes opacity 0.6 → 1 → 0.6 over 2400ms, `ease-in-standard`/`ease-out-standard` alternating, infinite — until the game finalizes, at which point the animation is removed with a hard cut (no fade-out transition). This is the one intentionally perpetual loop in the system, and it is scoped to exactly the rows that are live.
5. **Winner moment.** Once per frozen week, gated by a persisted flag so it never replays: a restrained confetti burst (`transform`/`opacity` particles, `duration-cinematic`, `ease-out-standard`) plus two pulses of the payout panel's glow ring, then rest. Not a loop.
6. **Reduced motion.** Every moment above collapses to an instant state change under `prefers-reduced-motion: reduce`: pick confirmation collapses immediately with no spring; digit-rolls become instant number swaps; standings reorder skips the view transition (instant DOM reorder); the live pulse becomes a static low-opacity ring with no animation; the winner beat is skipped entirely, replaced by a static "Week Won" badge.

---

## 7. Component Specs

### Pick Row (four states)

**Base layout:** CSS Grid, `grid-template-columns: 1fr auto 1fr`, ~72px tall at rest, full-width inside the Pick List's single Double-Bezel container, `--border-hairline` top-divider between rows (no per-row card chrome).

- **Unpicked:** Two team buttons (`radius-md`, `--bg-elevated` fill, `--border-hairline` border). Each button: team abbreviation in `display-l` (Barlow Condensed 600), city/name below in `body-l` secondary color. No team logos — the abbreviation *is* the visual identity, set boldly. Center column: kickoff time, `micro` scale, tabular, uppercase, `--text-tertiary`, with "@" separator. Press feedback: scale 0.98, `duration-instant`, `ease-spring`.
- **Picked / Collapsed:** Row height 44px. Left: a 28×28 pill filled `--accent-hot-600` with the picked abbreviation (`micro`, `--on-accent-hot`). Middle: "Picked" caption + opponent context in `body-m`. Right: thin-line checkmark, `--accent-hot-500`. Background flattens to `--bg-surface`. Tapping re-expands (reverse spring) until lock time.
- **Locked:** Background washes to `--state-locked`. Both team buttons drop to 0.55 opacity, become non-interactive (default cursor, no press feedback), a thin-line lock glyph appears row-end. If kicked off, the center kickoff-time chip is replaced by the score: two `body-m`-scale tabular numbers in `--text-primary`, separated by "–".
- **Live:** Same as Locked, plus: 1px ring in `--accent-hot-500` around the row, the breathing glow pulse (see §6.4), score numbers rendered in `--accent-hot-500` with digit-roll on change, and a `micro`-scale "LIVE" badge (fill `--accent-hot-600`, text `--on-accent-hot`) at row-start. On finalize: pulse hard-cuts, score color transitions once (180ms) to `--text-primary`, row becomes visually identical to Locked.

### Standings Row

Grid columns: rank (fixed 32px) · player name (flexible, truncates, never wraps) · correct-count · still-alive · pot (header-row only, not per-player).

- Rank: `display-l` Barlow Condensed 700, tabular.
- Name: `body-l` Barlow 500, `--text-primary`.
- Correct-count: `display-l`-weight-adjacent, Barlow Condensed 700, tabular, 18px.
- Still-alive: `body-m` tabular, `--text-secondary`; a small live-pulse dot prefixes it while games are still in progress, otherwise static.
- Tiebreak line: appears only once the week's last game has kicked off — `body-m`, `--text-secondary`, e.g. "(tiebreak: 47)".
- Pot: `display-l` Barlow Condensed 700 in `--money-amber-500`, isolated to the header/summary area — never inline with a player row, keeping money visually separate from the live/competitive cluster.
- Current-user row: no full accent fill (too loud for a repeated-use list); instead a 3px `--accent-hot-500` left rule via `--border-hairline-strong` treatment.
- Reorder: view-transition per row, keyed by player id (see §6.3).

### Paid / Unpaid Chip

Pill, `radius-sm` (fully rounded via height/2), 24px tall, 4px/10px padding.

- **Paid:** solid fill `--money-amber-600`, text `--on-money`, small thin-line check glyph. This is the only place besides the payout screen where amber appears *solid* — deliberately, so "paid" reads as settled and final.
- **Unpaid:** outline only — 1px `--money-amber-500` border, transparent fill, text `--money-amber-500`. Reads as open/pending.
- Commissioner tap-to-mark-paid: press scale 0.96, then a 180ms crossfade from outline to solid. No bounce, no confetti — a ledger event, not a celebration.

### Primary Button

Pill (`border-radius: 9999px`), 52px desktop / 48px mobile (both clear the 44px touch-target minimum), `space-6` (32px) horizontal padding.

- **Default:** fill `--accent-hot-600`, text `--on-accent-hot`, Barlow 600, 15px, tracking +0.01em.
- **Trailing icon variant** (commissioner actions like "Send Invite ↗"): icon nested in its own 32px circular sub-button, `oklch(1 0 0 / 0.12)` background, thin-line icon, translates (+2px x / −1px y) and scales to 1.05 on hover/press — the Button-in-Button pattern.
- **Hover (desktop):** background lightens to `--accent-hot-500`, `duration-fast`, `ease-out-standard`.
- **Active/press:** scale 0.98, background `--accent-hot-700`, `duration-instant`, `ease-spring`.
- **Disabled:** opacity 0.4, background `--bg-elevated`, text `--text-tertiary`, no interaction.
- **Money variant** (used only for "Confirm Payout" / ledger-confirming actions on the Commissioner payout screen): identical shape, fill `--money-amber-600`, text `--on-money`. The only context where the primary button swaps off the hot accent — reserved strictly for money-moving confirmations, never for pick or live actions.

---

## 8. Anti-Slop Rules (the build will be audited against these)

**Banned outright:**
- `Inter`, or any bare system-ui stack, as a display or body voice
- Generic serif fonts anywhere (this is a sports utility, not editorial)
- Pure black `#000000` — the darkest surface is `--bg-void` at `oklch(0.14 …)`
- A second saturated red, or any purple/neon "AI glow" accent — there is exactly one hot hue and one money hue in the entire system
- Team logos, wordmarks, or league branding of any kind — plain-text city/name + abbreviation only
- Non-tabular numerals on any live-updating figure (score, record, pot, payout, timestamp)
- Full-row or full-list re-render flashes on data update — only the changed digit/element animates
- A generic circular spinner — loading states are skeletal, matching final layout dimensions
- Per-row card chrome in the Pick List (would recreate a 16-up "3 equal cards" problem at density)
- Centered Hero on Landing or Standings (variance ≥4 forbids it) — Payout screen is the sole, deliberate exception
- Filler UI copy: "Scroll to explore," bouncing chevrons, "Elevate your pool," "Seamless," "Next-Gen"
- Emoji anywhere in the interface
- A perpetual/looping animation anywhere except the live-pulse (scoped to live rows only) — the winner beat fires once per frozen week and never loops
- Confetti, glow, or any celebratory motion on the Paid/Unpaid chip — that's a ledger action, not a win
- Money color (`--money-amber-*`) touching or adjacent to live/hot-accent elements in the same visual cluster
- Animating anything other than `transform`/`opacity`; `backdrop-blur` on anything but fixed/sticky glass panels, never on scrolling content
- `h-screen` for full-bleed sections — always `min-h-[100dvh]`
- Body/caption text placed directly on raw (non-scrimmed, non-panel) video

---

## 9. Decisions Made That Weren't Specified (flagged for review)

- **Font pairing:** Barlow Condensed + Barlow, pulled from `ui-ux-pro-max`'s Sports/Fitness pairing — a single superfamily at two widths, satisfying "condensed for scores against humanist sans for body" with real cohesion.
- **Exact OKLCH hues:** hot accent centered at hue 27° (red-orange), money amber at hue 85° (warm gold) — chosen far enough apart on the wheel that they can never be confused, with three lightness steps each for AA-safe text-on-fill combinations.
- **Preset blend naming:** treated `high-end-visual-design`'s "Ethereal Glass" vibe archetype as the base, swapped its default mesh-gradient background for the required video, and applied "Editorial Split" only to Landing/Standings — the Pick List explicitly opts out of the archetype's macro-whitespace mandate per the brief's own density instruction.
- **Destructive actions get no colour at all** — ghost button, muted label, hairline border, emphasis from a confirmation step instead. (Overridden by the controller: the original direction reused `--accent-hot-600` here, which would have dressed "Remove Player" in the same colour as *live* and *won*. In a console where the commissioner deletes people on a phone, the dangerous action must read quieter than the safe one, not identical to the celebratory one.)
- **Payout screen is the one place a centered composition is allowed** — reasoned as a "receipt" moment rather than a marketing surface, so the variance/asymmetry rule doesn't apply there.
- **Concrete spacing/radii/motion-duration scales** — the brief asked for tokens to exist; the specific numbers (4px base spacing, the four-step radii scale, the six duration tokens) are new.
- **Pick List max-width rail (~480px) even on desktop** — the brief says phone-first for that screen; extending it to a capped rail on desktop (rather than letting it stretch wide) was my call to keep the tap-through-16-games task equally fast on any device.
