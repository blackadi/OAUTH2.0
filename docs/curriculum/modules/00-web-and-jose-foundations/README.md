# Module 00 — Web + JOSE Foundations

**The short version:** OAuth and OpenID Connect are built entirely on two things — HTTP messages that travel
*through a browser you do not control*, and JSON tokens that are *signed or encrypted* with the JOSE
standards. Before any grant makes sense, you need to know exactly which party can read or change which bytes,
and what a signature does and does not prove. This module nails down the medium and the envelope. Everything
after it is a variation on "who can tamper with this, and how do we stop them."

## Prerequisites

None. Comfort with a terminal and a rough idea of what an HTTP request looks like will help. This is the
foundation the `docs/` tutorials silently assume.

## Why this module exists

Almost every OAuth attack you will study later is, at its root, a failure to reason about **who controls the
bytes**. The authorization-code flow sends data *through the user's browser* — a party that can read and
rewrite anything it relays. Token theft, mix-up attacks, and code interception all exploit the gap between
"the protocol drew an arrow from A to B" and "the bytes physically passed through an untrusted C in between."
If you do not internalize the front-channel/back-channel distinction now, those attacks will look like magic
later. They are not magic; they are consequences of the medium.

The second half is the envelope. A **JWT** looks cryptographic, so developers routinely assume that being
able to decode one means it is trustworthy. This is false and it is one of the most common real-world
authorization bugs. A standard signed JWT (a **JWS**) is *base64url text that anyone can read* — the
signature proves origin and integrity, but only if someone actually **verifies** it against the right key.
Decoding is free; trust is earned by verification. An enormous class of breaches comes from (a) trusting a
decoded token without verifying the signature, (b) mishandling the `alg` header so an attacker chooses the
algorithm, or (c) verifying the signature but forgetting to check `exp`, `aud`, or `iss`.

Third, TLS. People treat "it's HTTPS" as "it's secure," full stop. TLS protects bytes *in transit between two
endpoints* against eavesdropping and tampering. It does **not** protect you from the endpoints themselves,
and it does **not** stop the human at the browser from reading and editing a redirect URL that passes through
their own machine. The front channel is encrypted on the wire and still fully visible and editable at the
user agent. Holding those two facts at once — "encrypted in transit" *and* "readable/editable at the
endpoint" — is the whole game.

So this module is deliberately not about OAuth. It is about the ground OAuth stands on, taught first so that
nothing later has to hand-wave over it.

## Learning objectives

After this module you can:

1. Distinguish the **front channel** from the **back channel** and state, for each, which party can read and
   which can modify the data.
2. State precisely what TLS protects and what it does not — including why "it's HTTPS" says nothing about
   whether the user agent can tamper with a redirect.
3. Decode a JWT locally into its three parts and identify the base64url encoding, without any online tool.
4. Explain the difference between a **JWS** (signed) and a **JWE** (encrypted), and why a plain signed JWT is
   *not* confidential.
5. Name the JOSE family — JWS, JWE, JWK, JWA, JWT, JWK Thumbprint — and the RFC that defines each.
6. Describe at least three JWT failure modes (`alg:none`, RS256↔HS256 confusion, and skipped claim
   validation) and what an attacker gains from each.
7. Articulate the single most important idea in the module: **a decodable token is not a trustworthy token —
   decode ≠ verify.**
8. Read a **JWK** from a live JWKS endpoint and map its fields to the key it represents.

## Plain-language pass (no spec vocabulary)

Imagine you are sending messages across a city.

- A **courier** carries your messages, but the courier reads everything they carry and can rewrite it before
  handing it on. You would never write a password on a slip and trust the courier not to peek. *The browser
  is this courier.*
- Some routes run through an **armored pneumatic tube** between two post offices. Nobody on the street can
  see into the tube or cut into it. But the clerks at each end still read everything, and the tube does
  nothing about a dishonest clerk. *This is TLS: it protects the road, not the people at the ends.*
- A **wax-sealed document** can be read by anyone who holds it, but the seal proves who wrote it and shows if
  anyone altered it. *This is a signed token (JWS).*
- A **locked strongbox** can only be opened by someone with the key; passersby see a box, not its contents.
  *This is an encrypted token (JWE).*
- **Neat handwriting** is not a lock. It's legible to everyone. *This is base64url — an encoding, not
  protection.*
- A note that says *"trust me, no seal needed"* is exactly as trustworthy as it sounds. *This is `alg:none`.*

The one rule to carry forward: **being able to read a sealed document does not mean the seal is real.** You
have to check the seal against the writer's known signet. Checking is a separate, deliberate act.

## Specification pass (exact terminology) + the bridge

Now the same ideas in precise terms, with each analogy element mapped to its formal counterpart.

| Plain-language element | Formal concept | Defining reference |
|------------------------|----------------|--------------------|
| The courier who reads everything | **User agent / front channel** — data relayed via browser redirects | OAuth uses this in RFC 6749 §1.3.1 |
| Armored pneumatic tube | **TLS 1.3** transport encryption between two endpoints | RFC 8446 (Aug 2018) |
| Direct post-office-to-post-office line | **Back channel** — direct server-to-server HTTPS, no browser | RFC 9110 (HTTP Semantics, Jun 2022) + TLS |
| Wax seal on a readable document | **JWS** — JSON Web Signature (compact form `header.payload.signature`) | RFC 7515 |
| Who wrote it / the signet | Signing **key** + `alg`, identified via `kid`/issuer | RFC 7518 (JWA), RFC 7517 (JWK) |
| Locked strongbox | **JWE** — JSON Web Encryption | RFC 7516 |
| Neat handwriting | **base64url** encoding (URL-safe, usually unpadded) | RFC 4648 §5 |
| "Trust me, no seal" | The `alg: "none"` header value | RFC 7518 §3.6 |
| The claims written inside | **JWT** — registered claims `iss/sub/aud/exp/iat/nbf` | RFC 7519 |
| A fingerprint of the signet | **JWK Thumbprint** (used later for DPoP `jkt`) | RFC 7638 |

**Front channel vs. back channel — the definition to memorize:**

- **Front channel:** parameters carried in URLs through the **user agent** (browser). Encrypted on the wire by
  TLS, but fully **visible and modifiable at the user agent**. Anything you put here, assume the user — or
  malware in the user's browser, or a malicious page — can read and change it.
- **Back channel:** a direct HTTPS call **server to server**, with no browser in the path. The browser never
  sees these bytes. This is where secrets and token exchanges belong.

**JOSE compact serialization (the shape you will see constantly):**

```
BASE64URL(header) . BASE64URL(payload) . BASE64URL(signature)
   ^ alg, typ, kid       ^ the claims        ^ over header.payload
```

Three dot-separated base64url segments = a JWS. Five segments = a JWE (encrypted; the payload is not
readable without the key). The header's `alg` names the algorithm (e.g. `ES256`, `RS256`, `HS256`); `kid`
names which key; `typ` may be `JWT`, `at+jwt` (RFC 9068 access token), or `dpop+jwt` (RFC 9449 proof).

## Assigned reading

**None** — this module is written from scratch precisely because the `docs/` tutorials assume it. It is the
prerequisite for all of them.

What this module adds that the tutorials don't: the tutorials use JWS/JWK/`alg`/front-channel vocabulary as
if you already own it. Here you build that vocabulary and, importantly, the *security intuition* behind it —
so that when `docs/FAPI-TUTORIAL.md` says a DPoP proof is a `dpop+jwt` JWS with a `jwk` header and an `ath`
claim, you know exactly what each of those words means and why getting any of them wrong breaks the proof.

## Where this lives in the code

Reading real code alongside the spec is the point of having this repo. For JOSE specifically:

- **`client/src/services/dpop.service.ts`** — constructs a JWS **by hand**: builds the header (with the
  `jwk`), base64url-encodes header and payload, signs with `crypto.subtle`, and concatenates. The single best
  file in the repo for seeing a JWS assembled byte by byte. (Note the `AGENTS.md` gotchas: ES256 signatures
  must be raw P1363 R‖S, not DER; the proof carries `ath`, not `sub`. Those are JOSE-precision bugs — you'll
  meet them again in Module 05.)
- **`server/src/utils/createLocalJWT.ts`** — signs a JWT server-side with `jsonwebtoken` (dev-only).
- **`server/src/routes/jwks.routes.ts`** → `GET /api/.well-known/jwks.json`, served by
  **`server/src/controllers/jwks.controller.ts`** — publishes the service's public **JWK Set**.
- **`server/src/routes/discovery.routes.ts`** → `GET /api/.well-known/openid-configuration` — the metadata
  document that ties `jwks_uri`, `issuer`, and the endpoints together (you'll dissect this in Module 04).
- **Dashboard:** the **TokenVault** in the sidebar decodes stored tokens — the GUI equivalent of the
  `decode-jwt.mjs` script you'll use in the lab.

## Wire-level walkthrough

Three exchanges. For each, ask the one question that matters: **who can read this, and who can change it?**

**(1) A back-channel call (server → server, e.g. the token endpoint).**

```http
POST /api/token HTTP/1.1
Host: as.example.com                      # TLS to this host
Content-Type: application/x-www-form-urlencoded
Authorization: Basic czZC...              # client secret — safe ONLY because no browser is in the path

grant_type=authorization_code&code=SplxlOBeZQQ...&redirect_uri=...
```

*Who reads/changes it:* only the two servers and anyone who breaks TLS. The browser never sees these bytes.
*Attacker gain from tampering:* essentially none in transit if TLS is sound — which is exactly why client
secrets and code exchanges live here, not in the front channel.

**(2) A front-channel redirect (server → browser → server).**

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback?code=SplxlOBeZQQ...&state=xyz
```

The browser receives this, then makes the next request to `client.example.com`. *Who reads/changes it:* the
**user** and anything running in their browser — a malicious extension, a phishing page, another app
registered for the same custom URL scheme. TLS encrypted this on the wire, and it is *still* fully exposed at
the user agent. *Attacker gain from tampering:* swap the `code`, drop the `state`, or redirect to a different
client — the raw material for code interception (Module 03) and mix-up (Module 05).

**(3) Presenting a JWT to an endpoint.**

```http
GET /api/userinfo HTTP/1.1
Host: as.example.com
Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6ImF0K2p3dCJ9.eyJzdWIiOiJhZG1pbiIsImF1ZCI6Li4ufQ.<sig>
```

The token is three base64url segments. *Attacker gain from tampering each part, assuming the server verifies
correctly vs. not:*

| Tamper with… | If the server verifies the signature | If it only decodes (the bug) |
|--------------|----------------------------------------|------------------------------|
| **header** `alg`→`none` | Rejected: no valid signature | Catastrophic: attacker forges any token |
| **header** `alg` RS256→HS256 | Rejected if verifier pins the algorithm | Catastrophic: public key misused as HMAC secret |
| **payload** (e.g. `sub`, `scope`) | Rejected: signature no longer matches | Catastrophic: privilege escalation |
| **signature** | Rejected | N/A — but proves decoding never checked it |

Every "catastrophic" cell is the same root cause: **the server decoded instead of verified.**

## Diagram

```mermaid
%%{init: {'theme':'dark'}}%%
sequenceDiagram
    autonumber
    actor U as User
    participant B as User Agent (browser) — UNTRUSTED intermediary
    participant C as Client (server side)
    participant AS as Authorization Server

    Note over U,AS: FRONT CHANNEL (dashed) — through the browser, visible+editable at B
    U-->>B: opens link
    B-->>AS: GET authorization request (TLS on the wire)
    AS-->>B: 302 redirect with data in the URL
    B-->>C: GET callback?data=... (B could have altered this)

    Note over C,AS: BACK CHANNEL (solid) — server↔server, no browser, TLS
    C->>AS: POST token request (client secret / code)
    AS->>C: tokens (a JWS: header.payload.signature)

    Note over C: C must VERIFY the JWS signature + iss/aud/exp —<br/>decoding it is not enough
```

Front-channel legs (dashed, via **B**) are readable and editable by the user agent. Back-channel legs (solid,
**C↔AS**) never touch the browser. The token returned is a JWS the client must *verify*, not merely decode.

## Lab

See **[lab.md](lab.md)**. You will: inspect the live server's discovery, JWKS, and AS-metadata documents;
read a real **JWK** (an EC P-256 key); decode a sample JWT locally with `scripts/decode-jwt.mjs`; then **break
it** — tamper a claim, forge an `alg:none` token, and watch the decoder happily read a token that no correct
verifier would ever trust. The gap between "it decoded" and "it's valid" is the entire lesson.

## Threat notes — what breaks if you get this wrong

- **Decode-as-verify.** Trusting `JSON.parse(atob(payload))` without checking the signature lets anyone forge
  any claim. This is the module's headline threat and a real, recurring CVE class.
- **`alg:none`.** A verifier that honors the token's own `alg` and accepts `none` accepts unsigned tokens.
  Verifiers must pin the expected algorithm(s), never read `alg` as an instruction.
- **RS256 → HS256 confusion.** If a verifier uses the issuer's *public* RSA key but the attacker sets
  `alg:HS256`, a naive library may HMAC with that public key — which is public — so the attacker can sign.
  Pin the algorithm to the key type.
- **Skipped claim validation.** A perfectly valid signature over `{"aud":"some-other-api"}` is still not for
  you. Always check `iss`, `aud`, `exp`, and (for ID tokens) `nonce`.
- **Front-channel trust.** Treating anything that arrived through the browser as authentic. It isn't; it's
  attacker-influenceable input.
- **base64url ≠ encryption.** Putting a secret in a JWT payload "because it's a token" exposes it to anyone
  holding the token. Use a JWE if you need confidentiality.

## Spec delta

| Question | Answer |
|----------|--------|
| **What came before** | Raw HTTP requests and ad-hoc, unverifiable tokens (opaque strings, homemade cookies). |
| **What this adds** | A transport that resists eavesdropping/tampering (TLS 1.3, RFC 8446); a standard, *verifiable* token envelope (JOSE: RFC 7515–7519, 7638); a clear front/back-channel model of who controls which bytes. |
| **What it deprecates** | Nothing yet — this is groundwork. |
| **What remains unsolved (and where it's addressed)** | *Why* delegated access is needed at all → **Module 01**. How tokens are actually issued → **Module 02**. Stopping front-channel code interception → **Module 03**. Binding a token to its sender so theft doesn't help → **Module 05 (DPoP/mTLS)**. |

## What to study next and why

You now understand the medium (who controls which bytes) and the envelope (signed vs. encrypted, decode vs.
verify). The obvious next question is: *why do we need OAuth at all?* Before OAuth, apps collected your actual
password to act on your behalf — a disaster you can now articulate precisely, because you understand what the
browser and the network can and cannot protect. **Module 01 — The Delegation Problem** makes that failure
concrete and introduces the full cast of roles that the rest of the curriculum uses.
