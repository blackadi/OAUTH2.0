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
 * **Persisted to `sessionStorage`, and that is a reversal worth explaining.** This paragraph used to
 * read *"Not persisted … nothing is written anywhere a later visitor could read it"*, and the second
 * half of that sentence was doing all the work while the first half broke the feature. The
 * authorization request is `window.location.href = url` — a full-document navigation — so the array
 * below, the module instance holding it and the whole JS heap were discarded on the way to the login
 * page. `navigateTo` recorded the outbound hop microseconds before that happened, which means **no
 * human ever saw it**: the callback page always started from an empty store, and the one screen where
 * somebody needs to compare the two halves of an authorization-code flow was the one screen guaranteed
 * to hold only the second. `utils/diagnose.ts` was reduced to printing "no evidence in this trace" on
 * a correctly-executed run.
 *
 * `sessionStorage` rather than `localStorage`, and the distinction is the whole safety argument: it is
 * scoped to **one tab**, dies with it, and is not readable from another tab or a later visit. The
 * original objection — that these entries hold access tokens, authorization codes, client secrets and
 * DPoP proofs — is answered by where the app already keeps its secrets: `session-keys.ts` holds the
 * DPoP **private key**, the PKCE verifier and `state` in exactly this store. So the exposure widens
 * from one document's heap to one tab's session, which is not a new class of exposure; it does not
 * widen to disk, to another tab, or to a later visitor. `redactHeaders` below still governs what
 * leaves the panel, which is the boundary that actually mattered.
 */

import { SESSION_KEYS, readJsonKey, writeKey } from './session-keys';

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
  /**
   * True for an entry loaded from a saved run rather than observed by this build.
   *
   * **The flag lives on the entry, not on the panel's state, and that is the whole safety property.** A
   * trace panel showing somebody else's requests as though they were yours is worse than having no import
   * at all — you would spend an afternoon debugging traffic your own build never sent. Because it travels
   * with the row, nothing can render an imported entry without knowing it is one. See
   * `services/run-file.ts`.
   */
  imported?: boolean;
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
 * Leave the app, and record that we did. **The only way a section should navigate the browser.**
 *
 * `services/transport.ts` is the one place a *back-channel* request leaves this app, and everything goes
 * through it precisely so nothing can be sent without reaching the trace. The front channel had no such
 * chokepoint: `window.location.href = url` appeared in **seven places across five sections**, and only
 * one of them — `AuthFlowsSection` — called `recordNavigation` beside it. So the authorization hop was in
 * the trace when it started from Grant Flows and invisible when it started from PAR, RAR or the FAPI
 * wizard, and `hasAuthorizeRequest` in `utils/flow-progress.ts` was true or false depending on which
 * section you had used. Nothing could see that: a navigation leaves no artefact to assert against, which
 * is the whole reason `recordNavigation` exists.
 *
 * Pairing the two operations in one function is what makes forgetting impossible. If you find yourself
 * writing `window.location.href` in a component, use this instead — and if a new call site genuinely
 * must not be recorded, say why at that call site rather than reaching past this.
 */
export function navigateTo(url: string, label: string, returnTo?: string): void {
  recordNavigation({ url, label, direction: 'outbound' });
  /**
   * Remember where we were, for the same reason we record the hop: this is the only place that knows.
   *
   * `/callback` is registered **outside** `AppLayout` (`App.tsx`), so it renders with no sidebar and no
   * nav — its only exit was a "Return to Dashboard" button. Four sections leave through here (Grant
   * Flows, PAR, RAR and the FAPI wizard) and every one of them dropped you on the dashboard, so
   * finishing a flow meant navigating back and finding your place by hand. In the FAPI wizard that is
   * fatal to the lesson rather than merely annoying: step 3 is *after* the redirect, so the last step
   * was effectively unreachable.
   *
   * Stored with `search` and `hash` because the hash is what makes a step addressable —
   * `useHashScroll` is wired in `AppLayout` and every wizard step already carries an `id`, so
   * `/fapi#fapi-step-3` returns the reader to the exact step that comes next.
   */
  writeKey(
    SESSION_KEYS.returnTo,
    // `returnTo` lets a caller name the step the reader should come back to rather than the one they
    // left from — the FAPI wizard leaves at step 2 and the next thing to do is step 3. Reaching past
    // this function to write the key directly is the thing the paragraph above forbids, so it is a
    // parameter here instead.
    returnTo ?? window.location.pathname + window.location.search + window.location.hash,
  );
  window.location.href = url;
}

/**
 * Bounded so a polling loop cannot grow it without limit — `useServerStatus` alone adds an entry every
 * 30 seconds, and the device-flow section polls the token endpoint on an interval. Oldest entries are
 * dropped first.
 */
const MAX_ENTRIES = 200;

/**
 * What is written to the session, as one value.
 *
 * `counter` travels with the entries because it mints the ids. Restoring five entries and leaving the
 * counter at zero makes the next live request `t1` again — a duplicate key in a React list, and a
 * duplicate id in an exported run file. The two are one fact and are stored as one.
 */
interface PersistedTrace {
  entries: TraceEntry[];
  counter: number;
}

/**
 * Read the trace back, or start empty.
 *
 * Anything malformed is treated as absent rather than repaired: this value is written by this module
 * and nothing else, so a shape that does not match means the storage was hand-edited or written by an
 * older build, and half-reviving either of those is worse than starting clean. `readJsonKey` already
 * returns `null` instead of throwing on bad JSON, and `readKey` tolerates a `sessionStorage` that
 * throws — a sandboxed frame, private mode, blocked site data.
 */
function restore(): PersistedTrace {
  const saved = readJsonKey<PersistedTrace>(SESSION_KEYS.traceHistory);
  if (!saved || !Array.isArray(saved.entries) || typeof saved.counter !== 'number') {
    return { entries: [], counter: 0 };
  }
  return { entries: saved.entries.slice(0, MAX_ENTRIES), counter: saved.counter };
}

const restored = restore();
let entries: TraceEntry[] = restored.entries;
let counter = restored.counter;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * The one place `entries` is assigned. Assign, persist, notify — in that order, always all three.
 *
 * Written as a seam rather than three copies of the same two lines because this repo's recurring
 * failure is precisely "a capability was added and one caller was never told": `recordNavigation`
 * existed for months while five of seven front-channel call sites never called it. `recordTrace`,
 * `clearTraces` and `importTraces` all mutate this array, and a fourth will be written some day.
 *
 * A write that fails is non-fatal by design. `writeKey` swallows the error, so a full quota or a
 * blocked store costs the *history* and not the panel: `entries` is already assigned, the listeners
 * still fire, and the session degrades to the in-memory behaviour this store had before. The ceiling
 * is the ~5MB `sessionStorage` gives an origin against `MAX_ENTRIES` entries carrying whole response
 * bodies; if that is ever reached in practice, the fix is to persist a shorter tail rather than to
 * truncate bodies, because a restored entry that silently differs from the one recorded is a lie a
 * debugger cannot afford.
 */
function setEntries(next: TraceEntry[]): void {
  entries = next;
  writeKey(SESSION_KEYS.traceHistory, JSON.stringify({ entries, counter }));
  emit();
}

export function recordTrace(input: TraceInput): TraceEntry {
  counter += 1;
  // The id goes **after** the spread, not before. `TraceInput` omits `id`, so the compiler already stops
  // a caller supplying one — but the ordering is what makes "the store mints its own ids" true by
  // construction rather than true because every caller was well typed. Found by a test that cast past
  // the type and got the caller's id back.
  const entry: TraceEntry = { ...input, id: `t${counter}` };
  // A new array each time, not a mutation: `useSyncExternalStore` compares snapshots by identity, and
  // pushing in place would leave the panel showing a stale list.
  setEntries([entry, ...entries].slice(0, MAX_ENTRIES));
  return entry;
}

export function getTraces(): TraceEntry[] {
  return entries;
}

export function clearTraces(): void {
  counter = 0;
  setEntries([]);
}

/**
 * Replace the trace with a run loaded from a file.
 *
 * **Replace rather than merge**, deliberately. Interleaving somebody else's requests with your own by
 * `startedAt` produces a timeline that never happened — two clocks, two machines, one axis — and the
 * sequence view would draw arrows between exchanges that have nothing to do with each other. A run is a
 * whole artefact or it is nothing, which is also why the panel confirms before doing this.
 *
 * The counter resets with the entries so ids stay dense and predictable, and the newest-first order the
 * store maintains is preserved from the file rather than re-derived — the file was written in that order
 * by `getTraces()`.
 */
export function importTraces(input: TraceInput[]): TraceEntry[] {
  counter = 0;
  const imported = input.slice(0, MAX_ENTRIES).map((item) => {
    counter += 1;
    // `id` and `imported` both go after the spread: the store owns the id, and an entry loaded from a
    // file does not get to declare itself live. A hand-edited `"imported": false` buys no disguise.
    return { ...item, id: `t${counter}`, imported: true };
  });
  setEntries(imported);
  return entries;
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
