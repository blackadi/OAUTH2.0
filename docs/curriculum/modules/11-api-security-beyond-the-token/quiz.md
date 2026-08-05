# Module 11 — Quiz

18 items across four tiers. This is the last quiz before the capstone. Answers in
[quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** In the OWASP API Security Top 10 (2023), **API1:2023** is:
- A) Broken Authentication  B) Broken Object Level Authorization
- C) Security Misconfiguration  D) Broken Function Level Authorization

**Q2.** Which three items in the 2023 list are authorization failures?
- A) API1, API2, API5  B) API1, API3, API5  C) API2, API4, API8  D) API1, API7, API10

**Q3.** An attacker changes `GET /orders/1001` to `GET /orders/1002`. This is:
- A) BFLA  B) BOPLA  C) SSRF  D) BOLA

**Q4.** An attacker sends `PATCH /users/me` with `{"is_admin": true}` and the field is persisted. This is:
- A) BOPLA  B) BOLA  C) BFLA  D) Unrestricted Resource Consumption

**Q5.** When an object exists but belongs to another user, the recommended response status is:
- A) 401  B) 403  C) 400  D) 404

## Tier 2 — Applied reasoning (5)

**Q6.** Why can a valid, sender-constrained, audience-restricted access token not prevent BOLA?
- A) Because bearer tokens can be stolen
- B) Because the token is issued before the request exists, and scopes are type-level while object ownership
  is application data the AS does not hold
- C) Because JWTs cannot carry enough claims
- D) It can, if the scope is specific enough

**Q7.** A team scopes every query by a `tenantId` taken from the `X-Tenant-Id` request header, set by their
API gateway. What is wrong?
- A) Nothing, provided the gateway is trusted
- B) The header is caller-controllable unless the gateway strips inbound copies; the tenant must come from
  the validated token
- C) Tenant isolation should use separate databases
- D) `X-` prefixed headers are deprecated

**Q8.** A design review proposes this rule for a claims-processing system: *"An adjuster may read a claim if
they are assigned to it, if they manage someone assigned to it, or if it was escalated to their team."* The
team wants to implement it with RBAC roles (`adjuster`, `manager`) plus a `team_id` claim in the token.
State whether that will work, name the model the rule actually requires, and say **where** the decision has
to be made — at the gateway, in the service, or in the data layer.

**Q9.** You are writing the section of a platform runbook headed *"what the gateway does not do."* Your
gateway validates tokens, enforces scope per route, and rate-limits. A service team reads the runbook and
asks: *"so if a request reaches my handler, what has already been decided, and what have I still got to
do?"* Answer them in two lists, and name the one thing on your second list that no gateway could ever move
onto the first.

**Q10.** An attacker uses a legitimate account to scrape every profile they are permitted to view, slowly,
over a month. Which OWASP item is this, and why do per-request authorization checks miss it?
- A) API1 — the checks are broken
- B) API6 — every individual request is authorized; the aggregate is the attack
- C) API4 — it is a rate problem only
- D) API3 — the responses contain too many fields

## Tier 3 — Trace and diagnose (5)

**Q11.**
```js
router.get('/api/invoices/:id', requireScope('invoices:read'), async (req, res) => {
  res.json(await db.invoices.findById(req.params.id));
});
```
Name **two** distinct defects and classify each.

**Q12.**
```js
router.get('/api/reports/:id', requireAuth, async (req, res) => {
  const r = await db.reports.findOne({ id: req.params.id, tenantId: req.headers['x-tenant-id'] });
  if (!r) return res.sendStatus(404);
  res.json(r);
});
```
This query is scoped and returns 404. Why is it still vulnerable, and why is this snippet more dangerous than
one with no scoping at all?

**Q13.**
```js
export function requireBasicAuth(realm) {
  return (req, res) => {
    const id = process.env.MGMT_CLIENT_ID, secret = process.env.MGMT_CLIENT_SECRET;
    if (!id || !secret) return true;
    /* … validate Basic credentials … */
  };
}
```
Name the failure mode, the OWASP items it produces, and the fix. Then say why this is harder to catch in
review than a missing check.

**Q14.** A reviewer writes: *"Critical vulnerability in the vendor's grant API: it allows cross-user
access."* Their evidence is that user B's token read user A's grant through the application. What is wrong
with the finding **as written**, and what would you need to verify to state it correctly?

**Q15.** A team fixes a BOLA and adds this regression test:
```
assert  bob's token GET alice's resource → 404
```
The test passes. What is missing, and what bug would slip through?

## Tier 4 — Adversarial and design (3)

**Q16.** You are reviewing a multi-tenant SaaS API: OIDC login, JWT access tokens with `sub` and `tenant_id`,
an API gateway validating signature/`aud`/`exp` and enforcing scope per route, and ~40 microservices behind
it that trust the gateway and receive `X-User-Id` and `X-Tenant-Id` headers. Write the review: (a) the single
most serious structural problem and the concrete breach it enables; (b) why the gateway cannot fix it; (c)
the minimum change you would require and the migration risk; (d) one thing this architecture gets *right*
that you would keep.

**Q17.** Design the authorization model for a hospital system with these rules: doctors read records of
patients on their own ward; any doctor may read any record during a declared emergency, and every such access
is flagged for review; patients read their own record; researchers read records with identifiers removed.
State which model(s) you would use for each rule and why, where each decision is enforced, and identify the
rule that is hardest to implement safely — with your mitigation.

**Q18.** You inherit an API with 200 endpoints, no authorization tests, and a suspected BOLA problem. You have
two engineers for six weeks. Write the plan: how you would find the vulnerable endpoints without auditing all
200 by hand; what you would fix first and why; what you would put in CI so the class of bug cannot return;
and what you would tell leadership about residual risk at the end of the six weeks.
