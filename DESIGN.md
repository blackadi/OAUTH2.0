---
name: Authlete OAuth 2.0 / OIDC Debugger
description: A dark-first instrument for inspecting, teaching and proving OAuth 2.0 and OpenID Connect exchanges.
colors:
  background: "#020617"
  foreground: "#f1f5f9"
  foreground-muted: "#cbd5e1"
  card: "#0f172a"
  card-foreground: "#e2e8f0"
  muted: "#1e293b"
  muted-foreground: "#94a3b8"
  surface-2: "#1e293b"
  code: "#020617"
  border: "#1e293b"
  input: "#0f172a"
  accent: "#6366f1"
  accent-foreground: "#ffffff"
  accent-text: "#a5b4fc"
  success-text: "#6ee7b7"
  warning-text: "#fcd34d"
  danger-text: "#f87171"
  info-text: "#7dd3fc"
  tint-accent: "rgb(99 102 241 / 0.12)"
  tint-accent-strong: "rgb(99 102 241 / 0.2)"
  edge-accent: "rgb(99 102 241 / 0.35)"
  tint-success: "rgb(16 185 129 / 0.12)"
  tint-success-strong: "rgb(16 185 129 / 0.2)"
  edge-success: "rgb(16 185 129 / 0.3)"
  tint-warning: "rgb(245 158 11 / 0.12)"
  tint-warning-strong: "rgb(245 158 11 / 0.2)"
  edge-warning: "rgb(245 158 11 / 0.35)"
  tint-danger: "rgb(239 68 68 / 0.12)"
  tint-danger-strong: "rgb(239 68 68 / 0.2)"
  edge-danger: "rgb(239 68 68 / 0.3)"
  tint-info: "rgb(14 165 233 / 0.12)"
  tint-info-strong: "rgb(14 165 233 / 0.2)"
  edge-info: "rgb(14 165 233 / 0.3)"
  accent-grad-from: "#4338ca"
  accent-grad-to: "#4f46e5"
  accent-grad-from-hover: "#3730a3"
  accent-grad-to-hover: "#4338ca"
  danger-grad-from: "#b91c1c"
  danger-grad-to: "#dc2626"
  danger-grad-from-hover: "#991b1b"
  danger-grad-to-hover: "#b91c1c"
typography:
  title:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.1em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  hairline: "1px"
  default: "2px"
  card: "3px"
  circle: "9999px"
spacing:
  gutter: "1rem"
  gutter-lg: "1.5rem"
  gutter-xl: "2rem"
  card-pad: "1.5rem"
  sidebar: "14rem"
shadows:
  offset: "1px 1px 0 0 {colors.foreground}"
  offset-hover: "2px 2px 0 0 {colors.foreground}"
  card: "0 10px 15px -3px rgb(2 6 23 / 0.8), 0 4px 6px -4px rgb(2 6 23 / 0.8)"
  card-elevated: "0 25px 50px -12px rgb(2 6 23 / 0.85)"
components:
  button-primary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    borderColor: "{colors.foreground}"
    borderWidth: "1px"
    boxShadow: "{shadows.offset}"
    rounded: "{rounded.default}"
    padding: "0.5rem 1rem"
    height: "2.5rem"
  button-primary-hover:
    boxShadow: "{shadows.offset-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    borderColor: "{colors.border}"
    borderWidth: "1px"
    rounded: "{rounded.default}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.default}"
  button-danger:
    backgroundColor: "{colors.danger-grad-to}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.default}"
    padding: "0.5rem 1rem"
    height: "2.5rem"
  badge-default:
    backgroundColor: "{colors.tint-accent-strong}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.default}"
    padding: "0.125rem 0.625rem"
    typography: "{typography.label}"
  badge-success:
    backgroundColor: "{colors.tint-success-strong}"
    textColor: "{colors.success-text}"
    rounded: "{rounded.default}"
    padding: "0.125rem 0.625rem"
  badge-danger:
    backgroundColor: "{colors.tint-danger-strong}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.default}"
    padding: "0.125rem 0.625rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
    boxShadow: "{shadows.card}"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    borderColor: "{colors.border}"
    rounded: "{rounded.default}"
    height: "2.5rem"
    padding: "0.5rem 0.75rem"
  input-error:
    borderColor: "{colors.danger-text}"
  checkbox:
    backgroundColor: "{colors.input}"
    borderColor: "{colors.border}"
    rounded: "{rounded.hairline}"
    size: "1rem"
  checkbox-checked:
    backgroundColor: "{colors.accent}"
    borderColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  tab-selected:
    backgroundColor: "{colors.tint-accent-strong}"
    textColor: "{colors.accent-text}"
    borderColor: "{colors.edge-accent}"
    rounded: "{rounded.default}"
    padding: "0.25rem 0.625rem"
  tab-idle:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    borderColor: "{colors.border}"
    rounded: "{rounded.default}"
---

## Overview

**Creative North Star: "The Calibrated Instrument"**

This is an instrument, and its identity is its rigour. Every value in this system was measured before it shipped, and the measurement is usually still recorded next to it: gradient stops computed stop-by-stop because white text on the old ones fell to 2.98:1 on hover; an 11px type floor set after an 8.8px label was found on one of the highest-value badges in the app; tint alphas made *lower* on the light palette because the same wash reads stronger over white than over near-black. Nothing here is present on taste alone. When a value cannot be justified, it is not a style choice — it is an open question.

The surface is dark by default because that is the condition a developer tool is actually used in, and the palette is cool and near-neutral so that the five semantic signal colours have somewhere quiet to land. Density is high and deliberate: this reader is a practitioner watching a protocol exchange, and information rank is carried by size, tone and tint rather than by whitespace. Explanation is everywhere — help popovers, hints, inline prose, a glossary — but it is layered *underneath* the instrument rather than displacing it.

The system is **instrument first, teacher second**. Where scanability and comprehension pull apart, scanability wins on the debugging surfaces, and the teaching is carried by the detail layer. This is the one trade that shapes everything else.

**The shape of the thing is a ruled rectangle.** Two visual directions were built out in full for this application — a *transcript* for exchange content and a *register* for the trace log — and both arrived at near-square corners independently, because a document and a logbook are ruled rectangles rather than collections of pills. The 12px cards and 9999px buttons that preceded them came from a component-library default and were never argued for. That convergence is now the whole system's shape, and both directions survive as scoped worlds: `styles/transcript.css` (`.tx`, used by `ParSection`) and `styles/register.css` (`.rg`, used by `TracePanel`).

**Key Characteristics:**
- Dark-first, with a complete second palette rather than an inverted one
- Cool near-neutral ground; colour reserved for semantics
- Five signal roles × three intensity steps, never raw shade literals
- Near-square throughout: 1–3px radii, with `rounded-full` reserved for actual circles
- Rank carried by weight and tone; exactly one filled control in the application
- Monospace for anything that travelled the wire
- Motion only where an event needs a cue, at amplitudes below the vestibular threshold

## Colors

A cool, near-neutral ground built so that five semantic signals can be read at a glance without any of them shouting.

### Primary
- **Signal Indigo** (`#6366f1` dark / `#4f46e5` light): the single interactive accent. It marks what can be acted on — focus rings, the selected tab, links, a checked box, inline `code` in prose — and nothing else. It is never decorative.
- **Signal Indigo Text** (`#a5b4fc` dark / `#4338ca` light): the accent as *text*, lightened on dark and darkened on light so it clears AA against the surfaces it sits on. Do not use the raw accent for body-size text in either palette.

### Neutral
- **Observatory Ground** (`#020617` dark / `#f8fafc` light): the page. On dark it is also the code-well colour, which is why the sunken surfaces read as holes cut in the page rather than panels laid on it.
- **Instrument Card** (`#0f172a` dark / `#ffffff` light): the working surface. Every panel, section and pane.
- **Raised Panel** (`#1e293b` dark / `#f1f5f9` light): one step above the card — popovers, floating help.
- **Muted Field** (`#1e293b` dark / `#e9eef4` light): inert fills, disabled grounds, inactive tabs.
- **Primary Text** (`#f1f5f9` dark / `#0f172a` light) and **Card Text** (`#e2e8f0` / `#0f172a`): the two reading colours.
- **Secondary Text** (`#cbd5e1` dark / `#334155` light): the rank between primary and muted. It exists because collapsing it into either neighbour flattened a hierarchy the dense panels depend on.
- **Muted Text** (`#94a3b8` dark / `#55637a` light): labels, hints, metadata.
- **Hairline** (`#1e293b` dark / `#d8dfe8` light): every border and divider.

### Tertiary — the five signal roles
Each role exists as **three tokens, not eleven opacities**: a subtle fill (`tint-*`), an emphasised fill (`tint-*-strong`), and an edge (`edge-*`). All are deliberately translucent, because these surfaces sit over cards, over the page and over each other, and a solid colour shows a seam wherever two of them meet.

- **Accent** (indigo) — the interactive and the informational-primary state.
- **Success** (emerald) — a completed exchange, a validated signature, a passing check.
- **Warning** (amber) — a deviation that still works; a non-conformant but tolerated shape.
- **Danger** (red) — a refusal, a failed validation, a destructive action.
- **Info** (sky) — neutral protocol commentary; something worth reading, not worth acting on.

Each role also has a `*-text` ink, and that ink is the colour the role uses **everywhere it is not a fill**: an errored input's border, a status dot, the message under the field. A role that is one colour as a border and another as text is two roles.

### Named Rules

**The Both-Palettes Rule.** Every colour is defined at token level in both palettes, and nothing is defined *only* inside a media query. A colour that exists in one branch and not the other is how a page ends up rendering one theme's text on the other theme's ground. `check:theme` enforces this mechanically.

**The Measured Value Rule.** No colour pairing ships without a contrast measurement in *both* palettes. `check:contrast` scores text tokens against surface tokens from the built stylesheet; anything it structurally cannot see — a gradient, text over an image — is computed by hand and the number is recorded in a comment beside the token. A value with no measurement behind it is not finished.

**The No Literals Rule.** Never write a raw Tailwind shade utility — a `bg-<hue>-500/10`, a `text-<neutral>-300`, a `border-<hue>-500/30`. 121 such utilities across ~30 files were replaced by the tint scale, and 87 neutral-shade literals by the surface tokens, precisely because a literal chosen against `#020617` cannot be re-themed. If a needed colour has no token, add a token.

**The Colour Is Meaning, Never Rank Rule.** The five signal roles say what the *server* said. Nothing may spend those colours on importance. This is why the primary button is no longer a filled indigo gradient: with it, the loudest object on any screen was whichever control the page considered most important, and two colour systems ran at once sharing a hue — which in a debugger trains the reader to discount the only colour carrying information. Rank is now carried by weight. **Exactly one filled control exists in the application, `Button` variant `danger`,** because destroying a token or revoking a grant is a meaning rather than a rank, and it is the one action here that cannot be undone.

**The One Signal Rule.** A state gets one visual carrier. The server-status dot was a colour *and* a matching glow saying the same thing; it is now the colour alone. A second carrier does not add emphasis, it adds a thing to keep in sync.

**The Accent Gradient Is The Mark.** `accent-grad-*` survives at exactly one call site — the 7×7 logo mark in the header. It is brand, not affordance, and it is the only place in the application where the accent is used as decoration.

## Typography

**Body Font:** Inter (with `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif)
**Mono Font:** JetBrains Mono (with `Fira Code`, `ui-monospace`, `SFMono-Regular`, Menlo, Monaco, Consolas, monospace)

**Character:** Neutral and dense on purpose. Inter carries a lot of small text without becoming noisy, and JetBrains Mono is doing real work rather than styling — it is how the reader tells what actually travelled the wire from what the interface is saying about it.

The body stack is set once, on `body`. A scoped world that wants the same face inherits it and declares nothing; restating the stack makes a second place the application's face is named, and two declarations of one thing is how the next person picks the wrong one.

### Hierarchy
- **Title** (600, `1.125rem` / 1.4): card and section headings. The largest type in normal use.
- **Body** (400, `0.875rem` / 1.5): the document default, set on `body`. Prose, descriptions, field values.
- **Label** (500, `0.75rem` / 1.5): the workhorse. Field labels, tab text, badge text, table headers.
- **Caption** (500, `0.6875rem` / 1.45, `0.1em` tracking, often uppercase): sidebar section headings, metadata, the smallest rank. **This is the floor.**
- **Mono** (400, `0.75rem` / 1.5): tokens, JSON, headers, request bodies, and inline `code` in prose — which also takes Signal Indigo Text.

### Named Rules

**The 11px Floor.** `0.6875rem` (11px) is the smallest type in the system and nothing goes below it. Six arbitrary sizes — `0.55`, `0.6`, `0.65`, `0.7`, `0.72` and `0.8rem` — once accounted for 91 of 253 font-size declarations, crowded into a quarter-rem band where `0.7` and `0.72` differed by 0.32px. When secondary text comes in four indistinguishable sizes, size stops encoding rank.

**The Five Sizes Rule.** The scale is Title / Body / Label / Caption / Mono, and that is the whole of it. If a new size seems necessary, the hierarchy is wrong somewhere else.

**The Wire Rule.** Anything that came from or goes to the authorization server is monospace: tokens, claims, JSON, HTTP headers, parameter names. Anything the interface says *about* those things is Inter. The reader should never have to guess which they are looking at.

## Layout

A fixed three-zone shell: a **14rem sidebar**, a scrolling content column, and an optional evidence rail.

- **Header:** `min-h-12`, sticky at `top-0` / `z-40`, hairline bottom border, `bg-card/50` with `backdrop-blur-sm` so content dissolves under it rather than colliding with it.
- **Sidebar:** `14rem`, `p-2` with `space-y-1` items, section headings in Caption uppercase with `0.1em` tracking. Hidden below `lg`.
- **Content:** `max-w-5xl`, centred, padding stepping `1rem` → `1.5rem` (`lg`) → `2rem` (`xl`).
- **Evidence rail:** ~380px default beside the content pane on wide viewports.

**Scroll containment is structural, not cosmetic.** The shell is `h-screen overflow-hidden`; the sidebar's `nav` and `main` each own their own `overflow-y-auto`. Without that the document grew to 2,694px on a 900px viewport, the sidebar became 2,646px of it, and the navigation scrolled away with the page. The containment is applied at `lg:` only — below that the sidebar is hidden and the two reading columns stack.

Spacing runs on a 4px base. Cards are padded `1.5rem`; gaps between related controls are `0.375rem`–`0.5rem`; sections separate at `1rem`.

## Elevation & Depth

**Tonal first, shadow confirms.** Four surface levels carry the hierarchy on their own — code well (`#020617`) sinks below the page, the page sits below the card (`#0f172a`), and the raised panel (`#1e293b`) sits above it. The shadow is a quiet reinforcement that keeps a card from dissolving into the page, not the mechanism of depth. On dark this is provable: the card shadow is near-black against a near-black ground and is almost invisible, so tone must already be doing the work.

Shadows are **palette-specific tokens**, not one declaration reused. A hard-coded neutral-shade shadow was chosen against `#020617`, where it is invisible; the same declaration on the light palette is a near-black halo, and it landed on the page every learner reaches at the end of the headline flow. A shadow is a colour like any other and belongs in the palette.

### Shadow Vocabulary
- **Offset** (`1px 1px 0 0 var(--foreground)`, deepening to `2px 2px` on hover): the primary button, and nothing else. It is a hard shadow with no blur and no colour of its own — weight rather than lift, which is how rank is signalled once colour is no longer available for it.
- **Card** (dark: `0 10px 15px -3px rgb(2 6 23 / 0.8), 0 4px 6px -4px rgb(2 6 23 / 0.8)` · light: `0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)`): the default `Card`. Separation, not lift.
- **Card Elevated** (dark: `0 25px 50px -12px rgb(2 6 23 / 0.85)` · light: `0 20px 25px -5px rgb(15 23 42 / 0.12), 0 8px 10px -6px rgb(15 23 42 / 0.08)`): reserved for genuinely floating surfaces.

### Named Rules

**The Sunken Code Rule.** Code wells recede; nothing else does. Recession means "this is data the server produced", and it is the only inward direction in the system.

## Shapes

**One scale, four steps, and every corner in the application comes from it.**

| Token | Value | Where |
|---|---|---|
| `--radius-sm` | `1px` | checkboxes, the tightest chips |
| `--radius` | `2px` | the bare `rounded` utility — the default corner |
| `--radius-md` / `--radius-lg` | `2px` | buttons, badges, tabs, inputs, wells |
| `--radius-xl` | `3px` | cards, panels, popovers |
| `rounded-full` | `9999px` | **circles only** — five call sites |

**The scale is the lever.** 130 `rounded-*` call sites across 48 files take their shape from these four values, and moving the whole application from soft-rectangle to near-square required editing none of them: Tailwind generates its radius utilities from the theme, so redefining the scale moves every surface at once. That is also what makes it reversible — restoring the four values rolls the migration back in one edit with no call site left half-migrated.

Two details in that are worth keeping, because both were found by reading the *built* stylesheet rather than the source:

- **`--radius` is not `--radius-md`.** Tailwind's bare `rounded` utility reads `--radius`, so leaving it out stranded 39 call sites across 16 files at the built-in `0.25rem` while everything around them moved to 2px — a half-migration invisible in the source and obvious in the compiled CSS.
- **`rounded-full` is deliberately not redefined.** Five of its eight uses are genuinely circular — two 6px status dots, a 28px step marker, a 20px help button and a 20px step number — and a scale change cannot tell those apart from a pill that should become square. The three pills were migrated at their call sites, where the judgment is visible.

Borders are always a single hairline in the `border` token. There are no double borders, no coloured left-edges, and no dashed strokes. Where a container needs emphasis it takes a tint fill and its matching `edge-*` border, never a heavier stroke.

### Named Rules

**The Ruled Rectangle Rule.** Everything is a rectangle with a corner just soft enough to look intentional. Radius no longer encodes behaviour — it did, back when pills meant "pressable", and that scheme died the moment a badge (not pressable) and a button (pressable) both needed to be pills. Behaviour is encoded by weight, border and fill; shape is constant.

**The Circle Test.** `rounded-full` is permitted only where the element is as tall as it is wide. All five survivors pass it. If it is not a circle, it is not `rounded-full`.

## Components

### Buttons
- **Shape:** `2px` at every size.
- **Sizes:** default `2.5rem` tall, `1rem` horizontal; `sm` `2rem` / `0.75rem` at Label size; `lg` `3rem` / `1.5rem`; `icon` a `2.25rem` square.
- **Primary (`default`):** transparent, a `1px` foreground border, foreground text, and a hard `1px 1px` offset shadow in the foreground colour that deepens to `2px 2px` on hover. Weight, not brightness; the hover deepening reads as "pressed" the way the old darkening gradient did.
- **Danger:** the one filled control — a left-to-right gradient, `#b91c1c` → `#dc2626`, white text, hover darkening to `#991b1b` → `#b91c1c`. Every stop clears 4.5:1 against white.
- **Secondary / Outline:** transparent with a hairline border, filling to `muted` on hover. **Ghost:** transparent, same hover, no border.
- **Focus:** `ring-2` in the accent with a 2px offset, on `focus-visible` only.
- **Loading:** a spinner replaces nothing — it is prepended, and the label stays.

### Badges
- **Style:** `2px` radius, `0.125rem 0.625rem`, Label size, weight 500.
- **Colour:** each of the five roles pairs its `tint-*-strong` fill with its `*-text` foreground. No borders.

### Cards
- **Corner:** `3px`. **Padding:** `1.5rem`. **Background:** `card` on `card-foreground`.
- **Variants:** `default` (card shadow), `elevated` (elevated shadow), `bordered` (hairline, no shadow). Exactly one of the three; never a border *and* a shadow.
- **Anatomy:** Header (`mb-2`), Title (Title size, 600), Description (Body, muted), Content, Footer (`mt-4`, flex, `gap-2`).

### Inputs
- **Style:** `2.5rem` tall, `2px` radius, hairline border, `input` ground, `0.75rem` horizontal padding, Body size.
- **Focus:** `ring-2` in the accent with a 1px offset. `focus:outline-none` is only ever paired with a visible ring.
- **Error:** the border and ring turn `danger-text` — the same ink the message below renders in — with `role="alert"` and `aria-describedby` tying the two together. `Input`, `Select` and `Textarea` all take an `error` prop that does this; a call site that hand-rolls a red border and a paragraph gets the colour and loses the wiring.
- **Hint:** Caption size, muted, rendered through Prose so backticks become code.

### Checkbox
The primitive that did not exist, which is why every shade literal in this codebase was one. Nine call sites across eight files each rebuilt the control by hand, and **every one reached for an `accent-<hue>-500` literal**, because `accent-color` has no token and the native control offers no other colour hook.

- **Style:** `1rem` square, `1px` radius, hairline border on `input` ground; checked, it fills and borders in the accent.
- **The mark is drawn, not shipped:** a rotated pseudo-element border, so it inherits the palette and costs no icon dependency.
- **The native input is kept and its `appearance` replaced.** It is already in the accessibility tree with the right role and state, and already keyboard-operable; what needed replacing was only the paint.
- **Focus** is a real `ring-2`, matching the other primitives. A control that does not ring is the inconsistency this component exists to end.
- With a `label` it renders its own wired label and optional `aria-describedby` hint; with none it renders the box alone, for a call site that owns its layout.

### Tabs
- **Style:** `2px` radius, `0.25rem 0.625rem`, Label size, always bordered.
- **Selected:** `tint-accent-strong` fill, `accent-text` foreground, `edge-accent` border.
- **Idle:** `muted/30` fill, muted foreground, hairline border, resolving to full foreground on hover.

### Navigation
- Sidebar sections are Caption uppercase at `0.1em` tracking; items are Label size with a `shrink-0` leading icon that inherits `currentColor`.
- The active item takes the accent tint treatment, matching the selected tab. One selection language across the app.

### Prose
Inline markdown rendered as React elements, not HTML — because some of these strings interpolate values that came from an authorization server. Supports exactly three forms: `` `code` `` (monospace in Signal Indigo Text), `**strong**`, `*emphasis*`. Every explanation in the data files is written this way.

### Code Wells
Sunken `code` ground, `2px` radius, Mono. Labelled with a Caption-size uppercase heading and a copy affordance that swaps to a success-coloured check for 200ms on success.

## Do's and Don'ts

### Do:
- **Do** add a token when a needed colour is missing, and define it in **both** palettes in the same edit.
- **Do** record the measurement beside any value a gate cannot check — gradient stops, text over imagery, anything `check:contrast` structurally cannot see.
- **Do** change shape at the scale, never at the call site. If a corner is wrong everywhere, one of four values is wrong.
- **Do** read the *built* stylesheet when you change the theme. A scale you have not seen compiled is a scale you are guessing about, and the source cannot show you which utility maps to which variable.
- **Do** use the three-step tint scale (`tint-*`, `tint-*-strong`, `edge-*`) for every emphasised surface. Three steps were enough for every case in this app; the eleven opacities that preceded them were incidental.
- **Do** set anything that travelled the wire in Mono, and anything the interface says about it in Inter.
- **Do** reach for the existing primitive's `error`, `label` and `hint` props before hand-rolling the same thing in a call site. The bespoke version reliably keeps the colour and drops the ARIA.
- **Do** pair `focus:outline-none` with a visible `ring-ring` ring, always.
- **Do** keep new motion under ~250ms and under ~6% of scale, and let the blanket reduced-motion rule collapse it.
- **Do** slow a spinner under reduced motion rather than stopping it — a spinner that stops reads as a hung request.

### Don't:
- **Don't** use Tailwind shade literals. They encode an assumption about which palette is active.
- **Don't** write a literal utility class name *in prose* — a comment, a docstring, or this document. **Tailwind scans them and compiles what it finds**, so a note explaining that a literal was removed silently ships the rule it is documenting the removal of. Four such comments were live at once, including one inside the very component written to abolish them, and every one shipped a rule no element used. Removing a single pair of them measured 316 bytes off the stylesheet. Break the token when you must name it: `accent-<hue>-500`, not the real thing.
- **Don't** spend a signal colour on importance. Rank is weight; colour is meaning.
- **Don't** add a second filled control. There is one, it deletes things, and its scarcity is the signal.
- **Don't** ship type below `0.6875rem`, or add a sixth size to the scale.
- **Don't** use `rounded-full` on anything that is not a circle.
- **Don't** restate the body font stack in a scoped stylesheet. It inherits.
- **Don't** put a thick coloured border on one edge of a card. A side-tab accent is the most recognisable tell of generated UI, and this system emphasises with tint plus `edge-*` instead.
- **Don't** reach for a violet or cyan gradient as decoration. The two gradients that remain are the danger button and the logo mark, both deliberate; a third is drift toward the generic dev-tool dashboard this system is explicitly not.
- **Don't** add decorative background texture. The `.bg-grid` hairline field is legacy, not a pattern to extend.
- **Don't** let marketing-page habits in: no hero type, no centred landing sections, no scroll-triggered reveals, no stat tiles.
- **Don't** add illustration, mascots, or celebratory empty states. An empty state here says what to do next, in Body text.
- **Don't** stack toolbars or bury actions in dropdowns to save space. Density is solved with tone and rank, not with chrome.
- **Don't** give a card both a border and a shadow — pick the variant.
- **Don't** use Signal Indigo for anything that is not actionable.
