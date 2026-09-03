/**
 * Read the claims of a JWT **without verifying it**.
 *
 * ## When this is legitimate, and when it is a vulnerability
 *
 * Only for a token that something upstream has **already authenticated**. Both current callers are in
 * that position: they run after Authlete has accepted a `subject_token` at the token endpoint, and
 * Authlete verifies it before answering — measured 2026-09-03 with `scripts/native-sso-verify.mjs`, a
 * self-signed subject token is refused with
 * `[A311335] The ID Token specified by the request parameter 'subject_token' is not signed.` So reading
 * a claim here is a read of an already-authenticated value, not a trust decision.
 *
 * **Anywhere else, use `verifyIdTokenHint`.** That module exists because `logout.service.ts` once used
 * `jwt.decode` and took `payload.sub` as the subject with nothing having verified the token — the exact
 * mistake this file makes easy. The name is deliberately unpleasant so a call site has to justify
 * itself.
 *
 * Extracted when the second caller appeared rather than copied: the caveat above is the part that must
 * not diverge, and two copies of a security argument is how one of them loses it.
 */
export function unverifiedJwtClaims(token: unknown): Record<string, unknown> | undefined {
  if (typeof token !== "string") return undefined;
  const segments = token.split(".");
  // A JWS has three segments and a JWE five. Neither a bare opaque token (a client-credentials
  // subject token, for instance) nor an empty string is a JWT, and both reach here in normal use.
  if (segments.length !== 3 && segments.length !== 5) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segments[1] ?? "", "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** One string claim, or `undefined`. Saves every caller repeating the type narrowing. */
export function unverifiedStringClaim(token: unknown, claim: string): string | undefined {
  const value = unverifiedJwtClaims(token)?.[claim];
  return typeof value === "string" ? value : undefined;
}
