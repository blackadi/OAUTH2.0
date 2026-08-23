/**
 * An append-only record of every HTTP call this app has made, for the request-history panel.
 *
 * **Why.** `useAsyncCall` clears the previous result on each invocation, every section keeps its own
 * latest response in local state, and a route change unmounts the section — so there was no record of
 * what you just did. Debugging a multi-step protocol (push a PAR request, authorize, redeem the code,
 * introspect the token) meant the evidence of step one was gone by step three. That is the opposite of
 * what a debugger is for.
 *
 * Deliberately outside React: `transport.ts` is a plain module and must be able to record from
 * anywhere, including a call that outlives the component that started it. The panel subscribes through
 * `useSyncExternalStore`, which is the supported way to read an external mutable source without
 * tearing during concurrent rendering.
 *
 * **Not persisted.** These entries hold access tokens, authorization codes, client secrets and DPoP
 * proofs. Keeping them in memory means a refresh discards them, which is the correct default for a
 * page that is also a teaching tool — nothing is written anywhere a later visitor could read it.
 * `redactHeaders` below governs what leaves the panel.
 */

export interface TraceEntry {
  id: string;
  /** Wall-clock start, for display. Durations come from `performance.now()` and are monotonic. */
  startedAt: number;
  durationMs: number;
  method: string;
  url: string;
  label?: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  ok: boolean;
  /** Set only when no response arrived at all; `status` is 0 in that case. */
  networkError?: string;
  /**
   * True for a front-channel hop — a browser navigation this app initiated or received, rather than a
   * request it sent and awaited. Kept as an explicit flag rather than inferred from `status === 0`,
   * because a network failure is also status 0 and means something entirely different.
   */
  navigation?: boolean;
  /** For a navigation: which way it went. See `NavigationInput.direction`. */
  direction?: 'outbound' | 'inbound';
}

export type TraceInput = Omit<TraceEntry, 'id'>;

/**
 * A front-channel hop: a full-page navigation, not a `fetch`.
 *
 * **The gap this closes.** `recordTrace` was called from exactly two places, both inside
 * `transport.ts` — and the authorization request is `window.location.href = url`, a browser navigation
 * that no `fetch` interceptor can see. So the single most important request in OAuth never entered the
 * trace: a learner composed it parameter by parameter in a 24-field builder, sent it, and watched it
 * disappear. The request history and the four-lane `SequenceView` both began at the token exchange, and
 * `flow-progress.hasAuthorizeRequest` was a predicate that could never be true.
 *
 * That matters more here than a missing row would elsewhere. Those two hops are the *front channel*,
 * `SequenceView`'s four lanes exist to show front channel against back channel, and the diagram could
 * not draw the distinction it was built to teach.
 *
 * **A navigation is recorded honestly rather than dressed up as a request/response pair.** There is no
 * status, because the browser — not this app — receives the answer, and the answer is a redirect the
 * user's session follows. `status: 0` is the value the store already uses for "no response arrived",
 * `durationMs` is 0 because nothing was awaited, and `ok` is true because nothing failed. The response
 * body carries a sentence saying so, so nobody reads the row as a captured HTTP response.
 */
export interface NavigationInput {
  url: string;
  label: string;
  /**
   * Which way the hop went.
   *
   * `outbound` is the browser leaving for the authorization endpoint; `inbound` is the redirect coming
   * back with the code. The direction is **passed in rather than inferred from the URL**, because a
   * redirect back to our own `/callback` is a message *from* the authorization server, and a diagram
   * that guessed from the host would draw it as the client talking to itself — the exact opposite of the
   * front-channel round trip the four lanes exist to show.
   */
  direction: 'outbound' | 'inbound';
  /** `GET` for an outbound navigation; the inbound redirect is also a `GET`. */
  method?: string;
}

export function recordNavigation(input: NavigationInput): TraceEntry {
  return recordTrace({
    startedAt: Date.now(),
    durationMs: 0,
    method: input.method ?? 'GET',
    url: input.url,
    label: input.label,
    requestHeaders: {},
    requestBody: undefined,
    status: 0,
    statusText: 'front-channel navigation',
    responseHeaders: {},
    responseBody:
      input.direction === 'outbound'
        ? 'Front-channel hop — the browser navigated away, so this app never saw a response. The answer arrives as the redirect back to the callback.'
        : 'Front-channel hop — this is the redirect the authorization server sent the browser. Its parameters are in the URL above.',
    ok: true,
    navigation: true,
    direction: input.direction,
  });
}

/**
 * Bounded so a polling loop cannot grow it without limit — `useServerStatus` alone adds an entry every
 * 30 seconds, and the device-flow section polls the token endpoint on an interval. Oldest entries are
 * dropped first.
 */
const MAX_ENTRIES = 200;

let entries: TraceEntry[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function recordTrace(input: TraceInput): TraceEntry {
  counter += 1;
  const entry: TraceEntry = { id: `t${counter}`, ...input };
  // A new array each time, not a mutation: `useSyncExternalStore` compares snapshots by identity, and
  // pushing in place would leave the panel showing a stale list.
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
  return entry;
}

export function getTraces(): TraceEntry[] {
  return entries;
}

export function clearTraces(): void {
  entries = [];
  counter = 0;
  emit();
}

export function subscribeToTraces(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── redaction ────────────────────────────────────────────────────────────────────────────────────

/**
 * Header names whose value is a credential or a proof.
 *
 * `Authorization` is the obvious one: `Basic <base64>` is a client secret in transit, and a cURL
 * command pasted into a chat or an issue leaks it. `DPoP` is a signed proof — not a long-lived secret,
 * but replayable within its window. `Cookie` carries the session.
 */
const SENSITIVE_HEADERS = new Set(['authorization', 'dpop', 'cookie', 'set-cookie']);

/**
 * Mask credential values for display and export.
 *
 * The store keeps the real values, because reproducing a request is the point of a debugger and the
 * user supplied the credential themselves. Masking happens on the way *out* — which is the same rule
 * "copy as cURL" needs, and the reason both share this function rather than each deciding.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(name.toLowerCase())) {
      out[name] = value;
      continue;
    }
    // Keep the scheme — knowing it was `Basic` rather than `Bearer` or `DPoP` is often the whole
    // diagnosis (see the two-channel client-auth table in AGENTS.md) — and drop the credential.
    const scheme = value.split(' ')[0];
    out[name] = /^[A-Za-z-]+$/.test(scheme) && value.includes(' ') ? `${scheme} ●●●●●●` : '●●●●●●';
  }
  return out;
}

/**
 * Body parameters whose value is a credential. Same reasoning as the headers above.
 *
 * **`code` and `token` were added deliberately, against a stated rationale that turned out to be wrong.**
 * A test used to assert that `code=xyz` survived redaction, commented *"an authorization code is
 * single-use and already spent"*. That is true of a *successful* exchange and false of a failed one —
 * and this repo proved it: an authorization code **survives** a `use_dpop_nonce` refusal, so the same
 * code replayed with the nonce still yields `OK` (verified live 2026-08-17, recorded in `AGENTS.md`).
 * A failed exchange is exactly the request somebody exports and pastes into an issue asking what is
 * wrong, so the one case the rationale did not cover is the one case that matters.
 *
 * `token` is the parameter RFC 7662 §2.1 and RFC 7009 §2.1 both define, so it is what the introspection
 * and revocation sections send — a live access or refresh token, with nothing spent about it.
 *
 * Both remain visible on screen and under `reveal`; this list governs what leaves the page.
 */
const SENSITIVE_PARAMS = [
  'client_secret',
  'password',
  'code',
  'code_verifier',
  'token',
  'refresh_token',
  'assertion',
  'client_assertion',
  'subject_token',
  'actor_token',
];

/**
 * Mask credentials in a form-encoded or JSON body.
 *
 * Mirrors the rule the server learned the hard way: `token.service.ts` and `revocation.service.ts` once
 * logged whole request bodies, writing client secrets, end-user passwords, authorization codes, PKCE
 * verifiers and refresh tokens to a 14-day retained log (RFC 9700 §4.2.4). The exposure here is
 * narrower — one browser tab, memory only — but an *exported* trace travels, so it gets the same list.
 */
export function redactBody(body: string | undefined): string | undefined {
  if (!body) return body;
  let out = body;
  for (const param of SENSITIVE_PARAMS) {
    /**
     * form-encoded: `client_secret=value` up to the next `&`.
     *
     * The leading `(^|[^A-Za-z0-9_])` is load-bearing now that short names are on the list. Without a
     * boundary, `token=` matches inside `refresh_token=` and `code=` matches inside anything ending in
     * those letters, so masking became unpredictable — and a name is only a parameter name when the
     * character before it is not part of an identifier. `_` counts as identifier, which is precisely
     * what keeps `refresh_token` from being matched by the `token` rule.
     *
     * The boundary also has to admit `"`, because `par.service.ts` and `ciba.service.ts` nest a
     * form-encoded string inside a JSON field: `{"parameters":"code_verifier=…"}`. A boundary of only
     * `^`, `?` and `&` would silently stop masking those.
     */
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9_])(${param})=[^&"]*`, 'gi'), '$1$2=●●●●●●');
    // JSON: `"clientSecret": "value"` in either spelling
    const camel = param.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());
    out = out.replace(new RegExp(`("(?:${param}|${camel})"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"●●●●●●"');
  }
  return out;
}
