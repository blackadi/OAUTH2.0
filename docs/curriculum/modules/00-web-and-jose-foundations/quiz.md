# Module 00 — Quiz

16 items across four tiers. Don't advance to Module 01 until you can pass **Tier 4** — recall is the least of
it. Answers and explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (4)

**Q1.** Which RFC defines the **JSON Web Signature (JWS)**?
- A) RFC 7519  B) RFC 7516  C) RFC 7517  D) RFC 7515

**Q2.** In the compact serialization `AAA.BBB.CCC`, which segment carries the **claims**?
- A) `BBB`  B) `AAA`  C) `CCC`  D) all three

**Q3.** base64url (RFC 4648 §5) is best described as:
- A) an encryption scheme  B) a signature algorithm  C) a reversible text encoding  D) a hash function

**Q4.** Which channel carries data **through the user's browser**?
- A) the back channel  B) the front channel  C) the token endpoint  D) the JWKS endpoint

## Tier 2 — Applied reasoning (5)

**Q5.** Your client must send its `client_secret` to obtain a token. Which channel, and why?
- A) Front channel — it's over HTTPS so it's encrypted anyway
- B) Back channel — the browser never sees back-channel bytes
- C) Either works, since TLS protects both equally
- D) Front channel — so the user can audit what's sent

**Q6.** A teammate says: "We validate incoming JWTs by base64url-decoding them and checking the `role` claim."
What is the critical missing step?
- A) Checking the base64url padding
- B) Verifying the signature against the issuer's key (and checking `iss`/`aud`/`exp`)
- C) Confirming the token is exactly three segments
- D) Re-encoding the payload to confirm it round-trips

**Q7.** You need the claims inside a token to be **unreadable** to the party holding it. You should use:
- A) A JWS signed with ES256
- B) A JWS signed with RS256 and a long key
- C) A JWE (encrypted)
- D) A JWS with the payload base64url-encoded twice

**Q8.** A token's header says `alg: ES256`. You have the issuer's public JWK. The safe way to verify is:
- A) Use whatever algorithm the token's `alg` header specifies
- B) Pin the expected algorithm (ES256) and verify with the issuer's public key
- C) Try every algorithm until one verifies
- D) Trust it if the `kid` matches a key you've seen before

**Q9.** A `code` value arrives in a redirect URL displayed in the user's browser. Before any verification, how
much should the client trust that value's integrity?
- A) Fully — TLS protected it in transit
- B) Fully — it came from the authorization server
- C) Not at all — front-channel data is attacker-influenceable at the user agent
- D) Partly — only the `state` parameter is untrusted

## Tier 3 — Trace and diagnose (4)

For each: identify the defect, name the affected requirement/concept, and state the fix.

**Q10.** A resource server authorizes like this:
```js
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
if (claims.scope?.includes('admin')) grantAdminAccess();
```
What is wrong, and what is the consequence?

**Q11.** A JWT verifier is configured with:
```json
{ "acceptedAlgorithms": ["none", "HS256", "RS256"] }
```
Name **two** distinct attacks this enables and the fix.

**Q12.** (JOSE-structure reading — DPoP preview.) RFC 9449 §4.3 says a DPoP proof presented **with an access
token** must carry an `ath` claim (the base64url SHA-256 hash of that access token). A client instead sends a
proof whose payload contains a `sub` claim and no `ath`. Decoding the proof "looks fine." Why will the server
reject or ignore the binding, and what is the one-line fix?

**Q13.** (JOSE-structure reading — DPoP preview.) A DPoP proof's JOSE header contains only `{"alg":"ES256",
"kid":"k1","typ":"dpop+jwt"}`. The server responds: *"The DPoP header did not include a public key in JWK
format."* RFC 9449 §4.2 requires a specific header member. Which member is missing, and why is `kid` alone
insufficient?

## Tier 4 — Adversarial and design (3)

**Q14.** You control a client registered against a verifier that fetches issuer public keys from a JWKS and
selects the verification algorithm from the token's `alg` header. Describe, step by step, an **RS256→HS256
confusion** exploit that lets you forge a valid-looking token, and state exactly what the operator must change
to close it.

**Q15.** Defend the claim **"decode ≠ verify"** to a skeptical engineer who says "our tokens are JWTs, so
they're secure." Give a concrete production scenario where conflating the two yields account takeover, and
enumerate every check a correct verifier must perform on an incoming access token.

**Q16.** You must convey a small secret value to a partner service inside a token, but the token will pass
through the end user's browser (front channel) on its way there. Design the safest approach. Name the token
type you'd use (if any), what you would *not* do, and how your design survives a browser-resident attacker
(malicious extension) who can read the token.
