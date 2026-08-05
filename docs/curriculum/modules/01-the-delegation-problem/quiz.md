# Module 01 — Quiz

17 items across four tiers. Don't advance to Module 02 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** Which section of RFC 6749 defines the roles?
- A) §1.2  B) §4.1  C) §3.1  D) §1.1

**Q2.** "The server hosting the protected resources, capable of accepting and responding to protected resource
requests using access tokens" is the definition of:
- A) the authorization server  B) the client  C) the resource server  D) the user agent

**Q3.** Which endpoint does the **client** call *directly*, over the back channel?
- A) the authorization endpoint  B) the token endpoint  C) the redirection endpoint  D) the JWKS endpoint

**Q4.** The password anti-pattern was formalized as an OAuth grant in:
- A) RFC 6749 §4.1 (authorization code)  B) RFC 6749 §4.2 (implicit)  C) RFC 6749 §4.3 (resource owner
  password credentials)  D) RFC 6749 §4.4 (client credentials)

**Q5.** RFC 6750 §2.1 specifies that an access token is presented to a protected resource as:
- A) `Authorization: Basic <token>`  B) `Authorization: Bearer <token>`  C) `X-Access-Token: <token>`
- D) a `token` query parameter

## Tier 2 — Applied reasoning (5)

**Q6.** A team proposes: "Our app collects the user's identity-provider password, sends it over TLS 1.3, and
stores it encrypted at rest with a hardware-backed key. That solves the password anti-pattern." What is wrong
with this reasoning?
- A) Nothing — TLS plus encryption at rest addresses the risk
- B) TLS 1.3 is not yet widely enough deployed to rely on
- C) The harms are structural (unbounded scope, no revocation, no attribution), and none of them is a
  confidentiality problem that encryption can fix
- D) They should hash the password instead of encrypting it

**Q7.** Which property does an access token have that a *password* cannot have, even if you give the password
a short lifetime and store it perfectly?
- A) It is transmitted over HTTPS
- B) It is unguessable
- C) Actions taken with it are attributable to a specific `client_id`, and it can be revoked without
  affecting other clients
- D) It is longer than a password

**Q8.** A product manager wants to remove the consent screen: "the user already clicked 'connect', so asking
again is friction." Which security property is actually being removed?
- A) None — consent is purely a legal formality
- B) The resource owner's opportunity to see *which* client is being granted *which* scopes, and to narrow them
- C) Authentication of the user
- D) Client authentication at the token endpoint

**Q9.** Your team ships the device manufacturer's own first-party settings app. RFC 6749 §4.3 said ROPC was
suitable where "the resource owner has a trust relationship with the client, such as the device operating
system or a highly privileged application." Should you use ROPC?
- A) Yes — this is the exact case §4.3 describes
- B) Yes, provided the app discards the credentials after obtaining a token, as §4.3 requires
- C) No — RFC 9700 §2.4 states the grant MUST NOT be used, regardless of trust relationship
- D) Only if the authorization server advertises `password` in `grant_types_supported`

**Q10.** Which actor is both **untrusted** and **unavoidable** in the authorization-code flow?
- A) the resource server  B) the authorization server's policy engine  C) the user agent (browser)
- D) the client's backend

## Tier 3 — Trace and diagnose (4)

For each: identify the defect, name the affected concept, and state the fix.

**Q11.** An authorization server's login page renders this form:

```html
<form method="POST" action="https://partner-app.example.com/oauth/collect-login">
  <input name="username"> <input name="password" type="password">
</form>
```

What has been broken, and what can the partner app now do that it could not before?

**Q12.** A login handler:

```js
async function handleLogin(req, res) {
  const user = await validateUser(req.body.username, req.body.password);
  if (!user) return res.status(401).json({ error: "bad credentials" });
  req.session.user = user;
  return res.redirect(req.query.next || "/");
}
```

Compare it with this repo's `session.controller.ts`, which returns **401 "Missing authorization context"**
when `req.session.authorization` is absent. What does the snippet above allow that the repo's version does
not?

**Q13.** A teammate reports a bug: "`/.well-known/openid-configuration` lists `password` under
`grant_types_supported`, but when I send `grant_type=password` the server returns
`invalid_request: The grant type ('password') is not allowed.` The discovery document is lying — file it
against the metadata endpoint." Is this a metadata bug? Explain what is actually happening and what the right
conclusion is.

**Q14.** A resource server authorizes requests like this:

```js
const presented = req.headers.authorization?.replace(/^Bearer /, "");
const user = await db.users.findOne({ passwordOrToken: presented });
if (user) return allow(user);
```

Name at least three distinct things this destroys, and say what the correct check is.

## Tier 4 — Adversarial and design (3)

**Q15.** You are red-teaming a personal-finance aggregator that connects to banks using stored user
credentials (ROPC-style: it keeps each user's bank username and password and replays them). Enumerate the
attack surface and the escalation path available to you after compromising the aggregator's credential store.
Then state, concretely, what the *defender* gains by migrating to the authorization-code flow — mapping each
gain to the specific attack step it blocks or degrades.

**Q16.** An internal team argues that for a *first-party* admin tool — same company, same domain, same SSO —
collecting the user's password directly in the tool is fine, because "we are the identity provider; there is
no third party to protect against." Write the strongest version of their argument, then rebut it. Your rebuttal
must name at least three harms that persist even when the client and the authorization server are operated by
the same organization, and must specify exactly where you would put the credential boundary instead and why.

**Q17.** Define the **confused deputy** problem in one sentence, give a concrete OAuth instance of it, and
name the mechanisms that bound how much damage a confused deputy can do. Then explain why *delegation*
(handing a client a narrow capability) is a partial defense but not a complete one — what class of attack
remains, and which later module addresses it?
