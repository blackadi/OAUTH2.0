/**
 * One place where a DPoP-carrying request is sent, so the RFC 9449 §8/§9 nonce dance is implemented
 * once rather than four times.
 *
 * **The defect this exists to remove.** Every DPoP call site used to be:
 *
 * ```ts
 * if (!response.ok) throw new Error(await response.text());   // ← throws here
 * const dpopNonce = response.headers.get('dpop-nonce');       // ← never reached
 * ```
 *
 * A `400 use_dpop_nonce` exists precisely to hand the client the nonce it must replay, and the throw
 * discarded it. `sessionStorage.dpop_nonce` was only ever written from a *success* — which, once a server
 * requires nonces, can never happen. So the failure was not "the first request needs a retry" but **every
 * request, forever**. Recorded as the sole ground of DR-20.
 *
 * `htu` note: the nonce lives *inside* the signed proof, so a retry needs a **new signature**. That is why
 * `DpopProofSource` accepts a factory and not just a string — see below.
 */

const NONCE_KEY = 'dpop_nonce';

/**
 * A proof, or something that can mint one for a given nonce.
 *
 * A bare `string` cannot be re-signed with a different nonce, so it can never be retried — but it still
 * benefits from the nonce being *cached* instead of thrown away. The manual proof-builder in
 * `FapiSection` is a real caller of that form: the user pastes a proof and supplies their own nonce.
 */
export type DpopProofSource = string | ((nonce?: string) => Promise<string>);

export interface DpopResult {
  data: unknown;
  dpopNonce?: string;
}

export function getStoredNonce(): string | undefined {
  try {
    return sessionStorage.getItem(NONCE_KEY) || undefined;
  } catch {
    return undefined; // sessionStorage can throw in a sandboxed/blocked context
  }
}

function storeNonce(nonce: string): void {
  try {
    sessionStorage.setItem(NONCE_KEY, nonce);
  } catch {
    /* non-fatal: the request still works, it just will not be remembered */
  }
}

/** RFC 9449 §8 — the code that means "retry with this one". Not `invalid_dpop_proof`. */
function isNonceError(bodyText: string): boolean {
  try {
    return (JSON.parse(bodyText) as { error?: string }).error === 'use_dpop_nonce';
  } catch {
    // Some deployments answer with a `WWW-Authenticate`-shaped string rather than JSON.
    return bodyText.includes('use_dpop_nonce');
  }
}

async function mint(proof: DpopProofSource, nonce?: string): Promise<string> {
  return typeof proof === 'string' ? proof : proof(nonce);
}

/**
 * Send a DPoP-carrying request, honouring the nonce dance.
 *
 * 1. Mint the proof with the cached nonce, if there is one.
 * 2. **Always capture `DPoP-Nonce`, on success and on failure alike.** This single step is the bug fix;
 *    the retry below is the convenience.
 * 3. On a `use_dpop_nonce` refusal carrying a *new* nonce, re-mint and retry **exactly once**.
 * 4. Otherwise throw the response body verbatim, which is what every call site did before.
 *
 * Retry is capped at one deliberately. A server that answers `use_dpop_nonce` to a proof carrying the
 * nonce it just issued is misbehaving, and looping would turn that into a hammer.
 */
export async function dpopRequest(
  url: string,
  proof: DpopProofSource,
  buildInit: (proof: string) => RequestInit,
): Promise<DpopResult> {
  let nonce = getStoredNonce();
  let response = await fetch(url, buildInit(await mint(proof, nonce)));
  let fresh = response.headers.get('dpop-nonce') || undefined;
  if (fresh) {
    storeNonce(fresh);
    nonce = fresh;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    const retryable = isNonceError(bodyText) && !!fresh && typeof proof !== 'string';
    if (!retryable) throw new Error(bodyText);

    response = await fetch(url, buildInit(await mint(proof, nonce)));
    fresh = response.headers.get('dpop-nonce') || undefined;
    if (fresh) storeNonce(fresh);
    if (!response.ok) throw new Error(await response.text());
  }

  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { data, dpopNonce: fresh };
}
