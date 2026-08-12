# Final Exam

**Take after Module 11, before the capstone.** Covers everything. **12 items, 100 points, 2–3 hours, closed
book.** Answers and the self-grading rubric: [final-exam-answers.md](final-exam-answers.md).

Exams A, B and C tested recall and application. This one is almost entirely **synthesis**: nothing here is
answerable from a single module, and several items have more than one right answer. You are being marked on
reasoning.

> **Grade this one hardest.** It is the last checkpoint before the capstone, and the capstone assumes you can
> do these. The self-grading rubric in the answer key is deliberately unforgiving about the two things people
> inflate: *naming what you rejected*, and *stating what your answer does not cover*.

---

## Section 1 — Explain it (25 points)

**F1 (8 pts).** In no more than 400 words, explain to a competent backend engineer who has never used OAuth
**why it exists**. You must convey: the problem it solves, why the obvious solution is wrong, and the single
structural idea that makes the whole thing work. No jargon you do not define.

**F2 (9 pts).** This curriculum names one pattern five times: **commit to a secret on one channel, prove it on
another**. Identify all five occurrences, say what is committed and what is proved in each, and explain what
the pattern is *for* — the general property it buys. Then state what grows across the five, and why the last
one needs two claims the others do not.

**F3 (8 pts).** Give the shortest correct answer to each, with the reason:
(a) Why does an access token not authenticate a user?
(b) Why can a resource server not prevent BOLA using the token?
(c) Why does FAPI 2.0 say an AS *shall not* use a control (rotation) that RFC 9700 offers as one of two
    permitted branches — and what exception does that requirement carry?
(d) Why is `403` the wrong status for someone else's object?

## Section 2 — Diagnose it (25 points)

**F4 (7 pts).** A partner reports that DPoP-bound tokens work at your token endpoint but every call to your
UserInfo endpoint fails with "the access token does not exist." The token introspects as active. Diagnose it,
name the requirement being violated, and give the one-line fix. Then state the **inverse** defect and explain
which is more dangerous.

**F5 (6 pts).** A deployment's discovery document, service configuration and observed behaviour disagree
about whether client authentication is required on the revocation endpoint. Describe how you would establish
the truth, in what order, and how you would write the finding.

**F6 (6 pts).** An SD-JWT verifier rejects every credential from a partner issuer with "disclosure not
referenced by any digest", but accepts every credential it issues itself. The partner's credentials verify
correctly in a third-party library. What is the bug?

**F7 (6 pts).** A user clicks "Disconnect this app". The app's token stops working immediately. Three weeks
later the user notices the app still has access to new data. Explain what happened and what the
implementation should have done.

## Section 3 — Decide it (25 points)

For each, choose and defend. Name what you rejected and why.

**F8 (9 pts).** A CLI tool for developers needs to call your API on the user's behalf. It runs on laptops, has
no browser guarantee, cannot keep a secret, and may run on a headless build agent. Choose the grant(s) and
token handling. Address: how the user authenticates, what happens on a headless agent, refresh-token
treatment, and how you would stop the tool becoming a credential-harvesting vector.

**F9 (8 pts).** You must choose a sender-constraining mechanism for a platform with (a) a browser SPA, (b) an
iOS app, (c) 200 server-to-server partners, half of whom sit behind CDNs you do not control. Choose per
client class and defend it. Name the deployment detail most likely to break your choice silently.

**F10 (8 pts).** A product manager wants "log in with Aurora" for third-party apps — real SSO, third parties
you do not control. Give the design, and name the **three** most likely ways a third-party integrator will
implement it insecurely, with the control you would put in place for each. At least one control must be
something other than documentation.

## Section 4 — Judge it (25 points)

**F11 (12 pts).** You are given four findings from a review of one deployment. Rank them for remediation and
defend the order. You may not use "by severity" as the justification.

> **These four are drawn from findings this deployment actually carried**, which is why they read so
> specifically. Several have since been remediated — (1) on 2026-08-10 and 2026-08-12, (3) on 2026-08-12 —
> and the exercise is to rank them **as they stood**, not to check the current code. Knowing the fixes exist
> is not an answer; the reasoning about reachability, effort and dependency is.

1. The logout endpoint validates `post_logout_redirect_uri` with a `startsWith` prefix check, so
   `https://app.example.com.evil.net/` is accepted. Reachable unauthenticated.
2. Access tokens are JWTs with a 24-hour lifetime, validated offline. Revocation is a blocklist synced every
   15 minutes.
3. The introspection endpoint requires no authentication.
4. `GET /api/reports/:id` checks scope but not ownership. Any authenticated user reads any report.

**F12 (13 pts).** Write the **limitations section** for a design you consider good — either your own from
Module 12, or a hypothetical high-assurance deployment using everything this curriculum recommends: mandatory
PAR, PKCE S256, DPoP, `private_key_jwt`, short opaque tokens with introspection, grant management, and
object-level authorization at the data layer.

State what it does **not** protect against. Be specific and give at least five distinct items across
different categories. Then name the single assumption that, if it turned out to be false, would do the most
damage to the whole design.

---

*This item is the most important on the exam. A design you cannot criticise is a design you do not
understand.*
