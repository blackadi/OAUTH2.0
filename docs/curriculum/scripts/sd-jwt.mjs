#!/usr/bin/env node
// sd-jwt.mjs — a local, offline SD-JWT issuer / holder / verifier for Module 09b.
//
// WHY THIS EXISTS: SD-JWT (RFC 9901) is the one thing in Module 09b you can run
// end to end without an authorization server, a wallet, or a credential issuer.
// It is pure cryptography over JSON. So instead of reading about selective
// disclosure, you issue a credential, hold it, present two claims out of six,
// and then try to cheat — and watch the verifier catch you.
//
// It has no dependencies and makes no network calls. Everything is Node's
// built-in crypto. Read it: it is deliberately written to be read.
//
// THE THREE ROLES (RFC 9901 §1.2) map to the three main commands:
//   Issuer   → `issue`     creates the SD-JWT and hands over ALL Disclosures
//   Holder   → `present`   chooses WHICH Disclosures to forward, and proves key possession
//   Verifier → `verify`    recomputes every digest and rebuilds the payload
//
// USAGE
//   node sd-jwt.mjs keygen  <prefix>
//   node sd-jwt.mjs digest  <disclosure-string>
//   node sd-jwt.mjs issue   --claims c.json --sd name,dob --issuer-key i-priv.json
//                           [--holder-key h-pub.json] [--decoys 2] [--iss URL] [--out f]
//   node sd-jwt.mjs inspect <file|->
//   node sd-jwt.mjs present <file|-> --disclose name,dob
//                           [--kb-key h-priv.json --aud URL --nonce STR] [--out f]
//   node sd-jwt.mjs verify  <file|-> --issuer-key i-pub.json
//                           [--require-kb --aud URL --nonce STR]
//
// `verify` prints a numbered PASS/FAIL trace that follows RFC 9901 §7.1 and §7.3
// step by step, so a failure tells you WHICH normative check rejected it.

import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');
const jsonb64u = (o) => b64u(Buffer.from(JSON.stringify(o), 'utf8'));

// RFC 9901 §4.2.3: "The digest MUST be computed over the US-ASCII bytes of the
// base64url-encoded value that is the Disclosure." Note what this rules out:
// you may NOT decode the Disclosure, re-serialize it, and hash that. Two JSON
// serializations of the same array (`["a","b"]` vs `["a", "b"]`) are different
// strings and therefore different digests. Always hash the string as received.
function digestOf(disclosureString, alg = 'sha-256') {
  const nodeAlg = { 'sha-256': 'sha256', 'sha-384': 'sha384', 'sha-512': 'sha512' }[alg];
  if (!nodeAlg) throw new Error(`unsupported _sd_alg: ${alg}`);
  return createHash(nodeAlg).update(Buffer.from(disclosureString, 'ascii')).digest('base64url');
}

// ---------------------------------------------------------------------------
// ES256 JWS (compact) — sign and verify
// ---------------------------------------------------------------------------
// ES256 signatures in JWS are raw IEEE P1363 R||S (64 bytes for P-256), NOT
// DER. This is the same trap Module 05 hit with DPoP proofs; Node needs to be
// told explicitly with dsaEncoding.

function jwsSign(header, payload, privateJwk) {
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  const signingInput = `${jsonb64u(header)}.${jsonb64u(payload)}`;
  const sig = cryptoSign('sha256', Buffer.from(signingInput, 'ascii'), { key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64u(sig)}`;
}

function jwsVerify(compact, publicJwk) {
  const [h, p, s] = compact.split('.');
  if (!h || !p || s === undefined) return false;
  const key = createPublicKey({ key: publicJwk, format: 'jwk' });
  return cryptoVerify('sha256', Buffer.from(`${h}.${p}`, 'ascii'), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s));
}

const jwsHeader = (compact) => JSON.parse(unb64u(compact.split('.')[0]).toString('utf8'));
const jwsPayload = (compact) => JSON.parse(unb64u(compact.split('.')[1]).toString('utf8'));

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[k] = true; }
      else { out[k] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const readMaybeStdin = (f) => (f === '-' || f === undefined ? readFileSync(0, 'utf8') : readFileSync(f, 'utf8')).trim();

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------------------
// keygen
// ---------------------------------------------------------------------------

function cmdKeygen(args) {
  const prefix = args._[0] || die('usage: keygen <prefix>');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const priv = { ...privateKey.export({ format: 'jwk' }), alg: 'ES256', use: 'sig' };
  const pub = { ...publicKey.export({ format: 'jwk' }), alg: 'ES256', use: 'sig' };
  writeFileSync(`${prefix}-priv.json`, JSON.stringify(priv, null, 2));
  writeFileSync(`${prefix}-pub.json`, JSON.stringify(pub, null, 2));
  console.log(`wrote ${prefix}-priv.json (KEEP THIS LOCAL) and ${prefix}-pub.json`);
}

// ---------------------------------------------------------------------------
// digest — for checking your understanding against RFC 9901's own test vector
// ---------------------------------------------------------------------------

function cmdDigest(args) {
  const d = args._[0] || die('usage: digest <disclosure-string>');
  console.log(`disclosure : ${d}`);
  try { console.log(`decodes to : ${unb64u(d).toString('utf8')}`); } catch { /* not base64url */ }
  console.log(`sha-256    : ${digestOf(d)}`);
}

// ---------------------------------------------------------------------------
// issue — the Issuer role
// ---------------------------------------------------------------------------

function makeDisclosure(claimName, claimValue) {
  // RFC 9901 §4.2.1: a JSON array of three elements, in order:
  //   1. a salt (string)  2. the claim name  3. the claim value
  // §9.3: "The RECOMMENDED minimum length of the randomly generated portion of
  // the salt is 128 bits" and "A new salt MUST be chosen for each claim
  // independently of other salts."
  const salt = b64u(randomBytes(16)); // 128 bits
  const arr = claimName === null ? [salt, claimValue] : [salt, claimName, claimValue];
  return { salt, arr, str: b64u(Buffer.from(JSON.stringify(arr), 'utf8')) };
}

function cmdIssue(args) {
  const claimsFile = args.claims || die('--claims <file.json> is required');
  const issuerKeyFile = args['issuer-key'] || die('--issuer-key <priv.json> is required');
  const claims = readJson(claimsFile);
  const issuerPriv = readJson(issuerKeyFile);
  const sdNames = String(args.sd || '').split(',').map((s) => s.trim()).filter(Boolean);
  const decoys = Number(args.decoys || 0);

  const payload = {};
  const disclosures = [];
  const sdDigests = [];

  for (const [k, v] of Object.entries(claims)) {
    if (sdNames.includes(k)) {
      const d = makeDisclosure(k, v);
      disclosures.push({ name: k, ...d });
      sdDigests.push(digestOf(d.str));
    } else {
      payload[k] = v; // stays in the clear — always visible to every Verifier
    }
  }

  const missing = sdNames.filter((n) => !(n in claims));
  if (missing.length) die(`--sd names not present in the claims file: ${missing.join(', ')}`);

  // §4.2.5: decoy digests hide how many claims were actually made selectively
  // disclosable. No Disclosure is ever sent for them, so the Holder sees digests
  // it cannot open — that is intentional, not corruption.
  for (let i = 0; i < decoys; i++) sdDigests.push(digestOf(b64u(randomBytes(32))));

  // §4.2.4.1: "The Issuer MUST hide the original order of the claims in the
  // array. To ensure this, it is RECOMMENDED to shuffle the array of hashes,
  // e.g., by sorting it alphanumerically or randomly".
  sdDigests.sort();

  if (sdDigests.length) payload._sd = sdDigests;
  // §4.1.1: sha-256 is the default if _sd_alg is absent, but being explicit is
  // cheaper than being ambiguous.
  payload._sd_alg = 'sha-256';

  // 3c-F3: `--iss` was optional here and is effectively mandatory at `verify`, whose §7.1 step 2c requires a
  // non-empty `iss` — so `issue` without it produced a credential this same script always rejects. Required
  // rather than defaulted: `iss` identifies who signed the credential, and inventing a plausible issuer
  // identifier is exactly the habit a curriculum on token validation should not teach.
  if (!args.iss && !claims.iss) die('--iss <URL> is required (RFC 9901 §7.1 step 2c: the Verifier must check `iss`)');
  if (args.iss) payload.iss = args.iss;
  payload.iat = Math.floor(Date.now() / 1000);

  // §4.1.2: to enable Key Binding the Issuer includes the Holder's public key
  // in a `cnf` claim (RFC 7800). Note `cnf` is in the CLEAR — §9.7 lists it as
  // security-critical and therefore something an Issuer MUST NOT make
  // selectively disclosable.
  if (args['holder-key']) payload.cnf = { jwk: readJson(args['holder-key']) };

  const header = { alg: 'ES256', typ: 'example+sd-jwt' };
  const issuerJwt = jwsSign(header, payload, issuerPriv);

  // §4: "<Issuer-signed JWT>~<D.1>~<D.2>~...~<D.N>~" — and with no KB-JWT
  // "the last element MUST be an empty string and the last separating tilde
  // character MUST NOT be omitted."
  const sdjwt = [issuerJwt, ...disclosures.map((d) => d.str)].join('~') + '~';

  console.error('--- Disclosures created (the Issuer sends ALL of these to the Holder) ---');
  for (const d of disclosures) console.error(`  ${d.name.padEnd(14)} ${d.str}\n  ${''.padEnd(14)} digest=${digestOf(d.str)}`);
  if (decoys) console.error(`  (+${decoys} decoy digest(s) with no Disclosure — §4.2.5)`);
  console.error(`--- Always-visible claims: ${Object.keys(payload).filter((k) => !k.startsWith('_sd')).join(', ') || '(none)'}`);
  console.error('');

  if (args.out) { writeFileSync(args.out, sdjwt); console.error(`wrote ${args.out}`); }
  else console.log(sdjwt);
}

// ---------------------------------------------------------------------------
// inspect — see the structure without verifying anything
// ---------------------------------------------------------------------------

/**
 * Split a compact SD-JWT, and REFUSE the one malformed shape that silently changes its meaning.
 *
 * §4: the two formats *"can be distinguished by the final ~ character"*, and with no KB-JWT
 * *"the last element MUST be an empty string and the last separating tilde character MUST NOT be omitted."*
 *
 * **This function quoted that rule and did not enforce it (3c-F1).** Inferring the KB-JWT from "is the final
 * element non-empty" means that **omitting the trailing tilde reclassifies the last Disclosure as a
 * Key Binding JWT** and drops it from the Disclosure list. Every verification step then passed — including
 * `7.1/5`, because the surviving Disclosures genuinely *are* all referenced by a digest — and the script
 * printed `ACCEPTED` for a malformed credential with a claim silently missing from the processed payload.
 * A verifier that accepts a claim-losing mutation is worse than one that rejects valid input.
 *
 * **The discriminator is structural, not heuristic.** A KB-JWT is a JWS: three base64url segments joined by
 * two dots. A Disclosure is base64url of a JSON array and contains **no** dot. So a non-empty final element
 * with no dots cannot be a KB-JWT, which makes the omitted tilde detectable rather than merely suspected.
 *
 * @returns `{ issuerJwt, disclosures, kbJwt, malformed }` — `malformed` carries the reason when set, so the
 *          caller can report it as the failure of §7.1 step 1 instead of the step asserting `true`.
 */
function splitSdJwt(s) {
  const parts = s.trim().split('~');
  const issuerJwt = parts[0];
  const last = parts[parts.length - 1];

  if (parts.length < 2) {
    return { issuerJwt, disclosures: [], kbJwt: null, malformed: 'no "~" present — this is a bare JWT, not an SD-JWT (§4)' };
  }

  let malformed = null;
  if (last !== '' && !last.includes('.')) {
    malformed =
      `the final element "${last.slice(0, 24)}${last.length > 24 ? '…' : ''}" is not a JWS (no "."), so it is a ` +
      'Disclosure and the trailing "~" was omitted. §4: with no KB-JWT the last element MUST be an empty ' +
      'string and the last separating tilde MUST NOT be omitted';
  }

  // On the malformed shape, keep the final element as a Disclosure — that is what it is. The credential is
  // rejected either way, and treating it correctly means the reported Disclosure count is the true one.
  const kbJwt = malformed || last === '' ? null : last;
  const disclosures = malformed ? parts.slice(1) : parts.slice(1, parts.length - 1);
  return { issuerJwt, disclosures, kbJwt, malformed };
}

function cmdInspect(args) {
  const { issuerJwt, disclosures, kbJwt, malformed } = splitSdJwt(readMaybeStdin(args._[0]));
  if (malformed) console.log(`!! MALFORMED per §4: ${malformed}\n`);
  const payload = jwsPayload(issuerJwt);
  console.log('=== Issuer-signed JWT ===');
  console.log('header :', JSON.stringify(jwsHeader(issuerJwt)));
  console.log('payload:', JSON.stringify(payload, null, 2));
  console.log(`\n=== Disclosures carried (${disclosures.length}) ===`);
  const alg = payload._sd_alg || 'sha-256';
  for (const d of disclosures) {
    const arr = JSON.parse(unb64u(d).toString('utf8'));
    const kind = arr.length === 3 ? `${arr[1]} = ${JSON.stringify(arr[2])}` : `array element ${JSON.stringify(arr[1])}`;
    console.log(`  digest=${digestOf(d, alg)}  ${kind}`);
  }
  const carried = new Set(disclosures.map((d) => digestOf(d, alg)));
  const hidden = (payload._sd || []).filter((h) => !carried.has(h));
  if (hidden.length) console.log(`\n=== ${hidden.length} digest(s) in _sd with NO Disclosure here ===\n  (withheld by the Holder, or decoys — you cannot tell which. That is the point.)`);
  console.log(`\n=== Key Binding JWT ===\n  ${kbJwt ? JSON.stringify(jwsPayload(kbJwt)) : '(none — this is a bare SD-JWT)'}`);
}

// ---------------------------------------------------------------------------
// present — the Holder role
// ---------------------------------------------------------------------------

function cmdPresent(args) {
  const { issuerJwt, disclosures } = splitSdJwt(readMaybeStdin(args._[0]));
  const payload = jwsPayload(issuerJwt);
  const alg = payload._sd_alg || 'sha-256';
  const wanted = String(args.disclose ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const keep = disclosures.filter((d) => {
    const arr = JSON.parse(unb64u(d).toString('utf8'));
    return arr.length === 3 && wanted.includes(arr[1]);
  });
  const found = keep.map((d) => JSON.parse(unb64u(d).toString('utf8'))[1]);
  const missing = wanted.filter((w) => !found.includes(w));
  if (missing.length) die(`no Disclosure held for: ${missing.join(', ')}`);

  // §4.3.1: sd_hash is computed over the Issuer-signed JWT, a tilde, and the
  // Disclosures SELECTED FOR PRESENTATION, each followed by a tilde. So the
  // hash covers exactly what this Verifier is about to see — withhold one more
  // Disclosure and the hash changes.
  const sdPart = [issuerJwt, ...keep].join('~') + '~';

  // 3c-F2: `--out` used to be handled only after this early return, so on the no-Key-Binding path
  // `present … --out fewer.txt` wrote to stdout and created no file, silently. The usage block advertises
  // `[--out f]` for both paths, so the flag has to work on both.
  if (!args['kb-key']) {
    if (args.out) { writeFileSync(args.out, sdPart); console.error(`wrote ${args.out}`); }
    else process.stdout.write(sdPart);
    return;
  }

  if (!args.aud || !args.nonce) die('--kb-key requires --aud and --nonce (both REQUIRED by §4.3)');
  const kbPayload = {
    iat: Math.floor(Date.now() / 1000),
    aud: String(args.aud),
    nonce: String(args.nonce),
    sd_hash: digestOf(sdPart, alg),
  };
  const kb = jwsSign({ alg: 'ES256', typ: 'kb+jwt' }, kbPayload, readJson(args['kb-key']));
  const out = sdPart + kb;
  if (args.out) { writeFileSync(args.out, out); console.error(`wrote ${args.out}`); }
  else process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// verify — the Verifier role, RFC 9901 §7.1 then §7.3
// ---------------------------------------------------------------------------

let failed = false;
function step(id, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
  if (!ok) failed = true;
  return ok;
}

function cmdVerify(args) {
  const raw = readMaybeStdin(args._[0]);
  const issuerPubFile = args['issuer-key'] || die('--issuer-key <pub.json> is required');
  const issuerPub = readJson(issuerPubFile);
  const requireKb = !!args['require-kb'];

  console.log('=== RFC 9901 §7.3 — Verification by the Verifier ===');

  // §7.3 step 1: "This decision MUST NOT be based on whether or not a Key
  // Binding JWT is provided by the Holder." We take it from --require-kb, i.e.
  // from policy set BEFORE looking at the input. That is the whole point.
  console.log(`  ----  7.3/1 Key Binding required by policy? ${requireKb ? 'YES' : 'no'}  (decided before parsing — §9.5)`);

  const { issuerJwt, disclosures, kbJwt, malformed: splitError } = splitSdJwt(raw);

  // §7.3 step 2
  if (requireKb) step('7.3/2', kbJwt !== null, kbJwt ? 'SD-JWT+KB provided' : 'Key Binding required but a bare SD-JWT was presented — REJECT');
  if (failed) return finish();

  // ---- §7.1 ----
  console.log('=== RFC 9901 §7.1 — Verification of the SD-JWT ===');
  // Was hardcoded `true`, which reported a miscount as a PASS (3c-F1). Step 1 is "separate the SD-JWT into
  // its parts" — a step that cannot fail is not a check.
  step('7.1/1', !splitError,
    splitError
      ? `MALFORMED — ${splitError}`
      : `split into 1 Issuer-signed JWT + ${disclosures.length} Disclosure(s)${kbJwt ? ' + KB-JWT' : ''}`);
  if (failed) return finish();

  const header = jwsHeader(issuerJwt);
  step('7.1/2a', header.alg !== 'none' && /^(ES|RS|PS|EdDSA)/.test(header.alg), `alg=${header.alg} ("none" MUST NOT be accepted)`);
  step('7.1/2b', jwsVerify(issuerJwt, issuerPub), `signature over the Issuer-signed JWT (key: ${issuerPubFile})`);
  const payload = jwsPayload(issuerJwt);
  step('7.1/2c', typeof payload.iss === 'string' && payload.iss.length > 0, `iss=${payload.iss ?? '(absent)'} — you must independently confirm this key belongs to that Issuer`);
  const alg = payload._sd_alg || 'sha-256';
  step('7.1/2d', ['sha-256', 'sha-384', 'sha-512'].includes(alg), `_sd_alg=${payload._sd_alg ?? '(absent → default sha-256, §4.1.1)'}`);
  if (failed) return finish();

  // §7.1 step 3a: digest every Disclosure we were given.
  const byDigest = new Map();
  let undecodable = false;
  for (const d of disclosures) {
    let arr;
    try { arr = JSON.parse(unb64u(d).toString('utf8')); } catch { undecodable = true; continue; }
    byDigest.set(digestOf(d, alg), { arr, str: d });
  }
  step('7.1/3a', !undecodable, `computed ${byDigest.size} digest(s) over the Disclosure strings as received`);

  // §7.1 step 3b/3c, restricted to top-level object properties, which is all
  // this teaching tool issues. Nested and recursive Disclosures (§4.2.6, §6)
  // follow the same rules applied recursively.
  const embedded = Array.isArray(payload._sd) ? payload._sd : [];
  const seen = new Set();
  let dupDigest = null;
  for (const h of embedded) { if (seen.has(h)) dupDigest = h; seen.add(h); }

  const out = { ...payload };
  delete out._sd; delete out._sd_alg;
  const used = new Set();
  let badShape = null, reserved = null, collision = null;

  for (const h of embedded) {
    const hit = byDigest.get(h);
    if (!hit) continue; // §7.1/3.c.i: no matching Disclosure → the digest MUST be ignored
    used.add(h);
    if (!Array.isArray(hit.arr) || hit.arr.length !== 3) { badShape = h; continue; }
    const [, name, value] = hit.arr;
    if (name === '_sd' || name === '...') { reserved = name; continue; }
    if (Object.prototype.hasOwnProperty.call(out, name)) { collision = name; continue; }
    out[name] = value;
  }

  step('7.1/3c.ii.1', badShape === null, badShape ? `a Disclosure under _sd was not a 3-element array` : 'every matched Disclosure is [salt, name, value]');
  step('7.1/3c.ii.2', reserved === null, reserved ? `claim name "${reserved}" is forbidden` : 'no Disclosure claims the name _sd or ...');
  step('7.1/3c.ii.3', collision === null, collision ? `claim "${collision}" already exists at this level — REJECT` : 'no disclosed claim collides with a plaintext claim');

  // §7.1 step 4
  step('7.1/4', dupDigest === null, dupDigest ? `digest ${dupDigest.slice(0, 16)}… appears more than once — REJECT` : 'no digest appears twice in the payload');

  // §7.1 step 5
  const unreferenced = [...byDigest.keys()].filter((h) => !used.has(h));
  step('7.1/5', unreferenced.length === 0, unreferenced.length ? `${unreferenced.length} Disclosure(s) not referenced by any digest — REJECT` : 'every Disclosure presented is referenced by a digest');

  // §7.1 step 6: "Check that the SD-JWT is valid using claims such as nbf, exp,
  // and aud IN THE PROCESSED PAYLOAD, if present." The processed payload — not
  // the raw Issuer-signed JWT payload. If the Issuer made exp selectively
  // disclosable, exp only appears here once its Disclosure has been merged in.
  const now = Math.floor(Date.now() / 1000);
  const expOk = out.exp === undefined || out.exp > now;
  step('7.1/6-exp', expOk, out.exp === undefined ? 'no exp in the processed payload' : (expOk ? `exp=${out.exp} is in the future` : `exp=${out.exp} has passed — REJECT`));
  const nbfOk = out.nbf === undefined || out.nbf <= now;
  if (out.nbf !== undefined) step('7.1/6-nbf', nbfOk, nbfOk ? `nbf=${out.nbf} has passed` : `nbf=${out.nbf} is in the future — REJECT`);

  // §7.1 step 6 continued: "If a required validity-controlling claim is missing
  // (see Section 9.7), the SD-JWT MUST be rejected." §9.7 is emphatic that
  // "Verifiers cannot reliably depend on" the Issuer putting these in plaintext
  // and "MUST ensure that all claims they deem necessary for checking the
  // validity of an SD-JWT in the given context are present (or disclosed)".
  // So the Verifier states its requirement up front; absence is then a failure,
  // not a silent pass.
  const required = String(args['require-claims'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const c of required) {
    step('7.1/6-req', Object.prototype.hasOwnProperty.call(out, c), `required validity claim "${c}" ${Object.prototype.hasOwnProperty.call(out, c) ? 'is present' : 'is MISSING from the processed payload — REJECT (§9.7)'}`);
  }
  if (!required.length) console.log('  ----  7.1/6  no --require-claims given: this Verifier demands no validity claims at all (see §9.7)');
  if (failed) return finish();

  // ---- §7.3 step 5, Key Binding ----
  if (requireKb) {
    console.log('=== RFC 9901 §7.3/5 — Key Binding JWT ===');
    const cnfJwk = payload.cnf?.jwk;
    step('7.3/5a', !!cnfJwk, cnfJwk ? 'Holder public key taken from the cnf.jwk claim of the SD-JWT' : 'no cnf.jwk in the SD-JWT — cannot check Key Binding');
    if (!cnfJwk) return finish();
    const kbHeader = jwsHeader(kbJwt);
    step('7.3/5b', kbHeader.alg !== 'none', `KB-JWT alg=${kbHeader.alg}`);
    step('7.3/5c', jwsVerify(kbJwt, cnfJwk), 'KB-JWT signature verifies against cnf.jwk');
    step('7.3/5d', kbHeader.typ === 'kb+jwt', `typ=${kbHeader.typ} (MUST be kb+jwt)`);
    const kbp = jwsPayload(kbJwt);
    const age = now - (kbp.iat ?? 0);
    step('7.3/5e', typeof kbp.iat === 'number' && age >= -60 && age <= 300, `iat=${kbp.iat} (${age}s old; this tool accepts a 5-minute window)`);
    if (args.aud !== undefined) step('7.3/5f-aud', kbp.aud === String(args.aud), `aud=${JSON.stringify(kbp.aud)} vs expected ${JSON.stringify(String(args.aud))}`);
    else console.log('  ----  7.3/5f  no --aud given, so audience is UNCHECKED (a real Verifier MUST check it)');
    if (args.nonce !== undefined) step('7.3/5f-nonce', kbp.nonce === String(args.nonce), `nonce=${JSON.stringify(kbp.nonce)} vs expected ${JSON.stringify(String(args.nonce))}`);
    else console.log('  ----  7.3/5f  no --nonce given, so replay detection is UNCHECKED (a real Verifier MUST check it)');

    // §4.3.1: recompute over exactly the Issuer-signed JWT + presented Disclosures.
    const sdPart = [issuerJwt, ...disclosures].join('~') + '~';
    const expected = digestOf(sdPart, alg);
    const a = Buffer.from(String(kbp.sd_hash ?? ''), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    step('7.3/5g', a.length === b.length && timingSafeEqual(a, b), `sd_hash binds the KB-JWT to these exact Disclosures (expected ${expected.slice(0, 16)}…, got ${String(kbp.sd_hash ?? '(absent)').slice(0, 16)}…)`);
  }

  return finish(out);
}

function finish(out) {
  console.log('');
  if (failed) {
    console.log('RESULT: REJECTED. Per §7.1 and §7.3, "If any step fails, the presentation is not');
    console.log('valid and processing MUST be aborted." Nothing above may be used by the application.');
    process.exit(1);
  }
  console.log('RESULT: ACCEPTED. Processed SD-JWT Payload (this, and only this, reaches the application):');
  console.log(JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------------------

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);
const commands = { keygen: cmdKeygen, digest: cmdDigest, issue: cmdIssue, inspect: cmdInspect, present: cmdPresent, verify: cmdVerify };

if (!cmd || !commands[cmd]) {
  console.error('usage: node sd-jwt.mjs <keygen|digest|issue|inspect|present|verify> [options]');
  console.error('       see the header comment of this file for the full option list');
  process.exit(2);
}
commands[cmd](args);
