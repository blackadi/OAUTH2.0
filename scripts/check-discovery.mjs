#!/usr/bin/env node
// check-discovery.mjs — the §7.3 discovery-diff check.
//
// Two jobs, and they fail for different reasons:
//
//   1. MEMBER DRIFT. Compare the live discovery document's member list against a committed
//      baseline. Report additions and removals BY NAME.
//   2. CLAIM DRIFT. Assert that every feature `README.md` marks as working has its corresponding
//      discovery member present, and that every feature it marks as off does not.
//
// Why job 1 exists at all, in one sentence: on 2026-08-17 the document measured 66 members against
// the 65 recorded on 2026-08-15, and the extra member was UNATTRIBUTABLE — because August had kept
// a count and not a list. A count tells you that something changed. Only a list tells you what.
//
// NOT run on every push, deliberately. A service configuration change is somebody else's action; it
// is not a reason to fail somebody's pull request. Weekly, like `check-docs --links`.
//
//   node scripts/check-discovery.mjs                    # offline: baseline self-consistency only
//   node scripts/check-discovery.mjs --live             # fetch and compare
//   node scripts/check-discovery.mjs --live --update    # re-baseline (review the diff first!)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "discovery-baseline.json");
const README = join(ROOT, "README.md");

const argv = new Set(process.argv.slice(2));
const LIVE = argv.has("--live");
const UPDATE = argv.has("--update");

// The document is served in three places that must agree. Reading one proves nothing about the
// others — that is how this repo discovered it had been auditing a different Authlete service
// than the one the public deployment used (SERVICE-CONFIG-PROBE.md §21.1).
const SOURCES = [
  "https://oauth2-0-ekh2.onrender.com/api/.well-known/openid-configuration",
  "https://oauth2-0-ekh2.onrender.com/.well-known/oauth-authorization-server",
];

// The mapping the proposal asks for: a README feature status and the discovery member that would
// corroborate or contradict it. `expect: true` means the member must be present and truthy.
//
// Only rows whose truth is VISIBLE IN THE DISCOVERY DOCUMENT belong here. Roughly half of any
// profile's requirements bind a *client* configuration (`tokenAuthMethod`, `pkceRequired`,
// `idTokenSignAlg`), and `/.well-known` cannot see those — a report written from discovery metadata
// alone scores those rows PASS when they are not. Rows like that are listed in NOT_VISIBLE below
// rather than silently omitted.
const CLAIMS = [
  { feature: "PAR (RFC 9126)", member: "pushed_authorization_request_endpoint", expect: true },
  { feature: "Device Flow (RFC 8628)", member: "device_authorization_endpoint", expect: true },
  { feature: "CIBA", member: "backchannel_authentication_endpoint", expect: true },
  { feature: "DCR (RFC 7591/7592)", member: "registration_endpoint", expect: true },
  { feature: "Grant Management", member: "grant_management_endpoint", expect: true },
  { feature: "OIDC Discovery", member: "issuer", expect: true },
  { feature: "UserInfo Endpoint", member: "userinfo_endpoint", expect: true },
  { feature: "DPoP (RFC 9449)", member: "dpop_signing_alg_values_supported", expect: true },
  { feature: "MCP / CIMD", member: "client_id_metadata_document_supported", expect: true },
  { feature: "Backchannel Logout", member: "backchannel_logout_supported", expect: true },
  // Declined / not enabled — the member must stay ABSENT. These are the rows that catch a flag
  // being switched on without its paired doc change, which is the failure DR-03 shipped in August.
  { feature: "Native SSO (DR-04, declined)", member: "native_sso_supported", expect: false },
  { feature: "Session Management (DR-08, declined)", member: "check_session_iframe", expect: false },
  { feature: "Front-Channel Logout (DR-08, declined)", member: "frontchannel_logout_supported", expect: false },
  { feature: "Back-channel logout `sid` (DR-08, declined)", member: "backchannel_logout_session_supported", expect: false },
];

// Stated so nobody mistakes this check for complete coverage.
const NOT_VISIBLE = [
  "FAPI 2.0 profile — `fapiModes` is a service field with no discovery member",
  "Verifiable Credentials — `credential_issuer` has no AS-discovery member (VCI-W2, unachievable)",
  "JWT access tokens (DR-09) — `accessTokenSignAlg` has no discovery member",
  "DPoP nonces (DR-20) — `dpopNonceRequired` has no discovery member",
  "PKCE enforcement — `pkceRequired` is per client, invisible to `/.well-known`",
  "ID token algorithms per client — `idTokenSignAlg` is per client",
];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

async function fetchDoc(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // A discovery URL that falls through to an SPA catch-all answers 200 with HTML. Right status,
    // wrong document — the exact defect 9728-W1 found at the protected-resource metadata path.
    throw new Error(`${url} → HTTP ${res.status} but the body is not JSON (first 60 chars: ${text.slice(0, 60).replace(/\s+/g, " ")})`);
  }
  return json;
}

let failures = 0;
const fail = (msg) => {
  console.log(`  ${red("✗")} ${msg}`);
  failures++;
};
const pass = (msg) => console.log(`  ${green("✓")} ${msg}`);

// ---------------------------------------------------------------- baseline
if (!existsSync(BASELINE) && !UPDATE) {
  console.error(red(`No baseline at scripts/discovery-baseline.json. Create one with --live --update.`));
  process.exit(1);
}
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;

if (!LIVE) {
  console.log(`Offline mode — baseline self-check only. Pass --live to fetch.\n`);
  if (baseline) {
    console.log(`  baseline: ${baseline.members.length} members, captured ${baseline.captured}`);
    const sorted = [...baseline.members].sort();
    if (JSON.stringify(sorted) !== JSON.stringify(baseline.members)) fail("baseline member list is not sorted");
    if (new Set(baseline.members).size !== baseline.members.length) fail("baseline has duplicate members");
    const unknown = CLAIMS.filter((c) => c.expect && !baseline.members.includes(c.member));
    for (const u of unknown) fail(`claim maps to "${u.member}", absent from the baseline — the mapping or the baseline is wrong`);
    if (!failures) pass("baseline is sorted, duplicate-free, and every expected member is in it");
  }
  console.log(`\n  ${yellow("not checked")}: ${NOT_VISIBLE.length} claims have no discovery member — see NOT_VISIBLE in this script`);
  process.exit(failures ? 1 : 0);
}

// ---------------------------------------------------------------- live
console.log(`Fetching ${SOURCES.length} discovery URLs…\n`);
const docs = [];
for (const url of SOURCES) {
  try {
    docs.push({ url, doc: await fetchDoc(url) });
  } catch (e) {
    fail(e.message);
  }
}
if (!docs.length) {
  console.log(red("\nNo document could be read. Nothing was checked."));
  process.exit(1);
}

// All sources must agree, member for member.
console.log("Source agreement");
const memberSets = docs.map((d) => Object.keys(d.doc).sort());
for (let i = 1; i < memberSets.length; i++) {
  if (JSON.stringify(memberSets[i]) !== JSON.stringify(memberSets[0])) {
    const only0 = memberSets[0].filter((m) => !memberSets[i].includes(m));
    const onlyI = memberSets[i].filter((m) => !memberSets[0].includes(m));
    fail(`${docs[i].url} disagrees with ${docs[0].url}: only in first [${only0}], only in second [${onlyI}]`);
  }
}
if (!failures) pass(`all ${docs.length} sources serve the same ${memberSets[0].length} members`);

const live = docs[0].doc;
const liveMembers = memberSets[0];

// ---- job 1: member drift, BY NAME ----
console.log(`\nMember drift (baseline captured ${baseline?.captured ?? "—"})`);
if (baseline) {
  const added = liveMembers.filter((m) => !baseline.members.includes(m));
  const removed = baseline.members.filter((m) => !liveMembers.includes(m));
  if (!added.length && !removed.length) {
    pass(`${liveMembers.length} members, unchanged`);
  } else {
    if (added.length) fail(`ADDED (${added.length}): ${added.join(", ")}`);
    if (removed.length) fail(`REMOVED (${removed.length}): ${removed.join(", ")}`);
    console.log(
      `    ${yellow("→")} a member changed without a paired doc change is the DR-03 failure. Find what enabled it,\n` +
        `      update the docs the flag gated, then re-baseline with --live --update.`
    );
  }
}

// ---- job 2: claim drift ----
console.log(`\nREADME claims vs the live document`);
const readme = readFileSync(README, "utf8");
for (const { feature, member, expect } of CLAIMS) {
  const present = member in live && live[member] !== false;
  if (present === expect) {
    pass(`${feature} — ${member} ${expect ? "present" : "absent"}`);
  } else {
    fail(
      expect
        ? `${feature} — README implies it works, but "${member}" is ${member in live ? `\`false\`` : "ABSENT"}`
        : `${feature} — README says declined/off, but "${member}" is PRESENT (${JSON.stringify(live[member])})`
    );
  }
}

// The README must still name the features this check claims it advertises. If a row is renamed or
// deleted, the mapping above quietly stops meaning anything.
//
// Only `expect: true` rows are checked. A DECLINED feature legitimately has no README row — DR-08's
// three (Session Management, Front-Channel Logout, `sid`) were never claimed, so demanding a row for
// them would be demanding the repo advertise what it decided not to build.
const missingRows = CLAIMS.filter((c) => c.expect && !readme.includes(c.feature.split(" (")[0]));
for (const m of missingRows) fail(`README has no row matching "${m.feature.split(" (")[0]}" — the mapping is stale`);

// ---------------------------------------------------------------- update
if (UPDATE) {
  const next = {
    captured: new Date().toISOString().slice(0, 10),
    issuer: live.issuer,
    count: liveMembers.length,
    note: "Member LIST, not just a count. A count tells you something changed; only a list tells you what.",
    members: liveMembers,
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  console.log(`\n${green("baseline updated")}: ${next.count} members, ${next.captured}`);
  failures = 0;
}

console.log(`\n  ${yellow("not checked")}: ${NOT_VISIBLE.length} claims have no discovery member:`);
for (const n of NOT_VISIBLE) console.log(`    · ${n}`);

if (failures) {
  console.log(red(`\n✗ discovery check: ${failures} problem${failures === 1 ? "" : "s"}`));
  process.exit(1);
}
console.log(green(`\n✅ discovery check passed: ${liveMembers.length} members, ${CLAIMS.length} claims corroborated`));
