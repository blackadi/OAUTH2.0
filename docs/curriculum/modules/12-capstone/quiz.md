# Module 12 — Capstone Quiz

18 items. The last gate in the curriculum. Everything refers to the Aurora brief and the Meridian Health
document in [lab.md](lab.md). Answers — including the complete 25-defect inventory — in
[quiz-answers.md](quiz-answers.md).

**Do the capstone first.** These questions give away several defects.

---

## Tier 1 — Recall (5)

**Q1.** Meridian's §1 claims FAPI 2.0 compliance on the grounds that PAR, PKCE and DPoP are *supported*. Which
FAPI 2.0 requirement does that reasoning misread?
- A) FAPI 2.0 requires mTLS, not DPoP
- B) Every FAPI 2.0 `shall` is about what the AS **rejects**; supporting a mechanism satisfies nothing
- C) FAPI 2.0 requires all three plus JARM
- D) FAPI 2.0 applies only to confidential clients

**Q2.** Meridian Mobile uses the resource owner password credentials grant. RFC 9700 §2.4 says:
- A) it SHOULD NOT be used  B) it MUST NOT be used
- C) it may be used for first-party native apps  D) it is deprecated only for public clients

**Q3.** Meridian registers `https://*.meridian-health.com/callback`. RFC 9700 §4.1 requires redirect URIs to be
compared:
- A) by domain suffix  B) by exact string matching  C) case-insensitively  D) after normalisation

**Q4.** Meridian's ID tokens are HS256-signed with the client secret. The direct consequence is:
- A) They cannot be validated offline
- B) Any party holding the client secret can **forge** an ID token for any user
- C) They are limited to 1-hour lifetimes
- D) They cannot carry a `nonce`

**Q5.** In Meridian §11, consent withdrawal calls RFC 7009 token revocation. Per Grant Management §6.5, the
difference from grant revocation is:
- A) There is none
- B) Token revocation discards a credential; the underlying grant survives, so the next authorization request
  is approved with no prompt
- C) Token revocation is asynchronous
- D) Grant revocation only applies to refresh tokens

## Tier 2 — Applied reasoning (5)

**Q6.** Meridian justifies 24-hour offline-validated access tokens by citing ward tablets that lose
connectivity. Assess the justification.
- A) Sound — availability requires offline validation
- B) The constraint is real, but the conclusion does not follow: shorter lifetimes plus a refresh on
  reconnect give offline tolerance without a 24-hour revocation lag
- C) Unsound — offline validation should never be used
- D) Sound, provided the blocklist syncs nightly

**Q7.** Meridian §7 injects `X-User-Id` and `X-Tenant-Id` at the gateway and services trust them. The most
serious consequence is:
- A) Header size limits
- B) Any party that can reach a service without traversing the gateway can impersonate any user in any tenant
- C) The gateway becomes a single point of failure
- D) Services cannot audit correctly

**Q8.** Meridian §8 exchanges the incoming token and the result carries the original `sub`. Which brief
constraint does this break, and why?
- A) Constraint 1 — revocation, because exchanged tokens are not revocable
- B) Constraint 2 — attributability, because without an `act` claim the downstream service cannot distinguish
  the clinician acting directly from a partner acting on their behalf
- C) Constraint 3 — onboarding
- D) None; carrying `sub` is correct

**Q9.** Meridian §9's step-up challenge returns `insufficient_user_authentication` with only an
`error_description`. What is missing and what does its absence cost?
- A) `scope` — the client cannot request more scopes
- B) `acr_values` and/or `max_age` — without them the client is told it failed but not what would succeed,
  turning a recoverable state into a dead end
- C) `WWW-Authenticate` should be `DPoP`
- D) A `Retry-After` header

**Q10.** Meridian's platform is on the whole strong at client authentication for partners
(`private_key_jwt` + PAR + DCR with a JWKS URI). Given that, what is the *cheapest* remaining way for an
attacker to obtain a valid Tier 1 access token?
- A) Forge a partner assertion
- B) Attack the SPA or mobile client — implicit flow, password grant, no PKCE — which are far weaker than the
  partner path
- C) Break RS256
- D) Compromise the gateway

## Tier 3 — Trace and diagnose (5)

**Q11.** Meridian §5:
```js
const { access_token } = parseFragment(location.hash);
const profile = await fetch('/api/userinfo', {
  headers: { Authorization: `Bearer ${access_token}` } }).then(r => r.json());
session.user = profile.sub;
```
Name the vulnerability class, describe an attack concretely, and give the fix.

**Q12.** Meridian §10's SD-JWT verifier contains **two** distinct defects. Name both, quote the RFC 9901
requirement each violates, and say which is worse.

**Q13.** Meridian §7's handler:
```js
const patient = await db.patients.findOne({ id: req.params.id, tenantId: req.headers['x-tenant-id'] });
if (!patient) return res.sendStatus(404);
res.json({ id: patient.id, name: patient.name, dob: patient.dob, ward: patient.ward, admittedAt: patient.admittedAt });
```
Identify **what this code does correctly** (there are three things) and **what it gets wrong** (two).

**Q14.** Meridian §4 states that refresh-token rotation is retained "even though our sender-constraining makes
it unnecessary." Two separate things are wrong with that sentence. Name both.

**Q15.** A reviewer reports: *"Critical: Meridian's DCR allows any organisation to self-register, so anyone
can become a partner and read patient data."* Assess this finding. Is it correct?

## Tier 4 — Adversarial and design (3)

**Q16.** Take **your own Part A design** and attack it. Adopt FAPI 2.0's attacker model and, for each of A1,
A1a, A2, A3a and A5, state the best attack that attacker has against *your* architecture and whether it
succeeds. Then name the single change that would most reduce your exposure, and say why you did not already
make it.

**Q17.** Aurora's constraint 1 requires demonstrable revocation; constraint 4 requires tolerance of
intermittent connectivity. State the guaranteed window your Part A design provides between consent withdrawal
and access stopping, show how you derived it, and give the trade-off you accepted. Then describe how you would
*prove* the window to a regulator, given that a formal proof of the protocol says nothing about your
implementation.

**Q18.** Meridian's document is not the work of careless people — it contains PAR, `private_key_jwt`, DCR with
a JWKS URI, tenant-scoped queries, 404-not-403, and explicit response projections, all of which are correct
and some of which are sophisticated. Yet the platform is comprehensively insecure. Explain how that happens:
what process, incentive or review failure produces a document like this, and what **two** changes to how the
team works would have caught the most defects. Be specific about which defects each change catches.
