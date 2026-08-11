# OAuth 2.0 Attestation-Based Client Authentication

- **Verdict:** `PARTIAL`
- **Severity:** **S3**
- **Status:** **Active Internet-Draft**, OAuth WG — `draft-ietf-oauth-attestation-based-client-auth`, revision **10**, latest revision **6 July 2026** — verified this session
- **Authlete version:** 3.0 — the SDK references the draft on `oauthClientAttestation` / `oauthClientAttestationPop`; **`llms.txt` has no page** (`00-inventory.md` §10: *"no page in `llms.txt`* … unverifiable against Authlete docs")
- **Repo docs under test:** `AGENTS.md` (mentions the headers in the PAR known-gap note), `docs/curriculum/SPEC-INVENTORY.md` (**no row**)

> **Batch note.** This was one of the eight specifications added to scope at Gate 0 and no earlier batch emitted an
> entry for it — it was mentioned in passing in three findings. Written now so the self-check holds.

<thinking>
1. AS-facing MUSTs (draft-10): exactly one `OAuth-Client-Attestation` header; all required claims present; `alg`
   registered, not `none`, acceptable; signature verifies against a trusted Client Attester key; `cnf` contains
   only public key material; freshness per policy; `client_id` matches `sub` if supplied; and for the PoP JWT —
   signature under the `cnf` key, `challenge` match if present, `aud` identifying the receiving server, plus
   replay checks. Metadata: `challenge_endpoint`,
   `client_attestation_signing_alg_values_supported`, `client_attestation_pop_signing_alg_values_supported`,
   `client_attestation_pop_methods_supported`. Auth method names: `attest_jwt_client_auth`,
   `attest_jwt_client_auth_dpop`.
2. Authlete boundary: all validation is Authlete's — the AS forwards two headers. And Authlete **advertises** the
   method: `attest_jwt_client_auth` is in the live `token_endpoint_auth_methods_supported`, and both
   `client_attestation_*_signing_alg_values_supported` lists are published.
3. Code: forwarded at the **token** and **revocation** endpoints; **not** at PAR, which is the gap `AGENTS.md`
   already records.
4. Docs: no `SPEC-INVENTORY.md` row at all; one passing mention in `AGENTS.md`'s PAR note.
5. Delta: the plumbing is two-thirds present, the method is advertised, no client uses it, and the specification
   has no inventory row despite being cited by the SDK the repo pins.
6. What needed checking rather than assuming: whether Authlete actually advertises the method (it does — that
   changes this from "unused vendor field" to "advertised capability"), and the draft's current revision.
</thinking>

## Normative requirements (AS side)

| # | Requirement (draft-10) | Status |
|---|---|---|
| 1 | Exactly one `OAuth-Client-Attestation` header | ⊘ Authlete's — the repo forwards `req.headers["oauth-client-attestation"]`, and Express collapses duplicates into a comma-joined string rather than rejecting them (F-2) |
| 2 | All required claims and header parameters present | ⊘ Authlete's |
| 3 | `alg` registered, **not `none`**, acceptable | ⊘ Authlete's; the advertised `client_attestation_signing_alg_values_supported` list contains no `none` (probe 2) ✅ |
| 4 | Signature verifies against a **trusted Client Attester** key | ⊘ Authlete's — and there is no configured attester on this service, which is what makes the method unusable (F-1) |
| 5 | `cnf` contains only public key material | ⊘ Authlete's |
| 6 | Freshness per local policy | ⊘ Authlete's |
| 7 | `client_id` matches `sub` when supplied | ⊘ Authlete's |
| 8 | PoP JWT: signature under the `cnf` key, `challenge` match, `aud` identifies the receiving server, replay checks | ⊘ Authlete's |
| 9 | Forward the two headers so Authlete can do 1–8 | ⚠️ **token ✅, revocation ✅, PAR ❌** — F-2 |
| 10 | Advertise `client_attestation_signing_alg_values_supported` and `..._pop_...` | ✅ both live (probe 2) |
| 11 | Advertise `challenge_endpoint` | ❓ **not established** — see Sources |
| 12 | Offer `attest_jwt_client_auth` as a token-endpoint auth method | ✅ **advertised** in the live `token_endpoint_auth_methods_supported` |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| All eight validation steps | Authlete | `attest_jwt_client_auth` client authentication |
| Forwarding `OAuth-Client-Attestation` | **This server** | `services/token.service.ts:86-89`; `services/revocation.service.ts:33-34,73-74` |
| Forwarding it at the PAR endpoint | **This server** | **not done** — `models/pushedauthorizationrequest.ts` has both fields; `services/par.service.ts` sets neither |
| Configuring a trusted Client Attester | Service configuration | none — F-1 |
| Registering a client for the method | Client configuration | none of the three |

## Finding F-1 — the method is advertised and no client can use it (S3)

Probe 2:

```
token_endpoint_auth_methods_supported = [ …, attest_jwt_client_auth, spiffe_jwt ]
client_attestation_signing_alg_values_supported     = 14 algorithms
client_attestation_pop_signing_alg_values_supported = 11 algorithms
```

So Authlete advertises attestation-based client authentication as an available method, with algorithm lists —
and the three registered clients use `NONE`, `CLIENT_SECRET_BASIC`, `NONE` (probe 2 §7). Nothing configures a
trusted Client Attester, so requirement 4 could not be satisfied even by a client that tried.

This is the **fourth** advertised-but-unusable client-authentication method on this service, alongside
`tls_client_auth`, `self_signed_tls_client_auth` (`RFC8705-mutual-tls.md` F-1) and `spiffe_jwt` — which is itself
the value that breaks `service.get()`. Of the nine methods advertised, **four cannot be used and one breaks the
SDK.** That reframes `RFC8705-…` F-1's work item: removing two methods from `supportedTokenAuthMethods` is really a
review of all nine.

Severity S3 rather than S2 because, unlike mTLS, nothing in the repo *claims* attestation-based auth works — there
is no tutorial, no SPA section, no inventory row. A client developer misled by the metadata is the only exposure,
and the draft is not yet an RFC.

## Finding F-2 — the headers are forwarded at two endpoints and not the third (S3)

| Endpoint | Attestation headers forwarded? |
|---|---|
| `POST /api/token` | ✅ `services/token.service.ts:86-89` |
| `POST /api/revocation` | ✅ `services/revocation.service.ts:33-34,73-74` |
| `POST /api/par` | ❌ — `PushedAuthorizationRequest` has `oauthClientAttestation` and `oauthClientAttestationPop`, and `par.service.ts` sets neither |

`AGENTS.md` already records this: *"**Known gap:** `clientCertificate`, `oauthClientAttestation` and
`oauthClientAttestationPop` are accepted by Authlete's `/pushed_auth_req` but not forwarded — no client here uses
them, so they are unverifiable end-to-end."* Accurate, and the reasoning ("no client uses them") is why it has
stayed open.

The consequence is specific: FAPI 2.0 requires PAR **and** client authentication at the PAR endpoint, so a client
authenticating by attestation cannot use PAR here at all — its credentials would be dropped and Authlete would
reject the request as unauthenticated. Recorded as `RFC9126-…` F-4; this entry supplies the reason it matters.

Second, smaller point on requirement 1: the draft requires *exactly one* `OAuth-Client-Attestation` header. Express
joins repeated headers with commas, so two headers arrive as one comma-joined string and are forwarded as such.
Authlete presumably rejects the malformed JWT, so this fails closed — but it fails as "malformed attestation"
rather than "more than one header", and the repo does the same thing correctly elsewhere: `utils/dpop.ts` handles
RFC 9449 §4.3's equivalent single-header rule explicitly.

## Finding F-3 — no inventory row, for a draft the pinned SDK cites (S3)

`docs/curriculum/SPEC-INVENTORY.md` has **no row** for this draft, and `00-inventory.md` §10 flagged it as one of
the specs added to scope at Gate 0 precisely because it is *"unverifiable against Authlete docs"* — no `llms.txt`
page exists.

Two reasons a row is warranted:

1. **The SDK the repo pins names the draft in its field documentation** (`models/tokenrequest.ts:113-120`, `models/pushedauthorizationrequest.ts`), so the specification is already a dependency of the codebase, not an aspiration.
2. **The method is advertised in this deployment's own metadata.** A row is how the repo records "advertised, unconfigured, unused" — the state its own Module 09a taxonomy calls *permitted but not configured*.

The row should be labelled **active Internet-Draft, revision 10, 6 July 2026** — and this is the third active
draft in the audit whose cited revision needs care (CIMD `-01` versus `-02`, Grant Management `-03`, this one with
no row at all). Same remedy: per-row provenance, as proposed in **FED-W4**.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "`clientCertificate`, `oauthClientAttestation` and `oauthClientAttestationPop` … not forwarded" at PAR | `AGENTS.md` | **Accurate**, including the reason it is unverifiable | **Accurate** |
| Headers forwarded at the token endpoint | `AGENTS.md` ("Client attestation headers"); `00-inventory.md` §6 | Confirmed at `token.service.ts:86-89` and, additionally, at `revocation.service.ts` | **Accurate** |
| **No `SPEC-INVENTORY.md` row** | — | F-3 | **Omission** / S3 |
| Nothing states that `attest_jwt_client_auth` is advertised | all docs | F-1 — and it makes this the fourth unusable advertised auth method | **Omission** / S3 |
| Nothing claims the feature works | `README.md`, `docs/` | Correct — no overclaim, which bounds the severity | **Accurate** |

## Sources consulted

- `draft-ietf-oauth-attestation-based-client-auth`, **revision 10**, latest revision **6 July 2026**, active OAuth WG Internet-Draft — `https://datatracker.ietf.org/doc/draft-ietf-oauth-attestation-based-client-auth/`, fetched this session. The two headers, the Client Attestation and PoP JWT claim sets, the eight AS validation MUSTs, the four metadata parameters, and both auth-method names (`attest_jwt_client_auth`, `attest_jwt_client_auth_dpop`) are taken from it.
- **Not established:** whether this deployment advertises `challenge_endpoint` or `client_attestation_pop_methods_supported`. Probes 2 and 3 printed a filtered selection of the 62 discovery members and neither name matched the filters used. The `challenge` claim is OPTIONAL in the PoP JWT, so its absence would not by itself break the method. **Named next action:** one read-only `service/configuration` call printing the full member list.
- Live probe 2 (2026-08-10): `token_endpoint_auth_methods_supported`, `client_attestation_signing_alg_values_supported`, `client_attestation_pop_signing_alg_values_supported`, per-client `tokenAuthMethod` — `SERVICE-CONFIG-PROBE.md` §6–§7
- SDK 1.0.0: `models/tokenrequest.ts:113-120`, `models/pushedauthorizationrequest.ts` (both cite the draft by URL)
- Code: `services/token.service.ts:86-89`, `services/revocation.service.ts:33-34,73-74`, `services/par.service.ts` (absence), `utils/dpop.ts` (the single-header pattern done correctly)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| ATT-W1 | Add a `SPEC-INVENTORY.md` row | S | Active Internet-Draft, revision **10**, 6 Jul 2026, labelled as a draft; notes that the SDK cites it and that the method is advertised but unconfigured. Batches with **CIMD-W1** and **HAIP-W2**. |
| ATT-W2 | Forward the attestation headers at PAR | S | `par.service.ts` sets `oauthClientAttestation` / `oauthClientAttestationPop` from HTTP context, never from the body. Closes **9126-W4**'s sibling gap and is a prerequisite for any FAPI 2.0 attestation client. |
| ATT-W3 | Review all nine advertised client-auth methods together | S | Rather than removing two (**8705-W1**), audit the whole `supportedTokenAuthMethods` list: four are unusable and one (`spiffe_jwt`) breaks `service.get()`. One console decision covers `RFC8705-…` F-1, this F-1, and the `SPIFFE_JWT` question. |
| ATT-W4 | Reject duplicate attestation headers explicitly | S | Match `utils/dpop.ts`'s handling of RFC 9449's single-header rule, so the failure says "more than one header" rather than "malformed JWT". |
| ATT-W5 | Establish the full discovery member list | S | One read-only probe printing all 62 members, settling `challenge_endpoint` and `client_attestation_pop_methods_supported` and closing the only unestablished fact in this entry. |

**Ordering.** ATT-W3 is the high-leverage item and should be taken as one decision at Gate 4 — it subsumes the
mTLS metadata fix and the `SPIFFE_JWT` question, both of which are currently scheduled separately. ATT-W2 touches
`services/par.service.ts`, which is on the `AGENTS.md` **Security-critical surfaces** list under Client
authentication, so it needs a plan.
