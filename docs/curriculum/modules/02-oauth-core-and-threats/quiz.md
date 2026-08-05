# Module 02 — Quiz

18 items across four tiers. Don't advance to Module 03 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** Which section of RFC 6749 defines the Authorization Code Grant?
- A) §3.1  B) §6  C) §4.3  D) §4.1

**Q2.** Which parameter exists to bind an authorization response to the browser session that started the
request?
- A) `nonce`  B) `code_challenge`  C) `state`  D) `client_id`

**Q3.** The device authorization grant's `grant_type` value is:
- A) `device_code`
- B) `urn:ietf:params:oauth:grant-type:device_code`
- C) `urn:ietf:params:oauth:device`
- D) `urn:openid:params:grant-type:device`

**Q4.** Which set of error codes is defined by RFC 6749 **§5.2** (the token endpoint's JSON error response)?
- A) `invalid_request`, `unauthorized_client`, `access_denied`, `unsupported_response_type`, `invalid_scope`,
  `server_error`, `temporarily_unavailable`
- B) `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`,
  `invalid_scope`
- C) `invalid_token`, `insufficient_scope`, `invalid_request`
- D) `authorization_pending`, `slow_down`, `access_denied`, `expired_token`

**Q5.** RFC 9700 is:
- A) an active Internet-Draft that supersedes RFC 6819
- B) *Best Current Practice for OAuth 2.0 Security*, BCP 240, published January 2025
- C) the OAuth 2.1 framework
- D) an Informational RFC from 2013

## Tier 2 — Applied reasoning (5)

**Q6.** A nightly batch job on your own servers pulls aggregate reports from an internal API. There is no
user. Which grant, and why?
- A) `authorization_code` with a service account user
- B) `password` — store a service account's credentials
- C) `client_credentials` — the client is acting as itself, and is confidential
- D) `refresh_token` with a long-lived token minted by hand

**Q7.** A smart-TV app needs the user to authorize it. The TV has a screen and a remote control, no keyboard,
and no usable browser. Which grant?
- A) `authorization_code` with PKCE in an embedded webview
- B) `implicit` — no back channel is available on a TV
- C) The device authorization grant (RFC 8628)
- D) `client_credentials`, then ask the user's identity separately

**Q8.** Why does the authorization endpoint return a **code** instead of an access token?
- A) Codes are encrypted; tokens are not
- B) Codes are shorter, so they fit in a URL
- C) The code travels on a channel the attacker may observe, but is useless without client authentication on
  a channel the attacker is not on, and it is single-use
- D) The token endpoint needs something to log for auditing

**Q9.** Why must the client repeat `redirect_uri` in the token request (RFC 6749 §4.1.3)?
- A) So the authorization server knows where to send the token
- B) So the AS can verify it matches the value used in the authorization request
- C) It is a legacy field with no current purpose
- D) So the browser can be redirected one final time

**Q10.** A developer argues: "We don't need `state` — the whole flow is over HTTPS, so nobody can tamper with
the redirect." What is wrong with this?
- A) Nothing; TLS does make `state` redundant
- B) `state` defends against an attacker *injecting their own* authorization response into the victim's
  session — a CSRF problem TLS does not address
- C) `state` is only needed for the implicit grant
- D) TLS 1.2 would be insufficient, but TLS 1.3 is fine

## Tier 3 — Trace and diagnose (5)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** An authorization server validates redirect URIs like this:

```js
const registered = "https://app.example.com/";
if (requested.startsWith(registered)) accept(requested);
```

What does this allow, and which normative requirement does it violate?

**Q12.** A client's callback handler:

```js
app.get("/callback", async (req, res) => {
  const { code } = req.query;                    // note: state is not read
  const tokens = await exchangeCode(code);
  req.session.tokens = tokens;
  res.redirect("/dashboard");
});
```

The client *does* generate and store a `state` value when building the authorization request. What is still
wrong, and what can an attacker do?

**Q13.** An authorization server receives a request with an unregistered `redirect_uri` and a malformed
`scope`. It responds:

```http
HTTP/1.1 302 Found
Location: https://attacker.example/cb?error=invalid_scope&state=abc
```

Two separate rules are broken here — name them and say what capability the attacker gains.

**Q14.** A device-flow client polls like this:

```js
while (true) {
  const r = await poll(deviceCode);
  if (r.error === "authorization_pending" || r.error === "slow_down") { await sleep(1000); continue; }
  if (r.access_token) return r;
  throw new Error(r.error);
}
```

Name two distinct defects with reference to RFC 8628 §3.5.

**Q15.** A token request arrives with `grant_type=authorization_code` and a valid `code`, but **no**
`client_id`, and the client used no HTTP authentication. The authorization server looks up which client the
code was issued to and proceeds. Which safeguard has been given up, and which configuration flag in this
repo's `AGENTS.md` controls it?

## Tier 4 — Adversarial and design (3)

**Q16.** Assume an attacker who can **read** the full callback URL — via browser history on a shared machine,
a malicious extension, a `Referer` header, or a proxy access log — but cannot otherwise control the client or
the AS. Work through what they can achieve against (a) a confidential server-side web client, and (b) a
public SPA or mobile app, in each case saying exactly which step of the flow stops them or fails to. Then
state precisely what capability is missing in case (b) and what property any fix must have.

**Q17.** You are designing authorization for a product with four components: a browser SPA, an iOS app, a
nightly reporting job running on your own infrastructure, and a smart-TV app. For each: name the grant, the
client type, the client-authentication method (if any), and the single most dangerous attack against that
combination. Then identify which *one* of the four is the weakest link under an attacker who has code
execution on the end user's device, and justify it.

**Q18.** You inherit a production deployment whose SPA uses the implicit grant (`response_type=token`). Write
the migration case: what specifically is wrong (cite the RFC 9700 sections), what the SPA gains by moving to
authorization code, what *new* requirement the move imposes that implicit did not have, and what you would
tell an engineer who objects that "implicit is simpler and it has worked for six years." Include what you
would monitor during the cutover to know it is safe.
