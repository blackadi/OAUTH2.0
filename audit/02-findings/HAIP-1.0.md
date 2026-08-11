# OpenID4VC High Assurance Interoperability Profile 1.0 (HAIP)

- **Verdict:** `OUT_OF_SCOPE` — decision record required at Gate 4
- **Severity:** **S4**
- **Status:** OpenID **Final**, **24 December 2025** — verified this session. `SPEC-INVENTORY.md` and `01-spec-matrix.md` §3 carry **no date** for this row; it can now be dated.
- **Authlete version:** 3.0 (`protocols-and-flows/compliance-profiles/haip-compliant-verifiable-credential-issuance`)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 (*"Decision record needed"*)

<thinking>
1. What it is: a profile constraining four specs — OID4VCI, OID4VP, SD-JWT VC and ISO mdoc — and, unlike OID4VP, it
   **does** place obligations on a credential issuer / authorization server. So "out of scope" here is a cost
   decision, not a structural fact. That distinction is the entry's main job.
2. The issuer-facing requirements: support the authorization code flow; support at least one of SD-JWT VC or ISO
   mdoc; **comply with the applicable provisions of the FAPI 2.0 Security Profile**; support RFC 8414 metadata;
   include a scope for every credential configuration in issuer metadata; expose a `nonce_endpoint` when key
   binding is used; indicate batch-issuance support; require client authentication at OAuth endpoints.
3. Authlete boundary: HAIP builds on the VCI configuration, which is disabled.
4. Delta: every one of those requirements is already independently unmet, and the FAPI 2.0 one is unmet seven ways.
   So HAIP is the second entry after Message Signing whose failure is entirely composed of other findings.
5. The recommendation is easy; what needs care is *why* — a chain of three blocked prerequisites, each of which
   would have to be fixed in order.
6. Also worth recording: the date, which the inventory lacks.
</thinking>

## Issuer-facing requirements versus this deployment

| # | HAIP requirement | Live state | Status |
|---|---|---|---|
| 1 | Wallet and Credential Issuer **MUST support the authorization code flow** | `AUTHORIZATION_CODE` enabled | ✅ |
| 2 | Support at least one of **SD-JWT VC** or **ISO mdoc** credential format profiles | no credential store, no format support; VCI disabled | ❌ |
| 3 | **Comply with the applicable provisions of the FAPI 2.0 Security Profile** | **one of eight** shall statements met (`FAPI-2.0-SECURITY-PROFILE.md`) | ❌ |
| 4 | The Authorization Server **MUST support metadata according to RFC 8414** | served at true root (`routes/oauth-as-metadata.routes.ts:9`) — but the issuer identifier does not resolve to it (B3) | ⚠️ |
| 5 | Issuer metadata **MUST include a scope for every Credential Configuration** | `credentialIssuerMetadata` absent; the endpoint cannot return a document (`OID4VCI-1.0.md` F-1) | ❌ |
| 6 | `nonce_endpoint` **MUST be present** when key binding is required | not implemented (`OID4VCI-1.0.md` F-3) | ❌ |
| 7 | **MUST** indicate batch-issuance support via `batch_credential_issuance` | no metadata document to indicate it in | ❌ |
| 8 | Issuers **MUST require** an OAuth 2.0 client authentication mechanism at OAuth endpoints | two of three clients are public with `tokenAuthMethod: NONE` | ❌ |

**One of eight met**, and requirement 3 alone imports FAPI 2.0's seven unmet shall statements.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| HAIP-conformant issuance | Authlete, building on the VCI configuration | `verifiableCredentialsEnabled = false` |
| FAPI 2.0 enforcement | Authlete, gated by `fapiModes` | absent |
| Credential formats (SD-JWT VC / mdoc) | Authlete + a credential dataset | neither configured |
| The `nonce_endpoint` | **This server** | not implemented |
| RFC 8414 metadata | Authlete | served, but not at the issuer identifier |

## Finding F-1 — HAIP is blocked behind a three-link chain, in order (S4)

This is the useful content of the row. HAIP cannot be reached until each of these is fixed, in sequence:

```
1. B3 issuer/host mismatch      →  the AS's metadata is not retrievable at its issuer identifier,
                                   so requirement 4 fails and OID4VCI's linkage cannot work
2. OID4VCI enabled + configured →  verifiableCredentialsEnabled, credentialIssuerMetadata,
                                   nonce_endpoint  (requirements 2, 5, 6, 7)
3. FAPI 2.0 Security Profile    →  one client with private_key_jwt + JWKS, PAR required,
                                   PKCE-S256 required, DPoP required, rotation disabled,
                                   PS256/ES256 only  (requirement 3, and requirement 8 with it)
```

Link 3 is the one that makes HAIP genuinely out of reach rather than merely distant: enabling FAPI 2.0 on this
service **breaks** the RFC 9700 rotation lesson and the retired-grant exercises
(`FAPI-2.0-SECURITY-PROFILE.md` FAPI2-W5). So HAIP is not blocked by effort alone — it is blocked by a curriculum
conflict that the repo has good reason not to resolve in HAIP's favour.

That is a materially better decision record than "requires a wallet."

## Finding F-2 — HAIP differs from OID4VP in a way the inventory does not capture (S4)

`01-spec-matrix.md` §3 lists both under Group C with "Decision record needed", which reads as one category. They
are not:

| | OID4VP | HAIP |
|---|---|---|
| Does an AS / credential issuer have obligations? | **No** — roles are Wallet and Verifier | **Yes** — eight issuer-facing requirements |
| Why is it out of scope? | **Structurally** — the roles do not apply | **On cost** — the requirements apply and are unmet |
| Could it be reached here? | Only by building a verifier | Yes in principle, blocked by F-1's chain |
| Revisit trigger | A wallet exists **and** VCI is enabled | Links 1–3 cleared, and the curriculum conflict resolved |

Two different rulings that happen to share an outcome. Recording the difference so the decision records do not
collapse into one.

## Scope recommendation — document-only, with the chain stated

Recommend `OUT_OF_SCOPE`:

1. **The prerequisite chain is three deep** and its last link conflicts with the curriculum's purpose (F-1).
2. **The wallet prerequisite still applies** — HAIP exists for interoperability between issuers, wallets and verifiers, and there is no wallet to interoperate with.
3. **The teaching value is largely inherited.** HAIP's substance for a learner is *"here is how a profile tightens several specs at once and why high-assurance ecosystems need that"* — which Module 10 already teaches with FAPI, the profile the repo can actually discuss against live configuration.
4. **The date should be recorded regardless.** An undated Group C row is the same defect class as the two undated logout rows this audit closed.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Row exists, "Builds on OID4VCI config", "Decision record needed" | `01-spec-matrix.md` §3 | Accurate | **Accurate** |
| **No date recorded** | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **Final, 24 December 2025** | **Omission** / S4 — now closable |
| Title given as "High Assurance Interoperability Profile" | `01-spec-matrix.md` §3 | The full title is *"OpenID4VC High Assurance Interoperability Profile 1.0"* — the `OpenID4VC` prefix and the version are part of it | `DOC_INCORRECT` / S4 |
| HAIP and OID4VP presented as one kind of Group C row | `01-spec-matrix.md` §3 | Different rulings — F-2 | **Incomplete** / S4 |
| Nothing claims HAIP is implemented | `README.md`, `docs/` | Correct | **Accurate** |

## Sources consulted

- OpenID4VC High Assurance Interoperability Profile 1.0 — `https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html`, fetched this session. **Title, Final status and date (24 December 2025) confirmed.** Quoted: the authorization-code-flow requirement, the SD-JWT VC / ISO mdoc format choice, *"comply with the provisions of FAPI2 Security Profile that are applicable"*, the RFC 8414 metadata requirement, *"The metadata MUST include a scope for every Credential Configuration"*, the `nonce_endpoint` condition, the `batch_credential_issuance` indication, and the client-authentication requirement.
- FAPI 2.0 Security Profile §5.3.2.1 — `https://openid.net/specs/fapi-security-profile-2_0-final.html`
- OID4VCI 1.0 §§7.2, 12.2.4 — `https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html`
- Live probes 1–3 (2026-08-10): `verifiableCredentialsEnabled`, `credentialIssuerMetadata`, `fapiModes`, `issuer` versus endpoint hosts, per-client `tokenAuthMethod` — `SERVICE-CONFIG-PROBE.md` §2–§10
- Cross-references: `OID4VCI-1.0.md`, `FAPI-2.0-SECURITY-PROFILE.md`, `OID4VP-1.0.md`, `DISCOVERY-rfc8414-oidc-discovery.md`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| HAIP-W1 | Write the decision record | S | Dated; states the three-link prerequisite chain, names the FAPI-2.0-versus-curriculum conflict as the binding constraint, and distinguishes this ruling from OID4VP's. Revisit trigger: links 1–2 cleared and a FAPI 2.0 service profile exists. |
| HAIP-W2 | Date and retitle the row | S | *"OpenID4VC High Assurance Interoperability Profile 1.0"*, OpenID Final, **24 Dec 2025** — closing the last undated Group C row. |
| HAIP-W3 | Distinguish the two Group C rulings | S | `01-spec-matrix.md` §3 marks OID4VP as structurally inapplicable and HAIP as cost-declined — F-2. |
| HAIP-W4 | No implementation | — | Correct. |

**Ordering.** All documentation. HAIP-W2 batches with the other citation fixes (`NSSO-W3`, `FED-W3`, `CIMD-W1`,
`FCL-W2`, `SM-W2`) as one `SPEC-INVENTORY.md` pass.
