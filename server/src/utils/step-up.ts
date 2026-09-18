/**
 * Whether the authentication this OP actually performed satisfies what the authorization request demanded.
 *
 * Pure and side-effect free: it neither reads the session nor calls Authlete, so every branch is testable
 * without Express or a network. Both places that need the decision use *this* function — the login POST
 * (`controllers/session.controller.ts`) and the non-interactive `prompt=none` path
 * (`controllers/authorization.controller.ts`). Two implementations of one security check is how they drift.
 *
 * **The rule is fail-closed on absence, and that is the substance of it.** Before 2026-08-12 the
 * `prompt=none` path had no check at all: when the session recorded no authentication context it
 * **invented one** — `acr: "pwd"` with no evidence a password was used, and `auth_time: now` for an event
 * that happened at some unknown earlier time — then passed both to Authlete, which stamped them on the
 * tokens. A resource server enforcing a step-up requirement would have accepted a token whose freshness was
 * fabricated. See `audit/02-findings/RFC9470-step-up-authentication.md` F-3.
 *
 * So: an unknown `acr` does not satisfy an essential `acrs`, an unknown `authTime` does not satisfy a
 * `maxAge`, and an unknown subject does not satisfy a requested one. "We cannot prove it" is answered as
 * "no", never as "skip the check".
 *
 * **The subject check was added 2026-09-17 and the file outgrew its name.** It began as RFC 9470 step-up
 * only (`acr`/`auth_time`); it now covers every condition Authlete's `/auth/authorization` documentation
 * lists for the `INTERACTION` action — *"When the value of `subject` response parameter is not `null`, the
 * end-user authentication must be performed for the subject"*. The filename stayed `step-up.ts` on purpose:
 * renaming it would churn imports, tests and prose for no behaviour change. Anything the OP must check
 * about the authentication event before issuing belongs **here**, not at a call site.
 */

/** What the client asked for, as Authlete reports it on the authorization response. */
export interface StepUpRequirements {
  /**
   * The specific end-user the client expects to authorize, from Authlete's `subject` response parameter.
   *
   * Its only source is the `sub` claim of the `claims` request parameter (SDK: *"The value comes from `sub`
   * claim in `claims` request parameter"*). Authlete does **not** enforce it — `/auth/authorization/issue`
   * takes whatever subject this OP supplies and documents no cross-check — so if this check does not make
   * it, nothing does, and a client that asked to authorize one user receives a code for whoever logged in.
   */
  subject?: string;
  /** Requested ACR values (`acr_values`, or an `acr` claim request). */
  acrs?: string[];
  /** Whether the `acr` claim was requested as *essential*. A non-essential request is a preference. */
  acrEssential?: boolean;
  /** `max_age`, in seconds. */
  maxAge?: number;
}

/** What this OP actually observed about the End-User's authentication. Every field may be absent. */
export interface AuthenticationEvent {
  /** The subject this OP authenticated, once it has one. */
  subject?: string;
  /** The ACR this OP is willing to assert, e.g. `"pwd"` for password authentication. */
  acr?: string;
  /** When the authentication happened, epoch seconds. */
  authTime?: number;
}

/** An Authlete `/auth/authorization/fail` reason, or `null` when the requirements are met. */
export type StepUpFailure =
  | "DIFFERENT_SUBJECT"
  | "ACR_NOT_SATISFIED"
  | "EXCEEDS_MAX_AGE"
  | null;

export function checkStepUpRequirements(
  required: StepUpRequirements,
  event: AuthenticationEvent,
  now: number
): StepUpFailure {
  // Checked first because it is the most specific failure available: the other two ask whether the right
  // person authenticated *well enough*, this one asks whether it was the right person at all. Reporting
  // ACR_NOT_SATISFIED for a request that authenticated somebody else entirely would be a true statement
  // about the wrong question.
  //
  // `event.subject === undefined` lands here too, and must, by the same fail-closed rule as `acr` below.
  if (required.subject && required.subject !== event.subject) {
    return "DIFFERENT_SUBJECT";
  }

  // RFC 9470 §4 / OIDC Core §5.5.1.1. Only an *essential* `acr` request is binding: a non-essential one is a
  // preference, and OIDC Core says the OP "MAY" honour it, so failing on it would refuse conformant requests.
  if (required.acrEssential && required.acrs && required.acrs.length > 0) {
    // `event.acr === undefined` lands here too, and must: an ACR we cannot name is one we cannot assert.
    if (!event.acr || !required.acrs.includes(event.acr)) {
      return "ACR_NOT_SATISFIED";
    }
  }

  // OIDC Core §3.1.2.1 `max_age`: the End-User must have authenticated within this many seconds, otherwise
  // the OP must actively re-authenticate them. `max_age=0` is meaningful — it demands a fresh authentication
  // — so this tests for `undefined` rather than falsiness.
  if (required.maxAge !== undefined) {
    // No recorded authentication time means no proof of freshness. Refuse rather than assume.
    if (event.authTime === undefined) return "EXCEEDS_MAX_AGE";
    if (now - event.authTime > required.maxAge) return "EXCEEDS_MAX_AGE";
  }

  return null;
}
