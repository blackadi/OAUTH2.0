/**
 * Every parameter the authorization-code token request sends, with what it does and what breaks.
 *
 * **Why this file exists.** The headline flow sends *two* requests, and only one of them was ever
 * explained. `data/authParams.ts` documents all 24 authorization parameters with a verified citation, a
 * conformance word and a note; the token request had **nothing** — no builder, no preview, no
 * parameter-level docs. `operationDocs.ts` gave the whole flow two prose entries, *"Client ID"* and
 * *"Redirect URI"*, and the only place in the entire application that documented `code_verifier` as a
 * request parameter was the **MCP** section.
 *
 * That gap sat over the step where the protocol's promises are actually kept. PKCE is not proven in the
 * authorization request — it is *asserted* there and **proven** here. Client authentication happens
 * here. And four of the six most-hit OAuth errors (`invalid_grant`, `invalid_client`,
 * `unauthorized_client`, `unsupported_grant_type`) can only occur here. A learner could finish the flow
 * able to recite 24 authorization parameters and unable to name one field of the request that redeemed
 * their code.
 *
 * **Every citation below was verified against the primary source on 2026-08-22**, per `CLAUDE.md` — RFC
 * 6749 §4.1.3, RFC 7636 §4.5 and §4.6, RFC 7523 §2.2, RFC 7521 §4.2. The conditional wording on
 * `redirect_uri` and `client_id` is quoted rather than paraphrased, because the condition is the part
 * people get wrong.
 */

export type TokenParamPresence =
  /** Sent on every authorization-code exchange. */
  | 'always'
  /** Sent when PKCE was used — which, here, is whenever the authorization request carried a challenge. */
  | 'pkce'
  /** Sent only when the client authenticates with a secret in the body. */
  | 'secret'
  /** Sent only when the client authenticates with a signed assertion (`private_key_jwt`). */
  | 'assertion';

export interface TokenParamSpec {
  name: string;
  /** Where it is defined. Verified against the primary source. */
  spec: string;
  /** The spec's own conformance word, quoted where it is conditional. */
  requirement: string;
  /** What it is and what it is for. */
  note: string;
  /** What happens when it is missing, wrong, or malformed. This is the half that was missing. */
  failure: string;
  presence: TokenParamPresence;
}

export const TOKEN_PARAMS: TokenParamSpec[] = [
  {
    name: 'grant_type',
    spec: 'RFC 6749 §4.1.3',
    requirement: 'REQUIRED',
    note: 'Names which grant is being redeemed. `authorization_code` for this flow — the value the specification pins exactly: *"Value MUST be set to `authorization_code`."*',
    failure:
      'Absent or misspelled earns `unsupported_grant_type`. A value the client is not registered for earns `unauthorized_client`, which is a different failure with a different fix — the grant has to be enabled on the client *and* supported by the service.',
    presence: 'always',
  },
  {
    name: 'code',
    spec: 'RFC 6749 §4.1.3',
    requirement: 'REQUIRED',
    note: 'The authorization code that came back on the redirect. It is **single-use and short-lived**, and it is the thing being exchanged.',
    failure:
      'Replaying a code that has already been redeemed earns `invalid_grant`. Note what *does not* consume it: a refusal that happens **before** redemption leaves the code live — a `use_dpop_nonce` rejection is verified to behave this way, so the same code succeeds on the retry.',
    presence: 'always',
  },
  {
    name: 'redirect_uri',
    spec: 'RFC 6749 §4.1.3',
    requirement:
      'REQUIRED, if the `redirect_uri` parameter was included in the authorization request — "and their values MUST be identical"',
    note: 'Not where the response goes — there is no redirect here. It is repeated so the server can check that the code is being redeemed by the same client, for the same destination, that asked for it.',
    failure:
      'Byte-for-byte identical is the standard: a trailing slash, a different port, `http` against `https`, or a percent-encoding difference all earn `invalid_grant`. The message says nothing about the URI, which is why this one costs people an afternoon.',
    presence: 'always',
  },
  {
    name: 'client_id',
    spec: 'RFC 6749 §4.1.3',
    requirement:
      'REQUIRED, if the client is not authenticating with the authorization server (§3.2.1)',
    note: 'Identifies the client when nothing else does. A **public** client presents this and no credential at all — RFC 6749 §2.3.1 — which is exactly what the SPA’s own client does.',
    failure:
      'For a public client, sending client-authentication *data* alongside it is itself the error: Authlete answers `[A157303]` — "the client type is `public` and the client authentication method is `none`". Measured here, an empty `client_secret=` is tolerated and a non-empty one is refused, so the parameter is omitted rather than emptied.',
    presence: 'always',
  },
  {
    name: 'code_verifier',
    spec: 'RFC 7636 §4.5',
    requirement: 'REQUIRED (when PKCE was used)',
    note: 'The secret whose transform was sent as `code_challenge` in step 1. **This is the parameter that makes PKCE work.** Until now the challenge was only a claim; sending the verifier is what proves the party redeeming the code is the party that requested it.',
    failure:
      'RFC 7636 §4.6: the server recomputes the transform and *"if the values are not equal, an error response indicating `invalid_grant` … MUST be returned."* So editing the challenge by hand in step 1, or losing the verifier, produces `invalid_grant` — and that failure is PKCE doing its job, not a bug.',
    presence: 'pkce',
  },
  {
    name: 'client_secret',
    spec: 'RFC 6749 §2.3.1',
    requirement: 'Depends on the client’s registered method',
    note: 'A confidential client’s credential, in the body — the `client_secret_post` method. The same secret in an `Authorization: Basic` header is `client_secret_basic`: a *different* method, not a different formatting.',
    failure:
      'The channel is checked against what the client registered. A correct secret in the wrong channel is still a `401`: `[A157357]` when credentials are not where Authlete expected them. And presenting both channels at once is refused with `invalid_request` — RFC 6749 §2.3.1: *"The client MUST NOT use more than one authentication method in each request."*',
    presence: 'secret',
  },
  {
    name: 'client_assertion_type',
    spec: 'RFC 7523 §2.2 (parameter defined in RFC 7521 §4.2)',
    requirement: 'REQUIRED (for assertion-based client authentication)',
    note: 'Declares which kind of assertion follows. For JWT client authentication it is exactly `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.',
    failure:
      'A value the server does not recognise leaves the client unauthenticated, so the failure surfaces as `invalid_client` rather than as anything mentioning this parameter.',
    presence: 'assertion',
  },
  {
    name: 'client_assertion',
    spec: 'RFC 7523 §2.2',
    requirement: 'REQUIRED (for assertion-based client authentication)',
    note: 'A single signed JWT standing in for the secret — the `private_key_jwt` method. *"It MUST NOT contain more than one JWT."* Its `aud` is the **authorization server**, never the API the token is for.',
    failure:
      'This request shape appears whenever a FAPI signing key is left in the session, because the callback branches on its presence — so a public client silently starts sending client-authentication data and is refused with `[A157303]`. Grant Flows now warns when such a key is stored, because the mode was previously invisible.',
    presence: 'assertion',
  },
];

/** Which parameters a given exchange actually sends. */
export function tokenParamsFor(options: {
  pkce: boolean;
  auth: 'none' | 'secret' | 'assertion';
}): TokenParamSpec[] {
  return TOKEN_PARAMS.filter((p) => {
    if (p.presence === 'always') return true;
    if (p.presence === 'pkce') return options.pkce;
    if (p.presence === 'secret') return options.auth === 'secret';
    return options.auth === 'assertion';
  });
}
