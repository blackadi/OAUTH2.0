import { AUTHLETE_CODES, type AuthleteCode } from '@/data/authlete-codes.generated';
import { AUTHLETE_NOTES, OAUTH_ERRORS, type AuthleteNote, type ErrorDoc } from '@/data/errorDocs';

/**
 * Pull an OAuth error code and an Authlete result code out of whatever the server actually sent, then
 * attach what is known about each.
 *
 * The input is deliberately loose — a plain string is enough. Errors reach a section as the string
 * `useAsyncCall` produced, which since the transport rewrite carries the status, any
 * `WWW-Authenticate` challenge and the response body; the trace panel has the structured form. One
 * decoder serves both rather than each growing its own parser.
 *
 * **Nothing here guesses.** An unrecognised code is reported as unrecognised, with the raw text kept
 * intact so the reader can see exactly what arrived.
 */

export interface DecodedError {
  /** The OAuth `error` value, if one could be found. */
  oauthError?: string;
  oauthDoc?: ErrorDoc;
  /** `error_description`, when present and distinct from the raw text. */
  description?: string;
  /**
   * `error_uri` — RFC 6749 §4.1.2.1's optional link to human-readable information about the error.
   *
   * Worth surfacing because this server's upstream actually populates it: a live probe of an
   * authorization request with no `response_type` came back carrying
   * `error_uri: https://docs.authlete.com/#A009301`, the vendor's own documentation anchored at the
   * exact code. Nothing in the specification promised that; it was found by probing.
   */
  errorUri?: string;
  /** The Authlete result code, if the text carried one. */
  authleteCode?: string;
  /** The vendor's own message for that code, from the vendored specification. */
  authleteVendor?: AuthleteCode;
  /** This repo's live-verified guidance for that code. */
  authleteNote?: AuthleteNote;
  /** The HTTP status, when the caller knows it. */
  status?: number;
  /** True when at least one code was recognised. */
  recognised: boolean;
}

/**
 * An Authlete result code, and **only** when it stands alone.
 *
 * The first version was `/\[?(A\d{6})\]?/` — no boundaries — and that is a genuine defect rather than
 * an untidiness. Error bodies routinely carry opaque tokens, JWT segments and hashes, and any six
 * digits after a capital A inside one of them was extracted as a result code: `xxA1234567yy` yielded
 * `A123456`, so did a JWT header segment, and a real seven-digit code was silently truncated to six.
 *
 * The consequence is the exact failure this decoder exists to prevent. A fabricated code that happens
 * to collide with an entry in `AUTHLETE_NOTES` would be given a **confident and wrong** explanation,
 * and the reader has no way to tell that apart from a real one. Precision here matters more than
 * recall: missing a code costs a paragraph of help, inventing one costs trust in all of them.
 *
 * Written with a leading character class rather than a lookbehind so it needs no assumption about the
 * runtime's regex support.
 */
const AUTHLETE_CODE_RE = /(?:^|[^0-9A-Za-z])\[?(A\d{6})\]?(?![0-9A-Za-z])/;

/**
 * `error="invalid_token"` in a challenge, `"error":"invalid_token"` in JSON, `error=invalid_token` in
 * a redirect query. One expression covers all three because the value is always a bare token.
 */
const OAUTH_ERROR_RE = /["']?error["']?\s*[:=]\s*["']?([a-z_]{3,60})["']?/i;
// Only http(s), and only up to the closing quote or delimiter — this value ends up in an href.
const ERROR_URI_RE = /["']?error_uri["']?\s*[:=]\s*["']?(https?:\/\/[^"'\s,}]{1,300})/i;
const DESCRIPTION_RE = /["']?error_description["']?\s*[:=]\s*["']([^"']{1,400})["']/i;

/**
 * The leading `429 Too Many Requests` that `describeError` puts at the front of every error string.
 *
 * **Why this had to exist.** `statusHint` was written, unit-tested and unreachable. `ErrorExplainer` is
 * `decodeError`'s only caller, **not one of its 46 usages passes `status`**, and `status` arrived only
 * on the object form — so the entire status-based explanation path was dead in the running app while a
 * green test asserted it worked. Found by a driven section test that expected a 429 to be explained and
 * watched nothing appear.
 *
 * Anchored at the very start and exactly three digits, because that is the only place `describeError`
 * writes one: `${status}${statusText ? ' ' + statusText : ''}` joined with ` · `. A body that merely
 * *contains* a number is not a status, and guessing from one would be the thing this decoder promises
 * not to do.
 */
const LEADING_STATUS_RE = /^(\d{3})(?=\s|$)/;

export function decodeError(input: string | { raw?: string; status?: number }): DecodedError {
  const raw = typeof input === 'string' ? input : (input.raw ?? '');
  const carried = raw.match(LEADING_STATUS_RE)?.[1];
  // An explicitly supplied status wins; otherwise read the one the error string already carries.
  const status =
    (typeof input === 'string' ? undefined : input.status) ??
    (carried ? Number(carried) : undefined);

  const authleteCode = raw.match(AUTHLETE_CODE_RE)?.[1];
  const oauthError = raw.match(OAUTH_ERROR_RE)?.[1]?.toLowerCase();
  const description = raw.match(DESCRIPTION_RE)?.[1];
  const errorUri = raw.match(ERROR_URI_RE)?.[1];

  const oauthDoc = oauthError ? OAUTH_ERRORS[oauthError] : undefined;
  const authleteVendor = authleteCode ? AUTHLETE_CODES[authleteCode] : undefined;
  const authleteNote = authleteCode ? AUTHLETE_NOTES[authleteCode] : undefined;

  return {
    oauthError,
    oauthDoc,
    description,
    errorUri,
    authleteCode,
    authleteVendor,
    authleteNote,
    status,
    recognised: Boolean(oauthDoc || authleteVendor || authleteNote),
  };
}

/**
 * What the status alone tells you, for the case where no code could be extracted at all.
 *
 * Kept short and separate: a status is a much weaker signal than an error code, and presenting a guess
 * from it with the same confidence as a decoded code would be misleading. `429` is here because
 * Authlete's ~15-call limit is the single most confusing failure on this deployment — it looks like a
 * credential problem and is not.
 */
export function statusHint(status: number | undefined): string | undefined {
  if (!status) return undefined;
  if (status === 401)
    return 'Unauthenticated — the credentials were missing, wrong, or sent on a channel this client is not registered for.';
  if (status === 403)
    return 'Authenticated but not permitted. Distinct from a 401: the identity was accepted and the action was not.';
  if (status === 404)
    return 'No such route, or no such object at it. This server terminates unmatched /api paths with a JSON not_found (since 2026-08-22) — before that they fell through to the SPA and answered 200 with HTML, so an older client may still be treating a typo as success.';
  if (status === 429)
    return 'Rate limited. Authlete allows roughly 15 token calls in a short window, and this server adds its own limits — wait rather than changing the request.';
  if (status === 413) return 'The payload is too large — PAR has a size limit.';
  if (status >= 500)
    return 'The server failed rather than refusing you. The request may be fine; check the server logs.';
  return undefined;
}
