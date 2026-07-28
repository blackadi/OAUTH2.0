# Module 10 — Quiz

18 items across four tiers. Don't advance to Module 11 until you can pass **Tier 4**. Answers and
explanations in [quiz-answers.md](quiz-answers.md).

---

## Tier 1 — Recall (5)

**Q1.** The three security goals stated in the FAPI 2.0 Attacker Model §5 are:
- A) Confidentiality, integrity, availability
- B) Authorization, authentication, session integrity
- C) Non-repudiation, unlinkability, minimal disclosure
- D) Encryption, signing, sender-constraining

**Q2.** FAPI 2.0 §5.3.2.1 permits which client authentication methods?
- A) `client_secret_basic` or `client_secret_post`
- B) MTLS or `private_key_jwt`
- C) `private_key_jwt` only
- D) Any method the AS advertises

**Q3.** FAPI 2.0 §5.3.2.2 requires the `request_uri` returned from PAR to have an `expires_in` value:
- A) of exactly 600 seconds  B) of less than 600 seconds  C) of at most 60 seconds  D) chosen by the client

**Q4.** Which two mechanisms does FAPI 2.0 permit for sender-constraining access tokens?
- A) DPoP or `at_hash`  B) MTLS or DPoP  C) MTLS only  D) DPoP or PKCE

**Q5.** Per Grant Management §6.5, on revoking a grant the authorization server:
- A) MUST revoke refresh tokens; should revoke access tokens
- B) MUST revoke both refresh and access tokens
- C) should revoke refresh tokens; MUST revoke access tokens
- D) MUST revoke access tokens only

## Tier 2 — Applied reasoning (5)

**Q6.** FAPI 2.0 dropped the hybrid flow (`code id_token`). The specification's stated reason is:
- A) ID tokens are too large for the front channel
- B) `nonce`/signature checks can be skipped by clients, whereas PKCE cannot — plus a privacy gain from
  keeping the ID token out of the front channel
- C) Hybrid flow is incompatible with PAR
- D) The hybrid flow was never formally analysed

**Q7.** Why did FAPI 2.0 replace JARM with "only `code` in the response"?
- A) JARM was found to be insecure
- B) If the response contains only an authorization code, and PKCE already makes a stolen code useless, there
  is nothing left in the response worth integrity-protecting
- C) JARM requires mTLS, which FAPI 2.0 made optional
- D) `response_mode=jwt` is incompatible with the `iss` parameter

**Q8.** A deployment advertises `require_pushed_authorization_requests: false` but its documentation says
"we use PAR." What is the security consequence?
- A) None, provided all first-party clients use PAR
- B) An attacker simply does not use PAR, so the authorization request travels through the front channel
  where attacker A3a can read it
- C) PAR requests will be rejected
- D) The AS cannot return `iss`

**Q9.** FAPI 2.0 forbids refresh-token rotation. The reason is best stated as:
- A) Rotation is cryptographically weak
- B) With confidential clients and sender-constrained tokens the threat rotation detects is already
  eliminated, so it contributes no benefit while causing lockouts when a client fails to store the new token
- C) Rotation is incompatible with grant management
- D) Rotation requires the AS to keep state, which FAPI 2.0 prohibits

**Q10.** The attacker model defines **A4** and then says it "is not relevant in FAPI 2.0." Why?
- A) A4 was found to be unrealistic
- B) FAPI 2.0 requires the token endpoint address to come from an authoritative source via a protected
  channel (AS metadata), which eliminates the attacker
- C) A4 is covered by A2, the network attacker
- D) A4 applies only to FAPI 1.0 Baseline

## Tier 3 — Trace and diagnose (5)

For each: identify the defect, name the affected requirement, and state the fix.

**Q11.** An audit records this row:

```
authorizationCodeDuration: 0    → PASS (code lifetime ≤ 60s)
```

What is wrong with this row, and what should it say?

**Q12.** A deployment's FAPI status endpoint responds:

```
HTTP/1.1 200 OK
{"error":"Bad Request","message":"Response validation failed","stack":"ResponseValidationError: …/home/…"}
```

Name three distinct defects and say which matters most for an operator.

**Q13.** A bank's mobile app shows a "Disconnect this bank" button. It calls `POST /revocation` with the
user's refresh token (RFC 7009), gets a 200, and shows "Disconnected." Using Grant Management §6.5, explain
what the user believes happened, what actually happened, and what the user will observe next time they use
the app.

**Q14.** A conformance report states: *"FAPI 2.0 compliant — PAR, PKCE S256, and DPoP are all supported, and
the profile is formally verified."* Identify the two independent errors in that sentence.

**Q15.** An ecosystem sets `accessTokenDuration: 86400` and enables grant management. Its security team
argues that because §6.5 only says *should* for access tokens, the deployment is conformant and no finding
should be raised. Assess that argument.

## Tier 4 — Adversarial and design (3)

**Q16.** You are the security reviewer for a new open-banking ecosystem. The platform team proposes FAPI 1.0
Advanced because "it's more battle-tested and uses JARM and mTLS, which are stronger than PAR and DPoP."
Write your response. Cover: (a) what is actually different between 1.0 Advanced and 2.0 and why 2.0 is
*smaller*; (b) whether "more mechanisms" implies "more secure," with a concrete example from the comparison
table; (c) what you would need to know about their client population before recommending mTLS or DPoP; and
(d) one circumstance in which you would genuinely recommend FAPI 1.0 Advanced.

**Q17.** Using the FAPI 2.0 attacker model, analyse this deployment (the one from the lab: no mandatory PAR,
no mandatory PKCE, `client_secret_basic`, 24-hour bearer tokens, an open redirect on logout, `iss` returned).
For **each** of A1, A1a, A2, A3a, and A5, state whether that attacker can defeat the **authorization** goal,
and by what concrete route. Then rank the four cheapest fixes by how many attackers each one disarms.

**Q18.** A regulator requires that "a customer can withdraw consent at any time and access must cease."
Design the technical control set that satisfies this, using what you know from Modules 04, 07 and 10. State:
the mechanism you would use and why RFC 7009 alone is insufficient; the maximum window between withdrawal and
cessation your design guarantees, and what determines it; the trade-off you are making against the resource
server; and how you would *prove* to the regulator that the control works, given that a formal proof of the
profile says nothing about your implementation (§8.5).
