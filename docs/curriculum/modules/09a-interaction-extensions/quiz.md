# Module 09a — Quiz

20 items across four tiers. Don't advance to Module 09b until you can pass **Tier 4**. Answers and explanations
in [quiz-answers.md](quiz-answers.md).

> **Q20 is different from every other item in the curriculum.** It hands you an extension you were never
> taught and asks you to place it. That is one of the five things the [curriculum README](../../README.md)
> promises you will be able to do, and this is where it is tested.

---

## Tier 1 — Recall (5)

**Q1.** Which three claims MUST a JARM response JWT contain?
- A) `iss`, `sub`, `exp`  B) `iss`, `aud`, `exp`  C) `iss`, `aud`, `nonce`  D) `aud`, `exp`, `state`

**Q2.** Which client metadata parameter enables signed JARM responses?
- A) `id_token_signed_response_alg`
- B) `request_object_signing_alg`
- C) `authorization_signed_response_alg`
- D) `response_mode_signing_alg`

**Q3.** RFC 9470 defines which error code?
- A) `insufficient_scope`  B) `invalid_token`
- C) `insufficient_user_authentication`  D) `interaction_required`

**Q4.** In CIBA, which delivery mode requires the client to expose a publicly reachable endpoint that receives
the **tokens themselves**?
- A) poll  B) ping  C) all three  D) push

**Q5.** In RFC 9396, which field of an `authorization_details` object is REQUIRED?
- A) `type`  B) `actions`  C) `locations`  D) `identifier`

## Tier 2 — Applied reasoning (5)

**Q6.** Your deployment already uses PAR, JAR, PKCE and `state`. A colleague asks what JARM could possibly add.
Give the two distinct properties, and say which attack each closes.

**Q7.** A call centre takes card payments over the phone. The agent's terminal must obtain a payment
authorization from the customer. Which extension, which delivery mode, and what is the single biggest risk you
have introduced?

**Q8.** A resource server returns:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="insufficient_user_authentication"
```

What can the client do next, and what should the header have contained?

**Q9.** For each, choose RAR or scopes and justify in one line: (a) "read this user's email"; (b) "transfer
€500 to IBAN X once"; (c) "administer the tenant"; (d) "read patient records for encounter 4471 for one hour".

**Q10.** A service's `supportedAcrs` is empty, yet its ID tokens carry `acr: "pwd"`. Explain why this is a
finding rather than a curiosity, and what a resource server relying on that `acr` is actually trusting.

## Tier 3 — Trace and diagnose (5)

**Q11.** A client handles a JARM response like this:

```js
const jwt = new URL(location.href).searchParams.get("response");
const { code, state } = JSON.parse(atob(jwt.split(".")[1]));
if (state !== sessionStorage.getItem("state")) throw new Error("state mismatch");
return exchangeCode(code);
```

Name every check that is missing, and argue whether this client is better or worse off than one not using JARM
at all.

**Q12.** An authorization request with `response_mode=form_post.jwt` produces:

```
HTTP/1.1 302 Found
Location: %3Chtml%3E%3Chead%3E%3Cmeta%20http-equiv=...
```

You have access to the authorization server's raw API. Describe the one request you would make to determine
whether this is the application's bug or the authorization server's, and state what each possible answer would
mean.

**Q13.** A CIBA endpoint returns this on a client-configuration error:

```json
{"resultCode":"A169301","resultMessage":"[A169301] The backchannel token delivery mode …","action":"BAD_REQUEST",
 "responseContent":"{\"error\":\"unauthorized_client\",\"error_description\":\"…\"}","clientId":1234}
```

Two problems with this response as an API contract. Name both, and say which field should have been the entire
body.

**Q14.** Three CIBA endpoints, given the same nonexistent ticket, return 400, 403, and 500 respectively. Which
is most clearly wrong, why, and what operational consequence follows?

**Q15.** A team requests `acr_values=mfa` and receives a token whose `acr` is `pwd`. They file a bug against
the authorization server. Are they right? Explain using the distinction between `acr_values` and an essential
`acr` claim, and say what they should have sent.

## Tier 4 — Adversarial and design (4)

**Q16.** You control a client that is permitted to use CIBA on a bank's authorization server, and you know one
customer's `login_hint`. Write the attack: what you send, what the customer sees on their phone, why the bank's
own branding works in your favour, and what you gain if they approve. Then rank `binding_message`, `user_code`,
and client permissioning by how much each actually reduces your success rate, and name what none of them fixes.

**Q17.** A payments API must require stronger authentication for transfers over €1,000. Design the full
round trip: the resource server's exact `WWW-Authenticate` header, what the client does with it, the
authorization request it constructs, how the authorization server must respond if it cannot satisfy the
requirement, and how the resource server verifies the new token really is stronger. Then identify the two places
this design can silently degrade into accepting a weak authentication, and how you would test for each.

**Q18.** Your organisation is adopting RAR for an open-banking API. Write the case *against* it that a
skeptical platform engineer would make, then answer it. Cover: what you must build and maintain that scopes do
not require, how versioning works when the payment schema changes, what the consent screen must do, and what
happens when a resource server receives an `authorization_details` type it does not recognise. Conclude with
the one condition under which you would abandon RAR and go back to scopes.

**Q19.** Every extension in this module was one unset configuration field away from working, and none needed
server code. Argue what that implies for how you audit an authorization server — specifically: why a capability
matrix built from discovery metadata is inadequate, what you would collect instead, and how you would present
"permitted but not configured" differently from "supported but not required" to an engineering team that has to
act on your report.

**Q20 — place an extension you have not been taught.**

Everything in this curriculum so far has told you where a mechanism sits. This item does not. Below is a
factual brief on two documents that appear nowhere in Modules 00–09a. **Nothing else is provided, and you
should not look them up** — the point is to place an unfamiliar extension using only the frames you already
have.

> **Brief.** *(Verified against the primary sources on 2026-08-02. Revisions and dates are given because
> Module 07 says a draft citation without them is not a citation — and because part 4 asks about it.)*
>
> **(A) OAuth Client ID Metadata Document (CIMD)** — `draft-ietf-oauth-client-id-metadata-document-01`,
> **2 March 2026**, IETF OAuth working group, intended status Standards Track, expires 3 September 2026.
> It permits a client to use an **HTTPS URL as its `client_id`** — the URL must use the `https` scheme and
> contain a path component. When an authorization server encounters such a `client_id` it **dereferences the
> URL** and retrieves a JSON document of client metadata in the shape RFC 7591 defines; the document MUST
> include at least `client_id`, `client_name` and `redirect_uris`, and its `client_id` MUST match the URL
> exactly. There is no registration request and no registration response. Authorization servers advertise
> support with `client_id_metadata_document_supported` in their RFC 8414 metadata, and cache the document
> respecting HTTP cache headers.
>
> **(B) The Model Context Protocol (MCP) authorization specification** — revision **2025-11-25**, governing
> how AI agents reach third-party tools and data. Authorization is **OPTIONAL** for MCP implementations; when
> supported, an MCP server acts as an **OAuth 2.1 resource server** and an MCP client as an **OAuth 2.1
> client**. It requires authorization servers to implement OAuth 2.1; requires MCP servers to implement
> **RFC 9728 protected resource metadata** and clients to use it for authorization-server discovery; requires
> clients to implement **RFC 8707 `resource`** and send it *"in both authorization requests and token
> requests"*, **regardless of whether the authorization server supports it**; and requires **PKCE with
> `S256`**. On client identity it gives a priority order — pre-registration first, then **CIMD (SHOULD)**,
> then **RFC 7591 dynamic registration (MAY**, retained *"for backwards compatibility"***)**.

Answer all five:

1. **Which unexamined assumption does CIMD lift?** State it in the form Module 09a used for its own four —
   *"every module so far assumed X."* Then say which extension in this module it most resembles structurally,
   and why it is nonetheless doing a different job.
2. **Which earlier modules does each presuppose?** For CIMD and for MCP separately, name the specific
   material a reader must already have, and the one module whose content each *directly extends*.
3. **What breaks without each?** Give the concrete failure — not "it is less convenient."
4. **What is each one's status**, in the vocabulary Module 07 taught, and what follows for how you would cite
   them in a review?
5. **Place CIMD relative to DCR (Module 04) and to `private_key_jwt` (Module 06).** Is it an alternative to
   one, to both, or to neither? Defend the answer, and name the security property DCR has that CIMD does not
   — and the one CIMD has that DCR does not.

Then the harder half: **name the thing about this brief that should have made you suspicious**, and say what
you would need to read before recommending either.
