# Module 06 — Quiz

18 items across four tiers. Don't advance to Module 07 until you can pass **Tier 4**. Answers and explanations
in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** RFC 6749 §4.4 states that the client credentials grant type MUST only be used by:
- A) public clients  B) confidential clients  C) native apps  D) any registered client

**Q2.** Which parameter carries a JWT used as an **authorization grant** (RFC 7523 §2.1), and which carries a
JWT used for **client authentication** (RFC 7523 §2.2)?
- A) `client_assertion` / `assertion`
- B) `assertion` / `client_assertion`
- C) `jwt` / `client_jwt`
- D) both use `assertion`, distinguished by `grant_type`

**Q3.** Which claims does RFC 7523 §3 say a JWT assertion **MUST** contain?
- A) `iss`, `sub`, `aud`, `exp`  B) `iss`, `sub`, `aud`, `exp`, `jti`
- C) `iss`, `aud`, `exp`, `nbf`  D) `sub`, `aud`, `exp`, `iat`

**Q4.** In an RFC 8693 request, which parameter's **presence** distinguishes a delegation request from an
impersonation request?
- A) `requested_token_type`  B) `resource`  C) `actor_token`  D) `subject_token_type`

**Q5.** Which parameters does RFC 8693 §2.2.1 mark **REQUIRED** in a successful token exchange response?
- A) `access_token`, `expires_in`, `scope`
- B) `access_token`, `token_type`, `issued_token_type`
- C) `access_token`, `refresh_token`, `issued_token_type`
- D) `access_token` only

## Tier 2 — Applied reasoning (5)

**Q6.** A nightly reconciliation job runs on your own infrastructure and needs to read every customer's
invoice totals. Which grant, and what is the one thing that most needs constraining?
- A) Authorization code with a service account user — constrain the redirect URI
- B) Client credentials — constrain the scope and token lifetime; there is no user to consent
- C) JWT assertion grant with `sub` set to each customer in turn — constrain the signing key
- D) Token exchange from an admin's token — constrain the audience

**Q7.** You introspect an access token and find `sub` is present but `auth_time` and `acr` are absent. What
does this most likely tell you?
- A) The token is expired
- B) The token was issued by client credentials
- C) A subject was asserted or carried over rather than established by an authentication event
- D) The introspection endpoint is misconfigured

**Q8.** A partner IdP will federate its 40,000 employees into your AS via RFC 7523 §2.1. Which control does
the *specification* leave entirely to your deployment?
- A) Verifying the assertion signature
- B) Rejecting expired assertions
- C) Restricting which `sub` values that issuer is permitted to assert
- D) Requiring the `aud` claim to name your AS

**Q9.** Your gateway holds a user's access token with scope `read write admin` and must call an analytics
service that needs only `read`. Rank these from best to worst and say why the worst is worst:
1. Forward the user's token unchanged
2. Exchange for a `read`-scoped, audience-restricted token with `actor_token` set
3. Exchange for a `read`-scoped token without `actor_token`
4. Mint a client-credentials token for the gateway and call analytics as the gateway

**Q10.** RFC 8693 §2.2.1 makes `scope` OPTIONAL when the issued scope matches the request and REQUIRED
otherwise. What general principle does this encode, and where else in this module did you see the same
principle applied — or violated?

## Tier 3 — Trace and diagnose (5)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** A resource server authorizes like this:

```js
const claims = await introspect(token);
if (!claims.active) return deny();
const record = await db.invoices.findOne({ owner: claims.sub });
return record;
```

A client-credentials token from a legitimate internal service reaches this code. Describe what happens and
why the bug is worse in a document store than in a relational one with a `NOT NULL` foreign key.

**Q12.** An authorization server verifies inbound assertions like this:

```js
const header = decodeProtectedHeader(assertion);
const jwks  = await fetch(header.jku).then(r => r.json());
const key   = jwks.keys.find(k => k.kid === header.kid);
const claims = await jwtVerify(assertion, key);
return issueTokenFor(claims.sub);
```

Name the defect and write the two-request attack that produces an access token for any user.

**Q13.** A token exchange handler builds its downstream request like this:

```js
const subject = result.subject || subjectToken;
const req = { grantType: "TOKEN_EXCHANGE", clientId, scopes, subject };
```

Two separate defects are visible in these two lines. Name both, and for each say what an operator would see
in production.

**Q14.** *(Historical. This was a live defect in this repo until 2026-08-06, when pinning the SDK to 1.0.0
fixed it — see `docs/DEVELOPMENT.md` → **SDK Version Pin**. The lab no longer reproduces it, so reason from
the scenario as stated rather than from the running server.)*

A client integrating token exchange reports: *"Exchange works in our staging smoke test but fails in
production with a 400 that isn't an OAuth error. The only difference is that production tokens have scopes."*
State the root cause, the layer it lives in, and why the staging test passed.

**Q15.** A service exchanges tokens for downstream calls and logs every issued token's subject to its
observability pipeline for per-user metrics. Six months later a security review finds live access tokens in
the log store. Reconstruct the chain of decisions that produced this, and name the single line of code that,
written differently, would have prevented it.

## Tier 4 — Adversarial and design (3)

**Q16.** You compromise a CI runner and obtain the client credentials of a confidential client that has the
JWT assertion grant enabled, on a deployment configured like the one in this lab. The client has scopes
`profile` and `invoices:read`. Write the attack: what you can mint, what identity you can assume, what you
cannot do, and how you would tell whether the AS is configured to stop you. Then specify **three** controls,
ordered by how much they reduce blast radius, and explain why the first one you would actually deploy is
probably not the strongest one on your list.

**Q17.** You are reviewing a payments platform. A gateway receives a user request, exchanges the user's token
for a downstream token, and calls a ledger service that moves money. The gateway's exchange request includes
`actor_token`; the AS silently ignores it and returns `{"sub": "alice"}`. Argue whether this is a
**security** bug, a **correctness** bug, or both. Then: (a) describe an incident that becomes unresolvable
because of it, (b) explain why the ledger service cannot detect the problem from the token alone, (c) specify
what the ledger service should require of every token it accepts so that this class of defect fails closed,
and (d) write the CI test that would have caught it.

**Q18.** Design the machine-to-machine authorization for a four-service chain: `gateway → orders → pricing →
ledger`, where a human initiates the request at the gateway and the ledger moves money. Specify for each hop:
the grant, the client authentication method, the token's subject and actor, its audience, its scope, and its
lifetime. Then defend the design against three attackers: (i) one who compromises `pricing`, (ii) one who
obtains the gateway's client credentials, (iii) one with read access to every service's logs. State
explicitly which of your controls comes from a specification and which is local policy — and name the one
design decision you are least confident about.
