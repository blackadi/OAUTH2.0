/**
 * Every key this app puts in `sessionStorage`, in one place, with one way to clear them all.
 *
 * **The defect this closes.** Twelve keys were written from six components with no owner, and
 * `clearTokens()` removed three of them. Two consequences, both invisible to the user:
 *
 * - Generating a signing key in the FAPI section wrote `fapi_signing_private_key`, and **nothing ever
 *   removed it**. The callback branches on its presence, so from that moment every authorization-code
 *   exchange in the session sent `client_assertion` (`private_key_jwt`) instead of the client secret.
 *   For a `client_secret_basic` client that is a 401 the user cannot explain or undo.
 * - The DPoP key pair outlived the flow that made it, so a later exchange could be sender-constrained
 *   by a key the user had forgotten about.
 *
 * A mode you cannot see and cannot reset is worse than one you have to opt into every time. Reading
 * and writing through this module means "what is in the session?" and "reset it" both have an answer.
 *
 * Every accessor is failure-tolerant: `sessionStorage` throws in a sandboxed frame, in private mode on
 * some browsers, and wherever site data is blocked. A debugger that cannot remember a nonce should
 * still send the request.
 */

export const SESSION_KEYS = {
  /** The whole token response, as issued. */
  tokenResponse: 'token_response',

  // ── the in-flight authorization request ──────────────────────────────────────────────────────────
  pkceVerifier: 'pkce_code_verifier',
  oauthState: 'oauth_state',
  authzClientId: 'authz_client_id',
  authzClientSecret: 'authz_client_secret',

  /** The client the most recent token belongs to — used to pre-fill revocation and introspection. */
  activeClientId: 'active_client_id',
  activeClientSecret: 'active_client_secret',

  // ── proof-of-possession ──────────────────────────────────────────────────────────────────────────
  dpopPrivateKey: 'dpop_private_key',
  dpopPublicKey: 'dpop_public_key',
  dpopKid: 'dpop_kid',
  /** Cached `DPoP-Nonce`. Owned by `dpop-fetch.ts`, which reads and writes it directly. */
  dpopNonce: 'dpop_nonce',

  /** The `private_key_jwt` signing key. The sticky one — see the note above. */
  fapiSigningKey: 'fapi_signing_private_key',
  /**
   * Its public half, for display as a JWK Set.
   *
   * A thirteenth key, found only when the migration swept the codebase for raw `sessionStorage` calls —
   * it was written by `FapiSection` and appeared in no inventory, including the first draft of this
   * file. That is the argument for enumerating them in one place rather than trusting a list.
   */
  fapiSigningPublicKey: 'fapi_signing_pub_jwk',

  /**
   * Where the browser was when it left for the authorization server, so the callback can send you back.
   *
   * Owned by `navigateTo` in `trace-store.ts`, which is already the single place the app leaves — the
   * same pairing that makes forgetting to record the hop impossible makes forgetting the return path
   * impossible. Read once, by `CallbackPage`.
   */
  returnTo: 'return_to',

  /**
   * The request trace, so it survives the front-channel redirect.
   *
   * Owned by `trace-store.ts`. It is here rather than reaching for `sessionStorage` directly for the
   * reason this file exists at all — and because `resetSession` enumerates these keys, which makes
   * "forget everything" include the trace without anybody having to remember it.
   */
  traceHistory: 'trace_history',
} as const;

export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS];

export function readKey(key: SessionKey): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeKey(key: SessionKey, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* non-fatal: the request still works, it just will not be remembered */
  }
}

export function removeKey(key: SessionKey): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/** Parse a JSON-valued key, returning null rather than throwing on anything malformed. */
export function readJsonKey<T>(key: SessionKey): T | null {
  const raw = readKey(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Clear the DPoP key pair and the cached nonce.
 *
 * Separate from `resetSession` because turning DPoP *off* should forget the key without discarding the
 * token you just obtained with it.
 */
export function clearDpopKeys(): void {
  removeKey(SESSION_KEYS.dpopPrivateKey);
  removeKey(SESSION_KEYS.dpopPublicKey);
  removeKey(SESSION_KEYS.dpopKid);
  removeKey(SESSION_KEYS.dpopNonce);
}

/**
 * Keys `resetSession` deliberately leaves alone, because they are **evidence rather than state**.
 *
 * The defect this file was written for is a key whose lingering presence *changes what the next request
 * does*: a stale `fapi_signing_private_key` silently rewired every later exchange to `private_key_jwt`.
 * Every other entry above is that kind of key — a token, a credential, a proof, an in-flight parameter.
 * The request trace is not: it records what already happened and alters nothing about what happens next.
 *
 * It matters because `resetSession` is what `TokenContext.clearTokens` calls, which is what the token
 * vault's "Clear session" button calls. Sweeping the trace along with it would delete the request
 * history as a side effect of clearing tokens — the evidence of the flow you just ran, discarded by the
 * button you press to run another one, and not mentioned in that dialog's list of what it removes. The
 * trace has its own owner and its own clear (`clearTraces`, behind the panel's own control).
 *
 * The exclusion is a named list with a test on it, because an exception to "enumerated so a key cannot
 * be missed" is exactly the shape that drifts.
 */
const EVIDENCE_KEYS: readonly SessionKey[] = [SESSION_KEYS.traceHistory];

/**
 * Forget every credential.
 *
 * Enumerated from `SESSION_KEYS` rather than listed again, so a key added above cannot be missed here —
 * which is exactly how `fapi_signing_private_key` came to be unclearable. `EVIDENCE_KEYS` is the one
 * documented exception; see the note on it.
 */
export function resetSession(): void {
  for (const key of Object.values(SESSION_KEYS)) {
    if (EVIDENCE_KEYS.includes(key)) continue;
    removeKey(key);
  }
}
