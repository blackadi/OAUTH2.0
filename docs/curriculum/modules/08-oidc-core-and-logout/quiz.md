# Module 08 — Quiz

19 items across four tiers. Don't advance to Module 09a until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** Which claims are REQUIRED in every ID token per OIDC Core §2?
- A) `iss`, `sub`, `aud`, `exp`, `iat`
- B) `iss`, `sub`, `aud`, `exp`, `iat`, `nonce`
- C) `iss`, `sub`, `aud`, `exp`, `auth_time`
- D) `sub`, `aud`, `exp`, `iat`, `acr`

**Q2.** For an ID token signed with `HS256`, OIDC Core §3.1.3.7 says the validation key is:
- A) the AS's public key from the JWKS
- B) the UTF-8 octets of the `client_secret`
- C) a key derived from `client_id` + `nonce`
- D) whatever key the `kid` header names

**Q3.** `nonce` is returned to the client in:
- A) a query parameter on the redirect
- B) the token response body
- C) a claim inside the ID token
- D) the `WWW-Authenticate` header

**Q4.** Which claim binds the authorization **code** to an ID token in the hybrid flow?
- A) `at_hash`  B) `c_hash`  C) `s_hash`  D) `azp`

**Q5.** With `prompt=none` and no authenticated user, OIDC Core §3.1.2.6 expects the AS to return:
- A) HTTP 401 with `WWW-Authenticate`
- B) a redirect carrying `error=login_required`
- C) HTTP 200 with an empty body
- D) a redirect with no parameters

## Tier 2 — Applied reasoning (5)

**Q6.** A colleague's "Sign in with Example" implementation fetches UserInfo with the access token and logs the
user in as the returned `sub`. They argue it is safe because the access token came from their own flow, over
TLS, and UserInfo verified it. What is the flaw, in one sentence, and what is the minimum change that fixes
it?

**Q7.** You are told "we validate the ID token — we check the signature with the provider's published key."
Which two of the thirteen steps most urgently need adding, and what attack does each close?

**Q8.** A team stores users keyed on the ID token's `sub`. They add a second identity provider. What breaks,
when, and why is keying on `email` worse rather than better?

**Q9.** Your SPA's silent-renewal iframe calls the AS with `prompt=none` every ten minutes. The AS starts
returning a 302 with an empty `Location` (this repo's behaviour until 2026-08-12). Describe what the SPA experiences, why its error handling almost
certainly does not cover it, and what the user sees.

**Q10.** An RP validates ID tokens by reading `alg` from the header and selecting a key accordingly. Describe
**two** distinct attacks this enables, and give the one-line rule that prevents both.

## Tier 3 — Trace and diagnose (5)

**Q11.** This validator is used on ID tokens received via the code flow:

```js
const claims = jwt.verify(idToken, await jwksKey(decodeHeader(idToken).kid), { algorithms: ["RS256"] });
if (claims.iss !== ISSUER) throw new Error("bad issuer");
if (Date.now() / 1000 > claims.exp) throw new Error("expired");
return claims.sub;
```

Three required validation steps are missing. Name them, and for each give the attack that becomes possible.

**Q12.** An ID token validator passes on this token:

```json
{"iss":"https://op.example.com","sub":"ceo@example.com","aud":["our-client-id"],
 "exp":<future>,"iat":<now>,"nonce":"<matches>","acr":"pwd"}
```

…and the token was minted by an attacker, not by `op.example.com`. Every claim is correct and the signature
verifies. Explain how this is possible and name the single configuration decision responsible.

**Q13.** A server handles the authorization endpoint like this (this was this repo's code until
2026-08-12; answer it as it stood):

```js
case "NO_INTERACTION":
  return res.redirect(result.responseContent ?? "");
```

The authorization server returns `action: "NO_INTERACTION"` with `responseContent: null` and a `ticket`. State
what the client receives, why the developer's `prompt=none` handling elsewhere in the same file never runs, and
what the branch should do instead.

**Q14.** A logout endpoint validates its redirect target like this:

```js
const isAllowed = [...allowedOrigins].some((origin) => uri.startsWith(origin));
if (isAllowed) return res.redirect(uri);
```

`allowedOrigins` is `["https://app.example.com"]`. Give two URIs that pass this check and redirect the browser
to a host the operator does not control, and explain why setting `NODE_ENV=production` does not help.

**Q15.** A back-channel logout handler verifies the logout token's signature against the sending OP's JWKS,
confirms the `events` claim, then calls `req.session.destroy()`. The signature checks pass and users report
that logout does not work. Give the two independent defects.

## Tier 4 — Adversarial and design (4)

**Q16.** Write the **token-substitution attack** in full against a site whose login endpoint accepts an access
token and calls UserInfo. State the attacker's setup, each step, what the attacker ends up controlling, and
precisely which of the thirteen validation steps breaks the chain once the site switches to ID tokens. Then
explain why an attacker who controls *their own* registered client at the same provider makes this easier, and
name one thing the identity provider could do to reduce the damage even for RPs that get it wrong.

**Q17.** Your deployment signs ID tokens with `HS256`. Argue whether this is a **vulnerability** or a
**configuration weakness**, and defend the distinction. Then: (a) name every party that can forge a valid ID
token as a consequence, (b) explain what happens when the same organisation adds a public client, (c) describe
how this interacts with Module 06's assertion-grant finding if both are enabled on one client, and (d) specify
what you would change and in what order, given a two-week window.

**Q18.** Design the logout story for a system with one OP and four RPs: a server-rendered web app, a SPA, a
mobile app, and a background service holding a refresh token. For each RP say which logout mechanism reaches
it, what remains live afterwards, and what you would add to close the gap. Then state which of the four
logout specifications you would *not* implement and why, and identify the one piece of state that no
specification will clean up for you.

**Q19.** You are reviewing an RP's ID token validation and can run only **three** tests. Choose them, justify
each as the highest-information test available, and state what a pass and a fail of each would tell you. Then
explain why "we use a well-known OIDC library" does not let you skip all three.
