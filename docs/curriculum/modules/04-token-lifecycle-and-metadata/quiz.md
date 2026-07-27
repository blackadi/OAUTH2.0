# Module 04 — Quiz

18 items across four tiers. Don't advance to Module 05 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** The only REQUIRED member of an RFC 7662 introspection response is:
- A) `sub`  B) `active`  C) `scope`  D) `exp`

**Q2.** RFC 9068 requires a JWT access token's `typ` header to be:
- A) `JWT`  B) `jwt+at`  C) `at+jwt`  D) `application/jwt`

**Q3.** Which of these is **not** a REQUIRED claim in an RFC 9068 JWT access token?
- A) `client_id`  B) `jti`  C) `nonce`  D) `aud`

**Q4.** RFC 8707 §2 says the `resource` parameter's value:
- A) may be a relative path scoped to the issuer
- B) MUST be an absolute URI and MUST NOT include a fragment component
- C) must be a single value per request
- D) must exactly match a registered redirect URI

**Q5.** RFC 9728 defines protected resource metadata at:
- A) `/.well-known/oauth-authorization-server`
- B) `/.well-known/openid-configuration`
- C) `/.well-known/oauth-protected-resource`
- D) `/.well-known/resource-metadata`

## Tier 2 — Applied reasoning (5)

**Q6.** Your API runs in 40 pods across three regions and handles 20k req/s. Latency budget is tight, and
compliance requires that a revoked token stop working "promptly." Which token strategy, and what makes
"promptly" true?
- A) Opaque tokens with introspection on every request — revocation is instant
- B) JWT access tokens with a short lifetime (and a cache/introspection only for high-value operations);
  "promptly" is bounded by the token lifetime you choose
- C) JWT access tokens with a 24-hour lifetime — the signature proves validity
- D) Opaque tokens introspected once per session and cached until logout

**Q7.** A resource server receives an introspection response with `"active": true`. What may it conclude?
- A) The caller is authorized to perform the requested operation
- B) The token was issued by this AS, is unrevoked, and is inside its validity window — nothing more
- C) The token was issued for this resource server
- D) The subject owns the object being requested

**Q8.** Why does the revocation endpoint return **200** for a token string that was never issued?
- A) It is a spec defect that most servers work around
- B) So the endpoint cannot be used as an oracle to distinguish real tokens from invented ones
- C) Because revocation is asynchronous and the result is unknown
- D) To keep the response shape uniform for client convenience

**Q9.** A client discovers a new API and holds no configuration for it. Which document tells it *which
authorization server* to get a token from?
- A) The AS metadata document (RFC 8414)
- B) The OIDC discovery document
- C) The protected resource metadata document (RFC 9728)
- D) The JWKS

**Q10.** Your team registers a client via DCR and receives a `registration_access_token`. What is it for?
- A) Calling the API on the client's behalf
- B) Reading, updating, and deleting **that specific client registration** (RFC 7592)
- C) Authenticating at the token endpoint
- D) Introspecting tokens issued to that client

## Tier 3 — Trace and diagnose (5)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** A resource server:

```js
const r = await introspect(token);           // POST /introspect
if (r.active) return handler(req);           // proceed
return res.status(401).end();
```

The token was legitimately issued — to a *different* microservice in the same estate. Name what is missing and
what an attacker does with it.

**Q12.** An authorization server's introspection endpoint accepts POSTs with no client authentication and no
bearer token, returning full introspection results to anyone. Cite the requirement this violates and describe
the two distinct capabilities it hands an attacker.

**Q13.** A monitoring script checks that the deployment serves protected resource metadata:

```bash
if curl -s -o /dev/null -w '%{http_code}' "$HOST/.well-known/oauth-protected-resource" | grep -q 200; then
  echo "PRM OK"
fi
```

It prints `PRM OK` on a server that has no such route. Explain, and give two independent checks that would
not be fooled.

**Q14.** A resource server validates JWT access tokens like this:

```js
const claims = await verifyJwt(token, jwks);   // signature + exp checked
if (claims.sub && claims.scope?.includes("orders:read")) return allow(claims.sub);
```

Name **three** distinct problems, including one that lets a token from a completely different flow be
accepted.

**Q15.** A team reports: "We revoked the user's refresh token, but their access token kept working for
another 50 minutes. The AS is broken." Are they right? Explain what RFC 7009 actually requires and what
determines the observed behaviour.

## Tier 4 — Adversarial and design (3)

**Q16.** You are reviewing an estate with one authorization server and eleven internal APIs, all of which
accept any `active` token from that issuer. No API uses `resource` or checks `aud`. Describe the attack this
enables, including how you would escalate from access to the *least* sensitive API to access to the *most*
sensitive one. Then write the remediation plan: what changes at the client, the AS, and each RS, in what
order, and how you would roll it out without breaking the eleven APIs on day one.

**Q17.** Design the token strategy for a system with three consumers of the same API: a browser SPA, a
partner's server-to-server integration, and an internal batch job. For each, choose JWT or opaque, a lifetime,
and an audience policy, and justify it against latency, revocation lag, and blast radius. Then answer: under
what single circumstance would you change *all three* to the same strategy?

**Q18.** An open introspection endpoint and an open revocation endpoint are both bad, but they are bad in
different ways. Compare them: for each, state what an unauthenticated attacker gains, what they need to know
first, what the blast radius is, and how you would detect abuse in logs. Then rank which you would fix first
in a production incident and defend the ordering.
