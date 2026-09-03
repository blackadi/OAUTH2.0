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

  /**
   * **Not a refusal case, and getting that wrong is the point.**
   *
   * This probe first asserted a 4xx here and reported a FAIL — which was the probe being wrong, not the
   * server. `actor_token` is OPTIONAL in RFC 8693 §2.1, so an exchange without one is a valid
   * *impersonation* request rather than a malformed Native SSO one. It never reaches `handleNativeSso`:
   * Authlete answers `action: TOKEN_EXCHANGE`, and the generic handler issues a token.
   *
   * It used to answer **500** — that handler passed the whole ID token JWT as the `subject` of a
   * token-create call and Authlete refused with `[A144103]` (fixed 2026-09-03 by resolving the ID
   * token's `sub`, which is what Authlete leaves to the AS for `subjectTokenType: ID_TOKEN`).
   *
   * **The consequence is worth more than the assertion.** A confidential client holding a user's ID
   * token can obtain tokens for that user by simply *omitting* the device secret. That is RFC 8693
   * impersonation working as specified, and it means Native SSO's device-secret requirement is only as
   * strong as the deployment's token-exchange policy: if the secret must be mandatory, plain
   * impersonation exchange has to be withheld from these clients.
   */
  const noActor = await exchange({ subjectToken: body.id_token, actorToken: null, omitActor: true });
  const noActorBody = noActor.json ?? {};
  record(
    "no actor_token is a plain impersonation exchange, not a Native SSO request",
    "RFC 8693 §2.1 — actor_token is OPTIONAL",
    "200, and no device_secret (it did not take the Native SSO path)",
    `${noActor.status} device_secret=${noActorBody.device_secret ? "PRESENT" : "absent"}`,
    noActor.status === 200 && !noActorBody.device_secret,
    "so the device secret is mandatory only if the deployment withholds impersonation exchange",
  );

  /**
   * The assumption `native-sso-response.handler.ts` relies on, asserted rather than commented.
   *
   * That handler reads `ds_hash` out of the subject token **without verifying its signature**, on the
   * grounds that Authlete cannot have reached `action: NATIVE_SSO` for a token it did not issue. If that
   * is ever untrue, an attacker mints their own ID token with a `ds_hash` of their choosing and the
   * verification compares two attacker-supplied values. So: forge one and require a refusal.
   */
  const forgedSecret = randomBytes(32).toString("base64url");
  const forged = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        ...idc,
        ds_hash: createHash("sha256").update(forgedSecret).digest("base64url"),
      }),
    ).toString("base64url"),
    "",
  ].join(".");
  const forgedRes = await exchange({ subjectToken: forged, actorToken: forgedSecret });
  const t4 = refusedBecause(forgedRes, "invalid|A\\d{6}|token");
  record(
    "a self-signed subject token is refused",
    "the handler reads ds_hash unverified, so Authlete must be the one rejecting this",
    "4xx",
    t4.detail,
    t4.ok,
    "if this ever passes, reading ds_hash without verifying the subject token becomes a forgery route",
  );

  /**
   * **The public-client path — the one thing between "verified here" and "usable by a real mobile app".**
   *
   * Native SSO's target client type is a native app, which is *public*. While
   * `tokenExchangeByConfidentialClientsOnly` is `true` Authlete refuses those with `[A311304]` (asserted
   * above), so these two cases report SKIP and say why. Set the flag `false` and they become the
   * assertions that matter:
   *
   *   - a public client presenting a **valid** device secret must succeed — the secret is the credential
   *     that stands in for client authentication
   *   - a public client presenting **no** device secret must be refused, because that is plain
   *     impersonation by a caller that proved nothing, and a `client_id` is not a secret
   *
   * The second is enforced by this server, not by Authlete: its token-exchange restrictions cannot
   * express "public clients may exchange with a device secret and never without".
   */
  const publicPath = await exchange({
    subjectToken: body.id_token,
    actorToken: deviceSecret,
    clientId: APP1,
    secret: "",
  });
  const confidentialOnly = /A311304/.test(JSON.stringify(publicPath.json ?? publicPath.text));

  if (confidentialOnly) {
    record(
      "a public client CAN complete Phase 2 with a valid device secret",
      "Native SSO 1.0 — the specification's target client type is a public native app",
      "200",
      "skipped — tokenExchangeByConfidentialClientsOnly is true, so [A311304] comes first",
      null,
      "flip that flag to exercise this; the guard for the case below must be in place first",
    );
    record(
      "a public client CANNOT impersonate without a device secret",
      "enforced by this server — Authlete has no setting for it",
      "4xx unauthorized_client",
      "skipped — blocked earlier by [A311304]",
      null,
      "inert while the flag is true, and the only thing between a public client and account takeover once it is false",
    );
  } else {
    record(
      "a public client CAN complete Phase 2 with a valid device secret",
      "Native SSO 1.0 — the specification's target client type is a public native app",
      "200 with an access token",
      `${publicPath.status} ${publicPath.json?.error ?? ""}`.trim(),
      publicPath.status === 200 && !!publicPath.json?.access_token,
    );

    const publicImpersonation = await exchange({
      subjectToken: body.id_token,
      actorToken: null,
      omitActor: true,
      clientId: APP1,
      secret: "",
    });
    const t5 = refusedBecause(publicImpersonation, "unauthorized_client|authenticate");
    record(
      "a public client CANNOT impersonate without a device secret",
      "enforced by this server — Authlete has no setting for it",
      "4xx unauthorized_client",
      t5.detail,
      t5.ok,
      "a client_id is not a secret, so this would be account takeover for anyone holding an ID token",
    );
  }

  /**
   * **The allowlist, asserted rather than assumed.**
   *
   * `tokenExchangeByPermittedClientsOnly` is `true`, but that flag only bites if per-client
   * `tokenExchangePermitted` is actually *off* somewhere — and for a while every client on this service
   * had it on, so the flag was enabled and granting everything. Narrowed 2026-09-03 to the two paired
   * clients; this case is what tells you the narrowing is real.
   *
   * It also separates two refusals that would otherwise look alike: a client outside the allowlist is
   * refused by **Authlete**, whereas an unauthenticated impersonation is refused by **this server**.
   * A single "4xx" assertion would not distinguish them, and the difference is which layer you fix.
   */
  const notPermitted = process.env.UNPERMITTED_CLIENT_ID || "1678274156";
  const outsideList = await exchange({
    subjectToken: body.id_token,
    actorToken: deviceSecret,
    clientId: notPermitted,
    secret: "",
  });
  const t6 = refusedBecause(outsideList, "permit|A\\d{6}|unauthorized_client|invalid");
  record(
    "a client outside the token-exchange allowlist is refused",
    "Authlete `tokenExchangeByPermittedClientsOnly` + per-client `tokenExchangePermitted`",
    "4xx",
    t6.detail,
    t6.ok,
    `client ${notPermitted} has tokenExchangePermitted=false — this is the authorized-app list Part 9 §6 describes`,
  );

  summarise();
}

function summarise() {
  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  // Skips are counted separately and never folded into the pass total: a skipped case says so in the
  // report, a case quietly treated as passing does not — the distinction this repo's E2E suite learned
  // the hard way when a guarded test read as a pass.
  const skip = results.filter((r) => r.pass === null).length;
  console.log(`\n${"─".repeat(70)}`);
  console.log(
    `Native SSO: ${pass} passed, ${fail} failed, ${skip} skipped, ${results.length} total`,
  );
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
