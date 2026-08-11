# RFC 7522 — SAML 2.0 Profile for OAuth 2.0 Client Authentication and Authorization Grants

- **Verdict:** `DOC_ONLY`
- **Severity:** **S4**
- **Authlete version:** 3.0 — **no vendor surface** (no page in `llms.txt`, no SAML grant type in the SDK)
- **Repo docs under test:** `docs/curriculum/modules/06-machine-and-delegated-grants/README.md:403,407-408`, `docs/curriculum/SPEC-INVENTORY.md:144`

<thinking>
1. RFC MUSTs on the AS: the same §5.2 obligations RFC 7521 imposes, bound to SAML 2.0 —
   `urn:ietf:params:oauth:grant-type:saml2-bearer` as the grant type,
   `urn:ietf:params:oauth:client-assertion-type:saml2-bearer` for client authentication, a base64url-encoded
   SAML 2.0 Assertion, and validation of the SAML Subject/Conditions/AudienceRestriction plus the XML
   signature.
2. Authlete boundary: there is none. `GrantType` in SDK 1.0.0 has ten members and no SAML entry, the live
   service's `grant_types_supported` lists ten URNs with no `saml2-bearer`, and `llms.txt` has no SAML page.
   `01-spec-matrix.md` records that Authlete's token-exchange material names SAML validation as the AS's own
   responsibility — which for this deployment means "not available".
3. Code: zero. Grep for `saml` over `server/src` and `client/src` returns nothing.
4. Docs: Module 06 tabulates it and states plainly that it is not wired up, with a reason.
5. Delta: none between code and docs — the docs say it is absent and it is absent. The audit's own rule is
   what generates the work item: a Group B skip needs a decision record, and the material at
   `README.md:407-408` is a paragraph, not a record.
6. Nothing unresolved. The one judgement call is whether "not wired, taught from the spec" is acceptable for a
   Group B spec; I think yes, and the reasoning is below.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer` | §2.1 | ❌ absent — not an SDK `GrantType` member, not in the live `grant_types_supported` |
| 2 | Accept `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:saml2-bearer` | §2.2 | ❌ absent — not in the live `token_endpoint_auth_methods_supported` |
| 3 | Base64url-decode and parse the SAML 2.0 Assertion | §3 | ❌ absent |
| 4 | Validate Issuer, Subject, `AudienceRestriction` identifying this AS, `NotOnOrAfter`, and the XML signature | §3 | ❌ absent |
| 5 | `invalid_grant` / `invalid_client` on failure | §3.1, §3.2 (via RFC 7521 §4.1.1, §4.2.1) | ❌ absent |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| SAML assertion parsing and signature validation | **The AS** — Authlete provides nothing | not implemented |
| Grant-type enablement | Authlete service config | **no such grant type exists** in Authlete 3.0 / SDK 1.0.0 |
| Minting a token from a validated SAML subject | Authlete `token.management.create` would work | unused for this purpose |

This is the emptiest boundary in the audit and it is worth stating why that matters: RFC 7522 is not a
"configure a flag" spec. Because Authlete exposes no SAML grant type, an implementation here would mean
parsing and verifying signed XML in Node, then calling `token.management.create` with the resolved subject —
i.e. writing the security-critical half of a SAML relying party. That is a substantial piece of work whose
teaching value is largely covered by RFC 7523, which exercises the identical framework.

## Scope decision — document-only, and the reasoning is sound

`modules/06…/README.md:407-408` already states the position:

> RFC 7522 (SAML) is **not wired up in this repo** and no lab exercise claims to run it. It is here because
> the framework/binding split only makes sense once you see two bindings, and because SAML bridging is the
> [enterprise case].

I would reach the same conclusion, on three grounds:

1. **No vendor surface.** Unlike every other Group B spec, there is nothing to configure. The cost is a full SAML verifier, not a flag.
2. **The teaching goal is already met.** The framework/binding distinction is the lesson, and Module 06 demonstrates it live with the JWT binding — including the §2.1/§2.2 confusion, which is the part learners actually get wrong.
3. **Writing a second, unexercised client-authentication path is a security cost, not just an effort cost.** The same argument the mTLS decline makes (`RFC8705-mutual-tls.md`), and it applies more strongly here because the parser would be ours.

**What the position lacks is form, not substance.** The audit's own rule — *"'Skipped' with no artifact is not
an acceptable outcome. Every skip produces a documented decision record"* — is satisfied in spirit by that
paragraph but it is not a decision record: no date, no revisit trigger, no cost estimate, and it is buried in
a module README rather than being reachable from the decision-record index. Compare the mTLS record
(`modules/05…/README.md:367-401`), which has all four. That is the gap, and it is S4.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "not wired up in this repo and no lab exercise claims to run it" | `modules/06…/README.md:407-408` | Confirmed by grep | **Accurate** |
| "SAML 2.0 binding of that framework" / "No bridge from enterprise SAML into OAuth" | `modules/06…/README.md:403` | Accurate |  **Accurate** |
| `SPEC-INVENTORY.md:144` — "conceptual (not wired)" | `:144` | Accurate | **Accurate** |
| Title *"SAML 2.0 Profile for OAuth 2.0 Client Authentication and Authorization Grants"*, Published RFC, May 2015 | `SPEC-INVENTORY.md:144` | **Confirmed** against RFC 7521's normative-references entry for RFC 7522 fetched this session; the RFC 7522 document itself was **not fetched** | **Accurate**, one step removed — see below |
| Nothing states that Authlete has no SAML grant type at all | all docs | The absence is vendor-level, not a repo choice — that is the more useful fact | **Omission** / S4 |

## Sources consulted

- RFC 7521 §7 and its normative reference to RFC 7522 (title confirmation) — `https://www.rfc-editor.org/rfc/rfc7521.txt`
- **Not fetched:** the RFC 7522 document itself. The verdict is `DOC_ONLY` on the strength of the *absence* of any implementation, which is established from the SDK and the live service rather than from the RFC text. Marked here rather than papered over: if Phase 4 keeps this as a document-only decision, the record it produces must cite RFC 7522 directly.
- Live probe 2 (2026-08-10): `grant_types_supported`, `token_endpoint_auth_methods_supported` — `SERVICE-CONFIG-PROBE.md` §6
- SDK 1.0.0: `models/granttype.ts` (ten members, no SAML)
- Grep: `saml` — zero occurrences in `server/src` and `client/src`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 7522-W1 | Promote the paragraph into a real decision record | S | Dated; states that Authlete 3.0 exposes no SAML grant type so the cost is a full SAML verifier in Node; names a revisit trigger (an ecosystem requiring SAML bridging, or Authlete adding the grant type); links RFC 7522 fetched directly. Filed in `audit/05-decision-records.md` and cross-linked from Module 06. |
| 7522-W2 | State the vendor-level absence in Module 06 | S | One sentence distinguishing "this repo chose not to" from "Authlete does not offer it" — the latter is the real reason and the more instructive one. |
| 7522-W3 | Do not implement | — | Upheld. |

**Ordering.** Both items are documentation and neither depends on anything else in B5.
