#!/usr/bin/env node
/**
 * Documentation drift checker.
 *
 * Every documentation defect found during the 2026-08-06 audit was the same failure mode: prose that
 * was true when written and silently stopped being true. Nothing in the build or test suites notices,
 * because docs are prose. This script catches the mechanically detectable subset.
 *
 *   --links   also check external URLs over the network (slow, and rate-limited by some hosts)
 *
 * Without --links it is fast and offline, so it is safe to run on every push. The link check runs on a
 * schedule instead, because external 404s are somebody else's deploy and should not fail your build.
 *
 * Exit code 1 if anything is broken.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CHECK_LINKS = process.argv.includes("--links");

/** Hosts that answer non-200 to automated requests but are fine for humans. */
const LINK_ALLOWLIST = [
  "darutk.medium.com", // Medium 403s bots
];

/**
 * Placeholder and reserved hosts that are illustrative, not fetchable.
 * `.example`, `.invalid`, `.test` and `.localhost` are reserved by RFC 6761; `.internal` by RFC 6762.
 */
const PLACEHOLDER =
  /localhost|127\.0\.0\.1|\.(example|invalid|test|internal)(\/|$|:)|example\.(com|org|net)|YOUR_|your-|schemas\.openid\.net|prometheus:|[…<>{*]/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "coverage") continue;
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : e.endsWith(".md") && out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const problems = [];
const add = (file, msg) => problems.push(`${relative(ROOT, file)}: ${msg}`);

let counts = { srcRefs: 0, relLinks: 0, anchors: 0, urls: 0 };

/**
 * Blank out fenced code blocks and inline code spans, preserving line count.
 * Markdown does not render a link inside code, so `[text](url)` written as an example must not be
 * checked as one. Without this the script flags its own documentation.
 */
const stripCode = (t) =>
  t
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const text = stripCode(raw);

  // 1. `server/src/foo.ts:123` — the file must exist and be long enough.
  for (const m of raw.matchAll(/((?:server|client)\/(?:src|tests)\/[\w./-]+\.(?:ts|tsx|ejs|mjs)):(\d+)/g)) {
    counts.srcRefs++;
    const target = join(ROOT, m[1]);
    if (!existsSync(target)) { add(file, `references a missing file: ${m[1]}`); continue; }
    const lines = readFileSync(target, "utf8").split("\n").length;
    if (Number(m[2]) > lines) add(file, `${m[1]}:${m[2]} — file has only ${lines} lines`);
  }

  // 2. Relative markdown links must resolve on disk.
  for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
    counts.relLinks++;
    const target = m[1].split("#")[0];
    if (!target) continue;
    if (!existsSync(resolve(dirname(file), target))) add(file, `broken relative link: ${m[1]}`);
  }

  // 3. Same-document anchors must match a heading.
  // GitHub's slug algorithm: lowercase, drop punctuation, then convert EACH remaining whitespace
  // character to a hyphen. Runs are not collapsed — "OIDC & Discovery" becomes `oidc--discovery`,
  // because dropping the `&` leaves two spaces. Collapsing them produces false positives on every
  // heading containing `&`, `—` or `/`.
  const slug = (h) =>
    h.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s/g, "-");
  const headings = new Set([...raw.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, h]) => slug(h)));
  for (const m of text.matchAll(/\]\(#([\w-]+)\)/g)) {
    counts.anchors++;
    if (!headings.has(m[1])) add(file, `anchor #${m[1]} matches no heading`);
  }
}

// 4. External URLs (opt-in).
if (CHECK_LINKS) {
  // Only markdown links — `[text](https://…)`. A bare URL in a table or code block is *data*
  // (an `iss` value, a sample redirect, a placeholder host), not a reference the reader follows.
  // Every real dead link this check was written for was a markdown link; every false positive on
  // the first run was a bare URL. Narrowing to links removed 20 of 20 false alarms.
  const urls = new Map();
  for (const file of files) {
    for (const m of stripCode(readFileSync(file, "utf8")).matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
      const url = m[1].replace(/[.,;:]+$/, "");
      if (PLACEHOLDER.test(url)) continue;
      if (LINK_ALLOWLIST.some((h) => url.includes(h))) continue;
      if (!urls.has(url)) urls.set(url, file);
    }
  }
  counts.urls = urls.size;
  const entries = [...urls.entries()];
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(
      entries.slice(i, i + 8).map(async ([url, file]) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(url, {
              redirect: "follow",
              signal: AbortSignal.timeout(15000),
              headers: { "User-Agent": "Mozilla/5.0 (docs link check)" },
            });
            if (res.ok) return;
            if (attempt === 1) add(file, `HTTP ${res.status} — ${url}`);
          } catch (e) {
            if (attempt === 1) add(file, `unreachable (${e.name}) — ${url}`);
          }
        }
      })
    );
  }
}

const scope = `${files.length} markdown files — ${counts.srcRefs} source refs, ${counts.relLinks} relative links, ${counts.anchors} anchors${CHECK_LINKS ? `, ${counts.urls} external URLs` : " (external links skipped; pass --links)"}`;

if (problems.length === 0) {
  console.log(`✅ docs check passed: ${scope}`);
  process.exit(0);
}

console.error(`❌ docs check found ${problems.length} problem(s) across ${scope}\n`);
for (const p of problems) console.error(`  ${p}`);
console.error(
  "\nA dead link or stale line number is usually a symptom. When one turns up, check whether the\n" +
    "surrounding claim is still true — that is how the TOKEN-EXCHANGE-TUTORIAL audit found four other\n" +
    "classes of error behind a single 404."
);
process.exit(1);
