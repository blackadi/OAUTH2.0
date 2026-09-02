# Running the FAPI 2.0 conformance suite

**The short version:** this deployment passes 25 of its own FAPI 2.0 checks, but only the OpenID
Foundation's conformance suite produces a *certifiable* result. One script prepares everything the
suite needs; this page walks the rest.

> **Measured 2026-09-02: 25 passed, 0 failed, 0 skipped — and it takes two environment variables to
> get there.** `JAR=1`, because `myscope` carries `fapi2: ms-authreq`/`ms-authres` and an unsigned PAR
> is therefore refused; and `BASE=http://localhost:3000` against a locally-run server, because the
> probe's login leg needs demo credentials the **deployment does not accept**. Run it against the
> deployment with the default mode and it reports 1 failure and 10 skips; run it in `JAR=1` against
> the deployment and it reports 3 failures, all of them the login leg returning its own sign-in page
> rather than a redirect. **None of those five is a server defect** — they are a mode mismatch and a
> credential the runner does not hold, which is exactly what makes them expensive: they read like
> findings. Confirm a full pass locally before believing a failure seen against the deployment.

---

## Why a local suite is not enough

`scripts/fapi2-conformance.mjs` drives the whole flow and checks 25 requirements — the full Security
Profile plus all three parts of Message Signing. It is genuinely useful: it caught a client that
could not authenticate at all, an ID token signed with `HS256`, and an introspection endpoint that
answered 500.

But every one of those checks is **our reading of the specification**. A test suite written by the
same people who wrote the server shares the server's blind spots. The conformance suite is written
by the people who wrote the profile, and passing it is what lets you say "certified" rather than
"passes our tests".

| | Local probe | Conformance suite |
|---|---|---|
| Written by | us | the OpenID Foundation |
| Cases | 25 | many hundreds |
| Runs against | local or deployed | deployed, over the public internet |
| Produces | a pass/fail table | a submittable certification result |

---

## Step 1 — prepare the service

```bash
# See what would change, without changing anything
node scripts/fapi2-conformance-setup.mjs --alias your-unique-alias

# Do it, supplying the deployment's real demo credentials
FAPI_USERNAME=<user> FAPI_PASSWORD=<pass> \
  node scripts/fapi2-conformance-setup.mjs --alias your-unique-alias --apply
```

**Pick an alias nobody else would use.** The suite's callbacks live under
`https://www.certification.openid.net/test/a/<ALIAS>/`, and the Foundation warns that two people
sharing an alias will interfere with each other's runs.

The script:

1. **Registers both suite callbacks** on the FAPI client, keeping the redirect URIs already there.
   There are two, and the second is easy to miss:

   ```
   https://www.certification.openid.net/test/a/ALIAS/callback
   https://www.certification.openid.net/test/a/ALIAS/callback?dummy1=lorem&dummy2=ipsum
   ```

   The second checks that the server matches a redirect URI **exactly**, query component included.
   Register only the first and those tests fail with an `invalid_request` about the redirect URI —
   which reads as a server defect rather than a missing registration.

2. **Creates a second client.** The suite tests mix-up attacks — using one client's token or code
   with the other's credentials — so it needs two confidential clients **with different keys**. A
   plan configured with one fails those tests for a reason unrelated to your server.

3. **Writes `conformance/fapi2-config.json`**, including the private keys the suite signs with, and
   a `resource.resourceUrl` pointing at UserInfo so the suite can prove the token is genuinely
   sender-constrained rather than merely labelled `DPoP`.

   `resource.resourceUrl` is a **required** field of this plan, not an optional extra — the suite
   lists it alongside `server.discoveryUrl` and the two clients. Omit it and the run stops at
   `GetResourceEndpointConfiguration: Couldn't find resource endpoint object in configuration`
   before making a single OAuth request. Verified live: UserInfo answers `200` with
   `application/json` to a DPoP-bound token carrying `ath`.

Re-running is safe: keys are **reused**, not regenerated, unless you pass `--rotate-keys`. Changing
the credentials or alias should not invalidate a key Authlete has already registered.

`conformance/` is gitignored. Those files contain private keys — keep it that way.

---

## Step 2 — preflight

```bash
node scripts/fapi2-conformance-preflight.mjs
```

Replays the suite's configuration checks locally, plus live checks that the deployment still
*enforces* what the variants promise **and still accepts the wire format the suite sends**. It exists
because a run died at step 36 of 39 on a missing config key, after 27 successes and before a single
OAuth request. Every one of those was checkable offline.

> **Three runs on 2026-09-01, and what each actually proved.** Worth reading before trusting a green
> configuration section — all three died before any OAuth request, and only the third failure was the
> server's.
>
> | Plan | Died at | Cause |
> |---|---|---|
> | `pg9EmudTydDs6` | `GetResourceEndpointConfiguration`, 27 successes | the pasted config had no `resource` object |
> | `WvEz7ONBGbu7s` | first PAR, 38 successes | a **Security Profile** plan, so `fapi_request_method` was fixed at `unsigned` — see Step 3 |
> | `NOcwqBMX07XXa` | first PAR, 46 successes | correct plan and variants; **the server rejected the form-encoded body itself** (9126-W1) |
>
> The lesson the preflight now encodes: its enforcement check sent the SPA's JSON envelope, so it
> proved Authlete refuses an unsigned request object while being **blind to whether a conformant
> client could reach Authlete at all**. A check that exercises a different wire format than the suite
> does is not a check of the suite's path. Both are now run.

## Step 3 — create the plan

1. Go to <https://www.certification.openid.net/> and sign in with Google or GitLab.
2. Click **Create a new test plan**.
3. In **Specification**, choose **`FAPI2 Message Signing`** — *not* `FAPI2 Security Profile`.
   Then pick the authorization-server plan; do **not** pick a client/RP plan, those test the other
   side of the exchange.

   **This is the step that decides the run, and picking Security Profile here cannot be corrected
   later.** The Security Profile plan hard-wires `fapi_request_method=unsigned` and
   `fapi_response_mode=plain_response` — it renders no dropdown for either, so they appear in the
   test's variant line as values you never chose. Against this deployment that plan dies at the first
   PAR with `CheckPAREndpointResponse201WithNoError`, because the server correctly refuses an
   unsigned request object. Measured twice on 2026-09-01, plans `pg9EmudTydDs6` and `WvEz7ONBGbu7s`.
4. Set the variants. **These are not free choices** — this deployment requires the signed forms, so
   picking the plain ones will fail:

   | Variant | Set it to | Why this one |
   |---|---|---|
   | Client Authentication Method | `private_key_jwt` | the only method the service accepts; mTLS is not plumbed |
   | Sender Constrain | `dpop` | the client sets `dpopRequired`; mTLS binding is off |
   | OpenID | `openid_connect` | an `id_token` is returned (optional in FAPI 2.0, supported here) |
   | FAPI Profile | `plain_fapi` | not an Open Banking regional variant |
   | Authorization Request Type | `simple` | selects RAR vs plain scopes. **Not** about PAR — every FAPI2 test uses PAR regardless. |
   | FAPI Request Method | **`signed_non_repudiation`** | the client sets `requestObjectRequired` — an unsigned request is refused |
   | FAPI Response Mode | **`jarm`** | the scope carries `fapi2: ms-authres` — an unsigned response is refused |

   **The last two exist only in the `FAPI2 Message Signing` family** — that is what step 3 is for.
   They are not variants you can add to a Security Profile plan. If you want to test the Security
   Profile *without* Message Signing, the server is what has to change: relax
   `requestObjectRequired` on the client and drop `ms-authreq`/`ms-authres` from the scope's `fapi2`
   attribute. Otherwise the server correctly refuses every unsigned request and every test fails.
   These are two separate certifications, not two ways of running one plan.

> ⚠️ **`fapiModes` on the service overrides all of this.** Setting it — even to `FAPI2_SECURITY` —
> takes precedence over both the per-scope `fapi2` attribute and the per-client
> `requestObjectRequired`, and *relaxes* the signed-request-object requirement. Measured: with
> `fapiModes: ["FAPI2_SECURITY"]` every client accepted an unsigned PAR while its own configuration
> still read `requestObjectRequired: true`. Leave `fapiModes` unset and let the scope attribute
> select the profile. `scripts/fapi2-conformance-preflight.mjs` checks this behaviourally.

> ⚠️ **`client.scope` must include the `fapi2`-tagged scope** (`myscope` here). Without it the
> request is not a FAPI request and every FAPI rule is correctly skipped — measured: `openid myscope`
> is refused an unsigned request object, `openid` alone is accepted.

5. Switch to the **JSON** tab and paste the contents of `conformance/fapi2-config.json`.
   The form and the JSON are two views of the same thing; editing either updates the other.
6. Click **Create test plan**.

---

## Step 4 — run it

1. Press **Launch Test Plan** to see the module list.
2. Click **Run New Test** on the first module.
3. **Read the light blue box.** Some modules ask you to do something specific — deny consent, or
   confirm an error appeared — and skipping that instruction is the usual reason a module hangs.
4. When a module needs a browser leg, press **Visit** and sign in. The plan automates this using the
   credentials you passed in Step 1; if it stalls on the login page, they are wrong.
5. Press **Continue Plan** for the next module, or **Return to Plan** to watch overall progress.
6. When the plan is green, follow the Foundation's submission instructions to certify.

---

## Step 5 — the tests a human has to drive, which need a SECOND plan

**Two modules need a human, and both fail the same way if the automation runs.** It always presses
**Sign in** and **Approve** — correct for every other module, and fatal for these two.

| Module | What the human must do | How it fails under automation |
|---|---|---|
| `…-user-rejects-authentication` | press **Cancel**, or **Deny** on the consent screen | *"Authorization server was expected to return an error but did not"* — it approved on your behalf |
| `…-par-ensure-reused-request-uri-prior-to-auth-completion-succeeds` | visit the authorization endpoint, **do not log in**, then let the second visit proceed | *"The user was authenticated on the initial visit to login page"* — it signed in when the first visit was only meant to display the page |

**The tell is the timing.** In `UTqf2OqbCObK33G` the redirect and the callback were **five seconds
apart**; in `ZK5TwJPszX8r9ZX` the first visit was at `20:23:15` and a callback had arrived by
`20:23:19`. Neither is a human.

The reused-`request_uri` module also carries a `REVIEW: IMAGE REQUIRED — ExpectLoginPage` step, so a
screenshot has to be uploaded by hand. It could never have been automated even in principle.

> **Neither of these is a server defect, and both were verified so before blaming the automation.**
> Cancel returns `access_denied` `[A060306]` (fixed 2026-09-01). And the `request_uri` behaviour that
> the second module tests is already correct — measured against service `2147478188`: two visits
> without logging in both reach the login page, and a visit *after* authorization completes earns
> `400 invalid_request_uri [A008303]`. That is exactly FAPI 2.0 §5.3.2.2 Note 3 — one-time use enforced
> at **completion**, not at first sight of the endpoint.

**One plan cannot cover both, and this is a limit of the suite rather than of this deployment.** A
browser entry accepts only `match` and `tasks`; a task accepts only `task`, `match`, `optional` and
`commands` (suite wiki → `Design/BrowserControl`, consulted 2026-09-01). There is **no per-test-name
selector**, and every module hits the same `/api/session/login` URL, so no `match` pattern can tell them
apart.

So build a second plan with no automation at all:

```bash
node scripts/fapi2-conformance-setup.mjs --apply --manual-browser
```

That writes a **separate** file, `conformance/fapi2-config-manual.json`, with the `browser` block
omitted and everything else identical — same clients, same reused keys, same `resource`.
`fapi2-config.json` is left alone, so the automated plan's input still stands and the two configs cannot
drift: both read their keys from the automated one.

Create a second plan from the manual file, with **the same variants** under **FAPI2 Message Signing**,
and run only the interactive negative modules there, clicking Cancel or Deny yourself.

> **A new plan is the whole point, and re-running the module on the automated plan will not work.**
> Variants and config are fixed when a plan is created, so the automation stays with plan
> `NOCwqBMX07XXa` however many times you press Run. Measured twice: runs `UTqf2OqbCObK33G` and
> `ElMazWSAYCoE64d`, both on that plan, both with the same two failures, both with redirect and callback
> **5 and 7 seconds apart** — the automation signing in, not a human refusing.

**Clear cookies for the deployment before running it**, as the test's own instructions say. With a live
session the server has nothing to ask, so you are never offered the chance to refuse.

> **This test also found a real defect, on 2026-09-01.** Even driven correctly it could not have passed:
> the login-screen Cancel branch called Authlete's authorization-fail API with `NOT_LOGGED_IN` and the
> consent-screen Deny branch with `CONSENT_REQUIRED`, which render as `login_required` and
> `consent_required`. Both tell the RP to retry with interaction, where RFC 6749 §4.1.2.1 calls for
> `access_denied`. Both now send `DENIED` → `[A060306] The end-user denied the authorization request.`
> The E2E suite had asserted only that *some* `error=` came back, which is how it went unnoticed. See
> `docs/TICKET-PARAMETER.md` → Session Controller for the measured reason→error table.

---

## What the suite will find already in place

Verified against the live deployment:

| Requirement | Where it is enforced |
|---|---|
| PAR required | client `parRequired` |
| PKCE with S256 | service `pkceRequired` + `pkceS256Required` |
| Sender-constrained tokens | client `dpopRequired` → `token_type: DPoP` |
| `private_key_jwt` only | service `supportedTokenAuthMethods` |
| Signed request objects (JAR) | client `requestObjectRequired` + scope `fapi2: ms-authreq` |
| Signed authorization responses (JARM) | client `authorizationSignAlg` + scope `fapi2: ms-authres` |
| Signed introspection (RFC 9701) | service `rsResponseSigned`, `alg: ES256` |
| `iss` in the response (RFC 9207) | service `issSuppressed: false` |
| 303 on authorization redirects | `AUTHORIZATION_REDIRECT_STATUS` |
| Authorization code ≤ 60s | service `authorizationCodeDuration` |
| No refresh-token rotation | service `refreshTokenKept: true` |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Couldn't find resource endpoint object in configuration` | The pasted config has no `resource` object. Re-generate with the setup script and paste the current file — the run stops here before any OAuth request. |
| *"The user was authenticated on the initial visit to login page"* | The browser automation signed in when the first visit was only meant to show the login page. That module needs the hand-driven plan — see Step 5. The server's `request_uri` handling is correct and was measured; do not go looking for a defect in it. |
| `EnsureErrorFromAuthorizationEndpointResponse` — *"expected to return an error but did not"* | The browser automation pressed Sign in for you. That module needs a hand-driven plan — see Step 5. If the redirect and callback are seconds apart, it was the automation. |
| A refusal comes back as `login_required` or `consent_required` instead of `access_denied` | Fixed 2026-09-01; the deployment predates it. `session.controller.ts` sent `NOT_LOGGED_IN` / `CONSENT_REQUIRED` where RFC 6749 §4.1.2.1 wants `DENIED`. |
| Suite cannot fetch the discovery document | It uses `{issuer}/.well-known/openid-configuration` at the **root**. Confirm it returns JSON, not the SPA's HTML. |
| Every test fails at client authentication | The registered public key does not match the private key in the plan. Re-run the setup with `--apply`. |
| Login page never advances | Wrong demo credentials. `AUTH_USERS` is set per deployment and is not in this repo; `admin`/`password` is only the local fallback. |
| Authorization silently cancels | The login form has two buttons named `login` (Sign in and Cancel). The generated plan clicks `id: btn-submit` for this reason; a hand-edited plan using `name: login` can hit Cancel. |
| `invalid_request` on the redirect URI | The second callback — the one with `?dummy1=lorem&dummy2=ipsum` — is not registered. |
| `CheckPAREndpointResponse201WithNoError` **with the Message Signing variants already set** | The deployment predates 9126-W1 (fixed 2026-09-01). `POST /api/par` required the JSON envelope's `parameters` field and answered `400 Missing required field: parameters` to any form-encoded body — so no conformant client could call PAR at all. Confirm with `node scripts/fapi2-conformance-preflight.mjs`: *"the RFC 9126 §2.1 form-encoded wire format reaches Authlete"*. If it fails, the running deployment needs the fix — the suite tests Render, not localhost. |
| `CheckPAREndpointResponse201WithNoError`, or every test fails `invalid_request` on the request object | The plan is a **Security Profile** plan, which fixes `fapi_request_method=unsigned` and offers no dropdown to change it. Create a plan under the `FAPI2 Message Signing` specification instead — see Step 3. |
| `invalid_request` on a plain authorization request | Expected. The FAPI scope requires PAR and a signed request object. |
| Non-FAPI panels break after a config change | FAPI enforcement is **per-scope** here (`fapi2` scope attribute), not service-wide. Setting `fapiModes` turns the whole deployment into a FAPI-only server and returns `400` on every ordinary OAuth request. |
| Runs stall after a few modules | Login is rate-limited to 5/minute and the API to 20/minute. |

---

## Related

- `scripts/fapi2-conformance.mjs` — the 25-case local probe
- `scripts/fapi2-conformance-setup.mjs` — prepares the service and writes the plan
- `scripts/fapi2-apply-config.mjs` — applies service/client configuration through the SDK
- [`docs/agents/dpop-and-client-auth.md`](agents/dpop-and-client-auth.md) — DPoP and client credentials
