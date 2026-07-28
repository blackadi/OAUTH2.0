# Module 07 — Answers

Every wrong option is explained, because the point is to find the misconception, not to score.

---

## Tier 1 — Recall

**Q1 — C) BCP 240, published January 2025.**

*Best Current Practice for OAuth 2.0 Security*. The BCP number matters in a report: BCPs carry a different
kind of authority from a one-off Standards Track RFC — they represent the community's current consensus and
are expected to be updated.

- **A** describes RFC 6819's *category* (Informational) applied to the wrong document. RFC 6819 is the 2013
  threat model that RFC 9700 supersedes in practice.
- **B** is RFC 6819's date with the wrong track.
- **D** confuses RFC 9700 with OAuth 2.1. This is the confusion the module exists to prevent: **one is a
  published BCP you can cite as binding, the other is a draft you cannot.**

---

**Q2 — B) MUST NOT be used.**

*"The resource owner password credentials grant MUST NOT be used."* One of the strongest statements in the
document, and you demonstrated the deployment violating it in Lab 3b.

- **A** is the strength of §2.1.2 (implicit), not §2.4. Mixing them up matters: SHOULD NOT admits a documented
  rationale; MUST NOT does not.
- **C** — PKCE is irrelevant. ROPC has no authorization request to bind a challenge to; the client already has
  the password.
- **D** — it has its own section.

---

**Q3 — B) sender-constrained **or** rotation.**

*"Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation as described in
Section 4.14."* Either satisfies it. The lab deployment satisfies it by rotation, verified by observation.

- **A** overstates. Refresh tokens for public clients are permitted; they are conditioned.
- **C** drops the alternative and would fail a deployment that is conformant via rotation.
- **D** — lifetime is §2.3 territory and is a SHOULD, not this MUST.

Worth carrying: Module 10 will show you FAPI 2.0 **forbidding** rotation, which is the option this deployment
relies on. Not a contradiction — a stricter profile choosing the stronger branch of an either/or.

---

**Q4 — C) Not specified in the document at all.**

§1.8: *"some features available in OAuth 2.0, such as the Implicit or Resource Owner Credentials grant types,
**are not specified in** OAuth 2.1."* A specification cannot prohibit what it does not define; it simply
declines to define it. The SHOULD NOT lives in RFC 9700 §2.1.2.

- **A** is the overstatement the module targets. Saying it in a review gets you corrected.
- **B** — "deprecated but specified" describes OAuth 2.0-plus-BCP, not 2.1.
- **D** invents a rule. The implicit grant's problem is the front channel, which confidential clients do not
  fix.

---

**Q5 — B) a finding.**

The rule: **a SHOULD without a written rationale is a finding; a SHOULD with one is a decision.** RFC 2119's
SHOULD permits deviation for valid reasons in particular circumstances — so the reason has to exist and be
articulable. "Nobody got round to it" is not a circumstance.

- **A** treats SHOULD as optional. This is how audits miss the item that gets exploited.
- **C** flattens the distinction the other way and produces reports nobody finishes reading.
- **D** sets the bar at a working exploit, which is a penetration test, not a conformance review. Absence of a
  demonstrated exploit is not evidence of safety.

---

## Tier 2 — Applied reasoning

**Q6 — B) Almost nothing.**

You have learned exactly one thing: the AS *supports* PKCE, satisfying §2.1.1's *"Authorization servers MUST
support PKCE."* That is one of three requirements in that subsection. You have learned nothing about whether
public clients are required to use it, nothing about enforcement once a challenge is sent, and nothing about
downgrade mitigation. Only a request settles it.

- **A** is conformance theatre in a single sentence.
- **C** inverts the risk — public clients are where PKCE is a MUST.
- **D** overcorrects. Metadata is useful and cheap; it is just not evidence of enforcement. A reviewer who
  discards it wastes time re-deriving what the AS will happily tell them.

---

**Q7 — B) A finding that metadata is misleading, plus the observed behaviour as authoritative.**

Two things are true and both belong in the report: the client is pinned to `client_secret_basic` (correct,
expected, not a defect), *and* the metadata advertises a capability that no client can use, which will send
integrators down a dead end. The second is a low-severity finding with a disproportionate consequence — it
downgrades the reliability of every metadata-derived row in the rest of your report, and you should say so
explicitly.

- **A** is the most common wrong answer, and it is wrong because it treats "I can explain it" as "it is not a
  problem." Explaining a divergence is not the same as it being harmless.
- **C** misattributes: RFC 7523 is not violated by a client that does not use it.
- **D** is a recommendation, not a finding, and it presumes the client *should* use `private_key_jwt` —
  a separate (and reasonable) §2.5 recommendation that should be filed as its own row.

---

**Q8 — A defensible order: (ii), (iv), (i), (iii) — with reasoning that matters more than the order.**

- **(ii) PKCE not required, three public clients in production.** Highest. A MUST, with an active attack path
  (code interception on mobile/desktop), and real clients standing in it right now. Reachability is what
  promotes this above the MUST NOT below it.
- **(iv) 24-hour access tokens.** Second, and this ranking is arguable. It is only a SHOULD, but it is a
  **multiplier**: it lengthens the window on every other finding, including (ii). Findings that amplify other
  findings are chronically under-ranked.
- **(i) ROPC enabled, no client registered.** A MUST NOT — but currently unreachable. It is one client
  registration away from being critical, which is why it is not last: the gap between "not exploitable" and
  "exploitable" is an admin action, not an engineering project. Say that in the report.
- **(iii) `plain` alongside `S256`.** Last, and largely subsumed: if you fix (ii) by requiring S256, this
  disappears. Findings that another finding's remediation resolves should be noted as such rather than given
  independent weight.

Full credit requires noticing that **(i) is a MUST NOT ranked below a SHOULD**, and defending it on
reachability. Answers that sort purely by keyword strength — (i), (ii), (iii), (iv) — miss the module's point.

---

**Q9 — Three questions, and what a bad answer reveals.**

1. **"Against which document version, and are you claiming conformance to a draft?"** OAuth 2.1 is an active
   Internet-Draft. A vendor claiming conformance to a moving target either means "we follow RFC 9700" (fine,
   say so) or has not thought about it. *Bad answer:* "OAuth 2.1, the standard." They have not read it.
2. **"Which requirements are enforced by default, and which are per-client opt-in?"** This separates
   supported from required. *Bad answer:* "All of them are supported." That is an answer to a different
   question, and the substitution is usually not accidental.
3. **"Show me the evidence for one specific item — say, that a public client cannot complete a flow without
   PKCE."** *Bad answer:* a configuration screenshot rather than a request/response pair. Configuration is
   source 2; you asked for source 3.

Strong answers add a fourth: **"What was the date and scope of the assessment, and what would invalidate it?"**
— because Lab 3c is exactly a case where a true report went stale.

---

**Q10 — Two errors.**

**Error 1: "bans."** OAuth 2.1 does not ban either grant; it does not specify them (§1.8). The prohibition on
ROPC is RFC 9700 §2.4's MUST NOT; the implicit grant gets a SHOULD NOT in §2.1.2, addressed to *clients*.

**Error 2: "so we're covered."** A specification's contents do not constrain a deployment. Their AS supports
whatever it is configured to support — as the lab proved, on a server whose operators had no intention of
offering ROPC.

Rewrite: *"RFC 9700 §2.4 says ROPC MUST NOT be used and §2.1.2 says clients SHOULD NOT use the implicit
grant; OAuth 2.1 (currently draft-15) does not specify either. Neither statement tells us anything about our
deployment — we need to confirm by request that both are actually refused."*

The move from a claim about documents to a claim about the running system is the whole module in one
sentence.

---

## Tier 3 — Trace and diagnose

**Q11 — The auditor tested capability and recorded it as enforcement.**

`code_challenge_methods_supported: ["S256"]` satisfies exactly one of §2.1.1's requirements — *"Authorization
servers MUST support PKCE."* The auditor generalised that single fact into a verdict on the subsection, never
tested whether a flow completes without PKCE, and so never discovered that public clients were not required
to use it. The mobile app was compromised by precisely the attack PKCE prevents, on a deployment with a PASS
next to PKCE.

The row should have read something like:

> **§2.1.1 — FAIL (public clients).** AS supports PKCE (`code_challenge_methods_supported: ["S256"]`) but does
> not require it (`pkceRequired: false`). Evidence: completed an authorization-code flow for public client
> `<id>` with no `code_challenge`/`code_verifier`; received an access token. Enforcement of a *sent* challenge
> and downgrade mitigation both verified working. **Severity: high** — reachable by any attacker who can
> intercept a redirect on the user's device. **Remediation:** set `pkceRequired: true`.

Three habits in that row: the requirement is decomposed rather than treated as one item; the evidence is a
request, not a config value; and the parts that pass are stated alongside the part that fails, so the reader
knows the scope of the problem.

---

**Q12 — Neither auditor should be reading the name. Observe it.**

```bash
RT=<obtain a refresh token>
NEW=<use it at the token endpoint with grant_type=refresh_token, read the new refresh_token>
[ "$RT" = "$NEW" ] && echo "not rotated" || echo "rotated"
```

Then, for completeness, check whether the *old* token still works — rotation with the previous token left
valid is a weaker control than rotation with invalidation, and RFC 9700 §4.14 is where that distinction lives.

**The general rule: a configuration flag is a claim about behaviour, not the behaviour.** Flag names are
written by implementers for implementers, they double-negate (`refreshTokenKept: false`), they carry vendor
semantics no spec defines, and their meaning changes between versions. Configuration tells you *where to
look*; it never closes the question. In your report, mark any row verified by configuration alone as weaker
evidence and say so in the limitations section.

(The specific answer here: `refreshTokenKept: false` means the old token is *not kept*, so rotation is on.
Auditor 1 reached the right verdict by the wrong route, which is worse than being wrong, because it is not
correctable by review.)

---

**Q13 — Three findings.**

1. **Introspection endpoint is unauthenticated.** RFC 7662 §2.1: *"To prevent token scanning attacks, the
   endpoint MUST also require some form of authorization to access this endpoint."* Evidence: 200 with full
   token metadata, including `sub`, from an unauthenticated request. **Severity: high** — the only
   unauthenticated-remote item in this set. Mitigating factor worth stating: unknown tokens return
   `active:false` rather than an error, so it does not distinguish "invalid" from "unknown" — the anti-oracle
   requirement of RFC 7662 §2.2 is satisfied even though §2.1 is not.
2. **Revocation is correctly protected but incorrectly advertised.** Behaviour conforms to RFC 7009;
   the metadata array is empty and therefore describes it wrongly. **Severity: low** in isolation.
3. **The metadata document does not reflect actual endpoint policy.** This is the finding people drop, and it
   is the one with leverage: it means source 1 has been demonstrated unreliable, so every conclusion in the
   report drawn from metadata alone must be downgraded. It belongs in the limitations section as well as the
   findings table.

Ranking: 1, 3, 2. Finding 3 outranks 2 despite being "meta," because it changes how much the reader should
trust the rest of the document. Answers that produce only finding 1 have audited the protocol correctly and
missed that they were also auditing their own evidence.

---

**Q14 — Nothing was fixed. Three of the changes are cosmetic and one is a lie.**

- **Removing `implicit` and `password` from advertised metadata** changes what the AS *says*, not what it
  *does*. `grant_type=password` still returns a token — you just have to know to try it, and an attacker
  does. The change makes the deployment *more* dangerous, because the next auditor's source 1 now actively
  conceals the problem.
- **Removing `plain`** is real but trivial, and was subsumed by the PKCE finding anyway.
- **Populating `introspection_endpoint_auth_methods_supported`** without implementing authentication is a
  false statement in a discovery document. The endpoint still answers anyone.

Everything material remains: PKCE not required, ROPC live, implicit live, tokens unrestricted and long-lived,
introspection open.

**Why the checklist missed it:** it tested advertised metadata, which is the one source under the auditee's
direct control and the one that can be changed without touching behaviour. An audit method with a single
source is not an audit; it is an interview. This is the concrete argument for triangulation, and for the rule
that **observed behaviour is authoritative**.

---

**Q15 — A service-level configuration change removed a restriction that was blocking ROPC incidentally.**

In the lab's case: `fapiModes` was set to `["FAPI2_SECURITY"]` in March, which refuses `grant_type=password`
among many other things; clearing it in order to run unrelated flows removed the block. `PASSWORD` was in the
service's supported grant types the whole time.

The two things the March report needed:

1. **A configuration snapshot and a date**, so the July reader can diff. "§2.4 PASS" is unfalsifiable a
   month later; "§2.4 PASS as of 2026-03-xx, service `<id>`, `fapiModes: ["FAPI2_SECURITY"]`,
   `supportedGrantTypes` includes `PASSWORD`" is checkable.
2. **The reason for the pass.** The conformance was *incidental* — a side effect of a profile enabled for
   other purposes, not a decision to disable ROPC. That distinction is the finding: **`PASSWORD` remained in
   `supportedGrantTypes`, so the pass depended on a setting unrelated to ROPC.** A March report containing
   that sentence would have made July predictable, and would have recommended removing the grant outright.

The general lesson: **a control obtained as a side effect is a control you will lose as a side effect.** When
you find a pass, ask *why* it passes, and check whether the mechanism you are relying on is the one intended
to provide it.

---

## Tier 4 — Adversarial and design

Graded on reasoning. A strong answer commits to specifics, gives an order and defends it, and states what it
is unsure about.

---

**Q16 — Audit plan for an unfamiliar deployment.**

**Order.** Cheap and broad before expensive and narrow: (1) advertised metadata, both well-known paths; (2)
service and client configuration; (3) form hypotheses and list expected divergences; (4) observation, starting
with the items where a failure is most consequential; (5) chase divergences; (6) rank and write.

Collecting sources 1 and 2 *fully* before observing anything is deliberate: divergences are invisible until
you hold two descriptions side by side, and they are the highest-yield findings.

**Observation versus configuration.** Test by observation anything where a failure is directly exploitable or
where the configuration semantics are ambiguous: PKCE enforcement, retired grants, redirect matching,
refresh-token rotation, introspection/revocation authentication, audience restriction on **every** grant path.
Configuration reading is acceptable for token lifetimes, advertised algorithms, and registered client
metadata — and every such row is marked as weaker evidence in the limitations section.

**First five requests, and why:**

1. `grant_type=password` — a MUST NOT, one request, unambiguous.
2. An authorization-code flow with the public client and **no PKCE** — the highest-value MUST with a real
   attack path.
3. `redirect_uri` + one appended character — tests §2.1 exact matching, and the response also reveals
   open-redirect behaviour.
4. Introspection with no credentials — the only realistically unauthenticated-remote surface.
5. `response_type=token` — tests §2.1.2 and, on success, hands you a token in a fragment as evidence.

The selection principle: each request tests a distinct requirement, several test two at once, and every one is
a single call whose result is unambiguous. Cheap tests that produce binary answers first; multi-leg flows
after.

**When you have done enough.** Every §2 item has a verdict with cited evidence; every divergence between
sources is either resolved or written up; and you have attempted at least one composition of findings into a
chain. Not "when the checklist is full" — the checklist finishing is the beginning of the last step.

**Two things most likely to make the report wrong**, and how to bound them:

1. **Generalising from one path.** `resource` worked on the authorization-code path and silently did nothing
   on token exchange. Bound it: state explicitly which grant paths each row was tested on.
2. **Reading configuration semantics wrongly.** `refreshTokenKept` is the example. Bound it: mark
   configuration-only rows, and observe anything that carries a MUST.

Strong answers add a third: **you only find what you thought to try**, so list what you did *not* test.

---

**Q17 — Conformance theatre, constructed.**

**The changes** (configuration only, no behavioural fixes):

| Change | Flips to PASS on paper | Does not fix |
|---|---|---|
| Remove `implicit`, `password` from advertised `grant_types_supported` | §2.1.2, §2.4 | Both grants still work; you have hidden them from source 1 |
| Remove `plain` from `code_challenge_methods_supported` | §2.1.1 (partly) | PKCE still not required for anyone |
| Populate `introspection_endpoint_auth_methods_supported` | RFC 7662 §2.1 by inspection | Endpoint still answers unauthenticated |
| Register one client with `private_key_jwt` and leave it unused | §2.5 RECOMMENDED | Every real client still uses a shared secret |
| Document a "risk accepted" rationale for §2.2.1 and §2.3 | Converts findings into decisions | Nothing — but it is the *legitimate* move, which is what makes it useful camouflage |

Five changes, six or seven rows flipped, zero attack paths closed. Note the last row especially: writing down
a rationale is exactly what the module told you converts a finding into a decision. **The mechanism that makes
reviews honest is also the mechanism that launders them**, and the only defence is judging whether the
rationale is any good.

**Three questions that defeat it:**

1. **"Show me the request and response, not the configuration."** Defeats every metadata-only change at once.
   This is the single highest-value question in any audit.
2. **"Which clients actually use this, in production, today?"** Defeats the unused-`private_key_jwt` client
   and every other capability-not-adoption claim.
3. **"Who accepted this risk, when, and what is the review date?"** Defeats rationale-laundering. A real
   accepted risk has an owner and an expiry; a fake one has neither.

**Why they generalise:** each attacks a different substitution that checklists invite —
capability-for-enforcement (1), existence-for-adoption (2), and documentation-for-decision (3). Any checklist
in any domain is vulnerable to all three, because a checklist asks "is X present?" and none of these three
failures makes X absent.

---

**Q18 — Composition.**

**Starting position:** an attacker who can get a user to click a link, and who can observe redirects on the
user's device (a malicious app registering the same custom scheme, a shared browser, a compromised extension).
No credentials, no network position beyond the user's own device.

1. **Public client, no PKCE required.** Initiate an authorization request as the legitimate public client and
   intercept the redirect. The code is exchangeable by anyone who holds it — there is no verifier to produce.
2. **Redeem it.** `client_id` is public by construction. Out come an access token (**24 h**) and a refresh
   token (**10 days**).
3. **No audience restriction.** The token was issued without `resource`, so it has no `aud` and is valid at
   *every* resource server in the estate — not just the one the user was interacting with.
4. **Unauthenticated introspection.** Confirm the token is live, read its `sub` and `scope`, and re-check it
   at will without ever authenticating — useful for keeping a stolen token warm and for verifying replacements
   after rotation.
5. **Refresh.** Rotation is on, so each refresh yields a new pair; the attacker simply keeps the newest. The
   ten-day window is a floor, not a ceiling: as long as the attacker refreshes before expiry, access persists
   until someone revokes the grant — and nothing in the user's experience indicates it should be revoked.

**End state:** persistent, silently renewing access to everything the user's scopes cover, across every
resource server, with no credential ever having been phished and no password change able to end it.

**The single most damaging change: require PKCE (S256) for public clients.** It removes step 1, and every
subsequent step depends on it. Note this **is** the #1 item in the lab's remediation ranking, so there is no
divergence to explain here — but say why the ranking survived the composition analysis rather than assuming
it: the chain is anchored on the code interception, and audience restriction or shorter lifetimes would
merely reduce the blast radius of an attack that still succeeds. Credit for arguing the alternative —
audience restriction limits step 3's reach across the estate — provided you are explicit that it mitigates
rather than prevents.

**Why an item-by-item report cannot surface this.** A conformance report has one row per requirement and each
row is scored in isolation, so it has no representation for "these three combine." Individually, the ranking
would plausibly read: PKCE high, audience medium, lifetime low, introspection medium — and a team fixing them
in priority order over three quarters would close the chain at some point without ever knowing it existed. The
structural fix is to append an **attack-narrative section** to every conformance report: two or three chains,
each naming the findings it depends on, so the reader can see which fixes break which chains. That is the
difference between a compliance document and a security assessment, and it is what Module 12's capstone asks
you to produce at full scale.
