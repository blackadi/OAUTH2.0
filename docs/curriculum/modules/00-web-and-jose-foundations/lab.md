# Module 00 — Lab: Read the medium, decode the envelope, break the trust

**The short version:** you'll look at the JOSE artifacts the live server already publishes, decode a token
**locally** (never an online decoder), then forge tampered and unsigned tokens to prove the module's one
idea: **decoding a token tells you nothing about whether to trust it.**

## Setup

**Required:** the server running on `:3000`.

```bash
npm --prefix server run dev     # in one terminal; leave it running
```

- **.env:** the server needs `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID`, and
  `SESSION_SECRET` in `server/.env` or it will not start (this is a fail-fast config check, not an OAuth
  requirement). No client credentials are needed for this module.
- **Authlete flags:** none required for Module 00.
- **Tools:** `curl`, `node` (for the local decoder), and the dashboard at `:3001` for visual cross-check.

Run all commands from the **repo root** so the script path resolves. Confirm the server is up:

```bash
curl -s http://localhost:3000/api/health
# → {"status":"ok",...}  (a 200 JSON body)
```

> **Note on your values:** the `issuer` and endpoint URLs you see below depend on how *your* Authlete service
> and `server/.env` are configured (they may show a public/tunnel hostname rather than `localhost`). That is a
> **deployment configuration** detail, not a spec requirement — the *structure* is what matters here.

---

## Exercise 1 — The discovery document (the map)

The server publishes a metadata document tying the issuer, keys, and endpoints together. You'll dissect it
fully in Module 04; here just see its shape.

```bash
curl -s http://localhost:3000/api/.well-known/openid-configuration | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log(JSON.stringify({issuer:j.issuer,jwks_uri:j.jwks_uri,authorization_endpoint:j.authorization_endpoint,token_endpoint:j.token_endpoint},null,2))})'
```

Notice `authorization_endpoint` (front channel — meant to be visited in a browser) sits right next to
`token_endpoint` (back channel — server-to-server). Same document, two very different trust models. The
`jwks_uri` is where the **public keys** live.

> **Path quirk (Authlete-app behavior, not a spec rule):** in *this* server, OIDC discovery is under the
> **`/api`** prefix (`/api/.well-known/openid-configuration`), while the RFC 8414 OAuth metadata is at true
> root (`/.well-known/oauth-authorization-server`). Compare:
> ```bash
> curl -s http://localhost:3000/.well-known/oauth-authorization-server | head -c 120; echo
> ```

## Exercise 2 — Read a real JWK from the JWKS

```bash
curl -s http://localhost:3000/api/.well-known/jwks.json | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("key count:",j.keys.length);const k=j.keys[0];console.log("fields:",Object.keys(k).join(", "));console.log(JSON.stringify(k,null,2))})'
```

You should see a single **EC** key on curve **P-256** with `"alg":"ES256"`, `"use":"sig"`, a `kid`, and the
public coordinates `x` and `y`. Map the fields to the concepts from the lesson:

| Field | Meaning |
|-------|---------|
| `kty` = `EC` | Key type: elliptic curve (RFC 7517) |
| `crv` = `P-256` | The curve (RFC 7518) |
| `alg` = `ES256` | ECDSA with P-256 + SHA-256 — the signing algorithm |
| `use` = `sig` | This key is for **signatures**, not encryption |
| `kid` | Key ID — how a JWS header points at *this* key |
| `x`, `y` | The **public** point. There is no private component here — that never leaves the server. |

This is the "signet" a verifier uses to check the wax seal. It is public on purpose: anyone can *verify*, only
the server can *sign*.

## Exercise 3 — Decode a JWT locally

You don't need a token from the flow yet (that's Module 02). Use this sample `at+jwt` and the offline decoder:

```bash
SAMPLE="eyJhbGciOiJFUzI1NiIsInR5cCI6ImF0K2p3dCIsImtpZCI6ImFiYzEyMyJ9.eyJpc3MiOiJodHRwczovL2FzLmV4YW1wbGUuY29tIiwic3ViIjoiYWRtaW4iLCJhdWQiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUiLCJpYXQiOjE3NTMwMDAwMDAsImV4cCI6MTc1MzAwMzYwMH0.c2lnbmF0dXJlLXBsYWNlaG9sZGVy"

node docs/curriculum/scripts/decode-jwt.mjs "$SAMPLE"
```

Confirm you can point at the three parts: the **header** (`alg`, `typ`, `kid`), the **payload** (`iss`,
`sub`, `aud`, `scope`, `iat`, `exp`), and the **signature** (opaque bytes the tool does *not* check). Note the
tool flags the token as **expired** and prints a loud reminder that it decodes but does not verify.

**Dashboard cross-check:** open the dashboard (`:3001`), paste the same token into the **TokenVault** in the
sidebar, and confirm it shows the same header/payload. Same operation, prettier UI — and equally *not* a
verification.

## Break it

Here you make the module's point with your own hands. **Write your prediction first, then run it.**

### Break 1 — tamper a claim

**Predict:** if you change `sub` from `admin` to `attacker` but keep the original signature, what will the
decoder show? What would a *correct verifier* do?

```bash
# Take the sample, rewrite the payload's sub, keep the ORIGINAL signature, reassemble:
FORGED=$(node -e '
const t="eyJhbGciOiJFUzI1NiIsInR5cCI6ImF0K2p3dCIsImtpZCI6ImFiYzEyMyJ9.eyJpc3MiOiJodHRwczovL2FzLmV4YW1wbGUuY29tIiwic3ViIjoiYWRtaW4iLCJhdWQiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUiLCJpYXQiOjE3NTMwMDAwMDAsImV4cCI6MTc1MzAwMzYwMH0.c2lnbmF0dXJlLXBsYWNlaG9sZGVy";
const [h,p,s]=t.split(".");
const payload=JSON.parse(Buffer.from(p.replace(/-/g,"+").replace(/_/g,"/"),"base64"));
payload.sub="attacker"; payload.scope="openid profile admin";
const p2=Buffer.from(JSON.stringify(payload)).toString("base64url");
process.stdout.write([h,p2,s].join("."));
')
node docs/curriculum/scripts/decode-jwt.mjs "$FORGED"
```

**Observe:** the decoder cheerfully prints `"sub": "attacker"` and `"scope": "openid profile admin"`. Nothing
complained. **Explain the gap:** decoding only base64url-decodes bytes; it never recomputes the signature over
the new payload. The original signature no longer matches the changed payload, so a *verifier* checking the
signature against the issuer's JWK (Exercise 2) would reject it. The tamper is invisible to a decoder and
fatal to a verifier — that difference is the whole module.

### Break 2 — forge an `alg:none` token

**Predict:** you build a token whose header says `alg:none` and attach an empty signature. What does the
decoder show? Why would a verifier that "just trusts the token's `alg`" be catastrophically broken?

```bash
NONE=$(node -e '
const header=Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString("base64url");
const payload=Buffer.from(JSON.stringify({sub:"attacker",scope:"admin",iss:"https://as.example.com"})).toString("base64url");
process.stdout.write(header+"."+payload+".");   // trailing dot = empty signature
')
node docs/curriculum/scripts/decode-jwt.mjs "$NONE"
```

**Observe:** the header shows `"alg": "none"` and the payload is fully readable with an empty signature.
**Explain the gap:** if a verifier reads `alg` from the token and honors `none`, it will accept this forged,
unsigned token as authentic — an attacker can then assert any `sub`/`scope` they like. The defense is to
**pin the expected algorithm(s)** and never treat the token's own `alg` as an instruction. (RFC 7518 §3.6
defines `none`; RFC 9700 / Module 07 revisit why algorithm confusion is a live threat class.)

### Break 3 (thought experiment) — RS256 → HS256 confusion

You can't fully reproduce this without a vulnerable verifier, but reason it through: an issuer signs with
RSA (`RS256`) and publishes its **public** key in the JWKS. An attacker sends a token with header `alg:HS256`
and signs it *using that public key as the HMAC secret*. A naive library that picks the algorithm from the
header and hands it the issuer's key will compute HMAC-SHA256 with a key the attacker also has — so the
forgery verifies. **Fix:** bind the accepted algorithm to the key type; never let the token choose.

## Verification — you're done when

- [ ] `curl .../api/.well-known/jwks.json` returns a key set, and you can name what `kty`, `crv`, `alg`,
      `use`, `kid`, `x`, `y` each mean.
- [ ] `decode-jwt.mjs` prints the header/payload of the sample token and flags it expired.
- [ ] The **tampered** token (Break 1) still decodes, and you can explain in one sentence why a verifier
      rejects it.
- [ ] The **`alg:none`** token (Break 2) decodes with an empty signature, and you can explain why a verifier
      must pin the algorithm.
- [ ] You can state the rule without notes: **decode ≠ verify.**

## What was real vs. simulated

- The discovery, JWKS, and AS-metadata documents are **real**, served by the running server via Authlete.
- The path quirk (`/api` prefix on OIDC discovery) is **this app's routing choice**, not a spec requirement.
- The sample/forged tokens are **hand-built** so you never needed a live grant — you'll obtain and decode
  *real* issued tokens starting in Module 02.
