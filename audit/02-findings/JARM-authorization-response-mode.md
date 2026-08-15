# JARM — JWT Secured Authorization Response Mode for OAuth 2.0, incorporating errata set 1

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S3**
- **Status of the specification:** OpenID **Final**, *incorporating errata set 1*, **17 August 2025** — re-verified against the primary source this session
- **Authlete version:** 3.0 (the JARM page states no minimum)
- **Repo docs under test:** `docs/curriculum/modules/09a-interaction-extensions/README.md:173`, `…/lab.md:126-215`, `…/quiz-answers.md:207,440`, `docs/curriculum/SPEC-INVENTORY.md:148-153,204,245`, `docs/curriculum/AUDIT-PASS-A.md:547`

<thinking>
1. Spec requirements on the AS: §2.1 the response JWT carries `iss`, `aud` (= `client_id`) and `exp` as
   required claims, plus the ordinary authorization-response parameters as top-level claims; §2.1.1 error
   responses take the same JWT form, carrying `error`, `error_description`, `error_uri`, `state`; §2.2 the JWT
   is signed, or signed and encrypted; §2.3 four response modes — `query.jwt`, `fragment.jwt`,
   `form_post.jwt`, and `jwt` as a shortcut resolving to `query.jwt` for `code` and `fragment.jwt` for token
   response types; §3 the client metadata `authorization_signed_response_alg` (default RS256, `none`
   disallowed), `authorization_encrypted_response_alg`, `authorization_encrypted_response_enc`; §4 the three
   `authorization_*_alg_values_supported` metadata parameters, and `response_modes_supported` SHOULD be
   published.
2. Authlete boundary: **all of it.** Authlete constructs, signs and delivers the response object; the mode
   rides inside `parameters`; the AS handles the same `LOCATION`/`FORM` actions it already handles. The gates
   are the client's `authorizationSignAlg` (plus the two encryption fields) and a service JWK set.
3. Code: zero JARM markers in `server/src` — no `response_mode`, no `jarm`, no `authorization_signed_response_alg`.
   That is the **correct** outcome for a feature the AS does not implement. Three client-metadata setters exist
   (`client.management.service.ts:413-415`), so the feature can be switched on through this repo's own admin
   surface.
4. Docs: Module 09a is accurate and unusually good — it records the exact live error, reads the error message
   as a lesson, and separates the AS side from the client side. It also documents a genuine vendor anomaly on
   the `form_post.jwt` error path.
5. Delta: not code↔spec. It is **metadata↔configuration**: Authlete advertises all four JARM response modes
   plus four signing algorithms, and not one client can consume any of them.
6. Was the four-mode advertisement deliberate? Probe 2 settles it: the service's own `supportedResponseModes`
   is **absent** while the generated document lists all seven — so Authlete advertises the JARM modes by
   default. Nobody enabled anything; nobody can turn it off from the service either.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Response JWT carries `iss`, `aud`, `exp` | §2.1 | ⊘ Authlete's; `authorizationResponseDuration = 600` sets `exp` |
| 2 | Authorization-response parameters as top-level JWT claims, strings as JSON strings and numbers as JSON numbers | §2.1 | ⊘ Authlete's |
| 3 | Error responses take the same JWT form, carrying `error`, `error_description`, `error_uri`, `state` | §2.1.1 | ⊘ Authlete's — **and this is the path with the vendor anomaly**, F-2 |
| 4 | The JWT is signed, or signed and encrypted | §2.2 | ⊘ Authlete's; requires a service JWK set |
| 5 | Support `query.jwt`, `fragment.jwt`, `form_post.jwt`, `jwt` | §2.3–2.3.4 | ⚠️ **advertised, none usable** — F-1 |
| 6 | Client metadata `authorization_signed_response_alg` (default RS256; `none` disallowed) | §3 | ⚠️ settable as `authorizationSignAlg` (`client.management.service.ts:413`); **unset on all three clients** |
| 7 | Client metadata `authorization_encrypted_response_alg` / `_enc` | §3 | ✅ settable (`:414-415`); unset |
| 8 | Advertise `authorization_signing_alg_values_supported` and the two encryption lists | §4 | ✅ live: `[HS256, HS512, ES256, HS384]` + 17 `alg` values |
| 9 | SHOULD publish `response_modes_supported` | §4 | ✅ live, and it includes all four JARM modes |
| 10 | No AS code required | — | ✅ confirmed: zero JARM markers in `server/src`, which is correct |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Building, signing, encrypting the response JWT | **Authlete** | `authorization.processRequest` / `authorization.issue` |
| Choosing the response mode | The client, inside `parameters` | opaque passthrough — `authorization.service.ts:26-34` |
| Delivering it | **This server**, via the actions it already handles | `authorization.controller.ts:38-49` |
| Enabling it | Client metadata + a service JWK set | `authorizationSignAlg`; `client.management.service.ts:413-415` |
| Consuming it | **The client** — parse and verify the `response` JWT | absent from the SPA |

`01-spec-matrix.md`'s phrasing — *"No AS code required on the AS side"* — is confirmed. The Authlete page does
not state outright who builds the JWT, so that claim rests on the observed behaviour in Module 09a
(`action: LOCATION` with the AS-built content) rather than on the page; recorded as such rather than asserted
from the vendor documentation.

## Finding F-1 — the AS advertises four JARM response modes that no client can use (S3)

Probe 2:

```
response_modes_supported                   = [query, fragment, form_post, query.jwt, fragment.jwt, form_post.jwt, jwt]
authorization_signing_alg_values_supported = [HS256, HS512, ES256, HS384]
supportedResponseModes                     = <absent>      # the service field itself
authorizationSignAlg                       = <absent>      # all three clients
authorizationSignatureKeyId                = <absent>
```

Every JARM request therefore fails, with the error the curriculum already records:

```
invalid_request | [A012305] The authorization request required the authorization response be encoded as JWT
                  by specifying 'response_mode=jwt', but the 'authorization_signed_response_alg' metadata of
                  the client (ID = …) is not set.
```

Three observations worth keeping separate:

1. **Nobody enabled this.** The service's `supportedResponseModes` is absent, yet the generated metadata lists all seven modes — so Authlete advertises the JARM modes **by default**. This is not a misconfiguration anyone performed; it is a default that the deployment cannot honour, and it cannot be narrowed from the service side.
2. **The failure is loud, named, and points at the fix.** `[A012305]` names `authorization_signed_response_alg` in its specification spelling. Module 09a's reading of that — *"you can go from this string to the JARM spec without knowing anything about Authlete"* (`lab.md:147-150`) — is exactly right, and it is why this is S3 rather than S2: a client developer is told precisely what is missing.
3. **One field closes it.** `client.management.service.ts:413` already exposes `authorizationSignAlg` through this repo's admin API, and `ES256` is in the advertised list, so a single client update makes JARM live end to end — on the AS side.

**Severity reasoning.** Under the audit's learner-centric rubric this is S3: the curriculum states the gap
plainly and the runtime error is self-explanatory, so nobody is misled into building something broken from the
docs. For a *non-learner* consumer starting from discovery it behaves like the S2-shaped defect in RFC 8705 F-1
— advertised capability, no configuration behind it. The pattern now appears three times in this audit (JARM
modes, mTLS auth methods, `README.md`'s "Working" table) and belongs in the Phase 4 synthesis as one theme
rather than three findings.

## Finding F-2 — the `form_post.jwt` error path returns a 302 whose `Location` is an HTML document (S3, vendor)

Recorded in `modules/09a…/lab.md:159-215` from live testing, with the vendor/repo boundary correctly drawn:

```
action          = LOCATION
resultCode      = A012305
responseContent = "<html><head><meta http-equiv=\"content-type\" content=\"te…"
```

Authlete returns `action: LOCATION` — "redirect the user agent to this URL" — with an HTML document as the
content. `authorization.controller.ts:38-42` does what `LOCATION` instructs, so the client receives
`302 Found` with a URL-encoded HTML document in `Location`. The repo's handling is correct; the response is
not. Confirmed only on the **error** path, because the success path is unreachable while F-1 stands.

The lab's conclusion is the right one and I am not going to improve on it: a defensive controller could detect
content that is not a URL and fall back to `FORM` handling, and that would be a reasonable hardening, but it is
a workaround for someone else's bug. Worth reporting upstream to Authlete; worth **not** patching around
silently, because a local workaround would mask the vendor defect from the next reader.

## Finding F-3 — the client half is genuinely absent, and correctly recorded (S3)

Nothing in `client/src` can consume a JARM response: no `response` parameter is read (`CallbackPage.tsx:38-40`
reads `code`, `state`, `error` only), and there is no JWT-response verification path. `SPEC-INVENTORY.md:245`
says exactly this — *"Client side: absent — the SPA cannot consume a `response` JWT"* — so the documentation is
accurate and the gap is open by choice.

This is the point where JARM's relationship to RFC 9207 becomes concrete. JARM §2.1 puts `iss` **inside** the
signed JWT, so a client verifying a JARM response gets issuer identification and response integrity from one
mechanism. Note for accuracy: the JARM document fetched this session **contains no mention of RFC 9207**;
it is RFC 9207 §2.4 that observes *"an additional `iss` parameter outside the JWT is not necessary when JARM is
used."* The direction of that citation matters for the curriculum — the claim belongs to RFC 9207, not to JARM
— and `SPEC-INVENTORY.md:204` currently lists `iss`/`aud`/`exp` under JARM without noting which document draws
the connection.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"…incorporating errata set 1"*, Final, **17 Aug 2025** | `SPEC-INVENTORY.md:204` | **Confirmed** against `openid.net/specs/oauth-v2-jarm.html` this session | **Accurate** |
| `oauth-v2-jarm-final.html` serves the Nov 2022 Final; `oauth-v2-jarm.html` serves errata set 1 | `SPEC-INVENTORY.md:287-288` | The URL without `-final` does serve the 17 Aug 2025 errata-set-1 document — the half I could verify holds | **Accurate** (as far as tested) |
| `response_mode=jwt` returns `[A012305]` naming `authorization_signed_response_alg` | `modules/09a…/README.md:173`, `lab.md:138-142`, `quiz-answers.md:440`, `AUDIT-PASS-A.md:547` | Consistent with the live client configuration; the error is the expected one for `authorizationSignAlg` unset | **Accurate** |
| "JARM requires no code in `server/src`" | `modules/09a…/lab.md:152-158` | Confirmed by grep and by the boundary analysis above | **Accurate** |
| The `form_post.jwt` 302-with-HTML anomaly is upstream, not the repo's | `modules/09a…/lab.md:205-215` | Confirmed against `authorization.controller.ts:38-42` | **Accurate** |
| "Supported by the AS; not configured. Needs only the client's `authorization_signed_response_alg`" | `SPEC-INVENTORY.md:204,245` | Confirmed; and the field is settable through this repo's admin API at `client.management.service.ts:413` | **Accurate** |
| Nothing records that the AS **advertises** all four JARM modes in `response_modes_supported` | all docs | See F-1 — the gap is not merely "not configured", it is "advertised and not configured" | **Omission** / S3 |
| `iss`/`aud`/`exp` listed as JARM claims, with no note that the "no separate `iss` needed" claim comes from RFC 9207 §2.4 | `SPEC-INVENTORY.md:204` | JARM itself never mentions RFC 9207 | **Incomplete** / S4 |

## Sources consulted

- JARM §§2.1, 2.1.1, 2.2, 2.3–2.3.4, 3, 4 — title, Final status, errata set 1, 17 August 2025 — `https://openid.net/specs/oauth-v2-jarm.html`
- RFC 9207 §2.4 (the "not necessary when JARM is used" statement) — `https://www.rfc-editor.org/rfc/rfc9207.txt`
- Authlete, Enabling JARM — `https://developers.authlete.com/configuration-reference/endpoints/enabling-jarm.md` *(states the client field and the service JWK-set requirement; does **not** state who builds the JWT, name a minimum version, or name an error code — source gap, as `01-spec-matrix.md` §8 recorded)*
- Live probe 2 (2026-08-10): `response_modes_supported`, `authorization_signing_alg_values_supported`, `authorization_encryption_*`, `supportedResponseModes`, `authorizationResponseDuration`, `authorizationSignatureKeyId`, per-client `authorizationSignAlg` — `SERVICE-CONFIG-PROBE.md` §6–§7
- Code: grep for `jarm` / `response_mode` / `authorizationSignAlg` over `server/src` + `client/src` → 3 hits, all client-metadata setters or prose (`services/client.management.service.ts:413-415`, `client/src/data/operationDocs.ts:760`); `controllers/authorization.controller.ts:38-49`; `client/src/pages/CallbackPage.tsx:38-40`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| JARM-W1 | Set `authorizationSignAlg = ES256` on one client | S | ✅ **DONE 2026-08-12 (T1-6)** on client `1523514379`. **Verified live**: `response_mode=query.jwt` returns a single `response` parameter carrying `{aud, state, code, iss, exp}`, signed `ES256` with the service key `kid: "1"`, signature checked against the published JWKS. Two facts the item did not anticipate — the response JWT's `exp` is **600 s**, not the service's 86400, so JARM's envelope is bounded independently of the tokens it carries; and JARM introduces **no new key material**, reusing the OP's ID-token signing key. Module 09a's marker is retired with that transcript. **JARM-W2 is now answerable** — a success path exists to compare against 2b's error-path anomaly. |
| JARM-W2 | Verify the `form_post.jwt` success path once W1 lands | S | ✅ **DONE 2026-08-14 (T2-17), read-only — and it is neither of the two options this row offered.** The success path is **correct**: `action: FORM` with an HTML auto-submitting form, which is what `form_post` means, and `authorization.controller.ts` already has a `case "FORM"`. So the anomaly is not general. **But it is not "error-path-only" either** — a `form_post.jwt` request that errors for an *unrelated* reason (`invalid_target`) on the JARM-configured client also answers `FORM`, correctly. **The defect is exactly one result code, `[A012305]`** — *"`authorization_signed_response_alg` … is not set"* — where Authlete builds the form_post HTML body and then labels it `LOCATION`. The lab probed before JARM-W1, so every `form_post.jwt` request available to it was an `[A012305]` request; the anomaly looked like the mode's error path because no other error path existed. **A defect that vanishes once you configure the feature is easy to mistake for a defect in the feature.** Six-row matrix: `SERVICE-CONFIG-PROBE.md` §22.2. |
| JARM-W3 | Consume JARM in the SPA | M | `CallbackPage.tsx` accepts a `response` parameter, verifies the signature against the AS JWK set, checks `iss`/`aud`/`exp`, and extracts `code`/`state`. Pairs naturally with **9207-W1** — one verification path, two specs closed. |
| JARM-W4 | Record the advertised-but-unconfigured state | S | Module 09a and `SPEC-INVENTORY.md:204` note that `response_modes_supported` already offers all four JARM modes by Authlete default, so this is an availability defect visible from discovery — not merely an unset field. |
| JARM-W5 | Attribute the "no separate `iss`" claim correctly | S | `SPEC-INVENTORY.md:204` cites RFC 9207 §2.4 for it, since JARM does not make the claim. |
| JARM-W6 | Report the `form_post.jwt` anomaly upstream | S | ⏸️ **OWED — the one item in this audit that cannot be closed from inside the repo.** Filing with a vendor is an action outside the working tree; recorded as owed rather than quietly dropped. **JARM-W2 upgraded what should be filed**, so the report is now a minimal reproduction rather than an observation: one client whose `responseModes` include `FORM_POST_JWT` and whose `authorizationSignAlg` is **unset**, one authorization request with `response_mode=form_post.jwt`, and Authlete answers `action: LOCATION` with `responseContent` beginning `<html>` — a whole HTML document where a URL belongs. Expected `action: FORM`, which is what the same endpoint returns on **every** other `form_post.jwt` path. **No local workaround, and none is needed in practice** — the trigger is a misconfiguration JARM-W1 removed here on 2026-08-12. |

**Ordering.** W1 gates W2 and makes W3 testable. No work item touches a file on the `AGENTS.md`
**Security-critical surfaces** list; W3 is client-side and W1/W4/W5 are configuration and documentation.
