#!/usr/bin/env node
/**
 * Every semantic colour utility the client uses must be backed by a `@theme` entry.
 *
 * **This check exists because the whole palette was dead and nothing noticed.** Tailwind v4 generates
 * utilities from `@theme`, not from custom properties on `:root`. `client/src/styles/globals.css`
 * declared `--card`, `--border`, `--muted-foreground` and friends on `:root` and stopped there, so
 * `bg-card`, `border-border`, `text-muted-foreground`, `bg-muted`, `bg-input`, `ring-ring`,
 * `bg-background` and `text-foreground` were classes that did not exist — ~160 usages across 28 files
 * emitting nothing. Confirmed against the built stylesheet: 0 of 8 selectors present.
 *
 * The symptoms were entirely visual, so every gate stayed green: transparent cards, invisible hairline
 * borders, secondary text at full foreground contrast, and — because the form primitives pair
 * `ring-ring` with `focus:outline-none` — no visible keyboard focus anywhere in the app. Typecheck,
 * lint, the test suite and `vite build` cannot see any of that. This can.
 *
 * Deliberately offline and structural: it reads the stylesheet and the sources, never the build output,
 * so it costs milliseconds and runs on every push. It answers one question — *is every semantic
 * utility mapped?* — and does not attempt to judge whether the resulting colour is a good one.
 *
 * **It answers a second question too**: *is every font size on the three-step type scale?* Same
 * failure mode, same invisibility to every other gate — see the note on `arbitrarySizes` below.
 *
 * Usage: node scripts/check-theme-tokens.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Anchored to this file, not the working directory, so `node scripts/check-theme-tokens.mjs` from the
// repo root and `npm run check:theme` from inside `client/` both work. `import.meta.dirname` needs
// Node 20.11+, comfortably under the repo's declared Node 22 floor.
const REPO_ROOT = join(import.meta.dirname, "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");
const CSS_PATH = join(CLIENT_SRC, "styles", "globals.css");

/** Utility prefixes that can take a colour token. */
const PREFIXES = [
  "bg", "text", "border", "ring", "divide", "outline", "fill", "stroke",
  "placeholder", "caret", "accent", "decoration", "shadow", "from", "to", "via",
];

/**
 * TS/TSX only, deliberately. Utilities reach the compiler through `className` strings, and there is no
 * `@apply` anywhere in `client/src` — so a stylesheet is the one place a `<prefix>-<token>` string is
 * *not* a utility. Scanning CSS reported `border-radius: 3px` in the scrollbar rule as a use of a
 * `radius` colour token. If `@apply` is ever introduced, add `.css` back and skip property
 * declarations rather than whole files.
 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const css = readFileSync(CSS_PATH, "utf8");

// The vocabulary of semantic tokens is whatever `:root` defines — that is the design system's own
// declaration of what it considers a named colour. Non-colour tokens (`--radius`, `--sidebar-width`)
// are filtered out below by requiring an actual utility usage.
const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
const declared = [...rootBlock.matchAll(/--([a-z-]+)\s*:/g)].map((m) => m[1]);

// What the `@theme` block maps. `inline` is optional as far as this check is concerned.
const themeBlocks = [...css.matchAll(/@theme[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
const mapped = new Set([...themeBlocks.matchAll(/--color-([a-z-]+)\s*:/g)].map((m) => m[1]));

// Longest-first so `muted-foreground` is matched before `muted`.
const vocabulary = [...declared].sort((a, b) => b.length - a.length);

const used = new Map(); // token -> Set of "file:line class"

/**
 * Arbitrary font sizes, collected in the same pass.
 *
 * **Why this belongs in the theme check.** The type scale is a `@theme` token set exactly like the
 * palette is, and it failed the same way: UX-04 found **91 of 253 font-size declarations arbitrary**,
 * with `text-[0.7rem]` and `text-[0.72rem]` — 0.32px apart — both in the codebase, and
 * `text-[0.55rem]` (**8.8px**) on the "verified here" badge, one of the highest-value labels in the
 * app. Four near-identical sizes for one role means size stops encoding rank.
 *
 * Nothing else can see this. An arbitrary size is a *valid* Tailwind utility, so it compiles, renders,
 * type-checks and lints; `check-contrast.mjs` scores colour and would pass 8px text at 21:1. The fix
 * was three `@theme` steps with a floor at `--text-2xs: 0.6875rem` (11px), and this is what keeps a
 * ninety-second edit from reintroducing the ninety-second one.
 */
const arbitrarySizes = []; // "file:line class"
const ARBITRARY_SIZE = /\btext-\[[0-9.]+(?:rem|px|em)\]/g;

for (const file of walk(CLIENT_SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const hit of line.matchAll(ARBITRARY_SIZE)) {
      arbitrarySizes.push(`${relative(REPO_ROOT, file)}:${i + 1}  ${hit[0]}`);
    }
    for (const token of vocabulary) {
      // The token must be a whole utility suffix: `text-muted-foreground` must not register as
      // `muted`, and `bg-border` must not be found inside `border-border`.
      const re = new RegExp(
        `\\b(?:${PREFIXES.join("|")})-${token}(?![a-z0-9-])`,
        "g",
      );
      for (const hit of line.matchAll(re)) {
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(`${relative(REPO_ROOT, file)}:${i + 1}  ${hit[0]}`);
      }
    }
  });
}

const missing = [...used.keys()].filter((t) => !mapped.has(t)).sort();

/**
 * Both palettes must define the same tokens.
 *
 * A colour defined in one branch and not the other is the classic unreadable-page bug: the light branch
 * inherits the dark branch's value for whatever it forgot, and you get one theme's text on the other
 * theme's ground. Comparing the sets catches it without needing to look at the page.
 */
const paletteBlocks = [
  { label: ':root (dark default)', body: rootBlock },
  {
    label: '@media (prefers-color-scheme: light)',
    body: css.match(/@media \(prefers-color-scheme: light\)\s*\{\s*:root[^{]*\{([^}]*)\}/)?.[1] ?? "",
  },
  {
    // Quote-agnostic: Prettier rewrites `[data-theme="light"]` to single quotes, and a checker that
    // depends on a formatter's choice is a checker that fails for the wrong reason.
    label: ':root[data-theme=light]',
    body: css.match(/:root\[data-theme=["']light["']\]\s*\{([^}]*)\}/)?.[1] ?? "",
  },
  {
    label: ':root[data-theme=dark]',
    body: css.match(/:root\[data-theme=["']dark["']\]\s*\{([^}]*)\}/)?.[1] ?? "",
  },
];

/** Structural tokens (radius, widths) belong to the layout, not to either palette. */
const NON_COLOUR = new Set(["radius", "sidebar-width"]);
const colourTokens = (body) =>
  new Set([...body.matchAll(/--([a-z-]+)\s*:/g)].map((m) => m[1]).filter((t) => !NON_COLOUR.has(t)));

const baseline = colourTokens(paletteBlocks[0].body);
const paletteGaps = [];
for (const block of paletteBlocks.slice(1)) {
  if (!block.body) {
    paletteGaps.push(`${block.label} — block not found`);
    continue;
  }
  const defined = colourTokens(block.body);
  for (const token of baseline) {
    if (!defined.has(token)) paletteGaps.push(`${block.label} — missing --${token}`);
  }
}

console.log(`Theme tokens declared on :root : ${declared.length}`);
console.log(`Mapped in @theme              : ${mapped.size}`);
console.log(`Referenced by a utility       : ${used.size}`);

console.log(`Colour tokens per palette     : ${baseline.size}`);

if (paletteGaps.length) {
  console.error(`\n✗ ${paletteGaps.length} palette gap(s) — a token defined in one theme and not another:`);
  for (const gap of paletteGaps) console.error(`    ${gap}`);
  console.error("  A missing token inherits the other theme's value, which is how a page ends up");
  console.error("  rendering light text on a light ground.");
}

console.log(`Arbitrary font sizes          : ${arbitrarySizes.length}`);

if (arbitrarySizes.length) {
  console.error(`\n✗ ${arbitrarySizes.length} arbitrary font size(s) — the type scale has three steps and these are not on it:`);
  for (const site of arbitrarySizes.slice(0, 12)) console.error(`    ${site}`);
  if (arbitrarySizes.length > 12) console.error(`    … and ${arbitrarySizes.length - 12} more`);
  console.error("  Use text-2xs (0.6875rem/11px, the floor), text-xs or text-sm. An arbitrary value is a");
  console.error("  valid utility, so it compiles and renders — which is why no other gate can see it.");
}

if (missing.length === 0 && paletteGaps.length === 0 && arbitrarySizes.length === 0) {
  console.log("\n✓ every semantic colour utility is mapped, both palettes agree, and the type scale holds");
  process.exit(0);
}
if (missing.length === 0) process.exit(1);

console.error(`\n✗ ${missing.length} token(s) used as a utility with no @theme mapping.`);
console.error("  These classes compile to nothing. Add `--color-<token>: var(--<token>);` to the");
console.error(`  @theme block in ${relative(REPO_ROOT, CSS_PATH)}.\n`);

for (const token of missing) {
  const sites = [...used.get(token)];
  console.error(`  --color-${token}  (${sites.length} usage${sites.length === 1 ? "" : "s"})`);
  for (const site of sites.slice(0, 5)) console.error(`      ${site}`);
  if (sites.length > 5) console.error(`      … and ${sites.length - 5} more`);
}

process.exit(1);
