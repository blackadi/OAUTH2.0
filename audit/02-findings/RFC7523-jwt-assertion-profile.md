# RFC 7523 — JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication and Authorization Grants

- **Verdict:** `PARTIAL`
- **Severity:** **S3**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/JWT-BEARER-TUTORIAL.md`, `docs/curriculum/modules/06-machine-and-delegated-grants/lab.md` Exercises 3–4, `docs/curriculum/SPEC-INVENTORY.md`

<thinking>
1. RFC MUSTs on the AS, §3: the JWT MUST contain `iss`, `sub`, `aud`, `exp`; `nbf`, `iat`, `jti` are MAY; the
   AS MUST reject a JWT whose `aud` does not contain its own identity, MUST reject an expired one subject to
   clock skew, and MUST reject an invalid signature or MAC. §3.1 — a bad grant is `invalid_grant`, and if
   client credentials are present the AS MUST validate them. §3.2 — a bad client assertion is
   `invalid_client`. Replay prevention via `jti` is explicitly optional (§3, §6).
2. Authlete boundary: split, and this repo's own material discovered the split. Authlete's `/auth/token`
   returns `JWT_BEARER` with the raw `assertion` after checking claims and policy; the AS then verifies the
   signature via `joseObject.joseVerifyApi`, extracts `sub`, and mints through `token.management.create`.
   Which claims Authlete *requires present* is controlled by `mandatoryClaims` — a parameter **this server
   sets**, so claim-presence policy is partly ours.
3. Code: `services/jwt-verification.service.ts`. Signature check at `:51-57`, `sub` re-check at `:73-79`,
   mint at `:90`. `mandatoryClaims: ["iss","sub","aud"]` at `:47` — **`exp` is not in that list.**
   `:81-88` builds a create request containing `issuer` and `audience`, neither of which is a field of
   `TokenCreateRequest`.
4. Docs: the tutorial claims Authlete validates `iss`, `sub`, `aud`, `exp`, and the lab proves four of the five
   §3 rejections live. The claim table at `JWT-BEARER-TUTORIAL.md:137-146` marks `exp` required and `jti` not
   implemented, which is right.
5. Delta: two. (a) `exp` **presence** is not required though §3(4) says MUST — expiry *is* checked when
   present, which is a different thing. (b) two fields are assembled and silently discarded, and one of them
   reads as audience restriction.
6. Does Authlete reject an assertion with **no** `exp` at all? Unknown. `[A314309]` proves an *expired* one is
   rejected; nothing proves a missing one is. One curl settles it and I have not run it, so it is recorded as
   a named next action rather than asserted either way.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, `assertion` carries exactly one JWT | §2.1 | ✅ `TokenResponseAction.JWT_BEARER`; verified live (`modules/06…/lab.md:334`) |
| 2 | `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` for client auth | §2.2 | ⚠️ Authlete's, **not exercisable here** — F-3 |
| 3 | MUST contain `iss` | §3(1) | ✅ `mandatoryClaims` (`services/jwt-verification.service.ts:47`) |
| 4 | MUST contain `sub` | §3(2) | ✅ same, plus local re-check `:73-79` — verified live |
| 5 | MUST contain `aud`; MUST reject a JWT not audienced to this AS | §3(3) | ✅ Authlete's — verified live, `[A314314]` |
| 6 | MUST contain `exp`; MUST reject an expired JWT | §3(4) | ⚠️ **split**: expired → rejected, verified (`[A314309]`); **absent `exp` → not required** — F-1 |
| 7 | `nbf`, `iat`, `jti` are optional | §3(5)(6)(7) | ✅ correctly not required |
| 8 | MUST be signed or MAC'd; MUST reject an invalid signature | §3(9) | ✅ two ways, verified live (`alg:none` → `[A314310]`; wrong key → local `:51-57`) |
| 9 | A bad assertion → `invalid_grant` | §3.1 | ✅ verified live, five breaks all `invalid_grant` |
| 10 | If client credentials are present, the AS MUST validate them | §3.1 | ✅ Authlete's; and an unidentifiable client is refused with `invalid_request` `[A244305]`, verified |
| 11 | A bad client assertion → `invalid_client` | §3.2 | ✅ verified live, `[A157357]` |
| 12 | Replay prevention via `jti` | §3(7), §6 — **MAY** | ⊘ not implemented; correctly optional, and the tutorial says so |
| 13 | Clock skew allowance | §3(4) | ⚠️ `clockSkew` is a `JoseVerifyRequest` field and is never set — Authlete's default applies, value unknown (S4) |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Recognising the grant, checking claims and policy | Authlete | `token.process` → `JWT_BEARER`; bracketed `[A3143xx]` codes |
| **Which claims must be present** | **This server** | `mandatoryClaims` at `services/jwt-verification.service.ts:47` |
| Signature / MAC verification | Authlete, invoked by this server | `joseObject.joseVerifyApi` `:41-49` |
| Extracting `sub` | **This server** | `:59-79`, via a local `jwt.decode` |
| Minting the token | Authlete | `token.management.create` `:90` |
| §2.2 client authentication | Authlete, from the client's registered `tokenAuthMethod` | pinned per client — F-3 |

## Finding F-1 — `exp` is validated when present but is not required to be present (S3)

```ts
// server/src/services/jwt-verification.service.ts:43-48
joseVerifyRequest: {
  jose: assertion,
  clientIdentifier,
  signedByClient: true,
  mandatoryClaims: ["iss", "sub", "aud"],
}
```

RFC 7523 §3(4): *"The JWT MUST contain an 'exp' (expiration time) claim that limits the time window during
which the JWT can be used."* That is a requirement on the assertion's **content**, distinct from §3(4)'s
second sentence about rejecting one whose expiry has passed. The lab proves the second
(`[A314309] The 'exp' claim … failed to pass the validation`) and says nothing about the first, because
`mandatoryClaims` — the one lever this server holds over claim presence — omits `exp`.

**Two possibilities, and I have not distinguished them.** Either Authlete independently requires `exp` on a
`jwt-bearer` assertion, in which case adding it to `mandatoryClaims` is belt-and-braces; or it does not, in
which case an assertion with `iss`, `sub`, `aud`, a valid signature and **no expiry** mints an access token
from a credential that never expires. The second is the §3(4) violation and it is the reason this is S3 rather
than S4: a non-expiring bearer assertion is a long-lived credential by construction.

**Named next action, one command:** mint an assertion omitting `exp` entirely and post it to `/api/token` with
`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. `ISSUED A TOKEN` means the gap is real; an
`invalid_grant` naming `exp` means Authlete covers it. The lab already has the generator
(`/tmp/mkassert.mjs`) and the harness (`brk`) at `modules/06…/lab.md:326-341`, so this is a sixth row in an
existing table.

## Finding F-2 — two fields are assembled for the token-create call and silently discarded (S4)

```ts
// server/src/services/jwt-verification.service.ts:81-88
const createRequest = {
  grantType: "JWT_BEARER",
  subject,
  clientId: result.clientId,
  issuer,                                            // ← not a TokenCreateRequest field
  audience: Array.isArray(audience) ? audience : [audience],   // ← not a TokenCreateRequest field
  scopes: result.scopes,
};
```

Neither `issuer` nor `audience` survives. `TokenManagementService.create` reads a fixed set of keys
(`services/token.operations.service.ts:47-84`) and neither is among them; and even if it forwarded them,
`TokenCreateRequest` has no such members — **verified twice**, in the SDK model
(`models/tokencreaterequest.ts`, 23 fields) and in Authlete's own published spec for
`POST /api/{serviceId}/auth/token/create` (23 properties, vendored at `docs/openapi-spec.json`). So this is
not an SDK gap; the API has no audience field.

Why it is only S4, and why it still matters:

- **No wrong behaviour results.** The values are dropped, so nothing incorrect is stamped on the token. My first reading was that the assertion's `aud` — which per §3(3) is *the authorization server itself* — would become the issued token's audience, which would be a real defect. It does not; the code is inert, not wrong.
- **It reads as audience restriction and is not.** A maintainer looking for "does the JWT-bearer path audience-restrict its tokens?" finds `audience:` in the request literal and stops. The honest way to get an `aud` here is `resources` (which Authlete does map to `aud` — verified live in `modules/04…/lab.md:180-184`), and that is available on this very call.

## Finding F-3 — §2.2 client authentication cannot be exercised on this deployment (S3, configuration)

The live metadata advertises `client_secret_jwt` and `private_key_jwt`, and **no registered client is
configured for either**: the three clients are `NONE`, `CLIENT_SECRET_BASIC`, `NONE`, and none has `jwks` or
`jwksUri` (probe 2, §7). So §2.2 — half the specification — has no runnable path.

`modules/06…/lab.md:404-413` demonstrates precisely this, and correctly: sending a valid `client_assertion` to
a `client_secret_basic` client yields `invalid_client` `[A157357]`, and the lab draws the "advertised ≠
permitted" lesson, then says *"To exercise §2.2 for real, register a client with `private_key_jwt` and a JWKS.
That is Module 10's territory, where FAPI requires it."* That is an honest deferral — and Module 10's FAPI
material is itself blocked (`fapiModes` absent, `service.get()` throwing), so the deferral currently has
nowhere to land. Cross-referenced to B7 rather than counted twice.

The same missing client key material blocks asymmetric JAR (`RFC9101…` F-3) and FAPI 2.0. **One client with a
registered JWKS unblocks three specs**, which makes it the highest-leverage configuration change the audit has
found.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "Authlete Phase 1 validated JWT structure and claims (format, `iss`, `sub`, `aud`, `exp`)" | `JWT-BEARER-TUTORIAL.md:110` | True for `exp` **validity**; overstates it for `exp` **presence** — F-1 | **Accurate but imprecise** / S3 |
| Claim table: `aud` ✅ required, `exp` ✅ required, `jti` ❌ | `JWT-BEARER-TUTORIAL.md:137-146` | Matches §3, including the correct call that `jti` replay protection is not implemented (§3(7) is a MAY) | **Accurate** |
| "`aud` must include one of …" / "The JWT you create must have `aud: <this_issuer_value>`" | `JWT-BEARER-TUTORIAL.md:179,208` | Matches the live `[A314314]`, which accepts the issuer identifier **or** the token endpoint URL | **Accurate** |
| Five live break transcripts, all `invalid_grant` | `modules/06…/lab.md:346-352` | Reproduced; matches §3.1 | **Accurate** — the strongest evidence in this entry |
| Two-phase attribution table (bracketed code = Authlete claims; bare sentence = this repo's signature check) | `modules/06…/lab.md:369-376` | Matches `jwt-verification.service.ts:55,77` exactly | **Accurate** |
| "To exercise §2.2 for real, register a client with `private_key_jwt` and a JWKS. That is Module 10's territory" | `modules/06…/lab.md:412-413` | Honest, but Module 10's FAPI path is itself blocked | **Accurate**, dependency unstated / S3 |
| Nothing states that the JWT-bearer path cannot audience-restrict its tokens | all docs | F-2 | **Omission** / S4 |

## Sources consulted

- RFC 7523 §§2.1, 2.2, 3 (all ten numbered requirements), 3.1, 3.2, 6 and full ToC — `https://www.rfc-editor.org/rfc/rfc7523.txt`
- RFC 7521 §§4.1.1, 4.2.1, 5.2 — `https://www.rfc-editor.org/rfc/rfc7521.txt`
- SDK 1.0.0: `models/joseverifyrequest.ts` (incl. the unused `clockSkew`), `models/joseverifyresponse.ts`, `models/tokencreaterequest.ts`
- Vendored Authlete API spec: `docs/openapi-spec.json`, `POST /api/{serviceId}/auth/token/create` request schema — 23 properties, no audience field
- Live probe 2 (2026-08-10): `token_endpoint_auth_methods_supported`, per-client `tokenAuthMethod` / `jwksUri` — `SERVICE-CONFIG-PROBE.md` §6–§7
- Code: `services/jwt-verification.service.ts:22-107`, `services/token.operations.service.ts:47-84`, `controllers/token.controller.ts:73-80`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 7523-W1 | Establish whether an assertion with no `exp` is accepted | S | One request, added as a sixth row to the Exercise 4 table. If accepted, W2 follows. |
| 7523-W2 | Add `exp` to `mandatoryClaims` | S | `mandatoryClaims: ["iss","sub","aud","exp"]`; a unit test asserts the value sent to `joseVerifyApi`; the lab gains the transcript from W1. Conditional on W1. |
| 7523-W3 | Remove the inert `issuer` / `audience` fields | S | Either dropped, or replaced with `resources` so the JWT-bearer path really can audience-restrict — with a lab step showing `aud` in introspection, mirroring `modules/04…/lab.md` Exercise 4. |
| 7523-W4 | Register one client with `private_key_jwt` and a JWKS | S | Unblocks §2.2 here, asymmetric JAR (**9101-W3**) and the FAPI work in B7. **Highest-leverage single configuration change in the audit so far.** |
| 7523-W5 | Set `clockSkew` explicitly, or document the default | S | Whichever, the value stops being unknown. |

**Ordering and gating.** W1 gates W2. W3 touches `services/jwt-verification.service.ts`, which is **not** on
the `AGENTS.md` **Security-critical surfaces** list — but it decides what subject a token is minted for, so I
would treat it as if it were and plan first; W2 changes validation policy and definitely should be planned.
W4 is console configuration and should go first, since three other entries wait on it.
