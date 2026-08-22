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
}

export type TraceInput = Omit<TraceEntry, 'id'>;

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

/** Body parameters whose value is a credential. Same reasoning as the headers above. */
const SENSITIVE_PARAMS = [
  'client_secret',
  'password',
  'code_verifier',
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
    // form-encoded: `client_secret=value` up to the next `&`
    out = out.replace(new RegExp(`(${param}=)[^&]*`, 'gi'), '$1●●●●●●');
    // JSON: `"clientSecret": "value"` in either spelling
    const camel = param.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
    out = out.replace(new RegExp(`("(?:${param}|${camel})"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"●●●●●●"');
  }
  return out;
}
