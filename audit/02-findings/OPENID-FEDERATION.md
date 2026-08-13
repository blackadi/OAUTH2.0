# OpenID Federation 1.0

- **Verdict:** `PARTIAL` — both endpoints are non-functional
- **Severity:** **S2**
- **Status:** OpenID **Final**, **17 February 2026** — verified this session. **`SPEC-INVENTORY.md` and `01-spec-matrix.md` record "1.1, Final, 5 May 2026", which the served document does not support — see F-3.**
- **Authlete version:** 3.0 (`api-reference/federation-endpoint/*`)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md`, `docs/curriculum/PROGRESS.md:1185-1191`, `docs/curriculum/modules/09b-identity-and-credentials/`

<thinking>
1. Requirements on the OP: publish an entity configuration — a **signed JWT**, explicitly typed
   `entity-statement+jwt`, media type `application/entity-statement+jwt`, carrying `iss`, `sub`, `iat`, `exp`,
   `jwks` and `metadata` — at its entity identifier; support automatic and/or explicit client registration and
   advertise `client_registration_types_supported`; validate trust chains against configured trust anchors.
2. Authlete boundary: `federation.configuration` builds and signs the entity statement;
   `federation.registration` handles explicit registration. The AS's work is to call them correctly and set the
   content type. `Service.supportedClientRegistrationTypes` is the gate.
3. Code: two endpoints, correct action mapping, correct `application/entity-statement+jwt` content type — and
   the configuration call omits a request body Authlete requires, so it always 400s.
4. Docs: `PROGRESS.md:1185-1191` diagnoses this precisely, including that the SDK types the field as optional so
   the bug compiles and passes review, and that a direct call with `{}` returns 200.
5. Delta: the entity configuration endpoint — the one thing a federation participant fetches first — returns 400
   at both of its paths, and reports the failure as a caller error.
6. The version/date discrepancy is the third citation error of the same class in this audit (Native SSO, and the
   JARM trap the repo itself fixed). Recorded, not smoothed.
</thinking>

## Normative requirements (OP side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Publish an entity configuration at the entity identifier's well-known location | §3 | ⚠️ served at `GET /.well-known/openid-federation` (`routes/federation.routes.ts:16`) — **returns 400** — F-1 |
| 2 | The entity configuration is a **signed JWT**, explicitly typed `typ: entity-statement+jwt` | §3 | ⊘ Authlete's — never reached |
| 3 | Media type `application/entity-statement+jwt` | §15.1 | ✅ set correctly on the `OK` branch (`controllers/federation.controller.ts:13-17`) |
| 4 | Required claims `iss`, `sub`, `iat`, `exp`, `jwks`, `metadata` | §3 | ⊘ Authlete's — never reached |
| 5 | Support automatic and/or explicit registration; advertise `client_registration_types_supported` | §5.1.3, §12 | ⚠️ service has `supportedClientRegistrationTypes = ["AUTOMATIC","EXPLICIT"]` (probe 3); **the value does not appear in the OP's discovery document** — F-2 |
| 6 | Explicit registration endpoint | §12 | ✅ `POST /api/federation/registration` → `federation.registration`, with basic auth (`controllers/federation.controller.ts:54,56`) — **not exercised** |
| 7 | Validate trust chains against configured trust anchors | §3.2, §10 | ⊘ Authlete's |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Building and signing the entity statement | Authlete | `federation.configuration` |
| Trust-chain validation, policy application | Authlete | `federation.registration` |
| Calling those APIs correctly | **This server** | `services/federation.service.ts:14-16` — **the defect** |
| Content type and action mapping | **This server** | `controllers/federation.controller.ts:13-27` — correct |
| Enabling registration types | Service configuration | `supportedClientRegistrationTypes` — set |

## Finding F-1 — the entity configuration endpoint always returns 400, at both paths (S2)

`services/federation.service.ts:14-16`:

```ts
const response = await this.authleteApi.federation.configuration({
  serviceId,
});
```

No `requestBody`. `PROGRESS.md:1185-1191` records the diagnosis and I confirm it against the code and the SDK:

- The SDK types the field as **optional** — `requestBody?: FederationConfigurationApiRequestBody` where the type is `{}` — so omitting it compiles cleanly and reads as correct.
- Authlete requires a body. Both `GET /.well-known/openid-federation` and `GET /api/federation/configuration` therefore return **400** with `[A126203] The request body is missing or empty.`
- Verified two ways during the Module 09b build: the repo's failure, and **a direct call to Authlete with `{}` returning HTTP 200** — which both proves the fix is `{}` and rules out a service-configuration cause.

**Why this is S2 rather than S3.** The entity configuration is the *first* thing any federation participant
fetches — it is the root of trust discovery, the equivalent of the discovery document. An OP whose entity
configuration 400s is not partially federated; it is invisible to the federation. And the failure is reported as
a **caller** error (`[A126203]` is a 400 about the request), so an operator debugging it looks at the requester
first. `PROGRESS.md:1198-1200` groups this with two siblings — Module 06's Zod failure and Module 08's unset
`JWKS_URI` — as one recurring pattern: *"a server configuration error reported as a caller error."* This is the
third instance, and `POST /api/federation/registration` **in the same file** is written correctly, passing its
body through.

The fix is `{ requestBody: {} }`.

## Finding F-2 — the registration types are configured but not advertised (S3)

Probe 3: `supportedClientRegistrationTypes = ["AUTOMATIC", "EXPLICIT"]` on the service, and
`client_registration_types_supported` **does not appear** among the 62 members of the generated discovery
document. Under §5.1.3 that value is how an RP learns whether automatic or explicit registration is available.

Two readings, and I cannot separate them without more evidence: either Authlete publishes it only in the
**entity configuration** (which is arguably the correct place for a federation-specific metadata value, and which
F-1 makes unreachable), or it is simply absent. **Named next action:** fix F-1, then read the resulting entity
statement's `metadata.openid_provider` object for `client_registration_types_supported`. One call after a one-line
fix, and it also verifies requirements 2 and 4 above, which are currently unverifiable.

## Finding F-3 — the recorded version and date do not match the served document (S3)

| Source | Version | Status | Date |
|---|---|---|---|
| `openid.net/specs/openid-federation-1_0.html`, fetched this session | **1.0** | Final | **17 February 2026** |
| `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **1.1** | Final | **5 May 2026** |

The canonical URL serves 1.0, Final, 17 Feb 2026. I could not find a 1.1 document, and I am not asserting that
none exists — the JARM lesson in this very repo (`SPEC-INVENTORY.md:287-288`: `-final.html` served a stale Final
while the unsuffixed URL served the errata set) is precisely that URL-to-version assumptions are unsafe. But the
inventory's claim is unsupported by the document at the canonical path, and `01-spec-matrix.md` §3 also asserts
1.1 *"superseding 1.0"*, which is a stronger claim still.

**This is the third citation defect of one class in this audit** — after Native SSO's draft-07 date
(`NATIVE-SSO-1.0.md` F-3) and the two the repo already caught itself. All three are dates or versions recorded
from something other than the document header, in a repo whose master claim is that *"Every spec identifier here
is verified against its primary source"* (`docs/curriculum/README.md:116-122`). It is worth treating as a process
finding at Phase 4: the inventory needs, per row, the URL fetched and the header line it was read from.

Note this row is already on `01-spec-matrix.md` §7's list of ten for Phase 3 spot re-verification, so the
mechanism to catch it existed — this entry just gets there first.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| The endpoint is broken, the SDK's optional typing hid it, `{}` returns 200, and the failure misreports the cause | `PROGRESS.md:1185-1191` | **Confirmed** line by line. An unusually complete diagnosis | **Accurate** |
| "OpenID Federation 1.1 … Final, 5 May 2026", *"superseding 1.0"* | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | The served document is 1.0, Final, 17 Feb 2026 — F-3 | `DOC_INCORRECT` / S3 |
| `POST /api/federation/registration` is written correctly | `PROGRESS.md:1200` | Confirmed — it forwards `entityConfiguration` / `trustChain` (`services/federation.service.ts:34-37`) | **Accurate** |
| Content type `application/entity-statement+jwt` on the `OK` branch | `00-inventory.md` §5 | Confirmed; matches §15.1 | **Accurate** |
| Nothing states that `client_registration_types_supported` is unadvertised | all docs | F-2 | **Omission** / S3 |
| Federation is **not** listed as "Working" in `README.md`'s feature tables | `README.md:92-130` | Correct — and a welcome contrast with Native SSO, VCI, FAPI 2.0 and MCP | **Accurate** |

## Sources consulted

- OpenID Federation 1.0 §§3, 3.2, 5.1.2, 5.1.3, 10, 12, 15.1 — `https://openid.net/specs/openid-federation-1_0.html`, fetched this session. Quoted: the entity statement is *"a signed JWT"*, the `typ: entity-statement+jwt` requirement, the `application/entity-statement+jwt` media type, the six required claims, and `client_registration_types_supported`.
- Live probe 3 (2026-08-10): `supportedClientRegistrationTypes`; `client_registration_types_supported` absent from the discovery document — `SERVICE-CONFIG-PROBE.md` §8, §9
- Repo-sourced live evidence: `PROGRESS.md:1185-1191` (`[A126203]`, and the direct `{}` call returning 200)
- SDK 1.0.0: `federation.configuration`'s optional `requestBody` typing
- Code: `services/federation.service.ts:10-19,21-40`, `controllers/federation.controller.ts:13-27,34,54,56`, `routes/federation.routes.ts:11,12,16`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| FED-W1 | Pass `{ requestBody: {} }` to `federation.configuration` | S | Both `GET /.well-known/openid-federation` and `GET /api/federation/configuration` return 200 with `application/entity-statement+jwt`; a test asserts the body is passed. One line, and it unblocks W2. |
| FED-W2 | Verify the entity statement against §3 | S | Decode the returned JWT: `typ: entity-statement+jwt`, and `iss`, `sub`, `iat`, `exp`, `jwks`, `metadata` present; check whether `client_registration_types_supported` appears in `metadata`. Closes F-2 and requirements 2 and 4. |
| FED-W3 | Reconcile the version and date | S | `SPEC-INVENTORY.md` and `01-spec-matrix.md` cite the document header actually fetched (1.0, Final, 17 Feb 2026), or cite a 1.1 document with its URL. Removes the *"superseding 1.0"* claim unless it can be sourced. |
| FED-W4 | Add the per-row provenance discipline | S | Phase 4 process item: every `SPEC-INVENTORY.md` row records the URL fetched and the header line the status/date came from. Would have caught all three instances of F-3's class. |
| FED-W5 | Report the failure as a server error until W1 ships | S | If W1 is deferred, the 400 from Authlete is not passed through as though the caller were at fault — same fix pattern as **BCL-W3**. |

**Ordering.** W1 is one line and gates W2. W3 and W4 are documentation. None of these files is on the
`AGENTS.md` **Security-critical surfaces** list, and `AGENTS.md` explicitly excludes `federation` from it —
correctly, since Authlete performs the trust-chain validation.
