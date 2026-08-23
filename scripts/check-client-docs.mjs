#!/usr/bin/env node
/**
 * Every documentation entry the client asks for must exist, every entry that exists must be reached,
 * and every section must be documented in the client README.
 *
 * **Why.** The explanation registry had eight holes and nothing could see them. `FederationSection`
 * asked `getDoc('federation', …)` for a section that did not exist, so that page rendered no
 * documentation at all. The `backchannel-logout` entries were written and never rendered — three good
 * paragraphs with no caller. `auth-flows.jwt_bearer` was missing, so the JWT Bearer tab had no
 * explanation. Four `mcp` entries had no surface. `StepUpSection` kept its doc inline, outside the
 * registry every other section reads from. And the README documented 13 of 20 sections.
 *
 * All of that is mechanically detectable, which is the same argument `check-route-coverage.mjs` makes
 * about endpoints: the question that finds these as a list is *"which keys does nobody ask for, and
 * which asks does nobody answer?"*
 *
 * What it cannot see: whether an entry is any *good*. It measures wiring, not prose — a smoke detector,
 * not a fire inspection.
 *
 * Usage: node scripts/check-client-docs.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");
const DOCS_PATH = join(CLIENT_SRC, "data", "operationDocs.ts");
const APP_PATH = join(CLIENT_SRC, "App.tsx");
const README_PATH = join(REPO_ROOT, "client", "README.md");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !full.includes(`${join("src", "test")}`)) out.push(full);
  }
  return out;
}

// ── what the registry defines ────────────────────────────────────────────────────────────────────
const docsSource = readFileSync(DOCS_PATH, "utf8");

/**
 * Section blocks are two-space indented; entry keys inside them are four-space indented.
 *
 * Quotes around the key are optional: Prettier removes them where they are unnecessary
 * (`'authorization_code':` → `authorization_code:`), and a checker that depends on a formatter's
 * choice fails for the wrong reason. Found exactly that way — the first `prettier --write` over this
 * repo turned every one of these into a false "asked for but not defined".
 */
const defined = new Set();
let currentSection = null;
for (const line of docsSource.split("\n")) {
  const section = line.match(/^ {2}'?([a-z0-9-]+)'?: \{$/);
  if (section) {
    currentSection = section[1];
    continue;
  }
  const entry = line.match(/^ {4}'?([a-zA-Z0-9_-]+)'?: \{$/);
  if (entry && currentSection) defined.add(`${currentSection}.${entry[1]}`);
}

// ── what the components ask for ──────────────────────────────────────────────────────────────────
const asked = new Map(); // "section.key" -> file:line ; dynamic asks recorded as "section.*"
const dynamicSections = new Set();

for (const file of walk(CLIENT_SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/getDoc\(\s*'([a-z0-9-]+)'\s*,\s*'([a-zA-Z0-9_-]+)'\s*\)/g)) {
      asked.set(`${m[1]}.${m[2]}`, `${relative(REPO_ROOT, file)}:${i + 1}`);
    }
    // `getDoc('mcp', activeOp)` — the key is a variable, so every entry in that section is reachable.
    for (const m of line.matchAll(/getDoc\(\s*'([a-z0-9-]+)'\s*,\s*(?!')[A-Za-z]/g)) {
      dynamicSections.add(m[1]);
    }
  });
}

const askedStatic = [...asked.keys()];
const missing = askedStatic.filter((k) => !defined.has(k));
const unreached = [...defined].filter(
  (k) => !asked.has(k) && !dynamicSections.has(k.split(".")[0]),
);

// ── README section coverage ──────────────────────────────────────────────────────────────────────
const appSource = readFileSync(APP_PATH, "utf8");
// Tolerates a line break between the two members, which Prettier introduces once the object grows
// past the print width — the same brittleness as the quotes above.
const sectionLabels = [...appSource.matchAll(/label: '([^']+)',\s*path: '\/[a-z-]+'/g)].map(
  (m) => m[1],
);
const readme = readFileSync(README_PATH, "utf8");
/**
 * A label counts as documented when a **heading** names it.
 *
 * Comparing raw strings was too strict: the sidebar says "Dynamic Client Reg." where the README says
 * "Dynamic Client Registration (DCR)", and a literal `includes` called that undocumented. Stripping
 * punctuation and matching on a prefix accepts the abbreviation.
 *
 * **Matching against headings rather than the whole document is the second half, and it was added after
 * this check gave a false pass** (2026-08-22). It normalised the entire README into one string, so the
 * new "Token Exchange" section counted as documented because the *FAPI* section's prose happened to
 * contain the phrase "token exchange with a proof". A mention inside somebody else's paragraph is not
 * documentation, and a gate that accepts one is worse than no gate: it reports coverage that is not
 * there. A heading is the smallest structure that means "this section is written up here".
 */
const normalise = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const readmeHeadings = readme
  .split("\n")
  .filter((line) => /^#{1,6}\s/.test(line))
  .map(normalise)
  .join("\n");
const undocumented = sectionLabels.filter((label) => {
  const key = normalise(label.replace(/\s*\(.*\)$/, ""));
  return !readmeHeadings.includes(key);
});

// ── report ───────────────────────────────────────────────────────────────────────────────────────
console.log(`Registry entries defined      : ${defined.size}`);
console.log(`Asked for by an exact key     : ${askedStatic.length}`);
console.log(`Sections asked dynamically    : ${dynamicSections.size} (${[...dynamicSections].sort().join(", ")})`);
console.log(`Sections in App.tsx           : ${sectionLabels.length}`);

let failed = false;

if (missing.length) {
  failed = true;
  console.error(`\n✗ ${missing.length} documentation key(s) asked for but not defined:`);
  for (const key of missing.sort()) console.error(`    ${key}   asked at ${asked.get(key)}`);
  console.error(`  Add them to ${relative(REPO_ROOT, DOCS_PATH)}, or stop asking.`);
}

if (unreached.length) {
  failed = true;
  console.error(`\n✗ ${unreached.length} documentation entr(ies) defined but never rendered:`);
  for (const key of unreached.sort()) console.error(`    ${key}`);
  console.error("  Wire them to a surface, or delete them. Written-and-unreachable is the worst of both.");
}

if (undocumented.length) {
  failed = true;
  console.error(`\n✗ ${undocumented.length} section(s) in App.tsx with no *heading* in client/README.md:`);
  for (const label of undocumented) console.error(`    ${label}`);
}

if (failed) process.exit(1);

console.log("\n✓ every asked-for key exists, every entry is reachable, every section has a README heading");
