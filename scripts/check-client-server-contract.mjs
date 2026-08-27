#!/usr/bin/env node
/**
 * Every endpoint the SPA can call must resolve to a route the server actually mounts.
 *
 * **This is the check this repo most needed, and the reason is four outages found in one afternoon.** On
 * 2026-08-22 an audit found four dead client flows — JAR answering 401 for every user, the FAPI wizard's
 * step 3→4 doing nothing, the MCP wizard exchanging a code with no client authentication, and the admin
 * local-token call refused in dev. Every gate was green throughout. `docs/agents/client-spa.md` records
 * the lesson in one sentence:
 *
 *   *"An auth gate added on the server is a client change too, and the documentation being right is not
 *   the client being right. `check-route-coverage.mjs` asks 'does a test name this route?' on the server
 *   side; **nothing asks it of the SPA**."*
 *
 * This asks it of the SPA. It is the highest-value check for *this* project specifically, because the
 * project is an OAuth 2.x / OIDC testing tool: a section that cannot reach its endpoint is not a
 * rendering blemish, it is a protocol flow that silently does not exist — and flows working is the entire
 * product.
 *
 * That document also records that every client endpoint constant *was* verified against a mounted route —
 * **by hand, once**. A hand-check has a half-life. This does it in milliseconds, offline, every push.
 *
 * ## Three things it has to get right, each learned by getting it wrong
 *
 * - **Mount points are per-router, not global.** Most routers mount at `/api`, but `deviceRoutes` mounts
 *   at `/` and declares its own full `/api/device/...` paths (see the comment beside it in `app.ts`).
 *   Assuming one prefix reported three device endpoints as unresolved when all three are fine.
 * - **A client constant is usually a *prefix*.** The server declares
 *   `/client/get/:clientId`; `config.ts` exports `/api/client/get` and the caller appends the id. So a
 *   constant resolves if a route equals it *or* extends it by at least one segment. Requiring equality
 *   reported twelve false positives.
 * - **Parameters are wildcards on both sides.** `:clientId` on the server, `${id}` in a client template
 *   literal. Both collapse to one path segment.
 *
 * ## What it proves, and what it only flags
 *
 * - **Resolution is definitive and fails the build.** A client constant with no matching route is a
 *   guaranteed 404 the moment anyone presses that button. No judgement involved.
 * - **Auth posture is advisory.** For each auth-gated server route it names the client services that
 *   reach it and whether they mention a credential at all. That is a heuristic — it reads for
 *   `auth`/`credential`/`Basic`, not for correctness — so it prints a review list rather than failing.
 *   Three of the four 2026-08-22 outages were this shape, and six routes to eyeball beats none.
 *
 * Deliberately static: no server is started, no request is made, and it works in a checkout with no
 * `.env`. Same posture as `check-route-coverage.mjs` and `check-theme-tokens.mjs`.
 *
 * Usage: node scripts/check-client-server-contract.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..');
const APP = join(REPO, 'server/src/app.ts');
const ROUTES_DIR = join(REPO, 'server/src/routes');
const CLIENT_CONFIG = join(REPO, 'client/src/config.ts');
const CLIENT_SERVICES = join(REPO, 'client/src/services');

const appSrc = readFileSync(APP, 'utf8');

/** `const routerURL = "/api"` — read, not hardcoded, so a remount fails here rather than silently. */
const routerUrl = appSrc.match(/const routerURL\s*=\s*["'`]([^"'`]+)["'`]/)?.[1];
if (!routerUrl) {
  console.error('✗ no `routerURL` in server/src/app.ts — the mount point moved. Update this script.');
  process.exit(1);
}

/**
 * Which router, in which file, is mounted where.
 *
 * **Keyed per *router*, not per file, and getting that wrong hid the last two false positives.** Two
 * files export two routers each, mounted at different prefixes:
 *
 * ```ts
 * import federationRoutes, { rootRouter as federationRootRouter } from "./routes/federation.routes";
 * app.use(routerURL, federationRoutes);        // /api/federation/...
 * app.use("/", federationRootRouter);          // /.well-known/openid-federation at the domain root
 * ```
 *
 * A `Map` keyed by filename let the second `app.use` overwrite the first, so every federation route was
 * resolved against `/` instead of `/api` and both client endpoints looked like 404s. They are fine.
 *
 * The chain is: `app.use(mount, ident)` → the import that introduced `ident` → the export it names → the
 * local `const <name> = Router()` in the route file. It closes because this repo's convention is
 * consistent — a named router export uses the same identifier as its local variable, and
 * `export default <ident>` names the default's variable outright.
 */
const importedRouter = new Map(); // app.ts identifier ⇒ { file, exportName }
const IMPORT_RE =
  /import\s+(?:(\w+)\s*)?(?:,?\s*\{([^}]*)\}\s*)?from\s+["'`]\.\/routes\/([\w.-]+)["'`]/g;
for (const m of appSrc.matchAll(IMPORT_RE)) {
  const [, def, named, mod] = m;
  const file = `${mod}.ts`;
  if (def) importedRouter.set(def, { file, exportName: 'default' });
  for (const part of (named ?? '').split(',')) {
    const [orig, alias] = part.trim().split(/\s+as\s+/).map((x) => x.trim());
    if (orig) importedRouter.set(alias || orig, { file, exportName: orig });
  }
}

/** file ⇒ the local identifier its `export default` names. */
const defaultVarOf = new Map();
for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
  const m = src.match(/export\s+default\s+(\w+)/);
  if (m) defaultVarOf.set(file, m[1]);
}

/** `file::localRouterVar` ⇒ mount prefix. */
const mountOf = new Map();
for (const m of appSrc.matchAll(/app\.use\(\s*(routerURL|["'`][^"'`]*["'`])\s*,\s*(\w+)\s*\)/g)) {
  const [, mountExpr, ident] = m;
  const ref = importedRouter.get(ident);
  if (!ref) continue;
  const localVar =
    ref.exportName === 'default' ? defaultVarOf.get(ref.file) : ref.exportName;
  if (!localVar) continue;
  const mount = mountExpr === 'routerURL' ? routerUrl : mountExpr.slice(1, -1);
  mountOf.set(`${ref.file}::${localVar}`, mount === '/' ? '' : mount.replace(/\/$/, ''));
}

const ROUTE_RE =
  /\b(\w*[Rr]outer)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\)\s*;/g;

/**
 * Route-level middleware — the *minority* of the gating in this repo.
 *
 * Only three routes are guarded this way. **The gate is usually inside the controller**, as
 * `const checkAuth = requireBasicAuth("jar"); … if (!checkAuth(req, res)) return;` — eleven controllers
 * do it. Reading route middleware alone found 3 of them and reported the JAR endpoint as ungated, which
 * is the opposite of true and the whole reason JAR is in this file's opening paragraph.
 */
const ROUTE_MIDDLEWARE_AUTH = /requireGrantOwnership|developmentOnly|requireBasicAuth/;

/** Controller files that gate internally. Read once; the route→controller link is resolved per route. */
const CONTROLLERS_DIR = join(REPO, 'server/src/controllers');
const gatingController = new Set();
for (const f of readdirSync(CONTROLLERS_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(CONTROLLERS_DIR, f), 'utf8');
  if (/requireBasicAuth\s*\(/.test(src)) gatingController.add(f);
}

const routes = [];
const unmountedRouters = [];
for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(ROUTES_DIR, file), 'utf8');

  /** identifier ⇒ controller file, for `import { jarController } from "../controllers/jar.controller"`. */
  const controllerOf = new Map();
  for (const im of src.matchAll(
    /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+["'`][^"'`]*controllers\/([\w.-]+)["'`]/g,
  )) {
    const [, named, def, mod] = im;
    const target = `${mod}.ts`;
    for (const part of (named ?? def ?? '').split(',')) {
      const id = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (id) controllerOf.set(id, target);
    }
  }

  for (const m of src.matchAll(ROUTE_RE)) {
    const [, routerVar, method, path, tail] = m;
    const key = `${file}::${routerVar}`;
    if (!mountOf.has(key)) {
      // A router nobody mounts serves nothing; recorded so a genuinely orphaned router is visible
      // rather than silently treated as absent.
      if (!unmountedRouters.includes(key)) unmountedRouters.push(key);
      continue;
    }
    const prefix = mountOf.get(key);
    routes.push({
      method: method.toUpperCase(),
      path: `${prefix}${path.startsWith('/') ? path : `/${path}`}`,
      /**
       * Guarded either by route middleware or by its controller. Over-marks slightly — a controller
       * where only some handlers gate marks all of its routes — which is acceptable for an advisory
       * list and stated rather than hidden.
       */
      guarded:
        ROUTE_MIDDLEWARE_AUTH.test(tail) ||
        [...tail.matchAll(/\b(\w+)\s*\./g)].some((h) =>
          gatingController.has(controllerOf.get(h[1]) ?? ''),
        ),
      file,
    });
  }
}

/** Collapse every parameter — express `:id` and client `${id}` alike — to one path segment. */
function segments(path) {
  return path
    .replace(/\$\{[^}]*\}/g, ':p')
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? '*' : s));
}

/** A route satisfies a client constant if it equals it, or extends it by ≥1 segment. */
function satisfies(routeSegs, clientSegs) {
  if (routeSegs.length < clientSegs.length) return false;
  for (let i = 0; i < clientSegs.length; i++) {
    const c = clientSegs[i];
    const r = routeSegs[i];
    if (c === '*' || r === '*') continue;
    if (c !== r) return false;
  }
  return true;
}

const config = readFileSync(CLIENT_CONFIG, 'utf8');
const endpoints = [];
for (const m of config.matchAll(/export const ([A-Z0-9_]+)\s*=\s*`\$\{API_BASE_URL\}([^`]+)`/g)) {
  endpoints.push({ name: m[1], path: m[2], segs: segments(m[2]) });
}
if (endpoints.length === 0) {
  console.error('✗ no client endpoint constants found — the shape in client/src/config.ts changed.');
  process.exit(1);
}

/**
 * **The loophole that hid JAR, now a failure.**
 *
 * `jar.service.ts` built its own endpoint — `const JAR_ENDPOINT = \`${API_BASE_URL}/api/jar/process\`` —
 * so it never appeared in `config.ts` and this check, written *because of* the JAR outage, was not
 * checking JAR. Found by mutating this script: renaming the server route changed nothing.
 *
 * `config.ts` is the one place endpoints live, the same way `session-keys.ts` owns every session key and
 * `transport.ts` is the one place a request leaves. A service that assembles its own URL is invisible
 * here, so it is refused outright rather than accommodated — accommodating it would leave the next one
 * equally invisible.
 */
const rogue = [];
for (const f of readdirSync(CLIENT_SERVICES).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(CLIENT_SERVICES, f), 'utf8');
  for (const m of src.matchAll(/`\$\{API_BASE_URL\}([^`]*)`/g)) {
    rogue.push(`services/${f}  →  ${m[1] || '(root)'}`);
  }
}

const routeSegs = routes.map((r) => ({ ...r, segs: segments(r.path) }));

const unresolved = [];
for (const ep of endpoints) {
  const hits = routeSegs.filter((r) => satisfies(r.segs, ep.segs));
  if (hits.length === 0) unresolved.push(ep);
  else ep.hits = hits;
}

console.log(`Router mount (routerURL)      : ${routerUrl}`);
console.log(`Routers mounted in app.ts     : ${mountOf.size}`);
console.log(`Server routes discovered      : ${routes.length}`);
console.log(`Client endpoint constants     : ${endpoints.length}`);
console.log(`Auth-gated server routes      : ${routes.filter((r) => r.guarded).length}`);
if (unmountedRouters.length) {
  console.log(`Routers never mounted         : ${unmountedRouters.length} (serve nothing, so not checked)`);
  for (const k of unmountedRouters) console.log(`    ${k}`);
}

// ── advisory: a client caller of a guarded route that never mentions a credential ─────────────────
const serviceSrc = new Map();
for (const f of readdirSync(CLIENT_SERVICES).filter((f) => f.endsWith('.ts'))) {
  serviceSrc.set(f, readFileSync(join(CLIENT_SERVICES, f), 'utf8'));
}
const review = [];
for (const ep of endpoints) {
  const guarded = (ep.hits ?? []).filter((r) => r.guarded);
  if (guarded.length === 0) continue;
  for (const [file, src] of serviceSrc) {
    if (!src.includes(ep.name)) continue;
    if (!/\bauth\b|credential|Basic|Authorization/i.test(src)) {
      review.push(`${ep.name} → services/${file}  (gate in ${guarded[0].file})`);
    }
  }
}
if (review.length) {
  console.log(`\n⚠ ${review.length} caller(s) of an auth-gated route with no credential in sight:`);
  for (const r of review) console.log(`    ${r}`);
  console.log('  Advisory only — this reads for the *word*, not for correctness. Three of the four');
  console.log('  2026-08-22 dead flows looked exactly like this.');
}

/**
 * ---------------------------------------------------------------- concatenation-safe base
 *
 * The base URL every endpoint above is concatenated onto must not end in a slash.
 *
 * **This check exists because the resolution check above cannot see the defect.** The regex that harvests
 * endpoints captures only the *path* half of `${API_BASE_URL}/api/...`, so `VITE_API_BASE_URL` could be
 * anything at all and every endpoint would still "resolve". On 2026-08-27 `render.yaml` was setting it to
 * `https://oauth2-0-ekh2.onrender.com/`, which makes every endpoint `...onrender.com//api/...`. `new URL()`
 * preserves the doubled slash — it does not collapse it — and Express 5 answers **404** for
 * `//api/authorization`. So the deployed SPA could reach nothing, while typecheck, lint, 20+ checks, the
 * unit suites, the build and the Playwright pass were all green. A hostname was simply nobody's job.
 *
 * `config.ts` now normalises the value too. Both layers are kept for the reason `render.yaml` gives for
 * pinning `NODE_ENV` and `NODE_VERSION`: neither is load-bearing alone, and the manifest being *right* is
 * worth more than the code being *forgiving* — a reader copying the manifest into another deployment gets
 * a correct value rather than one that happens to be survivable here.
 */
const BASE_URL_KEYS = ['VITE_API_BASE_URL', 'VITE_PROD_API_BASE_URL'];
const MANIFESTS = ['render.yaml', 'client/.env.example'];
const baseUrlOffenders = [];

for (const rel of MANIFESTS) {
  let src;
  try {
    src = readFileSync(join(REPO, rel), 'utf8');
  } catch {
    continue; // an absent manifest is not this check's business
  }
  for (const key of BASE_URL_KEYS) {
    // `render.yaml`: `- key: X` / `value: Y`.  `.env.example`: `X=Y`.  Comments are skipped by both.
    const yaml = new RegExp(`key:\\s*${key}\\b[\\s\\S]{0,400}?^\\s*value:\\s*(\\S+)`, 'm');
    const dotenv = new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, 'm');
    for (const m of [src.match(yaml), src.match(dotenv)]) {
      if (m && /\/$/.test(m[1])) baseUrlOffenders.push(`${rel}  ${key}=${m[1]}`);
    }
  }
}

if (baseUrlOffenders.length) {
  console.error(`\n✗ ${baseUrlOffenders.length} base URL(s) end in a slash:`);
  for (const o of baseUrlOffenders) console.error(`    ${o}`);
  console.error('  config.ts concatenates `${API_BASE_URL}/api/...`, so a trailing slash produces');
  console.error('  `host//api/...`. new URL() preserves that and Express 5 returns 404 — every API call');
  console.error('  in the SPA. Drop the slash.');
}

if (rogue.length) {
  console.error(`\n✗ ${rogue.length} endpoint(s) built inside a service instead of declared in config.ts:`);
  for (const r of rogue) console.error(`    ${r}`);
  console.error('  Move it to client/src/config.ts and import it. An endpoint assembled in a service is');
  console.error('  invisible to this check — which is exactly how JAR went unchecked by the check that');
  console.error('  exists because JAR broke.');
}

if (unresolved.length === 0 && rogue.length === 0 && baseUrlOffenders.length === 0) {
  console.log(`\n✓ all ${endpoints.length} client endpoints resolve to a mounted server route,`);
  console.log('  no service assembles one of its own,');
  console.log(`  and every declared base URL is concatenation-safe (${MANIFESTS.join(', ')})`);
  process.exit(0);
}
if (unresolved.length === 0) process.exit(1);

console.error(`\n✗ ${unresolved.length} client endpoint(s) resolve to NO mounted server route.`);
console.error('  Each is a guaranteed 404 the moment somebody presses that button, and no other gate');
console.error('  in this repo can see it.\n');
for (const ep of unresolved) console.error(`  ${ep.name}\n      ${ep.path}`);
process.exit(1);
