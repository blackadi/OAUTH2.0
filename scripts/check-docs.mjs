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

/**
 * `.opencode/` is another agent's plan scratch space, not documentation under test. Its one file is a
 * historical *"Files to Create"* plan naming components that were later built under different paths, so
 * checking its references would report design history as drift.
 */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "coverage" || e === ".opencode") continue;
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : e.endsWith(".md") && out.push(p);
  }
  return out;
}

/**
 * Paths that appear in the docs **as subjects rather than as references** — a path being discussed, not
 * followed. Two idioms produce them and both are the documentation working correctly:
 *
 *   *deleted on purpose* — `crypto.ts` is cited by `AGENTS.md` and `DEVELOPMENT.md` precisely to record
 *   that it was removed as unused.
 *
 *   *corrected on purpose* — the audit's own correction tables carry the **wrong** path in a "Was" column
 *   (`RESUME.md` §2.5), and `03-curriculum-audit.md` quotes it while describing the defect. The best example
 *   is **CUR-3a-W1's acceptance criterion itself**: *"A reference to `client/src/utils/pkce.ts` fails the
 *   check."* Implementing that criterion makes the sentence stating it trip the checker — so this list is
 *   not a workaround, it is the distinction the criterion could not express.
 *
 * Keep it small and keep the reason attached. A path that is genuinely referenced must never be added here;
 * the failure it produces is the point.
 */
const PATHS_DISCUSSED_NOT_REFERENCED = new Set([
  "server/src/utils/crypto.ts",     // deleted as unused; both docs say so
  "client/src/utils/pkce.ts",       // the wrong path, quoted while correcting it → client/src/pkce.ts
  "client/src/services/pkce.ts",    // a second wrong spelling, quoted the same way in PROGRESS.md
]);

/**
 * Resolve a documentation path that may be **abbreviated**, which the audit does two ways:
 *
 *   `modules/09a…/lab.md`  — explicit ellipsis
 *   `modules/05/README.md` — silent prefix (the real directory is `05-request-integrity-and-binding`)
 *
 * Each segment is tried as an exact name first, then as a **prefix** of exactly one real entry. Requiring
 * uniqueness matters: `modules/0` would otherwise silently pick whichever module `readdir` returned first.
 * Returns null when nothing resolves, including for a bare `…/lab.md` whose ellipsis carries no prefix.
 */
function resolveDocPath(spec, fromDir) {
  const bases = [fromDir, ROOT, join(ROOT, "docs/curriculum"), join(ROOT, "audit"), join(ROOT, "docs")];
  for (const base of bases) {
    let cur = base;
    let ok = true;
    for (const seg of spec.split("/")) {
      if (!seg || seg === ".") continue;
      if (existsSync(join(cur, seg))) { cur = join(cur, seg); continue; }
      const prefix = seg.split(/…|\.\.\./)[0];
      if (!prefix) { ok = false; break; }
      let entries;
      try { entries = readdirSync(cur); } catch { ok = false; break; }
      const hits = entries.filter((e) => e.startsWith(prefix));
      if (hits.length !== 1) { ok = false; break; }
      cur = join(cur, hits[0]);
    }
    if (ok && existsSync(cur)) return cur;
  }
  return null;
}

/**
 * `/api/…` prefixes the docs mention that are **not this server's routes** (CUR-3c-W11). Two kinds, and
 * neither is drift:
 *
 *   *a hypothetical API* — Module 11 and the final exam teach BOLA/BFLA against an invented
 *   `/api/accounts/91847/transactions`. The whole point is that it is somebody else's API.
 *
 *   *Authlete's own API* — `TICKET-PARAMETER.md` cites `/auth/authorization` and friends, which live at the
 *   vendor, not here. Prefixing them mentally with `/api` is a reader's slip this list absorbs.
 */
const NOT_OUR_ROUTES = [
  "/api/accounts", "/api/reports", "/api/invoices", "/api/users", // illustrative APIs in Module 11 + exams
  "/api/auth/",                    // Authlete's `/auth/authorization`, `/auth/token`, …
  "/api/lifecycle/healthcheck",    // Authlete's, which health.service.ts calls through the SDK
];

/** Every route this server mounts, normalised for comparison. */
function mountedRoutes() {
  const dir = join(ROOT, "server/src/routes");
  const out = new Set();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    for (const m of readFileSync(join(dir, f), "utf8")
      .matchAll(/router\.(?:get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/g)) {
      out.add(m[1]);
      out.add(m[1].startsWith("/") ? `/api${m[1]}` : `/api/${m[1]}`);
    }
  }
  return out;
}

/**
 * Compare a documented endpoint against the mounted set. Three doc conventions have to survive:
 * a trailing `/*` wildcard standing for "the routes under this prefix", a brace list
 * (`/api/backchannel_logout/{issue,deliver}`), and a path parameter written as `:id` or `{id}`.
 */
const normRoute = (p) =>
  p.split("?")[0]
    .replace(/\/(?::\w+|\{[^}]*\})/g, "/:p")
    .replace(/\/\*+$/, "")
    .replace(/\/$/, "");

const files = walk(ROOT);
const ROUTES = new Set([...mountedRoutes()].map(normRoute));
const problems = [];
const add = (file, msg) => problems.push(`${relative(ROOT, file)}: ${msg}`);

let counts = { srcRefs: 0, barePaths: 0, mdRefs: 0, proseRefs: 0, endpoints: 0, contextualMdRefs: 0, relLinks: 0, anchors: 0, urls: 0 };

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
  for (const m of raw.matchAll(/((?:server|client)\/(?:src|tests)\/[\w./-]+\.(?:tsx|ts|ejs|mjs)):(\d+)/g)) {
    counts.srcRefs++;
    const target = join(ROOT, m[1]);
    if (!existsSync(target)) { add(file, `references a missing file: ${m[1]}`); continue; }
    const lines = readFileSync(target, "utf8").split("\n").length;
    if (Number(m[2]) > lines) add(file, `${m[1]}:${m[2]} — file has only ${lines} lines`);
  }

  // 1b. A **bare** source path with no line number (CUR-3a-W1). This was the largest gap: the audit's
  // OID4VCI entry cited `client/src/components/oidc/VciSection.tsx` for weeks while the file lived under
  // `components/vci/`, and three documents still pointed at `client/src/utils/pkce.ts` after the audit had
  // recorded the correction to `client/src/pkce.ts`. Neither form carries a line number, so check 1 never
  // saw them.
  //
  // `\b(?!:\d)` rather than `(?!:\d)`: with plain lookahead, `CallbackPage.tsx:72` backtracks from `tsx`
  // (rejected by the lookahead) to `ts` (accepted, because the next character is `x`), and the checker
  // then hunts for a file called `CallbackPage.ts`. `tsx` must be tried first *and* the alternation must
  // not be allowed to match a partial extension.
  for (const m of raw.matchAll(/(?<![\w./-])((?:server|client)\/(?:src|tests)\/[\w./-]*[\w-]\.(?:tsx|ts|ejs|mjs))\b(?!:\d)/g)) {
    if (PATHS_DISCUSSED_NOT_REFERENCED.has(m[1])) continue;
    counts.barePaths++;
    if (!existsSync(join(ROOT, m[1]))) add(file, `references a missing file: ${m[1]}`);
  }

  // 1c. `some/doc.md:123` — a markdown line reference, which nothing validated before (T2-7). Only
  // **path-qualified** refs are checked: a bare `lab.md:520` is the audit's context-relative shorthand for
  // "the lab of the module this entry is about", and resolving it would mean guessing the subject. That
  // boundary is reported in the summary rather than hidden, so nobody assumes coverage it does not have.
  for (const m of raw.matchAll(/(?<![\w./-])((?:[\w.…-]+\/)+[\w.…-]+\.md):(\d+)(?:-(\d+))?/g)) {
    const target = resolveDocPath(m[1], dirname(file));
    if (!target) continue; // an ellipsis with no prefix — not resolvable, and not a claim we can test
    counts.mdRefs++;
    const lines = readFileSync(target, "utf8").split("\n").length;
    const want = Number(m[3] || m[2]);
    if (want > lines) {
      add(file, `${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ""} — ${relative(ROOT, target)} has only ${lines} lines`);
    }
  }
  for (const _ of raw.matchAll(/(?<![\w./-])[\w.-]+\.md:\d+/g)) counts.contextualMdRefs++;

  // 1e. `/api/…` endpoint paths (CUR-3c-W11), including inside fenced blocks — a curl example is exactly
  // where a reader copies from, so `raw` rather than `text`. Found **nothing** on its first run, which is the
  // honest result: all 14 initial mismatches were either a doc convention the matcher had to learn (`/*`,
  // `{a,b}`) or an API that is deliberately not ours. It earns its place as a ratchet, not as a discovery.
  for (const m of raw.matchAll(/\/api\/[a-z0-9_-]+(?:\/[a-z0-9_.:{},*$-]+)*/gi)) {
    const doc = m[0].replace(/[.,;:)]*$/, "");
    if (NOT_OUR_ROUTES.some((p) => doc.startsWith(p))) continue;
    // An endpoint inside a ~~strikethrough~~ span is being quoted as **wrong** — the repo's existing idiom
    // for a superseded value, now also the machine's. This is the endpoint counterpart of
    // PATHS_DISCUSSED_NOT_REFERENCED, and it is better than an allowlist because the document declares its
    // own intent at the point of use rather than in a list somebody must remember to prune.
    if (/~~[^~]*$/.test(raw.slice(Math.max(0, m.index - 200), m.index))) continue;
    const cand = normRoute(doc);
    if (!cand || cand === "/api") continue;
    counts.endpoints++;
    if (ROUTES.has(cand)) continue;
    // A brace list expands to one route per member.
    const brace = doc.match(/^(.*)\{([^}]+)\}(.*)$/);
    if (brace && brace[2].split(",").every((seg) => ROUTES.has(normRoute(`${brace[1]}${seg.trim()}${brace[3]}`)))) continue;
    // A **stem** — the endpoint family named without its parameters, which is how the docs normally write
    // it: `/api/client/update` for `/client/update/:clientId`, `/api/hsk/*` for the four HSK routes. Accepted
    // whenever some mounted route continues it at a segment boundary. This deliberately weakens the check:
    // `/api/client` alone would pass. The alternative is rejecting the repo's own documentation convention,
    // and what still gets caught is what matters — a misspelt or retired path, which prefixes nothing.
    if ([...ROUTES].some((r) => r.startsWith(cand + "/"))) continue;
    // A final segment that is really a parameter.
    if (ROUTES.has(cand.replace(/\/[^/]+$/, "/:p"))) continue;
    add(file, `documents an endpoint no route mounts: ${doc}`);
  }

  // 1d. The prose form (CUR-3b-W5): a **bolded path** followed within a short span by `Line ~89`, or by
  // further `~NN`/`~NN–NN` pointers in the same sentence. Module 05's README does exactly this for
  // `dpop.service.ts` — *"Line ~89 sets the `jwk` header member; ~81–83 computes `ath`"* — and two of those
  // pointers used to run past end-of-file with nothing to notice, because the form carries no colon and so
  // matches neither check 1 nor 1b.
  //
  // Scoped to 400 characters after the path so a later unrelated `~NN` cannot be attributed to it. The
  // tilde is what makes this safe to check at all: it marks an approximate line pointer, which is a claim
  // about the file, as opposed to a bare number that could be anything.
  for (const m of raw.matchAll(/\*\*`((?:server|client)\/[\w./-]+\.(?:tsx|ts|ejs|mjs))`\*\*([\s\S]{0,400})/g)) {
    const target = join(ROOT, m[1]);
    if (!existsSync(target)) continue; // reported by 1b already
    const lines = readFileSync(target, "utf8").split("\n").length;
    // Three orderings occur in practice: `Line ~89`, `~81–83` and `(~line 74)`. The tilde is the invariant,
    // and it is what distinguishes an approximate line pointer from any other number in the sentence.
    for (const n of m[2].matchAll(/(?:lines?\s+)?~\s*(?:lines?\s+)?(\d+)(?:\s*[–-]\s*(\d+))?/gi)) {
      counts.proseRefs++;
      const want = Number(n[2] || n[1]);
      if (want > lines) add(file, `${m[1]} — prose pointer "${n[0].trim()}" exceeds the file's ${lines} lines`);
    }
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

const scope =
  `${files.length} markdown files — ${counts.srcRefs} source refs, ${counts.barePaths} bare paths, ` +
  `${counts.mdRefs} markdown line refs, ${counts.proseRefs} prose pointers, ${counts.endpoints} endpoint paths, ${counts.relLinks} relative links, ${counts.anchors} anchors` +
  `${CHECK_LINKS ? `, ${counts.urls} external URLs` : " (external links skipped; pass --links)"}` +
  `\n   not checked: ${counts.contextualMdRefs} context-relative \`file.md:NNN\` refs — resolving them means guessing the document's subject`;

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
