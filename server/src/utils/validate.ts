export function validateRequired(
  params: Record<string, unknown>,
  requiredFields: string[]
): string | null {
  for (const field of requiredFields) {
    const val = params[field];
    if (val === undefined || val === null || val === "") {
      return `Missing required parameter: ${field}`;
    }
  }
  return null;
}

/**
 * Pre-flight check for the authorization endpoint.
 *
 * `client_id` is the only parameter REQUIRED regardless of how the request is shaped:
 *   - plain request  — RFC 6749 §4.1.1
 *   - PAR            — RFC 9126, `client_id` + `request_uri`
 *   - JAR            — RFC 9101 §5, "REQUIRED. OAuth 2.0 client_id. The value MUST match the
 *                      request or request_uri Request Object's client_id"
 *
 * Everything else is shape-dependent, so it is the authorization server's call. Enumerating the
 * alternatives here was actively harmful:
 *
 *   - `response_type` and `redirect_uri` were demanded unconditionally, which refused the canonical
 *     JAR shape (`client_id` + `request`, everything else inside the signed object) before Authlete
 *     ever saw it — RFC 9101 §5 does not require `response_type` outside the object, and §6.3 says
 *     the server "MUST only use the parameters in the Request Object" anyway.
 *   - `redirect_uri` is optional when exactly one full redirection URI is registered
 *     (RFC 6749 §3.1.2.3), so legal requests were rejected.
 *   - Answering here at all short-circuits RFC 6749 §4.1.2.1, which requires the failure to be
 *     reported by redirecting to the redirection URI with an `error` parameter whenever
 *     `client_id`/`redirect_uri` are themselves valid. This function cannot do that; Authlete can.
 *
 * A per-shape allowlist also has to be extended for every request shape added later, and had already
 * missed one. Validating the invariant instead cannot go stale.
 */
export function validateAuthorizationParams(
  query: Record<string, unknown>
): string | null {
  return validateRequired(query, ["client_id"]);
}

export function validateTokenParams(
  body: Record<string, unknown>
): string | null {
  return validateRequired(body, ["grant_type"]);
}

export function validateIntrospectionParams(
  body: Record<string, unknown>
): string | null {
  return validateRequired(body, ["token"]);
}
