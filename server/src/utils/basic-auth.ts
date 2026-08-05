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
