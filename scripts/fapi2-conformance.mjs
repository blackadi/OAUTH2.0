#!/usr/bin/env node
/**
 * FAPI 2.0 conformance probe — Security Profile, and the Message Signing Profile's
 * signed-authorization-request half.
 *
 * Drives the whole authorization code flow headlessly against a running deployment:
 * PAR (private_key_jwt + PKCE S256 + DPoP) -> authorize -> login -> consent -> code -> token.
 * Then it re-runs the same flow with one requirement broken at a time and asserts the
 * server refuses. A profile is only worth as much as its negative cases: a server that
 * accepts the happy path proves nothing about what it rejects.
 *
 * Requirements are cited against FAPI 2.0 Security Profile (Final) section numbers.
 *
 *   BASE=http://localhost:3000 \
 *   CLIENT_JWK=/path/to/client-private.jwk.json \
 *   node scripts/fapi2-conformance.mjs
 *
 * Allow ~60s between runs. The deployment rate-limits login to 5/minute and the general API
 * to 20/minute, and a full pass spends most of that budget — so back-to-back runs report
 * skips with `429` in the reason. That is the limiter working, not a conformance failure.
 *
 * Env:
 *   BASE        deployment root, no trailing slash   (default http://localhost:3000)
 *   CLIENT_JWK  path to the client's PRIVATE JWK     (required)
 *   CLIENT_ID   default 1241400020
 *   ISSUER      assertion `aud`; Authlete's clientAssertionAudRestrictedToIssuer is on,
 *               so this must be the service's issuer identifier exactly
 *   REDIRECT_URI  must be registered on the client, https (FAPI 2.0 5.3.2.2)
 *   SCOPE       default "openid myscope" — myscope carries Authlete's {fapi2: sp} attribute
 *   FAPI_USERNAME / FAPI_PASSWORD  demo login, default admin/password. Namespaced on purpose:
 *               the shell already exports USERNAME on most systems.
 */
import {
  createSign,
  createPrivateKey,
  createHmac,
  generateKeyPairSync,
  randomUUID,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/+$/, "");
const CLIENT_ID = process.env.CLIENT_ID || "1241400020";
const ISSUER = process.env.ISSUER || "https://oauth2-0-ekh2.onrender.com";
const REDIRECT_URI = process.env.REDIRECT_URI || "https://oauth2-0-ekh2.onrender.com/cb";
const SCOPE = process.env.SCOPE || "openid myscope";
// Namespaced. `USERNAME` is set by the shell on most systems (and `PASSWORD` on some), so
// reading the bare names silently logged in as the OS user and the flow died at a re-rendered
// login page — a harness bug that reads exactly like a server defect.
// Message Signing Profile: send every authorization request as a signed request object.
// Set JAR=1 when the deployment has FAPI2_MESSAGE_SIGNING_AUTH_REQ enabled and the client
// carries requestObjectRequired=true; plain parameters are refused under that mode.
const USE_JAR = process.env.JAR === "1";
// Message Signing's second half: signed authorization responses (JARM). Defaults to whatever JAR is
// set to, because Authlete's `fapi2: ms-authres` scope attribute makes them required together — a
// request that omits `response_mode` under that attribute gets an error redirect, not a bare code.
const USE_JARM = process.env.JARM ? process.env.JARM === "1" : USE_JAR;
const USERNAME = process.env.FAPI_USERNAME || "admin";
const PASSWORD = process.env.FAPI_PASSWORD || "password";

const jwkPath = process.env.CLIENT_JWK;
if (!jwkPath) {
  console.error("CLIENT_JWK is required (path to the client's private JWK).");
  process.exit(2);
}
const CLIENT_JWK = JSON.parse(readFileSync(jwkPath, "utf8"));
const CLIENT_KEY = createPrivateKey({ key: CLIENT_JWK, format: "jwk" });
const CLIENT_PUB_JWK = { kty: CLIENT_JWK.kty, crv: CLIENT_JWK.crv, x: CLIENT_JWK.x, y: CLIENT_JWK.y };

// ── JOSE ────────────────────────────────────────────────────────────────────
const b64u = (b) => Buffer.from(b).toString("base64url");
const json64 = (o) => b64u(JSON.stringify(o));

/** ES256 over P-256. `ieee-p1363` is the raw r||s JWS needs; DER would be rejected. */
function signES256(header, payload, key = CLIENT_KEY) {
  const input = `${json64(header)}.${json64(payload)}`;
  const sig = createSign("SHA256")
    .update(input)
    .sign({ key, dsaEncoding: "ieee-p1363" });
  return `${input}.${sig.toString("base64url")}`;
}

const now = () => Math.floor(Date.now() / 1000);

/**
 * private_key_jwt (OIDC Core 9). `nbf` is present because the service sets
 * nbfOptional=false, and `aud` is the issuer identifier because
 * clientAssertionAudRestrictedToIssuer=true — which is itself FAPI 2.0 5.3.2.1's
 * "shall only accept its issuer identifier value ... as a string in the aud claim".
 */
function clientAssertion({ alg = "ES256", aud = ISSUER, key = CLIENT_KEY } = {}) {
  const t = now();
  return signES256(
    { alg, typ: "JWT", kid: CLIENT_JWK.kid },
    { iss: CLIENT_ID, sub: CLIENT_ID, aud, jti: randomUUID(), iat: t, nbf: t, exp: t + 120 },
    key,
  );
}

/** DPoP proof, RFC 9449 4.2. `htu` carries no query or fragment. */
function dpopProof(htm, htu, { nonce, ath, key = CLIENT_KEY, jwk = CLIENT_PUB_JWK } = {}) {
  const payload = { jti: randomUUID(), htm, htu: htu.split(/[?#]/)[0], iat: now() };
  if (nonce) payload.nonce = nonce;
  if (ath) payload.ath = ath;
  return signES256({ alg: "ES256", typ: "dpop+jwt", jwk }, payload, key);
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ── HTTP with a cookie jar ──────────────────────────────────────────────────
function newJar() {
  return new Map();
}
function jarHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function absorb(jar, res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function http(method, url, { headers = {}, body, jar } = {}) {
  const h = { ...headers };
  if (jar && jar.size) h.cookie = jarHeader(jar);
  const res = await fetch(url, { method, headers: h, body, redirect: "manual" });
  if (jar) absorb(jar, res);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status: res.status, headers: res.headers, text, json: parsed, location: res.headers.get("location") };
}

const form = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

// ── Flow steps ──────────────────────────────────────────────────────────────

/**
 * The server's /api/par is a debugging wrapper: it takes JSON with the OAuth request in a
 * `parameters` string rather than a form-encoded body. Authlete matches the channel the
 * credentials arrive on against the client's registered method, so for private_key_jwt the
 * assertion belongs inside `parameters`, not beside it.
 */
/**
 * Wrap the authorization parameters in a signed request object (RFC 9101 / JAR), which the
 * Message Signing Profile requires. `client_id` stays outside the JWT as well as inside it —
 * RFC 9126 needs it to identify the client before the object is parsed.
 */
function asRequestObject(paramObj) {
  const t = now();
  const jwt = signES256(
    { alg: "ES256", typ: "oauth-authz-req+jwt", kid: CLIENT_JWK.kid },
    { ...paramObj, iss: CLIENT_ID, aud: ISSUER, jti: randomUUID(), iat: t, nbf: t, exp: t + 120 },
  );
  return { client_id: CLIENT_ID, request: jwt };
}

async function par(paramObj, { dpop = true, assertion = true, assertionOpts, jar = USE_JAR } = {}) {
  const params = jar ? asRequestObject(paramObj) : { ...paramObj };
  if (assertion) {
    params.client_assertion_type = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
    params.client_assertion = clientAssertion(assertionOpts);
  }
  const url = `${BASE}/api/par`;
  const headers = { "content-type": "application/json" };
  if (dpop) headers.dpop = dpopProof("POST", url);
  // No `clientId` in the JSON envelope. par.service.ts appends an envelope clientId into
  // `parameters` as `client_id`, which for private_key_jwt would duplicate the client_id the
  // assertion already carries. The assertion is the credential; the envelope stays empty.
  return http("POST", url, { headers, body: JSON.stringify({ parameters: form(params) }) });
}

/**
 * Push a request, then present the resulting `request_uri` at the authorization endpoint and
 * report what the authorization endpoint decided.
 *
 * PAR stores parameters; it does not evaluate every rule. Authlete defers the PKCE checks to
 * the authorization request, so a probe that asserted enforcement at PAR alone reported two
 * violations this deployment does not have. Where a requirement is enforced is part of the
 * requirement.
 */
async function parThenAuthorize(paramObj) {
  const pr = await par(paramObj);
  if (pr.status !== 201 || !pr.json?.request_uri) {
    return { stage: "par", status: pr.status, error: pr.json?.error, detail: `PAR ${pr.status} ${pr.json?.error ?? ""}`.trim() };
  }
  const r = await http("GET", `${BASE}/api/authorization?${form({ client_id: CLIENT_ID, request_uri: pr.json.request_uri })}`);
  if (r.status >= 400) return { stage: "authorization", status: r.status, detail: `authorize ${r.status}` };
  if (r.status === 302 && r.location) {
    const loc = new URL(r.location, BASE);
    // Read the outcome through `finalRedirect`, not off the query string. Under JARM the error
    // lives INSIDE the signed response JWT, so a query-string check sees no `error` and calls a
    // correctly-refused request "accepted" — which is how two passing negative cases flipped to
    // failures the moment signed responses were switched on. Same blind spot, second place.
    const outcome = finalRedirect(r.location);
    if (outcome?.error) {
      return { stage: "authorization", status: 302, error: outcome.error, detail: `authorize 302 error=${outcome.error}` };
    }
    // Neither a code nor an error: it never reached the authorization response — the login page.
    if (!outcome) {
      return { stage: "authorization", status: 302, accepted: true, detail: `authorize 302 -> ${loc.pathname} (accepted)` };
    }
    return { stage: "authorization", status: 302, accepted: true, detail: `authorize 302 -> code issued (accepted)` };
  }
  return { stage: "authorization", status: r.status, detail: `authorize ${r.status}` };
}

/**
 * Recognise a redirect that already carries the authorization response.
 *
 * Once a subject has consented, Authlete remembers the grant and the login redirect goes
 * straight back to the client instead of via the consent screen — so a harness that always
 * expects a consent step works exactly once and then answers 403 on the second run. Each leg
 * has to check whether it has already arrived.
 */
function finalRedirect(location) {
  if (!location) return null;
  let u;
  try {
    u = new URL(location, BASE);
  } catch {
    return null;
  }

  /**
   * Under JARM the authorization response is a signed JWT in a single `response` parameter — there
   * is no bare `code` or `iss` to read off the query at all. A probe that only looked for `code`
   * reported the happy path as failing the moment signed responses were required, which is the
   * profile working rather than a defect.
   *
   * The JWT is not verified here: this asks what the server returned, and the signature is checked
   * by the dedicated JARM case below, where a failure names the right thing.
   */
  const responseJwt = u.searchParams.get("response");
  if (responseJwt) {
    let claims = {};
    try {
      claims = JSON.parse(Buffer.from(responseJwt.split(".")[1], "base64url").toString());
    } catch {
      /* leave empty; the JARM case reports the malformed token */
    }
    return {
      code: claims.code ?? null,
      error: claims.error ?? null,
      iss: claims.iss ?? null,
      jarm: responseJwt,
      location,
    };
  }

  const code = u.searchParams.get("code");
  const error = u.searchParams.get("error");
  if (!code && !error) return null;
  return { code, error, iss: u.searchParams.get("iss"), jarm: null, location };
}

/**
 * One authenticated browser session, reused by every leg that needs a code.
 *
 * `/api/session/login` is rate-limited to 5 requests per minute, and this probe needs four
 * separate authorization codes — so a fresh login per test spent the whole budget and the
 * later tests reported `login returned 429`, which reads as a server defect and is not one.
 * After the first login the session cookie plus the remembered consent make
 * `/api/authorization` return the code directly, so only one login happens per run.
 */
const sharedJar = newJar();

async function authorizeToCode(requestUri, jar = sharedJar) {
  const authUrl = `${BASE}/api/authorization?${form({ client_id: CLIENT_ID, request_uri: requestUri })}`;
  const a = await http("GET", authUrl, { jar });
  if (a.status !== 302) return { failed: `authorization returned ${a.status}`, res: a };
  const early = finalRedirect(a.location);
  if (early) return early;

  const loginUrl = new URL(a.location, BASE).toString();
  const loginPage = await http("GET", loginUrl, { jar });
  const csrf = loginPage.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (!csrf) return { failed: "no CSRF token on login page", res: loginPage };

  const login = await http("POST", `${BASE}/api/session/login`, {
    jar,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ _csrf: csrf, username: USERNAME, password: PASSWORD, login: "submit" }),
  });
  if (login.status !== 302) {
    // A 200 here means the login page re-rendered, which is a rejection wearing a success
    // status. Surface what it said — "login returned 200" names the symptom, not the cause.
    const why =
      login.text.match(/class="[^"]*(?:error|alert)[^"]*"[^>]*>\s*([^<]{3,160})/i)?.[1]?.trim() ||
      login.text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ||
      "no message found in the re-rendered page";
    return { failed: `login returned ${login.status}: ${why}`, res: login };
  }

  // Consent already granted for this subject+client: the login redirect is the authorization
  // response itself, and there is no consent screen to post to.
  const afterLogin = finalRedirect(login.location);
  if (afterLogin) return afterLogin;

  const consentUrl = new URL(login.location, BASE).toString();
  const consentPage = await http("GET", consentUrl, { jar });
  const csrf2 = consentPage.text.match(/name="_csrf" value="([^"]+)"/)?.[1] || csrf;

  const consent = await http("POST", `${BASE}/api/session/consent`, {
    jar,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    // The consent view submits `decision=approve|deny` (views/consent.ejs), not a boolean flag.
    body: form({ _csrf: csrf2, decision: "approve" }),
  });
  if (consent.status !== 302) return { failed: `consent returned ${consent.status}`, res: consent };

  const loc = new URL(consent.location, BASE);
  return {
    code: loc.searchParams.get("code"),
    iss: loc.searchParams.get("iss"),
    error: loc.searchParams.get("error"),
    location: consent.location,
  };
}

async function token(bodyObj, { dpop = true, assertion = true, dpopHtuOverride } = {}) {
  const url = `${BASE}/api/token`;
  const body = { ...bodyObj };
  if (assertion) {
    body.client_assertion_type = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
    body.client_assertion = clientAssertion();
  }
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (dpop) headers.dpop = dpopProof("POST", dpopHtuOverride || url);
  return http("POST", url, { headers, body: form(body) });
}

// ── Test registry ───────────────────────────────────────────────────────────
const results = [];
function record(name, spec, expected, actual, pass, note) {
  results.push({ name, spec, expected, actual, pass, note });
  const tag = pass === true ? "PASS" : pass === false ? "FAIL" : pass === null ? "SKIP" : "INCONC";
  console.log(`[${tag}] ${name}`);
  if (note) console.log(`       ${note}`);
}

/**
 * Judge a negative case by WHY the request was refused, not merely that it was.
 *
 * Without this every negative case passes as soon as client authentication is broken —
 * which is exactly what the first run of this probe did: twelve rows went green against a
 * client whose JWK Set made private_key_jwt impossible (Authlete A156306), so nothing under
 * test had been exercised at all. A 4xx for the wrong reason is not evidence.
 *
 * Returns `undefined` for "inconclusive", which is neither a pass nor a skip.
 */
function refusal(r, { expectAuthFailure = false } = {}) {
  const is4xx = r.status >= 400 && r.status < 500;
  const err = r.json?.error;
  const desc = r.json?.error_description ?? r.json?.message ?? "";
  if (!is4xx) {
    return { verdict: false, detail: `${r.status} ${err ?? ""}`.trim() };
  }
  if (!expectAuthFailure && err === "invalid_client") {
    return {
      verdict: undefined,
      detail: `${r.status} invalid_client`,
      note: `inconclusive — refused for client authentication, not the requirement under test: ${String(desc).slice(0, 90)}`,
    };
  }
  return { verdict: true, detail: `${r.status} ${err ?? ""}`.trim() };
}

async function run() {
  console.log(`FAPI 2.0 conformance probe -> ${BASE}`);
  console.log(`client_id=${CLIENT_ID}  issuer(aud)=${ISSUER}  scope="${SCOPE}"\n`);

  const base = () => {
    const p = pkce();
    return {
      p,
      req: {
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        state: randomUUID(),
        nonce: randomUUID(),
        code_challenge: p.challenge,
        code_challenge_method: "S256",
        // Required, not decorative, once the scope carries `fapi2: ms-authres`.
        ...(USE_JARM ? { response_mode: "jwt" } : {}),
      },
    };
  };

  // ── 1. Happy path ─────────────────────────────────────────────────────────
  const { p: happyPkce, req: happyReq } = base();
  const parRes = await par(happyReq);
  const requestUri = parRes.json?.request_uri;
  record(
    "PAR with private_key_jwt + PKCE S256 + DPoP",
    "5.3.2.2",
    "201 + request_uri",
    `${parRes.status} ${requestUri ? "+ request_uri" : JSON.stringify(parRes.json ?? parRes.text).slice(0, 160)}`,
    parRes.status === 201 && !!requestUri,
  );

  const expiresIn = parRes.json?.expires_in;
  record(
    "PAR request_uri lifetime < 600s",
    "5.3.2.2",
    "expires_in < 600",
    String(expiresIn),
    typeof expiresIn === "number" ? expiresIn < 600 : null,
  );

  let code, issParam;
  // Hoisted: the JARM case below reads the same authorization result.
  let authzResult = null;
  if (requestUri) {
    const authz = await authorizeToCode(requestUri);
    authzResult = authz;
    code = authz.code;
    issParam = authz.iss;
    record(
      "Authorization code flow completes via request_uri",
      "5.3.2.2",
      "redirect carrying code=",
      authz.failed || (code ? "code returned" : `error=${authz.error}`),
      !!code,
    );
    record(
      "iss returned in authorization response (RFC 9207)",
      "5.3.2.2",
      `iss=${ISSUER}`,
      issParam ?? "(absent)",
      issParam ? issParam === ISSUER : false,
      issParam && issParam !== ISSUER ? "iss present but does not equal the configured issuer" : undefined,
    );
  } else {
    record("Authorization code flow completes via request_uri", "5.3.2.2", "code", "skipped — no request_uri", null);
    record("iss returned in authorization response (RFC 9207)", "5.3.2.2", "iss", "skipped", null);
  }

  // ── Message Signing: signed authorization responses (JARM) ────────────────
  if (USE_JARM) {
    if (authzResult?.jarm) {
      let head = {};
      let claims = {};
      try {
        head = JSON.parse(Buffer.from(authzResult.jarm.split(".")[0], "base64url").toString());
        claims = JSON.parse(Buffer.from(authzResult.jarm.split(".")[1], "base64url").toString());
      } catch {
        /* reported below as a malformed token */
      }
      const algOk = ["PS256", "ES256", "EdDSA"].includes(head.alg);
      // JARM §4.1 requires iss, aud and exp in the response JWT; §5.4.1 constrains the algorithm.
      const claimsOk = claims.iss === ISSUER && !!claims.aud && !!claims.exp;
      record(
        "Authorization response is signed (JARM)",
        "Message Signing — signed authorization responses",
        "JWS PS256|ES256|EdDSA",
        `alg=${head.alg} iss=${claims.iss === ISSUER ? "ok" : claims.iss} aud=${claims.aud ? "ok" : "MISSING"} exp=${claims.exp ? "ok" : "MISSING"}`,
        algOk && claimsOk,
        !algOk && head.alg ? `${head.alg} is not permitted by 5.4.1` : undefined,
      );
    } else {
      record(
        "Authorization response is signed (JARM)",
        "Message Signing — signed authorization responses",
        "JWS",
        authzResult ? "unsigned response returned" : "skipped — no authorization result",
        authzResult ? false : null,
        authzResult ? "the response came back as bare query parameters" : undefined,
      );
    }

    // "shall support, REQUIRE USE OF, and issue" — an unsigned response mode must not be honoured.
    const { req: plainModeReq } = base();
    plainModeReq.response_mode = "query";
    const v = await parThenAuthorize(plainModeReq);
    record(
      "Unsigned response_mode=query is refused",
      "Message Signing — signed authorization responses required",
      "refused",
      v.detail,
      !v.accepted,
      v.accepted ? "an unsigned authorization response was accepted" : undefined,
    );
  }

  let accessToken, tokenType, idToken;
  if (code) {
    const t = await token({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: happyPkce.verifier,
      client_id: CLIENT_ID,
    });
    accessToken = t.json?.access_token;
    tokenType = t.json?.token_type;
    idToken = t.json?.id_token;
    record(
      "Token exchange with DPoP + private_key_jwt",
      "5.3.2.1",
      "200 + access_token",
      `${t.status} ${accessToken ? "+ access_token" : JSON.stringify(t.json ?? t.text).slice(0, 160)}`,
      t.status === 200 && !!accessToken,
    );
    record(
      "Access token is sender-constrained (token_type=DPoP)",
      "5.3.2.1",
      "DPoP",
      String(tokenType),
      typeof tokenType === "string" ? tokenType.toLowerCase() === "dpop" : false,
      tokenType && tokenType.toLowerCase() === "bearer"
        ? "Bearer means the token is NOT sender-constrained"
        : undefined,
    );
    if (idToken) {
      // A five-part token is a JWE: its header `alg` is the key-management algorithm, not the
      // signature. Reading it as a signature alg reports nonsense like "PBES2-HS256+A128KW"
      // where a signature alg was expected, and leaves the real inner signature unexamined.
      const parts = idToken.split(".");
      let head = {};
      try {
        head = JSON.parse(Buffer.from(parts[0], "base64url"));
      } catch {
        /* leave empty */
      }
      if (parts.length === 5) {
        record(
          "ID token signed with PS256/ES256/EdDSA",
          "5.4.1",
          "PS256|ES256|EdDSA",
          `JWE alg=${head.alg} enc=${head.enc}`,
          undefined,
          "inconclusive — the ID token is encrypted, so the inner signature cannot be read without decrypting it",
        );
      } else {
        record(
          "ID token signed with PS256/ES256/EdDSA",
          "5.4.1",
          "PS256|ES256|EdDSA",
          String(head.alg),
          ["PS256", "ES256", "EdDSA"].includes(head.alg),
          head.alg === "HS256"
            ? "HS256 is symmetric and is not permitted"
            : head.alg === "none"
              ? "the none algorithm is explicitly forbidden"
              : undefined,
        );
      }
    } else {
      record("ID token signed with PS256/ES256/EdDSA", "5.4.1", "asymmetric alg", "no id_token returned", null);
    }

    // Code reuse — 5.3.2.2 "shall reject an authorization code if it has been previously used"
    const replay = await token({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: happyPkce.verifier,
      client_id: CLIENT_ID,
    });
    const v = refusal(replay);
    record("Authorization code replay is rejected", "5.3.2.2", "4xx", v.detail, v.verdict, v.note);
  } else {
    for (const n of [
      "Token exchange with DPoP + private_key_jwt",
      "Access token is sender-constrained (token_type=DPoP)",
      "ID token signed with PS256/ES256/EdDSA",
      "Authorization code replay is rejected",
    ]) {
      record(n, "-", "-", "skipped — no authorization code", null);
    }
  }

  // ── 2. Negative cases ─────────────────────────────────────────────────────

  // PAR is mandatory: a plain authorization request must be refused.
  {
    const { req } = base();
    const r = await http("GET", `${BASE}/api/authorization?${form(req)}`);
    // Three outcomes worth telling apart: a 4xx, an error redirect back to the client, and a
    // redirect to the login page — the last means the request was ACCEPTED and PAR is not enforced.
    let detail = String(r.status);
    let refused = r.status >= 400;
    if (r.status === 302 && r.location) {
      const loc = new URL(r.location, BASE);
      const errCode = loc.searchParams.get("error");
      if (errCode) {
        refused = true;
        detail = `302 error=${errCode}`;
      } else {
        refused = false;
        detail = `302 -> ${loc.pathname} (accepted)`;
      }
    }
    record(
      "Authorization request WITHOUT PAR is rejected",
      "5.3.2.2 shall reject authorization requests sent without RFC9126",
      "4xx or error redirect",
      detail,
      refused,
      !refused ? "the request was accepted, so PAR is not being enforced" : undefined,
    );
  }

  // PKCE is mandatory.
  {
    const { req } = base();
    delete req.code_challenge;
    delete req.code_challenge_method;
    const v = await parThenAuthorize(req);
    record(
      "Request without PKCE is rejected",
      "5.3.2.2 shall require PKCE with S256",
      "refused",
      v.detail,
      !v.accepted,
      v.accepted ? "the request reached the login page — PKCE is not being enforced" : undefined,
    );
  }

  // S256 specifically — `plain` must not be accepted.
  {
    const { p, req } = base();
    req.code_challenge = p.verifier; // plain challenge == verifier
    req.code_challenge_method = "plain";
    const v = await parThenAuthorize(req);
    record(
      "code_challenge_method=plain is rejected",
      "5.3.2.2 shall require ... S256 as the code challenge method",
      "refused",
      v.detail,
      !v.accepted,
      v.accepted ? "plain reached the login page — S256 is not being enforced" : undefined,
    );
  }

  // Client authentication is mandatory at PAR.
  {
    const { req } = base();
    const r = await par(req, { assertion: false });
    const v = refusal(r, { expectAuthFailure: true });
    record(
      "PAR without client authentication is rejected",
      "5.3.2.2 shall reject pushed authorization requests without client authentication",
      "401/400",
      v.detail,
      v.verdict,
      v.note,
    );
  }

  // Unregistered redirect_uri.
  {
    const { req } = base();
    req.redirect_uri = "https://attacker.example/cb";
    const r = await par(req);
    const v = refusal(r);
    record(
      "PAR with unregistered redirect_uri is rejected",
      "5.3.2.2 shall not expose open redirectors",
      "4xx",
      v.detail,
      v.verdict,
      v.note,
    );
  }

  // http-scheme redirect_uri.
  {
    const { req } = base();
    req.redirect_uri = "http://localhost:3001/callback";
    const r = await par(req);
    const v = refusal(r);
    record(
      "PAR with http-scheme redirect_uri is rejected",
      "5.3.2.2 shall not allow redirect URIs that use the http scheme",
      "4xx",
      v.detail,
      v.verdict,
      v.note,
    );
  }

  // Sender constraining is mandatory at the token endpoint.
  {
    const { p, req } = base();
    const pr = await par(req);
    if (pr.json?.request_uri) {
      const a = await authorizeToCode(pr.json.request_uri);
      if (a.code) {
        const t = await token(
          {
            grant_type: "authorization_code",
            code: a.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: p.verifier,
            client_id: CLIENT_ID,
          },
          { dpop: false },
        );
        const v = refusal(t);
        record(
          "Token request WITHOUT a DPoP proof is rejected",
          "5.3.2.1 shall only issue sender-constrained access tokens",
          "4xx",
          `${v.detail} token_type=${t.json?.token_type ?? "-"}`,
          v.verdict,
          t.status === 200
            ? "a token was issued with no proof of possession — not sender-constrained"
            : v.note,
        );
      } else {
        record("Token request WITHOUT a DPoP proof is rejected", "5.3.2.1", "4xx", `skipped — ${a.failed ?? (a.error ? `error=${a.error}` : "no code")}`, null);
      }
    } else {
      record("Token request WITHOUT a DPoP proof is rejected", "5.3.2.1", "4xx", "skipped — no request_uri", null);
    }
  }

  // DPoP proof bound to the wrong URL.
  {
    const { p, req } = base();
    const pr = await par(req);
    if (pr.json?.request_uri) {
      const a = await authorizeToCode(pr.json.request_uri);
      if (a.code) {
        const t = await token(
          {
            grant_type: "authorization_code",
            code: a.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: p.verifier,
            client_id: CLIENT_ID,
          },
          { dpopHtuOverride: "https://attacker.example/token" },
        );
        const v = refusal(t);
        record("DPoP proof with a mismatched htu is rejected", "RFC 9449 4.3", "4xx", v.detail, v.verdict, v.note);
      } else {
        record("DPoP proof with a mismatched htu is rejected", "RFC 9449 4.3", "4xx", `skipped — ${a.failed ?? (a.error ? `error=${a.error}` : "no code")}`, null);
      }
    } else {
      record("DPoP proof with a mismatched htu is rejected", "RFC 9449 4.3", "4xx", "skipped — no request_uri", null);
    }
  }

  // Wrong PKCE verifier at the token endpoint.
  {
    const { req } = base();
    const pr = await par(req);
    if (pr.json?.request_uri) {
      const a = await authorizeToCode(pr.json.request_uri);
      if (a.code) {
        const t = await token({
          grant_type: "authorization_code",
          code: a.code,
          redirect_uri: REDIRECT_URI,
          code_verifier: pkce().verifier, // a different, unrelated verifier
          client_id: CLIENT_ID,
        });
        const v = refusal(t);
        record("Token request with a wrong code_verifier is rejected", "RFC 7636 4.6", "4xx", v.detail, v.verdict, v.note);
      } else {
        record("Token request with a wrong code_verifier is rejected", "RFC 7636 4.6", "4xx", `skipped — ${a.failed ?? (a.error ? `error=${a.error}` : "no code")}`, null);
      }
    } else {
      record("Token request with a wrong code_verifier is rejected", "RFC 7636 4.6", "4xx", "skipped", null);
    }
  }

  // Client assertion audience — must be the issuer, not the endpoint URL.
  {
    const { req } = base();
    const r = await par(req, { assertionOpts: { aud: `${BASE}/api/token` } });
    const v = refusal(r, { expectAuthFailure: true });
    record(
      "Client assertion with a non-issuer aud is rejected",
      "5.3.2.1 shall only accept its issuer identifier value ... in the aud claim",
      "4xx",
      v.detail,
      v.verdict,
      v.note,
    );
  }

  // ── 3. Message Signing Profile — signed authorization requests ────────────
  {
    const { req } = base();
    const t = now();
    const requestObject = signES256(
      { alg: "ES256", typ: "oauth-authz-req+jwt", kid: CLIENT_JWK.kid },
      { ...req, iss: CLIENT_ID, aud: ISSUER, jti: randomUUID(), iat: t, nbf: t, exp: t + 120 },
    );
    // jar:false — this test builds its own request object; auto-wrapping would nest one JWT
    // inside another and test nothing.
    const r = await par({ client_id: CLIENT_ID, request: requestObject }, { jar: false });
    record(
      "PAR accepts a signed request object (JAR, ES256)",
      "Message Signing — signed authorization requests",
      "201 + request_uri",
      `${r.status} ${r.json?.request_uri ? "+ request_uri" : JSON.stringify(r.json ?? r.text).slice(0, 140)}`,
      r.status === 201 && !!r.json?.request_uri,
    );
  }

  // alg=none must never be accepted.
  {
    const { req } = base();
    const t = now();
    const unsigned = `${json64({ alg: "none", typ: "oauth-authz-req+jwt" })}.${json64({
      ...req,
      iss: CLIENT_ID,
      aud: ISSUER,
      jti: randomUUID(),
      iat: t,
      nbf: t,
      exp: t + 120,
    })}.`;
    const r = await par({ client_id: CLIENT_ID, request: unsigned }, { jar: false });
    const v = refusal(r);
    record(
      "PAR rejects a request object signed with alg=none",
      "5.4.1 shall ... not use or accept the none algorithm",
      "4xx",
      v.detail,
      v.verdict,
      r.status === 201 ? "an unsigned request object was accepted" : v.note,
    );
  }

  /**
   * 5.4.1 permits PS256, ES256 and EdDSA only. The discovery document nevertheless ADVERTISES
   * HS256/RS256 and the rest in `request_object_signing_alg_values_supported`, because Authlete
   * derives that list from its own capabilities and **no Service field narrows it** — the only
   * `supported*Alg*` property on the SDK's Service model is `supportedDigestAlgorithms`. The same
   * shape as the repo's T1-13 note about the userinfo/introspection lists.
   *
   * So the advertised list cannot be the evidence either way, and what the server ACCEPTS has to
   * be. The binding control is the client's `requestSignAlg: ES256`.
   */
  for (const alg of ["RS256", "HS256"]) {
    const { req } = base();
    const t = now();
    const header = { alg, typ: "oauth-authz-req+jwt", kid: CLIENT_JWK.kid };
    const claims = { ...req, iss: CLIENT_ID, aud: ISSUER, jti: randomUUID(), iat: t, nbf: t, exp: t + 120 };
    const input = `${json64(header)}.${json64(claims)}`;
    const sig =
      alg === "RS256"
        ? createSign("SHA256").update(input).sign(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey)
        : createHmac("sha256", randomBytes(32)).update(input).digest();
    const r = await par({ client_id: CLIENT_ID, request: `${input}.${sig.toString("base64url")}` }, { jar: false });
    const v = refusal(r);
    const why = r.json?.error_description ?? r.json?.message;
    record(
      `Request object signed with ${alg} is rejected`,
      "5.4.1 shall use PS256, ES256, or EdDSA",
      "4xx",
      v.detail,
      v.verdict,
      r.status === 201
        ? `${alg} was accepted — a non-permitted algorithm is usable`
        : why
          ? `refused: ${String(why).slice(0, 100)}`
          : v.note,
    );
  }

  // Message Signing makes the signed request object mandatory, not merely accepted. Only
  // meaningful when the deployment is in that mode — otherwise plain parameters are correct
  // and refusing them would be the bug.
  if (USE_JAR) {
    const { req } = base();
    const r = await par(req, { jar: false }); // plain parameters, no request object
    const v = refusal(r);
    record(
      "PAR without a signed request object is rejected",
      "Message Signing — signed authorization requests required",
      "4xx",
      v.detail,
      v.verdict,
      r.status === 201 ? "plain parameters were accepted — the request object is not required" : v.note,
    );
  }

  // ── Matrix ────────────────────────────────────────────────────────────────
  const label = (p) => (p === true ? "PASS" : p === false ? "FAIL" : p === null ? "SKIP" : "INCONC");
  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  const skip = results.filter((r) => r.pass === null).length;
  const inconc = results.filter((r) => r.pass === undefined).length;

  const W = 118;
  console.log(`\n${"=".repeat(W)}`);
  console.log(`| ${"Test Case".padEnd(59)}| ${"Expected".padEnd(11)}| ${"Actual".padEnd(29)}| Status |`);
  console.log(`${"=".repeat(W)}`);
  for (const r of results) {
    console.log(
      `| ${r.name.slice(0, 58).padEnd(59)}| ${String(r.expected).slice(0, 10).padEnd(11)}| ${String(r.actual).slice(0, 28).padEnd(29)}| ${label(r.pass).padEnd(6)} |`,
    );
  }
  console.log(`${"=".repeat(W)}`);
  console.log(
    `\n${pass} passed, ${fail} failed, ${inconc} inconclusive, ${skip} skipped, ${results.length} total`,
  );
  if (inconc) {
    console.log("\nInconclusive rows were refused for a reason other than the requirement under test:");
    for (const r of results.filter((x) => x.pass === undefined)) console.log(`  - ${r.name}: ${r.note ?? ""}`);
  }

  // Inconclusive is not success: the requirement was never exercised.
  process.exit(fail > 0 || inconc > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("probe aborted:", e);
  process.exit(2);
});
