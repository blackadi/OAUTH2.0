import { Request, Response } from "express";

export function setDpopNonce(res: Response, dpopNonce?: string): void {
  if (dpopNonce) {
    res.setHeader("DPoP-Nonce", dpopNonce);
  }
}

/**
 * The two authentication schemes this deployment accepts on a protected resource:
 * `Bearer` (RFC 6750 §2.1) and `DPoP` (RFC 9449 §7.1). RFC 9449 §7.1 makes `DPoP` the *only*
 * conformant way to present a DPoP-bound access token, so a resource server that understands
 * `Bearer` alone cannot accept the tokens this authorization server issues.
 */
export type TokenScheme = "bearer" | "dpop";

export type PresentedToken = {
  token: string;
  /** Lower-cased scheme. RFC 9110 §11.1 makes auth-scheme case-insensitive. */
  scheme: TokenScheme;
};

/**
 * A request whose *presentation* of the access token is unacceptable, independent of whether the
 * token itself is any good. Thrown before any call to Authlete so these cases fail closed and cost
 * nothing. `code === null` means "emit no error code", which RFC 6750 §3.1 requires when the request
 * carried no authentication information at all: *"the resource server SHOULD NOT include an error
 * code or other error information."*
 */
export class TokenPresentationError extends Error {
  /**
   * Discriminant for {@link isTokenPresentationError}. A bare `instanceof` is not enough here: it
   * compares class identity, and under `ts-node-dev` a hot reload can leave two module instances of
   * this file loaded, at which point the check silently returns false. The fallback path is the global
   * error handler, which emits no `WWW-Authenticate` header — breaking RFC 6750 §3's MUST on a 401 —
   * and leaks a stack trace to the client. Too costly a failure for a fragile check.
   */
  readonly isTokenPresentationError = true as const;

  constructor(
    readonly status: 400 | 401,
    readonly code: string | null,
    readonly description: string | null,
    readonly schemes: TokenScheme[] = ["bearer", "dpop"],
  ) {
    super(description ?? "access token presentation rejected");
    this.name = "TokenPresentationError";
  }
}

export function isTokenPresentationError(
  err: unknown,
): err is TokenPresentationError {
  return (
    err instanceof TokenPresentationError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { isTokenPresentationError?: unknown }).isTokenPresentationError === true)
  );
}

/** RFC 9110 §5.6.4 quoted-string: `"` and `\` must not appear unescaped. */
function sanitizeQuoted(value: string): string {
  return value.replace(/[\\"]/g, "");
}

/**
 * Build a `WWW-Authenticate` value. RFC 6750 §3 makes the header mandatory on a 401, and RFC 9110
 * §11.6.1 allows a comma-separated list of challenges — which is how a resource supporting both
 * schemes advertises both (RFC 9449 §7.2).
 *
 * `algs` is deliberately omitted. RFC 9449 §7.1 makes it a SHOULD *when a DPoP challenge is emitted*,
 * and Authlete already includes an accurate `algs` list on every challenge it generates itself
 * (verified: `DPoP error="invalid_token",…,algs="RS256 … ES256 …"`). These locally-built challenges
 * cover only malformed presentations, where sourcing the list would mean a discovery round trip on an
 * error path to tell a client something it already knows.
 */
export function authChallenge(
  schemes: TokenScheme[],
  code?: string | null,
  description?: string | null,
): string {
  const names = schemes.map((s) => (s === "dpop" ? "DPoP" : "Bearer"));
  if (!code) return names.join(", ");
  // Auth-params bind to the scheme they follow, so attach them to the last one listed.
  const params = [`error="${sanitizeQuoted(code)}"`];
  if (description) params.push(`error_description="${sanitizeQuoted(description)}"`);
  const last = `${names.pop()} ${params.join(",")}`;
  return [...names, last].join(", ");
}

const AUTHORIZATION_HEADER = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)[ \t]+(.+)$/;

/**
 * Extract the access token a client presented, per RFC 6750 §2.
 *
 * Supported: the `Authorization` header with the `Bearer` or `DPoP` scheme (§2.1, RFC 9449 §7.1),
 * and `access_token` in a form-encoded body (§2.2).
 *
 * Deliberately NOT supported: the URI query parameter of §2.3. RFC 9700 §4.3.2 (BCP 240) says
 * *"Clients MUST NOT pass access tokens in a URI query parameter in the way described in Section 2.3
 * of RFC 6750."*
 *
 * An unrecognised scheme yields `null` — "no token was presented" — rather than being forwarded as if
 * the raw header value were a token. The previous implementation did `authHeader.replace("Bearer ", "")`,
 * which handed Authlete strings like `"DPoP eyJ…"` and `"Basic …"` and asked it to look them up.
 *
 * @throws TokenPresentationError when the client uses more than one method — RFC 6750 §2:
 *   *"Clients MUST NOT use more than one method to transmit the token in each request."*
 */
export function extractAccessToken(req: Request): PresentedToken | null {
  let fromHeader: PresentedToken | null = null;
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.trim() !== "") {
    const match = AUTHORIZATION_HEADER.exec(header.trim());
    const scheme = match?.[1].toLowerCase();
    if (match && (scheme === "bearer" || scheme === "dpop")) {
      const token = match[2].trim();
      if (token) fromHeader = { token, scheme };
    }
  }

  // RFC 6750 §2.2 applies only to a form-encoded entity body.
  let fromBody: PresentedToken | null = null;
  if (req.method !== "GET" && req.is("application/x-www-form-urlencoded")) {
    const value = (req.body as Record<string, unknown> | undefined)?.access_token;
    if (typeof value === "string" && value.trim() !== "") {
      fromBody = { token: value.trim(), scheme: "bearer" };
    }
  }

  if (fromHeader && fromBody) {
    throw new TokenPresentationError(
      400,
      "invalid_request",
      "The access token was sent both in the Authorization header and in the request body. RFC 6750 Section 2 permits only one method per request.",
    );
  }

  return fromHeader ?? fromBody;
}

/**
 * Derive the values Authlete needs to validate a DPoP proof against *this* request.
 *
 * `htu` is the target URI with the query and fragment removed, per RFC 9449 §4.2 — and matching the
 * Authlete SDK, which documents `htu` as "URL of the user info endpoint" and offers a separate
 * `targetUri` for the full request URI. Sending the query string as `htu` (as this code used to) makes
 * any request carrying a query fail proof validation even when the client is correct.
 *
 * Host and scheme come from the request. `app.ts` sets `trust proxy`, so `req.protocol` honours
 * `X-Forwarded-Proto`; `req.get("host")` still reflects the `Host` header, so behind a proxy that
 * rewrites it — or terminates TLS on a different port — `htu` can legitimately disagree with what the
 * client signed. That is the classic DPoP false failure, and RFC 9700 §4.13's TLS-terminating-proxy
 * guidance applies here too.
 */
export function dpopHttpTarget(req: Request): { htu: string; targetUri: string } {
  const origin = `${req.protocol}://${req.get("host") ?? ""}`;
  const path = req.originalUrl.split(/[?#]/)[0];
  return { htu: `${origin}${path}`, targetUri: `${origin}${req.originalUrl}` };
}
