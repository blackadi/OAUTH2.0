# Module 00 — Quiz Answers

Each answer explains **why the right answer is right and why the tempting wrong ones are wrong.**

---

## Tier 1 — Recall

**Q1 — D) RFC 7515.** JWS is RFC 7515. Distractors: 7519 is JWT (claims), 7517 is JWK (keys), 7516 is JWE
(encryption). Easy to blur because they were published together (May 2015).

**Q2 — A) `BBB` (the middle segment).** `header.payload.signature`. `AAA` is the header (`alg`/`kid`/`typ`);
`CCC` is the signature over the first two.

**Q3 — C) a reversible text encoding.** base64url just remaps bytes to URL-safe characters. It provides **no**
confidentiality (not A), does not sign (not B), and is reversible so it is not a hash (not D). This is the
single most consequential misconception in the module.

**Q4 — B) the front channel.** By definition the front channel is relayed via the user agent. The back
channel (A) is server-to-server. C and D are endpoints, not channels.

## Tier 2 — Applied reasoning

**Q5 — B.** Secrets belong on the back channel because the browser never sees those bytes. **A/C are the
shallow trap:** "it's HTTPS so it's fine" confuses *transport* protection with *endpoint/user* exposure — TLS
does nothing about the user agent reading a value that passes through it. D is nonsense; users shouldn't audit
secrets.

**Q6 — B.** Decoding is not verifying. Without checking the signature (and `iss`/`aud`/`exp`), any attacker
can forge the `role` claim. A, C, D are cosmetic checks that a forged token passes trivially — they're the
distractors a shallow model reaches for because they *look* like validation.

**Q7 — C) JWE.** Confidentiality requires encryption. **A/B are the trap:** a signature proves integrity and
origin but leaves the payload fully readable — a "stronger" signing algorithm changes nothing about
readability. D (double-encoding) is still just encoding.

**Q8 — B.** Pin the algorithm and use the matching public key. **A is the classic vulnerability** (letting the
token pick the algorithm enables `none` and RS/HS confusion). C is worse (it maximizes confusion surface). D
ignores the signature entirely.

**Q9 — C.** Front-channel data is attacker-influenceable at the user agent regardless of TLS. **A/B are the
trap:** "TLS protected it" / "it came from the AS" both confuse in-transit protection and source with
end-point tamper-resistance. D is wrong because *all* front-channel values are suspect, not just `state`.

## Tier 3 — Trace and diagnose

**Q10.** **Defect:** the code base64url-decodes the payload and trusts `scope` **without verifying the
signature** — textbook decode-as-verify. **Affected concept:** JWS signature verification (RFC 7515) + claim
validation. **Consequence:** any user can craft a token with `scope:"admin"` (exactly the Break 1 exercise)
and get admin access; the forged signature is never checked. **Fix:** verify the JWS against the issuer's JWKS
key with a pinned algorithm, then check `iss`, `aud`, and `exp`, *before* reading `scope`.

**Q11.** **Attack 1 — `alg:none`:** an attacker submits an unsigned token; the verifier accepts it because
`none` is allowed → total forgery. **Attack 2 — RS256/HS256 confusion:** the attacker sends `alg:HS256` and
HMACs with the issuer's *public* RSA key (which is public); a verifier that honors the header algorithm and
uses that key will validate the forgery. **Fix:** remove `none`, and pin a single algorithm bound to the key
type (e.g. `RS256` only), never selected from the token header.

**Q12.** **Why it fails:** RFC 9449 §4.3 requires the proof to bind to the specific access token via `ath` =
base64url(SHA-256(access_token)). A `sub` claim carries no binding, so the server cannot confirm the proof was
made for *this* token and rejects/ignores the DPoP binding — decoding "looks fine" precisely because structure
≠ semantics. **Fix:** compute and include `ath` (the `decode-jwt.mjs --ath` flag shows the value); drop `sub`.
*(This is documented in `AGENTS.md` and covered fully in Module 05.)*

**Q13.** **Missing member:** the JOSE header must include **`jwk`** — the full **public key** in JWK form
(RFC 9449 **§4.2**, *"DPoP Proof JWT Syntax"* — note that RFC 9449 has no §2.1; §2 is "Objectives" and has no
subsections). **Why `kid` is insufficient:** `kid` is only a *reference*; the server has never seen this
ephemeral client-generated key, so it needs the actual public key inline to verify the proof's signature and
compute the key thumbprint. **Fix:** add the `jwk` member to the proof header. *(Also in `AGENTS.md`; Module
05.)*

## Tier 4 — Adversarial and design

**Q14 — model answer.** Exploit: (1) Fetch the issuer's **public** RSA key from its JWKS (it's public by
design). (2) Craft a token with header `{"alg":"HS256"}` and whatever payload you want (`sub`, `scope`).
(3) Compute the signature as `HMAC-SHA256(key = the PEM/bytes of that public RSA key, data =
header.payload)`. (4) Submit it. A verifier that (a) reads the algorithm from the token header and (b) looks
up "the issuer's key" without binding algorithm↔key-type will run HMAC-SHA256 using the public key as the
shared secret — which you also have — so the signature verifies. **Fix the operator must make:** pin the
accepted algorithm to the key's type (RSA key ⇒ only `RS256`/`PS256`, never HMAC), reject `alg` values that
don't match the key, and never let the token choose the algorithm. Full credit also notes: disallow `none`,
and prefer libraries that require you to specify the algorithm explicitly.

**Q15 — model answer.** "JWT" describes a *format*, not a security property; a JWT you only *decoded* is
attacker-controlled input. **Scenario:** an SPA reads `role` from a decoded access token to show/hide admin
features *and* the API trusts the same token by decoding it; a user edits the payload (`role:"admin"`, Break
1) and the API, which never verifies the signature, grants admin → account/tenant takeover. **A correct
verifier must:** (1) confirm the token is a well-formed JWS; (2) select a **pinned** algorithm matching the
key type; (3) verify the signature against the issuer's current JWKS key (by `kid`); (4) check `iss` equals
the expected issuer; (5) check `aud` includes this resource server; (6) check `exp`/`nbf` (and often `iat`
freshness); (7) only then read authorization claims (`scope`/`role`/`authorization_details`). Missing any of
1–6 reopens forgery or misdelivery.

**Q16 — model answer.** Best answer: **don't put a secret in a front-channel artifact at all** — deliver it on
the back channel (server-to-server) and pass only a non-secret reference through the browser. If a token
*must* carry confidential data through the browser, use a **JWE** (encrypted to the partner's public key) so a
browser-resident attacker sees only ciphertext; still add `aud` (the partner), a short `exp`, and treat the
value as single-use. What **not** to do: put the secret in a signed-but-unencrypted JWS (readable by the
extension), or rely on "it's HTTPS." Survival against a malicious extension: the extension can read the token
bytes, but with a JWE it cannot decrypt them; with a back-channel-only secret it never sees them; short
lifetime + audience binding limit the blast radius if the ciphertext is captured. Full credit notes that even
a JWE in the browser can be *replayed* if not audience/time-bound or sender-constrained (a hook into Module 05
DPoP/mTLS).
