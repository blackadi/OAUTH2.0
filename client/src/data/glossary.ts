/**
 * The words this application uses without defining them.
 *
 * **Why this file exists.** `claimDocs.ts` defines 26 JWT *claims* and was imported by exactly one
 * component — `JwtInspector` — so a definition was visible **only if you decoded a token that happened
 * to contain that claim**. Nothing anywhere defined *front channel*, *back channel*, *public client*,
 * *confidential client*, *bearer* or *sender-constrained*, and all of them appear in the interface copy.
 * A novice meeting "sender-constrain with DPoP" on their first screen had nowhere to look.
 *
 * **Every citation was verified against the primary source on 2026-08-22**, per `CLAUDE.md`. Where a
 * term is conventional rather than defined by a specification, that is stated instead of inventing a
 * citation — "everyone says this" and "RFC 6749 §1.1 says this" are different kinds of claim and a
 * teaching tool must not blur them.
 */

export interface GlossaryEntry {
  term: string;
  /** Where it is defined, or "conventional" when no document defines it. */
  spec: string;
  /** What it means, in one or two sentences. */
  definition: string;
  /** Why it matters here — the deployment-specific half. Omitted where there is nothing to add. */
  here?: string;
  /** Related terms, by `term`. */
  see?: string[];
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Authorization server',
    spec: 'RFC 6749 §1.1',
    definition:
      'The server that authenticates the resource owner and issues tokens. It owns the authorization endpoint and the token endpoint.',
    here: 'This deployment is one: Express in front, Authlete behind. Everything under `/api` that is not admin or a resource is the authorization server talking.',
    see: ['Resource server', 'Client'],
  },
  {
    term: 'Client',
    spec: 'RFC 6749 §1.1',
    definition:
      'The application asking for a token. Not the browser and not the user — the piece of software that will use the token.',
    here: 'This dashboard is a client, registered as `4277838306`. The "Client" lane in the sequence diagram is this page.',
    see: ['Public client', 'Confidential client'],
  },
  {
    term: 'Resource owner',
    spec: 'RFC 6749 §1.1',
    definition:
      'Whoever can grant access to the protected resource. When that is a person, the specification calls them the *end-user*.',
    see: ['Client'],
  },
  {
    term: 'Resource server',
    spec: 'RFC 6749 §1.1',
    definition:
      'The server hosting the protected resource, which accepts tokens rather than issuing them.',
    here: 'There are two here: `/api/userinfo` and `/api/gm`. Both route every token presentation through the same helpers, so they answer identically case by case.',
    see: ['Authorization server', 'Bearer token'],
  },
  {
    term: 'Public client',
    spec: 'RFC 6749 §2.1',
    definition:
      'A client that cannot keep a secret — anything running on a device or in a browser, where the code is inspectable. It is identified by `client_id` and authenticates with nothing.',
    here: 'This SPA is one, registered with `tokenAuthMethod: NONE`. Authlete refuses **any** client-authentication data from it: `[A157303]`. That is why the token request omits `client_secret` rather than sending it empty.',
    see: ['Confidential client', 'PKCE'],
  },
  {
    term: 'Confidential client',
    spec: 'RFC 6749 §2.1',
    definition:
      'A client that can hold a credential — typically server-side — and so can authenticate to the token endpoint.',
    here: 'Which *method* it uses is registered per client and enforced: the right secret on the wrong channel is still a 401 (`[A157357]`).',
    see: ['Public client', 'Client authentication'],
  },
  {
    term: 'Client authentication',
    spec: 'RFC 6749 §2.3',
    definition:
      'How a confidential client proves its identity at the token endpoint. `client_secret_basic` puts it in an `Authorization: Basic` header; `client_secret_post` puts it in the body; `private_key_jwt` sends a signed assertion instead.',
    here: 'These are different *methods*, not different formatting of one method — and §2.3.1 says a client "MUST NOT use more than one authentication method in each request", which this server enforces before any call to Authlete.',
    see: ['Confidential client', 'private_key_jwt'],
  },
  {
    term: 'Front channel',
    spec: 'Conventional — not defined by RFC 6749',
    definition:
      'Communication that travels **through the user’s browser**, as a redirect. The authorization request and the redirect carrying the code are both front-channel hops.',
    here: 'Anything on the front channel is visible to the user, to browser history, and to anything else running on the page — which is why the code alone is not enough to get a token. The trace panel marks these hops `NAV`.',
    see: ['Back channel', 'PKCE', 'Authorization code'],
  },
  {
    term: 'Back channel',
    spec: 'Conventional — not defined by RFC 6749',
    definition:
      'A direct server-to-server call that the browser never sees. The token request is back-channel.',
    here: 'This is the distinction the four-lane sequence diagram exists to draw: solid arrows with a status are back-channel, dashed one-way arrows are front-channel.',
    see: ['Front channel'],
  },
  {
    term: 'Authorization code',
    spec: 'RFC 6749 §1.3.1',
    definition:
      'A short-lived, single-use value the authorization server hands back through the browser, to be exchanged for tokens on the back channel.',
    here: 'A *failed* exchange does not necessarily consume it — verified here: a code survives a `use_dpop_nonce` refusal and succeeds on the retry. That is why the trace redacts `code` on export.',
    see: ['Front channel', 'PKCE'],
  },
  {
    term: 'PKCE',
    spec: 'RFC 7636',
    definition:
      'Proof Key for Code Exchange. The client invents a secret (`code_verifier`), sends only its hash (`code_challenge`) on the front channel, and reveals the secret on the back channel when redeeming the code.',
    here: 'RFC 9700 §2.1.1 says clients MUST use it. Two clients here enforce it and two deliberately do not, because Modules 02 and 03 teach what its absence costs.',
    see: ['Authorization code', 'Front channel'],
  },
  {
    term: 'Bearer token',
    spec: 'RFC 6750 §1.2',
    definition:
      'A token that anybody holding it can use — "bearer" in the sense of a bearer cheque. Possession is the entire proof.',
    here: 'Presented as `Authorization: Bearer <token>`. It is the default here, and the reason a leaked access token is an urgent problem rather than an inconvenience.',
    see: ['Sender-constrained token', 'DPoP'],
  },
  {
    term: 'Sender-constrained token',
    spec: 'RFC 9449 §1',
    definition:
      'A token bound to a key the legitimate client holds, so possession of the token alone is not enough to use it.',
    here: 'A DPoP-bound token carries `cnf.jkt` and **must** be presented with the `DPoP` scheme (§7.1). Authlete refuses the bearer downgrade — `[A089311]` at UserInfo, `[A281305]` at `/gm`.',
    see: ['DPoP', 'Bearer token'],
  },
  {
    term: 'DPoP',
    spec: 'RFC 9449',
    definition:
      'Demonstrating Proof of Possession. The client signs a small JWT per request with a key it holds, and the server checks the signature against the key the token was bound to.',
    here: 'Optional in Grant Flows. The proof must reach *every* Authlete call a request makes — `/api/gm` makes two, and both check the binding independently.',
    see: ['Sender-constrained token', 'Nonce'],
  },
  {
    term: 'Nonce',
    spec: 'OIDC Core §3.1.2.1 (also RFC 9449 §8 for DPoP nonces)',
    definition:
      'A value used once, to bind a response to a request. The OIDC `nonce` comes back as an ID token claim; a DPoP nonce is a server-chosen value the client must replay in its proof.',
    here: 'They are different things with the same name. The DPoP nonce here is **time-based, not one-time** — every probe returned the same value within its window, so a client should cache and reuse it.',
    see: ['DPoP', 'State'],
  },
  {
    term: 'State',
    spec: 'RFC 6749 §4.1.1',
    definition:
      'An opaque value the client sends on the authorization request and checks when the response comes back, to prove the response answers a request it made.',
    here: 'Checked fail-closed: an absent stored value is answered as "no". Without it, any page could start a flow in your browser and have your client accept the result.',
    see: ['Front channel', 'Nonce'],
  },
  {
    term: 'ID token',
    spec: 'OIDC Core §2',
    definition:
      'A signed JWT making claims about the authentication event and the end-user. It is for the client, not for an API.',
    here: 'Never send it to a resource server. `iss`, `sub`, `aud`, `exp` and `iat` are REQUIRED in one; the inspector starts *unverified* because a legible payload is not an authenticated one.',
    see: ['Access token', 'Audience'],
  },
  {
    term: 'Access token',
    spec: 'RFC 6749 §1.4',
    definition:
      'The credential presented to a resource server. Its format is deliberately unspecified — it may be opaque or a JWT.',
    here: 'Opaque by default on this deployment, which is normal and not a defect. `createLocalToken` exists to hand you an RFC 9068 JWT specimen to decode.',
    see: ['Bearer token', 'Refresh token', 'ID token'],
  },
  {
    term: 'Refresh token',
    spec: 'RFC 6749 §1.5',
    definition: 'A credential for obtaining a new access token without involving the user again.',
    here: 'Opaque by design. This service keeps rather than rotates them (`refreshTokenKept: true`), which FAPI 2.0 requires.',
    see: ['Access token'],
  },
  {
    term: 'Scope',
    spec: 'RFC 6749 §3.3',
    definition:
      'A space-delimited list naming what access is being requested. The server may grant less than was asked for.',
    here: 'Required on every authorization request here (`scopeRequired: true`), so an empty one is refused rather than defaulted. Adding `openid` is what turns an OAuth request into an OIDC one.',
    see: ['Audience', 'Claim'],
  },
  {
    term: 'Audience',
    spec: 'RFC 7519 §4.1.3',
    definition:
      'Who a token is *for*. A recipient must reject a token whose audience is not itself.',
    here: 'Emitted as a single string rather than an array on this service — a FAPI working-group decision from November 2024. Do not confuse an ID token’s `aud` (the client) with an access token’s (the API).',
    see: ['ID token', 'Claim'],
  },
  {
    term: 'Claim',
    spec: 'RFC 7519 §4',
    definition: 'One name/value assertion inside a JWT.',
    here: 'RFC 7519’s registered claims are all OPTIONAL *in that document* — they become required by whatever profile uses them, and "required" without saying by what is the mistake people make.',
    see: ['ID token', 'Audience'],
  },
  {
    term: 'Discovery',
    spec: 'RFC 8414 · OpenID Connect Discovery 1.0',
    definition:
      'A JSON document at a well-known URL describing what the authorization server supports, so a client need not be configured by hand.',
    here: 'Count its members, never quote a remembered count: this document has changed size several times as flags were enabled, and a count without a list cannot say *what* changed.',
    see: ['Authorization server'],
  },
  {
    term: 'private_key_jwt',
    spec: 'RFC 7523 §2.2 (parameters from RFC 7521 §4.2)',
    definition:
      'Client authentication by signed assertion instead of a shared secret: the client sends a JWT signed with its own key, and `client_assertion_type` names the shape.',
    here: 'A stored FAPI signing key silently switches every later code exchange to this method — which for a public client is refused with `[A157303]`. Grant Flows warns when one is present, because the mode was previously invisible.',
    see: ['Client authentication', 'Public client'],
  },
  {
    term: 'Introspection',
    spec: 'RFC 7662',
    definition:
      'An endpoint a resource server calls to ask the authorization server whether a token is active and what it carries.',
    here: '§2.1 requires the endpoint to be protected, so both introspection endpoints here take this deployment’s admin credentials. `Accept: application/token-introspection+jwt` returns RFC 9701’s signed form — which additionally needs `rsUri`.',
    see: ['Access token', 'Resource server'],
  },
  {
    term: 'Grant',
    spec: 'RFC 6749 §1.3 · Grant Management for OAuth 2.0 (draft)',
    definition:
      'Two senses, and they are worth keeping apart. A *grant type* is a way of obtaining a token (authorization code, client credentials, refresh). A *grant* in the management sense is the standing consent a set of tokens was issued under.',
    here: 'Revoking a grant kills every token issued under it. A client-credentials token has no grant at all, so machine-to-machine grant management is not supported here.',
    see: ['Refresh token', 'Scope'],
  },
];

export const GLOSSARY_BY_TERM: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((e) => [e.term, e]),
);

/** A URL-safe fragment for deep-linking a single entry. */
export function glossarySlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
