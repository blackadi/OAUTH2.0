#!/usr/bin/env node
/**
 * Replay the conformance suite's configuration checks against `conformance/fapi2-config.json`,
 * locally, before spending a run on the hosted suite.
 *
 *   node scripts/fapi2-conformance-preflight.mjs [path/to/config.json]
 *
 * **Why this exists.** A real run stopped at step 36 of 39 with
 * `GetResourceEndpointConfiguration: Couldn't find resource endpoint object in configuration` —
 * after 27 successful checks and *before making a single OAuth request*. Every one of those 27 was
 * something checkable offline. Burning a hosted run to discover a missing config key is the
 * avoidable part.
 *
 * The check names below mirror the suite's own condition classes, so a failure here maps directly
 * onto the line you would have seen in its log.
 *
 * This does NOT replace the suite. It cannot: it is our reading of the profile again, which is the
 * whole reason the hosted run matters. It only front-loads the mechanical config checks.
 */
import { readFileSync } from "node:fs";
import { createHash, createSign, createPrivateKey, randomUUID, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.argv[2] || join(repoRoot, "conformance", "fapi2-config.json");

let passed = 0;
let failed = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  OK  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  console.error(`cannot read ${configPath}: ${e.message}`);
  console.error("Run scripts/fapi2-conformance-setup.mjs --apply first.");
  process.exit(2);
}
console.log(`preflight for ${configPath}\n`);

// ── the fields the suite declares as required ───────────────────────────────
// AbstractFAPI2SPFinalServerTestModule's @ConfigurationFields. `resource.resourceUrl` is in that
// list, which is the detail the first version of the setup script missed.
const REQUIRED = [
  "server.discoveryUrl",
  "client.client_id",
  "client.scope",
  "client.jwks",
  "client2.client_id",
  "client2.scope",
  "client2.jwks",
  "resource.resourceUrl",
];
const dig = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
for (const f of REQUIRED) {
  const v = dig(config, f);
  check(`config has ${f}`, v !== undefined && v !== null && v !== "", v === undefined ? "missing" : undefined);
}
check("alias is set", !!config.alias, config.alias);

// ── server: discovery + JWKS ────────────────────────────────────────────────
let disco;
try {
  const res = await fetch(config.server.discoveryUrl, { redirect: "follow" });
  const ct = res.headers.get("content-type") ?? "";
  check(
    "GetDynamicServerConfiguration",
    res.ok && ct.includes("json"),
    `HTTP ${res.status} ${ct}`,
  );
  disco = await res.json();
} catch (e) {
  check("GetDynamicServerConfiguration", false, e.message);
}

if (disco) {
  // CheckServerConfiguration — the members the suite needs to drive the flow.
  const needed = [
    "issuer",
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
    "pushed_authorization_request_endpoint",
  ];
  const missing = needed.filter((k) => !disco[k]);
  check("CheckServerConfiguration", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : undefined);

  // The issuer must match what the config points at, or every `aud` in the flow is wrong.
  const base = config.server.discoveryUrl.replace(/\/\.well-known\/openid-configuration$/, "");
  check("issuer matches the discovery location", disco.issuer === base, `issuer=${disco.issuer}`);

  let jwks;
  try {
    const r = await fetch(disco.jwks_uri);
    jwks = await r.json();
    check("FetchServerKeys", r.ok && Array.isArray(jwks.keys) && jwks.keys.length > 0, `${jwks.keys?.length ?? 0} key(s)`);
  } catch (e) {
    check("FetchServerKeys", false, e.message);
  }

  if (jwks?.keys) {
    check(
      "EnsureJwksHasNoPrivateOrSymmetricKeyMaterial",
      jwks.keys.every((k) => !("d" in k) && !("k" in k)),
      "published set must be public-only",
    );
    check("CheckForKeyIdInServerJWKs", jwks.keys.every((k) => !!k.kid));
    // FAPI2FinalEnsureMinimumServerKeyLength: EC >= 224 bits, RSA >= 2048 (5.4.1).
    const shortKey = jwks.keys.find((k) => {
      if (k.kty === "EC") return !["P-256", "P-384", "P-521"].includes(k.crv);
      if (k.kty === "RSA") return Buffer.from(k.n ?? "", "base64url").length * 8 < 2048;
      return false;
    });
    check("FAPI2FinalEnsureMinimumServerKeyLength", !shortKey, shortKey ? `weak: ${shortKey.kid}` : undefined);
  }
}

// ── clients ─────────────────────────────────────────────────────────────────
const PERMITTED_ALGS = ["PS256", "ES256", "EdDSA"];
const thumbprints = [];
for (const which of ["client", "client2"]) {
  const c = config[which];
  const keys = c?.jwks?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    check(`${which}: ValidateClientJWKsPrivatePart`, false, "no keys");
    continue;
  }
  // The suite needs the PRIVATE half — it signs assertions and request objects with it.
  check(`${which}: ValidateClientJWKsPrivatePart`, keys.every((k) => "d" in k), "private part present");
  check(`${which}: CheckForKeyIdInClientJWKs`, keys.every((k) => !!k.kid));
  check(
    `${which}: CheckDistinctKeyIdValueInClientJWKs`,
    new Set(keys.map((k) => k.kid)).size === keys.length,
  );
  check(
    `${which}: FAPI2CheckKeyAlgInClientJWKs`,
    keys.every((k) => PERMITTED_ALGS.includes(k.alg)),
    `alg=${keys.map((k) => k.alg).join(",")}`,
  );
  check(
    `${which}: FAPI2FinalEnsureMinimumClientKeyLength`,
    keys.every((k) => (k.kty === "EC" ? ["P-256", "P-384", "P-521"].includes(k.crv) : true)),
  );
  // RFC 7638 thumbprint over the EC required members, in lexicographic order.
  for (const k of keys) {
    if (k.kty === "EC") {
      const canonical = JSON.stringify({ crv: k.crv, kty: k.kty, x: k.x, y: k.y });
      thumbprints.push(createHash("sha256").update(canonical).digest("base64url"));
    }
  }
}
// The whole reason a second client exists: the suite tests mix-up attacks between them.
check(
  "ValidateClientPrivateKeysAreDifferent",
  new Set(thumbprints).size === thumbprints.length,
  `${new Set(thumbprints).size} distinct of ${thumbprints.length}`,
);

// ── resource endpoint ───────────────────────────────────────────────────────
// GetResourceEndpointConfiguration only needs the object to exist; reachability is ours to check.
check("GetResourceEndpointConfiguration", !!config.resource && typeof config.resource === "object");
if (config.resource?.resourceUrl) {
  try {
    const r = await fetch(config.resource.resourceUrl, { method: "GET" });
    // 401 is the RIGHT answer to an unauthenticated call — it proves the endpoint is protected
    // and reachable. A 200 here would mean it is not protected at all.
    check(
      "resource endpoint is reachable and protected",
      r.status === 401 || r.status === 400,
      `HTTP ${r.status} (401/400 expected without a token)`,
    );
  } catch (e) {
    check("resource endpoint is reachable and protected", false, e.message);
  }
}

// ── live posture: does the deployment enforce what the variants assume? ─────
/**
 * The config being well-formed says nothing about whether the server still *requires* what the
 * plan's variants promise. This check exists because that gap cost a run.
 *
 * Mid-testing, `fapiModes` was set to `FAPI2_SECURITY` on the service from outside this session.
 * That single field **overrides both** the per-scope `fapi2` attribute and the per-client
 * `requestObjectRequired` — so signed request objects silently stopped being required, and every
 * client began accepting unsigned PAR while its own configuration still read
 * `requestObjectRequired: true`. Reading configuration would not have caught it. Only behaviour does.
 *
 * The same check also catches the other way to lose enforcement: a `client.scope` that omits the
 * scope carrying the `fapi2` attribute. Without it the request simply is not a FAPI request, and
 * every FAPI rule is correctly skipped — measured: `openid myscope` is refused, `openid` alone is
 * accepted.
 */
if (disco?.pushed_authorization_request_endpoint && config.client?.jwks?.keys?.[0]) {
  const jwk = config.client.jwks.keys[0];
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const j64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const nowSec = () => Math.floor(Date.now() / 1000);
  const sign = (h, p) => {
    const i = `${j64(h)}.${j64(p)}`;
    return `${i}.${createSign("SHA256").update(i).sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  const enc = (o) =>
    Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

  const parUrl = disco.pushed_authorization_request_endpoint;
  const t = nowSec();
  const cid = config.client.client_id;
  const verifier = randomBytes(32).toString("base64url");
  const body = enc({
    response_type: "code",
    client_id: cid,
    redirect_uri: `https://www.certification.openid.net/test/a/${config.alias}/callback`,
    scope: config.client.scope,
    state: randomUUID(),
    nonce: randomUUID(),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: sign(
      { alg: "ES256", typ: "JWT", kid: jwk.kid },
      { iss: cid, sub: cid, aud: disco.issuer, jti: randomUUID(), iat: t, nbf: t, exp: t + 120 },
    ),
  });
  const dpopProof = () =>
    sign(
      { alg: "ES256", typ: "dpop+jwt", jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } },
      { jti: randomUUID(), htm: "POST", htu: parUrl, iat: nowSec() },
    );

  /** `json` is the SPA's envelope; `form` is RFC 9126 §2.1, which is what the suite sends. */
  const callPar = async (wire) => {
    const r = await fetch(parUrl, {
      method: "POST",
      headers: {
        "content-type":
          wire === "form" ? "application/x-www-form-urlencoded" : "application/json",
        dpop: dpopProof(),
      },
      body: wire === "form" ? body : JSON.stringify({ parameters: body }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  try {
    const r = await callPar("json");
    check(
      "signed request objects are actually REQUIRED (unsigned PAR refused)",
      r.status >= 400 && r.status < 500,
      r.status === 201
        ? "unsigned PAR was ACCEPTED — either fapiModes is set on the service (it overrides the per-scope and per-client settings) or client.scope omits the fapi2-tagged scope. Set fapi_request_method=unsigned, or fix the service."
        : `${r.status} ${r.body.error ?? ""} ${(r.body.error_description ?? "").slice(0, 60)}`.trim(),
    );
  } catch (e) {
    check("signed request objects are actually REQUIRED (unsigned PAR refused)", false, e.message);
  }

  /**
   * 9126-W1. The check above proves Authlete's *enforcement*, but it sends the SPA's JSON envelope —
   * so it was blind to the wire format, and passed happily through three conformance runs that all
   * died at the first PAR. A conformant client sends `application/x-www-form-urlencoded` with the
   * parameters at the top level and no `parameters` field at all.
   *
   * The endpoint must refuse this request **for an OAuth reason** — here, the missing signed request
   * object. Refusing it because the body has no `parameters` field means the wire format is rejected
   * before Authlete sees it, which is the regression this exists to catch.
   */
  try {
    const r = await callPar("form");
    const envelopeComplaint = /required (body )?field: parameters/i.test(
      r.body.error_description ?? "",
    );
    check(
      "the RFC 9126 §2.1 form-encoded wire format reaches Authlete",
      !envelopeComplaint,
      envelopeComplaint
        ? `the endpoint rejected the form-encoded body itself: "${r.body.error_description}". A conformant client cannot call PAR at all — this is 9126-W1 regressing. See par.service.ts and par.controller.ts.`
        : `${r.status} ${r.body.error ?? ""} ${(r.body.error_description ?? "").slice(0, 60)}`.trim(),
    );
  } catch (e) {
    check("the RFC 9126 §2.1 form-encoded wire format reaches Authlete", false, e.message);
  }
}

// ── the variant settings this deployment forces ─────────────────────────────
console.log("\nSpecification: FAPI2 Message Signing  <- NOT 'FAPI2 Security Profile'");
console.log("  A Security Profile plan fixes fapi_request_method=unsigned and renders no");
console.log("  dropdown for it, so it dies at the first PAR against this deployment.");
console.log("\nVariants to select in the plan:");
console.log("  client_auth_type           private_key_jwt");
console.log("  sender_constrain           dpop");
console.log("  openid                     openid_connect");
console.log("  fapi_profile               plain_fapi");
console.log("  authorization_request_type simple");
console.log("\nFixed by the Message Signing family (no dropdown, nothing to set):");
console.log("  fapi_request_method        signed_non_repudiation");
console.log("  fapi_response_mode         jarm");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFix these before pasting the config into the suite — every one of them would");
  console.log("stop the run before it makes an OAuth request.");
}
process.exit(failed ? 1 : 0);
