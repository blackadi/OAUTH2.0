/**
 * Every parameter this deployment's authorization endpoint understands, with what it does and where it
 * is defined.
 *
 * **Why this file exists.** The Grant Flows panel exposed three fields — client id, secret, redirect
 * URI. `scope` came from a build-time constant and could not be changed; `state` and `nonce` were
 * generated invisibly and never shown; `response_type`, `response_mode`, `prompt`, `login_hint`,
 * `max_age`, `acr_values`, `claims`, `resource`, `authorization_details` and
 * `code_challenge_method=plain` were absent entirely. Editing these and watching what the server does
 * with them is the whole premise of the tools this app is measured against.
 *
 * **Every citation here was verified against the primary source on 2026-08-21**, per `CLAUDE.md`: a
 * wrong reference in a teaching tool propagates into other people's mental models. Section numbers
 * come from the specification text, not from recall. Where a document is a draft rather than a final
 * standard, `status` says so, because that distinction changes how much weight a reader should give it.
 */

export type ParamKind = 'text' | 'textarea' | 'select' | 'generated';

export interface AuthParamSpec {
  name: string;
  label: string;
  /** Where it is defined. Verified against the primary source. */
  spec: string;
  /** The spec's own conformance word for this parameter, where it states one. */
  requirement?: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
  /** What it does, and what to watch for on this server. */
  note: string;
  /**
   * The attack this parameter prevents, for the ones that carry a security promise.
   *
   * **Why this field exists.** Across ~2,100 lines of teaching prose in `src/data/`, the words `attack`
   * and `attacker` appeared **zero** times, as did `mix-up`, `injection` and `steal`. The notes were
   * consistently *"change this and watch it break"* — `state`: "tamper with it and watch the callback
   * refuse the result"; `code_challenge`: "the two stop matching and the exchange fails". Every one of
   * those is accurate, and none of them is the attacker model.
   *
   * The difference is not academic. *"Edit `state` and the callback refuses it"* teaches that a check
   * exists. *"Without `state`, any page can start a flow in your browser and receive a code bound to
   * your session"* teaches why anyone wrote one — which is the thing a practitioner needs, and the thing
   * this product is measured on.
   *
   * The sharp part: **this repo already contained the attacker-model prose, written for maintainers
   * rather than rendered for users** — `CallbackPage.tsx` on why a permissive `state` check "modelled
   * the mistake", `session-keys.ts` on the invisible signing key, `trace-store.ts` on RFC 9700 §4.2.4.
   * This promotes it. Omitted for parameters that carry no security promise: a `display` or `ui_locales`
   * with an invented threat would be worse than silence.
   */
  threat?: string;
  kind: ParamKind;
  options?: string[];
  placeholder?: string;
  group: ParamGroup;
  /** On by default, because a plain authorization-code request needs it. */
  defaultOn: boolean;
}

export type ParamGroup = 'core' | 'oidc' | 'pkce' | 'extensions';

export const PARAM_GROUPS: { id: ParamGroup; label: string; blurb: string }[] = [
  {
    id: 'core',
    label: 'Core (RFC 6749 §4.1.1)',
    blurb: 'The authorization-code request itself.',
  },
  {
    id: 'oidc',
    label: 'OpenID Connect (Core 1.0 §3.1.2.1)',
    blurb: 'Added by OIDC when `openid` is in scope.',
  },
  {
    id: 'pkce',
    label: 'PKCE (RFC 7636 §4.3)',
    blurb:
      'Two clients here require it; two deliberately do not, so Modules 02 and 03 can show the difference.',
  },
  {
    id: 'extensions',
    label: 'Extensions',
    blurb: 'Each defined by its own specification.',
  },
];

export const AUTH_PARAMS: AuthParamSpec[] = [
  // ── core ────────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'response_type',
    label: 'response_type',
    spec: 'RFC 6749 §4.1.1 · OIDC Core §3.1.2.1',
    requirement: 'REQUIRED',
    threat:
      'Choosing `token` or `id_token` puts credentials in the URL fragment, where they land in browser history, in `Referer` headers and in any script on the page. That is why RFC 9700 §2.1.2 says the implicit grant SHOULD NOT be used, and why `code` — which puts nothing sensitive in front of the browser — replaced it.',
    note: 'Selects the flow. `code` is the only value this server should be driven with; the implicit and hybrid types exist here so you can watch them be refused. Note that its *presence* also decides how errors come back: with `response_type` set, an invalid request returns a 303 error redirect carrying `error`, `state` and `iss`; without it Authlete answers 400 `[A009301]` as a body, because it cannot determine a response mode.',
    kind: 'select',
    options: ['code', 'token', 'id_token', 'code id_token', 'code token', 'id_token token'],
    group: 'core',
    defaultOn: true,
  },
  {
    name: 'client_id',
    label: 'client_id',
    spec: 'RFC 6749 §4.1.1 · RFC 9101 §5',
    requirement: 'REQUIRED',
    threat:
      "Under JAR it must match the signed object's own `client_id`. Without that equality an attacker could wrap somebody else's signed request object in their own request and have the response delivered to them.",
    note: "The only parameter required in *every* request shape — plain, PAR and JAR alike — which is why it is the only one this server validates locally before handing the request to Authlete. Under JAR it is REQUIRED at the top level and must match the signed request object's own `client_id`.",
    kind: 'text',
    placeholder: 'Registered client identifier',
    group: 'core',
    defaultOn: true,
  },
  {
    name: 'redirect_uri',
    label: 'redirect_uri',
    spec: 'RFC 6749 §3.1.2.3, §4.1.1 · OIDC Core §3.1.2.1',
    requirement: 'REQUIRED',
    threat:
      'Exact matching against a registered value is what stops an **open redirect**: if any URI were accepted, an attacker would register nothing and simply ask for the code to be delivered to their own host. This repo learned it the hard way on the server side — `post_logout_redirect_uri` matched by `startsWith`, and two live-verified payloads got through, one using a hostname prefix and one abusing the `@` userinfo delimiter.',
    note: 'Where the response is sent. OIDC Core makes it REQUIRED; plain OAuth 2.0 does not, and RFC 6749 §3.1.2.3 lets you omit it when exactly one full URI is registered for the client. Must match a registered value.',
    kind: 'text',
    placeholder: 'https://…/callback',
    group: 'core',
    defaultOn: true,
  },
  {
    name: 'scope',
    label: 'scope',
    spec: 'RFC 6749 §3.3 · OIDC Core §3.1.2.1',
    requirement: 'REQUIRED',
    threat:
      'Asking for more than the operation needs is what makes a stolen token expensive. A token scoped to one read is a smaller loss than one scoped to everything the user can do.',
    note: 'What is being asked for. OIDC requires `openid` to be present, and without it you get an OAuth access token and no ID token. This service sets `scopeRequired`, so a request with no scope at all is refused rather than defaulted.',
    kind: 'text',
    placeholder: 'openid profile email',
    group: 'core',
    defaultOn: true,
  },
  {
    name: 'state',
    label: 'state',
    spec: 'RFC 6749 §4.1.1 · OIDC Core §3.1.2.1',
    requirement: 'RECOMMENDED',
    threat:
      "**Without it, any page can start a flow in your browser and receive a code bound to your session** — the attacker completes an authorization they initiated and your client accepts the result as its own. `state` is what proves the response answers a request *this* client made. It is checked fail-closed here: an absent value is answered as 'no', because a check that silently skips is worse than no check.",
    note: 'Opaque value echoed back on the redirect, to bind the response to this request. Generated for you and shown so you can see it come back — and so you can tamper with it and watch the callback refuse the result. RFC 9207 additionally returns `iss`, which this service does not suppress.',
    kind: 'generated',
    group: 'core',
    defaultOn: true,
  },

  // ── OIDC ────────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'nonce',
    label: 'nonce',
    spec: 'OIDC Core §3.1.2.1',
    requirement: 'OPTIONAL',
    threat:
      'Binds the ID token to *this* authentication. Without it a token captured from an earlier, legitimate sign-in can be **replayed** to the client, which has no way to tell a fresh assertion from a recorded one.',
    note: 'Binds the ID token to this request; the value comes back as the `nonce` claim, and a client must check it. OPTIONAL for the code flow, REQUIRED for the implicit flow. Worth knowing on this server: a reissued ID token from a refresh **drops** `nonce`.',
    kind: 'generated',
    group: 'oidc',
    defaultOn: true,
  },
  {
    name: 'response_mode',
    label: 'response_mode',
    spec: 'OIDC Core §3.1.2.1',
    requirement: 'OPTIONAL',
    threat:
      '`fragment` keeps the response out of server logs and `Referer` headers, but also out of reach of any server-side client — which is why a confidential client must use `query` or `form_post`. Choosing the wrong one either leaks the code or makes it unreadable.',
    note: 'How the response is delivered — query string, fragment, or form POST. `query` is the default for the code flow. Change it and watch the callback stop finding the code, which is exactly why a fragment response cannot be read by a server.',
    kind: 'select',
    options: [
      'query',
      'fragment',
      'form_post',
      'jwt',
      'query.jwt',
      'fragment.jwt',
      'form_post.jwt',
    ],
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'prompt',
    label: 'prompt',
    spec: 'OIDC Core §3.1.2.1 · §3.1.2.6',
    requirement: 'OPTIONAL',
    note: "`none` asks for no UI at all and must either succeed silently or fail with one of §3.1.2.6's four errors — this server decides that case without inventing an authentication event, so an unknown `acr` does not satisfy an essential `acr` request. `login` forces reauthentication, `consent` bypasses stored consent, `select_account` asks the user to choose.",
    kind: 'select',
    options: ['none', 'login', 'consent', 'select_account'],
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'max_age',
    label: 'max_age',
    spec: 'OIDC Core §3.1.2.1 · RFC 9470',
    requirement: 'OPTIONAL',
    threat:
      'Freshness is what makes a re-authentication meaningful. Without it, a session opened days ago is indistinguishable from one opened seconds ago, so an attacker at an unlocked machine inherits every authorization the user ever granted.',
    note: 'Maximum seconds since the End-User actively authenticated. Set it small and combine with `prompt=none` to see it fail: on an interactive login it is satisfied by construction, because the user has just authenticated. Requesting it makes `auth_time` a required ID token claim.',
    kind: 'text',
    placeholder: 'e.g. 300',
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'acr_values',
    label: 'acr_values',
    spec: 'OIDC Core §3.1.2.1 · RFC 9470 §3',
    requirement: 'OPTIONAL',
    threat:
      'A high-value operation authorised by a password alone is the whole reason step-up exists. Requesting a stronger context is how a client refuses to accept weaker evidence than the action warrants.',
    note: 'Space-separated authentication context classes, in preference order. This deployment authenticates with `pwd` and nothing else, so asking for anything else is how you trigger a step-up challenge. As a *voluntary* request an unmet value is merely not satisfied; to make it essential, use the `claims` parameter instead.',
    kind: 'text',
    placeholder: 'pwd urn:mace:incommon:iap:silver',
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'claims',
    label: 'claims',
    spec: 'OIDC Core §5.5',
    requirement: 'OPTIONAL',
    note: 'JSON requesting individual claims, and the only way to mark one *essential*. `{"id_token":{"acr":{"essential":true,"values":["…"]}}}` is what makes an unmet ACR fail the authorization rather than being quietly ignored — the Step-Up section builds exactly this.',
    kind: 'textarea',
    placeholder: '{"id_token":{"acr":{"essential":true,"values":["pwd"]}}}',
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'login_hint',
    label: 'login_hint',
    spec: 'OIDC Core §3.1.2.1',
    requirement: 'OPTIONAL',
    note: 'A hint about which identifier the user will log in with, to pre-fill the login page.',
    kind: 'text',
    placeholder: 'admin',
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'id_token_hint',
    label: 'id_token_hint',
    spec: 'OIDC Core §3.1.2.1',
    requirement: 'OPTIONAL',
    threat:
      'A hint is a token somebody hands you, so it must be **verified, not decoded**. This server checks the signature against the service JWKS and pins `iss` and `aud` — because an unsigned hand-made JWT naming any subject was otherwise a remote forced-logout primitive, and `alg: none` and the `HS*` family are refused for the same reason.',
    note: 'A previously issued ID token, as a hint about an existing session. Usually paired with `prompt=none`. This server *verifies* such a hint rather than decoding it — signature against the service JWKS, `iss` against the live discovery document — so a hand-made one is refused.',
    kind: 'textarea',
    placeholder: 'eyJ…',
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'display',
    label: 'display',
    spec: 'OIDC Core §3.1.2.1',
    requirement: 'OPTIONAL',
    note: 'How the OP should present its pages: full page, popup, touch-optimised, or feature phone.',
    kind: 'select',
    options: ['page', 'popup', 'touch', 'wap'],
    group: 'oidc',
    defaultOn: false,
  },
  {
    name: 'ui_locales',
    label: 'ui_locales',
    spec: 'OIDC Core §3.1.2.1',
    requirement: 'OPTIONAL',
    note: "Preferred languages for the OP's UI, as space-separated BCP 47 tags, most preferred first.",
    kind: 'text',
    placeholder: 'en-GB en',
    group: 'oidc',
    defaultOn: false,
  },

  // ── PKCE ────────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'code_challenge',
    label: 'code_challenge',
    spec: 'RFC 7636 §4.3',
    requirement: 'OPTIONAL',
    threat:
      '**PKCE defends against code interception.** An attacker who captures the authorization code — from a redirect on a shared device, a malicious app registered for the same URI, or a logged URL — cannot redeem it, because redemption also requires the verifier, which never left this browser.',
    note: 'The transformed verifier. Generated with its verifier, which is kept for the token exchange — so if you edit this by hand the two stop matching and the exchange fails, which is precisely what PKCE is for. RFC 9700 §2.1.1 (BCP 240) says clients MUST use PKCE; two clients here have it enforced and two deliberately do not.',
    kind: 'generated',
    group: 'pkce',
    defaultOn: true,
  },
  {
    name: 'code_challenge_method',
    label: 'code_challenge_method',
    spec: 'RFC 7636 §4.2, §4.3',
    requirement: 'OPTIONAL',
    threat:
      '`plain` sends the verifier itself as the challenge, so anyone who saw the authorization request has everything needed to redeem the code — it provides no protection against the interception PKCE exists to stop. `S256` sends only a hash. Absence **defaults to `plain`**, which is why an enforcing client refuses it outright rather than accepting the weaker mode silently.',
    note: 'How the verifier was transformed. **Defaults to `plain` when absent** — the value `S256` is the one you want, and `plain` sends the verifier itself, which is why an enforcing client here refuses it with `[A124308]`. Switching to `plain` below rewrites the challenge accordingly so you can see the difference on the wire.',
    kind: 'select',
    options: ['S256', 'plain'],
    group: 'pkce',
    defaultOn: true,
  },

  // ── extensions ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'resource',
    label: 'resource',
    spec: 'RFC 8707 §2.1 (Resource Indicators for OAuth 2.0)',
    requirement: 'OPTIONAL',
    threat:
      'Audience restriction is what stops a token issued for one API being replayed against another. Without it, a resource server that accepts any token from this issuer will honour one that was never meant for it.',
    note: 'Which API the token is for. MUST be an absolute URI with no fragment, and MAY be repeated for multiple resources. Send it on the *token* request too — the token request is what narrows the audience of the token actually issued, and sending it only here achieves nothing observable.',
    kind: 'text',
    placeholder: 'https://api.example.com',
    group: 'extensions',
    defaultOn: false,
  },
  {
    name: 'authorization_details',
    label: 'authorization_details',
    spec: 'RFC 9396 §2 (OAuth 2.0 Rich Authorization Requests)',
    requirement: 'OPTIONAL',
    note: 'A JSON array of objects, each REQUIRING a `type` member, replacing coarse scopes with structured detail — an amount, an account, a set of actions. The RAR section has a fuller editor with worked examples.',
    kind: 'textarea',
    placeholder: '[{"type":"payment_initiation","actions":["initiate"]}]',
    group: 'extensions',
    defaultOn: false,
  },
  {
    name: 'request_uri',
    label: 'request_uri',
    spec: 'RFC 9126 §2 (PAR) · RFC 9101 §5 (JAR)',
    requirement: 'OPTIONAL',
    threat:
      'Same protection as `request`, with the parameters never passing through the browser at all: they are pushed server-to-server first, and the front channel carries only an opaque reference. Nothing sensitive is exposed to the user agent, and there is no length limit to work around.',
    note: 'A reference to a request already pushed to the server, standing in for the parameters themselves. Produce one in the PAR section, then send it here with `client_id` alone — everything else travels inside it.',
    kind: 'text',
    placeholder: 'urn:ietf:params:oauth:request_uri:…',
    group: 'extensions',
    defaultOn: false,
  },
  {
    name: 'request',
    label: 'request',
    spec: 'RFC 9101 §5 (JAR)',
    requirement: 'OPTIONAL',
    threat:
      'A signed request object is what stops the browser — or anything sitting in front of it — from **altering parameters in flight**: changing the scope, swapping the redirect URI, or downgrading `code_challenge_method`. The signature covers the whole request, so tampering is detectable rather than merely unlikely.',
    note: "The whole request as a signed JWT, so the server can verify it was not tampered with in the browser. This service uses RFC 9101 processing rather than OIDC Core §6's legacy path, and requires an `nbf` claim on the object.",
    kind: 'textarea',
    placeholder: 'eyJ…',
    group: 'extensions',
    defaultOn: false,
  },
  {
    name: 'dpop_jkt',
    label: 'dpop_jkt',
    spec: 'RFC 9449 §10 (Authorization Code Binding to a DPoP Key)',
    requirement: 'OPTIONAL',
    threat:
      'Binding the **code** to the DPoP key closes the window that binding only the token leaves open: without it, a stolen code can still be redeemed by whoever stole it, and only the resulting token is sender-constrained. With it, a code is useless to anyone who cannot prove possession of the key.',
    note: 'The **RFC 7638** JWK Thumbprint (SHA-256, base64url) of the DPoP key you will prove possession of at the token endpoint — the same value that comes back as `cnf.jkt` on the token. Filled and enabled automatically when you tick **Sender-constrain with DPoP**. **Get it wrong and the token request is refused**, not ignored: §10 says the AS *"computes the JWK Thumbprint of the proof-of-possession public key in the DPoP proof and verifies that it matches the `dpop_jkt` parameter value… If they do not match, it **MUST** reject the request."* The thumbprint is computed over `crv`, `kty`, `x`, `y` **only**, in that lexicographic order with no whitespace — every other member of the JWK is excluded, which is the single most common way to compute the wrong one. A key `kid` is **not** a thumbprint even when it also looks like a base64url SHA-256 digest.',
    kind: 'text',
    placeholder: 'JWK thumbprint',
    group: 'extensions',
    // Not on by default, and not a static default at all: `AuthorizeRequestBuilder` enables this row
    // when a thumbprint actually exists, which is the only state in which the parameter means anything.
    defaultOn: false,
  },
  {
    name: 'grant_management_action',
    label: 'grant_management_action',
    spec: 'Grant Management for OAuth 2.0 §5.2 (draft)',
    requirement: 'OPTIONAL',
    note: '`create` starts a fresh grant, `merge` adds the new permissions to an existing one, `replace` narrows it to only the new ones — and both `merge` and `replace` invalidate existing refresh tokens. The resulting `grant_id` comes back in the token response. **Draft, not a final standard.**',
    kind: 'select',
    options: ['create', 'merge', 'replace'],
    group: 'extensions',
    defaultOn: false,
  },
  {
    name: 'grant_id',
    label: 'grant_id',
    spec: 'Grant Management for OAuth 2.0 §5.2 (draft)',
    requirement: 'OPTIONAL',
    note: 'Names the grant that `merge` or `replace` acts on. Required for those two actions and meaningless with `create`. **Draft, not a final standard.**',
    kind: 'text',
    placeholder: 'grant identifier from a previous token response',
    group: 'extensions',
    defaultOn: false,
  },
];
