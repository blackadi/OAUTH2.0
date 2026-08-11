# RFC 9207 — OAuth 2.0 Authorization Server Issuer Identification

- **Verdict:** `IMPLEMENTED_VERIFIED`
- **Severity:** **S3** (the AS half is correct; the finding is that its trust anchor and its client-side check are missing)
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/curriculum/modules/05-request-integrity-and-binding/lab.md` Exercise 3, `docs/curriculum/SPEC-INVENTORY.md:135`, `AGENTS.md` service-flag table

<thinking>
1. RFC MUSTs on the AS: §2 — *"In authorization responses to the client, including error responses, an
   authorization server supporting this specification MUST indicate its identity by including the iss
   parameter in the response."* §3 — advertise `authorization_response_iss_parameter_supported`. That is the
   whole AS obligation; §2.4's MUSTs bind the *client*.
2. Authlete boundary: entirely Authlete's. One flag, `issSuppressed`, whose default `false` means `iss` is
   emitted. The AS's only job is not to strip it — i.e. pass Authlete's `Location`/form content through.
3. Code: `authorization.controller.ts:38-42` redirects to `result.responseContent` verbatim for `LOCATION`,
   and `:44-49` sends it verbatim for `FORM`; `authorization-fail-response.handler.ts` does the same on the
   error path. Nothing anywhere parses or rewrites a redirect URL. So the parameter survives by construction.
   `iss` appears nowhere in `server/src` as a literal, which is the correct outcome, not a gap.
4. Docs: Module 05 Exercise 3 checks the advertised flag and the error-path `iss` in one transcript, quotes
   §2 and §2.4 correctly, and says explicitly that the client-side check is the missing control.
5. Delta: (1)↔(3) clean. The interesting delta is elsewhere: the advertised `issuer` is on a different host
   from every endpoint, and the repo's own OAuth client ignores `iss` entirely.
6. My first read of the probe was that `iss` would fail a conformant client's §2.4 comparison. That is wrong
   and worth writing down: the client compares against the issuer identifier *it obtained from this AS's
   metadata*, which is `https://blackadi.dev`, and that is what arrives. The comparison passes. What is broken
   is one layer down — whether that metadata is retrievable from the issuer at all (RFC 8414 §3, B3).
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Include `iss` in authorization responses | §2 | ✅ Authlete's; `issSuppressed = False` live; observed on success callbacks (`modules/05…/lab.md:130`) |
| 2 | Include `iss` in **error** responses too | §2 | ✅ **verified live** — `modules/05…/lab.md:417-425` fetches an error redirect and greps `iss=` out of it |
| 3 | Do not strip it on the way out | implicit | ✅ `authorization.controller.ts:38-42,44-49` forward `responseContent` verbatim |
| 4 | Advertise `authorization_response_iss_parameter_supported` | §3 | ✅ live value `true` (probe 2) |
| 5 | *(client)* Extract `iss`, URL-decode it, compare to the expected issuer, reject on mismatch | §2.4 | ❌ absent in this repo's own client — see F-1 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Emitting `iss` on success and on error | Authlete | `authorization.processRequest` / `authorization.fail` |
| The flag that could suppress it | Service config | `issSuppressed`, live `False` — matches `AGENTS.md`'s recommendation |
| Advertising support | Authlete | `service.getConfiguration` |
| Not mangling the redirect | **This server** | `authorization.controller.ts`, `authorization-fail-response.handler.ts` |
| Validating `iss` on receipt | **The client** | `client/src/pages/CallbackPage.tsx` — **not done** |

Nothing else. This is the shortest boundary in the audit, and the verdict is `IMPLEMENTED_VERIFIED` on the
strength of a reproducible transcript rather than on code inspection.

## Finding F-1 — the repo's own OAuth client ignores `iss` (S3)

`client/src/pages/CallbackPage.tsx:38-40` reads exactly three parameters:

```ts
const code = url.searchParams.get('code');
const stateParam = url.searchParams.get('state');
const errorParam = url.searchParams.get('error');
```

No `iss`. RFC 9207 §2.4 is a client-side MUST — *"If the value does not match the expected issuer identifier,
clients MUST reject the authorization response and MUST NOT proceed with the authorization grant"* — and the
SPA is a real OAuth client, the one every lab drives.

`modules/05…/lab.md:427-431` states this itself: *"The AS side is done for you. The control is the client
checking it … nothing in this repo's flow would break if you deleted it — which is precisely why it gets
forgotten."* The curriculum is honest, so this is `CODE_ONLY`-inverted rather than `DOC_INCORRECT`: the gap is
documented, named, and left open.

**Why S3 and not S2.** The mix-up attack RFC 9207 defends against needs a client talking to more than one AS.
This SPA talks to one, configured at build time (`client/src/config.ts`), so the missing check does not make
*this* deployment exploitable. It does mean the repo teaches a defence it does not itself deploy, in a
codebase learners read as a reference client.

## Finding F-2 — the mechanism is intact; its trust anchor is not (S3, cross-reference)

Probe 2:

```
issuer                 = https://blackadi.dev
authorization_endpoint = https://cecile-soapsudsy-zoila.ngrok-free.dev/api/authorization
```

**Getting this right matters, because the obvious reading is wrong.** A conformant client performs §2.4's
comparison against the issuer identifier it learned from this AS's metadata, which is `https://blackadi.dev` —
and `iss=https%3A%2F%2Fblackadi.dev` is what arrives. The comparison **passes**. RFC 9207 is not broken by the
host mismatch.

What the mismatch breaks is the layer §2.4 rests on. RFC 8414 §3 ties an issuer identifier to a metadata
document retrievable at that issuer's well-known URI; the B3 finding
(`DISCOVERY-rfc8414-oidc-discovery.md`, and `SPEC-INVENTORY.md:114-127`) records that this deployment serves
its metadata only at `/api/.well-known/openid-configuration` on the tunnel host, so nothing is retrievable at
`https://blackadi.dev/.well-known/…`. A client therefore has no authenticated way to learn that
`https://blackadi.dev` is this AS's identifier in the first place. `iss` still identifies *an* issuer; it just
identifies one whose metadata cannot be found.

**Consequence for the curriculum, which is the real finding.** Module 05 Exercise 3 teaches "check `iss`
against the expected issuer" and elides how the client is supposed to *know* the expected issuer. On this
deployment that question has no good answer. One added sentence — the expected issuer comes from the metadata
document at the issuer's own well-known URI, which is why RFC 8414 §3 correspondence is a precondition for
RFC 9207 and not a separate tidiness rule — turns two findings into one lesson.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| RFC 9207 §2 requires `iss` in authorization responses "including error responses" | `modules/05…/lab.md:407-408` | Quoted correctly against the RFC text fetched this session | **Accurate** |
| §2.4 quoted: clients MUST reject on mismatch | `modules/05…/lab.md:428-430` | Quoted correctly | **Accurate** |
| `authorization_response_iss_parameter_supported = true` | `modules/05…/lab.md:421` | Confirmed live | **Accurate** |
| "The AS side is done for you… nothing in this repo's flow would break if you deleted it" | `modules/05…/lab.md:427-431` | Confirmed — `CallbackPage.tsx` never reads `iss` | **Accurate** |
| `issSuppressed: false` — "Include `iss` response param for mix-up attack prevention (RFC 9207)" | `AGENTS.md` flags table | Live value `False`; behaviour confirmed | **Accurate** |
| `SPEC-INVENTORY.md:135` — "Authlete `issSuppressed=false` (`AGENTS.md`)" | `:135` | Accurate, and now confirmed against the service rather than against `AGENTS.md` | **Accurate** |
| Nothing anywhere says where a client gets the expected issuer, on a deployment where it cannot get it | Module 05 | See F-2 | **Omission** / S3 |

## Sources consulted

- RFC 9207 §§2, 2.4, 3 and full ToC — `https://www.rfc-editor.org/rfc/rfc9207.txt`
- JARM §2.1 (`iss` as a JWT claim, the alternative mechanism) — `https://openid.net/specs/oauth-v2-jarm.html`
- Live probe 2 (2026-08-10): `issuer`, `authorization_response_iss_parameter_supported`, `issSuppressed` — `SERVICE-CONFIG-PROBE.md` §5–§6
- Code: `controllers/authorization.controller.ts:38-42,44-49`, `controllers/authorization-fail-response.handler.ts`, `client/src/pages/CallbackPage.tsx:38-40`
- Grep: `iss` as an authorization-response parameter appears nowhere in `server/src` (correct — Authlete emits it)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9207-W1 | Validate `iss` in `CallbackPage.tsx` | S | The callback compares `iss` against the configured issuer and refuses to exchange the code on mismatch; a client test covers match, mismatch and absent. Module 05's "nothing would break if you deleted it" is replaced by "here is the check, and here is it rejecting a forged `iss`". |
| 9207-W2 | Add one paragraph on where the expected issuer comes from | S | Module 05 Exercise 3 names RFC 8414 §3 correspondence as RFC 9207's precondition and points at the B3 finding. |
| 9207-W3 | No change to the AS-side path | — | Correct as delegated; `issSuppressed` stays `false`. Recording that is the finding. |

**Dependency.** 9207-W2 is worth writing only alongside the B3 remediation for the issuer/well-known
mismatch — on its own it documents a defect rather than closing one. Neither work item touches a file on the
**Security-critical surfaces** list.
