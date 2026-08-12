# RFC 7521 — Assertion Framework for OAuth 2.0 Client Authentication and Authorization Grants

- **Verdict:** `IMPLEMENTED_VERIFIED` *(as a framework — realised through RFC 7523 and verified live there)*
- **Severity:** **S4**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/curriculum/modules/06-machine-and-delegated-grants/README.md:7,403-408`, `…/lab.md:384-414`, `docs/curriculum/SPEC-INVENTORY.md:143`

<thinking>
1. RFC MUSTs on the AS: §4.1 accept `assertion` as an authorization grant and §4.1.1 answer a bad one with
   `invalid_grant`; §4.2 accept `client_assertion` + `client_assertion_type` for client authentication and
   §4.2.1 answer a bad one with `invalid_client`; §5.2 enforce issuer, subject, audience-identifies-this-AS,
   an expiry, and signature/MAC validity. §7 says outright that the framework alone *"is not sufficient to
   produce interoperable implementations"* — a profile is required.
2. Authlete boundary: all of it, and it is only reachable through a profile. There is no
   "RFC 7521 endpoint": `assertion` rides in the token request's `parameters`, and `client_assertion` is part
   of client authentication, which Authlete performs from `parameters` plus the client's registered method.
3. Code: `assertion` is read once, from Authlete's response, at `services/jwt-verification.service.ts:22` —
   never parsed out of the request by hand. `client_assertion` / `client_assertion_type` appear **nowhere** in
   `server/src` (grep, `00-inventory.md` §6). Both are correct: opaque passthrough is the right architecture.
4. Docs: Module 06 frames the framework/binding split correctly and — unusually — tests the confusion between
   the two bindings live at `lab.md:384-414`.
5. Delta: none I can find at the framework level. The §5.2 rules are enforced, but by RFC 7523's
   implementation of them, which is where I evaluate them.
6. Is `IMPLEMENTED_VERIFIED` even a meaningful verdict for an abstract framework? Stated below rather than
   fudged: the framework's obligations are all discharged, every one through the JWT profile, and §7 says that
   is the only way they can be. A separate `CODE_ONLY`/`ABSENT` verdict would misdescribe the architecture.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `assertion` as an authorization grant | §4.1 | ✅ via RFC 7523 §2.1 — `TokenResponseAction.JWT_BEARER`, verified live (`modules/06…/lab.md:334-350`) |
| 2 | A failed assertion grant → `invalid_grant` | §4.1.1 | ✅ **verified live, five ways** (`modules/06…/lab.md:346-352`) |
| 3 | Accept `client_assertion` + `client_assertion_type` | §4.2 | ⊘ Authlete's, inside `parameters`; reachable only for a client registered with `client_secret_jwt` / `private_key_jwt` — **no such client exists here**, see RFC 7523 F-3 |
| 4 | A failed client assertion → `invalid_client` | §4.2.1 | ✅ **verified live** — `[A157357]` with `error: invalid_client` (`modules/06…/lab.md:404-409`) |
| 5 | Assertion contains an Issuer | §5.2 | ✅ `mandatoryClaims: ["iss", …]` (`services/jwt-verification.service.ts:47`) |
| 6 | Assertion contains a Subject | §5.2 | ✅ same, plus a local re-check at `:73-79` |
| 7 | Audience identifies **this** AS; reject otherwise | §5.2, §8 | ✅ Authlete's — verified live, `[A314314]` (`modules/06…/lab.md:349`) |
| 8 | Contains an Expires At; reject expired | §5.2, §8 | ⚠️ expiry **is** enforced (`[A314309]`, verified) but *presence* is not required — see RFC 7523 F-1 |
| 9 | Reject an invalid signature or MAC | §5.2 | ✅ verified live, two ways (`alg:none` → `[A314310]`; wrong key → local rejection) |
| 10 | A profile is required for interoperability | §7 | ✅ correct by construction — the only implementation here is the JWT profile |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Recognising the assertion grant type | Authlete | `token.process` → `JWT_BEARER` action |
| Transporting `assertion` / `client_assertion` | Opaque passthrough | inside `parameters` — `services/token.service.ts:42` |
| §5.2 content rules | Authlete, then a second local pass | `joseObject.joseVerifyApi` (`services/jwt-verification.service.ts:41-49`) |
| Minting the resulting token | **This server**, via `token.management.create` | `services/jwt-verification.service.ts:90` |
| Which binding a given client may use | Client configuration | `tokenAuthMethod` — pinned per client |

**The two-phase shape is worth recording** because it is the repo's own discovery and it is correct:
Authlete validates the assertion's *claims and policy* (bracketed error codes), then this server verifies the
*signature* through `joseVerifyApi` and re-checks `sub` (plain-sentence errors). `modules/06…/lab.md:363-382`
tabulates which break produces which shape and uses it as a diagnostic. That table is accurate against the
code at `services/jwt-verification.service.ts:51-79`.

## Finding F-1 — nothing implements RFC 7521 independently, and that is correct (S4)

Recorded so the audit cannot be read as having skipped the row. `client_assertion` and
`client_assertion_type` are absent from `server/src` entirely; `assertion` appears only as a field Authlete
hands back. There is no framework-level code to audit because §7 forecloses it: *"As an abstract
framework … this specification is not sufficient to produce interoperable implementations."* The
conformance question is entirely RFC 7523's, and it is answered there.

One consequence for the curriculum, which Module 06 already gets right: the framework's §5.2 rules are the
*reason* RFC 7523 §3's numbered MUSTs look the way they do. `modules/06…/README.md:7` sets that up, and
`README.md:403` tabulates 7521/7522/7523 as framework-plus-two-bindings. That is the correct pedagogical
order and matches §7.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| 7521/7522/7523 as framework + two bindings | `modules/06…/README.md:403-408` | Matches §7 | **Accurate** |
| The §2.1 vs §2.2 confusion demonstrated live, ending in `invalid_client` | `modules/06…/lab.md:384-414` | Reproduced; `invalid_client` is §4.2.1's required code | **Accurate** |
| "Your service metadata advertises `client_secret_jwt` and `private_key_jwt` … that is what the *service* supports, not what *this client* is permitted to use" | `modules/06…/lab.md:410-413` | Correct, and the live metadata list is longer than the sentence implies — it also offers `tls_client_auth`, `self_signed_tls_client_auth` and `spiffe_jwt` | **Accurate but incomplete** / S4 — the "advertised ≠ permitted" lesson here is the same one RFC 8705 F-1 needs |
| Every JWT failure is `invalid_grant`; client-identification failure is `invalid_request` | `modules/06…/lab.md:355-361` | Matches §4.1.1 and RFC 6749 §5.2 | **Accurate** |
| `SPEC-INVENTORY.md:143` — "conceptual; underpins RFC 7523 usage" | `:143` | Accurate | **Accurate** |

## Sources consulted

- RFC 7521 §§4.1, 4.1.1, 4.2, 4.2.1, 5.1, 5.2, 7, 8 and full ToC — `https://www.rfc-editor.org/rfc/rfc7521.txt`
- RFC 7523 §§2.1, 2.2, 3, 3.1, 3.2 — `https://www.rfc-editor.org/rfc/rfc7523.txt`
- SDK 1.0.0: `models/joseverifyrequest.ts`, `models/joseverifyresponse.ts`, `models/tokenresponse.ts:262`
- Code: `services/jwt-verification.service.ts:22,41-49,51-79`, `services/token.service.ts:42`
- Grep: `client_assertion`, `client_assertion_type` — zero occurrences in `server/src` (`00-inventory.md` §6)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 7521-W1 | No code change | — | The framework is correctly realised through its JWT binding. Recording that is the finding. |
| 7521-W2 | Complete the "advertised ≠ permitted" list in Module 06 | S | The sentence at `lab.md:410` names the full live `token_endpoint_auth_methods_supported`, which sets up **8705-W3** rather than duplicating it. |

**Ordering.** 7521-W2 is one sentence and pairs with 8705-W3; neither touches code.
