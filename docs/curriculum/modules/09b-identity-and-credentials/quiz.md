# Module 09b — Quiz

18 items across four tiers. Don't advance to Module 10 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** Per RFC 9901 §4.2.1, a Disclosure for an object property is a base64url-encoded JSON array of:
- A) `[claim name, claim value]`
- B) `[salt, claim name, claim value]`
- C) `[claim name, salt, claim value]`
- D) `[digest, salt, claim value]`

**Q2.** RFC 9901 §4.2.3 requires the digest to be computed over:
- A) the UTF-8 bytes of the decoded JSON array
- B) the US-ASCII bytes of the base64url-encoded Disclosure string
- C) the claim value only, salted
- D) the canonical JSON serialization of the array

**Q3.** If the `_sd_alg` claim is absent from the top level of an SD-JWT payload, RFC 9901 §4.1.1 requires:
- A) rejecting the SD-JWT  B) a default of `sha-256`  C) a default of `sha-512`  D) negotiating out of band

**Q4.** The four REQUIRED payload claims of a Key Binding JWT (RFC 9901 §4.3) are:
- A) `iss`, `sub`, `aud`, `exp`
- B) `iat`, `aud`, `nonce`, `sd_hash`
- C) `jti`, `htm`, `htu`, `ath`
- D) `iat`, `exp`, `cnf`, `sd_hash`

**Q5.** Per OpenID Federation §9, an Entity Configuration is located by:
- A) resolving the `jwks_uri` in the entity's OIDC discovery document
- B) concatenating `/.well-known/openid-federation` to the Entity Identifier
- C) querying the Trust Anchor's subordinate listing endpoint
- D) an out-of-band exchange during registration

## Tier 2 — Applied reasoning (5)

**Q6.** Why does a Disclosure contain a salt at all? The strongest answer is:
- A) To make each Disclosure unique so the `_sd` array can be sorted
- B) Because claim values are drawn from small predictable sets, so an unsalted digest could be brute-forced
  to recover the withheld value
- C) To bind the Disclosure to a particular Holder
- D) To prevent the Issuer from reissuing the same credential twice

**Q7.** A verifier receives an SD-JWT+KB. It decodes each Disclosure, reads the values, and merges them into
the payload. The issuer's signature verifies. What is the flaw?
- A) It should verify the KB-JWT first
- B) It never recomputes digests, so an attacker can append any Disclosure they invent and have it accepted
- C) It should reject Disclosures with fewer than three elements
- D) Nothing — the Issuer signature covers the Disclosures

**Q8.** A team argues: "We use SD-JWT, so our users' presentations are unlinkable." What is wrong?
- A) Nothing, provided key binding is used
- B) The issuer-signed JWT is byte-identical across presentations, so colluding Verifiers link trivially; and
  issuer/verifier unlinkability against a coerced Verifier is unachievable in salted-hash schemes
- C) Unlinkability requires `direct_post.jwt`
- D) It only holds if the credential contains no `sub` claim

**Q9.** Which best describes what `verified_claims` (OIDC Identity Assurance) adds?
- A) A stronger signature algorithm over the identity claims
- B) Encryption of sensitive claims at rest
- C) Metadata about how, when, and under what trust framework the claims were established — provenance, not
  cryptography
- D) A binding of the claims to the holder's key

**Q10.** In OID4VCI's pre-authorized code flow, what problem does `tx_code` solve?
- A) It authenticates the Credential Issuer to the Wallet
- B) It prevents an attacker who observed the QR code — for example by standing behind the End-User — from
  replaying the pre-authorized code
- C) It binds the credential to the Wallet's key
- D) It replaces PKCE for wallets

## Tier 3 — Trace and diagnose (4)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** A verifier decides whether to enforce key binding like this:

```js
const parts = presentation.split('~');
const kbJwt = parts.at(-1);
if (kbJwt !== '') verifyKeyBinding(kbJwt, sdJwtPayload.cnf.jwk);
processClaims(sdJwtPayload);
```

Name the attack in one sentence, and quote the requirement it violates.

**Q12.** An implementation computes disclosure digests like this:

```js
const arr = JSON.parse(base64urlDecode(disclosure));
const digest = sha256base64url(JSON.stringify(arr));
```

It verifies credentials it issued itself, but rejects every credential from partner issuers. Why?

**Q13.** A server exposes an OpenID Federation entity-configuration endpoint. Every request returns:

```
HTTP/1.1 400 Bad Request
{"error":"Bad Request","message":"API error occurred: {\"resultCode\":\"A126203\",
 \"resultMessage\":\"[A126203] The request body is missing or empty.\"}","stack":"ResultError: …/home/…"}
```

The caller sent a well-formed `GET` with no body, as the specification requires. Identify **three** separate
defects visible in this response, and say which layer owns each.

**Q14.** An issuer's credential template makes these claims selectively disclosable:
`given_name`, `family_name`, `birthdate`, `exp`, `cnf`. A verifier implements all of RFC 9901 §7.1 correctly.
State the two distinct attacks this template enables, and name the section the issuer violated.

## Tier 4 — Adversarial and design (4)

**Q15.** You are reviewing an age-verification deployment: a government issuer, a wallet app, and ~4,000
retail verifiers. The design uses one long-lived SD-JWT VC per citizen, key binding required, and each
verifier requests only `over_18`. Write the review. Cover: (a) what this design gets right; (b) the
correlation exposure, precisely, including what two colluding retailers learn and what the issuer could learn
if it coerced one; (c) which mitigation you recommend and what it costs operationally; (d) one thing you would
require of every verifier's implementation, and the test you would use to confirm it.

**Q16.** An attacker has read access to a verifier's request logs, which record every presentation received in
full. For each, state precisely what the attacker can do: (a) a bare SD-JWT with no key binding; (b) an
SD-JWT+KB; (c) the Disclosures alone, separated from the issuer-signed JWT; (d) the `sd_hash` values alone.
Then state what an attacker would need *in addition* to the logs to impersonate a holder, and what you would
change about the logging.

**Q17.** Compare **key binding** (RFC 9901) with **DPoP** (RFC 9449, Module 05) as proof-of-possession
mechanisms. Give at least three structural differences — consider who issues the confirmation key, when it is
committed, what the proof is bound to, and who verifies it. Then explain why key binding needs both `nonce`
and `aud` while a DPoP proof needs `htm`/`htu`, and what that tells you about the difference between the two
threat models.

**Q18.** Your organisation must decide between (i) issuing SD-JWT VCs to a wallet, and (ii) staying with OIDC
and `verified_claims` from a central OP. State the criteria you would judge on, then give and defend a
recommendation for each of: (a) a national digital identity programme; (b) an internal employee-attribute
service inside one company; (c) a consortium of twelve banks doing mutual KYC. For at least one, argue
against the option that sounds more modern — and explain what problem the credential model creates that the
central-OP model does not have.
