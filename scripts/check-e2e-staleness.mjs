#!/usr/bin/env node
/**
 * How stale is `npm --prefix server run test:e2e`, measured rather than assumed.
 *
 * **The problem this addresses.** `AGENTS.md` says it plainly: the E2E suite spends real Authlete API
 * quota and trips a ~15-call rate limit, so it is **deliberately absent from `ci.yml`** — *"which means
 * **nothing runs it**, so after any change to a response body, a status mapping or an auth gate, assume
 * it is stale. A green `npm test` says nothing about that file."*
 *
 * "Assume it is stale" is the right instruction and a bad state to leave a repo in, because it is
 * unfalsifiable: it is equally true the day after the suite passes and a year later, so it stops carrying
 * information and starts being ignored. This does not run the suite — running it is the thing we cannot
 * afford. It answers the cheaper question instead:
 *
 *   **Which server files that decide behaviour have changed since the E2E suite was last touched?**
 *
 * That converts a standing assumption into a list. Seven named files is actionable; "assume it is stale"
 * is not.
 *
 * ## What it does and does not claim
 *
 * It reads **git history**, not code. A file appearing below means the suite has not been looked at since
 * that file changed — not that the suite is now wrong. A refactor with no behaviour change will show up
 * here, and that is the intended trade: a false positive costs you reading a diff, a false negative costs
 * you shipping a broken status mapping that no gate can see.
 *
 * Conversely, an **empty** report is a real statement: no behaviour-deciding server file has changed since
 * the E2E suite was last revised.
 *
 * ## Why it does not fail the build by default
 *
 * Because it would fail on almost every server commit, and a gate that is always red is a gate people
 * route around. It reports, and `--strict` makes it exit non-zero for anyone who wants it enforced —
 * before a release, say. It is not in `ci.yml` for the same reason.
 *
 * Usage:
 *   node scripts/check-e2e-staleness.mjs
 *   node scripts/check-e2e-staleness.mjs --strict     # exit 1 if anything is listed
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const STRICT = process.argv.includes('--strict');

/** The E2E suite itself, and its config — either changing counts as the suite being revised. */
const E2E_PATHS = ['server/tests/e2e', 'server/vitest.e2e.config.ts'];

/**
 * The directories where a change can invalidate an end-to-end assertion.
 *
 * Chosen to match what `AGENTS.md` names — *"a response body, a status mapping or an auth gate"* — rather
 * than "the server changed". `utils/` is included because `basic-auth.ts` and `validate.ts` live there and
 * both decide whether a request is accepted at all. Everything else under `server/src` (config, types,
 * metrics, logging) is excluded on purpose: a change there does not move an E2E expectation.
 */
const BEHAVIOUR_PATHS = [
  'server/src/controllers',
  'server/src/services',
  'server/src/middleware',
  'server/src/routes',
  'server/src/utils',
];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

for (const p of E2E_PATHS) {
  if (!existsSync(join(REPO_ROOT, p))) {
    console.error(`✗ ${p} does not exist — this script's assumptions about the layout are stale.`);
    process.exit(1);
  }
}

/**
 * `--full-history`, and it is load-bearing (2026-09-01).
 *
 * Without it git applies history simplification: at a merge it follows only a parent whose tree for
 * these paths is TREESAME, so a commit whose *net* effect on the path was a revert gets skipped
 * entirely. Measured on this repo — `9d2e45d` ("restore the one E2E line the logger rewrite should not
 * have touched") edits `server/tests/e2e/e2e.test.ts`, `git show --stat` proves it, and plain
 * `git log -1 -- server/tests/e2e` still answered `56fc14a`, a day earlier. The baseline was wrong by
 * one commit and the report listed **36** changed files instead of the true handful.
 *
 * Over-reporting is the safe direction — a false positive costs a diff — but a baseline that names the
 * wrong commit undermines the one thing this script exists to tell you.
 */
const lastE2eSha = git(['log', '-1', '--full-history', '--format=%H', '--', ...E2E_PATHS]);
if (!lastE2eSha) {
  console.error('✗ no commit found touching the E2E suite; cannot measure drift against nothing.');
  process.exit(1);
}
const lastE2eDate = git(['log', '-1', '--format=%ad', '--date=short', lastE2eSha]);
const lastE2eSubject = git(['log', '-1', '--format=%s', lastE2eSha]);

// `sha..HEAD` is exclusive of `sha`, which is what we want: changes *after* the suite was last revised.
const changed = git([
  'log',
  '--name-only',
  '--format=',
  `${lastE2eSha}..HEAD`,
  '--',
  ...BEHAVIOUR_PATHS,
])
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const unique = [...new Set(changed)].sort();

const byArea = new Map();
for (const file of unique) {
  const area = file.split('/').slice(0, 3).join('/');
  if (!byArea.has(area)) byArea.set(area, []);
  byArea.get(area).push(file.split('/').slice(3).join('/'));
}

console.log('E2E suite last revised');
console.log(`  ${lastE2eSha.slice(0, 8)}  ${lastE2eDate}  ${lastE2eSubject}`);
console.log();

if (unique.length === 0) {
  console.log('✓ no behaviour-deciding server file has changed since. The suite is as fresh as its');
  console.log('  last revision — which is not the same as passing, only as not having drifted.');
  process.exit(0);
}

console.log(
  `⚠ ${unique.length} behaviour-deciding server file(s) changed after that, across ${byArea.size} area(s):`,
);
for (const [area, files] of [...byArea].sort()) {
  console.log(`\n  ${area}/`);
  for (const f of files.slice(0, 12)) console.log(`    ${f}`);
  if (files.length > 12) console.log(`    … and ${files.length - 12} more`);
}

console.log(`
  This reads git history, not code: a pure refactor appears here too. It means the E2E suite has not
  been looked at since these changed — review the ones touching a response body, a status mapping or an
  auth gate, and revise ${E2E_PATHS[0]} where an expectation moved.

  ⚠ Do NOT reflexively run the suite to find out. It spends real Authlete quota and trips a ~15-call
  rate limit; AGENTS.md requires it to be run only when explicitly asked.`);

process.exit(STRICT ? 1 : 0);
