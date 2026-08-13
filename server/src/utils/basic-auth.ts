/**
 * Client credentials presented via the HTTP Basic authentication scheme.
 */
export interface BasicCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Decode client credentials from an `Authorization: Basic` header.
 *
 * Returns `undefined` when the header is absent, uses a different scheme, or carries no
 * colon separator — i.e. whenever no Basic credentials were presented. Callers should
 * treat that as "the client did not use this channel", not as an authentication failure.
 *
 * The payload is split on the **first** colon only: RFC 6749 §2.3.1 places the client
 * identifier before it and the secret after, and a secret may legitimately contain colons.
 * Splitting on every colon silently truncates such secrets.
 *
 * Note this decodes only — it verifies nothing. Validating the credentials is Authlete's
 * job for OAuth clients (see `par.service.ts`, `token.service.ts`) and
 * `require-basic-auth.ts`'s job for this deployment's own management credentials.
 */
/**
 * Does this request present client credentials on **both** authentication channels?
 *
 * RFC 6749 §2.3.1: *"The client MUST NOT use more than one authentication method in each request."*
 * Authlete does not enforce this — verified live 2026-08-12: a request carrying correct top-level
 * credentials and a **wrong** `client_secret` in the body is accepted and a token issued, because the
 * top-level channel wins. Nor does this server resolve the conflict, despite appearances: `parameters`
 * is preferentially `req.rawBody`, so body-supplied credentials reach Authlete untouched and both
 * channels genuinely cross the boundary.
 *
 * So the rule is enforced here, before any Authlete call — the same gate-before-call shape the
 * introspection endpoints use, and the counterpart of `extractAccessToken()`'s enforcement of the
 * analogous RFC 6750 §2 rule for token *presentation*.
 *
 * Only a second **credential** counts. `client_id` in the body alongside a Basic header is not a
 * second authentication method: §2.3.1's methods are distinguished by where the *secret* travels, and
 * a public client legitimately sends a bare `client_id` with no `Authorization` header at all.
 */
export function hasDualChannelClientAuth(
  authorizationHeader: string | undefined,
  body: Record<string, unknown> | undefined,
): boolean {
  if (!parseBasicAuth(authorizationHeader)) return false;

  // Both spellings: form-encoded bodies use `client_secret`, JSON callers use `clientSecret`.
  const bodySecret = body?.client_secret ?? body?.clientSecret;
  return typeof bodySecret === "string" && bodySecret !== "";
}

export function parseBasicAuth(authorizationHeader?: string): BasicCredentials | undefined {
  if (!authorizationHeader) return undefined;

  // RFC 9110 §11.1 makes the auth-scheme case-insensitive.
  const [scheme, ...rest] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "basic") return undefined;

  const encoded = rest.join(" ").trim();
  if (!encoded) return undefined;

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return undefined;

  const clientId = decoded.slice(0, separator);
  const clientSecret = decoded.slice(separator + 1);
  if (!clientId) return undefined;

  return { clientId, clientSecret };
}
