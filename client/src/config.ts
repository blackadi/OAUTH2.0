/**
 * The base that every endpoint constant below is concatenated onto, with any trailing slash removed.
 *
 * **One character in a deploy manifest 404s the whole app.** `render.yaml` sets
 * `VITE_API_BASE_URL=https://oauth2-0-ekh2.onrender.com/`, and the 62 constants below are all built as
 * `${API_BASE_URL}/api/...`. The trailing slash therefore produced `...onrender.com//api/authorization`.
 * `new URL()` preserves that doubled slash rather than collapsing it, and Express 5 answers **404** for
 * `//api/authorization` — measured, not assumed.
 *
 * **Nothing in the repo could see it.** `scripts/check-client-server-contract.mjs` matches the literal
 * template `${API_BASE_URL}(path)` and captures only the path, so it never evaluates the base; typecheck,
 * lint, the unit suite, the build and the Playwright pass have no opinion about a hostname. The check now
 * asserts the manifest value too, because the instance is worth less than the class.
 *
 * `mcp.service.ts` already strips a trailing slash at three call sites (lines 13, 28, 46) because a
 * user-typed issuer routinely carries one. This applies the same rule to the app's *own* base, once, at
 * the boundary that owns it — so none of the 62 constants below needs a defence of its own.
 */
export const API_BASE_URL = stripTrailingSlash(
  getEnvVar('VITE_API_BASE_URL', 'http://localhost:3000'),
);

/**
 * The authorization server's **issuer identifier** — the value of `issuer` in its discovery document.
 *
 * Separate from {@link API_BASE_URL} on purpose, and the two genuinely differ. In a deployment they
 * are the same origin; running the SPA against a local server they are not, because the issuer stays
 * whatever the Authlete service is configured with (`https://oauth2-0-ekh2.onrender.com`) while the
 * base becomes `http://localhost:3000`. Deriving one from the other would work in production and fail
 * only on a developer's machine, which is the worst arrangement of the two.
 *
 * It matters because a `private_key_jwt` assertion and a JAR request object both put it in `aud`:
 * FAPI 2.0 §5.3.2.1 requires the server to accept *only* its issuer identifier there, and this
 * service enforces exactly that (`clientAssertionAudRestrictedToIssuer: true`).
 */
export const ISSUER = stripTrailingSlash(getEnvVar('VITE_ISSUER', API_BASE_URL));

export const CLIENT_ID = getEnvVar('VITE_CLIENT_ID', 'your_client_id');

/**
 * The FAPI wizard's own client and scope, distinct from {@link CLIENT_ID} and {@link DEFAULT_SCOPES}.
 *
 * The wizard defaulted to the SPA's general-purpose client, which is **public**
 * (`tokenAuthMethod: NONE`). FAPI 2.0 §5.3.2.1 says the server *"shall only support confidential
 * clients"*, so that client cannot complete this flow however well the wizard is written — it fails
 * at PAR with a message about the redirect URI, which sends the reader somewhere unrelated.
 *
 * The scope carries the profile. Authlete selects FAPI 2.0 processing from a `fapi2` attribute on the
 * requested scope, which is what lets one service host both this flow and the ~20 ordinary OAuth
 * panels beside it. A FAPI request that forgets the tagged scope is simply not a FAPI request.
 */
export const FAPI_CLIENT_ID = getEnvVar('VITE_FAPI_CLIENT_ID', '1241400020');
export const FAPI_SCOPES = getEnvVar('VITE_FAPI_SCOPES', 'openid myscope');

/**
 * The FAPI wizard's redirect URI, which cannot be {@link getRedirectUri}'s.
 *
 * FAPI 2.0 §5.3.2.2: the server *"shall not allow redirect URIs that use the http scheme except for
 * native clients that use loopback interface"*. The SPA's development redirect is
 * `http://localhost:3001/callback`, so it is refused — verified live, PAR answers `400
 * invalid_request` for exactly that value. Defaulting the wizard to it would make the flow fail on
 * every developer machine with an error about the redirect URI rather than about the profile.
 *
 * The consequence is worth stating plainly rather than hiding behind the default: **the wizard's
 * browser redirect leg cannot complete against a local dev server**, because there is no https origin
 * to come back to. PAR and the request object can be exercised locally; the redirect lands on the
 * deployed origin. That is FAPI 2.0 working as specified, not a defect to route around.
 */
export const FAPI_REDIRECT_URI = getEnvVar(
  'VITE_FAPI_REDIRECT_URI',
  'https://oauth2-0-1.onrender.com/callback',
);

/**
 * `your_client_secret` is the value `.env.example` ships to show the *shape* of the setting. It is not a
 * credential, and treating it as one is not a cosmetic error.
 *
 * For a public client, sending a **non-empty** `client_secret` switches the request from "no client
 * authentication" to "client authentication attempted", and Authlete refuses that with
 * `[A157303] The request contains data for client authentication although the client type is 'public'
 * and the client authentication method is 'none'.` The SPA's own client is public, so the placeholder
 * broke the headline authorization-code + PKCE flow outright — and the failure named the credential
 * rather than its presence, which sends the reader looking for a wrong secret.
 *
 * Recognised here rather than at the call sites, because `.env.example`, any `.env` copied from it and
 * any deployment configured from either all carry the literal. An unset variable and the placeholder
 * therefore converge on the same answer: no secret.
 *
 * `CLIENT_ID`'s placeholder is deliberately left as-is. A placeholder client id fails loudly and says
 * exactly what is wrong — no such client — whereas a placeholder secret silently changes which
 * authentication method the request uses. Different failure, different treatment.
 */
export const PLACEHOLDER_CLIENT_SECRET = 'your_client_secret';

export function secretOrEmpty(value: string): string {
  return value.trim() === PLACEHOLDER_CLIENT_SECRET ? '' : value;
}

export const CLIENT_SECRET = secretOrEmpty(getEnvVar('VITE_CLIENT_SECRET', ''));
export const REDIRECT_URI = getEnvVar('VITE_REDIRECT_URI', 'http://localhost:3001/callback');
export const DEFAULT_SCOPES = getEnvVar('VITE_SCOPES', 'openid profile email');

export const AUTHORIZATION_ENDPOINT = `${API_BASE_URL}/api/authorization`;
export const TOKEN_ENDPOINT = `${API_BASE_URL}/api/token`;
export const USERINFO_ENDPOINT = `${API_BASE_URL}/api/userinfo`;
export const INTROSPECTION_ENDPOINT = `${API_BASE_URL}/api/introspection`;
export const INTROSPECTION_STANDARD_ENDPOINT = `${API_BASE_URL}/api/introspection/standard`;
export const REVOCATION_ENDPOINT = `${API_BASE_URL}/api/revocation`;
export const LOGOUT_ENDPOINT = `${API_BASE_URL}/api/logout`;
export const JWKS_ENDPOINT = `${API_BASE_URL}/api/.well-known/jwks.json`;
export const DISCOVERY_ENDPOINT = `${API_BASE_URL}/api/.well-known/openid-configuration`;

export const TOKEN_CREATE_ENDPOINT = `${API_BASE_URL}/api/token/create`;
export const TOKEN_LIST_ENDPOINT = `${API_BASE_URL}/api/token/list`;
export const TOKEN_UPDATE_ENDPOINT = `${API_BASE_URL}/api/token/update`;
export const TOKEN_REVOKE_ENDPOINT = `${API_BASE_URL}/api/token/revoke`;
export const TOKEN_DELETE_ENDPOINT = `${API_BASE_URL}/api/token/delete`;
export const TOKEN_REISSUE_ENDPOINT = `${API_BASE_URL}/api/token/reissue`;
export const TOKEN_LOCAL_ENDPOINT = `${API_BASE_URL}/api/token/createLocalToken`;

export const CLIENT_LIST_ENDPOINT = `${API_BASE_URL}/api/client/list`;
export const CLIENT_GET_ENDPOINT = `${API_BASE_URL}/api/client/get`;
export const CLIENT_CREATE_ENDPOINT = `${API_BASE_URL}/api/client/create`;
export const CLIENT_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/update`;
export const CLIENT_DELETE_ENDPOINT = `${API_BASE_URL}/api/client/delete`;
export const CLIENT_FLAG_ENDPOINT = `${API_BASE_URL}/api/client/flag`;
export const CLIENT_SECRET_REFRESH_ENDPOINT = `${API_BASE_URL}/api/client/secret/refresh`;
export const CLIENT_SECRET_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/secret/update`;
export const CLIENT_AUTH_LIST_ENDPOINT = `${API_BASE_URL}/api/client/auth/list`;
export const CLIENT_AUTH_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/auth/update`;
export const CLIENT_AUTH_DELETE_ENDPOINT = `${API_BASE_URL}/api/client/auth/delete`;
export const CLIENT_SCOPES_GRANTED_ENDPOINT = `${API_BASE_URL}/api/client/scopes/granted`;
export const CLIENT_SCOPES_REQUESTABLE_ENDPOINT = `${API_BASE_URL}/api/client/scopes/requestable`;

export const GRANT_MANAGEMENT_ENDPOINT = `${API_BASE_URL}/api/gm`;

export const BACKCHANNEL_LOGOUT_ISSUE_ENDPOINT = `${API_BASE_URL}/api/backchannel_logout/issue`;
export const BACKCHANNEL_LOGOUT_DELIVER_ENDPOINT = `${API_BASE_URL}/api/backchannel_logout/deliver`;
export const BACKCHANNEL_LOGOUT_DELIVER_ALL_ENDPOINT = `${API_BASE_URL}/api/backchannel_logout/deliver-all`;

export const DCR_REGISTER_ENDPOINT = `${API_BASE_URL}/api/client/dcr/register`;
export const DCR_GET_ENDPOINT = `${API_BASE_URL}/api/client/dcr/get`;
export const DCR_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/dcr/update`;
export const DCR_DELETE_ENDPOINT = `${API_BASE_URL}/api/client/dcr/delete`;

export const CIBA_AUTHENTICATION_ENDPOINT = `${API_BASE_URL}/api/ciba/authentication`;
export const CIBA_ISSUE_ENDPOINT = `${API_BASE_URL}/api/ciba/issue`;
export const CIBA_FAIL_ENDPOINT = `${API_BASE_URL}/api/ciba/fail`;
export const CIBA_COMPLETE_ENDPOINT = `${API_BASE_URL}/api/ciba/complete`;

export const PAR_ENDPOINT = `${API_BASE_URL}/api/par`;
/**
 * Lived in `jar.service.ts` as a local `const` until 2026-08-23, which made it the **only** endpoint in
 * the app that `scripts/check-client-server-contract.mjs` could not see — the check written *because of*
 * the JAR outage was not checking JAR. Found by mutating that script. The script now fails if any service
 * builds an endpoint from `API_BASE_URL` itself, so this file stays the one place they live.
 */
export const JAR_PROCESS_ENDPOINT = `${API_BASE_URL}/api/jar/process`;

export const DEVICE_AUTHORIZATION_ENDPOINT = `${API_BASE_URL}/api/device/authorization`;
export const DEVICE_VERIFICATION_ENDPOINT = `${API_BASE_URL}/api/device/verification`;
export const DEVICE_COMPLETE_ENDPOINT = `${API_BASE_URL}/api/device/complete`;

export const FEDERATION_CONFIGURATION_ENDPOINT = `${API_BASE_URL}/api/federation/configuration`;
export const FEDERATION_REGISTRATION_ENDPOINT = `${API_BASE_URL}/api/federation/registration`;

export const VCI_METADATA_ENDPOINT = `${API_BASE_URL}/api/vci/metadata`;
export const VCI_JWTISSUER_ENDPOINT = `${API_BASE_URL}/api/vci/jwtissuer`;
export const VCI_JWKS_ENDPOINT = `${API_BASE_URL}/api/vci/jwks`;
export const VCI_WELLKNOWN_ENDPOINT = `${API_BASE_URL}/api/vci/well-known`;
export const VCI_OFFER_CREATE_ENDPOINT = `${API_BASE_URL}/api/vci/offer/create`;
export const VCI_OFFER_INFO_ENDPOINT = `${API_BASE_URL}/api/vci/offer/info`;
export const VCI_CREDENTIAL_ISSUE_ENDPOINT = `${API_BASE_URL}/api/vci/credential/issue`;
export const VCI_CREDENTIAL_BATCH_ENDPOINT = `${API_BASE_URL}/api/vci/credential/batch`;
export const VCI_DEFERRED_ISSUE_ENDPOINT = `${API_BASE_URL}/api/vci/deferred/issue`;

export const FAPI_CONFIG_ENDPOINT = `${API_BASE_URL}/api/fapi/config`;
export const FAPI_STATUS_ENDPOINT = `${API_BASE_URL}/api/fapi/status`;

/**
 * `MCP_AS_METADATA_ENDPOINT` is gone: it had **zero** consumers anywhere in `src/`.
 *
 * `mcp.service.fetchAsMetadata()` builds both well-known paths itself, because RFC 8414 §3 and OIDC
 * Discovery put the document at two different addresses and the point of that function is to try both.
 * A constant naming only one of them was a leftover that a reader would reasonably have believed was
 * the address in use.
 */
/**
 * There is no CIMD endpoint, and there never was.
 *
 * This used to be `${API_BASE_URL}/api/authorization` with a comment conceding it — a constant whose
 * name promised something the value did not provide. CIMD (Client ID Metadata Document) is handled
 * entirely inside Authlete: with `clientIdMetadataDocumentSupported` on, an HTTPS URL used as a
 * `client_id` makes the authorization server fetch that URL itself. The document lives on the
 * *client's* host, so the address is whatever the user types — which is why `McpSection` asks for it
 * and passes it to `fetchCimdMetadata`, and why no constant here can supply it.
 */

export const HEALTH_ENDPOINT = `${API_BASE_URL}/api/health`;
export const HEALTH_ALL_ENDPOINT = `${API_BASE_URL}/api/health/all`;
export const HEALTH_AUTHLETE_ENDPOINT = `${API_BASE_URL}/api/health/authlete`;

export const PROD_CONFIG = {
  redirectUri: getEnvVar('VITE_PROD_REDIRECT_URI', REDIRECT_URI),
};

/**
 * Read a build-time variable, distinguishing "unset" from "deliberately empty".
 *
 * `value || defaultValue` treated an empty string as absent, so `VITE_CLIENT_SECRET=` — the correct way
 * to say *this is a public client with no secret* — silently became the literal placeholder
 * `your_client_secret`, which the app then sent as a real credential. An explicit empty value is now
 * honoured, and only a genuinely missing variable falls back.
 */
function getEnvVar(key: string, defaultValue: string): string {
  const value = import.meta.env[key];
  return value === undefined || value === null ? defaultValue : String(value);
}

/**
 * Strip trailing slashes from a URL that is used as a concatenation base.
 *
 * A function declaration rather than an arrow const, deliberately: `API_BASE_URL` is the *first* line of
 * this file and hoisting is what lets the normalisation live next to `getEnvVar`, which it mirrors.
 *
 * **Deliberately NOT applied to `REDIRECT_URI` or `PROD_CONFIG.redirectUri`.** A `redirect_uri` is
 * compared against the client's registered value by simple string comparison (RFC 6749 section 3.1.2.3),
 * so `https://app.example/callback/` and `https://app.example/callback` are two different URIs. Rewriting
 * one here would trade a visible 404 for an `invalid_request` that names neither the cause nor this file.
 */
export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const isProduction = import.meta.env.PROD;

export function getRedirectUri(): string {
  if (isProduction && PROD_CONFIG.redirectUri !== REDIRECT_URI) {
    return PROD_CONFIG.redirectUri;
  }
  return REDIRECT_URI;
}
