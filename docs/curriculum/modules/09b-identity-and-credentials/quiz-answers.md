# Module 09b — Answer Key

Every answer explains **why the wrong options are wrong**, because most of them are things people actually
believe.

---

## Tier 1 — Recall

### Q1 — **B) `[salt, claim name, claim value]`**

RFC 9901 §4.2.1 requires "a JSON array of three elements in the following order: 1. A salt value. MUST be a
string. 2. The claim name, or key, as it would be used in a regular JWT payload. 3. The claim value".

- **A** is the array-element form minus the salt. For an *array element* (§4.2.2) a Disclosure has **two**
  elements — `[salt, value]` — because there is no claim name. Never zero salt.
- **C** inverts salt and name. Order is normative; a verifier reads position 1 as the name.
- **D** confuses the Disclosure with what goes *in* the JWT. The digest is derived from the Disclosure; it is
  never inside it.

### Q2 — **B) the US-ASCII bytes of the base64url-encoded Disclosure string**

§4.2.3: "The digest MUST be computed over the US-ASCII bytes of the base64url-encoded value that is the
Disclosure." The RFC even restates it: "The input to the hash function MUST be the base64url-encoded
Disclosure, not the bytes encoded by the base64url string."

- **A** is the single most common implementation bug. See Q12.
- **C** is what a naïve design would do, and it is exactly what the salt exists to prevent (Q6).
- **D** is tempting because canonicalization *sounds* rigorous, but SD-JWT deliberately avoids needing a JSON
  canonicalization scheme by hashing the transmitted string. That is a design win: no canonicalization means
  no canonicalization bugs.

### Q3 — **B) a default of `sha-256`**

§4.1.1: "If the `_sd_alg` claim is not present at the top level, a default value of `sha-256` MUST be used."

- **A** would break interoperability with issuers that legitimately rely on the default.
- **C** is not the default.
- **D** — the whole point of a specified default is that no negotiation is needed.

### Q4 — **B) `iat`, `aud`, `nonce`, `sd_hash`**

§4.3 lists exactly these four as REQUIRED in the KB-JWT payload, plus `typ: kb+jwt` and a non-`none` `alg` in
the header.

- **A** is the generic registered-claim set; `iss`/`sub`/`exp` are not required here.
- **C** is the DPoP proof claim set (RFC 9449) — a good distractor precisely because both are
  proof-of-possession mechanisms. See Q17.
- **D** puts `cnf` in the wrong document: `cnf` is in the **issuer-signed JWT**, not the KB-JWT. The KB-JWT
  *proves* the key that `cnf` *names*.

### Q5 — **B) concatenating `/.well-known/openid-federation` to the Entity Identifier**

OpenID Federation 1.0 §9: "Its location is determined by concatenating the string
`/.well-known/openid-federation` to the Entity Identifier". Note also that a trailing `/` on the Entity
Identifier "MUST be removed before concatenating."

- **A** confuses federation with OIDC discovery. Different document, different purpose.
- **C** inverts the direction: discovery starts at the leaf and walks *up* via `authority_hints`.
- **D** is precisely what federation exists to eliminate.

---

## Tier 2 — Applied reasoning

### Q6 — **B) claim values come from small predictable sets, so an unsalted digest could be brute-forced**

This is the requirement that forces the design. `SHA-256("true")` is a constant; `over_18` has two possible
values, `nationality` about two hundred. Without a salt, a verifier holding an unopened digest could
enumerate the value space in microseconds and learn exactly what the holder chose to withhold — which would
make selective disclosure decorative.

§9.3 says it directly: the randomness "makes it infeasible to guess the preimage of the digest … by
enumerating the potential value space for a claim into the hash function to search for a matching digest
value."

- **A** describes a side effect, not the purpose. Sorting hides claim *order* (§4.2.4.1); the salt hides claim
  *values*.
- **C** is key binding's job (`cnf` + KB-JWT). The salt has nothing to do with the holder.
- **D** is not a property SD-JWT provides at all.

### Q7 — **B) it never recomputes digests, so an attacker can append any Disclosure they invent**

This verifier checks that the *issuer's signature* is valid and then trusts *unsigned* data attached
alongside it. The signature covers the digests in `_sd`; it does not cover the Disclosures directly. The only
thing linking a Disclosure to the signature is the digest match — and this implementation never computes it.

RFC 9901 §7.1/5: "If any Disclosure was not referenced by digest value in the Issuer-signed JWT … the SD-JWT
MUST be rejected." You demonstrated this in Lab 5c: the forged disclosure was caught at §7.1/5, **not** at the
signature check, because the signature was never touched.

- **A** is a real ordering concern but not the flaw; even with the KB-JWT verified first, forged Disclosures
  still sail through.
- **C** is one of the checks in §7.1/3.c.ii.1, but adding only that still accepts a well-formed forgery.
- **D** is the actual misconception being tested. The signature does **not** cover the Disclosures.

### Q8 — **B) the issuer-signed JWT is byte-identical across presentations; and issuer/verifier unlinkability against a coerced Verifier is unachievable**

Both halves matter, and you measured the first one in Lab 6: two presentations disclosing *disjoint* claims
shared a byte-identical issuer-signed JWT and an identical `cnf.jwk`. Colluding verifiers need to compare one
string.

The second half is quoted from §10.1: it "cannot be achieved in salted hash-based selective disclosure
approaches, such as SD-JWT, as the issued credential with the Issuer's signature is directly presented to the
Verifier, who can forward it to the Issuer."

- **A** — key binding is orthogonal. It stops replay by non-holders; it does nothing about correlation, and
  the `cnf` key is itself a stable correlator.
- **C** confuses transport with linkage. A response mode changes who sees the message in transit, not what
  two recipients can compare afterwards.
- **D** — removing `sub` does not help when the entire signed JWT is a stable identifier.

### Q9 — **C) provenance metadata — how, when, and under what trust framework**

§5.1: "a container element, called `verified_claims`, to provide the RP with a set of claims along with the
respective metadata and verification evidence." Two identical, identically-signed tokens can carry claims of
wildly different assurance; `verified_claims` is what makes the difference legible.

- **A** — the signature algorithm is unchanged. This is the misconception the question exists to break.
- **B** — no encryption is involved.
- **D** — that is `cnf` / key binding, a different mechanism in a different spec.

### Q10 — **B) it prevents replay by an attacker who observed the QR code**

OID4VCI §3.5: "The Transaction Code is intended to bind the Pre-Authorized Code to a certain transaction to
prevent replay of this code by an attacker that, for example, scanned the QR code while standing behind the
legitimate End-User."

Worth pausing on: this is a **physical-proximity** threat model, which is unusual in this curriculum. The
pre-authorized flow has no authorization request and no user authentication at the AS, so the code alone is a
bearer credential displayed on a screen in public.

- **A** — issuer authentication comes from TLS and issuer metadata.
- **C** — that is the proof-of-possession / `cnf` mechanism.
- **D** — PKCE protects the authorization-code flow; the pre-authorized flow has no authorization request for
  PKCE to protect. Different problem, which is why a different mechanism was needed.

---

## Tier 3 — Trace and diagnose

### Q11

**Attack.** An attacker who intercepts an SD-JWT+KB deletes everything after the final `~`, turning it into a
bare SD-JWT; `kbJwt` is then the empty string, the `if` is skipped, and the claims are processed with **no
proof of possession at all**. The stolen credential is now usable by anyone.

**Requirement violated.** §7.3/1: "Determine if Key Binding is to be checked according to the Verifier's
policy for the use case at hand. This decision MUST NOT be based on whether or not a Key Binding JWT is
provided by the Holder." §9.5 names the consequence: "otherwise, an attacker could strip the KB-JWT from an
SD-JWT+KB and present the resultant SD-JWT."

**Fix.** Decide from policy before parsing, and fail closed:

```js
const requireKb = policy.forUseCase(useCase).keyBinding;   // not derived from input
if (requireKb && kbJwt === '') reject('key binding required');
```

**The general shape** — and this is why the item exists — is *the input decided the policy*. You have now seen
it three times: `alg: none` (Module 08), a request that selects its own security level (Module 05), and this.

### Q12

**Defect.** It decodes the Disclosure to a language object and **re-serializes** it before hashing.
`JSON.stringify` emits no spaces after separators; many issuers (including the examples in RFC 9901 itself)
emit `", "`. Same JSON value, different bytes, different digest.

Its own credentials work because it produced and consumed them with the same serializer — the bug is
invisible until interoperability. That is why it fails only against partner issuers.

**Requirement violated.** §4.2.3: the digest is computed over "the US-ASCII bytes of the base64url-encoded
value that is the Disclosure", and "The input to the hash function MUST be the base64url-encoded Disclosure,
not the bytes encoded by the base64url string."

**Fix.** Hash the received string; decode only to read the value, never to re-encode it:

```js
const digest = sha256base64url(Buffer.from(disclosure, 'ascii'));   // the string as received
const [, name, value] = JSON.parse(base64urlDecode(disclosure));    // read-only
```

You reproduced this in Lab 5d, where a whitespace-only change was rejected.

### Q13

Three defects, three owners:

1. **The SDK call omits a required request body.** The client library types `requestBody` as optional, so
   omitting it compiles; Authlete requires a body, even `{}`. **Owner: this server's service layer.** Fix:
   pass `requestBody: {}`. One line.
2. **An unhandled SDK exception reaches the generic error handler,** so a federation endpoint answers with
   `{"error":"Bad Request"}` instead of a federation- or OAuth-shaped error, and the response reports an
   upstream failure as a client error. **Owner: this server's controller.** Fix: handle the documented
   `action` values and emit a typed error.
3. **A stack trace with absolute filesystem paths is returned to an unauthenticated caller** on a public
   discovery endpoint — internal directory structure and module layout, free to anyone. **Owner: the error
   handler / deployment configuration.** Fix: never serialize `stack` on public routes.

There is also a **fourth, non-defect** worth naming: underneath all of it the service genuinely lacks a
federation JWK Set (`[A316201]`), which is a *configuration* gap. The reason it deserves mention is that
defect 1 makes it **invisible** — you cannot diagnose the real problem through the endpoint, only by calling
Authlete directly. A server config error reported as a caller error is the recurring theme; you saw it in
Module 06 (`"Bad Request"` for a Zod failure) and Module 08 (`"Invalid logout token"` for an unset
`JWKS_URI`).

### Q14

**Attack 1 — the expired credential that never expires.** With `exp` selectively disclosable, the holder
simply does not forward that Disclosure. The processed payload contains no `exp`, so a verifier that checks
"`exp` if present" finds nothing to check and accepts a credential that expired years ago. You ran this in
Lab 5e.

**Attack 2 — key binding silently disabled.** With `cnf` selectively disclosable, the holder withholds it. A
verifier that reads the holder key from `cnf` now has no key to check against. Depending on the
implementation this either crashes or — much worse — skips key binding, converting the credential back into a
bearer token for anyone who obtains it. Note this composes with the Q11 defect: two independently mild
mistakes produce a fully replayable credential.

**Section violated.** §9.7: "An Issuer MUST NOT allow any content to be selectively disclosable that is
critical for evaluating the SD-JWT's authenticity or validity", which lists `iss`, `aud`, `exp`, `nbf`, and
`cnf`. (`given_name`, `family_name`, `birthdate` are all fine to make disclosable — that is the feature.)

**The verifier-side defence, which is the real lesson.** §9.7 does not stop at blaming the issuer: verifiers
"cannot reliably depend on" issuers doing this correctly and "MUST ensure that all claims they deem necessary
for checking the validity of an SD-JWT in the given context are present (or disclosed, respectively)". So the
verifier declares its required validity claims up front and treats absence as rejection — `--require-claims
exp` in the lab tool.

---

## Tier 4 — Adversarial and design

These are free-response. What follows is a strong answer, not the only one. Grade yourself on whether you
reached the *reasoning*, not on matching the words.

### Q15 — Age verification at national scale

**(a) What it gets right.** Data minimisation is genuine and substantial: a retailer learns one boolean where
today it sees a full date of birth, a document number, a photograph, and an address. Key binding is required,
so a leaked credential is not directly replayable. `vct` lets a retailer's policy accept only the government
credential type rather than anything carrying an `over_18` claim. This is a real improvement over showing a
driving licence, and the review should say so before criticising.

**(b) The correlation exposure, precisely.**

- *Two colluding retailers.* Both receive the **byte-identical issuer-signed JWT** and the identical
  `cnf.jwk`. Neither learns anything from the disclosed claims — both saw only `over_18: true` — yet either
  string identifies the citizen across both datasets perfectly. They can therefore reconstruct a joint
  purchase history for a pseudonymous individual. Add a single retailer with a loyalty card, and the
  pseudonym resolves to a name. §10.1's *Verifier/Verifier Unlinkability* fails by default.
- *The coerced retailer.* If the government issuer compels one retailer to hand over stored presentations, it
  can match them against its own issuance records and learn where and when a specific citizen proved their
  age. §10.1 states this cannot be prevented in salted-hash schemes, and explicitly warns about the power
  dynamic: a governmental issuer "might have the authority to mandate that a Verifier report back". For an
  age-verification system this is the whole risk — it converts alcohol purchases into state-visible events.

**(c) Mitigation.** Batch issuance: many single-use credentials per citizen, each with a distinct holder key
and fresh salts, with the wallet burning one per presentation. This restores verifier-to-verifier
unlinkability. Costs: issuance volume rises by orders of magnitude; the wallet must manage a pool and refill
it, which needs connectivity and therefore reintroduces an issuer contact point that must itself not become a
tracking channel; revocation gets harder because there is no longer one credential to revoke. Issuer/verifier
unlinkability against a coerced verifier is **still not achieved** — say so plainly rather than implying the
mitigation is complete.

**(d) One requirement of every verifier, and its test.** Require key binding **from policy, not from input**,
and verify it with a negative test in a conformance suite: submit an SD-JWT+KB with the KB-JWT stripped and
require a rejection. Any verifier that accepts it is running Q11's code, and with 4,000 verifiers, some will
be. A strong answer notes that requiring something of 4,000 independent implementations is a *governance*
problem — the technical control is a conformance programme with teeth, not a sentence in a PDF.

### Q16 — The verifier's logs

- **(a) Bare SD-JWT, no key binding.** Full replay, at any verifier that does not require key binding. It is a
  bearer credential; the log is a credential store. The attacker also reads every disclosed claim in plaintext.
- **(b) SD-JWT+KB.** All disclosed claims, immediately. Replay is *mostly* blocked: `aud` pins the intended
  verifier and `nonce` pins the transaction, so a correct verifier rejects a replay. Two caveats that a good
  answer includes: it can be replayed against the **same** verifier if that verifier does not track used
  nonces, and — critically — it can be **stripped** to a bare SD-JWT and presented to any verifier with a
  weaker policy (Lab 5a). Logging SD-JWT+KBs is therefore not much safer than logging bare ones.
- **(c) Disclosures alone.** Every disclosed claim value, in plaintext, plus the salts. Useless for replay
  without the signed JWT, but a complete privacy breach — and the salts let the attacker recompute digests to
  match those disclosures against any other corpus of credentials they hold.
- **(d) `sd_hash` values alone.** No claim content. But they are **stable per (credential, disclosure-set)**
  pair, so they work as correlation tokens across log sets: the same citizen making the same kind of
  presentation produces the same `sd_hash`. Low severity alone, useful in aggregate.

**What the attacker additionally needs to impersonate a holder:** the holder's **private key** — the one
matching `cnf.jwk`. Nothing in the logs contains it. That is precisely the value key binding delivers: it
moves the secret out of everything that gets transmitted, logged, cached, or breached, which is the same
argument DPoP makes in Module 05.

**Logging changes.** Do not log presentations at all by default. If audit demands proof that a check occurred,
log a *decision record* — `vct`, issuer, timestamp, the boolean outcome, and a salted hash of the
presentation for dispute resolution — never the presentation itself. If raw retention is genuinely required,
scope it to a short window with separate access control, and note that §10.2 exists to push exactly this
way.

### Q17 — Key binding vs DPoP

Structural differences (three are asked for; these are the substantive ones):

| | Key binding (RFC 9901) | DPoP (RFC 9449) |
|---|---|---|
| Who commits the key | The **issuer** embeds `cnf` at issuance | The **client** presents its own key; the AS records `cnf.jkt` at token issuance |
| When committed | Once, possibly years before use | Per token, minutes before use |
| What the proof binds to | `sd_hash` — the **exact subset of claims** being shown | `htm`/`htu` — the **HTTP method and URI**, plus `ath` for the token |
| Who verifies | A verifier that may never contact the issuer | A resource server that can usually introspect |
| Proof type header | `typ: kb+jwt` | `typ: dpop+jwt` |
| Public key transport | In the credential (`cnf.jwk`), signed by the issuer | In the proof's own JOSE header (`jwk`) |

**Why the claims differ.** DPoP defends a *request*: the danger is a stolen token replayed against some
endpoint, so the proof pins the method and URI, and `ath` pins the token. Key binding defends a
*presentation*: the danger is a captured presentation replayed at a different verifier or at a later time, so
the proof pins the **audience** and a **nonce** the verifier chose. There is no `htu` because a presentation
is not tied to one URL — the wallet may hand it over by QR code, NFC, or `direct_post`.

**What this reveals about the threat models.** DPoP assumes an online AS and a network attacker acting inside
a live session, so freshness comes cheaply from the transport. Key binding assumes an offline issuer and a
holder who may themselves be adversarial, so freshness must be *carried in the message* — hence a
verifier-supplied `nonce` (which OID4VP §5.2 requires the verifier to generate freshly per request). Same
cryptographic pattern, different assumptions about who is online and who is hostile. A strong answer also
names it as the fourth appearance of commit-then-prove after PKCE, DPoP, and `at_hash`/`c_hash`.

### Q18 — Credentials or a central OP

**Criteria.** Number of parties and whether bilateral registration scales; whether the verifier can reach the
issuer at decision time; whether data minimisation has legal or commercial force; revocation latency
tolerance; correlation/privacy requirements; who bears wallet-loss and key-recovery cost; regulatory
recognition; and — the one most often skipped — **who is on the hook when a verifier implements it wrong.**

**(a) National digital identity — credentials (SD-JWT VC).** The verifier population is enormous and
unenumerable, offline presentation is a hard requirement (border posts, rural pharmacies), and data
minimisation is typically a legal mandate. A central OP would also mean the state receives a real-time
authentication event for every use of identity, which is a surveillance architecture whether or not anyone
intends it. Accept the costs: batch issuance, a revocation strategy, and a conformance programme.

**(b) Internal employee attributes — central OP with `verified_claims`. Argue against the modern option
here.** Every verifier is your own service, on your network, able to reach the OP in single-digit
milliseconds. You get *instant* revocation — an employee is terminated and access dies on the next
introspection, versus a credential valid until its `exp` no matter what HR did. You get central audit for
free. Correlation is not a threat, because it is one organisation and correlation is called "logging." A
wallet here buys you offline capability nobody needs and key-recovery support tickets nobody wants. Choosing
credentials for this is choosing a distributed-systems problem you did not have.

**(c) Twelve banks doing mutual KYC — the interesting one.** Twelve is small enough that bilateral works and
large enough (66 pairs) that it is annoying. Recommendation: **OpenID Federation for trust establishment,
plus `verified_claims` for assurance** — not wallets. KYC data is heavyweight and audited, the parties are
online and contractually bound, and regulators will want a queryable trail rather than an unlinkable one.
Federation solves the actual pain (O(n²) registration) with a trust anchor the consortium already
effectively is. Reconsider only if a regulator mandates citizen-held credentials.

**The problem the credential model creates that the central-OP model does not have:** **revocation.** With a
central OP, revocation is a database write and takes effect on the next call. With credentials the verifier
never contacts the issuer — that is the entire point — so a cancelled credential stays cryptographically
valid until it expires. Every proposed fix (status lists, short-lived credentials with refresh, online status
checks) either reintroduces the issuer contact you were avoiding, damages the unlinkability you were buying,
or both. **If someone presents a credential architecture and cannot tell you their revocation latency and
which privacy property their revocation check destroys, they have not finished designing it.**
