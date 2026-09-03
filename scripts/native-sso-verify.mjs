#!/usr/bin/env node
/**
 * OpenID Connect Native SSO for Mobile Apps 1.0 — end-to-end probe.
 *
 * Drives both phases headlessly against a running deployment:
 *
 *   Phase 1  App 1 runs the authorization code flow with `scope=openid device_sso` and receives a
 *            `device_secret` beside an ID token carrying `ds_hash` and `sid`.
 *   Phase 2  App 2 exchanges App 1's ID token + device secret (RFC 8693 token exchange) for its own
 *            tokens, with no user interaction — and gets the SAME `sid` and `ds_hash` back.
 *
 * **Why a script and not a section in the SPA.** There is no Native SSO surface in the client, and the
 * thing that needs proving is a *cross-application* property: two clients sharing one authentication
 * session. One browser tab cannot demonstrate that, and the interesting assertions — `ds_hash` equals
 * the hash of the secret, `sid` is identical across two apps — are comparisons between two token
 * responses rather than anything a user sees.
 *
 *   BASE=http://localhost:3000 node scripts/native-sso-verify.mjs
 *
 * Allow ~60s between runs: login is rate-limited to 5/minute and this probe logs in once.
 *
 * Env:
 *   BASE            deployment root, no trailing slash   (default http://localhost:3000)
 *   APP1_CLIENT_ID  the "first app" — needs a registered redirect URI     (default 4277838306, public)
 *   APP1_REDIRECT   must be registered on APP1            (default http://localhost:3000/callback)
 *   APP2_CLIENT_ID  the "second app" — token exchange only, no redirect   (default 1523514379)
 *   APP2_SECRET     APP2's client secret. **Required.** The service sets
 *                   `tokenExchangeByConfidentialClientsOnly: true`, so Phase 2 from a public client is
 *                   refused with `[A311304]` — which this probe asserts as a negative case rather than
 *                   works around. Reuse `SEC` from server/.env.
 *   ISSUER          the `audience` of the exchange       (default http://localhost:3000)
 *   NSSO_USERNAME / NSSO_PASSWORD   demo login, default admin/password. Namespaced because the shell
 *                   already exports USERNAME on most systems — reading the bare name logs in as the OS
 *                   user and the flow dies at a re-rendered login page, which reads as a server defect.
 *
 * Self-contained rather than sharing a harness with `fapi2-conformance.mjs`: that script's helpers are
 * wrapped in DPoP, JAR and private_key_jwt machinery this flow does not use, and extracting them would
 * mean re-running it against live Authlete quota to prove nothing had broken. Extract when a third
 * probe wants them.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/+$/, "");
const APP1 = process.env.APP1_CLIENT_ID || "4277838306";
const APP1_REDIRECT = process.env.APP1_REDIRECT || "http://localhost:3000/callback";
const APP2 = process.env.APP2_CLIENT_ID || "1523514379";
const APP2_SECRET = process.env.APP2_SECRET || "";
const ISSUER = process.env.ISSUER || BASE;
const USERNAME = process.env.NSSO_USERNAME || "admin";
const PASSWORD = process.env.NSSO_PASSWORD || "password";

const SUBJECT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const ACTOR_TOKEN_TYPE = "urn:openid:params:token-type:device-secret";

// ── tiny HTTP layer with a cookie jar ───────────────────────────────────────
const form = (o) => new URLSearchParams(o).toString();
const isRedirect = (s) => s >= 300 && s < 400;

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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON — an HTML page or an empty body */
  }
  return { status: res.status, headers: res.headers, location: res.headers.get("location"), text, json };
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** Claims only. Signature verification is the client's job and is not what this probe is testing. */
function claims(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

// ── results ─────────────────────────────────────────────────────────────────
const results = [];
function record(name, spec, expected, actual, pass, note) {
  results.push({ name, spec, expected, actual, pass, note });
  const tag = pass === true ? "PASS" : pass === false ? "FAIL" : "SKIP";
  console.log(`[${tag}] ${name}`);
  console.log(`       expected: ${expected}`);
  console.log(`       actual:   ${actual}`);
  if (note) console.log(`       note:     ${note}`);
}

/**
 * Judge a negative case by **why** it was refused, not merely that it was.
 *
 * The lesson `fapi2-conformance.mjs` learned the expensive way: without this, every negative case goes
 * green the moment client authentication is broken, and nothing under test has been exercised at all.
 * A 4xx for the wrong reason is not evidence.
 */
function refusedBecause(r, wanted) {
  const is4xx = r.status >= 400 && r.status < 500;
  const blob = `${r.json?.error ?? ""} ${r.json?.error_description ?? r.json?.message ?? r.text.slice(0, 200)}`;
  if (!is4xx) return { ok: false, detail: `${r.status} — not refused at all` };
  if (wanted && !new RegExp(wanted, "i").test(blob)) {
    return { ok: false, detail: `${r.status} but for another reason: ${blob.trim().slice(0, 160)}` };
  }
  return { ok: true, detail: `${r.status} ${blob.trim().slice(0, 160)}` };
}

// ── Phase 1: App 1 obtains a device secret ──────────────────────────────────
const jar = new Map();

async function phase1() {
  const p = pkce();
  const state = randomUUID();
  const nonce = randomUUID();

  const authUrl = `${BASE}/api/authorization?${form({
    response_type: "code",
    client_id: APP1,
    redirect_uri: APP1_REDIRECT,
    // Both scopes. `device_sso` alone is not a Native SSO request, and an unregistered scope is
    // dropped silently rather than refused — the failure mode the tutorial calls out.
    scope: "openid device_sso",
    state,
    nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  })}`;

  const a = await http("GET", authUrl, { jar });
  if (!isRedirect(a.status)) return { failed: `authorization returned ${a.status}` };

  // Login
  const loginPage = await http("GET", new URL(a.location, BASE).toString(), { jar });
  const csrf = loginPage.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (!csrf) return { failed: "no CSRF token on the login page" };

  const login = await http("POST", `${BASE}/api/session/login`, {
    jar,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ _csrf: csrf, username: USERNAME, password: PASSWORD, login: "submit" }),
  });
  if (!isRedirect(login.status)) {
    // A 200 is the login page re-rendering: a rejection wearing a success status.
    const why =
      login.text.match(/class="[^"]*(?:error|alert)[^"]*"[^>]*>\s*([^<]{3,160})/i)?.[1]?.trim() ||
      "no message in the re-rendered page";
    return { failed: `login returned ${login.status}: ${why}` };
  }

  // Consent, unless it was already remembered for this subject + client.
  let loc = login.location;
  if (!new URL(loc, BASE).searchParams.get("code")) {
    const consentPage = await http("GET", new URL(loc, BASE).toString(), { jar });
    const csrf2 = consentPage.text.match(/name="_csrf" value="([^"]+)"/)?.[1] || csrf;
    const consent = await http("POST", `${BASE}/api/session/consent`, {
      jar,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ _csrf: csrf2, decision: "approve" }),
    });
    if (!isRedirect(consent.status)) return { failed: `consent returned ${consent.status}` };
    loc = consent.location;
  }

  const code = new URL(loc, BASE).searchParams.get("code");
  if (!code) return { failed: `no code in the redirect: ${loc}` };

  const t = await http("POST", `${BASE}/api/token`, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      grant_type: "authorization_code",
      code,
      redirect_uri: APP1_REDIRECT,
      client_id: APP1,
      code_verifier: p.verifier,
    }),
  });
  return { token: t, nonce };
}

// ── Phase 2: App 2 exchanges the secret ─────────────────────────────────────
async function exchange({ subjectToken, actorToken, clientId = APP2, secret = APP2_SECRET, omitActor = false }) {
  const body = {
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    audience: ISSUER,
    subject_token: subjectToken,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    scope: "openid",
  };
  if (!omitActor) {
    body.actor_token = actorToken;
    body.actor_token_type = ACTOR_TOKEN_TYPE;
  }
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (secret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
  } else {
    body.client_id = clientId;
  }
  return http("POST", `${BASE}/api/token`, { headers, body: form(body) });
}

// ── run ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`Native SSO probe -> ${BASE}`);
  console.log(`App 1 = ${APP1} (public)   App 2 = ${APP2} (confidential)\n`);

  if (!APP2_SECRET) {
    console.error(
      "APP2_SECRET is required: the service sets tokenExchangeByConfidentialClientsOnly, so Phase 2\n" +
        "needs a confidential client. Reuse SEC from server/.env.\n",
    );
    process.exit(2);
  }

  // ── 1. Phase 1 ────────────────────────────────────────────────────────────
  const p1 = await phase1();
  if (p1.failed) {
    record("Phase 1 completes", "Native SSO 1.0 §3", "device_secret + id_token", p1.failed, false);
    return summarise();
  }

  const body = p1.token.json ?? {};
  record(
    "Phase 1 token response is 200",
    "Native SSO 1.0 §3",
    "200 with an access token",
    `${p1.token.status} ${body.error ?? ""} ${body.error_description ?? ""}`.trim(),
    p1.token.status === 200 && !!body.access_token,
    p1.token.status === 500
      ? "500 here is the known Phase 1 defect: the AS must mint the device secret because Authlete returns none on the authorization-code leg"
      : undefined,
  );
  if (p1.token.status !== 200) return summarise();

  const deviceSecret = body.device_secret;
  record(
    "device_secret is returned to App 1",
    "Native SSO 1.0 §3.1",
    "a device_secret member",
    deviceSecret ? `present (${String(deviceSecret).length} chars)` : "ABSENT",
    !!deviceSecret,
  );

  const idc = claims(body.id_token);
  record(
    "ID token carries sid and ds_hash",
    "Native SSO 1.0 §3.1",
    "both claims present",
    `sid=${idc.sid ?? "ABSENT"} ds_hash=${idc.ds_hash ?? "ABSENT"}`,
    !!idc.sid && !!idc.ds_hash,
  );

  // The binding the whole feature rests on. If this does not hold, App 2's secret proves nothing.
  if (deviceSecret && idc.ds_hash) {
    const computed = createHash("sha256").update(deviceSecret).digest("base64url");
    record(
      "ds_hash == base64url(SHA-256(device_secret))",
      "Native SSO 1.0 §3.1 — the AS chooses the computation; this is the repo's",
      computed,
      idc.ds_hash,
      computed === idc.ds_hash,
      "the ID token's binding to the secret — a mismatch means App 2 could present any secret",
    );
  }

  // Open question from the plan: `claims` is not forwarded to /nativesso, so does a Phase 1 `nonce`
  // survive into the ID token? OIDC Core §3.1.3.7 requires it when one was sent.
  record(
    "nonce from the authorization request survives into the ID token",
    "OIDC Core §3.1.3.7",
    p1.nonce,
    idc.nonce ?? "ABSENT",
    idc.nonce === p1.nonce,
    idc.nonce
      ? undefined
      : "handleNativeSso does not forward `claims` to /nativesso, which is where Authlete expects nonce and s_hash",
  );

  if (!deviceSecret || !body.id_token) return summarise();

  // ── 2. Phase 2 ────────────────────────────────────────────────────────────
  const x = await exchange({ subjectToken: body.id_token, actorToken: deviceSecret });
  const xb = x.json ?? {};
  record(
    "Phase 2 exchange succeeds with no user interaction",
    "Native SSO 1.0 §4 / RFC 8693",
    "200 with an access token",
    `${x.status} ${xb.error ?? ""} ${xb.error_description ?? ""}`.trim(),
    x.status === 200 && !!xb.access_token,
  );

  if (x.status === 200) {
    const xc = claims(xb.id_token);
    record(
      "App 2's sid matches App 1's — one shared session, not a second login",
      "Native SSO 1.0 §4",
      `sid=${idc.sid}`,
      `sid=${xc.sid ?? "ABSENT"}`,
      !!xc.sid && xc.sid === idc.sid,
      "the property the whole feature exists for",
    );
    record(
      "App 2's ds_hash matches App 1's",
      "Native SSO 1.0 §4",
      `ds_hash=${idc.ds_hash}`,
      `ds_hash=${xc.ds_hash ?? "ABSENT"}`,
      !!xc.ds_hash && xc.ds_hash === idc.ds_hash,
      "a re-minted secret here would leave App 2 holding one whose hash was never bound to the session",
    );
    record(
      "issued_token_type is present",
      "RFC 8693 §2.2.1 — REQUIRED",
      "urn:ietf:params:oauth:token-type:access_token",
      xb.issued_token_type ?? "ABSENT",
      xb.issued_token_type === "urn:ietf:params:oauth:token-type:access_token",
    );
  }

  // ── 3. Negative cases ─────────────────────────────────────────────────────
  const tampered = await exchange({
    subjectToken: body.id_token,
    actorToken: randomBytes(32).toString("base64url"),
  });
  const t1 = refusedBecause(tampered, "device|secret|invalid_grant|invalid_request|A\\d{6}");
  record(
    "a device secret that does not match the ID token is refused",
    "Native SSO 1.0 §4",
    "4xx naming the secret or the grant",
    t1.detail,
    t1.ok,
    "without this the ds_hash binding is decorative",
  );

  const noActor = await exchange({ subjectToken: body.id_token, actorToken: null, omitActor: true });
  const t2 = refusedBecause(noActor, "actor|device|invalid_request|invalid_grant|A\\d{6}");
  record(
    "an exchange with no actor_token is refused",
    "Native SSO 1.0 §4",
    "4xx",
    t2.detail,
    t2.ok,
  );

  // Documents the service flag rather than working around it. Native SSO targets mobile apps, which
  // are normally public — so this is the constraint a real deployment has to decide about.
  const asPublic = await exchange({
    subjectToken: body.id_token,
    actorToken: deviceSecret,
    clientId: APP1,
    secret: "",
  });
  const t3 = refusedBecause(asPublic, "A311304|public|confidential");
  record(
    "a public client cannot exchange (tokenExchangeByConfidentialClientsOnly)",
    "Authlete service flag",
    "4xx [A311304]",
    t3.detail,
    t3.ok,
    "Native SSO is for mobile apps, which are usually public clients — this flag is a real deployment decision",
  );

  summarise();
}

function summarise() {
  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  console.log(`\n${"─".repeat(70)}`);
  console.log(`Native SSO: ${pass} passed, ${fail} failed, ${results.length} total`);
  if (fail) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => r.pass === false)) {
      console.log(`  · ${r.name}\n      expected ${r.expected}\n      got      ${r.actual}`);
    }
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error("probe crashed:", e);
  process.exit(1);
});
