#!/usr/bin/env node
/**
 * check-route-coverage.mjs — answer "what was supposed to have caught this?" mechanically.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Phase 5 remediation found the same thing four times: a defect had survived because the surface
 * carrying it had **no test referencing it at all**, and the green suite therefore said nothing about it.
 *
 *   POST /api/backchannel_logout   validated 5 of 11 required steps and logged nobody out — 0 tests
 *   POST /api/jar/process          returned Authlete tickets to anonymous callers   — 0 tests
 *   GET  /api/federation/…         answered 400 for a fault that was ours           — 0 tests, and
 *                                  unmockable, because the shared Authlete mock had no `federation` member
 *
 * Reading code found those one at a time. Asking *"which routes does no test mention?"* finds them as a
 * list, in a second. That question is what this script asks.
 *
 * WHAT IT DOES NOT CLAIM
 * ----------------------
 * A route named in a test is **not** a tested route. This measures *reference*, not *assertion quality* —
 * it is a smoke detector, not a fire inspection. It is deliberately crude for the same reason
 * `check-docs.mjs` only validates mechanically-checkable drift: a check that is cheap and always right
 * about a narrow thing beats one that is clever and sometimes wrong.
 *
 * Run:  node scripts/check-route-coverage.mjs [--json] [--update-baseline]
 * Exit: 0 unless a route outside the recorded baseline is unreferenced. Wired into CI beside check-docs.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ROUTES_DIR = join(REPO, "server/src/routes");
const TEST_DIRS = [join(REPO, "server/tests/unit"), join(REPO, "server/tests/integration")];

/**
 * A BASELINE, NOT A TARGET
 * -----------------------
 * 47 of 91 routes were unreferenced when this script was written. A check that fails red on day one gets
 * ignored, so this **ratchets**: the current debt is recorded in `route-coverage-baseline.json` and the
 * script fails only when a route *not already in that file* goes unreferenced. Adding an endpoint without a
 * route-level test breaks the build; the existing debt is visible, counted, and shrinkable at leisure.
 *
 * Removing a line from the baseline is how you bank progress — `--update-baseline` rewrites it, and the
 * diff shows what changed. Never regenerate it to make a failure go away; that is the one move this design
 * cannot defend against.
 *
 * **The backlog reached zero on 2026-08-13**, so the file is now `{"unreferenced": []}`. That is the
 * intended terminal state, not a missing baseline: with nothing carried, any unreferenced route is a
 * regression and fails the build. Do not repopulate it to accommodate a new endpoint.
 */

/**
 * Routes with a deliberate reason for having no *unit/integration* reference. Each needs a reason, and the
 * reason is reviewed like any other: an allowlist that anyone can append to without justifying it decays
 * into the absence of a check.
 */
const EXEMPT = new Map([
  ["/api/openapi.json", "static document; asserted wholesale by tests/unit/routes/openapi.routes.test.ts"],
  ["/api/routes", "developer index of the routes below it; no behaviour of its own"],
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

// `router.get("/path"`, `rootRouter.post('/path'` — the two shapes this repo uses.
const ROUTE_RE = /\b\w*[Rr]outer\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

function collectRoutes() {
  const routes = [];
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(ROUTES_DIR, file), "utf8");
    for (const m of src.matchAll(ROUTE_RE)) {
      routes.push({ method: m[1].toUpperCase(), path: m[2], file: `server/src/routes/${file}` });
    }
  }
  return routes;
}

/**
 * A route is "referenced" when a test mentions its path. Path params are wildcarded, because a test
 * naturally writes a concrete id (`/api/gm/g-1`) where the route declares `/api/gm/:grantId`.
 */
function referenceMatcher(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withParams = escaped.replace(/\\?:[A-Za-z0-9_]+/g, "[^\"'`\\s)]+");
  return new RegExp(withParams);
}

/**
 * Comment lines are stripped before matching, and the reason is a live false positive: a test written for
 * `/api/nativesso` carried a comment citing `/api/jar/process` as the defect it was modelled on, and that
 * prose mention alone moved `/jar/process` out of the backlog. A route "covered" by someone else's comment
 * is the one failure mode this check cannot afford — the whole point is to be crude but never wrong about
 * the narrow thing it asserts.
 *
 * Only whole-line comments are removed (`// …`, and ` * …` inside a block). Trailing comments are left
 * alone deliberately: stripping from the first `//` on a line would also eat the tail of any line
 * containing a URL.
 */
const WHOLE_LINE_COMMENT = /^[ \t]*(?:\/\/|\/\*|\*).*$/gm;

const testSources = TEST_DIRS.flatMap((d) => {
  try {
    return walk(d).map((f) => ({
      file: relative(REPO, f),
      text: readFileSync(f, "utf8").replace(WHOLE_LINE_COMMENT, ""),
    }));
  } catch {
    return [];
  }
});

const routes = collectRoutes();
const seen = new Set();
const unreferenced = [];

for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (EXEMPT.has(r.path)) continue;

  const re = referenceMatcher(r.path);
  if (!testSources.some((t) => re.test(t.text))) unreferenced.push(r);
}

const BASELINE_FILE = join(REPO, "scripts/route-coverage-baseline.json");
const keyOf = (r) => `${r.method} ${r.path}`;

/**
 * `--triage` splits the backlog by *how blind* it is, because "47 uncovered routes" is not one problem:
 *
 *   A. no test anywhere for the module  — nothing asserts this code at all
 *   B. module has unit tests, but no test drives the route  — the CONTROLLER is covered and the
 *      **middleware wiring is not**
 *
 * B is the larger group and the one with history: `/api/jar/process` had a controller test and no auth
 * middleware; `/api/device/complete` was ungated outside development; both introspection endpoints were
 * unauthenticated. Every one of those is a wiring defect a route-level test catches and a controller test
 * cannot. Work B by module, asserting the auth posture first.
 */
if (process.argv.includes("--triage")) {
  const testFiles = TEST_DIRS.flatMap((d) => {
    try { return walk(d).map((f) => f.split("/").pop()); } catch { return []; }
  });
  const stemOf = (file) => file.replace(/^server\/src\/routes\//, "").replace(/\.routes\.ts$/, "");
  const groups = new Map();
  for (const r of unreferenced) {
    const stem = stemOf(r.file);
    const hasModuleTest = testFiles.some((t) => t.startsWith(stem.split("-")[0]) || t.includes(stem));
    const bucket = hasModuleTest ? "B" : "A";
    if (!groups.has(bucket)) groups.set(bucket, new Map());
    const byStem = groups.get(bucket);
    byStem.set(stem, [...(byStem.get(stem) ?? []), keyOf(r)]);
  }
  const a = groups.get("A") ?? new Map();
  const b = groups.get("B") ?? new Map();
  const count = (m) => [...m.values()].reduce((n, v) => n + v.length, 0);

  console.log(`A. NO test anywhere for the module — ${count(a)} route(s), highest risk`);
  for (const [stem, keys] of a) for (const k of keys) console.log(`     ${k.padEnd(46)} (${stem})`);
  console.log(`\nB. module has unit tests, route+middleware undriven — ${count(b)} route(s) in ${b.size} modules`);
  for (const [stem, keys] of [...b].sort((x, y) => y[1].length - x[1].length)) {
    console.log(`     ${String(keys.length).padStart(2)} routes  ${stem}`);
  }
  console.log(
    "\nWork B by module, one integration block each, asserting the AUTH POSTURE first — that is the\n" +
      "defect class this repo actually shipped (jar unauthenticated, device/complete ungated,\n" +
      "introspection unauthenticated). A controller test cannot see any of them.",
  );
  process.exit(0);
}

if (process.argv.includes("--update-baseline")) {
  const entries = unreferenced.map(keyOf).sort();
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ unreferenced: entries }, null, 2)}\n`);
  console.log(`baseline updated: ${entries.length} unreferenced routes recorded.`);
  process.exit(0);
}

const baseline = new Set(
  existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")).unreferenced : [],
);
const regressions = unreferenced.filter((r) => !baseline.has(keyOf(r)));
const fixed = [...baseline].filter((k) => !unreferenced.some((r) => keyOf(r) === k));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: seen.size, unreferenced, regressions, fixed }, null, 2));
  process.exit(regressions.length === 0 ? 0 : 1);
}

if (regressions.length > 0) {
  console.error(`❌ ${regressions.length} route(s) added or changed with no test naming them:\n`);
  for (const r of regressions) console.error(`   ${r.method.padEnd(6)} ${r.path.padEnd(44)} ${r.file}`);
  console.error(
    "\nA reference is not an assertion — but zero references means a green suite tells you nothing about\n" +
      "this endpoint. That is how POST /api/backchannel_logout shipped validating 5 of 11 of the steps\n" +
      "OpenID Connect Back-Channel Logout §2.6 requires, and terminating nobody's session.\n" +
      "Add a test, or add the route to EXEMPT with a reason that survives review.",
  );
  process.exit(1);
}

console.log(
  `✅ route coverage: ${seen.size} routes, no regressions. ` +
    `${unreferenced.length} carried as known debt (baseline), ${EXEMPT.size} exempt.`,
);
if (fixed.length > 0) {
  console.log(`\n🎉 ${fixed.length} baseline route(s) now covered — bank it with --update-baseline:`);
  for (const k of fixed) console.log(`   ${k}`);
}
process.exit(0);
