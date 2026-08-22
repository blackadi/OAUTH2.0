#!/usr/bin/env node
/**
 * WCAG contrast for the colours this client actually uses, in both themes.
 *
 * **Why this is not a substitute for looking, and why it is still worth more.** Nobody had opened the
 * light theme in a browser when it shipped: the palettes compiled and both defined the same tokens, but
 * ~140 accent literals (`text-indigo-300`, `text-amber-300`, `text-emerald-300`) were chosen against a
 * near-black ground and inherited unchanged. An eye would notice the worst of those; it would not tell
 * you which, by how much, or against which surface. This does — from the real values, read out of the
 * built stylesheet rather than from a table someone typed.
 *
 * The two sources are both authoritative:
 *   - Tailwind's palette, as oklch, from `dist/assets/*.css` — the values actually shipped.
 *   - The app's own light and dark palettes, from `globals.css`.
 *
 * **What it cannot see.** Which surface a given piece of text truly sits on. Each accent colour is
 * scored against every plausible surface in the theme, and reported as failing only when it fails
 * against *all* of them — so a colour flagged here is a genuine problem wherever it appears, while one
 * that passes may still be misused in a spot this cannot know about.
 *
 * Usage: node scripts/check-contrast.mjs [--all]
 *   --all   list every pair, not only the failures
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const CLIENT = join(REPO_ROOT, "client");
const CSS_DIR = join(CLIENT, "dist", "assets");
const GLOBALS = join(CLIENT, "src", "styles", "globals.css");

// ── colour maths ─────────────────────────────────────────────────────────────────────────────────

/** oklch() → linear sRGB. Björn Ottosson's matrices; the inverse of the usual sRGB→Oklab path. */
function oklchToLinearRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function hexToLinearRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join("") : clean;
  return [0, 1, 2].map((i) => {
    const srgb = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    // sRGB → linear, the transfer function WCAG 2.1 specifies.
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
}

/** WCAG 2.1 relative luminance, from linear RGB. Clamped: out-of-gamut oklch can go slightly negative. */
function luminance([r, g, b]) {
  const c = (v) => Math.min(1, Math.max(0, v));
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ── inputs ───────────────────────────────────────────────────────────────────────────────────────

const cssFile = readdirSync(CSS_DIR).find((f) => f.endsWith(".css"));
if (!cssFile) {
  console.error("✗ No built stylesheet. Run `npm --prefix client run build` first.");
  process.exit(1);
}
const built = readFileSync(join(CSS_DIR, cssFile), "utf8");
const globals = readFileSync(GLOBALS, "utf8");

/** Tailwind's shipped palette, as linear RGB. */
const palette = new Map();
for (const m of built.matchAll(
  /--color-([a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g,
)) {
  palette.set(m[1], oklchToLinearRgb(Number(m[2]) / 100, Number(m[3]), Number(m[4])));
}

/** The app's own two palettes. */
function readPalette(selectorSource) {
  const out = {};
  for (const m of selectorSource.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g)) out[m[1]] = m[2];
  return out;
}
const darkBlock = globals.match(/:root \{([\s\S]*?)\}/)[1];
const lightBlock = globals.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)[1];
const THEMES = {
  dark: readPalette(darkBlock),
  light: readPalette(lightBlock),
};

/** The surfaces text can plausibly sit on. */
const SURFACE_TOKENS = ["background", "card", "muted", "code", "surface-2"];

// ── what the source actually uses ────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !full.includes(`${join("src", "test")}`)) out.push(full);
  }
  return out;
}

const used = new Map(); // "indigo-300" or "danger-text" -> count
for (const file of walk(join(CLIENT, "src"))) {
  const source = readFileSync(file, "utf8");
  // Tailwind shades…
  for (const m of source.matchAll(/\btext-([a-z]+-\d{3})\b/g)) {
    used.set(m[1], (used.get(m[1]) ?? 0) + 1);
  }
  // …and the app's own semantic text tokens, which is the whole point after the migration. Without
  // this the checker would report a clean sheet purely because the literals it knew how to score had
  // been renamed — a false pass, and the worst possible outcome for a check like this.
  for (const m of source.matchAll(/\btext-((?:accent|success|warning|danger|info)-text)\b/g)) {
    used.set(m[1], (used.get(m[1]) ?? 0) + 1);
  }
}

// ── score ────────────────────────────────────────────────────────────────────────────────────────

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;
const showAll = process.argv.includes("--all");

console.log(`Tailwind colours in the build : ${palette.size}`);
console.log(`text-* literals in use        : ${used.size} distinct, ${[...used.values()].reduce((a, b) => a + b, 0)} usages`);
console.log(`Thresholds                    : ${AA_TEXT}:1 body text, ${AA_LARGE}:1 large/UI (WCAG 2.1 AA)\n`);

let failures = 0;

for (const theme of ["dark", "light"]) {
  const surfaces = SURFACE_TOKENS.filter((t) => THEMES[theme][t]).map((t) => ({
    name: t,
    rgb: hexToLinearRgb(THEMES[theme][t]),
  }));

  const rows = [];
  for (const [colour, count] of [...used.entries()].sort((a, b) => b[1] - a[1])) {
    // A Tailwind shade is one value in both themes; a semantic token has a per-theme value.
    const themeHex = THEMES[theme][colour];
    const fg = themeHex ? hexToLinearRgb(themeHex) : palette.get(colour);
    if (!fg) continue;
    const scored = surfaces.map((s) => ({ surface: s.name, ratio: contrast(fg, s.rgb) }));
    const best = scored.reduce((a, b) => (a.ratio > b.ratio ? a : b));
    rows.push({ colour, count, best, scored });
  }

  const bad = rows.filter((r) => r.best.ratio < AA_TEXT);
  failures += theme === "light" ? bad.length : 0;

  console.log(`── ${theme.toUpperCase()} ──`);
  for (const r of showAll ? rows : bad) {
    const flag = r.best.ratio < AA_LARGE ? "✗✗" : r.best.ratio < AA_TEXT ? "✗ " : "✓ ";
    console.log(
      `  ${flag} text-${r.colour.padEnd(14)} ${String(r.count).padStart(3)}×   best ${r.best.ratio.toFixed(2)}:1 on --${r.best.surface}`,
    );
  }
  if (!bad.length) console.log("  ✓ every literal clears 4.5:1 against its best surface");
  console.log("");
}

console.log(
  failures === 0
    ? "✓ no light-theme contrast failures"
    : `✗ ${failures} colour(s) fail AA against every light surface — see above`,
);
process.exit(failures === 0 ? 0 : 1);
