# Running the FAPI 2.0 conformance suite

**The short version:** this deployment passes 25 of its own FAPI 2.0 checks, but only the OpenID
Foundation's conformance suite produces a *certifiable* result. One script prepares everything the
suite needs; the rest of this page is the two things it cannot do for you.

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

# Do it
node scripts/fapi2-conformance-setup.mjs --alias your-unique-alias --apply
```

**Pick an alias nobody else would use.** The suite's callback is
`https://www.certification.openid.net/test/a/<ALIAS>/callback`, and the suite's own documentation
warns that two people sharing an alias will interfere with each other's runs.

The script does three things:

1. **Registers the suite's callback** on the FAPI client, keeping the redirect URIs already there.
2. **Creates a second client.** The suite checks that a code issued to one client cannot be redeemed
   by another, so it needs two independently-keyed confidential clients. A plan configured with one
   fails those tests for the wrong reason.
3. **Writes `conformance/fapi2-config.json`** — the test plan, including the private keys the suite
   signs with.

> ⚠️ **It rotates the primary client's key.** The config has to hold a private key whose public half
> is what Authlete has registered; anything else fails at the first client-authentication step. If you
> were using that client elsewhere, re-point it at the new key in `conformance/fapi2-config.json`.

`conformance/` is gitignored. Those files contain private keys — keep it that way.

---

## Step 2 — the two things you must supply

### The demo login credentials

The generated plan drives the login form with `admin` / `password`. **That is only the fallback a
local server uses when `AUTH_USERS` is unset.** Against the Render deployment those return `401` —
measured, not assumed.

```bash
FAPI_USERNAME=<real> FAPI_PASSWORD=<real> \
  node scripts/fapi2-conformance-setup.mjs --alias your-unique-alias --apply
```

`AUTH_USERS` is set in the Render dashboard and is deliberately not in this repo, so nothing here can
look it up for you.

### The plan itself

Go to <https://www.certification.openid.net/>, sign in, create a new test plan, choose the **FAPI 2.0
Security Profile** (and **Message Signing** for the signed-request/response tests), and paste
`conformance/fapi2-config.json` into the configuration box.

---

## What the suite will find already in place

Verified against the live deployment before writing this page:

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
| Every test fails at client authentication | The registered public key does not match the private key in the plan. Re-run the setup script with `--apply`. |
| `401` on every login step | Wrong demo credentials — see above. `admin`/`password` is a local default only. |
| Authorization silently cancels | The login form has two buttons named `login` (Sign in and Cancel). The generated plan clicks `id: btn-submit` for this reason; a hand-edited plan using `name: login` can hit Cancel. |
| `invalid_request` on a plain authorization request | Expected. The FAPI scope requires PAR and a signed request object. |
| Non-FAPI panels break after a config change | FAPI enforcement is **per-scope** here (`fapi2` scope attribute), not service-wide. Setting `fapiModes` turns the whole deployment into a FAPI-only server and returns `400` on every ordinary OAuth request. |

---

## Related

- `scripts/fapi2-conformance.mjs` — the 25-case local probe
- `scripts/fapi2-apply-config.mjs` — applies service/client configuration through the SDK
- [`docs/agents/dpop-and-client-auth.md`](agents/dpop-and-client-auth.md) — DPoP and client credentials
