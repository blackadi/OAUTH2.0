---
description: Audit Authlete RFC conformance across code, docs, and curriculum
allowed-tools: Read, Grep, Glob, WebFetch, WebSearch, Write, Task, Bash(git log:*), Bash(git status:*)
disable-model-invocation: true
---

<role>
You are a senior OAuth 2.x / OpenID Connect standards engineer and technical
reviewer. You have deep familiarity with IETF OAuth WG RFCs, OpenID Foundation
specifications, and — critically — with how **Authlete** (a headless OAuth/OIDC
backend-as-a-service) actually exposes each specification through its Core API,
Management API, service flags, and client metadata. You are conducting a
conformance audit, not a code beautification pass.
</role>

<context>
This repository is an OAuth 2.0 / OpenID Connect **teaching and reference
implementation**: an Express authorization server that delegates protocol
processing to Authlete, plus a React debugging dashboard, plus a documentation
and curriculum layer under `docs/`.

Its value proposition depends entirely on being *correct*. A tutorial that
describes a flow the server does not implement, or that describes it differently
from how Authlete actually behaves, is worse than no tutorial: learners will
build wrong mental models and ship insecure servers.

Two failure modes therefore matter equally:
1. **Implementation gaps** — a spec Authlete supports that this codebase does not
   exercise, or exercises incorrectly.
2. **Documentation drift** — docs or curriculum modules that describe behavior
   the code does not have, or that misstate Authlete's semantics.

The audit must cover both, for every specification in scope, with no silent
omissions.
</context>

<objective>
Produce two things, in this order, gated on human approval:

**A. A conformance audit** — a per-specification, evidence-backed assessment of
   (i) what the spec requires, (ii) how Authlete supports it, (iii) what this
   codebase implements, (iv) what the docs/curriculum claim, and (v) the delta.

**B. A remediation plan** — a phased, dependency-ordered, individually
   reviewable work plan that closes every gap found in (A), with explicit scope
   decisions (implement / document-only / out-of-scope-with-rationale).

A "massive rebuild" is a **possible conclusion, never a premise.** Recommend
restructuring only if the audit produces concrete evidence that incremental
remediation is more expensive than rebuilding — and if you do, quantify why. If
the evidence says "targeted fixes to 9 files," say that instead.
</objective>

---

<ground_truth_sources>

**Precedence order.** When sources disagree, higher wins, and you must record the
disagreement rather than silently picking one:

1. The IETF RFC / OpenID Foundation specification text itself (normative MUST/SHOULD).
2. Authlete developer documentation at `developers.authlete.com` (how Authlete
   *actually* implements it — including deliberate deviations and service flags).
3. Authlete API reference / OpenAPI schema (exact request & response parameters).
4. Authlete release notes (feature availability **per Authlete version**).
5. Takahiko Kawasaki's (`darutk`) Medium articles — authoritative design intent
   from Authlete's founder, but check the publication date for staleness.
6. This repository's own docs — treated as **claims under test**, never as evidence.

**Start here — canonical doc index.** Authlete publishes a machine-readable index
of every documentation page. Fetch it first and use it to enumerate targets
instead of guessing URLs:

```
https://developers.authlete.com/llms.txt
```

Any page in that index can be fetched as clean Markdown by appending `.md` to its
path. Prefer the `.md` form.

**High-value seed pages** (verify against `llms.txt`, which is authoritative):

| Topic | URL |
|---|---|
| Comprehensive API protection with standard specs | `/protocols-and-flows/compliance-profiles/comprehensive-api-protection-with-standard-specifications` |
| RFC 8693 Token Exchange | `/protocols-and-flows/advanced-flows/oauth-2-0-token-exchange-rfc-8693` |
| RFC 7523 §2.1 JWT Authorization Grant | `/protocols-and-flows/advanced-flows/jwt-authorization-grant-rfc-7523-2-1` |
| RFC 7636 PKCE | `/protocols-and-flows/protocol-extensions/proof-key-for-code-exchange-pkce` |
| RFC 9126 PAR | `/configuration-reference/endpoints/pushed-authorization-requests-par` |
| RFC 9101 JAR | `/configuration-reference/endpoints/jwt-secured-authorization-requests-jar` |
| RFC 9396 RAR | `/configuration-reference/tokens-and-claims/rich-authorization-requests-rar` |
| RFC 8707 Resource Indicators | `/configuration-reference/tokens-and-claims/resource-indicators` |
| RFC 9449 DPoP | `/configuration-reference/tokens-and-claims/using-dpop` |
| RFC 8705 mTLS / cert-bound tokens | `/configuration-reference/tokens-and-claims/issuing-mutual-tls-certificate-bound-access-tokens` |
| RFC 9470 Step-Up Authentication | `/protocols-and-flows/advanced-flows/oauth-2-0-step-up-authentication-challenge-protocol-rfc-9470` |
| RFC 8628 Device Flow | `/protocols-and-flows/advanced-flows/oauth-2-0-device-authorization-grant-device-flow` |
| CIBA | `/protocols-and-flows/advanced-flows/client-initiated-backchannel-authentication-ciba` |
| Grant Management for OAuth 2.0 | `/protocols-and-flows/advanced-flows/grant-management-for-oauth-2-0` |
| Client ID Metadata Document (CIMD) | `/protocols-and-flows/protocol-extensions/oauth-client-id-metadata-document-cimd` |
| FAPI 2.0 Security Profile | `/protocols-and-flows/compliance-profiles/fapi-2-0` |
| FAPI 2.0 auth code flow | `/protocols-and-flows/compliance-profiles/authorization-code-flow-in-fapi-2-0-security-profile` |
| Service flags (strict-compliance switches) | `/configuration-reference/error-handling-debugging/flags-supported-in-authlete` |
| Action handling (`action` branching contract) | `/get-started/concepts/action-handling` |
| Two-step API calls (`ticket` linkage) | `/get-started/concepts/two-step-api-calls` |
| JWT access tokens | `/configuration-reference/tokens-and-claims/using-jwt-based-access-tokens` |
| Native SSO | `/protocols-and-flows/advanced-flows/native-sso` |
| OpenID4VCI | `/protocols-and-flows/verifiable-credentials/openid-for-verifiable-credential-issuance` |
| Back-Channel Logout | `/protocols-and-flows/protocol-extensions/openid-connect-back-channel-logout-1-0` |
| OpenAPI schema (parameter-level truth) | `https://developers.authlete.com/api-reference/openapi.yaml` |

For `darutk` articles, search rather than guessing slugs — e.g.
`darutk medium token exchange`, `darutk medium DPoP`, `darutk medium
"Financial-grade API"`. Known example: `https://darutk.medium.com/token-exchange-b40814d57a15`.

</ground_truth_sources>

---

<spec_inventory>

Audit **every** item below, plus anything else you discover in `llms.txt` or in
the repo. The list is a floor, not a ceiling. Group A/B are mandatory; Group C
requires an explicit scope decision each.

**Group A — Core protocol (must be implemented and documented)**
RFC 6749 (Authorization Framework), RFC 6750 (Bearer Token Usage),
RFC 7009 (Token Revocation), RFC 7519/7515/7517 (JWT/JWS/JWK),
RFC 7636 (PKCE), RFC 7662 (Token Introspection), RFC 8414 (AS Metadata),
RFC 8252 (OAuth for Native Apps), RFC 9700 (Security BCP — formerly
draft-ietf-oauth-security-topics), OpenID Connect Core 1.0,
OIDC Discovery 1.0, OIDC RP-Initiated Logout.

**Group B — Extensions Authlete supports (implement or justify)**
RFC 7521/7523 (Assertion & JWT client auth + JWT authorization grant),
RFC 7591 / 7592 (Dynamic Client Registration & Management),
RFC 8628 (Device Authorization Grant), RFC 8693 (Token Exchange),
RFC 8707 (Resource Indicators), RFC 9068 (JWT Access Tokens),
RFC 9101 (JAR), RFC 9126 (PAR), RFC 9207 (`iss` in authz response),
RFC 9396 (RAR), RFC 9449 (DPoP), RFC 9470 (Step-Up Auth Challenge),
RFC 9700, RFC 9701 (JWT Introspection Response), RFC 9728 (Protected
Resource Metadata), CIBA Core 1.0, JARM, Grant Management for OAuth 2.0,
OIDC Back-Channel Logout 1.0, OIDC Native SSO 1.0, Client ID Metadata
Document (CIMD), parameterized scopes, scope/client attributes.

**Group C — Environment-dependent; decide scope explicitly**
RFC 8705 (mTLS client auth & certificate-bound access tokens) — requires PKI;
FAPI 1.0 Baseline/Advanced and FAPI 2.0 (+ Message Signing) — requires a
conformant client suite; OpenID4VCI / HAIP / mDL — requires a wallet;
OpenID Federation 1.0; hardware security keys.

For each Group C item the only acceptable outcomes are:
- **Implement** — with a stated reason it earns the cost, or
- **Document-only** — a curriculum page explaining the spec, Authlete's support,
  the exact service/client settings involved, why it is not runnable here, and
  links to Authlete + RFC + a working reference implementation.

"Skipped" with no artifact is **not** an acceptable outcome. Every skip produces
a documented decision record.

</spec_inventory>

---

<definitions>

Assign exactly one conformance verdict per specification. Do not invent grades.

| Verdict | Meaning |
|---|---|
| `IMPLEMENTED_VERIFIED` | Code path exists, exercises the correct Authlete API + parameters, and a test or reproducible request proves it. |
| `IMPLEMENTED_UNVERIFIED` | Code path exists and looks correct, but nothing proves it end-to-end. |
| `PARTIAL` | Happy path only: error responses, edge cases, or required parameters are missing. Enumerate exactly what is missing. |
| `MISCONFIGURED` | Implemented, but Authlete service/client settings or flags contradict the spec or the docs. |
| `DOC_ONLY` | Documented but not implemented. |
| `CODE_ONLY` | Implemented but undocumented. |
| `DOC_INCORRECT` | Documentation contradicts the code, the RFC, or Authlete's actual behavior. **Highest severity for a teaching repo.** |
| `ABSENT` | Neither implemented nor documented. |
| `OUT_OF_SCOPE` | Deliberate exclusion with a written decision record. |

Severity: `S1` learner would build something insecure · `S2` learner would build
something broken · `S3` learner would be confused · `S4` cosmetic.

</definitions>

---

<method>

Work in phases. **Stop at each `GATE` and wait for my approval before
proceeding.** Do not run ahead. Do not write production code in Phases 0–4.

### Phase 0 — Repo cartography and version pinning
- Enumerate structure: `Glob` for source, route handlers, config, tests, and all
  of `docs/**` including `docs/curriculum/**`.
- Identify **which Authlete version this project targets** (2.3 vs 3.0) from
  config, base URLs, SDK version, and env samples. Feature availability and
  flag semantics differ between them; every later finding must be evaluated
  against the pinned version. If ambiguous, list the evidence and ask.
- Identify the Authlete integration surface: which SDK/HTTP client, which Core
  API endpoints are called, and where `action` branching happens.
- Inventory every doc and curriculum file with a one-line claim summary.
- **Output:** `audit/00-inventory.md` — file tree, Authlete version + evidence,
  endpoint→file map, doc→claim map, and open questions for me.
- **GATE 0.** Confirm the version pin and inventory are right before any audit.

### Phase 1 — Build the specification matrix
- Fetch `llms.txt`; reconcile `<spec_inventory>` against it. Add anything found;
  flag anything in the inventory that Authlete does not appear to support.
- For each spec, record: RFC/spec ID and exact title, Authlete doc URL(s),
  Authlete-side surface (Core API endpoints, service flags, client metadata
  fields, grant types, `action` values), minimum Authlete version.
- **Output:** `audit/01-spec-matrix.md` (one row per spec, no verdicts yet).
- **GATE 1.** I confirm the scope list before deep audits begin.

### Phase 2 — Per-spec deep audit
Audit **one spec at a time**, in the order agreed at Gate 1. For each:
1. Read the RFC's normative requirements — specifically the request parameters,
   the token/response parameters, the required error codes, and any MUST-level
   validation on the AS side.
2. Read Authlete's page(s) for it and the relevant OpenAPI operation. Note where
   Authlete does the work for you versus where **your** server must do the work
   (this boundary is the single most common source of tutorial errors).
3. `Grep` the codebase for the concrete markers: grant type strings, parameter
   names, endpoint paths, Authlete `action` values, flag names, error codes.
4. Read the corresponding doc/curriculum file and extract each testable claim.
5. Emit the audit entry (schema and worked example below).

Batching rule: you may parallelize *evidence gathering* across specs using
subagents, but every verdict must be written by you, sequentially, with the
evidence in front of you. Never emit a verdict for a spec whose primary
sources you have not read in this session.

- **Output:** `audit/02-findings/<RFC-ID>-<slug>.md`, one file per spec.
- **GATE 2.** Present findings in batches of ~5 for review. Do not proceed past
  a batch until I approve it.

### Phase 3 — Curriculum audit
- For every module in `docs/curriculum/`: verify each factual claim against the
  Phase 2 findings; verify every wire-level example (parameters, headers, JSON
  bodies, error payloads) against RFC + Authlete's actual response shape;
  verify the vendor-neutral → wire-level → Authlete-specific layering is intact
  and that Authlete-specific behavior is never presented as generic OAuth.
- Check pedagogical dependency order: does any module rely on a concept, or on a
  server capability, introduced later or not at all?
- **Output:** `audit/03-curriculum-audit.md` — per-module claim table with
  verdicts and severities, plus a dependency-order graph.
- **GATE 3.**

### Phase 4 — Synthesis and remediation plan
- Aggregate: counts by verdict and severity; a ranked gap register.
- **Explicit rebuild assessment.** State the total remediation cost estimate
  (files touched, new modules, new endpoints, test surface) versus the cost of
  restructuring. Recommend a rebuild *only* if the numbers support it, and name
  the specific structural defect that forces it (e.g. "Authlete `action`
  handling is duplicated across 14 route handlers with divergent error mapping,
  so every extension spec must be patched 14 times"). If the numbers do not
  support a rebuild, say so plainly and recommend targeted work instead.
- Sequence the work into phases ordered by (a) S1/S2 correctness fixes first,
  (b) dependency order, (c) shared-infrastructure work before per-spec work.
- Each work item gets: ID, spec, verdict being closed, files touched,
  acceptance criteria, verification method, effort (S/M/L), risk, and
  dependencies. Every item must be independently reviewable and revertible.
- **Output:** `audit/04-remediation-plan.md` + `audit/05-decision-records.md`
  (one record per `OUT_OF_SCOPE` / document-only choice).
- **GATE 4.** No implementation work begins until I approve this plan.

### Phase 5 — Execution (only after Gate 4)
Implement one work item at a time. Each ends with: the change, its verification
evidence, and the doc/curriculum update in the same commit. Never change code
without updating the docs that describe it, and never the reverse.

</method>

---

<reasoning_protocol>

Before writing any verdict, reason explicitly in a `<thinking>` block. Do not
skip this even when the answer feels obvious — obvious-feeling conformance claims
are exactly where drift hides. Work through, in order:

1. **What does the RFC require of the authorization server?** List the specific
   MUST-level items. Quote nothing; paraphrase precisely.
2. **What does Authlete do, and what is left to me?** Draw the boundary. Which
   Authlete endpoint, which request parameters, which `action` values must be
   handled, which service flags or client metadata gate the behavior, which
   Authlete version introduced it.
3. **What does the code actually do?** Cite `path:line`. Distinguish "the string
   appears somewhere" from "the code path is reachable and correct."
4. **What do the docs claim?** Cite `path:line`. List claims as testable
   assertions.
5. **Where is the delta?** Compare 1↔2↔3↔4 pairwise. Note which pair disagrees.
6. **What am I unsure about, and what would resolve it?** Name the missing
   evidence and the exact source that would settle it.

Only then write the verdict. If steps 1–4 do not yield enough evidence, the
verdict is `NEEDS_INVESTIGATION` with a named next action — never a guess.

</reasoning_protocol>

---

<one_shot_example>

This is the exact shape, depth, and tone required for every Phase 2 entry.
Content below is **illustrative formatting only** — do not carry any of its
factual assertions into your real audit. Re-derive everything from sources.

````markdown
# RFC 8693 — OAuth 2.0 Token Exchange

- **Verdict:** `PARTIAL`
- **Severity:** S2
- **Authlete version required:** 2.3+ (confirm against release notes)
- **Repo doc under test:** `docs/TOKEN-EXCHANGE-TUTORIAL.md`

<thinking>
1. RFC requires (AS side): grant_type=urn:ietf:params:oauth:grant-type:token-exchange;
   handle subject_token + subject_token_type (required), and optionally
   actor_token/actor_token_type, resource, audience, scope, requested_token_type.
   Response MUST include issued_token_type and token_type; MUST reject an
   actor_token present without actor_token_type. Impersonation vs delegation
   turns on presence of actor_token (delegation implies an act claim chain).
2. Authlete boundary: Authlete's /auth/token surfaces the exchange as a distinct
   action rather than minting a token itself — the AS is responsible for
   validating the subject_token (it may be a token Authlete never issued, e.g.
   an external IdP's) and then calling a token-creation path with the resolved
   subject. So the interesting work is *mine*, not Authlete's. Must confirm:
   which action value, which service flag enables the grant type, whether the
   grant type must also be listed in client metadata.
3. Code: server/routes/token.js:118 handles the grant_type string and forwards to
   Authlete. No branch for the token-exchange action value. No subject_token
   validation. No actor_token handling anywhere (grep: 0 hits).
4. Docs: TOKEN-EXCHANGE-TUTORIAL.md:44 presents impersonation end-to-end;
   :96 asserts delegation "works the same way with actor_token" — that claim is
   not backed by any code path.
5. Delta: (3) vs (1) — missing actor_token, missing issued_token_type in the
   response, missing the actor_token-without-type error. (4) vs (3) — the
   delegation claim is false, which is DOC_INCORRECT and the reason severity is
   S2 rather than S3: a learner following :96 ships a server that silently
   ignores the actor and grants full impersonation.
6. Unsure: exact Authlete action value and flag name. Resolve by reading the
   Authlete token-exchange page and the /auth/token OpenAPI operation.
</thinking>

## Normative requirements (AS side)
| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept the token-exchange grant type at the token endpoint | RFC 8693 §2.1 | ✅ `server/routes/token.js:118` |
| 2 | Require `subject_token` + `subject_token_type` | RFC 8693 §2.1 | ⚠️ accepted, never validated |
| 3 | Reject `actor_token` without `actor_token_type` | RFC 8693 §2.1 | ❌ absent |
| 4 | Return `issued_token_type` | RFC 8693 §2.2.1 | ❌ absent |
| 5 | Error responses per RFC 6749 §5.2 | RFC 8693 §2.2.2 | ⚠️ generic 500 on failure |

## Authlete integration boundary
| Concern | Owner | Where |
|---|---|---|
| Grant-type enablement | Authlete service config + client `grantTypes` | (cite doc URL) |
| Subject-token validation | **This server** | not implemented |
| Token minting | Authlete | (cite endpoint) |
| `act` claim chain for delegation | **This server** | not implemented |

## Documentation delta
| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Delegation works via `actor_token` | `:96` | No actor_token code path exists | `DOC_INCORRECT` / S2 |

## Sources consulted
- RFC 8693 §§2.1–2.2 — <url>
- Authlete: RFC 8693 Token Exchange — <url>
- Authlete OpenAPI: `/auth/token` — <url>
- darutk, "Token Exchange" — <url>

## Proposed work items
| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| TE-1 | Validate `subject_token` per configured token type | M | Invalid/expired subject token → `invalid_grant`; test covers both |
| TE-2 | Implement `actor_token` + delegation `act` chain | L | Delegation request yields nested `act`; missing `actor_token_type` → `invalid_request` |
| TE-3 | Return `issued_token_type`; map errors to RFC 6749 §5.2 | S | Response schema test passes |
| TE-4 | Rewrite tutorial §delegation against real behavior | M | Every request/response in the doc reproducible against the running server |
````

</one_shot_example>

---

<constraints>

**Anti-hallucination — these are hard rules.**
- Every claim about the codebase carries a `path:line` citation.
- Every claim about Authlete or an RFC carries a URL you fetched **in this
  session**. Do not cite from memory. Do not construct Authlete URLs by
  pattern — resolve them through `llms.txt` or search.
- If a fetch fails or a page does not exist, say so and mark the item
  `NEEDS_INVESTIGATION`. Never substitute plausible-sounding detail for a
  source you could not read.
- Never infer that a spec is implemented because a doc says it is, or because a
  grant-type string appears in a constant. Reachability and correctness must be
  shown separately.
- If Authlete's behavior differs from the RFC (this happens, and Authlete's
  service flags exist precisely because of it), report **both** and say which
  the codebase follows. Do not smooth over the difference.

**Scope discipline.**
- Phases 0–4 are read-and-analyze only. Do not edit source files. The only files
  you create are under `audit/`.
- Do not refactor opportunistically. Note it as a work item instead.
- Do not skip a spec because it is "obviously fine." Emit an entry with the
  verdict and evidence, however short.
- Do not compress the output to save effort. A shallow complete matrix is
  useless; if you are running low on context, stop at a gate and tell me, rather
  than degrading the depth of later entries.

**Communication.**
- Report gaps plainly, without cushioning. If a curriculum module is wrong, say
  it is wrong and say what a learner would build as a result.
- If you disagree with a scope decision in this prompt, say so at the relevant
  gate with your reasoning.
- Surface uncertainty as uncertainty. "I could not determine X" is a valid and
  valuable finding.

</constraints>

---

<self_check>
Before presenting each phase output, verify and state that:
- [ ] Every spec in `<spec_inventory>` appears with exactly one verdict from
      `<definitions>` — no spec silently dropped.
- [ ] Every codebase claim has a `path:line`; every external claim has a URL
      fetched this session.
- [ ] Every `OUT_OF_SCOPE` has a decision record with a documentation artifact.
- [ ] Every finding is evaluated against the **pinned Authlete version**.
- [ ] Every `DOC_INCORRECT` finding names the wrong thing a learner would build.
- [ ] The rebuild recommendation follows from stated numbers, not from vibes.
- [ ] Findings and plan are in files under `audit/`, not only in chat.
State any checklist item you could not satisfy and why.
</self_check>

---

<first_action>
Do **not** start auditing yet. Begin with Phase 0 only:

1. Fetch `https://developers.authlete.com/llms.txt`.
2. Map the repo and pin the Authlete version with evidence.
3. Write `audit/00-inventory.md`.
4. Present: the Authlete version pin and how you determined it, the
   endpoint→file map, the doc→claim map, the reconciled spec list with anything
   you propose adding or removing, your proposed Phase 2 ordering with reasoning,
   and every open question you need me to answer.

Then stop at GATE 0 and wait.
</first_action>