# Module 01 — Quiz Answers

Each answer explains **why the right answer is right and why the tempting wrong ones are wrong.**

---

## Tier 1 — Recall

**Q1 — D) §1.1.** RFC 6749 §1.1 is "Roles." §1.2 is "Protocol Flow" (where the *user agent* appears, but it is
not one of the four roles), §3.1 is the authorization endpoint, §4.1 is the authorization code grant.

**Q2 — C) the resource server.** That is the §1.1 definition verbatim. The **authorization server** (A) is
defined separately as "the server issuing access tokens to the client after successfully authenticating the
resource owner and obtaining authorization" — the two are frequently the same deployment but they are distinct
roles, and conflating them is the source of a lot of confused design.

**Q3 — B) the token endpoint.** The client calls it directly, server-to-server, and authenticates itself
there. **A is the trap:** the client *composes* the authorization request but does not call the authorization
endpoint — it hands a URL to the **user agent**, which makes the request. That distinction is the entire
front-channel threat model.

**Q4 — C) RFC 6749 §4.3**, the Resource Owner Password Credentials grant.

**Q5 — B) `Authorization: Bearer <token>`.** RFC 6750 §2.1, "Authorization Request Header Field." D (query
parameter) is defined in RFC 6750 as an alternative but is discouraged — tokens in URLs leak into logs,
referrers, and history. A (`Basic`) is client authentication, not token presentation.

## Tier 2 — Applied reasoning

**Q6 — C.** The harms of credential sharing are *structural*, not confidentiality failures: unbounded scope,
no independent revocation, no attribution, credential reuse across sites, phishing normalization. **A is the
shallow trap** — it treats "the password might be intercepted or stolen" as the whole risk, so it reaches for
transport and storage crypto. Encrypting the password perfectly still leaves the client able to do everything
the user can do, forever, indistinguishably. B is irrelevant (TLS 1.3 is ubiquitous, and even TLS 1.2 would not
change the analysis). D is nonsense here: the app must *replay* the password, so it cannot hash it — which is
itself a tell that the design is wrong.

**Q7 — C.** Attribution and independent revocation come from the token having a *record at the issuer*: the AS
knows it minted this token, for this client, with these scopes. A password has no such record — it is a fact
about the user, identical no matter who presents it. A, B, and D are properties a password can also have (or
that don't matter), which is why they're tempting.

**Q8 — B.** Consent is where the resource owner sees *which client* is asking for *which scopes* and can
narrow or refuse. Remove it and the grant silently becomes whatever the client requested. **A is the trap**
("consent is legal boilerplate") — it is a real authorization control, and in this repo it is the step that
populates the granted scopes. C is wrong (authentication is a separate step, the login page). D is wrong
(client authentication happens at the token endpoint and is unaffected).

**Q9 — C.** RFC 9700 §2.4 (BCP 240, January 2025): *"The resource owner password credentials grant [RFC6749]
MUST NOT be used."* There is no first-party exemption. **A and B are the trap** — they cite §4.3's own
language, which is genuine but *superseded*; quoting the 2012 framework against a 2025 BCP is exactly the
error the curriculum's spec-status labeling exists to prevent. D is a category error and the specific mistake
Break 1 in the lab demonstrates: advertised in metadata ≠ permitted by policy.

**Q10 — C) the user agent.** Untrusted because it can read and rewrite everything it relays; unavoidable
because it is the only way the user can reach the AS's login page without the client mediating. A and D are
trusted parties in the model (they are the ones holding secrets), and B (the policy engine) never touches the
browser at all.

## Tier 3 — Trace and diagnose

**Q11.** **Defect:** the AS's own login form posts the user's credentials to a *client's* origin. **Affected
concept:** the credential boundary — the client must never receive the resource owner's credential (the
premise of RFC 6749's role separation). **Consequence:** the partner app now holds a reusable credential for
every user who logs in through this AS. It can authenticate as those users indefinitely, at *any* relying
party the AS serves, with no scope limit, no expiry, no revocation short of a password reset, and no audit
attribution — the full password anti-pattern, delivered by the authorization server itself. It is also an
excellent credential-phishing primitive, because the page is on the AS's trusted origin. **Fix:** the form's
`action` must be an endpoint on the AS's own origin (as in `views/login.ejs:18`,
`action="/api/session/login"`); the client learns the outcome only via the redirect + code exchange.

**Q12.** **Defect:** the handler authenticates in a vacuum — it never checks that a pending authorization
request exists. **Affected concept:** binding authentication to a specific authorization request (the `ticket`
/ `req.session.authorization` context). **What it allows:** (a) any party can drive the AS's login page and
determine whether a username/password pair is valid, turning the endpoint into a credential-validation oracle
for password spraying; (b) the open `next` redirect lets an attacker steer the post-login navigation, so a
client can bounce the user somewhere of its choosing with an authenticated session in hand; (c) a session
established with no associated request can later be silently reused to complete *some other* authorization
request — the consent step gets attached to a login the user performed for a different purpose. **Fix:**
require the pending-authorization context and fail closed (this repo returns 401 "Missing authorization
context - session not found"), and never redirect to an unvalidated `next`.

**Q13.** **Not a metadata bug.** `grant_types_supported` describes the *configuration surface* the
authorization server exposes; the decision to permit a specific request is made per request by the AS's policy
layer (here, Authlete — see the `[A295306]` vendor error code). Both statements can be true simultaneously:
the service is capable of the password grant, and policy forbids it. **(Whether policy *currently* forbids it
here is configuration-dependent — on this deployment it no longer does; see Break 1 and Module 07 §3c. The
reasoning below is unchanged either way, which is the point of the question.)** **The right conclusions:** (1) treat
discovery as a hint for *building* a request, never as a guarantee that it will succeed — always test;
(2) refusing ROPC is correct behavior per RFC 9700 §2.4, so the "bug" is the attempt, not the refusal; (3) if
the deployment genuinely does not intend to offer the grant, the *metadata* should be tightened so it stops
advertising it — that is a configuration cleanup, not an endpoint defect.

**Q14.** This single line destroys, at minimum: (1) **the credential/token distinction** — a password is
accepted as a bearer token, so the RS grants access to anyone who knows a password, with no grant behind it;
(2) **scope** — nothing is checked, so every caller gets everything, regardless of what was authorized;
(3) **expiry and revocation** — no `exp` check and no issuer lookup, so a revoked or expired token keeps
working; (4) **audience/issuer binding** — a token minted for a different resource server (or a different AS
entirely) is honored here; (5) **attribution** — there is no `client_id`, so the log cannot say which app
acted; and it implies passwords are stored in a directly comparable form, which is its own failure.
**Correct check:** validate the token *as a token* — for a JWT access token, verify the signature against the
AS's JWKS with a pinned algorithm and check `iss`, `aud`, and `exp` (Module 00); for an opaque token, call the
introspection endpoint (RFC 7662) and require `active: true`. Then authorize on the returned `scope`/claims,
and never look a bearer value up against a credential store.

## Tier 4 — Adversarial and design

**Q15 — model answer.**

*Attack surface and escalation after compromising the credential store:*
1. **Immediate, silent, total access** to every linked bank account for every user, with full user privileges
   — transfers and profile changes, not just the read access the product needed. There is no scope to contain
   you.
2. **Indistinguishable from legitimate traffic.** Each bank sees the user logging in. There is no `client_id`
   in the picture, so nothing anomalous to alert on and nothing for forensics to pivot on afterwards.
3. **Lateral movement off-platform.** Bank credentials are reused; the same pairs are worth trying at email,
   brokerage, and tax portals. The breach escapes the aggregator's blast radius entirely.
4. **Persistence.** Access lasts until each user individually changes each password. There is no expiry to
   wait out, and no central kill switch — the defender cannot revoke, only ask users to rotate.
5. **Undetectable staleness.** Because the aggregator must replay the credential in plaintext, it cannot be
   hashed; the store is a plaintext-equivalent credential database by design.
6. **MFA is degraded**: the aggregator has to either bypass or proxy the second factor to keep working, so
   whatever MFA the bank deployed is weakened for exactly the users who linked accounts.

*What migrating to the authorization-code flow gains, mapped to the steps it blocks:*
- The aggregator never holds a credential → **kills 1's root cause and 3 outright**; a store breach yields
  tokens, not passwords, so nothing is reusable off-platform.
- Tokens are **scoped** (read transactions only) → **degrades 1**: stolen tokens cannot move money.
- Tokens **expire** and refresh tokens can be revoked → **kills 4**: the bank can invalidate access centrally
  and immediately, per user or for the whole client.
- Every request carries a **`client_id`** authenticated at the token endpoint → **kills 2**: the bank can
  detect, rate-limit, and attribute aggregator traffic, and revoke the client wholesale.
- Authentication (including MFA) happens **on the bank's own page** → **kills 6**: the factor is never proxied.
- The user sees and can withdraw a specific grant → converts 4 from a password-reset fire drill into a click.

Full credit also notes what migration does **not** fix: a stolen bearer token is still usable by whoever holds
it until it expires or is revoked — sender-constraining it (DPoP/mTLS, Module 05) is what closes that.

**Q16 — model answer.**

*Strongest version of their argument:* there is no third party — the tool, the identity provider, and the API
are all operated by one organization under one security program. The user already types this password into a
company system; typing it into another company system adds no new trust relationship. Redirect flows add
latency, a callback surface, and client registration overhead for zero external risk, and the team can enforce
its own storage and handling rules. "Protecting the user from us" is incoherent when we already hold the
password hash.

*Rebuttal — harms that persist inside one organization:*
1. **Blast radius still concentrates.** The admin tool becomes a second place a live, replayable credential
   exists. A vulnerability in a low-assurance internal tool now yields credentials valid against *every*
   system in the SSO estate — including ones with a much higher assurance bar. The org is only as strong as
   its sloppiest first-party app.
2. **Attribution disappears.** With a credential, the IdP and every downstream API log "the user." You lose
   the ability to answer "which internal tool performed this admin action?" — the question incident response
   will actually ask. Delegation preserves the `client_id`.
3. **No scoping or revocation granularity.** An admin tool that needed read access to two systems acquires
   the user's full authority everywhere, permanently. Containing a compromised internal tool means forcing a
   password reset for every affected user, which breaks all their other access at once — so in practice it
   gets deferred.
4. **MFA and step-up become unenforceable.** If the tool collects a password directly, the IdP cannot
   interpose a second factor, an `acr` requirement, or a risk-based challenge (Module 09a). You have opted a
   privileged tool out of the strongest controls you own.
5. **User conditioning.** Staff learn that it is normal to type SSO credentials into whatever internal-looking
   page asks. That is the exact behavior internal phishing exploits, and it is the hardest harm to undo.

*Where the boundary goes:* the credential is collected **only** on the identity provider's own origin, by a
page the IdP renders — never by the tool, and never in a frame or a webview the tool controls. The tool
becomes an ordinary confidential client using the authorization-code flow with PKCE, requesting the narrow
scopes it actually needs, authenticating at the token endpoint, and holding only short-lived tokens. First-
party status buys you a legitimate right to *skip the consent screen* (a UX decision the AS can make per
client) — it does not buy you the credential.

**Q17 — model answer.**

*Definition:* a confused deputy is a privileged party that is tricked into misusing its authority on behalf of
someone who does not hold that authority.

*Concrete OAuth instance:* a client is induced to send an authorization code — or an access token — to the
wrong party. In the **mix-up attack**, a client interacting with two authorization servers is manipulated into
redeeming a code issued by an honest AS at an attacker-controlled AS (or into sending a token minted for one
resource server to a different, attacker-controlled one). The client has legitimate authority; the attacker
supplies the direction. Other everyday instances: an API gateway that forwards a caller-supplied identity
header downstream, or a service that accepts a token intended for a *different* audience.

*Mechanisms that bound the damage:* **scope** (the deputy's authority is narrow to begin with), **audience
restriction** — `aud` and the `resource` parameter (RFC 8707) — so a token is only accepted where it was
meant, **consent** (the user sees which client gets what), **exact redirect-URI matching**, **issuer
identification** (`iss` in the authorization response, RFC 9207), and short token lifetimes limiting the
window.

*Why delegation is only a partial defense:* delegation shrinks what a deputy *can* be talked into doing, but
it does nothing about the artifact being **stolen and replayed by someone else**. A bearer token is bearer:
whoever holds it is treated as authorized, so an attacker who intercepts a code in the front channel or lifts
a token from a log, a proxy, or browser storage inherits the delegated capability wholesale. Closing that
requires binding the artifact to the party that is supposed to hold it — PKCE for the code (**Module 03**) and
sender-constrained tokens via DPoP or mTLS (**Module 05**) — with the mix-up attack itself treated in full in
**Module 05**.
