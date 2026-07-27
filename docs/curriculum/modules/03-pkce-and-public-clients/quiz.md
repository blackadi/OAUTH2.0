# Module 03 — Quiz

18 items across four tiers. Don't advance to Module 04 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** RFC 7636 §4.1 specifies the `code_verifier` as:
- A) 16–32 random bytes, hex encoded
- B) 43–128 characters from the unreserved set `[A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"`
- C) exactly 43 base64url characters
- D) any string the client chooses, of any length

**Q2.** The `S256` transformation is:
- A) `code_challenge = SHA256(code_verifier)`
- B) `code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`
- C) `code_challenge = HMAC-SHA256(client_secret, code_verifier)`
- D) `code_challenge = BASE64URL-ENCODE(code_verifier)`

**Q3.** If `code_challenge_method` is omitted from the authorization request, RFC 7636 §4.3 says it:
- A) defaults to `S256`  B) defaults to `plain`  C) is an error  D) is chosen by the authorization server

**Q4.** When the `code_verifier` does not match the stored `code_challenge`, RFC 7636 §4.6 requires the AS to
return:
- A) `invalid_client`  B) `invalid_request`  C) `invalid_grant`  D) `access_denied`

**Q5.** RFC 8252 is:
- A) *OAuth 2.0 for Browser-Based Apps*, an active Internet-Draft
- B) *OAuth 2.0 for Native Apps*, BCP 212, October 2017
- C) *Proof Key for Code Exchange*, Standards Track, September 2015
- D) *OAuth 2.0 Security Best Current Practice*, BCP 240

## Tier 2 — Applied reasoning (5)

**Q6.** A team registers their React SPA as a **confidential** client and ships the `client_secret` in the
JavaScript bundle, "so the token endpoint still authenticates us." What is the problem?
- A) None, provided the bundle is minified and served over HTTPS
- B) The secret is readable by anyone who loads the app and is identical for every user, so it authenticates
  nothing while creating the illusion that it does
- C) SPAs cannot use the authorization-code grant at all
- D) The secret should be rotated weekly instead

**Q7.** An attacker reads a victim's callback URL out of shared-machine browser history and obtains a valid
authorization code for a public client. Which control prevents them from redeeming it?
- A) `state`, because it binds the response to the session
- B) TLS, because the code was encrypted in transit
- C) PKCE, because redemption requires the `code_verifier`, which never left the legitimate client
- D) The `iss` parameter, because it identifies the authorization server

**Q8.** You are shipping an iOS app. Which redirect strategy is strongest, and why?
- A) A private-use URI scheme (`com.example.app:/oauth`) — simplest to register
- B) A claimed `https` scheme (universal link) — ownership is verified against the domain, so another app
  cannot claim it
- C) An embedded webview posting to an in-app handler — no redirect needed
- D) A loopback URI — it works identically on mobile and desktop

**Q9.** Your public mobile client receives a refresh token. Per RFC 9700 §2.2.2, which is acceptable?
- A) Store it in the keychain and use it indefinitely
- B) Either sender-constrain it (DPoP/mTLS) or rotate it on every use
- C) Encrypt it at rest with a key derived from the user's PIN
- D) Give it a 90-day lifetime and no other control

**Q10.** A developer says: "`plain` is fine — the authorization request is HTTPS, so nobody can read the
`code_challenge` anyway." Why is this wrong?
- A) `plain` is not supported by most authorization servers
- B) TLS protects the request in transit, but the authorization URL is visible at the user agent — history,
  extensions, `Referer`, proxy logs — and with `plain` that URL contains the verifier itself
- C) `plain` uses a weaker hash function than `S256`
- D) `plain` requires a client secret

## Tier 3 — Trace and diagnose (5)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** A client builds its authorization request like this:

```js
const verifier = base64url(crypto.randomBytes(32));
const url = `${authzEndpoint}?...&code_challenge=${verifier}&code_challenge_method=S256`;
// later, at the token endpoint:
body.set("code_verifier", verifier);
```

The token exchange always fails with `invalid_grant`. Why — and what would have happened if they had written
`code_challenge_method=plain` instead?

**Q12.** An authorization server's token endpoint:

```js
if (storedChallenge) {
  if (!req.body.code_verifier) return invalidGrant();
  if (s256(req.body.code_verifier) !== storedChallenge) return invalidGrant();
}
// no stored challenge → proceed
```

Which specific requirement is unmet, and what does an attacker do with it?

**Q13.** A client generates its verifier as:

```js
let v = "";
for (let i = 0; i < 43; i++) v += CHARS[Math.floor(Math.random() * CHARS.length)];
```

What is wrong, and how does the consequence differ from the modulo-bias note in
`client/src/pkce.ts`?

**Q14.** A native Android app opens the authorization request in an embedded `WebView`, uses the redirect URI
`com.example.app://callback`, and does not send `code_challenge`. Name **three** distinct defects and the
specific document that addresses each.

**Q15.** An SPA stores its `code_verifier` in `localStorage` under a fixed key `pkce_verifier`, and reuses
whatever is there if a value already exists. Name two distinct problems.

## Tier 4 — Adversarial and design (3)

**Q16.** You have published a malicious app on the same phone as a target app. The target is a public client
using a private-use URI scheme (`com.target.app:/oauth`), and your app has registered the same scheme, so the
OS may deliver the authorization response to you. Walk through what you obtain and what you can do with it
(a) when the target does not use PKCE and (b) when it uses PKCE with `S256`. Then answer the harder question:
**what does PKCE actually protect against here, and what does it not?** Name a realistic on-device capability
that defeats PKCE entirely and say what the correct defense is.

**Q17.** A team is building a new browser SPA that talks to a first-party API. Two proposals are on the table:
(a) a public client in the browser using authorization code + PKCE, storing tokens in memory; (b) a
backend-for-frontend that performs the code flow server-side as a confidential client and keeps tokens
entirely out of the browser, giving the SPA only a same-site cookie session. Argue for one. Your answer must
address the XSS threat model explicitly, say what PKCE does and does not do for proposal (a), name what
proposal (b) costs, and state the conditions under which you would change your recommendation.

**Q18.** RFC 9700 §2.2.2 says refresh tokens for public clients *"MUST be sender-constrained or use refresh
token rotation."* The `AGENTS.md` configuration table in this repo recommends `refreshTokenKept = true` —
rotation **off** — citing FAPI 2.0. Explain why both positions are correct rather than contradictory, then
choose and defend a refresh-token policy for each of these two deployments: (i) a consumer mobile app on an
authorization server with no mTLS or DPoP support; (ii) a FAPI 2.0 open-banking deployment where every client
is sender-constrained. For each, say what you would monitor to detect refresh-token theft.
