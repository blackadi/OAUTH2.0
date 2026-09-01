/**
 * The demo end-user profile — **one source, used by two callers.**
 *
 * There were two claim sources until 2026-09-01, and one of them did not exist. The userinfo endpoint
 * synthesised these values inline; the authorization-issue path passed Authlete `consentedClaims` —
 * the claim *names* — and never the values. Authlete embeds a claim as `null` when it is told the user
 * consented to it but is never told what it is, so every id_token carried
 * `"name": null, "email": null, …` while userinfo returned real values for the same claims.
 *
 * `fapi2-security-profile-final-test-claims-parameter-identity-claims` failed 22 assertions on that,
 * and the giveaway was *"Value of name **differs** between id_token and userinfo"* — `differs`, not
 * `missing`, because `null` is present-but-invalid.
 *
 * **A claim with no value is omitted, never set to `null`.** OpenID Connect Core §5.1: *"If a Claim is
 * not returned, that Claim Name SHOULD be omitted from the JSON object representing the Claims"*. That
 * is what userinfo always did, and what the id_token now does too — which is why nine of the claims in
 * this service's `claims_supported` come back from neither endpoint, and why that is correct rather
 * than a gap to paper over with invented data.
 *
 * **The values are deliberately unchanged from the inline version this replaced.** `name` and friends
 * are copies of the subject rather than the `name` that `AUTH_USERS` configures, which
 * `session.controller.ts` discards at login. Three lab transcripts pin this output byte for byte —
 * `docs/curriculum/modules/{02,05,08}/…/lab.md` — so changing a value here breaks prose that no test
 * can see. Fix the discarded name separately, with those transcripts.
 */
/**
 * Which claims did the client ask to have embedded in the ID token?
 *
 * `AuthorizationResponse.idTokenClaims` is the raw JSON of the `id_token` member of the OIDC claims
 * request — for example `{"name":null,"email":{"essential":true}}`. In that syntax **`null` means "no
 * special requirements for this claim"**, not "this claim's value is null".
 *
 * That distinction is the whole bug. Until 2026-09-01 this string was passed straight through as
 * `AuthorizationIssueRequest.claims`, which is the opposite kind of thing — the vendored spec calls it
 * *"the claims of the end-user … in JSON format"*, i.e. the **values**. So Authlete was handed
 * `{"name":null,…}` as an answer and faithfully embedded it: every id_token came back with
 * `"name": null`. Measured on the wire, from this server's own log:
 *
 *   claims: "{\"name\":null,\"family_name\":null,\"given_name\":null,…}"
 *
 * Only the **names** are wanted here; the values come from `claimValuesFor`.
 *
 * Returns `[]` for absent or unparseable input rather than throwing — a malformed claims request is
 * Authlete's to reject, and it has already accepted this one by the time we see it.
 */
export function requestedIdTokenClaimNames(idTokenClaims?: string | null): string[] {
  if (!idTokenClaims) return [];
  try {
    const parsed = JSON.parse(idTokenClaims);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.keys(parsed);
  } catch {
    return [];
  }
}

/**
 * `updated_at` is a **fixed point, not a clock read** (2026-09-01).
 *
 * OIDC Core §5.1 defines it as *"Time the End-User's information was last updated"*. These demo
 * profiles come from static `AUTH_USERS` configuration and are never updated, so the honest answer is
 * a constant — and it has to be, because this function is now called twice for one authorization: once
 * building the id_token's claims and again when userinfo is called. `Math.floor(Date.now() / 1000)`
 * gave two different answers, and the conformance suite compares them:
 *
 *   FAILURE  AddIdentityClaimsFromUserInfo: Value of updated_at differs between id_token and userinfo
 *
 * Measured: 33 seconds apart in run `tAi3boZk2jgw0xd` — the id_token is minted at the token endpoint
 * and userinfo is called after. The clock read was always wrong for a static profile; nothing compared
 * the two values until the id_token started carrying them, so it was never observable.
 *
 * A literal rather than a module-load constant: those differ across a restart or a second instance, so
 * an id_token issued before a redeploy would disagree with a userinfo call after it.
 */
const PROFILE_UPDATED_AT = 1735689600; // 2025-01-01T00:00:00Z

/**
 * Every claim this deployment can actually produce — the single list, used three ways.
 *
 * 1. `claimValuesFor` below produces exactly these and no others.
 * 2. The consent screen offers exactly these, so it never asks to share a claim that is never issued.
 * 3. The Authlete service's `supportedClaims` is aligned to these, so the advertised
 *    `claims_supported` is true.
 *
 * **Why it exists.** The service advertised 20 claims while the server could serve 11, and nothing
 * connected the two, so the gap survived until a conformance run found it:
 *
 *   WARNING  EnsureIdentityClaimsContainRequestedClaims: The server did not return all the requested
 *            claims. … As the server listed the claims in claims_supported, it should have returned
 *            them in either the id_token or the userinfo response.
 *
 * The nine dropped — `address`, `birthdate`, `gender`, `middle_name`, `phone_number`,
 * `phone_number_verified`, `picture`, `profile`, `website` — were never served by anything. Omitting a
 * claim you have no value for is right (OIDC Core §5.1); advertising it is not.
 *
 * **Adding a claim means three edits, in this order:** a `case` below, this list, then
 * `node scripts/fapi2-align-supported-claims.mjs --apply`. `check-claims-supported.mjs` catches it if
 * you stop after two, and `demo-claims.test.ts` catches it if you stop after one.
 */
/**
 * **`sub` is in this list but is not produced by `claimValuesFor`.** It belongs in `claims_supported`
 * — the server does serve it, on every id_token and userinfo response — but it is not an identity
 * claim value the authorization server supplies. Authlete emits it from `AuthorizationIssueRequest`'s
 * `subject`, and `userinfo.controller.ts` sets it directly. Putting it in the supplied `claims` JSON
 * would be redundant at best and a second source for the subject at worst.
 *
 * `IDENTITY_CLAIMS` below is the half `claimValuesFor` actually produces; the test pins the
 * relationship so neither can drift from the other.
 */
export const SERVED_CLAIMS = [
  "sub",
  "name",
  "given_name",
  "family_name",
  "nickname",
  "preferred_username",
  "email",
  "email_verified",
  "zoneinfo",
  "locale",
  "updated_at",
] as const;

/** The claims `claimValuesFor` produces: everything served except `sub`. See the note above. */
export const IDENTITY_CLAIMS = SERVED_CLAIMS.filter((c) => c !== "sub");

export function claimValuesFor(
  subject: string,
  names: readonly string[],
): Record<string, unknown> {
  const claims: Record<string, unknown> = {};

  for (const name of names) {
    switch (name) {
      case "name":
      case "given_name":
      case "family_name":
      case "nickname":
      case "preferred_username":
        claims[name] = subject;
        break;
      case "email":
        claims[name] = `${subject}@example.com`;
        break;
      case "email_verified":
        claims[name] = true;
        break;
      case "zoneinfo":
        claims[name] = "UTC";
        break;
      case "locale":
        claims[name] = "en-US";
        break;
      case "updated_at":
        claims[name] = PROFILE_UPDATED_AT;
        break;
      default:
        // No value for this claim. Leave it out — see §5.1 above.
        break;
    }
  }

  return claims;
}
