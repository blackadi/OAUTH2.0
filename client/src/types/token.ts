export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  client_assertion_type?: string;
  client_assertion?: string;
}

/**
 * The tokens a successful grant issues — the fields this UI actually reads.
 *
 * **Separate from `TokenResponse` on purpose, and the split is the fix for a real duplication.**
 * `TokenContext` declared its own `TokenSet` with these same six fields and no index signature, so the
 * two shapes were the same idea written twice and *not assignable to each other*: passing a `TokenSet`
 * where a `TokenResponse` was expected failed with "index signature for type 'string' is missing". Every
 * component that renders a token wants exactly this narrow shape; only the transport boundary wants the
 * open one.
 *
 * RFC 6749 §5.1 defines `access_token` and `token_type` as REQUIRED in a token response and the rest as
 * optional; they are all optional here because this type also describes what the app *holds*, which may
 * have come from an earlier session or a partially completed flow.
 */
export interface IssuedTokens {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * A token response as it arrives on the wire.
 *
 * The index signature is deliberate and belongs *only* here: an authorization server may return
 * anything alongside the standard members — `grant_id` from Grant Management, `authorization_details`
 * from RFC 9396, vendor extensions — and a debugger must not discard what it does not model. Components
 * should take `IssuedTokens` instead, so the open shape stops at the boundary that needs it.
 */
export interface TokenResponse extends IssuedTokens {
  [key: string]: unknown;
}

export interface JwksResponse {
  keys: Array<{
    kty: string;
    kid?: string;
    use?: string;
    alg?: string;
    n?: string;
    e?: string;
    x5t?: string;
    x5c?: string[];
  }>;
}
