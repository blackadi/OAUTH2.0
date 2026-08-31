export interface OpDoc {
  title: string;
  description: string;
  params: { name: string; desc: string }[];
  returns: string;
  tips?: string;
}

const docs: Record<string, Record<string, OpDoc>> = {
  'auth-flows': {
    authorization_code: {
      title: 'Authorization Code Flow (PKCE)',
      description:
        'The most secure OAuth 2.0 flow for public clients. Redirects the user to the authorization server, where they log in and consent. The server returns an authorization code, which is exchanged for tokens. PKCE (Proof Key for Code Exchange) ensures even if the code is intercepted, it cannot be exchanged without the original code verifier.',
      params: [
        {
          name: 'Client ID',
          desc: 'The public identifier for your client application, registered in Authlete.',
        },
        {
          name: 'Redirect URI',
          desc: 'Where the authorization server sends the user after login. Must match the URI registered for this client in Authlete.',
        },
      ],
      returns:
        'Redirects to the authorization page, then to your callback with a code. The callback exchanges it for tokens (access_token, refresh_token, id_token).',
      tips: 'Use this for browser-based apps (SPAs) and mobile apps. Always use PKCE (S256) — it is automatically applied. After the redirect, tokens appear in the vault above.',
    },
    client_credentials: {
      title: 'Client Credentials Flow',
      description:
        'A server-to-server flow where the client authenticates directly with its client ID and secret to obtain an access token. No user interaction is needed. Used for machine-to-machine communication.',
      params: [
        { name: 'Client ID', desc: 'Your client identifier registered in Authlete.' },
        {
          name: 'Client Secret',
          desc: 'The secret key for your client. Keep this confidential — never expose it in browser-side code in production.',
        },
        {
          name: 'Scope',
          desc: 'Space-separated list of scopes the token should have (e.g. openid profile email). Must be a subset of the scopes allowed for this client.',
        },
      ],
      returns: 'JSON with access_token, token_type (Bearer), expires_in (seconds), and scope.',
      tips: 'Great for backend services, cron jobs, and API integrations. No user context — the token is tied to the client, not a user.',
    },
    password: {
      title: 'Password Grant (ROPC)',
      description:
        'The Resource Owner Password Credentials grant lets users provide their username and password directly to the client, which sends them to the authorization server. Recommended only for trusted first-party apps when no better flow is possible.',
      params: [
        { name: 'Username', desc: "The end-user's username (e.g. admin)." },
        { name: 'Password', desc: "The end-user's password." },
        { name: 'Client ID', desc: 'Your client identifier registered in Authlete.' },
        { name: 'Client Secret', desc: 'The secret key for your client.' },
        { name: 'Scope', desc: 'Space-separated list of scopes (e.g. openid profile email).' },
      ],
      returns:
        'JSON with access_token, refresh_token, id_token (if openid scope included), token_type, and expires_in.',
      tips: 'Avoid this flow if possible. It exposes credentials to the client app. Migrate to Authorization Code + PKCE for better security.',
    },
    refresh_token: {
      title: 'Refresh Token Flow',
      description:
        'Uses a refresh token (obtained from a previous authorization) to get a new access token without requiring the user to log in again. Refresh tokens are long-lived and should be stored securely.',
      params: [
        {
          name: 'Refresh Token',
          desc: 'The refresh token previously obtained from a token response. It is pre-filled from the current session if available.',
        },
        { name: 'Client ID', desc: 'Your client identifier registered in Authlete.' },
        { name: 'Client Secret', desc: 'The secret key for your client.' },
      ],
      returns:
        'JSON with a new access_token, optionally a new refresh_token, expires_in, and scope.',
      tips: 'Use this to maintain long-lived sessions. Authlete can be configured to keep or rotate refresh tokens on each use.',
    },
    jwt_bearer: {
      title: 'JWT Bearer Grant (RFC 7523)',
      description:
        'Exchanges a signed JWT assertion for an access token, with no user interaction and no client secret in the request. The assertion proves the caller holds a key the authorization server already trusts, which makes it the usual choice for service-to-service access where a shared secret would be awkward to rotate.',
      params: [
        {
          name: 'Signed JWT Assertion',
          desc: 'A JWT signed with a key registered to the client. Must carry `iss`, `sub`, `aud` and `exp`.',
        },
        { name: 'Scope', desc: 'Optional. Space-separated scopes for the issued token.' },
        {
          name: 'Client ID / Secret',
          desc: 'Optional. Supplying both authenticates the client via HTTP Basic in addition to the assertion.',
        },
      ],
      returns: 'JSON with access_token, token_type and expires_in.',
      tips: "Two mistakes account for most failures here. The assertion's `aud` must identify the **authorization server** — its issuer identifier or its token endpoint — and not the API you intend to call; naming the API earns `[A314314]`. And `exp` is required: without it Authlete refuses the assertion with `[A314305]` before any verification step runs. The audience you want for the *token* comes from the `resource` parameter instead.",
    },
  },
  federation: {
    configuration: {
      title: 'Federation Entity Configuration',
      description:
        "Serves this entity's signed Entity Statement — the self-issued JWT that declares who it is, which keys it signs with, and which roles it plays in a federation. A trust chain is assembled from statements like this one.",
      params: [],
      returns:
        'A signed JWT with media type `application/entity-statement+jwt`, whose claims include `iss`, `sub`, `jwks` and `metadata`.',
      tips: 'The `iss` and `sub` of an Entity Configuration are the same value — an entity describing itself. Decode it in the JWT inspector to see the metadata a trust anchor would read.',
    },
    registration: {
      title: 'Federation Registration',
      description:
        'Registers a client by presenting a trust chain rather than by pre-agreed credentials. The authorization server validates the chain up to a trust anchor it already trusts, and derives the client metadata from it.',
      params: [
        { name: 'Entity Statement / Trust Chain', desc: 'The signed statement chain to validate.' },
      ],
      returns:
        'The resulting client registration, or an error describing where chain validation stopped.',
      tips: 'This is automatic client registration without a registration secret: trust comes from the chain, not from something the client was told in advance.',
    },
  },
  'grant-mgmt': {
    query: {
      title: 'Query a Grant',
      description:
        'Reads what a grant currently covers — its scopes, claims and authorization details — using an access token issued under that grant.',
      params: [
        {
          name: 'Access Token',
          desc: "A token issued under the grant being queried. It must be the grant's own token: this server introspects it and refuses if the grant it was issued under is not the one named.",
        },
        {
          name: 'Grant ID',
          desc: 'The `grant_id` returned in a token response after a `grant_management_action`.',
        },
      ],
      returns: 'JSON describing the grant: scopes, claims, and authorization details.',
      tips: 'Present the token with the scheme it requires — a sender-constrained token must use `DPoP` and carry a proof, or Authlete refuses it with `[A281305]`. The ownership check runs *before* the vendor call, so a 403 means "not your grant" while a 401 means the token itself was not accepted.',
    },
    revoke: {
      title: 'Revoke a Grant',
      description:
        'Deletes a grant and everything issued under it. Broader than revoking one token: the whole standing permission goes.',
      params: [
        { name: 'Access Token', desc: 'A token issued under the grant being revoked.' },
        { name: 'Grant ID', desc: 'The grant to delete.' },
      ],
      returns: '204 with no body on success.',
      tips: 'Irreversible. After this the subject cannot find its own grant, and every refresh token under it is dead.',
    },
  },
  'step-up': {
    introspect: {
      title: 'Step-Up Authentication Challenge (RFC 9470)',
      description:
        "Asks whether a token's authentication is strong enough and recent enough for a given requirement. When it is not, the resource answers `insufficient_user_authentication` with the ACR values or maximum age it needs, and the client re-authorizes to satisfy them.",
      params: [
        {
          name: 'Required ACR Values',
          desc: 'Space-separated Authentication Context Class References the resource insists on.',
        },
        {
          name: 'Max Authentication Age',
          desc: 'Maximum seconds since the End-User actively authenticated.',
        },
        {
          name: 'Admin Client ID / Secret',
          desc: "The introspection endpoint is protected (RFC 7662 §2.1), so this deployment's management credentials are required.",
        },
      ],
      returns:
        "On success, the token's introspection result. On a challenge, 403 with `insufficient_user_authentication` plus `acr_values` or `max_age`, and the token's current `acr` and `auth_time`.",
      tips: 'This deployment only ever satisfies ACR `pwd`, so asking for anything else triggers a challenge. `max_age` can only genuinely fail on a non-interactive path — after an interactive login the user has just authenticated, so any maximum age is satisfied by construction. To make an ACR *essential* rather than merely preferred, request it through the `claims` parameter.',
    },
  },
  'token-ops': {
    exchange: {
      title: 'Token Exchange (RFC 8693)',
      description:
        'Trade one token for another. A service holding a token for user A can obtain a token for a downstream API — either acting *as* A (impersonation) or *on behalf of* A while recording who did the acting (delegation). It uses the ordinary token endpoint with grant_type set to the RFC 8693 URN; there is no separate endpoint.',
      params: [
        {
          name: 'subject_token / subject_token_type',
          desc: 'REQUIRED (§2.1). The token being exchanged, and an identifier saying what kind it is. The type is not optional — the server cannot guess.',
        },
        {
          name: 'actor_token / actor_token_type',
          desc: 'OPTIONAL, and the switch between the two modes. Present means delegation; absent means impersonation. `actor_token_type` is REQUIRED when the actor token is present and MUST NOT be sent otherwise.',
        },
        {
          name: 'audience / resource',
          desc: 'OPTIONAL. Which downstream service the new token is for. Without one the token is as broadly usable as the subject token was, which defeats much of the point.',
        },
        {
          name: 'scope / requested_token_type',
          desc: 'OPTIONAL. Narrow the permissions, and ask for a specific token format. `requested_token_type` defaults to an access token.',
        },
      ],
      returns:
        'A token response. RFC 8693 §2.2.1 makes `access_token`, `issued_token_type` and `token_type` REQUIRED — and this deployment deliberately omits `issued_token_type`, which Module 06 teaches.',
      tips: 'Send it once without an actor token and once with, then compare the two responses. On this deployment they are the same, because the actor token is deliberately dropped — that is Module 06 Exercise 6b, not a defect to report.',
    },
    userinfo: {
      title: 'UserInfo Endpoint',
      description:
        'Fetches information about the authenticated end-user using the access token. Returns standard claims like sub, name, email, and any other scoped claims. Complies with OpenID Connect Core 1.0.',
      params: [
        {
          name: 'Access Token',
          desc: 'A valid access token with the appropriate scopes (e.g. openid, profile, email). Pre-filled from the current session.',
        },
      ],
      returns:
        'JSON object with end-user claims (sub, name, email, etc.). The actual claims depend on the scopes granted.',
      tips: 'Use the access token from a recent flow. The response is a standard OIDC UserInfo response. The endpoint accepts two authentication schemes: Bearer (RFC 6750) for ordinary tokens, and DPoP (RFC 9449 §7.1) for sender-constrained ones. A token issued with token_type: DPoP must use the DPoP scheme — presenting it as Bearer is rejected, per RFC 9449 §7.2.',
    },
    introspect: {
      title: 'Introspection (Authlete)',
      description:
        "Introspects an access token using Authlete's internal endpoint. Returns full token details including scopes, subject, expiration, and Authlete-specific metadata. This is richer than the standard RFC 7662 introspection.",
      params: [
        {
          name: 'Token',
          desc: 'The access token to inspect. Pre-filled from the current session.',
        },
        {
          name: 'Admin Client ID / Secret',
          desc: 'MGMT_CLIENT_ID / MGMT_CLIENT_SECRET. RFC 7662 §2.1 requires the introspection endpoint to be protected; without these the server answers 401 and never calls Authlete.',
        },
      ],
      returns:
        'JSON with token details: active (boolean), sub, scopes, token_type, exp, iat, client_id, and Authlete-specific fields. An unknown token gives 401 with a Bearer invalid_token challenge — which is Authlete answering, not the auth gate.',
      tips: 'Use this when you need detailed token metadata. The standard introspection is more portable if you need to switch providers.',
    },
    'introspect-std': {
      title: 'Introspection (RFC 7662)',
      description:
        'Introspects an access token following the OAuth 2.0 Token Introspection standard (RFC 7662). Returns a standardized response that is provider-agnostic.',
      params: [
        {
          name: 'Token',
          desc: 'The access token to inspect. Pre-filled from the current session.',
        },
        {
          name: 'Admin Client ID / Secret',
          desc: 'MGMT_CLIENT_ID / MGMT_CLIENT_SECRET. RFC 7662 §2.1 requires the endpoint to be protected, to prevent token scanning.',
        },
      ],
      returns:
        'JSON with active (boolean), sub, scope, client_id, token_type, exp, iat, and other standard fields per RFC 7662. An unknown or revoked token gives 200 with {"active":false} — §2.2 makes an inactive token a result, not an error.',
      tips: 'Use this for interoperability or when you need a provider-agnostic response. Compare its 200 {"active":false} for an unknown token with the Authlete endpoint\'s 401 for the same input: two correct answers to different questions.',
    },
    revoke: {
      title: 'Revoke Token',
      description:
        'Revokes an access token using the OAuth 2.0 Token Revocation endpoint (RFC 7009). Once revoked, the token can no longer be used to access protected resources.',
      params: [
        {
          name: 'Client ID',
          desc: 'The client identifier associated with the token. Pre-filled from the most recent flow.',
        },
        {
          name: 'Client Secret',
          desc: 'The client secret for authentication at the revocation endpoint.',
        },
      ],
      returns: 'HTTP 200 on success (empty body). The token is immediately invalidated.',
      tips: 'Revocation is irrevocable — the same token cannot be used again. You can specify token_type_hint for efficient lookup.',
    },
  },
  admin: {
    create: {
      title: 'Create Token',
      description:
        'Admin creates an access token directly, bypassing normal OAuth flows. Useful for issuing tokens for testing, or for system-to-system scenarios where you need tokens without user interaction.',
      params: [
        {
          name: 'Grant Type',
          desc: 'The grant type to associate with this token (e.g. CLIENT_CREDENTIALS, AUTHORIZATION_CODE). Default: AUTHORIZATION_CODE.',
        },
        {
          name: 'Subject',
          desc: 'The end-user identifier this token represents (optional for client_credentials).',
        },
        { name: 'Scopes', desc: 'Comma-separated scopes to grant (e.g. openid,profile,email).' },
        {
          name: 'Access Token Duration',
          desc: 'Token lifetime in seconds. Leave empty for the service default.',
        },
      ],
      returns:
        'Full token response including access_token, refresh_token, expires_in, and metadata.',
      tips: 'Great for testing. Use Client Credentials flow instead for actual machine-to-machine scenarios.',
    },
    list: {
      title: 'List Tokens',
      description:
        'Lists all access tokens stored in Authlete for this service. Returns an array of token info including client_id, subject, scopes, and expiration.',
      params: [],
      returns:
        'Array of token objects. Each includes access_token (hash), client_id, subject, scopes, expire time, and grant type.',
      tips: 'Useful for auditing active tokens and cleaning up stale ones. No filters available — consider searching client-side.',
    },
    update: {
      title: 'Update Token',
      description:
        "Updates an existing access token's scopes and/or expiration time. The token keeps its identifier but gets new capabilities or lifetime.",
      params: [
        { name: 'Access Token', desc: 'The full access token value to update.' },
        { name: 'Scopes', desc: 'New comma-separated scopes to replace the existing ones.' },
        {
          name: 'Access Token Expires At',
          desc: 'New expiration as an ISO string (e.g. 2026-12-31T23:59:59Z).',
        },
      ],
      returns: 'Updated token response with new scopes and/or expiration.',
      tips: 'You can change either scopes, expiration, or both. Empty scopes = no change.',
    },
    revoke: {
      title: 'Revoke Token (Admin)',
      description:
        "Admin-level token revocation using the token's internal identifier (not the token value itself). This is different from the user-facing revocation endpoint.",
      params: [
        {
          name: 'Access Token Identifier',
          desc: 'The internal Authlete identifier for the token (found in list responses or create responses).',
        },
      ],
      returns: 'Confirmation response with resultCode and resultMessage.',
      tips: 'Use the List operation first to find the identifier. The identifier is NOT the token value — it is an internal ID.',
    },
    delete: {
      title: 'Delete Token',
      description:
        'Permanently deletes an access token from Authlete using its internal identifier. This is more thorough than revocation (removes the record entirely).',
      params: [
        {
          name: 'Access Token Identifier',
          desc: 'The internal Authlete identifier for the token to delete.',
        },
      ],
      returns: 'HTTP 200 on success (may be empty body).',
      tips: 'Deletion is permanent. Use Revoke if you just want to invalidate but may need audit records.',
    },
    reissue: {
      title: 'Reissue Token',
      description:
        'Reissues an access token from an existing access token and refresh token pair. Useful for token rotation or extending sessions admin-side.',
      params: [
        { name: 'Access Token', desc: 'The existing access token value.' },
        { name: 'Refresh Token', desc: 'The associated refresh token value.' },
      ],
      returns: 'New token response with fresh access_token and optionally refresh_token.',
      tips: 'Like calling the token endpoint with grant_type=refresh_token, but admin-authorized for any client.',
    },
    local: {
      title: 'Local JWT Token',
      description:
        "Creates a locally-signed JWT (JSON Web Token) without going through Authlete's token endpoint. Useful for testing JWT validation or when you need a token with specific claims.",
      params: [
        { name: 'Issuer (iss)', desc: 'The issuer claim — who created this token.' },
        {
          name: 'Subject (sub)',
          desc: 'The subject claim — who the token is about (the end-user).',
        },
        { name: 'Audience (aud)', desc: 'The audience claim — who should accept this token.' },
      ],
      returns: 'A signed JWT string (not an OAuth token, just a raw JWT).',
      tips: 'This produces a standalone JWT, not an Authlete-managed access token. Use it for testing JWT validation libraries.',
    },
  },
  client: {
    list: {
      title: 'List Clients',
      description:
        'Retrieves a paginated list of all client applications registered for your service. Each client object includes its full configuration.',
      params: [
        { name: 'Start', desc: 'Zero-based start index (inclusive). Default: 0.' },
        { name: 'End', desc: 'End index (exclusive). Default: 20.' },
      ],
      returns:
        'Object with start, end, totalCount, and clients array. Each client has the full Client object with all settings.',
      tips: 'Use pagination for services with many clients. The start/end parameters let you page through results.',
    },
    get: {
      title: 'Get Client',
      description:
        'Retrieves a single client application by its client ID (the numeric ID assigned by Authlete, or a client ID alias).',
      params: [
        {
          name: 'Client ID',
          desc: 'The numeric client ID assigned by Authlete when the client was created, or a client ID alias.',
        },
      ],
      returns:
        'Full Client object with all configuration properties (redirect URIs, grant types, auth methods, etc.).',
      tips: 'After creating a client, use Get to verify the configuration was applied correctly.',
    },
    create: {
      title: 'Create Client',
      description:
        'Registers a new OAuth 2.0 / OpenID Connect client application. This is equivalent to Dynamic Client Registration but done admin-side.',
      params: [
        { name: 'Client Name', desc: 'Human-readable name for the client application.' },
        {
          name: 'Client Type',
          desc: 'CONFIDENTIAL (can keep secrets) or PUBLIC (browser/mobile apps, cannot keep secrets).',
        },
        { name: 'Application Type', desc: 'web (server-side app) or native (mobile/desktop app).' },
        {
          name: 'Grant Types',
          desc: 'Comma-separated list of allowed OAuth grant types (e.g. AUTHORIZATION_CODE, CLIENT_CREDENTIALS).',
        },
        {
          name: 'Response Types',
          desc: 'Space-separated response types (e.g. code, token, id_token).',
        },
        {
          name: 'Redirect URIs',
          desc: 'Space-separated list of allowed redirect URIs. Required for authorization_code grant.',
        },
        {
          name: 'Token Auth Method',
          desc: 'How the client authenticates at the token endpoint (CLIENT_SECRET_BASIC is most common).',
        },
        { name: 'Description', desc: 'Optional description of the client application.' },
        { name: 'Developer', desc: 'Optional developer identifier for grouping clients.' },
      ],
      returns:
        'Full Client object including the newly assigned clientId and clientSecret (if confidential).',
      tips: 'Save the clientSecret from the response — it is only shown once. For PUBLIC clients, no secret is generated.',
    },
    update: {
      title: 'Update Client',
      description:
        "Modifies an existing client application's configuration. Only the fields you provide will be updated; omitted fields remain unchanged.",
      params: [
        { name: 'Client ID', desc: 'The numeric client ID of the client to update.' },
        { name: 'Client Name', desc: 'New name for the client.' },
        { name: 'Description', desc: 'New description.' },
        { name: 'Redirect URIs', desc: 'Space-separated list of new allowed redirect URIs.' },
      ],
      returns: 'Updated Client object with all current properties.',
      tips: 'This updates specific fields, not a full replace. For full control, use all ClientInput fields via the API directly.',
    },
    delete: {
      title: 'Delete Client',
      description:
        'Permanently removes a client application and all its associated tokens and authorizations. This action cannot be undone.',
      params: [{ name: 'Client ID', desc: 'The numeric client ID to delete.' }],
      returns: 'HTTP 200 on success (no body).',
      tips: 'Deleting a client invalidates all tokens issued to it. Consider locking the client instead if you may need it later.',
    },
    lock: {
      title: 'Lock Client',
      description:
        'Locks a client application, preventing it from making new authorization requests. Existing tokens remain valid but no new tokens can be issued. Useful for suspending a compromised client.',
      params: [
        { name: 'Client ID / Alias', desc: 'The client ID (numeric) or client ID alias to lock.' },
      ],
      returns: 'Response with resultCode (e.g. "A100001") and resultMessage.',
      tips: 'Locking is reversible via the Unlock operation. Unlike deletion, existing tokens continue to work.',
    },
    unlock: {
      title: 'Unlock Client',
      description:
        'Unlocks a previously locked client, restoring its ability to make authorization requests and obtain new tokens.',
      params: [
        {
          name: 'Client ID / Alias',
          desc: 'The client ID (numeric) or client ID alias to unlock.',
        },
      ],
      returns: 'Response with resultCode (e.g. "A100001") and resultMessage.',
      tips: 'After unlocking, the client immediately regains full functionality. No re-registration needed.',
    },
    'refresh-secret': {
      title: 'Refresh Client Secret',
      description:
        'Generates a new client secret for the client, rotating the old one. The old secret is returned alongside the new one so you can migrate gradually.',
      params: [
        {
          name: 'Client ID / Alias',
          desc: 'The client ID (numeric) or client ID alias whose secret should be rotated.',
        },
      ],
      returns:
        'Response with oldClientSecret and newClientSecret. Update your client configuration with the new secret.',
      tips: 'The old secret is returned so you can update your client without downtime. Use this regularly for security hygiene.',
    },
    'update-secret': {
      title: 'Update Client Secret',
      description:
        'Sets a specific client secret value, rather than having Authlete generate one randomly. Useful when you need a specific secret format or want to sync with another system.',
      params: [
        { name: 'Client ID / Alias', desc: 'The client ID (numeric) or client ID alias.' },
        {
          name: 'New Client Secret',
          desc: 'The new secret value. Allowed: A-Z, a-z, 0-9, -, _. Max 86 characters.',
        },
      ],
      returns: 'Response with oldClientSecret and newClientSecret for confirmation.',
      tips: 'Unlike Refresh Secret, you control the value. Follow security best practices — use a long, random string.',
    },
    'list-auth': {
      title: 'List Authorizations',
      description:
        "Lists all client applications that a specific end-user has authorized. Shows which clients can access the user's data and with what scopes.",
      params: [{ name: 'Subject (user ID)', desc: "The end-user's unique identifier (subject)." }],
      returns:
        'Array of limited client objects that the user has authorized. Includes client metadata and scopes.',
      tips: 'Use this to audit which third-party apps a user has granted access to. Combine with Delete Auth to revoke unwanted access.',
    },
    'update-auth': {
      title: 'Update Authorizations',
      description:
        'Updates the scopes granted to a specific client for a specific end-user. This modifies the scopes on all existing access tokens for that client-user pair.',
      params: [
        { name: 'Client ID', desc: 'The client ID to update authorizations for.' },
        { name: 'Subject (user ID)', desc: 'The end-user whose authorizations should be updated.' },
        {
          name: 'Scopes',
          desc: 'Space-separated list of new scopes to set on all existing access tokens for this client and user.',
        },
      ],
      returns: 'Response with resultCode and resultMessage confirming the update.',
      tips: 'This replaces existing scopes — the user drops old scopes and gains the new ones. Useful for privilege changes.',
    },
    'delete-auth': {
      title: 'Delete Authorizations',
      description:
        'Revokes all authorizations for a specific client-user pair. All access tokens issued to that client for that user are deleted, and the client must get fresh consent.',
      params: [
        { name: 'Client ID', desc: 'The client ID whose authorizations should be deleted.' },
        {
          name: 'Subject (user ID)',
          desc: 'The end-user whose authorizations for this client should be revoked.',
        },
      ],
      returns:
        'Response with latestGrantedScopes and mergedGrantedScopes before deletion, plus modifiedAt timestamp.',
      tips: 'This is the admin equivalent of a user "revoking access" to a third-party app from their settings page.',
    },
    'get-granted-scopes': {
      title: 'Get Granted Scopes',
      description:
        'Retrieves the scopes that a specific client has been granted for a specific end-user. Returns both the latest granted scopes and the merged scopes from all past authorizations.',
      params: [
        { name: 'Client ID', desc: 'The client ID.' },
        { name: 'Subject (user ID)', desc: 'The end-user subject identifier.' },
      ],
      returns:
        'Object with latestGrantedScopes (from the most recent authorization) and mergedGrantedScopes (union of all past authorizations).',
      tips: 'Latest scopes are what the current tokens use. Merged scopes include historical grants — useful for understanding consent evolution.',
    },
    'delete-granted-scopes': {
      title: 'Delete Granted Scopes',
      description:
        'Clears the scopes that a client has been granted for a user. After this, the client needs to re-request consent with a fresh authorization.',
      params: [
        { name: 'Client ID', desc: 'The client ID.' },
        { name: 'Subject (user ID)', desc: 'The end-user subject identifier.' },
      ],
      returns: 'Confirmation response with resultCode and resultMessage.',
      tips: 'This clears the cached consent — the next authorization request will prompt the user for consent again.',
    },
    'get-requestable-scopes': {
      title: 'Get Requestable Scopes',
      description:
        'Gets the set of scopes that a client is allowed to request. This is a client-specific restriction that limits scope selection beyond what the service supports.',
      params: [{ name: 'Client ID', desc: 'The client ID to get requestable scopes for.' }],
      returns:
        'Object containing requestableScopes array. Null or empty means the client is unrestricted (can request any service-scoped scope).',
      tips: 'If requestableScopes is null/empty, the client can request any scope the service supports. Use Update to restrict them.',
    },
    'update-requestable-scopes': {
      title: 'Update Requestable Scopes',
      description:
        'Sets the scopes a client is allowed to request. This restricts the client to only requesting specific scopes, even if the service supports more. Empty the list to remove all restrictions.',
      params: [
        { name: 'Client ID', desc: 'The client ID to update requestable scopes for.' },
        {
          name: 'Scopes',
          desc: 'Space-separated list of scopes the client is allowed to request. Unknown scopes are silently ignored.',
        },
      ],
      returns: 'Object with the updated requestableScopes array.',
      tips: 'An empty or omitted scopes field removes all restrictions (equivalent to calling Delete Requestable Scopes).',
    },
    'delete-requestable-scopes': {
      title: 'Delete Requestable Scopes',
      description:
        'Removes all scope restrictions for a client, allowing it to request any scope that the service supports.',
      params: [
        { name: 'Client ID', desc: 'The client ID to remove requestable scope restrictions for.' },
      ],
      returns: 'Empty response on success (204 No Content).',
      tips: 'After deletion, the client can request any scope. This is the default state for new clients.',
    },
  },
  logout: {
    logout: {
      title: 'RP-Initiated Logout',
      description:
        "Implements OpenID Connect RP-Initiated Logout (spec: OpenID Connect RP-Initiated Logout 1.0). This is two requests: the GET renders the server's confirmation page and destroys nothing, and the POST that page submits is what ends the session and optionally redirects you back. §2 requires the OP to ask before logging anyone out. The id_token_hint identifies which session to log out — and, when client_id is absent, which client is asking, which decides where you may be redirected (§3).",
      params: [
        {
          name: 'ID Token Hint',
          desc: "The ID token of the session to log out. Pre-filled from the current session. It is verified against the OP's JWKS — an unverifiable hint identifies nobody rather than whoever it names.",
        },
        {
          name: 'Post-Logout Redirect URI',
          desc: "Where to send the user after logout. Must exactly match \u2014 byte for byte \u2014 a URI registered for this client; a trailing slash makes it a different URI. If no client can be identified, from client_id or the id_token_hint's aud, there is no registered set and no redirect happens.",
        },
        {
          name: 'State',
          desc: 'A random value to maintain state between logout request and callback. Helps prevent CSRF on the redirect back.',
        },
      ],
      returns:
        "The server's confirmation page. Confirming there destroys the session and redirects back to the post-logout URI with the state parameter echoed back; if that URI is not allowed, you land on the signed-out page instead and the session is still gone.",
      tips: 'Tokens are cleared client-side before you leave, so the confirmation page is the point of no return only for the server session. The confirmation form carries a CSRF token, which is why a bare GET — including an <img> tag pointing at the logout URL — no longer logs anybody out.',
    },
  },
  'backchannel-logout': {
    issue: {
      title: 'Issue Backchannel Logout Token',
      description:
        'Issues a backchannel logout token for a specific client without delivering it. The token is a JWT with typ "logout+jwt" containing an events claim with the backchannel-logout event URI. This is the first step in the backchannel logout flow — you can inspect the token before deciding to deliver it.',
      params: [
        { name: 'MGMT Client ID', desc: 'The admin client ID for Basic authentication.' },
        { name: 'MGMT Client Secret', desc: 'The admin client secret for Basic authentication.' },
        {
          name: 'Client Identifier',
          desc: 'The client_id or client_id_alias to issue the token for.',
        },
        { name: 'Subject', desc: 'The end-user subject whose session is being terminated.' },
        { name: 'Session ID', desc: 'Optional session identifier (alternative to subject).' },
      ],
      returns:
        'JSON with action, logoutToken (JWT string), and backchannelLogoutUri. Decode the JWT to inspect its claims.',
      tips: 'The logout token follows OIDC Back-Channel Logout 1.0 spec. It has typ "logout+jwt" and includes the events claim with http://schemas.openid.net/event/backchannel-logout.',
    },
    deliver: {
      title: 'Issue & Deliver Backchannel Logout Token',
      description:
        "Issues a backchannel logout token and immediately delivers it to the specified client's backchannelLogoutUri via an HTTP POST with Content-Type application/x-www-form-urlencoded. The client must respond with HTTP 200 for the delivery to be considered successful.",
      params: [
        { name: 'MGMT Client ID', desc: 'The admin client ID for Basic authentication.' },
        { name: 'MGMT Client Secret', desc: 'The admin client secret for Basic authentication.' },
        {
          name: 'Client Identifier',
          desc: 'The client_id or client_id_alias to deliver the token to.',
        },
        { name: 'Subject', desc: 'The end-user subject whose session is being terminated.' },
        { name: 'Session ID', desc: 'Optional session identifier (alternative to subject).' },
      ],
      returns:
        'JSON with clientId, success (boolean), statusCode, error (if failed), and backchannelLogoutUri.',
      tips: 'The client must have a backchannelLogoutUri configured in Authlete. Use the Get Client operation to verify it is set.',
    },
    'deliver-all': {
      title: 'Issue & Deliver to All Clients',
      description:
        'Issues backchannel logout tokens for every client that has a backchannelLogoutUri configured and delivers them. This is typically called after a user logs out to notify all RPs that the session has ended.',
      params: [
        { name: 'MGMT Client ID', desc: 'The admin client ID for Basic authentication.' },
        { name: 'MGMT Client Secret', desc: 'The admin client secret for Basic authentication.' },
        { name: 'Subject', desc: 'The end-user subject whose session is being terminated.' },
        { name: 'Session ID', desc: 'Optional session identifier (alternative to subject).' },
      ],
      returns:
        'JSON array of delivery results, one per client with a backchannelLogoutUri. Each result has clientId, clientName, success, and statusCode or error.',
      tips: 'This can also be triggered automatically by carrying backchannel=true through RP-Initiated Logout. It rides on the confirming POST (POST /api/logout), not the GET — the GET only renders the confirmation page.',
    },
  },
  dcr: {
    register: {
      title: 'Dynamic Client Registration (Register)',
      description:
        'Registers a new OAuth 2.0 client dynamically per RFC 7591. The client metadata is sent as a JSON string. On success, Authlete returns a client object with client_id and registration_access_token. The registration access token is required for subsequent GET, UPDATE, and DELETE operations.',
      params: [
        { name: 'Admin Client ID', desc: 'The admin client ID for Basic authentication.' },
        { name: 'Admin Client Secret', desc: 'The admin client secret for Basic authentication.' },
        {
          name: 'JSON Metadata',
          desc: 'The client metadata as a JSON string (RFC 7591). Must include fields like client_name, redirect_uris, grant_types, etc.',
        },
      ],
      returns:
        'ClientRegistrationResponse with action="CREATED", responseContent (JSON string of the registered client), and the client object including clientId, clientSecret, registrationAccessToken.',
      tips: 'Save the registration_access_token from the response — it is needed for get/update/delete. The register endpoint requires admin Basic auth (MGMT_CLIENT_ID/MGMT_CLIENT_SECRET).',
    },
    get: {
      title: 'DCR Get Client',
      description:
        'Retrieves a dynamically registered client using its client_id and registration_access_token. Implements RFC 7592 client configuration endpoint.',
      params: [
        { name: 'Client ID', desc: 'The client_id returned from DCR registration.' },
        {
          name: 'Registration Access Token',
          desc: 'The registration_access_token returned from DCR registration.',
        },
      ],
      returns:
        'ClientRegistrationResponse with action="OK" and responseContent containing the full client metadata.',
      tips: 'No admin auth required — the registration_access_token authenticates the request. Authlete validates the token against the client_id.',
    },
    update: {
      title: 'DCR Update Client',
      description:
        'Updates a dynamically registered client using its client_id and registration_access_token. The JSON metadata is sent as a string. Implements RFC 7592 client configuration endpoint.',
      params: [
        { name: 'Client ID', desc: 'The client_id returned from DCR registration.' },
        {
          name: 'Registration Access Token',
          desc: 'The registration_access_token returned from DCR registration.',
        },
        { name: 'JSON Metadata', desc: 'The updated client metadata as a JSON string (RFC 7591).' },
      ],
      returns:
        'ClientRegistrationResponse with action="UPDATED" and responseContent containing the updated client metadata.',
      tips: 'The update replaces all client metadata — include all fields you want to keep, not just the changed ones.',
    },
    delete: {
      title: 'DCR Delete Client',
      description:
        'Deletes a dynamically registered client using its client_id and registration_access_token. Implements RFC 7592 client configuration endpoint.',
      params: [
        { name: 'Client ID', desc: 'The client_id returned from DCR registration.' },
        {
          name: 'Registration Access Token',
          desc: 'The registration_access_token returned from DCR registration.',
        },
      ],
      returns:
        'ClientRegistrationResponse with action="DELETED" and HTTP 204 (no body). The client is permanently removed.',
      tips: 'Deletion is permanent and irreversible. The registered client and all its tokens are removed.',
    },
  },
  ciba: {
    authentication: {
      title: 'CIBA Backchannel Authentication',
      description:
        'Processes a backchannel authentication request per OpenID Connect CIBA Core 1.0. Sends the URL-encoded parameters (including login_hint, scope, client_notification_token, etc.) along with client credentials to Authlete. Authlete validates the request and returns an action indicating the next step: user identification (USER_IDENTIFICATION), bad request, unauthorized, or server error.',
      params: [
        {
          name: 'Parameters',
          desc: 'URL-encoded backchannel authentication request parameters (e.g. login_hint=admin&scope=openid&client_notification_token=...). This is the entire entity body of the request from the client application.',
        },
        {
          name: 'Client ID',
          desc: 'The client ID extracted from the Authorization header (Basic auth) of the backchannel authentication request.',
        },
        {
          name: 'Client Secret',
          desc: 'The client secret extracted from the Authorization header (Basic auth) of the backchannel authentication request.',
        },
      ],
      returns:
        'JSON with action, responseContent, ticket, hintType, hint, deliveryMode, scopes, clientNotificationToken, and other CIBA metadata. If action is USER_IDENTIFICATION, use the ticket in subsequent Issue/Fail/Complete calls.',
      tips: 'The parameters field must contain at minimum login_hint (or id_token_hint or login_hint_token) and scope=openid. Client authentication is always required at the backchannel authentication endpoint — public clients are not allowed.',
    },
    issue: {
      title: 'Issue Auth Req ID',
      description:
        'Issues an authentication request ID (auth_req_id) for a previously validated backchannel authentication ticket. Call this after you have identified the end-user from the hint provided in the authentication response. Returns the auth_req_id, expires_in, and interval (for polling mode).',
      params: [
        {
          name: 'Ticket',
          desc: 'The ticket issued by the backchannel authentication endpoint. Pre-filled from the authentication response.',
        },
      ],
      returns:
        'JSON with action (OK, INTERNAL_SERVER_ERROR, or INVALID_TICKET), responseContent, authReqId, expiresIn (seconds), and interval (minimum polling interval in seconds).',
      tips: 'Only call this after successfully determining the end-user subject from the hint. If you cannot identify the user, call Fail instead with an appropriate reason.',
    },
    fail: {
      title: 'Fail Backchannel Authentication',
      description:
        'Generates an error response for a backchannel authentication request when the end-user cannot be identified or some other error occurs. Use this to clean up the ticket and return a proper error to the client.',
      params: [
        {
          name: 'Ticket',
          desc: 'The ticket to fail. Pre-filled from the authentication response.',
        },
        {
          name: 'Reason',
          desc: 'The reason for failure. Options: ACCESS_DENIED, EXPIRED_LOGIN_HINT_TOKEN, INVALID_BINDING_MESSAGE, INVALID_TARGET, INVALID_USER_CODE, MISSING_USER_CODE, SERVER_ERROR, UNAUTHORIZED_CLIENT, UNKNOWN_USER_ID.',
        },
      ],
      returns:
        'JSON with action (FORBIDDEN, BAD_REQUEST, or INTERNAL_SERVER_ERROR) and responseContent containing the error JSON to return to the client.',
      tips: "ACCESS_DENIED maps to HTTP 403 Forbidden. Other reasons generally map to 400 or 500. Calling this API also cleans up the ticket in Authlete's database.",
    },
    complete: {
      title: 'Complete Backchannel Authentication',
      description:
        'Completes the backchannel authentication flow with the result of end-user authentication and authorization. Call this after the end-user has authenticated on their device and made an authorization decision. For poll/ping modes, Authlete updates the database so the token endpoint can generate tokens later. For push mode, Authlete generates tokens immediately.',
      params: [
        { name: 'Ticket', desc: 'The ticket from the original authentication response.' },
        {
          name: 'Result',
          desc: 'The end-user decision: AUTHORIZED (user approved), ACCESS_DENIED (user rejected), or TRANSACTION_FAILED (could not reach device).',
        },
        {
          name: 'Subject',
          desc: 'The end-user subject (unique identifier) — required when result is AUTHORIZED.',
        },
      ],
      returns:
        'JSON with action (NO_ACTION for poll mode, NOTIFICATION for ping/push mode, or SERVER_ERROR). For NOTIFICATION, the server should POST responseContent to clientNotificationEndpoint with clientNotificationToken as Bearer token.',
      tips: 'For poll mode, the client polls the token endpoint with grant_type=urn:openid:params:grant-type:ciba to get the actual tokens. For push mode, tokens are delivered in the notification.',
    },
    poll: {
      title: 'Poll Token Endpoint (CIBA POLL Mode)',
      description:
        'Polls the token endpoint with grant_type=urn:openid:params:grant-type:ciba and the auth_req_id from the Issue step. This is how POLL mode clients retrieve tokens — the client repeatedly polls the standard token endpoint until the end-user has authorized on their authentication device.',
      params: [
        {
          name: 'auth_req_id',
          desc: 'The authentication request ID returned by the Issue endpoint. Auto-filled after a successful Issue call.',
        },
      ],
      returns:
        'On success (200): JSON with access_token, token_type, expires_in, id_token, refresh_token (if applicable), and scope. While pending (400): {"error":"authorization_pending","interval":5}. Too fast (400): {"error":"slow_down","interval":<new_interval>}. Denied (400): {"error":"access_denied"}. Expired (400): {"error":"expired_token"}.',
      tips: 'Poll at the interval returned by the Issue endpoint (typically 5 seconds). Never poll faster than the interval — the server will return slow_down. If you receive slow_down, increase your polling interval by the new interval value returned. After receiving access_denied or expired_token, start a new flow from the Authentication step.',
    },
  },
  par: {
    create: {
      title: 'Pushed Authorization Request (RFC 9126)',
      description:
        'Sends an authorization request to the PAR endpoint instead of directly to /authorize. The PAR endpoint validates the request, authenticates the client, and returns a request_uri (a short-lived reference). The client then uses this request_uri in a standard authorization request to /authorize. This decouples the potentially large authorization payload from the browser redirect, improving security and usability. Per RFC 9126, client authentication is REQUIRED at the PAR endpoint.',
      params: [
        {
          name: 'Parameters (URL-encoded)',
          desc: 'The full OAuth authorization request parameters as a URL-encoded string. This is the same set of parameters you would normally send to /authorize. Must include at minimum: response_type, client_id, redirect_uri, scope. Should include: state (CSRF protection), code_challenge + code_challenge_method=S256 (PKCE), nonce (for OIDC). Pass client_id here OR as the separate Client ID field; Authlete accepts either.',
        },
        {
          name: 'Client ID',
          desc: 'The client identifier (optional if already in parameters). Used for client authentication at the PAR endpoint, REQUIRED per RFC 9126 and mandatory for confidential clients.',
        },
        {
          name: 'Client Secret',
          desc: 'The client secret for confidential clients. Required if the client uses client_secret_basic or client_secret_post token endpoint auth method. Public clients should omit this.',
        },
      ],
      returns:
        'JSON with action (CREATED on success, HTTP 201), requestUri (the urn:ietf:params:oauth:request_uri:<random> value to use in /authorize), responseContent (JSON string with expires_in and request_uri), and other metadata. Error actions: BAD_REQUEST (400), UNAUTHORIZED (401), FORBIDDEN (403), PAYLOAD_TOO_LARGE (413), INTERNAL_SERVER_ERROR (500).',
      tips: 'The request_uri expires in 600 seconds (10 minutes) by default (configurable via Authlete service settings). Use it immediately in /authorize?client_id=...&request_uri=<uri>. PAR is especially useful for: (1) large authorization payloads (many claims, RAR authorization_details), (2) mobile/native apps that cannot maintain state across browser redirects, (3) combining with PKCE (S256) for secure public client flows. When using PAR, the client_id in the /authorize call should match the one used in the PAR request. The /authorize endpoint automatically resolves the PAR request via Authlete — no extra code needed on the authorization endpoint.',
    },
  },

  rar: {
    push: {
      title: 'Rich Authorization Requests (RFC 9396)',
      description:
        "Sends an authorization request with fine-grained authorization_details — structured JSON describing the specific operations the client wants to perform on the user's resources. This goes beyond OAuth scopes, allowing the client to request specific actions, locations, data types, and privileges per resource type. Authlete passes the authorization_details through the authorization, token, and introspection endpoints as opaque JSON, making RAR transparent to the server implementation. Use PAR for large authorization_details payloads that would not fit in a browser URL.",
      params: [
        {
          name: 'authorization_details (JSON)',
          desc: 'A JSON array of objects, each with a required "type" field. Standard types include "payment_initiation", "account_information", "document_access", and "id_card_verification". Each object may also include: locations (array of URIs), actions (e.g. "initiate", "read", "write"), datatypes (e.g. "payment", "transaction"), identifier (resource-specific ID), and privileges (e.g. "admin", "viewer").',
        },
        {
          name: 'Client ID',
          desc: 'The client identifier registered in Authlete. Required for PAR mode.',
        },
        {
          name: 'Client Secret',
          desc: 'The client secret for confidential clients. Required if the client uses client_secret_basic or client_secret_post.',
        },
        {
          name: 'Scope',
          desc: "Space-separated scopes (e.g. openid). The authorization_details type must be configured in the client's authorizationDetailsTypes metadata for Authlete to validate it.",
        },
        {
          name: 'Redirect URI',
          desc: 'Where the authorization server redirects after consent. Must match the registered URI.',
        },
      ],
      returns:
        'Redirects to the authorization page with authorization_details embedded (either in the URL parameters or via a PAR request_uri). After the user approves, the authorization code is returned and can be exchanged for tokens. The resulting tokens include authorization_details in the token response and introspection response.',
      tips: 'authorization_details is enabled by default in Authlete — no feature flag needed. Configure allowed types via the client\'s authorizationDetailsTypes metadata on DCR or in the Authlete Console. For payment flows, use type "payment_initiation" with relevant actions. For account access, use "account_information" with "read" action and appropriate datatypes. Use PAR when the authorization_details JSON is large (over 2KB) so it does not bloat the browser redirect URL. The consent page automatically displays authorization_details as structured permission cards.',
    },
  },

  jar: {
    process: {
      title: 'JWT Secured Authorization Request (RFC 9101)',
      description:
        "JAR lets a client send authorization request parameters as a signed JWT. The client creates a JWT with the standard OAuth parameters as claims, signs it with its private key, and sends it via the `request` parameter. Authlete validates the JWT signature using the client's registered public key, decodes the payload, and returns the result including the `requestObjectPayload`. JAR prevents parameter tampering and is REQUIRED for FAPI 2.0 compliance.",
      params: [
        {
          name: 'Key Pair',
          desc: "An ES256 (ECDSA P-256) key pair. The public key must be registered in the client's JWK Set in the Authlete Console for signature validation.",
        },
        {
          name: 'JWT Claims (JSON)',
          desc: 'The OAuth authorization request parameters as JWT claims. Required: iss (client ID), aud (Authlete service issuer), response_type, client_id, redirect_uri. Recommended: exp, nbf, jti for replay protection, state for CSRF, nonce for OIDC.',
        },
        {
          name: 'Client ID',
          desc: 'The client identifier. Must match the `iss` and `client_id` claims in the JWT and be registered with the JWK Set containing the signing public key.',
        },
      ],
      returns:
        'Full Authlete `/auth/authorization` response including action (INTERACTION, LOCATION, etc.), ticket, client info, scopes, and requestObjectPayload (the decoded JWT claims). The requestObjectPayload confirms Authlete successfully validated and decoded the JWT.',
      tips: "The signing key's public JWK must be registered in the Authlete Developer Console under Client → JWK Set Content. Authlete supports ES256, RS256, and other algorithms. Use `exp`, `nbf` and `jti` for replay protection. FAPI 1.0 Advanced bounds the request object's lifetime at 60 MINUTES, not 60 seconds — Part 2 §5.2.2 requires an `exp` no more than 60 minutes after `nbf`, and an `nbf` no more than 60 minutes in the past. The `aud` claim should be the Authlete service URL (https://api.authlete.com) or your custom issuer URL. When combined with PAR, the JWT goes inside the PAR body for a two-layer security model.",
    },
  },

  device: {
    authorization: {
      title: 'Device Authorization (RFC 8628)',
      description:
        'Initiates the OAuth 2.0 Device Authorization Grant (Device Flow). The client sends the requested scopes and its client credentials. Authlete validates the request and returns a device_code, user_code, verification_uri, expires_in, and polling interval. The device_code is used by the device to poll for tokens; the user_code is displayed to the end-user who visits the verification_uri on another device to enter the code and authorize.',
      params: [
        { name: 'Client ID', desc: 'The client identifier registered in Authlete.' },
        {
          name: 'Client Secret',
          desc: 'The client secret (required for confidential clients with client_secret_basic or client_secret_post auth).',
        },
        {
          name: 'Parameters',
          desc: 'URL-encoded OAuth parameters (e.g. client_id=xxx&scope=openid+profile). Must include client_id and scope.',
        },
      ],
      returns:
        'JSON with action, deviceCode, userCode, verificationUri, expiresIn (seconds), interval (polling interval in seconds), and responseContent. On success, action is "OK".',
      tips: 'Display the user_code and verification_uri to the user. The device polls the token endpoint with grant_type=urn:ietf:params:oauth:grant-type:device_code using the device_code. The user_code expires after expiresIn seconds.',
    },
    verification: {
      title: 'Verify User Code',
      description:
        'Verifies a user_code entered by the end-user on the verification page. Authlete checks if the user_code is valid, not expired, and returns the associated client information including client name and requested scopes. This is used by the browser-based verification page (GET /device) to display client info before asking the user to authorize.',
      params: [
        {
          name: 'User Code',
          desc: 'The user_code entered by the end-user (e.g. ABCD-1234). Retrieved from the device flow initiation response.',
        },
      ],
      returns:
        'JSON with action (VALID, NOT_EXIST, or EXPIRED), clientId, clientName, and scopes. On VALID, the user should be shown the client name and scopes being requested so they can make an informed decision.',
      tips: 'Call this after the user enters their code on the verification page. If EXPIRED, tell the user to start a new device flow on their device. The verification page at GET /device demonstrates the browser flow.',
    },
    complete: {
      title: 'Complete Device Flow',
      description:
        'Completes the device flow after the end-user has authenticated and made an authorization decision. The result indicates whether the user AUTHORIZED the request, ACCESS_DENIED it, or if there was a TRANSACTION_FAILED. On AUTHORIZED, Authlete stores the authorization so the device can obtain tokens by polling the token endpoint.',
      params: [
        { name: 'User Code', desc: 'The user_code from the device flow initiation.' },
        {
          name: 'Result',
          desc: "The end-user's decision: AUTHORIZED (user approved), ACCESS_DENIED (user rejected), or TRANSACTION_FAILED (error).",
        },
        {
          name: 'Subject',
          desc: 'The end-user subject (unique identifier) — required when result is AUTHORIZED. Represents the authenticated user.',
        },
      ],
      returns:
        'JSON with action (SUCCESS, ACCESS_DENIED, USER_CODE_NOT_EXIST, USER_CODE_EXPIRED, or SERVER_ERROR) and resultCode/resultMessage.',
      tips: 'After AUTHORIZED, the device polls the token endpoint with grant_type=urn:ietf:params:oauth:grant-type:device_code and the device_code. Authlete returns tokens once the flow is complete.',
    },
    poll: {
      title: 'Poll Token Endpoint',
      description:
        'Polls the token endpoint with the device_code to obtain an access token. After the end-user authorizes on another device, the device repeatedly sends token requests until Authlete returns tokens. Per RFC 8628 §6.1, the device should honor the polling interval returned in Step 1 (default 5s).',
      params: [
        { name: 'Device Code', desc: 'The device_code from the authorization step (Step 1).' },
        {
          name: 'Client ID',
          desc: 'The client identifier — must match the client_id used in Step 1.',
        },
        {
          name: 'Client Secret',
          desc: 'Only for confidential clients. Public clients leave empty.',
        },
        {
          name: 'Poll Interval',
          desc: 'Seconds between requests. Match the interval from Step 1 (default 5s).',
        },
      ],
      returns:
        'On success: JSON with access_token, token_type, expires_in, and scope. While pending: JSON with error="authorization_pending". On expiry: error="expired_token". On denial: error="access_denied".',
      tips: 'Auto-stops on terminal errors (expired_token, access_denied, invalid_grant). The device_code is single-use — once tokens are issued, it cannot be reused. If the user_code expires before authorization, you get expired_token and must restart the flow.',
    },
  },
  discovery: {
    discovery: {
      title: 'OpenID Discovery',
      description:
        'Fetches the OpenID Connect Discovery document (also known as the OIDC Configuration). This JSON document describes all the endpoints, supported scopes, response types, and capabilities of the authorization server. Complies with OpenID Connect Discovery 1.0.',
      params: [],
      returns:
        'OpenID Provider Metadata JSON including authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, scopes_supported, response_types_supported, grant_types_supported, and more.',
      tips: 'Use this to auto-discover all server capabilities. Many OAuth libraries use this document to configure themselves automatically.',
    },
    jwks: {
      title: 'JSON Web Key Set (JWKS)',
      description:
        "Fetches the server's public keys in JWKS format (RFC 7517). These keys are used to verify the signatures of ID tokens and JWTs issued by the server.",
      params: [],
      returns:
        'JWKS object with a keys array. Each key has kty, kid, use, alg, n, e (for RSA) or x, y (for EC), and optionally x5c (X.509 certificate chain).',
      tips: 'Use the keys from this endpoint to validate ID token signatures client-side. The kid (key ID) in the JWT header tells you which key to use.',
    },
  },
  vci: {
    metadata: {
      title: 'Discovery — Credential Issuer Metadata',
      description:
        'Fetches the Credential Issuer metadata document (OID4VCI §12.2). This tells a wallet app what credential types the server supports and where to request them. The response includes credential_issuer (the server\'s identifier), credential_endpoint (where to issue), and credential_configurations_supported (the list of credential types like "VerifiedEmployee").',
      params: [],
      returns:
        'JSON with credential_issuer, credential_endpoint, credential_configurations_supported, and other issuer metadata.',
      tips: 'Always start here. It tells you everything the server can do. The credential_configurations_supported field lists the credential types you can request.',
    },
    jwtissuer: {
      title: 'Discovery — JWT VC Issuer Metadata',
      description:
        'Fetches the JWT VC Issuer metadata (equivalent to /.well-known/jwt-vc-issuer). Returns the issuer identifier and the location of the public keys used to sign verifiable credentials. This is how a wallet learns to trust the credentials issued by this server.',
      params: [],
      returns: 'JSON with iss (issuer identifier) and jwks_uri (URI to fetch public keys).',
      tips: 'Use this to find the JWKS URI if needed. The issuer identifier here should match the iss claim in issued credentials.',
    },
    jwks: {
      title: 'Discovery — JWKS (Public Keys)',
      description:
        'Fetches the JSON Web Key Set (JWKS) containing the public keys used to sign verifiable credentials. A wallet uses these keys to verify the cryptographic signature on the credentials issued by this server.',
      params: [],
      returns:
        'JWKS JSON object with a keys array. Each key includes kty, kid, use, alg, and the key parameters (n/e for RSA, x/y for EC).',
      tips: 'The kid (key ID) in the credential JWT header tells you which key to use for verification. Share this endpoint with relying parties that need to validate credentials.',
    },
    wellknown: {
      title: 'Discovery — Well-Known Credential Issuer (OID4VCI §12.2)',
      description:
        'Fetches the credential issuer metadata from the OID4VCI-specified well-known path. This is identical to the Metadata endpoint but served at the spec-mandated URL. Wallets use this path for automatic discovery.',
      params: [],
      returns:
        'Same as Metadata — JSON with credential_issuer, credential_endpoint, credential_configurations_supported, and other metadata.',
      tips: 'This is the path wallets use for auto-discovery. The Metadata tab returns the same data.',
    },
    'offer-create': {
      title: 'Offers — Create Credential Offer (Admin)',
      description:
        'Creates a credential offer on the server. Offers are an admin-side concept (not part of OID4VCI) that grant credential eligibility before the wallet flow begins. The offer contains the credential configuration IDs the user is eligible for (e.g., "VerifiedEmployee"), and optionally the user subject, duration, and context. Requires admin Basic auth (MGMT_CLIENT_ID/MGMT_CLIENT_SECRET).',
      params: [
        { name: 'MGMT Client ID', desc: 'The admin client ID for Basic authentication.' },
        { name: 'MGMT Client Secret', desc: 'The admin client secret for Basic authentication.' },
        {
          name: 'Credential Configuration IDs',
          desc: 'JSON array of credential type IDs the offer covers (e.g. ["VerifiedEmployee"]). These must match the credential_configurations_supported in the metadata.',
        },
        {
          name: 'Subject',
          desc: 'Optional end-user identifier the offer is for. If set, only this user can claim the credential.',
        },
        {
          name: 'Duration',
          desc: 'Optional offer lifetime in seconds. Defaults to the service setting (usually 3600 = 1 hour).',
        },
      ],
      returns:
        'JSON with identifier (the offer ID), credentialConfigurationIds, subject, duration, expiresAt, and createdAt.',
      tips: 'Save the offer identifier — you need it to look up offer info later. Offers expire after the duration elapses. If no subject is set, any authenticated user can claim the offer.',
    },
    'offer-info': {
      title: 'Offers — Get Offer Info (Admin)',
      description:
        'Retrieves information about a credential offer by its identifier. Shows the offer details including what credential types it covers, who it was issued to, and whether it is still valid. Requires admin Basic auth (MGMT_CLIENT_ID/MGMT_CLIENT_SECRET).',
      params: [
        { name: 'MGMT Client ID', desc: 'The admin client ID for Basic authentication.' },
        { name: 'MGMT Client Secret', desc: 'The admin client secret for Basic authentication.' },
        { name: 'Offer Identifier', desc: 'The offer ID returned from Create Offer.' },
      ],
      returns:
        'JSON with identifier, credentialConfigurationIds, subject, duration, expiresAt, createdAt, and other offer details.',
      tips: 'Use this to verify an offer is still valid before attempting credential issuance. Expired offers return 404.',
    },
    'cred-issue': {
      title: 'Credential — Issue Verifiable Credential',
      description:
        'Requests a verifiable credential from the OID4VCI Credential Endpoint (§8). This is the core operation — it takes an access token (obtained through an OAuth authorization flow) and a credential order, and returns the signed credential. The access token must have been granted for the requested credential configuration(s). If the credential takes time to prepare, the server may return 202 ACCEPTED with a transaction_id — use the Deferred operation to retrieve it.',
      params: [
        {
          name: 'Access Token',
          desc: 'An access token obtained through an OAuth flow (e.g., authorization code or client credentials). This token must have scopes that cover the credential you are requesting.',
        },
        {
          name: 'Order (JSON)',
          desc: 'Optional JSON with credential request details: requestIdentifier (your ID for this request), credentialPayload (specific format/payload options), and other parameters per OID4VCI §8.',
        },
      ],
      returns:
        'JSON with format, credential (the signed credential JWT or SD-JWT), and optionally transaction_id (if deferred — use the Deferred endpoint). On 202 ACCEPTED, the response includes a transaction_id and a notification_id.',
      tips: 'How to get an access token for VCI: (1) Go to Auth Flows > Authorization Code and log in as admin/password with scopes like openid, then copy the access_token from the vault. (2) Paste it in the Access Token field here and click Issue. If the server returns 202 Accepted, copy the transaction_id and use the Deferred tab to poll for completion.',
    },
    'cred-batch': {
      title: 'Credential — Batch Credential Endpoint (OID4VCI §10)',
      description:
        'Requests multiple verifiable credentials in a single API call (OID4VCI §10). Takes an access token and an array of credential_requests, each specifying a format and credential type. For SD-JWT VC use format "vc+sd-jwt" with vct; for mdoc/mDL use format "mso_mdoc" with doctype. On success returns credential_responses array with each credential. The server accepts both OID4VCI format (credential_requests) and Authlete internal format (orders with requestIdentifier + credentialPayload).',
      params: [
        {
          name: 'Access Token',
          desc: 'An access token obtained through an OAuth flow. This token must have scopes that cover ALL requested credential types.',
        },
        {
          name: 'credential_requests (JSON array)',
          desc: 'OID4VCI §10 format — array of credential request objects. Each object has: format ("vc+sd-jwt" or "mso_mdoc"), and either vct (for SD-JWT VC) or doctype and claims (for mdoc/mDL).',
        },
        {
          name: 'orders (JSON array, alternative)',
          desc: 'Authlete internal CredentialIssuanceOrder format — each has requestIdentifier (string) and credentialPayload (string, JSON-stringified request).',
        },
      ],
      returns:
        'JSON with credential_responses array. Each response has format and credential (the signed credential). May also include c_nonce and c_nonce_expires_in.',
      tips: 'The order of credential_responses matches the order of credential_requests. Use the Batch endpoint to get both an SD-JWT VC and an mdoc/mDL in one call — similar to the demo in the OID4VCI article by Authlete\'s founder. If you already have Authlete CredentialIssuanceOrder objects, send them as the "orders" field directly.',
    },
    'deferred-issue': {
      title: 'Credential — Deferred Credential Endpoint (OID4VCI §9)',
      description:
        'Retrieves a credential that was issued asynchronously (OID4VCI §9). Called when the Credential Endpoint returned a 202 ACCEPTED response with a transaction_id. The server may have needed time to prepare the credential — poll this endpoint until it returns the actual credential. The order JSON should include the transaction_id from the credential endpoint response.',
      params: [
        {
          name: 'Order (JSON)',
          desc: 'JSON with transaction_id (from the credential endpoint 202 response), and optionally requestIdentifier.',
        },
      ],
      returns:
        'JSON with format and credential. On success, returns the signed credential JWT or SD-JWT.',
      tips: 'The interval between polling attempts depends on the server configuration. If the server returns another 202, keep polling with the same transaction_id.',
    },
  },
  mcp: {
    discovery: {
      title: 'AS Metadata Discovery',
      description:
        'Fetches the Authorization Server metadata document. MCP clients use this to auto-discover all server endpoints, supported features (CIMD, resource indicators, PKCE), and capabilities. The client first tries RFC 8414 (/.well-known/oauth-authorization-server), then falls back to OIDC Discovery (/.well-known/openid-configuration).',
      params: [
        {
          name: 'Issuer URL',
          desc: 'The base URL of the authorization server (e.g. http://localhost:3000). No path component needed.',
        },
      ],
      returns:
        'JSON with issuer, authorization_endpoint, token_endpoint, registration_endpoint (if DCR supported), resource_indicators_supported, code_challenge_methods_supported, scopes_supported, and other AS metadata fields.',
      tips: 'MCP spec requires clients to support both discovery mechanisms. This server publishes metadata at both well-known paths. Use the metadata to build authorization URLs and token requests automatically.',
    },
    'resource-metadata': {
      title: 'Protected Resource Metadata',
      description:
        'Fetches the Protected Resource Metadata (RFC 9728) from an MCP server. This tells the AI client which authorization servers are trusted for accessing the resource, and what scopes are available. The MCP server publishes this at its well-known path.',
      params: [
        {
          name: 'Resource URL',
          desc: 'The base URL of the MCP server (e.g. https://mcp-server.example.com).',
        },
      ],
      returns:
        'JSON with resource identifier, authorization_servers array (list of trusted AS issuers), scopes_supported, and bearer_methods_supported.',
      tips: 'The Protected Resource Metadata tells the client which AS to use. If the MCP server returns multiple authorization_servers, the client can choose any of them. This is how MCP achieves trust without pre-configuration.',
    },
    cimd: {
      title: 'CIMD Metadata (Client ID Metadata Document)',
      description:
        'Fetches a Client ID Metadata Document from an HTTPS URL. In MCP, clients register by providing a URL (the client_id itself) that points to their metadata. The server fetches this URL to learn the client name, redirect URIs, and other properties — no client_secret needed.',
      params: [
        {
          name: 'CIMD URL',
          desc: 'An HTTPS URL pointing to the client metadata JSON document (e.g. https://myapp.com/.well-known/oauth-client).',
        },
      ],
      returns:
        'JSON with client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope, and other client metadata fields per CIMD spec.',
      tips: 'CIMD URLs must use HTTPS. The metadata document should include at minimum: client_name, redirect_uris, grant_types, response_types, and token_endpoint_auth_method. For MCP, set token_endpoint_auth_method to "none" (public client).',
    },
    'authorize-url': {
      title: 'Build Authorization URL',
      description:
        'Constructs a complete MCP authorization URL with PKCE (S256) and optional resource indicator. The URL includes all required OAuth 2.1 parameters: response_type=code, client_id, redirect_uri, scope, state, code_challenge, and code_challenge_method=S256. Optionally adds the resource parameter per RFC 8707.',
      params: [
        { name: 'Issuer URL', desc: 'The authorization server base URL from metadata discovery.' },
        {
          name: 'Client ID',
          desc: 'The client identifier — can be an HTTPS URL (CIMD) or a traditional client_id.',
        },
        {
          name: 'Redirect URI',
          desc: 'Where the AS sends the user after consent. Must match the client metadata.',
        },
        { name: 'Scope', desc: 'Space-separated scopes (e.g. "mcp:tools mcp:resources openid").' },
        {
          name: 'Resource',
          desc: 'Optional: The MCP server URL (RFC 8707 resource indicator). Tokens will be scoped to this resource.',
        },
      ],
      returns:
        'A complete authorization URL ready to open in a browser. Includes PKCE code_challenge in the URL.',
      tips: 'The resource parameter (RFC 8707) scopes the access token to a specific MCP server. Without it, the token may be accepted by any resource server. Always use PKCE S256 for public clients — it is mandatory per OAuth 2.1.',
    },
    'token-exchange': {
      title: 'Token Exchange (PKCE)',
      description:
        'Exchanges an authorization code for tokens using PKCE. Sends the code_verifier to prove the client initiated the authorization. This is the standard OAuth 2.1 token exchange for public clients — no client_secret required.',
      params: [
        {
          name: 'Token Endpoint',
          desc: 'The token endpoint URL from AS metadata (e.g. http://localhost:3000/api/token).',
        },
        {
          name: 'Authorization Code',
          desc: 'The code received from the authorization redirect callback.',
        },
        {
          name: 'Client ID',
          desc: 'The client identifier (same as used in the authorization request).',
        },
        {
          name: 'Redirect URI',
          desc: 'Must match exactly the redirect_uri used in the authorization request.',
        },
        {
          name: 'Code Verifier',
          desc: 'The PKCE code_verifier that was used to generate the code_challenge.',
        },
      ],
      returns:
        'JSON with access_token, token_type (Bearer), expires_in, scope, and optionally refresh_token.',
      tips: 'The code_verifier must match the one used to generate the code_challenge in the authorization request. If you lose it, you must restart the flow. The token response may include refresh_token for long-lived access.',
    },
    introspect: {
      title: 'Introspect MCP Token',
      description:
        'Validates an MCP access token using RFC 7662 standard introspection. Returns the token metadata including scopes, expiration, resource binding, and client identity. Use this to verify a token before granting access to MCP tools.',
      params: [
        {
          name: 'Token Endpoint',
          desc: 'The introspection endpoint URL (e.g. http://localhost:3000/api/introspection/standard).',
        },
        { name: 'Access Token', desc: 'The access token to validate.' },
      ],
      returns:
        'JSON with active (boolean), sub, scope, client_id, token_type, exp, iat, and other standard fields per RFC 7662.',
      tips: 'An inactive token (active=false) means it has expired, been revoked, or was never issued. Always check the active field before trusting the token. For JWT tokens, you can also verify the signature locally using the JWKS endpoint.',
    },
    userinfo: {
      title: 'Fetch UserInfo',
      description:
        'Calls the UserInfo endpoint with an access token to get the identity of the authenticated user. Returns standard OIDC claims. This is how MCP clients learn who approved the access.',
      params: [
        {
          name: 'UserInfo Endpoint',
          desc: 'The UserInfo endpoint URL from AS metadata (e.g. http://localhost:3000/api/userinfo).',
        },
        { name: 'Access Token', desc: 'The access token from the token exchange.' },
      ],
      returns:
        'JSON with sub, name, email, and other OIDC claims. The claims depend on the scopes granted during authorization.',
      tips: 'UserInfo requires an access token with the openid scope. Without it, the endpoint returns minimal information. Use this to personalize the AI experience based on the user identity.',
    },
  },
  fapi: {
    config: {
      title: 'FAPI 2.0 Configuration',
      description:
        "Displays this deployment's actual FAPI 2.0 posture, read from the live Authlete service. Shows whether FAPI mode (Security Profile only, or +Message Signing) is enabled, which client authentication methods the service permits, and which requirements are genuinely enforced — PAR, PKCE, scope, and whether refresh tokens are rotated.",
      params: [],
      returns:
        'JSON with mode ("sp", "ms", "fapi1-advanced", "fapi1-baseline", "unknown" or "disabled" — "disabled" means no FAPI mode is set, "unknown" means one is set that the server does not recognise), dpopEnabled (boolean), supportedTokenAuthMethods (array), certificateBoundAccessTokens (boolean), parRequired, pkceRequired, refreshTokenRotation, scopeRequired, cimdSupported, and specs describing which FAPI profiles are active. Mode "ms" means FAPI 2.0 Message Signing, which adds THREE non-repudiation mechanisms on top of the Security Profile: signed request objects (JAR), signed authorization responses (JARM), and signed introspection responses (RFC 9701) — the third is the one most often forgotten, and on this deployment it is the only one of the three that is live.',
      tips: 'Every field is read from authleteApi.service.get() — none is hardcoded, so a "false" here means the control really is off. Two traps worth knowing: dpopEnabled is the service\'s dpopNonceRequired flag, not "is DPoP available" (DPoP works fine without nonces); and refreshTokenRotation inverts refreshTokenKept, because a refresh token that is kept is one that is not rotated. Configure FAPI modes in the Authlete console.',
    },
    status: {
      title: 'FAPI Status (Live Authlete Config)',
      description:
        "Fetches the live Authlete service configuration to verify that the Authlete console settings match what FAPI 2.0 requires. This is a read-only diagnostic — it calls Authlete's service API directly. Use this to confirm that dpopNonceRequired, pkceRequired, parRequired, scopeRequired, and other flags are set correctly in the Authlete console.",
      params: [],
      returns:
        'JSON with mode, dpopEnabled, issuer, fapiModes (array), dpopNonceRequired, dpopNonceDuration, scopeRequired, refreshTokenKept, refreshTokenIdempotent, pkceRequired, and parRequired — mirroring the Authlete service configuration.',
      tips: 'Cross-reference this with the Authlete console (https://console.authlete.com). If fapiModes does not include FAPI2_SECURITY, enable the FAPI profile in the console. The dpopNonceRequired flag must be true for DPoP to work correctly.',
    },
  },
  health: {
    health: {
      title: 'Server Health Check',
      description:
        'Returns the current status of the authorization server itself (liveness probe). This checks that the Express server is running and responding.',
      params: [],
      returns: 'JSON with status ("ok"), uptime (seconds), and timestamp (ISO 8601).',
      tips: 'Use this for load balancer health checks or monitoring. Does not check Authlete connectivity — use the Authlete health check for that.',
    },
    authlete: {
      title: 'Authlete Health Check',
      description:
        'Proxies a health check request to the Authlete API endpoint /api/lifecycle/healthcheck. This verifies that the Authlete service is reachable and functioning. Can optionally perform an extended check that tests database connectivity.',
      params: [
        {
          name: 'Extended',
          desc: 'When enabled, passes ?extended=true to Authlete to include a database connectivity test in the health check.',
        },
      ],
      returns:
        'JSON with healthy (boolean), statusCode (HTTP status from Authlete), body (raw response text), and optionally error. When healthy, Authlete returns "OK".',
      tips: 'No authentication is required for this endpoint. Use it in monitoring dashboards or CI/CD pipelines to verify Authlete connectivity before running tests.',
    },
  },
};

export function getDoc(section: string, key: string): OpDoc | undefined {
  return docs[section]?.[key];
}

export default docs;
