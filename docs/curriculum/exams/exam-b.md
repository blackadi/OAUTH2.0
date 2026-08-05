# Cumulative Exam B — OAuth 2.0 complete, hardened and consolidated

**Take after Module 07.** Covers Modules 00–07, weighted to 04–07. **15 items, 100 points, 2 hours, closed
book.** Answers: [exam-b-answers.md](exam-b-answers.md).

> Module 07's quiz Tier 4 was written as an interim stand-in for this exam while it was unwritten. If you did
> those, you have seen the audit-method material; the rest of this is new.

---

## Section 1 — Token lifecycle (25 points)

**B1 (8 pts).** You must choose between **self-contained (JWT)** and **reference (opaque)** access tokens for
a new API. Give the trade-off across **four** dimensions, then state the single question about the deployment
that decides it, and why.

**B2 (7 pts).** RFC 7662 introspection has two requirements people skip, both of which are about not becoming
an oracle. Name both, quote or paraphrase what each says, and describe the attack each prevents.

**B3 (5 pts).** A client calls `POST /revoke` with a token it made up — a random string. What status must the
AS return, why, and what would returning the "honest" answer enable?

**B4 (5 pts).** Explain the relationship between the `resource` request parameter and the `aud` claim, name
the RFC, and state what an RS must do with `aud` that most do not.

## Section 2 — Request integrity and binding (25 points)

**B5 (8 pts).** PAR and JAR are frequently described as alternatives. State what each actually protects, give
one thing JAR provides that PAR cannot, and one thing PAR provides that JAR cannot. Then say which one FAPI
2.0 chose and why. *(The FAPI half needs Module 10 — skip it if you have not read that yet.)*

**B6 (9 pts).** Walk through a **mix-up attack** against a client integrated with two authorization servers.
Give the setup, each step, exactly what the attacker ends up holding, and the point at which `iss` breaks the
chain. Then explain why **PKCE does not stop it**.

**B7 (8 pts).** A DPoP proof is rejected with `invalid_dpop_proof`. Give **four** distinct causes, and for
each the specific thing to check. At least two must be things that look correct in a decoder.

## Section 3 — Machine and delegated grants (20 points)

**B8 (6 pts).** A client-credentials access token has **no `sub`**. Explain why that absence is the entire
semantics of the grant, and describe a bug that follows from a resource server assuming `sub` is always
present.

**B9 (8 pts).** RFC 7523 does **two** different jobs. Name both, say which section of the RFC defines each,
and explain why conflating them leaves you with the security properties backwards.

**B10 (6 pts).** In a token exchange, what single optional parameter changes the meaning of the whole request,
what claim appears in the result, and what does a downstream service lose when it is absent? Quote or
paraphrase RFC 8693's definition of the thing you lose.

## Section 4 — The audit method (15 points)

**B11 (7 pts).** Describe **three-source triangulation**. Name the three sources, give each one's
characteristic failure mode, and give a concrete example of a divergence you would only catch by comparing
two of them.

**B12 (4 pts).** How should a reviewer treat a **SHOULD**? Give the rule, and explain the difference between
the two cases it distinguishes.

**B13 (4 pts).** State precisely what OAuth 2.1 does and does not do. Include its status, and one thing people
commonly claim about it that is false.

## Section 5 — Integrative (15 points)

**B14 (8 pts).** A deployment's discovery document advertises
`token_endpoint_auth_methods_supported: ["none","client_secret_basic","private_key_jwt"]` and
`code_challenge_methods_supported: ["S256"]`, `require_pushed_authorization_requests: false`, and
`authorization_response_iss_parameter_supported: true`.

Write the findings you can support **from this document alone**, and — separately — list what you would have
to observe to turn each suspicion into a finding. Be precise about which is which.

**B15 (7 pts).** An architect proposes: *"We'll issue 24-hour JWT access tokens validated offline at each
service, and handle revocation by pushing a blocklist to every service every 15 minutes."*

Give the worst-case exposure window and derive it. Then give **two** designs that reduce it, with the cost of
each, and say which you would choose for a system where a regulator asks "when does access stop?"
