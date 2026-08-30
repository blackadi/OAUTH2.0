# Running the FAPI 2.0 conformance suite

**The short version:** this deployment passes 25 of its own FAPI 2.0 checks, but only the OpenID
Foundation's conformance suite produces a *certifiable* result. One script prepares everything the
suite needs; this page walks the rest.

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

Re-running is safe: keys are **reused**, not regenerated, unless you pass `--rotate-keys`. Changing
the credentials or alias should not invalidate a key Authlete has already registered.

`conformance/` is gitignored. Those files contain private keys — keep it that way.

---

## Step 2 — create the plan

1. Go to <https://www.certification.openid.net/> and sign in with Google or GitLab.
2. Click **Create a new test plan**.
3. Choose **`FAPI2 Security Profile: Authorization server test`**.
   Do **not** pick a client/RP plan — those test the other side of the exchange.
4. Set the variants. **These are not free choices** — this deployment requires the signed forms, so
   picking the plain ones will fail:

   | Variant | Set it to | Why this one |
   |---|---|---|
   | Client Authentication Method | `private_key_jwt` | the only method the service accepts; mTLS is not plumbed |
   | Sender Constrain | `dpop` | the client sets `dpopRequired`; mTLS binding is off |
   | OpenID | `openid_connect` | an `id_token` is returned (optional in FAPI 2.0, supported here) |
   | FAPI Profile | `plain_fapi` | not an Open Banking regional variant |
   | FAPI Request Method | **`signed_non_repudiation`** | the client sets `requestObjectRequired` — an unsigned request is refused |
   | FAPI Response Mode | **`jarm`** | the scope carries `fapi2: ms-authres` — an unsigned response is refused |

   The last two are what make this a **Message Signing** run rather than Security Profile alone. If
   you want to test the Security Profile *without* Message Signing, you must first relax
   `requestObjectRequired` on the client and drop `ms-authres` from the scope — otherwise the server
   correctly refuses every unsigned request and every test fails.

5. Switch to the **JSON** tab and paste the contents of `conformance/fapi2-config.json`.
   The form and the JSON are two views of the same thing; editing either updates the other.
6. Click **Create test plan**.

---

## Step 3 — run it

1. Press **Launch Test Plan** to see the module list.
2. Click **Run New Test** on the first module.
3. **Read the light blue box.** Some modules ask you to do something specific — deny consent, or
   confirm an error appeared — and skipping that instruction is the usual reason a module hangs.
4. When a module needs a browser leg, press **Visit** and sign in. The plan automates this using the
   credentials you passed in Step 1; if it stalls on the login page, they are wrong.
5. Press **Continue Plan** for the next module, or **Return to Plan** to watch overall progress.
6. When the plan is green, follow the Foundation's submission instructions to certify.

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
| Suite cannot fetch the discovery document | It uses `{issuer}/.well-known/openid-configuration` at the **root**. Confirm it returns JSON, not the SPA's HTML. |
| Every test fails at client authentication | The registered public key does not match the private key in the plan. Re-run the setup with `--apply`. |
| Login page never advances | Wrong demo credentials. `AUTH_USERS` is set per deployment and is not in this repo; `admin`/`password` is only the local fallback. |
| Authorization silently cancels | The login form has two buttons named `login` (Sign in and Cancel). The generated plan clicks `id: btn-submit` for this reason; a hand-edited plan using `name: login` can hit Cancel. |
| `invalid_request` on the redirect URI | The second callback — the one with `?dummy1=lorem&dummy2=ipsum` — is not registered. |
| Every test fails with `invalid_request` on the request object | The variants are set to the unsigned forms. This deployment requires `signed_non_repudiation` and `jarm`. |
| `invalid_request` on a plain authorization request | Expected. The FAPI scope requires PAR and a signed request object. |
| Non-FAPI panels break after a config change | FAPI enforcement is **per-scope** here (`fapi2` scope attribute), not service-wide. Setting `fapiModes` turns the whole deployment into a FAPI-only server and returns `400` on every ordinary OAuth request. |
| Runs stall after a few modules | Login is rate-limited to 5/minute and the API to 20/minute. |

---

## Related

- `scripts/fapi2-conformance.mjs` — the 25-case local probe
- `scripts/fapi2-conformance-setup.mjs` — prepares the service and writes the plan
- `scripts/fapi2-apply-config.mjs` — applies service/client configuration through the SDK
- [`docs/agents/dpop-and-client-auth.md`](agents/dpop-and-client-auth.md) — DPoP and client credentials
