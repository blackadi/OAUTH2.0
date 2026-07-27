# Module 05 — Quiz

19 items across four tiers. Don't advance to Module 06 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** On a successful pushed authorization request, RFC 9126 §2.2 requires the AS to respond with:
- A) 200 OK  B) 201 Created  C) 302 Found  D) 204 No Content

**Q2.** RFC 9449 §4.2 requires the DPoP proof's JOSE header to contain at least:
- A) `typ`, `alg`, `kid`  B) `typ`, `alg`, `jwk`  C) `alg`, `jwk`, `x5c`  D) `typ`, `jwk`, `jti`

**Q3.** The confirmation claim member for a **certificate-bound** access token (RFC 8705 §3) is:
- A) `jkt`  B) `cnf`  C) `x5t#S256`  D) `x5c`

**Q4.** RFC 9207 requires the authorization server to include `iss`:
- A) only in successful authorization responses
- B) in authorization responses **including error responses**
- C) only when the client requests it
- D) only in the token response

**Q5.** Which authentication scheme carries a DPoP-bound access token to a protected resource (RFC 9449 §7.1)?
- A) `Bearer`  B) `DPoP`  C) `Basic`  D) either `Bearer` or `DPoP`

## Tier 2 — Applied reasoning (5)

**Q6.** Your deployment already uses PAR. A colleague asks why you would additionally sign the request object
with JAR. The best answer is:
- A) You would not — PAR already provides everything JAR does
- B) JAR adds integrity *and non-repudiation*: the AS (and later an auditor) can prove which client authored
  the request, which PAR alone does not establish
- C) JAR is required for PKCE to work
- D) JAR encrypts the request, which PAR does not

**Q7.** What does an attacker who reads the browser's address bar learn from a PAR-based authorization
request?
- A) The full set of requested scopes and the PKCE challenge
- B) The `client_id` and an opaque, single-use, short-lived handle — and nothing about the request contents
- C) Nothing at all; PAR removes the browser from the flow entirely
- D) The `redirect_uri` and `state` only

**Q8.** A client integrates with three authorization servers. Which control specifically prevents a mix-up
attack?
- A) PKCE, because the code cannot be redeemed without the verifier
- B) `state`, because it binds the response to the session
- C) The client checking the `iss` parameter against the AS it believes it contacted
- D) Exact redirect-URI matching at each AS

**Q9.** You must sender-constrain tokens for a browser-based SPA. Which mechanism, and why?
- A) mTLS — it is stronger, being at the transport layer
- B) DPoP — client certificates in browsers are impractical, and DPoP uses an ephemeral key the SPA generates
- C) Neither works in a browser; use short lifetimes instead
- D) Either; the choice makes no practical difference

**Q10.** A DPoP proof is captured from a request to the token endpoint. Which claim prevents it being replayed
against the UserInfo endpoint?
- A) `jti`  B) `iat`  C) `htu` (with `htm`)  D) `ath`

## Tier 3 — Trace and diagnose (5)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** A client signs its DPoP proofs like this in Node:

```js
const sig = crypto.sign("sha256", Buffer.from(signingInput), { key: privateKey });
```

Every request is rejected with `invalid_dpop_proof … Signed JWT rejected: Invalid signature`. The key is
correct and the claims are correct. What is wrong?

**Q12.** An authorization server processes request objects like this:

```js
const params = { ...req.query, ...decodeRequestObject(req.query.request) };
```

Which RFC 9101 requirement does this violate, and what can an attacker do?

**Q13.** A resource server accepts DPoP-bound tokens:

```js
const token = auth.replace(/^DPoP /i, "");
const proof = verifyDpopProof(req.headers.dpop);      // checks signature, typ, htm, htu, iat
const claims = await introspect(token);
if (claims.active) return allow(claims.sub);
```

Two checks required by RFC 9449 are missing. Name them and say what each one lets an attacker do.

**Q14.** A resource server is upgraded to support DPoP. To avoid breaking existing clients it keeps the old
path:

```js
if (auth.startsWith("DPoP ")) return verifyDpopBoundToken(auth, req.headers.dpop);
if (auth.startsWith("Bearer ")) return verifyBearerToken(auth);   // unchanged from before
```

`verifyBearerToken` introspects the token and checks `active`, `aud`, and `scope`. What is the flaw, and why
is it worse than a hard failure?

**Q15.** A client's PAR integration works in development and fails in production with
`invalid_request_uri … not registered`, but only intermittently — roughly on every second login attempt. The
`request_uri` is fresh each time and well within its 600-second lifetime. What is the most likely cause?

## Tier 4 — Adversarial and design (4)

**Q16.** Walk through a **mix-up attack** in full against a client that supports two authorization servers,
an honest one (AS-H) and one the attacker controls (AS-A). State the attacker's setup, each step of the
flow, exactly what the attacker ends up holding, and the point at which `iss` breaks the chain. Then explain
why PKCE alone does **not** stop this attack, and name one additional condition that must hold for the attack
to work at all.

**Q17.** You are the security reviewer for a payments API. The team proposes DPoP for all clients. The
platform team counters with mTLS. Write the decision: state the criteria you would judge on, give your
recommendation for (a) their mobile app, (b) a bank partner's server-to-server integration, and (c) their
internal admin SPA, and identify the single deployment detail most likely to silently break either mechanism
in production.

**Q18.** An attacker has read access to your API gateway's access logs, which record full request URLs and
all headers including `Authorization` and `DPoP`. For each of the following, state precisely what the
attacker can do with the logged material: (a) a bearer token, (b) a DPoP-bound token plus its captured
proofs, (c) a PAR `request_uri`, (d) an authorization code protected by PKCE. Then state what an attacker
would need *in addition* to the logs to defeat DPoP, and what you would change about the logging.

**Q19.** This repo's UserInfo endpoint strips only the `Bearer ` prefix, so a DPoP-bound token presented per
RFC 9449 §7.1 is rejected as nonexistent. Argue whether this is a **security** bug, a **correctness** bug, or
both — and defend your answer. Then describe the inverse defect (an RS that accepts `Bearer` for a
DPoP-bound token), explain which is more dangerous and why, and specify a test you would add to CI that would
catch the dangerous one.
