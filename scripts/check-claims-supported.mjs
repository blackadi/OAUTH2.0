#!/usr/bin/env node
/**
 * Does `claims_supported` tell the truth?
 *
 *   node scripts/check-claims-supported.mjs           # against the live discovery document
 *   node scripts/check-claims-supported.mjs --strict  # exit 1 on any mismatch
 *
 * **Why this exists.** The service advertised 20 claims while the server could produce 11, and the gap
 * survived typecheck, lint, 1158 tests and every other check in this repo — because nothing tied the
 * advertisement to the implementation. It took a conformance run to find it:
 *
 *   WARNING  EnsureIdentityClaimsContainRequestedClaims: … As the server listed the claims in
 *            claims_supported, it should have returned them in either the id_token or the userinfo.
 *
 * `AGENTS.md` already names the class — a configuration change *"has no error string"*, so searching
 * for one finds nothing. This measures the two sides against each other instead.
 *
 * **Both directions matter.** Advertised-but-unservable is the defect that was found. Servable-but-
 * unadvertised is the quieter one: a client reads `claims_supported` to decide what to ask for, so a
 * claim missing from it is a claim nobody will ever request.
 *
 * **Not wired into CI, deliberately** — same reasoning as `check-discovery.mjs`: a service
 * configuration change is somebody else's action and is not a reason to fail somebody's pull request.
 * Run it after touching `SERVED_CLAIMS` or the service, and on the same cadence as the discovery check.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = new Set(process.argv.slice(2));
const STRICT = argv.has("--strict");

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/** Same parse as `fapi2-align-supported-claims.mjs`; if one breaks they both need updating. */
function servedClaims(source) {
  const block = source.match(/export const SERVED_CLAIMS = \[([\s\S]*?)\] as const;/);
  if (!block) {
    throw new Error(
      "could not find `export const SERVED_CLAIMS = [...] as const;` in demo-claims.ts — " +
        "if it was renamed or reshaped, update this script and fapi2-align-supported-claims.mjs together",
    );
  }
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const SOURCE = join(repoRoot, "server", "src", "utils", "demo-claims.ts");
const servable = servedClaims(readFileSync(SOURCE, "utf8"));

// The issuer the deployment actually serves, taken from the conformance config when present so this
// follows the same target the suite tests, and overridable for a local run.
let issuer = process.env.ISSUER;
if (!issuer) {
  try {
    const cfg = JSON.parse(readFileSync(join(repoRoot, "conformance", "fapi2-config.json"), "utf8"));
    issuer = cfg.server.discoveryUrl.replace(/\/\.well-known\/.*$/, "");
  } catch {
    issuer = "https://oauth2-0-ekh2.onrender.com";
  }
}

const url = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
console.log(`discovery : ${url}`);
console.log(`source    : server/src/utils/demo-claims.ts → SERVED_CLAIMS (${servable.length})\n`);

let doc;
try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  doc = await res.json();
} catch (e) {
  console.error(red(`✗ could not fetch the discovery document: ${e.message}`));
  process.exit(1);
}

const advertised = doc.claims_supported;
if (!Array.isArray(advertised)) {
  // Absent is its own finding: the code can serve claims and the document says nothing about them.
  console.error(red("✗ `claims_supported` is absent from the discovery document"));
  process.exit(1);
}

const unservable = advertised.filter((c) => !servable.includes(c)).sort();
const unadvertised = servable.filter((c) => !advertised.includes(c)).sort();

console.log(`advertised: ${advertised.length}`);

if (unservable.length) {
  console.log(red(`\n✗ advertised but this server cannot serve them (${unservable.length}):`));
  for (const c of unservable) console.log(red(`    ${c}`));
  console.log(
    "\n  A client that asks for these gets nothing back, and a conformance run warns on it.\n" +
      "  Either add a `case` for them in demo-claims.ts, or run:\n" +
      "    node scripts/fapi2-align-supported-claims.mjs --apply",
  );
}

if (unadvertised.length) {
  console.log(yellow(`\n⚠ this server can serve them but nothing advertises them (${unadvertised.length}):`));
  for (const c of unadvertised) console.log(yellow(`    ${c}`));
  console.log("\n  No client will request a claim it was never told about. Same fix, same script.");
}

if (!unservable.length && !unadvertised.length) {
  console.log(`\n✅ claims_supported matches what the server serves — ${advertised.length} claims, both ways.`);
  process.exit(0);
}

console.log(
  "\nThis reads the live document, so it measures the deployment rather than the repo: a change to\n" +
    "SERVED_CLAIMS shows up here only once it has been applied to the service AND deployed.",
);
process.exit(STRICT ? 1 : 0);
