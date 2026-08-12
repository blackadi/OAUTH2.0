# RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens

- **Verdict:** `OUT_OF_SCOPE` (inherited decline, upheld) **+ `MISCONFIGURED`** for the advertised metadata
- **Severity:** **S2** (the metadata finding; the decline itself is sound)
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/curriculum/modules/05-request-integrity-and-binding/README.md:367-425` (the decision record), `docs/curriculum/SPEC-INVENTORY.md:136,246`, `docs/curriculum/modules/10-fapi-and-grant-management/`

<thinking>
1. RFC MUSTs on the AS: §2.1/§2.2 the two client-auth methods and the client metadata that pins the expected
   certificate (`tls_client_auth_subject_dn` or one of the four SAN variants; `jwks`/`jwks_uri` with `x5c` for
   the self-signed method); §3.1 bind the token with `cnf` `x5t#S256`; §3.2 the protected resource MUST obtain
   the certificate from its TLS layer and match it, rejecting with 401 `invalid_token` on mismatch; §3.3
   convey the binding in introspection; §5 `mtls_endpoint_aliases`; §3.3/§3.4 the
   `tls_client_certificate_bound_access_tokens` metadata on both sides. §6.5 says explicitly that conveying
   the certificate across a TLS-terminating intermediary is **out of scope of RFC 8705**.
2. Authlete boundary: Authlete does the matching and the binding; the AS's only jobs are to obtain the
   certificate and pass `clientCertificate` / `clientCertificatePath` on the token, PAR and introspection
   calls. All three SDK request models carry those fields.
3. Code: nothing populated. `clientCertificate` appears in `server/src` only in comments
   (`introspection.service.ts:20`, `userinfo.service.ts:61`) and in an exclusion list
   (`revocation.service.ts:46-47`). `IntrospectionResponse.certificateThumbprint` — the field that would carry
   §3.3's value — is never read.
4. Docs: the decision record is thorough and, contrary to what `01-spec-matrix.md` §5.3 suspected, it does
   name header forwarding as the condition that would change the answer. Its one-line summary overstates the
   case, and it cites two vendor headers where a published RFC standardises the hop.
5. Delta: the code↔spec delta is a deliberate, documented decline — fine. The live delta nobody recorded is
   between the **decline** and the **advertised metadata**: the AS offers `tls_client_auth` and
   `self_signed_tls_client_auth` in `token_endpoint_auth_methods_supported` on a deployment where a
   certificate can never arrive.
6. Is RFC 9440 Standards Track? It matters for how the decision record should cite it. Fetched: RFC 9440
   is **Informational**, July 2023. So it is the right pointer but not a normative one, and the record's
   phrasing should reflect that.
</thinking>

## Scope decision — the decline is upheld

Per the Gate 0 ruling, Group C inherits the mTLS decline (`modules/05…/README.md:367`, 2026-07-28). Having
now read the full record, I would reach the same conclusion on the same evidence:

- `server/src/server.ts` calls `app.listen` — the process speaks HTTP and holds no TLS context.
- The platform (`render.yaml`, `type: web`) and the dev tunnel both terminate TLS upstream.
- **RFC 8705 §6.5 agrees that this is outside its scope:** *"An authorization server or resource server MAY choose to terminate TLS connections at a load balancer, reverse proxy, or other network intermediary. How the client certificate metadata is securely communicated between the intermediary and the application server, in this case, is out of scope of this specification."* The RFC itself declines to specify the missing piece.
- The record correctly notes the plumbing was never the obstacle (`:382-386`), which is the honest version — the SDK accepts `clientCertificate` on all three relevant request types.
- DPoP is implemented and verified here and teaches the same sender-constraining idea, so the marginal teaching value of a dev-only mTLS path is low.

**This resolves `01-spec-matrix.md` §5.3, and mostly in the decision record's favour.** §5.3 suspected the
stated rationale was factually wrong because RFC 9440 exists to carry a certificate across exactly that hop.
The full record already names that route — *"an ALB or nginx passing `x-amzn-mtls-clientcert` /
`X-Client-Cert`, or Render gaining the feature"* (`:393-395`) — as a revisit trigger. So the reasoning is
intact; only its one-line summary and its citations need work (F-2).

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Support `tls_client_auth` with one of the five expected-certificate metadata fields | §2.1.1–2.1.2 | ⊘ Authlete's; **advertised but unusable** — F-1. `tlsClientAuthSubjectDn` absent on all clients |
| 2 | Support `self_signed_tls_client_auth` via `jwks`/`jwks_uri` with `x5c` | §2.2.1–2.2.2 | ⊘ Authlete's; advertised but unusable — F-1. No client has `jwks`/`jwksUri` |
| 3 | Bind tokens with `cnf` `{"x5t#S256": …}` | §3.1 | ⊘ Authlete's; `tlsClientCertificateBoundAccessTokens = False` service-wide and per client |
| 4 | A protected resource MUST obtain the certificate from its TLS layer and match it; mismatch → 401 `invalid_token` | §3.2 | ❌ **impossible in this deployment** — no TLS context. Basis of the decline |
| 5 | Convey the binding in the introspection response | §3.3 | ❌ `IntrospectionResponse.certificateThumbprint` exists in the SDK and is never read — F-3 |
| 6 | Advertise `tls_client_certificate_bound_access_tokens` | §3.3 | ✅ present, live value `false` — honest |
| 7 | Client metadata `tls_client_certificate_bound_access_tokens` | §3.4 | ✅ settable (`client.management.service.ts:426`), `False` on all three |
| 8 | Offer `mtls_endpoint_aliases` where mTLS and conventional clients coexist | §5 | ❌ absent live — and its absence is what makes F-1 sharp |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Certificate → client matching, `x5t#S256` binding | Authlete | `token.process`, `pushedAuthorization.create`, `introspection.process` |
| Obtaining the certificate from the TLS layer | **This server** | impossible — TLS terminates upstream |
| Passing `clientCertificate` / `clientCertificatePath` | **This server** | never populated |
| Surfacing `cnf["x5t#S256"]` to a resource server | **This server** | `IntrospectionResponse.certificateThumbprint`, unread |
| Advertising the methods | Authlete, from `supportedTokenAuthMethods` | **the finding** — F-1 |

## Finding F-1 — the AS advertises two client-authentication methods it can never honour (S2)

Probe 2, from the live discovery document:

```
token_endpoint_auth_methods_supported = [ none, client_secret_basic, client_secret_post,
    client_secret_jwt, private_key_jwt, tls_client_auth, self_signed_tls_client_auth,
    attest_jwt_client_auth, spiffe_jwt ]
tls_client_certificate_bound_access_tokens = false
mtls_endpoint_aliases                      = <ABSENT>
```

A client that discovers this AS, sees `tls_client_auth` offered, and registers with it — via DCR
(`POST /api/client/dcr/register`) or the console — becomes permanently unable to authenticate. No certificate
can reach the process, so every token request from that client fails, and the AS's own metadata told it to try.

**§5 exists for exactly this situation and is unused.** RFC 8705 §5: *"Authorization servers supporting both
clients using mutual TLS and conventional clients MAY chose to isolate the server side mutual-TLS behavior to
only clients intending to do mutual TLS."* The conventional way to advertise mTLS support without inflicting
it on everyone is `mtls_endpoint_aliases`. This deployment does the opposite: it advertises the methods
globally and provides no mTLS endpoints at all.

**Failure scenario, and why it is S2 rather than S3.** Module 07 teaches learners to audit a deployment by
triangulating advertised metadata against stored configuration against observed behaviour. Run that method
here and the advertised metadata claims two sender-constrained client-authentication methods that the stored
configuration cannot support and observed behaviour will never produce. A learner following the repo's own
audit method records mTLS client auth as available. A client developer acting on it ships a client that cannot
get a token.

**One caution before remediating.** The fix is to remove `TLS_CLIENT_AUTH` and `SELF_SIGNED_TLS_CLIENT_AUTH`
from the service's `supportedTokenAuthMethods` — **the same field that carries `SPIFFE_JWT`**, whose presence
is what breaks `authleteApi.service.get()` and therefore both FAPI reporting endpoints. Editing that field to
fix F-1 is one console action away from also retiring Module 10 Exercise 4, which teaches the
200-with-a-stack-trace as a finding (`AGENTS.md`, Deliberate defects). Sequence the two deliberately at Gate 4;
do not let one arrive as a side effect of the other.

## Finding F-2 — the decision record's one-line rationale overstates, and cites vendor headers rather than the RFC (S3)

`modules/05…/README.md:373-374`:

> **Why not, in one line: TLS is terminated before the request reaches this server, in every deployment of
> this repo, so a client certificate can never arrive.**

The first clause is true. The conclusion — *can never arrive* — is not: a TLS-terminating proxy can forward
the certificate in a header, which is what the record's own revisit triggers describe 20 lines later. As a
one-line summary in a teaching repo it leaves a learner believing TLS termination is an absolute bar on mTLS,
when it is a bar on *this* deployment as currently fronted.

The precise citation the record is missing:

- **RFC 9440, "Client-Cert HTTP Header Field", July 2023, Informational.** Defines `Client-Cert` and `Client-Cert-Chain` so that *"a TTRP and backend or origin server … function together as though, from the client's perspective, they are a single logical server-side deployment of HTTPS over a mutually authenticated TLS connection."* It references RFC 8705 directly: *"some applications, such as that described in [RFC8705], make use of the entire certificate."*
- Its security considerations are the reason a repo like this should cite it rather than a vendor header: *"A TTRP MUST sanitize the incoming request before forwarding it on by removing or overwriting any existing instances of the fields. Otherwise, arbitrary clients can control the field values as seen and used by the backend server"* — and *"neglecting to prevent field injection does not 'fail safe'."* A `Client-Cert` header that the proxy fails to strip is a complete client-authentication bypass. That is a better lesson than either of the vendor spellings currently cited.

Note the status: RFC 9440 is **Informational**, not Standards Track, and RFC 8705 §6.5 leaves the hop
unspecified. So the record should present it as the interoperable convention plus its injection hazard — not
as a normative requirement. Labelled precisely, this makes the decline *stronger*: the mechanism exists, it is
non-normative, and getting it wrong is a bypass rather than an outage.

## Finding F-3 — `certificateThumbprint` is never read (S4)

`IntrospectionResponse.certificateThumbprint` (SDK `models/introspectionresponse.ts:122-126`, *"The client
certificate thumbprint used to validate the access token"*) is RFC 8705 §3.3's `cnf["x5t#S256"]` on the
Authlete side. Grep over `server/src`: zero reads. Consistent with the decline and correct today; recorded
because it is the field the revisit scope (`README.md:399-401`) already names, and because it sits next to the
gap that matters more — the same response object has **no** DPoP `jkt` member, which is why RFC 9449 §7.2
cannot be enforced locally (RFC 9449 F-2).

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Decline, with evidence, revisit triggers, and a costed scope | `modules/05…/README.md:367-401` | Sound; the best-argued decision record in the repo | **Accurate** |
| "a client certificate can never arrive" | `README.md:373-374` | Overstated — see F-2 | `DOC_INCORRECT` / S3 |
| Revisit triggers name `x-amzn-mtls-clientcert` / `X-Client-Cert` | `README.md:393-395` | Correct mechanism, non-standard spellings; RFC 9440 unnamed | **Incomplete** / S3 |
| "the SDK is fine… the pass-through would have been mechanical. An earlier draft implied the plumbing was the hard part; that was wrong" | `README.md:382-386` | Confirmed against the SDK | **Accurate**, and unusually candid |
| `SPEC-INVENTORY.md:136` — "**THIN** — only registration flags today" | `:136` | Accurate | **Accurate** |
| `SPEC-INVENTORY.md:246` — declined; "Taught from the spec in Modules 05/10, labelled not-run-here" | `:246` | Accurate | **Accurate** |
| Nothing anywhere notes that the AS advertises `tls_client_auth` | all docs | See F-1 | **Omission** / **S2** |
| Revisit scope names `mtls_endpoint_aliases` in discovery | `README.md:400` | Correct — and its absence today is half of F-1 | **Accurate** |

## Sources consulted

- RFC 8705 §§2.1.1, 2.1.2, 2.2.1, 2.2.2, 3.1, 3.2, 3.3, 3.4, 5, 6.5 — `https://www.rfc-editor.org/rfc/rfc8705.txt`
- RFC 9440 — title, status (Informational), July 2023, purpose, RFC 8705 reference, sanitisation requirement — `https://www.rfc-editor.org/rfc/rfc9440.html`
- Live probe 2 (2026-08-10): `token_endpoint_auth_methods_supported`, `tls_client_certificate_bound_access_tokens`, `mtls_endpoint_aliases`, per-client `tlsClientCertificateBoundAccessTokens` / `tlsClientAuthSubjectDn` — `SERVICE-CONFIG-PROBE.md` §6–§7
- SDK 1.0.0: `models/introspectionresponse.ts:122-126`, `models/tokenrequest.ts:51-57`, `models/pushedauthorizationrequest.ts`
- Code: `services/revocation.service.ts:46-47`, `services/introspection.service.ts:20`, `services/userinfo.service.ts:61`, `services/client.management.service.ts:426`, `server/src/server.ts`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 8705-W1 | Stop advertising mTLS client authentication | S | `TLS_CLIENT_AUTH` and `SELF_SIGNED_TLS_CLIENT_AUTH` removed from the service's `supportedTokenAuthMethods`, so `token_endpoint_auth_methods_supported` no longer offers them. **Console change, no code.** Coordinate with the `SPIFFE_JWT` decision — same field, and removing that one retires Module 10 Ex 4. |
| 8705-W2 | Fix the decision record's rationale and citations | S | The one-liner reads "…so a client certificate cannot arrive **in this deployment's current fronting**"; RFC 9440 cited with its exact title, July 2023, **Informational**; the sanitisation hazard quoted; RFC 8705 §6.5 cited as the reason the hop is unspecified. |
| 8705-W3 | Add the "advertised but unusable" case to Module 07's audit material | S | The metadata-vs-capability mismatch appears as a worked example alongside the existing "supported but not required" and "permitted but not configured" states from Module 09a. |
| 8705-W4 | Keep the decline | — | Upheld on this evidence. Revisit triggers unchanged apart from W2's wording. |

**Note.** No `server/src` change is proposed. W1 is service configuration and W2/W3 are documentation, which is
the correct shape for an upheld `OUT_OF_SCOPE` verdict: the gap to close is the claim, not the capability.
