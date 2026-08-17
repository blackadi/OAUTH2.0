# OpenID Connect Native SSO for Mobile Apps 1.0

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S2**
- **Status:** OpenID **Implementer's Draft, draft 07** — the document served at `openid.net` this session is dated **16 January 2025**. `SPEC-INVENTORY.md` records *"2nd Implementer's Draft (draft 07), approved 2025-10-17"*. **The two dates disagree — see F-3.**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/NATIVE-SSO-TUTORIAL.md`, `README.md` feature table, `docs/curriculum/SPEC-INVENTORY.md`, `AGENTS.md`

<thinking>
1. Requirements on the AS: recognise `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` with
   `subject_token_type=urn:ietf:params:oauth:token-type:id_token` and
   `actor_token_type=urn:openid:params:token-type:device-secret`; when the authorization request carries the
   `device_sso` scope, *"the Authorization Server MUST issue a `device_secret` and an `id_token`"*; put `ds_hash`
   and `sid` in that ID token; before issuing to the second app, validate the device secret, the ID token
   signature, the `ds_hash` binding, that the `sid` session is still active, and the requesting client; advertise
   `native_sso_supported: true`.
2. Authlete boundary: `nativeSso.process` / `nativeSso.logout`, plus `TokenResponseAction.NATIVE_SSO` on the
   token endpoint, gated by the service flag `nativeSsoSupported`. The AS's own work is the two endpoints, the
   `sessionId` it generates at authorization time, and admin authentication.
3. Code: all of it is present and looks correct — two endpoints, basic auth on both, `sessionId` generated at
   `services/authorization.service.ts:133-137`, `NATIVE_SSO` handled in the token controller.
4. Docs: `README.md` lists Native SSO as **"Working"** and there is a full tutorial.
5. Delta: `nativeSsoSupported = false` and `native_sso_supported` is absent from discovery, so nothing here can
   work. This is the sharpest instance of the repo's recurring "code exists, config disabled, feature table says
   Working" pattern.
6. The status/date discrepancy is a real finding in a repo whose master claim is verified citations — recorded
   rather than smoothed.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Recognise the token-exchange grant with `subject_token_type=…:id_token` and `actor_token_type=urn:openid:params:token-type:device-secret` | draft 07 | ⊘ Authlete's, via `TokenResponseAction.NATIVE_SSO`; ❌ **unreachable** — F-1 |
| 2 | With the `device_sso` scope, the AS **MUST** issue a `device_secret` and an `id_token` | draft 07 | ❌ unreachable — F-1 |
| 3 | The ID token carries `ds_hash` (binding to the device secret) and `sid` | draft 07 | ⊘ Authlete's — the AS supplies `sessionId` (`services/authorization.service.ts:133-137`), which is the `sid` input |
| 4 | Before issuing to the second app: validate the device secret, the ID token signature, the `ds_hash` match, that `sid` is still active, and the client | draft 07 | ⊘ Authlete's, inside `nativeSso.process` — the AS forwards `accessToken`, `deviceSecret`, optional `deviceSecretHash` (`services/native-sso.service.ts:29-46`) |
| 5 | Session termination | draft 07 | ✅ `POST /api/nativesso/logout` → `nativeSso.logout({ sessionId })` |
| 6 | Advertise `native_sso_supported: true` | draft 07 | ❌ **absent** from the live discovery document — F-1 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| The `NATIVE_SSO` token-endpoint action | Authlete | handled at `controllers/token.controller.ts` (in the action switch, `00-inventory.md` §5) |
| Device-secret validation, `ds_hash` verification, session check | Authlete | `nativeSso.process` |
| Generating the `sessionId` that becomes `sid` | **This server** | `services/authorization.service.ts:133-137` — `crypto.randomUUID()` when `nativeSsoRequested` |
| Exposing the two endpoints and authenticating the caller | **This server** | `controllers/native-sso.controller.ts:37,49` with `requireBasicAuth` at `:39,:51` |
| Enabling the feature at all | Service configuration | `nativeSsoSupported` — **`false`** |

The code side is genuinely complete: `native-sso-response.handler.ts` maps `OK`/`CALLER_ERROR`/`INTERNAL_SERVER_ERROR`,
and `01-spec-matrix.md` §6 confirmed the apparent inconsistency between `native-sso.controller.ts:17` and `:26`
(`INTERNAL_SERVER_ERROR` vs `SERVER_ERROR`) is **correct** — the two Authlete APIs genuinely use different
literals. This is well-built code for a feature that is switched off.

## Finding F-1 — the feature is disabled on the service and `README.md` lists it as "Working" (S2)

Probe 1 §3.6 and probe 3:

```
nativeSsoSupported  = false      # service
native_sso_supported = <ABSENT>  # generated discovery document
```

Against:

- `README.md:92-130` — three feature-status tables asserting **"Working"** for, among others, Native SSO (recorded in `00-inventory.md` §9 as one of the repo's highest-claim-density statements).
- `docs/NATIVE-SSO-TUTORIAL.md` — a full tutorial.
- Nine SDK-backed code paths, admin auth, action mapping, and a `sessionId` generator.

Everything exists except the flag. With `nativeSsoSupported = false`, Authlete will not issue a `device_secret`
for the `device_sso` scope and `nativeSso.process` cannot succeed, so **no part of this feature has ever run on
this deployment.**

**Failure scenario.** A learner reads the feature table, works through the tutorial, and cannot reproduce a
single step; there is no error message that says "the service flag is off", because the failure surfaces as an
Authlete rejection at whichever call they reach first. The severity is S2 rather than S3 because the claim is
made in `README.md`'s status table — the one place a reader goes specifically to find out what works.

**This is the fourth instance of one pattern**, and it is now the audit's clearest Phase 4 theme:

| Feature | Claim | Live flag |
|---|---|---|
| Native SSO | `README.md` "Working" + full tutorial | `nativeSsoSupported = false` |
| FAPI 2.0 | `README.md` "Working" | `fapiModes` absent |
| Verifiable Credentials | 9 endpoints + tutorial | `verifiableCredentialsEnabled = false` |
| MCP "out of the box" | `docs/MCP-OAUTH-TUTORIAL.md` | `clientIdMetadataDocumentSupported = false` |

Probe 1 §3.6 already tabulated these and deferred them to B6/B7. Native SSO is the B6 member, and its verdict is
`MISCONFIGURED` — implemented, documented, and contradicted by the service configuration.

## Finding F-2 — the `sid` the AS generates is fresh per authorization, with no session continuity (S3)

`services/authorization.service.ts:133-137`:

```ts
if (req.session.authorization?.nativeSsoRequested) {
  const sessionId = crypto.randomUUID();
  reqBody.sessionId = sessionId;
}
```

A new UUID on every authorization that requests Native SSO, with nothing tying it to the browser session
(`req.session`) or to any prior `sessionId`. The draft's `sid` is meant to *"uniquely identif[y] this user's
authentication session"* — a session, not a request — and the whole point of the flow is that a second app
inherits the first app's session.

I am recording this at S3 rather than S2 because I cannot demonstrate the consequence: with the feature disabled,
no second app has ever presented an ID token whose `sid` had to still be active. It may also be that Authlete
treats each `sessionId` as an opaque handle it associates with the subject, in which case regenerating it per
authorization simply creates a new session each time — which would make single-sign-*on* impossible while leaving
each individual exchange valid. **Named next action:** enable the flag (9068-style console change), run the
tutorial's two-app sequence, and observe whether a second app can exchange an ID token issued under a *previous*
`sessionId`. That single test distinguishes "harmless handle" from "the SSO in Native SSO does not work."

Also unreviewed for the same reason: `POST /api/nativesso/logout` takes a `sessionId` from the request body, so
the caller chooses which session to terminate. It is behind admin Basic auth, so this is not an authorization
gap — but nothing correlates that `sessionId` with anything the server recorded, because the server never stores
the UUIDs it generates.

## Finding F-4 — Phase 1 cannot complete: `handleNativeSso` demands a `deviceSecret` the AS is supposed to mint (S3, latent)

**Found 2026-08-17**, by enabling `nativeSsoSupported` temporarily and walking the whole chain
(`SERVICE-CONFIG-PROBE.md` §24.3). This is the finding F-2 said it could not produce, arrived at from the other
end — not the `sid` question, but the step before it.

Authlete answers a Phase 1 authorization-code exchange with **`action: NATIVE_SSO`** (`A050002`), a
`responseContent` of `undefined`, and **no `deviceSecret`**. That is not an omission on Authlete's part. SDK
1.0.0 documents `TokenResponse.deviceSecret` as:

> *"If the response from the `/auth/token` API contains the `deviceSecret` parameter, its value should be used
> as the value of this `deviceSecret` request parameter to the `/nativesso` API. **The authorization server may
> choose to issue a new device secret; in that case, it is free to generate a new device secret and specify the
> new value.**"*

On a first exchange there is nothing to carry forward, so **the AS mints it**. `controllers/native-sso-response.handler.ts:22-28` does the opposite:

```ts
const deviceSecret = result.deviceSecret;
if (!accessToken || !deviceSecret) {
  return res.status(500).json({ error: "server_error",
    error_description: "Missing accessToken or deviceSecret for Native SSO" });
}
```

So the moment the flag goes on, **every Phase 1 request answers HTTP 500** — from code that compiles, reads
correctly, and has a passing test suite. `deviceSecretHash` is likewise never computed; `native-sso.service.ts`
accepts it as an optional input and `handleNativeSso` never supplies one.

**Proven fixable, which is what makes this a scoped item rather than a worry.** With an AS-minted secret and
`deviceSecretHash = base64url(SHA-256(secret))`, `/nativesso` answers **`OK` `A501001`** — *"A Native
SSO-compliant ID token and a token response were generated successfully"* — returning `device_secret` and an ID
token carrying `sid` plus a `ds_hash` that matched the supplied hash exactly. The Phase 2 exchange then reaches
**`action: NATIVE_SSO`** (`A311002`), this time *with* `deviceSecret` present on the response, as the SDK
documentation predicts.

**Deliberately NOT fixed.** DR-04 declines the feature; landing this alone would ship half of a declined feature
and produce precisely the *"two-app sequence that half-works"* that DR-04 exists to avoid. **Severity S3 and
`latent`**: unreachable while the flag is `false`, and live the moment it is `true` — the same construction as
9068-F3.

**Two adjacent facts recorded here so they are not rediscovered:**

- **`sessionId` is mandatory, and this server already supplies it.** Without it,
  `/auth/authorization/issue` answers `LOCATION` carrying `error=server_error` — **`[A499201]`**. F-2 reads
  `authorization.service.ts`'s fresh-UUID as a *weakness*; it is simultaneously the thing that keeps this
  server past Authlete's first gate. A probe that bypasses the server fails here, and its **downstream**
  symptom is `[A050305] No such authorization code` — a code extracted from an error redirect that carried
  none. **Right-looking failure, wrong cause.**
- **`tokenExchangeByConfidentialClientsOnly` is `true`**, so Phase 2 is refused for public clients
  (**`[A311304]`**). Native SSO's subject is *native mobile apps*, which are public clients — so on this
  service the flag would advertise a capability its own target client type cannot exercise. `Part 6`'s
  console checklist does not mention client type. (A wrong `audience` earns **`[A311337]`**: it must be the
  OP's issuer identifier, not the client id.)

## Finding F-3 — the recorded status and date do not match the served document (S3)

| Source | Status | Date |
|---|---|---|
| `openid.net/specs/openid-connect-native-sso-1_0.html`, fetched this session | Implementer's Draft, **draft 07** | **16 January 2025** |
| `SPEC-INVENTORY.md` / `01-spec-matrix.md` §2 | **2nd** Implementer's Draft (draft 07) | approved **2025-10-17** |

Both may be defensible — a document dated January can be approved as a 2nd Implementer's Draft by a later vote,
and the repo may be citing the approval announcement rather than the document header. But the repo's master claim
is that *"Every spec identifier here is verified against its primary source, labeled by type … drafts are never
presented as normative"* (`docs/curriculum/README.md:116-122`), and a date that does not appear on the primary
source is exactly what that claim exists to prevent. `SPEC-INVENTORY.md` is also the file that corrected itself
twice on this precise class of error (the JARM errata-set title, the `-final.html`-is-not-current trap), so the
standard is its own.

**Resolution needed:** cite the document header date, and if the approval date is the intended fact, label it as
such — *"draft 07, dated 16 Jan 2025; approved as 2nd Implementer's Draft 17 Oct 2025 (OIDF announcement)"* —
with the announcement as a separate source. This is one of the ten rows `01-spec-matrix.md` §7 already selected
for spot re-verification in Phase 3; it can be closed there.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Native SSO listed as **"Working"** | `README.md:92-130` | `nativeSsoSupported = false`; nothing can run | `DOC_INCORRECT` / **S2** |
| Full tutorial with an end-to-end flow | `docs/NATIVE-SSO-TUTORIAL.md` | Cannot have been reproduced on this deployment. **Not read line-by-line here** — its transcripts are Phase 3 work | **Deferred to Phase 3**, but the feature-level verdict already stands |
| Two endpoints behind admin basic auth; `NATIVE_SSO` token action handled | `AGENTS.md`, `00-inventory.md` §3.3 | Matches the code | **Accurate** |
| `native-sso.controller.ts:26` uses `SERVER_ERROR` where `:17` uses `INTERNAL_SERVER_ERROR` | `01-spec-matrix.md` §6 | **Correct** — the two Authlete APIs use different literals | **Accurate** |
| 2nd Implementer's Draft, approved 2025-10-17 | `SPEC-INVENTORY.md` | The served document says draft 07, 16 Jan 2025 — F-3 | `DOC_INCORRECT` / S3 |
| Nothing states that the `sid` is regenerated per authorization | all docs | F-2 | **Omission** / S3 |

## Sources consulted

- OpenID Connect Native SSO for Mobile Apps 1.0, **draft 07** — `https://openid.net/specs/openid-connect-native-sso-1_0.html`, fetched this session. Quoted: the `device_sso` scope obligation (*"the Authorization Server MUST issue a `device_secret` and an `id_token`"*), the `ds_hash` binding, `sid` as *"uniquely identifies this user's authentication session"*, the token-type URNs, and `native_sso_supported`.
- RFC 8693 §3 token-type identifiers (the `subject_token_type` used here) — `https://www.rfc-editor.org/rfc/rfc8693.txt`
- Live probes 1 and 3 (2026-08-10): `nativeSsoSupported`, `native_sso_supported` — `SERVICE-CONFIG-PROBE.md` §3.6, §8
- SDK 1.0.0: `NativeSsoResponseAction`, `NativeSsoLogoutResponseAction`, `TokenResponseAction.NATIVE_SSO` (`01-spec-matrix.md` §6)
- Code: `services/native-sso.service.ts` (whole file), `controllers/native-sso.controller.ts:17,26,37,39,49,51`, `controllers/native-sso-response.handler.ts:42-58`, `services/authorization.service.ts:133-137`, `routes/native-sso.routes.ts:10-11`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| NSSO-W1 | Set `nativeSsoSupported = true`, or stop claiming the feature works | S | ✅ **RULED — do NOT enable (DR-04, 2026-08-14; re-ruled 2026-08-17 on live evidence).** `README.md` reads *"Not enabled — `nativeSsoSupported` is `false`"* and the tutorial carries the banner. **The re-ruling upgraded the record's reasoning**: the 2026-08-14 ruling predicted a *"two-app sequence that half-works"*; the probe shows it does not half-work but returns **HTTP 500 on the first request** (F-4). Enabling also adds `native_sso_supported` to discovery (66 → 67 members, the only member that moves). |
| NSSO-W2 | Settle the `sid` question | S | Conditional on W1, therefore **not scheduled** — DR-04 declines W1. **Partly answered anyway, and the shape changed** (2026-08-17): the `sid` question is *not the first blocker*, it is the third. F-4's minting gap and `tokenExchangeByConfidentialClientsOnly` both sit in front of it, and both are ours rather than the vendor's. What *is* now known: Authlete does embed the supplied `sessionId` as **`sid`** in the Native SSO ID token, alongside a `ds_hash` matching the AS-computed hash, so the handle is honoured end to end within one authorization. Whether a *second* authorization's `sid` invalidates the first still needs the two-app sequence, and still means a planned change to `services/authorization.service.ts` (**Security-critical surfaces**) if it does. |
| NSSO-W3 | Fix the status/date citation | S | ✅ **DONE 2026-08-14 (T2-14); confirmed and marked in T2-5's coverage sweep.** The row cites the document header (**draft 07, text dated 16 Jan 2025**) and the approval (**2025-10-17**) as separate, labelled facts, and the file's closing trap note generalises it: *"a document's own date is not its approval date — cite the approval for status, the header for content."* **Verified against the live file rather than taken from T2-14's summary**, which is the whole point of sweeping before fetching: this row had been done for a day and still read as open work, and re-fetching it would have spent a budgeted fetch on a settled question. |
| NSSO-W4 | Add the four-row "claimed working / flag off" table to Phase 4 | S | ✅ **DONE 2026-08-14 (T2-8), and the table had drifted in *both* directions by the time it was written.** Two of the four features are now switched **on** — verifiable credentials (DR-03 + VCI-W6) and CIMD (DR-05) — so *"claimed working, flag off"* had become *"working, and not listed at all"*: **VCI and MCP appeared nowhere in `README.md`'s feature tables**, which is why the drift was invisible. Both now have rows, with the honest qualifications (VCI: *issuance needs a wallet this repo does not contain*; MCP: *CIMD works, MCP end to end does not, because OAuth 2.1's first MUST is that the AS reject `implicit` and `password` and both are enabled deliberately*). **The remedy is the derivation, not the four rows**: a note under the table names the five service fields the rows depend on, gives the read-only command that prints them, and records the captured values with a date. The command was **run before being published** — it prints `false`, `<absent>`, `true`, `<set>`, `true`, matching the prose character for character, and it deliberately prints `<set>` rather than `credentialJwks` itself because that field holds a private scalar. `json.dumps` rather than the bare value, so booleans read `false`/`true` and not Python's `False`/`True`. **Not made a CI check on purpose** — a service configuration change is not a reason to fail somebody's pull request, the same argument that schedules external link checking weekly; §7.3's discovery-diff proposal is the scheduled version. |

**Ordering.** W1 gates W2. W3 is documentation and independent. W4 is a Phase 4 synthesis item, recorded here
because this entry is where the pattern became unambiguous.
