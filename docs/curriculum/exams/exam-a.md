# Cumulative Exam A — Foundations through PKCE

**Take after Module 03.** Covers Modules 00–03. **15 items, 100 points, 90 minutes, closed book.**
Answers: [exam-a-answers.md](exam-a-answers.md).

---

## Section 1 — Wire level (25 points)

**A1 (12 pts).** From memory, write out an authorization-code flow with PKCE for a **public** client as a
sequence of HTTP messages. For each leg give the method, the endpoint, and every parameter. Then annotate:

- which legs travel through the **browser** and which are **direct**;
- which parameters the **user agent can read**, and which it can also **modify**;
- exactly **one** parameter whose removal would still yield a working flow but a less secure one, and say
  what it defends.

**A2 (8 pts).** For each parameter, state in one line what it does and what breaks without it:
`state`, `code_challenge`, `code_challenge_method`, `code_verifier`, `redirect_uri` (at the *token* endpoint),
`scope`, `client_id`, `iss`.

**A3 (5 pts).** The authorization response arrives at the client. Name **three** distinct places that value
can subsequently leak from, given that it travelled through a browser.

## Section 2 — JOSE and trust (20 points)

**A4 (6 pts).** A colleague pastes a JWT into a website to read it and says "it's fine, it decoded correctly."
Give **three** separate things wrong with that sentence.

**A5 (8 pts).** You receive this JOSE header: `{"alg":"none","typ":"JWT"}`. Explain (a) what a verifier that
accepts it has actually verified, (b) which single check in a validation routine stops it, and (c) why
`alg: HS256` on a token you expected to be `RS256` is a *different* attack with the same shape.

**A6 (6 pts).** Name the JOSE specification that defines each: the signature envelope; the key format; the
`ES256` identifier; the registered claim `exp`; a canonical hash of a public key. One line each, RFC number
plus what it contributes.

## Section 3 — The delegation problem (15 points)

**A7 (9 pts).** The password anti-pattern. State **five** distinct structural harms — not "it's insecure" but
five different things that are true of it and false of delegation. For each, name the OAuth mechanism that
addresses it.

**A8 (6 pts).** RFC 6749 §1.1 defines four roles. Name them, and then name **two** further actors this
curriculum insists on that are *not* §1.1 roles — say what each is and why the distinction matters.

## Section 4 — PKCE (20 points)

**A9 (10 pts).** Derive PKCE. Start from "a public client cannot keep a secret" and reach the S256
construction in numbered steps, justifying each. Your derivation must explain why the challenge is **hashed**
rather than sent in the clear, and why the verifier is sent at the **token** endpoint rather than the
authorization endpoint.

**A10 (5 pts).** `state` and PKCE are routinely confused. Give the attack each stops, and one sentence on why
one cannot substitute for the other.

**A11 (5 pts).** An AS accepts an authorization request with a `code_challenge` and later accepts a token
request for that code **without** a `code_verifier`. Name the attack, and state the rule the AS must enforce
— **in both directions**.

## Section 5 — Integrative (20 points)

These need more than one module.

**A12 (8 pts).** A native iOS app authenticates users by opening an in-app `WKWebView` pointed at the AS,
using the authorization-code flow with PKCE and a registered custom-scheme redirect. The team argues the
embedded webview is fine because PKCE is in place. **Assess.** Name the specification that governs this, its
status, what it requires, and explain precisely what PKCE does and does not protect here.

**A13 (6 pts).** A deployment advertises `code_challenge_methods_supported: ["plain","S256"]`. A reviewer
records this as **PASS — PKCE supported**. Explain what is wrong with the finding, what the correct finding
is, and how you would phrase the evidence. *(Framed the way Module 07 will teach; the reasoning is available
from Modules 02–03.)*

**A14 (6 pts).** `[lab]` Compute an `S256` `code_challenge` for the verifier
`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`, using only a local tool, and show your working. Then state the
one property of the verifier that RFC 7636 §4.1 constrains, and why.

---

## Bonus — not scored

**A15.** Which single change to a default OAuth deployment buys the most security for the least effort, and
what is your evidence? There is more than one defensible answer; the reasoning is the whole item.
