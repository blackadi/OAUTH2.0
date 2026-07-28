# Module 07 — Quiz

18 items across four tiers. Don't advance to Module 08 until you can pass **Tier 4**. Answers and explanations
in [quiz-answers.md](quiz-answers.md).

> Tier 4 here doubles as the interim **Cumulative Exam B** — it deliberately reaches back into Modules 02–06.

---

## Tier 1 — Recall (5)

**Q1.** RFC 9700 is:
- A) an Informational RFC superseding RFC 6819
- B) a Standards Track RFC published in 2013
- C) **BCP 240**, published January 2025
- D) an active Internet-Draft

**Q2.** RFC 9700 §2.4 says the resource owner password credentials grant:
- A) SHOULD NOT be used  B) MUST NOT be used  C) MAY be used with PKCE  D) is not mentioned

**Q3.** What does RFC 9700 §2.2.2 require for refresh tokens issued to **public** clients?
- A) They MUST NOT be issued
- B) They MUST be sender-constrained **or** use refresh token rotation
- C) They MUST be sender-constrained
- D) They SHOULD be short-lived

**Q4.** Which best describes the implicit grant's status in OAuth 2.1 (draft-15)?
- A) Explicitly prohibited by a MUST NOT
- B) Deprecated but still specified
- C) Not specified in the document at all
- D) Permitted for confidential clients only

**Q5.** In a review, a **SHOULD** that the deployment does not follow, with no written rationale, is:
- A) not a finding — SHOULD is optional
- B) a finding
- C) equivalent in severity to a MUST violation
- D) only a finding if an exploit exists

## Tier 2 — Applied reasoning (5)

**Q6.** An AS advertises `code_challenge_methods_supported: ["S256"]`. What have you learned about whether
this deployment is safe from authorization-code interception?
- A) It is safe — PKCE with S256 is supported
- B) Almost nothing — support is not enforcement; you must test whether a flow succeeds without PKCE
- C) It is safe for public clients but not confidential ones
- D) Nothing, because metadata is never trustworthy

**Q7.** Your three sources disagree: metadata advertises `private_key_jwt`, the client record says
`client_secret_basic`, and a `client_assertion` request is refused. What goes in the report?
- A) Nothing — the client record explains it
- B) A finding that metadata is misleading, plus the observed behaviour as authoritative
- C) A finding that the AS is non-conformant with RFC 7523
- D) A note that the client needs reconfiguring

**Q8.** Rank by severity for an internet-facing AS, and justify: (i) ROPC enabled but no client registered to
use it; (ii) PKCE supported but not required, with three public clients in production; (iii) `plain` offered
alongside `S256`; (iv) access-token lifetime of 24 hours.

**Q9.** A vendor's compliance report states "OAuth 2.1 compliant." Give three questions you would ask before
accepting it, and say what a bad answer to each would tell you.

**Q10.** A colleague writes: *"OAuth 2.1 bans the implicit grant and ROPC, so we're covered."* Two things are
wrong. Name both and rewrite the sentence.

## Tier 3 — Trace and diagnose (5)

**Q11.** An auditor's report contains this row:

| § | Requirement | Verdict |
|---|---|---|
| 2.1.1 | PKCE | PASS — `code_challenge_methods_supported: ["S256"]` |

The deployment was later compromised by authorization-code interception against a mobile app. What did the
auditor do wrong, and what should the row have said?

**Q12.** A service has `refreshTokenKept: false`. An auditor reads the flag name, concludes "refresh tokens
are not kept, so they are single-use," and marks §2.2.2 PASS. A second auditor reads the same flag as "the
refresh token is not rotated" and marks it FAIL. Both are reasoning from the name. Describe the check that
settles it, and state the general rule.

**Q13.** Two endpoints on the same server:

```
POST /introspection   (no credentials)  → 200 {"active":true,"sub":"admin","scope":"profile", …}
POST /revocation      (no credentials)  → 400 {"error":"invalid_client", …}
```

Both are advertised with an **empty** `*_endpoint_auth_methods_supported` array. Produce the three findings
here, and rank them.

**Q14.** A team fixes their audit by making these changes and nothing else:

- Remove `implicit` and `password` from the AS's advertised `grant_types_supported`
- Remove `plain` from `code_challenge_methods_supported`
- Populate `introspection_endpoint_auth_methods_supported` with `["client_secret_basic"]`

The next audit passes. Explain precisely what is still exploitable and why the checklist did not catch it.

**Q15.** An audit dated March finds a deployment §2.4-conformant: `grant_type=password` returns
`unauthorized_client`. In July, the same request returns an access token. No code was deployed and no client
was modified. Give the most likely explanation, and state what the March report should have contained that
would have made this predictable rather than surprising.

## Tier 4 — Adversarial and design (3)

**Q16.** You are handed an OAuth deployment you have never seen, with read access to its admin console and
credentials for one confidential and one public client. Write your audit plan: the order you would work in,
which RFC 9700 §2 items you would test by observation versus by configuration, the first five requests you
would send and why those five, and how you would decide when you have done enough. Then state the two things
most likely to make your report wrong, and what you would put in the limitations section to bound them.

**Q17.** Construct **conformance theatre**: given the deployment audited in the lab, specify the smallest set
of configuration changes that flips the maximum number of RFC 9700 §2 rows to PASS while leaving it
substantially as exploitable. For each change, say what it fixes on paper and what it does not fix in fact.
Then design the three audit questions that would defeat your own construction, and explain why those three
generalise to any checklist.

**Q18.** Using only findings from the lab, chain at least three into a single attack narrative against a
hypothetical production deployment with this configuration. State the attacker's starting position, each
step, what they hold at the end, and the blast radius. Then: identify the one change that most reduces the
damage (which need not be the first item in your remediation ranking — explain any divergence), and explain
why an item-by-item conformance report structurally cannot surface this attack.
